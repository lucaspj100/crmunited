import { supabase } from "@/integrations/supabase/client";

export type ProspectContact = {
  id: string;
  nome: string | null;
  telefone_original: string | null;
  telefone_normalizado: string;
  ddd: string | null;
  empresa: string | null;
  cargo: string | null;
  origem: string | null;
  observacao: string | null;
  status_prospeccao: string;
  quantidade_tentativas: number;
  ultima_tentativa: string | null;
  proxima_tentativa: string | null;
  nao_chamar: boolean;
  telefone_invalido: boolean;
  convertido_em_lead: boolean;
  lead_id: string | null;
  vendedor_responsavel_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchNextProspect(userId: string): Promise<ProspectContact | null> {
  const now = new Date().toISOString();

  // 1) Aguardando ligação
  const { data: pri } = await supabase
    .from("prospect_contacts")
    .select("*")
    .eq("vendedor_responsavel_id", userId)
    .eq("convertido_em_lead", false)
    .eq("nao_chamar", false)
    .eq("telefone_invalido", false)
    .eq("status_prospeccao", "Aguardando ligação")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pri) return pri as ProspectContact;

  // 2) Ligar depois vencido
  const { data: due } = await supabase
    .from("prospect_contacts")
    .select("*")
    .eq("vendedor_responsavel_id", userId)
    .eq("convertido_em_lead", false)
    .eq("nao_chamar", false)
    .eq("telefone_invalido", false)
    .eq("status_prospeccao", "Ligar depois")
    .lte("proxima_tentativa", now)
    .order("proxima_tentativa", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (due) return due as ProspectContact;

  // 3) demais não-finais (Não atendeu / Ocupado / Caixa postal / Atendeu / Ligando)
  const { data: rest } = await supabase
    .from("prospect_contacts")
    .select("*")
    .eq("vendedor_responsavel_id", userId)
    .eq("convertido_em_lead", false)
    .eq("nao_chamar", false)
    .eq("telefone_invalido", false)
    .in("status_prospeccao", ["Não atendeu", "Ocupado", "Caixa postal", "Atendeu", "Ligando"])
    .order("ultima_tentativa", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  return (rest as ProspectContact | null) ?? null;
}
