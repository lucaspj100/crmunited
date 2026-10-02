-- F3-B: claim atômico por contato (reserved -> sending) ANTES de cada envio,
-- unclaim restrito, e /sent + /failed exigindo a posse exata da tentativa.
--
-- Invariantes desta migration:
-- - NENHUMA função leva `sending` para `pending`. As únicas saídas de `sending`
--   são: sent / failed (mesma tentativa) e unclaim (mesma tentativa, chamado
--   pela extensão só quando há prova de que nada foi enviado).
-- - `failed` é terminal: nenhuma função leva `failed` de volta a `pending`.
-- - A expiração sob demanda do reserve e o release só tocam `reserved`.
-- - Encerrar campanha não sobrescreve `sending` (o envio pode ter ocorrido).

ALTER TABLE public.whatsapp_campaign_contacts
  ADD COLUMN IF NOT EXISTS sending_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_attempt_id uuid;

COMMENT ON COLUMN public.whatsapp_campaign_contacts.sending_at IS
  'F3-B: momento do claim reserved -> sending. Mantido após sent/failed como histórico. Nunca concede reenvio.';
COMMENT ON COLUMN public.whatsapp_campaign_contacts.send_attempt_id IS
  'F3-B: attemptId (UUID gerado pela extensão) dono do claim. Exigido por sent/failed/unclaim. Mantido após sent/failed.';
COMMENT ON COLUMN public.whatsapp_campaign_contacts.status IS
  'pending|reserved|sending|sent|failed|cancelled. sending: claim da F3-B; nunca volta sozinho para pending.';

CREATE INDEX IF NOT EXISTS wcc_sending_idx
  ON public.whatsapp_campaign_contacts (campaign_id, sending_at) WHERE status = 'sending';

-- Posse da conta SEM exigir status 'active': finalizar/desfazer o que já foi
-- autorizado não pode falhar porque a conta foi desativada no meio do envio.
CREATE OR REPLACE FUNCTION public.wa_campaign_own_account(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.whatsapp_accounts
     WHERE id = _account_id AND user_id = auth.uid());
$$;

-- Claim: reserved -> sending, validando contato + campanha + conta + lote + validade.
-- Replay com o MESMO attemptId sobre `sending` -> { ok:true, already:true }.
CREATE OR REPLACE FUNCTION public.wa_campaign_claim(
  _contact_id uuid, _campaign_id uuid, _account_id uuid, _reservation_id uuid, _attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cs text;
  r public.whatsapp_campaign_contacts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.wa_campaign_own_active_account(_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_allowed');
  END IF;

  -- FOR SHARE: pausa/encerramento esperam este claim terminar (e vice-versa).
  SELECT status INTO _cs FROM public.whatsapp_campaigns WHERE id = _campaign_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found'); END IF;

  SELECT * INTO r FROM public.whatsapp_campaign_contacts
   WHERE id = _contact_id AND campaign_id = _campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'contact_not_found'); END IF;

  IF _cs <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_active'); END IF;

  IF r.status = 'sending' THEN
    IF r.whatsapp_account_id = _account_id
       AND r.reservation_id = _reservation_id
       AND r.send_attempt_id = _attempt_id THEN
      RETURN jsonb_build_object('ok', true, 'already', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'already_sending');
  END IF;
  IF r.status IN ('sent', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_finalized');
  END IF;
  IF r.status = 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reservation_expired');
  END IF;
  -- status = 'reserved'
  IF r.whatsapp_account_id IS DISTINCT FROM _account_id
     OR r.reservation_id IS DISTINCT FROM _reservation_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reservation_mismatch');
  END IF;
  IF r.reserved_at IS NULL OR r.reserved_at < now() - interval '10 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reservation_expired');
  END IF;

  UPDATE public.whatsapp_campaign_contacts
     SET status = 'sending', sending_at = now(), send_attempt_id = _attempt_id
   WHERE id = _contact_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END $$;

-- Unclaim: desfaz SÓ o claim desta tentativa (sending -> reserved).
-- A extensão só chama quando tem prova de que nada foi enviado.
-- { ok:true, already:true } = este attemptId não detém nada (nada a desfazer).
-- reserved_at é mantido: a validade original da reserva continua valendo.
CREATE OR REPLACE FUNCTION public.wa_campaign_unclaim(
  _contact_id uuid, _campaign_id uuid, _account_id uuid, _reservation_id uuid, _attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.whatsapp_campaign_contacts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.wa_campaign_own_account(_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_allowed');
  END IF;

  SELECT * INTO r FROM public.whatsapp_campaign_contacts
   WHERE id = _contact_id AND campaign_id = _campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'contact_not_found'); END IF;

  IF r.send_attempt_id = _attempt_id AND r.status IN ('sent', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_finalized');
  END IF;

  IF r.status = 'sending' AND r.send_attempt_id = _attempt_id THEN
    IF r.whatsapp_account_id IS DISTINCT FROM _account_id
       OR r.reservation_id IS DISTINCT FROM _reservation_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'attempt_mismatch');
    END IF;
    UPDATE public.whatsapp_campaign_contacts
       SET status = 'reserved', sending_at = NULL, send_attempt_id = NULL
     WHERE id = _contact_id;
    RETURN jsonb_build_object('ok', true, 'already', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'already', true);
END $$;

-- Sent: só sobre `sending` da MESMA tentativa (conta + lote + attemptId).
-- Não checa status da campanha: a mensagem já saiu.
CREATE OR REPLACE FUNCTION public.wa_campaign_mark_sent(
  _contact_id uuid, _campaign_id uuid, _account_id uuid, _reservation_id uuid, _attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.whatsapp_campaign_contacts%ROWTYPE;
  _m boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.wa_campaign_own_account(_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_allowed');
  END IF;

  SELECT * INTO r FROM public.whatsapp_campaign_contacts
   WHERE id = _contact_id AND campaign_id = _campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'contact_not_found'); END IF;

  _m := r.whatsapp_account_id IS NOT DISTINCT FROM _account_id
        AND r.reservation_id IS NOT DISTINCT FROM _reservation_id
        AND r.send_attempt_id IS NOT DISTINCT FROM _attempt_id;

  IF r.status = 'sent' THEN
    IF _m THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'already_finalized');
  END IF;
  IF r.status IN ('failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_finalized');
  END IF;
  IF r.status <> 'sending' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_claimed'); END IF;
  IF NOT _m THEN RETURN jsonb_build_object('ok', false, 'error', 'attempt_mismatch'); END IF;

  UPDATE public.whatsapp_campaign_contacts
     SET status = 'sent', sent_at = now(), sent_by_account_id = _account_id
   WHERE id = _contact_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END $$;

-- Failed: mesma regra do sent. Terminal (attempts + 1, last_error = código).
CREATE OR REPLACE FUNCTION public.wa_campaign_mark_failed(
  _contact_id uuid, _campaign_id uuid, _account_id uuid, _reservation_id uuid, _attempt_id uuid,
  _error_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.whatsapp_campaign_contacts%ROWTYPE;
  _m boolean;
  _code text := CASE WHEN _error_code = ANY (ARRAY[
                       'invalid_number', 'not_on_whatsapp', 'manual_confirmed_not_sent',
                       'blocked', 'timeout', 'ui_error', 'unknown'])
                     THEN _error_code ELSE 'unknown' END;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.wa_campaign_own_account(_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_allowed');
  END IF;

  SELECT * INTO r FROM public.whatsapp_campaign_contacts
   WHERE id = _contact_id AND campaign_id = _campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'contact_not_found'); END IF;

  _m := r.whatsapp_account_id IS NOT DISTINCT FROM _account_id
        AND r.reservation_id IS NOT DISTINCT FROM _reservation_id
        AND r.send_attempt_id IS NOT DISTINCT FROM _attempt_id;

  IF r.status = 'failed' THEN
    IF _m THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'already_finalized');
  END IF;
  IF r.status IN ('sent', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_finalized');
  END IF;
  IF r.status <> 'sending' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_claimed'); END IF;
  IF NOT _m THEN RETURN jsonb_build_object('ok', false, 'error', 'attempt_mismatch'); END IF;

  UPDATE public.whatsapp_campaign_contacts
     SET status = 'failed', failed_at = now(), last_error = _code, attempts = attempts + 1
   WHERE id = _contact_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END $$;

-- Encerramento: só pending e reserved viram cancelled. `sending` fica intacto
-- (pode já ter sido enviado) e continua finalizável por sent/failed.
CREATE OR REPLACE FUNCTION public.wa_campaign_close_cancel_contacts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    UPDATE public.whatsapp_campaign_contacts
       SET status = 'cancelled'
     WHERE campaign_id = NEW.id AND status IN ('pending', 'reserved');
  END IF;
  RETURN NEW;
END $$;

-- As assinaturas da F2 saem: ninguém finaliza um contato sem attemptId.
DROP FUNCTION IF EXISTS public.wa_campaign_mark_sent(uuid, uuid);
DROP FUNCTION IF EXISTS public.wa_campaign_mark_failed(uuid, uuid, text);

REVOKE ALL ON FUNCTION public.wa_campaign_own_account(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_claim(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_unclaim(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_mark_sent(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_mark_failed(uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_close_cancel_contacts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_own_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_claim(uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_unclaim(uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_mark_sent(uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_mark_failed(uuid, uuid, uuid, uuid, uuid, text) TO authenticated;
