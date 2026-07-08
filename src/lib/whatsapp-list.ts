import { supabase } from "@/integrations/supabase/client";

export type WhatsappListStatus =
  | "aguardando"
  | "mensagem_gerada"
  | "mensagem_copiada"
  | "whatsapp_aberto"
  | "mensagem_enviada"
  | "respondeu"
  | "sem_resposta"
  | "numero_invalido"
  | "removido";

export type WhatsappListReason =
  | "nao_atendeu"
  | "caixa_postal"
  | "chamou_nao_respondeu"
  | "numero_invalido"
  | "tentar_whatsapp"
  | "manual";

export type WhatsappListEntry = {
  id: string;
  prospect_contact_id: string;
  owner_id: string;
  reason: WhatsappListReason | string;
  status: WhatsappListStatus | string;
  last_template_id: string | null;
  last_template_name: string | null;
  last_message_body: string | null;
  message_copied_at: string | null;
  whatsapp_opened_at: string | null;
  message_sent_at: string | null;
  responded_at: string | null;
  no_response_at: string | null;
  removed_at: string | null;
  followup_task_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const REASON_LABEL: Record<string, string> = {
  nao_atendeu: "Não atendeu",
  caixa_postal: "Caixa postal",
  chamou_nao_respondeu: "Chamou e não respondeu",
  numero_invalido: "Número inválido",
  tentar_whatsapp: "Tentar WhatsApp",
  manual: "Adicionado manualmente",
};

export const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando WhatsApp",
  mensagem_gerada: "Mensagem gerada",
  mensagem_copiada: "Mensagem copiada",
  whatsapp_aberto: "WhatsApp aberto",
  mensagem_enviada: "Mensagem enviada",
  respondeu: "Respondeu",
  sem_resposta: "Sem resposta",
  numero_invalido: "Número inválido",
  removido: "Removido da lista",
};

export const STATUS_BADGE_CLASS: Record<string, string> = {
  aguardando: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  mensagem_gerada: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  mensagem_copiada: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  whatsapp_aberto: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  mensagem_enviada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  respondeu: "bg-emerald-600 text-white",
  sem_resposta: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  numero_invalido: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  removido: "bg-muted text-muted-foreground",
};

export async function findExistingEntry(
  prospectContactId: string,
  ownerId: string,
): Promise<WhatsappListEntry | null> {
  const { data, error } = await supabase
    .from("whatsapp_list_entries")
    .select("*")
    .eq("prospect_contact_id", prospectContactId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return (data as WhatsappListEntry | null) ?? null;
}

export async function addToWhatsappList(input: {
  prospectContactId: string;
  ownerId: string;
  reason: WhatsappListReason;
  notes?: string;
}): Promise<{ entry: WhatsappListEntry; created: boolean }> {
  const existing = await findExistingEntry(input.prospectContactId, input.ownerId);
  if (existing) {
    // Se estava removido, reativa
    if (existing.status === "removido") {
      const { data, error } = await supabase
        .from("whatsapp_list_entries")
        .update({
          status: "aguardando",
          reason: input.reason,
          removed_at: null,
          notes: input.notes ?? existing.notes,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      return { entry: data as WhatsappListEntry, created: false };
    }
    // Atualiza motivo/observação
    if (input.reason !== existing.reason || input.notes) {
      const { data, error } = await supabase
        .from("whatsapp_list_entries")
        .update({
          reason: input.reason,
          notes: input.notes ?? existing.notes,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      return { entry: data as WhatsappListEntry, created: false };
    }
    return { entry: existing, created: false };
  }
  const { data, error } = await supabase
    .from("whatsapp_list_entries")
    .insert({
      prospect_contact_id: input.prospectContactId,
      owner_id: input.ownerId,
      reason: input.reason,
      status: "aguardando",
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { entry: data as WhatsappListEntry, created: true };
}

export async function updateEntry(
  entryId: string,
  patch: Partial<WhatsappListEntry>,
): Promise<WhatsappListEntry> {
  const { data, error } = await supabase
    .from("whatsapp_list_entries")
    .update(patch as never)
    .eq("id", entryId)
    .select("*")
    .single();
  if (error) throw error;
  return data as WhatsappListEntry;
}

/** Normaliza telefone para WhatsApp: só dígitos, garante DDI 55 quando for BR e DDD válido. */
export function normalizePhoneForWhatsapp(raw: string | null | undefined): {
  ok: boolean;
  phone: string;
  reason?: string;
} {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return { ok: false, phone: "", reason: "vazio" };
  let out = digits;
  // Assume BR: precisa ter 10 (fixo) ou 11 (móvel) dígitos + DDI 55
  if (out.length === 10 || out.length === 11) out = `55${out}`;
  if (out.length < 12 || out.length > 15) return { ok: false, phone: out, reason: "tamanho" };
  return { ok: true, phone: out };
}
