// Regras puras da F2 (reserva/envio/falha de contatos de campanha WhatsApp).
// A validação real (dono da conta, campanha ativa, atomicidade) acontece no banco.
import { z } from "zod";

export const RESERVE_MIN = 1;
export const RESERVE_MAX = 50;
export const RESERVE_DEFAULT = 20;
export const RESERVATION_TTL_MINUTES = 10;

export const ERROR_CODES = [
  "invalid_number",
  "not_on_whatsapp",
  "blocked",
  "timeout",
  "ui_error",
  "unknown",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return RESERVE_DEFAULT;
  return Math.max(RESERVE_MIN, Math.min(RESERVE_MAX, Math.trunc(n)));
}

export function sanitizeErrorCode(raw: unknown): ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(raw as string) ? (raw as ErrorCode) : "unknown";
}

const uuid = z.string().uuid();
export const uuidSchema = uuid;
export const reserveBodySchema = z.object({ whatsappAccountId: uuid, limit: z.unknown().optional() });
export const sentBodySchema = z.object({ whatsappAccountId: uuid });
export const failedBodySchema = z.object({ whatsappAccountId: uuid, errorCode: z.unknown().optional() });

/** Mapeia o erro devolvido pelas funções do banco para o status HTTP. */
export function httpStatusFor(error: string | undefined): number {
  switch (error) {
    case undefined:
      return 200;
    case "unauthorized":
      return 401;
    case "account_not_allowed":
      return 403;
    case "campaign_not_found":
    case "contact_not_found":
      return 404;
    case "campaign_not_active":
    case "reserved_by_other_account":
    case "reservation_expired":
    case "already_sent":
    case "invalid_status":
      return 409;
    default:
      return 500;
  }
}
