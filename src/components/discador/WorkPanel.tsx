import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Phone, MessageCircle, ListChecks, UserPlus, SkipForward, Inbox, Pencil, ChevronDown, Linkedin, ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { fetchNextProspect, type ProspectContact } from "@/lib/prospect-queue";
import { statusBadgeClass, getWhatsappTemplate, renderWhatsappTemplate } from "@/lib/prospect-status";
import { buildDialNumber, DEFAULT_DIALER_SETTINGS, type DialerSettings } from "@/lib/prospect-dial";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ResultDialog } from "./ResultDialog";
import { ConvertLeadDialog } from "./ConvertLeadDialog";
import { EditContactDialog } from "./EditContactDialog";
import { AttemptHistory } from "./AttemptHistory";
import { ReturnsDebugCard } from "./ReturnsDebugCard";
import { toast } from "sonner";

type Props = {
  focusContactId?: string;
  autoOpenResult?: boolean;
  onFocusConsumed?: () => void;
};

export function WorkPanel({ focusContactId, autoOpenResult, onFocusConsumed }: Props = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [contact, setContact] = useState<ProspectContact | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lastAction, setLastAction] = useState<"ligacao" | "whatsapp" | undefined>();
  const [contextOpen, setContextOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Roda circular de contatos visualizados
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [hydrated, setHydrated] = useState(false);

  const HISTORY_CAP = 50;
  const historyKey = user ? `discador:view_history:${user.id}` : null;
  const indexKey = user ? `discador:view_history_index:${user.id}` : null;

  // Hydrate from localStorage
  useEffect(() => {
    if (!historyKey || !indexKey) return;
    try {
      const rawH = localStorage.getItem(historyKey);
      const rawI = localStorage.getItem(indexKey);
      let h: string[] = [];
      let i = -1;
      if (rawH) {
        const parsed = JSON.parse(rawH);
        if (Array.isArray(parsed)) h = parsed.filter((x) => typeof x === "string").slice(-HISTORY_CAP);
      }
      if (rawI) {
        const n = Number(rawI);
        if (Number.isFinite(n) && n >= 0 && n < h.length) i = n;
      }
      if (h.length > 0 && i < 0) i = h.length - 1;
      setHistory(h);
      setHistoryIndex(i);
    } catch { /* ignore */ }
    setHydrated(true);
  }, [historyKey, indexKey]);

  // Persist
  useEffect(() => {
    if (!hydrated || !historyKey || !indexKey) return;
    try {
      localStorage.setItem(historyKey, JSON.stringify(history.slice(-HISTORY_CAP)));
      localStorage.setItem(indexKey, String(historyIndex));
    } catch { /* ignore */ }
  }, [history, historyIndex, hydrated, historyKey, indexKey]);

  const fetchById = async (id: string): Promise<ProspectContact | null> => {
    const { data, error } = await supabase.from("prospect_contacts").select("*").eq("id", id).maybeSingle();
    if (error) { toast.error(`Erro ao carregar contato: ${error.message}`); return null; }
    if (!data) { toast.error("Contato não encontrado"); return null; }
    return data as ProspectContact;
  };

  // Adiciona um contato ao histórico e posiciona índice no fim
  const pushToHistory = (id: string) => {
    setHistory((h) => {
      // dedupe consecutivo no fim
      if (h.length > 0 && h[h.length - 1] === id) {
        setHistoryIndex(h.length - 1);
        return h;
      }
      const merged = [...h, id];
      const capped = merged.length > HISTORY_CAP ? merged.slice(-HISTORY_CAP) : merged;
      setHistoryIndex(capped.length - 1);
      return capped;
    });
  };

  // Navega para índice (sem alterar histórico nem fila)
  const goToIndex = async (newIdx: number) => {
    if (history.length === 0) return;
    const target = history[newIdx];
    if (!target) return;
    setHistoryIndex(newIdx);
    setLoading(true);
    const c = await fetchById(target);
    setLoading(false);
    if (c) {
      setContact(c);
      qc.invalidateQueries({ queryKey: ["prospect_attempts", c.id] });
    }
  };

  const goPrev = async () => {
    if (history.length < 2) return;
    const newIdx = historyIndex <= 0 ? history.length - 1 : historyIndex - 1;
    await goToIndex(newIdx);
  };

  const goNext = async () => {
    if (history.length < 2) return;
    const newIdx = historyIndex >= history.length - 1 ? 0 : historyIndex + 1;
    await goToIndex(newIdx);
  };

  // Busca novo contato da fila e adiciona ao histórico
  const fetchNew = async () => {
    if (!user) return;
    setLoading(true);
    const next = await fetchNextProspect(user.id);
    setLoading(false);
    if (!next) { toast.info("Sem contatos pendentes na sua fila"); return; }
    setContact(next);
    pushToHistory(next.id);
    qc.invalidateQueries({ queryKey: ["prospect_attempts", next.id] });
  };

  // Carrega contato externo (foco por URL) e adiciona ao histórico
  const loadContactById = async (id: string) => {
    setLoading(true);
    const c = await fetchById(id);
    setLoading(false);
    if (c) {
      setContact(c);
      pushToHistory(c.id);
    }
    return c;
  };

  // Bootstrap: se há histórico salvo e nenhum foco, carrega o contato do índice atual; senão busca novo
  useEffect(() => {
    if (!hydrated || !user || focusContactId) return;
    if (contact) return;
    if (history.length > 0 && historyIndex >= 0 && historyIndex < history.length) {
      void goToIndex(historyIndex);
    } else {
      void fetchNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.id]);

  // Foco vindo da URL
  useEffect(() => {
    if (!focusContactId || !user || !hydrated) return;
    let cancelled = false;
    (async () => {
      const c = await loadContactById(focusContactId);
      if (cancelled) return;
      if (c && autoOpenResult) {
        setLastAction(undefined);
        setResultOpen(true);
      }
      onFocusConsumed?.();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusContactId, autoOpenResult, user?.id, hydrated]);


  const { data: counts } = useQuery({
    queryKey: ["prospect_counts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const base = supabase.from("prospect_contacts").select("id", { count: "exact", head: true }).eq("vendedor_responsavel_id", user!.id);
      const [total, done, pending, interested] = await Promise.all([
        base,
        supabase.from("prospect_contacts").select("id", { count: "exact", head: true }).eq("vendedor_responsavel_id", user!.id).eq("convertido_em_lead", true),
        supabase.from("prospect_contacts").select("id", { count: "exact", head: true }).eq("vendedor_responsavel_id", user!.id).eq("convertido_em_lead", false).eq("nao_chamar", false).eq("telefone_invalido", false).in("status_prospeccao", ["Aguardando ligação", "Ligar depois", "Não atendeu", "Ocupado", "Caixa postal", "Atendeu", "Ligando"]),
        supabase.from("prospect_contacts").select("id", { count: "exact", head: true }).eq("vendedor_responsavel_id", user!.id).eq("status_prospeccao", "Interessado"),
      ]);
      return { total: total.count ?? 0, done: done.count ?? 0, pending: pending.count ?? 0, interested: interested.count ?? 0 };
    },
  });

  const { data: dialerSettings } = useQuery({
    enabled: !!user,
    queryKey: ["dialer_settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("prospect_dialer_settings")
        .select("ddd_origem, prefixo_interurbano")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data as DialerSettings | null) ?? DEFAULT_DIALER_SETTINGS;
    },
  });
  const settings = dialerSettings ?? DEFAULT_DIALER_SETTINGS;
  const { dial: dialNumber, dddDestino } = contact
    ? buildDialNumber(contact.telefone_normalizado, settings)
    : { dial: "", dddDestino: null as string | null };

  const ligar = async () => {
    if (!contact || !user) return;
    setLastAction("ligacao");
    await supabase
      .from("prospect_contacts")
      .update({
        status_prospeccao: "Ligando",
        ultima_tentativa: new Date().toISOString(),
        quantidade_tentativas: contact.quantidade_tentativas + 1,
      })
      .eq("id", contact.id);
    await supabase.from("prospect_attempts").insert({
      prospect_contact_id: contact.id,
      vendedor_id: user.id,
      tipo_acao: "ligacao",
      telefone_normalizado: contact.telefone_normalizado,
      telefone_para_discagem: dialNumber,
      ddd_origem_vendedor: settings.ddd_origem,
      prefixo_interurbano: settings.prefixo_interurbano,
      ddd_destino_contato: dddDestino,
    });
    window.location.href = `tel:${dialNumber}`;
    setResultOpen(true);
  };

  const whats = async () => {
    if (!contact || !user) return;
    setLastAction("whatsapp");
    const template = getWhatsappTemplate();
    const message = renderWhatsappTemplate(template, {
      nome: contact.nome,
      empresa: contact.empresa,
      cargo: contact.cargo,
      origem: contact.origem,
      telefone: contact.telefone_normalizado ? `+${contact.telefone_normalizado}` : contact.telefone_original,
    });
    await supabase.from("prospect_attempts").insert({
      prospect_contact_id: contact.id,
      vendedor_id: user.id,
      tipo_acao: "whatsapp",
      telefone_normalizado: contact.telefone_normalizado,
    });
    window.open(`https://wa.me/${contact.telefone_normalizado}?text=${encodeURIComponent(message)}`, "_blank");
    setResultOpen(true);
  };

  const onResultSaved = async (goNext: boolean) => {
    qc.invalidateQueries({ queryKey: ["prospect_counts"] });
    qc.invalidateQueries({ queryKey: ["prospect_attempts", contact?.id] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    if (goNext) await fetchNew(); else {
      if (contact) {
        const { data } = await supabase.from("prospect_contacts").select("*").eq("id", contact.id).single();
        if (data) setContact(data as ProspectContact);
      }
    }
  };

  return (
    <>
      <div className="mb-3"><ReturnsDebugCard contact={contact} /></div>
      {/* ============================== MOBILE (<768px) ============================== */}
      <div className="md:hidden w-full max-w-full overflow-x-hidden pb-[140px] space-y-3">
        {/* Linha de indicadores compacta */}
        <div className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap overflow-x-auto max-w-full h-10 flex items-center px-1">
          <span><strong className="text-foreground">{counts?.total ?? 0}</strong> atribuídos</span>
          <span className="mx-1.5">·</span>
          <span><strong className="text-foreground">{counts?.pending ?? 0}</strong> em fila</span>
          <span className="mx-1.5">·</span>
          <span><strong className="text-foreground">{counts?.interested ?? 0}</strong> interessados</span>
          <span className="mx-1.5">·</span>
          <span><strong className="text-foreground">{counts?.done ?? 0}</strong> convertidos</span>
        </div>

        {!contact ? (
          <div className="rounded-lg border bg-card p-6 flex flex-col items-center gap-3 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{loading ? "Buscando…" : "Nenhum contato pendente na sua fila."}</p>
            <Button onClick={fetchNew} disabled={loading} size="sm"><Plus className="h-4 w-4 mr-2" />Buscar novo</Button>
          </div>
        ) : (
          <>
            {/* Card principal do contato */}
            <div className="w-full max-w-full rounded-lg border-2 bg-card p-3 space-y-1.5 overflow-hidden">
              <div className="text-lg font-bold leading-tight break-words">
                {contact.nome || <span className="text-muted-foreground italic font-normal">Nome não informado</span>}
              </div>
              <div className="text-sm break-words">
                <span className="text-muted-foreground">Empresa:</span>{" "}
                {contact.empresa || <span className="text-muted-foreground italic">não informada</span>}
              </div>
              <div className="text-sm break-words">
                <span className="text-muted-foreground">Cargo:</span>{" "}
                {contact.cargo || <span className="text-muted-foreground italic">não informado</span>}
              </div>
              {contact.linkedin_url && (
                <div className="text-sm">
                  <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline break-all">
                    <Linkedin className="h-3.5 w-3.5 shrink-0" />Abrir LinkedIn
                  </a>
                </div>
              )}
              <div className="text-sm break-all">
                <span className="text-muted-foreground">Telefone:</span>{" "}
                <span className="font-mono">+{contact.telefone_normalizado}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {contact.ddd && <>DDD {contact.ddd} · </>}
                <span className={`inline-block px-1.5 py-0.5 rounded ${statusBadgeClass(contact.status_prospeccao)}`}>{contact.status_prospeccao}</span>
              </div>
            </div>

            {/* Bloco do número que será discado */}
            <div className="w-full max-w-full rounded-lg border bg-primary/5 px-3 py-2.5 overflow-hidden">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Número que será discado</div>
              <div className="font-mono text-2xl font-bold tracking-wide break-all leading-tight mt-0.5">{dialNumber || "—"}</div>
              <div className="text-[11px] text-muted-foreground mt-1 break-words">
                DDD origem: <strong>{settings.ddd_origem}</strong> · Prefixo: <strong>{settings.prefixo_interurbano}</strong>
                {dddDestino && <> · Destino: <strong>{dddDestino}</strong></>}
              </div>
            </div>

            {/* Contexto compacto */}
            <Collapsible open={contextOpen} onOpenChange={setContextOpen} className="w-full max-w-full rounded-lg border bg-muted/40 overflow-hidden">
              <div className="p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contexto</div>
                <div className="text-sm truncate mt-0.5">
                  {[contact.nome || "—", contact.empresa || "—", contact.cargo || "Cargo não informado"].join(" · ")}
                </div>
                <CollapsibleTrigger asChild>
                  <button className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                    {contextOpen ? "Ocultar" : "Ver contexto completo"} <ChevronDown className={`h-3 w-3 transition ${contextOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1 text-sm">
                  <div><span className="text-muted-foreground">Nome:</span> {contact.nome || "—"}</div>
                  <div><span className="text-muted-foreground">Cargo:</span> {contact.cargo || "—"}</div>
                  <div><span className="text-muted-foreground">Empresa:</span> {contact.empresa || "—"}</div>
                  <div><span className="text-muted-foreground">Origem:</span> {contact.origem || "—"}</div>
                  <div className="break-words"><span className="text-muted-foreground">Observação:</span> {contact.observacao || "—"}</div>
                  <div className="break-all"><span className="text-muted-foreground">LinkedIn:</span> {contact.linkedin_url ? <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{contact.linkedin_url}</a> : "—"}</div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Botões secundários */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-full">
              <Button variant="secondary" size="sm" onClick={whats} className="h-10 min-w-0 px-2 text-xs">
                <MessageCircle className="h-3.5 w-3.5 mr-1 shrink-0" /><span className="truncate">WhatsApp</span>
              </Button>
              <Button
                size="sm"
                variant={contact.status_prospeccao === "Interessado" ? "default" : "outline"}
                onClick={() => setConvertOpen(true)}
                disabled={contact.convertido_em_lead}
                className={`h-10 min-w-0 px-2 text-xs ${contact.status_prospeccao === "Interessado" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1 shrink-0" /><span className="truncate">Converter</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="h-10 min-w-0 px-2 text-xs">
                <Pencil className="h-3.5 w-3.5 mr-1 shrink-0" /><span className="truncate">Editar</span>
              </Button>
            </div>

            {/* Histórico colapsável */}
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="w-full max-w-full rounded-lg border overflow-hidden">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-medium">
                {historyOpen ? "Ocultar histórico" : "Ver histórico"}
                <ChevronDown className={`h-4 w-4 transition ${historyOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="p-3 pt-0">
                <AttemptHistory contactId={contact.id} />
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {/* Barra fixa inferior — 3 botões principais */}
        {contact && (
          <div
            className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur px-3 pt-2 w-full max-w-full"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
          >
            <div className="grid grid-cols-5 gap-1.5 w-full max-w-full">
              <Button onClick={ligar} className="h-12 min-w-0 px-1">
                <Phone className="h-4 w-4 shrink-0" /><span className="truncate text-[10px] ml-1">Ligar</span>
              </Button>
              <Button variant="outline" onClick={() => { setLastAction(undefined); setResultOpen(true); }} className="h-12 min-w-0 px-1">
                <ListChecks className="h-4 w-4 shrink-0" /><span className="truncate text-[10px] ml-1">Reg.</span>
              </Button>
              <Button variant="ghost" onClick={goPrev} disabled={loading || history.length < 2} className="h-12 min-w-0 px-1">
                <ArrowLeft className="h-4 w-4 shrink-0" /><span className="truncate text-[10px] ml-1">Ant.</span>
              </Button>
              <Button variant="ghost" onClick={goNext} disabled={loading || history.length < 2} className="h-12 min-w-0 px-1">
                <ArrowRight className="h-4 w-4 shrink-0" /><span className="truncate text-[10px] ml-1">Próx.</span>
              </Button>
              <Button variant="secondary" onClick={fetchNew} disabled={loading} className="h-12 min-w-0 px-1">
                <Plus className="h-4 w-4 shrink-0" /><span className="truncate text-[10px] ml-1">Novo</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ============================== DESKTOP (>=768px) ============================== */}
      <div className="hidden md:grid gap-4 lg:grid-cols-3 max-w-full">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Atribuídos" value={counts?.total ?? 0} />
            <Stat label="Em fila" value={counts?.pending ?? 0} />
            <Stat label="Interessados" value={counts?.interested ?? 0} />
            <Stat label="Convertidos" value={counts?.done ?? 0} />
          </div>

          {!contact ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
                <Inbox className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">{loading ? "Buscando…" : "Nenhum contato pendente na sua fila."}</p>
                <Button onClick={loadNext} disabled={loading}><SkipForward className="h-4 w-4 mr-2" />Buscar próximo</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-2">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-xl">
                    {contact.nome || <span className="text-muted-foreground italic">Nome não informado</span>}
                  </CardTitle>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Empresa:</span>{" "}
                    {contact.empresa ? <strong>{contact.empresa}</strong> : <span className="text-muted-foreground italic">não informada</span>}
                  </div>
                  <div className="text-sm">
                    {contact.cargo ? <span>{contact.cargo}</span> : <span className="text-muted-foreground italic">Cargo não informado</span>}
                  </div>
                  {contact.linkedin_url && (
                    <div className="text-sm">
                      <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline break-all">
                        <Linkedin className="h-3.5 w-3.5 shrink-0" />Abrir perfil no LinkedIn
                      </a>
                    </div>
                  )}
                  <div className="text-sm flex flex-wrap items-center gap-2">
                    <span className="font-mono">+{contact.telefone_normalizado}</span>
                    {contact.ddd && <Badge variant="outline">DDD {contact.ddd}</Badge>}
                    <Badge className={statusBadgeClass(contact.status_prospeccao)}>{contact.status_prospeccao}</Badge>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground shrink-0">
                  <div>Tent.: {contact.quantidade_tentativas}</div>
                  {contact.ultima_tentativa && <div>Última: {format(new Date(contact.ultima_tentativa), "dd/MM HH:mm", { locale: ptBR })}</div>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border bg-primary/5 px-3 py-3 space-y-1">
                  <div className="text-xs uppercase text-muted-foreground">Número que será discado</div>
                  <div className="font-mono text-xl font-bold tracking-wide break-all">{dialNumber || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    DDD origem: <strong>{settings.ddd_origem}</strong> · Prefixo: <strong>{settings.prefixo_interurbano}</strong>
                    {dddDestino && <> · Destino: <strong>{dddDestino}</strong></>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Button size="lg" onClick={ligar} className="h-14 text-base">
                    <Phone className="h-5 w-5 mr-2" />Ligar agora
                  </Button>
                  <Button size="lg" variant="secondary" onClick={whats} className="h-14 text-base">
                    <MessageCircle className="h-5 w-5 mr-2" />WhatsApp
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => { setLastAction(undefined); setResultOpen(true); }} className="h-14">
                    <ListChecks className="h-5 w-5 mr-2" />Registrar
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => setConvertOpen(true)}
                    disabled={contact.convertido_em_lead}
                    className={`h-14 text-base ${contact.status_prospeccao === "Interessado" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                    variant={contact.status_prospeccao === "Interessado" ? "default" : "outline"}
                  >
                    <UserPlus className="h-5 w-5 mr-2" />Converter
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />Editar contato
                  </Button>
                  <Button variant="outline" onClick={goBack} disabled={loading || prevStack.length === 0}>
                    <ArrowLeft className="h-4 w-4 mr-2" />Voltar anterior
                  </Button>
                  <Button variant="ghost" onClick={loadNext} disabled={loading}>
                    <SkipForward className="h-4 w-4 mr-2" />Pular para próximo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Histórico do contato</CardTitle></CardHeader>
            <CardContent>
              {contact ? <AttemptHistory contactId={contact.id} /> : <p className="text-sm text-muted-foreground">Selecione um contato.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs (shared) */}
      {contact && user && (
        <ResultDialog
          open={resultOpen}
          onOpenChange={setResultOpen}
          contact={contact}
          vendedorId={user.id}
          initialAction={lastAction}
          onSaved={onResultSaved}
        />
      )}
      {contact && user && (
        <ConvertLeadDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          contact={contact}
          vendedorId={user.id}
          onConverted={() => { qc.invalidateQueries({ queryKey: ["prospect_counts"] }); void loadNext(); }}
        />
      )}
      {contact && (
        <EditContactDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          contact={contact}
          onSaved={(updated) => { setContact(updated); qc.invalidateQueries({ queryKey: ["prospect_contacts_admin"] }); }}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
