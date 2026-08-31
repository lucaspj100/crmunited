REVOKE EXECUTE ON FUNCTION public.guard_career_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_career_fields() TO service_role;