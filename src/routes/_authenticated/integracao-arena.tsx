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

type OutboundEvent = {
  id: string;
  event_type: string;
  crm_lead_id: string | null;
  status: string;
  http_status: number | null;
  error_message: string | null;
  attempts: number | null;
  created_at: string;
  sent_at: string | null;
};

const EVENT_TYPES = [
  "crm_interview_scheduled",
  "crm_interview_done",
  "crm_interview_no_show",
  "crm_interview_rescheduled",
  "crm_enrollment_created",
  "crm_enrollment_cancelled",
  "crm_lost_after_interview",
] as const;


const STATUS_OPTIONS = ["all", "pending", "sent", "failed", "skipped"] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sent: { label: "Enviado", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
    failed: { label: "Falhou", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
    pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
    skipped: { label: "Ignorado", cls: "bg-muted text-muted-foreground border-border" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${m.cls}`}>{m.label}</span>;
}

function FailedEventsPanel() {
  const qc = useQueryClient();
  const resend = useServerFn(resendArenaEvent);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [leadIdFilter, setLeadIdFilter] = useState<string>("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["arena-events", statusFilter, typeFilter, leadIdFilter.trim()],
    queryFn: async (): Promise<OutboundEvent[]> => {
      let q = supabase
        .from("crm_outbound_events")
        .select("id, event_type, crm_lead_id, status, http_status, error_message, attempts, created_at, sent_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (typeFilter !== "all") q = q.eq("event_type", typeFilter);
      if (leadIdFilter.trim()) q = q.eq("crm_lead_id", leadIdFilter.trim());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OutboundEvent[];
    },
  });

  const counts = useMemo(() => {
    const c = { total: data?.length ?? 0, sent: 0, failed: 0, pending: 0, skipped: 0 };
    (data ?? []).forEach((e) => {
      if (e.status === "sent") c.sent++;
      else if (e.status === "failed") c.failed++;
      else if (e.status === "pending") c.pending++;
      else if (e.status === "skipped") c.skipped++;
    });
    return c;
  }, [data]);

  const onResend = async (id: string) => {
    setBusyId(id);
    try {
      const res = (await resend({ data: { eventId: id } })) as { ok: boolean; error?: string | null };
      if (res.ok) toast.success("Evento reenviado com sucesso");
      else toast.error(`Falha ao reenviar: ${res.error ?? "erro desconhecido"}`);
      qc.invalidateQueries({ queryKey: ["arena-events"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao reenviar evento");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Eventos enviados para a Arena</h2>
          <Badge variant="secondary">{counts.total}</Badge>
          {counts.failed > 0 && <Badge variant="destructive">{counts.failed} falhas</Badge>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="min-w-[150px]">
          <label className="text-[11px] text-muted-foreground">Status</label>
          <select
            className="block w-full h-9 rounded-md border bg-background px-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "Todos" : s}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px]">
          <label className="text-[11px] text-muted-foreground">Tipo de evento</label>
          <select
            className="block w-full h-9 rounded-md border bg-background px-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[260px]">
          <label className="text-[11px] text-muted-foreground">Lead ID</label>
          <Input
            value={leadIdFilter}
            onChange={(e) => setLeadIdFilter(e.target.value)}
            placeholder="UUID exato do lead…"
            className="h-9"
          />
        </div>
        {(statusFilter !== "all" || typeFilter !== "all" || leadIdFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setLeadIdFilter(""); }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-muted-foreground text-sm">Carregando…</div>
      ) : !data || data.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground text-sm">
          Nenhum evento encontrado para os filtros atuais.
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead>Tent.</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead>Enviado</TableHead>
                <TableHead className="w-[120px]">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs font-mono">{e.event_type}</TableCell>
                  <TableCell className="text-[11px] font-mono break-all max-w-[180px]">
                    <div className="flex items-center gap-1">
                      <span>{e.crm_lead_id ?? "—"}</span>
                      {e.crm_lead_id && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => { navigator.clipboard.writeText(e.crm_lead_id!); toast.success("ID copiado"); }}
                          title="Copiar ID"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell>{e.http_status ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-[240px] break-words text-destructive">
                    {e.error_message ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">{e.attempts ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {e.sent_at ? new Date(e.sent_at).toLocaleString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>
                    {e.status === "failed" || e.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onResend(e.id)}
                        disabled={busyId === e.id}
                        className="gap-1.5"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${busyId === e.id ? "animate-spin" : ""}`} />
                        Reenviar
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
