import { dispatchArenaEvent, type ArenaEventType } from "@/lib/arena-webhook.functions";

/**
 * Fire-and-forget: envia evento para o webhook da Arena sem bloquear a UI
 * e sem propagar erros caso a Arena esteja fora do ar.
 */
export function notifyArena(leadId: string, eventType: ArenaEventType): void {
  try {
    void dispatchArenaEvent({ data: { leadId, eventType } }).catch((err) => {
      console.error("[arena] dispatch failed", eventType, err);
    });
  } catch (err) {
    console.error("[arena] dispatch threw", eventType, err);
  }
}
