import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Pencil, Plus, Trash2, Archive, ArchiveRestore, Search } from "lucide-react";
import { toast } from "sonner";
import { AiAssistantPanel } from "@/components/scripts/AiAssistantPanel";
import { AiSettingsDialog, ScriptEditorDialog } from "@/components/scripts/ScriptDialogs";

export const Route = createFileRoute("/_authenticated/scripts")({
  head: () => ({
    meta: [
      { title: "Scripts e Assistente IA — CRM Comercial" },
      { name: "description", content: "Biblioteca de scripts oficiais de WhatsApp, LinkedIn, ligação e entrevistas, com assistente de IA para sugerir a próxima resposta." },
      { property: "og:title", content: "Scripts e Assistente IA — CRM Comercial" },
      { property: "og:description", content: "Biblioteca de scripts oficiais e assistente de IA para responder leads mais rápido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScriptsPage,
});

type Script = {
  id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
  sort_order: number;
};

const CATEGORIES = [
  { value: "todas", label: "Todas" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "ligacao", label: "Ligação" },
  { value: "entrevista", label: "Entrevistas" },
];

const CATEGORY_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  ligacao: "Ligação",
  entrevista: "Entrevistas",
};

function ScriptsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("todas");
  const [editing, setEditing] = useState<Script | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ["sales_scripts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_scripts")
        .select("id, title, content, category, is_active, sort_order")
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Script[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return scripts.filter((s) => {
      if (cat !== "todas" && s.category !== cat) return false;
      if (!term) return true;
      return s.title.toLowerCase().includes(term) || s.content.toLowerCase().includes(term);
    });
  }, [scripts, q, cat]);

  const copyScript = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Script copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const toggleActive = async (s: Script) => {
    const { error } = await supabase.from("sales_scripts").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["sales_scripts"] });
  };

  const remove = async (s: Script) => {
    if (!confirm(`Excluir o script "${s.title}"?`)) return;
    const { error } = await supabase.from("sales_scripts").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Script excluído.");
    qc.invalidateQueries({ queryKey: ["sales_scripts"] });
  };

  const openNew = () => {
    setEditing({ id: "", title: "", content: "", category: cat === "todas" ? "whatsapp" : cat, is_active: true, sort_order: 0 });
    setEditorOpen(true);
  };

  return (
    <div className="space-y-4 max-w-full">
      <header>
        <h1 className="text-xl md:text-2xl font-bold">Scripts</h1>
        <p className="hidden md:block text-sm text-muted-foreground">
          Scripts oficiais da equipe e assistente de IA para responder leads mais rápido.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Assistente aparece primeiro no mobile */}
        <div className="lg:order-2"><AiAssistantPanel /></div>

        <div className="space-y-3 lg:order-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar script…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {isAdmin && <AiSettingsDialog />}
            {isAdmin && (
              <Button size="sm" onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" /> Novo script
              </Button>
            )}
          </div>

          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {CATEGORIES.map((c) => (
              <Button
                key={c.value}
                size="sm"
                variant={cat === c.value ? "default" : "outline"}
                className="whitespace-nowrap"
                onClick={() => setCat(c.value)}
              >
                {c.label}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum script encontrado.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((s) => (
                <Card key={s.id} className={s.is_active ? "" : "opacity-60"}>
                  <CardContent className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{s.title}</div>
                        <div className="mt-1 flex items-center gap-1">
                          <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABEL[s.category] ?? s.category}</Badge>
                          {!s.is_active && <Badge variant="outline" className="text-[10px]">Arquivado</Badge>}
                        </div>
                      </div>
                    </div>
                    <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">
                      {s.content}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" onClick={() => copyScript(s.content)}>
                        <Copy className="mr-2 h-4 w-4" /> Copiar
                      </Button>
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => { setEditing(s); setEditorOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleActive(s)} title={s.is_active ? "Arquivar" : "Reativar"}>
                            {s.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {editorOpen && editing && (
        <ScriptEditorDialog
          key={editing.id || "new"}
          script={{ id: editing.id || undefined, title: editing.title, content: editing.content, category: editing.category, is_active: editing.is_active }}
          open={editorOpen}
          onOpenChange={(v) => { setEditorOpen(v); if (!v) setEditing(null); }}
        />
      )}
    </div>
  );
}
