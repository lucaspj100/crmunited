// Endpoint público server-to-server para o LinkedIn Message Tracker.
// Permite que o projeto externo descubra o vendedor vinculado a um e-mail.
// Protegido por segredo compartilhado no header — nunca expõe chaves do CRM.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email().max(200),
});

const MAX_BODY_BYTES = 4 * 1024;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, x-tracker-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });

export const Route = createFileRoute("/api/public/find-seller-by-email")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "content-type, x-tracker-secret",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
          },
        }),
      POST: async ({ request }) => {
        const secret = process.env["TRACKER_INTEGRATION_SECRET"];
        if (!secret) {
          console.error("[tracker] TRACKER_INTEGRATION_SECRET não configurado");
          return json({ ok: false, error: "not_configured" }, 503);
        }

        const provided = request.headers.get("x-tracker-secret") ?? "";
        if (provided.length !== secret.length || provided !== secret) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
          return json({ ok: false, error: "payload_too_large" }, 413);
        }

        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(raw);
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const parsed = schema.safeParse(parsedBody);
        if (!parsed.success) {
          return json({ ok: false, error: "invalid_payload" }, 400);
        }

        const normalizedEmail = parsed.data.email.trim().toLowerCase();

        // Importação dinâmica dentro do handler para garantir que o client admin
        // nunca vá parar no bundle do navegador.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email")
          .ilike("email", normalizedEmail);

        if (profilesError) {
          console.error("[tracker] erro ao consultar profiles", profilesError);
          return json({ ok: false, error: "query_error" }, 500);
        }

        const matches: Array<{
          id: string;
          name: string | null;
          email: string | null;
          role: string;
          active: boolean;
        }> = [];

        for (const profile of profiles ?? []) {
          const { data: roles, error: rolesError } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", profile.id);

          if (rolesError) {
            console.error("[tracker] erro ao consultar user_roles", rolesError);
            continue;
          }

          const sellerRole = roles?.find((r) => r.role === "vendedor");
          if (!sellerRole) continue;

          matches.push({
            id: profile.id,
            name: profile.full_name,
            email: profile.email,
            role: sellerRole.role,
            active: true,
          });
        }

        return json({ ok: true, matches }, 200);
      },
    },
  },
});
