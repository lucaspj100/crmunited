
-- 1) Tokens OAuth do Google por vendedor
CREATE TABLE public.google_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  google_email TEXT,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.google_oauth_tokens TO service_role;
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- nenhuma policy pra authenticated: só service_role acessa (server fns)

-- 2) Planilha conectada de cada vendedor
CREATE TABLE public.sheet_integrations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  spreadsheet_id TEXT NOT NULL,
  spreadsheet_url TEXT NOT NULL,
  sheet_title TEXT,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_integrations TO authenticated;
GRANT ALL ON public.sheet_integrations TO service_role;
ALTER TABLE public.sheet_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor sees own integration" ON public.sheet_integrations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Vendor manages own integration" ON public.sheet_integrations
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3) Fila de sincronização
CREATE TABLE public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  owner_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('crm_to_sheet','sheet_to_crm')),
  op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','error')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX idx_sync_queue_pending ON public.sync_queue (status, owner_id) WHERE status = 'pending';
GRANT ALL ON public.sync_queue TO service_role;
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;
-- só service_role

-- 4) Histórico de alterações
CREATE TABLE public.lead_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID,
  source TEXT NOT NULL DEFAULT 'crm' CHECK (source IN ('crm','sheets','system')),
  conflict BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_history_lead ON public.lead_history (lead_id, created_at DESC);
GRANT SELECT, INSERT ON public.lead_history TO authenticated;
GRANT ALL ON public.lead_history TO service_role;
ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View history of own leads" ON public.lead_history
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert history for own leads" ON public.lead_history
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 5) Novas colunas em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_at DATE,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS last_source TEXT NOT NULL DEFAULT 'crm' CHECK (last_source IN ('crm','sheets','system')),
  ADD COLUMN IF NOT EXISTS sheets_row INT;

-- 6) Trigger pra enfileirar mudanças em leads (CRM -> Sheets)
CREATE OR REPLACE FUNCTION public.enqueue_lead_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.sync_queue (lead_id, owner_id, direction, op)
    VALUES (OLD.id, OLD.owner_id, 'crm_to_sheet', 'delete');
    RETURN OLD;
  END IF;

  -- Só enfileira se a última alteração veio do CRM (evita loop sheet->crm->sheet)
  IF NEW.last_source = 'sheets' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sync_queue (lead_id, owner_id, direction, op)
  VALUES (NEW.id, NEW.owner_id, 'crm_to_sheet', 'upsert');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_enqueue_sync ON public.leads;
CREATE TRIGGER trg_leads_enqueue_sync
AFTER INSERT OR UPDATE OR DELETE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enqueue_lead_sync();

-- 7) updated_at triggers nas novas tabelas
CREATE TRIGGER set_google_tokens_updated_at BEFORE UPDATE ON public.google_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_sheet_integrations_updated_at BEFORE UPDATE ON public.sheet_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
