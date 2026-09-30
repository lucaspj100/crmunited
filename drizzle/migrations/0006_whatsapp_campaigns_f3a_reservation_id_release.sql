-- F3-A: identificação do lote reservado (reservation_id), release voluntário
-- e listagem controlada de campanhas ativas para a extensão.
--
-- Por que reservation_id: duas reservas do MESMO contato pela MESMA conta
-- (lote expira → contato volta a pending → a mesma conta o reserva de novo)
-- são indistinguíveis por (contato, conta). Sem um ID do lote, o release de
-- um lote antigo poderia liberar uma reserva nova. Na F3-B, o mesmo ID será
-- exigido pelo claim reserved -> sending.

ALTER TABLE public.whatsapp_campaign_contacts
  ADD COLUMN IF NOT EXISTS reservation_id uuid;

COMMENT ON COLUMN public.whatsapp_campaign_contacts.reservation_id IS
  'Lote da reserva atual (um UUID por chamada de wa_campaign_reserve). NULL quando não reservado. Mantido em sent/failed como histórico.';

CREATE INDEX IF NOT EXISTS wcc_reservation_idx
  ON public.whatsapp_campaign_contacts (reservation_id) WHERE status = 'reserved';

-- Reserve (F2) com reservation_id. Mesma assinatura; resposta ganha reservationId
-- (NULL quando nenhum contato foi reservado).
CREATE OR REPLACE FUNCTION public.wa_campaign_reserve(_campaign_id uuid, _account_id uuid, _limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _status text;
  _lim integer := greatest(1, least(50, coalesce(_limit, 20)));
  _rid uuid := gen_random_uuid();
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

  -- Libera reservas expiradas (10 min) desta campanha, sob demanda (inclui reservation_id).
  UPDATE public.whatsapp_campaign_contacts
     SET status = 'pending', whatsapp_account_id = NULL, reserved_at = NULL,
         reservation_id = NULL, attempts = attempts + 1
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
       SET status = 'reserved', whatsapp_account_id = _account_id, reserved_at = now(),
           reservation_id = _rid
      FROM picked WHERE c.id = picked.id
    RETURNING c.id, c.name, c.phone, c.company, c.created_at
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'company', company)
                            ORDER BY created_at, id), '[]'::jsonb)
    INTO _result FROM upd;

  RETURN jsonb_build_object(
    'ok', true,
    'reservationId', CASE WHEN jsonb_array_length(_result) > 0 THEN _rid ELSE NULL END,
    'contacts', _result);
END $$;

-- Release voluntário de UM lote: só linhas reserved da mesma campanha, conta
-- e reservation_id. Não incrementa attempts. Idempotente (released = 0).
-- Não exige campanha ativa (lote de campanha pausada pode ser devolvido;
-- em campanha encerrada os contatos já estão cancelled → released = 0).
CREATE OR REPLACE FUNCTION public.wa_campaign_release(_campaign_id uuid, _account_id uuid, _reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.wa_campaign_own_active_account(_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_allowed');
  END IF;
  PERFORM 1 FROM public.whatsapp_campaigns WHERE id = _campaign_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found'); END IF;

  UPDATE public.whatsapp_campaign_contacts
     SET status = 'pending', whatsapp_account_id = NULL, reserved_at = NULL, reservation_id = NULL
   WHERE campaign_id = _campaign_id
     AND whatsapp_account_id = _account_id
     AND reservation_id = _reservation_id
     AND status = 'reserved';
  GET DIAGNOSTICS _n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'released', _n);
END $$;

-- Listagem controlada para qualquer usuário autenticado (vendedor incluso),
-- sem liberar leitura direta das tabelas: só campanhas ACTIVE e só
-- id, name, status, pendingCount.
CREATE OR REPLACE FUNCTION public.wa_campaign_list_active()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  RETURN jsonb_build_object('ok', true, 'campaigns', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', c.id, 'name', c.name, 'status', c.status,
             'pendingCount', (SELECT count(*) FROM public.whatsapp_campaign_contacts x
                               WHERE x.campaign_id = c.id AND x.status = 'pending'))
           ORDER BY c.created_at DESC, c.id)
      FROM public.whatsapp_campaigns c
     WHERE c.status = 'active'), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.wa_campaign_release(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_campaign_list_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_campaign_release(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_list_active() TO authenticated;