-- Sensitive account-security metadata must never be reachable through the Data API,
-- not even for admin/franqueado. Reads happen only via verified server logic
-- (service role) or the self-scoped my_account_flags() function.
REVOKE SELECT (status, last_sign_in_at, sign_in_count, must_change_password, deactivated_at)
  ON public.profiles FROM authenticated, anon;

-- Table-wide UPDATE also allowed writing (and RETURNING) sensitive columns.
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name, email, avatar_url, team_id, eligible_for_hall_of_fame)
  ON public.profiles TO authenticated;

REVOKE INSERT, DELETE ON public.profiles FROM anon;
GRANT ALL ON public.profiles TO service_role;
