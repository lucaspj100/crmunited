
-- Add full 3-digit interurban prefix (e.g. 015, 021, 041) per seller.
ALTER TABLE public.prospect_dialer_settings
  ADD COLUMN IF NOT EXISTS prefixo_interurbano TEXT;

UPDATE public.prospect_dialer_settings
SET prefixo_interurbano = '0' || codigo_operadora_interurbano
WHERE prefixo_interurbano IS NULL;

ALTER TABLE public.prospect_dialer_settings
  ALTER COLUMN prefixo_interurbano SET DEFAULT '015',
  ALTER COLUMN prefixo_interurbano SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prefixo_interurbano_3_digits'
  ) THEN
    ALTER TABLE public.prospect_dialer_settings
      ADD CONSTRAINT prefixo_interurbano_3_digits
      CHECK (prefixo_interurbano ~ '^0[0-9]{2}$');
  END IF;
END $$;

-- Log full prefix on each attempt as well.
ALTER TABLE public.prospect_attempts
  ADD COLUMN IF NOT EXISTS prefixo_interurbano TEXT;
