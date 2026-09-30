// POST /api/whatsapp-campaigns/:campaignId/release  { whatsappAccountId, reservationId }
// F3-A: devolve a pending SÓ os contatos ainda reserved do lote (campanha + conta + reservationId).
// Não incrementa attempts. Idempotente: { ok: true, released: 0 } quando não há mais nada a liberar.
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/whatsapp-accounts.server";
import { handleCampaignRpc } from "@/lib/whatsapp-campaigns.server";
import { releaseBodySchema, uuidSchema } from "@/lib/whatsapp-campaigns";

export const Route = createFileRoute("/api/whatsapp-campaigns/$campaignId/release")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = uuidSchema.safeParse(params.campaignId);
        if (!id.success) return json({ ok: false, error: "campaign_not_found" }, 404);
        return handleCampaignRpc(request, releaseBodySchema, (sb, body) =>
          sb.rpc("wa_campaign_release", {
            _campaign_id: id.data,
            _account_id: body.whatsappAccountId,
            _reservation_id: body.reservationId,
          }),
        );
      },
    },
  },
});
