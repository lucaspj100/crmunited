import { useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeGoalProgress, goalProgressText, monthLabel, monthPace, type EnrollmentGoal } from "@/lib/enrollment-goals";
import type { ProductivityRow } from "@/lib/productivity";

type Props = {
  /** Todas as linhas do placar (já filtradas de usuários técnicos). */
  rows: ProductivityRow[];
  /** Matrículas do mês corrente por vendedor (fonte oficial: productivity_summary). */
  monthDoneById: Map<string, number>;
  /** Metas ativas carregadas para os meses relevantes. */
  goals: EnrollmentGoal[];
  month: number;
  year: number;
  isAdmin: boolean;
  userId: string | null | undefined;
  /** Vendedor selecionado pelo ADM (null = resumo da equipe). */
  adminSellerId: string | null;
  onAdminSellerChange: (id: string | null) => void;
  /** Rótulo do período selecionado no placar (ex.: "Hoje"). */
  periodLabel: string;
};

/** Card fixo "Minha meta" — visível a todo vendedor, independente do pódio. */
export function MyGoalBanner({
  rows, monthDoneById, goals, month, year, isAdmin, userId,
  adminSellerId, onAdminSellerChange, periodLabel,
}: Props) {
  const sellerOptions = useMemo(
    () => [...rows].sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "")),
    [rows],
  );

  const targetId = isAdmin ? adminSellerId : userId ?? null;
  const row = targetId ? rows.find((r) => r.vendedor_id === targetId) ?? null : null;
  const goal = targetId ? goals.find((g) => g.seller_id === targetId && g.active && g.month === month && g.year === year) ?? null : null;
  const done = targetId ? monthDoneById.get(targetId) ?? 0 : 0;
  const inPeriod = row?.matriculas ?? 0;
  const label = monthLabel(month, year);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-amber-400" />
        <span className="text-xs font-bold uppercase tracking-widest text-white/70">
          {isAdmin ? "Meta individual" : "Minha meta"} — {label}
        </span>
      </div>
      {isAdmin && (
        <Select value={adminSellerId ?? "__team__"} onValueChange={(v) => onAdminSellerChange(v === "__team__" ? null : v)}>
          <SelectTrigger className="h-8 w-full max-w-[260px] border-white/15 bg-white/10 text-xs text-white">
            <SelectValue placeholder="Selecionar vendedor" />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="__team__">Resumo geral da equipe</SelectItem>
            {sellerOptions.map((r) => (
              <SelectItem key={r.vendedor_id} value={r.vendedor_id}>{r.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  // ADM sem vendedor escolhido: resumo geral da equipe (não assume ninguém).
  if (isAdmin && !targetId) {
    const withGoal = sellerOptions
      .map((r) => {
        const g = goals.find((x) => x.seller_id === r.vendedor_id && x.active && x.month === month && x.year === year);
        return g ? { nome: r.nome, target: g.target_enrollments, done: monthDoneById.get(r.vendedor_id) ?? 0 } : null;
      })
      .filter(Boolean) as { nome: string; target: number; done: number }[];
    const totalTarget = withGoal.reduce((a, s) => a + s.target, 0);
    const totalDone = withGoal.reduce((a, s) => a + s.done, 0);
    const hit = withGoal.filter((s) => s.done >= s.target).length;

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
        {header}
        {withGoal.length === 0 ? (
          <p className="text-sm text-white/60">Nenhuma meta ativa cadastrada para {label}.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-lg font-black tabular-nums">{totalDone} de {totalTarget} matrículas no mês</span>
              <span className="text-sm font-bold tabular-nums text-amber-300">
                {computeGoalProgress(totalDone, totalTarget).percentage.toFixed(0)}% da meta da equipe
              </span>
              <span className="text-xs text-white/60">{hit} de {withGoal.length} vendedores com meta batida</span>
            </div>
            <Progress value={computeGoalProgress(totalDone, totalTarget).barValue} className="h-2 bg-white/10" />
            <div className="text-[11px] text-white/50">Selecione um vendedor para ver a meta individual.</div>
          </>
        )}
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
        {header}
        <p className="text-sm text-white/70">
          {row?.nome ? `${row.nome}: ` : "Sua "}meta de {label.toLowerCase()} ainda não foi definida.
        </p>
      </div>
    );
  }

  const p = computeGoalProgress(done, goal.target_enrollments);
  const pace = monthPace(done, goal.target_enrollments);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-4 space-y-2">
      {header}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
        <div className="min-w-0 md:w-56">
          <div className="truncate text-base font-bold">{row?.nome ?? "—"}</div>
          <div className="text-[11px] text-white/60">Meta de {label}</div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 md:flex-1">
          <span className="text-lg font-black tabular-nums">{p.done} de {p.target} matrículas no mês</span>
          <span className="text-sm font-bold tabular-nums text-amber-300">{p.percentage.toFixed(0)}% da meta</span>
          <span className="text-xs text-white/70">{goalProgressText(p)}</span>
          <span className="text-xs text-white/60">{p.message}</span>
        </div>
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
