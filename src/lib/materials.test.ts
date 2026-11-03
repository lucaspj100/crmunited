import { describe, expect, it } from "vitest";
import { computeEligibility, minimumFor, type EligibilityInput } from "@/lib/materials";

function make(over: Partial<EligibilityInput>): EligibilityInput {
  const base: EligibilityInput = {
    materialType: "digital",
    saleValue: 1428,
    paymentStatus: "paid",
    paymentDate: "2026-07-10",
    paymentCondition: "installment",
    paymentMethod: "boleto",
    installmentCount: 12,
    enrollmentDate: "2026-07-10",
    minimumAllowedValue: null,
  };
  const merged = { ...base, ...over };
  merged.minimumAllowedValue =
    over.minimumAllowedValue ?? minimumFor(merged.materialType, merged.paymentCondition);
  return merged;
}

describe("mínimos oficiais", () => {
  it("usa a tabela oficial sem calcular desconto", () => {
    expect(minimumFor("digital", "installment")).toBe(1428);
    expect(minimumFor("digital", "cash")).toBe(1280);
    expect(minimumFor("physical", "installment")).toBe(1668);
    expect(minimumFor("physical", "cash")).toBe(1500);
  });
});

describe("digital parcelado", () => {
  it("1428 no mesmo mês é elegível", () => {
    expect(computeEligibility(make({ saleValue: 1428 })).reason).toBe("eligible");
  });
  it("1308 é abaixo do mínimo", () => {
    expect(computeEligibility(make({ saleValue: 1308 })).reason).toBe("below_minimum_price");
  });
  it("pago em agosto para matrícula de julho não é elegível", () => {
    expect(computeEligibility(make({ paymentDate: "2026-08-01" })).reason).toBe("paid_outside_enrollment_month");
  });
});

describe("digital à vista", () => {
  const cash = (v: number) => computeEligibility(make({ paymentCondition: "cash", saleValue: v, paymentMethod: "pix" }));
  it("1280 elegível", () => expect(cash(1280).reason).toBe("eligible"));
  it("1285 elegível", () => expect(cash(1285).reason).toBe("eligible"));
  it("1308 elegível", () => expect(cash(1308).reason).toBe("eligible"));
  it("1279,99 abaixo do mínimo", () => expect(cash(1279.99).reason).toBe("below_minimum_price"));
});

describe("físico parcelado", () => {
  const inst = (v: number, over: Partial<EligibilityInput> = {}) =>
    computeEligibility(make({ materialType: "physical", saleValue: v, ...over }));
  it("1668 elegível", () => expect(inst(1668).reason).toBe("eligible"));
  it("1600 abaixo do mínimo", () => expect(inst(1600).reason).toBe("below_minimum_price"));
  it("1668 pago no mês seguinte não é elegível", () =>
    expect(inst(1668, { paymentDate: "2026-08-02" }).reason).toBe("paid_outside_enrollment_month"));
});

describe("físico à vista", () => {
  const cash = (v: number) =>
    computeEligibility(make({ materialType: "physical", paymentCondition: "cash", paymentMethod: "pix", saleValue: v }));
  it("1500 elegível", () => expect(cash(1500).reason).toBe("eligible"));
  it("1501,20 elegível", () => expect(cash(1501.2).reason).toBe("eligible"));
  it("1600 elegível", () => expect(cash(1600).reason).toBe("eligible"));
  it("1499,99 abaixo do mínimo", () => expect(cash(1499.99).reason).toBe("below_minimum_price"));
});

describe("pendência, cancelamento e estorno", () => {
  it("pendente não é elegível", () => {
    expect(computeEligibility(make({ paymentStatus: "pending", paymentDate: null })).reason).toBe("pending_payment");
  });
  it("pendente pago depois no mesmo mês vira elegível", () => {
    expect(computeEligibility(make({ paymentStatus: "paid", paymentDate: "2026-07-28" })).eligible).toBe(true);
  });
  it("pendente pago no mês seguinte continua não elegível", () => {
    expect(computeEligibility(make({ paymentStatus: "paid", paymentDate: "2026-08-05" })).eligible).toBe(false);
  });
  it("cancelado sai da premiação", () => {
    expect(computeEligibility(make({ paymentStatus: "cancelled" })).reason).toBe("cancelled");
  });
  it("estornado sai da premiação", () => {
    expect(computeEligibility(make({ paymentStatus: "refunded" })).reason).toBe("refunded");
  });
  it("isento não é elegível", () => {
    expect(computeEligibility(make({ paymentStatus: "exempt" })).reason).toBe("exempt");
  });
});

describe("informações incompletas e condição inválida", () => {
  it("sem tipo de material", () => {
    expect(computeEligibility(make({ materialType: null, minimumAllowedValue: null })).reason).toBe("missing_information");
  });
  it("pago sem forma de pagamento", () => {
    expect(computeEligibility(make({ paymentMethod: null })).reason).toBe("missing_information");
  });
  it("parcelado sem número de parcelas", () => {
    expect(computeEligibility(make({ installmentCount: 0 })).reason).toBe("invalid_payment_condition");
  });
  it("duplicidade", () => {
    expect(computeEligibility(make({ duplicate: true })).reason).toBe("duplicate_record");
  });
});

import { aggregate, type MaterialSaleRow } from "@/lib/materials";

describe("premiação só digital a partir de nov/2026", () => {
  const phys = (over: Partial<EligibilityInput>) =>
    computeEligibility(make({ materialType: "physical", saleValue: 1668, ...over }));
  it("físico de outubro/2026 continua elegível pelas regras antigas", () => {
    expect(phys({ enrollmentDate: "2026-10-15", paymentDate: "2026-10-20" }).reason).toBe("eligible");
  });
  it("físico de novembro/2026 é inelegível mesmo pago e acima do mínimo", () => {
    const r = phys({ enrollmentDate: "2026-11-01", paymentDate: "2026-11-02", saleValue: 5000 });
    expect(r.reason).toBe("physical_not_eligible");
    expect(r.eligible).toBe(false);
  });
  it("digital de novembro/2026 continua elegível", () => {
    expect(computeEligibility(make({ enrollmentDate: "2026-11-05", paymentDate: "2026-11-06" })).reason).toBe("eligible");
  });
  it("digital de novembro abaixo do mínimo segue as regras atuais", () => {
    expect(computeEligibility(make({ enrollmentDate: "2026-11-05", paymentDate: "2026-11-06", saleValue: 1000 })).reason).toBe("below_minimum_price");
  });
  it("físico matriculado em outubro e pago em novembro respeita a competência de outubro", () => {
    expect(phys({ enrollmentDate: "2026-10-30", paymentDate: "2026-11-03" }).reason).toBe("paid_outside_enrollment_month");
  });
  it("cancelado/estornado de novembro mantém o motivo original", () => {
    expect(phys({ enrollmentDate: "2026-11-05", paymentStatus: "cancelled" }).reason).toBe("cancelled");
    expect(phys({ enrollmentDate: "2026-11-05", paymentStatus: "refunded" }).reason).toBe("refunded");
  });

  const row = (over: Partial<MaterialSaleRow>): MaterialSaleRow => ({
    id: "x", lead_id: "l", seller_id: "s", enrollment_date: "2026-11-05", material_type: "physical",
    sale_value: 2000, payment_status: "paid", payment_date: "2026-11-06", payment_condition: "cash",
    payment_method: "pix", installment_count: null, notes: null, minimum_allowed_value_snapshot: 1500,
    price_rule_valid: true, eligible_for_bonus: true, bonus_eligibility_reason: "eligible",
    payment_confirmed_at: null, payment_confirmed_by: null, retroactive_adjustment: false,
    created_at: "", updated_at: "", lead_name: null, seller_name: null, ...over,
  });
  it("totais válidos (metas/premiação) excluem físico de novembro, faturamento e recebido incluem", () => {
    const t = aggregate([
      row({}),
      row({ id: "d", material_type: "digital", sale_value: 1428 }),
      row({ id: "o", enrollment_date: "2026-10-10", payment_date: "2026-10-11", sale_value: 1600 }),
    ]);
    expect(t.validTotal).toBe(1428 + 1600);
    expect(t.countValid).toBe(2);
    expect(t.totalSold).toBe(2000 + 1428 + 1600);
    expect(t.totalReceived).toBe(2000 + 1428 + 1600);
  });
});
