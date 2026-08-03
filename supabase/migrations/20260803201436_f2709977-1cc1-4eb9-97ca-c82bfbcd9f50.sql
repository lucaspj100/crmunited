-- Aggregate-only collective goal (no per-seller exposure)
CREATE OR REPLACE FUNCTION public.team_enrollment_goal_summary(
  _month integer,
  _year integer,
  _team_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sellers AS (
    SELECT p.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'
    WHERE (_team_id IS NULL OR p.team_id = _team_id)
  ),
  goals AS (
    SELECT g.seller_id, g.target_enrollments
    FROM public.seller_enrollment_goals g
    JOIN sellers s ON s.id = g.seller_id
    WHERE g.active = true AND g.month = _month AND g.year = _year
  )
  SELECT jsonb_build_object(
    'month', _month,
    'year', _year,
    'total_target', COALESCE((SELECT SUM(target_enrollments) FROM goals), 0),
    'sellers_with_goal', (SELECT COUNT(*) FROM goals),
    'sellers_total', (SELECT COUNT(*) FROM sellers),
    'sellers_without_goal', GREATEST(0, (SELECT COUNT(*) FROM sellers) - (SELECT COUNT(*) FROM goals))
  );
$$;

REVOKE ALL ON FUNCTION public.team_enrollment_goal_summary(integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_enrollment_goal_summary(integer, integer, uuid) TO authenticated, service_role;

-- Operational reference settings (single row)
CREATE TABLE public.team_mission_settings (
  id boolean NOT NULL DEFAULT true PRIMARY KEY,
  interested_to_enrollment_rate numeric NOT NULL DEFAULT 0.10,
  done_to_enrollment_rate_min numeric NOT NULL DEFAULT 0.30,
  done_to_enrollment_rate_max numeric NOT NULL DEFAULT 0.50,
  min_sample_interested integer NOT NULL DEFAULT 30,
  min_sample_done integer NOT NULL DEFAULT 10,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_mission_settings_single_row CHECK (id),
  CONSTRAINT team_mission_rates_valid CHECK (
    interested_to_enrollment_rate > 0 AND interested_to_enrollment_rate <= 1
    AND done_to_enrollment_rate_min > 0 AND done_to_enrollment_rate_min <= 1
    AND done_to_enrollment_rate_max > 0 AND done_to_enrollment_rate_max <= 1
    AND done_to_enrollment_rate_min <= done_to_enrollment_rate_max
    AND min_sample_interested >= 0 AND min_sample_done >= 0
  )
);

GRANT SELECT ON public.team_mission_settings TO authenticated;
GRANT INSERT, UPDATE ON public.team_mission_settings TO authenticated;
GRANT ALL ON public.team_mission_settings TO service_role;

ALTER TABLE public.team_mission_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tms_select_authenticated" ON public.team_mission_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tms_insert_staff" ON public.team_mission_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'));

CREATE POLICY "tms_update_staff" ON public.team_mission_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'));

CREATE TRIGGER team_mission_settings_updated_at
  BEFORE UPDATE ON public.team_mission_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.team_mission_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;