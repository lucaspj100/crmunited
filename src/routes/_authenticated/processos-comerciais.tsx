import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fetchProductivity, periodRange, todayIso, type Period } from "@/lib/productivity";
import { ProductivityTable } from "@/components/processos/ProductivityTable";
import { PeriodFilter, type Seller } from "@/components/processos/PeriodFilter";
import { CheckoutHistoryPanel } from "@/components/processos/CheckoutHistoryPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/processos-comerciais")({
  component: ProcessosComerciais,
});

function ProcessosComerciais() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");

  const [period, setPeriod] = useState<Period>("hoje");
  const [customStart, setCustomStart] = useState(todayIso());
  const [customEnd, setCustomEnd] = useState(todayIso());
  const [vendedorId, setVendedorId] = useState<string | null>(null);

  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const { data: sellers = [] } = useQuery({
    queryKey: ["processos_sellers"],
    queryFn: async () => {
      const { data: ur } = await supabase.from("user_roles").select("user_id").eq("role", "vendedor");
      const ids = (ur ?? []).map((r) => r.user_id);
      if (!ids.length) return [] as Seller[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []) as Seller[];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["productivity", range.start, range.end, vendedorId],
    queryFn: () => fetchProductivity({ start: range.start, end: range.end, vendedorId }),
  });

  if (!isAdmin) {
    return <p className="text-muted-foreground">Acesso restrito.</p>;
  }

  const total = sellers.length;
  const doneToday = rows.filter((r) => r.checkout_today_done).length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Processos Comerciais</h1>
        <p className="text-sm text-muted-foreground">Produtividade dos vendedores puxada diretamente do CRM.</p>
      </header>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Checkout do dia</div>
            <div className="text-2xl font-bold">{doneToday} / {total} vendedores</div>
          </div>
          <div className="text-sm text-muted-foreground">{period === "hoje" ? "Status atualizado em tempo real" : ""}</div>
        </CardContent>
      </Card>

      <PeriodFilter
        period={period} setPeriod={setPeriod}
        customStart={customStart} setCustomStart={setCustomStart}
        customEnd={customEnd} setCustomEnd={setCustomEnd}
        sellers={sellers} vendedorId={vendedorId} setVendedorId={setVendedorId}
      />

      <Card>
        <CardHeader><CardTitle>Produtividade por vendedor</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-muted-foreground">Carregando…</p> : <ProductivityTable rows={rows} showCheckout />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico de checkouts</CardTitle></CardHeader>
        <CardContent>
          <CheckoutHistoryPanel sellers={sellers} vendedorId={vendedorId} start={range.start} end={range.end} />
        </CardContent>
      </Card>
    </div>
  );
}
