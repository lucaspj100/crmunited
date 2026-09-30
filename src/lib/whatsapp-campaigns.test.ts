import { describe, expect, it } from "vitest";
import { clampLimit, httpStatusFor, sanitizeErrorCode, reserveBodySchema } from "./whatsapp-campaigns";

describe("F2 regras", () => {
  it("limita o lote entre 1 e 50", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
    expect(clampLimit(1000)).toBe(50);
    expect(clampLimit(20)).toBe(20);
    expect(clampLimit("abc")).toBe(20);
    expect(clampLimit(undefined)).toBe(20);
  });
  it("aceita só códigos de erro da lista", () => {
    expect(sanitizeErrorCode("blocked")).toBe("blocked");
    expect(sanitizeErrorCode("Error: stack trace enorme...")).toBe("unknown");
    expect(sanitizeErrorCode(null)).toBe("unknown");
  });
  it("mapeia erros para HTTP", () => {
    expect(httpStatusFor("account_not_allowed")).toBe(403);
    expect(httpStatusFor("campaign_not_active")).toBe(409);
    expect(httpStatusFor("reserved_by_other_account")).toBe(409);
    expect(httpStatusFor("contact_not_found")).toBe(404);
  });
  it("ignora user_id vindo do body", () => {
    const r = reserveBodySchema.parse({
      whatsappAccountId: "00000000-0000-4000-8000-000000000000",
      userId: "hacker",
    });
    expect("userId" in r).toBe(false);
  });
});
