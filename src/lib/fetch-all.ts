// Fonte única para leituras de listas grandes (leads, tarefas).
// O servidor devolve no máximo 1000 linhas por requisição; aqui buscamos em
// blocos até trazer tudo, com ordenação estável por id.
const PAGE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll<T = any>(build: () => any): Promise<{ data: T[]; error: any }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) return { data: out, error };
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: out, error: null };
}

/** Etapas ativas do funil (fora de Matrícula e Perdido). */
export const ACTIVE_STATUSES = ["novo", "interessado", "entrevista_marcada", "entrevista_realizada"] as const;

/** Consulta compartilhada por Funil e Forecast (mesma chave = mesmos dados). */
export const FUNNEL_LEADS_KEY = ["leads-funil"] as const;
export async function fetchFunnelLeads() {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await fetchAll(() => supabase.from("leads").select("*"));
  if (error) throw error;
  return data;
}
