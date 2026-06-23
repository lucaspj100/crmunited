# Discador de Prospecção

Módulo novo, paralelo ao CRM, que trabalha listas frias de telefone. Só envia para o CRM existente os contatos realmente interessados. Reusa usuários, papéis (admin/vendedor), tabela `leads` e funil atuais — nada disso é duplicado.

## 1. Banco de dados (migração única)

Duas tabelas novas, no padrão dos GRANTs/RLS do projeto.

**`prospect_contacts`**
- nome, telefone_original, telefone_normalizado (unique), ddd, empresa, cargo, origem, observacao
- vendedor_responsavel_id (fk profiles), assigned_at
- status_prospeccao (enum textual com os 13 status pedidos), quantidade_tentativas (int default 0), ultima_tentativa, proxima_tentativa
- nao_chamar (bool), telefone_invalido (bool), convertido_em_lead (bool), lead_id (fk leads)
- created_at, updated_at, created_by

**`prospect_attempts`**
- prospect_contact_id, vendedor_id, tipo_acao (`ligacao|whatsapp|edicao`), telefone_normalizado, resultado, observacao, created_at

**`app_settings`** ganha chave `prospect_whatsapp_template` (texto). Sem nova tabela.

**RLS**
- Vendedor: SELECT/UPDATE só onde `vendedor_responsavel_id = auth.uid()`.
- Admin/franqueado: tudo (via `has_role`).
- INSERT em `prospect_contacts` só admin. INSERT em `prospect_attempts` pelo próprio vendedor do contato ou admin.
- GRANTs para `authenticated` e `service_role`.

Trigger `set_updated_at` no `prospect_contacts`.

## 2. Helpers (frontend)

- `src/lib/prospect-phone.ts` — reaproveita `normalizePhone` e devolve `{ normalized, ddd, e164 }`. Formato salvo: dígitos puros (mesmo padrão BR já usado), o `tel:` e `wa.me` montam o prefixo na hora.
- `src/lib/prospect-status.ts` — labels, cores, lista de status, regras de fila.
- `src/lib/prospect-import.ts` — parse XLSX/CSV (já existe `xlsx`), normaliza, deduplica contra `prospect_contacts` + `leads`, gera relatório.

## 3. Rotas novas (sob `_authenticated/`)

Uma rota raiz `/discador` com sub-abas internas controladas por estado (sem subrota) para manter simples:

- **Aba "Trabalhar" (vendedor + admin)** — fila pessoal, card grande do contato atual, botões Ligar (`tel:`), WhatsApp (`wa.me`), Registrar resultado, Converter em lead, histórico do contato.
- **Aba "Base" (admin)** — tabela de todos os contatos com filtros (vendedor, status, origem, DDD, datas, tentativas, "sem tentativa", "para hoje", interessados, pediu wpp, inválidos, não chamar, convertidos). Ações em massa: redistribuir, marcar não chamar.
- **Aba "Importar" (admin)** — upload XLSX/CSV, escolha de distribuição (auto entre ativos / vendedor X / sem dono), preview, relatório final.
- **Aba "Painel" (admin)** — indicadores geral, por vendedor, por origem, por DDD.
- **Aba "Config" (admin)** — mensagem padrão de WhatsApp.

Item de menu "Discador" (ícone PhoneCall) no sidebar para todos os papéis; sub-abas admin só aparecem se `roles.includes('admin')`.

## 4. Fluxo "Próximo contato"

Server-side query (cliente Supabase com RLS):
```
status_prospeccao IN ('Aguardando ligação')
  OR (status_prospeccao = 'Ligar depois' AND proxima_tentativa <= now())
ordem: Aguardando primeiro, depois proxima_tentativa asc, depois created_at asc
limit 1
```
Excluindo `convertido_em_lead`, `nao_chamar`, `telefone_invalido`, e status finais ("Sem interesse", "Não chamar", "Convertido em lead").

## 5. Ações

- **Ligar agora**: `window.location.href = 'tel:+' + telefone_normalizado`; incrementa `quantidade_tentativas`, seta `status='Ligando'`, `ultima_tentativa=now()`, insere `prospect_attempts` (tipo `ligacao`, resultado vazio), abre modal obrigatório de resultado.
- **WhatsApp**: `window.open('https://wa.me/' + telefone + '?text=' + encodeURIComponent(template))`; insere attempt tipo `whatsapp`, abre modal de resultado (não obrigatório fechar antes de próximo, mas recomendado).
- **Modal Resultado**: select dos 9 resultados, observação curta, datetime de próxima tentativa quando "Ligar depois". Botão "Salvar e ir para próximo" aplica efeitos:
  - Interessado → status Interessado, destaca botão Converter.
  - Pediu WhatsApp → status Pediu WhatsApp.
  - Ligar depois → grava `proxima_tentativa`, status `Ligar depois`.
  - Número inválido → `telefone_invalido=true`.
  - Não chamar → `nao_chamar=true`, bloqueia fila.
  - Demais → status correspondente.
- **Converter em lead**: antes verifica duplicidade em `leads.phone`. Se existe, mostra alerta com link "Abrir lead existente" (`/funil` + dialog). Senão abre `NewLeadDialog` pré-preenchido (nome, telefone, empresa→observação, origem). No success: marca `convertido_em_lead`, `lead_id`, status `Convertido em lead`, registra `lead_events` (`enrolled?` não — usa evento `lead_created` já existente).

## 6. Importação

- Upload aceita `.xlsx`, `.xls`, `.csv` (usa `xlsx` package).
- Mapeamento fuzzy de cabeçalhos: telefone/phone/celular; nome/name; empresa/company; cargo/role; origem/source; observação/obs/notes.
- Para cada linha: normaliza → valida (10-13 dígitos BR) → checa duplicado em `prospect_contacts.telefone_normalizado` e `leads.phone`.
- Distribuição: round-robin entre vendedores ativos selecionados, ou um único vendedor, ou null.
- Insert em lote (chunks de 500).
- Relatório: lidas, importadas, duplicadas (com lista), inválidas, erros.

## 7. Painel admin

KPIs com queries agregadas:
- Totais: importados, disponíveis (status Aguardando + Ligar depois vencido), trabalhados (tentativas>0), inválidos, não chamar, ligações, whatsapps, interessados, convertidos.
- Taxas: interessado/trabalhado, convertido/interessado.
- Tabela por vendedor (join profiles).
- Tabela por origem.
- Tabela por DDD.

Período: hoje / 7d / mês / customizado (mesmo padrão de `painel-adm.tsx`).

## 8. Itens técnicos

```text
src/
  routes/_authenticated/discador.tsx        (shell + tabs)
  components/discador/
    WorkPanel.tsx         (fila + card vendedor)
    ContactCard.tsx
    ResultDialog.tsx
    ConvertLeadDialog.tsx (reusa NewLeadDialog)
    AttemptHistory.tsx
    BasePanel.tsx         (tabela admin + filtros + bulk)
    ImportPanel.tsx
    DashboardPanel.tsx
    ConfigPanel.tsx
  lib/
    prospect-phone.ts
    prospect-status.ts
    prospect-import.ts
    prospect-queue.ts     (next contact query)
supabase/migrations/<ts>_prospect_module.sql
```

Sem novos secrets, sem edge functions, sem Twilio. Usa apenas o que já existe: Supabase client, `xlsx`, shadcn, sidebar atual, `NewLeadDialog`, `has_role`, padrão de `lead_events` para auditoria de conversão.

## Entrega faseada (uma execução só, mas nessa ordem dentro do PR)

1. Migração + tipos.
2. Helpers (`prospect-*.ts`).
3. Rota `/discador` + item no menu.
4. Aba Trabalhar (núcleo de valor para vendedor).
5. Aba Base + Importar (admin).
6. Aba Painel + Config.
