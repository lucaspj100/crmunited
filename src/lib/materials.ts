import { supabase } from "@/integrations/supabase/client";

export type MaterialType = "digital" | "physical";
export type PaymentStatus = "pending" | "paid" | "exempt" | "cancelled" | "refunded";
export type PaymentCondition = "cash" | "installment";
export type PaymentMethod = "pix" | "dinheiro" | "debito" | "credito" | "boleto" | "transferencia" | "outro";
export type BonusReason =
  | "eligible"
  | "pending_payment"
  | "paid_outside_enrollment_month"
  | "below_minimum_price"
  | "invalid_payment_condition"
  | "cancelled"
  | "refunded"
  | "exempt"
  | "missing_information"
  | "duplicate_record";

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  digital: "Material digital",
  physical: "Material físico",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  exempt: "Isento / sem material",
  cancelled: "Cancelado",
  refunded: "Estornado",
};

export const CONDITION_LABELS: Record<PaymentCondition, string> = {
  cash: "À vista",
  installment: "Parcelado",
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
};

export const REASON_LABELS: Record<BonusReason, string> = {
  eligible: "Válido para premiação",
  pending_payment: "Aguardando pagamento",
  paid_outside_enrollment_month: "Pago fora do mês da matrícula",
  below_minimum_price: "Valor abaixo do mínimo permitido",
  invalid_payment_condition: "Condição de pagamento inválida",
  cancelled: "Cancelado",
  refunded: "Estornado",
  exempt: "Isento ou sem material",
  missing_information: "Informações incompletas",
  duplicate_record: "Registro duplicado",
};

export type BonusRule = {
  id: string;
  material_type: MaterialType;
  regular_minimum_value: number;
  cash_minimum_value: number;
  cash_discount_reference: number;
  credit_single_installment_is_cash: boolean;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
};

/** Fallback oficial usado quando a regra ainda não foi carregada. */
export const DEFAULT_MINIMUMS: Record<MaterialType, { cash: number; installment: number }> = {
  digital: { cash: 1280, installment: 1428 },
  physical: { cash: 1500, installment: 1668 },
};

export function minimumFor(
  type: MaterialType | null | undefined,
  condition: PaymentCondition | null | undefined,
  rules?: BonusRule[],
): number | null {
  if (!type || !condition) return null;
  const rule = rules?.find((r) => r.material_type === type && r.is_active);
  if (rule) return condition === "cash" ? Number(rule.cash_minimum_value) : Number(rule.regular_minimum_value);
  return DEFAULT_MINIMUMS[type][condition];
}

export type EligibilityInput = {
  materialType: MaterialType | null;
  saleValue: number | null;
  paymentStatus: PaymentStatus;
  paymentDate: string | null;
  paymentCondition: PaymentCondition | null;
  paymentMethod: PaymentMethod | null;
  installmentCount: number | null;
  enrollmentDate: string | null;
  minimumAllowedValue: number | null;
  duplicate?: boolean;
};

export type EligibilityResult = {
  eligible: boolean;
  reason: BonusReason;
  priceRuleValid: boolean;
  minimumAllowedValue: number | null;
};

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

/**
 * Espelha exatamente a função `material_sales_compute()` do banco.
 * O banco continua sendo a fonte da verdade — isto é para preview na interface e testes.
 */
export function computeEligibility(input: EligibilityInput): EligibilityResult {
  const min = input.minimumAllowedValue;
  const priceRuleValid = input.saleValue != null && min != null && input.saleValue >= min;

  let reason: BonusReason;
  if (input.paymentStatus === "cancelled") reason = "cancelled";
  else if (input.paymentStatus === "refunded") reason = "refunded";
  else if (input.paymentStatus === "exempt") reason = "exempt";
  else if (
    !input.materialType ||
    input.saleValue == null ||
    !input.enrollmentDate ||
    min == null ||
    (input.paymentStatus === "paid" && (!input.paymentDate || !input.paymentCondition || !input.paymentMethod))
  )
    reason = "missing_information";
  else if (input.paymentStatus === "pending" || !input.paymentDate) reason = "pending_payment";
  else if (monthKey(input.paymentDate) !== monthKey(input.enrollmentDate)) reason = "paid_outside_enrollment_month";
  else if (
    !input.paymentCondition ||
    (input.paymentCondition === "installment" && (input.installmentCount ?? 0) < 1)
  )
    reason = "invalid_payment_condition";
  else if (!priceRuleValid) reason = "below_minimum_price";
  else if (input.duplicate) reason = "duplicate_record";
  else reason = "eligible";

  return { eligible: reason === "eligible", reason, priceRuleValid, minimumAllowedValue: min };
}

export type MaterialSale = {
  id: string;
  lead_id: string;
  seller_id: string;
  enrollment_date: string | null;
  material_type: MaterialType | null;
  sale_value: number | null;
  payment_status: PaymentStatus;
  payment_date: string | null;
  payment_condition: PaymentCondition | null;
  payment_method: PaymentMethod | null;
  installment_count: number | null;
  notes: string | null;
  minimum_allowed_value_snapshot: number | null;
  price_rule_valid: boolean;
  eligible_for_bonus: boolean;
  bonus_eligibility_reason: BonusReason;
  payment_confirmed_at: string | null;
  payment_confirmed_by: string | null;
  retroactive_adjustment: boolean;
  created_at: string;
  updated_at: string;
};

export type MaterialSaleRow = MaterialSale & {
  lead_name: string | null;
  seller_name: string | null;
};

export async function fetchBonusRules(): Promise<BonusRule[]> {
  const { data, error } = await supabase
    .from("material_bonus_rules" as never)
    .select("*")
    .order("material_type");
  if (error) throw error;
  return (data ?? []) as unknown as BonusRule[];
}

export async function fetchMaterialSales(range: { start: string; end: string }): Promise<MaterialSaleRow[]> {
  const { data, error } = await supabase
    .from("material_sales" as never)
    .select("*, leads(name), profiles:seller_id(full_name, email)")
    .gte("enrollment_date", range.start)
    .lte("enrollment_date", range.end)
    .order("enrollment_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as (MaterialSale & {
    leads?: { name: string } | null;
    profiles?: { full_name: string | null; email: string | null } | null;
  })[]).map((r) => ({
    ...r,
    sale_value: r.sale_value == null ? null : Number(r.sale_value),
    minimum_allowed_value_snapshot:
      r.minimum_allowed_value_snapshot == null ? null : Number(r.minimum_allowed_value_snapshot),
    lead_name: r.leads?.name ?? null,
    seller_name: r.profiles?.full_name || r.profiles?.email || null,
  }));
}

export async function fetchMaterialSaleByLead(leadId: string): Promise<MaterialSale | null> {
  const { data, error } = await supabase
    .from("material_sales" as never)
    .select("*")
    .eq("lead_id", leadId)
    .not("payment_status", "in", "(cancelled,refunded)")
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as MaterialSale) ?? null;
}

export type MaterialSaleInput = {
  leadId: string;
  enrollmentDate: string | null;
  materialType: MaterialType | null;
  saleValue: number | null;
  paymentStatus: PaymentStatus;
  paymentDate: string | null;
  paymentCondition: PaymentCondition | null;
  paymentMethod: PaymentMethod | null;
  installmentCount: number | null;
  notes?: string | null;
};

/**
 * Cria ou atualiza o registro principal de material do lead.
 * Campos calculados (elegibilidade, motivo, snapshots) NUNCA são enviados
 * pelo frontend — o trigger do banco os recalcula.
 */
export async function saveMaterialSale(input: MaterialSaleInput, userId: string) {
  const payload: Record<string, unknown> = {
    lead_id: input.leadId,
    seller_id: userId,
    enrollment_date: input.enrollmentDate,
    material_type: input.materialType,
    sale_value: input.saleValue,
    payment_status: input.paymentStatus,
    payment_date: input.paymentStatus === "paid" ? input.paymentDate : null,
    payment_condition: input.paymentCondition,
    payment_method: input.paymentMethod,
    installment_count: input.paymentCondition === "installment" ? input.installmentCount : null,
    notes: input.notes ?? null,
    updated_by: userId,
  };
  if (input.paymentStatus === "paid") {
    payload.payment_confirmed_by = userId;
    payload.payment_confirmed_at = new Date().toISOString();
  }

  const existing = await fetchMaterialSaleByLead(input.leadId);
  if (existing) {
    const { error } = await supabase
      .from("material_sales" as never)
      .update(payload as never)
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await supabase
    .from("material_sales" as never)
    .insert({ ...payload, created_by: userId } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

export async function updateMaterialStatus(
  id: string,
  status: PaymentStatus,
  reason: string,
  userId: string,
) {
  const patch: Record<string, unknown> = { payment_status: status, updated_by: userId };
  if (status === "cancelled") {
    patch.cancelled_by = userId;
    patch.cancelled_at = new Date().toISOString();
  }
  if (status === "refunded") {
    patch.refunded_by = userId;
    patch.refunded_at = new Date().toISOString();
  }
  patch.notes = reason;
  const { error } = await supabase.from("material_sales" as never).update(patch as never).eq("id", id);
  if (error) throw error;
}

export type MaterialTotals = {
  count: number;
  countValid: number;
  totalSold: number;
  totalReceived: number;
  paidSameMonth: number;
  paidOtherMonth: number;
  pending: number;
  belowMinimum: number;
  cancelled: number;
  refunded: number;
  validTotal: number;
};

export function aggregate(rows: MaterialSaleRow[]): MaterialTotals {
  const t: MaterialTotals = {
    count: 0,
    countValid: 0,
    totalSold: 0,
    totalReceived: 0,
    paidSameMonth: 0,
    paidOtherMonth: 0,
    pending: 0,
    belowMinimum: 0,
    cancelled: 0,
    refunded: 0,
    validTotal: 0,
  };
  for (const r of rows) {
    const v = Number(r.sale_value ?? 0);
    t.count += 1;
    if (r.payment_status === "cancelled") { t.cancelled += v; continue; }
    if (r.payment_status === "refunded") { t.refunded += v; continue; }
    t.totalSold += v;
    if (r.payment_status === "paid") {
      t.totalReceived += v;
      if (r.bonus_eligibility_reason === "paid_outside_enrollment_month") t.paidOtherMonth += v;
      else t.paidSameMonth += v;
    }
    if (r.payment_status === "pending") t.pending += v;
    if (r.bonus_eligibility_reason === "below_minimum_price") t.belowMinimum += v;
    if (r.eligible_for_bonus) { t.validTotal += v; t.countValid += 1; }
  }
  return t;
}

export function brl(n: number | null | undefined) {
  return (Number(n ?? 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
