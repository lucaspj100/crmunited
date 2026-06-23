// Computa o número que será efetivamente discado pelo chip do vendedor.
// Não altera telefone_normalizado (sempre +55DDDNUMERO no banco).

export type DialerSettings = {
  ddd_origem: string; // 2 dígitos
  codigo_operadora_interurbano: string; // 2 dígitos
};

export const DEFAULT_DIALER_SETTINGS: DialerSettings = {
  ddd_origem: "11",
  codigo_operadora_interurbano: "15",
};

export function validateDialerSettings(s: DialerSettings): string | null {
  if (!/^[0-9]{2}$/.test(s.ddd_origem)) return "DDD de origem deve ter 2 dígitos.";
  if (!/^[0-9]{2}$/.test(s.codigo_operadora_interurbano)) return "Código da operadora deve ter 2 dígitos.";
  return null;
}

// telefoneNormalizado: dígitos puros, ex.: "5511999998888" (12 ou 13 dígitos)
export function buildDialNumber(
  telefoneNormalizado: string | null | undefined,
  settings: DialerSettings,
): { dial: string; dddDestino: string | null } {
  if (!telefoneNormalizado) return { dial: "", dddDestino: null };
  const digits = String(telefoneNormalizado).replace(/\D/g, "");
  // Esperado: 55 + DDD(2) + numero(8 ou 9)
  if (digits.length < 12 || !digits.startsWith("55")) {
    return { dial: digits, dddDestino: null };
  }
  const dddDestino = digits.slice(2, 4);
  const local = digits.slice(4);
  if (dddDestino === settings.ddd_origem) {
    return { dial: local, dddDestino };
  }
  return {
    dial: `0${settings.codigo_operadora_interurbano}${dddDestino}${local}`,
    dddDestino,
  };
}
