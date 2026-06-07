import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LEAD_STATUSES, TASK_TYPES, labelFor, statusColor, waLink } from "@/lib/constants";
import { ListChecks, MessageCircle, Linkedin, Check, Calendar, X, AlertCircle, AlertTriangle, User, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tarefas")({ component: TarefasPage });

type Task = {
  id: string; lead_id: string; type: string; due_date: string; due_time: string | null;
  observation: string | null; status: string; owner_id: string; is_rescue: boolean;
};
type Lead = { id: string; name: string; phone: string | null; company: string | null; linkedin_url: string | null; status: string; owner_id: string };
type Profile = { id: string; full_name: string | null; email: string | null };

async function fetchTarefas() {
  const today = new Date().toISOString().slice(0, 10);
  const [tasksR, leadsR, profilesR] = await Promise.all([
    supabase.from("tasks").select("*").order("due_date").limit(2000),
    supabase.from("leads").select("*").limit(2000),
    supabase.from("profiles").select("id, full_name, email").limit(2000),
  ]);
  const tasks = (tasksR.data ?? []) as Task[];
  const leads = (leadsR.data ?? []) as Lead[];
  const profiles = (profilesR.data ?? []) as Profile[];
  const byLead = new Map(leads.map((l) => [l.id, l]));
  const byProfile = new Map(profiles.map((p) => [p.id, p]));
  const pendingTasks = tasks.filter((t) => t.status === "pendente");
  const late = pendingTasks.filter((t) => t.due_date < today);
  const todayT = pendingTasks.filter((t) => t.due_date === today);
  const future = pendingTasks.filter((t) => t.due_date > today);
  const pendingLeadIds = new Set(pendingTasks.map((t) => t.lead_id));
  const leadsNoTask = leads.filter((l) =>
    ["novo", "interessado", "entrevista_marcada", "entrevista_realizada"].includes(l.status) && !pendingLeadIds.has(l.id),
  );
  return { byLead, byProfile, late, todayT, future, leadsNoTask, today };
}

function TarefasPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["tarefas"], queryFn: fetchTarefas });
  const [completing, setCompleting] = useState<{ task: Task; lead: Lead } | null>(null);
  const [vendorFilter, setVendorFilter] = useState<string>("all");

  const setStatus = async (task: Task, status: string) => {
    const { error } = await supabase.from("tasks").update({ status: status as any }).eq("id", task.id);
    if (error) toast.error(error.message);
    else { toast.success("Atualizado"); qc.invalidateQueries(); }
  };

  const deleteTask = async (task: Task) => {
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) toast.error(error.message);
    else { toast.success("Tarefa excluída"); qc.invalidateQueries(); }
  };

  const vendorOptions = useMemo(() => {
    if (!data) return [];
    const ids = new Set<string>();
    [...data.late, ...data.todayT, ...data.future].forEach((t) => ids.add(t.owner_id));
    return Array.from(ids).map((id) => ({ id, name: data.byProfile.get(id)?.full_name || data.byProfile.get(id)?.email || "Vendedor" }));
  }, [data]);

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  const filterTask = (t: Task) => vendorFilter === "all" || t.owner_id === vendorFilter;

  const Row = ({ task, tone }: { task: Task; tone?: "danger" | "today" | "future" }) => {
    const lead = data.byLead.get(task.lead_id);
    if (!lead) return null;
    const owner = data.byProfile.get(task.owner_id);
    const ownerName = owner?.full_name || owner?.email || "—";
    const bg = tone === "danger" ? "border-l-4 border-l-rose-500 bg-rose-500/5"
            : tone === "today" ? "border-l-4 border-l-primary bg-primary/5"
            : "border-l-4 border-l-muted";
    return (
      <Card className={`p-4 ${bg}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{lead.name}</span>
              <Badge variant="outline" className={statusColor(lead.status)}>{labelFor(LEAD_STATUSES, lead.status)}</Badge>
              <Badge variant="secondary">{labelFor(TASK_TYPES, task.type)}</Badge>
              {task.is_rescue && <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">Resgate</Badge>}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {lead.company && <span>{lead.company} · </span>}
              <span>{new Date(task.due_date + "T00:00:00").toLocaleDateString("pt-BR")}{task.due_time ? ` às ${task.due_time.slice(0,5)}` : ""}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{ownerName}</div>
            {task.observation && <p className="mt-1 text-sm">{task.observation}</p>}
          </div>
          <div className="flex flex-wrap gap-1">
            {lead.phone && <Button asChild size="sm" variant="outline"><a href={waLink(lead.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>}
            {lead.linkedin_url && <Button asChild size="sm" variant="outline"><a href={lead.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4" /></a></Button>}
            <Button size="sm" onClick={() => setCompleting({ task, lead })}><Check className="h-4 w-4 mr-1" />Concluir</Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus(task, "remarcada")} title="Reagendar"><Calendar className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus(task, "cancelada")} title="Cancelar"><X className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => deleteTask(task)} title="Excluir"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
          </div>
        </div>
      </Card>
    );
  };

  const Section = ({ title, icon: Icon, items, tone }: { title: string; icon: any; items: Task[]; tone?: "danger" | "today" | "future" }) => {
    const filtered = items.filter(filterTask);
    return (
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icon className="h-4 w-4" />{title} <Badge variant="secondary">{filtered.length}</Badge></div>
        <div className="space-y-2">{filtered.length === 0 ? <Card className="p-4 text-sm text-muted-foreground">Nada por aqui.</Card> : filtered.slice(0, 60).map((t) => <Row key={t.id} task={t} tone={tone} />)}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ListChecks className="h-6 w-6 text-primary" />Tarefas do Dia</h1>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {vendorOptions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Section title="Tarefas atrasadas" icon={AlertCircle} items={data.late} tone="danger" />
      <Section title="Tarefas de hoje" icon={ListChecks} items={data.todayT} tone="today" />
      <Section title="Próximas tarefas" icon={Calendar} items={data.future} tone="future" />

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><AlertTriangle className="h-4 w-4" />Leads sem próxima tarefa <Badge variant="secondary">{data.leadsNoTask.filter((l) => vendorFilter === "all" || l.owner_id === vendorFilter).length}</Badge></div>
        <div className="space-y-2">
          {data.leadsNoTask.filter((l) => vendorFilter === "all" || l.owner_id === vendorFilter).map((l) => (
            <Card key={l.id} className="p-4 border-l-4 border-l-amber-500 bg-amber-500/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold flex items-center gap-2">{l.name} <Badge variant="outline" className={statusColor(l.status)}>{labelFor(LEAD_STATUSES, l.status)}</Badge></div>
                  {l.company && <div className="text-sm text-muted-foreground">{l.company}</div>}
                </div>
                <div className="flex gap-2">
                  {l.phone && <Button asChild size="sm" variant="outline"><a href={waLink(l.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>}
                  <Button size="sm" onClick={() => quickCreateTask(l, qc)}>Agendar follow-up</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {completing && <CompleteTaskDialog task={completing.task} lead={completing.lead} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); qc.invalidateQueries(); }} />}
    </div>
  );
}

async function quickCreateTask(lead: Lead, qc: any) {
  const d = new Date(); d.setDate(d.getDate() + 1);
  const { error } = await supabase.from("tasks").insert({
    lead_id: lead.id, owner_id: lead.owner_id, type: "enviar_mensagem",
    due_date: d.toISOString().slice(0, 10), status: "pendente", observation: "Follow-up",
  });
  if (error) toast.error(error.message);
  else { toast.success("Tarefa criada para amanhã"); qc.invalidateQueries(); }
}

function CompleteTaskDialog({ task, lead, onClose, onDone }: { task: Task; lead: Lead; onClose: () => void; onDone: () => void }) {
  const [next, setNext] = useState("d1");
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    setSaving(true);
    await supabase.from("tasks").update({ status: "concluida" }).eq("id", task.id);

    if (next === "none") { /* nothing */ }
    else if (next === "matricula") {
      await supabase.from("leads").update({ status: "matricula" }).eq("id", lead.id);
    } else if (next === "entrevista") {
      await supabase.from("leads").update({ status: "entrevista_marcada" }).eq("id", lead.id);
    } else if (next === "perdido") {
      toast.info("Vá ao funil para detalhar a perda.");
      await supabase.from("leads").update({ status: "perdido", lost_reason: "outro", lost_type: "definitivo" }).eq("id", lead.id);
    } else if (next === "custom") {
      if (!customDate) { toast.error("Escolha a data"); setSaving(false); return; }
      await supabase.from("tasks").insert({
        lead_id: lead.id, owner_id: lead.owner_id, type: "enviar_mensagem",
        due_date: customDate, status: "pendente", observation: "Follow-up",
      });
    } else {
      const days = next === "d1" ? 1 : next === "d3" ? 3 : 7;
      const d = new Date(); d.setDate(d.getDate() + days);
      await supabase.from("tasks").insert({
        lead_id: lead.id, owner_id: lead.owner_id, type: "enviar_mensagem",
        due_date: d.toISOString().slice(0, 10), status: "pendente", observation: "Follow-up",
      });
    }
    setSaving(false);
    toast.success("Tarefa concluída");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Próxima ação para {lead.name}</DialogTitle></DialogHeader>
        <RadioGroup value={next} onValueChange={setNext} className="space-y-2">
          <Opt id="d1" label="Criar follow-up para amanhã" value="d1" />
          <Opt id="d3" label="Criar follow-up em 3 dias" value="d3" />
          <Opt id="d7" label="Criar follow-up em 7 dias" value="d7" />
          <Opt id="custom" label="Data personalizada" value="custom" />
          <Opt id="entrevista" label="Marcar entrevista" value="entrevista" />
          <Opt id="matricula" label="Marcar matrícula" value="matricula" />
          <Opt id="perdido" label="Marcar como perdido" value="perdido" />
          <Opt id="none" label="Não criar próxima tarefa" value="none" />
        </RadioGroup>
        {next === "custom" && <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />}
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={onSubmit} disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Opt({ id, label, value }: { id: string; label: string; value: string }) {
  return <div className="flex items-center gap-2"><RadioGroupItem value={value} id={id} /><Label htmlFor={id}>{label}</Label></div>;
}
