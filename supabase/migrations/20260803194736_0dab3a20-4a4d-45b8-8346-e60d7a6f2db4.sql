-- 1) New protected table for account/access metadata
CREATE TABLE public.profile_account_security (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ativo',
  last_sign_in_at timestamptz,
  sign_in_count integer NOT NULL DEFAULT 0,
  must_change_password boolean NOT NULL DEFAULT false,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Grants: only privileged server-side access. No anon/authenticated grants.
GRANT ALL ON public.profile_account_security TO service_role;

-- 3) RLS enabled with no policies for anon/authenticated => fail closed
ALTER TABLE public.profile_account_security ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_pas_updated_at
BEFORE UPDATE ON public.profile_account_security
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Copy existing data
INSERT INTO public.profile_account_security (user_id, status, last_sign_in_at, sign_in_count, must_change_password, deactivated_at)
SELECT id, COALESCE(status, 'ativo'), last_sign_in_at, COALESCE(sign_in_count, 0), COALESCE(must_change_password, false), deactivated_at
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- 5) Status validation moves to the new table
DROP TRIGGER IF EXISTS trg_profiles_validate_status ON public.profiles;

CREATE OR REPLACE FUNCTION public.validate_profile_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('ativo','inativo','bloqueado','pendente_redefinicao') THEN
    RAISE EXCEPTION 'Invalid account status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pas_validate_status
BEFORE INSERT OR UPDATE ON public.profile_account_security
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_status();

-- 6) Drop the sensitive columns from the directory table
ALTER TABLE public.profiles
  DROP COLUMN status,
  DROP COLUMN last_sign_in_at,
  DROP COLUMN sign_in_count,
  DROP COLUMN must_change_password,
  DROP COLUMN deactivated_at;

-- 7) Self-service flags read from the new table
CREATE OR REPLACE FUNCTION public.my_account_flags()
RETURNS TABLE(must_change_password boolean, sign_in_count integer, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.must_change_password, s.sign_in_count, s.status
  FROM public.profile_account_security s
  WHERE s.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_account_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_flags() TO authenticated, service_role;

-- 8) Sign-in bookkeeping writes to the new table
CREATE OR REPLACE FUNCTION public.record_sign_in()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.profile_account_security (user_id, last_sign_in_at, sign_in_count)
  VALUES (auth.uid(), now(), 1)
  ON CONFLICT (user_id) DO UPDATE
     SET last_sign_in_at = now(),
         sign_in_count = COALESCE(public.profile_account_security.sign_in_count, 0) + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_sign_in() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sign_in() TO authenticated, service_role;

-- 9) New users get a security row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  default_team uuid;
BEGIN
  SELECT id INTO default_team FROM public.teams
   WHERE name = 'Outros usuários United' LIMIT 1;
  IF default_team IS NULL THEN
    SELECT id INTO default_team FROM public.teams WHERE is_primary LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, team_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, default_team);
  INSERT INTO public.profile_account_security (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor');
  RETURN NEW;
END $$;