CREATE TABLE public.seller_enrollment_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  target_enrollments integer NOT NULL CHECK (target_enrollments > 0),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX seller_enrollment_goals_active_unique
  ON public.seller_enrollment_goals (seller_id, month, year)
  WHERE active;

CREATE INDEX seller_enrollment_goals_period_idx
  ON public.seller_enrollment_goals (year, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_enrollment_goals TO authenticated;
GRANT ALL ON public.seller_enrollment_goals TO service_role;

ALTER TABLE public.seller_enrollment_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active goals"
  ON public.seller_enrollment_goals FOR SELECT TO authenticated
  USING (active OR seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

CREATE POLICY "Admins manage goals insert"
  ON public.seller_enrollment_goals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

CREATE POLICY "Admins manage goals update"
  ON public.seller_enrollment_goals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

CREATE POLICY "Admins manage goals delete"
  ON public.seller_enrollment_goals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

CREATE TRIGGER seller_enrollment_goals_set_updated_at
  BEFORE UPDATE ON public.seller_enrollment_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();