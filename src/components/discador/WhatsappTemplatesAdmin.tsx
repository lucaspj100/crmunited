import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  renderTemplate,
  TEMPLATE_CATEGORY_LABELS,
  type WhatsappTemplate,
  type WhatsappTemplateCategory,
} from "@/lib/whatsapp-templates";

const SAMPLE = {
  nome: "Leandro Souza",
  empresa: "Aché",
  cargo: "Analista",
  vendedor: "Ana",
};

export function WhatsappTemplatesAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["wpp_templates_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates" as never)
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WhatsappTemplate[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wpp_templates_all"] });
    qc.invalidateQueries({ queryKey: ["wpp_templates", "primeira_abordagem"] });
    void fetchActiveTemplates; // keep import
  };

  const toggleActive = async (t: WhatsappTemplate) => {
    const { error } = await supabase
      .from("whatsapp_templates" as never)
      .update({ active: !t.active } as never)
      .eq("id", t.id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const remove = async (t: WhatsappTemplate) => {
    if (!window.confirm(`Apagar o modelo "${t.name}"?`)) return;
    const { error } = await supabase.from("whatsapp_templates" as never).delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Modelo apagado");
    invalidate();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Modelos de mensagem WhatsApp</CardTitle>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo modelo
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum modelo cadastrado.</div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded-md border p-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {TEMPLATE_CATEGORY_LABELS[t.category]}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs">
                      <Switch checked={t.active} onCheckedChange={() => toggleActive(t)} />
                      <span>{t.active ? "Ativo" : "Inativo"}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => remove(t)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs whitespace-pre-wrap break-words text-muted-foreground line-clamp-4">
                  {t.body}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <TemplateDialog
        open={creating || !!editing}
        template={editing}
        onOpenChange={(v) => {
          if (!v) { setEditing(null); setCreating(false); }
        }}
        onSaved={() => { setEditing(null); setCreating(false); invalidate(); }}
      />
    </Card>
  );
}

function TemplateDialog({
  open, template, onOpenChange, onSaved,
}: {
  open: boolean;
  template: WhatsappTemplate | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = !!template;
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [category, setCategory] = useState<WhatsappTemplateCategory>(template?.category ?? "primeira_abordagem");
  const [active, setActive] = useState(template?.active ?? true);

  // Reset ao abrir
  useMemo(() => {
    if (open) {
      setName(template?.name ?? "");
      setBody(template?.body ?? "");
      setCategory(template?.category ?? "primeira_abordagem");
      setActive(template?.active ?? true);
    }
  }, [open, template]);

  const preview = useMemo(() => renderTemplate(body, SAMPLE), [body]);

  const save = async () => {
    if (!name.trim() || !body.trim()) { toast.error("Preencha nome e mensagem"); return; }
    const payload = { name: name.trim(), body, category, active };
    if (isEdit && template) {
      const { error } = await supabase.from("whatsapp_templates" as never).update(payload as never).eq("id", template.id);
      if (error) return toast.error(error.message);
      toast.success("Modelo atualizado");
    } else {
      const { error } = await supabase.from("whatsapp_templates" as never).insert(payload as never);
      if (error) return toast.error(error.message);
      toast.success("Modelo criado");
    }
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar modelo" : "Novo modelo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Abordagem 1" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as WhatsappTemplateCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primeira_abordagem">Primeira abordagem</SelectItem>
                  <SelectItem value="followup">Follow-up</SelectItem>
                  <SelectItem value="confirmacao">Confirmação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Variáveis: <code>{"{{primeiro_nome}}"}</code>, <code>{"{{nome}}"}</code>, <code>{"{{empresa}}"}</code>, <code>{"{{cargo}}"}</code>, <code>{"{{vendedor}}"}</code>.
            </p>
          </div>
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Prévia</Label>
            <div className="mt-1 rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words min-h-[80px]">
              {preview || <span className="text-muted-foreground italic">A prévia aparecerá aqui.</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <span className="text-sm">{active ? "Ativo" : "Inativo"}</span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>{isEdit ? "Salvar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
