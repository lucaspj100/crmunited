import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin required");
}

// ============= COLABORADORES + REGRAS =============
export const lcListConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: rules, error: ruErr }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, full_name, email").order("full_name"),
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin
          .from("leadership_commission_rules")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);
    if (ruErr) throw new Error(ruErr.message);

    const roleByUser = new Map<string, string>();
    for (const r of roles ?? []) {
      const prev = roleByUser.get(r.user_id);
      const rank = (x: string) => (x === "admin" ? 1 : x === "franqueado" ? 2 : 3);
      if (!prev || rank(r.role) < rank(prev)) roleByUser.set(r.user_id, r.role);
    }

    const activeIndividual = new Map<string, any>();
    const activeRole = new Map<string, any>();
    for (const r of rules ?? []) {
      if (!r.is_active) continue;
      if (r.rule_scope === "individual" && r.employee_id) activeIndividual.set(r.employee_id, r);
      if (r.rule_scope === "role" && r.role_name) activeRole.set(r.role_name, r);
    }

    return {
      employees: (profiles ?? []).map((p: any) => {
        const role = roleByUser.get(p.id) ?? null;
        const individual = activeIndividual.get(p.id) ?? null;
        const roleRule = role ? activeRole.get(role) ?? null : null;
        return {
          ...p,
          role,
          rule: individual,
          effective_rule: individual ?? roleRule,
          effective_source: individual ? "individual" : roleRule ? "role" : "none",
        };
      }),
      roleRules: Array.from(activeRole.values()),
      allRules: rules ?? [],
    };
  });

const ruleInput = z.object({
  id: z.string().uuid().optional(),
  rule_scope: z.enum(["individual", "role"]),
  employee_id: z.string().uuid().nullable().optional(),
  role_name: z.enum(["admin", "franqueado", "vendedor"]).nullable().optional(),
  commission_type: z.enum(["percentage", "fixed"]),
  commission_percentage: z.number().min(0).nullable().optional(),
  fixed_amount: z.number().min(0).nullable().optional(),
  valid_from: z.string(),
  valid_until: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const lcSaveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ruleInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const isPct = data.commission_type === "percentage";
    const payload: any = {
      rule_scope: data.rule_scope,
      employee_id: data.rule_scope === "individual" ? data.employee_id ?? null : null,
      role_name: data.rule_scope === "role" ? data.role_name ?? null : null,
      commission_type: data.commission_type,
      commission_percentage: isPct ? data.commission_percentage ?? 0 : null,
      fixed_amount: isPct ? null : data.fixed_amount ?? 0,
      valid_from: data.valid_from,
      valid_until: data.valid_until || null,
      is_active: data.is_active ?? true,
      notes: data.notes ?? null,
      updated_by: context.userId,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("leadership_commission_rules").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    // Desativa regra ativa anterior do mesmo alvo (histórico preservado)
    const q = supabaseAdmin
      .from("leadership_commission_rules")
      .update({ is_active: false, updated_by: context.userId })
      .eq("is_active", true)
      .eq("rule_scope", data.rule_scope);
    if (data.rule_scope === "individual") await q.eq("employee_id", data.employee_id!);
    else await q.eq("role_name", data.role_name!);

    const { data: inserted, error } = await supabaseAdmin
      .from("leadership_commission_rules")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const lcToggleRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), is_active: z.boolean() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leadership_commission_rules")
      .update({ is_active: data.is_active, updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= HISTÓRICO =============
export const lcListCommissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ start: z.string(), end: z.string() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("leadership_commissions")
      .select("*")
      .gte("enrollment_date", data.start)
      .lte("enrollment_date", data.end)
      .order("enrollment_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const lcListAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ commissionId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("leadership_commission_audit_logs")
      .select("*")
      .eq("commission_id", data.commissionId)
      .order("changed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============= MUDANÇA DE STATUS =============
export const lcSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["prevista", "confirmada", "paga", "cancelada", "estornada"]),
      payment_date: z.string().nullable().optional(),
      reason: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before, error: bErr } = await supabaseAdmin
      .from("leadership_commissions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (bErr) throw new Error(bErr.message);

    const patch: any = { commission_status: data.status };
    if (data.status === "paga") {
      patch.payment_date = data.payment_date ?? new Date().toISOString().slice(0, 10);
      patch.paid_by = context.userId;
      patch.paid_at = new Date().toISOString();
    }
    if (data.status === "estornada" && before.commission_status === "paga") {
      patch.needs_compensation = true;
    }

    const { data: after, error } = await supabaseAdmin
      .from("leadership_commissions")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("leadership_commission_audit_logs").insert({
      commission_id: data.id,
      action: `status_${data.status}`,
      previous_data: before,
      new_data: after,
      reason: data.reason ?? null,
      changed_by: context.userId,
    });

    return { ok: true };
  });

// ============= EDIÇÃO MANUAL =============
export const lcEditCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      commission_amount: z.number().min(0).nullable().optional(),
      notes: z.string().nullable().optional(),
      reason: z.string().min(3),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before, error: bErr } = await supabaseAdmin
      .from("leadership_commissions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (bErr) throw new Error(bErr.message);

    const patch: any = {};
    if (data.commission_amount !== undefined) patch.commission_amount = data.commission_amount;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (before.commission_status === "nao_configurada" && data.commission_amount != null) {
      patch.commission_status = "prevista";
    }

    const { data: after, error } = await supabaseAdmin
      .from("leadership_commissions")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("leadership_commission_audit_logs").insert({
      commission_id: data.id,
      action: "manual_edit",
      previous_data: before,
      new_data: after,
      reason: data.reason,
      changed_by: context.userId,
    });

    return { ok: true };
  });

// ============= RECÁLCULO / GERAÇÃO =============
export const lcRecalculate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), reason: z.string().min(3) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before, error: bErr } = await supabaseAdmin
      .from("leadership_commissions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (bErr) throw new Error(bErr.message);

    const { error: rpcErr } = await supabaseAdmin.rpc("ensure_leadership_commission", {
      _lead_id: before.lead_id,
      _recalculate: true,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    const { data: after } = await supabaseAdmin
      .from("leadership_commissions")
      .select("*")
      .eq("id", data.id)
      .single();

    await supabaseAdmin.from("leadership_commission_audit_logs").insert({
      commission_id: data.id,
      action: "recalculate",
      previous_data: before,
      new_data: after,
      reason: data.reason,
      changed_by: context.userId,
    });

    return { ok: true };
  });

/** Gera comissões para matrículas já existentes no período (idempotente). */
export const lcBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ start: z.string(), end: z.string() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: leads, error } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("status", "matricula")
      .gte("enrollment_date", data.start)
      .lte("enrollment_date", data.end);
    if (error) throw new Error(error.message);

    let created = 0;
    for (const l of leads ?? []) {
      const { data: id } = await supabaseAdmin.rpc("ensure_leadership_commission", {
        _lead_id: l.id,
        _recalculate: false,
      });
      if (id) created++;
    }
    return { processed: (leads ?? []).length, touched: created };
  });
