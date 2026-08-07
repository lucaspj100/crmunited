// Regras e rótulos da integração com o Processo Bolsista (unitedidiomasbolsa).
// IMPORTANTE: o formulário nunca altera a etapa do funil. Todo lead entra em "novo".

export const SCHOLARSHIP_SOURCE = "Processo bolsista";
export const SCHOLARSHIP_SYSTEM = "unitedidiomasbolsa";
export const SCHEDULING_SOURCE_FORM = "formulario_bolsista";

export const CONFIRMATION_STATUS = {
  waiting: "aguardando_confirmacao",
  confirmed: "confirmado",
  notConfirmed: "nao_confirmado",
} as const;

export const CONFIRMATION_LABELS: Record<string, string> = {
  aguardando_confirmacao: "Aguardando confirmação",
  confirmado: "Confirmado pelo vendedor",
  nao_confirmado: "Não confirmou",
};

export const CLASSIFICATIONS = [
  { value: "quente", label: "Quente", emoji: "🔥" },
  { value: "morno", label: "Morno", emoji: "🌤️" },
  { value: "frio", label: "Frio", emoji: "❄️" },
  { value: "curioso", label: "Curioso", emoji: "👀" },
  { value: "sem_fit_financeiro", label: "Sem fit financeiro", emoji: "💸" },
] as const;

export type ScholarshipClassification = (typeof CLASSIFICATIONS)[number]["value"];

export function classificationMeta(value: string | null | undefined) {
  return CLASSIFICATIONS.find((c) => c.value === value) ?? null;
}

export const FORM_STATUS_LABELS: Record<string, string> = {
  formulario_incompleto: "Formulário incompleto",
  formulario_concluido: "Formulário concluído",
  perfil_aprovado: "Perfil aprovado pela triagem",
  sem_fit_financeiro: "Sem fit financeiro",
  nao_agendou: "Não agendou",
  agendou_pelo_formulario: "Agendou pelo formulário",
  aguardando_confirmacao: "Aguardando confirmação",
  confirmado_pelo_vendedor: "Confirmado pelo vendedor",
  nao_confirmou: "Não confirmou",
};

export function formStatusLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return FORM_STATUS_LABELS[value] ?? value;
}

export type ScholarshipLeadFields = {
  source?: string | null;
  source_system?: string | null;
  scholarship_classification?: string | null;
  form_status?: string | null;
  form_step?: string | null;
  form_completed?: boolean | null;
  high_priority?: boolean | null;
  requested_interview_at?: string | null;
  scheduling_source?: string | null;
  confirmation_status?: string | null;
};

export function isScholarshipLead(lead: ScholarshipLeadFields | null | undefined): boolean {
  return lead?.source_system === SCHOLARSHIP_SYSTEM || lead?.source === SCHOLARSHIP_SOURCE;
}

export function hasFormScheduling(lead: ScholarshipLeadFields | null | undefined): boolean {
  return !!lead?.requested_interview_at && lead?.scheduling_source === SCHEDULING_SOURCE_FORM;
}

export function awaitingConfirmation(lead: ScholarshipLeadFields | null | undefined): boolean {
  return hasFormScheduling(lead) && lead?.confirmation_status === CONFIRMATION_STATUS.waiting;
}

/** Concluiu o formulário mas não escolheu horário pelo formulário. */
export function hasCompletedFormWithoutScheduling(lead: ScholarshipLeadFields | null | undefined): boolean {
  return !!lead && isScholarshipLead(lead) && lead.form_completed === true && !hasFormScheduling(lead);
}

export function formatRequestedInterview(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const SCHOLARSHIP_FILTERS = [
  { value: "all", label: "Todos os leads" },
  { value: "bolsista", label: "Processo bolsista" },
  { value: "form_incompleto", label: "Formulário incompleto" },
  { value: "form_concluido", label: "Formulário concluído" },
  { value: "com_agendamento", label: "Com agendamento" },
  { value: "aguardando_confirmacao", label: "Aguardando confirmação" },
  { value: "confirmado", label: "Confirmado" },
  { value: "nao_confirmado", label: "Não confirmou" },
  { value: "quente", label: "🔥 Quente" },
  { value: "morno", label: "🌤️ Morno" },
  { value: "frio", label: "❄️ Frio" },
  { value: "curioso", label: "👀 Curioso" },
  { value: "sem_fit_financeiro", label: "💸 Sem fit financeiro" },
] as const;

export function matchesScholarshipFilter(lead: ScholarshipLeadFields, filter: string): boolean {
  if (filter === "all") return true;
  if (!isScholarshipLead(lead)) return false;
  switch (filter) {
    case "bolsista":
      return true;
    case "form_incompleto":
      return !lead.form_completed;
    case "form_concluido":
      return !!lead.form_completed;
    case "com_agendamento":
      return hasFormScheduling(lead);
    case "aguardando_confirmacao":
      return awaitingConfirmation(lead);
    case "confirmado":
      return lead.confirmation_status === CONFIRMATION_STATUS.confirmed;
    case "nao_confirmado":
      return lead.confirmation_status === CONFIRMATION_STATUS.notConfirmed;
    default:
      return lead.scholarship_classification === filter;
  }
}

// Campos de qualificação exibidos na seção de detalhes, na ordem correta.
export const QUALIFICATION_FIELDS: { key: string; label: string }[] = [
  { key: "email", label: "E-mail" },
  { key: "city_state", label: "Cidade / estado" },
  { key: "profession", label: "Profissão" },
  { key: "company_name", label: "Empresa" },
  { key: "english_level", label: "Nível de inglês" },
  { key: "english_goal", label: "Principal objetivo" },
  { key: "english_impact", label: "Impacto do inglês" },
  { key: "lost_opportunity", label: "Oportunidade perdida" },
  { key: "why_not_studying", label: "Motivo de ainda não estudar" },
  { key: "start_timeframe", label: "Prazo para começar" },
  { key: "financial_fit", label: "Alinhamento financeiro" },
  { key: "interview_intent", label: "Intenção de participar da entrevista" },
];

/** Blocos exibidos na seção "Qualificação do Processo Bolsista".
 *  `fallback` aponta para a chave equivalente em form_answers (respostas_json). */
export type QualificationField = { key: string; label: string; fallback?: string };

export const QUALIFICATION_GROUPS: { title: string; fields: QualificationField[] }[] = [
  {
    title: "Dados profissionais",
    fields: [
      { key: "email", label: "E-mail", fallback: "email" },
      { key: "city_state", label: "Cidade / estado", fallback: "cidade_estado" },
      { key: "profession", label: "Profissão", fallback: "profissao" },
      { key: "company_name", label: "Empresa", fallback: "empresa" },
      { key: "english_level", label: "Nível de inglês", fallback: "nivel_ingles" },
    ],
  },
  {
    title: "Objetivo e dor",
    fields: [
      { key: "english_goal", label: "Objetivo com o inglês", fallback: "motivo_ingles" },
      { key: "english_impact", label: "Impacto do inglês no dia a dia", fallback: "impacto_ingles" },
      { key: "lost_opportunity", label: "Já perdeu oportunidade?", fallback: "perdeu_oportunidade" },
      { key: "why_not_studying", label: "Por que ainda não faz curso?", fallback: "motivo_nao_faz_curso" },
    ],
  },
  {
    title: "Momento de compra",
    fields: [
      { key: "start_timeframe", label: "Prazo para começar", fallback: "prazo_inicio" },
      { key: "financial_fit", label: "Alinhamento financeiro", fallback: "alinhamento_financeiro" },
      { key: "interview_intent", label: "Decisão sobre a entrevista", fallback: "decisao_entrevista" },
    ],
  },
  {
    title: "Análise do formulário",
    fields: [
      { key: "scholarship_classification", label: "Classificação", fallback: "classificacao" },
      { key: "high_priority", label: "Alta prioridade" },
      { key: "form_status", label: "Status do formulário", fallback: "status_formulario" },
      { key: "form_step", label: "Etapa em que parou", fallback: "etapa_formulario" },
      { key: "form_completed", label: "Formulário concluído" },
    ],
  },
];

const NOT_INFORMED = "Não informado";

/** Valor legível de um campo, com fallback em form_answers e sem "null"/"undefined". */
export function qualificationValue(
  lead: Record<string, unknown>,
  field: QualificationField,
): string {
  const pick = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (typeof v === "object") return null;
    const s = String(v).trim();
    return s ? s : null;
  };

  let raw = pick(lead[field.key]);
  if (!raw && field.fallback) {
    const answers = (lead["form_answers"] ?? {}) as Record<string, unknown>;
    raw = pick(answers[field.fallback]);
  }
  if (!raw) return NOT_INFORMED;

  if (field.key === "form_status") return formStatusLabel(raw) ?? raw;
  if (field.key === "scholarship_classification") {
    const meta = classificationMeta(raw);
    return meta ? `${meta.emoji} ${meta.label}` : raw;
  }
  if (field.key === "form_completed") return raw === "Sim" ? "Concluído" : "Incompleto";
  return raw;
}

export const QUALIFICATION_EMPTY = NOT_INFORMED;

