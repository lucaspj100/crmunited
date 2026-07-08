import { supabase } from "@/integrations/supabase/client";

export type WhatsappTemplateCategory = "primeira_abordagem" | "followup" | "confirmacao";

export type WhatsappTemplate = {
  id: string;
  name: string;
  body: string;
  category: WhatsappTemplateCategory;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type WhatsappRenderVars = {
  nome?: string | null;
  empresa?: string | null;
  cargo?: string | null;
  vendedor?: string | null;
};

const FALLBACKS: Record<string, string> = {
  nome: "",
  primeiro_nome: "",
  empresa: "sua empresa",
  cargo: "",
  vendedor: "",
};

function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

export function renderTemplate(body: string, vars: WhatsappRenderVars): string {
  const values: Record<string, string> = {
    nome: (vars.nome ?? "").trim(),
    primeiro_nome: firstNameOf(vars.nome),
    empresa: (vars.empresa ?? "").trim(),
    cargo: (vars.cargo ?? "").trim(),
    vendedor: (vars.vendedor ?? "").trim(),
  };
  // Aceita {{var}} e {var}
  return body.replace(/\{\{?\s*(primeiro_nome|nome|empresa|cargo|vendedor)\s*\}?\}/g, (_m, key: string) => {
    const v = values[key];
    if (v) return v;
    return FALLBACKS[key] ?? "";
  });
}

export async function fetchActiveTemplates(category?: WhatsappTemplateCategory): Promise<WhatsappTemplate[]> {
  let q = supabase.from("whatsapp_templates" as never).select("*").eq("active", true);
  if (category) q = q.eq("category", category);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as WhatsappTemplate[];
}

export function pickRandomIndex(length: number, excludeIndex?: number): number {
  if (length <= 0) return -1;
  if (length === 1) return 0;
  let idx = Math.floor(Math.random() * length);
  if (excludeIndex !== undefined && idx === excludeIndex) {
    idx = (idx + 1) % length;
  }
  return idx;
}

export const TEMPLATE_CATEGORY_LABELS: Record<WhatsappTemplateCategory, string> = {
  primeira_abordagem: "Primeira abordagem",
  followup: "Follow-up",
  confirmacao: "Confirmação",
};
