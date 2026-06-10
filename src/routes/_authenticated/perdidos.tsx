import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOST_REASONS, labelFor, waLink } from "@/lib/constants";
import { copyToClipboard, waRescueMessage, leadSummary, rawPhoneDigits } from "@/lib/messages";
import { TrendingDown, MessageCircle, Copy, RotateCw, Download, FileSpreadsheet, User } from "lucide-react";
import { toast } from "sonner";
import { exportRowsToXlsx } from "@/lib/xlsx-export";

export const Route = createFileRoute("/_authenticated/perdidos")({ component: PerdidosPage });

type Lead = {
  id: string; name: string; phone: string | null; company: string | null;
  owner_id: string; status: string; observation: string | null;
  lost_reason: string | null; lost_at: string | null; last_contact_at: string | null;
  in_rescue: boolean;
};
type Profile = { id: string; full_name: string | null; email: string | null };

const AGE_BUCKETS = [
  { value: "all", label: "Todos" },
  { value: "7", label: "Mais de 7 dias" },
  { value: "15", label: "Mais de 15 dias" },
  { value: "30", label: "Mais de 30 dias" },
  { value: "60", label: "Mais de 60 dias" },
  { value: "90", label: "Mais de 90 dias" },
] as const;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
}

function PerdidosPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");

  const { data, isLoading } = useQuery({
    queryKey: ["perdidos"],
    queryFn: async () => {
      const [leadsR, profR] = await Promise.all([
        supabase.from("leads").select("*").eq("status", "perdido").limit(5000),
        supabase.from("profiles").select("id, full_name, email").limit(2000),
      ]);
      return {
        leads: ((leadsR.data ?? []) as any[]) as Lead[],
        profiles: ((profR.data ?? []) as any[]) as Profile[],
      };
    },
  });

  const [age, setAge] = useState<string>("all");
  const [vendor, setVendor] = useState<string>("all");
  const [reason, setReason] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const byProf = useMemo(() => new Map((data?.profiles ?? []).map((p) => [p.id, p])), [data]);
  const vendorOptions = useMemo(() => {
    const ids = new Set((data?.leads ?? []).map((l) => l.owner_id));
    return Array.from(ids).map((id) => ({ id, name: byProf.get(id)?.full_name || byProf.get(id)?.email || "Vendedor" }));
  }, [data, byProf]);

  const filtered = useMemo(() => {
    const list = (data?.leads ?? []).filter((l) => !l.in_rescue);
    return list.filter((l) => {
      const days = daysSince(l.lost_at);
      if (age !== "all" && (days === null || days < Number(age))) return false;
      if (vendor !== "all" && l.owner_id !== vendor) return false;
      if (reason !== "all" && l.lost_reason !== reason) return false;
      return true;
    }).sort((a, b) => (b.lost_at ?? "").localeCompare(a.lost_at ?? ""));
  }, [data, age, vendor, reason]);

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => l.id)));
  };

  const moveToRescue = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("leads")
      .update({ in_rescue: true, rescued_at: new Date().toISOString(), rescued_by: user?.id ?? null } as any)
      .in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} lead(s) movido(s) para Resgate`);
    setSelected(new Set());
    qc.invalidateQueries();
  };

  const buildRows = () => {
    const headers = ["Nome", "Telefone", "Empresa", "Vendedor", "Motivo", "Data perdido", "Dias perdido", "Observação", "Último contato", "Status"];
    const rows = filtered.map((l) => {
      const owner = byProf.get(l.owner_id);
      const days = daysSince(l.lost_at);
      return [
        l.name,
        l.phone ?? "",
        l.company ?? "",
        owner?.full_name || owner?.email || "",
        labelFor(LOST_REASONS, l.lost_reason),
        l.lost_at ? new Date(l.lost_at).toLocaleDateString("pt-BR") : "",
        days?.toString() ?? "",
        (l.observation ?? "").replace(/\n/g, " "),
        l.last_contact_at ? new Date(l.last_contact_at).toLocaleDateString("pt-BR") : "",
        l.status,
      ];
    });
    return { headers, rows };
  };

  const exportCsv = () => {
    const { headers, rows } = buildRows();
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `perdidos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportXlsx = () => {
    const { headers, rows } = buildRows();
    exportRowsToXlsx(rows, headers, `perdidos-${new Date().toISOString().slice(0, 10)}.xlsx`, "Perdidos");
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><TrendingDown className="h-6 w-6 text-rose-500" />Leads Perdidos</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} lead(s) — exporte ou mova para a esteira de resgate</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
          <Button variant="outline" onClick={exportXlsx}><FileSpreadsheet className="h-4 w-4 mr-1" />Exportar XLSX</Button>
          <Button disabled={selected.size === 0} onClick={() => moveToRescue(Array.from(selected))}>
            <RotateCw className="h-4 w-4 mr-1" />Mover selecionados ({selected.size})
          </Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select value={age} onValueChange={setAge}>
            <SelectTrigger><SelectValue placeholder="Tempo perdido" /></SelectTrigger>
            <SelectContent>{AGE_BUCKETS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
          </Select>
          {isAdmin && (
            <Select value={vendor} onValueChange={setVendor}>
              <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {vendorOptions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue placeholder="Motivo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os motivos</SelectItem>
              {LOST_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
        <span>Selecionar todos</span>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum lead perdido com esses filtros.</Card>}
        {filtered.map((l) => {
          const owner = byProf.get(l.owner_id);
          const days = daysSince(l.lost_at);
          const checked = selected.has(l.id);
          return (
            <Card key={l.id} className={`p-4 ${checked ? "border-primary" : ""}`}>
              <div className="flex flex-wrap items-start gap-3">
                <Checkbox className="mt-1" checked={checked} onCheckedChange={() => toggle(l.id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{l.name}</span>
                    {l.lost_reason && <Badge variant="outline">Motivo: {labelFor(LOST_REASONS, l.lost_reason)}</Badge>}
                    {days !== null && (
                      <Badge variant="secondary" className={days >= 60 ? "bg-rose-500/15 text-rose-700" : days >= 30 ? "bg-amber-500/15 text-amber-700" : ""}>
                        Perdido há {days} dia{days === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {l.company && <>{l.company} · </>}
                    {l.phone && <>{l.phone} · </>}
                    {l.lost_at && <>desde {new Date(l.lost_at).toLocaleDateString("pt-BR")}</>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />{owner?.full_name || owner?.email || "—"}
                    {l.last_contact_at && <span className="ml-2">Últ. contato: {new Date(l.last_contact_at).toLocaleDateString("pt-BR")}</span>}
                  </div>
                  {l.observation && <p className="mt-1 text-xs italic text-muted-foreground line-clamp-2">{l.observation}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {l.phone && (
                    <>
                      <Button asChild size="sm" variant="outline" title="WhatsApp">
                        <a href={waLink(l.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a>
                      </Button>
                      <Button size="sm" variant="outline" title="Copiar telefone" onClick={() => copyToClipboard(rawPhoneDigits(l.phone), "Telefone copiado")}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" title="Copiar mensagem de resgate" onClick={() => copyToClipboard(waRescueMessage(l.name), "Mensagem de resgate copiada")}>
                    <Copy className="h-4 w-4 mr-1" />Msg
                  </Button>
                  <Button asChild size="sm" variant="ghost"><Link to="/funil">Ver no funil</Link></Button>
                  <Button size="sm" onClick={() => moveToRescue([l.id])}>
                    <RotateCw className="h-4 w-4 mr-1" />Mover p/ Resgate
                  </Button>
                </div>
              </div>
              <button className="sr-only" onClick={() => copyToClipboard(leadSummary(l), "Resumo copiado")}>resumo</button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
