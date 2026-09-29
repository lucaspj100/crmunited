import { Rocket } from "lucide-react";
import { monthLabel } from "@/lib/enrollment-goals";
import { fmtInt } from "@/lib/team-mission";
import { TelaoBar, TelaoCard, SectionTitle, progressTone, TONE_TEXT, useTeamMissionNumbers, type Tone } from "./shared";

export function TeamMissionHero({ teamId, teamName }: { teamId: string | null; teamName: string }) {
  const n = useTeamMissionNumbers(teamId);

  let statusText = "Meta do mês ainda não definida";
  let statusTone: Tone = "cyan";
  if (n.paceDiff !== null) {
    if (n.paceDiff > 0) { statusText = `${n.paceDiff} acima do ritmo`; statusTone = "green"; }
    else if (n.paceDiff === 0) { statusText = "No ritmo"; statusTone = "green"; }
    else {
      const gap = -n.paceDiff;
      statusText = `${gap} abaixo do ritmo`;
      statusTone = n.expectedMonth > 0 && gap / n.expectedMonth > 0.4 ? "red" : "orange";
    }
  }

  const blocks = [
    { label: "Hoje", done: n.todayDone, target: n.todayTarget },
    { label: "Semana", done: n.weekDone, target: n.weekTarget },
    { label: "Mês", done: n.monthDone, target: n.total },
  ];

  return (
    <TelaoCard className="relative overflow-hidden border-telao-cyan/30 bg-gradient-to-br from-telao-card via-telao-card to-telao-blue/10">
      <SectionTitle
        icon={<Rocket className="h-5 w-5 text-telao-cyan" />}
        title={`Missão da equipe · ${monthLabel(n.month, n.year)}`}
        right={<span className="text-xs text-white/50">{teamId ? teamName : "Todas as equipes"}</span>}
      />
      {n.loading ? (
        <p className="text-sm text-white/60">Carregando a missão…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {blocks.map((b) => {
            const tone = progressTone(b.done, b.target);
            return (
              <div key={b.label} className="rounded-xl border border-telao-border bg-telao-bg/60 p-3 md:p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">{b.label}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className={`text-3xl md:text-5xl font-black tabular-nums ${b.target > 0 && b.done >= b.target ? TONE_TEXT.green : "text-white"}`}>{fmtInt(b.done)}</span>
                  {b.target > 0 && <span className="text-lg md:text-2xl font-bold text-white/40 tabular-nums">/ {fmtInt(b.target)}</span>}
                </div>
                <div className="mt-2">
                  {b.target > 0 ? <TelaoBar value={b.done} max={b.target} tone={tone} size="lg" /> : <span className="text-[11px] text-white/40">sem meta definida</span>}
                </div>
              </div>
            );
          })}
          <div className="rounded-xl border border-telao-border bg-telao-bg/60 p-3 md:p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Faltam no mês</div>
            <div className="mt-1 text-3xl md:text-5xl font-black tabular-nums text-telao-gold">{fmtInt(n.monthRemaining)}</div>
            <div className="text-xs text-white/50">matrícula{n.monthRemaining === 1 ? "" : "s"}{n.weekTarget > 0 ? ` · ${fmtInt(n.weekRemaining)} na semana` : ""}</div>
          </div>
          <div className="col-span-2 rounded-xl border border-telao-border bg-telao-bg/60 p-3 md:p-4 lg:col-span-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Status</div>
            <div className={`mt-1 text-2xl md:text-3xl font-black leading-tight ${TONE_TEXT[statusTone]}`}>{statusText}</div>
            {n.total > 0 && <div className="text-xs text-white/50">Ritmo esperado hoje: {fmtInt(n.expectedMonth)} no mês</div>}
          </div>
        </div>
      )}
    </TelaoCard>
  );
}
