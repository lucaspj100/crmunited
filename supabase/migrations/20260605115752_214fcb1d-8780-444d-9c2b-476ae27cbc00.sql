
-- Tighten profiles SELECT: users see own, admins/franqueados see all
DROP POLICY IF EXISTS "profiles select all auth" ON public.profiles;

CREATE POLICY "profiles select own"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "profiles select staff"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'));

-- Lock down trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
