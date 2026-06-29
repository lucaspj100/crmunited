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
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

type DialMeta = {
  telefone_para_discagem: string | null;
  ddd_origem_vendedor: string | null;
  prefixo_interurbano: string | null;
  ddd_destino_contato: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: ProspectContact;
  vendedorId: string;
  initialAction?: "ligacao" | "whatsapp";
  dialMeta?: DialMeta;
  onSaved: (goNext: boolean) => void;
};

export function ResultDialog({ open, onOpenChange, contact, vendedorId, initialAction, dialMeta, onSaved }: Props) {
  const [result, setResult] = useState<ProspectResult | "">("");
  const [obs, setObs] = useState("");
  const [proxima, setProxima] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const contactId = contact.id;
  const telefone = contact.telefone_normalizado;

  const save = async (goNext: boolean) => {
    if (!result) { toast.error("Selecione o resultado"); return; }
    if (result === "Ligar depois" && !proxima) { toast.error("Informe data/hora da próxima tentativa"); return; }
    setSaving(true);

    // Parse datetime-local sem timezone (mantém o horário local digitado)
    let due_date = "";
    let due_time = "";
    let proximaIso: string | null = null;
    if (result === "Ligar depois") {
      const [datePart, timePartRaw] = proxima.split("T");
      due_date = datePart;
      due_time = timePartRaw && timePartRaw.length === 5 ? `${timePartRaw}:00` : (timePartRaw ?? "00:00:00");
      // Para registrar em prospect_contacts.proxima_tentativa usamos ISO do horário local
      proximaIso = new Date(`${due_date}T${due_time}`).toISOString();
    }
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

    // Sincroniza observação mais recente em prospect_contacts.observacao (preserva histórico anterior)
    const obsTrim = obs.trim();
    if (obsTrim) {
      const stamp = format(new Date(), "dd/MM HH:mm");
      const tipoLabel = (initialAction ?? "edicao") === "whatsapp" ? "WhatsApp" : (initialAction === "ligacao" ? "Ligação" : "Registro");
      const newEntry = `[${stamp}] ${tipoLabel} - ${result}: ${obsTrim}`;
      const prev = (contact.observacao ?? "").trim();
      const merged = prev ? `${newEntry}\n${prev}` : newEntry;
      // Limita tamanho para evitar crescimento infinito (mantém ~4000 chars)
      const capped = merged.length > 4000 ? merged.slice(0, 4000) : merged;
      const { error: eObs } = await supabase
        .from("prospect_contacts")
        .update({ observacao: capped })
        .eq("id", contactId);
      if (eObs) console.warn("[ResultDialog] falha ao sincronizar observacao", eObs);
    }


    // 1) Ligar depois → criar tarefa de retorno
    if (result === "Ligar depois" && due_date) {
      const nome = contact.nome || "Contato sem nome";
      const tel = contact.telefone_original || `+${telefone}`;
      const empresa = contact.empresa?.trim() || "Empresa não informada";
      const cargo = contact.cargo?.trim() || "Cargo não informado";
      const sellerNote = obs.trim() || "(nenhuma)";
      const observation = [
        "Retorno solicitado pelo lead.",
        `Contato: ${nome}`,
        `Telefone: ${tel}`,
        `Empresa: ${empresa}`,
        `Cargo: ${cargo}`,
        `Observação do vendedor: ${sellerNote}`,
      ].join("\n");
      const payload = {
        owner_id: vendedorId,
        prospect_contact_id: contactId,
        lead_id: contact.lead_id ?? null,
        type: "retorno_ligacao",
        status: "pendente",
        due_date,
        due_time,
        observation,
      };
      console.log("[ResultDialog] criando task retorno_ligacao", payload);
      const { data: inserted, error: te } = await supabase
        .from("tasks")
        .insert(payload as never)
        .select("id")
        .maybeSingle();
      if (te) {
        console.error("[ResultDialog] falha ao criar task retorno_ligacao", te);
        toast.error(`Resultado salvo, tarefa de retorno falhou: ${te.message}`);
      } else {
        console.log("[ResultDialog] task criada", inserted);
        const [hh, mm] = due_time.split(":");
        const [yyyy, mo, dd] = due_date.split("-");
        toast.success(`Retorno agendado para ${dd}/${mo} às ${hh}:${mm}`);
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
    queryClient.invalidateQueries({ queryKey: ["my_prospect_contacts"] });
    queryClient.invalidateQueries({ queryKey: ["prospect_queue"] });
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
