# Definições vigentes que NÃO estão no histórico do Drizzle

> Atualizado em 19/10/2026. Quem alterar estes objetos a partir de `drizzle/migrations/` parte de uma versão antiga
> e pode desfazer uma proteção. As funções da tabela abaixo foram conferidas em produção.

| Objeto | Versão no `drizzle/migrations/` | Versão vigente em produção | Conferido por |
| --- | --- | --- | --- |
| `wa_campaign_claim(uuid,uuid,uuid,uuid,uuid)` | 0008 (sem `attempt_revoked`) | **MAN-0011-R3** | P6 (byte a byte) |
| `wa_campaign_unclaim(uuid,uuid,uuid,uuid,uuid)` | 0008 | **MAN-0011-R3** | P6 (byte a byte) |
| `whatsapp_campaign_revoked_attempts` | — | **MAN-0011-R3** | P6 |
| Guardas de `whatsapp_campaign_contacts` e `whatsapp_campaigns` (`wa_campaign_contacts_guard`, `_schema_guard`, `_truncate_guard`, `wa_campaigns_delete_guard` e 5 triggers) | — | **MAN-0010-R1** | P7 (byte a byte) |
| Colunas de `whatsapp_campaign_contacts` | 0004–0008 | Inalteradas, mas **congeladas**: `wcc_schema_guard` (MAN-0010-R1) recusa importações se uma coluna for adicionada | P7 item 140 |
| `whatsapp_campaigns.owner_user_id`, `whatsapp_campaign_owner_events`, `wa_feature_flags`, `wa_feature_flag_events`, `wa_campaign_assign_owner`, `wa_feature_flag_set`, `wa_campaigns_owner_*`, `wa_f4_*` | — | **MAN-0012-F4-0a**, estado `CAMADA_1` | P19 (65 PASS em produção, `evidencias/P19_producao_2026-10-19.csv`) |
| `wa_campaign_reserve`, `_release`, `_list_active`, `_own_active_account`, `_own_account`, `_close_cancel_contacts` | 0005/0006/0008 | **Iguais ao repositório** (última definição) | P17 (byte a byte) |
