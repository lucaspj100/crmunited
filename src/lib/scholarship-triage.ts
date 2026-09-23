// Triagem manual dos leads do Processo Bolsista.
// Reutiliza o motivo de perda e a rotina de cancelamento de tarefas já usada no funil.
import { supabase } from "@/integrations/supabase/client";
import { logLeadEvent } from "@/lib/lead-events";
import { LOST_REASON_FORM } from "@/lib/scholarship";

/** Move os leads selecionados para "perdido" com motivo "Desqualificado pelo formulário". */
export async function bulkMoveToLostByForm(leadIds: string[]): Promise<{ moved: number; error?: string }> {
  if (leadIds.length === 0) return { moved: 0 };

  const { error } = await supabase
    .from("leads")
    .update({
      status: "perdido",
      lost_reason: LOST_REASON_FORM as never,
      lost_type: "definitivo" as never,
      rescue_date: null,
    })
    .in("id", leadIds);
  if (error) return { moved: 0, error: error.message };

  // Mesma rotina do LostDialog: cancela tarefas pendentes que não sejam de resgate.
  await supabase
    .from("tasks")
    .update({ status: "cancelada" })
    .in("lead_id", leadIds)
    .eq("status", "pendente")
    .eq("is_rescue", false);

  for (const id of leadIds) {
    await logLeadEvent({
      leadId: id,
      type: "lost",
      description: "Desqualificado pelo formulário (triagem do Processo Bolsista)",
      metadata: { reason: LOST_REASON_FORM, triage: true },
    });
  }

  return { moved: leadIds.length };
}
