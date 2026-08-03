import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProductivity, localIso, type ProductivityRow } from "@/lib/productivity";
import { isRealSeller } from "@/lib/scoring";

/** Configurações operacionais de referência do funil (tabela de registro único). */
export type MissionSettings = {
  interested_to_enrollment_rate: number;
  done_to_enrollment_rate_min: number;
  done_to_enrollment_rate_max: number;
  min_sample_interested: number;
  min_sample_done: number;
  min_sample_enrollments: number;
  day_close_hour: number;
};

export const DEFAULT_MISSION_SETTINGS: MissionSettings = {
  interested_to_enrollment_rate: 0.1,
  done_to_enrollment_rate_min: 0.3,
  done_to_enrollment_rate_max: 0.5,
  min_sample_interested: 30,
  min_sample_done: 10,
  min_sample_enrollments: 3,
  day_close_hour: 21,
};

export function useMissionSettings() {
  return useQuery({
    queryKey: ["team_mission_settings"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MissionSettings> => {
      const { data, error } = await supabase
        .from("team_mission_settings")
        .select(
          "interested_to_enrollment_rate,done_to_enrollment_rate_min,done_to_enrollment_rate_max,min_sample_interested,min_sample_done,min_sample_enrollments,day_close_hour",
        )
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_MISSION_SETTINGS;
      const d = data as Record<string, unknown>;
      return {
        interested_to_enrollment_rate: Number(d.interested_to_enrollment_rate),
        done_to_enrollment_rate_min: Number(d.done_to_enrollment_rate_min),
        done_to_enrollment_rate_max: Number(d.done_to_enrollment_rate_max),
        min_sample_interested: Number(d.min_sample_interested),
        min_sample_done: Number(d.min_sample_done),
        min_sample_enrollments: Number(d.min_sample_enrollments ?? 3),
        day_close_hour: Number(d.day_close_hour ?? 21),
      };
    },
  });
}

export async function saveMissionSettings(s: MissionSettings): Promise<void> {
  const { error } = await supabase
    .from("team_mission_settings")
    .update({
      interested_to_enrollment_rate: s.interested_to_enrollment_rate,
      done_to_enrollment_rate_min: s.done_to_enrollment_rate_min,
      done_to_enrollment_rate_max: s.done_to_enrollment_rate_max,
      min_sample_interested: s.min_sample_interested,
      min_sample_done: s.min_sample_done,
      min_sample_enrollments: s.min_sample_enrollments,
      day_close_hour: s.day_close_hour,
    } as never)
    .eq("id", true);
  if (error) throw error;
}

export function validateMissionSettings(s: MissionSettings): string | null {
  const rates = [
    s.interested_to_enrollment_rate,
    s.done_to_enrollment_rate_min,
    s.done_to_enrollment_rate_max,
  ];
  if (rates.some((r) => !Number.isFinite(r) || r <= 0 || r > 1)) {
    return "As taxas devem ser maiores que 0% e menores ou iguais a 100%.";
  }
  if (s.done_to_enrollment_rate_min > s.done_to_enrollment_rate_max) {
    return "A taxa mínima de realizadas deve ser menor ou igual à máxima.";
  }
  if (s.min_sample_interested < 0 || s.min_sample_done < 0 || s.min_sample_enrollments < 0) {
    return "As amostras mínimas não podem ser negativas.";
  }
  if (!Number.isInteger(s.day_close_hour) || s.day_close_hour < 0 || s.day_close_hour > 23) {
    return "O horário de fechamento deve ser uma hora entre 0 e 23.";
  }
  return null;
}


/** Resumo agregado da meta coletiva (não expõe metas individuais). */
export type GoalSummary = {
  month: number;
  year: number;
  total_target: number;
  sellers_with_goal: number;
  sellers_total: number;
  sellers_without_goal: number;
};

export function useTeamGoalSummary(month: number, year: number, teamId: string | null) {
  return useQuery({
    queryKey: ["team_goal_summary", month, year, teamId ?? "all"],
    staleTime: 60_000,
    queryFn: async (): Promise<GoalSummary> => {
      const { data, error } = await supabase.rpc("team_enrollment_goal_summary" as never, {
        _month: month,
        _year: year,
        _team_id: teamId,
      } as never);
      if (error) throw error;
      const d = (data ?? {}) as Partial<GoalSummary>;
      return {
        month,
        year,
        total_target: Number(d.total_target ?? 0),
        sellers_with_goal: Number(d.sellers_with_goal ?? 0),
        sellers_total: Number(d.sellers_total ?? 0),
        sellers_without_goal: Number(d.sellers_without_goal ?? 0),
      };
    },
  });
}

export type MissionTotals = { interessados: number; realizadas: number; matriculas: number };

export function sumMissionTotals(rows: ProductivityRow[]): MissionTotals {
  const seen = new Set<string>();
  return rows.reduce<MissionTotals>(
    (acc, r) => {
      if (!isRealSeller(r.nome) || seen.has(r.vendedor_id)) return acc;
      seen.add(r.vendedor_id);
      return {
        interessados: acc.interessados + (r.interessados_gerados ?? 0),
        realizadas: acc.realizadas + (r.entrevistas_realizadas ?? 0),
        matriculas: acc.matriculas + (r.matriculas ?? 0),
      };
    },
    { interessados: 0, realizadas: 0, matriculas: 0 },
  );
}

/** Produção mensal (mês de referência) usada pelo card Missão da equipe. */
export function useMissionMonthProduction(month: number, year: number, teamId: string | null) {
  const r = missionMonthRange(month, year);
  return useQuery({
    queryKey: ["mission_month_production", r.start, r.end, teamId ?? "all"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MissionTotals> => {
      const rows = await fetchProductivity({ start: r.start, end: r.end, vendedorId: null, teamId });
      return sumMissionTotals(rows);
    },
  });
}

/** Mês de referência derivado do intervalo exibido no placar (usa a data final). */
export function referenceMonthOf(range: { start: string; end: string }): { month: number; year: number } {
  const [y, m] = range.end.split("-").map((n) => parseInt(n, 10));
  return { month: m || new Date().getMonth() + 1, year: y || new Date().getFullYear() };
}

/** Mês completo (dia 1 ao último dia) — a meta coletiva é sempre mensal. */
export function missionMonthRange(month: number, year: number): { start: string; end: string } {
  return {
    start: localIso(new Date(year, month - 1, 1)),
    end: localIso(new Date(year, month, 0)),
  };
}

export function isMonthClosed(month: number, year: number, ref: Date = new Date()): boolean {
  const lastDay = new Date(year, month, 0);
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return lastDay < today;
}

/** Marcos progressivos (12,5% · 25% · 50% · 75% · 100%), arredondados e sem duplicidade. */
export function buildMilestones(total: number): number[] {
  if (total <= 0) return [];
  const raw = [0.125, 0.25, 0.5, 0.75, 1].map((f) => Math.round(total * f));
  const out: number[] = [];
  for (const v of raw) {
    const value = Math.min(total, Math.max(1, v));
    if (!out.includes(value)) out.push(value);
  }
  if (!out.includes(total)) out.push(total);
  return out.sort((a, b) => a - b);
}

export type MissionStage = {
  milestones: number[];
  stageIndex: number;
  stageStart: number;
  stageTarget: number;
  doneInStage: number;
  stageSize: number;
  remainingInStage: number;
  stagePct: number;
  completedStages: number;
  finalReached: boolean;
};

export function computeStage(done: number, total: number): MissionStage | null {
  const milestones = buildMilestones(total);
  if (milestones.length === 0) return null;
  const idx = milestones.findIndex((m) => done < m);
  const finalReached = idx === -1;
  const stageIndex = finalReached ? milestones.length - 1 : idx;
  const stageTarget = milestones[stageIndex]!;
  const stageStart = stageIndex === 0 ? 0 : milestones[stageIndex - 1]!;
  const stageSize = Math.max(1, stageTarget - stageStart);
  const doneInStage = Math.max(0, Math.min(stageSize, done - stageStart));
  return {
    milestones,
    stageIndex,
    stageStart,
    stageTarget,
    doneInStage,
    stageSize,
    remainingInStage: finalReached ? 0 : Math.max(0, stageTarget - done),
    stagePct: finalReached ? 100 : (doneInStage / stageSize) * 100,
    completedStages: milestones.filter((m) => done >= m).length,
    finalReached,
  };
}

/** Estimativa de funil para concluir a etapa atual. */
export function stagePath(remaining: number, s: MissionSettings) {
  if (remaining <= 0) return null;
  return {
    interested: Math.ceil(remaining / s.interested_to_enrollment_rate),
    doneMin: Math.ceil(remaining / s.done_to_enrollment_rate_max),
    doneMax: Math.ceil(remaining / s.done_to_enrollment_rate_min),
    enrollments: remaining,
  };
}

export type ConversionEval = {
  value: number | null;
  pctLabel: string;
  enoughSample: boolean;
  message: string;
};

function safeRate(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return numerator / denominator;
}

export function evalInterestedConversion(
  enrollments: number,
  interested: number,
  s: MissionSettings,
): ConversionEval {
  const rate = safeRate(enrollments, interested);
  const pct = rate === null ? null : rate * 100;
  const enough = interested >= s.min_sample_interested;
  let message = "Amostra ainda pequena para avaliar a conversão.";
  if (pct !== null && enough) {
    if (pct > 10) message = "🔥 Conversão acima da referência";
    else if (pct >= 9) message = "✅ Conversão dentro da referência";
    else if (pct >= 7) message = "🎯 Atenção ao avanço do funil";
    else message = "Precisamos revisar qualificação e acompanhamento";
  }
  return {
    value: pct,
    pctLabel: pct === null ? "—" : `${pct.toFixed(1).replace(".", ",")}%`,
    enoughSample: enough,
    message,
  };
}

export function evalDoneConversion(
  enrollments: number,
  done: number,
  s: MissionSettings,
): ConversionEval {
  const rate = safeRate(enrollments, done);
  const pct = rate === null ? null : rate * 100;
  const enough = done >= s.min_sample_done;
  let message = "Amostra ainda pequena para avaliar a conversão.";
  if (pct !== null && enough) {
    if (pct > 50) message = "🔥 Excelente aproveitamento";
    else if (pct >= 30) message = "✅ Faixa saudável";
    else if (pct >= 20) message = "🎯 Atenção ao fechamento";
    else message = "Precisamos revisar entrevista e negociação";
  }
  return {
    value: pct,
    pctLabel: pct === null ? "—" : `${pct.toFixed(1).replace(".", ",")}%`,
    enoughSample: enough,
    message,
  };
}

export type MissionPace = {
  expectedToday: number;
  ratio: number | null;
  message: string;
  daysElapsed: number;
  daysInMonth: number;
  projection: number | null;
  diff: number | null;
};

export function computeMissionPace(
  done: number,
  total: number,
  month: number,
  year: number,
  ref: Date = new Date(),
): MissionPace {
  const daysInMonth = new Date(year, month, 0).getDate();
  const closed = isMonthClosed(month, year, ref);
  const isCurrent = ref.getFullYear() === year && ref.getMonth() + 1 === month;
  const daysElapsed = closed ? daysInMonth : isCurrent ? Math.max(1, ref.getDate()) : 0;
  const expectedToday = total > 0 ? (total * daysElapsed) / daysInMonth : 0;
  const ratio = expectedToday > 0 ? (done / expectedToday) * 100 : null;
  let message = "Vamos abrir o mês com a primeira matrícula!";
  if (ratio !== null) {
    if (ratio > 105) message = "🔥 Acima do ritmo";
    else if (ratio >= 90) message = "✅ No ritmo";
    else if (ratio >= 75) message = "🎯 Próxima matrícula aproxima a equipe do ritmo";
    else message = "Precisamos aumentar o avanço do funil";
  }
  const projection = closed || daysElapsed <= 0 ? null : Math.round((done / daysElapsed) * daysInMonth);
  return {
    expectedToday,
    ratio,
    message,
    daysElapsed,
    daysInMonth,
    projection,
    diff: projection === null ? null : projection - total,
  };
}

/** Mensagem motivacional da etapa atual. */
export function stageMessage(stage: MissionStage, done: number, total: number): string {
  if (total > 0 && done > total) return "🔥 Meta coletiva superada!";
  if (total > 0 && done >= total) return "🏆 Meta coletiva batida!";
  if (done <= 0) return "Vamos buscar a primeira matrícula da equipe!";
  const pct = stage.stagePct;
  if (pct <= 0) return "Cada matrícula aproxima a equipe do próximo marco.";
  if (pct < 40) return "Cada matrícula aproxima a equipe do próximo marco.";
  if (pct < 70) return "Estamos avançando. Bora fechar esta etapa!";
  if (pct < 100) return "Quase lá! Falta pouco para desbloquear a próxima etapa.";
  return "✅ Etapa concluída!";
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

/* ==========================================================================
 * Calendário comercial (segunda a sábado) e metas semanais
 * ========================================================================== */

/** Dia comercial = segunda a sábado (domingo fora da agenda operacional). */
export function isBusinessDay(d: Date): boolean {
  const dow = d.getDay();
  return dow >= 1 && dow <= 6;
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function plusDays(d: Date, n: number): Date {
  const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  nd.setDate(nd.getDate() + n);
  return nd;
}

/** Quantidade de dias comerciais no intervalo (inclusive). */
export function businessDaysBetween(startIso: string, endIso: string): number {
  let cur = parseIso(startIso);
  const end = parseIso(endIso);
  let count = 0;
  while (cur <= end) {
    if (isBusinessDay(cur)) count++;
    cur = plusDays(cur, 1);
  }
  return count;
}

export type MissionWeek = {
  index: number;
  start: string;
  end: string;
  businessDays: number;
  target: number;
};

/** Semanas comerciais do mês: segunda a sábado, recortadas pelos limites do mês. */
export function monthBusinessWeeks(month: number, year: number): MissionWeek[] {
  const last = new Date(year, month, 0).getDate();
  const groups = new Map<string, { start: string; end: string; businessDays: number }>();
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month - 1, day);
    if (!isBusinessDay(d)) continue; // domingo fora da agenda comercial
    const monday = plusDays(d, 1 - d.getDay());
    const key = localIso(monday);
    const iso = localIso(d);
    const g = groups.get(key);
    if (g) {
      g.end = iso;
      g.businessDays += 1;
    } else {
      groups.set(key, { start: iso, end: iso, businessDays: 1 });
    }
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, g], index) => ({ index, start: g.start, end: g.end, businessDays: g.businessDays, target: 0 }));
}

/**
 * Distribui a meta mensal entre as semanas proporcionalmente aos dias comerciais,
 * usando maiores restos para que a soma seja exatamente a meta mensal.
 */
export function distributeWeeklyGoals(total: number, weeks: MissionWeek[]): MissionWeek[] {
  const totalDays = weeks.reduce((a, w) => a + w.businessDays, 0);
  if (total <= 0 || totalDays <= 0) return weeks.map((w) => ({ ...w, target: 0 }));
  const raw = weeks.map((w) => (total * w.businessDays) / totalDays);
  const floors = raw.map((r) => Math.floor(r));
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const targets = [...floors];
  let k = 0;
  while (rest > 0 && order.length > 0) {
    targets[order[k % order.length]!.i]! += 1;
    rest--;
    k++;
  }
  return weeks.map((w, i) => ({ ...w, target: targets[i]! }));
}

/** Semana comercial que contém a data de referência (ou a última do mês). */
export function currentWeekOf(weeks: MissionWeek[], ref: Date = new Date()): MissionWeek | null {
  if (weeks.length === 0) return null;
  const iso = localIso(ref);
  const found = weeks.find((w) => iso >= w.start && iso <= w.end);
  if (found) return found;
  if (iso < weeks[0]!.start) return weeks[0]!;
  return weeks[weeks.length - 1]!;
}

export type WeekProgress = {
  week: MissionWeek;
  done: number;
  target: number;
  pct: number;
  remaining: number;
  businessDaysTotal: number;
  businessDaysElapsed: number;
  businessDaysLeft: number;
  expectedSoFar: number;
  paceGap: number;
  isCurrent: boolean;
};

export function computeWeekProgress(
  week: MissionWeek,
  done: number,
  ref: Date = new Date(),
): WeekProgress {
  const today = localIso(ref);
  const isCurrent = today >= week.start && today <= week.end;
  const finished = today > week.end;
  const elapsedEnd = finished ? week.end : isCurrent ? today : week.start;
  const businessDaysElapsed = finished
    ? week.businessDays
    : isCurrent
      ? businessDaysBetween(week.start, elapsedEnd)
      : 0;
  const target = week.target;
  const expectedSoFar = target > 0 && week.businessDays > 0 ? (target * businessDaysElapsed) / week.businessDays : 0;
  return {
    week,
    done,
    target,
    pct: target > 0 ? (done / target) * 100 : 0,
    remaining: Math.max(0, target - done),
    businessDaysTotal: week.businessDays,
    businessDaysElapsed,
    businessDaysLeft: Math.max(0, week.businessDays - businessDaysElapsed),
    expectedSoFar,
    paceGap: Math.max(0, Math.round(expectedSoFar) - done),
    isCurrent,
  };
}

/** Mensagem motivacional da meta semanal. */
export function weekMessage(p: WeekProgress): string {
  if (p.target <= 0) return "Meta semanal ainda não definida.";
  if (p.done <= 0) return "Vamos buscar a primeira matrícula da semana!";
  if (p.pct > 100) return "🔥 Meta da semana superada!";
  if (p.pct >= 100) return "✅ Meta da semana batida!";
  if (p.pct >= 70) return "Quase lá! Falta pouco para concluir a meta da semana.";
  if (p.pct >= 40) return "Estamos avançando. Bora acelerar esta semana!";
  return "A semana começou. Cada matrícula aproxima a equipe da meta.";
}

/** Mensagem do ritmo semanal, sempre proporcional e sem tom punitivo. */
export function weekPaceMessage(p: WeekProgress): string {
  if (p.target <= 0) return "Meta semanal ainda não definida.";
  const expected = Math.round(p.expectedSoFar);
  if (expected <= 0) return "A semana está começando — cada matrícula já conta.";
  if (p.done > expected) return "🔥 A equipe está acima do ritmo da semana.";
  if (p.done === expected) return "✅ A equipe está no ritmo da semana.";
  const gap = expected - p.done;
  if (gap <= Math.max(2, Math.ceil(expected * 0.3)))
    return `🎯 Faltam ${gap} matrícula${gap === 1 ? "" : "s"} para alcançar o ritmo da semana.`;
  return "Vamos concentrar esforços em interessados e entrevistas nesta semana.";
}

/* ==========================================================================
 * Estado do período (parcial x encerrado) com horário comercial de fechamento
 * ========================================================================== */

/** Hora atual no fuso da operação (America/Sao_Paulo). */
export function saoPauloHour(ref: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(ref);
  return parseInt(h, 10);
}

/** Data de hoje (YYYY-MM-DD) no fuso da operação. */
export function saoPauloIso(ref: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ref);
  return parts;
}

export type PeriodState = {
  closed: boolean;
  partial: boolean;
  /** Dia em andamento (período termina hoje e ainda não passou o fechamento). */
  dayInProgress: boolean;
  label: string;
};

export function evaluatePeriodState(
  range: { start: string; end: string },
  settings: MissionSettings,
  opts: { checkoutDone?: boolean } = {},
  ref: Date = new Date(),
): PeriodState {
  const today = saoPauloIso(ref);
  if (range.end < today) {
    return { closed: true, partial: false, dayInProgress: false, label: "Período encerrado" };
  }
  const endsToday = range.end === today;
  const afterClose = saoPauloHour(ref) >= settings.day_close_hour;
  const dayClosed = afterClose || opts.checkoutDone === true;
  if (endsToday && dayClosed) {
    return { closed: true, partial: false, dayInProgress: false, label: "Dia encerrado" };
  }
  return {
    closed: false,
    partial: true,
    dayInProgress: endsToday,
    label: endsToday ? "Dia em andamento" : "Dados parciais até agora",
  };
}

/* ==========================================================================
 * Conversões com amostra e contexto de período
 * ========================================================================== */

export type ConversionReading = {
  pctLabel: string;
  raw: string;
  reference: string;
  note: string;
  verdict: string | null;
};

function pctLabelOf(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export function readInterestedConversion(
  enrollments: number,
  interested: number,
  s: MissionSettings,
  state: PeriodState,
): ConversionReading {
  const pct = interested > 0 ? (enrollments / interested) * 100 : null;
  const enoughSample = interested >= s.min_sample_interested && enrollments >= s.min_sample_enrollments;
  let verdict: string | null = null;
  if (state.closed && enoughSample && pct !== null) {
    if (pct > 10) verdict = "🔥 Conversão acima da referência.";
    else if (pct >= 9) verdict = "✅ Conversão dentro da referência.";
    else if (pct >= 7) verdict = "🎯 Atenção ao avanço dos interessados.";
    else verdict = "Vale revisar qualificação e acompanhamento.";
  }
  const note = !state.closed
    ? state.dayInProgress
      ? "Dia em andamento. A conversão ainda pode mudar."
      : "Dados parciais até agora."
    : enoughSample
      ? ""
      : "Amostra ainda pequena para avaliar a conversão.";
  return {
    pctLabel: pctLabelOf(pct),
    raw: `${fmtInt(enrollments)} matrícula${enrollments === 1 ? "" : "s"} em ${fmtInt(interested)} interessados`,
    reference: `Referência: ${(s.interested_to_enrollment_rate * 100).toFixed(0)}%`,
    note,
    verdict,
  };
}

export function readDoneConversion(
  enrollments: number,
  done: number,
  s: MissionSettings,
  state: PeriodState,
): ConversionReading {
  const pct = done > 0 ? (enrollments / done) * 100 : null;
  const enoughSample = done >= s.min_sample_done && enrollments >= s.min_sample_enrollments;
  let verdict: string | null = null;
  if (state.closed && enoughSample && pct !== null) {
    if (pct > 50) verdict = "🔥 Excelente aproveitamento.";
    else if (pct >= 30) verdict = "✅ Conversão dentro da faixa saudável.";
    else if (pct >= 20) verdict = "🎯 Atenção ao fechamento.";
    else verdict = "Vale revisar entrevista e negociação.";
  }
  const note = !state.closed
    ? state.dayInProgress
      ? "Dia em andamento. A conversão ainda pode mudar."
      : "Dados parciais até agora."
    : enoughSample
      ? ""
      : "Amostra ainda pequena para avaliar a conversão.";
  return {
    pctLabel: pctLabelOf(pct),
    raw: `${fmtInt(enrollments)} matrícula${enrollments === 1 ? "" : "s"} em ${fmtInt(done)} realizadas`,
    reference: `Referência: ${(s.done_to_enrollment_rate_min * 100).toFixed(0)}% a ${(s.done_to_enrollment_rate_max * 100).toFixed(0)}%`,
    note,
    verdict,
  };
}

/** Caminho operacional para o restante da meta da semana. */
export function weekPath(remaining: number, s: MissionSettings) {
  if (remaining <= 0) return null;
  return {
    interested: Math.ceil(remaining / s.interested_to_enrollment_rate),
    doneMin: Math.ceil(remaining / s.done_to_enrollment_rate_max),
    doneMax: Math.ceil(remaining / s.done_to_enrollment_rate_min),
    enrollments: remaining,
  };
}

/** Projeção mensal estável: ignora o dia parcial em andamento. */
export type MonthProjection = {
  stable: boolean;
  value: number | null;
  note: string;
};

export function computeMonthProjection(
  doneMonth: number,
  doneToday: number,
  total: number,
  month: number,
  year: number,
  state: PeriodState,
  ref: Date = new Date(),
): MonthProjection {
  const daysInMonth = new Date(year, month, 0).getDate();
  const closed = isMonthClosed(month, year, ref);
  if (closed) return { stable: false, value: null, note: "Mês encerrado — resultado final consolidado." };
  const isCurrent = ref.getFullYear() === year && ref.getMonth() + 1 === month;
  if (!isCurrent) return { stable: false, value: null, note: "" };

  const excludeToday = state.dayInProgress && !state.closed;
  const baseDone = excludeToday ? Math.max(0, doneMonth - doneToday) : doneMonth;
  const monthStart = localIso(new Date(year, month - 1, 1));
  const lastConsideredDay = excludeToday
    ? localIso(new Date(ref.getFullYear(), ref.getMonth(), Math.max(1, ref.getDate() - 1)))
    : localIso(ref);
  const elapsedBusiness = businessDaysBetween(monthStart, lastConsideredDay);
  const totalBusiness = businessDaysBetween(monthStart, localIso(new Date(year, month, 0)));

  if (elapsedBusiness < 5 || baseDone < 3) {
    return { stable: false, value: null, note: "Projeção ainda instável." };
  }
  const value = Math.round((baseDone / elapsedBusiness) * totalBusiness);
  return {
    stable: true,
    value,
    note: excludeToday ? "O resultado de hoje ainda é parcial." : `Meta final: ${fmtInt(total)} matrículas`,
  };
}

/** Ritmo do mês em blocos simples (esperado, realizado, diferença). */
export type MonthPaceBlocks = {
  expected: number;
  done: number;
  diff: number;
  above: boolean;
  message: string;
};

export function computeMonthPaceBlocks(
  done: number,
  total: number,
  month: number,
  year: number,
  ref: Date = new Date(),
): MonthPaceBlocks {
  const monthStart = localIso(new Date(year, month - 1, 1));
  const monthEnd = localIso(new Date(year, month, 0));
  const closed = isMonthClosed(month, year, ref);
  const isCurrent = ref.getFullYear() === year && ref.getMonth() + 1 === month;
  const totalBusiness = businessDaysBetween(monthStart, monthEnd);
  const elapsed = closed ? totalBusiness : isCurrent ? businessDaysBetween(monthStart, localIso(ref)) : 0;
  const expected = total > 0 && totalBusiness > 0 ? Math.round((total * elapsed) / totalBusiness) : 0;
  const diff = done - expected;
  return {
    expected,
    done,
    diff,
    above: diff >= 0,
    message:
      diff >= 0
        ? "A equipe está no ritmo do mês."
        : `${fmtInt(Math.abs(diff))} matrícula${Math.abs(diff) === 1 ? "" : "s"} abaixo do ritmo`,
  };
}

/** Produção da equipe em um intervalo livre (usa a mesma fonte do placar). */
export function useMissionRangeProduction(
  range: { start: string; end: string },
  teamId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["mission_range_production", range.start, range.end, teamId ?? "all"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MissionTotals> => {
      const rows = await fetchProductivity({
        start: range.start,
        end: range.end,
        vendedorId: null,
        teamId,
      });
      return sumMissionTotals(rows);
    },
  });
}
