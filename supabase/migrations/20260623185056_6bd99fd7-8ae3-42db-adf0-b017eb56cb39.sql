CREATE TABLE public.prospect_dialer_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ddd_origem TEXT NOT NULL DEFAULT '11',
  codigo_operadora_interurbano TEXT NOT NULL DEFAULT '15',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ddd_origem_2_digits CHECK (ddd_origem ~ '^[0-9]{2}$'),
  CONSTRAINT operadora_2_digits CHECK (codigo_operadora_interurbano ~ '^[0-9]{2}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_dialer_settings TO authenticated;
GRANT ALL ON public.prospect_dialer_settings TO service_role;

ALTER TABLE public.prospect_dialer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dialer settings"
  ON public.prospect_dialer_settings FOR ALL
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado'));

CREATE TRIGGER set_dialer_settings_updated_at
  BEFORE UPDATE ON public.prospect_dialer_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.prospect_attempts
  ADD COLUMN IF NOT EXISTS telefone_para_discagem TEXT,
  ADD COLUMN IF NOT EXISTS ddd_origem_vendedor TEXT,
  ADD COLUMN IF NOT EXISTS codigo_operadora_interurbano TEXT,
  ADD COLUMN IF NOT EXISTS ddd_destino_contato TEXT;
