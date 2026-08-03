import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { fetchProductivity } from "@/lib/productivity";
import {
  computeGoalProgress, currentMonthYear, goalProgressText, interviewEstimate,
  monthLabel, monthPace, monthRange, useActiveGoals,
} from "@/lib/enrollment-goals";

/** Card "Minha meta" — visão pessoal do vendedor no mês corrente. */
export function MyGoalCard() {
  const { user } = useAuth();
  const { month, year } = currentMonthYear();
  const range = monthRange(month, year);

  const { data: goals = [] } = useActiveGoals([{ month, year }]);
  const goal = goals.find((g) => g.seller_id === user?.id) ?? null;

  const { data: rows = [] } = useQuery({
    enabled: !!user,
    queryKey: ["my_goal_month", user?.id, range.start, range.end],
    refetchInterval: 60_000,
    queryFn: () => fetchProductivity({ start: range.start, end: range.end, vendedorId: user!.id, teamId: null }),
  });
  const mine = rows.find((r) => r.vendedor_id === user?.id);
  const done = mine?.matriculas ?? 0;
  const interviewsDone = mine?.entrevistas_realizadas ?? 0;

  const title = `Minha meta de ${monthLabel(month, year).toLowerCase()}`;

  if (!goal) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-primary" />{title}</div>
        <p className="mt-2 text-sm text-muted-foreground">Sua meta deste mês ainda não foi configurada.</p>
      </Card>
    );
  }

  const p = computeGoalProgress(done, goal.target_enrollments);
  const pace = monthPace(done, goal.target_enrollments);
  const est = interviewEstimate(interviewsDone, done, p.remaining);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-primary" />{title}</div>
        <span className="text-sm font-bold tabular-nums text-primary">{p.percentage.toFixed(0)}% concluído</span>
      </div>

      <div>
        <div className="text-xl font-black tabular-nums">{p.done} de {p.target} matrículas</div>
        <Progress value={p.barValue} className="mt-2 h-2.5" />
        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{goalProgressText(p)}</span>
          <span>•</span>
          <span className="font-medium text-foreground">{p.message}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Info label="Restam no mês" value={`${pace.daysLeft} dia${pace.daysLeft === 1 ? "" : "s"}`} />
        <Info label="Projeção atual" value={`${pace.projection} matrículas`} />
        <Info label="Ritmo" value={pace.label} />
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        {est.enough ? (
          <>
            <div>Taxa de conversão: <b>{est.rate.toFixed(1)}%</b> (entrevistas realizadas → matrículas)</div>
            {p.remaining > 0 ? (
              <div>Estimativa: aproximadamente <b>{est.interviewsNeeded}</b> entrevistas realizadas para completar a meta.</div>
            ) : (
              <div>Meta do mês já atingida.</div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground">Ainda não há dados suficientes para estimar.</div>
        )}
      </div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
