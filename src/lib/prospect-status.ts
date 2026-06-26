export const PROSPECT_STATUSES = [
  "Aguardando ligação",
  "Ligando",
  "Atendeu",
  "Não atendeu",
  "Ocupado",
  "Caixa postal",
  "Sem interesse",
  "Interessado",
  "Pediu WhatsApp",
  "Ligar depois",
  "Número inválido",
  "Não chamar",
  "Convertido em lead",
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const PROSPECT_RESULTS = [
  "Interessado",
  "Pediu WhatsApp",
  "Ligar depois",
  "Sem interesse",
  "Não atendeu",
  "Ocupado",
  "Caixa postal",
  "Número inválido",
  "Não chamar",
] as const;

export type ProspectResult = (typeof PROSPECT_RESULTS)[number];

export const FINAL_STATUSES: ProspectStatus[] = ["Sem interesse", "Não chamar", "Convertido em lead"];

export function statusBadgeClass(s: string): string {
  switch (s) {
    case "Interessado":
      return "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/40";
    case "Convertido em lead":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40";
    case "Pediu WhatsApp":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40";
    case "Ligar depois":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40";
    case "Sem interesse":
    case "Não chamar":
      return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40";
    case "Número inválido":
      return "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/40";
    case "Ligando":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40";
    case "Aguardando ligação":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function applyResultToFields(result: ProspectResult, proximaTentativa: string | null) {
  const patch: Record<string, unknown> = {};
  switch (result) {
    case "Interessado":
      patch.status_prospeccao = "Interessado";
      break;
    case "Pediu WhatsApp":
      patch.status_prospeccao = "Pediu WhatsApp";
      break;
    case "Ligar depois":
      patch.status_prospeccao = "Ligar depois";
      patch.proxima_tentativa = proximaTentativa;
      break;
    case "Sem interesse":
      patch.status_prospeccao = "Sem interesse";
      break;
    case "Não atendeu":
      patch.status_prospeccao = "Não atendeu";
      break;
    case "Ocupado":
      patch.status_prospeccao = "Ocupado";
      break;
    case "Caixa postal":
      patch.status_prospeccao = "Caixa postal";
      break;
    case "Número inválido":
      patch.status_prospeccao = "Número inválido";
      patch.telefone_invalido = true;
      break;
    case "Não chamar":
      patch.status_prospeccao = "Não chamar";
      patch.nao_chamar = true;
      break;
  }
  return patch;
}

export const DEFAULT_WHATSAPP_TEMPLATE =
  "Olá, {primeiro_nome}! Aqui é da United Idiomas. Estou entrando em contato para entender se faz sentido te explicar uma oportunidade de bolsa para inglês voltado à carreira.";

const WPP_KEY = "prospect_whatsapp_template";

export function getWhatsappTemplate(): string {
  if (typeof window === "undefined") return DEFAULT_WHATSAPP_TEMPLATE;
  return window.localStorage.getItem(WPP_KEY) || DEFAULT_WHATSAPP_TEMPLATE;
}

export function setWhatsappTemplate(text: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WPP_KEY, text);
}

export type WhatsappTemplateVars = {
  nome?: string | null;
  empresa?: string | null;
  cargo?: string | null;
  origem?: string | null;
  telefone?: string | null;
};

export const WHATSAPP_TEMPLATE_VARS: { key: string; label: string; sample: string }[] = [
  { key: "primeiro_nome", label: "Primeiro nome", sample: "Leandro" },
  { key: "nome", label: "Nome completo", sample: "Leandro Souza" },
  { key: "empresa", label: "Empresa", sample: "Aché" },
  { key: "cargo", label: "Cargo", sample: "Analista" },
  { key: "origem", label: "Origem", sample: "Lista Aché" },
  { key: "telefone", label: "Telefone", sample: "+5511999998888" },
];

const WPP_FALLBACKS: Record<string, string> = {
  primeiro_nome: "",
  nome: "",
  empresa: "sua empresa",
  cargo: "",
  origem: "",
  telefone: "",
};

function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

export function renderWhatsappTemplate(template: string, vars: WhatsappTemplateVars): string {
  const values: Record<string, string> = {
    nome: (vars.nome ?? "").trim(),
    primeiro_nome: firstNameOf(vars.nome),
    empresa: (vars.empresa ?? "").trim(),
    cargo: (vars.cargo ?? "").trim(),
    origem: (vars.origem ?? "").trim(),
    telefone: (vars.telefone ?? "").trim(),
  };
  return template.replace(/\{(primeiro_nome|nome|empresa|cargo|origem|telefone)\}/g, (_m, key: string) => {
    const v = values[key];
    if (v) return v;
    return WPP_FALLBACKS[key] ?? "";
  });
}
