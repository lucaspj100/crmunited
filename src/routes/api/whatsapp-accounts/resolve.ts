// POST /api/whatsapp-accounts/resolve
// Registra (ou resgata) a conta de WhatsApp do usuário autenticado.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest, json } from "@/lib/whatsapp-accounts.server";
import {
  resolveAccountSchema,
  resolvePhoneInput,
  toAccountPayload,
  type WhatsappAccountRow,
} from "@/lib/whatsapp-accounts";

export const Route = createFileRoute("/api/whatsapp-accounts/resolve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateRequest(request);
        if ("error" in auth) {
          return auth.error === "unauthorized"
            ? json({ ok: false, error: "unauthorized" }, 401)
            : json({ ok: false, error: "server_error" }, 500);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "invalid_body" }, 400);
        }

        const parsed = resolveAccountSchema.safeParse(body);
        if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);

        const phone = resolvePhoneInput(parsed.data.phone);
        if ("error" in phone) return json({ ok: false, error: "invalid_phone" }, 400);

        const { supabase, userId } = auth;
        const nowIso = new Date().toISOString();

        const { data, error } = await supabase
          .from("whatsapp_accounts")
          .upsert(
            {
              user_id: userId,
              phone: parsed.data.phone.trim(),
              normalized_phone: phone.normalized,
              display_name: parsed.data.displayName ?? null,
              status: "active",
              last_seen_at: nowIso,
            },
            { onConflict: "user_id,normalized_phone" },
          )
          .select("*")
          .single();

        if (error || !data) {
          console.error("[whatsapp-accounts/resolve] erro no upsert", error);
          return json({ ok: false, error: "query_error" }, 500);
        }

        return json({ ok: true, account: toAccountPayload(data as WhatsappAccountRow) }, 200);
      },
    },
  },
});
