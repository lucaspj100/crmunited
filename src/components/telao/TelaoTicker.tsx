import { useEffect, useMemo, useState } from "react";
import type { CareerBadgeInfo } from "@/lib/career";
import { showsStars, CAREER_ROLE_LABELS } from "@/lib/career";
import { fmtScore } from "@/lib/scoring";
import { fmtInt } from "@/lib/team-mission";
import type { RankedRow } from "./shared";

type Kind = "lideranca" | "curiosidade" | "carreira" | "meta" | "atencao";
type Msg = { kind: Kind; text: string };

const KIND_STYLE: Record<Kind, { label: string; cls: string }> = {
  lideranca: { label: "Liderança", cls: "text-telao-gold border-telao-gold/40 bg-telao-gold/10" },
  curiosidade: { label: "Você sabia?", cls: "text-telao-cyan border-telao-cyan/40 bg-telao-cyan/10" },
  carreira: { label: "Carreira", cls: "text-telao-violet border-telao-violet/40 bg-telao-violet/10" },
  meta: { label: "Meta da equipe", cls: "text-telao-green border-telao-green/40 bg-telao-green/10" },
  atencao: { label: "Meta da equipe", cls: "text-telao-orange border-telao-orange/40 bg-telao-orange/10" },
};

const first = (n: string) => n.split(" ")[0] ?? n;

export function TelaoTicker({
  today, week, month, careerBadges, weekTarget, weekRemaining,
}: {
  today: RankedRow[];
  week: RankedRow[];
  month: RankedRow[];
  careerBadges: Map<string, CareerBadgeInfo>;
  weekTarget: number;
  weekRemaining: number;
}) {
  const messages = useMemo<Msg[]>(() => {
    const out: Msg[] = [];
    const topMatric = [...month].sort((a, b) => b.matriculas - a.matriculas)[0];
    if (topMatric && topMatric.matriculas > 0)
      out.push({ kind: "lideranca", text: `🏆 1º lugar em matrículas no mês: ${first(topMatric.nome)} — ${topMatric.matriculas}` });
    if (week[0] && week[0].score > 0) out.push({ kind: "lideranca", text: `👑 Líder da semana: ${first(week[0].nome)} — ${fmtScore(week[0].score)} pts` });
    if (today[0] && today[0].score > 0) out.push({ kind: "lideranca", text: `⚡ Na frente hoje: ${first(today[0].nome)} — ${fmtScore(today[0].score)} pts` });
    const monthCalls = month.reduce((a, r) => a + r.ligacoes_feitas, 0);
    if (monthCalls > 0) out.push({ kind: "curiosidade", text: `📈 O time já fez ${fmtInt(monthCalls)} ligações neste mês` });
    const monthInterested = month.reduce((a, r) => a + r.interessados_gerados, 0);
    if (monthInterested > 0) out.push({ kind: "curiosidade", text: `🔥 ${fmtInt(monthInterested)} interessados gerados pelo time neste mês` });
    const monthDone = month.reduce((a, r) => a + (r.entrevistas_realizadas ?? 0), 0);
    if (monthDone > 0) out.push({ kind: "curiosidade", text: `🎯 ${fmtInt(monthDone)} entrevistas realizadas neste mês` });
    const ids = new Set(month.map((r) => r.vendedor_id));
    const starred = [...careerBadges.values()]
      .filter((b) => ids.has(b.user_id) && showsStars(b.career_role) && (b.career_stars ?? 0) > 0)
      .sort((a, b) => b.career_stars - a.career_stars)
      .slice(0, 3);
    for (const b of starred)
      out.push({ kind: "carreira", text: `⭐ ${first(b.full_name ?? "")} — ${CAREER_ROLE_LABELS[b.career_role]} com ${b.career_stars} estrela${b.career_stars === 1 ? "" : "s"}` });
    if (weekTarget > 0) {
      out.push(
        weekRemaining > 0
          ? { kind: "atencao", text: `🚀 Faltam ${weekRemaining} matrícula${weekRemaining === 1 ? "" : "s"} para a meta semanal` }
          : { kind: "meta", text: "✅ Meta semanal da equipe batida!" },
      );
    }
    return out;
  }, [today, week, month, careerBadges, weekTarget, weekRemaining]);

  const [i, setI] = useState(0);
  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => setI((v) => v + 1), 7000);
    return () => clearInterval(id);
  }, [messages.length]);

  if (messages.length === 0) return null;
  const m = messages[i % messages.length]!;
  const st = KIND_STYLE[m.kind];
  return (
    <div className="border-b border-telao-border bg-telao-card/80 px-4 py-2.5 md:px-6" aria-live="polite">
      <div key={i} className="mx-auto flex max-w-[1800px] animate-fade-in items-center gap-3">
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${st.cls}`}>{st.label}</span>
        <span className="truncate text-sm font-semibold md:text-base">{m.text}</span>
        <span className="ml-auto hidden shrink-0 text-[10px] tabular-nums text-white/40 sm:inline">{(i % messages.length) + 1}/{messages.length}</span>
      </div>
    </div>
  );
}
