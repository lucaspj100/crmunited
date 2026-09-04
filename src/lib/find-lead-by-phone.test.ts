import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";
import { resolvePhoneQuery, toLeadPayload } from "@/lib/find-lead-by-phone";

describe("normalizePhone", () => {
  it("adiciona 55 em números com DDD", () => {
    expect(normalizePhone("(11) 98888-7777")).toEqual({ normalized: "5511988887777", valid: true });
    expect(normalizePhone("1132224444")).toEqual({ normalized: "551132224444", valid: true });
  });

  it("mantém números já no padrão internacional", () => {
    expect(normalizePhone("+55 11 98888-7777").normalized).toBe("5511988887777");
    expect(normalizePhone("005511988887777").normalized).toBe("5511988887777");
  });

  it("marca inválido quando vazio ou fora do padrão", () => {
    expect(normalizePhone("")).toEqual({ normalized: null, valid: false });
    expect(normalizePhone("123").valid).toBe(false);
  });
});

describe("resolvePhoneQuery", () => {
  it("normaliza telefone válido", () => {
    expect(resolvePhoneQuery("(11) 98888-7777")).toEqual({ normalized: "5511988887777" });
  });

  it("rejeita ausente, curto ou inválido", () => {
    expect(resolvePhoneQuery(null)).toEqual({ error: "invalid_phone" });
    expect(resolvePhoneQuery("123")).toEqual({ error: "invalid_phone" });
    expect(resolvePhoneQuery("abcdefghij")).toEqual({ error: "invalid_phone" });
  });
});

describe("toLeadPayload", () => {
  it("retorna somente os campos permitidos", () => {
    const payload = toLeadPayload({
      id: "1",
      name: "Ana",
      phone: "11988887777",
      company: "United",
      status: "novo",
      owner_id: "u1",
      updated_at: "2026-09-04T00:00:00Z",
      // @ts-expect-error campo extra deve ser descartado
      enrollment_value: 5000,
    });
    expect(Object.keys(payload).sort()).toEqual([
      "company",
      "id",
      "name",
      "owner_id",
      "phone",
      "status",
      "updated_at",
    ]);
    expect(payload).not.toHaveProperty("enrollment_value");
  });
});
