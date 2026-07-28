## Análise do que existe hoje

- `leads` guarda a matrícula: `status='matricula'`, `enrollment_date` (data oficial), `enrollment_value`, `monthly_fee`, `material_value`. Hoje há **1.078 leads, 55 matrículas, 56 com `enrollment_date`, 55 com `material_value`** — não há tipo de material, status, condição, forma nem data de pagamento.
- Formulários de matrícula: `funil.tsx`, `agenda.tsx`, `hoje.tsx` (todos gravam os 3 valores + data), centralizados em `src/lib/enrollment.ts` (`registerEnrollmentAndSyncArena`), que também dispara o webhook Arena (`arena-webhook.functions.ts` envia `material_value`).
- Produtividade: RPC `productivity_summary` conta matrículas por `enrollment_date` — **não será alterado**.
- Metas existentes: `seller_daily_goals`, `team_goals` (diárias) — as metas de material serão separadas.

## Impacto (nada é removido)

- Campos atuais de `leads` permanecem intactos e continuam sendo gravados (compatibilidade). `material_value` vira espelho do valor do material principal.
- Nenhuma alteração em `productivity_summary`, ranking, placar ou permissões existentes.

## Novas tabelas

1. `material_bonus_rules` — regras vigentes por tipo (digital: 1428/1280; físico: 1668/1500), com `effective_from/until`, `is_active`, e flag `credit_single_installment_is_cash` (default false).
2. `material_sales` — um registro principal por lead (índice único parcial em `lead_id` para status ≠ cancelled/refunded), com todos os campos pedidos, incluindo snapshots (`minimum_allowed_value_snapshot`, `table_value_snapshot`, `rule_id_snapshot`, `cash_discount_percentage_snapshot`), `price_rule_valid`, `eligible_for_bonus`, `bonus_eligibility_reason`, auditoria de criação/alteração/confirmação/cancelamento/estorno e `retroactive_adjustment`.
3. `material_sales_history` — auditoria: evento, usuário, data/hora, `old_values`, `new_values`, `change_reason`.
4. `material_bonus_goals` — metas/faixas individuais e de equipe, com vigência.
5. `material_bonus_closings` — estrutura criada agora; fechamento mensal fica como fase opcional posterior.

## Regras no banco (fonte da verdade)

- Trigger `BEFORE INSERT/UPDATE` que: resolve a regra vigente pela `enrollment_date`, grava os snapshots (nunca sobrescreve snapshot já existente), calcula `price_rule_valid`, `eligible_for_bonus` e `bonus_eligibility_reason` pela ordem de prioridade definida (cancelado → estornado → isento → informações incompletas → aguardando pagamento → pago fora do mês → condição inválida → abaixo do mínimo → duplicidade → elegível).
- Trigger `AFTER` que grava histórico e emite eventos (`material_created`, `payment_confirmed`, `bonus_became_eligible`, etc.), também no `lead_events` do lead.
- Campos calculados enviados pelo frontend são ignorados/sobrescritos pelo trigger.

## RLS

- Vendedor: vê e edita apenas registros dos próprios leads; não altera elegibilidade, motivo nem snapshots (garantido pelo trigger que recalcula sempre).
- Admin/franqueado: leem e gerenciam tudo, incluindo regras, metas e cancelamentos/estornos.
- `material_bonus_rules`/`goals`/`closings`: leitura autenticada, escrita só admin/franqueado.

## Migração dos dados atuais

Para as 55 matrículas com `material_value`: criar `material_sales` com `lead_id`, `seller_id = owner_id`, `enrollment_date` original, `sale_value = material_value`, `payment_status='pending'`, sem tipo/condição/forma/data de pagamento, `bonus_eligibility_reason='missing_information'`. Nada é presumido a partir de `created_at`/`updated_at`. Matrículas sem `enrollment_date` também entram como `missing_information`.

## Interface

- Formulário de matrícula (funil, agenda, hoje) ganha bloco Material: possui material? tipo, valor, situação, condição, forma, parcelas, data do pagamento, observação — com validação visual em tempo real (mínimo aplicável, diferença, situação do preço) que **alerta mas não bloqueia** o salvamento.
- Ação "Confirmar pagamento do material" em: detalhes do lead, painel de materiais pendentes e painel administrativo.
- Nova página `/materiais`: painel do vendedor (Materiais e premiação, apenas dados próprios) e, para admin/franqueado, Premiação de materiais da equipe + ranking por vendedor, com todos os filtros pedidos (padrão: mês da matrícula).
- Configuração de regras, metas e faixas em Configurações (somente admin).

## Testes

Testes automatizados da função de elegibilidade cobrindo os cenários listados (digital/físico × à vista/parcelado, limites 1279,99 / 1280 / 1285 / 1308 / 1428 / 1499,99 / 1500 / 1501,20 / 1600 / 1668, pagamento fora do mês, pendente, cancelado, estornado) mais verificação de que o total da equipe é a soma exata dos elegíveis.

## Riscos e reversão

- Risco principal: divergência entre `leads.material_value` e `material_sales`. Mitigação: gravação pelo mesmo caminho (`enrollment.ts`) e manutenção do campo antigo como espelho.
- Risco de trigger recalcular registros históricos com regra nova: mitigado pelo snapshot imutável.
- Reversão: as tabelas são novas e aditivas; basta deixar de exibir a página `/materiais` e o bloco do formulário — nenhum dado atual é apagado ou alterado. Campos antigos só serão descontinuados numa migração futura, após validação.

## Entrega em etapas

1. Banco (tabelas, regras, triggers, RLS, seeds das regras) + migração dos 55 registros.
2. Formulário de matrícula + confirmação de pagamento.
3. Painel do vendedor, painel administrativo e ranking.
4. Metas/faixas e configuração administrativa.
5. Testes e revisão mobile.
