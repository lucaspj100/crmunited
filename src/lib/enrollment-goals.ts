import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { localIso } from "@/lib/productivity";

export type EnrollmentGoal = {
  id: string;
  seller_id: string;
  team_id: string | null;
  month: number;
  year: number;
  target_enrollments: number;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} de ${year}`;
}

export async function fetchEnrollmentGoals(args?: { month?: number; year?: number }): Promise<EnrollmentGoal[]> {
  let q = supabase
    .from("seller_enrollment_goals")
    .select("id,seller_id,team_id,month,year,target_enrollments,notes,active,created_at,updated_at")
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (args?.month) q = q.eq("month", args.month);
  if (args?.year) q = q.eq("year", args.year);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EnrollmentGoal[];
}

/** Metas ativas de um conjunto de meses (chave `${year}-${month}`). */
export function useActiveGoals(months: { month: number; year: number }[]) {
  const key = months.map((m) => `${m.year}-${m.month}`).sort().join(",");
  return useQuery({
    queryKey: ["enrollment_goals_active", key],
    enabled: months.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<EnrollmentGoal[]> => {
      const all = await fetchEnrollmentGoals();
      const set = new Set(months.map((m) => `${m.year}-${m.month}`));
      return all.filter((g) => g.active && set.has(`${g.year}-${g.month}`));
    },
  });
}

/** Meses (ano/mês) cobertos por um intervalo ISO YYYY-MM-DD. */
export function monthsInRange(start: string, end: string): { month: number; year: number }[] {
  const [sy, sm] = start.split("-").map((n) => parseInt(n, 10));
  const [ey, em] = end.split("-").map((n) => parseInt(n, 10));
  const out: { month: number; year: number }[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push({ month: m, year: y });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function currentMonthYear(ref: Date = new Date()) {
  return { month: ref.getMonth() + 1, year: ref.getFullYear() };
}

/** Intervalo do mês (do dia 1 até hoje, ou até o último dia se mês passado). */
export function monthRange(month: number, year: number, ref: Date = new Date()): { start: string; end: string } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const isCurrent = ref.getFullYear() === year && ref.getMonth() + 1 === month;
  const end = isCurrent ? new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()) : last;
  return { start: localIso(first), end: localIso(end) };
}

export type GoalTarget =
  | { kind: "none" }
  | { kind: "not_comparable" }
  | { kind: "target"; target: number };

/**
 * Meta aplicável ao intervalo do placar. Se o intervalo cobre vários meses,
 * soma apenas quando todos os meses possuem meta cadastrada.
 */
export function targetForRange(
  goals: EnrollmentGoal[],
  sellerId: string,
  months: { month: number; year: number }[],
): GoalTarget {
  const mine = goals.filter((g) => g.seller_id === sellerId && g.active);
  const found = months.map((m) => mine.find((g) => g.month === m.month && g.year === m.year));
  if (found.every((f) => !f)) return { kind: "none" };
  if (found.some((f) => !f)) return { kind: "not_comparable" };
  return { kind: "target", target: found.reduce((a, f) => a + (f?.target_enrollments ?? 0), 0) };
}

export type GoalProgress = {
  done: number;
  target: number;
  percentage: number;
  remaining: number;
  barValue: number;
  message: string;
};

export function goalStatusMessage(pct: number): string {
  if (pct > 100) return "🔥 Meta superada";
  if (pct >= 100) return "🏆 Meta batida";
  if (pct >= 80) return "Quase lá";
  if (pct >= 50) return "Na metade do caminho";
  if (pct >= 1) return "Em construção";
  return "Vamos começar!";
}

export function computeGoalProgress(done: number, target: number): GoalProgress {
  const safeTarget = Math.max(1, target);
  const percentage = (done / safeTarget) * 100;
  const remaining = Math.max(0, target - done);
  return {
    done,
    target,
    percentage,
    remaining,
    barValue: Math.min(100, percentage),
    message: goalStatusMessage(percentage),
  };
}

export function goalProgressText(p: GoalProgress): string {
  if (p.percentage > 100) {
    const extra = p.done - p.target;
    return `Meta superada em ${extra} matrícula${extra === 1 ? "" : "s"}`;
  }
  if (p.remaining === 0) return "Meta atingida";
  return `Falta${p.remaining === 1 ? "" : "m"} ${p.remaining} matrícula${p.remaining === 1 ? "" : "s"}`;
}

export type Pace = { projection: number; label: "Acima do ritmo" | "No ritmo" | "Abaixo do ritmo"; daysElapsed: number; daysInMonth: number; daysLeft: number };

/** Projeção simples com base no ritmo do mês corrente. */
export function monthPace(done: number, target: number, ref: Date = new Date()): Pace {
  const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, ref.getDate());
  const daysLeft = Math.max(0, daysInMonth - ref.getDate());
  const projection = Math.round((done / daysElapsed) * daysInMonth * 10) / 10;
  const label = projection > target ? "Acima do ritmo" : projection >= target ? "No ritmo" : "Abaixo do ritmo";
  return { projection, label, daysElapsed, daysInMonth, daysLeft };
}

export const MIN_INTERVIEW_SAMPLE = 10;

/** Estimativa de entrevistas necessárias com base na conversão entrevista→matrícula. */
export function interviewEstimate(interviewsDone: number, enrollments: number, remaining: number):
  | { enough: false }
  | { enough: true; rate: number; interviewsNeeded: number } {
  if (interviewsDone < MIN_INTERVIEW_SAMPLE || enrollments <= 0) return { enough: false };
  const rate = enrollments / interviewsDone;
  if (rate <= 0) return { enough: false };
  return { enough: true, rate: rate * 100, interviewsNeeded: Math.ceil(remaining / rate) };
}

/**
 * Meta ativa do próprio usuário autenticado. A consulta é restrita a auth.uid()
 * (a RLS também garante isso), portanto o front nunca recebe metas de colegas.
 */
export function useMyActiveGoal(month: number, year: number) {
  return useQuery({
    queryKey: ["my_enrollment_goal", month, year],
    staleTime: 60_000,
    queryFn: async (): Promise<EnrollmentGoal | null> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("seller_enrollment_goals")
        .select("id,seller_id,team_id,month,year,target_enrollments,notes,active,created_at,updated_at")
        .eq("seller_id", uid)
        .eq("month", month)
        .eq("year", year)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return (data as EnrollmentGoal | null) ?? null;
    },
  });
}

/**
 * Metas ativas do mês para toda a equipe. Uso exclusivo de admin/franqueado
 * (a RLS entrega apenas a própria meta para vendedores, por isso o hook só é
 * habilitado quando `enabled` é verdadeiro). Relação sempre por seller_id.
 */
export function useTeamActiveGoals(month: number, year: number, enabled: boolean) {
  return useQuery({
    queryKey: ["team_enrollment_goals", month, year],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<EnrollmentGoal[]> => {
      const { data, error } = await supabase
        .from("seller_enrollment_goals")
        .select("id,seller_id,team_id,month,year,target_enrollments,notes,active,created_at,updated_at")
        .eq("month", month)
        .eq("year", year)
        .eq("active", true);
      if (error) {
        console.error("Erro ao carregar metas da equipe:", error);
        throw error;
      }
      return (data ?? []) as EnrollmentGoal[];
    },
  });
}
