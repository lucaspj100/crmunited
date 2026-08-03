import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";
import { computeGoalProgress, goalProgressText, monthLabel, monthPace, type EnrollmentGoal } from "@/lib/enrollment-goals";
import type { ProductivityRow } from "@/lib/productivity";

type Props = {
  /** Linhas do placar (usadas apenas para localizar o próprio vendedor). */
  rows: ProductivityRow[];
  /** Matrículas do mês corrente por vendedor (fonte oficial: productivity_summary). */
  monthDoneById: Map<string, number>;
  /** Meta ativa do próprio usuário autenticado (auth.uid()), ou null. */
  goal: EnrollmentGoal | null;
  month: number;
  year: number;
  /** ID do usuário autenticado — única chave de relação. */
  userId: string | null | undefined;
  /** Rótulo do período selecionado no placar (ex.: "Hoje"). */
  periodLabel: string;
};

/**
 * Card fixo "Minha meta" — sempre pessoal e privado: usa somente auth.uid().
 * Nunca exibe metas de outros vendedores.
 */
export function MyGoalBanner({ rows, monthDoneById, goal, month, year, userId, periodLabel }: Props) {
  if (!userId) return null;

  const row = rows.find((r) => r.vendedor_id === userId) ?? null;
  const done = monthDoneById.get(userId) ?? 0;
  const inPeriod = row?.matriculas ?? 0;
  const label = monthLabel(month, year);

  const header = (
    <div className="flex items-center gap-2">
      <Target className="h-5 w-5 text-amber-400" />
      <span className="text-xs font-bold uppercase tracking-widest text-white/70">
        Minha meta — {label}
      </span>
    </div>
  );

  if (!goal) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
        {header}
        <p className="text-sm text-white/70">
          Sua meta de {label.toLowerCase()} ainda não foi definida.
        </p>
      </div>
    );
  }

  const p = computeGoalProgress(done, goal.target_enrollments);
  const pace = monthPace(done, goal.target_enrollments);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-4 space-y-2">
      {header}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-black tabular-nums">{p.done} de {p.target} matrículas no mês</span>
        <span className="text-sm font-bold tabular-nums text-amber-300">{p.percentage.toFixed(0)}% da meta</span>
        <span className="text-xs text-white/70">{goalProgressText(p)}</span>
        <span className="text-xs text-white/60">{p.message}</span>
      </div>
      <Progress value={p.barValue} className="h-2 bg-white/10" />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/60">
        <span>{inPeriod} no período selecionado ({periodLabel})</span>
        <span className="text-white/30">•</span>
        <span>Projeção: {pace.projection} matrículas · {pace.label}</span>
        <span className="text-white/30">•</span>
        <span>{pace.daysLeft} dia{pace.daysLeft === 1 ? "" : "s"} restante{pace.daysLeft === 1 ? "" : "s"} no mês</span>
      </div>
    </div>
  );
}
