-- F2: reserva/distribuição de contatos entre contas WhatsApp.
ALTER TABLE public.whatsapp_campaign_contacts
  ADD COLUMN IF NOT EXISTS whatsapp_account_id uuid,
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Backfill seguro dos campos antigos (somente contas existentes; erro truncado).
UPDATE public.whatsapp_campaign_contacts c
   SET whatsapp_account_id = c.sent_by_account_id
 WHERE c.sent_by_account_id IS NOT NULL
   AND c.whatsapp_account_id IS NULL
   AND EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = c.sent_by_account_id);
UPDATE public.whatsapp_campaign_contacts
   SET last_error = left(error, 120)
 WHERE error IS NOT NULL AND last_error IS NULL;

ALTER TABLE public.whatsapp_campaign_contacts
  ADD CONSTRAINT wcc_account_fk FOREIGN KEY (whatsapp_account_id)
  REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_campaign_contacts DROP CONSTRAINT wcc_status_chk;
ALTER TABLE public.whatsapp_campaign_contacts ADD CONSTRAINT wcc_status_chk
  CHECK (status = ANY (ARRAY['pending','reserved','sending','sent','failed','cancelled']));
ALTER TABLE public.whatsapp_campaign_contacts ADD CONSTRAINT wcc_last_error_len
  CHECK (last_error IS NULL OR char_length(last_error) <= 120);

COMMENT ON COLUMN public.whatsapp_campaign_contacts.sent_by_account_id IS 'DEPRECATED: replaced by whatsapp_account_id (mantido por compatibilidade, ainda preenchido no envio)';
COMMENT ON COLUMN public.whatsapp_campaign_contacts.error IS 'DEPRECATED: replaced by last_error';
COMMENT ON COLUMN public.whatsapp_campaign_contacts.status IS 'pending|reserved|sending|sent|failed|cancelled. sending: reservado no schema, NÃO usado na F2 (será ativado na fase da extensão).';

CREATE INDEX IF NOT EXISTS wcc_pending_pick_idx
  ON public.whatsapp_campaign_contacts (campaign_id, created_at, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS wcc_reserved_idx
  ON public.whatsapp_campaign_contacts (campaign_id, reserved_at) WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS wcc_account_idx
  ON public.whatsapp_campaign_contacts (whatsapp_account_id);

-- Valida que a conta pertence ao usuário do token e está ativa.
CREATE OR REPLACE FUNCTION public.wa_campaign_own_active_account(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.whatsapp_accounts
     WHERE id = _account_id AND user_id = auth.uid() AND status = 'active');
$$;

-- Reserva atômica: FOR UPDATE SKIP LOCKED + UPDATE no mesmo comando.
CREATE OR REPLACE FUNCTION public.wa_campaign_reserve(_campaign_id uuid, _account_id uuid, _limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _status text;
  _lim integer := greatest(1, least(50, coalesce(_limit, 20)));
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.wa_campaign_own_active_account(_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_allowed');
  END IF;

  -- FOR SHARE: impede pausa/encerramento enquanto o lote é entregue.
  SELECT status INTO _status FROM public.whatsapp_campaigns WHERE id = _campaign_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found'); END IF;
  IF _status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_active'); END IF;

  -- Libera reservas expiradas (10 min) desta campanha, sob demanda.
  UPDATE public.whatsapp_campaign_contacts
     SET status = 'pending', whatsapp_account_id = NULL, reserved_at = NULL, attempts = attempts + 1
   WHERE campaign_id = _campaign_id AND status = 'reserved'
     AND reserved_at < now() - interval '10 minutes';

  WITH picked AS (
    SELECT id FROM public.whatsapp_campaign_contacts
     WHERE campaign_id = _campaign_id AND status = 'pending'
     ORDER BY created_at, id
     LIMIT _lim
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.whatsapp_campaign_contacts c
       SET status = 'reserved', whatsapp_account_id = _account_id, reserved_at = now()
      FROM picked WHERE c.id = picked.id
    RETURNING c.id, c.name, c.phone, c.company, c.created_at
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'company', company)
                            ORDER BY created_at, id), '[]'::jsonb)
    INTO _result FROM upd;

  RETURN jsonb_build_object('ok', true, 'contacts', _result);
END $$;

CREATE OR REPLACE FUNCTION public.wa_campaign_mark_sent(_contact_id uuid, _account_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.whatsapp_campaign_contacts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.wa_campaign_own_active_account(_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_allowed');
  END IF;
  SELECT * INTO r FROM public.whatsapp_campaign_contacts WHERE id = _contact_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'contact_not_found'); END IF;

  IF r.status = 'sent' THEN
    IF r.whatsapp_account_id = _account_id THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'reserved_by_other_account');
  END IF;
  IF r.status = 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'reservation_expired'); END IF;
  IF r.status <> 'reserved' THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', r.status); END IF;
  IF r.whatsapp_account_id IS DISTINCT FROM _account_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reserved_by_other_account');
  END IF;

  UPDATE public.whatsapp_campaign_contacts
     SET status = 'sent', sent_at = now(), sent_by_account_id = _account_id
   WHERE id = _contact_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END $$;

CREATE OR REPLACE FUNCTION public.wa_campaign_mark_failed(_contact_id uuid, _account_id uuid, _error_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.whatsapp_campaign_contacts%ROWTYPE;
  _code text := CASE WHEN _error_code = ANY (ARRAY['invalid_number','not_on_whatsapp','blocked','timeout','ui_error','unknown'])
                     THEN _error_code ELSE 'unknown' END;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.wa_campaign_own_active_account(_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_allowed');
  END IF;
  SELECT * INTO r FROM public.whatsapp_campaign_contacts WHERE id = _contact_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'contact_not_found'); END IF;

  IF r.status = 'failed' THEN
    IF r.whatsapp_account_id = _account_id THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'reserved_by_other_account');
  END IF;
  IF r.status = 'sent' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_sent'); END IF;
  IF r.status = 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'reservation_expired'); END IF;
  IF r.status <> 'reserved' THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', r.status); END IF;
  IF r.whatsapp_account_id IS DISTINCT FROM _account_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reserved_by_other_account');
  END IF;

  UPDATE public.whatsapp_campaign_contacts
     SET status = 'failed', failed_at = now(), last_error = _code, attempts = attempts + 1
   WHERE id = _contact_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END $$;

-- Encerramento: pending e reserved viram cancelled (sent/failed/cancelled permanecem).
CREATE OR REPLACE FUNCTION public.wa_campaign_close_cancel_contacts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    UPDATE public.whatsapp_campaign_contacts
       SET status = 'cancelled'
     WHERE campaign_id = NEW.id AND status IN ('pending','reserved','sending');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wa_campaign_close_trg ON public.whatsapp_campaigns;
CREATE TRIGGER wa_campaign_close_trg AFTER UPDATE OF status ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.wa_campaign_close_cancel_contacts();

-- Contagens (leitura sob RLS: só ADM/franqueado).
CREATE OR REPLACE FUNCTION public.whatsapp_campaign_status_counts()
RETURNS TABLE(campaign_id uuid, total bigint, pending bigint, reserved bigint, sending bigint, sent bigint, failed bigint, cancelled bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT campaign_id, count(*),
    count(*) FILTER (WHERE status='pending'), count(*) FILTER (WHERE status='reserved'),
    count(*) FILTER (WHERE status='sending'), count(*) FILTER (WHERE status='sent'),
    count(*) FILTER (WHERE status='failed'), count(*) FILTER (WHERE status='cancelled')
  FROM public.whatsapp_campaign_contacts GROUP BY campaign_id;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_campaign_account_stats(_campaign_id uuid)
RETURNS TABLE(whatsapp_account_id uuid, reserved bigint, sent bigint, failed bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT whatsapp_account_id,
    count(*) FILTER (WHERE status='reserved'), count(*) FILTER (WHERE status='sent'),
    count(*) FILTER (WHERE status='failed')
  FROM public.whatsapp_campaign_contacts
  WHERE campaign_id = _campaign_id AND whatsapp_account_id IS NOT NULL
  GROUP BY whatsapp_account_id;
$$;

REVOKE ALL ON FUNCTION public.wa_campaign_reserve(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_mark_sent(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_mark_failed(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_own_active_account(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_close_cancel_contacts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_reserve(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_mark_sent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_mark_failed(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_own_active_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_campaign_status_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_campaign_account_stats(uuid) TO authenticated;
