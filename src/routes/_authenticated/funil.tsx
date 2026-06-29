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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LEAD_STATUSES, LOST_REASONS, RESCUE_OPTIONS, waLink } from "@/lib/constants";
import { Kanban, MessageCircle, Linkedin, User, FileSpreadsheet, CalendarClock, CalendarPlus, AlertCircle, Clock } from "lucide-react";
import { leadTemperature, TEMPERATURE_META, daysAgoLabel } from "@/lib/lead-temperature";
import { exportRowsToXlsx } from "@/lib/xlsx-export";
import { NewLeadDialog } from "@/components/NewLeadDialog";
import { LeadDetailsDialog } from "@/components/LeadDetailsDialog";
import { QuickTaskDialog } from "@/components/QuickTaskDialog";
import { ensureTaskForStatus } from "@/lib/task-automation";
import { logLeadEvent } from "@/lib/lead-events";
import { notifyArena } from "@/lib/arena-dispatch";
import { registerEnrollmentAndSyncArena } from "@/lib/enrollment";
import { labelFor, TASK_TYPES } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/funil")({ component: FunilPage });

type Lead = {
  id: string; name: string; phone: string | null; company: string | null;
  linkedin_url: string | null; status: string; owner_id: string;
  source: string | null;
  created_at: string; updated_at: string; last_contact_at: string | null;
  interview_date: string | null; interview_time: string | null;
};
type Profile = { id: string; full_name: string | null; email: string | null };

function FunilPage() {
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [interviewLead, setInterviewLead] = useState<Lead | null>(null);
  const [lostLead, setLostLead] = useState<Lead | null>(null);
  const [matriculaLead, setMatriculaLead] = useState<Lead | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [tempFilter, setTempFilter] = useState<string>("all");
  const [quickTaskLead, setQuickTaskLead] = useState<Lead | null>(null);

  const { data: leads = [] } = useQuery({
    queryKey: ["leads-funil"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return data as Lead[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-funil"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data: nextTasks = [] } = useQuery({
    queryKey: ["funil-next-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("lead_id, type, due_date, due_time")
        .eq("status", "pendente")
        .order("due_date", { ascending: true })
        .order("due_time", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data as { lead_id: string; type: string; due_date: string; due_time: string | null }[];
    },
  });

  const nextByLead = useMemo(() => {
    const m = new Map<string, { type: string; due_date: string; due_time: string | null }>();
    for (const t of nextTasks) if (!m.has(t.lead_id)) m.set(t.lead_id, t);
    return m;
  }, [nextTasks]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const vendorOptions = useMemo(() => {
    const ids = new Set(leads.map((l) => l.owner_id));
    return Array.from(ids).map((id) => ({ id, name: profileById.get(id)?.full_name || profileById.get(id)?.email || "Vendedor" }));
  }, [leads, profileById]);

  const baseFiltered = vendorFilter === "all" ? leads : leads.filter((l) => l.owner_id === vendorFilter);
  const filteredLeads = tempFilter === "all"
    ? baseFiltered
    : baseFiltered.filter((l) => leadTemperature({
        status: l.status, last_contact_at: l.last_contact_at,
        interview_date: l.interview_date, updated_at: l.updated_at,
        next: nextByLead.get(l.id) ?? null,
      }) === tempFilter);

  const moveLead = async (lead: Lead, newStatus: string) => {
    if (lead.status === newStatus) return;
    if (newStatus === "entrevista_marcada") { setInterviewLead(lead); return; }
    if (newStatus === "perdido") { setLostLead(lead); return; }
    if (newStatus === "matricula") { setMatriculaLead(lead); return; }
    const { error } = await supabase.from("leads").update({ status: newStatus as any }).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    await ensureTaskForStatus({ leadId: lead.id, ownerId: lead.owner_id, status: newStatus });
    await logLeadEvent({ leadId: lead.id, type: "status_change", description: `${lead.status} → ${newStatus}`, metadata: { from: lead.status, to: newStatus } });
    toast.success("Lead movido");
    qc.invalidateQueries();
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Kanban className="h-6 w-6 text-primary" />Funil Comercial</h1>
          <p className="text-sm text-muted-foreground">Arraste os leads entre as etapas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {vendorOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tempFilter} onValueChange={setTempFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Temperatura" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas temperaturas</SelectItem>
              <SelectItem value="quente">🔥 Quente</SelectItem>
              <SelectItem value="morno">🌤️ Morno</SelectItem>
              <SelectItem value="frio">❄️ Frio</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              const novos = filteredLeads.filter((l) => l.status === "novo");
              const headers = ["Nome", "Empresa", "Telefone", "LinkedIn", "Vendedor"];
              const rows = novos.map((l) => {
                const owner = profileById.get(l.owner_id);
                return [l.name, l.company ?? "", l.phone ?? "", l.linkedin_url ?? "", owner?.full_name || owner?.email || ""];
              });
              if (rows.length === 0) { toast.info("Nenhum lead novo para exportar"); return; }
              exportRowsToXlsx(rows, headers, `novos-${new Date().toISOString().slice(0, 10)}.xlsx`, "Novos");
            }}
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" />Exportar Novos (XLSX)
          </Button>
          <NewLeadDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {LEAD_STATUSES.map((col) => {
          const items = filteredLeads.filter((l) => l.status === col.value);
          return (
            <div
              key={col.value}
              className="flex flex-col rounded-lg border bg-muted/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!draggingId) return;
                const lead = leads.find((l) => l.id === draggingId);
                if (lead) moveLead(lead, col.value);
                setDraggingId(null);
              }}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="font-semibold text-sm">{col.label}</div>
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2 min-h-[300px] max-h-[70vh]">
                {items.map((l) => {
                  const owner = profileById.get(l.owner_id);
                  const ownerName = owner?.full_name || owner?.email || "—";
                  const next = nextByLead.get(l.id);
                  const isOverdue = next ? next.due_date < todayStr : false;
                  const noActivity = !next;
                  const temp = leadTemperature({
                    status: l.status, last_contact_at: l.last_contact_at,
                    interview_date: l.interview_date, updated_at: l.updated_at,
                    next: next ?? null,
                  });
                  const tempMeta = TEMPERATURE_META[temp];
                  const ageLabel = daysAgoLabel(l.created_at);
                  const stageLabel = daysAgoLabel(l.updated_at);
                  const lastLabel = daysAgoLabel(l.last_contact_at);
                  return (
                    <Card
                      key={l.id}
                      draggable
                      onDragStart={() => setDraggingId(l.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => setDetailsId(l.id)}
                      className={`cursor-pointer p-3 active:cursor-grabbing hover:border-primary transition-colors ${noActivity ? "border-amber-500/50" : isOverdue ? "border-rose-500/50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{l.name}</div>
                          {l.company && <div className="text-xs text-muted-foreground truncate">{l.company}</div>}
                          {l.source === "Discador" && (
                            <span className="mt-1 inline-flex items-center rounded-full border border-purple-500/40 bg-purple-500/10 px-1.5 py-0 text-[9px] font-medium text-purple-700 dark:text-purple-300">
                              Discador
                            </span>
                          )}
                        </div>
                        <span title={tempMeta.label} className={`shrink-0 inline-flex items-center justify-center h-5 px-1.5 rounded-full border text-[10px] ${tempMeta.color}`}>
                          {tempMeta.emoji}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User className="h-3 w-3" /><span className="truncate">{ownerName}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                        {ageLabel && <span title="Criado">criado: {ageLabel}</span>}
                        {stageLabel && <span title="Tempo na etapa atual">etapa: {stageLabel}</span>}
                        {lastLabel && <span title="Último contato"><Clock className="h-2.5 w-2.5 inline mr-0.5" />{lastLabel}</span>}
                      </div>

                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        {next ? (
                          <button
                            type="button"
                            onClick={() => setDetailsId(l.id)}
                            className={`w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] border transition-colors ${isOverdue ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20" : "bg-primary/5 border-primary/20 hover:bg-primary/10"}`}
                            title="Ver próxima atividade"
                          >
                            {isOverdue ? <AlertCircle className="h-3 w-3 shrink-0" /> : <CalendarClock className="h-3 w-3 shrink-0" />}
                            <span className="truncate">{labelFor(TASK_TYPES, next.type)} • {next.due_date.split("-").reverse().slice(0,2).join("/")}{next.due_time ? ` ${next.due_time.slice(0,5)}` : ""}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setQuickTaskLead(l)}
                            className="w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] border border-dashed border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15"
                            title="Sem atividade — agendar"
                          >
                            <CalendarPlus className="h-3 w-3 shrink-0" />
                            <span className="truncate">Sem atividade — agendar</span>
                          </button>
                        )}
                      </div>

                      <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {l.phone && (
                          <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                            <a href={waLink(l.phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><MessageCircle className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                        {l.linkedin_url && (
                          <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                            <a href={l.linkedin_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Linkedin className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Agendar atividade" onClick={(e) => { e.stopPropagation(); setQuickTaskLead(l); }}>
                          <CalendarPlus className="h-3.5 w-3.5" />
                        </Button>
                        <Select onValueChange={(v) => moveLead(l, v)}>
                          <SelectTrigger className="h-7 ml-auto w-[100px] text-xs" onClick={(e) => e.stopPropagation()}><SelectValue placeholder="Mover" /></SelectTrigger>
                          <SelectContent>
                            {LEAD_STATUSES.filter((s) => s.value !== l.status).map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <InterviewDialog lead={interviewLead} onClose={() => setInterviewLead(null)} onSaved={() => qc.invalidateQueries()} />
      <LostDialog lead={lostLead} onClose={() => setLostLead(null)} onSaved={() => qc.invalidateQueries()} />
      <MatriculaDialog lead={matriculaLead} onClose={() => setMatriculaLead(null)} onSaved={() => qc.invalidateQueries()} />
      <LeadDetailsDialog leadId={detailsId} onClose={() => setDetailsId(null)} />
      {quickTaskLead && (
        <QuickTaskDialog
          leadId={quickTaskLead.id}
          ownerId={quickTaskLead.owner_id}
          leadName={quickTaskLead.name}
          onClose={() => setQuickTaskLead(null)}
          onSaved={() => qc.invalidateQueries()}
        />
      )}
    </div>
  );
}

function InterviewDialog({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  if (!lead) return null;
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const date = String(fd.get("date"));
    const time = String(fd.get("time") || "");
    const notes = String(fd.get("notes") || "");
    const { error } = await supabase.from("leads").update({
      status: "entrevista_marcada",
      interview_date: date,
      interview_time: time || null,
      interview_notes: notes || null,
    }).eq("id", lead.id);
    if (!error) {
      await supabase.from("tasks").insert({
        lead_id: lead.id, owner_id: lead.owner_id, type: "confirmar_entrevista",
        due_date: date, due_time: time || null, status: "pendente",
        observation: "Confirmar entrevista",
      });
    }
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      await logLeadEvent({ leadId: lead.id, type: "interview_scheduled", description: `Entrevista marcada para ${date}${time ? " às " + time : ""}` });
      notifyArena(lead.id, "crm_interview_scheduled");
      toast.success("Entrevista marcada"); onSaved(); onClose();
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar entrevista — {lead.name}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data *</Label><Input type="date" name="date" required /></div>
            <div><Label>Horário</Label><Input type="time" name="time" /></div>
          </div>
          <div><Label>Observação</Label><Textarea name="notes" rows={3} /></div>
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={saving}>{saving ? "Salvando…" : "Marcar entrevista"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FOLLOWUP_OPTIONS = [
  { value: "none", label: "Não criar follow-up" },
  { value: "7", label: "Em 7 dias" },
  { value: "15", label: "Em 15 dias" },
  { value: "30", label: "Em 30 dias" },
  { value: "60", label: "Em 60 dias" },
  { value: "90", label: "Em 90 dias" },
  { value: "custom", label: "Data personalizada" },
];

function computeFollowupDate(opt: string, customDate: string): string | null {
  if (opt === "none") return null;
  if (opt === "custom") return customDate || null;
  const d = new Date(); d.setDate(d.getDate() + Number(opt));
  return d.toISOString().slice(0, 10);
}

function LostDialog({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState<string>("");
  const [type, setType] = useState<string>("definitivo");
  const [rescue, setRescue] = useState<string>("none");
  const [customDate, setCustomDate] = useState<string>("");
  const [followup, setFollowup] = useState<string>("none");
  const [followupDate, setFollowupDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  if (!lead) return null;

  const suggestion = LOST_REASONS.find((r) => r.value === reason)?.suggestRescueDays ?? null;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reason) { toast.error("Informe o motivo"); return; }
    setSaving(true);
    let rescueDate: string | null = null;
    let lostType: "definitivo" | "com_resgate" = "definitivo";
    if (rescue !== "none" && reason !== "nao_chamar") {
      lostType = "com_resgate";
      if (rescue === "custom") rescueDate = customDate || null;
      else {
        const d = new Date(); d.setDate(d.getDate() + Number(rescue));
        rescueDate = d.toISOString().slice(0, 10);
      }
    }
    const { error } = await supabase.from("leads").update({
      status: "perdido", lost_reason: reason as any, lost_type: lostType, rescue_date: rescueDate,
    }).eq("id", lead.id);
    if (!error && rescueDate) {
      await supabase.from("tasks").insert({
        lead_id: lead.id, owner_id: lead.owner_id, type: "resgate",
        due_date: rescueDate, status: "pendente", is_rescue: true, rescue_reason: reason as any,
        observation: `Resgate — motivo anterior: ${LOST_REASONS.find((r) => r.value === reason)?.label}`,
      });
    }
    const fDate = computeFollowupDate(followup, followupDate);
    if (!error && fDate) {
      await supabase.from("tasks").insert({
        lead_id: lead.id, owner_id: lead.owner_id, type: "enviar_mensagem",
        due_date: fDate, status: "pendente", observation: "Follow-up pós-perda",
      });
    }
    // cancel pending tasks (except rescue)
    await supabase.from("tasks").update({ status: "cancelada" })
      .eq("lead_id", lead.id).eq("status", "pendente").eq("is_rescue", false);

    setSaving(false);
    if (error) toast.error(error.message);
    else {
      await logLeadEvent({ leadId: lead.id, type: "lost", description: `Motivo: ${reason}${rescueDate ? ` · Resgate em ${rescueDate}` : ""}`, metadata: { reason, lostType, rescueDate } });
      // Apenas notifica perda à Arena quando já houve entrevista no histórico
      if (lead.interview_date) notifyArena(lead.id, "crm_lost_after_interview");
      toast.success("Lead marcado como perdido"); onSaved(); onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Marcar como perdido — {lead.name}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Motivo da perda *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {reason && reason !== "nao_chamar" && (
            <div>
              <Label>Esse lead deve entrar em resgate futuro?</Label>
              {suggestion !== null && <p className="text-xs text-muted-foreground mb-2">Sugestão para esse motivo: <strong>{suggestion} dias</strong></p>}
              <RadioGroup value={rescue} onValueChange={setRescue} className="grid grid-cols-2 gap-2 mt-2">
                {RESCUE_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-2"><RadioGroupItem value={String(o.value)} id={`r${o.value}`} /><Label htmlFor={`r${o.value}`}>Sim, {o.label}</Label></div>
                ))}
                <div className="flex items-center gap-2"><RadioGroupItem value="custom" id="rc" /><Label htmlFor="rc">Data personalizada</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="none" id="rn" /><Label htmlFor="rn">Não, perdido definitivo</Label></div>
              </RadioGroup>
              {rescue === "custom" && <Input type="date" className="mt-2" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />}
            </div>
          )}
          {reason === "nao_chamar" && <p className="text-xs text-amber-700 bg-amber-500/10 p-2 rounded">Este motivo não gera tarefa de resgate.</p>}

          <div>
            <Label>Criar follow-up nas suas tarefas?</Label>
            <Select value={followup} onValueChange={setFollowup}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{FOLLOWUP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {followup === "custom" && <Input type="date" className="mt-2" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} />}
          </div>

          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={saving} variant="destructive">{saving ? "Salvando…" : "Confirmar perda"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MatriculaDialog({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: () => void }) {
  const [enrollment, setEnrollment] = useState("");
  const [monthly, setMonthly] = useState("");
  const [material, setMaterial] = useState("");
  const [followup, setFollowup] = useState<string>("none");
  const [followupDate, setFollowupDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  if (!lead) return null;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const ev = enrollment ? Number(enrollment.replace(",", ".")) : null;
    const mv = monthly ? Number(monthly.replace(",", ".")) : null;
    const mt = material ? Number(material.replace(",", ".")) : null;
    if (ev === null || isNaN(ev) || mv === null || isNaN(mv) || mt === null || isNaN(mt)) {
      toast.error("Informe os três valores"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("leads").update({
      status: "matricula",
      enrollment_value: ev,
      monthly_fee: mv,
      material_value: mt,
    } as any).eq("id", lead.id);

    const fDate = computeFollowupDate(followup, followupDate);
    if (!error && fDate) {
      await supabase.from("tasks").insert({
        lead_id: lead.id, owner_id: lead.owner_id, type: "followup_pos",
        due_date: fDate, status: "pendente", observation: "Follow-up pós-matrícula",
      });
    }
    await supabase.from("tasks").update({ status: "concluida" })
      .eq("lead_id", lead.id).eq("status", "pendente").eq("is_rescue", false);

    setSaving(false);
    if (error) toast.error(error.message);
    else {
      await logLeadEvent({ leadId: lead.id, type: "enrolled", description: `Matrícula R$ ${ev} · Mensalidade R$ ${mv} · Material R$ ${mt}`, metadata: { ev, mv, mt } });
      const arenaRes = await notifyArenaAsync(lead.id, "crm_enrollment_created");
      if (arenaRes.ok) {
        toast.success("Matrícula registrada");
      } else {
        toast.warning("Matrícula salva no CRM, mas não foi enviada para a Arena. Verifique a integração.");
      }
      onSaved(); onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Registrar matrícula — {lead.name}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div><Label>Valor da matrícula (R$) *</Label><Input inputMode="decimal" value={enrollment} onChange={(e) => setEnrollment(e.target.value)} placeholder="0,00" required /></div>
          <div><Label>Valor da mensalidade (R$) *</Label><Input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0,00" required /></div>
          <div><Label>Valor do material (R$) *</Label><Input inputMode="decimal" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="0,00" required /></div>

          <div>
            <Label>Criar follow-up nas suas tarefas?</Label>
            <Select value={followup} onValueChange={setFollowup}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{FOLLOWUP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {followup === "custom" && <Input type="date" className="mt-2" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} />}
          </div>

          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={saving}>{saving ? "Salvando…" : "Confirmar matrícula"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
