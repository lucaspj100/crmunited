# Índice das migrations manuais

> Atualizado em 19/10/2026. As datas de aplicação de MAN-0010-R1 e MAN-0011-R3 não estão registradas (pendência P14).
> "Relatado" = informado pelo responsável, sem o arquivo de resultado neste diretório.

| Identificador | Arquivo | SHA-256 | Aplicação em produção | Prova de conformidade | Situação |
| --- | --- | --- | --- | --- | --- |
| MAN-0010-R1 | `0010-R1_whatsapp_campaigns_f3b3a_state_guard.sql` | `26b1fa3cde6c6d23f148652a8655a5f3483ca5fd932b1483a650953903c2f51f` | Antes de 17/10/2026, pelo SQL Editor (relatado; data exata desconhecida) | P7 de 17/10: 71 PASS / 0 FAIL; as 4 funções **idênticas byte a byte**; os 5 triggers conferidos (`evidencias/P7_producao_2026-10-17.csv`) | Aplicada e verificada. **`0010_rollback.sql` não recuperado** (P7-R): não reconstruir aqui sem revisão |
| MAN-0011-R3 v4 | `0011-R3_v4_whatsapp_campaigns_revoked_attempts.sql` | `2f390ea215634971cac89fbce8b1f6ee378a0815bf7b4aceca1f0bc999537f32` | Antes de 17/10/2026, pelo SQL Editor (relatado; data exata desconhecida) | P6 de 17/10: 58 PASS / 0 FAIL; `claim` e `unclaim` **idênticas, inclusive espaços e comentários**; tabela e privilégios conferidos (`evidencias/P6_producao_2026-10-17.csv`) | Aplicada e verificada. **O cabeçalho do arquivo diz "PROPOSTA — NÃO APLICADA"**: é o texto original e foi mantido; esta entrada registra que ele foi aplicado |
| MAN-0012-F4-0a | `0012-F4-0a/0012_f4_0a_campaign_owner_bloco_unico.sql` | `ff5e623e42adfa18bd454d68184faa6a81609d781c42efe58d595b1238c6f238` | 19/10/2026, pelo SQL Editor (relatado) | **P19 em produção, 19/10/2026: 65 PASS / 0 FAIL / 0 REVIEW / 2 INFO (CSV original em `evidencias/P19_producao_2026-10-19.csv`, SHA-256 `d4dc7976d9350eb0496c93f0bc9459088e53a8aba5b784be8e9afc627b75d5ea`)**. Estado `CAMADA_1`; fotografia antes/depois aprovada; P6 58, P7 71, P17 88 PASS (relatado) | Aplicada, **dormente** |
| MAN-0012-F4-0a (camada 1) | `0012-F4-0a/camada1_parar_APLICADA_19-10.sql` | `6c72dd0072f3b1d811ecee215dfc9c7af147d3e9559a44a8fe299961055d2cce` | 19/10/2026, logo após a anterior (relatado) | Coberta pela P19 (itens EXECUTE: RPCs novas só com o dono) — 65 PASS (`evidencias/P19_producao_2026-10-19.csv`) | Aplicada |
| — | `0012-F4-0a/0012_f4_0a_campaign_owner.sql` | `addab4f40c63c2ac48b04204394c27f2b64110720bd67890c8c0849078e804e8` | **Não aplicada** (variante `BEGIN`/`COMMIT`, fonte do bloco único) | Catálogo idêntico ao do bloco único (teste F05) | Referência; **não registrar no Drizzle** (o `COMMIT` próprio quebra o lote do Drizzle) |
| — | `0012-F4-0a/rollback/camada2…4` | ver arquivos | **Não aplicadas** | Testadas em PostgreSQL 17 isolado (97 PASS) | Disponíveis só com autorização |

## Ausente (não reconstruído)

| Item | Situação |
| --- | --- |
| Rollback original da MAN-0010-R1 (`0010_rollback.sql`) | **Não recuperado** (pendência P7-R). Citado no cabeçalho da MAN-0010-R1, mas o arquivo nunca foi fornecido. Não foi reconstruído nem inventado. Se for recuperado, entra como arquivo novo com hash e origem |
