// Builders puros de mensagens de WhatsApp para leads do Processo Bolsista.
// Nenhuma função aqui altera dados do lead — apenas gera texto.

import { CONFIRMATION_STATUS, hasFormScheduling, isScholarshipLead } from "@/lib/scholarship";

export type MessageLead = Record<string, unknown> & {
  id: string;
  name?: string | null;
  phone?: string | null;
};

export function getFirstName(name: string | null | undefined): string {
  const clean = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return "tudo bem";
  const first = clean.split(" ")[0];
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1);
}

/** Data/hora da entrevista em pt-BR usando o fuso local (mesma regra de formatRequestedInterview). */
export function formatInterviewDateTime(
  iso: string | null | undefined,
): { weekday: string; date: string; time: string; full: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hh = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const time = hh.endsWith(":00") ? `${hh.slice(0, 2)}h` : hh.replace(":", "h");
  return { weekday, date, time, full: `${weekday}, dia ${date}, às ${time}` };
}

function text(lead: MessageLead, key: string, fallbackKey?: string): string | null {
  const pick = (v: unknown) => {
    if (v === null || v === undefined || typeof v === "object" || typeof v === "boolean") return null;
    const s = String(v).trim();
    return s ? s : null;
  };
  const direct = pick(lead[key]);
  if (direct) return direct;
  if (fallbackKey) {
    const answers = (lead["form_answers"] ?? {}) as Record<string, unknown>;
    return pick(answers[fallbackKey]);
  }
  return null;
}

const has = (s: string, ...terms: string[]) => {
  const low = s.toLocaleLowerCase("pt-BR");
  return terms.some((t) => low.includes(t));
};

/** Trecho personalizado a partir das respostas do formulário. Nunca inventa informação. */
export function buildPersonalizedSnippet(lead: MessageLead): string | null {
  const goal = text(lead, "english_goal", "motivo_ingles");
  if (goal) {
    if (has(goal, "acadêmic", "academic", "faculdade", "mestrado", "intercâmbio", "estudo"))
      return "Vi que seu objetivo está bastante ligado à vida acadêmica e ao desenvolvimento do inglês para novas oportunidades.";
    if (has(goal, "carreira", "profission", "trabalho", "internacional", "exterior", "empresa"))
      return "Vi que seu objetivo está bastante ligado a oportunidades profissionais e atuação em ambientes internacionais.";
    if (has(goal, "viag", "turismo"))
      return "Vi que seu objetivo está bastante ligado a viajar com mais segurança e autonomia no inglês.";
    return `Vi que seu objetivo com o inglês está relacionado a ${goal.toLocaleLowerCase("pt-BR")}.`;
  }

  const impact = text(lead, "english_impact", "impacto_ingles");
  if (impact) return `Você comentou sobre o impacto do inglês no seu dia a dia: ${impact.toLocaleLowerCase("pt-BR")}.`;

  const timeframe = text(lead, "start_timeframe", "prazo_inicio");
  if (timeframe) {
    if (has(timeframe, "imediat", "agora", "quanto antes", "urg", "este mês", "esse mês", "já"))
      return "Como você comentou que pretende começar quanto antes, queria te ajudar a concluir a próxima etapa.";
    return `Você comentou que pretende começar ${timeframe.toLocaleLowerCase("pt-BR")}.`;
  }

  const lost = text(lead, "lost_opportunity", "perdeu_oportunidade");
  if (lost && has(lost, "sim"))
    return "Você comentou que já perdeu oportunidades por causa do inglês — é exatamente isso que queremos evitar daqui pra frente.";

  const profession = text(lead, "profession", "profissao");
  const company = text(lead, "company_name", "empresa");
  if (profession && company)
    return `Vi que você atua como ${profession.toLocaleLowerCase("pt-BR")} na ${company}.`;
  if (profession) return `Vi que você atua como ${profession.toLocaleLowerCase("pt-BR")}.`;
  if (company) return `Vi que você atua na ${company}.`;

  return null;
}

export function buildNoScheduleMessage(lead: MessageLead): string {
  const snippet = buildPersonalizedSnippet(lead);
  return [
    `Oi, ${getFirstName(lead.name as string | null)}! Tudo bem? 😊`,
    "Vi que você concluiu sua qualificação para o processo de inglês e seu perfil foi aprovado para entrevista.",
    snippet,
    "Só faltou definirmos o horário da entrevista.",
    "Qual período fica melhor pra você: manhã, tarde ou noite?",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildInterviewConfirmationMessage(lead: MessageLead): string {
  const dt = formatInterviewDateTime(lead["requested_interview_at"] as string | null);
  return [
    `Oi, ${getFirstName(lead.name as string | null)}! Tudo bem? 😊`,
    "Vi aqui que você concluiu sua qualificação e escolheu o horário da sua entrevista.",
    dt ? `Ficou agendado para ${dt.weekday}, dia ${dt.date}, às ${dt.time}.` : null,
    "A entrevista será uma conversa para entendermos melhor seu objetivo com o inglês, seu momento atual e verificarmos as condições disponíveis para o seu perfil.",
    "Posso confirmar sua presença nesse horário?",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildFinalConfirmationMessage(lead: MessageLead): string {
  const iso =
    (lead["requested_interview_at"] as string | null) ??
    (lead["interview_date"]
      ? `${lead["interview_date"]}T${(lead["interview_time"] as string | null) ?? "00:00"}`
      : null);
  const dt = formatInterviewDateTime(iso);
  return [
    `Perfeito, ${getFirstName(lead.name as string | null)}! ✅`,
    dt
      ? `Entrevista confirmada para ${dt.weekday}, ${dt.date}, às ${dt.time}.`
      : "Entrevista confirmada.",
    "Próximo ao horário eu te envio o acesso. Até lá!",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Qual ação de contato sugerido exibir para o lead. */
export type SuggestedContact = "agendar" | "confirmar" | "confirmacao_final" | null;

export function suggestedContact(lead: MessageLead): SuggestedContact {
  if (!isScholarshipLead(lead as never)) return null;
  if (hasFormScheduling(lead as never)) {
    return lead["confirmation_status"] === CONFIRMATION_STATUS.confirmed ? "confirmacao_final" : "confirmar";
  }
  if (lead["form_completed"] === true) return "agendar";
  return null;
}
