import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { PROSPECT_STATUSES, statusBadgeClass } from "@/lib/prospect-status";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Linkedin, Pencil, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EditContactDialog } from "./EditContactDialog";
import type { ProspectContact } from "@/lib/prospect-queue";

type OrderKey = "created_at" | "ultima_tentativa" | "proxima_tentativa";

export function MyContactsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [empresa, setEmpresa] = useState("");
  const [orderBy, setOrderBy] = useState<OrderKey>("created_at");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");
  const [editing, setEditing] = useState<ProspectContact | null>(null);
  const [deleting, setDeleting] = useState<ProspectContact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["my_prospect_contacts"] });
    qc.invalidateQueries({ queryKey: ["prospect_queue"] });
    qc.invalidateQueries({ queryKey: ["prospect_counts"] });
    qc.invalidateQueries({ queryKey: ["daily_scoreboard"] });
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

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.nome, r.empresa, r.cargo, r.telefone_normalizado, r.telefone_original]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [rows, search]);

  const onSaved = (updated: ProspectContact) => {
    qc.setQueryData(["my_prospect_contacts", user?.id, status, empresa, orderBy, orderDir], (prev: ProspectContact[] | undefined) =>
      (prev ?? []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
    );
    qc.invalidateQueries({ queryKey: ["prospect_queue"] });
    qc.invalidateQueries({ queryKey: ["prospect_counts"] });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Minha lista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

          <p className="text-sm text-muted-foreground">
            {isLoading ? "Carregando…" : `${filtered.length} contato(s)`}
          </p>

          {/* MOBILE: cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{r.nome || <span className="italic text-muted-foreground font-normal">sem nome</span>}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.empresa || "—"}{r.cargo ? ` · ${r.cargo}` : ""}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
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
              </div>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">Nenhum contato encontrado.</div>
            )}
          </div>

          {/* DESKTOP: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-2">Nome</th>
                  <th className="p-2">Telefone</th>
                  <th className="p-2">Empresa</th>
                  <th className="p-2">Cargo</th>
                  <th className="p-2">LinkedIn</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Tent.</th>
                  <th className="p-2">Última</th>
                  <th className="p-2">Próxima</th>
                  <th className="p-2">Origem</th>
                  <th className="p-2">Obs.</th>
                  <th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t align-top">
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
                    <td className="p-2 text-center">{r.quantidade_tentativas}</td>
                    <td className="p-2 whitespace-nowrap text-xs">{r.ultima_tentativa ? format(new Date(r.ultima_tentativa), "dd/MM HH:mm", { locale: ptBR }) : "—"}</td>
                    <td className="p-2 whitespace-nowrap text-xs">{r.proxima_tentativa ? format(new Date(r.proxima_tentativa), "dd/MM HH:mm", { locale: ptBR }) : "—"}</td>
                    <td className="p-2 text-xs max-w-[160px] truncate" title={r.origem ?? ""}>{r.origem || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2 text-xs max-w-[220px] truncate" title={r.observacao ?? ""}>{r.observacao || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditing(r)} className="h-8">
                          <Pencil className="h-3.5 w-3.5 mr-1" />Editar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleting(r)} className="h-8">
                          <Trash2 className="h-3.5 w-3.5 mr-1" />Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">Nenhum contato encontrado.</td></tr>
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
    </>
  );
}
