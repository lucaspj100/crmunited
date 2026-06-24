import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { normalizeProspectPhone } from "@/lib/prospect-phone";
import { toast } from "sonner";
import type { ProspectContact } from "@/lib/prospect-queue";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: ProspectContact;
  onSaved: (updated: ProspectContact) => void;
};

export function EditContactDialog({ open, onOpenChange, contact, onSaved }: Props) {
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cargo, setCargo] = useState("");
  const [origem, setOrigem] = useState("");
  const [observacao, setObservacao] = useState("");
  const [telefone, setTelefone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(contact.nome ?? "");
    setEmpresa(contact.empresa ?? "");
    setCargo(contact.cargo ?? "");
    setOrigem(contact.origem ?? "");
    setObservacao(contact.observacao ?? "");
    setTelefone(contact.telefone_original || `+${contact.telefone_normalizado}`);
  }, [open, contact]);

  const save = async () => {
    setSaving(true);
    const patch: any = {
      nome: nome.trim() || null,
      empresa: empresa.trim() || null,
      cargo: cargo.trim() || null,
      origem: origem.trim() || null,
      observacao: observacao.trim() || null,
    };
    if (telefone.trim() && telefone.trim() !== (contact.telefone_original || `+${contact.telefone_normalizado}`)) {
      const norm = normalizeProspectPhone(telefone.trim());
      if (!norm.valid || !norm.normalized) {
        setSaving(false);
        toast.error("Telefone inválido");
        return;
      }
      if (norm.normalized !== contact.telefone_normalizado && contact.vendedor_responsavel_id) {
        const { data: dup } = await supabase
          .from("prospect_contacts")
          .select("id")
          .eq("vendedor_responsavel_id", contact.vendedor_responsavel_id)
          .eq("telefone_normalizado", norm.normalized)
          .neq("id", contact.id)
          .limit(1);
        if (dup && dup.length > 0) {
          setSaving(false);
          toast.error("Você já tem outro contato com esse telefone");
          return;
        }
      }
      patch.telefone_original = telefone.trim();
      patch.telefone_normalizado = norm.normalized;
      patch.ddd = norm.ddd;
    }
    const { data, error } = await supabase
      .from("prospect_contacts")
      .update(patch)
      .eq("id", contact.id)
      .select("*")
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contato atualizado");
    onSaved(data as ProspectContact);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar contato</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Empresa</Label><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} /></div>
            <div><Label>Cargo</Label><Input value={cargo} onChange={(e) => setCargo(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
            <div><Label>Origem</Label><Input value={origem} onChange={(e) => setOrigem(e.target.value)} /></div>
          </div>
          <div><Label>Observação</Label><Textarea rows={4} value={observacao} onChange={(e) => setObservacao(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
