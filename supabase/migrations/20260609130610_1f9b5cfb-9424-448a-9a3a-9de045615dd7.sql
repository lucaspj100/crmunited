
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_rescue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rescued_at timestamptz,
  ADD COLUMN IF NOT EXISTS rescued_by uuid;

-- Backfill lost_at para leads já marcados como perdido
UPDATE public.leads
SET lost_at = COALESCE(lost_at, updated_at)
WHERE status = 'perdido' AND lost_at IS NULL;

-- Trigger para registrar a data quando o status muda para 'perdido'
CREATE OR REPLACE FUNCTION public.set_lost_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'perdido' AND (OLD.status IS DISTINCT FROM 'perdido') THEN
    NEW.lost_at := COALESCE(NEW.lost_at, now());
  END IF;
  IF NEW.status <> 'perdido' AND OLD.status = 'perdido' THEN
    -- saiu de perdido: limpa flags de resgate se voltou ao funil
    NEW.in_rescue := false;
    NEW.rescued_at := NULL;
    NEW.rescued_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_set_lost_at ON public.leads;
CREATE TRIGGER trg_leads_set_lost_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_lost_at();

CREATE INDEX IF NOT EXISTS idx_leads_lost_at ON public.leads (lost_at) WHERE status = 'perdido';
CREATE INDEX IF NOT EXISTS idx_leads_in_rescue ON public.leads (in_rescue) WHERE in_rescue = true;
