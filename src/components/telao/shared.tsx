import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchProductivity, periodRange, type ProductivityRow } from "@/lib/productivity";
import { isRealSeller, scoreOf } from "@/lib/scoring";
import { useScoreSettings } from "@/lib/score-settings";
import {
  useTeamGoalSummary,
  useMissionMonthProduction,
  useMissionRangeProduction,
  monthBusinessWeeks,
  distributeWeeklyGoals,
  currentWeekOf,
  computeWeekProgress,
  computeMissionPace,
  saoPauloIso,
} from "@/lib/team-mission";
import { currentMonthYear } from "@/lib/enrollment-goals";

export type RankTab = "hoje" | "semana" | "mes";
export type RankedRow = ProductivityRow & { score: number; position: number };

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function cleanRows(rows: ProductivityRow[]): ProductivityRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!isRealSeller(r.nome) || seen.has(r.vendedor_id)) return false;
    seen.add(r.vendedor_id);
    return true;
  });
}

/** Linhas ranqueadas por pontos para Hoje / Semana / Mês — mesma fonte do placar. */
export function useRankedRows(tab: RankTab, teamKey: string, teamId: string | null, enabled = true) {
  const range = useMemo(() => periodRange(tab), [tab]);
  const { points } = useScoreSettings();
  const q = useQuery({
    enabled,
    queryKey: ["telao_rank", tab, range.start, range.end, teamKey],
    queryFn: () => fetchProductivity({ start: range.start, end: range.end, vendedorId: null, teamId }),
    refetchInterval: 30_000,
  });
  const ranked = useMemo<RankedRow[]>(() => {
    const list = cleanRows((q.data ?? []) as ProductivityRow[])
      .map((r) => ({ ...r, score: scoreOf(r, points) }))
      .sort((a, b) => b.score - a.score);
    return list.map((r, i) => ({ ...r, position: i + 1 }));
  }, [q.data, points]);
  return { ranked, isLoading: q.isLoading, range };
}

/** Números da missão coletiva do mês corrente — reaproveita as funções da Missão da Equipe. */
export function useTeamMissionNumbers(teamId: string | null) {
  const { month, year } = useMemo(() => currentMonthYear(), []);
  const goalQ = useTeamGoalSummary(month, year, teamId);
  const prodQ = useMissionMonthProduction(month, year, teamId);
  const total = goalQ.data?.total_target ?? 0;
  const weeks = useMemo(() => distributeWeeklyGoals(total, monthBusinessWeeks(month, year)), [total, month, year]);
  const week = useMemo(() => currentWeekOf(weeks), [weeks]);
  const today = saoPauloIso();
  const weekQ = useMissionRangeProduction(week ? { start: week.start, end: week.end } : { start: today, end: today }, teamId, Boolean(week));
  const todayQ = useMissionRangeProduction({ start: today, end: today }, teamId);

  const monthDone = prodQ.data?.matriculas ?? 0;
  const weekDone = weekQ.data?.matriculas ?? 0;
  const todayDone = todayQ.data?.matriculas ?? 0;
  const weekProgress = week ? computeWeekProgress(week, weekDone) : null;
  const pace = computeMissionPace(monthDone, total, month, year);
  // Meta de hoje = meta da semana distribuída pelos dias comerciais da semana (mesma regra da Missão).
  const todayTarget = week && week.businessDays > 0 && week.target > 0 ? Math.ceil(week.target / week.businessDays) : 0;
  const expectedMonth = Math.round(pace.expectedToday);
  return {
    month,
    year,
    loading: goalQ.isLoading || prodQ.isLoading,
    total,
    monthDone,
    monthRemaining: Math.max(0, total - monthDone),
    weekTarget: week?.target ?? 0,
    weekDone,
    weekRemaining: weekProgress?.remaining ?? 0,
    todayTarget,
    todayDone,
    expectedMonth,
    paceDiff: total > 0 ? monthDone - expectedMonth : null,
  };
}

export type Tone = "cyan" | "green" | "orange" | "red" | "gold" | "violet";

export const TONE_TEXT: Record<Tone, string> = {
  cyan: "text-telao-cyan",
  green: "text-telao-green",
  orange: "text-telao-orange",
  red: "text-telao-red",
  gold: "text-telao-gold",
  violet: "text-telao-violet",
};

const TONE_BAR: Record<Tone, string> = {
  cyan: "from-telao-blue to-telao-cyan",
  green: "from-telao-green to-telao-cyan",
  orange: "from-telao-orange to-telao-gold",
  red: "from-telao-red to-telao-orange",
  gold: "from-telao-gold to-telao-orange",
  violet: "from-telao-violet to-telao-blue",
};

export function progressTone(done: number, target: number): Tone {
  if (target <= 0) return "cyan";
  const pct = done / target;
  if (pct >= 1) return "green";
  return "cyan";
}

export function TelaoBar({ value, max, tone = "cyan", size = "md" }: { value: number; max: number; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const h = size === "lg" ? "h-4" : size === "sm" ? "h-1.5" : "h-2.5";
  return (
    <div className={`${h} w-full overflow-hidden rounded-full bg-telao-border`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${TONE_BAR[tone]} shadow-[0_0_12px_-2px_currentColor] ${TONE_TEXT[tone]} transition-[width] duration-1000 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TelaoCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border border-telao-border bg-telao-card p-4 md:p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white/90">{title}</h2>
      </div>
      {right}
    </div>
  );
}
