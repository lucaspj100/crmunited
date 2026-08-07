import { supabase } from "@/integrations/supabase/client";

export type ProspectContact = {
  id: string;
  nome: string | null;
  telefone_original: string | null;
  telefone_normalizado: string;
  ddd: string | null;
  empresa: string | null;
  cargo: string | null;
  linkedin_url: string | null;
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

  const base = () =>
    supabase
      .from("prospect_contacts")
      .select("*")
      .eq("vendedor_responsavel_id", userId)
      .not("convertido_em_lead", "is", true)
      .not("nao_chamar", "is", true)
      .not("telefone_invalido", "is", true);

  // 1) Nunca trabalhados: Aguardando ligação, 0 tentativas, sem última tentativa
  const { data: pri } = await base()
    .eq("status_prospeccao", "Aguardando ligação")
    .eq("quantidade_tentativas", 0)
    .is("ultima_tentativa", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pri) return pri as ProspectContact;

  // 1b) Demais "Aguardando ligação" (menor nº de tentativas / tentativa mais antiga)
  const { data: waiting } = await base()
    .eq("status_prospeccao", "Aguardando ligação")
    .order("quantidade_tentativas", { ascending: true })
    .order("ultima_tentativa", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (waiting) return waiting as ProspectContact;

  // 2) Ligar depois vencido
  const { data: due } = await base()
    .eq("status_prospeccao", "Ligar depois")
    .lte("proxima_tentativa", now)
    .order("proxima_tentativa", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (due) return due as ProspectContact;

  // 3) demais não-finais (Não atendeu / Ocupado / Caixa postal / Atendeu / Ligando)
  const { data: rest } = await base()
    .in("status_prospeccao", ["Não atendeu", "Ocupado", "Caixa postal", "Atendeu", "Ligando"])
    .order("ultima_tentativa", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  return (rest as ProspectContact | null) ?? null;
}

