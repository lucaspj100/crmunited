-- 1. TEAMS
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  include_in_main_dashboard boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select_authenticated" ON public.teams
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_insert_admin" ON public.teams
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "teams_update_admin" ON public.teams
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "teams_delete_admin" ON public.teams
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX teams_single_primary ON public.teams (is_primary) WHERE is_primary;

CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. PROFILES.team_id
ALTER TABLE public.profiles ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
CREATE INDEX profiles_team_id_idx ON public.profiles (team_id);

-- 3. HISTORICO
CREATE TABLE public.team_membership_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  previous_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  new_team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.team_membership_history TO authenticated;
GRANT ALL ON public.team_membership_history TO service_role;
ALTER TABLE public.team_membership_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tmh_select_admin_or_self" ON public.team_membership_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());
CREATE POLICY "tmh_insert_admin" ON public.team_membership_history
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. METAS POR EQUIPE (team_id NULL = meta global para todas as equipes)
CREATE TABLE public.team_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  daily_calls_goal integer NOT NULL DEFAULT 0,
  daily_interviews_goal integer NOT NULL DEFAULT 0,
  daily_enrollments_goal integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX team_goals_team_unique ON public.team_goals (COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_goals TO authenticated;
GRANT ALL ON public.team_goals TO service_role;
ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_goals_select" ON public.team_goals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "team_goals_write_admin" ON public.team_goals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER team_goals_set_updated_at BEFORE UPDATE ON public.team_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. SEED + MIGRACAO
INSERT INTO public.teams (name, description, is_primary, include_in_main_dashboard)
VALUES ('Minha equipe', 'Equipe comercial principal', true, true);
INSERT INTO public.teams (name, description, is_primary, include_in_main_dashboard)
VALUES ('Outros usuários United', 'Demais usuários da United Idiomas', false, false);

UPDATE public.profiles
SET team_id = (SELECT id FROM public.teams WHERE is_primary LIMIT 1)
WHERE team_id IS NULL;

-- 6. NOVOS USUARIOS -> Outros usuários United
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_team uuid;
BEGIN
  SELECT id INTO default_team FROM public.teams
   WHERE name = 'Outros usuários United' LIMIT 1;
  IF default_team IS NULL THEN
    SELECT id INTO default_team FROM public.teams WHERE is_primary LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, team_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, default_team);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor');
  RETURN NEW;
END $function$;

-- 7. PRODUCTIVITY SUMMARY COM FILTRO DE EQUIPE
DROP FUNCTION IF EXISTS public.productivity_summary(date, date, uuid);

CREATE OR REPLACE FUNCTION public.productivity_summary(_start date, _end date, _vendedor_id uuid DEFAULT NULL::uuid, _team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
  caller uuid := auth.uid();
  caller_team uuid;
  result jsonb;
  start_ts timestamptz := (_start::timestamp)::timestamptz;
  end_ts timestamptz := ((_end + 1)::timestamp)::timestamptz;
  today_date date := current_date;
  eff_team uuid := _team_id;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  is_admin := has_role(caller, 'admin'::app_role) OR has_role(caller, 'franqueado'::app_role);
  SELECT team_id INTO caller_team FROM public.profiles WHERE id = caller;

  -- Gestor de equipe (manager) só enxerga a própria equipe; vendedor só a si mesmo.
  IF NOT is_admin THEN
    IF EXISTS (SELECT 1 FROM public.teams t WHERE t.manager_id = caller) THEN
      SELECT t.id INTO eff_team FROM public.teams t WHERE t.manager_id = caller LIMIT 1;
    END IF;
  END IF;

  WITH sellers AS (
    SELECT p.id, p.full_name, p.email, p.avatar_url, p.team_id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'
    WHERE (is_admin OR _vendedor_id IS NULL OR p.id = caller)
      AND (_vendedor_id IS NULL OR p.id = _vendedor_id)
      AND (eff_team IS NULL OR p.team_id = eff_team)
  ),
  leads_novos AS (
    SELECT owner_id AS vid, count(*)::int AS n FROM public.leads
    WHERE created_at >= start_ts AND created_at < end_ts GROUP BY owner_id
  ),
  leads_trab AS (
    SELECT owner_id AS vid, count(*)::int AS n FROM public.leads
    WHERE last_contact_at >= start_ts AND last_contact_at < end_ts GROUP BY owner_id
  ),
  att AS (
    SELECT vendedor_id AS vid,
      count(*) FILTER (WHERE tipo_acao = 'ligacao')::int AS ligacoes_feitas,
      count(*) FILTER (
        WHERE tipo_acao = 'ligacao' AND resultado IS NOT NULL
          AND resultado IN ('Atendeu','Interessado','Pediu WhatsApp','Ligar depois','Sem interesse')
      )::int AS ligacoes_atendidas
    FROM public.prospect_attempts
    WHERE created_at >= start_ts AND created_at < end_ts GROUP BY vendedor_id
  ),
  interessados_evt AS (
    SELECT DISTINCT l.id AS lead_id, l.owner_id AS vid
    FROM public.lead_events e
    JOIN public.leads l ON l.id = e.lead_id
    WHERE e.event_type = 'status_change'
      AND e.metadata->>'to' = 'interessado'
      AND e.created_at >= start_ts AND e.created_at < end_ts
  ),
  interessados_fb AS (
    SELECT id AS lead_id, owner_id AS vid
    FROM public.leads
    WHERE created_at >= start_ts AND created_at < end_ts
      AND status IN ('interessado','entrevista_marcada','entrevista_realizada','matricula')
  ),
  interessados AS (
    SELECT vid, count(DISTINCT lead_id)::int AS n
    FROM (
      SELECT lead_id, vid FROM interessados_evt
      UNION
      SELECT lead_id, vid FROM interessados_fb
    ) u
    WHERE vid IS NOT NULL
    GROUP BY vid
  ),
  entrev AS (
    SELECT owner_id AS vid, count(DISTINCT id)::int AS n
    FROM public.leads
    WHERE interview_date IS NOT NULL
      AND interview_date >= _start
      AND interview_date <= _end
      AND owner_id IS NOT NULL
    GROUP BY owner_id
  ),
  entrev_real AS (
    SELECT owner_id AS vid, count(DISTINCT id)::int AS n
    FROM public.leads
    WHERE interview_done_date IS NOT NULL
      AND interview_done_date >= _start
      AND interview_done_date <= _end
    GROUP BY owner_id
  ),
  matr AS (
    SELECT owner_id AS vid, count(DISTINCT id)::int AS n FROM public.leads
    WHERE enrollment_date IS NOT NULL
      AND enrollment_date >= _start
      AND enrollment_date <= _end
    GROUP BY owner_id
  ),
  perd AS (
    SELECT l.owner_id AS vid, count(DISTINCT l.id)::int AS n
    FROM public.lead_events e
    JOIN public.leads l ON l.id = e.lead_id
    WHERE (
      e.event_type = 'lost'
      OR (e.event_type = 'status_change' AND e.metadata->>'to' = 'perdido')
    )
    AND e.created_at >= start_ts AND e.created_at < end_ts
    GROUP BY l.owner_id
  ),
  ck AS (
    SELECT vendedor_id AS vid, sum(whatsapp_msgs)::int AS whats, sum(linkedin_msgs)::int AS links
    FROM public.daily_checkouts WHERE data >= _start AND data <= _end GROUP BY vendedor_id
  ),
  ck_today AS (
    SELECT vendedor_id AS vid, submitted_at FROM public.daily_checkouts WHERE data = today_date
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'vendedor_id', s.id,
      'nome', COALESCE(s.full_name, s.email),
      'email', s.email,
      'avatar_url', s.avatar_url,
      'team_id', s.team_id,
      'leads_novos_atribuidos', COALESCE(ln.n, 0),
      'leads_trabalhados', COALESCE(lt.n, 0),
      'ligacoes_feitas', COALESCE(a.ligacoes_feitas, 0),
      'ligacoes_atendidas', COALESCE(a.ligacoes_atendidas, 0),
      'interessados_gerados', COALESCE(i.n, 0),
      'entrevistas_marcadas', COALESCE(e.n, 0),
      'entrevistas_realizadas', COALESCE(er.n, 0),
      'matriculas', COALESCE(m.n, 0),
      'perdidos', COALESCE(pe.n, 0),
      'whatsapps_checkout', COALESCE(c.whats, 0),
      'linkedins_checkout', COALESCE(c.links, 0),
      'checkout_today_done', (ct.vid IS NOT NULL),
      'checkout_today_at', ct.submitted_at
    ) ORDER BY COALESCE(s.full_name, s.email)
  ) INTO result
  FROM sellers s
  LEFT JOIN leads_novos ln ON ln.vid = s.id
  LEFT JOIN leads_trab lt ON lt.vid = s.id
  LEFT JOIN att a ON a.vid = s.id
  LEFT JOIN interessados i ON i.vid = s.id
  LEFT JOIN entrev e ON e.vid = s.id
  LEFT JOIN entrev_real er ON er.vid = s.id
  LEFT JOIN matr m ON m.vid = s.id
  LEFT JOIN perd pe ON pe.vid = s.id
  LEFT JOIN ck c ON c.vid = s.id
  LEFT JOIN ck_today ct ON ct.vid = s.id;

  RETURN COALESCE(result, '[]'::jsonb);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.productivity_summary(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.productivity_summary(date, date, uuid, uuid) TO authenticated;

-- 8. PROSPECT DASHBOARD COM FILTRO DE EQUIPE
DROP FUNCTION IF EXISTS public.prospect_dashboard();

CREATE OR REPLACE FUNCTION public.prospect_dashboard(_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  is_admin boolean;
BEGIN
  is_admin := has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role);

  WITH team_members AS (
    SELECT id FROM public.profiles WHERE _team_id IS NULL OR team_id = _team_id
  ),
  base AS (
    SELECT * FROM public.prospect_contacts pc
    WHERE (is_admin OR pc.vendedor_responsavel_id = auth.uid())
      AND (_team_id IS NULL OR pc.vendedor_responsavel_id IN (SELECT id FROM team_members))
  ),
  att AS (
    SELECT a.* FROM public.prospect_attempts a
    WHERE (is_admin OR a.vendedor_id = auth.uid()
       OR EXISTS (SELECT 1 FROM public.prospect_contacts c
                   WHERE c.id = a.prospect_contact_id AND c.vendedor_responsavel_id = auth.uid()))
      AND (_team_id IS NULL OR a.vendedor_id IN (SELECT id FROM team_members))
  ),
  totals AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE quantidade_tentativas > 0)::int AS trabalhados,
      count(*) FILTER (WHERE status_prospeccao = 'Interessado')::int AS interessados,
      count(*) FILTER (WHERE convertido_em_lead)::int AS convertidos,
      count(*) FILTER (WHERE telefone_invalido)::int AS invalidos,
      count(*) FILTER (WHERE nao_chamar)::int AS nao_chamar,
      count(*) FILTER (
        WHERE NOT convertido_em_lead AND NOT nao_chamar AND NOT telefone_invalido
          AND status_prospeccao NOT IN ('Sem interesse','Convertido em lead','Não chamar')
      )::int AS disponiveis
    FROM base
  ),
  att_totals AS (
    SELECT
      count(*) FILTER (WHERE tipo_acao = 'ligacao')::int AS ligacoes,
      count(*) FILTER (WHERE tipo_acao = 'whatsapp')::int AS whats
    FROM att
  ),
  by_seller AS (
    SELECT
      b.vendedor_responsavel_id AS id,
      count(*)::int AS atribuidos,
      count(*) FILTER (WHERE b.quantidade_tentativas > 0)::int AS trabalhados,
      count(*) FILTER (WHERE b.status_prospeccao = 'Interessado')::int AS interessados,
      count(*) FILTER (WHERE b.convertido_em_lead)::int AS convertidos
    FROM base b
    WHERE b.vendedor_responsavel_id IS NOT NULL
    GROUP BY b.vendedor_responsavel_id
  ),
  by_seller_att AS (
    SELECT
      vendedor_id AS id,
      count(*) FILTER (WHERE tipo_acao = 'ligacao')::int AS ligacoes,
      count(*) FILTER (WHERE tipo_acao = 'whatsapp')::int AS whats
    FROM att
    WHERE vendedor_id IS NOT NULL
    GROUP BY vendedor_id
  ),
  by_origem AS (
    SELECT
      COALESCE(origem, '—') AS k,
      count(*)::int AS total,
      sum(quantidade_tentativas)::int AS tent,
      count(*) FILTER (WHERE status_prospeccao = 'Interessado')::int AS interessados,
      count(*) FILTER (WHERE convertido_em_lead)::int AS convertidos
    FROM base
    GROUP BY COALESCE(origem, '—')
    ORDER BY total DESC
    LIMIT 30
  ),
  by_ddd AS (
    SELECT
      COALESCE(ddd, '—') AS k,
      count(*)::int AS total,
      sum(quantidade_tentativas)::int AS tent,
      count(*) FILTER (WHERE status_prospeccao = 'Interessado')::int AS interessados,
      count(*) FILTER (WHERE convertido_em_lead)::int AS convertidos
    FROM base
    GROUP BY COALESCE(ddd, '—')
    ORDER BY total DESC
    LIMIT 30
  )
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(totals.*) FROM totals),
    'attempts', (SELECT to_jsonb(att_totals.*) FROM att_totals),
    'by_seller', COALESCE((SELECT jsonb_agg(to_jsonb(s.*)) FROM by_seller s), '[]'::jsonb),
    'by_seller_att', COALESCE((SELECT jsonb_agg(to_jsonb(a.*)) FROM by_seller_att a), '[]'::jsonb),
    'by_origem', COALESCE((SELECT jsonb_agg(to_jsonb(o.*)) FROM by_origem o), '[]'::jsonb),
    'by_ddd', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM by_ddd d), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.prospect_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospect_dashboard(uuid) TO authenticated;

-- 9. RPC: membros por equipe (respeita admin / gestor)
CREATE OR REPLACE FUNCTION public.teams_overview()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'description', t.description,
    'manager_id', t.manager_id,
    'manager_name', mp.full_name,
    'is_active', t.is_active,
    'is_primary', t.is_primary,
    'include_in_main_dashboard', t.include_in_main_dashboard,
    'member_count', (SELECT count(*) FROM public.profiles p WHERE p.team_id = t.id)
  ) ORDER BY t.is_primary DESC, t.name), '[]'::jsonb)
  FROM public.teams t
  LEFT JOIN public.profiles mp ON mp.id = t.manager_id
  WHERE auth.uid() IS NOT NULL;
$function$;

REVOKE EXECUTE ON FUNCTION public.teams_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teams_overview() TO authenticated;
