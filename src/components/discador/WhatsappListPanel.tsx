import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal,
  Eye,
  ChevronRight,
  PlayCircle,
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

type ViewMode = "compact" | "detailed";
type SortKey = "oldest_in_list" | "oldest_attempt" | "fewest_attempts" | "empresa" | "nome";

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "ativos", label: "Ativos (não removidos)" },
  { value: "todos", label: "Todos" },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

const REASON_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "todos", label: "Todos os motivos" },
  ...Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label })),
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "oldest_in_list", label: "Mais antigos na lista" },
  { value: "oldest_attempt", label: "Última tentativa mais antiga" },
  { value: "fewest_attempts", label: "Menos tentativas" },
  { value: "empresa", label: "Empresa (A→Z)" },
  { value: "nome", label: "Nome (A→Z)" },
];

function sortRows(rows: Row[], key: SortKey): Row[] {
  const list = [...rows];
  switch (key) {
    case "oldest_in_list":
      return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    case "oldest_attempt":
      return list.sort((a, b) => {
        const av = a.contact?.ultima_tentativa ? new Date(a.contact.ultima_tentativa).getTime() : 0;
        const bv = b.contact?.ultima_tentativa ? new Date(b.contact.ultima_tentativa).getTime() : 0;
        return av - bv;
      });
    case "fewest_attempts":
      return list.sort((a, b) => (a.contact?.quantidade_tentativas ?? 0) - (b.contact?.quantidade_tentativas ?? 0));
    case "empresa":
      return list.sort((a, b) => (a.contact?.empresa ?? "").localeCompare(b.contact?.empresa ?? "", "pt-BR"));
    case "nome":
      return list.sort((a, b) => (a.contact?.nome ?? "").localeCompare(b.contact?.nome ?? "", "pt-BR"));
  }
}

export function WhatsappListPanel() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");

  const [statusFilter, setStatusFilter] = useState<string>("ativos");
  const [reasonFilter, setReasonFilter] = useState<string>("todos");
  const [sellerFilter, setSellerFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [onlyAwaiting, setOnlyAwaiting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("oldest_in_list");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");

  // Seleção em massa
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sequência de WhatsApp
  const [sequence, setSequence] = useState<string[]>([]);
  const [sequenceIndex, setSequenceIndex] = useState<number>(0);

  // Cache de mensagens geradas por row.id
  const [messages, setMessages] = useState<
    Record<string, { templateIndex: number; message: string; template: WhatsappTemplate | null }>
  >({});
  const [viewMessageRow, setViewMessageRow] = useState<Row | null>(null);
  const [followupRow, setFollowupRow] = useState<Row | null>(null);
  const [showNoTemplateDialog, setShowNoTemplateDialog] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);



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

  const { data: templates = [] } = useQuery({
    queryKey: ["wpp_templates", "primeira_abordagem"],
    queryFn: () => fetchActiveTemplates("primeira_abordagem"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: sellerFirstName = "" } = useQuery({
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
    if (onlyAwaiting) {
      list = list.filter((r) => r.status === "aguardando");
    } else if (statusFilter === "ativos") {
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
    return sortRows(list, sortKey);
  }, [rows, statusFilter, reasonFilter, search, onlyAwaiting, sortKey]);

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

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["whatsapp_list"] });
    qc.invalidateQueries({ queryKey: ["daily_scoreboard"] });
    qc.invalidateQueries({ queryKey: ["my_whatsapp_list_ids"] });
  }, [qc]);

  // -------- Ações compartilhadas --------
  const buildMessageFor = useCallback(
    (row: Row, forceNew = false) => {
      const cached = messages[row.id];
      if (cached && !forceNew) return cached;
      if (!row.contact || templates.length === 0) return null;
      const idx = pickRandomIndex(templates.length, cached?.templateIndex);
      const tpl = templates[idx] ?? null;
      const body = tpl
        ? renderTemplate(tpl.body, {
            nome: row.contact.nome,
            empresa: row.contact.empresa,
            cargo: row.contact.cargo,
            vendedor: sellerFirstName,
          })
        : "";
      const entry = { templateIndex: idx, message: body, template: tpl };
      setMessages((prev) => ({ ...prev, [row.id]: entry }));
      return entry;
    },
    [messages, templates, sellerFirstName],
  );

  const logAttempt = async (row: Row, resultado: string, tpl?: WhatsappTemplate | null) => {
    if (!user || !row.contact) return;
    try {
      await supabase.from("prospect_attempts").insert({
        prospect_contact_id: row.contact.id,
        vendedor_id: user.id,
        tipo_acao: "whatsapp",
        telefone_normalizado: row.contact.telefone_normalizado,
        resultado,
        observacao: tpl ? `Modelo: ${tpl.name}` : null,
      });
    } catch {
      /* silencioso */
    }
  };

  const hasActiveTemplate = templates.length > 0;

  const openWhatsapp = async (row: Row) => {
    if (!row.contact) return;
    if (!hasActiveTemplate) {
      setShowNoTemplateDialog(true);
      return;
    }

    const built = buildMessageFor(row) ?? buildMessageFor(row, true);
    const norm = normalizePhoneForWhatsapp(row.contact.telefone_normalizado || row.contact.telefone_original);
    if (!norm.ok) {
      const marcar = confirm(
        "Este telefone parece inválido. Deseja marcar como número inválido?\n\nOK = marcar como inválido / Cancelar = manter",
      );
      if (marcar) {
        await updateEntry(row.id, { status: "numero_invalido" as never });
        await supabase.from("prospect_contacts").update({ telefone_invalido: true }).eq("id", row.contact.id);
        toast.success("Marcado como número inválido");
        invalidateAll();
      }
      return;
    }
    const msg = built?.message ?? "";
    const url = msg
      ? `https://wa.me/${norm.phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/${norm.phone}`;
    window.open(url, "_blank");

    // Registrar 1x por lead por dia (baseado em whatsapp_opened_at)
    const todayStr = new Date().toDateString();
    const alreadyToday =
      row.whatsapp_opened_at && new Date(row.whatsapp_opened_at).toDateString() === todayStr;
    await updateEntry(row.id, {
      status: "whatsapp_aberto" as never,
      whatsapp_opened_at: new Date().toISOString(),
      last_template_id: built?.template?.id ?? row.last_template_id,
      last_template_name: built?.template?.name ?? row.last_template_name,
      last_message_body: msg || row.last_message_body,
    });
    if (!alreadyToday) {
      void logAttempt(row, "WhatsApp iniciado", built?.template ?? null);
    }
    invalidateAll();
  };

  const copyMessage = async (row: Row) => {
    const built = buildMessageFor(row) ?? buildMessageFor(row, true);
    if (!built?.message) return;
    try {
      await navigator.clipboard.writeText(built.message);
      toast.success("Mensagem copiada");
      await updateEntry(row.id, {
        status: "mensagem_copiada" as never,
        message_copied_at: new Date().toISOString(),
        last_template_id: built.template?.id ?? null,
        last_template_name: built.template?.name ?? null,
        last_message_body: built.message,
      });
      void logAttempt(row, "Mensagem copiada", built.template);
      invalidateAll();
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const changeVariation = (row: Row) => {
    if (templates.length < 2) {
      toast.info("Apenas 1 modelo ativo.");
      return;
    }
    buildMessageFor(row, true);
    toast.success("Nova variação gerada");
  };

  const markSent = async (row: Row) => {
    await updateEntry(row.id, {
      status: "mensagem_enviada" as never,
      message_sent_at: new Date().toISOString(),
    });
    void logAttempt(row, "Mensagem enviada");
    toast.success("Marcado como enviado");
    invalidateAll();
  };

  const markResponded = async (row: Row) => {
    await updateEntry(row.id, {
      status: "respondeu" as never,
      responded_at: new Date().toISOString(),
    });
    void logAttempt(row, "Respondeu no WhatsApp");
    toast.success("Marcado como respondeu");
    invalidateAll();
  };

  const markNoResponse = async (row: Row) => {
    await updateEntry(row.id, {
      status: "sem_resposta" as never,
      no_response_at: new Date().toISOString(),
    });
    void logAttempt(row, "Sem resposta");
    toast.success("Marcado como sem resposta");
    invalidateAll();
    setFollowupRow(row);
  };

  const removeRow = async (row: Row) => {
    if (!confirm("Remover este lead da Lista de WhatsApp?")) return;
    await updateEntry(row.id, {
      status: "removido" as never,
      removed_at: new Date().toISOString(),
    });
    toast.success("Removido da lista");
    invalidateAll();
  };

  const convertRow = async (row: Row) => {
    if (!row.contact || !user) return;
    const conv = await autoConvertProspectToLead({
      contact: row.contact,
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
    invalidateAll();
  };

  // -------- Seleção --------
  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const selectedInView = useMemo(
    () => Array.from(selected).filter((id) => visibleIds.includes(id)),
    [selected, visibleIds],
  );
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleOne = (id: string, v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleAllVisible = (v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (v) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // -------- Sequência --------
  const rowsById = useMemo(() => new Map(filtered.map((r) => [r.id, r])), [filtered]);
  const startSequence = async () => {
    if (!hasActiveTemplate) {
      setShowNoTemplateDialog(true);
      return;
    }
    const ids = selectedInView;
    if (ids.length === 0) {
      toast.info("Selecione contatos para iniciar a sequência.");
      return;
    }
    setSequence(ids);
    setSequenceIndex(0);
    const first = rowsById.get(ids[0]);
    if (first) await openWhatsapp(first);
  };

  const nextInSequence = async () => {
    const nextIdx = sequenceIndex + 1;
    if (nextIdx >= sequence.length) {
      toast.success("Fim da sequência.");
      setSequence([]);
      setSequenceIndex(0);
      return;
    }
    setSequenceIndex(nextIdx);
    const row = rowsById.get(sequence[nextIdx]);
    if (row) await openWhatsapp(row);
    else toast.info("Contato não visível — pulando.");
  };
  const stopSequence = () => {
    setSequence([]);
    setSequenceIndex(0);
  };

  // Ações em massa
  const bulkMarkSent = async () => {
    const ids = selectedInView;
    if (ids.length === 0) return;
    await Promise.all(ids.map(async (id) => {
      const r = rowsById.get(id);
      if (r) await markSent(r);
    }));
    clearSelection();
  };
  const bulkRemove = async () => {
    const ids = selectedInView;
    if (ids.length === 0) return;
    if (!confirm(`Remover ${ids.length} contato(s) da lista?`)) return;
    await Promise.all(ids.map((id) => updateEntry(id, {
      status: "removido" as never,
      removed_at: new Date().toISOString(),
    })));
    toast.success("Contatos removidos");
    clearSelection();
    invalidateAll();
  };

  const actions = {
    openWhatsapp,
    copyMessage,
    changeVariation,
    markSent,
    markResponded,
    markNoResponse,
    removeRow,
    convertRow,
    onViewMessage: (r: Row) => {
      buildMessageFor(r);
      setViewMessageRow(r);
    },
    hasActiveTemplate,
    onNoTemplate: () => setShowNoTemplateDialog(true),
  };


  return (
    <div className="space-y-4 pb-24">
      <div>
        <h2 className="text-lg font-semibold">Lista de WhatsApp</h2>
        <p className="text-sm text-muted-foreground">
          Fila de trabalho compacta: abra o WhatsApp com a mensagem pronta e trabalhe muitos contatos em sequência.
        </p>
      </div>


      {!hasActiveTemplate && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-destructive">Nenhum modelo de mensagem ativo</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {isAdmin
                  ? "Cadastre ou ative um modelo em Configurações > Modelos de WhatsApp para liberar o envio."
                  : "Peça ao administrador para cadastrar ou ativar um modelo de mensagem."}
              </div>
              {isAdmin && (
                <Link
                  to="/discador"
                  search={{ tab: "config" }}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  Cadastrar modelo agora
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cards de resumo — carrossel horizontal no mobile */}
      <div className="-mx-1 overflow-x-auto md:mx-0 md:overflow-visible">
        <div className="flex gap-2 px-1 md:grid md:grid-cols-6 md:px-0">
          <SummaryCard label="Na lista" value={summary.total} />
          <SummaryCard label="Aguardando" value={summary.aguardando} />
          <SummaryCard label="Iniciados hoje" value={summary.iniciadosHoje} />
          <SummaryCard label="Respondidos hoje" value={summary.respondidosHoje} />
          <SummaryCard label="Sem resposta" value={summary.semResposta} />
          <SummaryCard label="Inválidos" value={summary.invalidos} />
        </div>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          {/* Linha rápida mobile: busca + status + botão Filtros */}
          <div className="grid gap-2 md:hidden grid-cols-[minmax(0,1fr)_auto]">
            <Input
              placeholder="Buscar nome, empresa ou telefone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => setShowMobileFilters((v) => !v)}
            >
              Filtros
            </Button>
            <Select value={statusFilter} onValueChange={setStatusFilter} disabled={onlyAwaiting}>
              <SelectTrigger className="col-span-2 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtros completos: sempre no desktop, expansível no mobile */}
          <div className={`${showMobileFilters ? "grid" : "hidden md:grid"} gap-2 md:grid-cols-4`}>
            <div className="hidden md:block">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter} disabled={onlyAwaiting}>
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
            {isAdmin ? (
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
            ) : (
              <div>
                <Label className="text-xs">Ordenar por</Label>
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="hidden md:block">
              <Label className="text-xs">Busca</Label>
              <Input
                placeholder="Nome, empresa ou telefone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs md:hidden">
              <Switch checked={onlyAwaiting} onCheckedChange={setOnlyAwaiting} />
              Somente aguardando WhatsApp
            </label>
          </div>

          <div className="hidden md:flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={onlyAwaiting} onCheckedChange={setOnlyAwaiting} />
                Somente aguardando WhatsApp
              </label>
              {isAdmin && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Ordenar:</span>
                  <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("compact")}
                className={`px-2 py-1 text-xs rounded ${viewMode === "compact" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                Lista compacta
              </button>
              <button
                type="button"
                onClick={() => setViewMode("detailed")}
                className={`px-2 py-1 text-xs rounded ${viewMode === "detailed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                Cards detalhados
              </button>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Barra de ações em massa */}
      {selectedInView.length > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 backdrop-blur">
          <div className="text-sm font-medium">{selectedInView.length} contato(s) selecionado(s)</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={startSequence} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <PlayCircle className="h-4 w-4 mr-1" /> Abrir sequência WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={bulkMarkSent}>
              <Check className="h-4 w-4 mr-1" /> Marcar como enviado
            </Button>
            <Button size="sm" variant="outline" onClick={bulkRemove}>
              <Trash2 className="h-4 w-4 mr-1" /> Remover
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="h-4 w-4 mr-1" /> Limpar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum lead na Lista de WhatsApp com os filtros atuais.
          </CardContent>
        </Card>
      ) : viewMode === "detailed" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((row) => (
            <DetailedRowCard
              key={row.id}
              row={row}
              generatedMessage={messages[row.id]?.message ?? ""}
              actions={actions}
            />
          ))}
        </div>
      ) : (
        <CompactList
          rows={filtered}
          selected={selected}
          allSelected={allSelected}
          onToggleOne={toggleOne}
          onToggleAll={toggleAllVisible}
          generated={messages}
          actions={actions}
        />
      )}

      {/* Barra Próximo WhatsApp */}
      {sequence.length > 0 && (
        <div className="fixed inset-x-0 bottom-3 z-30 mx-auto flex w-fit max-w-[95vw] items-center gap-2 rounded-full border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <div className="text-xs">
            Sequência WhatsApp: <strong>{Math.min(sequenceIndex + 1, sequence.length)}</strong>/{sequence.length}
          </div>
          <Button size="sm" onClick={nextInSequence} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8">
            <ChevronRight className="h-4 w-4 mr-1" /> Próximo WhatsApp
          </Button>
          <Button size="sm" variant="ghost" onClick={stopSequence} className="h-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Modal Ver mensagem */}
      <ViewMessageDialog
        row={viewMessageRow}
        message={viewMessageRow ? messages[viewMessageRow.id]?.message ?? "" : ""}
        onOpenChange={(v) => { if (!v) setViewMessageRow(null); }}
        onCopy={() => viewMessageRow && copyMessage(viewMessageRow)}
        onChangeVariation={() => viewMessageRow && changeVariation(viewMessageRow)}
        onOpenWhatsapp={() => viewMessageRow && openWhatsapp(viewMessageRow)}
      />

      {followupRow && followupRow.contact && (
        <FollowupDialog
          open={!!followupRow}
          onOpenChange={(v) => { if (!v) setFollowupRow(null); }}
          entry={followupRow}
          contact={followupRow.contact}
          onSaved={() => { invalidateAll(); setFollowupRow(null); }}
        />
      )}

      {/* Modal: sem modelo ativo */}
      <Dialog open={showNoTemplateDialog} onOpenChange={setShowNoTemplateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nenhum modelo ativo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Não existe nenhum modelo ativo de mensagem.{" "}
            {isAdmin
              ? "Cadastre ou ative um modelo em Configurações > Modelos de WhatsApp."
              : "Peça ao administrador para cadastrar ou ativar um modelo de mensagem."}
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setShowNoTemplateDialog(false)}>Fechar</Button>
            {isAdmin && (
              <Link
                to="/discador"
                search={{ tab: "config" }}
                onClick={() => setShowNoTemplateDialog(false)}
                className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Cadastrar modelo agora
              </Link>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="shrink-0 min-w-[110px] md:min-w-0">
      <CardContent className="p-2 md:p-3">
        <div className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">{label}</div>
        <div className="text-lg md:text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}


type RowActions = {
  openWhatsapp: (r: Row) => Promise<void>;
  copyMessage: (r: Row) => Promise<void>;
  changeVariation: (r: Row) => void;
  markSent: (r: Row) => Promise<void>;
  markResponded: (r: Row) => Promise<void>;
  markNoResponse: (r: Row) => Promise<void>;
  removeRow: (r: Row) => Promise<void>;
  convertRow: (r: Row) => Promise<void>;
  onViewMessage: (r: Row) => void;
  hasActiveTemplate: boolean;
  onNoTemplate: () => void;
};


function RowMoreMenu({ row, actions }: { row: Row; actions: RowActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 px-2">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => actions.changeVariation(row)}>
          <Sparkles className="h-4 w-4 mr-2" /> Gerar nova mensagem
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.changeVariation(row)}>
          <RefreshCw className="h-4 w-4 mr-2" /> Trocar variação
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.copyMessage(row)}>
          <Copy className="h-4 w-4 mr-2" /> Copiar mensagem
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onViewMessage(row)}>
          <Eye className="h-4 w-4 mr-2" /> Ver mensagem
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.markSent(row)}>
          <Check className="h-4 w-4 mr-2" /> Marcar como enviado
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.markResponded(row)}>
          <MessageCircle className="h-4 w-4 mr-2" /> Marcar como respondeu
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.markNoResponse(row)}>
          <Clock className="h-4 w-4 mr-2" /> Marcar como sem resposta
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.convertRow(row)}>
          <UserCheck className="h-4 w-4 mr-2" /> Converter para interessado
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.removeRow(row)} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" /> Remover da lista
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CompactList({
  rows,
  selected,
  allSelected,
  onToggleOne,
  onToggleAll,
  generated,
  actions,
}: {
  rows: Row[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleOne: (id: string, v: boolean) => void;
  onToggleAll: (v: boolean) => void;
  generated: Record<string, { message: string }>;
  actions: RowActions;
}) {
  return (
    <div className="space-y-3">
      {/* Mobile: mini-cards */}
      <div className="md:hidden space-y-1.5">
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Checkbox checked={allSelected} onCheckedChange={(v) => onToggleAll(!!v)} />
          Selecionar todos visíveis
        </label>
        {rows.map((row) => (
          <CompactMiniCard
            key={row.id}
            row={row}
            checked={selected.has(row.id)}
            onCheck={(v) => onToggleOne(row.id, v)}
            message={generated[row.id]?.message ?? ""}
            actions={actions}
          />
        ))}
      </div>

      {/* Desktop: tabela compacta */}
      <div className="hidden md:block overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2 w-8">
                <Checkbox checked={allSelected} onCheckedChange={(v) => onToggleAll(!!v)} />
              </th>
              <th className="p-2">Nome</th>
              <th className="p-2">Empresa</th>
              <th className="p-2">Telefone</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-center">Tent.</th>
              <th className="p-2">Última</th>
              <th className="p-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const c = row.contact;
              return (
                <tr key={row.id} className="border-t align-middle hover:bg-muted/30">
                  <td className="p-2">
                    <Checkbox checked={selected.has(row.id)} onCheckedChange={(v) => onToggleOne(row.id, !!v)} />
                  </td>
                  <td className="p-2">
                    <div className="font-medium truncate max-w-[220px]">
                      {c?.nome || <span className="italic text-muted-foreground">sem nome</span>}
                    </div>
                  </td>
                  <td className="p-2 max-w-[180px] truncate">{c?.empresa || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2 font-mono whitespace-nowrap">+{c?.telefone_normalizado ?? ""}</td>
                  <td className="p-2">
                    <Badge className={STATUS_BADGE_CLASS[row.status] ?? ""}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
                  </td>
                  <td className="p-2 text-center">{c?.quantidade_tentativas ?? 0}</td>
                  <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                    {c?.ultima_tentativa ? format(new Date(c.ultima_tentativa), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                  </td>
                  <td className="p-2 text-right">
                    <div className="inline-flex gap-1">
                      {actions.hasActiveTemplate ? (
                        <Button
                          size="sm"
                          onClick={() => actions.openWhatsapp(row)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2.5"
                        >
                          <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={actions.onNoTemplate}
                          className="h-8 px-2 text-[11px] border-destructive/40 text-destructive"
                        >
                          Sem modelo
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => actions.copyMessage(row)} className="h-8 px-2">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <RowMoreMenu row={row} actions={actions} />
                    </div>
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompactMiniCard({
  row,
  checked,
  onCheck,
  message,
  actions,
}: {
  row: Row;
  checked: boolean;
  onCheck: (v: boolean) => void;
  message: string;
  actions: RowActions;
}) {
  const c = row.contact;
  if (!c) return null;
  return (
    <div className="rounded-md border px-2.5 py-2">
      <div className="flex items-center gap-2">
        <Checkbox className="shrink-0" checked={checked} onCheckedChange={(v) => onCheck(!!v)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm truncate flex-1">
              {c.nome || <span className="italic text-muted-foreground font-normal">sem nome</span>}
            </div>
            <Badge className={`${STATUS_BADGE_CLASS[row.status] ?? ""} h-4 px-1.5 text-[10px] shrink-0`}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {c.empresa || "—"} <span className="text-muted-foreground/60">•</span> <span className="font-mono">+{c.telefone_normalizado}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
            <span>Tent.: {c.quantidade_tentativas}</span>
            {c.ultima_tentativa && <span>Última: {format(new Date(c.ultima_tentativa), "dd/MM HH:mm", { locale: ptBR })}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {actions.hasActiveTemplate ? (
            <Button
              size="sm"
              onClick={() => actions.openWhatsapp(row)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2.5"
              title="Abrir WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="ml-1 hidden xs:inline">WhatsApp</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={actions.onNoTemplate}
              className="h-8 px-2 text-[11px] border-destructive/40 text-destructive"
              title="Sem modelo ativo"
            >
              Sem modelo
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => actions.copyMessage(row)} className="h-8 px-2" title="Copiar">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <RowMoreMenu row={row} actions={actions} />
        </div>
      </div>
    </div>
  );
}


function DetailedRowCard({
  row,
  generatedMessage,
  actions,
}: {
  row: Row;
  generatedMessage: string;
  actions: RowActions;
}) {
  const c = row.contact;
  if (!c) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Contato não encontrado.</CardContent>
      </Card>
    );
  }
  return (
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
        {generatedMessage && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap break-words max-h-24 overflow-hidden">
            {generatedMessage}
          </div>
        )}
        <div className="grid grid-cols-4 gap-2">
          <Button
            size="sm"
            onClick={() => actions.openWhatsapp(row)}
            className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="h-3.5 w-3.5 mr-1" /> Abrir WhatsApp
          </Button>
          <Button size="sm" variant="outline" onClick={() => actions.copyMessage(row)}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
          </Button>
          <RowMoreMenu row={row} actions={actions} />
        </div>
        {row.status === "respondeu" && (
          <Button
            size="sm"
            onClick={() => actions.convertRow(row)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <UserCheck className="h-3.5 w-3.5 mr-2" /> Converter para Interessado
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ViewMessageDialog({
  row,
  message,
  onOpenChange,
  onCopy,
  onChangeVariation,
  onOpenWhatsapp,
}: {
  row: Row | null;
  message: string;
  onOpenChange: (v: boolean) => void;
  onCopy: () => void;
  onChangeVariation: () => void;
  onOpenWhatsapp: () => void;
}) {
  const open = !!row;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Mensagem para {row?.contact?.nome || "contato"}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words min-h-[120px]">
          {message || <span className="italic text-muted-foreground">Mensagem ainda não gerada.</span>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onChangeVariation}>
              <RefreshCw className="h-4 w-4 mr-1" /> Trocar variação
            </Button>
            <Button variant="outline" onClick={onCopy} disabled={!message}>
              <Copy className="h-4 w-4 mr-1" /> Copiar
            </Button>
          </div>
          <Button onClick={onOpenWhatsapp} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Send className="h-4 w-4 mr-1" /> Abrir WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
