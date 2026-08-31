-- 1) Enum de cargos de carreira
DO $$ BEGIN
  CREATE TYPE public.career_role AS ENUM ('consultor','consultor_master','supervisor','gerente','diretor','franqueado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.career_goal_status AS ENUM ('em_andamento','atingida','nao_atingida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Campos de carreira no perfil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS career_role public.career_role NOT NULL DEFAULT 'consultor',
  ADD COLUMN IF NOT EXISTS career_stars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS career_role_since date,
  ADD COLUMN IF NOT EXISTS career_stars_synced_through date;

-- Guarda: somente admin altera cargo/estrelas
CREATE OR REPLACE FUNCTION public.guard_career_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.career_role IS DISTINCT FROM OLD.career_role
      OR NEW.career_stars IS DISTINCT FROM OLD.career_stars)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar cargo ou estrelas';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_career_fields ON public.profiles;
CREATE TRIGGER trg_guard_career_fields BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_career_fields();

-- 3) Histórico de cargos
CREATE TABLE IF NOT EXISTS public.career_role_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_role public.career_role,
  to_role public.career_role NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id),
  automatic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.career_role_history TO authenticated;
GRANT ALL ON public.career_role_history TO service_role;
ALTER TABLE public.career_role_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_role_history_select" ON public.career_role_history FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role));

-- 4) Histórico semanal de pontos/estrelas
CREATE TABLE IF NOT EXISTS public.career_week_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  points integer NOT NULL DEFAULT 0,
  stars_awarded integer NOT NULL DEFAULT 0,
  role_snapshot public.career_role,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);
GRANT SELECT ON public.career_week_results TO authenticated;
GRANT ALL ON public.career_week_results TO service_role;
ALTER TABLE public.career_week_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_week_results_select" ON public.career_week_results FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role));

-- 5) Metas mensais
CREATE TABLE IF NOT EXISTS public.career_monthly_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_snapshot public.career_role NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  target_points integer NOT NULL CHECK (target_points > 0),
  achieved_points integer NOT NULL DEFAULT 0,
  status public.career_goal_status NOT NULL DEFAULT 'em_andamento',
  promoted_to public.career_role,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month, year)
);
GRANT SELECT ON public.career_monthly_goals TO authenticated;
GRANT ALL ON public.career_monthly_goals TO service_role;
ALTER TABLE public.career_monthly_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_goals_select" ON public.career_monthly_goals FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role));

DROP TRIGGER IF EXISTS trg_career_goals_updated ON public.career_monthly_goals;
CREATE TRIGGER trg_career_goals_updated BEFORE UPDATE ON public.career_monthly_goals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Cálculo de pontos a partir das matrículas existentes
-- Semana: domingo a sábado. Matrícula = 1 ponto; 2 pontos se material pago na mesma semana.
CREATE OR REPLACE FUNCTION public.career_points_between(_user_id uuid, _start date, _end date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(
    CASE WHEN EXISTS (
      SELECT 1 FROM public.material_sales m
      WHERE m.lead_id = l.id
        AND m.payment_status = 'paid'
        AND m.payment_date IS NOT NULL
        AND m.payment_date >= (l.enrollment_date - EXTRACT(DOW FROM l.enrollment_date)::int)
        AND m.payment_date <= (l.enrollment_date - EXTRACT(DOW FROM l.enrollment_date)::int + 6)
    ) THEN 2 ELSE 1 END
  ), 0)::int
  FROM public.leads l
  WHERE l.owner_id = _user_id
    AND l.status = 'matricula'
    AND l.enrollment_date IS NOT NULL
    AND l.enrollment_date >= _start
    AND l.enrollment_date <= _end;
$$;

REVOKE EXECUTE ON FUNCTION public.career_points_between(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.career_points_between(uuid,date,date) TO authenticated, service_role;

-- 7) Sincronização: fecha semanas passadas, concede estrelas, promove cargos
CREATE OR REPLACE FUNCTION public.career_sync_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

REVOKE EXECUTE ON FUNCTION public.career_sync_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.career_sync_user(uuid) TO authenticated, service_role;

-- 8) Visão da própria carreira (ou de outro, se admin/franqueado)
CREATE OR REPLACE FUNCTION public.career_overview(_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target uuid := COALESCE(_user_id, auth.uid());
  p public.profiles;
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  ws date;
  we date;
  wpoints int;
  g public.career_monthly_goals;
  mpoints int;
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

  SELECT * INTO g FROM public.career_monthly_goals
   WHERE user_id = target AND month = EXTRACT(MONTH FROM today)::int AND year = EXTRACT(YEAR FROM today)::int;
  mpoints := public.career_points_between(target, date_trunc('month', today)::date,
              (date_trunc('month', today) + interval '1 month - 1 day')::date);

  RETURN jsonb_build_object(
    'user_id', target,
    'full_name', COALESCE(p.full_name, p.email),
    'career_role', p.career_role,
    'career_stars', p.career_stars,
    'career_role_since', p.career_role_since,
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
END $$;

REVOKE EXECUTE ON FUNCTION public.career_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.career_overview(uuid) TO authenticated, service_role;

-- 9) Lista administrativa
CREATE OR REPLACE FUNCTION public.career_admin_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      'week_points', public.career_points_between(p.id, ws, ws + 6),
      'month_points', public.career_points_between(p.id, date_trunc('month', today)::date,
                        (date_trunc('month', today) + interval '1 month - 1 day')::date),
      'goal', (SELECT jsonb_build_object('id', g.id, 'month', g.month, 'year', g.year,
                 'target_points', g.target_points, 'achieved_points', g.achieved_points, 'status', g.status)
               FROM public.career_monthly_goals g
               WHERE g.user_id = p.id AND g.month = EXTRACT(MONTH FROM today)::int
                 AND g.year = EXTRACT(YEAR FROM today)::int)
    ) ORDER BY COALESCE(p.full_name, p.email))
    FROM public.profiles p
  ), '[]'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.career_admin_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.career_admin_list() TO authenticated, service_role;

-- 10) Ações administrativas
CREATE OR REPLACE FUNCTION public.career_set_role(_user_id uuid, _role public.career_role, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_role public.career_role;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT career_role INTO old_role FROM public.profiles WHERE id = _user_id;
  IF old_role IS NULL THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;
  IF old_role = _role THEN RETURN; END IF;
  UPDATE public.profiles SET career_role = _role,
         career_role_since = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   WHERE id = _user_id;
  INSERT INTO public.career_role_history (user_id, from_role, to_role, reason, changed_by, automatic)
  VALUES (_user_id, old_role, _role, _reason, auth.uid(), false);
END $$;

CREATE OR REPLACE FUNCTION public.career_set_stars(_user_id uuid, _stars integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _stars < 0 THEN RAISE EXCEPTION 'Estrelas inválidas'; END IF;
  UPDATE public.profiles SET career_stars = _stars WHERE id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.career_upsert_goal(_user_id uuid, _month integer, _year integer, _target integer, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.career_role; gid uuid;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT career_role INTO r FROM public.profiles WHERE id = _user_id;
  IF r IS NULL THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;

  INSERT INTO public.career_monthly_goals (user_id, role_snapshot, month, year, target_points, notes, created_by)
  VALUES (_user_id, r, _month, _year, _target, _notes, auth.uid())
  ON CONFLICT (user_id, month, year) DO UPDATE
    SET target_points = EXCLUDED.target_points,
        notes = EXCLUDED.notes,
        role_snapshot = EXCLUDED.role_snapshot,
        status = CASE WHEN public.career_monthly_goals.status = 'nao_atingida'
                      THEN 'em_andamento'::public.career_goal_status
                      ELSE public.career_monthly_goals.status END
  RETURNING id INTO gid;

  PERFORM public.career_sync_user(_user_id);
  RETURN gid;
END $$;

REVOKE EXECUTE ON FUNCTION public.career_set_role(uuid, public.career_role, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.career_set_stars(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.career_upsert_goal(uuid, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.career_set_role(uuid, public.career_role, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.career_set_stars(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.career_upsert_goal(uuid, integer, integer, integer, text) TO authenticated, service_role;