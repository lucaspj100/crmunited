// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;


const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const money = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Monta a ficha do lead usando o client do próprio usuário autenticado,
 * portanto o RLS garante que nenhum vendedor acessa lead de outro.
 * Nunca mistura dois leads: sempre um único lead_id por chamada.
 */
export async function buildLeadContext(
  supabase: Client,
  leadId: string,
): Promise<{ lead: string; negotiation: string | null } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: lead } = await db
    .from("leads")
    .select(
      "id, name, company, phone, linkedin_url, observation, status, source, interview_date, interview_time, interview_done_date, interview_notes, enrollment_date, enrollment_value, monthly_fee, material_value, next_followup_at, last_contact_at, lost_reason, lost_type, owner_id",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;

  const [{ data: owner }, { data: events }, { data: tasks }, { data: negotiationRow }] = await Promise.all([
    db.from("profiles").select("full_name").eq("id", lead.owner_id).maybeSingle(),
    db
      .from("lead_events")
      .select("event_type, description, metadata, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(25),
    db
      .from("tasks")
      .select("type, due_date, due_time, status, observation")
      .eq("lead_id", leadId)
      .order("due_date", { ascending: false })
      .limit(10),
    db.from("ai_negotiation_contexts").select("*").eq("lead_id", leadId).maybeSingle(),
  ]);

  const eventLines = (events ?? [])
    .map(
      (e: { created_at: string; event_type: string; description: string | null; metadata: unknown }) =>
        `- ${e.created_at.slice(0, 16).replace("T", " ")} | ${e.event_type} | ${dash(e.description)}${
          e.metadata && Object.keys(e.metadata as object).length ? ` | ${JSON.stringify(e.metadata)}` : ""
        }`,
    )
    .join("\n");

  const taskLines = (tasks ?? [])
    .map(
      (t: { type: string; due_date: string; due_time: string | null; status: string; observation: string | null }) =>
        `- ${t.due_date}${t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""} | ${t.type} | ${t.status} | ${dash(t.observation)}`,
    )
    .join("\n");

  const leadText = [
    `Nome: ${dash(lead.name)}`,
    `Empresa: ${dash(lead.company)}`,
    `LinkedIn: ${dash(lead.linkedin_url)}`,
    `Origem: ${dash(lead.source)}`,
    `Etapa do funil: ${dash(lead.status)}`,
    `Vendedor responsável: ${dash(owner?.full_name)}`,
    `Entrevista marcada: ${dash(lead.interview_date)}${lead.interview_time ? ` ${String(lead.interview_time).slice(0, 5)}` : ""}`,
    `Entrevista realizada em: ${dash(lead.interview_done_date)}`,
    `Anotações da entrevista: ${dash(lead.interview_notes)}`,
    `Observações: ${dash(lead.observation)}`,
    `Matrícula: ${dash(lead.enrollment_date)} | valor ${money(lead.enrollment_value)} | mensalidade ${money(lead.monthly_fee)} | material ${money(lead.material_value)}`,
    `Próximo follow-up: ${dash(lead.next_followup_at)}`,
    `Último contato: ${dash(lead.last_contact_at)}`,
    `Motivo de perda: ${dash(lead.lost_reason)} (${dash(lead.lost_type)})`,
    eventLines ? `\nHistórico recente:\n${eventLines}` : "",
    taskLines ? `\nTarefas:\n${taskLines}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let negotiation: string | null = null;
  if (negotiationRow) {
    negotiation = [
      `Condição apresentada na entrevista: ${JSON.stringify(negotiationRow.presented ?? {})}`,
      `Condição atual: ${JSON.stringify(negotiationRow.current_condition ?? {})}`,
      `Já foi reduzido: ${dash(negotiationRow.already_reduced)}`,
      `Ainda não foi alterado: ${dash(negotiationRow.not_changed_yet)}`,
      `Relato da negociação: ${dash(negotiationRow.narrative)}`,
      `Autorização especial: ${JSON.stringify(negotiationRow.authorization_data ?? {})}`,
      "A autorização especial vale somente para este lead, não é nova tabela, não deve ser arredondada, alterada nem combinada com outros descontos sem autorização.",
    ].join("\n");
  }

  return { lead: leadText, negotiation };
}
