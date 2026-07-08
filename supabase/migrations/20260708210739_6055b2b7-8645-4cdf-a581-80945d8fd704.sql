
-- 1) profiles: add access tracking + status fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS sign_in_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Ensure status is one of allowed values via trigger (avoid CHECK immutability issues)
CREATE OR REPLACE FUNCTION public.validate_profile_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('ativo','inativo','bloqueado','pendente_redefinicao') THEN
    RAISE EXCEPTION 'Invalid profile status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_validate_status ON public.profiles;
CREATE TRIGGER trg_profiles_validate_status
  BEFORE INSERT OR UPDATE OF status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_status();

-- 2) access_logs table
CREATE TABLE IF NOT EXISTS public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  reason text,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_user_id_created ON public.access_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_created ON public.access_logs(created_at DESC);

GRANT SELECT, INSERT ON public.access_logs TO authenticated;
GRANT SELECT, INSERT ON public.access_logs TO anon; -- para registrar tentativas de login falhas
GRANT ALL ON public.access_logs TO service_role;

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Admin/franqueado veem tudo; usuário vê os próprios
DROP POLICY IF EXISTS "access_logs_select_admin" ON public.access_logs;
CREATE POLICY "access_logs_select_admin" ON public.access_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

DROP POLICY IF EXISTS "access_logs_select_own" ON public.access_logs;
CREATE POLICY "access_logs_select_own" ON public.access_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Qualquer autenticado pode registrar seu próprio evento
DROP POLICY IF EXISTS "access_logs_insert_self" ON public.access_logs;
CREATE POLICY "access_logs_insert_self" ON public.access_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Anônimos podem inserir tentativas de login falhas (sem user_id)
DROP POLICY IF EXISTS "access_logs_insert_anon_failed" ON public.access_logs;
CREATE POLICY "access_logs_insert_anon_failed" ON public.access_logs
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND event_type = 'login_failed');
