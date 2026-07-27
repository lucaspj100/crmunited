import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Team = {
  id: string;
  name: string;
  description: string | null;
  manager_id: string | null;
  is_active: boolean;
  is_primary: boolean;
  include_in_main_dashboard: boolean;
};

export type TeamOverview = Team & {
  manager_name: string | null;
  member_count: number;
};

/** Valor especial usado nos seletores para "Todas as equipes". */
export const ALL_TEAMS = "all";

export async function fetchTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id,name,description,manager_id,is_active,is_primary,include_in_main_dashboard")
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as Team[];
}

export async function fetchTeamsOverview(): Promise<TeamOverview[]> {
  const { data, error } = await supabase.rpc("teams_overview" as never);
  if (error) throw error;
  return (data ?? []) as unknown as TeamOverview[];
}

export function useTeams() {
  return useQuery({ queryKey: ["teams"], queryFn: fetchTeams, staleTime: 60_000 });
}

/** Equipe principal (default dos dashboards/telão/ranking). */
export function primaryTeamId(teams: Team[] | undefined): string | null {
  return teams?.find((t) => t.is_primary)?.id ?? null;
}

/** Converte o valor do seletor no parâmetro `_team_id` das RPCs. */
export function teamParam(value: string): string | null {
  return value === ALL_TEAMS ? null : value;
}
