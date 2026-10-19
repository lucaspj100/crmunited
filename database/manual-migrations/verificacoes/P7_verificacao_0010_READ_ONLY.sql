-- =====================================================================================
-- P7_verificacao_0010_READ_ONLY.sql
-- CRM United — F4-A, pendência P7
-- Objetivo: confirmar que a migration 0010 (F3-B.3a, guarda de estado) instalada no banco
-- corresponde ao SQL de referência: 4 funções, 5 triggers, privilégios revogados e
-- compatibilidade com as RPCs wa_campaign_* atuais.
--
-- SOMENTE LEITURA. Só SELECT sobre catálogos (pg_proc, pg_trigger, pg_class, pg_attribute,
-- pg_namespace) e funções de introspecção (pg_get_functiondef, pg_get_triggerdef,
-- has_*_privilege, pg_has_role, aclexplode). Não chama nenhuma função de negócio nem as
-- funções de guarda. Não lê nenhuma linha de tabela comercial.
--
-- Referência embutida em base64: corpos das 4 funções extraídos de
--   0010_whatsapp_campaigns_f3b3a_state_guard.sql (SHA-256 26b1fa3cde6c6d23f148652a8655a5f3483ca5fd932b1483a650953903c2f51f).
-- O hash identifica só a cópia de referência; a prova vem das comparações com o catálogo.
--
-- Status: PASS / FAIL / REVIEW; INFO = fato do ambiente (fora do resultado geral).
-- Executar os blocos A e B separadamente se o editor mostrar só o último resultado.
-- Testado em PostgreSQL 17.11 isolado (produção: 17.6).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- BLOCO A — Resumo
-- -------------------------------------------------------------------------------------
WITH
ref(fname, exp_secdef, ref_src) AS (
  VALUES
    ('wa_campaign_contacts_guard', false, convert_from(decode('CkRFQ0xBUkUKICBfY2FkYXN0cm8gY29uc3RhbnQgdGV4dFtdIDo9IEFSUkFZWyduYW1lJywgJ3Bob25lJywgJ25vcm1hbGl6ZWRfcGhvbmUnLCAnY29tcGFueSddOwogIF9vd25lciBvaWQ7CiAgX3ByaXYgIGJvb2xlYW47CiAgX28ganNvbmI7CiAgX24ganNvbmI7CkJFR0lOCiAgU0VMRUNUIGMucmVsb3duZXIgSU5UTyBfb3duZXIgRlJPTSBwZ19jYXRhbG9nLnBnX2NsYXNzIGMgV0hFUkUgYy5vaWQgPSBUR19SRUxJRDsKICBfcHJpdiA6PSBwZ19jYXRhbG9nLnBnX2hhc19yb2xlKGN1cnJlbnRfdXNlciwgX293bmVyLCAnTUVNQkVSJyk7CgogIElGIFRHX09QID0gJ0RFTEVURScgVEhFTgogICAgSUYgT0xELnN0YXR1cyBOT1QgSU4gKCdwZW5kaW5nJywgJ2NhbmNlbGxlZCcpIFRIRU4KICAgICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICAgIE1FU1NBR0UgPSBmb3JtYXQoJ3dhX2NvbnRhY3RfZ3VhcmQ6IGNvbnRhdG8gY29tIHN0YXR1cyAlcyBuw6NvIHBvZGUgc2VyIGV4Y2x1w61kbycsIE9MRC5zdGF0dXMpOwogICAgRU5EIElGOwogICAgUkVUVVJOIE9MRDsKICBFTkQgSUY7CgogIElGIFRHX09QID0gJ0lOU0VSVCcgVEhFTgogICAgSUYgX3ByaXYgVEhFTiBSRVRVUk4gTkVXOyBFTkQgSUY7CiAgICAtLSBDb21wYXJhw6fDo28gdGlwYWRhIChjYW1pbmhvIGRvIGltcG9ydCkuIENvbHVuYXMgbm92YXM6IHZlciB3Y2Nfc2NoZW1hX2d1YXJkLgogICAgSUYgTkVXLnN0YXR1cyBJUyBESVNUSU5DVCBGUk9NICdwZW5kaW5nJwogICAgICAgT1IgTkVXLmF0dGVtcHRzIElTIERJU1RJTkNUIEZST00gMAogICAgICAgT1IgbnVtX25vbm51bGxzKE5FVy53aGF0c2FwcF9hY2NvdW50X2lkLCBORVcucmVzZXJ2YXRpb25faWQsIE5FVy5zZW5kX2F0dGVtcHRfaWQsCiAgICAgICAgICAgICAgICAgICAgICAgTkVXLnJlc2VydmVkX2F0LCBORVcuc2VuZGluZ19hdCwgTkVXLnNlbnRfYXQsIE5FVy5mYWlsZWRfYXQsCiAgICAgICAgICAgICAgICAgICAgICAgTkVXLnNlbnRfYnlfYWNjb3VudF9pZCwgTkVXLmxhc3RfZXJyb3IsIE5FVy5lcnJvcikgPiAwIFRIRU4KICAgICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICAgIE1FU1NBR0UgPSAnd2FfY29udGFjdF9ndWFyZDogY29udGF0byBub3ZvIGRldmUgbmFzY2VyIHBlbmRpbmcsIHNlbSBwb3NzZSBuZW0gaGlzdMOzcmljbyc7CiAgICBFTkQgSUY7CiAgICBSRVRVUk4gTkVXOwogIEVORCBJRjsKCiAgLS0gVVBEQVRFCiAgSUYgTk9UIF9wcml2IFRIRU4KICAgIF9uIDo9IHRvX2pzb25iKE5FVyk7CiAgICBfbyA6PSB0b19qc29uYihPTEQpOwogICAgSUYgT0xELnN0YXR1cyA8PiAncGVuZGluZycKICAgICAgIE9SIChfbiAtIF9jYWRhc3RybyAtICd1cGRhdGVkX2F0JykgSVMgRElTVElOQ1QgRlJPTSAoX28gLSBfY2FkYXN0cm8gLSAndXBkYXRlZF9hdCcpIFRIRU4KICAgICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICAgIE1FU1NBR0UgPSAnd2FfY29udGFjdF9ndWFyZDogYWx0ZXJhw6fDo28gZGlyZXRhIHBlcm1pdGlkYSBzw7Mgbm9zIGRhZG9zIGNhZGFzdHJhaXMgZGUgY29udGF0byBwZW5kaW5nJzsKICAgIEVORCBJRjsKICAgIFJFVFVSTiBORVc7CiAgRU5EIElGOwoKICAtLSBQcml2aWxlZ2lhZG8uIGpzb25iIHPDsyBubyBjYW1pbmhvIHJhcm8gKGxpbmhhIHRlcm1pbmFsKTsgbyBjYW1pbmhvIHF1ZW50ZSBkYXMgUlBDcyB1c2EgY29tcGFyYcOnw6NvIHRpcGFkYS4KICBJRiBPTEQuc3RhdHVzIElOICgnc2VudCcsICdmYWlsZWQnLCAnY2FuY2VsbGVkJykgVEhFTgogICAgX24gOj0gdG9fanNvbmIoTkVXKTsKICAgIF9vIDo9IHRvX2pzb25iKE9MRCk7CiAgICBJRiAoX24gLSAnd2hhdHNhcHBfYWNjb3VudF9pZCcgLSAndXBkYXRlZF9hdCcpID0gKF9vIC0gJ3doYXRzYXBwX2FjY291bnRfaWQnIC0gJ3VwZGF0ZWRfYXQnKQogICAgICAgQU5EIChORVcud2hhdHNhcHBfYWNjb3VudF9pZCBJUyBOVUxMCiAgICAgICAgICAgIE9SIE5FVy53aGF0c2FwcF9hY2NvdW50X2lkIElTIE5PVCBESVNUSU5DVCBGUk9NIE9MRC53aGF0c2FwcF9hY2NvdW50X2lkKSBUSEVOCiAgICAgIFJFVFVSTiBORVc7CiAgICBFTkQgSUY7CiAgICBSQUlTRSBFWENFUFRJT04gVVNJTkcgRVJSQ09ERSA9ICcyMzUxNCcsCiAgICAgIE1FU1NBR0UgPSBmb3JtYXQoJ3dhX2NvbnRhY3RfZ3VhcmQ6IGNvbnRhdG8gJXMgw6kgdGVybWluYWwgZSBuw6NvIHBvZGUgc2VyIGFsdGVyYWRvJywgT0xELnN0YXR1cyk7CiAgRU5EIElGOwoKICBJRiBPTEQuc3RhdHVzIDw+ICdwZW5kaW5nJwogICAgIEFORCAoTkVXLmlkLCBORVcuY2FtcGFpZ25faWQsIE5FVy5waG9uZSwgTkVXLm5vcm1hbGl6ZWRfcGhvbmUpCiAgICAgICAgIElTIERJU1RJTkNUIEZST00gKE9MRC5pZCwgT0xELmNhbXBhaWduX2lkLCBPTEQucGhvbmUsIE9MRC5ub3JtYWxpemVkX3Bob25lKSBUSEVOCiAgICBSQUlTRSBFWENFUFRJT04gVVNJTkcgRVJSQ09ERSA9ICcyMzUxNCcsCiAgICAgIE1FU1NBR0UgPSAnd2FfY29udGFjdF9ndWFyZDogaWRlbnRpZGFkZSBkbyBjb250YXRvIHPDsyBtdWRhIGVucXVhbnRvIHBlbmRpbmcnOwogIEVORCBJRjsKCiAgSUYgTkVXLnN0YXR1cyBJUyBESVNUSU5DVCBGUk9NIE9MRC5zdGF0dXMKICAgICBBTkQgKE9MRC5zdGF0dXMsIE5FVy5zdGF0dXMpIE5PVCBJTiAoCiAgICAgICAoJ3BlbmRpbmcnLCAncmVzZXJ2ZWQnKSwgICAtLSByZXNlcnZlCiAgICAgICAoJ3Jlc2VydmVkJywgJ3BlbmRpbmcnKSwgICAtLSBleHBpcmHDp8OjbyAvIHJlbGVhc2UKICAgICAgICgncmVzZXJ2ZWQnLCAnc2VuZGluZycpLCAgIC0tIGNsYWltCiAgICAgICAoJ3NlbmRpbmcnLCAncmVzZXJ2ZWQnKSwgICAtLSB1bmNsYWltCiAgICAgICAoJ3NlbmRpbmcnLCAnc2VudCcpLCAgICAgICAtLSBtYXJrX3NlbnQKICAgICAgICgnc2VuZGluZycsICdmYWlsZWQnKSwgICAgIC0tIG1hcmtfZmFpbGVkCiAgICAgICAoJ3BlbmRpbmcnLCAnY2FuY2VsbGVkJyksICAtLSBlbmNlcnJhbWVudG8KICAgICAgICgncmVzZXJ2ZWQnLCAnY2FuY2VsbGVkJykpIFRIRU4KICAgIFJBSVNFIEVYQ0VQVElPTiBVU0lORyBFUlJDT0RFID0gJzIzNTE0JywKICAgICAgTUVTU0FHRSA9IGZvcm1hdCgnd2FfY29udGFjdF9ndWFyZDogdHJhbnNpw6fDo28gJXMgLT4gJXMgbsOjbyBwZXJtaXRpZGEnLCBPTEQuc3RhdHVzLCBORVcuc3RhdHVzKTsKICBFTkQgSUY7CgogIFJFVFVSTiBORVc7CkVORCA=', 'base64'), 'UTF8')),
    ('wa_campaign_contacts_schema_guard', false, convert_from(decode('CkRFQ0xBUkUKICBfZXhwZWN0ZWQgY29uc3RhbnQgdGV4dFtdIDo9IEFSUkFZWwogICAgJ2F0dGVtcHRzJywgJ2NhbXBhaWduX2lkJywgJ2NvbXBhbnknLCAnY3JlYXRlZF9hdCcsICdlcnJvcicsICdmYWlsZWRfYXQnLCAnaWQnLCAnbGFzdF9lcnJvcicsCiAgICAnbmFtZScsICdub3JtYWxpemVkX3Bob25lJywgJ3Bob25lJywgJ3Jlc2VydmF0aW9uX2lkJywgJ3Jlc2VydmVkX2F0JywgJ3NlbmRfYXR0ZW1wdF9pZCcsCiAgICAnc2VuZGluZ19hdCcsICdzZW50X2F0JywgJ3NlbnRfYnlfYWNjb3VudF9pZCcsICdzdGF0dXMnLCAndXBkYXRlZF9hdCcsICd3aGF0c2FwcF9hY2NvdW50X2lkJ107CiAgX2FjdHVhbCB0ZXh0W107CkJFR0lOCiAgSUYgcGdfY2F0YWxvZy5wZ19oYXNfcm9sZShjdXJyZW50X3VzZXIsCiAgICAgICAoU0VMRUNUIGMucmVsb3duZXIgRlJPTSBwZ19jYXRhbG9nLnBnX2NsYXNzIGMgV0hFUkUgYy5vaWQgPSBUR19SRUxJRCksICdNRU1CRVInKSBUSEVOCiAgICBSRVRVUk4gTlVMTDsKICBFTkQgSUY7CiAgU0VMRUNUIGFycmF5X2FnZyhhLmF0dG5hbWU6OnRleHQgT1JERVIgQlkgYS5hdHRuYW1lOjp0ZXh0IENPTExBVEUgIkMiKSBJTlRPIF9hY3R1YWwKICAgIEZST00gcGdfY2F0YWxvZy5wZ19hdHRyaWJ1dGUgYSBXSEVSRSBhLmF0dHJlbGlkID0gVEdfUkVMSUQgQU5EIGEuYXR0bnVtID4gMCBBTkQgTk9UIGEuYXR0aXNkcm9wcGVkOwogIElGIF9hY3R1YWwgSVMgRElTVElOQ1QgRlJPTSAoU0VMRUNUIGFycmF5X2FnZyh4IE9SREVSIEJZIHggQ09MTEFURSAiQyIpIEZST00gdW5uZXN0KF9leHBlY3RlZCkgeCkgVEhFTgogICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICBNRVNTQUdFID0gJ3dhX2NvbnRhY3RfZ3VhcmQ6IGNvbHVuYXMgZGUgd2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMgbXVkYXJhbTsgYXR1YWxpemUgYSBndWFyZGEgYW50ZXMgZGUgbGliZXJhciBJTlNFUlQgZGlyZXRvJzsKICBFTkQgSUY7CiAgUkVUVVJOIE5VTEw7CkVORCA=', 'base64'), 'UTF8')),
    ('wa_campaign_contacts_truncate_guard', false, convert_from(decode('CkJFR0lOCiAgSUYgTk9UIHBnX2NhdGFsb2cucGdfaGFzX3JvbGUoY3VycmVudF91c2VyLAogICAgICAgKFNFTEVDVCBjLnJlbG93bmVyIEZST00gcGdfY2F0YWxvZy5wZ19jbGFzcyBjIFdIRVJFIGMub2lkID0gVEdfUkVMSUQpLCAnTUVNQkVSJykgVEhFTgogICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICBNRVNTQUdFID0gZm9ybWF0KCd3YV9jb250YWN0X2d1YXJkOiBUUlVOQ0FURSBkZSAlcyBuw6NvIHBlcm1pdGlkbycsIFRHX1RBQkxFX05BTUUpOwogIEVORCBJRjsKICBSRVRVUk4gTlVMTDsKRU5EIA==', 'base64'), 'UTF8')),
    ('wa_campaigns_delete_guard', true, convert_from(decode('CkJFR0lOCiAgSUYgRVhJU1RTIChTRUxFQ1QgMSBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cwogICAgICAgICAgICAgIFdIRVJFIGNhbXBhaWduX2lkID0gT0xELmlkIEFORCBzdGF0dXMgTk9UIElOICgncGVuZGluZycsICdjYW5jZWxsZWQnKSkgVEhFTgogICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICBNRVNTQUdFID0gJ3dhX2NvbnRhY3RfZ3VhcmQ6IGNhbXBhbmhhIGNvbSBoaXN0w7NyaWNvIGRlIGVudmlvIG7Do28gcG9kZSBzZXIgZXhjbHXDrWRhJzsKICBFTkQgSUY7CiAgUkVUVVJOIE9MRDsKRU5EIA==', 'base64'), 'UTF8'))
),
fd AS (
  SELECT r.fname, r.exp_secdef, r.ref_src, to_regprocedure('public.' || r.fname || '()') AS foid,
         p.prosrc, p.prosecdef, p.proconfig, l.lanname, p.prorettype::regtype::text AS rettype,
         p.provolatile, p.proowner, pg_get_userbyid(p.proowner) AS owner_name, p.proacl,
         btrim(regexp_replace(regexp_replace(replace(coalesce(p.prosrc, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_live, btrim(regexp_replace(regexp_replace(replace(coalesce(r.ref_src, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_ref
  FROM ref r
  LEFT JOIN pg_catalog.pg_proc p ON p.oid = to_regprocedure('public.' || r.fname || '()')
  LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
),
tbl AS (
  SELECT to_regclass('public.whatsapp_campaign_contacts') AS coid, to_regclass('public.whatsapp_campaigns') AS woid
),
own AS (
  SELECT t.*, cc.relowner AS c_owner, pg_get_userbyid(cc.relowner) AS c_owner_name, cc.relacl AS c_acl,
         wc.relowner AS w_owner, wc.relacl AS w_acl
  FROM tbl t
  LEFT JOIN pg_catalog.pg_class cc ON cc.oid = t.coid
  LEFT JOIN pg_catalog.pg_class wc ON wc.oid = t.woid
),
exp_trg(tname, tabname, fname, bits, descr) AS (
  VALUES
    ('wcc_state_guard', 'whatsapp_campaign_contacts', 'wa_campaign_contacts_guard', 31, 'BEFORE INSERT OR UPDATE OR DELETE, FOR EACH ROW'),
    ('wcc_schema_guard', 'whatsapp_campaign_contacts', 'wa_campaign_contacts_schema_guard', 6, 'BEFORE INSERT, FOR EACH STATEMENT'),
    ('wcc_truncate_guard', 'whatsapp_campaign_contacts', 'wa_campaign_contacts_truncate_guard', 34, 'BEFORE TRUNCATE, FOR EACH STATEMENT'),
    ('wc_truncate_guard', 'whatsapp_campaigns', 'wa_campaign_contacts_truncate_guard', 34, 'BEFORE TRUNCATE, FOR EACH STATEMENT'),
    ('wc_delete_guard', 'whatsapp_campaigns', 'wa_campaigns_delete_guard', 11, 'BEFORE DELETE, FOR EACH ROW')
),
trg AS (
  SELECT e.*, tg.oid AS tgoid, tg.tgenabled, tg.tgtype::int AS tgtype, tg.tgfoid, tg.tgqual IS NOT NULL AS has_when,
         array_length(tg.tgattr::int2[], 1) AS ncols, tg.tgrelid
  FROM exp_trg e
  LEFT JOIN pg_catalog.pg_trigger tg
    ON tg.tgname = e.tname AND tg.tgrelid = to_regclass('public.' || e.tabname) AND NOT tg.tgisinternal
),
roles(rname) AS (VALUES ('anon'), ('authenticated'), ('service_role'), ('sandbox_exec')),
cols AS (
  SELECT array_agg(a.attname::text ORDER BY a.attname::text COLLATE "C") AS live
  FROM tbl t JOIN pg_catalog.pg_attribute a ON a.attrelid = t.coid AND a.attnum > 0 AND NOT a.attisdropped
),
rpcs AS (
  SELECT p.oid, p.proname, p.proowner
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'wa\_campaign\_%' AND p.prosecdef
),
checks(ordem, area, item, status, esperado, encontrado, observacao) AS (

  -- ===================== 1. FUNÇÕES =====================
  SELECT 10 + row_number() OVER (ORDER BY fname), 'função', fname || ': existe (sem argumentos, RETURNS trigger, plpgsql)',
         CASE WHEN foid IS NOT NULL AND rettype = 'trigger' AND lanname = 'plpgsql' THEN 'PASS' ELSE 'FAIL' END,
         'public.' || fname || '() RETURNS trigger LANGUAGE plpgsql',
         coalesce(foid::regprocedure::text || ' / ' || rettype || ' / ' || lanname, 'não encontrada'), NULL
  FROM fd
  UNION ALL
  SELECT 20 + row_number() OVER (ORDER BY fname), 'função', fname || ': SECURITY DEFINER conforme a referência',
         CASE WHEN prosecdef IS NOT DISTINCT FROM exp_secdef THEN 'PASS' ELSE 'FAIL' END,
         exp_secdef::text, coalesce(prosecdef::text, '—'),
         CASE WHEN exp_secdef THEN 'Só a guarda de exclusão de campanha é DEFINER (precisa ver todos os contatos).'
              ELSE 'As guardas de contato NÃO são DEFINER: dependem de current_user para distinguir RPC de escrita direta.' END
  FROM fd
  UNION ALL
  SELECT 30 + row_number() OVER (ORDER BY fname), 'função', fname || ': SET search_path = public, pg_temp',
         CASE WHEN proconfig = ARRAY['search_path=public, pg_temp'] THEN 'PASS'
              WHEN proconfig IS NULL THEN 'FAIL' ELSE 'REVIEW' END,
         '{"search_path=public, pg_temp"}', coalesce(proconfig::text, 'nenhum'), NULL
  FROM fd
  UNION ALL
  SELECT 40 + row_number() OVER (ORDER BY fname), 'função', fname || ': corpo igual à referência',
         CASE WHEN prosrc = ref_src THEN 'PASS'
              WHEN n_live = n_ref AND n_live <> '' THEN 'PASS'
              WHEN n_live = '' THEN 'FAIL' ELSE 'REVIEW' END,
         'md5 ' || md5(ref_src), coalesce('md5 ' || md5(prosrc), 'sem corpo'),
         CASE WHEN prosrc = ref_src THEN 'Idêntico byte a byte.'
              WHEN n_live = n_ref THEN 'Diferença só de formatação/comentários (corpo normalizado idêntico).'
              WHEN n_live = '' THEN 'Função ausente.'
              ELSE 'Diferente: comparar no Bloco B.' END
  FROM fd
  UNION ALL
  SELECT 50 + row_number() OVER (ORDER BY fname), 'função', fname || ': dono = dono de whatsapp_campaign_contacts',
         CASE WHEN fd.proowner IS NULL THEN 'FAIL' WHEN fd.proowner = o.c_owner THEN 'PASS' ELSE 'REVIEW' END,
         coalesce(o.c_owner_name, '?'), coalesce(fd.owner_name, '—'),
         'A guarda DEFINER de exclusão precisa ler todos os contatos; as demais só precisam existir.'
  FROM fd CROSS JOIN own o
  UNION ALL
  SELECT 60 + row_number() OVER (ORDER BY fd.fname, r.rname), 'EXECUTE', fd.fname || ' → ' || r.rname,
         CASE WHEN fd.foid IS NULL OR to_regrole(r.rname) IS NULL THEN 'REVIEW'
              WHEN has_function_privilege(r.rname, fd.foid, 'EXECUTE') THEN 'FAIL' ELSE 'PASS' END,
         'sem EXECUTE',
         CASE WHEN to_regrole(r.rname) IS NULL THEN 'papel não existe' WHEN fd.foid IS NULL THEN 'função ausente'
              WHEN has_function_privilege(r.rname, fd.foid, 'EXECUTE') THEN 'com EXECUTE' ELSE 'sem EXECUTE' END,
         'A 0010 revoga de PUBLIC, anon, authenticated e service_role. Para sandbox_exec, o esperado decorre da P8 (sem privilégio padrão de funções).'
  FROM fd CROSS JOIN roles r
  UNION ALL
  SELECT 80 + row_number() OVER (ORDER BY fname), 'EXECUTE', fname || ' → PUBLIC',
         CASE WHEN foid IS NULL THEN 'FAIL'
              WHEN EXISTS (SELECT 1 FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) a
                            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN 'FAIL' ELSE 'PASS' END,
         'sem EXECUTE', CASE WHEN proacl IS NULL THEN 'ACL padrão (PUBLIC tem EXECUTE)' ELSE proacl::text END, NULL
  FROM fd

  -- ===================== 2. TRIGGERS =====================
  UNION ALL
  SELECT 100 + row_number() OVER (ORDER BY tname), 'trigger', tname || ' em ' || tabname || ': existe e chama ' || fname,
         CASE WHEN tgoid IS NULL THEN 'FAIL'
              WHEN tgfoid = to_regprocedure('public.' || fname || '()') THEN 'PASS' ELSE 'FAIL' END,
         'public.' || fname || '()',
         CASE WHEN tgoid IS NULL THEN 'não encontrado' ELSE tgfoid::regprocedure::text END, NULL
  FROM trg
  UNION ALL
  SELECT 110 + row_number() OVER (ORDER BY tname), 'trigger', tname || ': momento, nível e eventos',
         CASE WHEN tgoid IS NULL THEN 'FAIL' WHEN tgtype = bits THEN 'PASS' ELSE 'FAIL' END,
         descr || ' (tgtype ' || bits || ')',
         CASE WHEN tgoid IS NULL THEN '—' ELSE 'tgtype ' || tgtype END,
         'Bits: ROW=1, BEFORE=2, INSERT=4, DELETE=8, UPDATE=16, TRUNCATE=32.'
  FROM trg
  UNION ALL
  SELECT 120 + row_number() OVER (ORDER BY tname), 'trigger', tname || ': habilitado',
         CASE WHEN tgoid IS NULL THEN 'FAIL' WHEN tgenabled = 'O' THEN 'PASS' WHEN tgenabled = 'D' THEN 'FAIL' ELSE 'REVIEW' END,
         'O (dispara no modo normal de replicação)', coalesce(tgenabled::text, '—'),
         'D = desabilitado (guarda inativa). R/A = só dispara em modo réplica/sempre: diferente da referência.'
  FROM trg
  UNION ALL
  SELECT 130 + row_number() OVER (ORDER BY tname), 'trigger', tname || ': sem cláusula WHEN e sem lista de colunas',
         CASE WHEN tgoid IS NULL THEN 'FAIL' WHEN NOT has_when AND coalesce(ncols, 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
         'sem WHEN, sem UPDATE OF', CASE WHEN tgoid IS NULL THEN '—' ELSE 'WHEN=' || has_when || ', colunas=' || coalesce(ncols, 0) END,
         'Uma condição ou lista de colunas restringiria a guarda.'
  FROM trg

  -- ===================== 3. GUARDA DE COLUNAS =====================
  UNION ALL
  SELECT 140, 'guarda de colunas', 'colunas atuais de whatsapp_campaign_contacts = lista fixada na 0010',
         CASE WHEN c.live = ARRAY['attempts', 'campaign_id', 'company', 'created_at', 'error', 'failed_at', 'id', 'last_error', 'name', 'normalized_phone', 'phone', 'reservation_id', 'reserved_at', 'send_attempt_id', 'sending_at', 'sent_at', 'sent_by_account_id', 'status', 'updated_at', 'whatsapp_account_id'] THEN 'PASS' ELSE 'FAIL' END,
         '20 colunas da 0010', coalesce(array_length(c.live, 1)::text || ' colunas', 'tabela ausente'),
         'FAIL = toda importação direta de contatos é recusada por wcc_schema_guard até a guarda ser revisada.'
  FROM cols c

  -- ===================== 4. PRIVILÉGIOS REVOGADOS NAS TABELAS =====================
  UNION ALL
  SELECT 150 + row_number() OVER (ORDER BY t.tn, r.rname), 'privilégios tabela', t.tn || ' → ' || r.rname || ': sem TRUNCATE, TRIGGER, REFERENCES',
         CASE WHEN t.toid IS NULL OR to_regrole(r.rname) IS NULL THEN 'REVIEW'
              WHEN has_table_privilege(r.rname, t.toid, 'TRUNCATE') OR has_table_privilege(r.rname, t.toid, 'TRIGGER')
                OR has_table_privilege(r.rname, t.toid, 'REFERENCES') THEN
                CASE WHEN r.rname = 'sandbox_exec' THEN 'REVIEW' ELSE 'FAIL' END
              ELSE 'PASS' END,
         'nenhum dos três',
         CASE WHEN to_regrole(r.rname) IS NULL THEN 'papel não existe' WHEN t.toid IS NULL THEN 'tabela ausente'
              ELSE concat_ws(', ',
                     CASE WHEN has_table_privilege(r.rname, t.toid, 'TRUNCATE') THEN 'TRUNCATE' END,
                     CASE WHEN has_table_privilege(r.rname, t.toid, 'TRIGGER') THEN 'TRIGGER' END,
                     CASE WHEN has_table_privilege(r.rname, t.toid, 'REFERENCES') THEN 'REFERENCES' END) END,
         CASE WHEN r.rname = 'sandbox_exec' THEN 'A 0010 não cita sandbox_exec; a P8 mostrou só SELECT e INSERT.' END
  FROM (SELECT 'whatsapp_campaign_contacts' AS tn, coid AS toid FROM tbl UNION ALL SELECT 'whatsapp_campaigns', woid FROM tbl) t
  CROSS JOIN roles r

  -- ===================== 5. COMPATIBILIDADE =====================
  UNION ALL
  SELECT 170, 'compatibilidade', 'RPCs wa_campaign_* SECURITY DEFINER com dono membro do dono das tabelas',
         CASE WHEN x.n = 0 THEN 'REVIEW' WHEN x.bad = 0 THEN 'PASS' ELSE 'FAIL' END,
         'todas', x.n - x.bad || ' de ' || x.n || coalesce(' — fora: ' || x.det, ''),
         'Só assim a guarda da 0010 trata a escrita das RPCs como privilegiada; se falhar, reserve/claim/sent quebram.'
  FROM (SELECT count(*) AS n,
               count(*) FILTER (WHERE NOT pg_has_role(r.proowner, o.c_owner, 'MEMBER')) AS bad,
               string_agg(r.proname, ', ') FILTER (WHERE NOT pg_has_role(r.proowner, o.c_owner, 'MEMBER')) AS det
          FROM rpcs r CROSS JOIN own o WHERE o.c_owner IS NOT NULL) x
  UNION ALL
  SELECT 171, 'compatibilidade', 'outros triggers não internos nas duas tabelas', 'INFO', 'registrar',
         coalesce((SELECT string_agg(tg.tgname || ' (' || c.relname || ', enabled=' || tg.tgenabled::text || ')', ', ' ORDER BY c.relname, tg.tgname)
                     FROM pg_catalog.pg_trigger tg JOIN pg_catalog.pg_class c ON c.oid = tg.tgrelid
                    WHERE tg.tgrelid IN ((SELECT coid FROM tbl), (SELECT woid FROM tbl)) AND NOT tg.tgisinternal
                      AND tg.tgname NOT IN (SELECT tname FROM exp_trg)), 'nenhum'),
         'Triggers adicionais não fazem parte da 0010; avaliar se interferem nas transições.'
  UNION ALL
  SELECT 172, 'compatibilidade', 'triggers desabilitados nas duas tabelas',
         CASE WHEN x.n = 0 THEN 'PASS' ELSE 'REVIEW' END, '0', x.n::text || coalesce(' — ' || x.det, ''), NULL
  FROM (SELECT count(*) AS n, string_agg(tg.tgname, ', ') AS det FROM pg_catalog.pg_trigger tg
         WHERE tg.tgrelid IN ((SELECT coid FROM tbl), (SELECT woid FROM tbl)) AND NOT tg.tgisinternal AND tg.tgenabled = 'D') x
  UNION ALL
  SELECT 173, 'ambiente', 'versão do servidor / session_replication_role desta sessão', 'INFO', 'registrar',
         current_setting('server_version') || ' / ' || current_setting('session_replication_role'),
         'Com session_replication_role = replica, triggers "O" não disparam nesta sessão (não afeta outras).'
)
SELECT ordem, area, item, status, esperado, encontrado, observacao
FROM (
  SELECT 0 AS ordem, 'RESULTADO GERAL' AS area, 'P7 — 0010 instalada confere com a referência' AS item,
         CASE WHEN bool_or(status = 'FAIL') THEN 'FAIL' WHEN bool_or(status = 'REVIEW') THEN 'REVIEW' ELSE 'PASS' END AS status,
         'todos PASS' AS esperado,
         count(*) FILTER (WHERE status = 'PASS') || ' PASS / ' || count(*) FILTER (WHERE status = 'FAIL') || ' FAIL / '
           || count(*) FILTER (WHERE status = 'REVIEW') || ' REVIEW / ' || count(*) FILTER (WHERE status = 'INFO') || ' INFO' AS encontrado,
         'INFO não entra no resultado.' AS observacao
  FROM checks
  UNION ALL
  SELECT * FROM checks
) z
ORDER BY ordem, item;


-- -------------------------------------------------------------------------------------
-- BLOCO B — Definições instaladas e primeira diferença (revisão manual)
-- -------------------------------------------------------------------------------------
WITH
ref(fname, exp_secdef, ref_src) AS (
  VALUES
    ('wa_campaign_contacts_guard', false, convert_from(decode('CkRFQ0xBUkUKICBfY2FkYXN0cm8gY29uc3RhbnQgdGV4dFtdIDo9IEFSUkFZWyduYW1lJywgJ3Bob25lJywgJ25vcm1hbGl6ZWRfcGhvbmUnLCAnY29tcGFueSddOwogIF9vd25lciBvaWQ7CiAgX3ByaXYgIGJvb2xlYW47CiAgX28ganNvbmI7CiAgX24ganNvbmI7CkJFR0lOCiAgU0VMRUNUIGMucmVsb3duZXIgSU5UTyBfb3duZXIgRlJPTSBwZ19jYXRhbG9nLnBnX2NsYXNzIGMgV0hFUkUgYy5vaWQgPSBUR19SRUxJRDsKICBfcHJpdiA6PSBwZ19jYXRhbG9nLnBnX2hhc19yb2xlKGN1cnJlbnRfdXNlciwgX293bmVyLCAnTUVNQkVSJyk7CgogIElGIFRHX09QID0gJ0RFTEVURScgVEhFTgogICAgSUYgT0xELnN0YXR1cyBOT1QgSU4gKCdwZW5kaW5nJywgJ2NhbmNlbGxlZCcpIFRIRU4KICAgICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICAgIE1FU1NBR0UgPSBmb3JtYXQoJ3dhX2NvbnRhY3RfZ3VhcmQ6IGNvbnRhdG8gY29tIHN0YXR1cyAlcyBuw6NvIHBvZGUgc2VyIGV4Y2x1w61kbycsIE9MRC5zdGF0dXMpOwogICAgRU5EIElGOwogICAgUkVUVVJOIE9MRDsKICBFTkQgSUY7CgogIElGIFRHX09QID0gJ0lOU0VSVCcgVEhFTgogICAgSUYgX3ByaXYgVEhFTiBSRVRVUk4gTkVXOyBFTkQgSUY7CiAgICAtLSBDb21wYXJhw6fDo28gdGlwYWRhIChjYW1pbmhvIGRvIGltcG9ydCkuIENvbHVuYXMgbm92YXM6IHZlciB3Y2Nfc2NoZW1hX2d1YXJkLgogICAgSUYgTkVXLnN0YXR1cyBJUyBESVNUSU5DVCBGUk9NICdwZW5kaW5nJwogICAgICAgT1IgTkVXLmF0dGVtcHRzIElTIERJU1RJTkNUIEZST00gMAogICAgICAgT1IgbnVtX25vbm51bGxzKE5FVy53aGF0c2FwcF9hY2NvdW50X2lkLCBORVcucmVzZXJ2YXRpb25faWQsIE5FVy5zZW5kX2F0dGVtcHRfaWQsCiAgICAgICAgICAgICAgICAgICAgICAgTkVXLnJlc2VydmVkX2F0LCBORVcuc2VuZGluZ19hdCwgTkVXLnNlbnRfYXQsIE5FVy5mYWlsZWRfYXQsCiAgICAgICAgICAgICAgICAgICAgICAgTkVXLnNlbnRfYnlfYWNjb3VudF9pZCwgTkVXLmxhc3RfZXJyb3IsIE5FVy5lcnJvcikgPiAwIFRIRU4KICAgICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICAgIE1FU1NBR0UgPSAnd2FfY29udGFjdF9ndWFyZDogY29udGF0byBub3ZvIGRldmUgbmFzY2VyIHBlbmRpbmcsIHNlbSBwb3NzZSBuZW0gaGlzdMOzcmljbyc7CiAgICBFTkQgSUY7CiAgICBSRVRVUk4gTkVXOwogIEVORCBJRjsKCiAgLS0gVVBEQVRFCiAgSUYgTk9UIF9wcml2IFRIRU4KICAgIF9uIDo9IHRvX2pzb25iKE5FVyk7CiAgICBfbyA6PSB0b19qc29uYihPTEQpOwogICAgSUYgT0xELnN0YXR1cyA8PiAncGVuZGluZycKICAgICAgIE9SIChfbiAtIF9jYWRhc3RybyAtICd1cGRhdGVkX2F0JykgSVMgRElTVElOQ1QgRlJPTSAoX28gLSBfY2FkYXN0cm8gLSAndXBkYXRlZF9hdCcpIFRIRU4KICAgICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICAgIE1FU1NBR0UgPSAnd2FfY29udGFjdF9ndWFyZDogYWx0ZXJhw6fDo28gZGlyZXRhIHBlcm1pdGlkYSBzw7Mgbm9zIGRhZG9zIGNhZGFzdHJhaXMgZGUgY29udGF0byBwZW5kaW5nJzsKICAgIEVORCBJRjsKICAgIFJFVFVSTiBORVc7CiAgRU5EIElGOwoKICAtLSBQcml2aWxlZ2lhZG8uIGpzb25iIHPDsyBubyBjYW1pbmhvIHJhcm8gKGxpbmhhIHRlcm1pbmFsKTsgbyBjYW1pbmhvIHF1ZW50ZSBkYXMgUlBDcyB1c2EgY29tcGFyYcOnw6NvIHRpcGFkYS4KICBJRiBPTEQuc3RhdHVzIElOICgnc2VudCcsICdmYWlsZWQnLCAnY2FuY2VsbGVkJykgVEhFTgogICAgX24gOj0gdG9fanNvbmIoTkVXKTsKICAgIF9vIDo9IHRvX2pzb25iKE9MRCk7CiAgICBJRiAoX24gLSAnd2hhdHNhcHBfYWNjb3VudF9pZCcgLSAndXBkYXRlZF9hdCcpID0gKF9vIC0gJ3doYXRzYXBwX2FjY291bnRfaWQnIC0gJ3VwZGF0ZWRfYXQnKQogICAgICAgQU5EIChORVcud2hhdHNhcHBfYWNjb3VudF9pZCBJUyBOVUxMCiAgICAgICAgICAgIE9SIE5FVy53aGF0c2FwcF9hY2NvdW50X2lkIElTIE5PVCBESVNUSU5DVCBGUk9NIE9MRC53aGF0c2FwcF9hY2NvdW50X2lkKSBUSEVOCiAgICAgIFJFVFVSTiBORVc7CiAgICBFTkQgSUY7CiAgICBSQUlTRSBFWENFUFRJT04gVVNJTkcgRVJSQ09ERSA9ICcyMzUxNCcsCiAgICAgIE1FU1NBR0UgPSBmb3JtYXQoJ3dhX2NvbnRhY3RfZ3VhcmQ6IGNvbnRhdG8gJXMgw6kgdGVybWluYWwgZSBuw6NvIHBvZGUgc2VyIGFsdGVyYWRvJywgT0xELnN0YXR1cyk7CiAgRU5EIElGOwoKICBJRiBPTEQuc3RhdHVzIDw+ICdwZW5kaW5nJwogICAgIEFORCAoTkVXLmlkLCBORVcuY2FtcGFpZ25faWQsIE5FVy5waG9uZSwgTkVXLm5vcm1hbGl6ZWRfcGhvbmUpCiAgICAgICAgIElTIERJU1RJTkNUIEZST00gKE9MRC5pZCwgT0xELmNhbXBhaWduX2lkLCBPTEQucGhvbmUsIE9MRC5ub3JtYWxpemVkX3Bob25lKSBUSEVOCiAgICBSQUlTRSBFWENFUFRJT04gVVNJTkcgRVJSQ09ERSA9ICcyMzUxNCcsCiAgICAgIE1FU1NBR0UgPSAnd2FfY29udGFjdF9ndWFyZDogaWRlbnRpZGFkZSBkbyBjb250YXRvIHPDsyBtdWRhIGVucXVhbnRvIHBlbmRpbmcnOwogIEVORCBJRjsKCiAgSUYgTkVXLnN0YXR1cyBJUyBESVNUSU5DVCBGUk9NIE9MRC5zdGF0dXMKICAgICBBTkQgKE9MRC5zdGF0dXMsIE5FVy5zdGF0dXMpIE5PVCBJTiAoCiAgICAgICAoJ3BlbmRpbmcnLCAncmVzZXJ2ZWQnKSwgICAtLSByZXNlcnZlCiAgICAgICAoJ3Jlc2VydmVkJywgJ3BlbmRpbmcnKSwgICAtLSBleHBpcmHDp8OjbyAvIHJlbGVhc2UKICAgICAgICgncmVzZXJ2ZWQnLCAnc2VuZGluZycpLCAgIC0tIGNsYWltCiAgICAgICAoJ3NlbmRpbmcnLCAncmVzZXJ2ZWQnKSwgICAtLSB1bmNsYWltCiAgICAgICAoJ3NlbmRpbmcnLCAnc2VudCcpLCAgICAgICAtLSBtYXJrX3NlbnQKICAgICAgICgnc2VuZGluZycsICdmYWlsZWQnKSwgICAgIC0tIG1hcmtfZmFpbGVkCiAgICAgICAoJ3BlbmRpbmcnLCAnY2FuY2VsbGVkJyksICAtLSBlbmNlcnJhbWVudG8KICAgICAgICgncmVzZXJ2ZWQnLCAnY2FuY2VsbGVkJykpIFRIRU4KICAgIFJBSVNFIEVYQ0VQVElPTiBVU0lORyBFUlJDT0RFID0gJzIzNTE0JywKICAgICAgTUVTU0FHRSA9IGZvcm1hdCgnd2FfY29udGFjdF9ndWFyZDogdHJhbnNpw6fDo28gJXMgLT4gJXMgbsOjbyBwZXJtaXRpZGEnLCBPTEQuc3RhdHVzLCBORVcuc3RhdHVzKTsKICBFTkQgSUY7CgogIFJFVFVSTiBORVc7CkVORCA=', 'base64'), 'UTF8')),
    ('wa_campaign_contacts_schema_guard', false, convert_from(decode('CkRFQ0xBUkUKICBfZXhwZWN0ZWQgY29uc3RhbnQgdGV4dFtdIDo9IEFSUkFZWwogICAgJ2F0dGVtcHRzJywgJ2NhbXBhaWduX2lkJywgJ2NvbXBhbnknLCAnY3JlYXRlZF9hdCcsICdlcnJvcicsICdmYWlsZWRfYXQnLCAnaWQnLCAnbGFzdF9lcnJvcicsCiAgICAnbmFtZScsICdub3JtYWxpemVkX3Bob25lJywgJ3Bob25lJywgJ3Jlc2VydmF0aW9uX2lkJywgJ3Jlc2VydmVkX2F0JywgJ3NlbmRfYXR0ZW1wdF9pZCcsCiAgICAnc2VuZGluZ19hdCcsICdzZW50X2F0JywgJ3NlbnRfYnlfYWNjb3VudF9pZCcsICdzdGF0dXMnLCAndXBkYXRlZF9hdCcsICd3aGF0c2FwcF9hY2NvdW50X2lkJ107CiAgX2FjdHVhbCB0ZXh0W107CkJFR0lOCiAgSUYgcGdfY2F0YWxvZy5wZ19oYXNfcm9sZShjdXJyZW50X3VzZXIsCiAgICAgICAoU0VMRUNUIGMucmVsb3duZXIgRlJPTSBwZ19jYXRhbG9nLnBnX2NsYXNzIGMgV0hFUkUgYy5vaWQgPSBUR19SRUxJRCksICdNRU1CRVInKSBUSEVOCiAgICBSRVRVUk4gTlVMTDsKICBFTkQgSUY7CiAgU0VMRUNUIGFycmF5X2FnZyhhLmF0dG5hbWU6OnRleHQgT1JERVIgQlkgYS5hdHRuYW1lOjp0ZXh0IENPTExBVEUgIkMiKSBJTlRPIF9hY3R1YWwKICAgIEZST00gcGdfY2F0YWxvZy5wZ19hdHRyaWJ1dGUgYSBXSEVSRSBhLmF0dHJlbGlkID0gVEdfUkVMSUQgQU5EIGEuYXR0bnVtID4gMCBBTkQgTk9UIGEuYXR0aXNkcm9wcGVkOwogIElGIF9hY3R1YWwgSVMgRElTVElOQ1QgRlJPTSAoU0VMRUNUIGFycmF5X2FnZyh4IE9SREVSIEJZIHggQ09MTEFURSAiQyIpIEZST00gdW5uZXN0KF9leHBlY3RlZCkgeCkgVEhFTgogICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICBNRVNTQUdFID0gJ3dhX2NvbnRhY3RfZ3VhcmQ6IGNvbHVuYXMgZGUgd2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMgbXVkYXJhbTsgYXR1YWxpemUgYSBndWFyZGEgYW50ZXMgZGUgbGliZXJhciBJTlNFUlQgZGlyZXRvJzsKICBFTkQgSUY7CiAgUkVUVVJOIE5VTEw7CkVORCA=', 'base64'), 'UTF8')),
    ('wa_campaign_contacts_truncate_guard', false, convert_from(decode('CkJFR0lOCiAgSUYgTk9UIHBnX2NhdGFsb2cucGdfaGFzX3JvbGUoY3VycmVudF91c2VyLAogICAgICAgKFNFTEVDVCBjLnJlbG93bmVyIEZST00gcGdfY2F0YWxvZy5wZ19jbGFzcyBjIFdIRVJFIGMub2lkID0gVEdfUkVMSUQpLCAnTUVNQkVSJykgVEhFTgogICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICBNRVNTQUdFID0gZm9ybWF0KCd3YV9jb250YWN0X2d1YXJkOiBUUlVOQ0FURSBkZSAlcyBuw6NvIHBlcm1pdGlkbycsIFRHX1RBQkxFX05BTUUpOwogIEVORCBJRjsKICBSRVRVUk4gTlVMTDsKRU5EIA==', 'base64'), 'UTF8')),
    ('wa_campaigns_delete_guard', true, convert_from(decode('CkJFR0lOCiAgSUYgRVhJU1RTIChTRUxFQ1QgMSBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cwogICAgICAgICAgICAgIFdIRVJFIGNhbXBhaWduX2lkID0gT0xELmlkIEFORCBzdGF0dXMgTk9UIElOICgncGVuZGluZycsICdjYW5jZWxsZWQnKSkgVEhFTgogICAgUkFJU0UgRVhDRVBUSU9OIFVTSU5HIEVSUkNPREUgPSAnNDI1MDEnLAogICAgICBNRVNTQUdFID0gJ3dhX2NvbnRhY3RfZ3VhcmQ6IGNhbXBhbmhhIGNvbSBoaXN0w7NyaWNvIGRlIGVudmlvIG7Do28gcG9kZSBzZXIgZXhjbHXDrWRhJzsKICBFTkQgSUY7CiAgUkVUVVJOIE9MRDsKRU5EIA==', 'base64'), 'UTF8'))
),
fd AS (
  SELECT r.fname, r.ref_src, to_regprocedure('public.' || r.fname || '()') AS foid, p.prosrc,
         btrim(regexp_replace(regexp_replace(replace(coalesce(p.prosrc, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_live, btrim(regexp_replace(regexp_replace(replace(coalesce(r.ref_src, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_ref
  FROM ref r LEFT JOIN pg_catalog.pg_proc p ON p.oid = to_regprocedure('public.' || r.fname || '()')
),
d AS (
  SELECT fd.*, (SELECT min(i) FROM generate_series(1, greatest(length(fd.n_live), length(fd.n_ref))) i
                 WHERE substr(fd.n_live, i, 1) IS DISTINCT FROM substr(fd.n_ref, i, 1)) AS first_diff
  FROM fd
)
SELECT 'função' AS tipo, fname AS objeto,
       CASE WHEN foid IS NULL THEN 'ausente' ELSE pg_get_functiondef(foid) END AS definicao,
       md5(prosrc) AS md5_instalado, md5(ref_src) AS md5_referencia, first_diff AS primeira_diferenca,
       CASE WHEN first_diff IS NULL THEN NULL ELSE substr(n_live, greatest(first_diff - 60, 1), 160) END AS trecho_instalado,
       CASE WHEN first_diff IS NULL THEN NULL ELSE substr(n_ref, greatest(first_diff - 60, 1), 160) END AS trecho_referencia
FROM d
UNION ALL
SELECT 'trigger', tg.tgname || ' (' || c.relname || ')', pg_get_triggerdef(tg.oid, true),
       'enabled=' || tg.tgenabled::text, NULL, NULL, NULL, NULL
FROM pg_catalog.pg_trigger tg JOIN pg_catalog.pg_class c ON c.oid = tg.tgrelid
WHERE tg.tgrelid IN (to_regclass('public.whatsapp_campaign_contacts'), to_regclass('public.whatsapp_campaigns'))
  AND NOT tg.tgisinternal
UNION ALL
SELECT 'ACL', c.oid::regclass::text, 'dono ' || pg_get_userbyid(c.relowner) || '; ' || coalesce(c.relacl::text, 'ACL padrão'), NULL, NULL, NULL, NULL, NULL
FROM pg_catalog.pg_class c
WHERE c.oid IN (to_regclass('public.whatsapp_campaign_contacts'), to_regclass('public.whatsapp_campaigns'))
ORDER BY 1, 2;
