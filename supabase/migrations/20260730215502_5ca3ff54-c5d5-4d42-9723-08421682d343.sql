-- 1) Trigger function must not be callable through the API
REVOKE ALL ON FUNCTION public.leads_leadership_commission_sync() FROM PUBLIC, anon, authenticated;

-- 2) achievement_shares: validate subject_user_id on insert
DROP POLICY IF EXISTS "shares_insert_own" ON public.achievement_shares;
CREATE POLICY "shares_insert_own" ON public.achievement_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      subject_user_id IS NULL
      OR subject_user_id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'franqueado'::app_role)
    )
  );

-- 3) profiles: hide sign-in / account security metadata from the Data API
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, full_name, email, avatar_url, created_at, team_id, eligible_for_hall_of_fame)
  ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.my_account_flags()
RETURNS TABLE(must_change_password boolean, sign_in_count integer, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.must_change_password, p.sign_in_count, p.status
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_account_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_flags() TO authenticated;

CREATE OR REPLACE FUNCTION public.record_sign_in()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.profiles
     SET last_sign_in_at = now(),
         sign_in_count = COALESCE(sign_in_count, 0) + 1
   WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.record_sign_in() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sign_in() TO authenticated;

-- 4) prospect_dialer_settings: staff read-only, owner-only writes
DROP POLICY IF EXISTS "Users manage own dialer settings" ON public.prospect_dialer_settings;

CREATE POLICY "dialer_settings_owner_all" ON public.prospect_dialer_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "dialer_settings_staff_read" ON public.prospect_dialer_settings
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'franqueado'::app_role)
  );