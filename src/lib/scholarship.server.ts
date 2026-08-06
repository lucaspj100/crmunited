// Lógica do recebimento de leads do Processo Bolsista (unitedidiomasbolsa).
// Executa apenas no servidor. NUNCA altera a etapa do funil: sempre "novo".
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePhone } from "@/lib/phone";
import {
  CONFIRMATION_STATUS,
  SCHEDULING_SOURCE_FORM,
  SCHOLARSHIP_SOURCE,
  SCHOLARSHIP_SYSTEM,
} from "@/lib/scholarship";

export type ScholarshipPayload = {
  public_slug: string;
  external_lead_id: string;
  nome: string;
  whatsapp: string;
  email: string;
  cidade_estado?: string | null;
  profissao?: string | null;
  empresa?: string | null;
  nivel_ingles?: string | null;
  motivo_ingles?: string | null;
  impacto_ingles?: string | null;
  perdeu_oportunidade?: string | null;
  motivo_nao_faz_curso?: string | null;
  prazo_inicio?: string | null;
  alinhamento_financeiro?: string | null;
  decisao_entrevista?: string | null;
  classificacao?: string | null;
  alta_prioridade?: boolean | null;
  status_formulario?: string | null;
  etapa_formulario?: string | null;
  respostas_json?: Record<string, unknown> | null;
  entrevista_solicitada_para?: string | null;
  formulario_concluido?: boolean | null;
  origem?: string | null;
};

export type ScholarshipResult =
  | { ok: true; lead_id: string; created: boolean; status: "novo" }
  | { ok: false; code: "invalid_slug" | "invalid_phone" | "server_error"; message: string };

const clean = (v: unknown, max = 500): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
};

/**
 * Cria ou atualiza progressivamente o lead do processo bolsista.
 * - Resolve o vendedor pelo slug (nunca aceita seller_id do navegador).
 * - Idempotente por external_lead_id.
 * - status é sempre "novo"; qualquer etapa enviada pelo formulário é ignorada.
 */
export async function receiveScholarshipLead(input: ScholarshipPayload): Promise<ScholarshipResult> {
  try {
    const slug = String(input.public_slug || "").trim().toLowerCase();
    const { data: link } = await supabaseAdmin
      .from("public_seller_links")
      .select("seller_id, active")
      .eq("public_slug", slug)
      .maybeSingle();

    if (!link || !link.active) {
      console.error("[scholarship] slug inválido ou inativo", { slug });
      return { ok: false, code: "invalid_slug", message: "Link inválido." };
    }
    const sellerId = link.seller_id;

    const phone = normalizePhone(input.whatsapp);
    if (!phone.normalized) {
      return { ok: false, code: "invalid_phone", message: "WhatsApp inválido." };
    }

    const externalId = clean(input.external_lead_id, 120);
    const email = clean(input.email, 200)?.toLowerCase() ?? null;

    // 1) external_lead_id → 2) telefone do mesmo vendedor → 3) e-mail do mesmo vendedor
    let existing: { id: string; owner_id: string; scholarship_task_created: boolean; confirmation_status: string | null; requested_interview_at: string | null; form_completed: boolean; high_priority: boolean; observation: string | null } | null = null;

    if (externalId) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, owner_id, scholarship_task_created, confirmation_status, requested_interview_at, form_completed, high_priority, observation")
        .eq("external_lead_id", externalId)
        .maybeSingle();
      existing = data ?? null;
    }
    if (!existing) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, owner_id, scholarship_task_created, confirmation_status, requested_interview_at, form_completed, high_priority, observation")
        .eq("phone_normalized", phone.normalized)
        .eq("owner_id", sellerId)
        .limit(1)
        .maybeSingle();
      existing = data ?? null;
    }
    if (!existing && email) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, owner_id, scholarship_task_created, confirmation_status, requested_interview_at, form_completed, high_priority, observation")
        .eq("email", email)
        .eq("owner_id", sellerId)
        .limit(1)
        .maybeSingle();
      existing = data ?? null;
    }

    const requestedAt = clean(input.entrevista_solicitada_para, 60);
    const requestedIso = requestedAt && !Number.isNaN(new Date(requestedAt).getTime())
      ? new Date(requestedAt).toISOString()
      : null;
    const formCompleted = !!input.formulario_concluido;
    const highPriority = !!input.alta_prioridade;

    // Campos permitidos — nada de etapa, comissão, matrícula ou responsável.
    const fields = {
      name: clean(input.nome, 200) ?? "Candidato sem nome",
      phone: clean(input.whatsapp, 40),
      phone_normalized: phone.normalized,
      phone_invalid: !phone.valid,
      email,
      company: clean(input.empresa, 200),
      company_name: clean(input.empresa, 200),
      city_state: clean(input.cidade_estado, 200),
      profession: clean(input.profissao, 200),
      english_level: clean(input.nivel_ingles, 200),
      english_goal: clean(input.motivo_ingles, 2000),
      english_impact: clean(input.impacto_ingles, 2000),
      lost_opportunity: clean(input.perdeu_oportunidade, 2000),
      why_not_studying: clean(input.motivo_nao_faz_curso, 2000),
      start_timeframe: clean(input.prazo_inicio, 200),
      financial_fit: clean(input.alinhamento_financeiro, 200),
      interview_intent: clean(input.decisao_entrevista, 200),
      scholarship_classification: clean(input.classificacao, 60),
      high_priority: highPriority,
      form_status: clean(input.status_formulario, 60) ?? (formCompleted ? "formulario_concluido" : "formulario_incompleto"),
      form_step: clean(input.etapa_formulario, 120),
      form_completed: formCompleted,
      form_answers: (input.respostas_json ?? {}) as Record<string, unknown>,
      source: clean(input.origem, 120) ?? SCHOLARSHIP_SOURCE,
      source_system: SCHOLARSHIP_SYSTEM,
      external_lead_id: externalId,
      ...(requestedIso
        ? {
            requested_interview_at: requestedIso,
            scheduling_source: SCHEDULING_SOURCE_FORM,
          }
        : {}),
    };

    let leadId: string;
    let created = false;

    if (existing) {
      leadId = existing.id;
      const patch: Record<string, unknown> = { ...fields };
      // vendedor nunca muda depois da criação
      delete patch["owner_id"];
      // primeira vez que aparece um agendamento → aguardando confirmação
      if (requestedIso && !existing.confirmation_status) {
        patch["confirmation_status"] = CONFIRMATION_STATUS.waiting;
      }
      const { error } = await supabaseAdmin.from("leads").update(patch as never).eq("id", leadId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseAdmin
        .from("leads")
        .insert({
          ...fields,
          owner_id: sellerId,
          status: "novo", // regra obrigatória
          ...(requestedIso ? { confirmation_status: CONFIRMATION_STATUS.waiting } : {}),
        } as never)
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Falha ao criar lead");
      leadId = (data as { id: string }).id;
      created = true;
    }

    const events: { event_type: string; description: string; metadata: Record<string, unknown> }[] = [];
    if (created) {
      events.push({
        event_type: "lead_created",
        description: "Lead criado pelo processo bolsista",
        metadata: { source_system: SCHOLARSHIP_SYSTEM, external_lead_id: externalId, classificacao: fields.scholarship_classification },
      });
    }
    if (formCompleted && (!existing || !existing.form_completed)) {
      events.push({
        event_type: "note",
        description: "Formulário do processo bolsista concluído",
        metadata: { classificacao: fields.scholarship_classification, alta_prioridade: highPriority },
      });
    }
    if (requestedIso && (!existing || existing.requested_interview_at !== requestedIso)) {
      events.push({
        event_type: "note",
        description: "Agendamento realizado pelo formulário — aguardando confirmação",
        metadata: { requested_interview_at: requestedIso, scheduling_source: SCHEDULING_SOURCE_FORM },
      });
    }
    if (highPriority && existing && !existing.high_priority) {
      events.push({
        event_type: "note",
        description: "Classificação alterada para alta prioridade",
        metadata: { classificacao: fields.scholarship_classification },
      });
    }

    if (events.length > 0) {
      await supabaseAdmin.from("lead_events").insert(
        events.map((e) => ({ lead_id: leadId, user_id: sellerId, ...e })) as never,
      );
      await supabaseAdmin
        .from("leads")
        .update({ scholarship_notified_at: new Date().toISOString() } as never)
        .eq("id", leadId);
    }

    // Tarefa de confirmação: apenas uma vez por lead
    if (requestedIso && (!existing || !existing.scholarship_task_created)) {
      const d = new Date(requestedIso);
      const dueDate = d.toISOString().slice(0, 10);
      const dueTime = d.toISOString().slice(11, 16);
      const { error: taskErr } = await supabaseAdmin.from("tasks").insert({
        lead_id: leadId,
        owner_id: sellerId,
        type: "confirmar_entrevista",
        due_date: dueDate,
        due_time: dueTime,
        status: "pendente",
        observation: `Confirmar entrevista pelo WhatsApp — horário escolhido no formulário: ${d.toLocaleString("pt-BR")}`,
      } as never);
      if (!taskErr) {
        await supabaseAdmin
          .from("leads")
          .update({ scholarship_task_created: true } as never)
          .eq("id", leadId);
        await supabaseAdmin.from("lead_events").insert({
          lead_id: leadId,
          user_id: sellerId,
          event_type: "task_created",
          description: "Tarefa de confirmação da entrevista criada",
          metadata: { due_date: dueDate, due_time: dueTime },
        } as never);
      }
    }

    return { ok: true, lead_id: leadId, created, status: "novo" };
  } catch (e) {
    console.error("[scholarship] erro ao processar lead", e);
    return { ok: false, code: "server_error", message: "Erro interno." };
  }
}
