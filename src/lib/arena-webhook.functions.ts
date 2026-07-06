import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ARENA_EVENT_TYPES = [
  "crm_interview_scheduled",
  "crm_interview_done",
  "crm_interview_no_show",
  "crm_interview_rescheduled",
  "crm_enrollment_created",
  "crm_enrollment_cancelled",
  "crm_lost_after_interview",
] as const;

export type ArenaEventType = (typeof ARENA_EVENT_TYPES)[number];

function isArenaEventType(v: unknown): v is ArenaEventType {
  return typeof v === "string" && (ARENA_EVENT_TYPES as readonly string[]).includes(v);
}

export const dispatchArenaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { leadId: string; eventType: ArenaEventType; extra?: Record<string, unknown> }) => {
    if (!input || typeof input.leadId !== "string" || !isArenaEventType(input.eventType)) {
      throw new Error("invalid input");
    }
    if (input.extra !== undefined && (typeof input.extra !== "object" || input.extra === null)) {
      throw new Error("invalid extra");
    }
    return input;
  })

  .handler(async ({ data, context }) => {
    const { leadId, eventType, extra } = data;
    const webhookUrl = process.env.ARENA_CRM_WEBHOOK_URL;
    const secret = process.env.CRM_WEBHOOK_SECRET;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load lead via user-scoped client (RLS protects access)
    const { data: lead, error: leadErr } = await context.supabase
      .from("leads")
      .select(
        "id, name, phone, owner_id, status, interview_date, interview_time, interview_notes, enrollment_value, monthly_fee, material_value, enrollment_date"
      )
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr || !lead) {
      return { ok: false, skipped: true, reason: leadErr?.message ?? "lead_not_found" };
    }

    // Dedupe enrollments per lead
    if (eventType === "crm_enrollment_created") {
      const { data: existing } = await supabaseAdmin
        .from("crm_outbound_events")
        .select("id")
        .eq("crm_lead_id", leadId)
        .eq("event_type", "crm_enrollment_created")
        .eq("status", "sent")
        .maybeSingle();
      if (existing) return { ok: true, skipped: true, reason: "already_sent" };
    }

    // Cancelamento: só envia se houve crm_enrollment_created enviado antes
    if (eventType === "crm_enrollment_cancelled") {
      const { data: prior } = await supabaseAdmin
        .from("crm_outbound_events")
        .select("id")
        .eq("crm_lead_id", leadId)
        .eq("event_type", "crm_enrollment_created")
        .eq("status", "sent")
        .maybeSingle();
      if (!prior) return { ok: true, skipped: true, reason: "no_prior_enrollment" };
    }

    const occurredAt = new Date().toISOString();
    const payload: Record<string, unknown> = {
      event_type: eventType,
      crm_lead_id: lead.id,
      crm_user_id: lead.owner_id,
      lead_name: lead.name,
      lead_phone: lead.phone,
      interview_date: lead.interview_date,
      interview_time: lead.interview_time,
      interview_notes: lead.interview_notes,
      enrollment_value: lead.enrollment_value,
      monthly_fee: lead.monthly_fee,
      material_value: lead.material_value,
      enrollment_date: (lead as any).enrollment_date ?? null,
      status: lead.status,
      occurred_at: occurredAt,
      ...(extra ?? {}),
    };

    // Insert log row (pending)
    const { data: logRow } = await supabaseAdmin
      .from("crm_outbound_events")
      .insert({ event_type: eventType, crm_lead_id: lead.id, payload: payload as any, status: "pending", attempts: 0 })
      .select("id")
      .single();
    const logId = logRow?.id as string | undefined;


    if (!webhookUrl || !secret) {
      const msg = "ARENA_CRM_WEBHOOK_URL ou CRM_WEBHOOK_SECRET não configurados";
      if (logId) {
        await supabaseAdmin
          .from("crm_outbound_events")
          .update({ status: "failed", error_message: msg, attempts: 1 })
          .eq("id", logId);
      }
      console.error("[arena-webhook]", msg);
      return { ok: false, skipped: true, reason: "missing_config" };
    }

    // Sign with HMAC-SHA256
    const body = JSON.stringify(payload);
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    let httpStatus: number | null = null;
    let errorMessage: string | null = null;
    let ok = false;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CRM-Signature": signature,
          "X-CRM-Event": eventType,
        },
        body,
      });
      httpStatus = res.status;
      ok = res.ok;
      if (!ok) {
        const txt = await res.text().catch(() => "");
        errorMessage = `HTTP ${res.status}: ${txt.slice(0, 500)}`;
      }
    } catch (err: any) {
      errorMessage = err?.message ?? String(err);
    }

    if (logId) {
      await supabaseAdmin
        .from("crm_outbound_events")
        .update({
          status: ok ? "sent" : "failed",
          error_message: errorMessage,
          http_status: httpStatus,
          attempts: 1,
          sent_at: ok ? new Date().toISOString() : null,
        })
        .eq("id", logId);
    }

    if (!ok) console.error("[arena-webhook] falha", { eventType, leadId, httpStatus, errorMessage });
    return { ok, httpStatus, error: errorMessage };
  });

export const resendArenaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { eventId: string }) => {
    if (!input || typeof input.eventId !== "string") throw new Error("invalid input");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ev, error } = await supabaseAdmin
      .from("crm_outbound_events")
      .select("id, crm_lead_id, event_type, payload, attempts")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error || !ev) throw new Error(error?.message ?? "event_not_found");

    const webhookUrl = process.env.ARENA_CRM_WEBHOOK_URL;
    const secret = process.env.CRM_WEBHOOK_SECRET;
    if (!webhookUrl || !secret) {
      await supabaseAdmin
        .from("crm_outbound_events")
        .update({ status: "failed", error_message: "missing_config", attempts: (ev.attempts ?? 0) + 1 })
        .eq("id", ev.id);
      return { ok: false, reason: "missing_config" };
    }

    const body = JSON.stringify(ev.payload);
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    let httpStatus: number | null = null;
    let errorMessage: string | null = null;
    let ok = false;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CRM-Signature": signature,
          "X-CRM-Event": String(ev.event_type),
        },
        body,
      });
      httpStatus = res.status;
      ok = res.ok;
      if (!ok) {
        const txt = await res.text().catch(() => "");
        errorMessage = `HTTP ${res.status}: ${txt.slice(0, 500)}`;
      }
    } catch (err: any) {
      errorMessage = err?.message ?? String(err);
    }

    await supabaseAdmin
      .from("crm_outbound_events")
      .update({
        status: ok ? "sent" : "failed",
        http_status: httpStatus,
        error_message: errorMessage,
        attempts: (ev.attempts ?? 0) + 1,
        sent_at: ok ? new Date().toISOString() : null,
      })
      .eq("id", ev.id);

    return { ok, httpStatus, error: errorMessage };
  });
