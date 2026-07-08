import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PROSPECT_STATUSES, statusBadgeClass } from "@/lib/prospect-status";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Linkedin, Pencil, ExternalLink, Trash2, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { EditContactDialog } from "./EditContactDialog";
import type { ProspectContact } from "@/lib/prospect-queue";
import {
  bulkAddToWhatsappList,
  REASON_LABEL,
  type WhatsappListReason,
} from "@/lib/whatsapp-list";

type OrderKey = "created_at" | "ultima_tentativa" | "proxima_tentativa";
type WhatsFilter = "all" | "in" | "out";

const BULK_REASONS: { value: WhatsappListReason; label: string }[] = [
  { value: "nao_atendeu", label: REASON_LABEL.nao_atendeu },
  { value: "caixa_postal", label: REASON_LABEL.caixa_postal },
  { value: "numero_invalido", label: REASON_LABEL.numero_invalido },
  { value: "muitas_tentativas", label: REASON_LABEL.muitas_tentativas },
  { value: "tentar_whatsapp", label: REASON_LABEL.tentar_whatsapp },
  { value: "manual", label: REASON_LABEL.manual },
  { value: "outro", label: REASON_LABEL.outro },
];

export function MyContactsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [empresa, setEmpresa] = useState("");
  const [whatsFilter, setWhatsFilter] = useState<WhatsFilter>("all");
  const [orderBy, setOrderBy] = useState<OrderKey>("created_at");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");
  const [editing, setEditing] = useState<ProspectContact | null>(null);
  const [deleting, setDeleting] = useState<ProspectContact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [sendReason, setSendReason] = useState<WhatsappListReason>("tentar_whatsapp");
  const [sendNotes, setSendNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingContactIds, setPendingContactIds] = useState<string[]>([]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["my_prospect_contacts"] });
    qc.invalidateQueries({ queryKey: ["prospect_queue"] });
    qc.invalidateQueries({ queryKey: ["prospect_counts"] });
    qc.invalidateQueries({ queryKey: ["daily_scoreboard"] });
    qc.invalidateQueries({ queryKey: ["whatsapp_list"] });
    qc.invalidateQueries({ queryKey: ["my_whatsapp_list_ids"] });
  };

  const handleDelete = async () => {
    if (!deleting || !user) return;
    setIsDeleting(true);
    const { error } = await supabase
      .from("prospect_contacts")
      .delete()
      .eq("id", deleting.id)
      .eq("vendedor_responsavel_id", user.id);
    setIsDeleting(false);
    if (error) {
      toast.error(`Erro ao excluir contato: ${error.message}`);
      return;
    }
    qc.setQueriesData<ProspectContact[]>({ queryKey: ["my_prospect_contacts"] }, (prev) =>
      (prev ?? []).filter((r) => r.id !== deleting.id),
    );
    invalidateAll();
    toast.success("Contato excluído");
    setDeleting(null);
  };

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my_prospect_contacts", user?.id, status, empresa, orderBy, orderDir],
    queryFn: async () => {
      let q = supabase
        .from("prospect_contacts")
        .select("*")
        .eq("vendedor_responsavel_id", user!.id)
        .order(orderBy, { ascending: orderDir === "asc", nullsFirst: false })
        .limit(1000);
      if (status !== "all") q = q.eq("status_prospeccao", status);
      if (empresa.trim()) q = q.ilike("empresa", `%${empresa.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProspectContact[];
    },
  });

  const { data: whatsIdSet = new Set<string>() } = useQuery({
    enabled: !!user,
    queryKey: ["my_whatsapp_list_ids", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_list_entries")
        .select("prospect_contact_id,status")
        .eq("owner_id", user!.id)
        .neq("status", "removido");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.prospect_contact_id));
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = rows;
    if (s) {
      list = list.filter((r) =>
        [r.nome, r.empresa, r.cargo, r.telefone_normalizado, r.telefone_original]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s)),
      );
    }
    if (whatsFilter === "in") list = list.filter((r) => whatsIdSet.has(r.id));
    else if (whatsFilter === "out") list = list.filter((r) => !whatsIdSet.has(r.id));
    return list;
  }, [rows, search, whatsFilter, whatsIdSet]);

  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = visibleIds.some((id) => selected.has(id));

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleAllVisible = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const openBulkSend = () => {
    const ids = Array.from(selected).filter((id) => visibleIds.includes(id));
    if (ids.length === 0) {
      toast.info("Selecione ao menos um contato.");
      return;
    }
    setPendingContactIds(ids);
    setSendReason("tentar_whatsapp");
    setSendNotes("");
    setSendOpen(true);
  };

  const openSingleSend = (id: string) => {
    setPendingContactIds([id]);
    setSendReason("tentar_whatsapp");
    setSendNotes("");
    setSendOpen(true);
  };

  const confirmSend = async () => {
    if (!user || pendingContactIds.length === 0) return;
    if (sendReason === "outro" && !sendNotes.trim()) {
      toast.error("Descreva o motivo em 'Outro'.");
      return;
    }
    setSending(true);
    try {
      const res = await bulkAddToWhatsappList({
        prospectContactIds: pendingContactIds,
        ownerId: user.id,
        reason: sendReason,
        notes: sendNotes.trim() || undefined,
      });
      if (res.alreadyIn > 0 && res.added > 0) {
        toast.success(
          `${pendingContactIds.length} selecionados. ${res.added} adicionados e ${res.alreadyIn} já estavam na Lista de WhatsApp.`,
        );
      } else if (res.alreadyIn > 0 && res.added === 0) {
        toast.info("Todos os contatos selecionados já estavam na Lista de WhatsApp.");
      } else {
        toast.success("Contatos enviados para a Lista de WhatsApp com sucesso.");
      }
      // registra histórico por contato
      const now = new Date().toISOString();
      const historyRows = pendingContactIds.map((pcid) => ({
        prospect_contact_id: pcid,
        vendedor_id: user.id,
        tipo_acao: "whatsapp" as const,
        resultado: "Adicionado à Lista WhatsApp",
        observacao: `Motivo: ${REASON_LABEL[sendReason] ?? sendReason}${sendNotes.trim() ? ` — ${sendNotes.trim()}` : ""} · Origem: Minha lista`,
        created_at: now,
      }));
      await supabase.from("prospect_attempts").insert(historyRows);
      setSendOpen(false);
      setPendingContactIds([]);
      setSendNotes("");
      clearSelection();
      invalidateAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Falha ao enviar: ${msg}`);
    } finally {
      setSending(false);
    }
  };

  const onSaved = (updated: ProspectContact) => {
    qc.setQueryData(["my_prospect_contacts", user?.id, status, empresa, orderBy, orderDir], (prev: ProspectContact[] | undefined) =>
      (prev ?? []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
    );
    qc.invalidateQueries({ queryKey: ["prospect_queue"] });
    qc.invalidateQueries({ queryKey: ["prospect_counts"] });
  };

  const selectedCount = Array.from(selected).filter((id) => visibleIds.includes(id)).length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Minha lista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Label>Buscar</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone, empresa ou cargo" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {PROSPECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empresa</Label>
              <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="contém…" />
            </div>
            <div>
              <Label>Status WhatsApp</Label>
              <Select value={whatsFilter} onValueChange={(v) => setWhatsFilter(v as WhatsFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="in">Já está na Lista de WhatsApp</SelectItem>
                  <SelectItem value="out">Ainda não está na Lista de WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ordenar por</Label>
              <div className="flex gap-1">
                <Select value={orderBy} onValueChange={(v) => setOrderBy(v as OrderKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Criação</SelectItem>
                    <SelectItem value="ultima_tentativa">Última tentativa</SelectItem>
                    <SelectItem value="proxima_tentativa">Próxima tentativa</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => setOrderDir((d) => (d === "asc" ? "desc" : "asc"))} title={orderDir === "asc" ? "Ascendente" : "Descendente"}>
                  {orderDir === "asc" ? "↑" : "↓"}
                </Button>
              </div>
            </div>
          </div>

          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
              <div className="text-sm font-medium">{selectedCount} contato(s) selecionado(s)</div>
              <div className="flex gap-2">
                <Button size="sm" onClick={openBulkSend}>
                  <MessageCircle className="h-4 w-4 mr-1" />Enviar para WhatsApp
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  <X className="h-4 w-4 mr-1" />Limpar seleção
                </Button>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {isLoading ? "Carregando…" : `${filtered.length} contato(s)`}
          </p>

          {/* MOBILE: cards */}
          <div className="md:hidden space-y-2">
            {filtered.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAllVisible(!!v)} />
                Selecionar todos visíveis
              </label>
            )}
            {filtered.map((r) => {
              const inList = whatsIdSet.has(r.id);
              return (
                <div key={r.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <Checkbox
                        className="mt-1"
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => toggleOne(r.id, !!v)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{r.nome || <span className="italic text-muted-foreground font-normal">sem nome</span>}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.empresa || "—"}{r.cargo ? ` · ${r.cargo}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setEditing(r)} className="h-8 px-2">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleting(r)} className="h-8 px-2">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="font-mono text-sm">+{r.telefone_normalizado}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className={statusBadgeClass(r.status_prospeccao)}>{r.status_prospeccao}</Badge>
                    {inList && (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Na lista WhatsApp</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">Tent.: {r.quantidade_tentativas}</span>
                  </div>
                  {(r.ultima_tentativa || r.proxima_tentativa) && (
                    <div className="text-xs text-muted-foreground">
                      {r.ultima_tentativa && <>Última: {format(new Date(r.ultima_tentativa), "dd/MM HH:mm", { locale: ptBR })}</>}
                      {r.ultima_tentativa && r.proxima_tentativa && " · "}
                      {r.proxima_tentativa && <>Próxima: {format(new Date(r.proxima_tentativa), "dd/MM HH:mm", { locale: ptBR })}</>}
                    </div>
                  )}
                  {r.origem && <div className="text-xs text-muted-foreground truncate">Origem: {r.origem}</div>}
                  {r.linkedin_url && (
                    <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
                      <Linkedin className="h-3 w-3" />Abrir LinkedIn
                    </a>
                  )}
                  {r.observacao && <div className="text-xs break-words"><span className="text-muted-foreground">Obs.: </span>{r.observacao}</div>}
                  <Button size="sm" variant="secondary" onClick={() => openSingleSend(r.id)} className="h-8 w-full">
                    <MessageCircle className="h-3.5 w-3.5 mr-1" />
                    {inList ? "Atualizar na Lista WhatsApp" : "Enviar para WhatsApp"}
                  </Button>
                </div>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">Nenhum contato encontrado.</div>
            )}
          </div>

          {/* DESKTOP: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-2 w-8">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAllVisible(!!v && v !== "indeterminate")}
                      aria-label="Selecionar todos visíveis"
                    />
                  </th>
                  <th className="p-2">Nome</th>
                  <th className="p-2">Telefone</th>
                  <th className="p-2">Empresa</th>
                  <th className="p-2">Cargo</th>
                  <th className="p-2">LinkedIn</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">WhatsApp</th>
                  <th className="p-2">Tent.</th>
                  <th className="p-2">Última</th>
                  <th className="p-2">Próxima</th>
                  <th className="p-2">Origem</th>
                  <th className="p-2">Obs.</th>
                  <th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const inList = whatsIdSet.has(r.id);
                  return (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-2">
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => toggleOne(r.id, !!v)} />
                      </td>
                      <td className="p-2">{r.nome || <span className="text-muted-foreground italic">sem nome</span>}</td>
                      <td className="p-2 font-mono whitespace-nowrap">+{r.telefone_normalizado}</td>
                      <td className="p-2">{r.empresa || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2">{r.cargo || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2">
                        {r.linkedin_url ? (
                          <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline whitespace-nowrap">
                            <Linkedin className="h-3.5 w-3.5" />Abrir <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2"><Badge className={statusBadgeClass(r.status_prospeccao)}>{r.status_prospeccao}</Badge></td>
                      <td className="p-2">
                        {inList ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 whitespace-nowrap">Na lista</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 text-center">{r.quantidade_tentativas}</td>
                      <td className="p-2 whitespace-nowrap text-xs">{r.ultima_tentativa ? format(new Date(r.ultima_tentativa), "dd/MM HH:mm", { locale: ptBR }) : "—"}</td>
                      <td className="p-2 whitespace-nowrap text-xs">{r.proxima_tentativa ? format(new Date(r.proxima_tentativa), "dd/MM HH:mm", { locale: ptBR }) : "—"}</td>
                      <td className="p-2 text-xs max-w-[160px] truncate" title={r.origem ?? ""}>{r.origem || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2 text-xs max-w-[220px] truncate" title={r.observacao ?? ""}>{r.observacao || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="secondary" onClick={() => openSingleSend(r.id)} className="h-8" title="Enviar para WhatsApp">
                            <MessageCircle className="h-3.5 w-3.5 mr-1" />WhatsApp
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(r)} className="h-8">
                            <Pencil className="h-3.5 w-3.5 mr-1" />Editar
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setDeleting(r)} className="h-8">
                            <Trash2 className="h-3.5 w-3.5 mr-1" />Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={14} className="p-6 text-center text-muted-foreground">Nenhum contato encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <EditContactDialog
          open={!!editing}
          onOpenChange={(v) => { if (!v) setEditing(null); }}
          contact={editing}
          onSaved={(u) => { onSaved(u); setEditing(null); }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v && !isDeleting) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação vai remover este contato da sua lista do Discador. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={sendOpen} onOpenChange={(v) => { if (!sending) setSendOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para a Lista de WhatsApp</DialogTitle>
            <DialogDescription>
              Deseja enviar {pendingContactIds.length} contato(s) para a Lista de WhatsApp?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Motivo</Label>
              <Select value={sendReason} onValueChange={(v) => setSendReason(v as WhatsappListReason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BULK_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {sendReason === "outro" && (
              <div>
                <Label>Descreva o motivo</Label>
                <Textarea
                  value={sendNotes}
                  onChange={(e) => setSendNotes(e.target.value)}
                  placeholder="Escreva o motivo…"
                  rows={3}
                />
              </div>
            )}
            {sendReason !== "outro" && (
              <div>
                <Label>Observação (opcional)</Label>
                <Textarea
                  value={sendNotes}
                  onChange={(e) => setSendNotes(e.target.value)}
                  placeholder="Contexto adicional…"
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>Cancelar</Button>
            <Button onClick={confirmSend} disabled={sending}>
              {sending ? "Enviando…" : "Confirmar envio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
