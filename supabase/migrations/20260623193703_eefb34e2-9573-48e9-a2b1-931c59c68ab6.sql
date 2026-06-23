
-- Allow vendedor to insert their own prospect contacts (must be assigned to self and created by self)
DROP POLICY IF EXISTS prospect_contacts_vendedor_insert ON public.prospect_contacts;
CREATE POLICY prospect_contacts_vendedor_insert ON public.prospect_contacts
FOR INSERT TO authenticated
WITH CHECK (vendedor_responsavel_id = auth.uid() AND created_by = auth.uid());

-- Lookup function: returns existing prospect rows for given phone list (security definer so vendedor can detect cross-vendor duplicates without seeing others' contacts data — only enough to decide skip/update)
CREATE OR REPLACE FUNCTION public.prospect_phones_lookup(_phones text[])
RETURNS TABLE(
  id uuid,
  telefone_normalizado text,
  nome text,
  empresa text,
  cargo text,
  origem text,
  observacao text,
  status_prospeccao text,
  vendedor_responsavel_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, telefone_normalizado, nome, empresa, cargo, origem, observacao,
         status_prospeccao, vendedor_responsavel_id
  FROM public.prospect_contacts
  WHERE telefone_normalizado = ANY(_phones);
$$;
GRANT EXECUTE ON FUNCTION public.prospect_phones_lookup(text[]) TO authenticated;

-- Lookup function for leads (CRM) — only returns the normalized phone so importer can flag duplicates
CREATE OR REPLACE FUNCTION public.lead_phones_lookup(_phones text[])
RETURNS TABLE(phone_normalized text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT phone_normalized FROM public.leads
  WHERE phone_normalized = ANY(_phones);
$$;
GRANT EXECUTE ON FUNCTION public.lead_phones_lookup(text[]) TO authenticated;
