-- =====================================================================================
-- F4-0a rollback CAMADA 2 — REMOVER AS RPCs, MANTENDO A COLUNA PROTEGIDA (PROPOSTA — NÃO APLICADA)
-- Remove:   wa_campaign_assign_owner e wa_feature_flag_set (inclui o efeito da camada 1).
-- Preserva: coluna owner_user_id e seus valores; guarda wc_owner_guard (ninguém além de
--           manutenção privilegiada altera a coluna); auditoria wc_owner_audit_upd/_ins (toda
--           alteração privilegiada continua registrada); tabelas de auditoria e de interruptor
--           com suas guardas, RLS e dados.
-- Por que a guarda e a auditoria FICAM (correção de 18/10/2026): sem elas, admin/franqueado
-- (RLS FOR ALL) e service_role (BYPASSRLS) alteravam owner_user_id diretamente e sem evento.
-- Comportamento do CRM: igual ao anterior à F4-0a (a coluna existe, mas nada a usa e ninguém
-- consegue alterá-la sem passar por manutenção auditada).
-- Estado esperado depois: CAMADA_2. Atômica e idempotente. Não restaura privilégios.
-- =====================================================================================
DO $f4_rb2$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Pré-condição: a proteção da coluna precisa existir; caso contrário, o estado é parcial
  -- e este rollback não deve prosseguir (rodar estado_f4_0a_READ_ONLY.sql e analisar).
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.whatsapp_campaigns'::regclass
              AND attname = 'owner_user_id' AND NOT attisdropped)
     AND (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.whatsapp_campaigns'::regclass
           AND tgname IN ('wc_owner_guard', 'wc_owner_audit_upd', 'wc_owner_audit_ins') AND tgenabled = 'O') <> 3 THEN
    RAISE EXCEPTION 'F4-0a camada 2: coluna owner_user_id sem guarda/auditoria completas; estado PARCIAL, abortado sem mudanças';
  END IF;
  DROP FUNCTION IF EXISTS public.wa_campaign_assign_owner(uuid, uuid, uuid, text);
  DROP FUNCTION IF EXISTS public.wa_feature_flag_set(text, boolean, text);
END $f4_rb2$;
