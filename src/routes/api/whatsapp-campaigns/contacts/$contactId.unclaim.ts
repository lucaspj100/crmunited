// POST /api/whatsapp-campaigns/contacts/:contactId/unclaim  { campaignId, whatsappAccountId, reservationId, attemptId }
// F3-B: desfaz o claim DESTA tentativa (sending -> reserved). Só é chamado quando há prova de que nada foi enviado.
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/whatsapp-accounts.server";
import { handleCampaignRpc } from "@/lib/whatsapp-campaigns.server";
import { unclaimBodySchema, uuidSchema } from "@/lib/whatsapp-campaigns";

export const Route = createFileRoute("/api/whatsapp-campaigns/contacts/$contactId/unclaim")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = uuidSchema.safeParse(params.contactId);
        if (!id.success) return json({ ok: false, error: "contact_not_found" }, 404);
        return handleCampaignRpc(request, unclaimBodySchema, (sb, body) =>
          sb.rpc("wa_campaign_unclaim", {
            _contact_id: id.data,
            _campaign_id: body.campaignId,
            _account_id: body.whatsappAccountId,
            _reservation_id: body.reservationId,
            _attempt_id: body.attemptId,
          }),
        );
      },
    },
  },
});
