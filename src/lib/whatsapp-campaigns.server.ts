// Execução comum dos endpoints de campanha: autentica pelo Bearer e chama a RPC como o usuário.
import { authenticateRequest, json } from "@/lib/whatsapp-accounts.server";
import { httpStatusFor } from "@/lib/whatsapp-campaigns";
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type RpcResult = { ok: boolean; error?: string } & Record<string, unknown>;

export async function handleCampaignRpc<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  call: (
    supabase: SupabaseClient<Database>,
    body: z.infer<S>,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Response> {
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);

  const { data, error } = await call(auth.supabase, parsed.data);
  if (error || !data) {
    console.error("[whatsapp-campaigns] erro na RPC", error);
    return json({ ok: false, error: "query_error" }, 500);
  }
  const result = data as RpcResult;
  return json(result, result.ok ? 200 : httpStatusFor(result.error));
}
