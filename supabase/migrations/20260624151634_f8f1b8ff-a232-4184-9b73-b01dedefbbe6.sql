
ALTER TABLE public.prospect_contacts
  DROP CONSTRAINT IF EXISTS prospect_contacts_telefone_normalizado_key;

DROP INDEX IF EXISTS public.prospect_contacts_telefone_normalizado_key;

CREATE UNIQUE INDEX IF NOT EXISTS prospect_contacts_phone_vendedor_uk
  ON public.prospect_contacts (telefone_normalizado, vendedor_responsavel_id)
  WHERE vendedor_responsavel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospect_contacts_phone_idx
  ON public.prospect_contacts (telefone_normalizado);
