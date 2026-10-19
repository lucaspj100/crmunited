-- =====================================================================================
-- F4-0a rollback CAMADA 4 — REMOÇÃO TOTAL, INCLUSIVE DA AUDITORIA (DESTRUTIVA)
-- (PROPOSTA — NÃO APLICADA)
-- Remove: tudo o que a F4-0a criou, inclusive os dados de auditoria e de interruptor.
-- Preserva: nada da F4-0a. Contatos, campanhas (sem a coluna), 0010, 0011 e RPCs anteriores
--           ficam intactos.
-- Só com autorização expressa e DEPOIS de exportar whatsapp_campaign_owner_events e
-- wa_feature_flag_events. Para habilitar, trocar _confirmo para true NESTE arquivo.
-- Exige o estado CAMADA_3 (coluna já removida pela camada 3).
-- Estado esperado depois: AUSENTE. Atômica e idempotente. Não restaura privilégios.
-- =====================================================================================
DO $f4_rb4$
DECLARE _confirmo constant boolean := false;   -- trocar para true só com autorização expressa
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF NOT _confirmo THEN
    RAISE EXCEPTION 'F4-0a camada 4: não confirmada (_confirmo = false); nada foi removido';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.whatsapp_campaigns'::regclass
              AND attname = 'owner_user_id' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'F4-0a camada 4: a coluna owner_user_id ainda existe; aplicar a camada 3 antes';
  END IF;
  DROP TABLE IF EXISTS public.whatsapp_campaign_owner_events;
  DROP TABLE IF EXISTS public.wa_feature_flag_events;
  DROP TABLE IF EXISTS public.wa_feature_flags;
  DROP FUNCTION IF EXISTS public.wa_f4_append_only_guard();
  DROP FUNCTION IF EXISTS public.wa_f4_privileged_only_guard();
  DROP FUNCTION IF EXISTS public.wa_f4_truncate_guard();
END $f4_rb4$;
