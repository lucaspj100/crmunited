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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LEAD_STATUSES, TASK_TYPES, labelFor, statusColor, waLink } from "@/lib/constants";
import { ListChecks, MessageCircle, Linkedin, Check, Calendar, X, AlertCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tarefas")({ component: TarefasPage });

type Task = {
  id: string; lead_id: string; type: string; due_date: string; due_time: string | null;
  observation: string | null; status: string; owner_id: string; is_rescue: boolean;
};
type Lead = { id: string; name: string; phone: string | null; company: string | null; linkedin_url: string | null; status: string; owner_id: string };

async function fetchTarefas() {
  const today = new Date().toISOString().slice(0, 10);
  const [tasksR, leadsR] = await Promise.all([
    supabase.from("tasks").select("*").order("due_date").limit(2000),
    supabase.from("leads").select("*").limit(2000),
  ]);
  const tasks = (tasksR.data ?? []) as Task[];
  const leads = (leadsR.data ?? []) as Lead[];
  const byLead = new Map(leads.map((l) => [l.id, l]));
  const pendingTasks = tasks.filter((t) => t.status === "pendente");
  const late = pendingTasks.filter((t) => t.due_date < today);
  const todayT = pendingTasks.filter((t) => t.due_date === today);
  const future = pendingTasks.filter((t) => t.due_date > today);
  const pendingLeadIds = new Set(pendingTasks.map((t) => t.lead_id));
  const leadsNoTask = leads.filter((l) =>
    ["interessado", "entrevista_marcada", "entrevista_realizada"].includes(l.status) && !pendingLeadIds.has(l.id),
  );
  return { byLead, late, todayT, future, leadsNoTask, today };
}

function TarefasPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["tarefas"], queryFn: fetchTarefas });
  const [completing, setCompleting] = useState<{ task: Task; lead: Lead } | null>(null);

  const setStatus = async (task: Task, status: string) => {
    const { error } = await supabase.from("tasks").update({ status: status as any }).eq("id", task.id);
    if (error) toast.error(error.message);
    else { toast.success("Atualizado"); qc.invalidateQueries(); }
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  const Row = ({ task, tone }: { task: Task; tone?: "danger" | "today" | "future" }) => {
    const lead = data.byLead.get(task.lead_id);
    if (!lead) return null;
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
            {task.observation && <p className="mt-1 text-sm">{task.observation}</p>}
          </div>
          <div className="flex flex-wrap gap-1">
            {lead.phone && <Button asChild size="sm" variant="outline"><a href={waLink(lead.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>}
            {lead.linkedin_url && <Button asChild size="sm" variant="outline"><a href={lead.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4" /></a></Button>}
            <Button size="sm" onClick={() => setCompleting({ task, lead })}><Check className="h-4 w-4 mr-1" />Concluir</Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus(task, "remarcada")}><Calendar className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus(task, "cancelada")}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    );
  };

  const Section = ({ title, icon: Icon, count, children }: any) => (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icon className="h-4 w-4" />{title} <Badge variant="secondary">{count}</Badge></div>
      <div className="space-y-2">{count === 0 ? <Card className="p-4 text-sm text-muted-foreground">Nada por aqui.</Card> : children}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ListChecks className="h-6 w-6 text-primary" />Tarefas do Dia</h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <Section title="Tarefas atrasadas" icon={AlertCircle} count={data.late.length}>
        {data.late.map((t) => <Row key={t.id} task={t} tone="danger" />)}
      </Section>
      <Section title="Tarefas de hoje" icon={ListChecks} count={data.todayT.length}>
        {data.todayT.map((t) => <Row key={t.id} task={t} tone="today" />)}
      </Section>
      <Section title="Próximas tarefas" icon={Calendar} count={data.future.length}>
        {data.future.slice(0, 30).map((t) => <Row key={t.id} task={t} tone="future" />)}
      </Section>
      <Section title="Leads sem próxima tarefa" icon={AlertTriangle} count={data.leadsNoTask.length}>
        {data.leadsNoTask.map((l) => (
          <Card key={l.id} className="p-4 border-l-4 border-l-amber-500 bg-amber-500/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{l.name} <Badge variant="outline" className={statusColor(l.status)}>{labelFor(LEAD_STATUSES, l.status)}</Badge></div>
                {l.company && <div className="text-sm text-muted-foreground">{l.company}</div>}
              </div>
              <div className="flex gap-2">
                {l.phone && <Button asChild size="sm" variant="outline"><a href={waLink(l.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>}
                <Button size="sm" onClick={() => quickCreateTask(l, qc)}>Agendar follow-up</Button>
              </div>
            </div>
          </Card>
        ))}
      </Section>

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
          <Opt id="entrevista" label="Marcar entrevista" value="entrevista" />
          <Opt id="matricula" label="Marcar matrícula" value="matricula" />
          <Opt id="perdido" label="Marcar como perdido" value="perdido" />
          <Opt id="none" label="Não criar próxima tarefa" value="none" />
        </RadioGroup>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={onSubmit} disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Opt({ id, label, value }: { id: string; label: string; value: string }) {
  return <div className="flex items-center gap-2"><RadioGroupItem value={value} id={id} /><Label htmlFor={id}>{label}</Label></div>;
}
