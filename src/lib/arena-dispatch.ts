import { dispatchArenaEvent, type ArenaEventType } from "@/lib/arena-webhook.functions";

/**
 * Fire-and-forget: envia evento para o webhook da Arena sem bloquear a UI
 * e sem propagar erros caso a Arena esteja fora do ar.
 */
export function notifyArena(
  leadId: string,
  eventType: ArenaEventType,
  extra?: Record<string, unknown>,
): void {
  try {
    void dispatchArenaEvent({ data: { leadId, eventType, extra } }).catch((err) => {
      console.error("[arena] dispatch failed", eventType, err);
    });
  } catch (err) {
    console.error("[arena] dispatch threw", eventType, err);
  }
}

export type NotifyArenaResult =
  | { ok: true; httpStatus?: number | null; skipped?: boolean; reason?: string }
  | { ok: false; error: string; httpStatus?: number | null };

/**
 * Versão awaitável: usar em fluxos críticos (ex.: matrícula) onde o usuário
 * precisa saber se o evento chegou na Arena.
 */
export async function notifyArenaAsync(
  leadId: string,
  eventType: ArenaEventType,
  extra?: Record<string, unknown>,
): Promise<NotifyArenaResult> {
  try {
    const res = (await dispatchArenaEvent({ data: { leadId, eventType, extra } })) as {
      ok: boolean;
      httpStatus?: number | null;
      error?: string | null;
      skipped?: boolean;
      reason?: string;
    };
    if (res?.ok) {
      return { ok: true, httpStatus: res.httpStatus ?? null, skipped: res.skipped, reason: res.reason };
    }
    const errMsg = res?.error ?? res?.reason ?? "unknown_error";
    console.error("[arena] dispatch returned not-ok", eventType, leadId, res);
    return { ok: false, error: errMsg, httpStatus: res?.httpStatus ?? null };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error("[arena] dispatch threw", eventType, leadId, err);
    return { ok: false, error: message };
  }
}

