// POST /api/whatsapp-campaigns/contacts/:contactId/claim  { campaignId, whatsappAccountId, reservationId, attemptId }
// F3-B: claim atômico reserved -> sending ANTES do envio. Replay com o mesmo attemptId → { ok:true, already:true }.
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/whatsapp-accounts.server";
import { handleCampaignRpc } from "@/lib/whatsapp-campaigns.server";
import { claimBodySchema, uuidSchema } from "@/lib/whatsapp-campaigns";

export const Route = createFileRoute("/api/whatsapp-campaigns/contacts/$contactId/claim")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = uuidSchema.safeParse(params.contactId);
        if (!id.success) return json({ ok: false, error: "contact_not_found" }, 404);
        return handleCampaignRpc(request, claimBodySchema, (sb, body) =>
          sb.rpc("wa_campaign_claim", {
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
