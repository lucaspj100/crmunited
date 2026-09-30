import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CareerBadgeInfo } from "@/lib/career";
import { showsStars, CAREER_ROLE_LABELS } from "@/lib/career";
import { fmtScore } from "@/lib/scoring";
import { fmtInt } from "@/lib/team-mission";
import {
  usePerformanceHistory, bestBy, plural, monthLabel, dayLabel, weekRange, METRIC_SINCE,
  type DailyPerf, type Metric,
} from "@/lib/performance-records";
import { initials, type RankedRow } from "./shared";

type Kind = "lideranca" | "recorde" | "sabia" | "marco" | "hall" | "meta";
type Msg = { kind: Kind; userId?: string; text: string; detail?: string };

const KIND_STYLE: Record<Kind, { label: string; icon: string; cls: string }> = {
  lideranca: { label: "Liderança", icon: "🏆", cls: "text-telao-gold border-telao-gold/40 bg-telao-gold/10" },
  recorde: { label: "Recorde", icon: "⚡", cls: "text-telao-orange border-telao-orange/40 bg-telao-orange/10" },
  sabia: { label: "Você sabia?", icon: "🔥", cls: "text-telao-cyan border-telao-cyan/40 bg-telao-cyan/10" },
  marco: { label: "Marco", icon: "🚀", cls: "text-telao-green border-telao-green/40 bg-telao-green/10" },
  hall: { label: "Hall da Fama", icon: "👑", cls: "text-telao-violet border-telao-violet/40 bg-telao-violet/10" },
  meta: { label: "Meta da equipe", icon: "🎯", cls: "text-telao-green border-telao-green/40 bg-telao-green/10" },
};

const first = (n: string) => n.split(" ")[0] ?? n;
const sinceTxt = (m: Metric) => `desde ${dayLabel(METRIC_SINCE[m]).replace(/ de \d{4}$/, "")}`;
const MILESTONES = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200];

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function buildMessages(args: {
  today: RankedRow[]; week: RankedRow[]; month: RankedRow[];
  careerBadges: Map<string, CareerBadgeInfo>; weekTarget: number; weekRemaining: number;
  hist: DailyPerf[];
}): Msg[] {
  const { today, week, month, careerBadges, weekTarget, weekRemaining } = args;
  const people = new Map(month.map((r) => [r.vendedor_id, r]));
  const hist = args.hist.filter((r) => people.has(r.user_id)); // mesmo recorte de equipe do Placar
  const nm = (id: string) => first(people.get(id)?.nome ?? "");
  const year = Number(todayIso().slice(0, 4));
  const monthName = monthLabel(todayIso().slice(0, 7)).split("/")[0];

  const lid: Msg[] = [], rec: Msg[] = [], sab: Msg[] = [], mar: Msg[] = [], hall: Msg[] = [], meta: Msg[] = [];

  // LIDERANÇA — líderes atuais por indicador
  const leader = (m: keyof RankedRow, metric: Metric, verb: string) => {
    const top = [...month].sort((a, b) => Number(b[m] ?? 0) - Number(a[m] ?? 0))[0];
    const v = Number(top?.[m] ?? 0);
    if (!top || v <= 0) return;
    const bw = metric === "matriculas" ? bestBy(hist, "matriculas", "week", year, top.vendedor_id) : null;
    lid.push({
      kind: "lideranca", userId: top.vendedor_id,
      text: `${first(top.nome)} ${verb} ${monthName} com ${plural(v, metric)}`,
      detail: bw && bw.value > 1 ? `melhor semana: ${plural(bw.value, "matriculas")}` : undefined,
    });
  };
  leader("matriculas", "matriculas", "lidera");
  leader("entrevistas_realizadas", "realizadas", "lidera as entrevistas de");
  leader("ligacoes_feitas", "ligacoes", "lidera as ligações de");
  leader("linkedins_checkout", "linkedin", "lidera o LinkedIn de");
  leader("interessados_gerados", "interessados", "lidera os interessados de");
  if (week[0] && week[0].score > 0)
    lid.push({ kind: "lideranca", userId: week[0].vendedor_id, text: `${first(week[0].nome)} lidera a semana com ${fmtScore(week[0].score)} pts` });
  if (today[0] && today[0].score > 0)
    lid.push({ kind: "lideranca", userId: today[0].vendedor_id, text: `${first(today[0].nome)} está na frente hoje com ${fmtScore(today[0].score)} pts` });

  // RECORDE — recordes do ano
  const recs: [Metric, "day" | "week" | "month", string][] = [
    ["matriculas", "week", "em uma única semana"], ["matriculas", "month", "em um único mês"],
    ["realizadas", "day", "em um único dia"], ["ligacoes", "day", "em um único dia"],
    ["linkedin", "day", "em um único dia"], ["interessados", "day", "em um único dia"],
  ];
  for (const [m, g, txt] of recs) {
    const b = bestBy(hist, m, g, year);
    if (!b || b.value < 2) continue;
    const when = g === "day" ? dayLabel(b.key) : g === "week" ? `semana de ${weekRange(b.key)}` : monthLabel(b.key);
    rec.push({ kind: "recorde", userId: b.user_id, text: `${nm(b.user_id)} fez ${plural(b.value, m)} ${txt}`, detail: `Recorde de ${year} • ${when}` });
  }

  // HALL DA FAMA — recordes históricos (todos os anos)
  const halls: [Metric, "day" | "week" | "month", string][] = [
    ["matriculas", "day", "em um dia"], ["realizadas", "week", "em uma semana"],
    ["realizadas", "month", "em um mês"], ["marcadas", "day", "em um dia"], ["ligacoes", "week", "em uma semana"],
  ];
  for (const [m, g, txt] of halls) {
    const b = bestBy(hist, m, g);
    if (!b || b.value < 2) continue;
    hall.push({ kind: "hall", userId: b.user_id, text: `Recorde histórico de ${plural(b.value, m).replace(/^\d+ /, "")} ${txt}: ${nm(b.user_id)} — ${b.value}`, detail: sinceTxt(m) });
  }

  // VOCÊ SABIA? — melhores marcas pessoais (sempre positivas)
  const curMonth = todayIso().slice(0, 7);
  for (const r of month) {
    const id = r.vendedor_id;
    const own = hist.filter((h) => h.user_id === id);
    if (own.length === 0) continue;
    const bw = bestBy(own, "matriculas", "week", year);
    if (bw && bw.value >= 2)
      sab.push({ kind: "sabia", userId: id, text: `${first(r.nome)} fez ${plural(bw.value, "matriculas")} entre ${weekRange(bw.key)} — sua melhor semana de ${year}` });
    const bd = bestBy(own, "realizadas", "day", year);
    if (bd && bd.value >= 3)
      sab.push({ kind: "sabia", userId: id, text: `${first(r.nome)} realizou ${plural(bd.value, "realizadas")} em um único dia — recorde pessoal`, detail: dayLabel(bd.key) });
    const pastBest = bestBy(own.filter((h) => h.day.slice(0, 7) !== curMonth && Number(h.day.slice(0, 4)) === year), "matriculas", "month");
    const cur = r.matriculas;
    if (pastBest && cur > 0) {
      const gap = pastBest.value - cur + 1;
      if (cur > pastBest.value) sab.push({ kind: "sabia", userId: id, text: `${first(r.nome)} está vivendo seu melhor mês de ${year}: ${plural(cur, "matriculas")}` });
      else if (gap <= 2) sab.push({ kind: "sabia", userId: id, text: `${first(r.nome)} está a ${plural(gap, "matriculas")} de superar seu melhor mês do ano`, detail: `recorde pessoal: ${pastBest.value} em ${monthLabel(pastBest.key)}` });
    }
    const b = careerBadges.get(id);
    if (b && showsStars(b.career_role) && (b.career_stars ?? 0) > 0)
      sab.push({ kind: "sabia", userId: id, text: `${first(r.nome)} é ${CAREER_ROLE_LABELS[b.career_role]} com ${b.career_stars} estrela${b.career_stars === 1 ? "" : "s"}` });

    // MARCO — marcos de matrículas no ano atingidos nos últimos 14 dias
    const yearRows = own.filter((h) => Number(h.day.slice(0, 4)) === year && h.matriculas > 0).sort((a, c) => a.day.localeCompare(c.day));
    let acc = 0; let hit: { n: number; day: string } | null = null;
    for (const h of yearRows) {
      const before = acc; acc += h.matriculas;
      for (const ms of MILESTONES) if (before < ms && acc >= ms) hit = { n: ms, day: h.day };
    }
    if (hit) {
      const ago = (Date.parse(todayIso()) - Date.parse(hit.day)) / 86_400_000;
      if (ago <= 14) mar.push({ kind: "marco", userId: id, text: `${first(r.nome)} chegou à ${hit.n}ª matrícula de ${year}`, detail: `total no ano: ${acc}` });
    }
  }
  const monthCalls = month.reduce((a, r) => a + r.ligacoes_feitas, 0);
  if (monthCalls > 0) sab.push({ kind: "sabia", text: `O time já fez ${fmtInt(monthCalls)} ligações em ${monthName}` });
  const monthDone = month.reduce((a, r) => a + (r.entrevistas_realizadas ?? 0), 0);
  if (monthDone > 0) sab.push({ kind: "sabia", text: `${fmtInt(monthDone)} entrevistas realizadas pelo time em ${monthName}` });

  if (weekTarget > 0)
    meta.push(weekRemaining > 0
      ? { kind: "meta", text: `Faltam ${weekRemaining} matrícula${weekRemaining === 1 ? "" : "s"} para a meta semanal` }
      : { kind: "meta", text: "Meta semanal da equipe batida!" });

  // Intercala categorias e evita a mesma pessoa em sequência
  const pools = [lid, rec, sab, mar, hall, sab, meta].map((p) => p);
  const used = new Set<Msg>();
  const out: Msg[] = [];
  const total = new Set([...lid, ...rec, ...sab, ...mar, ...hall, ...meta]).size;
  let guard = 0;
  while (out.length < total && guard++ < 500) {
    for (const p of pools) {
      const last = out[out.length - 1]?.userId;
      const idx = p.findIndex((m) => !used.has(m) && (!m.userId || m.userId !== last));
      const pick = idx >= 0 ? p[idx] : p.find((m) => !used.has(m));
      if (pick) { used.add(pick); out.push(pick); }
    }
  }
  return out;
}

export function TelaoTicker({
  today, week, month, careerBadges, weekTarget, weekRemaining,
}: {
  today: RankedRow[]; week: RankedRow[]; month: RankedRow[];
  careerBadges: Map<string, CareerBadgeInfo>; weekTarget: number; weekRemaining: number;
}) {
  const { data: hist = [] } = usePerformanceHistory();
  const messages = useMemo(
    () => buildMessages({ today, week, month, careerBadges, weekTarget, weekRemaining, hist }),
    [today, week, month, careerBadges, weekTarget, weekRemaining, hist],
  );
  const people = useMemo(() => new Map(month.map((r) => [r.vendedor_id, r])), [month]);

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (messages.length <= 1 || paused) return;
    const id = setInterval(() => setI((v) => v + 1), 10_000);
    return () => clearInterval(id);
  }, [messages.length, paused, i]);

  if (messages.length === 0) return null;
  const n = messages.length;
  const idx = ((i % n) + n) % n;
  const m = messages[idx]!;
  const st = KIND_STYLE[m.kind];
  const person = m.userId ? people.get(m.userId) : undefined;

  return (
    <div
      className="border-b border-telao-border bg-telao-card/80 px-3 py-2 md:px-6"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto flex max-w-[1800px] items-center gap-3">
        <div key={idx} className="flex min-w-0 flex-1 animate-fade-in items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-telao-gold bg-telao-bg text-sm font-black shadow-[0_0_14px_color-mix(in_oklab,var(--telao-gold)_45%,transparent)]">
            {person?.avatar_url
              ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" />
              : person ? initials(person.nome) : <span aria-hidden>{st.icon}</span>}
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${st.cls}`}>
            {st.icon} {st.label}
          </span>
          <div className="min-w-0 truncate text-sm md:text-base">
            <span className="font-semibold">{m.text}</span>
            {m.detail && <span className="ml-2 text-telao-gold/90">• {m.detail}</span>}
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <button type="button" aria-label="Anterior" onClick={() => setI((v) => v - 1)} className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1" aria-label={`${idx + 1} de ${n}`}>
            {messages.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all ${k === idx ? "w-4 bg-telao-gold" : "w-1.5 bg-white/25"}`} />
            ))}
          </div>
          <button type="button" aria-label="Próximo" onClick={() => setI((v) => v + 1)} className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
