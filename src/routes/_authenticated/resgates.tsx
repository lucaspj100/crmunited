import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STATUSES, LOST_REASONS, labelFor, waLink } from "@/lib/constants";
import { copyToClipboard, waRescueMessage, rawPhoneDigits } from "@/lib/messages";
import { ensureTaskForStatus } from "@/lib/task-automation";
import { RotateCw, MessageCircle, Linkedin, Check, Calendar, X, User, Copy, Phone, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/resgates")({ component: ResgatesPage });

type Task = { id: string; lead_id: string; due_date: string; status: string; rescue_reason: string | null; observation: string | null; owner_id: string };
type Lead = { id: string; name: string; phone: string | null; company: string | null; linkedin_url: string | null; owner_id: string; status: string; observation: string | null; lost_reason: string | null; lost_at: string | null; rescued_at: string | null; in_rescue: boolean };
type Profile = { id: string; full_name: string | null; email: string | null };

async function fetchResgates() {
  const [tasksR, leadsR, profR, rescueLeadsR] = await Promise.all([
    supabase.from("tasks").select("*").eq("is_rescue", true).eq("status", "pendente").order("due_date").limit(2000),
    supabase.from("leads").select("id,name,phone,company,linkedin_url,owner_id,status,observation,lost_reason,lost_at,rescued_at,in_rescue").limit(2000),
    supabase.from("profiles").select("id, full_name, email").limit(2000),
    supabase.from("leads").select("*").eq("in_rescue", true).limit(2000),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
  const w7 = addDays(7), d30 = addDays(30), d60 = addDays(60), d90 = addDays(90);
  const byLead = new Map((leadsR.data ?? []).map((l: any) => [l.id, l as Lead]));
  const byProfile = new Map((profR.data ?? []).map((p: any) => [p.id, p as Profile]));
  const tasks = (tasksR.data ?? []) as Task[];
  return {
    byLead, byProfile,
    emRescate: ((rescueLeadsR.data ?? []) as any[]) as Lead[],
    late: tasks.filter((t) => t.due_date < today),
    today: tasks.filter((t) => t.due_date === today),
    week: tasks.filter((t) => t.due_date > today && t.due_date <= w7),
    d30: tasks.filter((t) => t.due_date > w7 && t.due_date <= d30),
    d60: tasks.filter((t) => t.due_date > d30 && t.due_date <= d60),
    d90: tasks.filter((t) => t.due_date > d60 && t.due_date <= d90),
  };
}

function ResgatesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["resgates"], queryFn: fetchResgates });
  const [resgateTask, setResgateTask] = useState<Task | null>(null);
  const [reagendarTask, setReagendarTask] = useState<Task | null>(null);

  const onResgatar = async (task: Task, newStatus: string) => {
    const lead = data?.byLead.get(task.lead_id);
    if (!lead) return;
    await supabase.from("tasks").update({ status: "concluida" }).eq("id", task.id);
    await supabase.from("leads").update({ status: newStatus as any, lost_reason: null, lost_type: null, rescue_date: null }).eq("id", task.lead_id);
    await ensureTaskForStatus({ leadId: lead.id, ownerId: lead.owner_id, status: newStatus });
    toast.success("Lead resgatado");
    qc.invalidateQueries();
    setResgateTask(null);
  };

  const onReagendar = async (task: Task, newDate: string) => {
    await supabase.from("tasks").update({ due_date: newDate }).eq("id", task.id);
    await supabase.from("leads").update({ rescue_date: newDate }).eq("id", task.lead_id);
    toast.success("Resgate reagendado");
    qc.invalidateQueries();
    setReagendarTask(null);
  };

  const onDescartar = async (t: Task) => {
    await supabase.from("tasks").update({ status: "cancelada" }).eq("id", t.id);
    await supabase.from("leads").update({ lost_type: "definitivo", rescue_date: null }).eq("id", t.lead_id);
    toast.success("Marcado como perdido definitivo");
    qc.invalidateQueries();
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  const Row = ({ t, tone }: { t: Task; tone?: "danger" | "today" }) => {
    const lead = data.byLead.get(t.lead_id); if (!lead) return null;
    const owner = data.byProfile.get(lead.owner_id);
    const ownerName = owner?.full_name || owner?.email || "—";
    const bg = tone === "danger" ? "border-l-4 border-l-rose-500 bg-rose-500/5" : tone === "today" ? "border-l-4 border-l-primary bg-primary/5" : "border-l-4 border-l-muted";
    return (
      <Card className={`p-4 ${bg}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{lead.name}</div>
            <div className="text-sm text-muted-foreground">
              {lead.company && <>{lead.company} · </>}
              {lead.phone && <>{lead.phone} · </>}
              <span>Resgate: {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{ownerName}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {t.rescue_reason && <Badge variant="outline">Motivo: {labelFor(LOST_REASONS, t.rescue_reason)}</Badge>}
            </div>
            {lead.observation && <p className="mt-1 text-xs italic text-muted-foreground line-clamp-2">{lead.observation}</p>}
          </div>
          <div className="flex flex-wrap gap-1">
            {lead.phone && <Button asChild size="sm" variant="outline"><a href={waLink(lead.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>}
            {lead.linkedin_url && <Button asChild size="sm" variant="outline"><a href={lead.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4" /></a></Button>}
            <Button size="sm" onClick={() => setResgateTask(t)}><Check className="h-4 w-4 mr-1" />Resgatar</Button>
            <Button size="sm" variant="ghost" onClick={() => setReagendarTask(t)} title="Reagendar"><Calendar className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => onDescartar(t)} title="Descartar"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    );
  };

  const Section = ({ title, items, tone }: { title: string; items: Task[]; tone?: "danger" | "today" }) => (
    <div>
      <div className="mb-2 text-sm font-semibold text-muted-foreground">{title} <Badge variant="secondary">{items.length}</Badge></div>
      <div className="space-y-2">{items.length === 0 ? <Card className="p-4 text-sm text-muted-foreground">Nada por aqui.</Card> : items.map((t) => <Row key={t.id} t={t} tone={tone} />)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><RotateCw className="h-6 w-6 text-primary" />Resgates Futuros</h1>
        <p className="text-sm text-muted-foreground">Leads perdidos que devem ser retomados</p>
      </div>
      <Section title="Resgates atrasados" items={data.late} tone="danger" />
      <Section title="Resgates de hoje" items={data.today} tone="today" />
      <Section title="Esta semana" items={data.week} />
      <Section title="Em até 30 dias" items={data.d30} />
      <Section title="Em até 60 dias" items={data.d60} />
      <Section title="Em até 90 dias" items={data.d90} />

      {resgateTask && <ResgateDialog task={resgateTask} onClose={() => setResgateTask(null)} onConfirm={onResgatar} />}
      {reagendarTask && <ReagendarDialog task={reagendarTask} onClose={() => setReagendarTask(null)} onConfirm={onReagendar} />}
    </div>
  );
}

function ResgateDialog({ task, onClose, onConfirm }: { task: Task; onClose: () => void; onConfirm: (t: Task, s: string) => void }) {
  const [status, setStatus] = useState("novo");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Resgatar lead</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Mover para qual etapa?</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.filter((s) => !["perdido", "matricula"].includes(s.value)).map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(task, status)}>Resgatar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReagendarDialog({ task, onClose, onConfirm }: { task: Task; onClose: () => void; onConfirm: (t: Task, d: string) => void }) {
  const [date, setDate] = useState(task.due_date);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reagendar resgate</DialogTitle></DialogHeader>
        <div className="space-y-2"><Label>Nova data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(task, date)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
