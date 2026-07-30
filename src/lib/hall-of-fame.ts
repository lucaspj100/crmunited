import { supabase } from "@/integrations/supabase/client";
import { fetchProductivity, localIso, type ProductivityRow } from "@/lib/productivity";
import { POINTS, POINTS_LEGEND, scoreOf, isRealSeller } from "@/lib/scoring";
import { fetchExcludedIds } from "@/lib/hall-eligibility";


export type RankedRow = ProductivityRow & { score: number; active_days?: number };

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

/** Período mensal: 1º dia 00:00 até último dia 23:59:59 (America/Sao_Paulo). */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  return { start: localIso(first), end: localIso(last) };
}

/** "Agora" no fuso oficial da operação. */
export function nowSaoPaulo(): Date {
  const s = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(s);
}

export function currentMonthYear(): { year: number; month: number } {
  const d = nowSaoPaulo();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function isCurrentMonth(year: number, month: number): boolean {
  const c = currentMonthYear();
  return c.year === year && c.month === month;
}

export function isFutureMonth(year: number, month: number): boolean {
  const c = currentMonthYear();
  return year > c.year || (year === c.year && month > c.month);
}

export function daysToMonthEnd(): number {
  const d = nowSaoPaulo();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return last - d.getDate();
}

/** Critérios de desempate do ranking geral (ordem oficial). */
export const TIEBREAKERS = [
  "Maior pontuação total",
  "Mais matrículas",
  "Mais entrevistas realizadas",
  "Mais entrevistas marcadas",
  "Mais interessados",
  "Mais atendimentos",
  "Mais ligações",
  "Ordem alfabética",
];

export function compareRanked(a: RankedRow, b: RankedRow): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.matriculas !== a.matriculas) return b.matriculas - a.matriculas;
  const ar = a.entrevistas_realizadas ?? 0;
  const br = b.entrevistas_realizadas ?? 0;
  if (br !== ar) return br - ar;
  if (b.entrevistas_marcadas !== a.entrevistas_marcadas) return b.entrevistas_marcadas - a.entrevistas_marcadas;
  if (b.interessados_gerados !== a.interessados_gerados) return b.interessados_gerados - a.interessados_gerados;
  if (b.ligacoes_atendidas !== a.ligacoes_atendidas) return b.ligacoes_atendidas - a.ligacoes_atendidas;
  if (b.ligacoes_feitas !== a.ligacoes_feitas) return b.ligacoes_feitas - a.ligacoes_feitas;
  return (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
}

function hasActivity(r: ProductivityRow): boolean {
  return (
    r.ligacoes_feitas > 0 ||
    r.ligacoes_atendidas > 0 ||
    r.interessados_gerados > 0 ||
    r.entrevistas_marcadas > 0 ||
    (r.entrevistas_realizadas ?? 0) > 0 ||
    r.matriculas > 0 ||
    (r.whatsapps_checkout ?? 0) > 0 ||
    (r.linkedins_checkout ?? 0) > 0
  );
}

export async function fetchActiveDays(
  start: string,
  end: string,
  teamId: string | null,
): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("hall_of_fame_active_days" as never, {
    _start: start,
    _end: end,
    _team_id: teamId,
  } as never);
  if (error) return {};
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ vendedor_id: string; active_days: number }>) {
    out[row.vendedor_id] = row.active_days;
  }
  return out;
}

/**
 * Ranking mensal do Hall da Fama.
 * Usa a MESMA fonte de verdade do placar (productivity_summary), porém remove
 * os usuários marcados como não elegíveis ao Hall da Fama (líderes, ADM, etc.).
 * Essa exclusão NÃO afeta placar, telão, relatórios ou métricas operacionais.
 */
export async function fetchMonthRanking(args: {
  year: number;
  month: number;
  teamId: string | null;
  withActiveDays?: boolean;
}): Promise<RankedRow[]> {
  const { start, end } = monthRange(args.year, args.month);
  const [raw, excluded] = await Promise.all([
    fetchProductivity({ start, end, vendedorId: null, teamId: args.teamId }),
    fetchExcludedIds(),
  ]);
  const seen = new Set<string>();
  const rows = raw.filter((r) => {
    if (!isRealSeller(r.nome)) return false;
    if (excluded.has(r.vendedor_id)) return false;
    if (seen.has(r.vendedor_id)) return false;
    seen.add(r.vendedor_id);
    return true;
  });
  const activeDays = args.withActiveDays ? await fetchActiveDays(start, end, args.teamId) : {};
  return rows
    .filter(hasActivity)
    .map((r) => ({ ...r, score: scoreOf(r), active_days: activeDays[r.vendedor_id] ?? 0 }))
    .sort(compareRanked);
}


export type CategoryWinner = {
  key: string;
  label: string;
  icon: string;
  description: string;
  valueLabel: string;
  winners: Array<{ vendedor_id: string; nome: string; avatar_url: string | null }>;
  empty?: string;
};

function pickTop(
  rows: RankedRow[],
  value: (r: RankedRow) => number,
  format: (v: number) => string,
  minFilter?: (r: RankedRow) => boolean,
): { winners: RankedRow[]; valueLabel: string } {
  const eligible = rows.filter((r) => (minFilter ? minFilter(r) : true) && value(r) > 0);
  if (eligible.length === 0) return { winners: [], valueLabel: "—" };
  const best = Math.max(...eligible.map(value));
  const tied = eligible.filter((r) => value(r) === best).sort(compareRanked);
  // Empates: mostra os empatados (máx. 3) já ordenados pelos critérios de desempate.
  return { winners: tied.slice(0, 3), valueLabel: format(best) };
}

const asWinner = (r: RankedRow) => ({ vendedor_id: r.vendedor_id, nome: r.nome, avatar_url: r.avatar_url });

export function computeCategories(rows: RankedRow[], prevRows: RankedRow[]): CategoryWinner[] {
  const int = (v: number) => v.toLocaleString("pt-BR");
  const defs: Array<{
    key: string; label: string; icon: string; description: string;
    value: (r: RankedRow) => number; format: (v: number) => string;
    minFilter?: (r: RankedRow) => boolean; empty?: string;
  }> = [
    { key: "calls", label: "Mais ligações", icon: "📞", description: "Maior quantidade de ligações realizadas no mês.", value: (r) => r.ligacoes_feitas, format: int },
    { key: "answered", label: "Mais atendimentos", icon: "✅", description: "Maior número de contatos atendidos.", value: (r) => r.ligacoes_atendidas, format: int },
    { key: "interested", label: "Mais interessados", icon: "✨", description: "Maior número de interessados gerados.", value: (r) => r.interessados_gerados, format: int },
    { key: "interviews", label: "Mais entrevistas marcadas", icon: "📅", description: "Maior número de entrevistas marcadas.", value: (r) => r.entrevistas_marcadas, format: int },
    { key: "interviews_done", label: "Mais entrevistas realizadas", icon: "🎯", description: "Maior número de entrevistas efetivamente realizadas.", value: (r) => r.entrevistas_realizadas ?? 0, format: int },
    { key: "enrollments", label: "Mais matrículas", icon: "🎓", description: "Maior número de matrículas no mês.", value: (r) => r.matriculas, format: int },
    {
      key: "conversion", label: "Melhor conversão", icon: "🏹",
      description: "Matrículas ÷ entrevistas realizadas × 100. Considera apenas vendedores com pelo menos 3 entrevistas realizadas.",
      value: (r) => ((r.entrevistas_realizadas ?? 0) >= 3 ? (r.matriculas / (r.entrevistas_realizadas ?? 1)) * 100 : 0),
      format: (v) => `${v.toFixed(1)}%`,
      minFilter: (r) => (r.entrevistas_realizadas ?? 0) >= 3,
      empty: "Nenhum vendedor com 3 ou mais entrevistas realizadas.",
    },
    {
      key: "consistency", label: "Maior consistência", icon: "🔁",
      description: "Maior número de dias diferentes com pelo menos uma atividade pontuável.",
      value: (r) => r.active_days ?? 0, format: (v) => `${int(v)} dias`,
    },
  ];

  const list: CategoryWinner[] = defs.map((d) => {
    const { winners, valueLabel } = pickTop(rows, d.value, d.format, d.minFilter);
    return {
      key: d.key, label: d.label, icon: d.icon, description: d.description,
      valueLabel, winners: winners.map(asWinner),
      empty: winners.length === 0 ? (d.empty ?? "Sem dados no período.") : undefined,
    };
  });

  // Maior evolução — exige base comparativa no mês anterior.
  const prevMap = new Map(prevRows.map((r) => [r.vendedor_id, r.score]));
  const evoCandidates = rows
    .map((r) => {
      const prev = prevMap.get(r.vendedor_id) ?? 0;
      return { row: r, prev, delta: prev > 0 ? ((r.score - prev) / prev) * 100 : null };
    })
    .filter((c) => c.delta !== null && (c.delta as number) > 0);
  if (evoCandidates.length > 0) {
    const best = Math.max(...evoCandidates.map((c) => c.delta as number));
    const tied = evoCandidates.filter((c) => c.delta === best).map((c) => c.row).sort(compareRanked);
    list.push({
      key: "evolution", label: "Maior evolução", icon: "📈",
      description: "(pontuação atual − pontuação anterior) ÷ pontuação anterior × 100. Vendedores sem dados no mês anterior não concorrem.",
      valueLabel: `+${best.toFixed(1)}%`,
      winners: tied.slice(0, 3).map(asWinner),
    });
  } else {
    list.push({
      key: "evolution", label: "Maior evolução", icon: "📈",
      description: "(pontuação atual − pontuação anterior) ÷ pontuação anterior × 100.",
      valueLabel: "—", winners: [], empty: "Sem base comparativa no mês anterior.",
    });
  }
  return list;
}

/** Principal destaque individual do vendedor no mês. */
export function highlightOf(r: RankedRow): string {
  const parts: Array<[string, number]> = [
    [`${r.matriculas} matrícula${r.matriculas === 1 ? "" : "s"}`, r.matriculas * POINTS.enrollment],
    [`${r.entrevistas_realizadas ?? 0} entrevistas realizadas`, (r.entrevistas_realizadas ?? 0) * POINTS.interview_done],
    [`${r.entrevistas_marcadas} entrevistas marcadas`, r.entrevistas_marcadas * POINTS.interview],
    [`${r.interessados_gerados} interessados`, r.interessados_gerados * POINTS.interested],
    [`${r.ligacoes_atendidas} atendimentos`, r.ligacoes_atendidas * POINTS.answered],
    [`${r.ligacoes_feitas} ligações`, r.ligacoes_feitas * POINTS.call],
  ];
  const best = parts.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : "Sem atividade registrada";
}

// ───────────────────────── Fechamento mensal ─────────────────────────

export type HallRecord = {
  id: string;
  reference_month: number;
  reference_year: number;
  period_start: string;
  period_end: string;
  status: string;
  champion_user_id: string | null;
  runner_up_user_id: string | null;
  third_place_user_id: string | null;
  champion_points: number | null;
  runner_up_points: number | null;
  third_place_points: number | null;
  ranking_snapshot: RankedRow[];
  category_winners: CategoryWinner[];
  calculation_rules_snapshot: Record<string, unknown>;
  revision_history: Array<{ at: string; by: string | null; action: string; previous?: unknown; next?: unknown }>;
  closed_at: string | null;
  closed_by: string | null;
};

const hofTable = () => supabase.from("monthly_hall_of_fame" as never);
const achTable = () => supabase.from("user_achievements" as never);

export async function fetchHallRecord(year: number, month: number): Promise<HallRecord | null> {
  const { data, error } = await hofTable()
    .select("*")
    .eq("reference_year", year)
    .eq("reference_month", month)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as HallRecord | null;
}

export async function fetchHallHistory(): Promise<HallRecord[]> {
  const { data, error } = await hofTable()
    .select("*")
    .order("reference_year", { ascending: false })
    .order("reference_month", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as HallRecord[];
}

export async function fetchUserAchievements(): Promise<
  Array<{ id: string; user_id: string; achievement_type: string; title: string; reference_month: number; reference_year: number }>
> {
  const { data, error } = await achTable()
    .select("id,user_id,achievement_type,title,reference_month,reference_year")
    .order("reference_year", { ascending: false })
    .order("reference_month", { ascending: false });
  if (error) throw error;
  return (data ?? []) as never;
}

const PODIUM_ACHIEVEMENTS = [
  { type: "champion", emoji: "🏆", title: "Campeão" },
  { type: "runner_up", emoji: "🥈", title: "Vice-campeão" },
  { type: "third_place", emoji: "🥉", title: "3º lugar" },
];

const CATEGORY_EMOJI: Record<string, string> = {
  calls: "📞", answered: "✅", interested: "✨", interviews: "📅",
  interviews_done: "🎯", enrollments: "🎓", conversion: "🏹",
  consistency: "🔁", evolution: "📈",
};

async function saveAchievements(
  hofId: string,
  year: number,
  month: number,
  ranking: RankedRow[],
  categories: CategoryWinner[],
) {
  const period = `${MONTH_NAMES[month - 1]}/${year}`;
  const rows: Array<Record<string, unknown>> = [];
  ranking.slice(0, 3).forEach((r, i) => {
    const a = PODIUM_ACHIEVEMENTS[i];
    rows.push({
      user_id: r.vendedor_id, achievement_type: a.type,
      title: `${a.emoji} ${a.title} — ${period}`,
      reference_month: month, reference_year: year, hall_of_fame_id: hofId,
      metadata: { points: r.score, matriculas: r.matriculas, nome: r.nome },
    });
  });
  for (const c of categories) {
    for (const w of c.winners) {
      rows.push({
        user_id: w.vendedor_id, achievement_type: `category_${c.key}`,
        title: `${CATEGORY_EMOJI[c.key] ?? "⭐"} ${c.label} — ${period}`,
        reference_month: month, reference_year: year, hall_of_fame_id: hofId,
        metadata: { value: c.valueLabel, nome: w.nome },
      });
    }
  }
  if (rows.length === 0) return;
  await achTable().upsert(rows as never, {
    onConflict: "user_id,achievement_type,reference_year,reference_month",
    ignoreDuplicates: true,
  });
}

export const RULES_SNAPSHOT = { points: POINTS, legend: POINTS_LEGEND, tiebreakers: TIEBREAKERS, timezone: "America/Sao_Paulo" };

/** Fecha o mês (ou recalcula um mês reaberto). Nunca sobrescreve um fechamento existente. */
export async function closeMonth(args: {
  year: number;
  month: number;
  ranking: RankedRow[];
  categories: CategoryWinner[];
  userId: string | null;
  existing?: HallRecord | null;
}): Promise<HallRecord | null> {
  const { year, month, ranking, categories, userId, existing } = args;
  if (existing && existing.status === "closed") return existing;
  if (ranking.length === 0) return null;
  const { start, end } = monthRange(year, month);
  const excluded = Array.from(await fetchExcludedIds());
  const payload = {
    reference_month: month,
    reference_year: year,
    period_start: start,
    period_end: end,
    status: "closed",
    champion_user_id: ranking[0]?.vendedor_id ?? null,
    runner_up_user_id: ranking[1]?.vendedor_id ?? null,
    third_place_user_id: ranking[2]?.vendedor_id ?? null,
    champion_points: ranking[0]?.score ?? null,
    runner_up_points: ranking[1]?.score ?? null,
    third_place_points: ranking[2]?.score ?? null,
    ranking_snapshot: ranking,
    category_winners: categories,
    calculation_rules_snapshot: {
      ...RULES_SNAPSHOT,
      // Snapshot imutável: quem estava fora do Hall da Fama no momento do fechamento.
      excluded_user_ids: excluded,
      titles_version: "public-v1",
    },

    closed_at: new Date().toISOString(),
    closed_by: userId,
  };

  if (existing) {
    const history = [
      ...(existing.revision_history ?? []),
      {
        at: new Date().toISOString(),
        by: userId,
        action: "recalculo",
        previous: { ranking: existing.ranking_snapshot, categories: existing.category_winners },
        next: { ranking, categories },
      },
    ];
    const { data, error } = await hofTable()
      .update({ ...payload, revision_history: history } as never)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    await saveAchievements(existing.id, year, month, ranking, categories);
    return data as unknown as HallRecord;
  }

  const { data, error } = await hofTable()
    .upsert(payload as never, { onConflict: "reference_year,reference_month", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  const rec = (data as unknown as HallRecord) ?? (await fetchHallRecord(year, month));
  if (rec) await saveAchievements(rec.id, year, month, ranking, categories);
  return rec;
}

/** Reabre um fechamento para permitir recálculo (somente admin, via RLS). */
export async function reopenMonth(id: string, userId: string | null, existing: HallRecord) {
  const history = [
    ...(existing.revision_history ?? []),
    { at: new Date().toISOString(), by: userId, action: "reabertura", previous: { status: existing.status } },
  ];
  const { error } = await hofTable()
    .update({ status: "reopened", revision_history: history } as never)
    .eq("id", id);
  if (error) throw error;
}
