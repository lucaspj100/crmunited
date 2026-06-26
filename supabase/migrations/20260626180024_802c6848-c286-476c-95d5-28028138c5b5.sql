
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prospect_dashboard() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prospect_phones_lookup(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lead_phones_lookup(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_lead_sync() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_lost_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
