// POST /api/whatsapp-campaigns/:campaignId/reserve  { whatsappAccountId, limit }
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/whatsapp-accounts.server";
import { handleCampaignRpc } from "@/lib/whatsapp-campaigns.server";
import { clampLimit, reserveBodySchema, uuidSchema } from "@/lib/whatsapp-campaigns";

export const Route = createFileRoute("/api/whatsapp-campaigns/$campaignId/reserve")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = uuidSchema.safeParse(params.campaignId);
        if (!id.success) return json({ ok: false, error: "campaign_not_found" }, 404);
        return handleCampaignRpc(request, reserveBodySchema, (sb, body) =>
          sb.rpc("wa_campaign_reserve", {
            _campaign_id: id.data,
            _account_id: body.whatsappAccountId,
            _limit: clampLimit(body.limit),
          }),
        );
      },
    },
  },
});
