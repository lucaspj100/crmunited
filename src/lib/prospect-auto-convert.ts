import { supabase } from "@/integrations/supabase/client";
import { ensureTaskForStatus } from "@/lib/task-automation";
import { logLeadEvent } from "@/lib/lead-events";
import type { ProspectContact } from "@/lib/prospect-queue";

export type AutoConvertResult =
  | { ok: true; leadId: string; created: boolean }
  | { ok: false; error: string };

function buildObservation(params: {
  contact: ProspectContact;
  resultLabel: string;
  latestObservation?: string;
}): string {
  const { contact, resultLabel, latestObservation } = params;
  const parts = [
    contact.cargo ? `Cargo: ${contact.cargo}` : "",
    contact.origem ? `Origem original: ${contact.origem}` : "",
    contact.observacao ? `Observação anterior: ${contact.observacao}` : "",
    latestObservation ? `Observação do Discador: ${latestObservation}` : "",
    `Resultado no Discador: ${resultLabel}`,
  ].filter(Boolean);
  return parts.join("\n");
}

/**
 * Converte automaticamente um prospect em lead do CRM.
 * - Se já existir lead com mesmo phone_normalized, apenas vincula e atualiza a observação.
 * - Caso contrário, cria novo lead com status "interessado".
 */
export async function autoConvertProspectToLead(params: {
  contact: ProspectContact;
  vendedorId: string;
  resultLabel: string; // "Interessado" | "Pediu WhatsApp"
  latestObservation?: string;
}): Promise<AutoConvertResult> {
  const { contact, vendedorId, resultLabel, latestObservation } = params;
  try {
    // 1) Buscar duplicidade global (pode ser de outro vendedor)
    const { data: existing, error: lookupErr } = await supabase
      .from("leads")
      .select("id, observation")
      .eq("phone_normalized", contact.telefone_normalizado)
      .limit(1);
    if (lookupErr) return { ok: false, error: lookupErr.message };

    if (existing && existing.length > 0) {
      const leadId = existing[0].id;
      const prevObs = (existing[0].observation ?? "").trim();
      const newEntry = latestObservation
        ? `Observação do Discador: ${latestObservation}\nResultado no Discador: ${resultLabel}`
        : `Resultado no Discador: ${resultLabel}`;

      let mergedObs = prevObs;
      if (!prevObs) {
        mergedObs = newEntry;
      } else if (!prevObs.includes(newEntry)) {
        mergedObs = `${newEntry}\n\n${prevObs}`;
      }

      await supabase
        .from("leads")
        .update({ observation: mergedObs })
        .eq("id", leadId);

      await supabase
        .from("prospect_contacts")
        .update({
          convertido_em_lead: true,
          lead_id: leadId,
          status_prospeccao: "Convertido em lead",
        })
        .eq("id", contact.id);
      return { ok: true, leadId, created: false };
    }

    // 2) Criar novo lead
    const observation = buildObservation({ contact, resultLabel, latestObservation });

    const payload = {
      name: (contact.nome && contact.nome.trim()) || "Contato sem nome",
      phone: contact.telefone_original || `+${contact.telefone_normalizado}`,
      phone_normalized: contact.telefone_normalizado,
      phone_invalid: false,
      company: contact.empresa || null,
      observation: observation || null,
      source: "Discador",
      owner_id: vendedorId,
      status: "interessado" as const,
      linkedin_url: contact.linkedin_url || null,
    };

    const { data, error } = await supabase
      .from("leads")
      .insert(payload as never)
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Erro ao criar lead" };
    const leadId = data.id as string;

    await ensureTaskForStatus({ leadId, ownerId: vendedorId, status: "interessado" });
    await logLeadEvent({
      leadId,
      type: "lead_created",
      description: `Lead criado automaticamente via Discador após resultado ${resultLabel}`,
      metadata: { from: "discador", prospect_id: contact.id, result: resultLabel },
    });

    await supabase
      .from("prospect_contacts")
      .update({
        convertido_em_lead: true,
        lead_id: leadId,
        status_prospeccao: "Convertido em lead",
      })
      .eq("id", contact.id);

    return { ok: true, leadId, created: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
