
CREATE TABLE public.crm_outbound_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  crm_lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

GRANT SELECT ON public.crm_outbound_events TO authenticated;
GRANT ALL ON public.crm_outbound_events TO service_role;

ALTER TABLE public.crm_outbound_events ENABLE ROW LEVEL SECURITY;

-- Admins can view all outbound events; vendedores can view their own lead's events
CREATE POLICY "Admins view all crm outbound events"
ON public.crm_outbound_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners view their leads outbound events"
ON public.crm_outbound_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = crm_lead_id AND l.owner_id = auth.uid()));

CREATE INDEX idx_crm_outbound_events_lead ON public.crm_outbound_events (crm_lead_id, event_type);
CREATE INDEX idx_crm_outbound_events_status ON public.crm_outbound_events (status, created_at);

-- Dedupe: only ONE successful enrollment event per lead
CREATE UNIQUE INDEX uniq_crm_enrollment_sent_per_lead
ON public.crm_outbound_events (crm_lead_id)
WHERE event_type = 'crm_enrollment_created' AND status = 'sent';
