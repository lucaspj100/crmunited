-- =====================================================================================
-- F4-0a rollback CAMADA 1 — PARAR (PROPOSTA — NÃO APLICADA)
-- Remove:   o EXECUTE de authenticated nas duas RPCs (ninguém atribui responsável nem
--           mexe no interruptor).
-- Preserva: tudo — coluna, valores de responsável, guarda da coluna, auditoria, interruptor,
--           dados de auditoria, RLS e privilégios das tabelas.
-- Coluna owner_user_id: continua protegida (guarda) e auditada.
-- Estado esperado depois (estado_f4_0a_READ_ONLY.sql): CAMADA_1.
-- Atômica (um único DO) e idempotente. Não restaura nenhum privilégio.
-- =====================================================================================
DO $f4_rb1$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regprocedure('public.wa_campaign_assign_owner(uuid,uuid,uuid,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.wa_campaign_assign_owner(uuid, uuid, uuid, text) FROM authenticated;
  END IF;
  IF to_regprocedure('public.wa_feature_flag_set(text,boolean,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.wa_feature_flag_set(text, boolean, text) FROM authenticated;
  END IF;
END $f4_rb1$;
