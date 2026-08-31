-- 1) Novos cargos
ALTER TYPE public.career_role ADD VALUE IF NOT EXISTS 'gerente_master' AFTER 'gerente';
ALTER TYPE public.career_role ADD VALUE IF NOT EXISTS 'gerente_divisional' AFTER 'gerente_master';

-- 2) Árvore de liderança + cotas
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS career_quotas_adjust integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS career_quotas integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_leader_id ON public.profiles(leader_id);

-- 3) Histórico mensal de cotas
CREATE TABLE IF NOT EXISTS public.career_monthly_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month integer NOT NULL,
  year integer NOT NULL,
  role_snapshot public.career_role,
  structure_points integer NOT NULL DEFAULT 0,
  quota_earned boolean NOT NULL DEFAULT false,
  consolidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month, year)
);

GRANT SELECT ON public.career_monthly_quotas TO authenticated;
GRANT ALL ON public.career_monthly_quotas TO service_role;
ALTER TABLE public.career_monthly_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver cotas próprias ou admin" ON public.career_monthly_quotas;
CREATE POLICY "Ver cotas próprias ou admin"
  ON public.career_monthly_quotas FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'franqueado'::app_role));

DROP TRIGGER IF EXISTS set_updated_at_career_monthly_quotas ON public.career_monthly_quotas;
CREATE TRIGGER set_updated_at_career_monthly_quotas
  BEFORE UPDATE ON public.career_monthly_quotas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Guard: apenas admin altera cargo/estrelas/cotas/líder
CREATE OR REPLACE FUNCTION public.guard_career_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF (NEW.career_role IS DISTINCT FROM OLD.career_role
      OR NEW.career_stars IS DISTINCT FROM OLD.career_stars
      OR NEW.career_quotas_adjust IS DISTINCT FROM OLD.career_quotas_adjust
      OR NEW.leader_id IS DISTINCT FROM OLD.leader_id)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar cargo, estrelas, cotas ou líder direto';
  END IF;
  RETURN NEW;
END $function$;

-- 5) Descendência (protegida contra ciclos e profundidade)
CREATE OR REPLACE FUNCTION public.career_descendants(_user_id uuid)
RETURNS TABLE(user_id uuid, depth integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH RECURSIVE tree AS (
    SELECT p.id, 1 AS depth, ARRAY[_user_id, p.id] AS path
      FROM public.profiles p
     WHERE p.leader_id = _user_id AND p.id <> _user_id
    UNION ALL
    SELECT c.id, t.depth + 1, t.path || c.id
      FROM public.profiles c
      JOIN tree t ON c.leader_id = t.id
     WHERE NOT c.id = ANY(t.path) AND t.depth < 20
  )
  SELECT DISTINCT id, MIN(depth) FROM tree GROUP BY id;
$function$;

-- 6) Pontos da estrutura (próprios + toda a descendência, cada matrícula uma única vez)
CREATE OR REPLACE FUNCTION public.career_structure_points_between(_user_id uuid, _start date, _end date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT COALESCE(SUM(public.career_points_between(u, _start, _end)), 0)::int
  FROM (
    SELECT _user_id AS u
    UNION
    SELECT d.user_id FROM public.career_descendants(_user_id) d
  ) s;
$function$;

-- 7) Definir líder direto (admin) com validação de ciclo
CREATE OR REPLACE FUNCTION public.career_set_leader(_user_id uuid, _leader_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
  IF _leader_id IS NOT NULL THEN
    IF _leader_id = _user_id THEN RAISE EXCEPTION 'Uma pessoa não pode ser líder de si mesma'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _leader_id) THEN
      RAISE EXCEPTION 'Líder não encontrado';
    END IF;
    IF EXISTS (SELECT 1 FROM public.career_descendants(_user_id) d WHERE d.user_id = _leader_id) THEN
      RAISE EXCEPTION 'Alteração inválida: criaria um ciclo na árvore da equipe';
    END IF;
  END IF;
  UPDATE public.profiles SET leader_id = _leader_id WHERE id = _user_id;
END $function$;

-- 8) Correção administrativa de cotas
CREATE OR REPLACE FUNCTION public.career_set_quotas(_user_id uuid, _total integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE earned int;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _total < 0 THEN RAISE EXCEPTION 'Cotas inválidas'; END IF;
  SELECT COUNT(*) INTO earned FROM public.career_monthly_quotas
   WHERE user_id = _user_id AND quota_earned;
  UPDATE public.profiles
     SET career_quotas_adjust = _total - earned, career_quotas = _total
   WHERE id = _user_id;
END $function$;

-- 9) Sincronização de cotas mensais da liderança
CREATE OR REPLACE FUNCTION public.career_sync_quotas(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  p public.profiles;
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  m date;
  first_m date;
  pts int;
  earned int;
  total int;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF p.career_role NOT IN ('gerente'::public.career_role,
                           'gerente_master'::public.career_role,
                           'gerente_divisional'::public.career_role) THEN
    RETURN;
  END IF;

  first_m := date_trunc('month', COALESCE(p.career_role_since, today))::date;
  m := first_m;
  WHILE m <= date_trunc('month', today)::date LOOP
    pts := public.career_structure_points_between(_user_id, m, (m + interval '1 month - 1 day')::date);
    INSERT INTO public.career_monthly_quotas
      (user_id, month, year, role_snapshot, structure_points, quota_earned, consolidated_at)
    VALUES (_user_id, EXTRACT(MONTH FROM m)::int, EXTRACT(YEAR FROM m)::int, p.career_role,
            pts, pts >= 25, CASE WHEN pts >= 25 THEN now() ELSE NULL END)
    ON CONFLICT (user_id, month, year) DO UPDATE
      SET structure_points = EXCLUDED.structure_points,
          quota_earned = public.career_monthly_quotas.quota_earned OR EXCLUDED.quota_earned,
          consolidated_at = COALESCE(public.career_monthly_quotas.consolidated_at, EXCLUDED.consolidated_at);
    m := (m + interval '1 month')::date;
  END LOOP;

  SELECT COUNT(*) INTO earned FROM public.career_monthly_quotas
   WHERE user_id = _user_id AND quota_earned;
  total := GREATEST(0, earned + COALESCE(p.career_quotas_adjust, 0));
  UPDATE public.profiles SET career_quotas = total WHERE id = _user_id;

  IF total >= 20 AND p.career_role = 'gerente'::public.career_role THEN
    UPDATE public.profiles
       SET career_role = 'gerente_master'::public.career_role, career_role_since = today
     WHERE id = _user_id;
    INSERT INTO public.career_role_history (user_id, from_role, to_role, reason, automatic)
    VALUES (_user_id, 'gerente'::public.career_role, 'gerente_master'::public.career_role,
            '20 cotas conquistadas', true);
  END IF;
END $function$;

-- 10) career_sync_user passa a sincronizar cotas da liderança
CREATE OR REPLACE FUNCTION public.career_sync_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  p public.profiles;
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  cur_week_start date;
  w date;
  pts int;
  stars int;
  first_enroll date;
  g public.career_monthly_goals;
  gpoints int;
  gstart date;
  gend date;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN; END IF;

  cur_week_start := today - EXTRACT(DOW FROM today)::int;

  IF p.career_role = 'consultor' THEN
    IF p.career_stars_synced_through IS NULL THEN
      SELECT MIN(enrollment_date) INTO first_enroll FROM public.leads
       WHERE owner_id = _user_id AND status = 'matricula' AND enrollment_date IS NOT NULL;
      w := COALESCE(first_enroll, cur_week_start);
      w := w - EXTRACT(DOW FROM w)::int;
    ELSE
      w := p.career_stars_synced_through + 1;
      w := w - EXTRACT(DOW FROM w)::int;
    END IF;

    WHILE w < cur_week_start LOOP
      pts := public.career_points_between(_user_id, w, w + 6);
      stars := pts / 3;
      INSERT INTO public.career_week_results (user_id, week_start, week_end, points, stars_awarded, role_snapshot)
      VALUES (_user_id, w, w + 6, pts, stars, p.career_role)
      ON CONFLICT (user_id, week_start) DO UPDATE
        SET points = EXCLUDED.points, stars_awarded = EXCLUDED.stars_awarded;
      IF stars > 0 THEN
        UPDATE public.profiles SET career_stars = career_stars + stars WHERE id = _user_id;
      END IF;
      UPDATE public.profiles SET career_stars_synced_through = w + 6 WHERE id = _user_id;
      w := w + 7;
    END LOOP;

    SELECT * INTO p FROM public.profiles WHERE id = _user_id;
    IF p.career_stars >= 5 AND p.career_role = 'consultor' THEN
      UPDATE public.profiles SET career_role = 'consultor_master', career_role_since = today WHERE id = _user_id;
      INSERT INTO public.career_role_history (user_id, from_role, to_role, reason, automatic)
      VALUES (_user_id, 'consultor', 'consultor_master', '5 estrelas conquistadas', true);
    END IF;
  END IF;

  -- Metas mensais (Consultor Master / Supervisor)
  FOR g IN SELECT * FROM public.career_monthly_goals
            WHERE user_id = _user_id AND status = 'em_andamento' LOOP
    gstart := make_date(g.year, g.month, 1);
    gend := (gstart + interval '1 month - 1 day')::date;
    gpoints := public.career_points_between(_user_id, gstart, gend);
    UPDATE public.career_monthly_goals SET achieved_points = gpoints WHERE id = g.id;

    IF gpoints >= g.target_points THEN
      SELECT * INTO p FROM public.profiles WHERE id = _user_id;
      IF p.career_role = 'consultor_master' THEN
        UPDATE public.profiles SET career_role = 'supervisor', career_role_since = today WHERE id = _user_id;
        INSERT INTO public.career_role_history (user_id, from_role, to_role, reason, automatic)
        VALUES (_user_id, 'consultor_master', 'supervisor', 'Meta mensal atingida', true);
        UPDATE public.career_monthly_goals SET status = 'atingida', promoted_to = 'supervisor' WHERE id = g.id;
      ELSIF p.career_role = 'supervisor' THEN
        UPDATE public.profiles SET career_role = 'gerente', career_role_since = today WHERE id = _user_id;
        INSERT INTO public.career_role_history (user_id, from_role, to_role, reason, automatic)
        VALUES (_user_id, 'supervisor', 'gerente', 'Meta mensal atingida', true);
        UPDATE public.career_monthly_goals SET status = 'atingida', promoted_to = 'gerente' WHERE id = g.id;
      ELSE
        UPDATE public.career_monthly_goals SET status = 'atingida' WHERE id = g.id;
      END IF;
    ELSIF gend < today THEN
      UPDATE public.career_monthly_goals SET status = 'nao_atingida' WHERE id = g.id;
    END IF;
  END LOOP;

  -- Liderança: cotas mensais e promoção Gerente -> Gerente Master
  PERFORM public.career_sync_quotas(_user_id);
END $function$;

-- 11) career_overview com dados de estrutura/cotas
CREATE OR REPLACE FUNCTION public.career_overview(_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  target uuid := COALESCE(_user_id, auth.uid());
  p public.profiles;
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  ws date; we date; wpoints int;
  g public.career_monthly_goals;
  mpoints int;
  ms date; me date;
  spoints int;
  is_leader boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF target <> auth.uid()
     AND NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  PERFORM public.career_sync_user(target);
  SELECT * INTO p FROM public.profiles WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;

  ws := today - EXTRACT(DOW FROM today)::int;
  we := ws + 6;
  wpoints := public.career_points_between(target, ws, we);
  ms := date_trunc('month', today)::date;
  me := (ms + interval '1 month - 1 day')::date;

  SELECT * INTO g FROM public.career_monthly_goals
   WHERE user_id = target AND month = EXTRACT(MONTH FROM today)::int AND year = EXTRACT(YEAR FROM today)::int;
  mpoints := public.career_points_between(target, ms, me);

  is_leader := p.career_role IN ('gerente'::public.career_role,
                                 'gerente_master'::public.career_role,
                                 'gerente_divisional'::public.career_role);
  spoints := CASE WHEN is_leader THEN public.career_structure_points_between(target, ms, me) ELSE mpoints END;

  RETURN jsonb_build_object(
    'user_id', target,
    'full_name', COALESCE(p.full_name, p.email),
    'career_role', p.career_role,
    'career_stars', p.career_stars,
    'career_role_since', p.career_role_since,
    'leader_id', p.leader_id,
    'leader_name', (SELECT COALESCE(l.full_name, l.email) FROM public.profiles l WHERE l.id = p.leader_id),
    'career_quotas', COALESCE(p.career_quotas, 0),
    'quota_points_target', 25,
    'quotas_to_master', 20,
    'structure_month_points', spoints,
    'structure_size', (SELECT COUNT(*) FROM public.career_descendants(target)),
    'quota_current_month', (SELECT jsonb_build_object('month', q.month, 'year', q.year,
        'structure_points', q.structure_points, 'quota_earned', q.quota_earned,
        'consolidated_at', q.consolidated_at)
      FROM public.career_monthly_quotas q
      WHERE q.user_id = target AND q.month = EXTRACT(MONTH FROM today)::int
        AND q.year = EXTRACT(YEAR FROM today)::int),
    'quotas_history', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'month', q.month, 'year', q.year, 'role_snapshot', q.role_snapshot,
        'structure_points', q.structure_points, 'quota_earned', q.quota_earned,
        'consolidated_at', q.consolidated_at) ORDER BY q.year DESC, q.month DESC)
      FROM public.career_monthly_quotas q WHERE q.user_id = target), '[]'::jsonb),
    'direct_reports', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'user_id', d.id, 'full_name', COALESCE(d.full_name, d.email),
        'career_role', d.career_role, 'career_stars', COALESCE(d.career_stars, 0),
        'month_points', public.career_points_between(d.id, ms, me)) ORDER BY COALESCE(d.full_name, d.email))
      FROM public.profiles d WHERE d.leader_id = target), '[]'::jsonb),
    'week_start', ws,
    'week_end', we,
    'week_points', wpoints,
    'week_stars_pending', (wpoints / 3),
    'month_points', mpoints,
    'goal', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', g.id, 'month', g.month, 'year', g.year,
        'target_points', g.target_points, 'achieved_points', mpoints, 'status', g.status) END,
    'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'week_start', r.week_start, 'week_end', r.week_end,
        'points', r.points, 'stars_awarded', r.stars_awarded) ORDER BY r.week_start DESC)
      FROM (SELECT * FROM public.career_week_results WHERE user_id = target
             ORDER BY week_start DESC LIMIT 12) r), '[]'::jsonb),
    'goals_history', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', gg.id, 'month', gg.month, 'year', gg.year, 'role_snapshot', gg.role_snapshot,
        'target_points', gg.target_points, 'achieved_points', gg.achieved_points,
        'status', gg.status, 'promoted_to', gg.promoted_to) ORDER BY gg.year DESC, gg.month DESC)
      FROM public.career_monthly_goals gg WHERE gg.user_id = target), '[]'::jsonb),
    'role_history', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'from_role', h.from_role, 'to_role', h.to_role, 'created_at', h.created_at,
        'reason', h.reason, 'automatic', h.automatic) ORDER BY h.created_at DESC)
      FROM public.career_role_history h WHERE h.user_id = target), '[]'::jsonb)
  );
END $function$;

-- 12) Lista admin com líder e cotas
CREATE OR REPLACE FUNCTION public.career_admin_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  ws date;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  ws := today - EXTRACT(DOW FROM today)::int;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', p.id,
      'full_name', COALESCE(p.full_name, p.email),
      'email', p.email,
      'career_role', p.career_role,
      'career_stars', p.career_stars,
      'career_role_since', p.career_role_since,
      'leader_id', p.leader_id,
      'career_quotas', COALESCE(p.career_quotas, 0),
      'week_points', public.career_points_between(p.id, ws, ws + 6),
      'month_points', public.career_points_between(p.id, date_trunc('month', today)::date,
                        (date_trunc('month', today) + interval '1 month - 1 day')::date),
      'structure_month_points', public.career_structure_points_between(p.id, date_trunc('month', today)::date,
                        (date_trunc('month', today) + interval '1 month - 1 day')::date),
      'goal', (SELECT jsonb_build_object('id', g.id, 'month', g.month, 'year', g.year,
                 'target_points', g.target_points, 'achieved_points', g.achieved_points, 'status', g.status)
               FROM public.career_monthly_goals g
               WHERE g.user_id = p.id AND g.month = EXTRACT(MONTH FROM today)::int
                 AND g.year = EXTRACT(YEAR FROM today)::int)
    ) ORDER BY COALESCE(p.full_name, p.email))
    FROM public.profiles p
  ), '[]'::jsonb);
END $function$;

-- 13) Árvore completa (admin/franqueado) ou própria estrutura
CREATE OR REPLACE FUNCTION public.career_tree(_root uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  ms date := date_trunc('month', today)::date;
  me date := (date_trunc('month', today) + interval '1 month - 1 day')::date;
  is_admin boolean;
  root uuid := _root;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  is_admin := has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role);
  IF NOT is_admin THEN root := auth.uid(); END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', p.id,
      'full_name', COALESCE(p.full_name, p.email),
      'email', CASE WHEN is_admin THEN p.email ELSE NULL END,
      'career_role', p.career_role,
      'career_stars', COALESCE(p.career_stars, 0),
      'career_quotas', COALESCE(p.career_quotas, 0),
      'leader_id', p.leader_id,
      'month_points', public.career_points_between(p.id, ms, me),
      'structure_month_points', public.career_structure_points_between(p.id, ms, me)
    ) ORDER BY COALESCE(p.full_name, p.email))
    FROM public.profiles p
    WHERE root IS NULL
       OR p.id = root
       OR p.id IN (SELECT d.user_id FROM public.career_descendants(root) d)
  ), '[]'::jsonb);
END $function$;

REVOKE ALL ON FUNCTION public.career_descendants(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.career_structure_points_between(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.career_tree(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.career_set_leader(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.career_set_quotas(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.career_sync_quotas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.career_descendants(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.career_structure_points_between(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.career_tree(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.career_set_leader(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.career_set_quotas(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.career_sync_quotas(uuid) TO authenticated, service_role;