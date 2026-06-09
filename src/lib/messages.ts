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

export function waFollowupMessage(name: string | null | undefined) {
  return `Olá, ${firstName(name)}, tudo bem?

Passando para dar continuidade ao nosso contato sobre o curso de inglês.
Você ainda tem interesse em conversar melhor sobre a possibilidade de iniciar seus estudos?`;
}

export function waRescueMessage(name: string | null | undefined) {
  return `Olá, ${firstName(name)}, tudo bem?

Estou passando porque vi que você demonstrou interesse anteriormente em desenvolver seu inglês, mas talvez aquele momento não fosse o ideal.

Estamos reabrindo algumas condições para pessoas que já tinham conversado com a gente antes.

Hoje ainda faria sentido para você conversar sobre isso?`;
}

export function waConfirmInterviewMessage(name: string | null | undefined, date?: string | null, time?: string | null) {
  const d = date ? new Date(date + "T00:00:00").toLocaleDateString("pt-BR") : "";
  const t = time ? time.slice(0, 5) : "";
  return `Olá, ${firstName(name)}! Só confirmando nossa entrevista${d ? ` no dia ${d}` : ""}${t ? ` às ${t}` : ""}. Posso confirmar com você?`;
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
