import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROSPECT_RESULTS, type ProspectResult, applyResultToFields } from "@/lib/prospect-status";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contactId: string;
  vendedorId: string;
  telefone: string;
  initialAction?: "ligacao" | "whatsapp";
  onSaved: (goNext: boolean) => void;
};

export function ResultDialog({ open, onOpenChange, contactId, vendedorId, telefone, initialAction, onSaved }: Props) {
  const [result, setResult] = useState<ProspectResult | "">("");
  const [obs, setObs] = useState("");
  const [proxima, setProxima] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (goNext: boolean) => {
    if (!result) { toast.error("Selecione o resultado"); return; }
    if (result === "Ligar depois" && !proxima) { toast.error("Informe data/hora da próxima tentativa"); return; }
    setSaving(true);
    const patch = applyResultToFields(result, result === "Ligar depois" ? new Date(proxima).toISOString() : null);
    const { error: e1 } = await supabase.from("prospect_contacts").update(patch).eq("id", contactId);
    if (e1) { setSaving(false); toast.error(e1.message); return; }
    await supabase.from("prospect_attempts").insert({
      prospect_contact_id: contactId,
      vendedor_id: vendedorId,
      tipo_acao: initialAction ?? "edicao",
      telefone_normalizado: telefone,
      resultado: result,
      observacao: obs || null,
    });
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
