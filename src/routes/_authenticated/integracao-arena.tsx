import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Check, Link2, Search, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { resendArenaEvent } from "@/lib/arena-webhook.functions";

export const Route = createFileRoute("/_authenticated/integracao-arena")({ component: IntegracaoArena });

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

async function fetchVendedores(): Promise<Row[]> {
  const [profR, rolesR] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  const profiles = (profR.data ?? []) as { id: string; full_name: string | null; email: string | null }[];
  const roleMap = new Map<string, string>();
  for (const r of (rolesR.data ?? []) as { user_id: string; role: string }[]) {
    // Prioriza admin > franqueado > vendedor caso o usuário tenha mais de um papel
    const cur = roleMap.get(r.user_id);
    const rank = (x: string) => (x === "admin" ? 3 : x === "franqueado" ? 2 : 1);
    if (!cur || rank(r.role) > rank(cur)) roleMap.set(r.user_id, r.role);
  }
  return profiles.map((p) => ({ ...p, role: roleMap.get(p.id) ?? null }));
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(label ? `${label} copiado` : "ID copiado");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={onCopy} className="gap-1.5">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </Button>
  );
}

function IntegracaoArena() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["integracao-arena-vendedores"],
    queryFn: fetchVendedores,
    enabled: isAdmin,
  });

  const filtered = useMemo(() => {
    const all = data ?? [];
    if (!q.trim()) return all;
    const t = q.trim().toLowerCase();
    return all.filter(
      (r) =>
        (r.full_name ?? "").toLowerCase().includes(t) ||
        (r.email ?? "").toLowerCase().includes(t) ||
        r.id.toLowerCase().includes(t),
    );
  }, [data, q]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apenas administradores podem visualizar os IDs de integração.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" />
          IDs dos vendedores para integração com Arena
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Copie o <strong>user_id</strong> de cada vendedor e cole na Arena em{" "}
          <code className="px-1.5 py-0.5 rounded bg-muted text-xs">/integracoes</code> no campo{" "}
          <code className="px-1.5 py-0.5 rounded bg-muted text-xs">crm_user_id</code>. Este é o mesmo ID
          usado como <code className="px-1.5 py-0.5 rounded bg-muted text-xs">owner_id</code> dos leads no CRM.
        </p>
      </div>

      <Card className="p-3 md:p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, email ou ID…"
              className="pl-8"
            />
          </div>
          <Badge variant="secondary">{filtered.length} usuário(s)</Badge>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-muted-foreground text-sm">Carregando…</div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>user_id (crm_user_id)</TableHead>
                    <TableHead className="w-[110px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                      <TableCell>
                        {r.role ? (
                          <Badge variant={r.role === "admin" ? "default" : "secondary"} className="capitalize">
                            {r.role}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs font-mono break-all">{r.id}</code>
                      </TableCell>
                      <TableCell>
                        <CopyButton value={r.id} label={r.full_name || "ID"} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhum usuário encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-2">
              {filtered.map((r) => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{r.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.email || "—"}</div>
                      {r.role && (
                        <Badge variant="secondary" className="capitalize mt-1 text-[10px]">{r.role}</Badge>
                      )}
                    </div>
                    <CopyButton value={r.id} label={r.full_name || "ID"} />
                  </div>
                  <code className="block mt-2 text-[11px] font-mono break-all text-muted-foreground">
                    {r.id}
                  </code>
                </Card>
              ))}
              {filtered.length === 0 && (
                <div className="text-center text-muted-foreground py-8 text-sm">Nenhum usuário encontrado.</div>
              )}
            </div>
          </>
        )}
      </Card>

      <FailedEventsPanel />

      <Card className="p-4 bg-muted/40">
        <h2 className="text-sm font-semibold mb-1">Como usar</h2>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Clique em <strong>Copiar</strong> na linha do vendedor desejado.</li>
          <li>Acesse a Arena em <code className="px-1 py-0.5 rounded bg-background">/integracoes</code>.</li>
          <li>Cole o valor no campo <code className="px-1 py-0.5 rounded bg-background">crm_user_id</code> do vendedor correspondente.</li>
          <li>Salve a configuração na Arena. Os eventos do CRM passarão a ser vinculados a este vendedor.</li>
        </ol>
        <div className="mt-3">
          <Link to="/painel-adm" className="text-xs text-primary hover:underline">← Voltar ao Painel ADM</Link>
        </div>
      </Card>
    </div>
  );
}
