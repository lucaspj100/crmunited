import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { LEAD_STATUSES } from "@/lib/constants";
import { normalizePhone } from "@/lib/phone";
import { ensureTaskForStatus } from "@/lib/task-automation";
import { logLeadEvent } from "@/lib/lead-events";

export function NewLeadDialog({ trigger }: { trigger?: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("novo");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const phoneRaw = String(fd.get("phone") || "").trim();
    const { normalized, valid } = normalizePhone(phoneRaw);

    // Verifica duplicidade pelo telefone normalizado
    if (normalized && valid) {
      const { data: dup } = await supabase
        .from("leads")
        .select("id, name, owner_id")
        .eq("phone_normalized", normalized)
        .limit(1);
      if (dup && dup.length > 0) {
        const existing = dup[0];
        const { data: prof } = await supabase
          .from("profiles").select("full_name, email").eq("id", existing.owner_id).maybeSingle();
        const vendName = prof?.full_name || prof?.email || "vendedor";
        toast.error(`Esse telefone já está cadastrado no lead "${existing.name}", com o vendedor ${vendName}.`);
        setSaving(false);
        return;
      }
    }

    const payload: any = {
      name: String(fd.get("name") || "").trim(),
      phone: phoneRaw || null,
      phone_normalized: normalized,
      phone_invalid: phoneRaw ? !valid : false,
      company: String(fd.get("company") || "").trim() || null,
      linkedin_url: String(fd.get("linkedin") || "").trim() || null,
      observation: String(fd.get("observation") || "").trim() || null,
      source: String(fd.get("source") || "").trim() || null,
      owner_id: user.id,
      status,
    };
    if (!payload.name) { toast.error("Informe o nome"); setSaving(false); return; }

    const { data, error } = await supabase.from("leads").insert(payload).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (data?.id) {
      await ensureTaskForStatus({ leadId: data.id, ownerId: user.id, status });
      await logLeadEvent({ leadId: data.id, type: "lead_created", description: `Lead criado com status "${status}"`, metadata: { status, source: payload.source } });
    }
    toast.success("Lead cadastrado");
    setOpen(false);
    setStatus("novo");
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.filter((s) => s.value !== "perdido" && s.value !== "matricula").map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Origem do lead</Label><Input name="source" placeholder="Instagram, indicação, site…" /></div>
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
