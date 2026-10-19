-- =====================================================================================
-- P19_verificacao_0012_F4-0a_READ_ONLY.sql — o que está instalado é o pacote F4-0a?
-- Compara, item a item, os objetos da F4-0a em produção com a referência obtida aplicando,
-- em PostgreSQL 17 ISOLADO, exatamente:
--   0012_f4_0a_campaign_owner_bloco_unico.sql  SHA-256 ff5e623e42adfa18bd454d68184faa6a81609d781c42efe58d595b1238c6f238
--   rollback/camada1_parar.sql                 SHA-256 6c72dd0072f3b1d811ecee215dfc9c7af147d3e9559a44a8fe299961055d2cce
-- (estado esperado: CAMADA_1, a implantação "dormente" de 19/10/2026).
-- SOMENTE LEITURA: catálogos e a única linha de wa_feature_flags. Não lê dados comerciais.
-- Status: FAIL = diferença em corpo de função, coluna, EXECUTE, privilégio ou valor;
--         REVIEW = diferença em definição reconstituída (trigger, política, restrição, índice),
--         cujo texto pode variar com o search_path da sessão; INFO = só registro.
-- O hash do arquivo prova só qual arquivo é a referência; a prova vem do catálogo.
-- =====================================================================================
WITH
ref(grupo, item, valor) AS (
  VALUES
    ('EXECUTE', 'wa_campaign_assign_owner', '(só o dono)'),
    ('EXECUTE', 'wa_campaigns_owner_audit', '(só o dono)'),
    ('EXECUTE', 'wa_campaigns_owner_guard', '(só o dono)'),
    ('EXECUTE', 'wa_f4_append_only_guard', '(só o dono)'),
    ('EXECUTE', 'wa_f4_privileged_only_guard', '(só o dono)'),
    ('EXECUTE', 'wa_f4_truncate_guard', '(só o dono)'),
    ('EXECUTE', 'wa_feature_flag_set', '(só o dono)'),
    ('coluna', 'wa_feature_flag_events.changed_at', 'timestamp with time zone NOT NULL DEFAULT now()'),
    ('coluna', 'wa_feature_flag_events.changed_by', 'uuid'),
    ('coluna', 'wa_feature_flag_events.id', 'bigint NOT NULL DEFAULT nextval(''wa_feature_flag_events_id_seq''::regclass)'),
    ('coluna', 'wa_feature_flag_events.key', 'text NOT NULL'),
    ('coluna', 'wa_feature_flag_events.new_value', 'boolean NOT NULL'),
    ('coluna', 'wa_feature_flag_events.old_value', 'boolean'),
    ('coluna', 'wa_feature_flag_events.reason', 'text NOT NULL'),
    ('coluna', 'wa_feature_flags.enabled', 'boolean NOT NULL DEFAULT false'),
    ('coluna', 'wa_feature_flags.key', 'text NOT NULL'),
    ('coluna', 'wa_feature_flags.updated_at', 'timestamp with time zone NOT NULL DEFAULT now()'),
    ('coluna', 'wa_feature_flags.updated_by', 'uuid'),
    ('coluna', 'whatsapp_campaign_owner_events.campaign_id', 'uuid NOT NULL'),
    ('coluna', 'whatsapp_campaign_owner_events.changed_at', 'timestamp with time zone NOT NULL DEFAULT now()'),
    ('coluna', 'whatsapp_campaign_owner_events.changed_by', 'uuid'),
    ('coluna', 'whatsapp_campaign_owner_events.id', 'bigint NOT NULL DEFAULT nextval(''whatsapp_campaign_owner_events_id_seq''::regclass)'),
    ('coluna', 'whatsapp_campaign_owner_events.new_owner', 'uuid'),
    ('coluna', 'whatsapp_campaign_owner_events.previous_owner', 'uuid'),
    ('coluna', 'whatsapp_campaign_owner_events.reason', 'text NOT NULL'),
    ('coluna', 'whatsapp_campaign_owner_events.source', 'text NOT NULL'),
    ('coluna', 'whatsapp_campaigns.owner_user_id', 'uuid'),
    ('dado', 'wa_feature_flags', 'campaign_isolation=false'),
    ('função', 'wa_campaign_assign_owner', '2bb78f48b02d72e5d207b0839b1484df def=true cfg={"search_path=public, pg_temp"} args=_campaign_id uuid, _new_owner uuid, _expected_current_owner uuid, _reason text ret=jsonb lang=plpgsql'),
    ('função', 'wa_campaigns_owner_audit', '33abd57dea8f5d1c257b47ceeec89ba0 def=false cfg={"search_path=public, pg_temp"} args= ret=trigger lang=plpgsql'),
    ('função', 'wa_campaigns_owner_guard', '375cf95346aa2b9f3216ce37a178a1b1 def=false cfg={"search_path=public, pg_temp"} args= ret=trigger lang=plpgsql'),
    ('função', 'wa_f4_append_only_guard', 'bb3eed32bf885e6c63cc0e8da9b382d2 def=false cfg={"search_path=public, pg_temp"} args= ret=trigger lang=plpgsql'),
    ('função', 'wa_f4_privileged_only_guard', '9a23f5630dbea1da3e2e3bde86ff6867 def=false cfg={"search_path=public, pg_temp"} args= ret=trigger lang=plpgsql'),
    ('função', 'wa_f4_truncate_guard', '89c89a76d6e2f0ea25e3b82004c3c8b8 def=false cfg={"search_path=public, pg_temp"} args= ret=trigger lang=plpgsql'),
    ('função', 'wa_feature_flag_set', 'c780e543d51aadeb024307b4fc458e60 def=true cfg={"search_path=public, pg_temp"} args=_key text, _enabled boolean, _reason text ret=jsonb lang=plpgsql'),
    ('política', 'wa_feature_flag_events.wffe_select', 'b5acd39366bfb8fbedb5fe4689b99f30'),
    ('política', 'wa_feature_flags.wff_select', 'b5acd39366bfb8fbedb5fe4689b99f30'),
    ('política', 'whatsapp_campaign_owner_events.wcoe_select', '75c8408e10b1abddb68ee10c75da1514'),
    ('privilégios', 'wa_feature_flag_events', 'authenticated:SELECT rls=true'),
    ('privilégios', 'wa_feature_flag_events_id_seq', '(só o dono) rls=false'),
    ('privilégios', 'wa_feature_flags', 'authenticated:SELECT rls=true'),
    ('privilégios', 'whatsapp_campaign_owner_events', 'authenticated:SELECT rls=true'),
    ('privilégios', 'whatsapp_campaign_owner_events_id_seq', '(só o dono) rls=false'),
    ('restrição', 'wa_feature_flag_events.wa_feature_flag_events_pkey', '4c6419b3704337bbfe50f018842a9ad3'),
    ('restrição', 'wa_feature_flag_events.wa_feature_flag_events_reason_check', '32d34fb980d74ffd375d5499d6fab3fb'),
    ('restrição', 'wa_feature_flags.wa_feature_flags_key_check', 'a993c80dccbdb95e68267b38986d75d5'),
    ('restrição', 'wa_feature_flags.wa_feature_flags_pkey', '729d3ed6c85722f863da384d2313331e'),
    ('restrição', 'whatsapp_campaign_owner_events.whatsapp_campaign_owner_events_p', '4c6419b3704337bbfe50f018842a9ad3'),
    ('restrição', 'whatsapp_campaign_owner_events.whatsapp_campaign_owner_events_r', '32d34fb980d74ffd375d5499d6fab3fb'),
    ('restrição', 'whatsapp_campaign_owner_events.whatsapp_campaign_owner_events_s', '39eed576e410fc995e4b77c92b16b35a'),
    ('restrição', 'whatsapp_campaigns.whatsapp_campaigns_owner_user_id_fkey', 'd0eb2d4314e37b4e83a46a1d97595c9d'),
    ('trigger', 'wa_feature_flag_events.wffe_append_only', '041f6f7ce8b92d6fbbbe1a75baaab26b enabled=O'),
    ('trigger', 'wa_feature_flag_events.wffe_truncate', 'e6ce84afcc47cfd19b975b0d39cf88a8 enabled=O'),
    ('trigger', 'wa_feature_flags.wff_privileged_only', '04f401f24dbbeae52a9200538898ef24 enabled=O'),
    ('trigger', 'wa_feature_flags.wff_truncate', 'df82f86bbc980160ab9961b543e52ca7 enabled=O'),
    ('trigger', 'whatsapp_campaign_owner_events.wcoe_append_only', '77192606bf5f15492e679dc9f5169564 enabled=O'),
    ('trigger', 'whatsapp_campaign_owner_events.wcoe_truncate', 'c9ef9d62a5e2ca81b93bf93e5dd5f4d5 enabled=O'),
    ('trigger', 'whatsapp_campaigns.wc_owner_audit_ins', 'a6129dbf69d94c0624776a457f45a77b enabled=O'),
    ('trigger', 'whatsapp_campaigns.wc_owner_audit_upd', '05c38090b2cb05c119773ba5fd22c868 enabled=O'),
    ('trigger', 'whatsapp_campaigns.wc_owner_guard', '92fcfc4cd98ddf8a81155fe823ef872b enabled=O'),
    ('índice', 'wa_feature_flag_events_pkey', 'ef3710b70a736fa85f80a5987bb461c1'),
    ('índice', 'wa_feature_flags_pkey', 'd9ea7f1275e06843e2f1b31abf8dd975'),
    ('índice', 'wcoe_campaign_idx', 'f4041731855843856ddd88c1e8eb8389'),
    ('índice', 'whatsapp_campaign_owner_events_pkey', 'c805b2d8617e3fd20b86f4d3327e1165'),
    ('índice', 'whatsapp_campaigns_owner_status_idx', 'ef7a0046a7f01dc06ed7f5a052969444')
),
fp(grupo, item, valor) AS (
  SELECT 'função', p.proname, md5(p.prosrc) || ' def=' || p.prosecdef || ' cfg=' || coalesce(p.proconfig::text,'-') || ' args=' || pg_get_function_identity_arguments(p.oid) || ' ret=' || p.prorettype::regtype::text || ' lang=' || l.lanname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname IN ('wa_campaign_assign_owner','wa_feature_flag_set','wa_campaigns_owner_guard','wa_campaigns_owner_audit','wa_f4_append_only_guard','wa_f4_privileged_only_guard','wa_f4_truncate_guard')
  UNION ALL
  SELECT 'EXECUTE', p.proname, coalesce((SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, ',' ORDER BY 1)
                                FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner), '(só o dono)')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('wa_campaign_assign_owner','wa_feature_flag_set','wa_campaigns_owner_guard','wa_campaigns_owner_audit','wa_f4_append_only_guard','wa_f4_privileged_only_guard','wa_f4_truncate_guard')
  UNION ALL
  SELECT 'trigger', c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid)) || ' enabled=' || t.tgenabled::text
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND t.tgname ~ '^(wc_owner_|wcoe_|wffe_|wff_)'
  UNION ALL
  SELECT 'política', c.relname || '.' || po.polname, md5(coalesce(pg_get_expr(po.polqual, po.polrelid), '') || '|' || po.polcmd::text || '|' || array_to_string(ARRAY(SELECT CASE WHEN r = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(po.polroles) r ORDER BY 1), ','))
    FROM pg_policy po JOIN pg_class c ON c.oid = po.polrelid WHERE po.polname IN ('wcoe_select','wff_select','wffe_select')
  UNION ALL
  SELECT 'coluna', c.relname || '.' || a.attname, format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped
     AND (c.relname IN ('whatsapp_campaign_owner_events','wa_feature_flags','wa_feature_flag_events') OR (c.relname = 'whatsapp_campaigns' AND a.attname = 'owner_user_id'))
  UNION ALL
  SELECT 'restrição', c.relname || '.' || co.conname, md5(pg_get_constraintdef(co.oid))
    FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid
   WHERE c.relnamespace = 'public'::regnamespace AND (c.relname IN ('whatsapp_campaign_owner_events','wa_feature_flags','wa_feature_flag_events')
          OR (c.relname = 'whatsapp_campaigns' AND co.contype = 'f' AND co.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.oid AND attname = 'owner_user_id')]::int2[]))
  UNION ALL
  SELECT 'índice', i.relname, md5(pg_get_indexdef(i.oid))
    FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid
   WHERE t.relnamespace = 'public'::regnamespace AND (t.relname IN ('whatsapp_campaign_owner_events','wa_feature_flags','wa_feature_flag_events') OR i.relname = 'whatsapp_campaigns_owner_status_idx')
  UNION ALL
  SELECT 'privilégios', c.relname, coalesce((SELECT string_agg(g || ':' || ps, ';' ORDER BY g) FROM (
            SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS g, string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS ps
              FROM aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::"char", c.relowner))) a
             WHERE a.grantee <> c.relowner AND pg_get_userbyid(a.grantee) <> 'sandbox_exec' GROUP BY 1) s), '(só o dono)') || ' rls=' || c.relrowsecurity
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('whatsapp_campaign_owner_events','wa_feature_flags','wa_feature_flag_events','whatsapp_campaign_owner_events_id_seq','wa_feature_flag_events_id_seq')
  UNION ALL
  SELECT 'dado', 'wa_feature_flags', CASE WHEN to_regclass('public.wa_feature_flags') IS NULL THEN NULL ELSE
           coalesce((xpath('/row/v/text()', query_to_xml('SELECT string_agg(key || ''='' || enabled, '','' ORDER BY key) AS v FROM public.wa_feature_flags', false, true, '')))[1]::text, 'vazia') END
   WHERE to_regclass('public.wa_feature_flags') IS NOT NULL
),
cmp AS (
  SELECT coalesce(r.grupo, f.grupo) AS grupo, coalesce(r.item, f.item) AS item, r.valor AS esperado, f.valor AS encontrado,
         CASE WHEN r.item IS NULL THEN 'REVIEW'
              WHEN f.item IS NULL THEN 'FAIL'
              WHEN r.valor = f.valor THEN 'PASS'
              WHEN coalesce(r.grupo, f.grupo) IN ('trigger', 'política', 'restrição', 'índice') THEN 'REVIEW'
              ELSE 'FAIL' END AS status,
         CASE WHEN r.item IS NULL THEN 'objeto a mais, fora da referência'
              WHEN f.item IS NULL THEN 'objeto ausente'
              WHEN r.valor = f.valor THEN NULL
              ELSE 'diferente da referência' END AS observacao
  FROM ref r FULL JOIN fp f ON f.grupo = r.grupo AND f.item = r.item
),
extra(grupo, item, esperado, encontrado, status, observacao) AS (
  SELECT 'contexto', 'sandbox_exec nas tabelas novas (privilégio padrão; aceito em D6)', 'SELECT, INSERT (sem escrita possível: guarda)',
         coalesce((SELECT string_agg(c.relname || ':' || (SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) FROM aclexplode(c.relacl) a WHERE pg_get_userbyid(a.grantee) = 'sandbox_exec'), '; ' ORDER BY c.relname)
                     FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('whatsapp_campaign_owner_events','wa_feature_flags','wa_feature_flag_events')), '-'),
         'INFO', NULL
  UNION ALL SELECT 'contexto', 'servidor', '-', current_setting('server_version') || ' / search_path=' || current_setting('search_path'), 'INFO', NULL
)
SELECT ordem, grupo, item, status, esperado, encontrado, observacao FROM (
  SELECT 0 AS ordem, 'RESULTADO GERAL' AS grupo, 'P19 — 0012-F4-0a (+ camada 1) instalada = pacote' AS item,
         CASE WHEN bool_or(status = 'FAIL') THEN 'FAIL' WHEN bool_or(status = 'REVIEW') THEN 'REVIEW' ELSE 'PASS' END AS status,
         '65 itens de referência' AS esperado,
         count(*) FILTER (WHERE status = 'PASS') || ' PASS / ' || count(*) FILTER (WHERE status = 'FAIL') || ' FAIL / ' || count(*) FILTER (WHERE status = 'REVIEW') || ' REVIEW' AS encontrado,
         NULL AS observacao
  FROM cmp
  UNION ALL SELECT 1, grupo, item, status, esperado, encontrado, observacao FROM cmp
  UNION ALL SELECT 2, grupo, item, status, esperado, encontrado, observacao FROM extra
) z
ORDER BY ordem, CASE status WHEN 'FAIL' THEN 0 WHEN 'REVIEW' THEN 1 ELSE 2 END, grupo, item;
