Plano de evolução do CRM mantendo layout simples e rápido. Divido em 7 blocos. Posso entregar todos numa sequência, ou priorizar — me diga se quiser ajustar a ordem.

## 1. Schema (migração única)

Alterações no banco:
- Enum `lead_status`: adicionar valor `novo` (primeira etapa).
- Tabela `leads`: novos campos
  - `source` (text, nullable) — origem do lead
  - `phone_normalized` (text, nullable, indexado) — telefone só dígitos no padrão `55DDDNUMERO`
  - `phone_invalid` (boolean, default false) — marcado quando telefone tem menos dígitos que o mínimo
- Backfill: gerar `phone_normalized` para leads existentes a partir de `phone` e default `status='novo'` apenas em novos cadastros (não migra status atuais).
- Default de `leads.status` muda para `'novo'`.
- Índice único parcial: `UNIQUE (owner_id, phone_normalized) WHERE phone_normalized IS NOT NULL` para impedir duplicidade por vendedor. (Posso trocar por unicidade global se preferir — me avise.)
- Enum `task_type`: adicionar `primeiro_contato` e `ligar`.

## 2. Constantes e utilitários

- `src/lib/constants.ts`:
  - Adicionar `novo` no `LEAD_STATUSES` no topo.
  - Cor própria (cinza/azul claro).
  - Atualizar `LOST_REASONS.suggestRescueDays` conforme regra solicitada (não compareceu=7, sem dinheiro=60, sem tempo=30, sem interesse=90, outro=manual).
- Novo `src/lib/phone.ts`:
  - `normalizePhone(raw)` → remove tudo que não é dígito, garante prefixo `55`, valida tamanho (mín 12, máx 13 dígitos), retorna `{ normalized, valid }`.
  - Usado em cadastro manual, importação e busca de duplicidade.

## 3. Cadastro de lead (NewLeadDialog)

- Adicionar select de Status (default `Novo`).
- Adicionar campo "Origem do lead" (texto livre).
- Antes do insert: normalizar telefone, consultar duplicidade via `phone_normalized`. Se existir, mostrar toast: *"Esse telefone já está cadastrado no lead [nome], vendedor [nome]."* e abortar.
- Salvar `phone` (original) e `phone_normalized`.
- Tarefa inicial criada conforme status (ver bloco 5).

## 4. Importação CSV/Excel

- Nova rota `/_authenticated/importar` (admin/franqueado/vendedor).
- Botão "Importar planilha" na página de Leads.
- Usa `xlsx` (npm) para ler `.csv`, `.xlsx`, `.xls`.
- Mapeamento flexível de colunas: tenta detectar por header (nome, telefone, empresa, origem, vendedor, observações, status, linkedin); UI permite o usuário ajustar mapeamento se ambíguo.
- Tela de revisão (após parse, antes de gravar):
  - Total na planilha, Novos válidos, Duplicados (já existem no CRM ou repetidos na própria planilha), Telefone inválido, Sem vendedor, Precisam revisão.
  - Tabela linha-a-linha com badge da categoria.
  - Botão "Importar apenas os válidos novos".
- Vendedor é resolvido por nome/email no `profiles`; se não encontrar, marca "Sem vendedor responsável" (e o admin pode escolher um padrão).
- Status padrão `novo` quando não vier na planilha.

## 5. Tarefas automáticas por etapa

Quando um lead muda de status (cadastro ou movimentação no funil), criar tarefa correspondente vinculada ao vendedor:
- `novo` → `primeiro_contato` (hoje)
- `interessado` → `enviar_mensagem` (hoje)
- `entrevista_marcada` → `confirmar_entrevista` (data da entrevista — já existe)
- `entrevista_realizada` → `followup_pos` (D+1)
- `perdido` → tarefa `resgate` na data sugerida (já existe via LostDialog)

A criação só ocorre se não houver tarefa pendente do mesmo tipo para o lead, para evitar duplicação.

Funil ganha nova coluna "Novo" no início; lógica de movimentação inalterada.

## 6. Aba Tarefas

- `TASK_TYPES` ganha `primeiro_contato` e `ligar`.
- Cards de tarefa já mostram nome, empresa, status, tipo, data, horário, WhatsApp, LinkedIn, concluir, reagendar, cancelar. Adicionar nome do vendedor responsável.
- Botão "Excluir" (admin e dono).
- Filtro por vendedor (admin/franqueado).

## 7. Resgates, Dashboard, Relatórios

**Resgates** (`/resgates`):
- Seções: Atrasados, Hoje, Esta semana, Este mês, 30/60/90 dias.
- Cada card: nome, empresa, telefone, vendedor, data prevista, motivo anterior, observação, status anterior, WhatsApp.
- Botão "Resgatar" abre dialog para escolher etapa de retorno (Novo, Interessado, Entrevista marcada).
- "Reagendar" abre date picker.
- "Descartar" mantém perdido e remove da fila.

**Dashboard**:
- Adiciona card "Novos" no funil.
- Seção "Alertas importantes" no topo destacando: leads novos sem primeiro contato, tarefas atrasadas, entrevistas marcadas para hoje, leads sem próxima ação, resgates pendentes.

**Relatórios**:
- Adiciona blocos: Leads por origem, Tarefas concluídas por vendedor, Tarefas atrasadas por vendedor, Resgates pendentes, Resgates realizados, Conversão por etapa do funil.
- Filtros: vendedor, status, empresa, origem, período, motivo de perda.

## Notas técnicas

- Tudo em queries do cliente (sem novos serverFn), mantendo simplicidade. RLS atual já cobre por owner/admin/franqueado.
- `xlsx` adiciona ~400KB ao bundle apenas na rota de importação (lazy import).
- Sem mudanças em auth, branding, ou layout do sidebar.

## Pergunta antes de implementar

**Unicidade de telefone**: global em todo o CRM, ou apenas por vendedor (mesmo número pode existir em vendedores diferentes)?

Se ok com tudo acima, confirmo e implemento na sequência.