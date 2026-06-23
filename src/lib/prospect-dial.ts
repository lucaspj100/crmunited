// Computa o número que será efetivamente discado pelo chip do vendedor.
// Não altera telefone_normalizado (sempre +55DDDNUMERO no banco).

export type DialerSettings = {
  ddd_origem: string; // 2 dígitos
  prefixo_interurbano: string; // 1 a 5 dígitos, começa com 0 (ex.: 0, 015, 021, 041)
};

export const DEFAULT_DIALER_SETTINGS: DialerSettings = {
  ddd_origem: "11",
  prefixo_interurbano: "015",
};

export function validateDialerSettings(s: DialerSettings): string | null {
  if (!/^[0-9]{2}$/.test(s.ddd_origem)) return "DDD de origem deve ter exatamente 2 dígitos.";
  if (!/^0[0-9]{0,4}$/.test(s.prefixo_interurbano))
    return "Informe um prefixo de interurbano válido, usando apenas números e começando com 0. Exemplos: 0, 015 ou 021.";
  return null;
}

// telefoneNormalizado: dígitos puros, ex.: "5511999998888" (12 ou 13 dígitos)
export function buildDialNumber(
  telefoneNormalizado: string | null | undefined,
  settings: DialerSettings,
): { dial: string; dddDestino: string | null } {
  if (!telefoneNormalizado) return { dial: "", dddDestino: null };
  const digits = String(telefoneNormalizado).replace(/\D/g, "");
  if (digits.length < 12 || !digits.startsWith("55")) {
    return { dial: digits, dddDestino: null };
  }
  const dddDestino = digits.slice(2, 4);
  const local = digits.slice(4);
  if (dddDestino === settings.ddd_origem) {
    return { dial: local, dddDestino };
  }
  return {
    dial: `${settings.prefixo_interurbano}${dddDestino}${local}`,
    dddDestino,
  };
}
