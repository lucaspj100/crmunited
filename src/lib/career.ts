import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CareerRole =
  | "consultor"
  | "consultor_master"
  | "supervisor"
  | "gerente"
  | "gerente_master"
  | "gerente_divisional"
  | "diretor"
  | "franqueado";

export const CAREER_ROLE_LABELS: Record<CareerRole, string> = {
  consultor: "Consultor",
  consultor_master: "Consultor Master",
  supervisor: "Supervisor",
  gerente: "Gerente",
  gerente_master: "Gerente Master",
  gerente_divisional: "Gerente Divisional",
  diretor: "Diretor",
  franqueado: "Franqueado",
};

/** Trilha visível nesta primeira versão. */
export const CAREER_TRACK: CareerRole[] = [
  "consultor",
  "consultor_master",
  "supervisor",
  "gerente",
  "gerente_master",
  "gerente_divisional",
];

export const CAREER_ROLES: CareerRole[] = [
  "consultor",
  "consultor_master",
  "supervisor",
  "gerente",
  "gerente_master",
  "gerente_divisional",
  "diretor",
  "franqueado",
];

export const STARS_TO_MASTER = 5;
export const POINTS_PER_STAR = 3;

/** Liderança: 1 cota por mês em que a estrutura atinge este total de pontos. */
export const QUOTA_POINTS_TARGET = 25;
/** Cotas necessárias para Gerente virar Gerente Master. */
export const QUOTAS_TO_MASTER = 20;

/** Cargos cuja pontuação considera toda a estrutura abaixo. */
export const LEADER_ROLES: CareerRole[] = ["gerente", "gerente_master", "gerente_divisional"];

export function isLeaderRole(role: CareerRole): boolean {
  return LEADER_ROLES.includes(role);
}


export type GoalStatus = "em_andamento" | "atingida" | "nao_atingida";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  em_andamento: "Em andamento",
  atingida: "Atingida",
  nao_atingida: "Não atingida",
};

export type CareerGoal = {
  id: string;
  month: number;
  year: number;
  role_snapshot?: CareerRole;
  target_points: number;
  achieved_points: number;
  status: GoalStatus;
  promoted_to?: CareerRole | null;
};

export type CareerWeek = {
  week_start: string;
  week_end: string;
  points: number;
  stars_awarded: number;
};

export type CareerRoleHistory = {
  from_role: CareerRole | null;
  to_role: CareerRole;
  created_at: string;
  reason: string | null;
  automatic: boolean;
};

export type CareerQuotaMonth = {
  month: number;
  year: number;
  role_snapshot?: CareerRole | null;
  structure_points: number;
  quota_earned: boolean;
  consolidated_at: string | null;
};

export type CareerDirectReport = {
  user_id: string;
  full_name: string;
  career_role: CareerRole;
  career_stars: number;
  month_points: number;
};

export type CareerOverview = {
  user_id: string;
  full_name: string;
  career_role: CareerRole;
  career_stars: number;
  career_role_since: string | null;
  leader_id: string | null;
  leader_name: string | null;
  career_quotas: number;
  quota_points_target: number;
  quotas_to_master: number;
  structure_month_points: number;
  structure_size: number;
  quota_current_month: CareerQuotaMonth | null;
  quotas_history: CareerQuotaMonth[];
  direct_reports: CareerDirectReport[];
  week_start: string;
  week_end: string;
  week_points: number;
  week_stars_pending: number;
  month_points: number;
  goal: CareerGoal | null;
  weeks: CareerWeek[];
  goals_history: CareerGoal[];
  role_history: CareerRoleHistory[];
};

export type CareerAdminRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  career_role: CareerRole;
  career_stars: number;
  career_role_since: string | null;
  leader_id: string | null;
  career_quotas: number;
  week_points: number;
  month_points: number;
  structure_month_points: number;
  goal: CareerGoal | null;
};

export type CareerTreeNode = {
  user_id: string;
  full_name: string;
  email: string | null;
  career_role: CareerRole;
  career_stars: number;
  career_quotas: number;
  leader_id: string | null;
  month_points: number;
  structure_month_points: number;
};


export const MONTH_LABELS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function monthLabel(month: number, year?: number): string {
  const name = MONTH_LABELS[month - 1] ?? String(month);
  return year ? `${name} de ${year}` : name;
}

export async function fetchCareerOverview(userId?: string): Promise<CareerOverview | null> {
  const { data, error } = await supabase.rpc(
    "career_overview" as never,
    (userId ? { _user_id: userId } : {}) as never,
  );
  if (error) throw error;
  return (data ?? null) as unknown as CareerOverview | null;
}

export async function fetchCareerAdminList(): Promise<CareerAdminRow[]> {
  const { data, error } = await supabase.rpc("career_admin_list" as never);
  if (error) throw error;
  return (data ?? []) as unknown as CareerAdminRow[];
}

export function useCareerOverview(userId?: string, enabled = true) {
  return useQuery({
    queryKey: ["career-overview", userId ?? "me"],
    queryFn: () => fetchCareerOverview(userId),
    enabled,
  });
}

export function useCareerAdminList(enabled: boolean) {
  return useQuery({ queryKey: ["career-admin-list"], queryFn: fetchCareerAdminList, enabled });
}

export async function fetchCareerTree(root?: string): Promise<CareerTreeNode[]> {
  const { data, error } = await supabase.rpc(
    "career_tree" as never,
    (root ? { _root: root } : {}) as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as CareerTreeNode[];
}

export function useCareerTree(root?: string, enabled = true) {
  return useQuery({
    queryKey: ["career-tree", root ?? "all"],
    queryFn: () => fetchCareerTree(root),
    enabled,
  });
}

function useCareerInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["career-overview"] });
    void qc.invalidateQueries({ queryKey: ["career-admin-list"] });
    void qc.invalidateQueries({ queryKey: ["career-tree"] });
    void qc.invalidateQueries({ queryKey: ["career-badges"] });
  };
}

export function useSetCareerLeader() {
  const invalidate = useCareerInvalidate();
  return useMutation({
    mutationFn: async (v: { userId: string; leaderId: string | null }) => {
      const { error } = await supabase.rpc("career_set_leader" as never, {
        _user_id: v.userId,
        _leader_id: v.leaderId,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetCareerQuotas() {
  const invalidate = useCareerInvalidate();
  return useMutation({
    mutationFn: async (v: { userId: string; total: number }) => {
      const { error } = await supabase.rpc("career_set_quotas" as never, {
        _user_id: v.userId,
        _total: v.total,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}


export function useSetCareerRole() {
  const invalidate = useCareerInvalidate();
  return useMutation({
    mutationFn: async (v: { userId: string; role: CareerRole; reason?: string }) => {
      const { error } = await supabase.rpc("career_set_role" as never, {
        _user_id: v.userId,
        _role: v.role,
        _reason: v.reason ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetCareerStars() {
  const invalidate = useCareerInvalidate();
  return useMutation({
    mutationFn: async (v: { userId: string; stars: number }) => {
      const { error } = await supabase.rpc("career_set_stars" as never, {
        _user_id: v.userId,
        _stars: v.stars,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpsertCareerGoal() {
  const invalidate = useCareerInvalidate();
  return useMutation({
    mutationFn: async (v: {
      userId: string;
      month: number;
      year: number;
      target: number;
      notes?: string;
    }) => {
      const { error } = await supabase.rpc("career_upsert_goal" as never, {
        _user_id: v.userId,
        _month: v.month,
        _year: v.year,
        _target: v.target,
        _notes: v.notes ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function nextRole(role: CareerRole): CareerRole | null {
  const i = CAREER_TRACK.indexOf(role);
  if (i < 0 || i === CAREER_TRACK.length - 1) return null;
  return CAREER_TRACK[i + 1];
}

/** Cargos cujo plano de carreira ainda está em construção. */
export function isUnderConstruction(role: CareerRole): boolean {
  return role === "gerente_divisional" || role === "diretor" || role === "franqueado";
}


export function fmtDateBR(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

/** Cargos da trilha de consultoria — os únicos que exibem estrelas. */
export function showsStars(role: CareerRole): boolean {
  return role === "consultor" || role === "consultor_master";
}

export type CareerBadgeInfo = {
  user_id: string;
  full_name: string | null;
  career_role: CareerRole;
  career_stars: number;
};

export async function fetchCareerBadges(): Promise<CareerBadgeInfo[]> {
  const { data, error } = await supabase.rpc("career_badges" as never);
  if (error) throw error;
  return (data ?? []) as unknown as CareerBadgeInfo[];
}

/** Mapa user_id -> cargo/estrelas, reutilizando o Plano de Carreira. */
export function useCareerBadges(enabled = true) {
  const q = useQuery({
    queryKey: ["career-badges"],
    queryFn: fetchCareerBadges,
    enabled,
    staleTime: 5 * 60_000,
  });
  const map = new Map<string, CareerBadgeInfo>();
  for (const b of q.data ?? []) map.set(b.user_id, b);
  return map;
}

