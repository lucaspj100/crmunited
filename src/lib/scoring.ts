import type { ProductivityRow } from "@/lib/productivity";
import { DEFAULT_POINTS, getActivePoints, buildLegend, type ScorePoints } from "@/lib/score-settings";

/**
 * Pontuação padrão (fallback de segurança).
 * A fonte única de verdade é a tabela `score_settings`, carregada em runtime
 * via `useScoreSettings()` / `getActivePoints()`.
 */
export const POINTS = DEFAULT_POINTS;

/** Legenda dinâmica com os valores configurados pelo ADM. */
export const POINTS_LEGEND = buildLegend();

export function scoreOf(r: ProductivityRow, points: ScorePoints = getActivePoints()): number {
  return (
    r.ligacoes_feitas * points.call +
    r.ligacoes_atendidas * points.answered +
    r.interessados_gerados * points.interested +
    r.entrevistas_marcadas * points.interview +
    (r.entrevistas_realizadas ?? 0) * points.interview_done +
    r.matriculas * points.enrollment +
    (r.whatsapps_checkout ?? 0) * points.whatsapp +
    (r.linkedins_checkout ?? 0) * points.linkedin
  );
}

export function fmtScore(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString("pt-BR")
    : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Filtra usuários técnicos que não devem aparecer no placar/ranking. */
export function isRealSeller(nome: string | null | undefined): boolean {
  if (!nome) return false;
  const n = nome.trim().toLowerCase();
  if (!n) return false;
  const blocked = ["placar", "telão", "telao", "teste", "test", "sistema", "admin"];
  return !blocked.some((b) => n === b || n.startsWith(b + " "));
}
