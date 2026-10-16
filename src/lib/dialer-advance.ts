/**
 * Escolha do próximo contato do Discador a partir da fila já carregada.
 * Mesma regra do avanço original: primeiro contato POSTERIOR ao atual que
 * ainda esteja disponível; senão, a mesma posição da fila; nunca o próprio
 * contato trabalhado (nem os excluídos), salvo se for o único.
 */
export function pickNextContactId(
  prevActiveIds: string[],
  currentId: string,
  availableIds: string[],
  exclude: ReadonlySet<string> = new Set(),
): string | null {
  const blocked = (id: string) => id === currentId || exclude.has(id);
  const available = availableIds.filter((id) => !exclude.has(id) || id === currentId);
  if (available.length === 0) return null;
  const availableSet = new Set(available);
  const idx = prevActiveIds.indexOf(currentId);
  const tail = idx >= 0 ? prevActiveIds.slice(idx + 1) : [];
  const fromTail = tail.find((id) => !blocked(id) && availableSet.has(id));
  if (fromTail) return fromTail;
  const anchor = idx >= 0 ? idx : 0;
  const clamped = Math.min(Math.max(anchor, 0), available.length - 1);
  const candidate = available[clamped]!;
  if (!blocked(candidate)) return candidate;
  return available.find((id) => !blocked(id)) ?? (exclude.has(candidate) ? null : candidate);
}

/**
 * Próximo contato usando SÓ a fila local (sem esperar o banco). Retorna null
 * quando não há outro contato local — nesse caso o chamador deve buscar dados
 * novos antes de declarar que a fila terminou.
 */
export function pickLocalNext(
  prevActiveIds: string[],
  currentId: string,
  exclude: ReadonlySet<string> = new Set(),
): string | null {
  const remaining = prevActiveIds.filter((id) => id !== currentId && !exclude.has(id));
  if (remaining.length === 0) return null;
  return pickNextContactId(prevActiveIds, currentId, remaining, exclude);
}

/**
 * Decide se o contato lido da sessão compartilhada (a cada 2s ou via Realtime)
 * pode substituir o contato da tela. Descarta respostas antigas.
 */
export function shouldApplyRemoteContact(p: {
  remote: string | null;
  current: string | null;
  /** selectionSeq no início da consulta (polling) — omitido no Realtime. */
  seqAtStart?: number;
  seqNow: number;
  /** Gravações do contato atual ainda em andamento. */
  pendingWrites: number;
  /** A última gravação do contato atual falhou (banco ainda tem o valor antigo). */
  localWriteFailed: boolean;
  /** Contatos recém-trabalhados ainda não confirmados pela fila atualizada. */
  worked: ReadonlySet<string>;
}): boolean {
  if (p.remote === p.current) return false;
  if (p.seqAtStart !== undefined && p.seqAtStart !== p.seqNow) return false; // navegou durante a consulta
  if (p.pendingWrites > 0) return false; // banco ainda não recebeu a navegação local
  if (p.localWriteFailed) return false; // banco tem valor antigo; o certo é regravar
  if (p.remote && p.worked.has(p.remote)) return false; // nunca volta ao recém-trabalhado
  return true;
}
