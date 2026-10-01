import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TelaoCard, SectionTitle } from "@/components/telao/shared";
import { sumSeries, type SeriesDay } from "@/components/telao/SellerPerformancePanel";
import { CalendarRange, Percent } from "lucide-react";

const METRICS = [
  { key: "matriculas", label: "Matrículas" },
  { key: "realizadas", label: "Realizadas" },
  { key: "marcadas", label: "Agendadas" },
  { key: "interessados", label: "Interessados" },
  { key: "ligacoes", label: "Ligações" },
  { key: "atendidas", label: "Atendidas" },
  { key: "linkedin", label: "LinkedIn" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

/** Semana 1 = dias 1–7 do mês, semana 2 = 8–14, e assim por diante. */
export function groupByMonthWeek(rows: SeriesDay[]) {
  const buckets = new Map<number, SeriesDay[]>();
  for (const r of rows) {
    const w = Math.floor((Number(r.day.slice(8, 10)) - 1) / 7) + 1;
    buckets.set(w, [...(buckets.get(w) ?? []), r]);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([w, list]) => {
    const t = sumSeries(list);
    return {
      week: `Sem ${w}`, ...t,
      atend: pct(t.atendidas, t.ligacoes),
      interesse: pct(t.interessados, t.ligacoes),
      agend: pct(t.marcadas, t.interessados),
      compar: pct(t.realizadas, t.marcadas),
      fecha: pct(t.matriculas, t.realizadas),
    };
  });
}

const CONV = [
  { key: "atend", label: "Atendidas ÷ ligações", color: "var(--telao-cyan)" },
  { key: "interesse", label: "Interessados ÷ ligações", color: "var(--telao-violet)" },
  { key: "agend", label: "Agendadas ÷ interessados", color: "var(--telao-orange)" },
  { key: "compar", label: "Realizadas ÷ agendadas", color: "var(--telao-gold)" },
  { key: "fecha", label: "Matrículas ÷ realizadas", color: "var(--telao-green)" },
] as const;

const tooltipStyle = { background: "var(--telao-card)", border: "1px solid var(--telao-border)", borderRadius: 12, color: "white" };

export function WeeklyCharts({ series }: { series: SeriesDay[] }) {
  const [metric, setMetric] = useState<MetricKey>("matriculas");
  const data = useMemo(() => groupByMonthWeek(series), [series]);
  if (!data.length) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TelaoCard>
        <SectionTitle icon={<CalendarRange className="h-4 w-4 text-telao-cyan" />} title="Evolução por semana" />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition ${metric === m.key ? "border-telao-cyan bg-telao-cyan/15 text-telao-cyan" : "border-telao-border text-white/60 hover:text-white"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke="var(--telao-border)" vertical={false} />
              <XAxis dataKey="week" stroke="rgba(255,255,255,0.5)" fontSize={12} />
              <YAxis allowDecimals={false} stroke="rgba(255,255,255,0.5)" fontSize={12} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey={metric} name={METRICS.find((m) => m.key === metric)?.label} fill="var(--telao-cyan)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </TelaoCard>

      <TelaoCard>
        <SectionTitle icon={<Percent className="h-4 w-4 text-telao-gold" />} title="Conversões por semana" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="var(--telao-border)" vertical={false} />
              <XAxis dataKey="week" stroke="rgba(255,255,255,0.5)" fontSize={12} />
              <YAxis unit="%" stroke="rgba(255,255,255,0.5)" fontSize={12} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => (v == null ? "sem base" : `${v}%`)} />
              {CONV.map((c) => (
                <Line key={c.key} dataKey={c.key} name={c.label} stroke={c.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/60">
          {CONV.map((c) => (
            <span key={c.key} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.label}
            </span>
          ))}
        </div>
      </TelaoCard>
    </div>
  );
}
