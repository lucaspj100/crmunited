import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function NewLeadDialog({ trigger }: { trigger?: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      phone: String(fd.get("phone") || "").trim() || null,
      company: String(fd.get("company") || "").trim() || null,
      linkedin_url: String(fd.get("linkedin") || "").trim() || null,
      observation: String(fd.get("observation") || "").trim() || null,
      owner_id: user.id,
      status: "interessado" as const,
    };
    if (!payload.name) { toast.error("Informe o nome"); setSaving(false); return; }
    const { data, error } = await supabase.from("leads").insert(payload).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    // create initial task: enviar mensagem hoje
    if (data?.id) {
      await supabase.from("tasks").insert({
        lead_id: data.id, owner_id: user.id, type: "enviar_mensagem",
        due_date: new Date().toISOString().slice(0, 10), status: "pendente",
        observation: "Primeiro contato",
      });
    }
    toast.success("Lead cadastrado");
    setOpen(false);
    qc.invalidateQueries();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus className="h-4 w-4 mr-2" />Novo lead</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cadastrar novo lead</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div><Label>Nome *</Label><Input name="name" required maxLength={200} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>WhatsApp / Telefone</Label><Input name="phone" placeholder="(11) 99999-9999" /></div>
            <div><Label>Empresa</Label><Input name="company" /></div>
          </div>
          <div><Label>LinkedIn</Label><Input name="linkedin" type="url" placeholder="https://linkedin.com/in/…" /></div>
          <div><Label>Observação</Label><Textarea name="observation" rows={3} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Cadastrar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
