CREATE TABLE public.monthly_hall_of_fame (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_month int NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
  reference_year int NOT NULL CHECK (reference_year BETWEEN 2000 AND 2200),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'closed',
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  champion_user_id uuid,
  runner_up_user_id uuid,
  third_place_user_id uuid,
  champion_points numeric,
  runner_up_points numeric,
  third_place_points numeric,
  ranking_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_winners jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculation_rules_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_hall_of_fame_period_unique UNIQUE (reference_year, reference_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_hall_of_fame TO authenticated;
GRANT ALL ON public.monthly_hall_of_fame TO service_role;
ALTER TABLE public.monthly_hall_of_fame ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hof_select_authenticated" ON public.monthly_hall_of_fame
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "hof_insert_admin" ON public.monthly_hall_of_fame
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));
CREATE POLICY "hof_update_admin" ON public.monthly_hall_of_fame
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));
CREATE POLICY "hof_delete_admin" ON public.monthly_hall_of_fame
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER monthly_hall_of_fame_set_updated_at
  BEFORE UPDATE ON public.monthly_hall_of_fame
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_type text NOT NULL,
  title text NOT NULL,
  reference_month int NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
  reference_year int NOT NULL CHECK (reference_year BETWEEN 2000 AND 2200),
  hall_of_fame_id uuid REFERENCES public.monthly_hall_of_fame(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_achievements_unique UNIQUE (user_id, achievement_type, reference_year, reference_month)
);

CREATE INDEX user_achievements_user_idx ON public.user_achievements (user_id);
CREATE INDEX user_achievements_period_idx ON public.user_achievements (reference_year, reference_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements_select_authenticated" ON public.user_achievements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "achievements_insert_admin" ON public.user_achievements
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));
CREATE POLICY "achievements_update_admin" ON public.user_achievements
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));
CREATE POLICY "achievements_delete_admin" ON public.user_achievements
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

CREATE OR REPLACE FUNCTION public.hall_of_fame_active_days(_start date, _end date, _team_id uuid DEFAULT NULL)
RETURNS TABLE(vendedor_id uuid, active_days int)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH allowed AS (
    SELECT p.id FROM public.profiles p
    WHERE (_team_id IS NULL OR p.team_id = _team_id)
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'franqueado'::app_role)
        OR p.id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.manager_id = auth.uid() AND t.id = p.team_id)
        OR true
      )
  ),
  ev AS (
    SELECT a.vendedor_id AS vid, (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d
    FROM public.prospect_attempts a
    WHERE a.vendedor_id IS NOT NULL AND a.resultado IS NOT NULL
      AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _start AND _end
    UNION
    SELECT l.owner_id, l.interview_date FROM public.leads l
    WHERE l.interview_date BETWEEN _start AND _end AND l.owner_id IS NOT NULL
    UNION
    SELECT l.owner_id, l.interview_done_date FROM public.leads l
    WHERE l.interview_done_date BETWEEN _start AND _end AND l.owner_id IS NOT NULL
    UNION
    SELECT l.owner_id, l.enrollment_date FROM public.leads l
    WHERE l.enrollment_date BETWEEN _start AND _end AND l.owner_id IS NOT NULL
  )
  SELECT ev.vid, count(DISTINCT ev.d)::int
  FROM ev
  JOIN allowed ON allowed.id = ev.vid
  WHERE auth.uid() IS NOT NULL
  GROUP BY ev.vid;
$$;

REVOKE EXECUTE ON FUNCTION public.hall_of_fame_active_days(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hall_of_fame_active_days(date, date, uuid) TO authenticated;