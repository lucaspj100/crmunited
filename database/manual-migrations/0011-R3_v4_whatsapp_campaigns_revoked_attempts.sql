-- 0011-R3 v4 (PROPOSTA — NÃO APLICADA): impede que um attemptId revogado por
-- unclaim volte a obter posse do contato (claim atrasado / replay).
--
-- Invariantes adicionais:
-- - Todo unclaim feito pelo dono da conta registra (contato, attemptId) como revogado,
--   inclusive quando chega ANTES do primeiro claim.
-- - claim de um attemptId revogado retorna 'attempt_revoked' e não muda nada.
-- - Outro attemptId (nova tentativa legítima) continua permitido.
-- - sent/failed não mudam: só aceitam 'sending' da mesma tentativa, que um
--   attemptId revogado nunca mais consegue obter.
-- - Não toca nas funções/triggers de proteção da 0010.

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_revoked_attempts (
  contact_id uuid NOT NULL REFERENCES public.whatsapp_campaign_contacts(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  whatsapp_account_id uuid,
  reservation_id uuid,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, attempt_id)
);

COMMENT ON TABLE public.whatsapp_campaign_revoked_attempts IS
  'R3: attemptIds revogados por unclaim. Lido/escrito somente pelas funções SECURITY DEFINER de claim/unclaim.';

-- Somente as funções (dono: postgres) acessam. Sem acesso direto pela API.
REVOKE ALL ON public.whatsapp_campaign_revoked_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_campaign_revoked_attempts TO service_role;
ALTER TABLE public.whatsapp_campaign_revoked_attempts ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy de propósito: RLS fechado para anon/authenticated.

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

  SELECT status INTO _cs FROM public.whatsapp_campaigns WHERE id = _campaign_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found'); END IF;

  -- O lock do contato serializa claim x unclaim do mesmo contato.
  SELECT * INTO r FROM public.whatsapp_campaign_contacts
   WHERE id = _contact_id AND campaign_id = _campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'contact_not_found'); END IF;

  -- R3: verificado com o contato travado, antes de qualquer outra transição.
  IF _attempt_id IS NULL OR EXISTS (
       SELECT 1 FROM public.whatsapp_campaign_revoked_attempts
        WHERE contact_id = _contact_id AND attempt_id = _attempt_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attempt_revoked');
  END IF;

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

CREATE OR REPLACE FUNCTION public.wa_campaign_unclaim(
  _contact_id uuid, _campaign_id uuid, _account_id uuid, _reservation_id uuid, _attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.whatsapp_campaign_contacts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.wa_campaign_own_account(_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_allowed');
  END IF;
  IF _attempt_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'attempt_mismatch'); END IF;

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
    INSERT INTO public.whatsapp_campaign_revoked_attempts
      (contact_id, attempt_id, campaign_id, whatsapp_account_id, reservation_id)
    VALUES (_contact_id, _attempt_id, _campaign_id, _account_id, _reservation_id)
    ON CONFLICT DO NOTHING;
    UPDATE public.whatsapp_campaign_contacts
       SET status = 'reserved', sending_at = NULL, send_attempt_id = NULL
     WHERE id = _contact_id;
    RETURN jsonb_build_object('ok', true, 'already', false);
  END IF;

  -- R3 (v3): só revoga se a chamada detém a posse atual do contato
  -- (mesma conta E mesma reserva). Sem isso, outra conta/usuário que adivinhasse
  -- o attemptId poderia revogá-lo e bloquear o envio legítimo.
  IF r.whatsapp_account_id IS DISTINCT FROM _account_id
     OR r.reservation_id IS DISTINCT FROM _reservation_id THEN
    IF r.status IN ('reserved', 'sending') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'attempt_mismatch');
    END IF;
    -- pending/cancelled/sent/failed sem posse: nada a desfazer, nada registrado (contrato da 0008).
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- R3 (v4): sem posse ativa (pending/sent/failed/cancelled) não há o que proteger:
  -- responde ok/already sem registrar revogação.
  IF r.status NOT IN ('reserved', 'sending') THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- Unclaim antecipado legítimo (reserved, ou sending de OUTRA tentativa, com conta e
  -- reserva da posse atual): nada a desfazer agora, mas a tentativa fica revogada.
  INSERT INTO public.whatsapp_campaign_revoked_attempts
    (contact_id, attempt_id, campaign_id, whatsapp_account_id, reservation_id)
  VALUES (_contact_id, _attempt_id, _campaign_id, _account_id, _reservation_id)
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'already', true);
END $$;

REVOKE ALL ON FUNCTION public.wa_campaign_claim(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_unclaim(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_campaign_claim(uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_campaign_unclaim(uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;
