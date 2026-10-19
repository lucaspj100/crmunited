-- =====================================================================================
-- estado_f4_0a_READ_ONLY.sql — classifica o estado da F4-0a no banco (SOMENTE LEITURA)
-- Resultado (linha 0): AUSENTE | COMPLETA | CAMADA_1 | CAMADA_2 | CAMADA_3 | PARCIAL.
-- PARCIAL = combinação que nenhuma aplicação ou camada de rollback completa produz.
-- Só consulta catálogos; não lê linhas de tabelas comerciais (só conta eventos de auditoria).
-- =====================================================================================
WITH obj(grupo, nome, presente) AS (
  VALUES
  ('rpc',      'função wa_campaign_assign_owner',       to_regprocedure('public.wa_campaign_assign_owner(uuid,uuid,uuid,text)') IS NOT NULL),
  ('rpc',      'função wa_feature_flag_set',            to_regprocedure('public.wa_feature_flag_set(text,boolean,text)') IS NOT NULL),
  ('owner',    'coluna whatsapp_campaigns.owner_user_id', EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = to_regclass('public.whatsapp_campaigns') AND attname = 'owner_user_id' AND NOT attisdropped)),
  ('owner',    'índice whatsapp_campaigns_owner_status_idx', to_regclass('public.whatsapp_campaigns_owner_status_idx') IS NOT NULL),
  ('owner',    'função wa_campaigns_owner_guard',       to_regprocedure('public.wa_campaigns_owner_guard()') IS NOT NULL),
  ('owner',    'função wa_campaigns_owner_audit',       to_regprocedure('public.wa_campaigns_owner_audit()') IS NOT NULL),
  ('owner',    'trigger wc_owner_guard',                EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'wc_owner_guard' AND tgrelid = to_regclass('public.whatsapp_campaigns') AND tgenabled = 'O')),
  ('owner',    'trigger wc_owner_audit_upd',            EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'wc_owner_audit_upd' AND tgrelid = to_regclass('public.whatsapp_campaigns') AND tgenabled = 'O')),
  ('owner',    'trigger wc_owner_audit_ins',            EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'wc_owner_audit_ins' AND tgrelid = to_regclass('public.whatsapp_campaigns') AND tgenabled = 'O')),
  ('auditoria','tabela whatsapp_campaign_owner_events',  to_regclass('public.whatsapp_campaign_owner_events') IS NOT NULL),
  ('auditoria','tabela wa_feature_flags',               to_regclass('public.wa_feature_flags') IS NOT NULL),
  ('auditoria','tabela wa_feature_flag_events',         to_regclass('public.wa_feature_flag_events') IS NOT NULL),
  ('auditoria','função wa_f4_append_only_guard',        to_regprocedure('public.wa_f4_append_only_guard()') IS NOT NULL),
  ('auditoria','função wa_f4_privileged_only_guard',    to_regprocedure('public.wa_f4_privileged_only_guard()') IS NOT NULL),
  ('auditoria','função wa_f4_truncate_guard',           to_regprocedure('public.wa_f4_truncate_guard()') IS NOT NULL),
  ('auditoria','triggers de guarda das 3 tabelas (6)',  (SELECT count(*) = 6 FROM pg_catalog.pg_trigger WHERE tgenabled = 'O' AND tgname IN ('wcoe_append_only','wcoe_truncate','wffe_append_only','wffe_truncate','wff_privileged_only','wff_truncate'))),
  ('auditoria','políticas RLS de leitura (3)',          (SELECT count(*) = 3 FROM pg_catalog.pg_policy WHERE polname IN ('wcoe_select','wff_select','wffe_select'))),
  ('auditoria','RLS habilitado nas 3 tabelas',          (SELECT count(*) = 3 FROM pg_catalog.pg_class WHERE relrowsecurity AND oid IN (to_regclass('public.whatsapp_campaign_owner_events'), to_regclass('public.wa_feature_flags'), to_regclass('public.wa_feature_flag_events'))))
),
exec AS (
  SELECT coalesce(bool_and(has_function_privilege('authenticated', f, 'EXECUTE')), false) AS auth_exec,
         count(f) AS n
  FROM (SELECT to_regprocedure('public.wa_campaign_assign_owner(uuid,uuid,uuid,text)') AS f
        UNION ALL SELECT to_regprocedure('public.wa_feature_flag_set(text,boolean,text)')) x
  WHERE f IS NOT NULL
),
g AS (
  SELECT grupo, count(*) FILTER (WHERE presente) AS sim, count(*) AS total FROM obj GROUP BY grupo
),
cls AS (
  SELECT
    (SELECT sim FROM g WHERE grupo = 'rpc') AS rpc, (SELECT total FROM g WHERE grupo = 'rpc') AS rpc_t,
    (SELECT sim FROM g WHERE grupo = 'owner') AS own, (SELECT total FROM g WHERE grupo = 'owner') AS own_t,
    (SELECT sim FROM g WHERE grupo = 'auditoria') AS aud, (SELECT total FROM g WHERE grupo = 'auditoria') AS aud_t,
    (SELECT auth_exec FROM exec) AS auth_exec
),
estado AS (
  SELECT CASE
    WHEN rpc = 0 AND own = 0 AND aud = 0 THEN 'AUSENTE'
    WHEN rpc = rpc_t AND own = own_t AND aud = aud_t AND auth_exec THEN 'COMPLETA'
    WHEN rpc = rpc_t AND own = own_t AND aud = aud_t AND NOT auth_exec THEN 'CAMADA_1'
    WHEN rpc = 0 AND own = own_t AND aud = aud_t THEN 'CAMADA_2'
    WHEN rpc = 0 AND own = 0 AND aud = aud_t THEN 'CAMADA_3'
    ELSE 'PARCIAL' END AS e,
    rpc || '/' || rpc_t || ' RPC, ' || own || '/' || own_t || ' responsável, ' || aud || '/' || aud_t || ' auditoria, EXECUTE authenticated=' || auth_exec AS resumo
  FROM cls
)
SELECT 0 AS ordem, 'ESTADO F4-0a' AS grupo, e AS objeto, resumo AS detalhe FROM estado
UNION ALL
SELECT 1, 'eventos de auditoria (contagem)', 'whatsapp_campaign_owner_events / wa_feature_flag_events',
       CASE WHEN to_regclass('public.whatsapp_campaign_owner_events') IS NULL THEN 'tabelas ausentes'
            ELSE (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM public.whatsapp_campaign_owner_events', false, true, '')))[1]::text
                 || ' / ' || (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM public.wa_feature_flag_events', false, true, '')))[1]::text END
UNION ALL
SELECT 10 + row_number() OVER (ORDER BY grupo, nome), grupo, nome, CASE WHEN presente THEN 'presente' ELSE 'ausente' END FROM obj
ORDER BY 1;
