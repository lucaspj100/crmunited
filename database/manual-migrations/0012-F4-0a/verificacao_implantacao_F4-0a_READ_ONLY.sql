-- =====================================================================================
-- verificacao_implantacao_F4-0a_READ_ONLY.sql — fotografia ANTES e DEPOIS da F4-0a
-- SOMENTE LEITURA: catálogos, contagens agregadas e hashes de definições. Não lê nomes,
-- telefones, textos nem nenhuma linha individual de dados comerciais.
-- Executar antes da aplicação (guardar o resultado) e depois (comparar item a item).
-- Coluna "regra": IGUAL = deve ser idêntico antes e depois; MUDA = mudança esperada descrita;
-- INFO = só registro. Se o editor mostrar só a última instrução, este arquivo é UMA instrução.
-- =====================================================================================
WITH
r3 AS (   -- funções usadas pela R3 e guardas existentes: definição deve ficar idêntica
  SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS h, coalesce(p.proacl::text, '-') AS acl
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'wa_campaign_reserve','wa_campaign_release','wa_campaign_list_active','wa_campaign_claim','wa_campaign_unclaim',
    'wa_campaign_mark_sent','wa_campaign_mark_failed','wa_campaign_own_account','wa_campaign_own_active_account',
    'wa_campaign_close_cancel_contacts','wa_campaign_contacts_guard','wa_campaign_contacts_schema_guard',
    'wa_campaign_contacts_truncate_guard','wa_campaigns_delete_guard')
),
newf AS (
  SELECT x.sig, to_regprocedure(x.sig) AS f FROM (VALUES ('public.wa_campaign_assign_owner(uuid,uuid,uuid,text)'),
                                                         ('public.wa_feature_flag_set(text,boolean,text)')) x(sig)
),
has_owner AS (
  SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.whatsapp_campaigns'::regclass
                  AND attname = 'owner_user_id' AND NOT attisdropped) AS yes
),
rows(ordem, item, regra, valor) AS (
  SELECT 1, 'servidor / usuário', 'INFO', current_setting('server_version') || ' / ' || current_user
  UNION ALL SELECT 2, 'momento da fotografia (UTC)', 'INFO', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')

  -- ---------- Funções da R3 e guardas 0010/0011: não podem mudar ----------
  UNION ALL SELECT 10, 'funções R3 + guardas (quantidade)', 'IGUAL', count(*)::text FROM r3
  UNION ALL SELECT 11, 'funções R3 + guardas: hash combinado das definições', 'IGUAL',
                   md5(string_agg(proname || ':' || h, ',' ORDER BY proname)) FROM r3
  UNION ALL SELECT 12, 'funções R3 + guardas: hash combinado das ACLs', 'IGUAL',
                   md5(string_agg(proname || ':' || acl, ',' ORDER BY proname)) FROM r3

  -- ---------- Tabela de campanhas ----------
  UNION ALL SELECT 20, 'ACL de whatsapp_campaigns', 'IGUAL', coalesce(relacl::text, '-') FROM pg_catalog.pg_class WHERE oid = 'public.whatsapp_campaigns'::regclass
  UNION ALL SELECT 21, 'ACL de whatsapp_campaign_contacts', 'IGUAL', coalesce(relacl::text, '-') FROM pg_catalog.pg_class WHERE oid = 'public.whatsapp_campaign_contacts'::regclass
  UNION ALL SELECT 22, 'políticas RLS de whatsapp_campaigns e de contatos (hash)', 'IGUAL',
                   md5(coalesce(string_agg(polname || ':' || coalesce(pg_get_expr(polqual, polrelid), '') || ':' || coalesce(pg_get_expr(polwithcheck, polrelid), ''), ',' ORDER BY polrelid, polname), ''))
            FROM pg_catalog.pg_policy WHERE polrelid IN ('public.whatsapp_campaigns'::regclass, 'public.whatsapp_campaign_contacts'::regclass)
  UNION ALL SELECT 23, 'colunas de whatsapp_campaigns', 'MUDA: + owner_user_id',
                   string_agg(attname, ',' ORDER BY attnum) FROM pg_catalog.pg_attribute
            WHERE attrelid = 'public.whatsapp_campaigns'::regclass AND attnum > 0 AND NOT attisdropped
  UNION ALL SELECT 24, 'colunas de whatsapp_campaign_contacts (guarda 0010 exige 20)', 'IGUAL',
                   count(*)::text FROM pg_catalog.pg_attribute WHERE attrelid = 'public.whatsapp_campaign_contacts'::regclass AND attnum > 0 AND NOT attisdropped
  UNION ALL SELECT 25, 'triggers de whatsapp_campaigns', 'MUDA: + wc_owner_audit_ins, wc_owner_audit_upd, wc_owner_guard',
                   string_agg(tgname || '(' || tgenabled::text || ')', ',' ORDER BY tgname) FROM pg_catalog.pg_trigger
            WHERE tgrelid = 'public.whatsapp_campaigns'::regclass AND NOT tgisinternal
  UNION ALL SELECT 26, 'triggers de whatsapp_campaign_contacts', 'IGUAL',
                   string_agg(tgname || '(' || tgenabled::text || ')', ',' ORDER BY tgname) FROM pg_catalog.pg_trigger
            WHERE tgrelid = 'public.whatsapp_campaign_contacts'::regclass AND NOT tgisinternal

  -- ---------- Dados (só contagens) ----------
  UNION ALL SELECT 30, 'campanhas por status', 'IGUAL', string_agg(status || '=' || n, ',' ORDER BY status)
            FROM (SELECT status, count(*) n FROM public.whatsapp_campaigns GROUP BY status) s
  UNION ALL SELECT 31, 'contatos por status', 'IGUAL', string_agg(status || '=' || n, ',' ORDER BY status)
            FROM (SELECT status, count(*) n FROM public.whatsapp_campaign_contacts GROUP BY status) s
  UNION ALL SELECT 32, 'reservas válidas agora / expiradas', 'IGUAL (salvo envio em curso)',
                   count(*) FILTER (WHERE status = 'reserved' AND reserved_at >= now() - interval '10 minutes') || ' / ' ||
                   count(*) FILTER (WHERE status = 'reserved' AND reserved_at <  now() - interval '10 minutes') FROM public.whatsapp_campaign_contacts
  UNION ALL SELECT 33, 'contatos em sending', 'IGUAL (esperado 0 na janela)', count(*)::text FROM public.whatsapp_campaign_contacts WHERE status = 'sending'
  UNION ALL SELECT 34, 'campanhas com responsável definido', 'MUDA: ausente → 0',
                   CASE WHEN (SELECT yes FROM has_owner) THEN
                     (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM public.whatsapp_campaigns WHERE owner_user_id IS NOT NULL', false, true, '')))[1]::text
                   ELSE 'coluna ausente' END

  -- ---------- Objetos da F4-0a ----------
  UNION ALL SELECT 40, 'interruptor campaign_isolation', 'MUDA: ausente → false',
                   CASE WHEN to_regclass('public.wa_feature_flags') IS NULL THEN 'tabela ausente'
                        ELSE coalesce((xpath('/row/v/text()', query_to_xml('SELECT string_agg(key || ''='' || enabled, '','') AS v FROM public.wa_feature_flags', false, true, '')))[1]::text, 'vazia') END
  UNION ALL SELECT 41, 'eventos de responsável / de interruptor', 'MUDA: ausente → 0 / 0',
                   CASE WHEN to_regclass('public.whatsapp_campaign_owner_events') IS NULL THEN 'tabelas ausentes'
                        ELSE (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM public.whatsapp_campaign_owner_events', false, true, '')))[1]::text || ' / ' ||
                             (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM public.wa_feature_flag_events', false, true, '')))[1]::text END
  UNION ALL SELECT 42, 'EXECUTE nas RPCs novas (PUBLIC/anon/authenticated/service_role/sandbox_exec)', 'MUDA: ausente → não/não/sim/não/não',
                   coalesce(string_agg(
                     CASE WHEN f IS NULL THEN 'ausente' ELSE
                       (CASE WHEN EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN 'sim' ELSE 'não' END) || '/' ||
                       (CASE WHEN to_regrole('anon') IS NOT NULL AND has_function_privilege('anon', f, 'EXECUTE') THEN 'sim' ELSE 'não' END) || '/' ||
                       (CASE WHEN has_function_privilege('authenticated', f, 'EXECUTE') THEN 'sim' ELSE 'não' END) || '/' ||
                       (CASE WHEN to_regrole('service_role') IS NOT NULL AND has_function_privilege('service_role', f, 'EXECUTE') THEN 'sim' ELSE 'não' END) || '/' ||
                       (CASE WHEN to_regrole('sandbox_exec') IS NOT NULL AND has_function_privilege('sandbox_exec', f, 'EXECUTE') THEN 'sim' ELSE 'não' END) END, ' | ' ORDER BY sig), '-')
            FROM newf LEFT JOIN pg_catalog.pg_proc p ON p.oid = newf.f

  -- ---------- Migrations registradas pelo executor do Lovable (Drizzle), para a decisão P2 ----------
  UNION ALL SELECT 50, 'drizzle.__drizzle_migrations (registros / último created_at)', 'IGUAL',
                   CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN 'tabela ausente'
                        ELSE (xpath('/row/v/text()', query_to_xml('SELECT count(*) || '' / '' || coalesce(max(created_at)::text, ''-'') AS v FROM drizzle.__drizzle_migrations', false, true, '')))[1]::text END
)
SELECT ordem, item, regra, valor FROM rows ORDER BY ordem;
