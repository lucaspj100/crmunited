import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { ASSISTANTS, type AssistantKind } from "@/lib/ai-assistants";

const KNOWLEDGE_KINDS: { value: string; label: string }[] = [
  { value: "conhecimento", label: "Conhecimento geral" },
  { value: "curso", label: "Informações do curso" },
  { value: "valores", label: "Valores e tabelas" },
  { value: "limites", label: "Limites de autonomia" },
  { value: "materiais", label: "Materiais" },
  { value: "inicio", label: "Datas de início" },
  { value: "estrategia", label: "Estratégia comercial" },
  { value: "frase_aprovada", label: "Frases aprovadas" },
  { value: "frase_proibida", label: "Frases proibidas" },
  { value: "spin", label: "Perguntas SPIN" },
  { value: "criterio", label: "Critérios de avaliação" },
  { value: "comportamento", label: "Comportamento da IA" },
];

type Knowledge = {
  id: string;
  kind: string;
  title: string;
  category: string;
  description: string;
  content: string;
  priority: number;
  is_active: boolean;
  assistants: AssistantKind[];
  valid_from: string;
  valid_until: string | null;
};

const EMPTY_KNOWLEDGE: Knowledge = {
  id: "",
  kind: "conhecimento",
  title: "",
  category: "",
  description: "",
  content: "",
  priority: 100,
  is_active: true,
  assistants: [],
  valid_from: new Date().toISOString().slice(0, 10),
  valid_until: null,
};

function useLog() {
  return async (table: string, action: string, targetId: string | null, prev: unknown, next: unknown, reason: string) => {
    await supabase.from("ai_knowledge_versions").insert({
      target_table: table,
      target_id: targetId,
      action,
      previous_data: (prev ?? null) as never,
      new_data: (next ?? null) as never,
      reason,
    });
  };
}

function KnowledgeTab() {
  const qc = useQueryClient();
  const log = useLog();
  const [editing, setEditing] = useState<Knowledge | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [kindFilter, setKindFilter] = useState("todos");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["ai-knowledge"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_items")
        .select("id, kind, title, category, description, content, priority, is_active, assistants, valid_from, valid_until")
        .order("kind")
        .order("priority");
      if (error) throw error;
      return (data ?? []) as Knowledge[];
    },
  });

  const filtered = kindFilter === "todos" ? items : items.filter((i) => i.kind === kindFilter);

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.content.trim()) {
      toast.error("Título e conteúdo são obrigatórios.");
      return;
    }
    setSaving(true);
    const payload = {
      kind: editing.kind as never,
      title: editing.title,
      category: editing.category,
      description: editing.description,
      content: editing.content,
      priority: editing.priority,
      is_active: editing.is_active,
      assistants: editing.assistants as never,
      valid_from: editing.valid_from,
      valid_until: editing.valid_until || null,
    };
    if (editing.id) {
      const prev = items.find((i) => i.id === editing.id) ?? null;
      const { error } = await supabase.from("ai_knowledge_items").update(payload).eq("id", editing.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      await log("ai_knowledge_items", "update", editing.id, prev, payload, reason);
    } else {
      const { data, error } = await supabase.from("ai_knowledge_items").insert(payload).select("id").maybeSingle();
      setSaving(false);
      if (error) return toast.error(error.message);
      await log("ai_knowledge_items", "create", data?.id ?? null, null, payload, reason);
    }
    toast.success("Base atualizada. A IA já usa esta versão.");
    setEditing(null);
    setReason("");
    qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={kindFilter === "todos" ? "default" : "outline"} onClick={() => setKindFilter("todos")}>
          Todos
        </Button>
        {KNOWLEDGE_KINDS.map((k) => (
          <Button
            key={k.value}
            size="sm"
            variant={kindFilter === k.value ? "default" : "outline"}
            onClick={() => setKindFilter(k.value)}
          >
            {k.label}
          </Button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ ...EMPTY_KNOWLEDGE, kind: kindFilter === "todos" ? "conhecimento" : kindFilter })}>
          <Plus className="mr-2 h-4 w-4" /> Novo item
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item nesta categoria.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {filtered.map((i) => (
            <Card key={i.id} className={i.is_active ? "" : "opacity-60"}>
              <CardContent className="space-y-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{i.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {KNOWLEDGE_KINDS.find((k) => k.value === i.kind)?.label ?? i.kind}
                      </Badge>
                      {i.assistants.map((a) => (
                        <Badge key={a} variant="outline" className="text-[10px]">
                          {ASSISTANTS.find((x) => x.kind === a)?.short ?? a}
                        </Badge>
                      ))}
                      {!i.is_active && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(i)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">
                  {i.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar item da base" : "Novo item da base"}</DialogTitle>
            <DialogDescription>
              Tudo que você escrever aqui passa a valer imediatamente para os assistentes.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Categoria da base</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={editing.kind}
                    onChange={(e) => setEditing({ ...editing, kind: e.target.value })}
                  >
                    {KNOWLEDGE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Título</Label>
                  <Input className="mt-1" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Descrição curta</Label>
                <Input className="mt-1" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Conteúdo</Label>
                <Textarea rows={10} className="mt-1 text-sm" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Assistentes que usam este item (nenhum marcado = todos)</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ASSISTANTS.map((a) => {
                    const on = editing.assistants.includes(a.kind);
                    return (
                      <Badge
                        key={a.kind}
                        variant={on ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            assistants: on ? editing.assistants.filter((x) => x !== a.kind) : [...editing.assistants, a.kind],
                          })
                        }
                      >
                        {a.short}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <div>
                  <Label className="text-xs">Prioridade</Label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={editing.priority}
                    onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Válido de</Label>
                  <Input type="date" className="mt-1" value={editing.valid_from} onChange={(e) => setEditing({ ...editing, valid_from: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Válido até</Label>
                  <Input type="date" className="mt-1" value={editing.valid_until ?? ""} onChange={(e) => setEditing({ ...editing, valid_until: e.target.value || null })} />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <Label className="text-xs">Ativo</Label>
                  <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Motivo da alteração (auditoria)</Label>
                <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Objection = {
  id: string;
  objection: string;
  category: string;
  possible_causes: string;
  diagnostic_questions: string;
  recommended_approach: string;
  when_to_work_value: string;
  when_to_followup: string;
  when_to_ask_decision: string;
  when_to_close: string;
  possible_condition: string;
  mistakes_to_avoid: string;
  is_active: boolean;
};

const EMPTY_OBJECTION: Objection = {
  id: "",
  objection: "",
  category: "",
  possible_causes: "",
  diagnostic_questions: "",
  recommended_approach: "",
  when_to_work_value: "",
  when_to_followup: "",
  when_to_ask_decision: "",
  when_to_close: "",
  possible_condition: "",
  mistakes_to_avoid: "",
  is_active: true,
};

const OBJ_FIELDS: [keyof Objection, string][] = [
  ["possible_causes", "Possíveis causas reais"],
  ["diagnostic_questions", "Perguntas de diagnóstico"],
  ["recommended_approach", "Abordagem recomendada"],
  ["when_to_work_value", "Quando trabalhar valor"],
  ["when_to_followup", "Quando fazer follow-up"],
  ["when_to_ask_decision", "Quando pedir decisão"],
  ["when_to_close", "Quando encerrar com educação"],
  ["possible_condition", "Condição possível (se houver)"],
  ["mistakes_to_avoid", "Erros que a IA nunca deve cometer"],
];

function ObjectionsTab() {
  const qc = useQueryClient();
  const log = useLog();
  const [editing, setEditing] = useState<Objection | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ai-objections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_objections").select("*").order("objection");
      if (error) throw error;
      return (data ?? []) as unknown as Objection[];
    },
  });

  const save = async () => {
    if (!editing) return;
    if (!editing.objection.trim()) return toast.error("Descreva a objeção.");
    setSaving(true);
    const { id, ...payload } = editing;
    const res = id
      ? await supabase.from("ai_objections").update(payload as never).eq("id", id)
      : await supabase.from("ai_objections").insert(payload as never);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    await log("ai_objections", id ? "update" : "create", id || null, null, payload, "");
    toast.success("Objeção salva.");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["ai-objections"] });
  };

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setEditing(EMPTY_OBJECTION)}>
        <Plus className="mr-2 h-4 w-4" /> Nova objeção
      </Button>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((o) => (
            <Card key={o.id} className={o.is_active ? "" : "opacity-60"}>
              <CardContent className="space-y-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{o.objection}</p>
                  <Button size="sm" variant="outline" onClick={() => setEditing(o)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="line-clamp-3 text-[11px] text-muted-foreground">{o.recommended_approach}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Objeção</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Objeção</Label>
                  <Input className="mt-1" value={editing.objection} onChange={(e) => setEditing({ ...editing, objection: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Input className="mt-1" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
                </div>
              </div>
              {OBJ_FIELDS.map(([k, label]) => (
                <div key={k}>
                  <Label className="text-xs">{label}</Label>
                  <Textarea
                    rows={2}
                    className="mt-1 text-sm"
                    value={String(editing[k] ?? "")}
                    onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Label className="text-xs">Ativa</Label>
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const CAMPAIGN_FIELDS: [string, string][] = [
  ["name", "Nome da campanha"],
  ["reference_month", "Mês de referência"],
  ["conditions", "Condições válidas"],
  ["reason", "Motivo comercial"],
  ["allowed_urgency", "Urgência permitida"],
  ["allowed_phrases", "Frases permitidas"],
  ["forbidden_phrases", "Frases proibidas"],
  ["approved_message", "Mensagem aprovada"],
];

function CampaignTab() {
  const qc = useQueryClient();
  const log = useLog();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean | null> | null>(null);

  const { data: row } = useQuery({
    queryKey: ["ai-campaign"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_campaigns").select("*").order("updated_at", { ascending: false }).limit(1);
      return (data ?? [])[0] ?? null;
    },
  });

  const state = form ?? (row as Record<string, string | boolean | null> | null) ?? {
    name: "",
    reference_month: "",
    conditions: "",
    reason: "",
    allowed_urgency: "",
    allowed_phrases: "",
    forbidden_phrases: "",
    approved_message: "",
    starts_on: null,
    ends_on: null,
    is_active: true,
  };

  const set = (k: string, v: string | boolean | null) => setForm({ ...state, [k]: v });

  const save = async () => {
    setSaving(true);
    const payload = {
      name: String(state.name ?? ""),
      reference_month: String(state.reference_month ?? ""),
      conditions: String(state.conditions ?? ""),
      reason: String(state.reason ?? ""),
      allowed_urgency: String(state.allowed_urgency ?? ""),
      allowed_phrases: String(state.allowed_phrases ?? ""),
      forbidden_phrases: String(state.forbidden_phrases ?? ""),
      approved_message: String(state.approved_message ?? ""),
      starts_on: (state.starts_on as string) || null,
      ends_on: (state.ends_on as string) || null,
      is_active: state.is_active !== false,
    };
    const id = row?.id as string | undefined;
    const res = id
      ? await supabase.from("ai_campaigns").update(payload).eq("id", id)
      : await supabase.from("ai_campaigns").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    await log("ai_campaigns", id ? "update" : "create", id ?? null, row, payload, "");
    toast.success("Campanha atualizada.");
    qc.invalidateQueries({ queryKey: ["ai-campaign"] });
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <p className="text-xs text-muted-foreground">
          A campanha ativa é injetada nos assistentes. Fora da vigência, a IA ignora automaticamente.
        </p>
        {CAMPAIGN_FIELDS.map(([k, label]) => (
          <div key={k}>
            <Label className="text-xs">{label}</Label>
            {["conditions", "allowed_phrases", "forbidden_phrases", "approved_message", "reason"].includes(k) ? (
              <Textarea rows={2} className="mt-1 text-sm" value={String(state[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
            ) : (
              <Input className="mt-1" value={String(state[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
            )}
          </div>
        ))}
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Início</Label>
            <Input type="date" className="mt-1" value={String(state.starts_on ?? "")} onChange={(e) => set("starts_on", e.target.value || null)} />
          </div>
          <div>
            <Label className="text-xs">Fim</Label>
            <Input type="date" className="mt-1" value={String(state.ends_on ?? "")} onChange={(e) => set("ends_on", e.target.value || null)} />
          </div>
          <div className="flex items-end justify-between gap-2">
            <Label className="text-xs">Ativa</Label>
            <Switch checked={state.is_active !== false} onCheckedChange={(v) => set("is_active", v)} />
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar campanha
        </Button>
      </CardContent>
    </Card>
  );
}

function ConfigTab() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: rows = [] } = useQuery({
    queryKey: ["ai-configs"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_assistant_configs").select("*");
      return data ?? [];
    },
  });

  const save = async (assistant: AssistantKind, extra: string, model: string, active: boolean) => {
    setSaving(assistant);
    const { error } = await supabase
      .from("ai_assistant_configs")
      .upsert({ assistant, extra_instructions: extra, model, is_active: active }, { onConflict: "assistant" });
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success("Configuração salva.");
    qc.invalidateQueries({ queryKey: ["ai-configs"] });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {ASSISTANTS.map((a) => {
        const row = rows.find((r) => r.assistant === a.kind);
        const extra = drafts[a.kind] ?? row?.extra_instructions ?? "";
        return (
          <Card key={a.kind}>
            <CardContent className="space-y-2 p-3">
              <p className="text-sm font-semibold">{a.label}</p>
              <div>
                <Label className="text-xs">Modelo</Label>
                <Input className="mt-1" defaultValue={row?.model ?? "openai/gpt-5.5"} id={`model-${a.kind}`} />
              </div>
              <div>
                <Label className="text-xs">Instruções extras</Label>
                <Textarea
                  rows={6}
                  className="mt-1 text-xs"
                  value={extra}
                  onChange={(e) => setDrafts({ ...drafts, [a.kind]: e.target.value })}
                />
              </div>
              <Button
                size="sm"
                disabled={saving === a.kind}
                onClick={() => {
                  const model =
                    (document.getElementById(`model-${a.kind}`) as HTMLInputElement | null)?.value || "openai/gpt-5.5";
                  void save(a.kind, extra, model, row?.is_active !== false);
                }}
              >
                {saving === a.kind ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AuditTab() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ai-knowledge-versions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_knowledge_versions")
        .select("id, target_table, action, reason, changed_at")
        .order("changed_at", { ascending: false })
        .limit(60);
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>;

  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
          <Badge variant="secondary" className="text-[10px]">{r.action}</Badge>
          <span className="font-medium">{r.target_table}</span>
          <span className="text-muted-foreground">{new Date(r.changed_at).toLocaleString("pt-BR")}</span>
          {r.reason && <span className="text-muted-foreground">· {r.reason}</span>}
        </div>
      ))}
    </div>
  );
}

function FeedbackTab() {
  const { data: rows = [] } = useQuery({
    queryKey: ["ai-feedback"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_interactions")
        .select("id, assistant, mode, feedback, feedback_comment, created_at")
        .not("feedback", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);
      return data ?? [];
    },
  });

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhum retorno enviado pelos vendedores.</p>;

  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
          <Badge variant="secondary" className="text-[10px]">
            {ASSISTANTS.find((a) => a.kind === r.assistant)?.short ?? r.assistant}
          </Badge>
          {r.mode && <Badge variant="outline" className="text-[10px]">{r.mode}</Badge>}
          <span className="font-medium">{r.feedback}</span>
          {r.feedback_comment && <span className="text-muted-foreground">· {r.feedback_comment}</span>}
          <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}

export function KnowledgeAdmin() {
  return (
    <Tabs defaultValue="base">
      <TabsList className="flex-wrap">
        <TabsTrigger value="base">Base comercial</TabsTrigger>
        <TabsTrigger value="objecoes">Objeções</TabsTrigger>
        <TabsTrigger value="campanha">Campanha do mês</TabsTrigger>
        <TabsTrigger value="config">Comportamento</TabsTrigger>
        <TabsTrigger value="feedback">Retornos da equipe</TabsTrigger>
        <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
      </TabsList>
      <TabsContent value="base" className="mt-3"><KnowledgeTab /></TabsContent>
      <TabsContent value="objecoes" className="mt-3"><ObjectionsTab /></TabsContent>
      <TabsContent value="campanha" className="mt-3"><CampaignTab /></TabsContent>
      <TabsContent value="config" className="mt-3"><ConfigTab /></TabsContent>
      <TabsContent value="feedback" className="mt-3"><FeedbackTab /></TabsContent>
      <TabsContent value="auditoria" className="mt-3"><AuditTab /></TabsContent>
    </Tabs>
  );
}
