export const LEAD_STATUSES = [
  { value: "novo", label: "Novo" },
  { value: "interessado", label: "Interessado" },
  { value: "entrevista_marcada", label: "Entrevista marcada" },
  { value: "entrevista_realizada", label: "Entrevista realizada" },
  { value: "matricula", label: "Matrícula" },
  { value: "perdido", label: "Perdido" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];

export const LOST_REASONS = [
  { value: "sem_resposta", label: "Sem resposta", suggestRescueDays: 120 },
  { value: "sem_interesse", label: "Sem interesse", suggestRescueDays: 90 },
  { value: "sem_dinheiro", label: "Sem dinheiro", suggestRescueDays: 60 },
  { value: "achou_caro", label: "Achou caro", suggestRescueDays: 120 },
  { value: "sem_tempo", label: "Sem tempo", suggestRescueDays: 30 },
  { value: "vai_deixar_depois", label: "Vai deixar para depois", suggestRescueDays: 90 },
  { value: "nao_compareceu", label: "Não compareceu à entrevista", suggestRescueDays: 7 },
  { value: "sem_perfil", label: "Não tem perfil", suggestRescueDays: null },
  { value: "fechou_concorrente", label: "Fechou com concorrente", suggestRescueDays: 180 },
  { value: "nao_chamar", label: "Pediu para não chamar mais", suggestRescueDays: null },
  { value: "outro", label: "Outro", suggestRescueDays: null },
] as const;

export const LOST_TYPES = [
  { value: "definitivo", label: "Perdido definitivo" },
  { value: "com_resgate", label: "Perdido com resgate futuro" },
] as const;

export const TASK_TYPES = [
  { value: "primeiro_contato", label: "Primeiro contato" },
  { value: "enviar_mensagem", label: "Enviar mensagem" },
  { value: "ligar", label: "Ligar" },
  { value: "fazer_ligacao", label: "Fazer ligação" },
  { value: "confirmar_entrevista", label: "Confirmar entrevista" },
  { value: "reagendar_entrevista", label: "Reagendar entrevista" },
  { value: "followup_pos", label: "Follow-up pós-entrevista" },
  { value: "cobrar_decisao", label: "Cobrar decisão" },
  { value: "encerramento", label: "Encerramento por falta de retorno" },
  { value: "resgate", label: "Resgate de lead" },
  { value: "outro", label: "Outro" },
] as const;

export const TASK_STATUSES = [
  { value: "pendente", label: "Pendente" },
  { value: "concluida", label: "Concluída" },
  { value: "remarcada", label: "Remarcada" },
  { value: "cancelada", label: "Cancelada" },
] as const;

export const RESCUE_OPTIONS = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 60, label: "60 dias" },
  { value: 90, label: "90 dias" },
  { value: 120, label: "120 dias" },
  { value: 180, label: "180 dias" },
] as const;

export function labelFor<T extends readonly { value: string; label: string }[]>(
  arr: T,
  v: string | null | undefined,
): string {
  return arr.find((x) => x.value === v)?.label ?? "—";
}

export function statusColor(s: string): string {
  switch (s) {
    case "novo": return "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30";
    case "interessado": return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30";
    case "entrevista_marcada": return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "entrevista_realizada": return "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30";
    case "matricula": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "perdido": return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export function waLink(phone: string | null | undefined): string {
  const d = onlyDigits(phone);
  if (!d) return "#";
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}`;
}
