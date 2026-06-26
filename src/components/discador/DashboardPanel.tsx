import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Seller = { id: string; full_name: string | null; email: string };

type DashboardData = {
  totals: {
    total: number;
    trabalhados: number;
    interessados: number;
    convertidos: number;
    invalidos: number;
    nao_chamar: number;
    disponiveis: number;
  };
  attempts: { ligacoes: number; whats: number };
  by_seller: { id: string; atribuidos: number; trabalhados: number; interessados: number; convertidos: number }[];
  by_seller_att: { id: string; ligacoes: number; whats: number }[];
  by_origem: { k: string; total: number; tent: number; interessados: number; convertidos: number }[];
  by_ddd: { k: string; total: number; tent: number; interessados: number; convertidos: number }[];
};

export function DashboardPanel({ sellers }: { sellers: Seller[] }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["prospect_dashboard"],
    queryFn: async (): Promise<DashboardData> => {
      const { data, error } = await supabase.rpc("prospect_dashboard" as never);
      if (error) throw error;
      return data as unknown as DashboardData;
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando…</p>;
  if (error || !data) return <p className="text-destructive">Erro ao carregar painel.</p>;

  const t = data.totals;
  const a = data.attempts;
  const taxaFrioInteressado = t.trabalhados ? ((t.interessados / t.trabalhados) * 100).toFixed(1) : "0";
  const taxaInteressadoLead = t.interessados ? ((t.convertidos / t.interessados) * 100).toFixed(1) : "0";

  const sellerMap = new Map(data.by_seller.map((s) => [s.id, s]));
  const sellerAttMap = new Map(data.by_seller_att.map((s) => [s.id, s]));

  const bySeller = sellers.map((s) => {
    const row = sellerMap.get(s.id);
    const att = sellerAttMap.get(s.id);
    const atribuidos = row?.atribuidos ?? 0;
    const trabalhados = row?.trabalhados ?? 0;
    const interessados = row?.interessados ?? 0;
    const convertidos = row?.convertidos ?? 0;
    const txAtend = atribuidos ? ((trabalhados / atribuidos) * 100).toFixed(0) : "0";
    const txConv = atribuidos ? ((convertidos / atribuidos) * 100).toFixed(1) : "0";
    return {
      id: s.id,
      name: s.full_name || s.email,
      atribuidos,
      ligacoes: att?.ligacoes ?? 0,
      whats: att?.whats ?? 0,
      interessados,
      convertidos,
      tx_atend: txAtend + "%",
      tx_conv: txConv + "%",
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Importados" value={t.total} />
        <Stat label="Disponíveis" value={t.disponiveis} />
        <Stat label="Trabalhados" value={t.trabalhados} />
        <Stat label="Convertidos" value={t.convertidos} />
        <Stat label="Interessados" value={t.interessados} />
        <Stat label="Ligações" value={a.ligacoes} />
        <Stat label="WhatsApps" value={a.whats} />
        <Stat label="Inválidos / Não chamar" value={`${t.invalidos} / ${t.nao_chamar}`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Frio → Interessado</div><div className="text-2xl font-bold">{taxaFrioInteressado}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Interessado → Lead</div><div className="text-2xl font-bold">{taxaInteressadoLead}%</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Por vendedor</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left"><tr>
              <th className="p-2">Vendedor</th><th className="p-2">Atribuídos</th><th className="p-2">Ligações</th><th className="p-2">WhatsApps</th><th className="p-2">Interessados</th><th className="p-2">Convertidos</th><th className="p-2">Tx. atend.</th><th className="p-2">Tx. conv.</th>
            </tr></thead>
            <tbody>
              {bySeller.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2">{s.name}</td><td className="p-2">{s.atribuidos}</td><td className="p-2">{s.ligacoes}</td><td className="p-2">{s.whats}</td><td className="p-2">{s.interessados}</td><td className="p-2">{s.convertidos}</td><td className="p-2">{s.tx_atend}</td><td className="p-2">{s.tx_conv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <GroupTable title="Por origem" rows={data.by_origem} />
        <GroupTable title="Por DDD" rows={data.by_ddd} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent></Card>
  );
}

function GroupTable({ title, rows }: { title: string; rows: { k: string; total: number; tent: number; interessados: number; convertidos: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-2">{title.split(" ")[1]}</th><th className="p-2">Contatos</th><th className="p-2">Tentativas</th><th className="p-2">Interessados</th><th className="p-2">Convertidos</th><th className="p-2">Tx.</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className="border-t">
                <td className="p-2">{r.k}</td><td className="p-2">{r.total}</td><td className="p-2">{r.tent}</td><td className="p-2">{r.interessados}</td><td className="p-2">{r.convertidos}</td>
                <td className="p-2">{r.total ? ((r.convertidos / r.total) * 100).toFixed(1) : "0"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
