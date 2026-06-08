
-- Deny-all explícito (linter zera ao ver policies)
CREATE POLICY "No direct access tokens" ON public.google_oauth_tokens
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No direct access queue" ON public.sync_queue
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Revoga execute da função interna do trigger
REVOKE EXECUTE ON FUNCTION public.enqueue_lead_sync() FROM PUBLIC, anon, authenticated;
