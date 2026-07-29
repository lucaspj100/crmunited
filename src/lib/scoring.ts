import type { ProductivityRow } from "@/lib/productivity";

/** Pontuação oficial do placar comercial — fonte única de verdade. */
export const POINTS = {
  call: 1,
  answered: 2,
  interested: 30,
  interview: 60,
  interview_done: 100,
  enrollment: 300,
  whatsapp: 0.1,
  linkedin: 0.1,
} as const;

export const POINTS_LEGEND =
  "ligação 1 · atendida 2 · interessado 30 · entrev. marcada 60 · entrev. realizada 100 · matrícula 300 · WhatsApp 0,1 · LinkedIn 0,1";

export function scoreOf(r: ProductivityRow): number {
  return (
    r.ligacoes_feitas * POINTS.call +
    r.ligacoes_atendidas * POINTS.answered +
    r.interessados_gerados * POINTS.interested +
    r.entrevistas_marcadas * POINTS.interview +
    (r.entrevistas_realizadas ?? 0) * POINTS.interview_done +
    r.matriculas * POINTS.enrollment +
    (r.whatsapps_checkout ?? 0) * POINTS.whatsapp +
    (r.linkedins_checkout ?? 0) * POINTS.linkedin
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
