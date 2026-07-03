
DROP POLICY IF EXISTS "leads update scope" ON public.leads;
CREATE POLICY "leads update scope" ON public.leads FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role) OR (owner_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role) OR (owner_id = auth.uid()));

DROP POLICY IF EXISTS "profiles update self" ON public.profiles;
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "tasks update scope" ON public.tasks;
CREATE POLICY "tasks update scope" ON public.tasks FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role) OR (owner_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role) OR (owner_id = auth.uid()));
