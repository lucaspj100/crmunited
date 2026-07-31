import { supabase } from "@/integrations/supabase/client";
import { scoreOf } from "@/lib/scoring";
import { isRealSeller } from "@/lib/scoring";
import type { ProductivityRow } from "@/lib/productivity";

export type FeedbackTone = "direto" | "equilibrado" | "motivador";

export const TONE_LABEL: Record<FeedbackTone, string> = {
  direto: "Direto",
  equilibrado: "Equilibrado",
  motivador: "Mais motivador",
};

export const TONE_HINT: Record<FeedbackTone, string> = {
  direto: "Objetivo e firme, sem ser agressivo.",
  equilibrado: "Reconhece o positivo, mostra o principal ponto de melhoria e orienta o próximo passo.",
  motivador: "Valoriza a evolução e apresenta a melhoria como oportunidade de crescimento.",
};

export type MetricSnapshot = {
  entrevistas_marcadas: number;
  entrevistas_realizadas: number;
  matriculas: number;
  perdidos: number;
  ligacoes_feitas: number;
  ligacoes_atendidas: number;
  interessados_gerados: number;
  leads_trabalhados: number;
  taxa_comparecimento: number | null;
  taxa_conversao_realizadas: number | null;
  pontuacao: number;
};

export type FeedbackMetrics = {
  period: { start: string; end: string; label: string };
  previousPeriod: { start: string; end: string };
  seller: { id: string; nome: string; email: string; avatar_url: string | null; cargo: string };
  current: MetricSnapshot;
  previous: MetricSnapshot;
  teamAverage: MetricSnapshot;
  ranking: { position: number | null; total: number };
  goals: { matriculas: number | null; entrevistas: number | null; ligacoes: number | null };
  hasData: boolean;
};

const EMPTY_ROW: Pick<
  ProductivityRow,
  | "entrevistas_marcadas"
  | "entrevistas_realizadas"
  | "matriculas"
  | "perdidos"
  | "ligacoes_feitas"
  | "ligacoes_atendidas"
  | "interessados_gerados"
  | "leads_trabalhados"
  | "leads_novos_atribuidos"
  | "whatsapps_checkout"
  | "linkedins_checkout"
> = {
  entrevistas_marcadas: 0,
  entrevistas_realizadas: 0,
  matriculas: 0,
  perdidos: 0,
  ligacoes_feitas: 0,
  ligacoes_atendidas: 0,
  interessados_gerados: 0,
  leads_trabalhados: 0,
  leads_novos_atribuidos: 0,
  whatsapps_checkout: 0,
  linkedins_checkout: 0,
};

function safeRate(num: number, den: number): number | null {
  if (!den) return null;
  return (num / den) * 100;
}

export function toSnapshot(row: Partial<ProductivityRow> | null): MetricSnapshot {
  const r = { ...EMPTY_ROW, ...(row ?? {}) } as ProductivityRow;
  return {
    entrevistas_marcadas: r.entrevistas_marcadas ?? 0,
    entrevistas_realizadas: r.entrevistas_realizadas ?? 0,
    matriculas: r.matriculas ?? 0,
    perdidos: r.perdidos ?? 0,
    ligacoes_feitas: r.ligacoes_feitas ?? 0,
    ligacoes_atendidas: r.ligacoes_atendidas ?? 0,
    interessados_gerados: r.interessados_gerados ?? 0,
    leads_trabalhados: r.leads_trabalhados ?? 0,
    taxa_comparecimento: safeRate(r.entrevistas_realizadas ?? 0, r.entrevistas_marcadas ?? 0),
    taxa_conversao_realizadas: safeRate(r.matriculas ?? 0, r.entrevistas_realizadas ?? 0),
    pontuacao: scoreOf(r),
  };
}

function averageSnapshot(rows: ProductivityRow[]): MetricSnapshot {
  const n = rows.length || 1;
  const sum = rows.reduce(
    (acc, r) => {
      acc.entrevistas_marcadas += r.entrevistas_marcadas ?? 0;
      acc.entrevistas_realizadas += r.entrevistas_realizadas ?? 0;
      acc.matriculas += r.matriculas ?? 0;
      acc.perdidos += r.perdidos ?? 0;
      acc.ligacoes_feitas += r.ligacoes_feitas ?? 0;
      acc.ligacoes_atendidas += r.ligacoes_atendidas ?? 0;
      acc.interessados_gerados += r.interessados_gerados ?? 0;
      acc.leads_trabalhados += r.leads_trabalhados ?? 0;
      acc.pontuacao += scoreOf(r);
      return acc;
    },
    {
      entrevistas_marcadas: 0,
      entrevistas_realizadas: 0,
      matriculas: 0,
      perdidos: 0,
      ligacoes_feitas: 0,
      ligacoes_atendidas: 0,
      interessados_gerados: 0,
      leads_trabalhados: 0,
      pontuacao: 0,
    },
  );
  return {
    entrevistas_marcadas: sum.entrevistas_marcadas / n,
    entrevistas_realizadas: sum.entrevistas_realizadas / n,
    matriculas: sum.matriculas / n,
    perdidos: sum.perdidos / n,
    ligacoes_feitas: sum.ligacoes_feitas / n,
    ligacoes_atendidas: sum.ligacoes_atendidas / n,
    interessados_gerados: sum.interessados_gerados / n,
    leads_trabalhados: sum.leads_trabalhados / n,
    taxa_comparecimento: safeRate(sum.entrevistas_realizadas, sum.entrevistas_marcadas),
    taxa_conversao_realizadas: safeRate(sum.matriculas, sum.entrevistas_realizadas),
    pontuacao: sum.pontuacao / n,
  };
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

export async function buildFeedbackMetrics(args: {
  sellerId: string;
  cargo: string;
  current: { start: string; end: string };
  previous: { start: string; end: string };
  label: string;
}): Promise<FeedbackMetrics> {
  const { fetchProductivity } = await import("@/lib/productivity");
  const [curRows, prevRows, goalsRes] = await Promise.all([
    fetchProductivity({ start: args.current.start, end: args.current.end }),
    fetchProductivity({ start: args.previous.start, end: args.previous.end }),
    supabase.from("team_goals").select("daily_calls_goal, daily_interviews_goal, daily_enrollments_goal").limit(1),
  ]);

  const teamRows = curRows.filter((r) => isRealSeller(r.nome));
  const mine = curRows.find((r) => r.vendedor_id === args.sellerId) ?? null;
  const minePrev = prevRows.find((r) => r.vendedor_id === args.sellerId) ?? null;

  const ranked = [...teamRows].sort((a, b) => scoreOf(b) - scoreOf(a));
  const idx = ranked.findIndex((r) => r.vendedor_id === args.sellerId);

  const days = daysBetween(args.current.start, args.current.end);
  const g = (goalsRes.data ?? [])[0] ?? null;

  const current = toSnapshot(mine);
  return {
    period: { ...args.current, label: args.label },
    previousPeriod: args.previous,
    seller: {
      id: args.sellerId,
      nome: mine?.nome ?? "",
      email: mine?.email ?? "",
      avatar_url: mine?.avatar_url ?? null,
      cargo: args.cargo,
    },
    current,
    previous: toSnapshot(minePrev),
    teamAverage: averageSnapshot(teamRows),
    ranking: { position: idx >= 0 ? idx + 1 : null, total: ranked.length },
    goals: {
      matriculas: g ? g.daily_enrollments_goal * days : null,
      entrevistas: g ? g.daily_interviews_goal * days : null,
      ligacoes: g ? g.daily_calls_goal * days : null,
    },
    hasData:
      current.entrevistas_marcadas +
        current.entrevistas_realizadas +
        current.matriculas +
        current.ligacoes_feitas +
        current.leads_trabalhados >
      0,
  };
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export type Trend = "up" | "down" | "flat";

export function trendOf(value: number | null, previous: number | null): Trend {
  if (value === null || previous === null) return "flat";
  const diff = value - previous;
  if (Math.abs(diff) < 0.05) return "flat";
  return diff > 0 ? "up" : "down";
}

export const TREND_LABEL: Record<Trend, string> = { up: "aumentou", down: "diminuiu", flat: "manteve" };

export function vsAverage(value: number | null, average: number | null): "acima" | "abaixo" | "media" | null {
  if (value === null || average === null) return null;
  const diff = value - average;
  if (Math.abs(diff) < Math.max(0.05, average * 0.05)) return "media";
  return diff > 0 ? "acima" : "abaixo";
}

export const VS_AVERAGE_LABEL: Record<"acima" | "abaixo" | "media", string> = {
  acima: "acima da média",
  abaixo: "abaixo da média",
  media: "na média",
};

// ============= Persistência (RLS: somente administradores) =============

export type FeedbackRow = {
  id: string;
  subject_user_id: string;
  created_by: string | null;
  updated_by: string | null;
  period_start: string;
  period_end: string;
  period_label: string;
  meeting_date: string | null;
  metrics_snapshot: unknown;
  leader_notes: string;
  extra_context: string;
  tone: string;
  generated_feedback: string;
  final_feedback: string;
  next_focus: string;
  agreed_action: string;
  shared_with_collaborator: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function listFeedbacks(subjectUserId: string): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from("individual_feedbacks")
    .select("*")
    .eq("subject_user_id", subjectUserId)
    .order("period_start", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FeedbackRow[];
}

export async function saveFeedback(input: {
  id?: string | null;
  subjectUserId: string;
  createdBy: string;
  period: { start: string; end: string; label: string };
  meetingDate: string | null;
  metrics: FeedbackMetrics | null;
  leaderNotes: string;
  extraContext: string;
  tone: FeedbackTone;
  generated: string;
  final: string;
  nextFocus: string;
  agreedAction: string;
  shared: boolean;
}): Promise<FeedbackRow> {
  const payload = {
    subject_user_id: input.subjectUserId,
    period_start: input.period.start,
    period_end: input.period.end,
    period_label: input.period.label,
    meeting_date: input.meetingDate,
    // Fotografia dos indicadores: mudanças futuras no CRM não alteram o feedback salvo.
    metrics_snapshot: (input.metrics ?? {}) as never,
    leader_notes: input.leaderNotes,
    extra_context: input.extraContext,
    tone: input.tone,
    generated_feedback: input.generated,
    final_feedback: input.final,
    next_focus: input.nextFocus,
    agreed_action: input.agreedAction,
    shared_with_collaborator: input.shared,
    status: "salvo",
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("individual_feedbacks")
      .update({ ...payload, updated_by: input.createdBy })
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as unknown as FeedbackRow;
  }

  const { data, error } = await supabase
    .from("individual_feedbacks")
    .insert({ ...payload, created_by: input.createdBy, updated_by: input.createdBy })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as FeedbackRow;
}

export async function deleteFeedback(id: string): Promise<void> {
  const { error } = await supabase.from("individual_feedbacks").delete().eq("id", id);
  if (error) throw error;
}
