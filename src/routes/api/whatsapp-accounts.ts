// GET /api/whatsapp-accounts
// Lista as contas visíveis ao usuário autenticado (RLS decide: próprias ou todas para ADM).
import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest, json } from "@/lib/whatsapp-accounts.server";
import { toAccountPayload, type WhatsappAccountRow } from "@/lib/whatsapp-accounts";

export const Route = createFileRoute("/api/whatsapp-accounts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateRequest(request);
        if ("error" in auth) {
          return auth.error === "unauthorized"
            ? json({ ok: false, error: "unauthorized" }, 401)
            : json({ ok: false, error: "server_error" }, 500);
        }

        const { data, error } = await auth.supabase
          .from("whatsapp_accounts")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[whatsapp-accounts] erro na consulta", error);
          return json({ ok: false, error: "query_error" }, 500);
        }

        return json(
          { ok: true, accounts: (data ?? []).map((r) => toAccountPayload(r as WhatsappAccountRow)) },
          200,
        );
      },
    },
  },
});
