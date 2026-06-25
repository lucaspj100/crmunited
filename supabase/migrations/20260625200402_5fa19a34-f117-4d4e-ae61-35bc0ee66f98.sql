
-- 1) Adicionar valor de enum task_type
ALTER TYPE public.task_type ADD VALUE IF NOT EXISTS 'retorno_ligacao';

-- 2) Permitir tasks sem lead vinculado (vinculadas a prospect)
ALTER TABLE public.tasks ALTER COLUMN lead_id DROP NOT NULL;

-- 3) Vincular task a prospect_contact
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS prospect_contact_id uuid
  REFERENCES public.prospect_contacts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_prospect_contact_id
  ON public.tasks(prospect_contact_id);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_type_status_due
  ON public.tasks(owner_id, type, status, due_date);

-- 4) Garantia: ao menos um vínculo
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_lead_or_prospect_required;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_lead_or_prospect_required
  CHECK (lead_id IS NOT NULL OR prospect_contact_id IS NOT NULL);
