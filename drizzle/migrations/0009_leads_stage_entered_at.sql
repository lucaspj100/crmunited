ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz;

UPDATE public.leads l SET stage_entered_at = COALESCE(
  (SELECT max(e.created_at) FROM public.lead_events e
    WHERE e.lead_id = l.id AND e.event_type = 'status_change' AND e.metadata->>'to' = l.status::text),
  l.updated_at, l.created_at)
WHERE l.stage_entered_at IS NULL;

ALTER TABLE public.leads ALTER COLUMN stage_entered_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.leads_set_stage_entered_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_entered_at := now();
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.stage_entered_at := now();
  ELSE
    NEW.stage_entered_at := OLD.stage_entered_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_stage_entered_at_trg ON public.leads;
CREATE TRIGGER leads_stage_entered_at_trg BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_set_stage_entered_at();

CREATE INDEX IF NOT EXISTS leads_status_stage_entered_idx ON public.leads (status, stage_entered_at DESC);