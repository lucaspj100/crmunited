
DROP POLICY IF EXISTS "leads update scope" ON public.leads;
CREATE POLICY "leads update scope" ON public.leads
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role) OR (owner_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role) OR (owner_id = auth.uid()));

DROP POLICY IF EXISTS "tasks update scope" ON public.tasks;
CREATE POLICY "tasks update scope" ON public.tasks
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role) OR (owner_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role) OR (owner_id = auth.uid()));

DROP POLICY IF EXISTS "profiles update self" ON public.profiles;
CREATE POLICY "profiles update self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users manage own dialer settings" ON public.prospect_dialer_settings;
CREATE POLICY "Users manage own dialer settings" ON public.prospect_dialer_settings
  FOR ALL TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role))
  WITH CHECK ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role));

DROP POLICY IF EXISTS "Users manage own daily goal" ON public.seller_daily_goals;
CREATE POLICY "Users manage own daily goal" ON public.seller_daily_goals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
