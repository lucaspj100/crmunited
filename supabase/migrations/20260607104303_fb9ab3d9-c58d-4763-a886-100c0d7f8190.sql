-- Add "novo" stage to lead_status enum
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'novo' BEFORE 'interessado';

-- Add new task types
ALTER TYPE public.task_type ADD VALUE IF NOT EXISTS 'primeiro_contato';
ALTER TYPE public.task_type ADD VALUE IF NOT EXISTS 'ligar';

-- Add columns to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_normalized text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_invalid boolean NOT NULL DEFAULT false;

-- Backfill phone_normalized for existing rows (strip non-digits, ensure 55 prefix when 10-11 digits)
UPDATE public.leads
SET phone_normalized = CASE
  WHEN regexp_replace(coalesce(phone, ''), '\D', '', 'g') = '' THEN NULL
  WHEN length(regexp_replace(phone, '\D', '', 'g')) IN (10, 11)
    THEN '55' || regexp_replace(phone, '\D', '', 'g')
  ELSE regexp_replace(phone, '\D', '', 'g')
END
WHERE phone IS NOT NULL AND phone_normalized IS NULL;

UPDATE public.leads
SET phone_invalid = true
WHERE phone_normalized IS NOT NULL AND length(phone_normalized) < 12;

CREATE INDEX IF NOT EXISTS idx_leads_phone_normalized ON public.leads(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_owner ON public.leads(owner_id);