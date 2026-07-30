import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EligibilitySnapshot = {
  /** IDs elegíveis ao Hall da Fama (dentro do escopo consultado). */
  eligibleIds: string[];
  /** IDs explicitamente marcados como não elegíveis. */
  excludedIds: string[];
};

/**
 * Elegibilidade ao Hall da Fama — afeta EXCLUSIVAMENTE o Hall da Fama.
 * Placar, telão, relatórios e dashboards continuam usando todos os usuários.
 */
export async function fetchEligibility(teamId: string | null): Promise<EligibilitySnapshot> {
  let q = supabase.from("profiles").select("id,eligible_for_hall_of_fame");
  if (teamId) q = q.eq("team_id", teamId);
  const { data, error } = await q;
  if (error) return { eligibleIds: [], excludedIds: [] };
  const rows = (data ?? []) as unknown as Array<{ id: string; eligible_for_hall_of_fame: boolean | null }>;
  return {
    eligibleIds: rows.filter((r) => r.eligible_for_hall_of_fame !== false).map((r) => r.id),
    excludedIds: rows.filter((r) => r.eligible_for_hall_of_fame === false).map((r) => r.id),
  };
}

/** Conjunto de IDs bloqueados no Hall da Fama (consulta global, sem filtro de equipe). */
export async function fetchExcludedIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("eligible_for_hall_of_fame", false);
  if (error) return new Set();
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}

export function useEligibility(teamId: string | null) {
  return useQuery({
    queryKey: ["hof_eligibility", teamId],
    queryFn: () => fetchEligibility(teamId),
    staleTime: 60_000,
  });
}
