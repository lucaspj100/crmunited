CREATE TABLE public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  normalized_phone text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'active',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_accounts_user_phone_unique UNIQUE (user_id, normalized_phone),
  CONSTRAINT whatsapp_accounts_status_check CHECK (status IN ('active','inactive'))
);

CREATE INDEX idx_whatsapp_accounts_user ON public.whatsapp_accounts(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_accounts TO authenticated;
GRANT ALL ON public.whatsapp_accounts TO service_role;

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own accounts select" ON public.whatsapp_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'));

CREATE POLICY "own accounts insert" ON public.whatsapp_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own accounts update" ON public.whatsapp_accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own accounts delete" ON public.whatsapp_accounts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER whatsapp_accounts_set_updated_at
  BEFORE UPDATE ON public.whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();