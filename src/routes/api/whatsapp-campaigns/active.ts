// GET /api/whatsapp-campaigns/active
// F3-A: campanhas ACTIVE disponíveis para qualquer usuário autenticado (vendedor incluso),
// via função SECURITY DEFINER — a RLS das tabelas continua só ADM/franqueado.
// Retorna só { id, name, status, pendingCount }.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest, json } from "@/lib/whatsapp-accounts.server";
import { httpStatusFor, toActiveCampaignsPayload } from "@/lib/whatsapp-campaigns";

export const Route = createFileRoute("/api/whatsapp-campaigns/active")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateRequest(request);
        if ("error" in auth) {
          return auth.error === "unauthorized"
            ? json({ ok: false, error: "unauthorized" }, 401)
            : json({ ok: false, error: "server_error" }, 500);
        }
        const { data, error } = await auth.supabase.rpc("wa_campaign_list_active");
        if (error || !data) {
          console.error("[whatsapp-campaigns/active] erro na RPC", error);
          return json({ ok: false, error: "query_error" }, 500);
        }
        const result = data as { ok?: boolean; error?: string; campaigns?: unknown };
        if (!result.ok) return json({ ok: false, error: result.error ?? "query_error" }, httpStatusFor(result.error));
        return json({ ok: true, campaigns: toActiveCampaignsPayload(result.campaigns) }, 200);
      },
    },
  },
});
