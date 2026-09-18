// Lógica pura das contas de WhatsApp vinculadas a usuários do CRM.
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

export const resolveAccountSchema = z.object({
  phone: z.string().trim().min(8).max(30),
  displayName: z.string().trim().min(1).max(120).optional().nullable(),
});

export type WhatsappAccountRow = {
  id: string;
  user_id: string;
  phone: string;
  normalized_phone: string;
  display_name: string | null;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsappAccountPayload = {
  id: string;
  userId: string;
  phone: string;
  normalizedPhone: string;
  displayName: string | null;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function resolvePhoneInput(raw: unknown): { normalized: string } | { error: "invalid_phone" } {
  if (typeof raw !== "string") return { error: "invalid_phone" };
  const parsed = z.string().trim().min(8).max(30).safeParse(raw);
  if (!parsed.success) return { error: "invalid_phone" };
  const { normalized, valid } = normalizePhone(parsed.data);
  if (!valid || !normalized) return { error: "invalid_phone" };
  return { normalized };
}

export function toAccountPayload(row: WhatsappAccountRow): WhatsappAccountPayload {
  return {
    id: row.id,
    userId: row.user_id,
    phone: row.phone,
    normalizedPhone: row.normalized_phone,
    displayName: row.display_name ?? null,
    status: row.status,
    lastSeenAt: row.last_seen_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Considera "conectado" quando houve atividade nos últimos 10 minutos. */
export const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export function isRecentlyActive(lastSeenAt: string | null, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= ONLINE_WINDOW_MS;
}
