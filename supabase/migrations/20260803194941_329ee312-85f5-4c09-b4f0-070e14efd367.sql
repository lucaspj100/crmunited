REVOKE ALL ON public.profile_account_security FROM anon, authenticated;
GRANT ALL ON public.profile_account_security TO service_role;