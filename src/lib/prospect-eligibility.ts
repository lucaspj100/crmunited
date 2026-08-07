import { supabase } from "@/integrations/supabase/client";
import type { ProspectContact } from "@/lib/prospect-queue";

/** Status que podem ser trabalhados no Discador. */
export const QUEUE_STATUSES = [
  "Aguardando ligação",
  "Ligar depois",
  "Não atendeu",
  "Ocupado",
  "Caixa postal",
  "Atendeu",
  "Ligando",
] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

type EligibilityInput = {
  vendedor_responsavel_id?: string | null;
  status_prospeccao?: string | null;
  convertido_em_lead?: boolean | null;
  nao_chamar?: boolean | null;
  telefone_invalido?: boolean | null;
  telefone_normalizado?: string | null;
};

/** Regra única de elegibilidade. `null` nas flags equivale a `false` (não bloqueado). */
export function isEligibleForDialer(c: EligibilityInput, userId?: string): boolean {
  if (userId && c.vendedor_responsavel_id !== userId) return false;
  if (c.convertido_em_lead === true) return false;
  if (c.nao_chamar === true) return false;
  if (c.telefone_invalido === true) return false;
  const tel = (c.telefone_normalizado ?? "").replace(/\D/g, "");
  if (tel.length < 10) return false;
  return QUEUE_STATUSES.includes((c.status_prospeccao ?? "") as QueueStatus);
}

/**
 * Aplica os filtros de bloqueio usando `is not true`, para que registros
 * antigos com NULL (equivalente operacional de false) não sejam excluídos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyDialerEligibility<T extends { not: (...a: any[]) => T }>(query: T): T {
  return query
    .not("convertido_em_lead", "is", true)
    .not("nao_chamar", "is", true)
    .not("telefone_invalido", "is", true);
}

const PAGE_SIZE = 1000;

/**
 * Busca TODA a fila do vendedor com paginação.
 * O Data API limita cada resposta a 1000 linhas — sem paginação, vendedores
 * com muitos contatos perdiam os registros mais recentes (ex.: "Aguardando ligação").
 */
export async function fetchDialerQueue(userId: string): Promise<ProspectContact[]> {
  const all: ProspectContact[] = [];
  for (let page = 0; page < 20; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await applyDialerEligibility(
      supabase
        .from("prospect_contacts")
        .select("*")
        .eq("vendedor_responsavel_id", userId)
        .in("status_prospeccao", QUEUE_STATUSES as unknown as string[]),
    )
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as ProspectContact[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all.filter((c) => isEligibleForDialer(c, userId));
}

/** Recarrega um contato específico pelo ID (usado pelo botão "Salvar"). */
export async function fetchProspectContactById(id: string): Promise<ProspectContact | null> {
  const { data } = await supabase.from("prospect_contacts").select("*").eq("id", id).maybeSingle();
  return (data as ProspectContact | null) ?? null;
}
