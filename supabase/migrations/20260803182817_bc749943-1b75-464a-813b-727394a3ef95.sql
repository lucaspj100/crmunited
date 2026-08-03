DROP POLICY IF EXISTS access_logs_insert_self ON public.access_logs;
CREATE POLICY access_logs_insert_self ON public.access_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

REVOKE SELECT (status, last_sign_in_at, sign_in_count, must_change_password, deactivated_at) ON public.profiles FROM authenticated, anon;
REVOKE UPDATE (status, last_sign_in_at, sign_in_count, must_change_password, deactivated_at) ON public.profiles FROM authenticated, anon;

DROP POLICY IF EXISTS "profiles select staff" ON public.profiles;
CREATE POLICY "profiles select staff" ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role));