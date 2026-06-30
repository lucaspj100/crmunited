import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Seller } from "./PeriodFilter";

export function CheckoutHistoryPanel({
  sellers, vendedorId, start, end,
}: {
  sellers: Seller[]; vendedorId: string | null; start: string; end: string;
}) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["checkout_history", vendedorId, start, end],
    queryFn: async () => {
      let q = supabase
        .from("daily_checkouts" as never)
        .select("*")
        .gte("data", start)
        .lte("data", end)
        .order("data", { ascending: false })
        .order("submitted_at", { ascending: false });
      if (vendedorId) q = q.eq("vendedor_id", vendedorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const nameMap = new Map(sellers.map((s) => [s.id, s.full_name || s.email]));

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Enviado às</TableHead>
            <TableHead className="text-right">Ligações</TableHead>
            <TableHead className="text-right">Atendidas</TableHead>
            <TableHead className="text-right">Interessados</TableHead>
            <TableHead className="text-right">Entrev.</TableHead>
            <TableHead className="text-right">Matr.</TableHead>
            <TableHead className="text-right">WA</TableHead>
            <TableHead className="text-right">LinkedIn</TableHead>
            <TableHead>Obs.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={11} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>}
          {!isLoading && data.length === 0 && (
            <TableRow><TableCell colSpan={11} className="text-center py-6 text-muted-foreground">Sem checkouts no período.</TableCell></TableRow>
          )}
          {data.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>{nameMap.get(r.vendedor_id) ?? r.vendedor_id.slice(0, 8)}</TableCell>
              <TableCell>{new Date(r.submitted_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</TableCell>
              <TableCell className="text-right">{r.ligacoes_feitas}</TableCell>
              <TableCell className="text-right">{r.ligacoes_atendidas}</TableCell>
              <TableCell className="text-right">{r.interessados_gerados}</TableCell>
              <TableCell className="text-right">{r.entrevistas_marcadas}</TableCell>
              <TableCell className="text-right">{r.matriculas}</TableCell>
              <TableCell className="text-right">{r.whatsapp_msgs}</TableCell>
              <TableCell className="text-right">{r.linkedin_msgs}</TableCell>
              <TableCell className="max-w-xs truncate" title={r.observacoes ?? ""}>{r.observacoes ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
