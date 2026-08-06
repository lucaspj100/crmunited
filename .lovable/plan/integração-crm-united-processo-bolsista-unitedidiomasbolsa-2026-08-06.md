# Integração CRM United × Processo Bolsista (unitedidiomasbolsa)

## O que já existe e será reutilizado

- Tabela de leads única (`leads`) com etapas do funil (`novo`, `interessado`, `entrevista_marcada`, ...). A etapa "Novo" já existe — nada será duplicado.
- Vendedores: `profiles` + `user_roles` (admin / franqueado / vendedor). Nenhuma tabela nova de vendedores.
- Tarefas: tabela `tasks` (tipo `confirmar_entrevista` já existe).
- Histórico: `lead_events` (+ `logLeadEvent`).
- Notificações: watchers já existentes no CRM (tarefas/retornos) — a notificação do vendedor será a própria tarefa + destaque no card/Hoje, sem criar segundo sistema.
- Funil (`funil.tsx`), detalhes do lead (`LeadDetailsDialog.tsx`), Painel ADM (`painel-adm.tsx`) recebem apenas ajustes de exibição/ações.

## Sobre o Supabase compartilhado

O CRM usa o backend gerenciado do Lovable Cloud. Não tenho acesso ao backend do projeto `unitedidiomasbolsa`, então a integração será feita por **endpoint HTTP seguro no CRM**, que funciona nos dois casos (mesmo backend ou backends separados) e nunca exige service role no frontend do formulário. Se depois se confirmar que é o mesmo banco, o endpoint continua sendo a via correta (grava direto, sem fila de sincronização).

## Banco de dados (1 migration)

Nova tabela `public_seller_links`: `id`, `seller_id` → `profiles.id`, `public_slug` (único, minúsculo), `active`, `created_at`, `updated_at`, `created_by`, `updated_by`. Somente admin/franqueado leem e escrevem; nenhum acesso anônimo (a resolução do slug acontece no servidor).

Novas colunas em `leads` (a etapa continua sendo `status`):
- identificação: `external_lead_id` (único), `source_system`, `email`
- qualificação: `city_state`, `profession`, `company_name`, `english_level`, `english_goal`, `english_impact`, `lost_opportunity`, `why_not_studying`, `start_timeframe`, `financial_fit`, `interview_intent`, `scholarship_classification`, `high_priority`, `form_status`, `form_step`, `form_completed`, `form_answers` (jsonb)
- agendamento vindo do formulário: `requested_interview_at`, `scheduling_source`, `confirmation_status`, `confirmed_by`, `confirmed_at`, `last_confirmation_attempt_at`
- controle: `scholarship_task_created`, `scholarship_notified_at`

Nenhuma coluna existente muda de significado; cadastro manual, importação, discador, ranking e comissões seguem intactos.

## Endpoint público seguro

`POST /api/public/receive-scholarship-lead` (rota de servidor do CRM), protegido por segredo compartilhado no header — o formulário nunca vê a service role.

Comportamento:
1. Valida payload com Zod (tamanhos, formatos, limite de tamanho total).
2. Resolve `public_slug` → vendedor. Slug inexistente/inativo ⇒ erro 404 genérico, registro no log, nenhum lead atribuído aleatoriamente.
3. Normaliza WhatsApp com a função de telefone já usada no CRM.
4. Busca o registro por: `external_lead_id` → telefone normalizado do mesmo vendedor → e-mail do mesmo vendedor.
5. Cria (mínimo: nome + WhatsApp + e-mail) ou atualiza o mesmo lead. Vendedor original nunca é trocado.
6. **Força `status = 'novo'` sempre**, ignorando qualquer etapa enviada pelo frontend; nunca aceita campos administrativos (comissão, matrícula, entrevista realizada, responsável, permissões).
7. Agendamento: grava `requested_interview_at`, `scheduling_source = 'formulario_bolsista'`, `confirmation_status = 'aguardando_confirmacao'` — sem mover o card.
8. Cria a tarefa "Confirmar entrevista pelo WhatsApp" **uma única vez** (flag `scholarship_task_created`), vinculada ao lead e ao vendedor, com prazo antes da entrevista.
9. Histórico apenas em eventos relevantes: criação, formulário concluído, agendamento, tarefa criada, mudança para alta prioridade.
10. Retorna o `lead_id` do CRM. Reenvio é idempotente (sem duplicar lead, tarefa ou histórico).

## Painel ADM — "Links do processo bolsista"

Novo card no Painel ADM: lista com nome do vendedor, slug, link completo, status; botões copiar link, editar slug, ativar/desativar e criar novo link. Aviso ao criar segundo link ativo para o mesmo vendedor.

## Funil e detalhes do lead

- Card compacto: etiqueta "Processo bolsista", classificação, status do formulário, data/hora solicitada e status de confirmação, com destaque quando estiver aguardando confirmação.
- Detalhes do lead: nova seção "Qualificação do processo bolsista" com todas as respostas organizadas.
- Ações no lead: **Confirmar entrevista** (mantém o horário, marca confirmado, move manualmente para "Entrevista marcada", conclui a tarefa, registra histórico), **Não confirmou** (permanece em Novo, registra usuário/data, conclui a tarefa, permite follow-up) e **Confirmar interesse** (move manualmente para Interessado).
- Filtros no funil/leads: origem Processo bolsista, formulário incompleto/concluído, com agendamento, aguardando confirmação/confirmado/não confirmado e classificação.

## Como testar

Cenários A–H (abandono, concluído sem agendar, quente agendado, vendedor confirma, não confirmou, sem fit, slug inválido, atualizações repetidas) serão exercitados chamando o endpoint com o mesmo `external_lead_id` e verificando no CRM que a etapa permanece "Novo" até uma ação manual.

## Observação de escopo

Relatórios ficam apenas estruturados nos campos (sem novas telas de relatório agora), como você indicou. O ajuste no repositório `unitedidiomasbolsa` (chamar o endpoint em cada etapa do chatbot) é feito lá; aqui entrego o endpoint, o contrato de payload e o segredo.
