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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LEAD_STATUSES, LOST_REASONS, RESCUE_OPTIONS, waLink } from "@/lib/constants";
import { Kanban, MessageCircle, Linkedin } from "lucide-react";
import { NewLeadDialog } from "@/components/NewLeadDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/funil")({ component: FunilPage });

type Lead = {
  id: string; name: string; phone: string | null; company: string | null;
  linkedin_url: string | null; status: string; owner_id: string;
};

function FunilPage() {
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [interviewLead, setInterviewLead] = useState<Lead | null>(null);
  const [lostLead, setLostLead] = useState<Lead | null>(null);

  const { data: leads = [] } = useQuery({
    queryKey: ["leads-funil"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return data as Lead[];
    },
  });

  const moveLead = async (lead: Lead, newStatus: string) => {
    if (lead.status === newStatus) return;
    if (newStatus === "entrevista_marcada") { setInterviewLead(lead); return; }
    if (newStatus === "perdido") { setLostLead(lead); return; }
    const { error } = await supabase.from("leads").update({ status: newStatus }).eq("id", lead.id);
    if (error) toast.error(error.message);
    else { toast.success("Lead movido"); qc.invalidateQueries(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Kanban className="h-6 w-6 text-primary" />Funil Comercial</h1>
          <p className="text-sm text-muted-foreground">Arraste os leads entre as etapas</p>
        </div>
        <NewLeadDialog />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {LEAD_STATUSES.map((col) => {
          const items = leads.filter((l) => l.status === col.value);
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
                {items.map((l) => (
                  <Card
                    key={l.id}
                    draggable
                    onDragStart={() => setDraggingId(l.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className="cursor-grab p-3 active:cursor-grabbing hover:border-primary transition-colors"
                  >
                    <div className="font-medium text-sm">{l.name}</div>
                    {l.company && <div className="text-xs text-muted-foreground">{l.company}</div>}
                    <div className="mt-2 flex gap-1">
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
                      <Select onValueChange={(v) => moveLead(l, v)}>
                        <SelectTrigger className="h-7 ml-auto w-[110px] text-xs"><SelectValue placeholder="Mover" /></SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.filter((s) => s.value !== l.status).map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <InterviewDialog lead={interviewLead} onClose={() => setInterviewLead(null)} onSaved={() => qc.invalidateQueries()} />
      <LostDialog lead={lostLead} onClose={() => setLostLead(null)} onSaved={() => qc.invalidateQueries()} />
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
    else { toast.success("Entrevista marcada"); onSaved(); onClose(); }
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

function LostDialog({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState<string>("");
  const [type, setType] = useState<string>("definitivo");
  const [rescue, setRescue] = useState<string>("none");
  const [customDate, setCustomDate] = useState<string>("");
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
      status: "perdido", lost_reason: reason, lost_type: lostType, rescue_date: rescueDate,
    }).eq("id", lead.id);
    if (!error && rescueDate) {
      await supabase.from("tasks").insert({
        lead_id: lead.id, owner_id: lead.owner_id, type: "resgate",
        due_date: rescueDate, status: "pendente", is_rescue: true, rescue_reason: reason,
        observation: `Resgate — motivo anterior: ${LOST_REASONS.find((r) => r.value === reason)?.label}`,
      });
    }
    // cancel pending tasks (except rescue)
    await supabase.from("tasks").update({ status: "cancelada" })
      .eq("lead_id", lead.id).eq("status", "pendente").eq("is_rescue", false);

    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Lead marcado como perdido"); onSaved(); onClose(); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
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
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={saving} variant="destructive">{saving ? "Salvando…" : "Confirmar perda"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
