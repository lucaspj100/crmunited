CREATE TABLE IF NOT EXISTS public.prospect_dialer_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_contact_id uuid NULL REFERENCES public.prospect_contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_dialer_sessions TO authenticated;
GRANT ALL ON public.prospect_dialer_sessions TO service_role;

ALTER TABLE public.prospect_dialer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_session_select" ON public.prospect_dialer_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_session_insert" ON public.prospect_dialer_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_session_update" ON public.prospect_dialer_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_session_delete" ON public.prospect_dialer_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_prospect_dialer_sessions_updated_at ON public.prospect_dialer_sessions;
CREATE TRIGGER set_prospect_dialer_sessions_updated_at
  BEFORE UPDATE ON public.prospect_dialer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.prospect_dialer_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prospect_dialer_sessions;