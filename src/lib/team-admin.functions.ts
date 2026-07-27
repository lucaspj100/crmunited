import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin required");
}

// ============= LIST TEAMS (com contagem e integrantes) =============
export const adminListTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: teams, error: tErr }, { data: profiles, error: pErr }] = await Promise.all([
      supabaseAdmin.from("teams").select("*").order("is_primary", { ascending: false }).order("name"),
      supabaseAdmin.from("profiles").select("id, full_name, email, status, team_id"),
    ]);
    if (tErr) throw new Error(tErr.message);
    if (pErr) throw new Error(pErr.message);

    const byTeam = new Map<string, any[]>();
    for (const p of profiles ?? []) {
      const key = p.team_id ?? "__none__";
      const arr = byTeam.get(key) ?? [];
      arr.push(p);
      byTeam.set(key, arr);
    }

    return {
      teams: (teams ?? []).map((t: any) => ({
        ...t,
        manager_name:
          (profiles ?? []).find((p: any) => p.id === t.manager_id)?.full_name ?? null,
        member_count: (byTeam.get(t.id) ?? []).length,
        members: byTeam.get(t.id) ?? [],
      })),
      unassigned: byTeam.get("__none__") ?? [],
    };
  });

// ============= CREATE / UPDATE TEAM =============
export const adminSaveTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(2),
      description: z.string().optional().nullable(),
      manager_id: z.string().uuid().nullable().optional(),
      is_active: z.boolean().optional(),
      include_in_main_dashboard: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload = {
      name: data.name.trim(),
      description: data.description ?? null,
      manager_id: data.manager_id ?? null,
      is_active: data.is_active ?? true,
      include_in_main_dashboard: data.include_in_main_dashboard ?? false,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("teams").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabaseAdmin.from("teams").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

// ============= SET PRIMARY TEAM =============
export const adminSetPrimaryTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ teamId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: clearErr } = await supabaseAdmin
      .from("teams")
      .update({ is_primary: false })
      .eq("is_primary", true);
    if (clearErr) throw new Error(clearErr.message);

    const { error } = await supabaseAdmin
      .from("teams")
      .update({ is_primary: true, is_active: true, include_in_main_dashboard: true })
      .eq("id", data.teamId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= DELETE TEAM (bloqueia se houver usuários) =============
export const adminDeleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ teamId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: team, error: tErr } = await supabaseAdmin
      .from("teams").select("is_primary").eq("id", data.teamId).maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (team?.is_primary) throw new Error("Não é possível excluir a equipe principal.");

    const { count, error: cErr } = await supabaseAdmin
      .from("profiles").select("id", { count: "exact", head: true }).eq("team_id", data.teamId);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) {
      throw new Error("Esta equipe ainda possui usuários. Mova os integrantes antes de excluir.");
    }

    const { error } = await supabaseAdmin.from("teams").delete().eq("id", data.teamId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= MOVE USERS =============
export const adminMoveUsersToTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userIds: z.array(z.string().uuid()).min(1), teamId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: cErr } = await supabaseAdmin
      .from("profiles").select("id, team_id").in("id", data.userIds);
    if (cErr) throw new Error(cErr.message);

    const { error: upErr } = await supabaseAdmin
      .from("profiles").update({ team_id: data.teamId }).in("id", data.userIds);
    if (upErr) throw new Error(upErr.message);

    const history = (current ?? [])
      .filter((p: any) => p.team_id !== data.teamId)
      .map((p: any) => ({
        user_id: p.id,
        previous_team_id: p.team_id,
        new_team_id: data.teamId,
        changed_by: context.userId,
      }));
    if (history.length > 0) {
      await supabaseAdmin.from("team_membership_history").insert(history);
    }

    return { ok: true, moved: history.length };
  });
