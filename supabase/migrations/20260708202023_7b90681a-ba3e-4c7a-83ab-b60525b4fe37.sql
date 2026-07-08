CREATE TABLE public.whatsapp_list_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_contact_id uuid NOT NULL REFERENCES public.prospect_contacts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'aguardando',
  last_template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  last_template_name text,
  last_message_body text,
  message_copied_at timestamptz,
  whatsapp_opened_at timestamptz,
  message_sent_at timestamptz,
  responded_at timestamptz,
  no_response_at timestamptz,
  removed_at timestamptz,
  followup_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_list_entries_unique_per_owner UNIQUE (prospect_contact_id, owner_id)
);

CREATE INDEX idx_wle_owner_status ON public.whatsapp_list_entries (owner_id, status);
CREATE INDEX idx_wle_prospect ON public.whatsapp_list_entries (prospect_contact_id);
CREATE INDEX idx_wle_owner_responded ON public.whatsapp_list_entries (owner_id, responded_at);
CREATE INDEX idx_wle_owner_opened ON public.whatsapp_list_entries (owner_id, whatsapp_opened_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_list_entries TO authenticated;
GRANT ALL ON public.whatsapp_list_entries TO service_role;

ALTER TABLE public.whatsapp_list_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wle_owner_select" ON public.whatsapp_list_entries
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'franqueado'::app_role)
  );

CREATE POLICY "wle_owner_insert" ON public.whatsapp_list_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'franqueado'::app_role)
  );

CREATE POLICY "wle_owner_update" ON public.whatsapp_list_entries
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'franqueado'::app_role)
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'franqueado'::app_role)
  );

CREATE POLICY "wle_owner_delete" ON public.whatsapp_list_entries
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'franqueado'::app_role)
  );

CREATE TRIGGER trg_wle_set_updated_at
  BEFORE UPDATE ON public.whatsapp_list_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();