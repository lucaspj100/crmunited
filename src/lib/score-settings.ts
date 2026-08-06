import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ActivityKey =
  | "call"
  | "answered"
  | "interested"
  | "interview"
  | "interview_done"
  | "enrollment"
  | "whatsapp"
  | "linkedin";

export type ScorePoints = Record<ActivityKey, number>;

/** Fallback de segurança — usado apenas se a configuração do banco não carregar. */
export const DEFAULT_POINTS: ScorePoints = {
  call: 1,
  answered: 2,
  interested: 30,
  interview: 60,
  interview_done: 100,
  enrollment: 1000,
  whatsapp: 0.1,
  linkedin: 0.1,
};

export const ACTIVITY_ORDER: ActivityKey[] = [
  "call",
  "answered",
  "interested",
  "interview",
  "interview_done",
  "enrollment",
  "whatsapp",
  "linkedin",
];

export const ACTIVITY_LABELS: Record<ActivityKey, string> = {
  call: "Ligação realizada",
  answered: "Ligação atendida",
  interested: "Interessado gerado",
  interview: "Entrevista marcada",
  interview_done: "Entrevista realizada",
  enrollment: "Matrícula",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
};

const SHORT_LABELS: Record<ActivityKey, string> = {
  call: "ligação",
  answered: "atendida",
  interested: "interessado",
  interview: "entrev. marcada",
  interview_done: "entrev. realizada",
  enrollment: "matrícula",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
};

export type ScoreSetting = {
  id: string;
  activity_key: ActivityKey;
  activity_label: string;
  points: number;
  updated_at: string;
  updated_by: string | null;
};

/**
 * Configuração vigente em memória. Atualizada sempre que a configuração é
 * carregada do banco, para que qualquer cálculo de pontos use a fonte única.
 */
let activePoints: ScorePoints = { ...DEFAULT_POINTS };

export function getActivePoints(): ScorePoints {
  return activePoints;
}

export function setActivePoints(p: ScorePoints) {
  activePoints = p;
}

export function fmtPoints(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString("pt-BR")
    : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/** Legenda montada dinamicamente com os valores configurados pelo ADM. */
export function buildLegend(points: ScorePoints = activePoints): string {
  return ACTIVITY_ORDER.map((k) => `${SHORT_LABELS[k]} ${fmtPoints(points[k])}`).join(" · ");
}

export async function fetchScoreSettings(): Promise<ScoreSetting[]> {
  const { data, error } = await supabase
    .from("score_settings" as never)
    .select("id,activity_key,activity_label,points,updated_at,updated_by")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ScoreSetting[];
}

export function pointsFromSettings(rows: ScoreSetting[]): ScorePoints {
  const out = { ...DEFAULT_POINTS };
  for (const r of rows) {
    if (r.activity_key in out) out[r.activity_key] = Number(r.points) || 0;
  }
  return out;
}

export const SCORE_SETTINGS_KEY = ["score_settings"] as const;

/** Carrega a configuração e mantém o cache em memória sincronizado. */
export function useScoreSettings() {
  const q = useQuery({
    queryKey: SCORE_SETTINGS_KEY,
    queryFn: fetchScoreSettings,
    staleTime: 60_000,
  });
  const points = q.data ? pointsFromSettings(q.data) : activePoints;
  useEffect(() => {
    if (q.data) setActivePoints(pointsFromSettings(q.data));
  }, [q.data]);
  return { ...q, points };
}

export function useScorePoints(): ScorePoints {
  return useScoreSettings().points;
}

export async function saveScoreSettings(next: ScorePoints, userId: string | null) {
  const current = await fetchScoreSettings();
  const previous = pointsFromSettings(current);

  for (const row of current) {
    const value = next[row.activity_key];
    if (value === undefined || Number(row.points) === value) continue;
    const { error } = await supabase
      .from("score_settings" as never)
      .update({ points: value, updated_by: userId } as never)
      .eq("id", row.id);
    if (error) throw error;
  }

  const { error: hErr } = await supabase.from("score_settings_history" as never).insert({
    changed_by: userId,
    previous_values: previous,
    new_values: next,
  } as never);
  if (hErr) throw hErr;

  setActivePoints(next);
}

export type ScoreHistoryEntry = {
  id: string;
  changed_by: string | null;
  changed_at: string;
  previous_values: Partial<ScorePoints>;
  new_values: Partial<ScorePoints>;
};

export async function fetchScoreHistory(): Promise<ScoreHistoryEntry[]> {
  const { data, error } = await supabase
    .from("score_settings_history" as never)
    .select("id,changed_by,changed_at,previous_values,new_values")
    .order("changed_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as ScoreHistoryEntry[];
}

/** Salva e força o recálculo/atualização de todas as telas que usam pontos. */
export function useSaveScoreSettings(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (next: ScorePoints) => saveScoreSettings(next, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SCORE_SETTINGS_KEY });
      void qc.invalidateQueries({ queryKey: ["score_settings_history"] });
      void qc.invalidateQueries({ queryKey: ["placar_diario"] });
      void qc.invalidateQueries({ queryKey: ["placar_diario_prev"] });
      void qc.invalidateQueries({ queryKey: ["placar_mes_metas"] });
    },
  });
}
