# Integração CRM ↔ Google Sheets (por vendedor)

Funcionalidade grande. Antes de codar, preciso confirmar algumas decisões — algumas mudam bastante o esforço e o custo da entrega.

## Visão geral do que vai ser construído

- Cada vendedor conecta **sua própria conta Google** e tem **1 planilha individual** (criada pelo CRM ou vinculada por URL).
- Sincronização **bidirecional**: CRM ↔ Sheets, identificada por `lead_id`.
- Admin vê tudo: leads de todos vendedores, planilhas conectadas, duplicidades entre vendedores, histórico, forçar sync.
- Status/etapa na planilha via **dropdown** com as opções do CRM (data validation), e validação no servidor — texto livre é rejeitado.
- Histórico de alterações por lead, com origem (CRM/Sheets) e detecção de conflito (vence o `updated_at` mais recente).

## Decisões técnicas (importantes)

### A. OAuth por vendedor (não é o connector Google atual)
O connector Google Sheets que a Lovable oferece autentica **a conta do dono do workspace** — serve para a planilha do admin, não para cada vendedor ter a sua. Preciso implementar **OAuth próprio por usuário**:

- Criar credenciais OAuth no Google Cloud Console (você precisa fazer isso e me passar `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` como secrets).
- Scopes: `spreadsheets`, `drive.file` (acesso só às planilhas criadas/abertas pelo app).
- Tabela `google_oauth_tokens` (access_token, refresh_token, expiry) por vendedor — só backend (server fns) acessa.
- Tela "Minha Integração Google Sheets" com botão **Conectar conta Google** que abre o consent screen do Google.

### B. Sincronização: como acontece na prática

**CRM → Sheets (push)**: toda mudança em `leads` (insert/update) dispara um job que escreve na planilha do vendedor dono. Vou usar um **trigger no Postgres** que enfileira em `sync_queue`, e um cron `pg_cron` chamando `/api/public/sync/run` a cada 1 min (auth por anon key). Em telas onde o vendedor clicou "Sincronizar agora", chamamos a server fn diretamente.

**Sheets → CRM (pull)**: polling a cada 2-5 min via mesmo cron. Para cada planilha conectada, lê a aba, compara com o CRM por `lead_id`, e aplica mudanças em campos editáveis. **Não é tempo real** — webhooks do Sheets não existem nessa granularidade. Se você quiser quase-tempo-real, pode reduzir o intervalo para 1 min (cota Google: 300 req/min/projeto — suficiente).

### C. Estrutura da planilha
- Aba `Leads` com as 17 colunas listadas no escopo.
- **Linha 1** congelada com headers.
- Colunas protegidas (lead_id, telefone normalizado, datas, criador, etc.) com **proteção de range** via API.
- Coluna `Status` e `Etapa` com **data validation** apontando para uma aba escondida `_opcoes` que é regenerada quando o admin mexe nos status do funil.

### D. Identidade e conflitos
- `lead_id` é a chave. Em insert pelo Sheets sem lead_id, o sistema gera um, escreve de volta na linha, e cria o lead.
- Conflito: comparamos `updated_at` do CRM com `updated_at_sheets` (armazenado em coluna oculta da planilha). Vence o mais recente; o perdedor vira entrada no histórico com tag "conflito".

### E. Banco — novas tabelas

```text
google_oauth_tokens  (user_id PK, access_token, refresh_token, expires_at, email, scope)
sheet_integrations   (user_id PK, spreadsheet_id, sheet_url, last_sync_at, last_sync_status, last_error)
sync_queue           (id, lead_id, owner_id, direction, payload, status, attempts, created_at)
lead_history         (id, lead_id, field, old_value, new_value, changed_by, source, conflict, created_at)
```

Mais colunas em `leads`: `last_contact_at`, `next_followup_at`, `updated_by`, `last_source` (crm|sheets).

Tudo com RLS: vendedor só vê o seu; admin vê tudo via `has_role(uid,'admin')`.

### F. UI nova / alterada

- `/_authenticated/integracao-sheets` — vendedor: conectar conta, criar/vincular planilha, status, sync agora, desconectar.
- `/_authenticated/admin/integracoes` — admin: tabela com todos os vendedores, planilhas, último sync, erros, botões.
- `/_authenticated/admin/leads-geral` — admin: visão consolidada de todos os leads (filtros: vendedor, status, etapa, datas, origem, duplicados, sem movimentação).
- `LeadDetailsDialog` ganha aba **Histórico**.
- Visão admin lista possíveis duplicidades entre vendedores (mesmo `phone_normalized`, owners diferentes).
- Mensagens/toasts já previstas no escopo.

### G. Onde fica o código de sync
Tudo em `createServerFn` (TanStack Start), nada em Edge Functions:
- `src/lib/sheets/oauth.functions.ts` — initiate/callback/refresh.
- `src/lib/sheets/integration.functions.ts` — create/link/disconnect.
- `src/lib/sheets/sync.functions.ts` — push, pull, sync-now, force-sync-all.
- Rota pública `src/routes/api/public/sync/run.ts` chamada pelo cron.

## O que **preciso de você antes de implementar**

1. **Credenciais OAuth Google** (Client ID e Secret). Posso te mandar passo a passo de como criar no console.cloud.google.com, e você cola aqui como secret — é o único caminho para "cada vendedor conecta a própria conta".
2. **Intervalo de sync Sheets→CRM**: 1 min, 2 min ou 5 min? (mais frequente = mais "tempo real", consome mais cota Google).
3. **Quando o admin alterar status do funil** (ex.: renomear "Interessado"), o que fazer com leads que estão nesse status na planilha?
   - (a) Reescrever automaticamente nas planilhas para o novo nome
   - (b) Bloquear edição até admin confirmar
4. **Lead criado direto no Sheets pelo vendedor** (linha nova sem lead_id) — permitir? Se sim, qual status default (sugiro `novo`)?

Se confirmar isso, parto pra implementação na ordem: schema → OAuth → criar/vincular planilha → push CRM→Sheets → pull Sheets→CRM → telas admin → histórico/conflitos → cron.

Posso também entregar em **fases** (ex.: Fase 1 = OAuth + criar planilha + export one-way CRM→Sheets; Fase 2 = pull bidirecional; Fase 3 = histórico/admin) se quiser ver valor antes. Me diz se prefere assim.
