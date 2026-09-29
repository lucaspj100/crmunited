import { supabase } from "@/integrations/supabase/client";
import { logLeadEvent } from "@/lib/lead-events";

export type EnrollmentResult = { saved: boolean; error?: string };

/** Registra a matrícula no CRM (status, data real e valores) e grava o histórico. */
export async function registerEnrollment(
  leadId: string,
  enrollmentValue: number | null,
  monthlyFee: number | null,
  materialValue: number | null,
  enrollmentDate?: string | null,
): Promise<EnrollmentResult> {
  const effectiveDate = enrollmentDate && enrollmentDate.length > 0
    ? enrollmentDate
    : new Date().toISOString().slice(0, 10);

  const update: Record<string, unknown> = { status: "matricula", enrollment_date: effectiveDate };
  if (enrollmentValue != null) update.enrollment_value = enrollmentValue;
  if (monthlyFee != null) update.monthly_fee = monthlyFee;
  if (materialValue != null) update.material_value = materialValue;

  const { error } = await supabase.from("leads").update(update as any).eq("id", leadId);
  if (error) return { saved: false, error: error.message };

  await logLeadEvent({
    leadId,
    type: "enrolled",
    description: `Matrícula R$ ${enrollmentValue ?? "—"} · Mensalidade R$ ${monthlyFee ?? "—"} · Material R$ ${materialValue ?? "—"} · Data ${effectiveDate}`,
    metadata: { enrollmentValue, monthlyFee, materialValue, enrollmentDate: effectiveDate },
  });
  return { saved: true };
}

/**
 * Desfaz uma matrícula no CRM: muda status, opcionalmente limpa valores e grava log.
 * Comissões, material e estrelas são revertidos automaticamente no banco.
 */
export async function cancelEnrollment(
  leadId: string,
  newStatus: string,
  options?: { reason?: string; clearValues?: boolean; previousStatus?: string },
): Promise<EnrollmentResult> {
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
  if (error) return { saved: false, error: error.message };

  await logLeadEvent({
    leadId,
    type: "enrollment_cancelled",
    description: `Matrícula cancelada — ${previousStatus} → ${newStatus}${reason ? ` · ${reason}` : ""}`,
    metadata: { previousStatus, newStatus, reason, clearedValues: clearValues },
  });
  return { saved: true };
}
