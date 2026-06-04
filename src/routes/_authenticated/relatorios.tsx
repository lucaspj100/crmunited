import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUSES, LOST_REASONS, labelFor, statusColor } from "@/lib/constants";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: RelatoriosPage });

type Lead = { id: string; status: string; company: string | null; owner_id: string; lost_reason: string | null; created_at: string };

async function fetchData() {
  const [leadsR, profilesR] = await Promise.all([
    supabase.from("leads").select("id,status,company,owner_id,lost_reason,created_at").limit(5000),
    supabase.from("profiles").select("id,full_name,email").limit(2000),
  ]);
  return { leads: (leadsR.data ?? []) as Lead[], profiles: (profilesR.data ?? []) as any[] };
}

function group<T>(arr: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const x of arr) {
    const k = key(x) || "—";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

function RelatoriosPage() {
  const { data, isLoading } = useQuery({ queryKey: ["relatorios"], queryFn: fetchData });
  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;
  const profileMap = new Map(data.profiles.map((p) => [p.id, p.full_name || p.email || "—"]));

  const byVendedor = group(data.leads, (l) => profileMap.get(l.owner_id) ?? "—");
  const byEmpresa = group(data.leads.filter((l) => l.company), (l) => l.company!);
  const byStatus = group(data.leads, (l) => labelFor(LEAD_STATUSES, l.status));
  const byReason = group(data.leads.filter((l) => l.lost_reason), (l) => labelFor(LOST_REASONS, l.lost_reason!));

  const Block = ({ title, rows, badgeColor }: { title: string; rows: [string, number][]; badgeColor?: (k: string) => string }) => (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
        <div className="space-y-2">
          {rows.slice(0, 15).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="truncate">{k}</span>
              <Badge variant="outline" className={badgeColor?.(k)}>{v}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" />Relatórios</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada por vendedor, empresa, status e motivos</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Leads por vendedor" rows={byVendedor} />
        <Block title="Leads por status" rows={byStatus} badgeColor={(k) => {
          const s = LEAD_STATUSES.find((x) => x.label === k); return s ? statusColor(s.value) : "";
        }} />
        <Block title="Leads por empresa" rows={byEmpresa} />
        <Block title="Motivos de perda" rows={byReason} />
      </div>
    </div>
  );
}
