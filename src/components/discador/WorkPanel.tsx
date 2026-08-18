import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Phone, MessageCircle, ListChecks, UserPlus, Inbox, Pencil, ChevronDown, Linkedin, ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import type { ProspectContact } from "@/lib/prospect-queue";
import { statusBadgeClass, getWhatsappTemplate, renderWhatsappTemplate } from "@/lib/prospect-status";
import { buildDialNumber, DEFAULT_DIALER_SETTINGS, type DialerSettings } from "@/lib/prospect-dial";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ResultDialog } from "./ResultDialog";
import { ConvertLeadDialog } from "./ConvertLeadDialog";
import { EditContactDialog } from "./EditContactDialog";
import { AttemptHistory } from "./AttemptHistory";
import { ReturnsDebugCard } from "./ReturnsDebugCard";
import { DailyScoreboard } from "./DailyScoreboard";
import { WhatsappComposer } from "./WhatsappComposer";
import { addToWhatsappList } from "@/lib/whatsapp-list";
import { fetchDialerSession, saveDialerSession } from "@/lib/dialer-session";
import { toast } from "sonner";

type Props = {
  focusContactId?: string;
  autoOpenResult?: boolean;
  focusTaskId?: string;
  onFocusConsumed?: () => void;
};

type RetornoTask = {
  id: string;
  observation: string | null;
  due_date: string;
  due_time: string | null;
};

import {
  QUEUE_STATUSES,
  isEligibleForDialer,
  applyDialerEligibility,
  fetchDialerQueue,
  fetchProspectContactById,
} from "@/lib/prospect-eligibility";


const STATUS_PRIORITY: Record<string, number> = {
  "Aguardando ligação": 0,
  "Ligar depois": 1,
  "Não atendeu": 2,
  "Ocupado": 3,
  "Caixa postal": 4,
  "Atendeu": 5,
  "Ligando": 6,
};

const REMOVE_FROM_QUEUE_STATUSES = new Set([
  "Sem interesse",
  "Não chamar",
  "Convertido em lead",
  "Interessado",
]);

function isNeverContacted(c: ProspectContact): boolean {
  return (
    c.status_prospeccao === "Aguardando ligação" &&
    Number(c.quantidade_tentativas ?? 0) === 0 &&
    !c.ultima_tentativa
  );
}

/** 1) nunca trabalhados (created_at asc) → 2) retornos vencidos (proxima_tentativa asc) → 3) já tentados (ultima_tentativa asc) */
function queueGroup(c: ProspectContact): number {
  if (isNeverContacted(c)) return 0;
  if (c.status_prospeccao === "Ligar depois") {
    const due = c.proxima_tentativa ? new Date(c.proxima_tentativa).getTime() : null;
    if (due !== null && due <= Date.now()) return 1;
    return 3; // retorno futuro fica no fim
  }
  return 2;
}

function sortQueue(list: ProspectContact[]): ProspectContact[] {
  const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);
  return [...list].sort((a, b) => {
    const ga = queueGroup(a);
    const gb = queueGroup(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0) return ts(a.created_at) - ts(b.created_at);
    if (ga === 1 || ga === 3) return ts(a.proxima_tentativa) - ts(b.proxima_tentativa);
    // já tentados: mais tempo sem tentativa primeiro (null primeiro)
    const da = ts(a.ultima_tentativa);
    const db = ts(b.ultima_tentativa);
    if (da !== db) return da - db;
    const pa = STATUS_PRIORITY[a.status_prospeccao] ?? 99;
    const pb = STATUS_PRIORITY[b.status_prospeccao] ?? 99;
    if (pa !== pb) return pa - pb;
    return ts(a.created_at) - ts(b.created_at);
  });
}

const ATTEMPTED_STATUSES = ["Não atendeu", "Ocupado", "Caixa postal", "Atendeu", "Ligando"];

function isEligible(c: ProspectContact): boolean {
  return isEligibleForDialer(c);
}


/**
 * Fila ativa de navegação: enquanto existir "Aguardando ligação" elegível,
 * "Próximo"/"Anterior" navegam SOMENTE nesse grupo.
 */
function buildActiveQueue(queue: ProspectContact[]): { list: ProspectContact[]; label: string } {
  const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);
  const eligible = queue.filter(isEligible);

  const waiting = eligible
    .filter((c) => c.status_prospeccao === "Aguardando ligação")
    .sort((a, b) => {
      const na = isNeverContacted(a) ? 0 : 1;
      const nb = isNeverContacted(b) ? 0 : 1;
      if (na !== nb) return na - nb;
      const qa = Number(a.quantidade_tentativas ?? 0);
      const qb = Number(b.quantidade_tentativas ?? 0);
      if (qa !== qb) return qa - qb;
      const ua = ts(a.ultima_tentativa);
      const ub = ts(b.ultima_tentativa);
      if (ua !== ub) return ua - ub;
      return ts(a.created_at) - ts(b.created_at);
    });
  if (waiting.length > 0) return { list: waiting, label: "aguardando ligação" };

  const now = Date.now();
  const dueReturns = eligible
    .filter(
      (c) =>
        c.status_prospeccao === "Ligar depois" &&
        !!c.proxima_tentativa &&
        new Date(c.proxima_tentativa).getTime() <= now,
    )
    .sort((a, b) => ts(a.proxima_tentativa) - ts(b.proxima_tentativa));
  if (dueReturns.length > 0) return { list: dueReturns, label: "retornos vencidos" };

  const attempted = eligible
    .filter((c) => ATTEMPTED_STATUSES.includes(c.status_prospeccao))
    .sort((a, b) => {
      const da = ts(a.ultima_tentativa);
      const db = ts(b.ultima_tentativa);
      if (da !== db) return da - db;
      return ts(a.created_at) - ts(b.created_at);
    });
  return { list: attempted, label: "contatos para nova tentativa" };
}



export function WorkPanel({ focusContactId, autoOpenResult, focusTaskId, onFocusConsumed }: Props = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [queue, setQueue] = useState<ProspectContact[]>([]);
  const [currentContactId, setCurrentContactId] = useState<string | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lastAction, setLastAction] = useState<"ligacao" | "whatsapp" | undefined>();
  const [contextOpen, setContextOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeRetornoTaskId, setActiveRetornoTaskId] = useState<string | null>(null);
  const [retornoTask, setRetornoTask] = useState<RetornoTask | null>(null);
  const [focusedContact, setFocusedContact] = useState<ProspectContact | null>(null);
  const [loadingFocus, setLoadingFocus] = useState(false);
  const [syncOnline, setSyncOnline] = useState(false);
  // Último ID já refletido na sessão do Supabase — evita loop de Realtime (eco do próprio evento).
  const lastSyncedRef = useRef<string | null>(null);

  const { list: activeQueue, label: activeLabel } = useMemo(() => buildActiveQueue(queue), [queue]);

  const activeIndex = useMemo(() => {
    if (activeQueue.length === 0) return -1;
    const i = currentContactId ? activeQueue.findIndex((c) => c.id === currentContactId) : -1;
    return i >= 0 ? i : 0;
  }, [activeQueue, currentContactId]);

  const contact: ProspectContact | null =
    focusedContact ?? (activeIndex >= 0 ? activeQueue[activeIndex]! : null);

  /** Fonte única do contato atual da fila normal: state local + sessão compartilhada. */
  const setCurrentContactSynced = useCallback(
    (contactId: string | null) => {
      setCurrentContactId(contactId);
      if (!user) return;
      if (lastSyncedRef.current === contactId) return;
      lastSyncedRef.current = contactId;
      void saveDialerSession(user.id, contactId);
    },
    [user?.id],
  );

  // Carrega a fila completa do vendedor (com paginação — o Data API corta em 1000 linhas)
  const loadQueue = async (opts?: {
    keepContactId?: string;
    silent?: boolean;
    keepSelection?: boolean;
    avoidContactId?: string;
  }) => {
    if (!user) return;
    if (!opts?.silent) setLoadingQueue(true);
    let rows: ProspectContact[] = [];
    try {
      rows = await fetchDialerQueue(user.id);
    } catch (err) {
      setLoadingQueue(false);
      toast.error(`Erro ao carregar fila: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    setLoadingQueue(false);
    const sorted = sortQueue(rows);
    setQueue(sorted);
    if (opts?.keepSelection) return;
    const nextActive = buildActiveQueue(sorted).list;
    if (nextActive.length === 0) {
      setCurrentContactSynced(null);
      return;
    }
    const keepId = opts?.keepContactId;
    const keep = keepId ? nextActive.find((c) => c.id === keepId) : undefined;
    if (keep) {
      setCurrentContactSynced(keep.id);
      return;
    }
    // Após salvar e avançar: nunca reabrir o contato que acabou de ser trabalhado,
    // desde que exista outro elegível na fila ativa.
    const avoid = opts?.avoidContactId;
    const next = (avoid && nextActive.find((c) => c.id !== avoid)) || nextActive[0]!;
    setCurrentContactSynced(next.id);
  };



  // Bootstrap: primeiro a sessão sincronizada, depois a fila (o contato da sessão
  // é mantido quando ainda estiver elegível; senão cai no primeiro prioritário).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const session = await fetchDialerSession(user.id);
      if (cancelled) return;
      lastSyncedRef.current = session?.current_contact_id ?? null;
      await loadQueue({ keepContactId: session?.current_contact_id ?? undefined });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime: outro dispositivo do MESMO vendedor mudou o contato atual.
  // Só atualiza o state local — nunca escreve de volta (evita loop).
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`dialer_session_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prospect_dialer_sessions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const next =
            (payload.new as { current_contact_id?: string | null } | null)?.current_contact_id ?? null;
          if (next === lastSyncedRef.current) return;
          lastSyncedRef.current = next;
          setCurrentContactId(next);
        },
      )
      .subscribe((status) => setSyncOnline(status === "SUBSCRIBED"));
    return () => {
      setSyncOnline(false);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Foco vindo de URL — busca sempre o contato pelo ID e só depois abre o modal.
  useEffect(() => {
    if (!focusContactId || !user) return;
    let cancelled = false;
    setLoadingFocus(true);
    setResultOpen(false);
    setFocusedContact(null);
    (async () => {
      const { data, error } = await supabase
        .from("prospect_contacts")
        .select("*")
        .eq("id", focusContactId)
        .maybeSingle();
      if (cancelled) return;
      setLoadingFocus(false);
      if (error || !data) {
        toast.error("Contato não encontrado");
        onFocusConsumed?.();
        return;
      }
      const loaded = data as ProspectContact;
      if (loaded.id !== focusContactId) {
        toast.error("Contato incorreto carregado. Recarregue a tarefa.");
        onFocusConsumed?.();
        return;
      }
      setFocusedContact(loaded);
      setCurrentContactId(null);

      if (autoOpenResult) {
        setLastAction(undefined);
        setResultOpen(true);
      }
      onFocusConsumed?.();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusContactId, autoOpenResult, user?.id]);

  // Carrega a tarefa de retorno vinculada (quando aberto via /hoje). Só carrega — a limpeza
  // acontece ao sair do foco / salvar, para não apagar quando a URL é limpa por onFocusConsumed.
  useEffect(() => {
    if (!focusTaskId) return;
    setActiveRetornoTaskId(focusTaskId);
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, observation, due_date, due_time")
        .eq("id", focusTaskId)
        .eq("owner_id", user.id)
        .eq("type", "retorno_ligacao")
        .maybeSingle();
      if (!cancelled && data) setRetornoTask(data as RetornoTask);
    })();
    return () => { cancelled = true; };
  }, [focusTaskId, user?.id]);

  const exitFocus = () => {
    setFocusedContact(null);
    setActiveRetornoTaskId(null);
    setRetornoTask(null);
  };

  const goPrev = () => {
    if (activeQueue.length === 0) return;
    exitFocus();
    const i = activeIndex <= 0 ? activeQueue.length - 1 : activeIndex - 1;
    setCurrentContactSynced(activeQueue[i]!.id);
  };
  const goNext = () => {
    if (activeQueue.length === 0) return;
    exitFocus();
    const i = activeIndex >= activeQueue.length - 1 ? 0 : activeIndex + 1;
    setCurrentContactSynced(activeQueue[i]!.id);
  };


  const refreshQueue = async () => {
    exitFocus();
    await loadQueue();
    toast.success("Fila atualizada. Primeiro contato prioritário carregado.");
  };


  const { data: counts } = useQuery({
    queryKey: ["prospect_counts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const base = supabase.from("prospect_contacts").select("id", { count: "exact", head: true }).eq("vendedor_responsavel_id", user!.id);
      const [total, done, pending, interested] = await Promise.all([
        base,
        supabase.from("prospect_contacts").select("id", { count: "exact", head: true }).eq("vendedor_responsavel_id", user!.id).eq("convertido_em_lead", true),
        applyDialerEligibility(supabase.from("prospect_contacts").select("id", { count: "exact", head: true }).eq("vendedor_responsavel_id", user!.id).in("status_prospeccao", QUEUE_STATUSES as unknown as string[])),
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

  const queuePos = useMemo(() => {
    if (activeQueue.length === 0 || activeIndex < 0) return null;
    return `${activeIndex + 1} / ${activeQueue.length} ${activeLabel}`;
  }, [activeQueue.length, activeIndex, activeLabel]);


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
    // NÃO inserir em prospect_attempts aqui: o registro único é criado no ResultDialog ao salvar.
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
    // NÃO inserir em prospect_attempts aqui: o registro único é criado no ResultDialog ao salvar.
    window.open(`https://wa.me/${contact.telefone_normalizado}?text=${encodeURIComponent(message)}`, "_blank");
    setResultOpen(true);
  };

  const addToWhatsapp = async () => {
    if (!contact || !user) return;
    try {
      const res = await addToWhatsappList({
        prospectContactId: contact.id,
        ownerId: user.id,
        reason: "manual",
      });
      if (res.created) {
        toast.success("Adicionado à Lista de WhatsApp");
      } else {
        toast.message("Este lead já está na Lista de WhatsApp.");
      }
      qc.invalidateQueries({ queryKey: ["whatsapp_list"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar à lista");
    }
  };



  const onResultSaved = async (goNext: boolean) => {
    qc.invalidateQueries({ queryKey: ["prospect_counts"] });
    qc.invalidateQueries({ queryKey: ["prospect_attempts", contact?.id] });
    qc.invalidateQueries({ queryKey: ["daily_scoreboard"] });
    qc.invalidateQueries({ queryKey: ["my_prospect_contacts"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["hoje"] });
    if (!contact) return;
    const savedContactId = contact.id;
    const wasRetorno = !!activeRetornoTaskId || !!retornoTask;
    const prevIndex = activeIndex;

    // "Salvar e ir para próximo": atualiza a fila e navega para o próximo prioritário.
    // Retorno aberto pela aba Hoje também sai do foco (a tarefa já foi concluída),
    // mas apenas quando o vendedor pediu para avançar.
    if (goNext) {
      exitFocus();
      await loadQueue({ silent: true, avoidContactId: savedContactId });
      return;
    }

    // "Salvar": apenas atualiza os dados e PERMANECE no mesmo contato,
    // sem resetar a posição do sprint.
    const updated = await fetchProspectContactById(savedContactId);
    // Limpa apenas o vínculo com a tarefa de retorno (já concluída no salvamento).
    setActiveRetornoTaskId(null);
    setRetornoTask(null);
    await loadQueue({ silent: true, keepSelection: true });
    if (updated) {
      // Mantém o contato salvo visível mesmo que ele tenha saído da fila prioritária.
      setFocusedContact(updated);
    } else if (wasRetorno) {
      setFocusedContact(null);
    }
    // Preserva a posição visual do sprint: ancora a seleção no mesmo índice da fila ativa.
    setQueue((prev) => {
      const nextActive = buildActiveQueue(prev).list;
      if (nextActive.length === 0) setCurrentContactSynced(null);
      else {
        const stillThere = nextActive.some((c) => c.id === savedContactId);
        const idx = stillThere
          ? nextActive.findIndex((c) => c.id === savedContactId)
          : Math.min(Math.max(prevIndex, 0), nextActive.length - 1);
        setCurrentContactSynced(nextActive[idx]!.id);
      }
      return prev;
    });
  };



  return (
    <>
      <div className="mb-3"><ReturnsDebugCard contact={contact} /></div>
      {retornoTask && contact && (
        <div className="mb-3 rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <Phone className="h-4 w-4" /> Retorno do Discador agendado
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(retornoTask.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
            {retornoTask.due_time ? ` às ${retornoTask.due_time.slice(0, 5)}` : ""}
          </div>
          {retornoTask.observation && (
            <div className="text-sm whitespace-pre-wrap"><strong>Motivo do retorno:</strong> {retornoTask.observation}</div>
          )}
          {contact.observacao && (
            <div className="text-sm whitespace-pre-wrap"><strong>Histórico/obs. do contato:</strong> {contact.observacao}</div>
          )}
        </div>
      )}
      {/* ============================== MOBILE (<768px) ============================== */}
      <div className="md:hidden w-full max-w-full overflow-x-hidden pb-[140px] space-y-3">
        <div className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap overflow-x-auto max-w-full h-10 flex items-center px-1">
          <span><strong className="text-foreground">{counts?.total ?? 0}</strong> atribuídos</span>
          <span className="mx-1.5">·</span>
          <span><strong className="text-foreground">{counts?.pending ?? 0}</strong> em fila</span>
          <span className="mx-1.5">·</span>
          <span><strong className="text-foreground">{counts?.interested ?? 0}</strong> interessados</span>
          <span className="mx-1.5">·</span>
          <span><strong className="text-foreground">{counts?.done ?? 0}</strong> convertidos</span>
        </div>

        <DailyScoreboard onStartSprint={ligar} hasContact={!!contact} />



        {!contact ? (
          <div className="rounded-lg border bg-card p-6 flex flex-col items-center gap-3 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{loadingQueue ? "Carregando fila…" : "Nenhum contato pendente na sua fila."}</p>
            <Button onClick={refreshQueue} disabled={loadingQueue} size="sm"><RefreshCw className="h-4 w-4 mr-2" />Atualizar fila</Button>
          </div>
        ) : (
          <>
            {queuePos && (
              <div className="text-xs text-muted-foreground text-center font-medium">{queuePos}</div>
            )}
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

            <div className="w-full max-w-full rounded-lg border bg-primary/5 px-3 py-2.5 overflow-hidden">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Número que será discado</div>
              <div className="font-mono text-2xl font-bold tracking-wide break-all leading-tight mt-0.5">{dialNumber || "—"}</div>
              <div className="text-[11px] text-muted-foreground mt-1 break-words">
                DDD origem: <strong>{settings.ddd_origem}</strong> · Prefixo: <strong>{settings.prefixo_interurbano}</strong>
                {dddDestino && <> · Destino: <strong>{dddDestino}</strong></>}
              </div>
            </div>

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

            <WhatsappComposer contact={contact} />

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
              <Button variant="ghost" onClick={goPrev} disabled={activeQueue.length < 2} className="h-12 min-w-0 px-1">
                <ArrowLeft className="h-4 w-4 shrink-0" /><span className="truncate text-[10px] ml-1">Ant.</span>
              </Button>
              <Button variant="ghost" onClick={goNext} disabled={activeQueue.length < 2} className="h-12 min-w-0 px-1">
                <ArrowRight className="h-4 w-4 shrink-0" /><span className="truncate text-[10px] ml-1">Próx.</span>
              </Button>
              <Button variant="secondary" onClick={refreshQueue} disabled={loadingQueue} className="h-12 min-w-0 px-1">
                <RefreshCw className="h-4 w-4 shrink-0" /><span className="truncate text-[10px] ml-1">Atual.</span>
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

          <DailyScoreboard onStartSprint={ligar} hasContact={!!contact} />



          {!contact ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
                <Inbox className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">{loadingQueue ? "Carregando fila…" : "Nenhum contato pendente na sua fila."}</p>
                <Button onClick={refreshQueue} disabled={loadingQueue}><RefreshCw className="h-4 w-4 mr-2" />Atualizar fila</Button>
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

                <WhatsappComposer contact={contact} />



                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />Editar contato
                  </Button>
                  <Button variant="outline" onClick={addToWhatsapp}>
                    <MessageCircle className="h-4 w-4 mr-2" />Adicionar à Lista WhatsApp
                  </Button>
                  <Button variant="outline" onClick={goPrev} disabled={activeQueue.length < 2}>
                    <ArrowLeft className="h-4 w-4 mr-2" />Anterior
                  </Button>
                  <Button variant="outline" onClick={goNext} disabled={activeQueue.length < 2}>
                    <ArrowRight className="h-4 w-4 mr-2" />Próximo
                  </Button>
                  <Button variant="secondary" onClick={refreshQueue} disabled={loadingQueue}>
                    <RefreshCw className="h-4 w-4 mr-2" />Atualizar fila
                  </Button>
                  {queuePos && (
                    <span className="text-sm text-muted-foreground ml-2 font-medium">{queuePos}</span>
                  )}
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

      {/* Dialogs */}
      {contact && user && (
        <ResultDialog
          open={resultOpen}
          onOpenChange={setResultOpen}
          contact={contact}
          vendedorId={user.id}
          initialAction={lastAction}
          retornoTaskId={activeRetornoTaskId ?? retornoTask?.id ?? undefined}
          completeRetornoFallback={!!activeRetornoTaskId || !!retornoTask}
          dialMeta={{
            telefone_para_discagem: dialNumber || null,
            ddd_origem_vendedor: settings.ddd_origem ?? null,
            prefixo_interurbano: settings.prefixo_interurbano ?? null,
            ddd_destino_contato: dddDestino ?? null,
          }}
          onSaved={onResultSaved}
        />
      )}

      {contact && user && (
        <ConvertLeadDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          contact={contact}
          vendedorId={user.id}
          onConverted={() => {
            qc.invalidateQueries({ queryKey: ["prospect_counts"] });
            // remove o convertido da fila local e avança
            if (!contact) return;
            const removedId = contact.id;
            setQueue((q) => {
              const next = q.filter((c) => c.id !== removedId);
              const nextActive = buildActiveQueue(next).list;
              setCurrentContactId(nextActive.length > 0 ? nextActive[0]!.id : null);
              return next;
            });
          }}
        />
      )}
      {contact && (
        <EditContactDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          contact={contact}
          onSaved={(updated) => {
            setQueue((q) => q.map((c) => (c.id === updated.id ? updated : c)));
            qc.invalidateQueries({ queryKey: ["prospect_contacts_admin"] });
          }}
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
