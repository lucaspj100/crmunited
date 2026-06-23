import { normalizePhone } from "@/lib/phone";

export type NormalizedProspectPhone = {
  normalized: string | null; // dígitos puros padrão BR (55 + DDD + número)
  ddd: string | null;
  valid: boolean;
  telLink: string | null; // tel:+55...
  waLink: string | null; // https://wa.me/55...
};

export function normalizeProspectPhone(raw: string | null | undefined): NormalizedProspectPhone {
  const { normalized, valid } = normalizePhone(raw);
  if (!normalized) return { normalized: null, ddd: null, valid: false, telLink: null, waLink: null };
  const digits = normalized; // já em 55XXYYYYYYYY
  const ddd = digits.length >= 4 ? digits.slice(2, 4) : null;
  return {
    normalized: digits,
    ddd,
    valid,
    telLink: `tel:+${digits}`,
    waLink: `https://wa.me/${digits}`,
  };
}
