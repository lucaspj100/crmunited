import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRangeLabel } from "@/lib/productivity";

type AuditRow = {
  lead_id: string;
  nome: string | null;
  became_interested_at: string;
  event_seller_id: string | null;
  event_seller_name: string | null;
  current_seller_id: string | null;
  current_seller_name: string | null;
  current_status: string;
  origem: string | null;
  backfilled: boolean;
  divergence_reason: string;
};

/**
 * Diagnóstico administrativo da métrica "Interessados gerados".
 * Fonte única: eventos históricos de entrada na etapa Interessado (lead_events).
 * Nenhuma correção é aplicada aqui — apenas leitura.
 */
export function InterestedAuditCard({ start, end }: { start: string; end: string }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["interested_audit", start, end],
    enabled: open,
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase.rpc("interested_audit" as never, {
        _start: start,
        _end: end,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const rows = data ?? [];
  const divergentes = rows.filter((r) => r.divergence_reason !== "sem divergência");
  const porVendedor = new Map<string, number>();
  for (const r of rows) {
    const k = r.event_seller_name || "—";
    porVendedor.set(k, (porVendedor.get(k) ?? 0) + 1);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          🔎 Auditoria — Interessados gerados{" "}
          <span className="font-normal text-muted-foreground">({formatRangeLabel({ start, end })})</span>
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Ocultar" : "Abrir diagnóstico"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {isLoading && <p className="text-muted-foreground">Carregando diagnóstico…</p>}
          {error && <p className="text-destructive">Não foi possível carregar a auditoria.</p>}
          {!isLoading && !error && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Mini label="Entradas em Interessado" value={rows.length} />
                <Mini label="Leads divergentes" value={divergentes.length} />
                <Mini label="Eventos reconstruídos" value={rows.filter((r) => r.backfilled).length} />
                <Mini label="Já fora da etapa" value={rows.filter((r) => r.current_status !== "interessado").length} />
              </div>

              <div>
                <div className="mb-1 text-sm font-semibold">Por vendedor do evento</div>
                <div className="flex flex-wrap gap-2">
                  {[...porVendedor.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([nome, n]) => (
                      <Badge key={nome} variant="secondary">
                        {nome}: {n}
                      </Badge>
                    ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="p-2">Nome</th>
                      <th className="p-2">Lead ID</th>
                      <th className="p-2">Virou interessado</th>
                      <th className="p-2">Vendedor do evento</th>
                      <th className="p-2">Vendedor atual</th>
                      <th className="p-2">Status atual</th>
                      <th className="p-2">Origem</th>
                      <th className="p-2">Motivo da divergência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {divergentes.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-muted-foreground">
                          Nenhuma divergência no período.
                        </td>
                      </tr>
                    )}
                    {divergentes.map((r) => (
                      <tr key={r.lead_id} className="border-t">
                        <td className="p-2">{r.nome || "—"}</td>
                        <td className="p-2 font-mono text-[10px]">{r.lead_id.slice(0, 8)}</td>
                        <td className="p-2">
                          {new Date(r.became_interested_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        </td>
                        <td className="p-2">{r.event_seller_name || "—"}</td>
                        <td className="p-2">{r.current_seller_name || "—"}</td>
                        <td className="p-2">{r.current_status}</td>
                        <td className="p-2">{r.origem || "—"}</td>
                        <td className="p-2">{r.divergence_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Diagnóstico somente leitura. Nenhuma correção retroativa é aplicada automaticamente.
              </p>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
