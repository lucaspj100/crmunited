// Lógica pura da consulta de lead por telefone (usada pelo endpoint autenticado
// /api/find-lead-by-phone). Mantida separada para permitir testes sem rede.
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

export const phoneQuerySchema = z.object({
  phone: z.string().trim().min(8).max(30),
});

export const LEAD_FIELDS = "id, name, phone, company, status, owner_id, updated_at";

export type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
  owner_id: string | null;
  updated_at: string | null;
};

export type LeadPayload = LeadRow;

/** Valida o query param e devolve o telefone normalizado (55 + DDD + número). */
export function resolvePhoneQuery(raw: string | null): { normalized: string } | { error: "invalid_phone" } {
  const parsed = phoneQuerySchema.safeParse({ phone: raw ?? "" });
  if (!parsed.success) return { error: "invalid_phone" };

  const { normalized, valid } = normalizePhone(parsed.data.phone);
  if (!valid || !normalized) return { error: "invalid_phone" };
  return { normalized };
}

/** Projeta apenas os campos permitidos na resposta pública do endpoint. */
export function toLeadPayload(row: LeadRow): LeadPayload {
  return {
    id: row.id,
    name: row.name ?? null,
    phone: row.phone ?? null,
    company: row.company ?? null,
    status: row.status ?? null,
    owner_id: row.owner_id ?? null,
    updated_at: row.updated_at ?? null,
  };
}
