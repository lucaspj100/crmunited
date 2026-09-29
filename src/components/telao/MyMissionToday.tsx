import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyActiveGoal, currentMonthYear } from "@/lib/enrollment-goals";
import { monthBusinessWeeks } from "@/lib/team-mission";
import { fmtScore } from "@/lib/scoring";
import { TelaoBar, TelaoCard, SectionTitle, progressTone, type RankedRow } from "./shared";

export function MyMissionToday({ userId, rankedToday }: { userId: string | undefined; rankedToday: RankedRow[] }) {
  const { month, year } = useMemo(() => currentMonthYear(), []);
  const { data: goal = null } = useMyActiveGoal(month, year);
  const { data: callsGoal = null } = useQuery({
    enabled: !!userId,
    queryKey: ["seller_daily_goal", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("seller_daily_goals").select("daily_calls_goal").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!userId) return null;
  const me = rankedToday.find((r) => r.vendedor_id === userId);
  const idx = rankedToday.findIndex((r) => r.vendedor_id === userId);
  const ahead = idx > 0 ? rankedToday[idx - 1] : null;

  const businessDays = monthBusinessWeeks(month, year).reduce((a, w) => a + w.businessDays, 0);
  const enrollTarget = goal && goal.target_enrollments > 0 && businessDays > 0 ? Math.ceil(goal.target_enrollments / businessDays) : 0;
  const callTarget = callsGoal?.daily_calls_goal ?? 0;

  const matriculas = me?.matriculas ?? 0;
  const ligacoes = me?.ligacoes_feitas ?? 0;

  const messages: string[] = [];
  if (me && ahead && ahead.score > me.score) messages.push(`Faltam ${fmtScore(ahead.score - me.score)} pts para alcançar o ${idx}º lugar`);
  if (enrollTarget > 0 && matriculas < enrollTarget) {
    const f = enrollTarget - matriculas;
    messages.push(`Você está a ${f} matrícula${f === 1 ? "" : "s"} da meta de hoje`);
  }
  if (callTarget > 0 && ligacoes < callTarget) messages.push(`Mais ${callTarget - ligacoes} ligações para bater sua meta`);

  const goalItems = [
    { label: "🎓 Matrículas", done: matriculas, target: enrollTarget },
    { label: "📞 Ligações", done: ligacoes, target: callTarget },
  ];
  const secondary = [
    { label: "📅 Marcadas", value: me?.entrevistas_marcadas ?? 0 },
    { label: "🎯 Realizadas", value: me?.entrevistas_realizadas ?? 0 },
    { label: "🔥 Interessados", value: me?.interessados_gerados ?? 0 },
    { label: "💼 LinkedIn", value: me?.linkedins_checkout ?? 0 },
  ];
  const gapAhead = me && ahead ? ahead.score - me.score : 0;

  return (
    <TelaoCard className="border-telao-blue/30">
      <SectionTitle icon={<Crosshair className="h-5 w-5 text-telao-blue" />} title="Sua missão hoje" right={<span className="text-[11px] text-white/40">Só você vê sua posição</span>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {goalItems.map((g) => (
          <div key={g.label} className="rounded-xl border border-telao-border bg-telao-bg/60 p-3 md:p-4">
            <div className="text-xs text-white/60">{g.label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl md:text-4xl font-black tabular-nums">{g.done}</span>
              {g.target > 0 ? <span className="text-lg font-bold text-white/40 tabular-nums">/ {g.target}</span> : <span className="text-xs text-white/50">hoje</span>}
            </div>
            {g.target > 0 && <div className="mt-2"><TelaoBar value={g.done} max={g.target} tone={progressTone(g.done, g.target)} /></div>}
          </div>
        ))}
        <div className="rounded-xl border border-telao-border bg-telao-bg/60 p-3 md:p-4">
          <div className="text-xs text-white/60">⚡ Pontuação</div>
          <div className="mt-1 text-3xl md:text-4xl font-black tabular-nums text-telao-cyan">{fmtScore(me?.score ?? 0)}<span className="ml-1 text-sm text-white/50">pts</span></div>
        </div>
        <div className="rounded-xl border border-telao-gold/30 bg-telao-gold/5 p-3 md:p-4">
          <div className="text-xs text-white/60">🏆 Sua posição</div>
          <div className="mt-1 text-3xl md:text-4xl font-black tabular-nums text-telao-gold">{me ? `${me.position}º` : "—"}<span className="ml-1 text-sm text-white/50">{me ? "lugar" : ""}</span></div>
          {me && ahead && <div className="text-[11px] text-white/60">{gapAhead > 0 ? `a ${fmtScore(gapAhead)} pts do ${idx}º` : `empatado com o ${idx}º`}</div>}
          {me && !ahead && <div className="text-[11px] text-telao-gold/80">liderando hoje</div>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {secondary.map((p) => (
          <div key={p.label} className="flex items-center justify-between gap-2 rounded-lg border border-telao-border bg-telao-bg/40 px-3 py-2">
            <span className="truncate text-xs text-white/60">{p.label}</span>
            <span className="text-xl font-black tabular-nums">{p.value}</span>
          </div>
        ))}
      </div>
      {messages.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {messages.map((m) => (
            <span key={m} className="rounded-full border border-telao-cyan/30 bg-telao-cyan/10 px-3 py-1 text-xs font-semibold text-telao-cyan">{m}</span>
          ))}
        </div>
      )}
    </TelaoCard>
  );
}
