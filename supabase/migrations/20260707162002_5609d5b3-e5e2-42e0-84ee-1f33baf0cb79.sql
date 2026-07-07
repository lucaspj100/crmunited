-- 1) Revoke public/anon execute on debug function; keep authenticated
REVOKE ALL ON FUNCTION public.debug_entrevistas_marcadas(date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debug_entrevistas_marcadas(date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.debug_entrevistas_marcadas(date, date, uuid) TO authenticated;

-- 2) google_oauth_tokens: owner-scoped policy
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='google_oauth_tokens') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users manage own google oauth tokens" ON public.google_oauth_tokens';
    EXECUTE $p$CREATE POLICY "Users manage own google oauth tokens" ON public.google_oauth_tokens
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)$p$;
  END IF;
END $$;

-- 3) sync_queue: owner + admin read policy
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sync_queue') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Owners and admins read sync_queue" ON public.sync_queue';
    EXECUTE $p$CREATE POLICY "Owners and admins read sync_queue" ON public.sync_queue
      FOR SELECT TO authenticated
      USING (
        owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'franqueado'::app_role)
      )$p$;
  END IF;
END $$;