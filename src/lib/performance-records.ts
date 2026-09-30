import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Linha do resumo diário por vendedor (função performance_daily, só leitura). */
export type DailyPerf = {
  user_id: string; day: string;
  ligacoes: number; atendidas: number; interessados: number;
  marcadas: number; realizadas: number; matriculas: number; linkedin: number;
};
export type Metric = "matriculas" | "realizadas" | "marcadas" | "interessados" | "ligacoes" | "linkedin";

/** Desde quando cada indicador tem histórico confiável. */
export const HISTORY_START = "2026-06-01";
export const METRIC_SINCE: Record<Metric, string> = {
  matriculas: "2026-06-05", realizadas: "2026-07-07", marcadas: "2026-06-23",
  interessados: "2026-06-05", ligacoes: "2026-06-23", linkedin: "2026-08-12",
};
export const METRIC_LABEL: Record<Metric, [string, string]> = {
  matriculas: ["matrícula", "matrículas"], realizadas: ["entrevista realizada", "entrevistas realizadas"],
  marcadas: ["entrevista marcada", "entrevistas marcadas"], interessados: ["interessado", "interessados"],
  ligacoes: ["ligação", "ligações"], linkedin: ["mensagem no LinkedIn", "mensagens no LinkedIn"],
};
export const plural = (n: number, m: Metric) => `${n} ${METRIC_LABEL[m][n === 1 ? 0 : 1]}`;

const MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
export const monthLabel = (key: string) => { const [y, m] = key.split("-"); return `${MONTHS[Number(m) - 1]}/${y}`; };
export const dayLabel = (d: string) => { const [y, m, dd] = d.split("-"); return `${Number(dd)} de ${MONTHS[Number(m) - 1]} de ${y}`; };

function todayIso() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  return f.format(new Date());
}
/** Início da semana (domingo), como no Placar. */
export function weekKey(d: string) {
  const dt = new Date(`${d}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}
function weekRange(wk: string) {
  const s = new Date(`${wk}T12:00:00Z`); const e = new Date(s); e.setUTCDate(e.getUTCDate() + 6);
  const f = (x: Date) => `${x.getUTCDate()}/${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${f(s)} a ${f(e)}`;
}
export { weekRange };

export function usePerformanceHistory(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["performance_daily", HISTORY_START],
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("performance_daily", { _start: HISTORY_START, _end: todayIso() });
      if (error) throw error;
      return (data ?? []) as DailyPerf[];
    },
  });
}

export type Best = { user_id: string; value: number; key: string };

/** Maior valor por (vendedor, período), filtrando período e ano opcional. */
export function bestBy(rows: DailyPerf[], metric: Metric, grain: "day" | "week" | "month", year?: number, userId?: string): Best | null {
  const acc = new Map<string, Best>();
  for (const r of rows) {
    if (r.day < METRIC_SINCE[metric]) continue;
    if (year && Number(r.day.slice(0, 4)) !== year) continue;
    if (userId && r.user_id !== userId) continue;
    const key = grain === "day" ? r.day : grain === "week" ? weekKey(r.day) : r.day.slice(0, 7);
    const k = `${r.user_id}|${key}`;
    const cur = acc.get(k) ?? { user_id: r.user_id, value: 0, key };
    cur.value += r[metric] ?? 0;
    acc.set(k, cur);
  }
  let best: Best | null = null;
  for (const b of acc.values()) {
    // em empate, vale quem chegou primeiro
    if (!best || b.value > best.value || (b.value === best.value && b.key < best.key)) best = b;
  }
  return best && best.value > 0 ? best : null;
}

export function totalFor(rows: DailyPerf[], metric: Metric, userId: string, from: string, to: string) {
  let n = 0;
  for (const r of rows) if (r.user_id === userId && r.day >= from && r.day <= to) n += r[metric] ?? 0;
  return n;
}
