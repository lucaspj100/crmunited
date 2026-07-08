import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MessageCircle,
  Copy,
  RefreshCw,
  Send,
  Sparkles,
  Check,
  X,
  UserCheck,
  Clock,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  fetchActiveTemplates,
  pickRandomIndex,
  renderTemplate,
  type WhatsappTemplate,
} from "@/lib/whatsapp-templates";
import {
  updateEntry,
  normalizePhoneForWhatsapp,
  REASON_LABEL,
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  type WhatsappListEntry,
} from "@/lib/whatsapp-list";
import { autoConvertProspectToLead } from "@/lib/prospect-auto-convert";
import type { ProspectContact } from "@/lib/prospect-queue";

type Row = WhatsappListEntry & {
  contact: ProspectContact | null;
  seller_name: string | null;
};

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "ativos", label: "Ativos (não removidos)" },
  { value: "todos", label: "Todos" },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

const REASON_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "todos", label: "Todos os motivos" },
  ...Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label })),
];

function priorityScore(row: Row): number {
  const c = row.contact;
  if (!c) return 999;
  let score = c.quantidade_tentativas * 10;
  const last = c.ultima_tentativa ? new Date(c.ultima_tentativa) : null;
  if (last && last.toDateString() === new Date().toDateString()) score -= 5;
  if (row.reason === "caixa_postal") score -= 3;
  if (c.empresa) score -= 2;
  if (c.cargo) score -= 1;
  if (c.telefone_normalizado?.length >= 12) score -= 1;
  return score;
}

export function WhatsappListPanel() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");

  const [statusFilter, setStatusFilter] = useState<string>("ativos");
  const [reasonFilter, setReasonFilter] = useState<string>("todos");
  const [sellerFilter, setSellerFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const { data: sellers = [] } = useQuery({
    enabled: isAdmin,
    queryKey: ["wpp_list_sellers"],
    queryFn: async () => {
      const { data: ur } = await supabase.from("user_roles").select("user_id").eq("role", "vendedor");
      const ids = (ur ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []).map((p) => ({
        id: p.id,
        name: p.full_name?.trim() || p.email || "Sem nome",
      }));
    },
  });

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    enabled: !!user,
    queryKey: ["whatsapp_list", user?.id, isAdmin ? sellerFilter : "self"],
    queryFn: async () => {
      let q = supabase.from("whatsapp_list_entries").select("*").order("created_at", { ascending: false });
      if (!isAdmin) {
        q = q.eq("owner_id", user!.id);
      } else if (sellerFilter !== "todos") {
        q = q.eq("owner_id", sellerFilter);
      }
      const { data, error } = await q.limit(2000);
      if (error) throw error;
      const entries = (data ?? []) as WhatsappListEntry[];
      if (entries.length === 0) return [];
      const pids = entries.map((e) => e.prospect_contact_id);
      const oids = Array.from(new Set(entries.map((e) => e.owner_id)));
      const [contactsRes, profilesRes] = await Promise.all([
        supabase.from("prospect_contacts").select("*").in("id", pids),
        supabase.from("profiles").select("id, full_name, email").in("id", oids),
      ]);
      const contacts = (contactsRes.data ?? []) as ProspectContact[];
      const profiles = (profilesRes.data ?? []) as Array<{ id: string; full_name: string | null; email: string }>;
      const cById = new Map(contacts.map((c) => [c.id, c]));
      const pById = new Map(profiles.map((p) => [p.id, p.full_name?.trim() || p.email || "Sem nome"]));
      return entries.map((e) => ({
        ...e,
        contact: cById.get(e.prospect_contact_id) ?? null,
        seller_name: pById.get(e.owner_id) ?? null,
      }));
    },
  });

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter === "ativos") {
      list = list.filter((r) => r.status !== "removido");
    } else if (statusFilter !== "todos") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (reasonFilter !== "todos") {
      list = list.filter((r) => r.reason === reasonFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => {
        const c = r.contact;
        return (
          c?.nome?.toLowerCase().includes(q) ||
          c?.empresa?.toLowerCase().includes(q) ||
          c?.telefone_normalizado?.includes(q)
        );
      });
    }
    return [...list].sort((a, b) => priorityScore(a) - priorityScore(b));
  }, [rows, statusFilter, reasonFilter, search]);

  const summary = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: rows.length,
      aguardando: rows.filter((r) => r.status === "aguardando").length,
      iniciadosHoje: rows.filter((r) => r.whatsapp_opened_at && new Date(r.whatsapp_opened_at).toDateString() === today).length,
      respondidosHoje: rows.filter((r) => r.responded_at && new Date(r.responded_at).toDateString() === today).length,
      semResposta: rows.filter((r) => r.status === "sem_resposta").length,
      invalidos: rows.filter((r) => r.status === "numero_invalido").length,
    };
  }, [rows]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["whatsapp_list"] });
    qc.invalidateQueries({ queryKey: ["daily_scoreboard"] });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Lista de WhatsApp</h2>
        <p className="text-sm text-muted-foreground">
          Organize leads que não atenderam ligação e faça a abordagem pelo WhatsApp com mensagens personalizadas.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <SummaryCard label="Na lista" value={summary.total} />
        <SummaryCard label="Aguardando" value={summary.aguardando} />
        <SummaryCard label="Iniciados hoje" value={summary.iniciadosHoje} />
        <SummaryCard label="Respondidos hoje" value={summary.respondidosHoje} />
        <SummaryCard label="Sem resposta" value={summary.semResposta} />
        <SummaryCard label="Inválidos" value={summary.invalidos} />
      </div>

      <Card>
        <CardContent className="p-3 grid gap-2 md:grid-cols-4">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASON_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div>
              <Label className="text-xs">Vendedor</Label>
              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os vendedores</SelectItem>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Busca</Label>
            <Input
              placeholder="Nome, empresa ou telefone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum lead na Lista de WhatsApp com os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((row) => (
            <WhatsappRowCard key={row.id} row={row} onChanged={invalidateAll} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function WhatsappRowCard({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { user } = useAuth();
  const c = row.contact;
  const [templateIndex, setTemplateIndex] = useState<number>(-1);
  const [showMsg, setShowMsg] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["wpp_templates", "primeira_abordagem"],
    queryFn: () => fetchActiveTemplates("primeira_abordagem"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: sellerFirstName } = useQuery({
    enabled: !!user,
    queryKey: ["seller_name", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).maybeSingle();
      const full = (data?.full_name ?? "").trim();
      if (full) return full.split(/\s+/)[0];
      return (data?.email ?? "").split("@")[0] || "";
    },
    staleTime: 10 * 60 * 1000,
  });

  const current: WhatsappTemplate | null =
    templateIndex >= 0 && templateIndex < templates.length ? templates[templateIndex] : null;

  const message = useMemo(() => {
    if (!current || !c) return "";
    return renderTemplate(current.body, {
      nome: c.nome,
      empresa: c.empresa,
      cargo: c.cargo,
      vendedor: sellerFirstName ?? "",
    });
  }, [current, c, sellerFirstName]);

  const logAttempt = async (resultado: string) => {
    if (!user || !c) return;
    try {
      await supabase.from("prospect_attempts").insert({
        prospect_contact_id: c.id,
        vendedor_id: user.id,
        tipo_acao: "whatsapp",
        telefone_normalizado: c.telefone_normalizado,
        resultado,
        observacao: current ? `Modelo: ${current.name}` : null,
      });
    } catch {
      /* silencioso */
    }
  };

  const gerar = () => {
    if (templates.length === 0) {
      toast.error("Nenhum modelo ativo. Peça ao ADM para cadastrar em Configurações.");
      return;
    }
    setTemplateIndex(pickRandomIndex(templates.length));
    setShowMsg(true);
    void updateEntry(row.id, { status: "mensagem_gerada" as never }).then(onChanged).catch(() => {});
  };

  const trocar = () => {
    if (templates.length < 2) return;
    setTemplateIndex((prev) => pickRandomIndex(templates.length, prev));
  };

  const copiar = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem copiada");
      await updateEntry(row.id, {
        status: "mensagem_copiada" as never,
        message_copied_at: new Date().toISOString(),
        last_template_id: current?.id ?? null,
        last_template_name: current?.name ?? null,
        last_message_body: message,
      });
      void logAttempt("Mensagem copiada");
      onChanged();
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const abrirWhatsapp = async () => {
    if (!c) return;
    const norm = normalizePhoneForWhatsapp(c.telefone_normalizado || c.telefone_original);
    if (!norm.ok) {
      const marcar = confirm(
        "Este telefone parece inválido. Deseja marcar como número inválido?\n\nOK = marcar como inválido / Cancelar = manter",
      );
      if (marcar) {
        await updateEntry(row.id, { status: "numero_invalido" as never });
        await supabase.from("prospect_contacts").update({ telefone_invalido: true }).eq("id", c.id);
        toast.success("Marcado como número inválido");
        onChanged();
      }
      return;
    }
    const url = message
      ? `https://wa.me/${norm.phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/${norm.phone}`;
    window.open(url, "_blank");
    await updateEntry(row.id, {
      status: "whatsapp_aberto" as never,
      whatsapp_opened_at: new Date().toISOString(),
      last_template_id: current?.id ?? null,
      last_template_name: current?.name ?? null,
      last_message_body: message || row.last_message_body,
    });
    void logAttempt("WhatsApp iniciado");
    onChanged();
  };

  const marcarEnviado = async () => {
    setSaving(true);
    try {
      await updateEntry(row.id, {
        status: "mensagem_enviada" as never,
        message_sent_at: new Date().toISOString(),
      });
      void logAttempt("Mensagem enviada");
      toast.success("Marcado como enviado");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const marcarRespondeu = async () => {
    setSaving(true);
    try {
      await updateEntry(row.id, {
        status: "respondeu" as never,
        responded_at: new Date().toISOString(),
      });
      void logAttempt("Respondeu no WhatsApp");
      toast.success("Marcado como respondeu");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const marcarSemResposta = async () => {
    setSaving(true);
    try {
      await updateEntry(row.id, {
        status: "sem_resposta" as never,
        no_response_at: new Date().toISOString(),
      });
      void logAttempt("Sem resposta");
      toast.success("Marcado como sem resposta");
      onChanged();
      setFollowupOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const remover = async () => {
    if (!confirm("Remover este lead da Lista de WhatsApp?")) return;
    setSaving(true);
    try {
      await updateEntry(row.id, {
        status: "removido" as never,
        removed_at: new Date().toISOString(),
      });
      toast.success("Removido da lista");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const converter = async () => {
    if (!c || !user) return;
    setConverting(true);
    try {
      const conv = await autoConvertProspectToLead({
        contact: c,
        vendedorId: user.id,
        resultLabel: "Interessado",
        latestObservation: "Convertido via Lista de WhatsApp",
      });
      if (!conv.ok) {
        toast.error(`Não foi possível criar lead. ${conv.error}`);
        return;
      }
      await updateEntry(row.id, {
        status: "removido" as never,
        removed_at: new Date().toISOString(),
      });
      toast.success(conv.created ? "Lead criado no funil" : "Contato vinculado a lead existente");
      onChanged();
    } finally {
      setConverting(false);
    }
  };

  if (!c) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Contato não encontrado.</CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-2">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base truncate">
                {c.nome || <span className="italic text-muted-foreground">Sem nome</span>}
              </CardTitle>
              <div className="text-xs text-muted-foreground truncate">
                {c.empresa || "—"}{c.cargo ? ` · ${c.cargo}` : ""}
              </div>
              <div className="text-xs font-mono mt-0.5">+{c.telefone_normalizado}</div>
            </div>
            <div className="shrink-0 text-right space-y-1">
              <Badge className={STATUS_BADGE_CLASS[row.status] ?? ""}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
              <div className="text-[10px] text-muted-foreground">{REASON_LABEL[row.reason] ?? row.reason}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground pt-1">
            <span>Vendedor: <strong className="text-foreground">{row.seller_name ?? "—"}</strong></span>
            <span>Tent.: {c.quantidade_tentativas}</span>
            {c.ultima_tentativa && (
              <span>Última: {format(new Date(c.ultima_tentativa), "dd/MM HH:mm", { locale: ptBR })}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {!showMsg ? (
            <Button variant="outline" size="sm" onClick={gerar} className="w-full">
              <Sparkles className="h-4 w-4 mr-2" /> Gerar mensagem WhatsApp
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words min-h-[100px]">
                {message || <span className="italic text-muted-foreground">Modelo vazio.</span>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="outline" onClick={trocar} disabled={templates.length < 2}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Trocar
                </Button>
                <Button size="sm" variant="outline" onClick={copiar} disabled={!message}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                </Button>
                <Button
                  size="sm"
                  onClick={abrirWhatsapp}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Send className="h-3.5 w-3.5 mr-1" /> Abrir
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={marcarEnviado} disabled={saving}>
              <Check className="h-3.5 w-3.5 mr-1" /> Enviado
            </Button>
            <Button size="sm" variant="outline" onClick={marcarRespondeu} disabled={saving}>
              <MessageCircle className="h-3.5 w-3.5 mr-1" /> Respondeu
            </Button>
            <Button size="sm" variant="outline" onClick={marcarSemResposta} disabled={saving}>
              <Clock className="h-3.5 w-3.5 mr-1" /> Sem resposta
            </Button>
            <Button size="sm" variant="outline" onClick={remover} disabled={saving}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
            </Button>
          </div>

          {row.status === "respondeu" && (
            <Button
              size="sm"
              onClick={converter}
              disabled={converting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <UserCheck className="h-3.5 w-3.5 mr-2" />
              {converting ? "Convertendo…" : "Converter para Interessado"}
            </Button>
          )}
        </CardContent>
      </Card>

      <FollowupDialog
        open={followupOpen}
        onOpenChange={setFollowupOpen}
        entry={row}
        contact={c}
        onSaved={onChanged}
      />
    </>
  );
}

function FollowupDialog({
  open,
  onOpenChange,
  entry,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: WhatsappListEntry;
  contact: ProspectContact;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [preset, setPreset] = useState<string>("1");
  const [customDate, setCustomDate] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const targetDate = useMemo(() => {
    if (preset === "custom") return customDate;
    const d = new Date();
    d.setDate(d.getDate() + Number(preset));
    return d.toISOString().slice(0, 10);
  }, [preset, customDate]);

  const save = async () => {
    if (!user || !targetDate) {
      toast.error("Escolha uma data");
      return;
    }
    setSaving(true);
    try {
      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          owner_id: user.id,
          prospect_contact_id: contact.id,
          type: "enviar_mensagem",
          status: "pendente",
          due_date: targetDate,
          observation: `Follow-up WhatsApp: ${contact.nome || contact.telefone_normalizado}${note ? `\n${note}` : ""}`,
        } as never)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      await updateEntry(entry.id, { followup_task_id: task?.id ?? null, notes: note || entry.notes });
      toast.success("Follow-up agendado");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao agendar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agendar follow-up de WhatsApp</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Quando</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Amanhã</SelectItem>
                <SelectItem value="2">Em 2 dias</SelectItem>
                <SelectItem value="3">Em 3 dias</SelectItem>
                <SelectItem value="7">Em 7 dias</SelectItem>
                <SelectItem value="custom">Data personalizada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <div>
              <Label>Data</Label>
              <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Observação (opcional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </div>
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Uma tarefa será criada em "Hoje/Tarefas" na data escolhida.</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
