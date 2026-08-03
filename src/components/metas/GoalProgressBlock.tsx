import { Progress } from "@/components/ui/progress";
import { computeGoalProgress, goalProgressText, type GoalTarget } from "@/lib/enrollment-goals";

/** Barra de progresso da meta individual de matrículas (usada no placar). */
export function GoalProgressBlock({
  done,
  target,
  compact,
  telao,
  periodNote,
}: {
  done: number;
  target: GoalTarget;
  compact?: boolean;
  telao?: boolean;
  periodNote?: string;
}) {
  if (target.kind === "none") {
    return <div className="text-[11px] text-white/50">Meta não definida</div>;
  }
  if (target.kind === "not_comparable") {
    return <div className="text-[11px] text-white/50">Meta não comparável diretamente</div>;
  }

  const p = computeGoalProgress(done, target.target);

  if (compact) {
    return (
      <div className="min-w-0">
        <div className="text-[11px] tabular-nums text-white/80">
          {p.done}/{p.target} matrículas • {p.percentage.toFixed(0)}%
        </div>
        <Progress value={p.barValue} className="mt-1 h-1.5 bg-white/10" />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className={`tabular-nums font-semibold ${telao ? "text-lg" : "text-sm"}`}>
          Matrículas: {p.done} de {p.target}
        </span>
        <span className={`tabular-nums ${telao ? "text-lg font-black" : "text-sm font-bold"} text-amber-300`}>
          {p.percentage.toFixed(0)}% da meta
        </span>
      </div>
      <Progress value={p.barValue} className={`mt-1 ${telao ? "h-3" : "h-2"} bg-white/10`} />
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-white/60">
        <span>{goalProgressText(p)}</span>
        <span className="text-white/40">•</span>
        <span className="text-white/80">{p.message}</span>
        {periodNote && <span className="text-white/40">• {periodNote}</span>}
      </div>
    </div>
  );
}
