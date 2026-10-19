-- =====================================================================================
-- P17_verificacao_RPCS_0006_READ_ONLY.sql
-- CRM United — F4-A, pendência P17
-- Objetivo: verificar se wa_campaign_reserve, wa_campaign_release e wa_campaign_list_active
-- instaladas em produção correspondem às versões esperadas (migration 0006), junto com as
-- dependências que afetam a R3 e a recuperação segura das reservas:
--   wa_campaign_own_active_account (0005), wa_campaign_own_account (0008),
--   wa_campaign_close_cancel_contacts (0008; trigger wa_campaign_close_trg criado na 0005),
--   índice wcc_reservation_idx (0006).
--
-- SOMENTE LEITURA. Só SELECT sobre catálogos (pg_proc, pg_trigger, pg_class, pg_index,
-- pg_attribute, pg_namespace, pg_depend) e funções de introspecção (pg_get_functiondef,
-- pg_get_triggerdef, pg_get_indexdef, has_function_privilege, pg_has_role, aclexplode).
-- NÃO chama nenhuma das funções verificadas nem lê linhas de tabelas comerciais.
--
-- Referência embutida em base64 = ÚLTIMA definição de cada função na ordem das migrations
-- (journal 0000–0009 do repositório, HEAD 99cb303, seguido de 0010 e 0011):
--   0005 SHA-256 0054b18b5767aece6a97dd053dbe3c4acf98262a339f9fca3248e3af43f94421
--   0006 SHA-256 07186d6648022fbe163e61f8493fbe7cab56a0865158a3bc6014cffa7f4683cf
--   0008 SHA-256 599dd86f8de7d838acb9a5bab3a5718ee9dd2f8851c64a849072378a8cb1b79d
-- Os hashes identificam só os arquivos de referência; a prova vem do catálogo.
--
-- Status: PASS / FAIL / REVIEW; INFO = fato do ambiente (fora do resultado geral).
-- Executar os blocos A e B separadamente se o editor mostrar só o último resultado.
-- Testado em PostgreSQL 17.11 isolado com dados fictícios (produção: 17.6).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- BLOCO A — Resumo
-- -------------------------------------------------------------------------------------
WITH
ref(fname, sig, origem, exp_ret, exp_lang, exp_vol, exp_exec_auth, writes_contacts, exp_args, ref_src) AS (
  VALUES
    ('wa_campaign_reserve', 'public.wa_campaign_reserve(uuid,uuid,integer)', '0006', 'jsonb', 'plpgsql', 'v', true, true, '_campaign_id uuid, _account_id uuid, _limit integer', convert_from(decode('CkRFQ0xBUkUKICBfc3RhdHVzIHRleHQ7CiAgX2xpbSBpbnRlZ2VyIDo9IGdyZWF0ZXN0KDEsIGxlYXN0KDUwLCBjb2FsZXNjZShfbGltaXQsIDIwKSkpOwogIF9yaWQgdXVpZCA6PSBnZW5fcmFuZG9tX3V1aWQoKTsKICBfcmVzdWx0IGpzb25iOwpCRUdJTgogIElGIGF1dGgudWlkKCkgSVMgTlVMTCBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICd1bmF1dGhvcml6ZWQnKTsgRU5EIElGOwogIElGIE5PVCBwdWJsaWMud2FfY2FtcGFpZ25fb3duX2FjdGl2ZV9hY2NvdW50KF9hY2NvdW50X2lkKSBUSEVOCiAgICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnYWNjb3VudF9ub3RfYWxsb3dlZCcpOwogIEVORCBJRjsKCiAgLS0gRk9SIFNIQVJFOiBpbXBlZGUgcGF1c2EvZW5jZXJyYW1lbnRvIGVucXVhbnRvIG8gbG90ZSDDqSBlbnRyZWd1ZS4KICBTRUxFQ1Qgc3RhdHVzIElOVE8gX3N0YXR1cyBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbnMgV0hFUkUgaWQgPSBfY2FtcGFpZ25faWQgRk9SIFNIQVJFOwogIElGIE5PVCBGT1VORCBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdjYW1wYWlnbl9ub3RfZm91bmQnKTsgRU5EIElGOwogIElGIF9zdGF0dXMgPD4gJ2FjdGl2ZScgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnY2FtcGFpZ25fbm90X2FjdGl2ZScpOyBFTkQgSUY7CgogIC0tIExpYmVyYSByZXNlcnZhcyBleHBpcmFkYXMgKDEwIG1pbikgZGVzdGEgY2FtcGFuaGEsIHNvYiBkZW1hbmRhIChpbmNsdWkgcmVzZXJ2YXRpb25faWQpLgogIFVQREFURSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMKICAgICBTRVQgc3RhdHVzID0gJ3BlbmRpbmcnLCB3aGF0c2FwcF9hY2NvdW50X2lkID0gTlVMTCwgcmVzZXJ2ZWRfYXQgPSBOVUxMLAogICAgICAgICByZXNlcnZhdGlvbl9pZCA9IE5VTEwsIGF0dGVtcHRzID0gYXR0ZW1wdHMgKyAxCiAgIFdIRVJFIGNhbXBhaWduX2lkID0gX2NhbXBhaWduX2lkIEFORCBzdGF0dXMgPSAncmVzZXJ2ZWQnCiAgICAgQU5EIHJlc2VydmVkX2F0IDwgbm93KCkgLSBpbnRlcnZhbCAnMTAgbWludXRlcyc7CgogIFdJVEggcGlja2VkIEFTICgKICAgIFNFTEVDVCBpZCBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cwogICAgIFdIRVJFIGNhbXBhaWduX2lkID0gX2NhbXBhaWduX2lkIEFORCBzdGF0dXMgPSAncGVuZGluZycKICAgICBPUkRFUiBCWSBjcmVhdGVkX2F0LCBpZAogICAgIExJTUlUIF9saW0KICAgICBGT1IgVVBEQVRFIFNLSVAgTE9DS0VECiAgKSwgdXBkIEFTICgKICAgIFVQREFURSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMgYwogICAgICAgU0VUIHN0YXR1cyA9ICdyZXNlcnZlZCcsIHdoYXRzYXBwX2FjY291bnRfaWQgPSBfYWNjb3VudF9pZCwgcmVzZXJ2ZWRfYXQgPSBub3coKSwKICAgICAgICAgICByZXNlcnZhdGlvbl9pZCA9IF9yaWQKICAgICAgRlJPTSBwaWNrZWQgV0hFUkUgYy5pZCA9IHBpY2tlZC5pZAogICAgUkVUVVJOSU5HIGMuaWQsIGMubmFtZSwgYy5waG9uZSwgYy5jb21wYW55LCBjLmNyZWF0ZWRfYXQKICApCiAgU0VMRUNUIGNvYWxlc2NlKGpzb25iX2FnZyhqc29uYl9idWlsZF9vYmplY3QoJ2lkJywgaWQsICduYW1lJywgbmFtZSwgJ3Bob25lJywgcGhvbmUsICdjb21wYW55JywgY29tcGFueSkKICAgICAgICAgICAgICAgICAgICAgICAgICAgIE9SREVSIEJZIGNyZWF0ZWRfYXQsIGlkKSwgJ1tdJzo6anNvbmIpCiAgICBJTlRPIF9yZXN1bHQgRlJPTSB1cGQ7CgogIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoCiAgICAnb2snLCB0cnVlLAogICAgJ3Jlc2VydmF0aW9uSWQnLCBDQVNFIFdIRU4ganNvbmJfYXJyYXlfbGVuZ3RoKF9yZXN1bHQpID4gMCBUSEVOIF9yaWQgRUxTRSBOVUxMIEVORCwKICAgICdjb250YWN0cycsIF9yZXN1bHQpOwpFTkQg', 'base64'), 'UTF8')),
    ('wa_campaign_release', 'public.wa_campaign_release(uuid,uuid,uuid)', '0006', 'jsonb', 'plpgsql', 'v', true, true, '_campaign_id uuid, _account_id uuid, _reservation_id uuid', convert_from(decode('CkRFQ0xBUkUgX24gaW50ZWdlcjsKQkVHSU4KICBJRiBhdXRoLnVpZCgpIElTIE5VTEwgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAndW5hdXRob3JpemVkJyk7IEVORCBJRjsKICBJRiBOT1QgcHVibGljLndhX2NhbXBhaWduX293bl9hY3RpdmVfYWNjb3VudChfYWNjb3VudF9pZCkgVEhFTgogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ2FjY291bnRfbm90X2FsbG93ZWQnKTsKICBFTkQgSUY7CiAgUEVSRk9STSAxIEZST00gcHVibGljLndoYXRzYXBwX2NhbXBhaWducyBXSEVSRSBpZCA9IF9jYW1wYWlnbl9pZDsKICBJRiBOT1QgRk9VTkQgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnY2FtcGFpZ25fbm90X2ZvdW5kJyk7IEVORCBJRjsKCiAgVVBEQVRFIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cwogICAgIFNFVCBzdGF0dXMgPSAncGVuZGluZycsIHdoYXRzYXBwX2FjY291bnRfaWQgPSBOVUxMLCByZXNlcnZlZF9hdCA9IE5VTEwsIHJlc2VydmF0aW9uX2lkID0gTlVMTAogICBXSEVSRSBjYW1wYWlnbl9pZCA9IF9jYW1wYWlnbl9pZAogICAgIEFORCB3aGF0c2FwcF9hY2NvdW50X2lkID0gX2FjY291bnRfaWQKICAgICBBTkQgcmVzZXJ2YXRpb25faWQgPSBfcmVzZXJ2YXRpb25faWQKICAgICBBTkQgc3RhdHVzID0gJ3Jlc2VydmVkJzsKICBHRVQgRElBR05PU1RJQ1MgX24gPSBST1dfQ09VTlQ7CgogIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgdHJ1ZSwgJ3JlbGVhc2VkJywgX24pOwpFTkQg', 'base64'), 'UTF8')),
    ('wa_campaign_list_active', 'public.wa_campaign_list_active()', '0006', 'jsonb', 'plpgsql', 's', true, false, '', convert_from(decode('CkJFR0lOCiAgSUYgYXV0aC51aWQoKSBJUyBOVUxMIFRIRU4gUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ3VuYXV0aG9yaXplZCcpOyBFTkQgSUY7CiAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCB0cnVlLCAnY2FtcGFpZ25zJywgY29hbGVzY2UoKAogICAgU0VMRUNUIGpzb25iX2FnZyhqc29uYl9idWlsZF9vYmplY3QoCiAgICAgICAgICAgICAnaWQnLCBjLmlkLCAnbmFtZScsIGMubmFtZSwgJ3N0YXR1cycsIGMuc3RhdHVzLAogICAgICAgICAgICAgJ3BlbmRpbmdDb3VudCcsIChTRUxFQ1QgY291bnQoKikgRlJPTSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMgeAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgV0hFUkUgeC5jYW1wYWlnbl9pZCA9IGMuaWQgQU5EIHguc3RhdHVzID0gJ3BlbmRpbmcnKSkKICAgICAgICAgICBPUkRFUiBCWSBjLmNyZWF0ZWRfYXQgREVTQywgYy5pZCkKICAgICAgRlJPTSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25zIGMKICAgICBXSEVSRSBjLnN0YXR1cyA9ICdhY3RpdmUnKSwgJ1tdJzo6anNvbmIpKTsKRU5EIA==', 'base64'), 'UTF8')),
    ('wa_campaign_own_active_account', 'public.wa_campaign_own_active_account(uuid)', '0005', 'boolean', 'sql', 's', true, false, '_account_id uuid', convert_from(decode('CiAgU0VMRUNUIGF1dGgudWlkKCkgSVMgTk9UIE5VTEwgQU5EIEVYSVNUUyAoCiAgICBTRUxFQ1QgMSBGUk9NIHB1YmxpYy53aGF0c2FwcF9hY2NvdW50cwogICAgIFdIRVJFIGlkID0gX2FjY291bnRfaWQgQU5EIHVzZXJfaWQgPSBhdXRoLnVpZCgpIEFORCBzdGF0dXMgPSAnYWN0aXZlJyk7Cg==', 'base64'), 'UTF8')),
    ('wa_campaign_own_account', 'public.wa_campaign_own_account(uuid)', '0008', 'boolean', 'sql', 's', true, false, '_account_id uuid', convert_from(decode('CiAgU0VMRUNUIGF1dGgudWlkKCkgSVMgTk9UIE5VTEwgQU5EIEVYSVNUUyAoCiAgICBTRUxFQ1QgMSBGUk9NIHB1YmxpYy53aGF0c2FwcF9hY2NvdW50cwogICAgIFdIRVJFIGlkID0gX2FjY291bnRfaWQgQU5EIHVzZXJfaWQgPSBhdXRoLnVpZCgpKTsK', 'base64'), 'UTF8')),
    ('wa_campaign_close_cancel_contacts', 'public.wa_campaign_close_cancel_contacts()', '0008', 'trigger', 'plpgsql', 'v', false, true, '', convert_from(decode('CkJFR0lOCiAgSUYgTkVXLnN0YXR1cyA9ICdjbG9zZWQnIEFORCBPTEQuc3RhdHVzIElTIERJU1RJTkNUIEZST00gJ2Nsb3NlZCcgVEhFTgogICAgVVBEQVRFIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cwogICAgICAgU0VUIHN0YXR1cyA9ICdjYW5jZWxsZWQnCiAgICAgV0hFUkUgY2FtcGFpZ25faWQgPSBORVcuaWQgQU5EIHN0YXR1cyBJTiAoJ3BlbmRpbmcnLCAncmVzZXJ2ZWQnKTsKICBFTkQgSUY7CiAgUkVUVVJOIE5FVzsKRU5EIA==', 'base64'), 'UTF8'))
),
fd AS (
  SELECT r.*, to_regprocedure(r.sig) AS foid,
         p.prosrc, p.prosecdef, p.proconfig, l.lanname, p.prorettype::regtype::text AS rettype,
         p.provolatile::text AS provolatile, p.proisstrict, p.proowner, pg_get_userbyid(p.proowner) AS owner_name, p.proacl,
         pg_get_function_identity_arguments(p.oid) AS identargs,
         btrim(regexp_replace(regexp_replace(replace(coalesce(p.prosrc, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_live, btrim(regexp_replace(regexp_replace(replace(coalesce(r.ref_src, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_ref
  FROM ref r
  LEFT JOIN pg_catalog.pg_proc p ON p.oid = to_regprocedure(r.sig)
  LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
),
mk(fname, mid, descr, pat, expected) AS (
  VALUES
    ('wa_campaign_reserve', 'RV1', $d$varredura de expiradas (10 min) antes de reservar$d$, $p$WHERE campaign_id = _campaign_id AND status = 'reserved' AND reserved_at < now() - interval '10 minutes';$p$, 1),
    ('wa_campaign_reserve', 'RV2', $d$varredura incrementa attempts e limpa posse$d$, $p$SET status = 'pending', whatsapp_account_id = NULL, reserved_at = NULL, reservation_id = NULL, attempts = attempts + 1$p$, 1),
    ('wa_campaign_reserve', 'RV3', $d$limite do lote entre 1 e 50 (padrão 20)$d$, $p$greatest(1, least(50, coalesce(_limit, 20)))$p$, 1),
    ('wa_campaign_reserve', 'RV4', $d$seleção com FOR UPDATE SKIP LOCKED$d$, $p$FOR UPDATE SKIP LOCKED$p$, 1),
    ('wa_campaign_reserve', 'RV5', $d$campanha travada FOR SHARE e exigida active$d$, $p$FOR SHARE; IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found'); END IF; IF _status <> 'active' THEN$p$, 1),
    ('wa_campaign_reserve', 'RV6', $d$exige conta própria ativa$d$, $p$IF NOT public.wa_campaign_own_active_account(_account_id) THEN$p$, 1),
    ('wa_campaign_reserve', 'RV7', $d$resposta com reservationId e contacts (contrato da R3)$d$, $p$'reservationId', CASE WHEN jsonb_array_length(_result) > 0 THEN _rid ELSE NULL END, 'contacts', _result$p$, 1),
    ('wa_campaign_reserve', 'RV8', $d$sem filtro por dono da campanha (isolamento ainda inexistente)$d$, $p$created_by$p$, 0),
    ('wa_campaign_release', 'RL1', $d$devolve só o lote da conta e só reserved$d$, $p$AND whatsapp_account_id = _account_id AND reservation_id = _reservation_id AND status = 'reserved';$p$, 1),
    ('wa_campaign_release', 'RL2', $d$não verifica a idade da reserva (aceita lote expirado)$d$, $p$interval$p$, 0),
    ('wa_campaign_release', 'RL3', $d$não incrementa attempts$d$, $p$attempts$p$, 0),
    ('wa_campaign_release', 'RL4', $d$resposta released (contrato da R3)$d$, $p$RETURN jsonb_build_object('ok', true, 'released', _n);$p$, 1),
    ('wa_campaign_release', 'RL5', $d$exige conta própria ativa$d$, $p$IF NOT public.wa_campaign_own_active_account(_account_id) THEN$p$, 1),
    ('wa_campaign_list_active', 'LA1', $d$lista só campanhas active$d$, $p$WHERE c.status = 'active'$p$, 1),
    ('wa_campaign_list_active', 'LA2', $d$pendingCount conta só pending$d$, $p$'pendingCount', (SELECT count(*) FROM public.whatsapp_campaign_contacts x WHERE x.campaign_id = c.id AND x.status = 'pending')$p$, 1),
    ('wa_campaign_list_active', 'LA3', $d$sem filtro por dono (todas as ativas a qualquer autenticado)$d$, $p$created_by$p$, 0),
    ('wa_campaign_close_cancel_contacts', 'CL1', $d$encerramento cancela só pending e reserved (0008)$d$, $p$status IN ('pending', 'reserved')$p$, 1),
    ('wa_campaign_close_cancel_contacts', 'CL2', $d$encerramento não toca em sending (0008)$d$, $p$sending$p$, 0)
),
mk_eval AS (
  SELECT mk.*, CASE WHEN fd.n_live = '' THEN -1
                    ELSE (length(fd.n_live) - length(replace(fd.n_live, mk.pat, ''))) / length(mk.pat) END AS found
  FROM mk JOIN fd USING (fname)
),
own AS (
  SELECT to_regclass('public.whatsapp_campaign_contacts') AS coid, to_regclass('public.whatsapp_campaigns') AS woid,
         (SELECT relowner FROM pg_catalog.pg_class WHERE oid = to_regclass('public.whatsapp_campaign_contacts')) AS c_owner
),
roles(rname, kind) AS (VALUES ('anon','nunca'), ('authenticated','conforme'), ('service_role','info'), ('sandbox_exec','nunca')),
trg AS (
  SELECT tg.oid, tg.tgenabled::text AS tgenabled, tg.tgtype::int AS tgtype, tg.tgfoid, tg.tgqual IS NOT NULL AS has_when,
         (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(tg.tgattr::int2[]) k(n)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = tg.tgrelid AND a.attnum = k.n) AS cols
  FROM pg_catalog.pg_trigger tg
  WHERE tg.tgname = 'wa_campaign_close_trg' AND tg.tgrelid = to_regclass('public.whatsapp_campaigns') AND NOT tg.tgisinternal
),
checks(ordem, area, item, status, esperado, encontrado, observacao) AS (

  -- ===================== 1. EXISTÊNCIA E ASSINATURA =====================
  SELECT 10 + row_number() OVER (ORDER BY fname), 'função', fname || ': existe com a assinatura esperada',
         CASE WHEN foid IS NOT NULL AND identargs = exp_args THEN 'PASS' ELSE 'FAIL' END,
         sig || ' (' || exp_args || ')', coalesce(foid::regprocedure::text || ' (' || identargs || ')', 'não encontrada'),
         'Origem esperada: migration ' || origem || '.'
  FROM fd
  UNION ALL
  SELECT 20 + row_number() OVER (ORDER BY fname), 'função', fname || ': sem sobrecargas com o mesmo nome',
         CASE WHEN n = 1 THEN 'PASS' WHEN n = 0 THEN 'FAIL' ELSE 'REVIEW' END, '1', n::text,
         'Uma sobrecarga (ex.: assinatura antiga da 0005) poderia ser chamada por engano; a rota usa a assinatura nomeada.'
  FROM fd CROSS JOIN LATERAL (SELECT count(*) AS n FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
                               WHERE s.nspname = 'public' AND p.proname = fd.fname) c
  UNION ALL
  SELECT 30 + row_number() OVER (ORDER BY fname), 'função', fname || ': retorno, linguagem e volatilidade',
         CASE WHEN rettype = exp_ret AND lanname = exp_lang AND provolatile = exp_vol AND proisstrict IS FALSE THEN 'PASS' ELSE 'FAIL' END,
         exp_ret || ' / ' || exp_lang || ' / ' || exp_vol || ' / não STRICT',
         coalesce(rettype, '—') || ' / ' || coalesce(lanname, '—') || ' / ' || coalesce(provolatile, '—') || ' / strict=' || coalesce(proisstrict::text, '—'),
         'v = VOLATILE, s = STABLE.'
  FROM fd
  UNION ALL
  SELECT 40 + row_number() OVER (ORDER BY fname), 'função', fname || ': SECURITY DEFINER',
         CASE WHEN prosecdef IS TRUE THEN 'PASS' ELSE 'FAIL' END, 'true', coalesce(prosecdef::text, '—'), NULL
  FROM fd
  UNION ALL
  SELECT 50 + row_number() OVER (ORDER BY fname), 'função', fname || ': SET search_path = public',
         CASE WHEN proconfig = ARRAY['search_path=public'] THEN 'PASS' WHEN proconfig IS NULL THEN 'FAIL' ELSE 'REVIEW' END,
         '{search_path=public}', coalesce(proconfig::text, 'nenhum'), NULL
  FROM fd

  -- ===================== 2. CORPO =====================
  UNION ALL
  SELECT 60 + row_number() OVER (ORDER BY fname), 'corpo', fname || ': igual à referência ' || origem,
         CASE WHEN prosrc = ref_src THEN 'PASS'
              WHEN n_live = n_ref AND n_live <> '' THEN 'PASS'
              WHEN n_live = '' THEN 'FAIL'
              WHEN EXISTS (SELECT 1 FROM mk_eval m WHERE m.fname = fd.fname AND m.found <> m.expected) THEN 'FAIL'
              ELSE 'REVIEW' END,
         'md5 ' || md5(ref_src), coalesce('md5 ' || md5(prosrc), 'sem corpo'),
         CASE WHEN prosrc = ref_src THEN 'Idêntico byte a byte.'
              WHEN n_live = n_ref THEN 'Diferença só de formatação/comentários.'
              WHEN n_live = '' THEN 'Função ausente.'
              WHEN EXISTS (SELECT 1 FROM mk_eval m WHERE m.fname = fd.fname AND m.found <> m.expected) THEN 'Diferença funcional: marcador ausente (itens 100+).'
              ELSE 'Diferente, com marcadores presentes: comparar no Bloco B.' END
  FROM fd
  UNION ALL
  SELECT 100 + row_number() OVER (ORDER BY m.fname, m.mid), 'lógica', m.fname || ' ' || m.mid || ': ' || m.descr,
         CASE WHEN m.found = m.expected THEN 'PASS' ELSE 'FAIL' END,
         m.expected || ' ocorrência(s)', CASE WHEN m.found < 0 THEN 'função ausente' ELSE m.found || ' ocorrência(s)' END,
         'Trecho (normalizado): ' || left(m.pat, 150)
  FROM mk_eval m

  -- ===================== 3. DONO E COMPATIBILIDADE COM A 0010 =====================
  UNION ALL
  SELECT 130 + row_number() OVER (ORDER BY fname), 'dono', fname || ': dono membro do dono de whatsapp_campaign_contacts',
         CASE WHEN fd.proowner IS NULL OR o.c_owner IS NULL THEN 'FAIL'
              WHEN pg_has_role(fd.proowner, o.c_owner, 'MEMBER') THEN 'PASS'
              WHEN NOT fd.writes_contacts THEN 'REVIEW' ELSE 'FAIL' END,
         'membro', coalesce(fd.owner_name, '—'),
         CASE WHEN fd.writes_contacts THEN 'Escreve em contatos: sem isso a guarda da 0010 recusaria a varredura, a reserva ou a devolução.'
              ELSE 'Não escreve em contatos; precisa só ler.' END
  FROM fd CROSS JOIN own o

  -- ===================== 4. EXECUTE =====================
  UNION ALL
  SELECT 150 + row_number() OVER (ORDER BY fname), 'EXECUTE', fname || ' → PUBLIC',
         CASE WHEN foid IS NULL THEN 'FAIL'
              WHEN EXISTS (SELECT 1 FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) a
                            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN 'FAIL' ELSE 'PASS' END,
         'sem EXECUTE', CASE WHEN proacl IS NULL THEN 'ACL padrão (PUBLIC tem EXECUTE)' ELSE proacl::text END, NULL
  FROM fd
  UNION ALL
  SELECT 160 + row_number() OVER (ORDER BY fd.fname, r.rname), 'EXECUTE', fd.fname || ' → ' || r.rname,
         CASE WHEN fd.foid IS NULL OR to_regrole(r.rname) IS NULL THEN 'REVIEW'
              WHEN r.kind = 'info' THEN 'INFO'
              WHEN r.kind = 'nunca' THEN CASE WHEN has_function_privilege(r.rname, fd.foid, 'EXECUTE') THEN 'FAIL' ELSE 'PASS' END
              WHEN has_function_privilege(r.rname, fd.foid, 'EXECUTE') = fd.exp_exec_auth THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN r.kind = 'info' THEN 'registrar' WHEN r.kind = 'nunca' OR NOT fd.exp_exec_auth THEN 'sem EXECUTE' ELSE 'com EXECUTE' END,
         CASE WHEN to_regrole(r.rname) IS NULL THEN 'papel não existe' WHEN fd.foid IS NULL THEN 'função ausente'
              WHEN has_function_privilege(r.rname, fd.foid, 'EXECUTE') THEN 'com EXECUTE' ELSE 'sem EXECUTE' END,
         CASE WHEN r.rname = 'authenticated' AND fd.exp_exec_auth THEN 'Sem EXECUTE, a extensão R3 recebe erro nesta rota.'
              WHEN r.rname = 'sandbox_exec' THEN 'P8 (item 44) mostrou 0 de 13 funções com EXECUTE.'
              WHEN r.rname = 'service_role' THEN 'As migrations não concedem nem revogam; registrar.' END
  FROM fd CROSS JOIN roles r

  -- ===================== 5. DEPENDÊNCIAS =====================
  UNION ALL
  SELECT 190, 'dependência', 'auth.uid() existe',
         CASE WHEN to_regprocedure('auth.uid()') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, 'auth.uid()',
         coalesce(to_regprocedure('auth.uid()')::text, 'ausente'), 'Todas as RPCs começam por auth.uid().'
  UNION ALL
  SELECT 191, 'dependência', 'colunas usadas pelo reserve/release existem em contatos',
         CASE WHEN n = 8 THEN 'PASS' ELSE 'FAIL' END,
         'status, campaign_id, whatsapp_account_id, reserved_at, reservation_id, attempts, created_at, id', n || ' de 8', NULL
  FROM (SELECT count(*) AS n FROM pg_catalog.pg_attribute a
         WHERE a.attrelid = to_regclass('public.whatsapp_campaign_contacts') AND a.attnum > 0 AND NOT a.attisdropped
           AND a.attname IN ('status','campaign_id','whatsapp_account_id','reserved_at','reservation_id','attempts','created_at','id')) x
  UNION ALL
  SELECT 192, 'dependência', 'índice parcial wcc_reservation_idx (reservation_id) WHERE status = reserved',
         CASE WHEN i.oid IS NULL THEN 'REVIEW'
              WHEN pg_get_indexdef(i.oid) LIKE '%(reservation_id)%' AND pg_get_expr(x.indpred, x.indrelid) LIKE '%status%reserved%' THEN 'PASS'
              ELSE 'REVIEW' END,
         'presente, parcial', coalesce(pg_get_indexdef(i.oid), 'ausente'),
         'Desempenho do release; a ausência não muda o resultado das RPCs.'
  FROM (SELECT 1) d
  LEFT JOIN pg_catalog.pg_class i ON i.oid = to_regclass('public.wcc_reservation_idx')
  LEFT JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
  UNION ALL
  SELECT 193, 'dependência', 'trigger wa_campaign_close_trg: AFTER UPDATE OF status, por linha, habilitado, chama wa_campaign_close_cancel_contacts',
         CASE WHEN NOT EXISTS (SELECT 1 FROM trg) THEN 'FAIL'
              WHEN (SELECT tgtype FROM trg) = 17 AND (SELECT tgenabled FROM trg) = 'O' AND NOT (SELECT has_when FROM trg)
                   AND (SELECT cols FROM trg) = ARRAY['status']
                   AND (SELECT tgfoid FROM trg) = to_regprocedure('public.wa_campaign_close_cancel_contacts()') THEN 'PASS'
              ELSE 'FAIL' END,
         'tgtype 17, enabled O, UPDATE OF status',
         coalesce((SELECT 'tgtype ' || tgtype || ', enabled ' || tgenabled || ', colunas ' || coalesce(cols::text, '{}') FROM trg), 'não encontrado'),
         'Encerrar a campanha cancela pending/reserved; afeta a recuperação se a campanha for encerrada no meio.'
  UNION ALL
  SELECT 194, 'compatibilidade', 'encerramento x guarda 0010: tratamento de contatos sending', 'INFO', 'registrar',
         CASE WHEN EXISTS (SELECT 1 FROM mk_eval WHERE mid = 'CL2' AND found = 0) THEN 'encerramento não inclui sending (0008)'
              WHEN EXISTS (SELECT 1 FROM mk_eval WHERE mid = 'CL2' AND found > 0) THEN 'encerramento INCLUI sending (versão 0005)'
              ELSE 'função ausente' END,
         'Versão 0008: sending fica intacto e finalizável por sent/failed. Versão 0005: a 0010 recusaria sending -> cancelled e a campanha não fecharia.'
  UNION ALL
  SELECT 195, 'dependência', 'funções que dependem destas (pg_depend), além das conhecidas', 'INFO', 'registrar',
         coalesce((SELECT string_agg(DISTINCT dp.objid::regprocedure::text, ', ')
                     FROM pg_catalog.pg_depend dp
                    WHERE dp.classid = 'pg_catalog.pg_proc'::regclass AND dp.refclassid = 'pg_catalog.pg_proc'::regclass
                      AND dp.refobjid IN (SELECT foid FROM fd WHERE foid IS NOT NULL)), 'nenhuma registrada'),
         'Funções plpgsql/sql chamadas por outras normalmente não geram pg_depend; o item serve para achar dependências declaradas.'
  UNION ALL
  SELECT 196, 'ambiente', 'versão do servidor', 'INFO', 'registrar', current_setting('server_version'), NULL
)
SELECT ordem, area, item, status, esperado, encontrado, observacao
FROM (
  SELECT 0 AS ordem, 'RESULTADO GERAL' AS area, 'P17 — reserve/release/list_active e dependências conferem com 0005/0006/0008' AS item,
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
ref(fname, sig, origem, exp_ret, exp_lang, exp_vol, exp_exec_auth, writes_contacts, exp_args, ref_src) AS (
  VALUES
    ('wa_campaign_reserve', 'public.wa_campaign_reserve(uuid,uuid,integer)', '0006', 'jsonb', 'plpgsql', 'v', true, true, '_campaign_id uuid, _account_id uuid, _limit integer', convert_from(decode('CkRFQ0xBUkUKICBfc3RhdHVzIHRleHQ7CiAgX2xpbSBpbnRlZ2VyIDo9IGdyZWF0ZXN0KDEsIGxlYXN0KDUwLCBjb2FsZXNjZShfbGltaXQsIDIwKSkpOwogIF9yaWQgdXVpZCA6PSBnZW5fcmFuZG9tX3V1aWQoKTsKICBfcmVzdWx0IGpzb25iOwpCRUdJTgogIElGIGF1dGgudWlkKCkgSVMgTlVMTCBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICd1bmF1dGhvcml6ZWQnKTsgRU5EIElGOwogIElGIE5PVCBwdWJsaWMud2FfY2FtcGFpZ25fb3duX2FjdGl2ZV9hY2NvdW50KF9hY2NvdW50X2lkKSBUSEVOCiAgICBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnYWNjb3VudF9ub3RfYWxsb3dlZCcpOwogIEVORCBJRjsKCiAgLS0gRk9SIFNIQVJFOiBpbXBlZGUgcGF1c2EvZW5jZXJyYW1lbnRvIGVucXVhbnRvIG8gbG90ZSDDqSBlbnRyZWd1ZS4KICBTRUxFQ1Qgc3RhdHVzIElOVE8gX3N0YXR1cyBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbnMgV0hFUkUgaWQgPSBfY2FtcGFpZ25faWQgRk9SIFNIQVJFOwogIElGIE5PVCBGT1VORCBUSEVOIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgZmFsc2UsICdlcnJvcicsICdjYW1wYWlnbl9ub3RfZm91bmQnKTsgRU5EIElGOwogIElGIF9zdGF0dXMgPD4gJ2FjdGl2ZScgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnY2FtcGFpZ25fbm90X2FjdGl2ZScpOyBFTkQgSUY7CgogIC0tIExpYmVyYSByZXNlcnZhcyBleHBpcmFkYXMgKDEwIG1pbikgZGVzdGEgY2FtcGFuaGEsIHNvYiBkZW1hbmRhIChpbmNsdWkgcmVzZXJ2YXRpb25faWQpLgogIFVQREFURSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMKICAgICBTRVQgc3RhdHVzID0gJ3BlbmRpbmcnLCB3aGF0c2FwcF9hY2NvdW50X2lkID0gTlVMTCwgcmVzZXJ2ZWRfYXQgPSBOVUxMLAogICAgICAgICByZXNlcnZhdGlvbl9pZCA9IE5VTEwsIGF0dGVtcHRzID0gYXR0ZW1wdHMgKyAxCiAgIFdIRVJFIGNhbXBhaWduX2lkID0gX2NhbXBhaWduX2lkIEFORCBzdGF0dXMgPSAncmVzZXJ2ZWQnCiAgICAgQU5EIHJlc2VydmVkX2F0IDwgbm93KCkgLSBpbnRlcnZhbCAnMTAgbWludXRlcyc7CgogIFdJVEggcGlja2VkIEFTICgKICAgIFNFTEVDVCBpZCBGUk9NIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cwogICAgIFdIRVJFIGNhbXBhaWduX2lkID0gX2NhbXBhaWduX2lkIEFORCBzdGF0dXMgPSAncGVuZGluZycKICAgICBPUkRFUiBCWSBjcmVhdGVkX2F0LCBpZAogICAgIExJTUlUIF9saW0KICAgICBGT1IgVVBEQVRFIFNLSVAgTE9DS0VECiAgKSwgdXBkIEFTICgKICAgIFVQREFURSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMgYwogICAgICAgU0VUIHN0YXR1cyA9ICdyZXNlcnZlZCcsIHdoYXRzYXBwX2FjY291bnRfaWQgPSBfYWNjb3VudF9pZCwgcmVzZXJ2ZWRfYXQgPSBub3coKSwKICAgICAgICAgICByZXNlcnZhdGlvbl9pZCA9IF9yaWQKICAgICAgRlJPTSBwaWNrZWQgV0hFUkUgYy5pZCA9IHBpY2tlZC5pZAogICAgUkVUVVJOSU5HIGMuaWQsIGMubmFtZSwgYy5waG9uZSwgYy5jb21wYW55LCBjLmNyZWF0ZWRfYXQKICApCiAgU0VMRUNUIGNvYWxlc2NlKGpzb25iX2FnZyhqc29uYl9idWlsZF9vYmplY3QoJ2lkJywgaWQsICduYW1lJywgbmFtZSwgJ3Bob25lJywgcGhvbmUsICdjb21wYW55JywgY29tcGFueSkKICAgICAgICAgICAgICAgICAgICAgICAgICAgIE9SREVSIEJZIGNyZWF0ZWRfYXQsIGlkKSwgJ1tdJzo6anNvbmIpCiAgICBJTlRPIF9yZXN1bHQgRlJPTSB1cGQ7CgogIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoCiAgICAnb2snLCB0cnVlLAogICAgJ3Jlc2VydmF0aW9uSWQnLCBDQVNFIFdIRU4ganNvbmJfYXJyYXlfbGVuZ3RoKF9yZXN1bHQpID4gMCBUSEVOIF9yaWQgRUxTRSBOVUxMIEVORCwKICAgICdjb250YWN0cycsIF9yZXN1bHQpOwpFTkQg', 'base64'), 'UTF8')),
    ('wa_campaign_release', 'public.wa_campaign_release(uuid,uuid,uuid)', '0006', 'jsonb', 'plpgsql', 'v', true, true, '_campaign_id uuid, _account_id uuid, _reservation_id uuid', convert_from(decode('CkRFQ0xBUkUgX24gaW50ZWdlcjsKQkVHSU4KICBJRiBhdXRoLnVpZCgpIElTIE5VTEwgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAndW5hdXRob3JpemVkJyk7IEVORCBJRjsKICBJRiBOT1QgcHVibGljLndhX2NhbXBhaWduX293bl9hY3RpdmVfYWNjb3VudChfYWNjb3VudF9pZCkgVEhFTgogICAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ2FjY291bnRfbm90X2FsbG93ZWQnKTsKICBFTkQgSUY7CiAgUEVSRk9STSAxIEZST00gcHVibGljLndoYXRzYXBwX2NhbXBhaWducyBXSEVSRSBpZCA9IF9jYW1wYWlnbl9pZDsKICBJRiBOT1QgRk9VTkQgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdvaycsIGZhbHNlLCAnZXJyb3InLCAnY2FtcGFpZ25fbm90X2ZvdW5kJyk7IEVORCBJRjsKCiAgVVBEQVRFIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cwogICAgIFNFVCBzdGF0dXMgPSAncGVuZGluZycsIHdoYXRzYXBwX2FjY291bnRfaWQgPSBOVUxMLCByZXNlcnZlZF9hdCA9IE5VTEwsIHJlc2VydmF0aW9uX2lkID0gTlVMTAogICBXSEVSRSBjYW1wYWlnbl9pZCA9IF9jYW1wYWlnbl9pZAogICAgIEFORCB3aGF0c2FwcF9hY2NvdW50X2lkID0gX2FjY291bnRfaWQKICAgICBBTkQgcmVzZXJ2YXRpb25faWQgPSBfcmVzZXJ2YXRpb25faWQKICAgICBBTkQgc3RhdHVzID0gJ3Jlc2VydmVkJzsKICBHRVQgRElBR05PU1RJQ1MgX24gPSBST1dfQ09VTlQ7CgogIFJFVFVSTiBqc29uYl9idWlsZF9vYmplY3QoJ29rJywgdHJ1ZSwgJ3JlbGVhc2VkJywgX24pOwpFTkQg', 'base64'), 'UTF8')),
    ('wa_campaign_list_active', 'public.wa_campaign_list_active()', '0006', 'jsonb', 'plpgsql', 's', true, false, '', convert_from(decode('CkJFR0lOCiAgSUYgYXV0aC51aWQoKSBJUyBOVUxMIFRIRU4gUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCBmYWxzZSwgJ2Vycm9yJywgJ3VuYXV0aG9yaXplZCcpOyBFTkQgSUY7CiAgUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnb2snLCB0cnVlLCAnY2FtcGFpZ25zJywgY29hbGVzY2UoKAogICAgU0VMRUNUIGpzb25iX2FnZyhqc29uYl9idWlsZF9vYmplY3QoCiAgICAgICAgICAgICAnaWQnLCBjLmlkLCAnbmFtZScsIGMubmFtZSwgJ3N0YXR1cycsIGMuc3RhdHVzLAogICAgICAgICAgICAgJ3BlbmRpbmdDb3VudCcsIChTRUxFQ1QgY291bnQoKikgRlJPTSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25fY29udGFjdHMgeAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgV0hFUkUgeC5jYW1wYWlnbl9pZCA9IGMuaWQgQU5EIHguc3RhdHVzID0gJ3BlbmRpbmcnKSkKICAgICAgICAgICBPUkRFUiBCWSBjLmNyZWF0ZWRfYXQgREVTQywgYy5pZCkKICAgICAgRlJPTSBwdWJsaWMud2hhdHNhcHBfY2FtcGFpZ25zIGMKICAgICBXSEVSRSBjLnN0YXR1cyA9ICdhY3RpdmUnKSwgJ1tdJzo6anNvbmIpKTsKRU5EIA==', 'base64'), 'UTF8')),
    ('wa_campaign_own_active_account', 'public.wa_campaign_own_active_account(uuid)', '0005', 'boolean', 'sql', 's', true, false, '_account_id uuid', convert_from(decode('CiAgU0VMRUNUIGF1dGgudWlkKCkgSVMgTk9UIE5VTEwgQU5EIEVYSVNUUyAoCiAgICBTRUxFQ1QgMSBGUk9NIHB1YmxpYy53aGF0c2FwcF9hY2NvdW50cwogICAgIFdIRVJFIGlkID0gX2FjY291bnRfaWQgQU5EIHVzZXJfaWQgPSBhdXRoLnVpZCgpIEFORCBzdGF0dXMgPSAnYWN0aXZlJyk7Cg==', 'base64'), 'UTF8')),
    ('wa_campaign_own_account', 'public.wa_campaign_own_account(uuid)', '0008', 'boolean', 'sql', 's', true, false, '_account_id uuid', convert_from(decode('CiAgU0VMRUNUIGF1dGgudWlkKCkgSVMgTk9UIE5VTEwgQU5EIEVYSVNUUyAoCiAgICBTRUxFQ1QgMSBGUk9NIHB1YmxpYy53aGF0c2FwcF9hY2NvdW50cwogICAgIFdIRVJFIGlkID0gX2FjY291bnRfaWQgQU5EIHVzZXJfaWQgPSBhdXRoLnVpZCgpKTsK', 'base64'), 'UTF8')),
    ('wa_campaign_close_cancel_contacts', 'public.wa_campaign_close_cancel_contacts()', '0008', 'trigger', 'plpgsql', 'v', false, true, '', convert_from(decode('CkJFR0lOCiAgSUYgTkVXLnN0YXR1cyA9ICdjbG9zZWQnIEFORCBPTEQuc3RhdHVzIElTIERJU1RJTkNUIEZST00gJ2Nsb3NlZCcgVEhFTgogICAgVVBEQVRFIHB1YmxpYy53aGF0c2FwcF9jYW1wYWlnbl9jb250YWN0cwogICAgICAgU0VUIHN0YXR1cyA9ICdjYW5jZWxsZWQnCiAgICAgV0hFUkUgY2FtcGFpZ25faWQgPSBORVcuaWQgQU5EIHN0YXR1cyBJTiAoJ3BlbmRpbmcnLCAncmVzZXJ2ZWQnKTsKICBFTkQgSUY7CiAgUkVUVVJOIE5FVzsKRU5EIA==', 'base64'), 'UTF8'))
),
fd AS (
  SELECT r.fname, r.origem, r.ref_src, to_regprocedure(r.sig) AS foid, p.prosrc, p.proacl, pg_get_userbyid(p.proowner) AS owner_name,
         btrim(regexp_replace(regexp_replace(replace(coalesce(p.prosrc, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_live, btrim(regexp_replace(regexp_replace(replace(coalesce(r.ref_src, ''), E'\r', ''), '--.*$', '', 'gn'), '\s+', ' ', 'g'), ' ') AS n_ref
  FROM ref r LEFT JOIN pg_catalog.pg_proc p ON p.oid = to_regprocedure(r.sig)
),
d AS (
  SELECT fd.*, (SELECT min(i) FROM generate_series(1, greatest(length(fd.n_live), length(fd.n_ref))) i
                 WHERE substr(fd.n_live, i, 1) IS DISTINCT FROM substr(fd.n_ref, i, 1)) AS first_diff
  FROM fd
)
SELECT 'função' AS tipo, fname || ' (ref. ' || origem || ')' AS objeto,
       CASE WHEN foid IS NULL THEN 'ausente' ELSE pg_get_functiondef(foid) END AS definicao,
       'dono ' || coalesce(owner_name, '—') || '; ACL ' || coalesce(proacl::text, 'padrão') AS acl,
       md5(prosrc) AS md5_instalado, md5(ref_src) AS md5_referencia, first_diff AS primeira_diferenca,
       CASE WHEN first_diff IS NULL THEN NULL ELSE substr(n_live, greatest(first_diff - 60, 1), 160) END AS trecho_instalado,
       CASE WHEN first_diff IS NULL THEN NULL ELSE substr(n_ref, greatest(first_diff - 60, 1), 160) END AS trecho_referencia
FROM d
UNION ALL
SELECT 'trigger', tg.tgname, pg_get_triggerdef(tg.oid, true), 'enabled=' || tg.tgenabled::text, NULL, NULL, NULL, NULL, NULL
FROM pg_catalog.pg_trigger tg
WHERE tg.tgname = 'wa_campaign_close_trg' AND tg.tgrelid = to_regclass('public.whatsapp_campaigns')
UNION ALL
SELECT 'índice', 'wcc_reservation_idx', coalesce(pg_get_indexdef(to_regclass('public.wcc_reservation_idx')), 'ausente'), NULL, NULL, NULL, NULL, NULL, NULL
ORDER BY 1, 2;
