import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_STATUSES } from "@/lib/constants";
import { ensureTaskForStatus } from "@/lib/task-automation";
import { logLeadEvent } from "@/lib/lead-events";
import { toast } from "sonner";
import type { ProspectContact } from "@/lib/prospect-queue";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: ProspectContact;
  vendedorId: string;
  onConverted: () => void;
};

export function ConvertLeadDialog({ open, onOpenChange, contact, vendedorId, onConverted }: Props) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("interessado");
  const [observation, setObservation] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicateLeadId, setDuplicateLeadId] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setName(contact.nome ?? "");
    setCompany(contact.empresa ?? "");
    setSource(contact.origem ?? "");
    setObservation([contact.cargo ? `Cargo: ${contact.cargo}` : "", contact.observacao ?? ""].filter(Boolean).join("\n"));
    setStatus("interessado");
    setDuplicateLeadId(null);
    setDuplicateInfo("");
    (async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name, owner_id")
        .eq("phone_normalized", contact.telefone_normalizado)
        .limit(1);
      if (data && data.length > 0) {
        const lead = data[0];
        const { data: prof } = await supabase.from("profiles").select("full_name, email").eq("id", lead.owner_id).maybeSingle();
        setDuplicateLeadId(lead.id);
        setDuplicateInfo(`Telefone já está no CRM como lead "${lead.name}" (${prof?.full_name || prof?.email || "vendedor"}).`);
      }
    })();
  }, [open, contact]);

  const linkExisting = async () => {
    if (!duplicateLeadId) return;
    await supabase
      .from("prospect_contacts")
      .update({ convertido_em_lead: true, lead_id: duplicateLeadId, status_prospeccao: "Convertido em lead" })
      .eq("id", contact.id);
    toast.success("Vinculado ao lead existente");
    onOpenChange(false);
    onConverted();
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    const payload: any = {
      name: name.trim(),
      phone: contact.telefone_original || `+${contact.telefone_normalizado}`,
      phone_normalized: contact.telefone_normalizado,
      phone_invalid: false,
      company: company.trim() || null,
      observation: observation.trim() || null,
      source: source.trim() || "Discador",
      owner_id: vendedorId,
      status,
    };
    const { data, error } = await supabase.from("leads").insert(payload).select("id").single();
    if (error) { setSaving(false); toast.error(error.message); return; }
    const leadId = data!.id;
    await ensureTaskForStatus({ leadId, ownerId: vendedorId, status });
    await logLeadEvent({ leadId, type: "lead_created", description: `Lead criado via Discador (status "${status}")`, metadata: { status, source: payload.source, from: "discador", prospect_id: contact.id } });
    await supabase
      .from("prospect_contacts")
      .update({ convertido_em_lead: true, lead_id: leadId, status_prospeccao: "Convertido em lead" })
      .eq("id", contact.id);
    setSaving(false);
    toast.success("Lead criado no CRM");
    onOpenChange(false);
    onConverted();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Converter em lead no CRM</DialogTitle></DialogHeader>
        {duplicateLeadId ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              {duplicateInfo}
            </div>
            <p className="text-sm text-muted-foreground">Você pode vincular este contato ao lead existente em vez de criar outro.</p>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button onClick={linkExisting}>Vincular ao lead existente</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Telefone</Label><Input value={`+${contact.telefone_normalizado}`} disabled /></div>
                <div><Label>Empresa</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status no funil</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.filter((s) => s.value !== "perdido" && s.value !== "matricula").map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Origem</Label><Input value={source} onChange={(e) => setSource(e.target.value)} /></div>
              </div>
              <div><Label>Observação comercial</Label><Textarea rows={4} value={observation} onChange={(e) => setObservation(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Criar lead no CRM"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
