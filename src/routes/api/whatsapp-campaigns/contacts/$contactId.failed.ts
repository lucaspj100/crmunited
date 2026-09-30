// POST /api/whatsapp-campaigns/contacts/:contactId/failed  { whatsappAccountId, errorCode }
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/whatsapp-accounts.server";
import { handleCampaignRpc } from "@/lib/whatsapp-campaigns.server";
import { failedBodySchema, sanitizeErrorCode, uuidSchema } from "@/lib/whatsapp-campaigns";

export const Route = createFileRoute("/api/whatsapp-campaigns/contacts/$contactId/failed")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = uuidSchema.safeParse(params.contactId);
        if (!id.success) return json({ ok: false, error: "contact_not_found" }, 404);
        return handleCampaignRpc(request, failedBodySchema, (sb, body) =>
          sb.rpc("wa_campaign_mark_failed", {
            _contact_id: id.data,
            _account_id: body.whatsappAccountId,
            _error_code: sanitizeErrorCode(body.errorCode),
          }),
        );
      },
    },
  },
});
