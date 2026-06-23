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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LEAD_STATUSES, TASK_TYPES, labelFor, statusColor, waLink } from "@/lib/constants";
import { copyToClipboard, waFollowupMessage, waConfirmInterviewMessage, leadSummary, rawPhoneDigits } from "@/lib/messages";
import { logLeadEvent } from "@/lib/lead-events";
import { LeadDetailsDialog } from "@/components/LeadDetailsDialog";
import { ListChecks, MessageCircle, Check, Calendar, X, User, Copy, Phone, FileText, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tarefas")({ component: TarefasPage });

type Task = {
  id: string; lead_id: string; type: string; due_date: string; due_time: string | null;
  observation: string | null; status: string; owner_id: string; is_rescue: boolean;
};
type Lead = { id: string; name: string; phone: string | null; company: string | null; linkedin_url: string | null; status: string; owner_id: string; interview_date: string | null; interview_time: string | null };
type Profile = { id: string; full_name: string | null; email: string | null };

async function fetchTarefas() {
  const [tasksR, leadsR, profilesR] = await Promise.all([
    supabase.from("tasks").select("*").order("due_date").limit(3000),
    supabase.from("leads").select("id,name,phone,company,linkedin_url,status,owner_id,interview_date,interview_time").limit(3000),
    supabase.from("profiles").select("id, full_name, email").limit(2000),
  ]);
  return {
    tasks: (tasksR.data ?? []) as Task[],
    leads: (leadsR.data ?? []) as Lead[],
    profiles: (profilesR.data ?? []) as Profile[],
  };
}

function TarefasPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["tarefas"], queryFn: fetchTarefas });
  const [completing, setCompleting] = useState<{ task: Task; lead: Lead } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [vendor, setVendor] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tab, setTab] = useState<string>("hoje");

  const today = new Date().toISOString().slice(0, 10);

  const byLead = useMemo(() => new Map((data?.leads ?? []).map((l) => [l.id, l])), [data]);
  const byProfile = useMemo(() => new Map((data?.profiles ?? []).map((p) => [p.id, p])), [data]);

  const vendorOptions = useMemo(() => {
    const ids = new Set((data?.tasks ?? []).map((t) => t.owner_id));
    return Array.from(ids).map((id) => ({ id, name: byProfile.get(id)?.full_name || byProfile.get(id)?.email || "Vendedor" }));
  }, [data, byProfile]);

  const allTasks = data?.tasks ?? [];
  const matchVendor = (t: Task) => vendor === "all" || t.owner_id === vendor;
  const matchType = (t: Task) => typeFilter === "all" || t.type === typeFilter;
  const baseFilter = (t: Task) => matchVendor(t) && matchType(t);

  const pendentes = allTasks.filter((t) => t.status === "pendente").filter(baseFilter);
  const hoje = pendentes.filter((t) => t.due_date === today);
  const atrasadas = pendentes.filter((t) => t.due_date < today);
  const futuras = pendentes.filter((t) => t.due_date > today);
  const concluidas = allTasks.filter((t) => t.status === "concluida").filter(baseFilter).slice(0, 100);

  const setStatus = async (task: Task, status: string) => {
    const { error } = await supabase.from("tasks").update({ status: status as any }).eq("id", task.id);
    if (error) toast.error(error.message); else { toast.success("Atualizado"); qc.invalidateQueries(); }
  };
  const deleteTask = async (task: Task) => {
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) toast.error(error.message); else { toast.success("Tarefa excluída"); qc.invalidateQueries(); }
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  const Row = ({ task, tone }: { task: Task; tone?: "danger" | "today" | "future" | "done" }) => {
    const lead = byLead.get(task.lead_id);
    if (!lead) return null;
    const owner = byProfile.get(task.owner_id);
    const ownerName = owner?.full_name || owner?.email || "—";
    const bg = tone === "danger" ? "border-l-4 border-l-rose-500 bg-rose-500/5"
            : tone === "today" ? "border-l-4 border-l-primary bg-primary/5"
            : tone === "done" ? "border-l-4 border-l-emerald-500 bg-emerald-500/5 opacity-80"
            : "border-l-4 border-l-muted";
    const msg = task.type === "confirmar_entrevista"
      ? waConfirmInterviewMessage(lead.name, lead.interview_date, lead.interview_time)
      : waFollowupMessage(lead.name);

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
            <div className="mt-1 text-sm text-muted-foreground flex flex-wrap items-center gap-x-2">
              {lead.company && <span>{lead.company}</span>}
              {lead.phone && <span className="font-mono">{lead.phone}</span>}
              <span>· {new Date(task.due_date + "T00:00:00").toLocaleDateString("pt-BR")}{task.due_time ? ` às ${task.due_time.slice(0, 5)}` : ""}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{ownerName}</div>
            {task.observation && <p className="mt-1 text-sm">{task.observation}</p>}
          </div>
          <div className="flex flex-wrap gap-1">
            {lead.phone && (
              <>
                <Button asChild size="sm" variant="outline" title="Abrir WhatsApp">
                  <a href={waLink(lead.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a>
                </Button>
                <Button size="sm" variant="outline" title="Copiar telefone" onClick={() => copyToClipboard(rawPhoneDigits(lead.phone), "Telefone copiado")}>
                  <Phone className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" title="Copiar nome" onClick={() => copyToClipboard(lead.name, "Nome copiado")}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" title="Copiar mensagem de follow-up" onClick={() => copyToClipboard(msg, "Mensagem copiada")}>
              <Copy className="h-4 w-4 mr-1" />Msg
            </Button>
            <Button size="sm" variant="outline" title="Copiar resumo do lead" onClick={() => copyToClipboard(leadSummary(lead), "Resumo copiado")}>
              <FileText className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" title="Ver detalhes" onClick={() => setDetailsId(lead.id)}>
              <Eye className="h-4 w-4" />
            </Button>
            {tone !== "done" && (
              <>
                <Button size="sm" onClick={() => setCompleting({ task, lead })}><Check className="h-4 w-4 mr-1" />Concluir</Button>
                <Button size="sm" variant="ghost" onClick={() => setStatus(task, "remarcada")} title="Reagendar"><Calendar className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setStatus(task, "cancelada")} title="Cancelar"><X className="h-4 w-4" /></Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => deleteTask(task)} title="Excluir"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
          </div>
        </div>
      </Card>
    );
  };

  const List = ({ items, tone, emptyMsg }: { items: Task[]; tone?: "danger" | "today" | "future" | "done"; emptyMsg: string }) =>
    items.length === 0
      ? <Card className="p-6 text-center text-sm text-muted-foreground">{emptyMsg}</Card>
      : <div className="space-y-2">{items.slice(0, 200).map((t) => <Row key={t.id} task={t} tone={tone} />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ListChecks className="h-6 w-6 text-primary" />Tarefas</h1>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {TASK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={vendor} onValueChange={setVendor}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {vendorOptions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="hoje">Hoje <Badge variant="secondary" className="ml-2">{hoje.length}</Badge></TabsTrigger>
          <TabsTrigger value="atrasadas">Atrasadas <Badge variant="secondary" className="ml-2">{atrasadas.length}</Badge></TabsTrigger>
          <TabsTrigger value="futuras">Futuras <Badge variant="secondary" className="ml-2">{futuras.length}</Badge></TabsTrigger>
          <TabsTrigger value="concluidas">Concluídas <Badge variant="secondary" className="ml-2">{concluidas.length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="hoje" className="mt-3"><List items={hoje} tone="today" emptyMsg="Nenhuma tarefa para hoje." /></TabsContent>
        <TabsContent value="atrasadas" className="mt-3"><List items={atrasadas} tone="danger" emptyMsg="Sem tarefas atrasadas." /></TabsContent>
        <TabsContent value="futuras" className="mt-3"><List items={futuras} tone="future" emptyMsg="Sem tarefas futuras." /></TabsContent>
        <TabsContent value="concluidas" className="mt-3"><List items={concluidas} tone="done" emptyMsg="Nenhuma tarefa concluída." /></TabsContent>
      </Tabs>

      {completing && <CompleteTaskDialog task={completing.task} lead={completing.lead} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); qc.invalidateQueries(); }} />}
      <LeadDetailsDialog leadId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
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
