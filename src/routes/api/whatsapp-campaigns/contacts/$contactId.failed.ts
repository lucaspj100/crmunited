// POST /api/whatsapp-campaigns/contacts/:contactId/failed  { campaignId, whatsappAccountId, reservationId, attemptId, errorCode }
// F3-B: finaliza como falha (terminal). Só aceita `sending` da MESMA tentativa.
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/whatsapp-accounts.server";
import { handleCampaignRpc } from "@/lib/whatsapp-campaigns.server";
import { failedBodySchema, uuidSchema } from "@/lib/whatsapp-campaigns";

export const Route = createFileRoute("/api/whatsapp-campaigns/contacts/$contactId/failed")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = uuidSchema.safeParse(params.contactId);
        if (!id.success) return json({ ok: false, error: "contact_not_found" }, 404);
        return handleCampaignRpc(request, failedBodySchema, (sb, body) =>
          sb.rpc("wa_campaign_mark_failed", {
            _contact_id: id.data,
            _campaign_id: body.campaignId,
            _account_id: body.whatsappAccountId,
            _reservation_id: body.reservationId,
            _attempt_id: body.attemptId,
            _error_code: body.errorCode,
          }),
        );
      },
    },
  },
});
