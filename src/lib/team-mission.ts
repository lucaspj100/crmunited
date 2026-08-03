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
};

export const DEFAULT_MISSION_SETTINGS: MissionSettings = {
  interested_to_enrollment_rate: 0.1,
  done_to_enrollment_rate_min: 0.3,
  done_to_enrollment_rate_max: 0.5,
  min_sample_interested: 30,
  min_sample_done: 10,
};

export function useMissionSettings() {
  return useQuery({
    queryKey: ["team_mission_settings"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MissionSettings> => {
      const { data, error } = await supabase
        .from("team_mission_settings")
        .select(
          "interested_to_enrollment_rate,done_to_enrollment_rate_min,done_to_enrollment_rate_max,min_sample_interested,min_sample_done",
        )
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_MISSION_SETTINGS;
      return {
        interested_to_enrollment_rate: Number(data.interested_to_enrollment_rate),
        done_to_enrollment_rate_min: Number(data.done_to_enrollment_rate_min),
        done_to_enrollment_rate_max: Number(data.done_to_enrollment_rate_max),
        min_sample_interested: Number(data.min_sample_interested),
        min_sample_done: Number(data.min_sample_done),
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
  if (s.min_sample_interested < 0 || s.min_sample_done < 0) {
    return "As amostras mínimas não podem ser negativas.";
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
