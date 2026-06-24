REVOKE EXECUTE ON FUNCTION public.prospect_phones_lookup(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lead_phones_lookup(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospect_phones_lookup(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lead_phones_lookup(text[]) TO authenticated, service_role;