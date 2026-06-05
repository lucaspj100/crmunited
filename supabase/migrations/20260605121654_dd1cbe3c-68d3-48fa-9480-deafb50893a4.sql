
-- Singleton settings table
CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  brand_name text NOT NULL DEFAULT 'Comercial',
  brand_subtitle text NOT NULL DEFAULT 'Franquia',
  logo_path text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings select authenticated" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "settings admin write" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for the 'branding' bucket: authenticated read, admin write
CREATE POLICY "branding read authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'branding');

CREATE POLICY "branding insert admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "branding update admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "branding delete admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
