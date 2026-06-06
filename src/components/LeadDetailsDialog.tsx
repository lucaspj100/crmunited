import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUSES, LOST_REASONS } from "@/lib/constants";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type LeadDetails = {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  linkedin_url: string | null;
  observation: string | null;
  status: string;
  owner_id: string;
  interview_date?: string | null;
  interview_time?: string | null;
  interview_notes?: string | null;
  lost_reason?: string | null;
  lost_type?: string | null;
  rescue_date?: string | null;
  enrollment_value?: number | null;
  monthly_fee?: number | null;
  material_value?: number | null;
};

export function LeadDetailsDialog({
  leadId,
  onClose,
}: {
  leadId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [lead, setLead] = useState<LeadDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // editable fields (mesmos do cadastro)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [observation, setObservation] = useState("");

  useEffect(() => {
    if (!leadId) { setLead(null); return; }
    setLoading(true);
    supabase.from("leads").select("*").eq("id", leadId).single().then(({ data, error }) => {
      setLoading(false);
      if (error || !data) { toast.error(error?.message || "Lead não encontrado"); onClose(); return; }
      const l = data as LeadDetails;
      setLead(l);
      setName(l.name || "");
      setPhone(l.phone || "");
      setCompany(l.company || "");
      setLinkedin(l.linkedin_url || "");
      setObservation(l.observation || "");
    });
  }, [leadId]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!lead) return;
    if (!name.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    const { error } = await supabase.from("leads").update({
      name: name.trim(),
      phone: phone.trim() || null,
      company: company.trim() || null,
      linkedin_url: linkedin.trim() || null,
      observation: observation.trim() || null,
    }).eq("id", lead.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lead atualizado");
    qc.invalidateQueries();
    onClose();
  };

  const statusLabel = LEAD_STATUSES.find((s) => s.value === lead?.status)?.label ?? lead?.status;
  const lostReasonLabel = LOST_REASONS.find((r) => r.value === lead?.lost_reason)?.label;

  return (
    <Dialog open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalhes do lead
            {lead && <Badge variant="secondary">{statusLabel}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {loading || !lead ? (
          <p className="text-sm text-muted-foreground py-6">Carregando…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label>WhatsApp / Telefone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" /></div>
              <div><Label>Empresa</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
            </div>
            <div><Label>LinkedIn</Label><Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} type="url" placeholder="https://linkedin.com/in/…" /></div>
            <div><Label>Observação</Label><Textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={3} /></div>

            {(lead.interview_date || lead.interview_time || lead.interview_notes) && (
              <div className="rounded-md border p-3 space-y-1 bg-muted/30">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Entrevista</div>
                {lead.interview_date && <div className="text-sm">Data: {lead.interview_date}{lead.interview_time ? ` às ${lead.interview_time}` : ""}</div>}
                {lead.interview_notes && <div className="text-sm">Obs.: {lead.interview_notes}</div>}
              </div>
            )}

            {lead.status === "perdido" && (lead.lost_reason || lead.rescue_date) && (
              <div className="rounded-md border p-3 space-y-1 bg-muted/30">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Perda</div>
                {lostReasonLabel && <div className="text-sm">Motivo: {lostReasonLabel}</div>}
                {lead.lost_type && <div className="text-sm">Tipo: {lead.lost_type === "com_resgate" ? "Com resgate" : "Definitivo"}</div>}
                {lead.rescue_date && <div className="text-sm">Resgate em: {lead.rescue_date}</div>}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
