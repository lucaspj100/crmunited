import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Phone, MessageCircle, ListChecks, UserPlus, SkipForward, Inbox, Pencil, ChevronDown, Linkedin } from "lucide-react";
import { fetchNextProspect, type ProspectContact } from "@/lib/prospect-queue";
import { statusBadgeClass, getWhatsappTemplate } from "@/lib/prospect-status";
import { buildDialNumber, DEFAULT_DIALER_SETTINGS, type DialerSettings } from "@/lib/prospect-dial";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ResultDialog } from "./ResultDialog";
import { ConvertLeadDialog } from "./ConvertLeadDialog";
import { EditContactDialog } from "./EditContactDialog";
import { AttemptHistory } from "./AttemptHistory";
import { toast } from "sonner";

export function WorkPanel() {
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

  const loadNext = async () => {
    if (!user) return;
    setLoading(true);
    const next = await fetchNextProspect(user.id);
    setContact(next);
    setLoading(false);
    if (!next) toast.info("Sem contatos pendentes na sua fila");
  };

  useEffect(() => { void loadNext(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

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
    await supabase.from("prospect_attempts").insert({
      prospect_contact_id: contact.id,
      vendedor_id: user.id,
      tipo_acao: "whatsapp",
      telefone_normalizado: contact.telefone_normalizado,
    });
    window.open(`https://wa.me/${contact.telefone_normalizado}?text=${encodeURIComponent(template)}`, "_blank");
    setResultOpen(true);
  };

  const onResultSaved = async (goNext: boolean) => {
    qc.invalidateQueries({ queryKey: ["prospect_counts"] });
    qc.invalidateQueries({ queryKey: ["prospect_attempts", contact?.id] });
    if (goNext) await loadNext(); else {
      if (contact) {
        const { data } = await supabase.from("prospect_contacts").select("*").eq("id", contact.id).single();
        if (data) setContact(data as ProspectContact);
      }
    }
  };

  return (
    <>
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
            <Button onClick={loadNext} disabled={loading} size="sm"><SkipForward className="h-4 w-4 mr-2" />Buscar próximo</Button>
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
            <div className="grid grid-cols-3 gap-2 w-full max-w-full">
              <Button onClick={ligar} className="h-12 min-w-0 px-2">
                <Phone className="h-4 w-4 mr-1 shrink-0" /><span className="truncate">Ligar</span>
              </Button>
              <Button variant="outline" onClick={() => { setLastAction(undefined); setResultOpen(true); }} className="h-12 min-w-0 px-2">
                <ListChecks className="h-4 w-4 mr-1 shrink-0" /><span className="truncate">Resultado</span>
              </Button>
              <Button variant="ghost" onClick={loadNext} disabled={loading} className="h-12 min-w-0 px-2">
                <SkipForward className="h-4 w-4 mr-1 shrink-0" /><span className="truncate">Próximo</span>
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
          contactId={contact.id}
          vendedorId={user.id}
          telefone={contact.telefone_normalizado}
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
