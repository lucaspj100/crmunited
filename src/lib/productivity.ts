import { supabase } from "@/integrations/supabase/client";

export type ProductivityRow = {
  vendedor_id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  leads_novos_atribuidos: number;
  leads_trabalhados: number;
  ligacoes_feitas: number;
  ligacoes_atendidas: number;
  interessados_gerados: number;
  entrevistas_marcadas: number;
  matriculas: number;
  whatsapps_checkout: number;
  linkedins_checkout: number;
  checkout_today_done: boolean;
  checkout_today_at: string | null;
};

export type Period = "hoje" | "semana" | "mes" | "custom";

export function periodRange(p: Period, customStart?: string, customEnd?: string): { start: string; end: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const endIso = iso(today);
  if (p === "hoje") return { start: endIso, end: endIso };
  if (p === "semana") {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return { start: iso(d), end: endIso };
  }
  if (p === "mes") {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: iso(d), end: endIso };
  }
  return { start: customStart || endIso, end: customEnd || endIso };
}

export async function fetchProductivity(args: {
  start: string;
  end: string;
  vendedorId?: string | null;
}): Promise<ProductivityRow[]> {
  const { data, error } = await supabase.rpc("productivity_summary" as never, {
    _start: args.start,
    _end: args.end,
    _vendedor_id: args.vendedorId ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as ProductivityRow[];
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
