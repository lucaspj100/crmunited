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
): Promise<EnrollmentResult> {
  const update: Record<string, unknown> = { status: "matricula" };
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
    description: `Matrícula R$ ${enrollmentValue ?? "—"} · Mensalidade R$ ${monthlyFee ?? "—"} · Material R$ ${materialValue ?? "—"}`,
    metadata: { enrollmentValue, monthlyFee, materialValue },
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
