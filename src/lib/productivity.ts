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
  entrevistas_realizadas: number;
  matriculas: number;
  perdidos: number;
  whatsapps_checkout: number;
  linkedins_checkout: number;
  checkout_today_done: boolean;
  checkout_today_at: string | null;
};

export type Period =
  | "hoje"
  | "ontem"
  | "semana"
  | "semana_passada"
  | "mes"
  | "mes_passado"
  | "custom";

export const PERIOD_LABELS: Record<Period, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  semana: "Semana atual",
  semana_passada: "Semana passada",
  mes: "Mês atual",
  mes_passado: "Mês passado",
  custom: "Período personalizado",
};

// Local-date ISO (YYYY-MM-DD) to avoid UTC drift when using toISOString().
export function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalIso(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(d: Date, delta: number): Date {
  const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  nd.setDate(nd.getDate() + delta);
  return nd;
}

// Semana comercial: domingo 00:00 até sábado 23:59 (horário local).
export function weekRange(reference: Date = new Date()): { start: string; end: string } {
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const dow = ref.getDay(); // 0 = domingo ... 6 = sábado
  const sunday = addDays(ref, -dow);
  const saturday = addDays(sunday, 6);
  return { start: localIso(sunday), end: localIso(saturday) };
}

export function periodRange(p: Period, customStart?: string, customEnd?: string): { start: string; end: string } {
  const today = new Date();
  const todayIsoStr = localIso(today);
  switch (p) {
    case "hoje":
      return { start: todayIsoStr, end: todayIsoStr };
    case "ontem": {
      const y = localIso(addDays(today, -1));
      return { start: y, end: y };
    }
    case "semana":
      return weekRange(today);
    case "semana_passada":
      return weekRange(addDays(today, -7));
    case "mes": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: localIso(first), end: todayIsoStr };
    }
    case "mes_passado": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0); // dia 0 do mês atual = último do anterior
      return { start: localIso(first), end: localIso(last) };
    }
    case "custom":
    default: {
      const s = customStart || todayIsoStr;
      let e = customEnd || todayIsoStr;
      if (e < s) e = s;
      return { start: s, end: e };
    }
  }
}

// Range imediatamente anterior de mesma duração (ou período natural anterior).
export function previousPeriodRange(
  p: Period,
  current: { start: string; end: string },
): { start: string; end: string } {
  switch (p) {
    case "hoje":
      return periodRange("ontem");
    case "ontem": {
      const s = parseLocalIso(current.start);
      const y = localIso(addDays(s, -1));
      return { start: y, end: y };
    }
    case "semana":
      return periodRange("semana_passada");
    case "semana_passada": {
      const s = parseLocalIso(current.start);
      const sundayBefore = addDays(s, -7);
      const saturdayBefore = addDays(sundayBefore, 6);
      return { start: localIso(sundayBefore), end: localIso(saturdayBefore) };
    }
    case "mes": {
      const first = parseLocalIso(current.start);
      const prevFirst = new Date(first.getFullYear(), first.getMonth() - 1, 1);
      const prevLast = new Date(first.getFullYear(), first.getMonth(), 0);
      return { start: localIso(prevFirst), end: localIso(prevLast) };
    }
    case "mes_passado": {
      const first = parseLocalIso(current.start);
      const prevFirst = new Date(first.getFullYear(), first.getMonth() - 1, 1);
      const prevLast = new Date(first.getFullYear(), first.getMonth(), 0);
      return { start: localIso(prevFirst), end: localIso(prevLast) };
    }
    case "custom":
    default: {
      const s = parseLocalIso(current.start);
      const e = parseLocalIso(current.end);
      const durationDays = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
      const prevEnd = addDays(s, -1);
      const prevStart = addDays(prevEnd, -(durationDays - 1));
      return { start: localIso(prevStart), end: localIso(prevEnd) };
    }
  }
}

export function formatIsoBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatRangeLabel(range: { start: string; end: string }): string {
  if (range.start === range.end) return formatIsoBr(range.start);
  return `${formatIsoBr(range.start)} a ${formatIsoBr(range.end)}`;
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
  return localIso(new Date());
}

