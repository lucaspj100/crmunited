import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, Check, Clock, Eye, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { TASK_TYPES, labelFor } from "@/lib/constants";
import { logLeadEvent } from "@/lib/lead-events";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { playReturnSound } from "@/lib/notification-sound";

type LeadTask = {
  id: string;
  lead_id: string;
  type: string;
  due_date: string;
  due_time: string | null;
  observation: string | null;
  owner_id: string;
};

type LeadMini = { id: string; name: string; phone: string | null };

const POLL_MS = 30_000;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let permissionAsked = false;
async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default" && !permissionAsked) {
    permissionAsked = true;
    try { await Notification.requestPermission(); } catch { /* ignore */ }
  }
}

function fireBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try { new Notification(title, { body, tag: `crm-task-${title}` }); } catch { /* ignore */ }
}

export function TaskNotificationWatcher() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const shownRef = useRef<Set<string>>(new Set());
  const sessionStartRef = useRef<number>(Date.now());
  const [reschedule, setReschedule] = useState<LeadTask | null>(null);

  useEffect(() => { void ensureNotificationPermission(); }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    sessionStartRef.current = Date.now();

    const tick = async () => {
      const today = localToday();
      // Only future/today activities not yet notified.
      const { data, error } = await supabase
        .from("tasks")
        .select("id, lead_id, type, due_date, due_time, observation, owner_id")
        .eq("owner_id", user.id)
        .eq("status", "pendente")
        .not("lead_id", "is", null)
        .neq("type", "retorno_ligacao" as never)
        .is("notified_at", null)
        .gte("due_date", today)
        .order("due_date", { ascending: true });

      if (cancelled || error) return;
      const now = Date.now();
      const sessionStart = sessionStartRef.current;
      const tasks = (data ?? []) as LeadTask[];

      for (const t of tasks) {
        if (shownRef.current.has(t.id)) continue;
        const time = t.due_time ?? "00:00:00";
        const dueMs = new Date(`${t.due_date}T${time}`).getTime();
        // Fire only when the clock crosses the scheduled time WHILE the user has
        // the app open. Anything already overdue before this session started is
        // shown as overdue in the UI but never triggers a pop-up.
        if (dueMs > now) continue;
        if (dueMs < sessionStart) {
          // Silently mark as notified so it never pops up on a future reload.
          shownRef.current.add(t.id);
          void supabase.from("tasks").update({ notified_at: new Date().toISOString() }).eq("id", t.id).is("notified_at", null);
          continue;
        }

        const { data: leadRow } = await supabase
          .from("leads")
          .select("id, name, phone")
          .eq("id", t.lead_id)
          .maybeSingle();
        const lead = (leadRow as LeadMini | null) ?? null;
        if (!lead) continue;

        shownRef.current.add(t.id);
        // Persist notified_at atomically; skip toast if another tab already claimed it.
        const { data: claim } = await supabase
          .from("tasks")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", t.id)
          .is("notified_at", null)
          .select("id")
          .maybeSingle();
        if (!claim) continue;

        showTaskToast(t, lead, qc, router, setReschedule);
        fireBrowserNotification(
          `Atividade: ${labelFor(TASK_TYPES, t.type)}`,
          `${lead.name} — ${t.due_date}${t.due_time ? " " + t.due_time.slice(0, 5) : ""}`,
        );
        void playReturnSound().catch(() => {});
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [user, qc, router]);

  return <RescheduleDialog task={reschedule} onClose={() => setReschedule(null)} onSaved={() => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["hoje"] });
    qc.invalidateQueries({ queryKey: ["funil-next-tasks"] });
    qc.invalidateQueries({ queryKey: ["tasks-pending-count"] });
  }} />;
}

function showTaskToast(
  task: LeadTask,
  lead: LeadMini,
  qc: ReturnType<typeof useQueryClient>,
  router: ReturnType<typeof useRouter>,
  openReschedule: (t: LeadTask) => void,
) {
  const typeLabel = labelFor(TASK_TYPES, task.type);
  const when = `${task.due_date.split("-").reverse().slice(0, 2).join("/")}${task.due_time ? " " + task.due_time.slice(0, 5) : ""}`;
  const obs = task.observation?.trim() || "Sem observação";

  const close = (id: string | number) => toast.dismiss(id);

  const openLead = (id: string | number) => {
    close(id);
    router.navigate({ to: "/hoje", search: { lead: lead.id } as never });
  };

  const conclude = async (id: string | number) => {
    const { error } = await supabase.from("tasks").update({ status: "concluida" }).eq("id", task.id);
    if (error) { toast.error(error.message); return; }
    await logLeadEvent({ leadId: lead.id, type: "task_done", description: `${typeLabel} concluída` });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["hoje"] });
    qc.invalidateQueries({ queryKey: ["funil-next-tasks"] });
    qc.invalidateQueries({ queryKey: ["tasks-pending-count"] });
    close(id);
    toast.success("Atividade concluída");
  };

  toast.custom(
    (id) => (
      <div className="w-[400px] max-w-[92vw] rounded-lg border bg-card text-card-foreground shadow-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Bell className="h-4 w-4" />
          </span>
          <div className="text-sm font-semibold">Atividade agendada — {when}</div>
        </div>
        <div className="space-y-1 text-xs mb-2">
          <div><span className="text-muted-foreground">Lead:</span> <span className="font-medium">{lead.name}</span></div>
          <div><span className="text-muted-foreground">Tipo:</span> {typeLabel}</div>
        </div>
        <div className="mb-3 rounded-md bg-muted/50 p-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Observação</div>
          <div className="text-xs whitespace-pre-wrap break-words">{obs}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => openLead(id)} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs px-2 py-1.5 hover:opacity-90">
            <Eye className="h-3.5 w-3.5" /> Abrir
          </button>
          <button onClick={() => void conclude(id)} className="inline-flex items-center justify-center gap-1.5 rounded-md border text-xs px-2 py-1.5 hover:bg-accent">
            <Check className="h-3.5 w-3.5" /> Concluir
          </button>
          <button onClick={() => { close(id); openReschedule(task); }} className="inline-flex items-center justify-center gap-1.5 rounded-md border text-xs px-2 py-1.5 hover:bg-accent">
            <CalendarClock className="h-3.5 w-3.5" /> Reagendar
          </button>
        </div>
      </div>
    ),
    { duration: Infinity, position: "top-right" },
  );
}

function RescheduleDialog({ task, onClose, onSaved }: { task: LeadTask | null; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      setTime(task.due_time?.slice(0, 5) ?? "");
    }
  }, [task]);

  if (!task) return null;

  const save = async () => {
    if (!date) return;
    setSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({ due_date: date, due_time: time || null, status: "pendente", notified_at: null })
      .eq("id", task.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logLeadEvent({
      leadId: task.lead_id,
      type: "task_rescheduled",
      description: `Reagendada para ${date}${time ? " " + time : ""}`,
      metadata: { date, time },
    });
    toast.success("Atividade reagendada");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reagendar atividade</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Nova data *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Horário</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !date}><Clock className="h-4 w-4 mr-1" />{saving ? "Salvando…" : "Reagendar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
