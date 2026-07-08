import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "franqueado" | "vendedor";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin required");
}

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
  const base = [rand(upper), rand(upper), rand(lower), rand(lower), rand(digits), rand(digits), rand(special)];
  while (base.length < 12) base.push(rand(all));
  // shuffle
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return `United@${Math.floor(1000 + Math.random() * 9000)}${base.slice(0, 4).join("")}`;
}

// ============= LIST USERS =============
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: profiles, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, status, last_sign_in_at, sign_in_count, must_change_password, deactivated_at, created_at")
      .order("full_name", { ascending: true });
    if (pErr) throw new Error(pErr.message);

    const { data: rolesRows, error: rErr } = await context.supabase
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const rolesByUser = new Map<string, Role[]>();
    for (const r of rolesRows ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role as Role);
      rolesByUser.set(r.user_id, arr);
    }

    return (profiles ?? []).map((p: any) => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
    }));
  });

// ============= LIST ACCESS LOGS FOR ONE USER =============
export const adminListUserAccessLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: logs, error } = await context.supabase
      .from("access_logs")
      .select("*")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return logs ?? [];
  });

// ============= RESET WITH TEMP PASSWORD =============
export const adminResetPasswordTemp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tempPassword = generateTempPassword();

    const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: tempPassword,
    });
    if (upErr) throw new Error(upErr.message);

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true, status: "pendente_redefinicao" })
      .eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);

    await supabaseAdmin.from("access_logs").insert({
      user_id: data.userId,
      actor_id: context.userId,
      event_type: "password_reset_by_admin",
      status: "success",
      reason: "temp_password_generated",
    });

    return { tempPassword };
  });

// ============= SEND RESET EMAIL =============
export const adminSendResetEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prof?.email) throw new Error("Usuário sem e-mail cadastrado");

    // Try to generate a recovery link (works even without SMTP configured, but delivery requires SMTP)
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: prof.email,
    });
    if (linkErr) {
      return { sent: false, message: "Envio de e-mail ainda não configurado. Use a opção de senha temporária." };
    }

    await supabaseAdmin.from("access_logs").insert({
      user_id: data.userId,
      actor_id: context.userId,
      event_type: "password_reset_link_sent",
      status: "success",
    });

    return { sent: true, link: linkData?.properties?.action_link ?? null };
  });

// ============= SET USER STATUS =============
export const adminSetUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    userId: z.string().uuid(),
    status: z.enum(["ativo", "inativo", "bloqueado"]),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ban user in auth if inativo/bloqueado, unban if ativo
    const banDuration = data.status === "ativo" ? "none" : "876000h"; // ~100 years
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: banDuration,
    });
    if (banErr) throw new Error(banErr.message);

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        status: data.status,
        deactivated_at: data.status === "ativo" ? null : new Date().toISOString(),
      })
      .eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);

    await supabaseAdmin.from("access_logs").insert({
      user_id: data.userId,
      actor_id: context.userId,
      event_type: `status_changed_${data.status}`,
      status: "success",
    });

    return { ok: true };
  });

// ============= UPDATE USER ROLE =============
export const adminUpdateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    userId: z.string().uuid(),
    role: z.enum(["admin", "franqueado", "vendedor"]),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Replace roles: keep it simple, single-role model per user
    const { error: delErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin.from("access_logs").insert({
      user_id: data.userId,
      actor_id: context.userId,
      event_type: "role_changed",
      status: "success",
      metadata: { role: data.role },
    });

    return { ok: true };
  });

// ============= CHANGE OWN PASSWORD =============
export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8),
  }))
  .handler(async ({ data, context }) => {
    // Validate strength
    const pw = data.newPassword;
    if (!/[A-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
      throw new Error("Senha fraca: exige maiúscula, número e caractere especial");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Optional re-auth: if currentPassword provided, verify
    if (data.currentPassword) {
      const { data: userInfo, error: uErr } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      if (uErr) throw new Error(uErr.message);
      const email = userInfo?.user?.email;
      if (email) {
        const { createClient } = await import("@supabase/supabase-js");
        const tmp = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { error: signErr } = await tmp.auth.signInWithPassword({ email, password: data.currentPassword });
        if (signErr) throw new Error("Senha atual incorreta");
      }
    }

    const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.newPassword,
    });
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false, status: "ativo" })
      .eq("id", context.userId);

    await supabaseAdmin.from("access_logs").insert({
      user_id: context.userId,
      actor_id: context.userId,
      event_type: "password_changed",
      status: "success",
      reason: data.currentPassword ? "self_change" : "forced_after_reset",
    });

    return { ok: true };
  });
