import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Smartphone } from "lucide-react";
import { type WhatsappAccountRow } from "@/lib/whatsapp-accounts";

export const Route = createFileRoute("/_authenticated/contas-whatsapp")({
  head: () => ({
    meta: [
      { title: "Contas WhatsApp | CRM United" },
      { name: "description", content: "Contas de WhatsApp vinculadas pela extensão United." },
    ],
  }),
  component: WhatsappAccountsPage,
});

const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge>Ativa</Badge>;
  if (status === "inactive") return <Badge variant="outline">Inativa</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

const ALL = "__all__";

function WhatsappAccountsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const [userFilter, setUserFilter] = useState<string>(ALL);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-accounts", isAdmin],
    queryFn: async () => {
      const { data: accounts, error } = await supabase
        .from("whatsapp_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (accounts ?? []) as WhatsappAccountRow[];

      let names = new Map<string, string>();
      if (isAdmin && rows.length) {
        const ids = [...new Set(rows.map((r) => r.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        names = new Map(
          (profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]),
        );
      }
      return rows.map((r) => ({ ...r, ownerName: names.get(r.user_id) ?? null }));
    },
  });

  const allRows = data ?? [];

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    allRows.forEach((r) => m.set(r.user_id, r.ownerName ?? r.user_id.slice(0, 8)));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [allRows]);

  const rows =
    isAdmin && userFilter !== ALL ? allRows.filter((r) => r.user_id === userFilter) : allRows;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-primary" />
            Contas WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Todas as contas de WhatsApp vinculadas pela extensão aos usuários do CRM."
              : "Contas de WhatsApp vinculadas ao seu usuário pela extensão."}
          </p>
        </div>
        {isAdmin && allRows.length > 0 && (
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filtrar por usuário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os usuários</SelectItem>
              {owners.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card className="p-0 overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Nenhuma conta WhatsApp vinculada ainda.</p>
            <p>
              Quando você estiver conectado à extensão United e ela identificar o número do WhatsApp
              Web aberto, a conta será vinculada automaticamente ao seu usuário e aparecerá aqui.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Conta</th>
                {isAdmin && <th className="px-4 py-2 font-medium">Responsável</th>}
                <th className="px-4 py-2 font-medium">Situação</th>
                <th className="px-4 py-2 font-medium">Última atividade</th>
                <th className="px-4 py-2 font-medium">Vinculada em</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">
                    {r.display_name ? (
                      <>
                        <div className="font-semibold">{r.display_name}</div>
                        <div className="text-muted-foreground">{r.phone}</div>
                      </>
                    ) : (
                      <div className="font-medium">{r.phone}</div>
                    )}
                  </td>
                  {isAdmin && <td className="px-4 py-2">{r.ownerName ?? "—"}</td>}
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt(r.last_seen_at)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
