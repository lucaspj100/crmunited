import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin required");
}

// ============= ADMIN: vendedores + regras =============
export const scListConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: rules, error: ruErr }] =
      await Promise.all([
        db.from("profiles").select("id, full_name, email").order("full_name"),
        db.from("user_roles").select("user_id, role"),
        db.from("seller_commission_rules").select("*").order("valid_from", { ascending: false }),
      ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);
    if (ruErr) throw new Error(ruErr.message);

    const roleByUser = new Map<string, string>();
    for (const r of roles ?? []) {
      const rank = (x: string) => (x === "admin" ? 1 : x === "franqueado" ? 2 : 3);
      const prev = roleByUser.get(r.user_id);
      if (!prev || rank(r.role) < rank(prev)) roleByUser.set(r.user_id, r.role);
    }

    const activeBySeller = new Map<string, any>();
    for (const r of rules ?? []) if (r.is_active) activeBySeller.set(r.seller_id, r);

    const sellers = (profiles ?? [])
      .filter((p: any) => roleByUser.get(p.id) === "vendedor")
      .map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        rule: activeBySeller.get(p.id) ?? null,
        history: (rules ?? []).filter((r: any) => r.seller_id === p.id),
      }));

    return { sellers };
  });

// ============= ADMIN: salvar percentual (histórico preservado) =============
export const scSaveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      seller_id: z.string().uuid(),
      commission_percentage: z.number().min(0).max(100),
      valid_from: z.string(),
      notes: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    // Encerra a vigência da regra ativa anterior (nunca apaga o histórico).
    const { data: current } = await db
      .from("seller_commission_rules")
      .select("id, valid_from")
      .eq("seller_id", data.seller_id)
      .eq("is_active", true)
      .maybeSingle();

    if (current) {
      const from = new Date(`${data.valid_from}T00:00:00`);
      from.setDate(from.getDate() - 1);
      const until = from.toISOString().slice(0, 10);
      const { error } = await db
        .from("seller_commission_rules")
        .update({
          is_active: false,
          valid_until: until >= current.valid_from ? until : current.valid_from,
          updated_by: context.userId,
        })
        .eq("id", current.id);
      if (error) throw new Error(error.message);
    }

    const { data: inserted, error } = await db
      .from("seller_commission_rules")
      .insert({
        seller_id: data.seller_id,
        commission_percentage: data.commission_percentage,
        valid_from: data.valid_from,
        notes: data.notes ?? null,
        is_active: true,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

// ============= ADMIN: histórico de comissões =============
export const scListCommissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ start: z.string(), end: z.string() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("seller_commissions")
      .select("*")
      .gte("enrollment_date", data.start)
      .lte("enrollment_date", data.end)
      .order("enrollment_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Gera comissões faltantes para matrículas existentes e reaplica o percentual
 * vigente apenas nas comissões "não configuradas". Comissões que já possuem
 * snapshot de percentual permanecem intactas.
 */
export const scGeneratePending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ start: z.string(), end: z.string() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: leads, error } = await db
      .from("leads")
      .select("id")
      .eq("status", "matricula")
      .gte("enrollment_date", data.start)
      .lte("enrollment_date", data.end);
    if (error) throw new Error(error.message);

    let processed = 0;
    for (const l of leads ?? []) {
      const { error: rpcErr } = await db.rpc("ensure_seller_commission", { _lead_id: l.id, _reprice: true });
      if (!rpcErr) processed += 1;
    }
    return { ok: true, processed };
  });

/** Recalcula o valor de uma comissão usando o MESMO percentual snapshot. */
export const scRecalculateOne = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ leadId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).rpc("ensure_seller_commission", {
      _lead_id: data.leadId,
      _reprice: false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= VENDEDOR: minhas comissões (RLS como o próprio usuário) =============
export const scMyCommissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ start: z.string(), end: z.string() }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const [{ data: rows, error }, { data: rule, error: rErr }] = await Promise.all([
      db
        .from("seller_commissions")
        .select("*")
        .eq("seller_id", context.userId)
        .gte("enrollment_date", data.start)
        .lte("enrollment_date", data.end)
        .order("enrollment_date", { ascending: false }),
      db
        .from("seller_commission_rules")
        .select("commission_percentage, valid_from")
        .eq("seller_id", context.userId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    if (rErr) throw new Error(rErr.message);
    return { rows: rows ?? [], rule: rule ?? null };
  });
