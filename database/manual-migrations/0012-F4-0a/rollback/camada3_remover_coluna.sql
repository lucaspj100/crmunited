-- =====================================================================================
-- F4-0a rollback CAMADA 3 — REMOVER A COLUNA E A LÓGICA, PRESERVANDO A AUDITORIA
-- (PROPOSTA — NÃO APLICADA)
-- Remove (numa única transação, sem janela em que a coluna exista sem guarda):
--   * RPCs (se ainda existirem);
--   * os responsáveis atuais — antes de remover a coluna, cada valor não nulo é limpo por
--     manutenção privilegiada, o que grava um evento com previous_owner (o histórico do
--     responsável fica na auditoria, não se perde);
--   * triggers wc_owner_guard, wc_owner_audit_upd, wc_owner_audit_ins e suas funções;
--   * índice whatsapp_campaigns_owner_status_idx e a coluna owner_user_id.
-- Ajusta: a política wcoe_select (leitura da auditoria) dependia da coluna para mostrar ao
--         vendedor os eventos das próprias campanhas; ela é recriada só para admin, porque sem
--         a coluna não há como saber de quem é a campanha. Reaplicar a migration restaura a
--         versão completa. (Defeito encontrado no teste de 18/10/2026: sem este ajuste o
--         DROP COLUMN falhava — e, por ser atômica, a camada não deixava nada pela metade.)
-- Preserva: whatsapp_campaign_owner_events, wa_feature_flags, wa_feature_flag_events, com
--           guardas (somente inclusão), RLS (leitura só admin) e todos os dados.
-- Estado esperado depois: CAMADA_3. Atômica e idempotente. Não restaura privilégios.
-- =====================================================================================
DO $f4_rb3$
DECLARE _n integer := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  DROP FUNCTION IF EXISTS public.wa_campaign_assign_owner(uuid, uuid, uuid, text);
  DROP FUNCTION IF EXISTS public.wa_feature_flag_set(text, boolean, text);
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.whatsapp_campaigns'::regclass
              AND attname = 'owner_user_id' AND NOT attisdropped) THEN
    IF to_regclass('public.whatsapp_campaign_owner_events') IS NULL
       OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.whatsapp_campaigns'::regclass
            AND tgname = 'wc_owner_audit_upd' AND tgenabled = 'O') <> 1 THEN
      RAISE EXCEPTION 'F4-0a camada 3: auditoria ausente; os responsáveis não seriam registrados; abortado sem mudanças';
    END IF;
    PERFORM set_config('united.owner_change_source', 'privileged_other', true);
    PERFORM set_config('united.owner_change_reason', 'rollback F4-0a camada 3: responsável removido antes de excluir a coluna', true);
    EXECUTE 'UPDATE public.whatsapp_campaigns SET owner_user_id = NULL WHERE owner_user_id IS NOT NULL';
    GET DIAGNOSTICS _n = ROW_COUNT;
    PERFORM set_config('united.owner_change_source', '', true);
    PERFORM set_config('united.owner_change_reason', '', true);
    RAISE NOTICE 'F4-0a camada 3: % responsável(is) registrado(s) na auditoria e removido(s)', _n;
  END IF;
  DROP TRIGGER IF EXISTS wc_owner_guard     ON public.whatsapp_campaigns;
  DROP TRIGGER IF EXISTS wc_owner_audit_upd ON public.whatsapp_campaigns;
  DROP TRIGGER IF EXISTS wc_owner_audit_ins ON public.whatsapp_campaigns;
  DROP FUNCTION IF EXISTS public.wa_campaigns_owner_guard();
  DROP FUNCTION IF EXISTS public.wa_campaigns_owner_audit();
  IF to_regclass('public.whatsapp_campaign_owner_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS wcoe_select ON public.whatsapp_campaign_owner_events;
    CREATE POLICY wcoe_select ON public.whatsapp_campaign_owner_events FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  DROP INDEX IF EXISTS public.whatsapp_campaigns_owner_status_idx;
  ALTER TABLE public.whatsapp_campaigns DROP COLUMN IF EXISTS owner_user_id;
END $f4_rb3$;
