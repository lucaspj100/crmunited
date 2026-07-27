import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [
  { key: "instructions", label: "Instruções gerais e padrão de linguagem" },
  { key: "course_information", label: "Informações oficiais do curso" },
  { key: "pricing_rules", label: "Valores de referência e regras do processo" },
  { key: "objection_rules", label: "Regras de objeção e mensagens padrão" },
  { key: "prohibited_claims", label: "O que a IA não pode afirmar" },
] as const;

type Settings = Record<(typeof FIELDS)[number]["key"], string>;

export function AiSettingsDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Settings | null>(null);

  const { data, isLoading } = useQuery({
    enabled: open,
    queryKey: ["ai_assistant_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_assistant_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      const base: Settings = {
        instructions: data?.instructions ?? "",
        course_information: data?.course_information ?? "",
        pricing_rules: data?.pricing_rules ?? "",
        objection_rules: data?.objection_rules ?? "",
        prohibited_claims: data?.prohibited_claims ?? "",
      };
      setForm(base);
      return base;
    },
  });

  const save = useMutation({
    mutationFn: async (values: Settings) => {
      const { error } = await supabase
        .from("ai_assistant_settings")
        .upsert({ id: true, ...values }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva.");
      qc.invalidateQueries({ queryKey: ["ai_assistant_settings"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const values = form ?? data ?? null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="mr-2 h-4 w-4" /> Configuração da IA
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Configuração do Assistente IA</DialogTitle></DialogHeader>
          {isLoading || !values ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Textarea
                    rows={5}
                    className="mt-1 text-xs"
                    value={values[f.key]}
                    onChange={(e) => setForm({ ...values, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={!values || save.isPending} onClick={() => values && save.mutate(values)}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ScriptEditorDialog({
  script,
  open,
  onOpenChange,
}: {
  script: { id?: string; title: string; content: string; category: string; is_active: boolean } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(script?.title ?? "");
  const [content, setContent] = useState(script?.content ?? "");
  const [category, setCategory] = useState(script?.category ?? "whatsapp");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) { toast.error("Preencha título e conteúdo."); return; }
    setSaving(true);
    const payload = { title: title.trim(), content, category };
    const { error } = script?.id
      ? await supabase.from("sales_scripts").update(payload).eq("id", script.id)
      : await supabase.from("sales_scripts").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(script?.id ? "Script atualizado." : "Script criado.");
    qc.invalidateQueries({ queryKey: ["sales_scripts"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{script?.id ? "Editar script" : "Novo script"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></div>
          <div>
            <Label>Categoria</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="linkedin">LinkedIn</option>
              <option value="ligacao">Ligação</option>
              <option value="entrevista">Entrevistas</option>
            </select>
          </div>
          <div>
            <Label>Conteúdo</Label>
            <Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Variáveis disponíveis: #nome, #vendedor, #empresa, #data, #horario
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
