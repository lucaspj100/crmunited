import { supabase } from "@/integrations/supabase/client";
import type { ProspectContact } from "@/lib/prospect-queue";

/**
 * SEGUNDA CAMADA de filtros do Discador.
 * A primeira camada continua sendo `fetchDialerQueue` / `isEligibleForDialer`.
 * Aqui apenas RESTRINGIMOS o que o vendedor quer trabalhar agora — nada é
 * alterado, excluído ou gravado no banco.
 */

export type CallCountMode =
  | "any"
  | "none"
  | "eq1"
  | "eq2"
  | "eq3"
  | "gte2"
  | "gte3"
  | "custom";

export type CallCountOp = "eq" | "gte" | "lte";

export type CallResultMode =
  | "any"
  | "nao_atendeu"
  | "ocupado"
  | "caixa_postal"
  | "atendeu"
  | "ligar_depois"
  | "qualquer_resultado"
  | "sem_ligacao";

export type WhatsappMode =
  | "any"
  | "never"
  | "ever"
  | "sent"
  | "responded"
  | "no_response"
  | "in_list"
  | "not_in_list";

export type LastAttemptMode =
  | "any"
  | "today"
  | "yesterday"
  | "last3"
  | "last7"
  | "older7"
  | "custom";

export type DialerFilters = {
  callCount: CallCountMode;
  callCountOp: CallCountOp;
  callCountValue: number;
  callResult: CallResultMode;
  whatsapp: WhatsappMode;
  statuses: string[];
  lastAttempt: LastAttemptMode;
  lastAttemptFrom: string; // yyyy-MM-dd
  lastAttemptTo: string;
  ddd: string;
  empresa: string;
  origem: string;
};

export const EMPTY_FILTERS: DialerFilters = {
  callCount: "any",
  callCountOp: "eq",
  callCountValue: 1,
  callResult: "any",
  whatsapp: "any",
  statuses: [],
  lastAttempt: "any",
  lastAttemptFrom: "",
  lastAttemptTo: "",
  ddd: "",
  empresa: "",
  origem: "",
};

export const STATUS_OPTIONS = [
  "Aguardando ligação",
  "Não atendeu",
  "Ocupado",
  "Caixa postal",
  "Atendeu",
  "Ligar depois",
] as const;

export const CALL_COUNT_LABEL: Record<CallCountMode, string> = {
  any: "Qualquer quantidade",
  none: "Nenhuma ligação",
  eq1: "Exatamente 1 ligação",
  eq2: "Exatamente 2 ligações",
  eq3: "Exatamente 3 ligações",
  gte2: "2 ou mais ligações",
  gte3: "3 ou mais ligações",
  custom: "Quantidade personalizada",
};

export const CALL_RESULT_LABEL: Record<CallResultMode, string> = {
  any: "Qualquer",
  nao_atendeu: "Não atendeu",
  ocupado: "Ocupado",
  caixa_postal: "Caixa postal",
  atendeu: "Atendeu",
  ligar_depois: "Ligar depois",
  qualquer_resultado: "Qualquer resultado registrado",
  sem_ligacao: "Nunca teve ligação registrada",
};

export const WHATSAPP_LABEL: Record<WhatsappMode, string> = {
  any: "Qualquer",
  never: "Nunca chamou no WhatsApp",
  ever: "Já chamou no WhatsApp",
  sent: "Mensagem enviada",
  responded: "Respondeu",
  no_response: "Não respondeu",
  in_list: "Está na Lista WhatsApp",
  not_in_list: "Não está na Lista WhatsApp",
};

export const LAST_ATTEMPT_LABEL: Record<LastAttemptMode, string> = {
  any: "Qualquer data",
  today: "Hoje",
  yesterday: "Ontem",
  last3: "Últimos 3 dias",
  last7: "Últimos 7 dias",
  older7: "Mais de 7 dias",
  custom: "Intervalo personalizado",
};

/** Histórico agregado por contato (uma única leitura em lote, sem N+1). */
export type ContactHistory = {
  calls: number;
  results: Set<string>;
  answered: boolean;
  whatsappAttempts: number;
  lastCallAt: string | null;
  listStatus: string | null;
};

export type QueueHistory = Map<string, ContactHistory>;

const PAGE_SIZE = 1000;

const WPP_PROGRESSED = new Set([
  "mensagem_gerada",
  "mensagem_copiada",
  "whatsapp_aberto",
  "mensagem_enviada",
  "respondeu",
  "sem_resposta",
  "numero_invalido",
]);

function emptyHistory(): ContactHistory {
  return {
    calls: 0,
    results: new Set<string>(),
    answered: false,
    whatsappAttempts: 0,
    lastCallAt: null,
    listStatus: null,
  };
}

/**
 * Agrega `prospect_attempts` + `whatsapp_list_entries` do vendedor em lote.
 * Uma consulta paginada por tabela — nunca uma consulta por contato.
 */
export async function fetchQueueHistory(userId: string): Promise<QueueHistory> {
  const map: QueueHistory = new Map();
  const get = (id: string) => {
    let h = map.get(id);
    if (!h) {
      h = emptyHistory();
      map.set(id, h);
    }
    return h;
  };

  for (let page = 0; page < 60; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("prospect_attempts")
      .select("prospect_contact_id, tipo_acao, resultado, atendida, created_at")
      .eq("vendedor_id", userId)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      const id = r.prospect_contact_id;
      if (!id) continue;
      const h = get(id);
      if (r.tipo_acao === "whatsapp") {
        h.whatsappAttempts += 1;
      } else if (r.tipo_acao === "ligacao") {
        h.calls += 1;
        h.lastCallAt = r.created_at ?? h.lastCallAt;
        if (r.resultado) h.results.add(r.resultado);
        if (r.atendida === true || r.resultado === "Atendeu") h.answered = true;
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }

  for (let page = 0; page < 20; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("whatsapp_list_entries")
      .select("prospect_contact_id, status")
      .eq("owner_id", userId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      if (!r.prospect_contact_id) continue;
      get(r.prospect_contact_id).listStatus = r.status ?? null;
    }
    if (rows.length < PAGE_SIZE) break;
  }

  return map;
}

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function matchCallCount(f: DialerFilters, calls: number): boolean {
  switch (f.callCount) {
    case "any":
      return true;
    case "none":
      return calls === 0;
    case "eq1":
      return calls === 1;
    case "eq2":
      return calls === 2;
    case "eq3":
      return calls === 3;
    case "gte2":
      return calls >= 2;
    case "gte3":
      return calls >= 3;
    case "custom": {
      const n = Number(f.callCountValue ?? 0);
      if (!Number.isFinite(n)) return true;
      if (f.callCountOp === "gte") return calls >= n;
      if (f.callCountOp === "lte") return calls <= n;
      return calls === n;
    }
    default:
      return true;
  }
}

function matchCallResult(f: DialerFilters, h: ContactHistory): boolean {
  const has = (v: string) => h.results.has(v);
  switch (f.callResult) {
    case "any":
      return true;
    case "sem_ligacao":
      return h.calls === 0;
    case "qualquer_resultado":
      return h.results.size > 0;
    case "nao_atendeu":
      return has("Não atendeu");
    case "ocupado":
      return has("Ocupado");
    case "caixa_postal":
      return has("Caixa postal");
    case "ligar_depois":
      return has("Ligar depois");
    case "atendeu":
      return h.answered;
    default:
      return true;
  }
}

function matchWhatsapp(f: DialerFilters, h: ContactHistory): boolean {
  const list = h.listStatus;
  const progressed = !!list && WPP_PROGRESSED.has(list);
  const ever = h.whatsappAttempts > 0 || progressed;
  const sent = list === "mensagem_enviada" || list === "respondeu" || list === "sem_resposta" || h.whatsappAttempts > 0;
  const responded = list === "respondeu";
  switch (f.whatsapp) {
    case "any":
      return true;
    case "never":
      return !ever;
    case "ever":
      return ever;
    case "sent":
      return sent;
    case "responded":
      return responded;
    case "no_response":
      return list === "sem_resposta" || (sent && !responded);
    case "in_list":
      return !!list && list !== "removido";
    case "not_in_list":
      return !list || list === "removido";
    default:
      return true;
  }
}

function matchLastAttempt(f: DialerFilters, c: ProspectContact, h: ContactHistory): boolean {
  if (f.lastAttempt === "any") return true;
  const raw = c.ultima_tentativa ?? h.lastCallAt;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  const today = startOfDay(new Date());
  const day = 24 * 60 * 60 * 1000;
  switch (f.lastAttempt) {
    case "today":
      return t >= today;
    case "yesterday":
      return t >= today - day && t < today;
    case "last3":
      return t >= today - 2 * day;
    case "last7":
      return t >= today - 6 * day;
    case "older7":
      return t < today - 6 * day;
    case "custom": {
      const from = f.lastAttemptFrom ? new Date(`${f.lastAttemptFrom}T00:00:00`).getTime() : null;
      const to = f.lastAttemptTo ? new Date(`${f.lastAttemptTo}T23:59:59`).getTime() : null;
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      return true;
    }
    default:
      return true;
  }
}

function contains(haystack: string | null | undefined, needle: string): boolean {
  if (!needle.trim()) return true;
  return String(haystack ?? "").toLowerCase().includes(needle.trim().toLowerCase());
}

export function hasActiveFilters(f: DialerFilters): boolean {
  return (
    f.callCount !== "any" ||
    f.callResult !== "any" ||
    f.whatsapp !== "any" ||
    f.statuses.length > 0 ||
    f.lastAttempt !== "any" ||
    !!f.ddd.trim() ||
    !!f.empresa.trim() ||
    !!f.origem.trim()
  );
}

/** Aplica os filtros sobre a fila JÁ elegível (segunda camada). */
export function applyDialerFilters(
  contacts: ProspectContact[],
  history: QueueHistory | undefined,
  f: DialerFilters,
): ProspectContact[] {
  if (!hasActiveFilters(f)) return contacts;
  return contacts.filter((c) => {
    const h = history?.get(c.id) ?? emptyHistory();
    if (!matchCallCount(f, h.calls)) return false;
    if (!matchCallResult(f, h)) return false;
    if (!matchWhatsapp(f, h)) return false;
    if (f.statuses.length > 0 && !f.statuses.includes(c.status_prospeccao)) return false;
    if (!matchLastAttempt(f, c, h)) return false;
    if (f.ddd.trim() && String(c.ddd ?? "").replace(/\D/g, "") !== f.ddd.trim().replace(/\D/g, "")) return false;
    if (!contains(c.empresa, f.empresa)) return false;
    if (!contains(c.origem, f.origem)) return false;
    return true;
  });
}

/** Chips descritivos dos filtros ativos. */
export function filterChips(f: DialerFilters): string[] {
  const chips: string[] = [];
  if (f.callCount !== "any") {
    chips.push(
      f.callCount === "custom"
        ? `${f.callCountOp === "gte" ? "≥" : f.callCountOp === "lte" ? "≤" : "="} ${f.callCountValue} ligações`
        : CALL_COUNT_LABEL[f.callCount],
    );
  }
  if (f.callResult !== "any") chips.push(CALL_RESULT_LABEL[f.callResult]);
  if (f.whatsapp !== "any") chips.push(WHATSAPP_LABEL[f.whatsapp]);
  if (f.statuses.length > 0) chips.push(f.statuses.join(" / "));
  if (f.lastAttempt !== "any") {
    chips.push(
      f.lastAttempt === "custom"
        ? `Tentativa ${f.lastAttemptFrom || "…"} → ${f.lastAttemptTo || "…"}`
        : `Última tentativa: ${LAST_ATTEMPT_LABEL[f.lastAttempt]}`,
    );
  }
  if (f.ddd.trim()) chips.push(`DDD ${f.ddd.trim()}`);
  if (f.empresa.trim()) chips.push(`Empresa: ${f.empresa.trim()}`);
  if (f.origem.trim()) chips.push(`Origem: ${f.origem.trim()}`);
  return chips;
}

export type FilterShortcut = { id: string; label: string; patch: Partial<DialerFilters> };

export const SHORTCUTS: FilterShortcut[] = [
  { id: "one_no_wpp", label: "1 ligação + sem WhatsApp", patch: { callCount: "eq1", whatsapp: "never" } },
  { id: "two_no_wpp", label: "2+ ligações + sem WhatsApp", patch: { callCount: "gte2", whatsapp: "never" } },
  { id: "never_called", label: "Nunca liguei", patch: { callCount: "none" } },
  { id: "no_answer", label: "Não atenderam", patch: { callResult: "nao_atendeu" } },
  { id: "wpp_no_reply", label: "WhatsApp sem resposta", patch: { whatsapp: "no_response" } },
];

const storageKey = (userId: string) => `dialer_filters_v1_${userId}`;

/** Filtros são individuais por vendedor (persistidos apenas no dispositivo). */
export function loadFilters(userId: string): DialerFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw) as Partial<DialerFilters>;
    return { ...EMPTY_FILTERS, ...parsed, statuses: Array.isArray(parsed.statuses) ? parsed.statuses : [] };
  } catch {
    return EMPTY_FILTERS;
  }
}

export function saveFilters(userId: string, f: DialerFilters): void {
  if (typeof window === "undefined") return;
  try {
    if (!hasActiveFilters(f)) window.localStorage.removeItem(storageKey(userId));
    else window.localStorage.setItem(storageKey(userId), JSON.stringify(f));
  } catch {
    /* storage indisponível — filtro segue apenas em memória */
  }
}
