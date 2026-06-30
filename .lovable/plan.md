# Processos Comerciais + Checkout do Dia

## Visão geral
Nova área de produtividade que cruza dados do CRM (leads, tasks, prospect_attempts) com um novo registro diário (checkout) preenchido pelo vendedor. O ADM acompanha; o vendedor faz 1 checkout/dia com apenas 3 campos manuais.

## 1. Banco — nova tabela `daily_checkouts`

```sql
create table public.daily_checkouts (
  id uuid pk default gen_random_uuid(),
  vendedor_id uuid not null references auth.users on delete cascade,
  data date not null,
  submitted_at timestamptz not null default now(),
  -- snapshot automático do CRM no momento do envio
  ligacoes_feitas int not null default 0,
  ligacoes_atendidas int not null default 0,
  interessados_gerados int not null default 0,
  entrevistas_marcadas int not null default 0,
  matriculas int not null default 0,
  leads_trabalhados int not null default 0,
  leads_novos_atribuidos int not null default 0,
  -- manuais
  linkedin_msgs int not null default 0,
  whatsapp_msgs int not null default 0,
  observacoes text,
  created_at, updated_at,
  unique(vendedor_id, data)
);
```
- GRANT authenticated/service_role.
- RLS: vendedor lê/escreve só os próprios; admin/franqueado lê todos.
- 1 checkout por dia garantido pelo UNIQUE; UPDATE permitido no mesmo dia.

## 2. RPC `productivity_summary(start date, end date, vendedor_id uuid|null)`

Agrega por vendedor no período:
- `leads_novos`: count(leads where created_at in range & owner)
- `leads_trabalhados`: count(distinct lead_id em prospect_attempts + leads com last_contact_at no range)
- `ligacoes_feitas`: count prospect_attempts tipo=ligacao
- `ligacoes_atendidas`: count com resultado in ('Atendeu','Interessado','Pediu WhatsApp','Ligar depois')
- `interessados`: count prospect_contacts status='Interessado' updated in range + leads criados com source='Discador'
- `entrevistas_marcadas`: leads com interview_date no range
- `matriculas`: leads status='matricula' updated no range
- `whatsapps_checkout` / `linkedins_checkout`: soma dos checkouts no range
- `checkout_hoje`: bool + horário (apenas quando range = hoje)

Retorna jsonb array por vendedor.

## 3. Rotas

- `/_authenticated/processos-comerciais` (admin/franqueado) — tabela + filtros (Hoje/Semana/Mês/Custom + Vendedor).
- `/_authenticated/checkout-do-dia` (vendedor) — formulário com snapshot automático + 3 campos manuais. Se já houver checkout do dia, abre em modo editar.
- Card no Painel ADM com "X de Y vendedores fizeram checkout hoje" + link.
- Card na tela Hoje (sidebar/topo) lembrando o vendedor de fazer checkout no fim do dia.

## 4. Componentes

- `src/components/processos/ProductivityTable.tsx` — tabela com todas colunas pedidas + indicador "Checkout: feito HH:mm / pendente".
- `src/components/processos/PeriodFilter.tsx` — Hoje/Semana/Mês/Custom + select vendedor.
- `src/components/processos/CheckoutHistoryPanel.tsx` — histórico filtrável.
- `src/components/checkout/DailyCheckoutForm.tsx` — snapshot read-only (cards) + 3 inputs + observações.

## 5. Sidebar
Adicionar item "Processos" (admin) e "Checkout do dia" (vendedor) no menu.

## Detalhes técnicos
- Snapshot é calculado server-side pela RPC `productivity_summary` com range = hoje e vendedor = caller, salvo no INSERT/UPDATE do checkout.
- Editar checkout do mesmo dia recalcula o snapshot (sempre reflete o estado atual do CRM no momento do envio/edição).
- "Ligações atendidas" usa a coluna `resultado` da tabela `prospect_attempts`.
- Taxa de atendimento = atendidas / feitas (0 quando feitas=0).