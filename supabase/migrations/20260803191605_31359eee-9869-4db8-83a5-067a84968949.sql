DROP POLICY IF EXISTS "Authenticated can read active goals" ON public.seller_enrollment_goals;
CREATE POLICY "Sellers read own goals, staff read all"
ON public.seller_enrollment_goals FOR SELECT TO authenticated
USING (
  seller_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'franqueado'::app_role)
);