CREATE TABLE public.public_seller_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  public_slug text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT public_seller_links_slug_format CHECK (public_slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
);

CREATE UNIQUE INDEX public_seller_links_slug_key ON public.public_seller_links (public_slug);
CREATE INDEX public_seller_links_seller_idx ON public.public_seller_links (seller_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_seller_links TO authenticated;
GRANT ALL ON public.public_seller_links TO service_role;

ALTER TABLE public.public_seller_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read seller links"
  ON public.public_seller_links FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

CREATE POLICY "Admins can insert seller links"
  ON public.public_seller_links FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

CREATE POLICY "Admins can update seller links"
  ON public.public_seller_links FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

CREATE POLICY "Admins can delete seller links"
  ON public.public_seller_links FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER public_seller_links_set_updated_at
  BEFORE UPDATE ON public.public_seller_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS external_lead_id text,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS city_state text,
  ADD COLUMN IF NOT EXISTS profession text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS english_level text,
  ADD COLUMN IF NOT EXISTS english_goal text,
  ADD COLUMN IF NOT EXISTS english_impact text,
  ADD COLUMN IF NOT EXISTS lost_opportunity text,
  ADD COLUMN IF NOT EXISTS why_not_studying text,
  ADD COLUMN IF NOT EXISTS start_timeframe text,
  ADD COLUMN IF NOT EXISTS financial_fit text,
  ADD COLUMN IF NOT EXISTS interview_intent text,
  ADD COLUMN IF NOT EXISTS scholarship_classification text,
  ADD COLUMN IF NOT EXISTS high_priority boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS form_status text,
  ADD COLUMN IF NOT EXISTS form_step text,
  ADD COLUMN IF NOT EXISTS form_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS form_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requested_interview_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduling_source text,
  ADD COLUMN IF NOT EXISTS confirmation_status text,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_confirmation_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS scholarship_task_created boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scholarship_notified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS leads_external_lead_id_key
  ON public.leads (external_lead_id) WHERE external_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_source_system_idx ON public.leads (source_system);