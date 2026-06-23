import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Seller = { id: string; full_name: string | null; email: string };

export function DashboardPanel({ sellers }: { sellers: Seller[] }) {
  const { data } = useQuery({
    queryKey: ["prospect_dashboard"],
    queryFn: async () => {
      const [contacts, attempts] = await Promise.all([
        supabase.from("prospect_contacts").select("id, status_prospeccao, quantidade_tentativas, telefone_invalido, nao_chamar, convertido_em_lead, origem, ddd, vendedor_responsavel_id"),
        supabase.from("prospect_attempts").select("id, tipo_acao, vendedor_id"),
      ]);
      return { contacts: contacts.data ?? [], attempts: attempts.data ?? [] };
    },
  });

  if (!data) return <p className="text-muted-foreground">Carregando…</p>;

  const c = data.contacts;
  const a = data.attempts;
  const total = c.length;
  const trabalhados = c.filter((x) => x.quantidade_tentativas > 0).length;
  const interessados = c.filter((x) => x.status_prospeccao === "Interessado").length;
  const convertidos = c.filter((x) => x.convertido_em_lead).length;
  const invalidos = c.filter((x) => x.telefone_invalido).length;
  const naoChamar = c.filter((x) => x.nao_chamar).length;
  const ligacoes = a.filter((x) => x.tipo_acao === "ligacao").length;
  const whats = a.filter((x) => x.tipo_acao === "whatsapp").length;
  const disponiveis = c.filter((x) => !x.convertido_em_lead && !x.nao_chamar && !x.telefone_invalido && !["Sem interesse", "Convertido em lead", "Não chamar"].includes(x.status_prospeccao)).length;

  const taxaFrioInteressado = trabalhados ? ((interessados / trabalhados) * 100).toFixed(1) : "0";
  const taxaInteressadoLead = interessados ? ((convertidos / interessados) * 100).toFixed(1) : "0";

  const bySeller = sellers.map((s) => {
    const mine = c.filter((x) => x.vendedor_responsavel_id === s.id);
    const myAtt = a.filter((x) => x.vendedor_id === s.id);
    const att = mine.length ? ((mine.filter((x) => x.quantidade_tentativas > 0).length / mine.length) * 100).toFixed(0) : "0";
    const conv = mine.length ? ((mine.filter((x) => x.convertido_em_lead).length / mine.length) * 100).toFixed(1) : "0";
    return {
      id: s.id, name: s.full_name || s.email,
      atribuidos: mine.length,
      ligacoes: myAtt.filter((x) => x.tipo_acao === "ligacao").length,
      whats: myAtt.filter((x) => x.tipo_acao === "whatsapp").length,
      interessados: mine.filter((x) => x.status_prospeccao === "Interessado").length,
      convertidos: mine.filter((x) => x.convertido_em_lead).length,
      tx_atend: att + "%",
      tx_conv: conv + "%",
    };
  });

  const groupBy = (key: "origem" | "ddd") => {
    const map = new Map<string, { total: number; interessados: number; convertidos: number; tent: number }>();
    c.forEach((x) => {
      const k = (x[key] as string | null) || "—";
      const g = map.get(k) ?? { total: 0, interessados: 0, convertidos: 0, tent: 0 };
      g.total++;
      if (x.status_prospeccao === "Interessado") g.interessados++;
      if (x.convertido_em_lead) g.convertidos++;
      g.tent += x.quantidade_tentativas;
      map.set(k, g);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Importados" value={total} />
        <Stat label="Disponíveis" value={disponiveis} />
        <Stat label="Trabalhados" value={trabalhados} />
        <Stat label="Convertidos" value={convertidos} />
        <Stat label="Interessados" value={interessados} />
        <Stat label="Ligações" value={ligacoes} />
        <Stat label="WhatsApps" value={whats} />
        <Stat label="Inválidos / Não chamar" value={`${invalidos} / ${naoChamar}`} />
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
        <GroupTable title="Por origem" rows={groupBy("origem")} />
        <GroupTable title="Por DDD" rows={groupBy("ddd")} />
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

function GroupTable({ title, rows }: { title: string; rows: [string, { total: number; interessados: number; convertidos: number; tent: number }][] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-2">{title.split(" ")[1]}</th><th className="p-2">Contatos</th><th className="p-2">Tentativas</th><th className="p-2">Interessados</th><th className="p-2">Convertidos</th><th className="p-2">Tx.</th></tr></thead>
          <tbody>
            {rows.slice(0, 30).map(([k, v]) => (
              <tr key={k} className="border-t">
                <td className="p-2">{k}</td><td className="p-2">{v.total}</td><td className="p-2">{v.tent}</td><td className="p-2">{v.interessados}</td><td className="p-2">{v.convertidos}</td>
                <td className="p-2">{v.total ? ((v.convertidos / v.total) * 100).toFixed(1) : "0"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
