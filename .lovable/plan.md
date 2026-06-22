## Visão geral

Evoluir o CRM United para uma operação B2C de alto volume com foco em **velocidade para o vendedor** e **controle para o ADM**, sem remover nada do que já existe. A entrega será feita em fases, na ordem que você definiu, para que cada bloco já entre em produção e gere valor antes do próximo.

Abaixo está o plano completo. Antes de começar, gostaria de confirmar um ponto importante (ver "Pontos a confirmar" no final) — assim eu começo a Fase 1 já alinhado.

---

## Fase 1 — Fila de Trabalho do Vendedor + Conclusão Rápida (prioridade máxima)

**Nova aba "Fila de Trabalho"** (mantendo a aba Tarefas atual intacta).

- Botão grande **"Trabalhar próximo lead"** no topo.
- Fila ordenada automaticamente:
  1. Entrevistas de hoje
  2. Tarefas atrasadas
  3. Leads novos sem primeiro contato
  4. Leads sem próxima ação
  5. Follow-ups do dia
  6. Resgates do dia
  7. Tarefas futuras próximas
- Vendedor vê só a sua fila; ADM pode filtrar por vendedor.

**Card/Modal "Próximo Lead"** com:
- Dados do lead (nome, telefone, empresa, status, responsável)
- Próxima tarefa + data/hora
- Observação + última observação
- Se entrevista: data/hora da entrevista
- Se resgate: motivo da perda anterior

**Botões rápidos no card:**
- Abrir WhatsApp · Copiar telefone · Copiar nome · Copiar mensagem pronta (escolhida automaticamente pelo tipo da tarefa/status) · Ver detalhes · Concluir tarefa · Reagendar · Cancelar

**Conclusão rápida** (modal curto com a opção padrão já selecionada):
- ✅ **Concluir e criar próximo follow-up** (padrão — regras automáticas por tipo de tarefa: primeiro contato → +1 dia, enviar mensagem → +3 dias, pós-entrevista → +3 dias, resgate → +7 dias)
- Concluir sem próxima tarefa
- Concluir e marcar entrevista (abre form curto: data + hora + obs)
- Concluir e marcar matrícula (abre form: valor matrícula + mensalidade + material)
- Concluir e marcar como perdido (reaproveita fluxo existente)
- Reagendar (só pede nova data)

Nenhum campo de "respondeu/atendeu/objeção" será obrigatório.

---

## Fase 2 — Biblioteca de mensagens prontas expandida

Adicionar em `src/lib/messages.ts`:
- primeiro contato, follow-up curto, segundo contato, confirmação de entrevista, reagendamento, não compareceu, pós-entrevista, última tentativa, resgate 30d, resgate 90d, pedido de indicação.

Todas usam primeiro nome automaticamente. Botão "Copiar mensagem" escolhe a mais adequada pelo tipo da tarefa/status, com opção de trocar manualmente via dropdown.

---

## Fase 3 — Melhorias no Funil

No card do lead no funil, adicionar:
- "Criado há X dias" · "X dias na etapa" · "Último contato há X dias"
- Próxima ação (já existe) + badge "atrasado" / "sem próxima ação"
- **Badge de temperatura**: 🔥 quente / 🌤️ morno / ❄️ frio (regras conforme você descreveu)
- Filtro por temperatura no topo do funil

---

## Fase 4 — Painel ADM por vendedor + Alertas

**Nova seção no dashboard ADM**: tabela/ranking por vendedor com todas as métricas pedidas (leads novos hoje/semana, tarefas hoje/concluídas/atrasadas, sem próxima ação, entrevistas marcadas/realizadas/no-show, matrículas mês, perdidos mês, taxa comparecimento, taxa matrícula, resgates).

Filtros: hoje, semana, mês, período personalizado, vendedor.

**Alertas clicáveis** logo abaixo (ex: "João tem 12 tarefas atrasadas" → abre Tarefas filtradas).

---

## Fase 5 — Agenda Comercial

Nova aba "Agenda" com entrevistas separadas por: hoje, amanhã, semana, não confirmadas, realizadas, no-shows, reagendamentos pendentes.

Cada card de entrevista: confirmar presença, marcar realizada, no-show, reagendar, virou matrícula, marcar perdido, abrir WhatsApp, copiar mensagem de confirmação.

---

## Fase 6 — Histórico de atividades (timeline)

Nova tabela `lead_events` (id, lead_id, user_id, event_type, description, metadata jsonb, created_at) com RLS espelhando `leads`.

Helper `logLeadEvent()` chamado automaticamente em: criar/editar lead, mudança de status, criar/concluir tarefa, abrir WhatsApp, copiar mensagem, marcar entrevista/confirmação/realização/no-show, registrar matrícula, perder, mover resgate, etc.

Timeline aparece no `LeadDetailsDialog` em ordem cronológica.

---

## Fase 7 — Metas e Ranking

Nova tabela `sales_goals` (vendedor, métrica, período, valor).

- ADM define metas via Configurações.
- Dashboard mostra progresso ("João 8/10 tarefas hoje").
- Ranking por período: tarefas concluídas, entrevistas marcadas/realizadas, matrículas, resgates.

---

## Fase 8 — Distribuição automática na importação

Na aba Importar, antes de confirmar, escolher:
- Igualmente entre vendedores selecionados
- Por peso (% por vendedor)
- Usar vendedor da planilha
- Vendedor padrão

Mostrar prévia ("João: 100, Maria: 60, Pedro: 40") e manter validação de duplicidade.

---

## Fase 9 — Segurança/Permissões e Performance

- Esconder botão "Excluir lead" para não-ADM em `LeadDetailsDialog`.
- Revisar RLS: vendedor só vê o que é seu; ADM/franqueado tudo.
- Configurações/Metas/Ranking completo só para ADM.
- Performance: filtros server-side por owner/status/data, paginação em listas grandes (leads, perdidos, resgates), invalidações de React Query mais granulares.

---

## Detalhes técnicos (resumo)

- Stack atual mantida: TanStack Start + React Query + Supabase.
- Novas rotas: `/_authenticated/fila`, `/_authenticated/agenda` (Fase 5).
- Novas tabelas via migration: `lead_events`, `sales_goals` (com GRANTs + RLS por owner_id e `has_role('admin')`).
- Lógica de "próximo follow-up automático" centralizada em `src/lib/task-automation.ts` (já existe — vou expandir).
- Temperatura do lead calculada client-side a partir dos campos já existentes (status, due_date, last_contact_at) — sem nova coluna.
- Tudo respeitando o gate `_authenticated` já gerenciado.

---

## Pontos a confirmar antes de começar

1. **Posso começar pela Fase 1 (Fila + Conclusão rápida) e te entregar para validar antes de seguir para a Fase 2?** Recomendo fortemente fatiar assim — cada fase é grande e quero garantir que a UX da Fila esteja do seu jeito antes de espalhar a lógica nas outras telas.

2. **Onde colocar a Fila?** Posso (a) criar uma aba nova "Fila de Trabalho" no menu, ou (b) transformar a aba "Tarefas" atual na Fila e mover a visão antiga para uma sub-aba. Minha sugestão é **(a)** — aba nova — para não mexer no que já funciona.
