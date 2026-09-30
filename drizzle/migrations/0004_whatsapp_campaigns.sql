CREATE TABLE public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  paused_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_campaigns_status_chk CHECK (status IN ('active','paused','closed'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaigns TO authenticated;
GRANT ALL ON public.whatsapp_campaigns TO service_role;
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/franqueado gerenciam campanhas" ON public.whatsapp_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'franqueado'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'franqueado'));
CREATE TRIGGER whatsapp_campaigns_updated_at BEFORE UPDATE ON public.whatsapp_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.whatsapp_campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  name text,
  phone text NOT NULL,
  normalized_phone text NOT NULL,
  company text,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  sent_by_account_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wcc_status_chk CHECK (status IN ('pending','sent','failed','cancelled')),
  CONSTRAINT wcc_unique_phone UNIQUE (campaign_id, normalized_phone)
);
CREATE INDEX wcc_campaign_status_idx ON public.whatsapp_campaign_contacts(campaign_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaign_contacts TO authenticated;
GRANT ALL ON public.whatsapp_campaign_contacts TO service_role;
ALTER TABLE public.whatsapp_campaign_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/franqueado gerenciam contatos de campanha" ON public.whatsapp_campaign_contacts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'franqueado'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'franqueado'));
CREATE TRIGGER wcc_updated_at BEFORE UPDATE ON public.whatsapp_campaign_contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.whatsapp_campaign_stats()
RETURNS TABLE(campaign_id uuid, total bigint, pending bigint, sent bigint, failed bigint, cancelled bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT campaign_id, count(*), count(*) FILTER (WHERE status='pending'), count(*) FILTER (WHERE status='sent'),
         count(*) FILTER (WHERE status='failed'), count(*) FILTER (WHERE status='cancelled')
  FROM public.whatsapp_campaign_contacts GROUP BY campaign_id
$$;
GRANT EXECUTE ON FUNCTION public.whatsapp_campaign_stats() TO authenticated;