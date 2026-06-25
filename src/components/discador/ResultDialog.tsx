import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROSPECT_RESULTS, type ProspectResult, applyResultToFields } from "@/lib/prospect-status";
import { supabase } from "@/integrations/supabase/client";
import { autoConvertProspectToLead } from "@/lib/prospect-auto-convert";
import type { ProspectContact } from "@/lib/prospect-queue";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: ProspectContact;
  vendedorId: string;
  initialAction?: "ligacao" | "whatsapp";
  onSaved: (goNext: boolean) => void;
};

export function ResultDialog({ open, onOpenChange, contact, vendedorId, initialAction, onSaved }: Props) {
  const [result, setResult] = useState<ProspectResult | "">("");
  const [obs, setObs] = useState("");
  const [proxima, setProxima] = useState("");
  const [saving, setSaving] = useState(false);

  const contactId = contact.id;
  const telefone = contact.telefone_normalizado;

  const save = async (goNext: boolean) => {
    if (!result) { toast.error("Selecione o resultado"); return; }
    if (result === "Ligar depois" && !proxima) { toast.error("Informe data/hora da próxima tentativa"); return; }
    setSaving(true);

    const proximaIso = result === "Ligar depois" ? new Date(proxima).toISOString() : null;
    const patch = applyResultToFields(result, proximaIso);

    const { error: e1 } = await supabase.from("prospect_contacts").update(patch as never).eq("id", contactId);
    if (e1) { setSaving(false); toast.error(e1.message); return; }

    await supabase.from("prospect_attempts").insert({
      prospect_contact_id: contactId,
      vendedor_id: vendedorId,
      tipo_acao: initialAction ?? "edicao",
      telefone_normalizado: telefone,
      resultado: result,
      observacao: obs || null,
    });

    // 1) Ligar depois → criar tarefa de retorno
    if (result === "Ligar depois" && proximaIso) {
      const d = new Date(proximaIso);
      const due_date = d.toISOString().slice(0, 10);
      const due_time = d.toTimeString().slice(0, 8);
      const nome = contact.nome || "Contato";
      const tel = contact.telefone_original || `+${telefone}`;
      const { error: te } = await supabase.from("tasks").insert({
        owner_id: vendedorId,
        prospect_contact_id: contactId,
        lead_id: contact.lead_id ?? null,
        type: "retorno_ligacao" as never,
        status: "pendente",
        due_date,
        due_time,
        observation: `Retornar ligação para ${nome} - ${tel}${obs ? `\n${obs}` : ""}`,
      } as never);
      if (te) {
        // Não bloqueia o fluxo, mas avisa
        toast.error(`Resultado salvo, tarefa de retorno falhou: ${te.message}`);
      } else {
        toast.success("Retorno agendado");
      }
    }

    // 2) Interessado / Pediu WhatsApp → auto-converter em lead
    if (result === "Interessado" || result === "Pediu WhatsApp") {
      const conv = await autoConvertProspectToLead({ contact, vendedorId, resultLabel: result });
      if (!conv.ok) {
        toast.error(`Resultado salvo, mas não foi possível criar o lead no funil. ${conv.error}`);
      } else {
        toast.success(conv.created ? "Lead criado no funil automaticamente" : "Contato vinculado a lead já existente");
      }
    }

    setSaving(false);
    setResult(""); setObs(""); setProxima("");
    onOpenChange(false);
    onSaved(goNext);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar resultado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Resultado</Label>
            <Select value={result} onValueChange={(v) => setResult(v as ProspectResult)}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {PROSPECT_RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {result === "Ligar depois" && (
            <div>
              <Label>Próxima tentativa</Label>
              <Input type="datetime-local" value={proxima} onChange={(e) => setProxima(e.target.value)} />
            </div>
          )}
          {(result === "Interessado" || result === "Pediu WhatsApp") && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
              Ao salvar, este contato será convertido automaticamente em lead no funil (coluna Interessado).
            </div>
          )}
          <div>
            <Label>Observação</Label>
            <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>Salvar</Button>
          <Button onClick={() => save(true)} disabled={saving}>Salvar e ir para próximo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
