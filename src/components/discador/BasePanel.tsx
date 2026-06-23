import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PROSPECT_STATUSES, statusBadgeClass } from "@/lib/prospect-status";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { exportRowsToXlsx } from "@/lib/xlsx-export";

type Seller = { id: string; full_name: string | null; email: string };

const QUICK_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "sem_tentativa", label: "Sem tentativa" },
  { key: "hoje", label: "Para ligar hoje" },
  { key: "interessado", label: "Interessados" },
  { key: "pediu_wpp", label: "Pediu WhatsApp" },
  { key: "invalido", label: "Inválidos" },
  { key: "nao_chamar", label: "Não chamar" },
  { key: "convertido", label: "Convertidos" },
] as const;

export function BasePanel({ sellers }: { sellers: Seller[] }) {
  const qc = useQueryClient();
  const [vendedor, setVendedor] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [origem, setOrigem] = useState("");
  const [ddd, setDdd] = useState("");
  const [quick, setQuick] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSeller, setBulkSeller] = useState<string>("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["prospect_contacts_admin", vendedor, status, origem, ddd, quick],
    queryFn: async () => {
      let q = supabase.from("prospect_contacts").select("*").order("created_at", { ascending: false }).limit(500);
      if (vendedor !== "all") q = vendedor === "none" ? q.is("vendedor_responsavel_id", null) : q.eq("vendedor_responsavel_id", vendedor);
      if (status !== "all") q = q.eq("status_prospeccao", status);
      if (origem.trim()) q = q.ilike("origem", `%${origem.trim()}%`);
      if (ddd.trim()) q = q.eq("ddd", ddd.trim());
      if (quick === "sem_tentativa") q = q.eq("quantidade_tentativas", 0);
      if (quick === "interessado") q = q.eq("status_prospeccao", "Interessado");
      if (quick === "pediu_wpp") q = q.eq("status_prospeccao", "Pediu WhatsApp");
      if (quick === "invalido") q = q.eq("telefone_invalido", true);
      if (quick === "nao_chamar") q = q.eq("nao_chamar", true);
      if (quick === "convertido") q = q.eq("convertido_em_lead", true);
      if (quick === "hoje") {
        const end = new Date(); end.setHours(23, 59, 59, 999);
        q = q.lte("proxima_tentativa", end.toISOString()).eq("status_prospeccao", "Ligar depois");
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const sellerById = useMemo(() => new Map(sellers.map((s) => [s.id, s])), [sellers]);

  const allSelected = (rows?.length ?? 0) > 0 && rows!.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (!rows) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const redistribute = async (target: string | null) => {
    if (selected.size === 0) { toast.error("Selecione contatos"); return; }
    const { error } = await supabase
      .from("prospect_contacts")
      .update({ vendedor_responsavel_id: target, assigned_at: target ? new Date().toISOString() : null })
      .in("id", Array.from(selected));
    if (error) { toast.error(error.message); return; }
    toast.success("Contatos redistribuídos");
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["prospect_contacts_admin"] });
  };

  const bulkNaoChamar = async () => {
    if (selected.size === 0) return;
    const { error } = await supabase.from("prospect_contacts")
      .update({ nao_chamar: true, status_prospeccao: "Não chamar" })
      .in("id", Array.from(selected));
    if (error) { toast.error(error.message); return; }
    toast.success("Marcados como não chamar");
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["prospect_contacts_admin"] });
  };

  const exportar = () => {
    if (!rows) return;
    exportRowsToXlsx(
      rows.map((r) => [
        r.nome, r.telefone_original, r.telefone_normalizado, r.ddd, r.empresa, r.cargo, r.origem,
        r.status_prospeccao, r.quantidade_tentativas, r.ultima_tentativa, r.proxima_tentativa,
        sellerById.get(r.vendedor_responsavel_id ?? "")?.full_name || sellerById.get(r.vendedor_responsavel_id ?? "")?.email || "",
        r.convertido_em_lead ? "Sim" : "Não",
      ]),
      ["Nome", "Telefone", "Normalizado", "DDD", "Empresa", "Cargo", "Origem", "Status", "Tentativas", "Última tentativa", "Próxima tentativa", "Vendedor", "Convertido"],
      `prospect_contacts_${new Date().toISOString().slice(0, 10)}`,
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Base de contatos frios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map((f) => (
            <Button key={f.key} variant={quick === f.key ? "default" : "outline"} size="sm" onClick={() => setQuick(f.key)}>{f.label}</Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label>Vendedor</Label>
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="none">Sem responsável</SelectItem>
                {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
              </SelectContent>
            </Select>
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
          <div><Label>Origem</Label><Input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="contém…" /></div>
          <div><Label>DDD</Label><Input value={ddd} onChange={(e) => setDdd(e.target.value)} placeholder="ex.: 41" maxLength={3} /></div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
            <span className="text-sm font-medium">{selected.size} selecionados</span>
            <Select value={bulkSeller} onValueChange={setBulkSeller}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Atribuir a…" /></SelectTrigger>
              <SelectContent>
                {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => bulkSeller && redistribute(bulkSeller)} disabled={!bulkSeller}>Atribuir</Button>
            <Button size="sm" variant="outline" onClick={() => redistribute(null)}>Tirar responsável</Button>
            <Button size="sm" variant="destructive" onClick={bulkNaoChamar}>Marcar Não chamar</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
          </div>
        )}

        <div className="flex justify-between">
          <p className="text-sm text-muted-foreground">{isLoading ? "Carregando…" : `${rows?.length ?? 0} contatos (máx. 500)`}</p>
          <Button variant="outline" size="sm" onClick={exportar} disabled={!rows?.length}>Exportar XLSX</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2 w-8"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                <th className="p-2">Nome</th>
                <th className="p-2">Empresa</th>
                <th className="p-2">Cargo</th>
                <th className="p-2">Telefone</th>
                <th className="p-2">DDD</th>
                <th className="p-2">Vendedor</th>
                <th className="p-2">Status</th>
                <th className="p-2">Tent.</th>
                <th className="p-2">Próxima</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2"><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} /></td>
                  <td className="p-2">{r.nome || <span className="text-muted-foreground italic">sem nome</span>}</td>
                  <td className="p-2">{r.empresa || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2">{r.cargo || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2 font-mono">+{r.telefone_normalizado}</td>
                  <td className="p-2">{r.ddd}</td>
                  <td className="p-2">{sellerById.get(r.vendedor_responsavel_id ?? "")?.full_name || sellerById.get(r.vendedor_responsavel_id ?? "")?.email || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2"><Badge className={statusBadgeClass(r.status_prospeccao)}>{r.status_prospeccao}</Badge></td>
                  <td className="p-2">{r.quantidade_tentativas}</td>
                  <td className="p-2">{r.proxima_tentativa ? format(new Date(r.proxima_tentativa), "dd/MM HH:mm", { locale: ptBR }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
