import { describe, expect, it } from "vitest";
import {
  clampLimit,
  httpStatusFor,
  sanitizeErrorCode,
  reserveBodySchema,
  releaseBodySchema,
  toActiveCampaignsPayload,
  attemptBodySchema,
  claimBodySchema,
  failedBodySchema,
  sentBodySchema,
  unclaimBodySchema,
} from "./whatsapp-campaigns";

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

describe("F3-A regras", () => {
  const ACC = "00000000-0000-4000-8000-000000000000";
  const RES = "11111111-1111-4111-8111-111111111111";
  it("release exige whatsappAccountId e reservationId UUID; ignora userId/campos extras", () => {
    expect(releaseBodySchema.safeParse({ whatsappAccountId: ACC }).success).toBe(false);
    expect(releaseBodySchema.safeParse({ whatsappAccountId: ACC, reservationId: "lote-1" }).success).toBe(false);
    const r = releaseBodySchema.parse({ whatsappAccountId: ACC, reservationId: RES, userId: "hacker", contactIds: ["x"] });
    expect(r).toEqual({ whatsappAccountId: ACC, reservationId: RES });
  });
  it("listagem projeta só id, name, status, pendingCount", () => {
    expect(
      toActiveCampaignsPayload([
        { id: "a", name: "Outubro", status: "active", pendingCount: 7, created_by: "u", secret: 1 },
        { id: "b", name: "X", status: "active", pendingCount: "3" },
        { id: 1, name: "inválida" },
        null,
      ]),
    ).toEqual([
      { id: "a", name: "Outubro", status: "active", pendingCount: 7 },
      { id: "b", name: "X", status: "active", pendingCount: 3 },
    ]);
    expect(toActiveCampaignsPayload(undefined)).toEqual([]);
  });
  it("erros do release mapeiam como os da F2", () => {
    expect(httpStatusFor("unauthorized")).toBe(401);
    expect(httpStatusFor("account_not_allowed")).toBe(403);
    expect(httpStatusFor("campaign_not_found")).toBe(404);
  });
});

describe("F3-B contratos", () => {
  const ids = {
    campaignId: "8a9e44f5-5479-4348-8668-df5bf133bda6",
    whatsappAccountId: "a0000000-0000-4000-8000-00000000000a",
    reservationId: "e0000000-0000-4000-8000-00000000000e",
    attemptId: "f0000000-0000-4000-8000-00000000000f",
  };
  it("claim/unclaim/sent exigem os 4 UUIDs e descartam campos extras", () => {
    for (const schema of [attemptBodySchema, claimBodySchema, unclaimBodySchema, sentBodySchema]) {
      expect(schema.parse({ ...ids, status: "sent", userId: "x" })).toEqual(ids);
      for (const k of Object.keys(ids)) {
        const partial: Record<string, string> = { ...ids };
        delete partial[k];
        expect(schema.safeParse(partial).success).toBe(false);
        expect(schema.safeParse({ ...ids, [k]: "nao-uuid" }).success).toBe(false);
      }
    }
  });
  it("failed aceita só os códigos da fila do CRM", () => {
    for (const code of ["invalid_number", "not_on_whatsapp", "manual_confirmed_not_sent"]) {
      expect(failedBodySchema.safeParse({ ...ids, errorCode: code }).success).toBe(true);
    }
    for (const code of ["timeout", "ui_error", "unknown", "manual_not_delivered", undefined]) {
      expect(failedBodySchema.safeParse({ ...ids, errorCode: code }).success).toBe(false);
    }
    expect(sanitizeErrorCode("manual_confirmed_not_sent")).toBe("manual_confirmed_not_sent");
  });
  it("erros da F3-B mapeiam para 409/404", () => {
    for (const e of ["reservation_mismatch", "already_sending", "already_finalized", "attempt_mismatch", "not_claimed", "reservation_expired", "campaign_not_active"]) {
      expect(httpStatusFor(e)).toBe(409);
    }
    expect(httpStatusFor("contact_not_found")).toBe(404);
  });
});
