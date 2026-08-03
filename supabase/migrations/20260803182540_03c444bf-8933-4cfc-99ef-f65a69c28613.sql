CREATE POLICY "franqueados see all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'franqueado'::app_role));