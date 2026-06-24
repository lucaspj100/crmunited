ALTER TABLE public.prospect_contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
DROP FUNCTION IF EXISTS public.prospect_phones_lookup(text[]);
CREATE FUNCTION public.prospect_phones_lookup(_phones text[])
 RETURNS TABLE(id uuid, telefone_normalizado text, nome text, empresa text, cargo text, origem text, observacao text, linkedin_url text, status_prospeccao text, vendedor_responsavel_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, telefone_normalizado, nome, empresa, cargo, origem, observacao, linkedin_url,
         status_prospeccao, vendedor_responsavel_id
  FROM public.prospect_contacts
  WHERE telefone_normalizado = ANY(_phones);
$function$;