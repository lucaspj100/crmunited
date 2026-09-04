// Endpoint autenticado para a extensão do WhatsApp.
// GET /api/find-lead-by-phone?phone=<telefone>
// Usa o access token do próprio usuário (Bearer) — sem service role, sem segredo
// estático — portanto a RLS existente de `leads` continua valendo.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { LEAD_FIELDS, resolvePhoneQuery, toLeadPayload, type LeadRow } from "@/lib/find-lead-by-phone";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/find-lead-by-phone")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
        const token = authHeader.slice("Bearer ".length).trim();
        if (!token) return json({ ok: false, error: "unauthorized" }, 401);

        const url = new URL(request.url);
        const phone = resolvePhoneQuery(url.searchParams.get("phone"));
        if ("error" in phone) return json({ ok: false, error: "invalid_phone" }, 400);

        const SUPABASE_URL = process.env["SUPABASE_URL"];
        const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          console.error("[find-lead-by-phone] variáveis do Supabase ausentes");
          return json({ ok: false, error: "query_error" }, 500);
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: authError } = await supabase.auth.getClaims(token);
        if (authError || !claims?.claims?.sub) return json({ ok: false, error: "unauthorized" }, 401);

        const { data, error } = await supabase
          .from("leads")
          .select(LEAD_FIELDS)
          .eq("phone_normalized", phone.normalized)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (error) {
          console.error("[find-lead-by-phone] erro na consulta", error);
          return json({ ok: false, error: "query_error" }, 500);
        }

        const row = (data ?? [])[0] as LeadRow | undefined;
        if (!row) return json({ ok: false, error: "not_found" }, 404);

        return json({ ok: true, lead: toLeadPayload(row) }, 200);
      },
    },
  },
});
