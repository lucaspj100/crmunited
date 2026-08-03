import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Rocket, Flag, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { monthLabel } from "@/lib/enrollment-goals";
import {
  useMissionSettings,
  useTeamGoalSummary,
  useMissionMonthProduction,
  computeStage,
  stagePath,
  stageMessage,
  computeMissionPace,
  evalInterestedConversion,
  evalDoneConversion,
  isMonthClosed,
  saveMissionSettings,
  validateMissionSettings,
  DEFAULT_MISSION_SETTINGS,
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
  periodEnrollments: number;
  showPeriodLine: boolean;
  telao?: boolean;
};

/** Card "Missão da equipe": meta coletiva mensal dividida em etapas alcançáveis. */
export function TeamMissionCard(props: Props) {
  const { month, year, teamId, teamName, isAdmin, periodLabel, periodEnrollments, showPeriodLine, telao } = props;
  const [showDetails, setShowDetails] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const goalQ = useTeamGoalSummary(month, year, teamId);
  const prodQ = useMissionMonthProduction(month, year, teamId);
  const settingsQ = useMissionSettings();
  const settings = settingsQ.data ?? DEFAULT_MISSION_SETTINGS;

  const total = goalQ.data?.total_target ?? 0;
  const prod = prodQ.data;
  const done = prod?.matriculas ?? 0;

  const stage = useMemo(() => computeStage(done, total), [done, total]);
  const path = stage ? stagePath(stage.remainingInStage, settings) : null;
  const pace = useMemo(() => computeMissionPace(done, total, month, year), [done, total, month, year]);
  const closed = isMonthClosed(month, year);

  const interestedConv = evalInterestedConversion(done, prod?.interessados ?? 0, settings);
  const doneConv = evalDoneConversion(done, prod?.realizadas ?? 0, settings);

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
      {isAdmin && showConfig && (
        <MissionConfig
          initial={settings}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );

  // Erros e carregamento diferenciados
  if (goalQ.isLoading || prodQ.isLoading) {
    return wrapper(<p className="text-sm text-white/60">Carregando a missão da equipe…</p>);
  }
  if (goalQ.error) {
    return wrapper(
      <div className="space-y-2">
        <p className="text-sm text-rose-300">Não foi possível carregar a meta coletiva.</p>
        <Button size="sm" variant="outline" className="border-white/20 bg-transparent text-white" onClick={() => void goalQ.refetch()}>
          Tentar novamente
        </Button>
      </div>,
    );
  }
  if (prodQ.error) {
    return wrapper(
      <div className="space-y-2">
        <p className="text-sm text-rose-300">Não foi possível calcular as conversões da equipe.</p>
        <Button size="sm" variant="outline" className="border-white/20 bg-transparent text-white" onClick={() => void prodQ.refetch()}>
          Tentar novamente
        </Button>
      </div>,
    );
  }
  if (total <= 0 || !stage) {
    return wrapper(
      <div className="space-y-3">
        <p className="text-sm text-white/80">Meta coletiva ainda não configurada para este mês.</p>
        {isAdmin && (
          <Link to="/metas-matricula">
            <Button size="sm" className="bg-emerald-500 text-slate-900 hover:bg-emerald-400">Configurar metas</Button>
          </Link>
        )}
      </div>,
    );
  }

  const pct = (done / total) * 100;
  const remaining = Math.max(0, total - done);
  const message = stageMessage(stage, done, total);

  return wrapper(
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Área 1 — meta final */}
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-widest text-white/50">Meta final</div>
          <div className={`tabular-nums font-black ${telao ? "text-4xl" : "text-2xl"}`}>
            {fmtInt(done)} de {fmtInt(total)} <span className="text-base font-bold text-white/70">matrículas</span>
          </div>
          <div className="mt-1 text-sm text-amber-300 tabular-nums">{pct.toFixed(0)}% da meta coletiva</div>
          <Progress value={Math.min(100, pct)} className={`mt-2 ${telao ? "h-3" : "h-2"} bg-white/10`} />
          <div className="mt-1 text-[11px] text-white/60">
            {remaining > 0 ? `Faltam ${fmtInt(remaining)} matrículas para a meta final` : "Meta final alcançada"}
          </div>
          {showPeriodLine && (
            <div className="mt-2 text-[11px] text-white/70">
              {fmtInt(periodEnrollments)} matrícula{periodEnrollments === 1 ? "" : "s"} no período selecionado: {periodLabel}
            </div>
          )}
        </div>

        {/* Área 2 — próxima etapa (destaque principal) */}
        <div className="min-w-0 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-emerald-200/80">
            <Flag className="h-3.5 w-3.5" /> Próxima missão
          </div>
          {stage.finalReached ? (
            <div className={`font-black ${telao ? "text-3xl" : "text-xl"}`}>{message}</div>
          ) : (
            <>
              <div className={`font-black ${telao ? "text-4xl" : "text-2xl"}`}>
                Chegar a {fmtInt(stage.stageTarget)} matrículas
              </div>
              <div className={`mt-1 tabular-nums font-bold ${telao ? "text-2xl" : "text-lg"}`}>
                {fmtInt(stage.doneInStage + stage.stageStart)} de {fmtInt(stage.stageTarget)}
              </div>
              <Progress value={stage.stagePct} className={`mt-2 ${telao ? "h-3" : "h-2"} bg-white/10`} />
              <div className="mt-1 text-xs text-white/80">
                Faltam {fmtInt(stage.remainingInStage)} para concluir esta etapa
              </div>
            </>
          )}
          <div className="mt-2 text-[11px] text-emerald-200">{message}</div>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-white/60">
            {stage.milestones.map((m) => (
              <span
                key={m}
                className={`rounded px-1.5 py-0.5 tabular-nums ${
                  done >= m ? "bg-emerald-400/20 text-emerald-200" : "bg-white/5"
                }`}
              >
                {done >= m ? "✅ " : ""}{fmtInt(m)}
              </span>
            ))}
          </div>
        </div>

        {/* Área 3 — caminho e ritmo */}
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-widest text-white/50">Caminho para a próxima etapa</div>
          {path ? (
            <ul className="mt-1 space-y-1 text-sm text-white/85">
              <li>• gerar aproximadamente <b className="tabular-nums">{fmtInt(path.interested)}</b> interessados</li>
              <li>• realizar entre <b className="tabular-nums">{fmtInt(path.doneMin)}</b> e <b className="tabular-nums">{fmtInt(path.doneMax)}</b> entrevistas</li>
              <li>• converter <b className="tabular-nums">{fmtInt(path.enrollments)}</b> matrículas</li>
            </ul>
          ) : (
            <p className="mt-1 text-sm text-white/70">Etapa concluída — foco na próxima conquista da equipe.</p>
          )}
          <div className="mt-3 text-[11px] uppercase tracking-widest text-white/50">Ritmo do mês</div>
          <div className="text-sm text-white/85">
            {pace.message}
            <span className="ml-1 text-white/60 tabular-nums">
              (esperado até hoje: {pace.expectedToday.toFixed(1).replace(".", ",")})
            </span>
          </div>
          {!closed && pace.projection !== null && (
            <div className="mt-1 text-[11px] text-white/60 tabular-nums">
              Projeção: {fmtInt(pace.projection)} matrículas · meta {fmtInt(total)} · diferença {fmtInt(Math.abs(pace.diff ?? 0))}
            </div>
          )}
          {closed && (
            <div className="mt-1 text-[11px] text-white/60">Mês encerrado — resultado final consolidado.</div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 px-2 text-xs text-white/70 hover:bg-white/10 lg:hidden"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
            {showDetails ? "Ocultar detalhes" : "Ver conversões e ritmo"}
          </Button>
        </div>
      </div>

      {/* Conversões reais da equipe */}
      <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${showDetails ? "" : "hidden lg:grid"}`}>
        <ConvBlock
          title="Interessado → Matrícula"
          pctLabel={interestedConv.pctLabel}
          reference={`Referência: ${(settings.interested_to_enrollment_rate * 100).toFixed(0)}%`}
          raw={`${fmtInt(done)} matrículas · ${fmtInt(prod?.interessados ?? 0)} interessados`}
          message={interestedConv.message}
        />
        <ConvBlock
          title="Realizada → Matrícula"
          pctLabel={doneConv.pctLabel}
          reference={`Referência: ${(settings.done_to_enrollment_rate_min * 100).toFixed(0)}% a ${(settings.done_to_enrollment_rate_max * 100).toFixed(0)}%`}
          raw={`${fmtInt(done)} matrículas · ${fmtInt(prod?.realizadas ?? 0)} entrevistas realizadas`}
          message={doneConv.message}
        />
      </div>

      {/* Vendedores sem meta */}
      {isAdmin ? (
        (goalQ.data?.sellers_without_goal ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-200">
            <span>
              {goalQ.data?.sellers_without_goal} vendedor{(goalQ.data?.sellers_without_goal ?? 0) === 1 ? "" : "es"} ativo
              {(goalQ.data?.sellers_without_goal ?? 0) === 1 ? "" : "s"} {(goalQ.data?.sellers_without_goal ?? 0) === 1 ? "está" : "estão"} sem meta cadastrada.
            </span>
            <Link to="/metas-matricula" className="underline">Configurar metas</Link>
          </div>
        )
      ) : (
        <div className="text-[11px] text-white/50">A meta coletiva considera as metas atualmente cadastradas.</div>
      )}
    </div>,
  );
}

function ConvBlock({ title, pctLabel, reference, raw, message }: { title: string; pctLabel: string; reference: string; raw: string; message: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-widest text-white/50">{title}</div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-black tabular-nums">{pctLabel}</span>
        <span className="text-[11px] text-white/60">{reference}</span>
      </div>
      <div className="mt-1 text-[11px] text-white/60 tabular-nums">{raw}</div>
      <div className="mt-1 text-xs text-white/85">{message}</div>
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
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next: MissionSettings = {
      interested_to_enrollment_rate: Number(form.interested.replace(",", ".")) / 100,
      done_to_enrollment_rate_min: Number(form.doneMin.replace(",", ".")) / 100,
      done_to_enrollment_rate_max: Number(form.doneMax.replace(",", ".")) / 100,
      min_sample_interested: Math.round(Number(form.sampleInterested)),
      min_sample_done: Math.round(Number(form.sampleDone)),
    };
    const err = validateMissionSettings(next);
    if (err) { toast.error(err); return; }
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {field("Interessado → Matrícula", "interested", "%")}
        {field("Realizada mín.", "doneMin", "%")}
        {field("Realizada máx.", "doneMax", "%")}
        {field("Amostra interessados", "sampleInterested")}
        {field("Amostra realizadas", "sampleDone")}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => void save()} className="bg-emerald-500 text-slate-900 hover:bg-emerald-400">
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onClose}>Cancelar</Button>
      </div>
    </div>
  );
}
