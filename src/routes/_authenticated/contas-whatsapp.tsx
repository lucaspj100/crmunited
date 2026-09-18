import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone } from "lucide-react";
import { isRecentlyActive, type WhatsappAccountRow } from "@/lib/whatsapp-accounts";

export const Route = createFileRoute("/_authenticated/contas-whatsapp")({
  component: WhatsappAccountsPage,
});

const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function WhatsappAccountsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");

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

  const rows = data ?? [];

  return (
    <div className="space-y-6">
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

      <Card className="p-0 overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            Nenhuma conta vinculada ainda. Ao entrar na extensão do WhatsApp com seu acesso do CRM,
            a conta aparece aqui automaticamente.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                {isAdmin && <th className="px-4 py-2 font-medium">Responsável</th>}
                <th className="px-4 py-2 font-medium">Número</th>
                <th className="px-4 py-2 font-medium">Nome da conta</th>
                <th className="px-4 py-2 font-medium">Situação</th>
                <th className="px-4 py-2 font-medium">Última atividade</th>
                <th className="px-4 py-2 font-medium">Vinculada em</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const online = r.status === "active" && isRecentlyActive(r.last_seen_at);
                return (
                  <tr key={r.id} className="border-t">
                    {isAdmin && <td className="px-4 py-2">{r.ownerName ?? "—"}</td>}
                    <td className="px-4 py-2 font-medium">{r.phone}</td>
                    <td className="px-4 py-2">{r.display_name ?? "—"}</td>
                    <td className="px-4 py-2">
                      {online ? (
                        <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Conectada</Badge>
                      ) : r.status === "active" ? (
                        <Badge variant="secondary">Ativa (sem atividade recente)</Badge>
                      ) : (
                        <Badge variant="outline">Inativa</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{fmt(r.last_seen_at)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmt(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
