
-- prospect_contacts
CREATE TABLE public.prospect_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text,
  telefone_original text,
  telefone_normalizado text NOT NULL UNIQUE,
  ddd text,
  empresa text,
  cargo text,
  origem text,
  observacao text,
  vendedor_responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  status_prospeccao text NOT NULL DEFAULT 'Aguardando ligação',
  quantidade_tentativas integer NOT NULL DEFAULT 0,
  ultima_tentativa timestamptz,
  proxima_tentativa timestamptz,
  nao_chamar boolean NOT NULL DEFAULT false,
  telefone_invalido boolean NOT NULL DEFAULT false,
  convertido_em_lead boolean NOT NULL DEFAULT false,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prospect_contacts_vendedor_idx ON public.prospect_contacts(vendedor_responsavel_id);
CREATE INDEX prospect_contacts_status_idx ON public.prospect_contacts(status_prospeccao);
CREATE INDEX prospect_contacts_proxima_idx ON public.prospect_contacts(proxima_tentativa);
CREATE INDEX prospect_contacts_ddd_idx ON public.prospect_contacts(ddd);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_contacts TO authenticated;
GRANT ALL ON public.prospect_contacts TO service_role;

ALTER TABLE public.prospect_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospect_contacts_admin_all"
  ON public.prospect_contacts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'));

CREATE POLICY "prospect_contacts_vendedor_select"
  ON public.prospect_contacts FOR SELECT
  TO authenticated
  USING (vendedor_responsavel_id = auth.uid());

CREATE POLICY "prospect_contacts_vendedor_update"
  ON public.prospect_contacts FOR UPDATE
  TO authenticated
  USING (vendedor_responsavel_id = auth.uid())
  WITH CHECK (vendedor_responsavel_id = auth.uid());

CREATE TRIGGER prospect_contacts_set_updated_at
  BEFORE UPDATE ON public.prospect_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- prospect_attempts
CREATE TABLE public.prospect_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_contact_id uuid NOT NULL REFERENCES public.prospect_contacts(id) ON DELETE CASCADE,
  vendedor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tipo_acao text NOT NULL CHECK (tipo_acao IN ('ligacao','whatsapp','edicao')),
  telefone_normalizado text,
  resultado text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prospect_attempts_contact_idx ON public.prospect_attempts(prospect_contact_id);
CREATE INDEX prospect_attempts_vendedor_idx ON public.prospect_attempts(vendedor_id);
CREATE INDEX prospect_attempts_created_idx ON public.prospect_attempts(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_attempts TO authenticated;
GRANT ALL ON public.prospect_attempts TO service_role;

ALTER TABLE public.prospect_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospect_attempts_admin_all"
  ON public.prospect_attempts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'));

CREATE POLICY "prospect_attempts_vendedor_select"
  ON public.prospect_attempts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prospect_contacts pc
      WHERE pc.id = prospect_contact_id
        AND pc.vendedor_responsavel_id = auth.uid()
    )
  );

CREATE POLICY "prospect_attempts_vendedor_insert"
  ON public.prospect_attempts FOR INSERT
  TO authenticated
  WITH CHECK (
    vendedor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.prospect_contacts pc
      WHERE pc.id = prospect_contact_id
        AND pc.vendedor_responsavel_id = auth.uid()
    )
  );
