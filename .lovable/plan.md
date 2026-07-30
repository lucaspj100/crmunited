## Diagnóstico da estrutura atual

**Matrícula** não é uma tabela própria: é o próprio lead em `leads` com `status = 'matricula'`.
- Colaborador responsável: `leads.owner_id`
- Valor da matrícula: `leads.enrollment_value` (já existe e é separado)
- Material: `leads.material_value` + tabela dedicada `material_sales` (com regras de bônus próprias)
- Mensalidade: `leads.monthly_fee`
- Data real: `leads.enrollment_date`
- Evento de conclusão: `registerEnrollmentAndSyncArena()` em `src/lib/enrollment.ts` grava o lead, cria `lead_events` tipo `enrolled` e dispara a Arena
- Cancelamento hoje: o lead sai de `matricula` (vai para `perdido` ou outro status) — registrado em `lead_events` (`status_change`) e `lost_at`

**Conclusão importante:** os valores já são campos distintos (matrícula / material / mensalidade). Não é preciso quebrar nada — a base de cálculo será exclusivamente `enrollment_value`.

**Cargos**: hoje existem apenas os perfis `admin`, `franqueado`, `vendedor` em `user_roles`. Não existem "consultor / supervisor / gerente". A regra por cargo será ancorada nesses perfis existentes (evita criar um segundo sistema de cargos). A regra individual por colaborador cobre qualquer exceção.

**Permissões**: `has_role(uid,'admin')` já existe e é o padrão do projeto; o menu já filtra por `isAdmin`.

## Tabelas novas (nenhuma tabela existente é alterada)

1. `leadership_commission_rules` — escopo `individual` (employee_id) ou `role` (role app_role), tipo `percentage`/`fixed`, valor, `valid_from`, `valid_until`, `is_active`, auditoria.
   - Índice único parcial garantindo uma regra ativa por colaborador e por cargo na mesma vigência.
2. `leadership_commissions` — um registro por matrícula (`UNIQUE (lead_id)`), com snapshots: nome do aluno, colaborador, cargo, data e valor da matrícula, valor do material (apenas informativo), tipo/percentual/valor fixo aplicados, valor final, status da matrícula, status da comissão (`prevista|confirmada|paga|cancelada|estornada|nao_configurada`), data de pagamento, observação.
3. `leadership_commission_audit_logs` — ação, dados anteriores/novos, motivo, autor, data.

Funções/triggers:
- `resolve_leadership_commission_rule(employee_id, date)` — individual tem prioridade sobre cargo; sem regra → `nao_configurada`, sem inventar percentual.
- Trigger em `leads`: ao entrar em `matricula` cria a comissão (idempotente por `lead_id`); ao sair de `matricula` aplica prevista→cancelada, confirmada/paga→estornada. Nunca apaga registros, nunca recalcula histórico.

## RLS

Todas as três tabelas: `GRANT` só para `authenticated` + `service_role`, RLS ativa e **todas** as policies (select/insert/update) exigindo `has_role(auth.uid(),'admin')`. Vendedor/franqueado não leem nada nem via API direta. A rota também é bloqueada no frontend e o menu só aparece para admin.

## Interface (`/comissao-lideranca`, só admin)

- Cards de resumo do período: prevista, confirmada, paga, estornada, total líquido (`confirmada + paga − estornada`, sem dupla contagem), qtd. de matrículas com comissão, qtd. sem configuração.
- Aba **Configuração de comissões**: tabela de colaboradores (nome, cargo, status, tipo, valor, vigência, status da regra, editar) + bloco de regras padrão por cargo.
- Aba **Histórico**: tabela paginada com todas as colunas pedidas, "—" quando não se aplica, ações (confirmar, marcar paga com data, estornar, editar com motivo obrigatório, recalcular com confirmação).
- Aba **Por colaborador**: resumo ordenável.
- Filtros: atalhos Hoje / Esta semana / Este mês / Mês anterior / Personalizado reusando `weekRange` e `localIso` de `src/lib/productivity.ts` (domingo→sábado 23:59), além de colaborador, cargo, status da matrícula, status da comissão, tipo e configurada/não configurada.
- Exportação Excel e CSV respeitando os filtros, via `src/lib/xlsx-export.ts` já existente.
- Formatação `R$ 1.250,00` e `5,00%`, responsivo, tokens de tema do projeto.

## Arquivos

Novos: migration SQL, `src/lib/leadership-commission.ts`, `src/lib/leadership-commission.functions.ts` (server fns admin-only), `src/routes/_authenticated/comissao-lideranca.tsx`, componentes em `src/components/comissao/`.
Alterados: `src/routes/_authenticated/route.tsx` (item de menu admin). `src/lib/enrollment.ts` só recebe um "ensure" idempotente caso o trigger não cubra retroativos — sem mudar o fluxo atual.

## Riscos

- Baixo: nenhuma tabela existente muda de forma; o trigger em `leads` é aditivo e à prova de falha (não bloqueia a matrícula se a comissão não puder ser criada).
- Matrículas antigas não geram comissão retroativa automaticamente; haverá ação manual "gerar comissões do período" para o admin, com confirmação.
- Cargos limitados aos perfis existentes; se você quiser cargos próprios (consultor/supervisor/gerente), isso vira uma etapa extra.

## Etapas

1. Banco: tabelas, funções, triggers, RLS/GRANTs.
2. Configuração por colaborador e por cargo.
3. Geração automática + ação de geração retroativa.
4. Dashboard, histórico, filtros, resumo por colaborador.
5. Cancelamento/estorno, auditoria de edições, exportação.
6. Testes de cenários e relatório final.
