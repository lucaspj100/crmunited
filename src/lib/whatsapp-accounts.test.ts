import { describe, expect, it } from "vitest";
import { isRecentlyActive, resolveAccountSchema, resolvePhoneInput, toAccountPayload } from "./whatsapp-accounts";

describe("resolvePhoneInput", () => {
  it("normaliza telefone brasileiro sem 55", () => {
    expect(resolvePhoneInput("(11) 99999-9999")).toEqual({ normalized: "5511999999999" });
  });
  it("mantém telefone já normalizado", () => {
    expect(resolvePhoneInput("5511999999999")).toEqual({ normalized: "5511999999999" });
  });
  it("rejeita entrada inválida", () => {
    expect(resolvePhoneInput("123")).toEqual({ error: "invalid_phone" });
    expect(resolvePhoneInput(null)).toEqual({ error: "invalid_phone" });
  });
});

describe("resolveAccountSchema", () => {
  it("aceita displayName opcional", () => {
    expect(resolveAccountSchema.safeParse({ phone: "5511999999999" }).success).toBe(true);
    expect(resolveAccountSchema.safeParse({ phone: "5511999999999", displayName: "João" }).success).toBe(true);
  });
  it("rejeita body sem telefone", () => {
    expect(resolveAccountSchema.safeParse({}).success).toBe(false);
  });
});

describe("isRecentlyActive", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  it("true para atividade recente", () => {
    expect(isRecentlyActive("2026-01-01T11:55:00Z", now)).toBe(true);
  });
  it("false para atividade antiga ou ausente", () => {
    expect(isRecentlyActive("2026-01-01T10:00:00Z", now)).toBe(false);
    expect(isRecentlyActive(null, now)).toBe(false);
  });
});

describe("toAccountPayload", () => {
  it("projeta campos em camelCase", () => {
    const payload = toAccountPayload({
      id: "a", user_id: "u", phone: "5511999999999", normalized_phone: "5511999999999",
      display_name: null, status: "active", last_seen_at: null,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    });
    expect(payload.normalizedPhone).toBe("5511999999999");
    expect(payload.status).toBe("active");
  });
});
