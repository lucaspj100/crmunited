
CREATE TABLE IF NOT EXISTS public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_events_lead_id_created_at_idx ON public.lead_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_events_user_id_idx ON public.lead_events(user_id);

GRANT SELECT, INSERT ON public.lead_events TO authenticated;
GRANT ALL ON public.lead_events TO service_role;

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own or admin" ON public.lead_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'franqueado')
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_events.lead_id AND l.owner_id = auth.uid())
);

CREATE POLICY "insert own or admin" ON public.lead_events FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'franqueado')
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_events.lead_id AND l.owner_id = auth.uid())
);
