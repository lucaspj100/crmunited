-- =====================================================================================
-- P8_diagnostico_sandbox_exec_READ_ONLY.sql
-- CRM United — F4-A, pendência P8
-- Objetivo: entender o papel `sandbox_exec` (visto na ACL de
-- public.whatsapp_campaign_revoked_attempts como sandbox_exec=ar/postgres), a versão do
-- servidor e os privilégios padrão que alcançariam as tabelas futuras da F4.
--
-- SOMENTE LEITURA. Apenas SELECT sobre catálogos (pg_roles, pg_auth_members, pg_class,
-- pg_attribute, pg_namespace, pg_proc, pg_policy, pg_default_acl) e funções de
-- introspecção (has_*_privilege, pg_has_role, aclexplode, acldefault, current_setting).
-- Não lê nenhuma linha de tabela comercial. Não lê senhas (rolpassword não é consultado).
-- Não troca de papel, não cria objetos, não altera privilégios, não chama função de negócio.
--
-- Status: PASS / FAIL / REVIEW avaliam o modelo de segurança da 0010/0011.
--         INFO registra um fato do ambiente e NÃO entra no resultado geral.
--
-- COMO EXECUTAR: dois blocos independentes. Se o SQL Editor mostrar apenas o resultado da
-- última instrução, selecione e execute um bloco por vez.
-- Compatível com PostgreSQL 16 e 17 (testado em 16.15 e 17.11, ambientes isolados).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- BLOCO A — Resumo PASS / FAIL / REVIEW / INFO
-- -------------------------------------------------------------------------------------
WITH RECURSIVE
p AS (
  SELECT 'sandbox_exec'::text                                        AS rname,
         to_regrole('sandbox_exec')::oid                             AS roid,
         to_regclass('public.whatsapp_campaign_revoked_attempts')    AS toid,
         to_regclass('public.whatsapp_campaign_contacts')            AS coid,
         current_setting('server_version_num')::int                  AS vnum
),
r AS (            -- atributos do papel (sem senha)
  SELECT a.oid, a.rolname, a.rolsuper, a.rolinherit, a.rolcreaterole, a.rolcreatedb,
         a.rolcanlogin, a.rolreplication, a.rolbypassrls, a.rolconnlimit, a.rolvaliduntil
  FROM pg_catalog.pg_roles a JOIN p ON a.oid = p.roid
),
own AS (          -- donos das tabelas de referência
  SELECT p.*, tc.relowner AS t_owner, pg_get_userbyid(tc.relowner) AS t_owner_name,
         tc.relrowsecurity AS t_rls, tc.relforcerowsecurity AS t_force, tc.relacl AS t_acl,
         cc.relowner AS c_owner, pg_get_userbyid(cc.relowner) AS c_owner_name
  FROM p
  LEFT JOIN pg_catalog.pg_class tc ON tc.oid = p.toid
  LEFT JOIN pg_catalog.pg_class cc ON cc.oid = p.coid
),
up(roleid, depth, inh, setopt, path) AS (   -- papéis que sandbox_exec recebeu (recursivo)
  SELECT m.roleid, 1, m.inherit_option, m.set_option, ARRAY[m.roleid]
  FROM pg_catalog.pg_auth_members m, p WHERE m.member = p.roid
  UNION ALL
  SELECT m.roleid, up.depth + 1, up.inh AND m.inherit_option, up.setopt AND m.set_option, up.path || m.roleid
  FROM pg_catalog.pg_auth_members m JOIN up ON m.member = up.roleid
  WHERE NOT m.roleid = ANY (up.path) AND up.depth < 20
),
down(memberid) AS (                         -- papéis que recebem sandbox_exec
  SELECT m.member FROM pg_catalog.pg_auth_members m, p WHERE m.roleid = p.roid
),
privs(pname, minver) AS (
  VALUES ('SELECT',0), ('INSERT',0), ('UPDATE',0), ('DELETE',0), ('TRUNCATE',0),
         ('REFERENCES',0), ('TRIGGER',0), ('MAINTAIN',170000)
),
eff AS (          -- privilégios efetivos de sandbox_exec na tabela de revogações
  SELECT pr.pname,
         CASE WHEN o.roid IS NULL OR o.toid IS NULL OR o.vnum < pr.minver THEN false
              ELSE has_table_privilege(o.roid, o.toid, pr.pname) END AS has
  FROM own o CROSS JOIN privs pr
),
expl AS (         -- privilégios explícitos de sandbox_exec na ACL da tabela
  SELECT a.privilege_type, pg_get_userbyid(a.grantor) AS grantor, a.is_grantable
  FROM own o CROSS JOIN LATERAL aclexplode(o.t_acl) a
  WHERE o.roid IS NOT NULL AND a.grantee = o.roid
),
pol AS (          -- políticas da tabela que se aplicam a sandbox_exec
  SELECT po.polname
  FROM own o JOIN pg_catalog.pg_policy po ON po.polrelid = o.toid
  WHERE o.roid IS NOT NULL
    AND (0::oid = ANY (po.polroles) OR o.roid = ANY (po.polroles)
         OR EXISTS (SELECT 1 FROM unnest(po.polroles) pr WHERE pr <> 0 AND pg_has_role(o.roid, pr, 'USAGE')))
),
bypass AS (       -- sandbox_exec ignora o RLS desta tabela?
  SELECT coalesce(r.rolsuper, false) OR coalesce(r.rolbypassrls, false)
         OR (o.t_owner IS NOT NULL AND o.roid IS NOT NULL AND pg_has_role(o.roid, o.t_owner, 'USAGE')) AS yes
  FROM own o LEFT JOIN r ON true
),
wa AS (           -- alcance nas demais tabelas whatsapp_* (somente metadados)
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity,
         concat_ws(',',
           CASE WHEN has_table_privilege(o.roid, c.oid, 'SELECT')   THEN 'SELECT'   END,
           CASE WHEN has_table_privilege(o.roid, c.oid, 'INSERT')   THEN 'INSERT'   END,
           CASE WHEN has_table_privilege(o.roid, c.oid, 'UPDATE')   THEN 'UPDATE'   END,
           CASE WHEN has_table_privilege(o.roid, c.oid, 'DELETE')   THEN 'DELETE'   END,
           CASE WHEN has_table_privilege(o.roid, c.oid, 'TRUNCATE') THEN 'TRUNCATE' END,
           CASE WHEN has_table_privilege(o.roid, c.oid, 'TRIGGER')  THEN 'TRIGGER'  END) AS privs
  FROM own o
  JOIN pg_catalog.pg_class c ON c.relkind IN ('r','p')
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE o.roid IS NOT NULL AND c.relname LIKE 'whatsapp\_%'
),
pub AS (          -- padrão em todas as tabelas do schema public
  SELECT count(*) AS total,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = o.roid)) AS com_grant
  FROM own o
  JOIN pg_catalog.pg_class c ON c.relkind IN ('r','p')
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE o.roid IS NOT NULL
),
dacl AS (         -- privilégios padrão (pg_default_acl) explodidos
  SELECT d.defaclrole, pg_get_userbyid(d.defaclrole) AS para_objetos_de,
         CASE WHEN d.defaclnamespace = 0 THEN '(todos os schemas)' ELSE d.defaclnamespace::regnamespace::text END AS schema,
         d.defaclnamespace, d.defaclobjtype::text AS defaclobjtype,
         a.grantee, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee_name,
         a.privilege_type
  FROM pg_catalog.pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
),
creators(cre, label) AS (  -- quem provavelmente criará as tabelas da F4
  SELECT x.cre, string_agg(DISTINCT x.label, ' e ') AS label FROM (
    SELECT o.c_owner AS cre, 'dono atual das tabelas de campanha' AS label FROM own o WHERE o.c_owner IS NOT NULL
    UNION ALL
    SELECT (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user), 'current_user deste editor'
  ) x
  GROUP BY x.cre
),
predict AS (      -- ACL inicial prevista para uma tabela NOVA em public, por criador e por papel
  SELECT cr.cre, cr.label, g.gname,
         string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type) AS privs
  FROM creators cr
  CROSS JOIN (VALUES ('sandbox_exec'), ('anon'), ('authenticated'), ('service_role'), ('PUBLIC')) g(gname)
  LEFT JOIN LATERAL (
    -- base: entrada global (defaclnamespace = 0) substitui o padrão embutido; senão acldefault
    SELECT aclexplode(coalesce(
             (SELECT d.defaclacl FROM pg_catalog.pg_default_acl d
               WHERE d.defaclrole = cr.cre AND d.defaclnamespace = 0 AND d.defaclobjtype = 'r'),
             acldefault('r', cr.cre))) AS e
    UNION ALL
    -- acréscimo: entrada específica do schema public
    SELECT aclexplode(d.defaclacl)
      FROM pg_catalog.pg_default_acl d
     WHERE d.defaclrole = cr.cre AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'r'
  ) z ON true
  LEFT JOIN LATERAL (SELECT (z.e).privilege_type, (z.e).grantee) a ON
       (g.gname = 'PUBLIC' AND a.grantee = 0) OR (g.gname <> 'PUBLIC' AND a.grantee = to_regrole(g.gname))
  GROUP BY cr.cre, cr.label, g.gname
),
checks(ordem, area, item, status, esperado, encontrado, observacao) AS (

  -- ===================== 1. AMBIENTE =====================
  SELECT 1, 'ambiente', 'versão exata do PostgreSQL', 'INFO', 'registrar',
         current_setting('server_version') || ' (server_version_num ' || current_setting('server_version_num') || ')',
         CASE WHEN (SELECT vnum FROM p) >= 170000 THEN 'PostgreSQL 17+: confirma o achado A2 (privilégio MAINTAIN). Testar as migrations da F4 nesta versão.'
              ELSE 'Anterior ao 17: o "m" visto na ACL precisa de outra explicação; REVIEW manual.' END
  UNION ALL
  SELECT 2, 'ambiente', 'version() completa', 'INFO', 'registrar', version(), NULL
  UNION ALL
  SELECT 3, 'ambiente', 'current_user / session_user', 'INFO', 'registrar',
         current_user || ' / ' || session_user,
         CASE WHEN current_user = 'sandbox_exec' THEN 'O SQL Editor executa como sandbox_exec: os grants explicam o acesso do próprio editor.'
              WHEN session_user = 'sandbox_exec' THEN 'A sessão abriu como sandbox_exec e trocou de papel antes deste script.'
              ELSE 'O editor não executa como sandbox_exec; a origem do papel precisa de outra explicação.' END
  UNION ALL
  SELECT 4, 'ambiente', 'atributos de current_user', 'INFO', 'registrar',
         'super=' || a.rolsuper || ', bypassrls=' || a.rolbypassrls || ', inherit=' || a.rolinherit
           || ', membro do dono das tabelas de campanha=' ||
           coalesce((SELECT pg_has_role(current_user, o.c_owner, 'MEMBER')::text FROM own o WHERE o.c_owner IS NOT NULL), '?'),
         'Se for membro do dono, o editor é "privilegiado" para as guardas da 0010.'
  FROM pg_catalog.pg_roles a WHERE a.rolname = current_user

  -- ===================== 2. PAPEL sandbox_exec =====================
  UNION ALL
  SELECT 10, 'papel', 'sandbox_exec existe',
         CASE WHEN (SELECT roid FROM p) IS NOT NULL THEN 'PASS' ELSE 'REVIEW' END, 'identificado',
         coalesce((SELECT roid::text FROM p), 'não existe'),
         'Se não existir, a entrada sandbox_exec da ACL deveria aparecer como OID numérico; REVIEW manual.'
  UNION ALL
  SELECT 11, 'papel', 'rolsuper', CASE WHEN r.rolsuper THEN 'FAIL' ELSE 'PASS' END, 'false', r.rolsuper::text,
         'Superusuário ignora RLS, grants e guardas.'
  FROM r
  UNION ALL
  SELECT 12, 'papel', 'rolbypassrls', CASE WHEN r.rolbypassrls THEN 'REVIEW' ELSE 'PASS' END, 'false', r.rolbypassrls::text,
         'BYPASSRLS ignora o RLS sem política da tabela de revogações. O risco efetivo é decidido no item 35.'
  FROM r
  UNION ALL
  SELECT 13, 'papel', 'rolinherit', 'INFO', 'registrar', r.rolinherit::text,
         'true = recebe automaticamente os privilégios dos papéis de que é membro (com inherit_option).'
  FROM r
  UNION ALL
  SELECT 14, 'papel', 'login e atributos administrativos',
         CASE WHEN r.rolcreaterole OR r.rolcreatedb OR r.rolreplication THEN 'REVIEW' ELSE 'PASS' END,
         'createrole/createdb/replication = false',
         'login=' || r.rolcanlogin || ', createrole=' || r.rolcreaterole || ', createdb=' || r.rolcreatedb
           || ', replication=' || r.rolreplication || ', connlimit=' || r.rolconnlimit
           || ', validuntil=' || coalesce(r.rolvaliduntil::text, '—'),
         'login=true indica papel usado diretamente por um serviço.'
  FROM r
  UNION ALL
  SELECT 15, 'papel', 'MEMBER do dono de revoked_attempts / contacts',
         CASE WHEN o.roid IS NULL THEN 'REVIEW'
              WHEN pg_has_role(o.roid, o.t_owner, 'MEMBER') OR pg_has_role(o.roid, o.c_owner, 'MEMBER') THEN 'FAIL'
              ELSE 'PASS' END,
         'false',
         coalesce(o.t_owner_name, '?') || ': ' || coalesce(pg_has_role(o.roid, o.t_owner, 'MEMBER')::text, '?')
           || ' | ' || coalesce(o.c_owner_name, '?') || ': ' || coalesce(pg_has_role(o.roid, o.c_owner, 'MEMBER')::text, '?'),
         'FAIL = a guarda da 0010 trataria sessões como sandbox_exec como privilegiadas (mesmo critério das RPCs).'
  FROM own o
  UNION ALL
  SELECT 16, 'papel', 'herda privilégios (USAGE) ou pode SET ROLE para o dono',
         CASE WHEN o.roid IS NULL THEN 'REVIEW'
              WHEN pg_has_role(o.roid, o.t_owner, 'USAGE') OR pg_has_role(o.roid, o.c_owner, 'USAGE') THEN 'FAIL'
              WHEN pg_has_role(o.roid, o.t_owner, 'SET') OR pg_has_role(o.roid, o.c_owner, 'SET') THEN 'FAIL'
              ELSE 'PASS' END,
         'false',
         'USAGE=' || coalesce(pg_has_role(o.roid, o.t_owner, 'USAGE')::text, '?')
           || ', SET=' || coalesce(pg_has_role(o.roid, o.t_owner, 'SET')::text, '?'),
         'USAGE = age como dono (inclusive ignorando RLS); SET = pode assumir o dono.'
  FROM own o
  UNION ALL
  SELECT 17, 'papel', 'papéis recebidos por sandbox_exec (recursivo)',
         CASE WHEN NOT EXISTS (SELECT 1 FROM up) THEN 'PASS'
              WHEN EXISTS (SELECT 1 FROM up WHERE pg_get_userbyid(up.roleid) IN
                           ('postgres','supabase_admin','service_role','pg_write_all_data','pg_read_all_data','pg_maintain')
                           AND (up.inh OR up.setopt)) THEN 'FAIL'
              ELSE 'REVIEW' END,
         'nenhum',
         coalesce((SELECT string_agg(pg_get_userbyid(roleid) || '(nível ' || depth || ', inherit=' || inh || ', set=' || setopt || ')',
                                     ', ' ORDER BY depth, pg_get_userbyid(roleid)) FROM up), 'nenhum'),
         'FAIL = herda papel administrativo ou de dados (escrita/leitura global, dono, service_role).'
  UNION ALL
  SELECT 18, 'papel', 'papéis que recebem sandbox_exec',
         CASE WHEN NOT EXISTS (SELECT 1 FROM down) THEN 'PASS'
              WHEN EXISTS (SELECT 1 FROM down WHERE pg_get_userbyid(memberid) IN ('anon','authenticated','authenticator')) THEN 'FAIL'
              ELSE 'REVIEW' END,
         'nenhum',
         coalesce((SELECT string_agg(pg_get_userbyid(memberid), ', ' ORDER BY 1) FROM down), 'nenhum'),
         'FAIL = usuários da API herdariam os grants de sandbox_exec.'
  UNION ALL
  SELECT 19, 'papel', 'objetos de propriedade de sandbox_exec (fora dos schemas do sistema)',
         CASE WHEN o.roid IS NULL THEN 'REVIEW' WHEN x.n = 0 THEN 'PASS' ELSE 'REVIEW' END, '0',
         x.n::text || coalesce(' — ' || x.det, ''),
         'Dono de objetos em public alteraria privilégios e RLS dessas tabelas.'
  FROM own o CROSS JOIN LATERAL (
    SELECT count(*) AS n, string_agg(DISTINCT kind || ' em ' || sch, ', ') AS det FROM (
      SELECT 'relação' AS kind, n.nspname AS sch FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relowner = o.roid AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\_toast%'
      UNION ALL
      SELECT 'função', n.nspname FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
       WHERE f.proowner = o.roid AND n.nspname NOT IN ('pg_catalog','information_schema')
      UNION ALL
      SELECT 'schema', n.nspname FROM pg_catalog.pg_namespace n WHERE n.nspowner = o.roid
    ) q) x

  -- ===================== 3. TABELA whatsapp_campaign_revoked_attempts =====================
  UNION ALL
  SELECT 30, 'revoked_attempts', 'grants explícitos para sandbox_exec na ACL',
         CASE WHEN NOT EXISTS (SELECT 1 FROM expl) THEN 'PASS' ELSE 'REVIEW' END, 'nenhum (a 0011 não concede)',
         coalesce((SELECT string_agg(privilege_type || ' (grantor ' || grantor || CASE WHEN is_grantable THEN ', WITH GRANT OPTION' ELSE '' END || ')',
                                     ', ' ORDER BY privilege_type) FROM expl), 'nenhum'),
         'O grantor é o dono da tabela tanto para GRANT explícito quanto para privilégio padrão: o catálogo não distingue a origem.'
  UNION ALL
  SELECT 31, 'revoked_attempts', 'privilégios efetivos de sandbox_exec (diretos + herdados + PUBLIC)',
         CASE WHEN NOT EXISTS (SELECT 1 FROM eff WHERE has) THEN 'PASS' ELSE 'REVIEW' END, 'nenhum',
         coalesce((SELECT string_agg(pname, ', ' ORDER BY pname) FROM eff WHERE has), 'nenhum'), NULL
  UNION ALL
  SELECT 32, 'revoked_attempts', 'privilégios de coluna para sandbox_exec',
         CASE WHEN o.roid IS NULL OR o.toid IS NULL THEN 'REVIEW'
              WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_attribute at CROSS JOIN LATERAL aclexplode(at.attacl) a
                            WHERE at.attrelid = o.toid AND a.grantee = o.roid) THEN 'REVIEW' ELSE 'PASS' END,
         'nenhum', NULL, NULL
  FROM own o
  UNION ALL
  SELECT 33, 'revoked_attempts', 'RLS habilitado e não forçado',
         CASE WHEN o.toid IS NULL THEN 'FAIL' WHEN o.t_rls AND NOT o.t_force THEN 'PASS' ELSE 'FAIL' END,
         'relrowsecurity=true, relforcerowsecurity=false',
         'relrowsecurity=' || coalesce(o.t_rls::text, '?') || ', relforcerowsecurity=' || coalesce(o.t_force::text, '?'), NULL
  FROM own o
  UNION ALL
  SELECT 34, 'revoked_attempts', 'políticas RLS aplicáveis a sandbox_exec',
         CASE WHEN NOT EXISTS (SELECT 1 FROM pol) THEN 'PASS' ELSE 'FAIL' END, '0',
         coalesce((SELECT string_agg(polname, ', ') FROM pol), '0'),
         'Inclui políticas para PUBLIC e para papéis herdados.'
  UNION ALL
  SELECT 35, 'revoked_attempts', 'RISCO EFETIVO: sandbox_exec acessa linhas',
         CASE WHEN NOT EXISTS (SELECT 1 FROM eff WHERE has AND pname IN ('SELECT','INSERT','UPDATE','DELETE')) THEN 'PASS'
              WHEN (SELECT yes FROM bypass) OR EXISTS (SELECT 1 FROM pol) THEN 'FAIL'
              ELSE 'PASS' END,
         'sem acesso a linhas',
         CASE WHEN NOT EXISTS (SELECT 1 FROM eff WHERE has AND pname IN ('SELECT','INSERT','UPDATE','DELETE')) THEN 'sem privilégio de DML'
              WHEN (SELECT yes FROM bypass) THEN 'tem DML e ignora o RLS (super, BYPASSRLS ou herda o dono)'
              WHEN EXISTS (SELECT 1 FROM pol) THEN 'tem DML e há política aplicável'
              ELSE 'tem DML, mas o RLS sem política nega todas as linhas' END,
         'FAIL = poderia ler revogações ou inserir uma revogação falsa e bloquear um claim legítimo (negação de serviço). Nunca permite enviar mensagem.'
  UNION ALL
  SELECT 36, 'revoked_attempts', 'TRUNCATE / TRIGGER / REFERENCES / MAINTAIN efetivos',
         CASE WHEN EXISTS (SELECT 1 FROM eff WHERE has AND pname IN ('TRUNCATE','TRIGGER')) THEN 'FAIL'
              WHEN EXISTS (SELECT 1 FROM eff WHERE has AND pname IN ('REFERENCES','MAINTAIN')) THEN 'REVIEW'
              ELSE 'PASS' END,
         'nenhum',
         coalesce((SELECT string_agg(pname, ', ' ORDER BY pname) FROM eff WHERE has AND pname IN ('TRUNCATE','TRIGGER','REFERENCES','MAINTAIN')), 'nenhum'),
         'TRUNCATE ignora RLS e a tabela de revogações não tem guarda de TRUNCATE.'
  UNION ALL
  SELECT 37, 'revoked_attempts', 'origem provável do grant de sandbox_exec',
         CASE WHEN NOT EXISTS (SELECT 1 FROM expl) THEN 'PASS' ELSE 'REVIEW' END,
         'explicável',
         CASE WHEN NOT EXISTS (SELECT 1 FROM expl) THEN 'sem grant'
              WHEN (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM expl)
                 = (SELECT pr.privs FROM predict pr JOIN own o ON pr.cre = o.t_owner WHERE pr.gname = 'sandbox_exec' LIMIT 1)
                THEN 'compatível com privilégio padrão do dono da tabela (não comprovado)'
              ELSE 'não coincide com o privilégio padrão atual: GRANT explícito, padrão alterado depois ou outra origem' END,
         'O catálogo guarda o estado atual, não o comando que o criou nem a data.'

  -- ===================== 4. ALCANCE NAS DEMAIS TABELAS =====================
  UNION ALL
  SELECT 40, 'alcance', 'tabelas whatsapp_* com algum privilégio efetivo de sandbox_exec',
         CASE WHEN (SELECT roid FROM p) IS NULL THEN 'REVIEW'
              WHEN NOT EXISTS (SELECT 1 FROM wa WHERE privs <> '') THEN 'PASS' ELSE 'REVIEW' END,
         'nenhuma',
         coalesce((SELECT count(*) FILTER (WHERE privs <> '') || ' de ' || count(*) || ': '
                          || string_agg(CASE WHEN privs <> '' THEN relname || '[' || privs || '; rls=' || relrowsecurity || ', force=' || relforcerowsecurity || ']' END, ' ' ORDER BY relname)
                   FROM wa), 'nenhuma'),
         'Nessas tabelas as políticas são para "authenticated"; sem BYPASSRLS nem herança, sandbox_exec não vê linhas.'
  UNION ALL
  SELECT 41, 'alcance', 'TRUNCATE efetivo em whatsapp_campaign_contacts / whatsapp_campaigns',
         CASE WHEN NOT EXISTS (SELECT 1 FROM wa WHERE relname IN ('whatsapp_campaign_contacts','whatsapp_campaigns') AND privs LIKE '%TRUNCATE%') THEN 'PASS'
              ELSE 'REVIEW' END,
         'sem TRUNCATE',
         coalesce((SELECT string_agg(relname, ', ') FROM wa WHERE relname IN ('whatsapp_campaign_contacts','whatsapp_campaigns') AND privs LIKE '%TRUNCATE%'), 'sem TRUNCATE'),
         'A 0010 revogou TRUNCATE de anon/authenticated/service_role, mas não de sandbox_exec; os triggers wcc_truncate_guard/wc_truncate_guard ainda bloqueiam quem não é dono.'
  UNION ALL
  SELECT 45, 'alcance', 'RISCO EFETIVO: tabelas whatsapp_* cujas linhas sandbox_exec consegue ler ou gravar',
         CASE WHEN (SELECT roid FROM p) IS NULL THEN 'REVIEW'
              WHEN EXISTS (SELECT 1 FROM wa WHERE privs ~ '(SELECT|INSERT|UPDATE|DELETE)'
                             AND (NOT relrowsecurity OR (SELECT yes FROM bypass)
                                  OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy po, p
                                              WHERE po.polrelid = wa.oid
                                                AND (0::oid = ANY (po.polroles) OR p.roid = ANY (po.polroles)
                                                     OR EXISTS (SELECT 1 FROM unnest(po.polroles) pr WHERE pr <> 0 AND pg_has_role(p.roid, pr, 'USAGE'))))))
                THEN 'FAIL' ELSE 'PASS' END,
         'nenhuma',
         coalesce((SELECT string_agg(relname || CASE WHEN NOT relrowsecurity THEN ' (sem RLS)' ELSE ' (RLS ignorado ou política aplicável)' END, ', ' ORDER BY relname)
                     FROM wa WHERE privs ~ '(SELECT|INSERT|UPDATE|DELETE)'
                       AND (NOT relrowsecurity OR (SELECT yes FROM bypass)
                            OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy po, p
                                        WHERE po.polrelid = wa.oid
                                          AND (0::oid = ANY (po.polroles) OR p.roid = ANY (po.polroles)
                                               OR EXISTS (SELECT 1 FROM unnest(po.polroles) pr WHERE pr <> 0 AND pg_has_role(p.roid, pr, 'USAGE')))))), 'nenhuma'),
         'FAIL = sandbox_exec lê ou grava linhas reais (ex.: tabela com DML concedido e RLS desligado). É o único item que indica exposição de dados.'
  UNION ALL
  SELECT 42, 'alcance', 'tabelas de public com grant explícito para sandbox_exec', 'INFO', 'registrar',
         coalesce((SELECT com_grant || ' de ' || total FROM pub), '—'),
         'Quase todas = padrão da plataforma, não algo específico da 0011.'
  UNION ALL
  SELECT 43, 'alcance', 'privilégios de sandbox_exec no schema public',
         CASE WHEN o.roid IS NULL THEN 'REVIEW'
              WHEN has_schema_privilege(o.roid, 'public', 'CREATE') THEN 'REVIEW' ELSE 'PASS' END,
         'sem CREATE',
         'USAGE=' || coalesce(has_schema_privilege(o.roid, 'public', 'USAGE')::text, '?')
           || ', CREATE=' || coalesce(has_schema_privilege(o.roid, 'public', 'CREATE')::text, '?'),
         'CREATE permitiria criar objetos (inclusive funções) no schema da aplicação.'
  FROM own o
  UNION ALL
  SELECT 44, 'alcance', 'EXECUTE de sandbox_exec nas funções wa_campaign_*',
         CASE WHEN (SELECT roid FROM p) IS NULL THEN 'REVIEW' WHEN x.n = 0 THEN 'PASS' ELSE 'REVIEW' END, '0',
         x.n || ' de ' || x.total || coalesce(': ' || x.det, ''),
         'Mesmo com EXECUTE, as RPCs exigem auth.uid() e posse da conta WhatsApp; sem JWT respondem unauthorized.'
  FROM (SELECT count(*) FILTER (WHERE has_function_privilege(o.roid, f.oid, 'EXECUTE')) AS n, count(*) AS total,
               string_agg(f.proname, ', ' ORDER BY f.proname) FILTER (WHERE has_function_privilege(o.roid, f.oid, 'EXECUTE')) AS det
          FROM own o JOIN pg_catalog.pg_proc f ON f.proname LIKE 'wa\_campaign\_%'
          JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace AND n.nspname = 'public'
         WHERE o.roid IS NOT NULL) x

  -- ===================== 5. PRIVILÉGIOS PADRÃO (pg_default_acl) =====================
  UNION ALL
  SELECT 50, 'privilégios padrão', 'entradas que concedem algo a sandbox_exec',
         CASE WHEN NOT EXISTS (SELECT 1 FROM dacl d, p WHERE d.grantee = p.roid) THEN 'PASS' ELSE 'REVIEW' END, 'nenhuma',
         coalesce((SELECT string_agg(para_objetos_de || '/' || schema || '/' || defaclobjtype || ': ' || privs, ' | ' ORDER BY para_objetos_de, schema, defaclobjtype)
                   FROM (SELECT para_objetos_de, schema, defaclobjtype, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
                           FROM dacl d, p WHERE d.grantee = p.roid GROUP BY 1,2,3) s), 'nenhuma'),
         'Tipos: r=tabela, S=sequência, f=função, T=tipo, n=schema. Formato: objetos criados por / schema / tipo.'
  UNION ALL
  SELECT 51, 'privilégios padrão', 'entradas definidas PARA objetos criados por sandbox_exec', 'INFO', 'registrar',
         coalesce((SELECT count(*)::text FROM pg_catalog.pg_default_acl d, p WHERE d.defaclrole = p.roid), '0'), NULL
  UNION ALL
  SELECT 52 + row_number() OVER (ORDER BY pr.label, pr.gname), 'previsão F4',
         'tabela nova em public criada por ' || pg_get_userbyid(pr.cre) || ' (' || pr.label || ') → ' || pr.gname,
         CASE WHEN pr.gname IN ('sandbox_exec','anon','authenticated','PUBLIC') AND pr.privs IS NOT NULL THEN 'REVIEW' ELSE 'PASS' END,
         CASE WHEN pr.gname = 'service_role' THEN 'conforme decisão da F4' ELSE 'nenhum' END,
         coalesce(pr.privs, 'nenhum'),
         'Calculado de pg_default_acl + padrão embutido. REVIEW = as tabelas da F4 nasceriam com esse acesso; a correção C1 precisa tratá-lo.'
  FROM predict pr
)
SELECT ordem, area, item, status, esperado, encontrado, observacao
FROM (
  SELECT 0 AS ordem, 'RESULTADO GERAL' AS area, 'P8 — sandbox_exec e privilégios padrão' AS item,
         CASE WHEN bool_or(status = 'FAIL') THEN 'FAIL' WHEN bool_or(status = 'REVIEW') THEN 'REVIEW' ELSE 'PASS' END AS status,
         'todos PASS' AS esperado,
         count(*) FILTER (WHERE status = 'PASS') || ' PASS / ' || count(*) FILTER (WHERE status = 'FAIL') || ' FAIL / '
           || count(*) FILTER (WHERE status = 'REVIEW') || ' REVIEW / ' || count(*) FILTER (WHERE status = 'INFO') || ' INFO' AS encontrado,
         'INFO não entra no resultado. Ver itens 35 e 45 para o risco efetivo.' AS observacao
  FROM checks
  UNION ALL
  SELECT * FROM checks
) z
ORDER BY ordem, item;


-- -------------------------------------------------------------------------------------
-- BLOCO B — Detalhe para revisão manual (somente metadados)
-- Uma linha por fato: papéis relevantes, pertencimentos, privilégios padrão e ACLs.
-- -------------------------------------------------------------------------------------
SELECT 'papel' AS tipo, a.rolname AS objeto,
       'super=' || a.rolsuper || ', bypassrls=' || a.rolbypassrls || ', inherit=' || a.rolinherit
         || ', login=' || a.rolcanlogin || ', createrole=' || a.rolcreaterole || ', createdb=' || a.rolcreatedb AS detalhe
FROM pg_catalog.pg_roles a
WHERE a.rolname IN ('sandbox_exec', current_user, session_user, 'postgres', 'supabase_admin', 'authenticator',
                    'anon', 'authenticated', 'service_role')
UNION ALL
SELECT 'pertencimento', pg_get_userbyid(m.member) || ' ∈ ' || pg_get_userbyid(m.roleid),
       'admin=' || m.admin_option || ', inherit=' || m.inherit_option || ', set=' || m.set_option
         || ', concedido por ' || pg_get_userbyid(m.grantor)
FROM pg_catalog.pg_auth_members m
WHERE m.member = to_regrole('sandbox_exec') OR m.roleid = to_regrole('sandbox_exec')
   OR m.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
UNION ALL
SELECT 'privilégio padrão',
       pg_get_userbyid(d.defaclrole) || ' / '
         || CASE WHEN d.defaclnamespace = 0 THEN '(todos os schemas)' ELSE d.defaclnamespace::regnamespace::text END
         || ' / ' || d.defaclobjtype::text,
       d.defaclacl::text
FROM pg_catalog.pg_default_acl d
UNION ALL
SELECT 'ACL tabela', c.oid::regclass::text,
       'dono ' || pg_get_userbyid(c.relowner) || '; rls=' || c.relrowsecurity || ', force=' || c.relforcerowsecurity
         || '; ' || coalesce(c.relacl::text, 'ACL padrão')
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind IN ('r','p') AND c.relname LIKE 'whatsapp\_%'
UNION ALL
SELECT 'ACL schema', n.nspname, 'dono ' || pg_get_userbyid(n.nspowner) || '; ' || coalesce(n.nspacl::text, 'ACL padrão')
FROM pg_catalog.pg_namespace n WHERE n.nspname = 'public'
ORDER BY 1, 2;
