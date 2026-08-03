import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Rocket, Flag, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { monthLabel } from "@/lib/enrollment-goals";
import { formatIsoBr } from "@/lib/productivity";
import {
  useMissionSettings,
  useTeamGoalSummary,
  useMissionMonthProduction,
  useMissionRangeProduction,
  monthBusinessWeeks,
  distributeWeeklyGoals,
  currentWeekOf,
  computeWeekProgress,
  weekMessage,
  weekPaceMessage,
  weekPath,
  evaluatePeriodState,
  readInterestedConversion,
  readDoneConversion,
  computeMonthPaceBlocks,
  computeMonthProjection,
  isMonthClosed,
  saveMissionSettings,
  validateMissionSettings,
  DEFAULT_MISSION_SETTINGS,
  saoPauloIso,
  fmtInt,
  type MissionSettings,
} from "@/lib/team-mission";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  month: number;
  year: number;
  teamId: string | null;
  teamName: string;
  isAdmin: boolean;
  periodLabel: string;
  /** Intervalo selecionado no placar — define se a leitura é parcial ou consolidada. */
  periodRange: { start: string; end: string };
  periodEnrollments: number;
  showPeriodLine: boolean;
  telao?: boolean;
};

/** Card "Missão da equipe": meta semanal em destaque, meta mensal como objetivo final. */
export function TeamMissionCard(props: Props) {
  const {
    month,
    year,
    teamId,
    teamName,
    isAdmin,
    periodLabel,
    periodRange,
    periodEnrollments,
    showPeriodLine,
    telao,
  } = props;
  const [showDetails, setShowDetails] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const goalQ = useTeamGoalSummary(month, year, teamId);
  const prodQ = useMissionMonthProduction(month, year, teamId);
  const settingsQ = useMissionSettings();
  const settings = settingsQ.data ?? DEFAULT_MISSION_SETTINGS;

  const total = goalQ.data?.total_target ?? 0;
  const prod = prodQ.data;
  const doneMonth = prod?.matriculas ?? 0;
  const monthClosed = isMonthClosed(month, year);

  // Semanas comerciais do mês com meta distribuída por dias comerciais.
  const weeks = useMemo(
    () => distributeWeeklyGoals(total, monthBusinessWeeks(month, year)),
    [total, month, year],
  );
  const week = useMemo(() => currentWeekOf(weeks), [weeks]);

  // Produção da semana em foco (mesma fonte do placar).
  const weekProdQ = useMissionRangeProduction(
    week ? { start: week.start, end: week.end } : { start: periodRange.start, end: periodRange.end },
    teamId,
    Boolean(week),
  );
  const todayIso = saoPauloIso();
  const todayProdQ = useMissionRangeProduction({ start: todayIso, end: todayIso }, teamId, !monthClosed);

  const state = useMemo(
    () => evaluatePeriodState(periodRange, settings),
    [periodRange, settings],
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Rocket className="h-5 w-5 text-emerald-300" />
        <h2 className={`font-bold ${telao ? "text-2xl" : "text-lg"}`}>
          Missão da equipe — {monthLabel(month, year)}
        </h2>
      </div>
      <div className="flex items-center gap-2 text-xs text-white/60">
        <span>{teamId ? teamName : "Missão de todas as equipes"}</span>
        {!monthClosed && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">{state.label}</span>
        )}
        {isAdmin && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-white/70 hover:bg-white/10"
            onClick={() => setShowConfig((v) => !v)}
          >
            <Settings2 className="mr-1 h-3.5 w-3.5" /> Referências
          </Button>
        )}
      </div>
    </div>
  );

  const wrapper = (children: React.ReactNode) => (
    <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-r from-emerald-500/10 via-sky-500/5 to-transparent p-5">
      {header}
      <div className="mt-4">{children}</div>
      {isAdmin && showConfig && <MissionConfig initial={settings} onClose={() => setShowConfig(false)} />}
    </div>
  );

  if (goalQ.isLoading || prodQ.isLoading) {
    return wrapper(<p className="text-sm text-white/60">Carregando a missão da equipe…</p>);
  }
  if (goalQ.error) {
    return wrapper(
      <ErrorBlock
        message="Não foi possível carregar a meta semanal."
        onRetry={() => void goalQ.refetch()}
      />,
    );
  }
  if (prodQ.error) {
    return wrapper(
      <ErrorBlock
        message="Não foi possível calcular a produção da equipe."
        onRetry={() => void prodQ.refetch()}
      />,
    );
  }
  if (total <= 0) {
    return wrapper(
      <div className="space-y-3">
        <p className="text-sm text-white/80">Meta coletiva ainda não configurada para este mês.</p>
        {isAdmin && (
          <Link to="/metas-matricula">
            <Button size="sm" className="bg-emerald-500 text-slate-900 hover:bg-emerald-400">
              Configurar metas
            </Button>
          </Link>
        )}
      </div>,
    );
  }

  const monthPct = (doneMonth / total) * 100;
  const doneWeek = weekProdQ.data?.matriculas ?? 0;
  const wp = week ? computeWeekProgress(week, doneWeek) : null;

  const pace = computeMonthPaceBlocks(doneMonth, total, month, year);
  const projection = computeMonthProjection(
    doneMonth,
    todayProdQ.data?.matriculas ?? 0,
    total,
    month,
    year,
    state,
  );

  // Conversões usam a produção do mês (fonte histórica corrigida) e o contexto do período.
  const interestedConv = readInterestedConversion(doneMonth, prod?.interessados ?? 0, settings, state);
  const doneConv = readDoneConversion(doneMonth, prod?.realizadas ?? 0, settings, state);
  const path = wp ? weekPath(wp.remaining, settings) : null;

  /* ------------------------------- MODO TELÃO ------------------------------ */
  if (telao) {
    return wrapper(
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-200/80">
            <Flag className="h-4 w-4" /> Meta da semana
            {wp && <span className="text-emerald-200/60">{formatIsoBr(wp.week.start)} a {formatIsoBr(wp.week.end)}</span>}
          </div>
          <div className="text-5xl font-black tabular-nums">
            {fmtInt(doneWeek)} de {fmtInt(wp?.target ?? 0)}{" "}
            <span className="text-xl font-bold text-white/70">matrículas</span>
          </div>
          <Progress value={Math.min(100, wp?.pct ?? 0)} className="mt-3 h-4 bg-white/10" />
          <div className="mt-2 flex flex-wrap gap-x-6 text-lg text-white/85 tabular-nums">
            <span>Faltam {fmtInt(wp?.remaining ?? 0)}</span>
            {!monthClosed && <span>Restam {fmtInt(wp?.businessDaysLeft ?? 0)} dias</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-lg tabular-nums text-white/85">
            Progresso do mês: <b>{fmtInt(doneMonth)}</b> de <b>{fmtInt(total)}</b>
          </div>
          <div className="text-base text-white/70 tabular-nums">
            Interessado → Matrícula: {interestedConv.pctLabel} · Realizada → Matrícula: {doneConv.pctLabel}
          </div>
        </div>
        <Progress value={Math.min(100, monthPct)} className="h-2 bg-white/10" />
        {!state.closed && (
          <p className="text-sm text-white/60">
            {state.dayInProgress ? "Dados de hoje ainda em andamento." : "Dados parciais até agora."}
          </p>
        )}
      </div>,
    );
  }

  /* ---------------------------- DESKTOP / MOBILE --------------------------- */
  return wrapper(
    <div className="space-y-4">
      {/* 1. Meta desta semana (destaque principal) */}
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest text-emerald-200/80">
          <Flag className="h-3.5 w-3.5" />
          {monthClosed ? "Última semana do mês" : "Meta desta semana"}
          {wp && (
            <span className="text-emerald-200/60">
              {formatIsoBr(wp.week.start)} a {formatIsoBr(wp.week.end)}
            </span>
          )}
        </div>
        {weekProdQ.error ? (
          <ErrorBlock message="Não foi possível carregar a meta semanal." onRetry={() => void weekProdQ.refetch()} />
        ) : (
          <>
            <div className="mt-1 text-2xl font-black tabular-nums">
              {fmtInt(doneWeek)} de {fmtInt(wp?.target ?? 0)}{" "}
              <span className="text-base font-bold text-white/70">matrículas</span>
            </div>
            <Progress value={Math.min(100, wp?.pct ?? 0)} className="mt-2 h-2.5 bg-white/10" />
            <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-white/85 tabular-nums">
              <span>{Math.round(wp?.pct ?? 0)}% da meta semanal</span>
              <span>Faltam {fmtInt(wp?.remaining ?? 0)}</span>
              {!monthClosed && <span>Restam {fmtInt(wp?.businessDaysLeft ?? 0)} dias comerciais</span>}
            </div>
            <div className="mt-2 text-xs text-emerald-200">{wp ? weekMessage(wp) : ""}</div>
          </>
        )}
      </div>

      {/* 2. Progresso do mês (segundo plano) */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-[11px] uppercase tracking-widest text-white/50">
          {monthClosed ? `Resultado final de ${monthLabel(month, year)}` : "Progresso do mês"}
        </div>
        <div className="text-lg font-bold tabular-nums">
          {fmtInt(doneMonth)} de {fmtInt(total)} <span className="text-sm font-medium text-white/70">matrículas</span>
          <span className="ml-2 text-sm font-semibold text-amber-300">{monthPct.toFixed(0)}% da meta</span>
        </div>
        <Progress value={Math.min(100, monthPct)} className="mt-2 h-1.5 bg-white/10" />
        {showPeriodLine && (
          <div className="mt-2 text-[11px] text-white/70">
            {fmtInt(periodEnrollments)} matrícula{periodEnrollments === 1 ? "" : "s"} no período selecionado:{" "}
            {periodLabel}
          </div>
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-white/70 hover:bg-white/10 md:hidden"
        onClick={() => setShowDetails((v) => !v)}
      >
        {showDetails ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
        {showDetails ? "Ocultar detalhes" : "Ver detalhes"}
      </Button>

      <div className={`space-y-4 ${showDetails ? "" : "hidden md:block"}`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* 3. Ritmo da semana */}
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] uppercase tracking-widest text-white/50">Ritmo da semana</div>
            {wp ? (
              <div className="mt-1 space-y-1 text-sm text-white/85 tabular-nums">
                <div>
                  Esperado até agora: <b>aproximadamente {fmtInt(wp.expectedSoFar)}</b>
                </div>
                <div>
                  Realizado: <b>{fmtInt(wp.done)}</b>
                </div>
                <div className="text-emerald-200">{weekPaceMessage(wp)}</div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-white/60">Semana comercial não identificada.</p>
            )}
          </div>

          {/* 4. Ritmo do mês */}
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] uppercase tracking-widest text-white/50">Ritmo do mês</div>
            <div className="mt-1 space-y-1 text-sm text-white/85 tabular-nums">
              <div>
                Esperado até hoje: <b>{fmtInt(pace.expected)}</b>
              </div>
              <div>
                Realizado: <b>{fmtInt(pace.done)}</b>
              </div>
              <div className={pace.above ? "text-emerald-200" : "text-white/70"}>{pace.message}</div>
            </div>
          </div>

          {/* 5. Projeção do mês */}
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] uppercase tracking-widest text-white/50">Projeção do mês</div>
            {projection.stable && projection.value !== null ? (
              <div className="mt-1 space-y-1 text-sm text-white/85 tabular-nums">
                <div>
                  Mantendo o ritmo atual: <b>{fmtInt(projection.value)}</b> matrículas
                </div>
                <div className="text-white/60">Meta final: {fmtInt(total)} matrículas</div>
                {projection.note && <div className="text-[11px] text-white/50">{projection.note}</div>}
              </div>
            ) : (
              <p className="mt-1 text-sm text-white/60">{projection.note || "Projeção ainda instável."}</p>
            )}
          </div>
        </div>

        {/* 6. Caminho da semana */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-widest text-white/50">Caminho da semana</div>
          {path ? (
            <>
              <p className="mt-1 text-sm text-white/85">
                Para buscar as <b className="tabular-nums">{fmtInt(path.enrollments)}</b> matrículas restantes desta
                semana:
              </p>
              <ul className="mt-1 space-y-1 text-sm text-white/85">
                <li>• aproximadamente <b className="tabular-nums">{fmtInt(path.interested)}</b> interessados</li>
                <li>
                  • entre <b className="tabular-nums">{fmtInt(path.doneMin)}</b> e{" "}
                  <b className="tabular-nums">{fmtInt(path.doneMax)}</b> entrevistas realizadas
                </li>
              </ul>
              <p className="mt-1 text-[11px] text-white/50">Esses números são referências, não obrigações exatas.</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-white/70">Meta da semana concluída — foco na próxima conquista.</p>
          )}
        </div>

        {/* 7. Conversões */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ConvBlock title="Interessado → Matrícula" reading={interestedConv} />
          <ConvBlock title="Realizada → Matrícula" reading={doneConv} />
        </div>
      </div>

      {/* Vendedores sem meta */}
      {isAdmin ? (
        (goalQ.data?.sellers_without_goal ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-200">
            <span>
              {goalQ.data?.sellers_without_goal} vendedor
              {(goalQ.data?.sellers_without_goal ?? 0) === 1 ? "" : "es"} ativo
              {(goalQ.data?.sellers_without_goal ?? 0) === 1 ? "" : "s"}{" "}
              {(goalQ.data?.sellers_without_goal ?? 0) === 1 ? "está" : "estão"} sem meta cadastrada.
            </span>
            <Link to="/metas-matricula" className="underline">
              Configurar metas
            </Link>
          </div>
        )
      ) : (
        <div className="text-[11px] text-white/50">A meta coletiva considera as metas atualmente cadastradas.</div>
      )}
    </div>,
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-rose-300">{message}</p>
      <Button size="sm" variant="outline" className="border-white/20 bg-transparent text-white" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}

function ConvBlock({
  title,
  reading,
}: {
  title: string;
  reading: { pctLabel: string; raw: string; reference: string; note: string; verdict: string | null };
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-widest text-white/50">{title}</div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-black tabular-nums">{reading.pctLabel}</span>
        <span className="text-[11px] text-white/60">{reading.reference}</span>
      </div>
      <div className="mt-1 text-[11px] text-white/60 tabular-nums">{reading.raw}</div>
      {reading.verdict && <div className="mt-1 text-xs text-emerald-200">{reading.verdict}</div>}
      {reading.note && <div className="mt-1 text-[11px] text-white/60">{reading.note}</div>}
    </div>
  );
}

function MissionConfig({ initial, onClose }: { initial: MissionSettings; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    interested: (initial.interested_to_enrollment_rate * 100).toString(),
    doneMin: (initial.done_to_enrollment_rate_min * 100).toString(),
    doneMax: (initial.done_to_enrollment_rate_max * 100).toString(),
    sampleInterested: initial.min_sample_interested.toString(),
    sampleDone: initial.min_sample_done.toString(),
    sampleEnrollments: initial.min_sample_enrollments.toString(),
    closeHour: initial.day_close_hour.toString(),
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next: MissionSettings = {
      interested_to_enrollment_rate: Number(form.interested.replace(",", ".")) / 100,
      done_to_enrollment_rate_min: Number(form.doneMin.replace(",", ".")) / 100,
      done_to_enrollment_rate_max: Number(form.doneMax.replace(",", ".")) / 100,
      min_sample_interested: Math.round(Number(form.sampleInterested)),
      min_sample_done: Math.round(Number(form.sampleDone)),
      min_sample_enrollments: Math.round(Number(form.sampleEnrollments)),
      day_close_hour: Math.round(Number(form.closeHour)),
    };
    const err = validateMissionSettings(next);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      await saveMissionSettings(next);
      await qc.invalidateQueries({ queryKey: ["team_mission_settings"] });
      toast.success("Referências atualizadas.");
      onClose();
    } catch (e) {
      console.error("Erro ao salvar referências da missão:", e);
      toast.error("Não foi possível salvar as referências.");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, suffix?: string) => (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-white/60">{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="h-9 border-white/20 bg-transparent text-white"
        />
        {suffix && <span className="text-xs text-white/50">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field("Interessado → Matrícula", "interested", "%")}
        {field("Realizada mín.", "doneMin", "%")}
        {field("Realizada máx.", "doneMax", "%")}
        {field("Amostra interessados", "sampleInterested")}
        {field("Amostra realizadas", "sampleDone")}
        {field("Amostra matrículas", "sampleEnrollments")}
        {field("Fechamento do dia", "closeHour", "h")}
      </div>
      <p className="mt-2 text-[11px] text-white/50">
        O fechamento do dia usa o fuso de São Paulo. Antes desse horário, o card mostra dados parciais e não emite
        diagnóstico.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={() => void save()}
          className="bg-emerald-500 text-slate-900 hover:bg-emerald-400"
        >
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
