import { toast } from "sonner";
import { onlyDigits } from "@/lib/constants";

export async function copyToClipboard(text: string, label = "Copiado") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

const firstName = (name: string | null | undefined) =>
  (name ?? "").trim().split(/\s+/)[0] || "";

export function waFirstContactMessage(name: string | null | undefined) {
  return `Olá, ${firstName(name)}, tudo bem?

Sou da escola e vi que você demonstrou interesse em desenvolver seu inglês.
Posso te passar algumas informações rápidas e entender o seu objetivo?`;
}

export function waFollowupMessage(name: string | null | undefined) {
  return `Olá, ${firstName(name)}, tudo bem?

Passando para dar continuidade ao nosso contato sobre o curso de inglês.
Você ainda tem interesse em conversar melhor sobre a possibilidade de iniciar seus estudos?`;
}

export function waFollowupShort(name: string | null | undefined) {
  return `Oi, ${firstName(name)}! Tudo certo? Consegue me dar um retorno rapidinho?`;
}

export function waSecondContact(name: string | null | undefined) {
  return `Oi, ${firstName(name)}! Tentei te chamar mais cedo e acabei não conseguindo falar.
Quando ficar mais tranquilo, me avisa pra continuarmos nossa conversa sobre o inglês?`;
}

export function waRescueMessage(name: string | null | undefined) {
  return `Olá, ${firstName(name)}, tudo bem?

Estou passando porque vi que você demonstrou interesse anteriormente em desenvolver seu inglês, mas talvez aquele momento não fosse o ideal.

Estamos reabrindo algumas condições para pessoas que já tinham conversado com a gente antes.

Hoje ainda faria sentido para você conversar sobre isso?`;
}

export function waRescue30(name: string | null | undefined) {
  return `Oi, ${firstName(name)}! Faz um tempinho que não conversamos.
Abriu uma janela boa de turmas agora — quer que eu te explique as condições atuais rapidinho?`;
}

export function waRescue90(name: string | null | undefined) {
  return `Oi, ${firstName(name)}! Lembra que conversamos há um tempo sobre o curso de inglês?
Algumas coisas mudaram por aqui (turmas e condições). Faz sentido pra você dar uma olhada agora?`;
}

export function waConfirmInterviewMessage(name: string | null | undefined, date?: string | null, time?: string | null) {
  const d = date ? new Date(date + "T00:00:00").toLocaleDateString("pt-BR") : "";
  const t = time ? time.slice(0, 5) : "";
  return `Olá, ${firstName(name)}! Só confirmando nossa entrevista${d ? ` no dia ${d}` : ""}${t ? ` às ${t}` : ""}. Posso confirmar com você?`;
}

export function waRescheduleInterview(name: string | null | undefined) {
  return `Oi, ${firstName(name)}! Precisamos reagendar nossa entrevista.
Qual o melhor dia e horário pra você esta semana?`;
}

export function waNoShow(name: string | null | undefined) {
  return `Oi, ${firstName(name)}! Senti sua falta na nossa entrevista hoje.
Aconteceu algo? Posso te encaixar em um novo horário — qual fica melhor pra você?`;
}

export function waPosInterview(name: string | null | undefined) {
  return `Oi, ${firstName(name)}! Foi muito bom nosso papo.
Conseguiu pensar com calma sobre o que conversamos? Posso te ajudar a tirar qualquer dúvida.`;
}

export function waLastAttempt(name: string | null | undefined) {
  return `Oi, ${firstName(name)}! Estou tentando falar contigo há alguns dias.
Se preferir, me responde só com "agora não" que eu paro de te incomodar. Caso ainda faça sentido, é só me dizer.`;
}

export function waReferralRequest(name: string | null | undefined) {
  return `Oi, ${firstName(name)}! Tudo bem?
Você conhece alguém que também tenha interesse em melhorar o inglês? Posso conversar com a pessoa do seu lado, com prioridade.`;
}

export type PresetMessage = { key: string; label: string; build: (name: string | null | undefined, lead?: any) => string };

export const MESSAGE_LIBRARY: PresetMessage[] = [
  { key: "primeiro_contato", label: "Primeiro contato", build: (n) => waFirstContactMessage(n) },
  { key: "followup_curto", label: "Follow-up curto", build: (n) => waFollowupShort(n) },
  { key: "followup", label: "Follow-up padrão", build: (n) => waFollowupMessage(n) },
  { key: "segundo_contato", label: "Segundo contato", build: (n) => waSecondContact(n) },
  { key: "confirmar_entrevista", label: "Confirmação de entrevista", build: (n, l) => waConfirmInterviewMessage(n, l?.interview_date, l?.interview_time) },
  { key: "reagendar", label: "Reagendar entrevista", build: (n) => waRescheduleInterview(n) },
  { key: "no_show", label: "Não compareceu", build: (n) => waNoShow(n) },
  { key: "pos_entrevista", label: "Pós-entrevista", build: (n) => waPosInterview(n) },
  { key: "ultima_tentativa", label: "Última tentativa", build: (n) => waLastAttempt(n) },
  { key: "resgate", label: "Resgate padrão", build: (n) => waRescueMessage(n) },
  { key: "resgate_30", label: "Resgate 30 dias", build: (n) => waRescue30(n) },
  { key: "resgate_90", label: "Resgate 90 dias", build: (n) => waRescue90(n) },
  { key: "indicacao", label: "Pedido de indicação", build: (n) => waReferralRequest(n) },
];

// Escolhe a melhor mensagem com base no tipo da tarefa e status do lead.
export function pickPresetKey(taskType?: string | null, leadStatus?: string | null, isRescue?: boolean): string {
  if (isRescue) return "resgate";
  switch (taskType) {
    case "primeiro_contato": return "primeiro_contato";
    case "confirmar_entrevista": return "confirmar_entrevista";
    case "reagendar_entrevista": return "reagendar";
    case "followup_pos": return "pos_entrevista";
    case "resgate": return "resgate";
    case "encerramento": return "ultima_tentativa";
    case "cobrar_decisao": return "pos_entrevista";
    case "ligar":
    case "fazer_ligacao":
    case "enviar_mensagem":
    default:
      break;
  }
  switch (leadStatus) {
    case "novo": return "primeiro_contato";
    case "entrevista_marcada": return "confirmar_entrevista";
    case "entrevista_realizada": return "pos_entrevista";
    default: return "followup";
  }
}

export function buildMessage(key: string, lead: { name: string | null; interview_date?: string | null; interview_time?: string | null }): string {
  const preset = MESSAGE_LIBRARY.find((p) => p.key === key) ?? MESSAGE_LIBRARY[2];
  return preset.build(lead.name, lead);
}

export function leadSummary(lead: { name: string; phone: string | null; company: string | null; status: string }) {
  const lines = [
    `Lead: ${lead.name}`,
    lead.company ? `Empresa: ${lead.company}` : null,
    lead.phone ? `Telefone: ${lead.phone}` : null,
    `Status: ${lead.status}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function rawPhoneDigits(phone: string | null | undefined) {
  return onlyDigits(phone);
}
