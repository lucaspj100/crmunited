CREATE TABLE public.score_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_key text NOT NULL UNIQUE,
  activity_label text NOT NULL,
  points numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.score_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.score_settings TO authenticated;
GRANT ALL ON public.score_settings TO service_role;
ALTER TABLE public.score_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "score_settings_select_authenticated" ON public.score_settings
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "score_settings_admin_insert" ON public.score_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "score_settings_admin_update" ON public.score_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER score_settings_set_updated_at BEFORE UPDATE ON public.score_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.score_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT ON public.score_settings_history TO authenticated;
GRANT ALL ON public.score_settings_history TO service_role;
ALTER TABLE public.score_settings_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "score_history_admin_select" ON public.score_settings_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "score_history_admin_insert" ON public.score_settings_history
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND changed_by = auth.uid());

INSERT INTO public.score_settings (activity_key, activity_label, points, sort_order) VALUES
  ('call', 'Ligação realizada', 1, 1),
  ('answered', 'Ligação atendida', 2, 2),
  ('interested', 'Interessado gerado', 30, 3),
  ('interview', 'Entrevista marcada', 60, 4),
  ('interview_done', 'Entrevista realizada', 100, 5),
  ('enrollment', 'Matrícula', 1000, 6),
  ('whatsapp', 'WhatsApp', 0.1, 7),
  ('linkedin', 'LinkedIn', 0.1, 8);