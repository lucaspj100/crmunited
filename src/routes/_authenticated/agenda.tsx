import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { waLink, labelFor, statusColor, LOST_REASONS } from "@/lib/constants";
import { buildMessage, pickPresetKey, copyToClipboard, rawPhoneDigits, MESSAGE_LIBRARY } from "@/lib/messages";
import { LeadDetailsDialog } from "@/components/LeadDetailsDialog";
import {
  Calendar as CalendarIcon, Check, X, RotateCw, GraduationCap, MessageCircle,
  Phone, Eye, Copy, AlertTriangle, CheckCircle2, Clock, Users,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agenda")({ component: AgendaPage });

type Lead = {
  id: string; name: string; phone: string | null; company: string | null;
  status: string; owner_id: string; observation: string | null;
  interview_date: string | null; interview_time: string | null;
  interview_notes: string | null; interview_confirmed_at: string | null;
  updated_at: string | null;
};
type Task = {
  id: string; lead_id: string; type: string; due_date: string; due_time: string | null;
  observation: string | null; status: string; owner_id: string;
};
type Profile = { id: string; full_name: string | null; email: string | null };

type Bucket = "hoje" | "amanha" | "semana" | "nao_confirmadas" | "realizadas" | "no_show" | "reagendar";

const BUCKET_META: Record<Bucket, { label: string; icon: any; color: string }> = {
  hoje:            { label: "Hoje",              icon: CalendarIcon,   color: "text-violet-700" },
  amanha:          { label: "Amanhã",            icon: CalendarIcon,   color: "text-blue-700" },
  semana:          { label: "Próximos 7 dias",   icon: CalendarIcon,   color: "text-cyan-700" },
  nao_confirmadas: { label: "Não confirmadas",   icon: AlertTriangle,  color: "text-amber-700" },
  realizadas:      { label: "Realizadas (7d)",   icon: CheckCircle2,   color: "text-emerald-700" },
  no_show:         { label: "No-show",           icon: X,              color: "text-rose-700" },
  reagendar:       { label: "Reagendar",         icon: RotateCw,       color: "text-orange-700" },
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoPlus = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

function AgendaPage() {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const [vendor, setVendor] = useState<string>("me");
  const [tab, setTab] = useState<Bucket>("hoje");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [resched, setResched] = useState<Lead | null>(null);
  const [interview, setInterview] = useState<Lead | null>(null); // marcar realizada (com nota)
  const [enrol, setEnrol] = useState<Lead | null>(null);
  const [lost, setLost] = useState<Lead | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["agenda"],
    queryFn: async () => {
      const [leadsR, tasksR, profR] = await Promise.all([
        supabase
          .from("leads")
          .select("id,name,phone,company,status,owner_id,observation,interview_date,interview_time,interview_notes,interview_confirmed_at,updated_at")
          .not("interview_date", "is", null)
          .limit(5000),
        supabase
          .from("tasks")
          .select("*")
          .eq("status", "pendente")
          .in("type", ["reagendar_entrevista", "confirmar_entrevista"])
          .limit(5000),
        supabase.from("profiles").select("id, full_name, email").limit(2000),
      ]);
      return {
        leads: (leadsR.data ?? []) as Lead[],
        tasks: (tasksR.data ?? []) as Task[],
        profiles: (profR.data ?? []) as Profile[],
      };
    },
  });

  const filtered = useMemo(() => {
    const leads = (data?.leads ?? []).filter((l) => {
      if (!isAdmin) return l.owner_id === user?.id;
      if (vendor === "me") return l.owner_id === user?.id;
      if (vendor === "all") return true;
      return l.owner_id === vendor;
    });
    return leads;
  }, [data, vendor, isAdmin, user?.id]);

  const today = todayIso();
  const tomorrow = isoPlus(1);
  const weekEnd = isoPlus(7);
  const weekAgo = isoPlus(-7);

  const reagTaskByLead = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of data?.tasks ?? []) if (t.type === "reagendar_entrevista") map.set(t.lead_id, t);
    return map;
  }, [data]);

  const buckets = useMemo(() => {
    const b: Record<Bucket, Lead[]> = {
      hoje: [], amanha: [], semana: [], nao_confirmadas: [], realizadas: [], no_show: [], reagendar: [],
    };
    for (const l of filtered) {
      const d = l.interview_date as string | null;
      if (!d) continue;
      if (l.status === "entrevista_realizada") {
        if (d >= weekAgo && d <= today) b.realizadas.push(l);
        continue;
      }
      if (l.status === "entrevista_marcada") {
        if (d < today) b.no_show.push(l);
        else if (d === today) b.hoje.push(l);
        else if (d === tomorrow) b.amanha.push(l);
        else if (d > tomorrow && d <= weekEnd) b.semana.push(l);

        if (d >= today && d <= weekEnd && !l.interview_confirmed_at) b.nao_confirmadas.push(l);
      }
      if (reagTaskByLead.has(l.id)) b.reagendar.push(l);
    }
    const sortByDt = (a: Lead, x: Lead) => `${a.interview_date} ${a.interview_time ?? "00:00"}`.localeCompare(`${x.interview_date} ${x.interview_time ?? "00:00"}`);
    (Object.keys(b) as Bucket[]).forEach((k) => b[k].sort(sortByDt));
    return b;
  }, [filtered, today, tomorrow, weekEnd, weekAgo, reagTaskByLead]);

  const profileName = (id: string) => {
    const p = data?.profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "—";
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["agenda"] });
    qc.invalidateQueries({ queryKey: ["fila"] });
    qc.invalidateQueries({ queryKey: ["tasks-today"] });
  };

  async function confirmInterview(l: Lead) {
    const { error } = await supabase.from("leads").update({ interview_confirmed_at: new Date().toISOString() }).eq("id", l.id);
    if (error) { toast.error("Erro ao confirmar"); return; }
    toast.success("Entrevista confirmada");
    refresh();
  }
  async function unconfirmInterview(l: Lead) {
    const { error } = await supabase.from("leads").update({ interview_confirmed_at: null }).eq("id", l.id);
    if (error) { toast.error("Erro"); return; }
    refresh();
  }
  async function markRealizada(l: Lead, notes?: string) {
    const updates: any = { status: "entrevista_realizada" };
    if (notes && notes.trim()) updates.interview_notes = notes.trim();
    const { error } = await supabase.from("leads").update(updates).eq("id", l.id);
    if (error) { toast.error("Erro ao marcar"); return; }
    // cria follow-up pós-entrevista
    await supabase.from("tasks").insert({
      lead_id: l.id, owner_id: l.owner_id, type: "followup_pos",
      due_date: isoPlus(1), status: "pendente", observation: "Follow-up pós-entrevista",
    });
    toast.success("Entrevista realizada · follow-up criado para amanhã");
    setInterview(null); refresh();
  }
  async function markNoShow(l: Lead) {
    // mantém status entrevista_marcada e cria tarefa de reagendar
    await supabase.from("tasks").insert({
      lead_id: l.id, owner_id: l.owner_id, type: "reagendar_entrevista",
      due_date: today, status: "pendente", observation: "No-show — reagendar entrevista",
    });
    toast.success("No-show registrado · tarefa de reagendar criada");
    refresh();
  }
  async function doReschedule(l: Lead, date: string, time: string) {
    if (!date) { toast.error("Informe a nova data"); return; }
    const { error } = await supabase.from("leads").update({
      interview_date: date, interview_time: time || null, interview_confirmed_at: null,
    }).eq("id", l.id);
    if (error) { toast.error("Erro ao reagendar"); return; }
    // remove tarefas pendentes de reagendar
    await supabase.from("tasks").update({ status: "concluida" })
      .eq("lead_id", l.id).eq("type", "reagendar_entrevista").eq("status", "pendente");
    toast.success("Entrevista reagendada");
    setResched(null); refresh();
  }
  async function doEnrol(l: Lead, valorMatricula: string, mensalidade: string, material: string) {
    const updates: any = { status: "matricula" };
    if (valorMatricula) updates.enrollment_value = Number(valorMatricula.replace(",", "."));
    if (mensalidade) updates.monthly_fee = Number(mensalidade.replace(",", "."));
    if (material) updates.material_value = Number(material.replace(",", "."));
    const { error } = await supabase.from("leads").update(updates).eq("id", l.id);
    if (error) { toast.error("Erro ao matricular"); return; }
    toast.success("Matrícula registrada 🎉");
    setEnrol(null); refresh();
  }
  async function doLost(l: Lead, reason: string) {
    const { error } = await supabase.from("leads").update({ status: "perdido", lost_reason: reason || null }).eq("id", l.id);
    if (error) { toast.error("Erro"); return; }
    toast.success("Lead marcado como perdido");
    setLost(null); refresh();
  }

  function copyConfirm(l: Lead) {
    const key = pickPresetKey("confirmar_entrevista", l.status, false);
    copyToClipboard(buildMessage(key, l), "Mensagem de confirmação copiada");
  }

  const counts = (b: Bucket) => buckets[b].length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><CalendarIcon className="h-6 w-6 text-primary" />Agenda Comercial</h1>
          <p className="text-sm text-muted-foreground">Entrevistas marcadas, confirmações e reagendamentos</p>
        </div>
        <div className="flex items-end gap-3">
          {isAdmin && (
            <div className="flex flex-col">
              <Label className="text-xs text-muted-foreground mb-1">Vendedor</Label>
              <Select value={vendor} onValueChange={setVendor}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Minhas entrevistas</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                  {(data?.profiles ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground">Carregando…</div>}

      {!isLoading && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as Bucket)}>
          <TabsList className="flex flex-wrap h-auto">
            {(Object.keys(BUCKET_META) as Bucket[]).map((k) => {
              const M = BUCKET_META[k];
              return (
                <TabsTrigger key={k} value={k} className="gap-2">
                  <M.icon className={`h-4 w-4 ${M.color}`} />
                  {M.label}
                  <Badge variant="secondary" className="ml-1 tabular-nums">{counts(k)}</Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(BUCKET_META) as Bucket[]).map((k) => (
            <TabsContent key={k} value={k} className="mt-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {buckets[k].length === 0 && (
                  <Card className="p-6 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                    Nada por aqui ✨
                  </Card>
                )}
                {buckets[k].map((l) => (
                  <InterviewCard
                    key={`${k}-${l.id}`}
                    lead={l}
                    bucket={k}
                    ownerName={profileName(l.owner_id)}
                    onDetails={() => setDetailsId(l.id)}
                    onConfirm={() => confirmInterview(l)}
                    onUnconfirm={() => unconfirmInterview(l)}
                    onMarkRealizada={() => setInterview(l)}
                    onNoShow={() => markNoShow(l)}
                    onResched={() => setResched(l)}
                    onEnrol={() => setEnrol(l)}
                    onLost={() => setLost(l)}
                    onCopyConfirm={() => copyConfirm(l)}
                  />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Reagendar */}
      <RescheduleDialog open={!!resched} lead={resched} onClose={() => setResched(null)} onSave={(d, t) => resched && doReschedule(resched, d, t)} />

      {/* Marcar realizada */}
      <RealizadaDialog open={!!interview} lead={interview} onClose={() => setInterview(null)} onSave={(notes) => interview && markRealizada(interview, notes)} />

      {/* Matrícula */}
      <EnrolDialog open={!!enrol} lead={enrol} onClose={() => setEnrol(null)} onSave={(a, b, c) => enrol && doEnrol(enrol, a, b, c)} />

      {/* Perdido */}
      <LostDialog open={!!lost} lead={lost} onClose={() => setLost(null)} onSave={(r) => lost && doLost(lost, r)} />

      <LeadDetailsDialog leadId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

function InterviewCard({
  lead, bucket, ownerName,
  onDetails, onConfirm, onUnconfirm, onMarkRealizada, onNoShow, onResched, onEnrol, onLost, onCopyConfirm,
}: {
  lead: Lead; bucket: Bucket; ownerName: string;
  onDetails: () => void; onConfirm: () => void; onUnconfirm: () => void;
  onMarkRealizada: () => void; onNoShow: () => void; onResched: () => void;
  onEnrol: () => void; onLost: () => void; onCopyConfirm: () => void;
}) {
  const phoneDigits = rawPhoneDigits(lead.phone);
  const d = lead.interview_date ? new Date(lead.interview_date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) : "—";
  const t = lead.interview_time ? lead.interview_time.slice(0, 5) : "—";
  const isRealizada = lead.status === "entrevista_realizada";
  const isPast = bucket === "no_show";
  const confirmed = !!lead.interview_confirmed_at;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{lead.name}</div>
          {lead.company && <div className="text-xs text-muted-foreground truncate">{lead.company}</div>}
        </div>
        <Badge variant="outline" className={statusColor(lead.status)}>{labelFor("status", lead.status)}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline" className="gap-1"><CalendarIcon className="h-3 w-3" />{d} · {t}</Badge>
        {confirmed ? (
          <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1"><Check className="h-3 w-3" />Confirmada</Badge>
        ) : (
          !isRealizada && <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1"><Clock className="h-3 w-3" />Não confirmada</Badge>
        )}
        {isPast && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Atrasada</Badge>}
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{ownerName}</div>

      {lead.interview_notes && <div className="text-xs text-muted-foreground line-clamp-2 italic">"{lead.interview_notes}"</div>}

      <div className="flex flex-wrap gap-2 pt-1">
        {phoneDigits && (
          <Button size="sm" variant="outline" asChild>
            <a href={waLink(phoneDigits, "")} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onCopyConfirm}><Copy className="h-4 w-4 mr-1" />Confirmação</Button>
        {phoneDigits && <Button size="sm" variant="outline" onClick={() => copyToClipboard(phoneDigits, "Telefone copiado")}><Phone className="h-4 w-4" /></Button>}
        <Button size="sm" variant="outline" onClick={onDetails}><Eye className="h-4 w-4" /></Button>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        {!isRealizada && !confirmed && <Button size="sm" variant="secondary" onClick={onConfirm}><Check className="h-4 w-4 mr-1" />Confirmar presença</Button>}
        {!isRealizada && confirmed && <Button size="sm" variant="ghost" onClick={onUnconfirm} className="text-amber-700"><X className="h-4 w-4 mr-1" />Desconfirmar</Button>}
        {!isRealizada && <Button size="sm" onClick={onMarkRealizada}><CheckCircle2 className="h-4 w-4 mr-1" />Realizada</Button>}
        {!isRealizada && <Button size="sm" variant="outline" onClick={onNoShow} className="text-rose-700"><X className="h-4 w-4 mr-1" />No-show</Button>}
        <Button size="sm" variant="outline" onClick={onResched}><RotateCw className="h-4 w-4 mr-1" />Reagendar</Button>
        <Button size="sm" variant="outline" onClick={onEnrol} className="text-emerald-700"><GraduationCap className="h-4 w-4 mr-1" />Matrícula</Button>
        <Button size="sm" variant="ghost" onClick={onLost} className="text-muted-foreground">Perdido</Button>
      </div>
    </Card>
  );
}

function RescheduleDialog({ open, lead, onClose, onSave }: { open: boolean; lead: Lead | null; onClose: () => void; onSave: (date: string, time: string) => void }) {
  const [date, setDate] = useState(""); const [time, setTime] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else { setDate(lead?.interview_date ?? ""); setTime(lead?.interview_time?.slice(0,5) ?? ""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reagendar entrevista — {lead?.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Nova data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Horário</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(date, time)}>Reagendar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RealizadaDialog({ open, lead, onClose, onSave }: { open: boolean; lead: Lead | null; onClose: () => void; onSave: (notes: string) => void }) {
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else setNotes(lead?.interview_notes ?? ""); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Entrevista realizada — {lead?.name}</DialogTitle></DialogHeader>
        <div>
          <Label>Observações da entrevista (opcional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Pontos discutidos, objeções, próximos passos…" />
          <p className="text-xs text-muted-foreground mt-2">Será criado um follow-up automático para amanhã.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(notes)}>Marcar como realizada</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrolDialog({ open, lead, onClose, onSave }: { open: boolean; lead: Lead | null; onClose: () => void; onSave: (matricula: string, mensalidade: string, material: string) => void }) {
  const [m, setM] = useState(""); const [mensal, setMensal] = useState(""); const [mat, setMat] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else { setM(""); setMensal(""); setMat(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Matrícula — {lead?.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Matrícula (R$)</Label><Input inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} /></div>
          <div><Label>Mensalidade (R$)</Label><Input inputMode="decimal" value={mensal} onChange={(e) => setMensal(e.target.value)} /></div>
          <div><Label>Material (R$)</Label><Input inputMode="decimal" value={mat} onChange={(e) => setMat(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(m, mensal, mat)}>Registrar matrícula</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LostDialog({ open, lead, onClose, onSave }: { open: boolean; lead: Lead | null; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else setReason(""); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar como perdido — {lead?.name}</DialogTitle></DialogHeader>
        <div>
          <Label>Motivo</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
            <SelectContent>
              {LOST_REASONS.map((r: any) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={() => onSave(reason)}>Marcar como perdido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
