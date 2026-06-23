import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, MessageCircle, ListChecks, UserPlus, SkipForward, Inbox, Pencil } from "lucide-react";
import { fetchNextProspect, type ProspectContact } from "@/lib/prospect-queue";
import { statusBadgeClass, getWhatsappTemplate } from "@/lib/prospect-status";
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
    });
    window.location.href = `tel:+${contact.telefone_normalizado}`;
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
      // refresh current
      if (contact) {
        const { data } = await supabase.from("prospect_contacts").select("*").eq("id", contact.id).single();
        if (data) setContact(data as ProspectContact);
      }
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
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
                  {contact.cargo
                    ? <span>{contact.cargo}</span>
                    : <span className="text-muted-foreground italic">Cargo não informado</span>}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Empresa:</span>{" "}
                  {contact.empresa
                    ? <strong>{contact.empresa}</strong>
                    : <span className="text-muted-foreground italic">Empresa não informada</span>}
                </div>
                <div className="text-sm flex flex-wrap items-center gap-2">
                  <span className="font-mono">+{contact.telefone_normalizado}</span>
                  {contact.ddd && <Badge variant="outline">DDD {contact.ddd}</Badge>}
                  <Badge className={statusBadgeClass(contact.status_prospeccao)}>{contact.status_prospeccao}</Badge>
                </div>
                {contact.origem && (
                  <div className="text-sm"><span className="text-muted-foreground">Origem:</span> {contact.origem}</div>
                )}
                {contact.observacao && (
                  <div className="text-sm"><span className="text-muted-foreground">Obs:</span> {contact.observacao}</div>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <div>Tentativas: {contact.quantidade_tentativas}</div>
                {contact.ultima_tentativa && <div>Última: {format(new Date(contact.ultima_tentativa), "dd/MM HH:mm", { locale: ptBR })}</div>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Contexto para ligação</div>
                <div><span className="text-muted-foreground">Nome:</span> {contact.nome || "—"}</div>
                <div><span className="text-muted-foreground">Cargo:</span> {contact.cargo || "—"}</div>
                <div><span className="text-muted-foreground">Empresa:</span> {contact.empresa || "—"}</div>
                <div><span className="text-muted-foreground">Origem:</span> {contact.origem || "—"}</div>
                <div><span className="text-muted-foreground">Observação:</span> {contact.observacao || "—"}</div>
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
                  <UserPlus className="h-5 w-5 mr-2" />Converter em lead
                </Button>
              </div>

              <div>
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
    </div>
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
