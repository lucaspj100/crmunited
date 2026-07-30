export type CommissionStatus =
  | "nao_configurada"
  | "prevista"
  | "confirmada"
  | "paga"
  | "cancelada"
  | "estornada";

export type CommissionRow = {
  id: string;
  lead_id: string;
  student_name: string | null;
  employee_id: string | null;
  employee_name_snapshot: string | null;
  employee_role_snapshot: string | null;
  enrollment_date: string | null;
  enrollment_amount: number | null;
  material_amount: number | null;
  commission_rule_id: string | null;
  commission_type_snapshot: "percentage" | "fixed" | null;
  commission_percentage_snapshot: number | null;
  fixed_amount_snapshot: number | null;
  commission_amount: number | null;
  enrollment_status: string;
  commission_status: CommissionStatus;
  payment_date: string | null;
  needs_compensation: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  nao_configurada: "Comissão não configurada",
  prevista: "Prevista",
  confirmada: "Confirmada",
  paga: "Paga",
  cancelada: "Cancelada",
  estornada: "Estornada",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  franqueado: "Franqueado",
  vendedor: "Consultor",
};

export const DASH = "—";

export function brl(v: number | null | undefined): string {
  if (v == null) return DASH;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function pct(v: number | null | undefined): string {
  if (v == null) return DASH;
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function dateBr(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export type CommissionSummary = {
  prevista: number;
  confirmada: number;
  paga: number;
  estornada: number;
  liquido: number;
  comComissao: number;
  semConfiguracao: number;
};

export function summarize(rows: CommissionRow[]): CommissionSummary {
  const s: CommissionSummary = {
    prevista: 0,
    confirmada: 0,
    paga: 0,
    estornada: 0,
    liquido: 0,
    comComissao: 0,
    semConfiguracao: 0,
  };
  for (const r of rows) {
    const v = r.commission_amount ?? 0;
    switch (r.commission_status) {
      case "prevista":
        s.prevista += v;
        break;
      case "confirmada":
        s.confirmada += v;
        break;
      case "paga":
        s.paga += v;
        break;
      case "estornada":
        s.estornada += v;
        break;
      case "nao_configurada":
        s.semConfiguracao += 1;
        break;
    }
    if (r.commission_status !== "nao_configurada" && r.commission_status !== "cancelada") s.comComissao += 1;
  }
  // Total líquido: confirmadas + pagas − estornadas (sem dupla contagem)
  s.liquido = s.confirmada + s.paga - s.estornada;
  return s;
}

export type SellerSummary = {
  employee_id: string;
  nome: string;
  cargo: string;
  matriculas: number;
  totalMatriculas: number;
  prevista: number;
  confirmada: number;
  paga: number;
  estornada: number;
  liquido: number;
};

export function summarizeBySeller(rows: CommissionRow[]): SellerSummary[] {
  const map = new Map<string, SellerSummary>();
  for (const r of rows) {
    const key = r.employee_id ?? "sem";
    let s = map.get(key);
    if (!s) {
      s = {
        employee_id: key,
        nome: r.employee_name_snapshot ?? DASH,
        cargo: r.employee_role_snapshot ? ROLE_LABEL[r.employee_role_snapshot] ?? r.employee_role_snapshot : DASH,
        matriculas: 0,
        totalMatriculas: 0,
        prevista: 0,
        confirmada: 0,
        paga: 0,
        estornada: 0,
        liquido: 0,
      };
      map.set(key, s);
    }
    s.matriculas += 1;
    s.totalMatriculas += r.enrollment_amount ?? 0;
    const v = r.commission_amount ?? 0;
    if (r.commission_status === "prevista") s.prevista += v;
    if (r.commission_status === "confirmada") s.confirmada += v;
    if (r.commission_status === "paga") s.paga += v;
    if (r.commission_status === "estornada") s.estornada += v;
  }
  const out = Array.from(map.values());
  for (const s of out) s.liquido = s.confirmada + s.paga - s.estornada;
  return out.sort((a, b) => b.liquido - a.liquido);
}

export const EXPORT_HEADERS = [
  "Data da matrícula",
  "Aluno",
  "Colaborador",
  "Cargo",
  "Valor da matrícula",
  "Valor do material",
  "Tipo de comissão",
  "Percentual aplicado",
  "Valor fixo aplicado",
  "Valor da comissão",
  "Status da matrícula",
  "Status da comissão",
  "Data de pagamento",
  "Observação",
];

export function toExportRow(r: CommissionRow): (string | number)[] {
  return [
    dateBr(r.enrollment_date),
    r.student_name ?? DASH,
    r.employee_name_snapshot ?? DASH,
    r.employee_role_snapshot ? ROLE_LABEL[r.employee_role_snapshot] ?? r.employee_role_snapshot : DASH,
    r.enrollment_amount ?? 0,
    r.material_amount ?? 0,
    r.commission_type_snapshot === "percentage"
      ? "Percentual"
      : r.commission_type_snapshot === "fixed"
        ? "Valor fixo"
        : DASH,
    r.commission_type_snapshot === "percentage" ? pct(r.commission_percentage_snapshot) : DASH,
    r.commission_type_snapshot === "fixed" ? (r.fixed_amount_snapshot ?? 0) : DASH,
    r.commission_amount ?? 0,
    r.enrollment_status,
    COMMISSION_STATUS_LABEL[r.commission_status],
    dateBr(r.payment_date),
    r.notes ?? DASH,
  ];
}

export function toCsv(rows: CommissionRow[]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [EXPORT_HEADERS.map(esc).join(";")];
  for (const r of rows) lines.push(toExportRow(r).map(esc).join(";"));
  return lines.join("\n");
}
