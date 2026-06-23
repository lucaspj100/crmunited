import { supabase } from "@/integrations/supabase/client";

export type LeadEventType =
  | "lead_created"
  | "lead_updated"
  | "status_change"
  | "task_created"
  | "task_done"
  | "task_rescheduled"
  | "whatsapp_open"
  | "message_copied"
  | "interview_scheduled"
  | "interview_confirmed"
  | "interview_unconfirmed"
  | "interview_done"
  | "interview_no_show"
  | "interview_rescheduled"
  | "enrolled"
  | "lost"
  | "rescue_moved"
  | "rescue_activated"
  | "note";

export async function logLeadEvent(input: {
  leadId: string;
  type: LeadEventType;
  description?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("lead_events").insert({
      lead_id: input.leadId,
      user_id: u.user?.id ?? null,
      event_type: input.type,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    /* never block UX for logging */
  }
}

export const EVENT_META: Record<string, { label: string; icon: string; color: string }> = {
  lead_created:          { label: "Lead criado",                  icon: "✨", color: "text-emerald-700" },
  lead_updated:          { label: "Lead atualizado",              icon: "✏️", color: "text-slate-700" },
  status_change:         { label: "Mudança de status",            icon: "🔀", color: "text-blue-700" },
  task_created:          { label: "Tarefa criada",                icon: "➕", color: "text-primary" },
  task_done:             { label: "Tarefa concluída",             icon: "✅", color: "text-emerald-700" },
  task_rescheduled:      { label: "Tarefa reagendada",            icon: "🔁", color: "text-amber-700" },
  whatsapp_open:         { label: "WhatsApp aberto",              icon: "💬", color: "text-green-700" },
  message_copied:        { label: "Mensagem copiada",             icon: "📋", color: "text-slate-700" },
  interview_scheduled:   { label: "Entrevista agendada",          icon: "📅", color: "text-violet-700" },
  interview_confirmed:   { label: "Entrevista confirmada",        icon: "👌", color: "text-emerald-700" },
  interview_unconfirmed: { label: "Confirmação removida",         icon: "↩️", color: "text-amber-700" },
  interview_done:        { label: "Entrevista realizada",         icon: "🎯", color: "text-violet-700" },
  interview_no_show:     { label: "No-show",                      icon: "🚫", color: "text-rose-700" },
  interview_rescheduled: { label: "Entrevista reagendada",        icon: "🔁", color: "text-orange-700" },
  enrolled:              { label: "Matrícula registrada",         icon: "🎓", color: "text-emerald-700" },
  lost:                  { label: "Lead perdido",                 icon: "❌", color: "text-rose-700" },
  rescue_moved:          { label: "Movido para resgate",          icon: "♻️", color: "text-cyan-700" },
  rescue_activated:      { label: "Resgate ativado",              icon: "🔥", color: "text-amber-700" },
  note:                  { label: "Observação",                   icon: "📝", color: "text-slate-700" },
};

export function eventMeta(type: string) {
  return EVENT_META[type] ?? { label: type, icon: "•", color: "text-muted-foreground" };
}
