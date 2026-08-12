// Endpoint público server-to-server para o LinkedIn Message Tracker / Linked Stats.
// Recebe apenas metadados de envio (nunca conteúdo de mensagens) e registra
// 1 atividade de LinkedIn para o vendedor. Idempotente por (source, event_id).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  event_id: z.string().trim().min(8).max(200),
  crm_user_id: z.string().uuid(),
  sent_at: z.string().trim().min(10).max(40),
  source: z.string().trim().min(3).max(50).optional(),
  tracker_user_id: z.string().trim().max(200).optional().nullable(),
  installation_id: z.string().trim().max(200).optional().nullable(),
});

const MAX_BODY_BYTES = 4 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-tracker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export const Route = createFileRoute("/api/public/linkedin-message-event")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const secret = process.env["TRACKER_INTEGRATION_SECRET"];
        if (!secret) {
          console.error("[linkedin-tracker] TRACKER_INTEGRATION_SECRET não configurado");
          return json({ success: false, error: "not_configured" }, 503);
        }

        const provided = request.headers.get("x-tracker-secret") ?? "";
        if (provided.length !== secret.length || provided !== secret) {
          return json({ success: false, error: "unauthorized" }, 401);
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
          return json({ success: false, error: "payload_too_large" }, 413);
        }

        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(raw);
        } catch {
          return json({ success: false, error: "invalid_json" }, 400);
        }

        const parsed = schema.safeParse(parsedBody);
        if (!parsed.success) {
          return json({ success: false, error: "invalid_payload" }, 400);
        }

        const sentAt = new Date(parsed.data.sent_at);
        if (Number.isNaN(sentAt.getTime())) {
          return json({ success: false, error: "invalid_sent_at" }, 400);
        }

        const source = parsed.data.source ?? "linkedin_tracker";

        // Importação dinâmica dentro do handler: o client admin nunca vai para o bundle do navegador.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // O vendedor precisa existir e ter papel de vendedor na operação.
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", parsed.data.crm_user_id)
          .maybeSingle();

        if (profileError) {
          console.error("[linkedin-tracker] erro ao consultar profiles", profileError);
          return json({ success: false, error: "query_error" }, 500);
        }
        if (!profile) {
          return json({ success: false, error: "user_not_found" }, 404);
        }

        const { data: roles, error: rolesError } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", parsed.data.crm_user_id);

        if (rolesError) {
          console.error("[linkedin-tracker] erro ao consultar user_roles", rolesError);
          return json({ success: false, error: "query_error" }, 500);
        }
        if (!(roles ?? []).some((r) => r.role === "vendedor")) {
          return json({ success: false, error: "user_not_seller" }, 422);
        }

        const { error: insertError } = await supabaseAdmin.from("linkedin_message_events").insert({
          vendedor_id: parsed.data.crm_user_id,
          source,
          external_event_id: parsed.data.event_id,
          sent_at: sentAt.toISOString(),
          tracker_user_id: parsed.data.tracker_user_id ?? null,
          installation_id: parsed.data.installation_id ?? null,
        });

        // 23505 = unique violation → evento já processado (retry do Linked Stats).
        if (insertError) {
          if (insertError.code === "23505") {
            return json({ success: true, duplicate: true }, 200);
          }
          console.error("[linkedin-tracker] erro ao inserir evento", insertError);
          return json({ success: false, error: "insert_error" }, 500);
        }

        return json({ success: true, duplicate: false }, 200);
      },
    },
  },
});
