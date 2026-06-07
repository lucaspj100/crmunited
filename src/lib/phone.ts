// Normaliza telefone brasileiro para o padrão 55+DDD+NÚMERO (somente dígitos).
// Retorna { normalized, valid }.
// - normalized: string apenas com dígitos no padrão BR, ou null se vazio.
// - valid: true quando tem 12 (fixo) ou 13 (celular) dígitos no total.

export function normalizePhone(raw: string | null | undefined): { normalized: string | null; valid: boolean } {
  if (!raw) return { normalized: null, valid: false };
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return { normalized: null, valid: false };

  // Se começar com 0055 remove o duplo zero
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Se já tiver 55 + DDD + número (12 ou 13 dígitos), mantém
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return { normalized: digits, valid: true };
  }
  // Se tiver 10 ou 11 dígitos (DDD + número), adiciona 55
  if (digits.length === 10 || digits.length === 11) {
    return { normalized: "55" + digits, valid: true };
  }
  // Inválido — devolve como está só para auditoria
  return { normalized: digits, valid: false };
}
