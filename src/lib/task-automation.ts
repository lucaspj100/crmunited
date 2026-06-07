import { supabase } from "@/integrations/supabase/client";

// Cria tarefa automática para um lead conforme o status, evitando duplicar
// tarefa pendente do mesmo tipo já existente para aquele lead.
export async function ensureTaskForStatus(params: {
  leadId: string;
  ownerId: string;
  status: string;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string | null;
}) {
  const { leadId, ownerId, status } = params;
  const today = new Date().toISOString().slice(0, 10);

  let type: string | null = null;
  let dueDate = params.dueDate || today;
  let observation = "";

  switch (status) {
    case "novo":
      type = "primeiro_contato";
      observation = "Primeiro contato";
      break;
    case "interessado":
      type = "enviar_mensagem";
      observation = "Enviar mensagem / ligar";
      break;
    case "entrevista_realizada": {
      type = "followup_pos";
      const d = new Date(); d.setDate(d.getDate() + 1);
      dueDate = d.toISOString().slice(0, 10);
      observation = "Follow-up pós-entrevista";
      break;
    }
    default:
      return; // outras transições têm fluxo próprio (dialogs)
  }

  // Checa se já existe pendente do mesmo tipo
  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("lead_id", leadId)
    .eq("type", type as any)
    .eq("status", "pendente")
    .limit(1);
  if (existing && existing.length > 0) return;

  await supabase.from("tasks").insert({
    lead_id: leadId,
    owner_id: ownerId,
    type: type as any,
    due_date: dueDate,
    due_time: params.dueTime || null,
    status: "pendente",
    observation,
  });
}
