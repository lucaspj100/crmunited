import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ProductivityRow } from "@/lib/productivity";

export function ProductivityTable({ rows, showCheckout }: { rows: ProductivityRow[]; showCheckout: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendedor</TableHead>
            <TableHead className="text-right">Novos</TableHead>
            <TableHead className="text-right">Trabalhados</TableHead>
            <TableHead className="text-right">Ligações</TableHead>
            <TableHead className="text-right">Atendidas</TableHead>
            <TableHead className="text-right">Tx. atend.</TableHead>
            <TableHead className="text-right">Interessados</TableHead>
            <TableHead className="text-right">Entrevistas</TableHead>
            <TableHead className="text-right">Matrículas</TableHead>
            <TableHead className="text-right">WhatsApps</TableHead>
            <TableHead className="text-right">LinkedIns</TableHead>
            {showCheckout && <TableHead>Checkout hoje</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={showCheckout ? 12 : 11} className="text-center text-muted-foreground py-8">
                Sem dados no período.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const tx = r.ligacoes_feitas ? ((r.ligacoes_atendidas / r.ligacoes_feitas) * 100).toFixed(0) + "%" : "—";
            return (
              <TableRow key={r.vendedor_id}>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell className="text-right">{r.leads_novos_atribuidos}</TableCell>
                <TableCell className="text-right">{r.leads_trabalhados}</TableCell>
                <TableCell className="text-right">{r.ligacoes_feitas}</TableCell>
                <TableCell className="text-right">{r.ligacoes_atendidas}</TableCell>
                <TableCell className="text-right">{tx}</TableCell>
                <TableCell className="text-right">{r.interessados_gerados}</TableCell>
                <TableCell className="text-right">{r.entrevistas_marcadas}</TableCell>
                <TableCell className="text-right">{r.matriculas}</TableCell>
                <TableCell className="text-right">{r.whatsapps_checkout}</TableCell>
                <TableCell className="text-right">{r.linkedins_checkout}</TableCell>
                {showCheckout && (
                  <TableCell>
                    {r.checkout_today_done ? (
                      <Badge variant="default">
                        Feito {r.checkout_today_at ? new Date(r.checkout_today_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Pendente</Badge>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
