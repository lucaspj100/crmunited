/**
 * Comissão dos Vendedores — helpers puros (independente da Comissão da Liderança).
 * Regra: comissão = enrollment_value × percentual / 100 (material e mensalidade não entram).
 */

export type SellerCommissionStatus = "nao_configurada" | "prevista" | "cancelada";

export type SellerCommissionRow = {
  id: string;
  lead_id: string;
  seller_id: string | null;
  seller_name_snapshot: string | null;
  student_name_snapshot: string | null;
  enrollment_date: string | null;
  enrollment_value_snapshot: number | null;
  commission_percentage_snapshot: number | null;
  commission_amount: number | null;
  status: SellerCommissionStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SellerCommissionRule = {
  id: string;
  seller_id: string;
  commission_percentage: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const SELLER_COMMISSION_STATUS_LABEL: Record<SellerCommissionStatus, string> = {
  nao_configurada: "Comissão não configurada",
  prevista: "Prevista",
  cancelada: "Cancelada",
};

export const DASH = "—";

export function brl(v: number | null | undefined): string {
  if (v == null) return DASH;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function pct(v: number | null | undefined): string {
  if (v == null) return DASH;
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

export function dateBr(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function commissionOf(enrollmentValue: number | null, percentage: number | null): number | null {
  if (enrollmentValue == null || percentage == null) return null;
  return Math.round(enrollmentValue * percentage) / 100;
}

export type SellerCommissionTotals = {
  comissao: number;
  matriculas: number;
  totalMatriculas: number;
  naoConfiguradas: number;
};

/** Considera apenas comissões ativas (canceladas ficam no histórico, fora dos totais). */
export function summarizeSellerCommissions(rows: SellerCommissionRow[]): SellerCommissionTotals {
  const t: SellerCommissionTotals = { comissao: 0, matriculas: 0, totalMatriculas: 0, naoConfiguradas: 0 };
  for (const r of rows) {
    if (r.status === "cancelada") continue;
    t.matriculas += 1;
    t.totalMatriculas += r.enrollment_value_snapshot ?? 0;
    t.comissao += r.commission_amount ?? 0;
    if (r.status === "nao_configurada") t.naoConfiguradas += 1;
  }
  return t;
}

export type SellerCommissionAggregate = SellerCommissionTotals & {
  seller_id: string;
  nome: string;
};

export function aggregateBySeller(rows: SellerCommissionRow[]): SellerCommissionAggregate[] {
  const map = new Map<string, SellerCommissionAggregate>();
  for (const r of rows) {
    const key = r.seller_id ?? "sem";
    let agg = map.get(key);
    if (!agg) {
      agg = {
        seller_id: key,
        nome: r.seller_name_snapshot ?? DASH,
        comissao: 0,
        matriculas: 0,
        totalMatriculas: 0,
        naoConfiguradas: 0,
      };
      map.set(key, agg);
    }
    if (r.status === "cancelada") continue;
    agg.matriculas += 1;
    agg.totalMatriculas += r.enrollment_value_snapshot ?? 0;
    agg.comissao += r.commission_amount ?? 0;
    if (r.status === "nao_configurada") agg.naoConfiguradas += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.comissao - a.comissao);
}

export const SELLER_EXPORT_HEADERS = [
  "Data da matrícula",
  "Aluno",
  "Vendedor",
  "Valor da matrícula",
  "Percentual aplicado",
  "Comissão",
  "Status",
];

export function toSellerExportRow(r: SellerCommissionRow): (string | number)[] {
  return [
    dateBr(r.enrollment_date),
    r.student_name_snapshot ?? DASH,
    r.seller_name_snapshot ?? DASH,
    r.enrollment_value_snapshot ?? 0,
    r.commission_percentage_snapshot ?? DASH,
    r.commission_amount ?? 0,
    SELLER_COMMISSION_STATUS_LABEL[r.status],
  ];
}
