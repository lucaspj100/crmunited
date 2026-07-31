CREATE TABLE public.individual_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL DEFAULT '',
  meeting_date date,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  leader_notes text NOT NULL DEFAULT '',
  extra_context text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'equilibrado',
  generated_feedback text NOT NULL DEFAULT '',
  final_feedback text NOT NULL DEFAULT '',
  next_focus text NOT NULL DEFAULT '',
  agreed_action text NOT NULL DEFAULT '',
  shared_with_collaborator boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'salvo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.individual_feedbacks TO authenticated;
GRANT ALL ON public.individual_feedbacks TO service_role;

ALTER TABLE public.individual_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read individual feedbacks"
ON public.individual_feedbacks FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins create individual feedbacks"
ON public.individual_feedbacks FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());

CREATE POLICY "Admins update individual feedbacks"
ON public.individual_feedbacks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete individual feedbacks"
ON public.individual_feedbacks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_individual_feedbacks_subject ON public.individual_feedbacks (subject_user_id, period_start DESC);

CREATE TRIGGER trg_individual_feedbacks_updated_at
BEFORE UPDATE ON public.individual_feedbacks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();