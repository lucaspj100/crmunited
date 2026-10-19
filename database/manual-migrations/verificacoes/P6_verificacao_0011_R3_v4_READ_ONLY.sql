-- =====================================================================================
-- P6_verificacao_0011_R3_v4_READ_ONLY.sql
-- CRM United — F4-A, pendência P6
-- Objetivo: verificar se a 0011-R3 v4 instalada no banco corresponde ao SQL de referência.
--
-- SOMENTE LEITURA. Só SELECT sobre catálogos (pg_proc, pg_class, pg_attribute, pg_constraint,
-- pg_index, pg_trigger, pg_policy) e funções de introspecção (pg_get_functiondef,
-- pg_get_constraintdef, has_*_privilege, aclexplode). Nenhuma função de negócio é chamada.
-- Nenhuma linha de tabela de negócio é lida (nem contatos, nem telefones, nem revogações).
-- Não contém CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, TRUNCATE, GRANT, REVOKE, DO,
-- SET, BEGIN, COMMIT ou LOCK.
--
-- Referência embutida (em base64, para não ser alterada pelo editor e não conter SQL legível
-- de escrita): corpos das funções extraídos do arquivo
--   0011-R3_v4_whatsapp_campaigns_revoked_attempts.sql
--   (cópia usada: SHA-256 2f390ea215634971cac89fbce8b1f6ee378a0815bf7b4aceca1f0bc999537f32).
-- O hash identifica só a cópia de referência; NÃO prova o que está instalado. A prova vem
-- das comparações abaixo com o catálogo do banco.
--
-- COMO EXECUTAR: três blocos independentes (A, B, C). Se o SQL Editor mostrar apenas o
-- resultado da última instrução, selecione e execute um bloco por vez.
-- Compatível com PostgreSQL 16.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- BLOCO A — Resumo PASS / FAIL / REVIEW (consulta principal)
-- -------------------------------------------------------------------------------------
WITH
ref(k, ref_src) AS (
  VALUES
    ('claim',   convert_from(decode('CkRFQ0xBUkUKICBfY3MgdGV4dDsKICByIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cyVST1dUWVBFOwpCRUdJTgogIElGIGF1dGgudWlkKCkgSVMgTlVMTCBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICd1bmF1dGhvcml6ZWQnKTsgRU5EIElGOwogIElGIE5PVCBwdWJsaWMud2FfY2FtcGFpZ25fb3duX2FjdGl2ZV9hY2NvdW50KF9hY2NvdW50X2lkKSBUSEVOCiAgICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnYWNjb3VudF9ub3RfYWxsb3dlZCcpOwogIEVORCBJRjsKCiAgU0VMRUNUIHN0YXR1cyBJTlRPIF9jcyBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbnMgV0hFUkUgaWQgPSBfY2FtcGFpZ25faWQgRk9SIFNIQVJFOwogIElGIE5PVCBGT1VORCBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdjYW1wYWlnbl9ub3RfZm91bmQnKTsgRU5EIElGOwoKICAtLSBPIGxvY2sgZG8gY29udGF0byBzZXJpYWxpemEgY2xhaW0geCB1bmNsYWltIGRvIG1lc21vIGNvbnRhdG8uCiAgU0VMRUNUICogSU5UTyByIEZST00gcHVibGljLndoYXRzYXBwX2NhbXBhaWduX2NvbnRhY3RzCiAgIFdIRVJFIGlkID0gX2NvbnRhY3RfaWQgQU5EIGNhbXBhaWduX2lkID0gX2NhbXBhaWduX2lkCiAgIEZPUiBVUERBVEU7CiAgSUYgTk9UIEZPVU5EIFRIRU4gUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ2NvbnRhY3Rfbm90X2ZvdW5kJyk7IEVORCBJRjsKCiAgLS0gUjM6IHZlcmlmaWNhZG8gY29tIG8gY29udGF0byB0cmF2YWRvLCBhbnRlcyBkZSBxdWFscXVlciBvdXRyYSB0cmFuc2nDp8Ojby4KICBJRiBfYXR0ZW1wdF9pZCBJUyBOVUxMIE9SIEVYSVNUUyAoCiAgICAgICBTRUxFQ1QgMSBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9yZXZva2VkX2F0dGVtcHRzCiAgICAgICAgV0hFUkUgY29udGFjdF9pZCA9IF9jb250YWN0X2lkIEFORCBhdHRlbXB0X2lkID0gX2F0dGVtcHRfaWQpIFRIRU4KICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdhdHRlbXB0X3Jldm9rZWQnKTsKICBFTkQgSUY7CgogIElGIF9jcyA8PiAnYWN0aXZlJyBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdjYW1wYWlnbl9ub3RfYWN0aXZlJyk7IEVORCBJRjsKCiAgSUYgci5zdGF0dXMgPSAnc2VuZGluZycgVEhFTgogICAgSUYgci53aGF0c2FwcF9hY2NvdW50X2lkID0gX2FjY291bnRfaWQKICAgICAgIEFORCByLnJlc2VydmF0aW9uX2lkID0gX3Jlc2VydmF0aW9uX2lkCiAgICAgICBBTkQgci5zZW5kX2F0dGVtcHRfaWQgPSBfYXR0ZW1wdF9pZCBUSEVOCiAgICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgdHJ1ZSwgJ2FscmVhZHknLCB0cnVlKTsKICAgIEVORCBJRjsKICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdhbHJlYWR5X3NlbmRpbmcnKTsKICBFTkQgSUY7CiAgSUYgci5zdGF0dXMgSU4gKCdzZW50JywgJ2ZhaWxlZCcsICdjYW5jZWxsZWQnKSBUSEVOCiAgICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnYWxyZWFkeV9maW5hbGl6ZWQnKTsKICBFTkQgSUY7CiAgSUYgci5zdGF0dXMgPSAncGVuZGluZycgVEhFTgogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ3Jlc2VydmF0aW9uX2V4cGlyZWQnKTsKICBFTkQgSUY7CiAgSUYgci53aGF0c2FwcF9hY2NvdW50X2lkIElTIERJU1RJTkNUIEZST00gX2FjY291bnRfaWQKICAgICBPUiByLnJlc2VydmF0aW9uX2lkIElTIERJU1RJTkNUIEZST00gX3Jlc2VydmF0aW9uX2lkIFRIRU4KICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdyZXNlcnZhdGlvbl9taXNtYXRjaCcpOwogIEVORCBJRjsKICBJRiByLnJlc2VydmVkX2F0IElTIE5VTEwgT1Igci5yZXNlcnZlZF9hdCA8IG5vdygpIC0gaW50ZXJ2YWwgJzEwIG1pbnV0ZXMnIFRIRU4KICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdyZXNlcnZhdGlvbl9leHBpcmVkJyk7CiAgRU5EIElGOwoKICBVUERBVEUgcHVibGljLndoYXRzYXBwX2NhbXBhaWduX2NvbnRhY3RzCiAgICAgU0VUIHN0YXR1cyA9ICdzZW5kaW5nJywgc2VuZGluZ19hdCA9IG5vdygpLCBzZW5kX2F0dGVtcHRfaWQgPSBfYXR0ZW1wdF9pZAogICBXSEVSRSBpZCA9IF9jb250YWN0X2lkOwogIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgdHJ1ZSwgJ2FscmVhZHknLCBmYWxzZSk7CkVORCA=', 'base64'), 'UTF8')),
    ('unclaim', convert_from(decode('CkRFQ0xBUkUgciBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMlUk9XVFlQRTsKQkVHSU4KICBJRiBhdXRoLnVpZCgpIElTIE5VTEwgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAndW5hdXRob3JpemVkJyk7IEVORCBJRjsKICBJRiBOT1QgcHVibGljLndhX2NhbXBhaWduX293bl9hY2NvdW50KF9hY2NvdW50X2lkKSBUSEVOCiAgICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnYWNjb3VudF9ub3RfYWxsb3dlZCcpOwogIEVORCBJRjsKICBJRiBfYXR0ZW1wdF9pZCBJUyBOVUxMIFRIRU4gUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ2F0dGVtcHRfbWlzbWF0Y2gnKTsgRU5EIElGOwoKICBTRUxFQ1QgKiBJTlRPIHIgRlJPTSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMKICAgV0hFUkUgaWQgPSBfY29udGFjdF9pZCBBTkQgY2FtcGFpZ25faWQgPSBfY2FtcGFpZ25faWQKICAgRk9SIFVQREFURTsKICBJRiBOT1QgRk9VTkQgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnY29udGFjdF9ub3RfZm91bmQnKTsgRU5EIElGOwoKICBJRiByLnNlbmRfYXR0ZW1wdF9pZCA9IF9hdHRlbXB0X2lkIEFORCByLnN0YXR1cyBJTiAoJ3NlbnQnLCAnZmFpbGVkJykgVEhFTgogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ2FscmVhZHlfZmluYWxpemVkJyk7CiAgRU5EIElGOwoKICBJRiByLnN0YXR1cyA9ICdzZW5kaW5nJyBBTkQgci5zZW5kX2F0dGVtcHRfaWQgPSBfYXR0ZW1wdF9pZCBUSEVOCiAgICBJRiByLndoYXRzYXBwX2FjY291bnRfaWQgSVMgRElTVElOQ1QgRlJPTSBfYWNjb3VudF9pZAogICAgICAgT1Igci5yZXNlcnZhdGlvbl9pZCBJUyBESVNUSU5DVCBGUk9NIF9yZXNlcnZhdGlvbl9pZCBUSEVOCiAgICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdhdHRlbXB0X21pc21hdGNoJyk7CiAgICBFTkQgSUY7CiAgICBJTlNFUlQgSU5UTyBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fcmV2b2tlZF9hdHRlbXB0cwogICAgICAoY29udGFjdF9pZCwgYXR0ZW1wdF9pZCwgY2FtcGFpZ25faWQsIHdoYXRzYXBwX2FjY291bnRfaWQsIHJlc2VydmF0aW9uX2lkKQogICAgVkFMVUVTIChfY29udGFjdF9pZCwgX2F0dGVtcHRfaWQsIF9jYW1wYWlnbl9pZCwgX2FjY291bnRfaWQsIF9yZXNlcnZhdGlvbl9pZCkKICAgIE9OIENPTkZMSUNUIERPIE5PVEhJTkc7CiAgICBVUERBVEUgcHVibGljLndoYXRzYXBwX2NhbXBhaWduX2NvbnRhY3RzCiAgICAgICBTRVQgc3RhdHVzID0gJ3Jlc2VydmVkJywgc2VuZGluZ19hdCA9IE5VTEwsIHNlbmRfYXR0ZW1wdF9pZCA9IE5VTEwKICAgICBXSEVSRSBpZCA9IF9jb250YWN0X2lkOwogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCB0cnVlLCAnYWxyZWFkeScsIGZhbHNlKTsKICBFTkQgSUY7CgogIC0tIFIzICh2Myk6IHPDsyByZXZvZ2Egc2UgYSBjaGFtYWRhIGRldMOpbSBhIHBvc3NlIGF0dWFsIGRvIGNvbnRhdG8KICAtLSAobWVzbWEgY29udGEgRSBtZXNtYSByZXNlcnZhKS4gU2VtIGlzc28sIG91dHJhIGNvbnRhL3VzdcOhcmlvIHF1ZSBhZGl2aW5oYXNzZQogIC0tIG8gYXR0ZW1wdElkIHBvZGVyaWEgcmV2b2fDoS1sbyBlIGJsb3F1ZWFyIG8gZW52aW8gbGVnw610aW1vLgogIElGIHIud2hhdHNhcHBfYWNjb3VudF9pZCBJUyBESVNUSU5DVCBGUk9NIF9hY2NvdW50X2lkCiAgICAgT1Igci5yZXNlcnZhdGlvbl9pZCBJUyBESVNUSU5DVCBGUk9NIF9yZXNlcnZhdGlvbl9pZCBUSEVOCiAgICBJRiByLnN0YXR1cyBJTiAoJ3Jlc2VydmVkJywgJ3NlbmRpbmcnKSBUSEVOCiAgICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdhdHRlbXB0X21pc21hdGNoJyk7CiAgICBFTkQgSUY7CiAgICAtLSBwZW5kaW5nL2NhbmNlbGxlZC9zZW50L2ZhaWxlZCBzZW0gcG9zc2U6IG5hZGEgYSBkZXNmYXplciwgbmFkYSByZWdpc3RyYWRvIChjb250cmF0byBkYSAwMDA4KS4KICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgdHJ1ZSwgJ2FscmVhZHknLCB0cnVlKTsKICBFTkQgSUY7CgogIC0tIFIzICh2NCk6IHNlbSBwb3NzZSBhdGl2YSAocGVuZGluZy9zZW50L2ZhaWxlZC9jYW5jZWxsZWQpIG7Do28gaMOhIG8gcXVlIHByb3RlZ2VyOgogIC0tIHJlc3BvbmRlIG9rL2FscmVhZHkgc2VtIHJlZ2lzdHJhciByZXZvZ2HDp8Ojby4KICBJRiByLnN0YXR1cyBOT1QgSU4gKCdyZXNlcnZlZCcsICdzZW5kaW5nJykgVEhFTgogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCB0cnVlLCAnYWxyZWFkeScsIHRydWUpOwogIEVORCBJRjsKCiAgLS0gVW5jbGFpbSBhbnRlY2lwYWRvIGxlZ8OtdGltbyAocmVzZXJ2ZWQsIG91IHNlbmRpbmcgZGUgT1VUUkEgdGVudGF0aXZhLCBjb20gY29udGEgZQogIC0tIHJlc2VydmEgZGEgcG9zc2UgYXR1YWwpOiBuYWRhIGEgZGVzZmF6ZXIgYWdvcmEsIG1hcyBhIHRlbnRhdGl2YSBmaWNhIHJldm9nYWRhLgogIElOU0VSVCBJTlRPIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9yZXZva2VkX2F0dGVtcHRzCiAgICAoY29udGFjdF9pZCwgYXR0ZW1wdF9pZCwgY2FtcGFpZ25faWQsIHdoYXRzYXBwX2FjY291bnRfaWQsIHJlc2VydmF0aW9uX2lkKQogIFZBTFVFUyAoX2NvbnRhY3RfaWQsIF9hdHRlbXB0X2lkLCBfY2FtcGFpZ25faWQsIF9hY2NvdW50X2lkLCBfcmVzZXJ2YXRpb25faWQpCiAgT04gQ09ORkxJQ1QgRE8gTk9USElORzsKICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIHRydWUsICdhbHJlYWR5JywgdHJ1ZSk7CkVORCA=', 'base64'), 'UTF8'))
),
fn AS (
  SELECT 'claim'::text AS k, to_regprocedure('public.wa_campaign_claim(uuid,uuid,uuid,uuid,uuid)') AS foid
  UNION ALL
  SELECT 'unclaim', to_regprocedure('public.wa_campaign_unclaim(uuid,uuid,uuid,uuid,uuid)')
),
fd AS (
  SELECT f.k, f.foid, p.prosrc, p.prosecdef, p.proconfig, l.lanname,
         p.prorettype::regtype::text AS rettype,
         pg_get_function_identity_arguments(p.oid) AS identargs,
         p.provolatile, p.proisstrict, p.proleakproof, p.proparallel, p.prokind,
         p.proowner, pg_get_userbyid(p.proowner) AS owner_name, p.proacl,
         r.ref_src,
         btrim(regexp_replace(regexp_replace(replace(coalesce(p.prosrc, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_live,
         btrim(regexp_replace(regexp_replace(replace(coalesce(r.ref_src, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_ref
  FROM fn f
  JOIN ref r USING (k)
  LEFT JOIN pg_catalog.pg_proc p ON p.oid = f.foid
  LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
),
mk(k, mid, descr, pat, expected) AS (
  VALUES
    ('claim', 'M1', $d$consulta a tabela de revogações$d$, $p$FROM public.whatsapp_campaign_revoked_attempts WHERE contact_id = _contact_id AND attempt_id = _attempt_id$p$, 1),
    ('claim', 'M2', $d$devolve attempt_revoked$d$, $p$'error', 'attempt_revoked'$p$, 1),
    ('claim', 'M3', $d$attemptId nulo também é recusado$d$, $p$IF _attempt_id IS NULL OR EXISTS ($p$, 1),
    ('claim', 'M4', $d$posse da conta exige conta ativa$d$, $p$IF NOT public.wa_campaign_own_active_account(_account_id) THEN$p$, 1),
    ('claim', 'M5', $d$contato travado com FOR UPDATE$d$, $p$WHERE id = _contact_id AND campaign_id = _campaign_id FOR UPDATE;$p$, 1),
    ('claim', 'M6', $d$validade de 10 minutos da reserva$d$, $p$r.reserved_at < now() - interval '10 minutes'$p$, 1),
    ('claim', 'M7', $d$transição reserved -> sending$d$, $p$SET status = 'sending', sending_at = now(), send_attempt_id = _attempt_id$p$, 1),
    ('unclaim', 'U1', $d$duas gravações em revoked_attempts$d$, $p$INSERT INTO public.whatsapp_campaign_revoked_attempts (contact_id, attempt_id, campaign_id, whatsapp_account_id, reservation_id) VALUES (_contact_id, _attempt_id, _campaign_id, _account_id, _reservation_id) ON CONFLICT DO NOTHING;$p$, 2),
    ('unclaim', 'U2', $d$attemptId nulo -> attempt_mismatch$d$, $p$IF _attempt_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'attempt_mismatch'); END IF;$p$, 1),
    ('unclaim', 'U3', $d$v3: sem posse não revoga$d$, $p$IF r.whatsapp_account_id IS DISTINCT FROM _account_id OR r.reservation_id IS DISTINCT FROM _reservation_id THEN IF r.status IN ('reserved', 'sending') THEN$p$, 1),
    ('unclaim', 'U4', $d$v4: sem posse ativa responde already sem registrar$d$, $p$IF r.status NOT IN ('reserved', 'sending') THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;$p$, 1),
    ('unclaim', 'U5', $d$posse sem exigir conta ativa$d$, $p$IF NOT public.wa_campaign_own_account(_account_id) THEN$p$, 1),
    ('unclaim', 'U6', $d$transição sending -> reserved$d$, $p$SET status = 'reserved', sending_at = NULL, send_attempt_id = NULL$p$, 1)
),
mk_eval AS (
  SELECT mk.*, CASE WHEN fd.n_live = '' THEN 0
                    ELSE (length(fd.n_live) - length(replace(fd.n_live, mk.pat, ''))) / length(mk.pat) END AS found
  FROM mk JOIN fd USING (k)
),
tbl AS (
  SELECT to_regclass('public.whatsapp_campaign_revoked_attempts') AS toid, to_regclass('public.whatsapp_campaign_contacts') AS coid
),
tinfo AS (
  SELECT t.toid, t.coid, c.relowner, pg_get_userbyid(c.relowner) AS owner_name,
         c.relrowsecurity, c.relforcerowsecurity, c.relacl, c.relkind,
         cc.relowner AS contacts_owner, pg_get_userbyid(cc.relowner) AS contacts_owner_name
  FROM tbl t
  LEFT JOIN pg_catalog.pg_class c  ON c.oid  = t.toid
  LEFT JOIN pg_catalog.pg_class cc ON cc.oid = t.coid
),
cols AS (
  SELECT string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                    || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''),
                    ', ' ORDER BY a.attnum) AS live_ordered,
         string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                    || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''),
                    ', ' ORDER BY a.attname) AS live_sorted
  FROM tbl t
  JOIN pg_catalog.pg_attribute a ON a.attrelid = t.toid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
),
expected_cols AS (
  SELECT $e$contact_id uuid NOT NULL, attempt_id uuid NOT NULL, campaign_id uuid NOT NULL, whatsapp_account_id uuid, reservation_id uuid, revoked_at timestamp with time zone NOT NULL DEFAULT now()$e$::text AS exp_ordered,
         (SELECT string_agg(x, ', ' ORDER BY x) FROM unnest(string_to_array($e$contact_id uuid NOT NULL, attempt_id uuid NOT NULL, campaign_id uuid NOT NULL, whatsapp_account_id uuid, reservation_id uuid, revoked_at timestamp with time zone NOT NULL DEFAULT now()$e$, ', ')) x) AS exp_sorted
),
pk AS (
  SELECT (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS cols,
         pg_get_constraintdef(con.oid) AS def
  FROM tbl t JOIN pg_catalog.pg_constraint con ON con.conrelid = t.toid AND con.contype = 'p'
),
fk AS (
  SELECT con.confrelid, con.confdeltype, con.confupdtype, con.convalidated,
         (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS cols,
         (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS refcols,
         pg_get_constraintdef(con.oid) AS def
  FROM tbl t JOIN pg_catalog.pg_constraint con ON con.conrelid = t.toid AND con.contype = 'f'
),
roles(rname, exp_fn_exec) AS (
  VALUES ('anon', false), ('authenticated', true), ('service_role', true)
),
checks(ordem, area, item, status, esperado, encontrado, observacao) AS (

  -- ===================== FUNÇÕES: existência, assinatura e atributos =====================
  SELECT 10 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'existe com a assinatura (uuid x5)',
         CASE WHEN fd.foid IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
         'public.wa_campaign_' || fd.k || '(uuid,uuid,uuid,uuid,uuid)',
         coalesce(fd.foid::regprocedure::text, 'não encontrada'), NULL
  FROM fd
  UNION ALL
  SELECT 12 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'sem sobrecargas com o mesmo nome em public',
         CASE WHEN n = 1 THEN 'PASS' WHEN n = 0 THEN 'FAIL' ELSE 'REVIEW' END, '1', n::text,
         'Mais de uma versão com o mesmo nome não quebra a assinatura usada pelo CRM, mas precisa ser explicada.'
  FROM fd CROSS JOIN LATERAL (
    SELECT count(*) AS n FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = 'wa_campaign_' || fd.k) c
  UNION ALL
  SELECT 14 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'nomes e tipos dos parâmetros',
         CASE WHEN fd.identargs = $a$_contact_id uuid, _campaign_id uuid, _account_id uuid, _reservation_id uuid, _attempt_id uuid$a$ THEN 'PASS' ELSE 'FAIL' END,
         $a$_contact_id uuid, _campaign_id uuid, _account_id uuid, _reservation_id uuid, _attempt_id uuid$a$, coalesce(fd.identargs, '—'), NULL
  FROM fd
  UNION ALL
  SELECT 16 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'SECURITY DEFINER',
         CASE WHEN fd.prosecdef IS TRUE THEN 'PASS' ELSE 'FAIL' END, 'true', coalesce(fd.prosecdef::text, '—'), NULL
  FROM fd
  UNION ALL
  SELECT 18 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'SET search_path',
         CASE WHEN fd.proconfig = ARRAY['search_path=public'] THEN 'PASS'
              WHEN fd.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(fd.proconfig) c WHERE c LIKE 'search_path=%') THEN 'FAIL'
              ELSE 'REVIEW' END,
         '{search_path=public}', coalesce(fd.proconfig::text, 'nenhum'),
         'REVIEW = search_path definido, mas diferente da referência; avaliar se é intencional.'
  FROM fd
  UNION ALL
  SELECT 20 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'linguagem, retorno, tipo e volatilidade',
         CASE WHEN fd.lanname = 'plpgsql' AND fd.rettype = 'jsonb' AND fd.prokind = 'f' AND fd.provolatile = 'v'
                   AND fd.proisstrict IS FALSE THEN 'PASS' ELSE 'FAIL' END,
         'plpgsql / jsonb / função / VOLATILE / não STRICT',
         coalesce(fd.lanname, '—') || ' / ' || coalesce(fd.rettype, '—') || ' / ' || coalesce(fd.prokind::text, '—')
           || ' / ' || coalesce(fd.provolatile::text, '—') || ' / strict=' || coalesce(fd.proisstrict::text, '—'), NULL
  FROM fd

  -- ===================== FUNÇÕES: corpo =====================
  UNION ALL
  SELECT 30 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'corpo comparado com a referência (byte a byte; formatação separada)',
         CASE WHEN fd.prosrc = fd.ref_src THEN 'PASS'
              WHEN fd.n_live = fd.n_ref AND fd.n_live <> '' THEN 'PASS'
              ELSE 'REVIEW' END,
         'md5 ' || md5(fd.ref_src), coalesce('md5 ' || md5(fd.prosrc), 'sem corpo'),
         CASE WHEN fd.prosrc = fd.ref_src THEN 'Idêntico, inclusive espaços e comentários.'
              WHEN fd.n_live = fd.n_ref THEN 'Diferença só de formatação/comentários: o corpo normalizado é idêntico (ver item seguinte).'
              ELSE 'Diferente. Ver o item normalizado e o Bloco B para localizar a diferença.' END
  FROM fd
  UNION ALL
  SELECT 32 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'corpo normalizado idêntico (sem comentários --, espaços colapsados)',
         CASE WHEN fd.n_live = fd.n_ref AND fd.n_live <> '' THEN 'PASS'
              WHEN EXISTS (SELECT 1 FROM mk_eval m WHERE m.k = fd.k AND m.found <> m.expected) THEN 'FAIL'
              ELSE 'REVIEW' END,
         'md5 ' || md5(fd.n_ref), CASE WHEN fd.n_live = '' THEN 'sem corpo' ELSE 'md5 ' || md5(fd.n_live) END,
         CASE WHEN fd.n_live = fd.n_ref AND fd.n_live <> '' THEN 'Diferenças, se houver, são apenas de formatação.'
              WHEN EXISTS (SELECT 1 FROM mk_eval m WHERE m.k = fd.k AND m.found <> m.expected) THEN 'Diferença funcional: há marcador de lógica ausente (itens 40+).'
              ELSE 'Corpo diferente, mas todos os marcadores de lógica presentes. Comparar manualmente no Bloco B.' END
  FROM fd

  -- ===================== FUNÇÕES: marcadores da lógica R3 =====================
  UNION ALL
  SELECT 40 + row_number() OVER (ORDER BY m.k, m.mid), 'lógica ' || m.k, m.mid || ' ' || m.descr,
         CASE WHEN m.found = m.expected THEN 'PASS' ELSE 'FAIL' END,
         m.expected::text || ' ocorrência(s)', m.found::text || ' ocorrência(s)',
         'Trecho procurado (normalizado): ' || left(m.pat, 160)
  FROM mk_eval m
  UNION ALL
  SELECT 60, 'lógica claim', 'ordem: trava do contato → revogação → campanha ativa',
         CASE WHEN p1 > 0 AND p1 < p2 AND p2 < p3 THEN 'PASS' ELSE 'FAIL' END,
         'FOR UPDATE < revoked_attempts < IF _cs <> ''active''',
         'posições ' || p1 || ' / ' || p2 || ' / ' || p3,
         'A 0011 exige que a revogação seja checada com o contato travado e antes de qualquer outra transição.'
  FROM fd CROSS JOIN LATERAL (
    SELECT strpos(fd.n_live, 'FOR UPDATE;') AS p1,
           strpos(fd.n_live, 'whatsapp_campaign_revoked_attempts') AS p2,
           strpos(fd.n_live, 'IF _cs <> ''active''') AS p3) x
  WHERE fd.k = 'claim'

  -- ===================== FUNÇÕES: dependências e dono =====================
  UNION ALL
  SELECT 70, 'dependências', 'wa_campaign_own_active_account(uuid) e wa_campaign_own_account(uuid) existem',
         CASE WHEN to_regprocedure('public.wa_campaign_own_active_account(uuid)') IS NOT NULL
               AND to_regprocedure('public.wa_campaign_own_account(uuid)') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
         'ambas', coalesce(to_regprocedure('public.wa_campaign_own_active_account(uuid)')::text, 'own_active_account ausente')
           || ' | ' || coalesce(to_regprocedure('public.wa_campaign_own_account(uuid)')::text, 'own_account ausente'), NULL
  UNION ALL
  SELECT 71 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'dono da função é membro do dono de whatsapp_campaign_contacts',
         CASE WHEN fd.proowner IS NULL OR ti.contacts_owner IS NULL THEN 'FAIL'
              WHEN pg_has_role(fd.proowner, ti.contacts_owner, 'MEMBER') THEN 'PASS' ELSE 'FAIL' END,
         'membro de ' || coalesce(ti.contacts_owner_name, '?'), coalesce(fd.owner_name, '—'),
         'Necessário para a guarda da 0010 tratar o UPDATE da RPC como privilegiado.'
  FROM fd CROSS JOIN tinfo ti
  UNION ALL
  SELECT 73 + (fd.k = 'unclaim')::int, 'função ' || fd.k, 'dono da função lê e grava revoked_attempts',
         CASE WHEN fd.proowner IS NULL OR ti.toid IS NULL THEN 'FAIL'
              WHEN has_table_privilege(fd.proowner, ti.toid, 'SELECT') AND has_table_privilege(fd.proowner, ti.toid, 'INSERT') THEN 'PASS'
              ELSE 'FAIL' END,
         'SELECT e INSERT', coalesce(fd.owner_name, '—'), NULL
  FROM fd CROSS JOIN tinfo ti

  -- ===================== FUNÇÕES: EXECUTE =====================
  UNION ALL
  SELECT 80 + (fd.k = 'unclaim')::int * 4, 'EXECUTE ' || fd.k, 'PUBLIC',
         CASE WHEN fd.foid IS NULL THEN 'FAIL'
              WHEN EXISTS (SELECT 1 FROM aclexplode(coalesce(fd.proacl, acldefault('f', fd.proowner))) a
                            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN 'FAIL' ELSE 'PASS' END,
         'sem EXECUTE', CASE WHEN fd.proacl IS NULL THEN 'ACL padrão (PUBLIC tem EXECUTE)' ELSE fd.proacl::text END, NULL
  FROM fd
  UNION ALL
  SELECT 81 + (fd.k = 'unclaim')::int * 4 + (r.rname = 'authenticated')::int + 2 * (r.rname = 'service_role')::int,
         'EXECUTE ' || fd.k, r.rname,
         CASE WHEN fd.foid IS NULL OR to_regrole(r.rname) IS NULL THEN 'REVIEW'
              WHEN has_function_privilege(r.rname, fd.foid, 'EXECUTE') = r.exp_fn_exec THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN r.exp_fn_exec THEN 'com EXECUTE' ELSE 'sem EXECUTE' END,
         CASE WHEN to_regrole(r.rname) IS NULL THEN 'papel não existe'
              WHEN fd.foid IS NULL THEN 'função ausente'
              WHEN has_function_privilege(r.rname, fd.foid, 'EXECUTE') THEN 'com EXECUTE' ELSE 'sem EXECUTE' END,
         'Considera grants diretos, via PUBLIC e via herança de papéis.'
  FROM fd CROSS JOIN roles r

  -- ===================== TABELA whatsapp_campaign_revoked_attempts =====================
  UNION ALL
  SELECT 100, 'tabela', 'existe como tabela comum em public',
         CASE WHEN ti.toid IS NOT NULL AND ti.relkind = 'r' THEN 'PASS' ELSE 'FAIL' END,
         'public.whatsapp_campaign_revoked_attempts (relkind r)',
         coalesce(ti.toid::regclass::text || ' (relkind ' || ti.relkind::text || ')', 'não encontrada'), NULL
  FROM tinfo ti
  UNION ALL
  SELECT 101, 'tabela', 'colunas, tipos, NOT NULL e defaults',
         CASE WHEN c.live_ordered = e.exp_ordered THEN 'PASS'
              WHEN c.live_sorted = e.exp_sorted THEN 'REVIEW'
              ELSE 'FAIL' END,
         e.exp_ordered, coalesce(c.live_ordered, 'sem colunas'),
         CASE WHEN c.live_ordered = e.exp_ordered THEN NULL
              WHEN c.live_sorted = e.exp_sorted THEN 'Mesmo conjunto, ordem diferente: não funcional, mas indica que a tabela não veio deste SQL.'
              ELSE 'Diferença funcional. Atenção: CREATE TABLE IF NOT EXISTS mantém uma tabela antiga (ex.: de v1–v3) sem avisar.' END
  FROM expected_cols e LEFT JOIN cols c ON true
  UNION ALL
  SELECT 102, 'tabela', 'chave primária (contact_id, attempt_id)',
         CASE WHEN (SELECT count(*) FROM pk) = 1 AND (SELECT cols FROM pk) = ARRAY['contact_id','attempt_id'] THEN 'PASS' ELSE 'FAIL' END,
         'PRIMARY KEY (contact_id, attempt_id)', coalesce((SELECT string_agg(def, ' | ') FROM pk), 'sem PK'), NULL
  UNION ALL
  SELECT 103, 'tabela', 'FK contact_id → whatsapp_campaign_contacts(id) ON DELETE CASCADE',
         CASE WHEN (SELECT count(*) FROM fk) = 1
               AND EXISTS (SELECT 1 FROM fk, tbl t WHERE fk.confrelid = t.coid AND fk.cols = ARRAY['contact_id']
                             AND fk.refcols = ARRAY['id'] AND fk.confdeltype = 'c' AND fk.confupdtype = 'a' AND fk.convalidated)
              THEN 'PASS'
              WHEN EXISTS (SELECT 1 FROM fk, tbl t WHERE fk.confrelid = t.coid AND fk.cols = ARRAY['contact_id']
                             AND fk.refcols = ARRAY['id'] AND fk.confdeltype = 'c') THEN 'REVIEW'
              ELSE 'FAIL' END,
         'exatamente 1 FK, CASCADE no delete, NO ACTION no update, validada',
         coalesce((SELECT string_agg(def || ' [validada=' || convalidated || ']', ' | ') FROM fk), 'sem FK'),
         'REVIEW = FK correta presente, mas há FK extra ou atributo diferente.'
  UNION ALL
  SELECT 104, 'tabela', 'nenhuma outra restrição (CHECK/UNIQUE/EXCLUDE)',
         CASE WHEN (SELECT toid FROM tbl) IS NULL THEN 'FAIL' WHEN n = 0 THEN 'PASS' ELSE 'REVIEW' END, '0', n::text, 'Restrição extra não está na referência.'
  FROM (SELECT count(*) AS n FROM tbl t JOIN pg_catalog.pg_constraint con
          ON con.conrelid = t.toid AND con.contype NOT IN ('p','f')) x
  UNION ALL
  SELECT 105, 'tabela', 'índices (só o da PK)',
         CASE WHEN (SELECT toid FROM tbl) IS NULL THEN 'FAIL' WHEN n = 1 THEN 'PASS' ELSE 'REVIEW' END, '1', n::text, 'Índice extra não é funcionalmente perigoso; não está na referência.'
  FROM (SELECT count(*) AS n FROM tbl t JOIN pg_catalog.pg_index i ON i.indrelid = t.toid) x
  UNION ALL
  SELECT 106, 'tabela', 'nenhum trigger',
         CASE WHEN (SELECT toid FROM tbl) IS NULL THEN 'FAIL' WHEN n = 0 THEN 'PASS' ELSE 'REVIEW' END, '0', n::text, NULL
  FROM (SELECT count(*) AS n FROM tbl t JOIN pg_catalog.pg_trigger tg ON tg.tgrelid = t.toid AND NOT tg.tgisinternal) x
  UNION ALL
  SELECT 107, 'tabela', 'dono',
         CASE WHEN ti.relowner IS NULL THEN 'FAIL'
              WHEN ti.relowner = ti.contacts_owner THEN 'PASS' ELSE 'REVIEW' END,
         'mesmo dono de whatsapp_campaign_contacts (' || coalesce(ti.contacts_owner_name, '?') || ')',
         coalesce(ti.owner_name, '—'), 'A referência não fixa o dono; PASS = mesmo dono das tabelas de campanha.'
  FROM tinfo ti
  UNION ALL
  SELECT 108, 'tabela', 'RLS habilitado e não forçado',
         CASE WHEN ti.relrowsecurity IS TRUE AND ti.relforcerowsecurity IS FALSE THEN 'PASS' ELSE 'FAIL' END,
         'relrowsecurity=true, relforcerowsecurity=false',
         'relrowsecurity=' || coalesce(ti.relrowsecurity::text, '—') || ', relforcerowsecurity=' || coalesce(ti.relforcerowsecurity::text, '—'),
         'Se o RLS fosse forçado, até o dono ficaria sem acesso (não há política) e a revogação deixaria de ser vista.'
  FROM tinfo ti
  UNION ALL
  SELECT 109, 'tabela', 'nenhuma política RLS',
         CASE WHEN (SELECT toid FROM tbl) IS NULL THEN 'FAIL' WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, '0', n::text,
         'Qualquer política abriria acesso que a 0011 deixou fechado de propósito.'
  FROM (SELECT count(*) AS n FROM tbl t JOIN pg_catalog.pg_policy po ON po.polrelid = t.toid) x
  UNION ALL
  SELECT 110, 'tabela', 'comentário da tabela',
         CASE WHEN obj_description(ti.toid, 'pg_class') = $c$R3: attemptIds revogados por unclaim. Lido/escrito somente pelas funções SECURITY DEFINER de claim/unclaim.$c$ THEN 'PASS' ELSE 'REVIEW' END,
         'comentário da 0011', coalesce(obj_description(ti.toid, 'pg_class'), 'sem comentário'), 'Não funcional; ajuda a identificar a origem.'
  FROM tinfo ti

  -- ===================== TABELA: privilégios =====================
  UNION ALL
  SELECT 120, 'privilégios tabela', 'PUBLIC sem nenhum privilégio',
         CASE WHEN ti.toid IS NULL THEN 'FAIL'
              WHEN EXISTS (SELECT 1 FROM aclexplode(coalesce(ti.relacl, acldefault('r', ti.relowner))) a WHERE a.grantee = 0) THEN 'FAIL'
              ELSE 'PASS' END,
         'nenhum', coalesce(ti.relacl::text, 'ACL padrão'), NULL
  FROM tinfo ti
  UNION ALL
  SELECT 121 + (r.rname = 'authenticated')::int, 'privilégios tabela', r.rname || ' sem nenhum privilégio (tabela e colunas)',
         CASE WHEN ti.toid IS NULL OR to_regrole(r.rname) IS NULL THEN 'REVIEW'
              WHEN has_table_privilege(r.rname, ti.toid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                OR has_any_column_privilege(r.rname, ti.toid, 'SELECT, INSERT, UPDATE, REFERENCES') THEN 'FAIL'
              ELSE 'PASS' END,
         'nenhum',
         CASE WHEN to_regrole(r.rname) IS NULL THEN 'papel não existe'
              WHEN ti.toid IS NULL THEN 'tabela ausente'
              ELSE concat_ws(', ',
                CASE WHEN has_table_privilege(r.rname, ti.toid, 'SELECT') THEN 'SELECT' END,
                CASE WHEN has_table_privilege(r.rname, ti.toid, 'INSERT') THEN 'INSERT' END,
                CASE WHEN has_table_privilege(r.rname, ti.toid, 'UPDATE') THEN 'UPDATE' END,
                CASE WHEN has_table_privilege(r.rname, ti.toid, 'DELETE') THEN 'DELETE' END,
                CASE WHEN has_table_privilege(r.rname, ti.toid, 'TRUNCATE') THEN 'TRUNCATE' END,
                CASE WHEN has_table_privilege(r.rname, ti.toid, 'REFERENCES') THEN 'REFERENCES' END,
                CASE WHEN has_table_privilege(r.rname, ti.toid, 'TRIGGER') THEN 'TRIGGER' END,
                CASE WHEN has_any_column_privilege(r.rname, ti.toid, 'SELECT, INSERT, UPDATE, REFERENCES') THEN 'privilégio de coluna' END) END,
         NULL
  FROM tinfo ti CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rname)
  UNION ALL
  SELECT 123, 'privilégios tabela', 'service_role com todos os privilégios (GRANT ALL)',
         CASE WHEN ti.toid IS NULL OR to_regrole('service_role') IS NULL THEN 'REVIEW'
              WHEN has_table_privilege('service_role', ti.toid, 'SELECT') AND has_table_privilege('service_role', ti.toid, 'INSERT')
               AND has_table_privilege('service_role', ti.toid, 'UPDATE') AND has_table_privilege('service_role', ti.toid, 'DELETE')
               AND has_table_privilege('service_role', ti.toid, 'TRUNCATE') AND has_table_privilege('service_role', ti.toid, 'REFERENCES')
               AND has_table_privilege('service_role', ti.toid, 'TRIGGER') THEN 'PASS'
              ELSE 'REVIEW' END,
         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER', coalesce(ti.relacl::text, 'ACL padrão'),
         'REVIEW = service_role com menos que a referência. Mais restrito não abre brecha, mas difere do SQL fornecido.'
  FROM tinfo ti
)
SELECT ordem, area, item, status, esperado, encontrado, observacao
FROM (
  SELECT 0 AS ordem, 'RESULTADO GERAL' AS area, 'P6 — 0011-R3 v4 instalada confere com a referência' AS item,
         CASE WHEN bool_or(status = 'FAIL') THEN 'FAIL' WHEN bool_or(status = 'REVIEW') THEN 'REVIEW' ELSE 'PASS' END AS status,
         'todos PASS' AS esperado,
         count(*) FILTER (WHERE status = 'PASS') || ' PASS / ' || count(*) FILTER (WHERE status = 'FAIL') || ' FAIL / '
           || count(*) FILTER (WHERE status = 'REVIEW') || ' REVIEW' AS encontrado,
         'Ver itens FAIL e REVIEW abaixo.' AS observacao
  FROM checks
  UNION ALL
  SELECT * FROM checks
) z
ORDER BY ordem, area, item;

-- -------------------------------------------------------------------------------------
-- BLOCO B — Definições instaladas e localização da primeira diferença (revisão manual)
-- Use quando o Bloco A mostrar REVIEW/FAIL nos itens 30–33.
-- -------------------------------------------------------------------------------------
WITH
ref(k, ref_src) AS (
  VALUES
    ('claim',   convert_from(decode('CkRFQ0xBUkUKICBfY3MgdGV4dDsKICByIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cyVST1dUWVBFOwpCRUdJTgogIElGIGF1dGgudWlkKCkgSVMgTlVMTCBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICd1bmF1dGhvcml6ZWQnKTsgRU5EIElGOwogIElGIE5PVCBwdWJsaWMud2FfY2FtcGFpZ25fb3duX2FjdGl2ZV9hY2NvdW50KF9hY2NvdW50X2lkKSBUSEVOCiAgICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnYWNjb3VudF9ub3RfYWxsb3dlZCcpOwogIEVORCBJRjsKCiAgU0VMRUNUIHN0YXR1cyBJTlRPIF9jcyBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbnMgV0hFUkUgaWQgPSBfY2FtcGFpZ25faWQgRk9SIFNIQVJFOwogIElGIE5PVCBGT1VORCBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdjYW1wYWlnbl9ub3RfZm91bmQnKTsgRU5EIElGOwoKICAtLSBPIGxvY2sgZG8gY29udGF0byBzZXJpYWxpemEgY2xhaW0geCB1bmNsYWltIGRvIG1lc21vIGNvbnRhdG8uCiAgU0VMRUNUICogSU5UTyByIEZST00gcHVibGljLndoYXRzYXBwX2NhbXBhaWduX2NvbnRhY3RzCiAgIFdIRVJFIGlkID0gX2NvbnRhY3RfaWQgQU5EIGNhbXBhaWduX2lkID0gX2NhbXBhaWduX2lkCiAgIEZPUiBVUERBVEU7CiAgSUYgTk9UIEZPVU5EIFRIRU4gUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ2NvbnRhY3Rfbm90X2ZvdW5kJyk7IEVORCBJRjsKCiAgLS0gUjM6IHZlcmlmaWNhZG8gY29tIG8gY29udGF0byB0cmF2YWRvLCBhbnRlcyBkZSBxdWFscXVlciBvdXRyYSB0cmFuc2nDp8Ojby4KICBJRiBfYXR0ZW1wdF9pZCBJUyBOVUxMIE9SIEVYSVNUUyAoCiAgICAgICBTRUxFQ1QgMSBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9yZXZva2VkX2F0dGVtcHRzCiAgICAgICAgV0hFUkUgY29udGFjdF9pZCA9IF9jb250YWN0X2lkIEFORCBhdHRlbXB0X2lkID0gX2F0dGVtcHRfaWQpIFRIRU4KICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdhdHRlbXB0X3Jldm9rZWQnKTsKICBFTkQgSUY7CgogIElGIF9jcyA8PiAnYWN0aXZlJyBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdjYW1wYWlnbl9ub3RfYWN0aXZlJyk7IEVORCBJRjsKCiAgSUYgci5zdGF0dXMgPSAnc2VuZGluZycgVEhFTgogICAgSUYgci53aGF0c2FwcF9hY2NvdW50X2lkID0gX2FjY291bnRfaWQKICAgICAgIEFORCByLnJlc2VydmF0aW9uX2lkID0gX3Jlc2VydmF0aW9uX2lkCiAgICAgICBBTkQgci5zZW5kX2F0dGVtcHRfaWQgPSBfYXR0ZW1wdF9pZCBUSEVOCiAgICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgdHJ1ZSwgJ2FscmVhZHknLCB0cnVlKTsKICAgIEVORCBJRjsKICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdhbHJlYWR5X3NlbmRpbmcnKTsKICBFTkQgSUY7CiAgSUYgci5zdGF0dXMgSU4gKCdzZW50JywgJ2ZhaWxlZCcsICdjYW5jZWxsZWQnKSBUSEVOCiAgICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnYWxyZWFkeV9maW5hbGl6ZWQnKTsKICBFTkQgSUY7CiAgSUYgci5zdGF0dXMgPSAncGVuZGluZycgVEhFTgogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ3Jlc2VydmF0aW9uX2V4cGlyZWQnKTsKICBFTkQgSUY7CiAgSUYgci53aGF0c2FwcF9hY2NvdW50X2lkIElTIERJU1RJTkNUIEZST00gX2FjY291bnRfaWQKICAgICBPUiByLnJlc2VydmF0aW9uX2lkIElTIERJU1RJTkNUIEZST00gX3Jlc2VydmF0aW9uX2lkIFRIRU4KICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdyZXNlcnZhdGlvbl9taXNtYXRjaCcpOwogIEVORCBJRjsKICBJRiByLnJlc2VydmVkX2F0IElTIE5VTEwgT1Igci5yZXNlcnZlZF9hdCA8IG5vdygpIC0gaW50ZXJ2YWwgJzEwIG1pbnV0ZXMnIFRIRU4KICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdyZXNlcnZhdGlvbl9leHBpcmVkJyk7CiAgRU5EIElGOwoKICBVUERBVEUgcHVibGljLndoYXRzYXBwX2NhbXBhaWduX2NvbnRhY3RzCiAgICAgU0VUIHN0YXR1cyA9ICdzZW5kaW5nJywgc2VuZGluZ19hdCA9IG5vdygpLCBzZW5kX2F0dGVtcHRfaWQgPSBfYXR0ZW1wdF9pZAogICBXSEVSRSBpZCA9IF9jb250YWN0X2lkOwogIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgdHJ1ZSwgJ2FscmVhZHknLCBmYWxzZSk7CkVORCA=', 'base64'), 'UTF8')),
    ('unclaim', convert_from(decode('CkRFQ0xBUkUgciBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMlUk9XVFlQRTsKQkVHSU4KICBJRiBhdXRoLnVpZCgpIElTIE5VTEwgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAndW5hdXRob3JpemVkJyk7IEVORCBJRjsKICBJRiBOT1QgcHVibGljLndhX2NhbXBhaWduX293bl9hY2NvdW50KF9hY2NvdW50X2lkKSBUSEVOCiAgICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnYWNjb3VudF9ub3RfYWxsb3dlZCcpOwogIEVORCBJRjsKICBJRiBfYXR0ZW1wdF9pZCBJUyBOVUxMIFRIRU4gUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ2F0dGVtcHRfbWlzbWF0Y2gnKTsgRU5EIElGOwoKICBTRUxFQ1QgKiBJTlRPIHIgRlJPTSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMKICAgV0hFUkUgaWQgPSBfY29udGFjdF9pZCBBTkQgY2FtcGFpZ25faWQgPSBfY2FtcGFpZ25faWQKICAgRk9SIFVQREFURTsKICBJRiBOT1QgRk9VTkQgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnY29udGFjdF9ub3RfZm91bmQnKTsgRU5EIElGOwoKICBJRiByLnNlbmRfYXR0ZW1wdF9pZCA9IF9hdHRlbXB0X2lkIEFORCByLnN0YXR1cyBJTiAoJ3NlbnQnLCAnZmFpbGVkJykgVEhFTgogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ2FscmVhZHlfZmluYWxpemVkJyk7CiAgRU5EIElGOwoKICBJRiByLnN0YXR1cyA9ICdzZW5kaW5nJyBBTkQgci5zZW5kX2F0dGVtcHRfaWQgPSBfYXR0ZW1wdF9pZCBUSEVOCiAgICBJRiByLndoYXRzYXBwX2FjY291bnRfaWQgSVMgRElTVElOQ1QgRlJPTSBfYWNjb3VudF9pZAogICAgICAgT1Igci5yZXNlcnZhdGlvbl9pZCBJUyBESVNUSU5DVCBGUk9NIF9yZXNlcnZhdGlvbl9pZCBUSEVOCiAgICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdhdHRlbXB0X21pc21hdGNoJyk7CiAgICBFTkQgSUY7CiAgICBJTlNFUlQgSU5UTyBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fcmV2b2tlZF9hdHRlbXB0cwogICAgICAoY29udGFjdF9pZCwgYXR0ZW1wdF9pZCwgY2FtcGFpZ25faWQsIHdoYXRzYXBwX2FjY291bnRfaWQsIHJlc2VydmF0aW9uX2lkKQogICAgVkFMVUVTIChfY29udGFjdF9pZCwgX2F0dGVtcHRfaWQsIF9jYW1wYWlnbl9pZCwgX2FjY291bnRfaWQsIF9yZXNlcnZhdGlvbl9pZCkKICAgIE9OIENPTkZMSUNUIERPIE5PVEhJTkc7CiAgICBVUERBVEUgcHVibGljLndoYXRzYXBwX2NhbXBhaWduX2NvbnRhY3RzCiAgICAgICBTRVQgc3RhdHVzID0gJ3Jlc2VydmVkJywgc2VuZGluZ19hdCA9IE5VTEwsIHNlbmRfYXR0ZW1wdF9pZCA9IE5VTEwKICAgICBXSEVSRSBpZCA9IF9jb250YWN0X2lkOwogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCB0cnVlLCAnYWxyZWFkeScsIGZhbHNlKTsKICBFTkQgSUY7CgogIC0tIFIzICh2Myk6IHPDsyByZXZvZ2Egc2UgYSBjaGFtYWRhIGRldMOpbSBhIHBvc3NlIGF0dWFsIGRvIGNvbnRhdG8KICAtLSAobWVzbWEgY29udGEgRSBtZXNtYSByZXNlcnZhKS4gU2VtIGlzc28sIG91dHJhIGNvbnRhL3VzdcOhcmlvIHF1ZSBhZGl2aW5oYXNzZQogIC0tIG8gYXR0ZW1wdElkIHBvZGVyaWEgcmV2b2fDoS1sbyBlIGJsb3F1ZWFyIG8gZW52aW8gbGVnw610aW1vLgogIElGIHIud2hhdHNhcHBfYWNjb3VudF9pZCBJUyBESVNUSU5DVCBGUk9NIF9hY2NvdW50X2lkCiAgICAgT1Igci5yZXNlcnZhdGlvbl9pZCBJUyBESVNUSU5DVCBGUk9NIF9yZXNlcnZhdGlvbl9pZCBUSEVOCiAgICBJRiByLnN0YXR1cyBJTiAoJ3Jlc2VydmVkJywgJ3NlbmRpbmcnKSBUSEVOCiAgICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdhdHRlbXB0X21pc21hdGNoJyk7CiAgICBFTkQgSUY7CiAgICAtLSBwZW5kaW5nL2NhbmNlbGxlZC9zZW50L2ZhaWxlZCBzZW0gcG9zc2U6IG5hZGEgYSBkZXNmYXplciwgbmFkYSByZWdpc3RyYWRvIChjb250cmF0byBkYSAwMDA4KS4KICAgIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgdHJ1ZSwgJ2FscmVhZHknLCB0cnVlKTsKICBFTkQgSUY7CgogIC0tIFIzICh2NCk6IHNlbSBwb3NzZSBhdGl2YSAocGVuZGluZy9zZW50L2ZhaWxlZC9jYW5jZWxsZWQpIG7Do28gaMOhIG8gcXVlIHByb3RlZ2VyOgogIC0tIHJlc3BvbmRlIG9rL2FscmVhZHkgc2VtIHJlZ2lzdHJhciByZXZvZ2HDp8Ojby4KICBJRiByLnN0YXR1cyBOT1QgSU4gKCdyZXNlcnZlZCcsICdzZW5kaW5nJykgVEhFTgogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCB0cnVlLCAnYWxyZWFkeScsIHRydWUpOwogIEVORCBJRjsKCiAgLS0gVW5jbGFpbSBhbnRlY2lwYWRvIGxlZ8OtdGltbyAocmVzZXJ2ZWQsIG91IHNlbmRpbmcgZGUgT1VUUkEgdGVudGF0aXZhLCBjb20gY29udGEgZQogIC0tIHJlc2VydmEgZGEgcG9zc2UgYXR1YWwpOiBuYWRhIGEgZGVzZmF6ZXIgYWdvcmEsIG1hcyBhIHRlbnRhdGl2YSBmaWNhIHJldm9nYWRhLgogIElOU0VSVCBJTlRPIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9yZXZva2VkX2F0dGVtcHRzCiAgICAoY29udGFjdF9pZCwgYXR0ZW1wdF9pZCwgY2FtcGFpZ25faWQsIHdoYXRzYXBwX2FjY291bnRfaWQsIHJlc2VydmF0aW9uX2lkKQogIFZBTFVFUyAoX2NvbnRhY3RfaWQsIF9hdHRlbXB0X2lkLCBfY2FtcGFpZ25faWQsIF9hY2NvdW50X2lkLCBfcmVzZXJ2YXRpb25faWQpCiAgT04gQ09ORkxJQ1QgRE8gTk9USElORzsKICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIHRydWUsICdhbHJlYWR5JywgdHJ1ZSk7CkVORCA=', 'base64'), 'UTF8'))
),
fn AS (
  SELECT 'claim'::text AS k, to_regprocedure('public.wa_campaign_claim(uuid,uuid,uuid,uuid,uuid)') AS foid
  UNION ALL
  SELECT 'unclaim', to_regprocedure('public.wa_campaign_unclaim(uuid,uuid,uuid,uuid,uuid)')
),
fd AS (
  SELECT f.k, f.foid, p.prosrc, p.prosecdef, p.proconfig, l.lanname,
         p.prorettype::regtype::text AS rettype,
         pg_get_function_identity_arguments(p.oid) AS identargs,
         p.provolatile, p.proisstrict, p.proleakproof, p.proparallel, p.prokind,
         p.proowner, pg_get_userbyid(p.proowner) AS owner_name, p.proacl,
         r.ref_src,
         btrim(regexp_replace(regexp_replace(replace(coalesce(p.prosrc, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_live,
         btrim(regexp_replace(regexp_replace(replace(coalesce(r.ref_src, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_ref
  FROM fn f
  JOIN ref r USING (k)
  LEFT JOIN pg_catalog.pg_proc p ON p.oid = f.foid
  LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
),
d AS (
  SELECT fd.*,
         (SELECT min(i) FROM generate_series(1, greatest(length(fd.n_live), length(fd.n_ref))) i
           WHERE substr(fd.n_live, i, 1) IS DISTINCT FROM substr(fd.n_ref, i, 1)) AS first_diff
  FROM fd
)
SELECT k AS funcao,
       CASE WHEN foid IS NULL THEN 'função ausente' ELSE pg_get_functiondef(foid) END AS definicao_instalada,
       length(prosrc) AS tamanho_corpo_instalado, length(ref_src) AS tamanho_corpo_referencia,
       md5(prosrc) AS md5_corpo_instalado, md5(ref_src) AS md5_corpo_referencia,
       md5(n_live) AS md5_normalizado_instalado, md5(n_ref) AS md5_normalizado_referencia,
       first_diff AS primeira_diferenca_normalizada,
       CASE WHEN first_diff IS NULL THEN NULL ELSE substr(n_live, greatest(first_diff - 60, 1), 160) END AS trecho_instalado,
       CASE WHEN first_diff IS NULL THEN NULL ELSE substr(n_ref,  greatest(first_diff - 60, 1), 160) END AS trecho_referencia
FROM d
ORDER BY k;

-- -------------------------------------------------------------------------------------
-- BLOCO C — ACLs brutas e ambiente (evidência complementar dos itens 80–123)
-- -------------------------------------------------------------------------------------
SELECT 'função' AS tipo, p.oid::regprocedure::text AS objeto, pg_get_userbyid(p.proowner) AS dono,
       coalesce(p.proacl::text, 'ACL padrão') AS acl_bruta
FROM pg_catalog.pg_proc p
WHERE p.oid IN (to_regprocedure('public.wa_campaign_claim(uuid,uuid,uuid,uuid,uuid)'),
                to_regprocedure('public.wa_campaign_unclaim(uuid,uuid,uuid,uuid,uuid)'))
UNION ALL
SELECT 'tabela', c.oid::regclass::text, pg_get_userbyid(c.relowner), coalesce(c.relacl::text, 'ACL padrão')
FROM pg_catalog.pg_class c
WHERE c.oid = to_regclass('public.whatsapp_campaign_revoked_attempts')
UNION ALL
SELECT 'ambiente', 'versão do servidor', current_user, version()
ORDER BY 1, 2;
