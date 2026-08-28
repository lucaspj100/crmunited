// Helpers para a consulta operacional de leads (página Relatórios).
// Regra central: o "período" deve usar a data real da etapa do lead,
// não a data de criação. Só usamos datas que existem no banco.

export type ReportLead = {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  company_name: string | null;
  profession: string | null;
  source: string | null;
  status: string;
  owner_id: string;
  lost_reason: string | null;
  lost_type: string | null;
  lost_at: string | null;
  observation: string | null;
  interview_notes: string | null;
  interview_date: string | null;
  interview_done_date: string | null;
  enrollment_date: string | null;
  next_followup_at: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type DateBasis = "stage" | "created";

const d10 = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

/**
 * Data real da etapa em que o lead se encontra:
 * - entrevista_realizada: interview_done_date (fallback: evento interview_done)
 * - matricula: enrollment_date (fallback: interview_done / criação)
 * - perdido: lost_at
 * - entrevista_marcada: interview_date
 * - demais: created_at
 */
export function stageDate(l: ReportLead, doneEvent?: Map<string, string>): string | null {
  const done = d10(l.interview_done_date) ?? d10(doneEvent?.get(l.id));
  switch (l.status) {
    case "entrevista_realizada":
      return done ?? d10(l.interview_date) ?? d10(l.created_at);
    case "matricula":
      return d10(l.enrollment_date) ?? done ?? d10(l.created_at);
    case "perdido":
      return d10(l.lost_at) ?? d10(l.updated_at) ?? d10(l.created_at);
    case "entrevista_marcada":
      return d10(l.interview_date) ?? d10(l.created_at);
    default:
      return d10(l.created_at);
  }
}

export function interviewDoneDate(l: ReportLead, doneEvent?: Map<string, string>): string | null {
  return d10(l.interview_done_date) ?? d10(doneEvent?.get(l.id));
}

export function referenceDate(l: ReportLead, basis: DateBasis, doneEvent?: Map<string, string>): string | null {
  return basis === "created" ? d10(l.created_at) : stageDate(l, doneEvent);
}

export const QUICK_FILTERS = [
  { value: "none", label: "Nenhum" },
  { value: "entrevistados_sem_matricula", label: "Entrevistas realizadas sem matrícula" },
  { value: "entrevistados_mes", label: "Entrevistados neste mês" },
  { value: "perdidos_pos_entrevista", label: "Perdidos após entrevista" },
  { value: "sem_followup", label: "Sem follow-up recente" },
] as const;

export type QuickFilter = (typeof QUICK_FILTERS)[number]["value"];

export function monthRange(ref = new Date()): { from: string; to: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

export function applyQuickFilter(
  leads: ReportLead[],
  quick: QuickFilter,
  doneEvent: Map<string, string>,
  todayStr: string,
): ReportLead[] {
  if (quick === "none") return leads;
  const month = monthRange(new Date(`${todayStr}T12:00:00`));
  return leads.filter((l) => {
    const done = interviewDoneDate(l, doneEvent);
    switch (quick) {
      case "entrevistados_sem_matricula":
        return !!done && l.status !== "matricula";
      case "entrevistados_mes":
        return !!done && done >= month.from && done <= month.to;
      case "perdidos_pos_entrevista":
        return l.status === "perdido" && !!done;
      case "sem_followup": {
        // Sem follow-up futuro agendado e sem contato nos últimos 7 dias
        const cut = new Date(`${todayStr}T00:00:00`);
        cut.setDate(cut.getDate() - 7);
        const cutStr = cut.toISOString().slice(0, 10);
        if (l.status === "matricula" || l.status === "perdido") return false;
        const followup = d10(l.next_followup_at);
        if (followup && followup >= todayStr) return false;
        const last = d10(l.last_contact_at);
        return !last || last < cutStr;
      }
      default:
        return true;
    }
  });
}

// ---------------------------------------------------------------------------
// Passagem pelas etapas do funil (histórico real).
// Fonte de verdade: public.lead_events (status_change, interview_scheduled,
// interview_done, enrolled, lost) + as datas reais gravadas em public.leads.
// Nenhuma data é inventada: quando não há registro, o lead simplesmente não
// conta como tendo passado pela etapa.
// ---------------------------------------------------------------------------

export type LeadEventRow = {
  lead_id: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type StagePassages = Map<string, Record<string, string | undefined>>;

export const STAGE_FILTERS = [
  "interessado",
  "entrevista_marcada",
  "entrevista_realizada",
  "matricula",
  "perdido",
] as const;

const meta = (m: Record<string, unknown> | null, k: string) =>
  typeof m?.[k] === "string" ? d10(m[k] as string) : null;

const earliest = (a: string | undefined, b: string | null) => {
  if (!b) return a;
  if (!a) return b;
  return b < a ? b : a;
};

export function buildStagePassages(leads: ReportLead[], events: LeadEventRow[]): StagePassages {
  const map: StagePassages = new Map();
  const bucket = (id: string) => {
    let b = map.get(id);
    if (!b) { b = {}; map.set(id, b); }
    return b;
  };

  for (const e of events) {
    const b = bucket(e.lead_id);
    const evDate = d10(e.created_at);
    switch (e.event_type) {
      case "status_change": {
        const to = typeof e.metadata?.to === "string" ? (e.metadata.to as string) : null;
        if (to) b[to] = earliest(b[to], evDate);
        break;
      }
      case "interview_scheduled":
        b.entrevista_marcada = earliest(b.entrevista_marcada, meta(e.metadata, "interview_date") ?? evDate);
        break;
      case "interview_done":
        b.entrevista_realizada = earliest(
          b.entrevista_realizada,
          meta(e.metadata, "interview_done_date") ?? evDate,
        );
        break;
      case "enrolled":
        b.matricula = earliest(b.matricula, meta(e.metadata, "enrollmentDate") ?? evDate);
        break;
      case "lost":
        b.perdido = earliest(b.perdido, evDate);
        break;
      default:
        break;
    }
  }

  // Datas reais gravadas na própria linha do lead (preferidas quando existem)
  for (const l of leads) {
    const b = bucket(l.id);
    b.novo = earliest(b.novo, d10(l.created_at));
    const marcada = d10((l as any).interview_original_date) ?? d10(l.interview_date);
    if (marcada) b.entrevista_marcada = earliest(b.entrevista_marcada, marcada);
    if (l.interview_done_date) b.entrevista_realizada = earliest(b.entrevista_realizada, d10(l.interview_done_date));
    if (l.enrollment_date) b.matricula = earliest(b.matricula, d10(l.enrollment_date));
    if (l.lost_at) b.perdido = earliest(b.perdido, d10(l.lost_at));
    // Se o lead está hoje na etapa e não há histórico, usa a data da etapa atual
    if (!b[l.status]) {
      const sd = stageDate(l);
      if (sd) b[l.status] = sd;
    }
  }

  return map;
}

/** Data em que o lead passou pela etapa informada (null se não passou). */
export function stagePassageDate(
  passages: StagePassages,
  leadId: string,
  stage: string,
): string | null {
  return passages.get(leadId)?.[stage] ?? null;
}
