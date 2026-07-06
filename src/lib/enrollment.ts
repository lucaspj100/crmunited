import { supabase } from "@/integrations/supabase/client";
import { logLeadEvent } from "@/lib/lead-events";
import { notifyArenaAsync, type NotifyArenaResult } from "@/lib/arena-dispatch";

export type EnrollmentResult = {
  /** Lead saved + (Arena ok OR already sent earlier) */
  ok: boolean;
  /** Lead row was updated */
  saved: boolean;
  /** Arena dispatch outcome (null when we skipped because already sent) */
  arena: NotifyArenaResult | null;
  /** Whether we already had a successful crm_enrollment_created on file */
  alreadySent: boolean;
  /** Lead update error (if any) */
  error?: string;
};

/**
 * Canonical entry point para registrar matrícula no CRM e garantir o envio
 * do evento `crm_enrollment_created` para a Arena. Sempre cria/atualiza um
 * registro em `crm_outbound_events` (via dispatchArenaEvent), com status
 * `sent`, `failed` ou `skipped` (quando já existia um `sent`).
 */
export async function registerEnrollmentAndSyncArena(
  leadId: string,
  enrollmentValue: number | null,
  monthlyFee: number | null,
  materialValue: number | null,
  enrollmentDate?: string | null,
): Promise<EnrollmentResult> {
  // Data real da matrícula: padrão = hoje. Pode ser retroativa.
  const effectiveDate = enrollmentDate && enrollmentDate.length > 0
    ? enrollmentDate
    : new Date().toISOString().slice(0, 10);

  const update: Record<string, unknown> = { status: "matricula", enrollment_date: effectiveDate };
  if (enrollmentValue != null) update.enrollment_value = enrollmentValue;
  if (monthlyFee != null) update.monthly_fee = monthlyFee;
  if (materialValue != null) update.material_value = materialValue;

  const { error } = await supabase.from("leads").update(update as any).eq("id", leadId);
  if (error) {
    return { ok: false, saved: false, arena: null, alreadySent: false, error: error.message };
  }

  await logLeadEvent({
    leadId,
    type: "enrolled",
    description: `Matrícula R$ ${enrollmentValue ?? "—"} · Mensalidade R$ ${monthlyFee ?? "—"} · Material R$ ${materialValue ?? "—"} · Data ${effectiveDate}`,
    metadata: { enrollmentValue, monthlyFee, materialValue, enrollmentDate: effectiveDate },
  });

  // Dedupe: já existe um envio bem-sucedido?
  const { data: existing } = await supabase
    .from("crm_outbound_events")
    .select("id")
    .eq("crm_lead_id", leadId)
    .eq("event_type", "crm_enrollment_created")
    .eq("status", "sent")
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      saved: true,
      alreadySent: true,
      arena: { ok: true, skipped: true, reason: "already_sent" },
    };
  }

  const arena = await notifyArenaAsync(leadId, "crm_enrollment_created");
  return { ok: arena.ok, saved: true, alreadySent: false, arena };
}

/**
 * Reenvia/cria o evento crm_enrollment_created para um lead já matriculado
 * (sem mexer no lead). Usado pelo alerta "matrícula sem envio para Arena".
 */
export async function ensureEnrollmentSentToArena(leadId: string): Promise<NotifyArenaResult> {
  const { data: existing } = await supabase
    .from("crm_outbound_events")
    .select("id")
    .eq("crm_lead_id", leadId)
    .eq("event_type", "crm_enrollment_created")
    .eq("status", "sent")
    .maybeSingle();
  if (existing) return { ok: true, skipped: true, reason: "already_sent" };
  return notifyArenaAsync(leadId, "crm_enrollment_created");
}

export type CancelEnrollmentResult = {
  ok: boolean;
  saved: boolean;
  /** true se nunca existiu envio anterior — cancelamento não é necessário */
  noPriorEnrollment: boolean;
  arena: NotifyArenaResult | null;
  error?: string;
};

/**
 * Cancela uma matrícula no CRM: muda status, opcionalmente limpa valores,
 * grava log e dispara crm_enrollment_cancelled para a Arena (somente se
 * já existir um crm_enrollment_created sent anterior).
 */
export async function cancelEnrollmentAndSyncArena(
  leadId: string,
  newStatus: string,
  options?: { reason?: string; clearValues?: boolean; previousStatus?: string },
): Promise<CancelEnrollmentResult> {
  const reason = options?.reason ?? null;
  const clearValues = options?.clearValues ?? false;
  const previousStatus = options?.previousStatus ?? "matricula";

  const update: Record<string, unknown> = { status: newStatus };
  if (clearValues) {
    update.enrollment_value = null;
    update.monthly_fee = null;
    update.material_value = null;
  }

  const { error } = await supabase.from("leads").update(update as any).eq("id", leadId);
  if (error) {
    return { ok: false, saved: false, noPriorEnrollment: false, arena: null, error: error.message };
  }

  await logLeadEvent({
    leadId,
    type: "enrollment_cancelled",
    description: `Matrícula cancelada — ${previousStatus} → ${newStatus}${reason ? ` · ${reason}` : ""}`,
    metadata: { previousStatus, newStatus, reason, clearedValues: clearValues },
  });

  // Só envia cancelamento se já existir envio anterior bem-sucedido
  const { data: prior } = await supabase
    .from("crm_outbound_events")
    .select("id")
    .eq("crm_lead_id", leadId)
    .eq("event_type", "crm_enrollment_created")
    .eq("status", "sent")
    .maybeSingle();

  if (!prior) {
    return { ok: true, saved: true, noPriorEnrollment: true, arena: null };
  }

  const arena = await notifyArenaAsync(leadId, "crm_enrollment_cancelled", {
    previous_status: previousStatus,
    new_status: newStatus,
    cancellation_reason: reason,
  });

  return { ok: arena.ok, saved: true, noPriorEnrollment: false, arena };
}

