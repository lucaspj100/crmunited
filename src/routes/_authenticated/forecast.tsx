import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fetchAll, fetchFunnelLeads, FUNNEL_LEADS_KEY, ACTIVE_STATUSES } from "@/lib/fetch-all";
import { LEAD_STATUSES, labelFor, TASK_TYPES } from "@/lib/constants";
import { useTeams } from "@/lib/teams";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadDetailsDialog } from "@/components/LeadDetailsDialog";
import { QuickTaskDialog } from "@/components/QuickTaskDialog";
import { WhatsappAction } from "@/components/WhatsappAction";
import { AlertTriangle, ChevronLeft, ChevronRight, CalendarPlus, Kanban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/forecast")({
  head: () => ({
    meta: [
      { title: "Forecast | CRM United" },
      { name: "description", content: "Forecast comercial por vendedor para reuniões de fechamento." },
      { property: "og:title", content: "Forecast | CRM United" },
      { property: "og:description", content: "Forecast comercial por vendedor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForecastPage,
});

const STALE_DAYS = 7;
type Lead = {
  id: string; name: string; phone: string | null; status: string; owner_id: string;
  created_at: string; updated_at: string | null; last_contact_at: string | null;
};
type Profile = { id: string; full_name: string | null; email: string | null; team_id: string | null };
type Task = { lead_id: string; type: string; due_date: string; due_time: string | null };

const fmt = (v: string | null | undefined) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : "—");
const daysSince = (v: string | null | undefined) =>
  v ? Math.floor((Date.now() - new Date(v).getTime()) / 86400000) : null;

function ForecastPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const qc = useQueryClient();
  const { data: teams = [] } = useTeams();
  const [seller, setSeller] = useState<string>("");
  const [team, setTeam] = useState("all");
  const [stage, setStage] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [taskLead, setTaskLead] = useState<Lead | null>(null);

  const { data: leads = [] } = useQuery({
    queryKey: FUNNEL_LEADS_KEY, queryFn: async () => (await fetchFunnelLeads()) as Lead[], enabled: isAdmin,
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["forecast-profiles"], enabled: isAdmin,
    queryFn: async () => ((await supabase.from("profiles").select("id,full_name,email,team_id")).data ?? []) as Profile[],
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["funil-next-tasks-all"], enabled: isAdmin,
    queryFn: async () => {
      const { data } = await fetchAll<Task>(() => supabase.from("tasks").select("lead_id,type,due_date,due_time").eq("status", "pendente"));
      return data.sort((a, b) => (a.due_date + (a.due_time ?? "")).localeCompare(b.due_date + (b.due_time ?? "")));
    },
  });

  const nextByLead = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) if (!m.has(t.lead_id)) m.set(t.lead_id, t);
    return m;
  }, [tasks]);

  const active = useMemo(() => leads.filter((l) => (ACTIVE_STATUSES as readonly string[]).includes(l.status)), [leads]);

  const sellers = useMemo(() => {
    const ids = new Set(active.map((l) => l.owner_id));
    return profiles
      .filter((p) => ids.has(p.id) && (team === "all" || p.team_id === team))
      .map((p) => ({ id: p.id, name: p.full_name || p.email || "Vendedor", count: active.filter((l) => l.owner_id === p.id).length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [active, profiles, team]);

  const current = sellers.find((s) => s.id === seller) ?? sellers[0];
  const idx = current ? sellers.indexOf(current) : -1;

  const visible = useMemo(() => {
    if (!current) return [];
    const term = q.trim().toLowerCase();
    return active.filter((l) => {
      if (l.owner_id !== current.id) return false;
      if (stage !== "all" && l.status !== stage) return false;
      if (term && !l.name.toLowerCase().includes(term)) return false;
      const mov = (l.updated_at ?? l.created_at).slice(0, 10);
      if (from && mov < from) return false;
      if (to && mov > to) return false;
      return true;
    });
  }, [active, current, stage, q, from, to]);

  if (!isAdmin) return <p className="p-6 text-sm text-muted-foreground">Área exclusiva do ADM.</p>;

  const columns = LEAD_STATUSES.filter((s) => (ACTIVE_STATUSES as readonly string[]).includes(s.value));

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Forecast</h1>

      <Card className="p-3 flex flex-wrap gap-2 items-end">
        <Select value={team} onValueChange={(v) => { setTeam(v); setSeller(""); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Equipe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as equipes</SelectItem>
            {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={current?.id ?? ""} onValueChange={setSeller}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.count})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as etapas</SelectItem>
            {columns.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="Movimentado de" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="Movimentado até" />
        <Input placeholder="Buscar lead pelo nome" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
      </Card>

      {current && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={idx <= 0} onClick={() => setSeller(sellers[idx - 1].id)}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <div className="text-center">
            <div className="text-xl font-semibold">{current.name}</div>
            <div className="text-xs text-muted-foreground">{visible.length} leads ativos exibidos · {idx + 1} de {sellers.length}</div>
          </div>
          <Button variant="outline" size="sm" disabled={idx >= sellers.length - 1} onClick={() => setSeller(sellers[idx + 1].id)}>
            Próximo <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {columns.filter((c) => stage === "all" || c.value === stage).map((col) => {
          const items = visible.filter((l) => l.status === col.value);
          return (
            <div key={col.value} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{col.label}</h2>
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              {items.map((l) => {
                const next = nextByLead.get(l.id);
                const lastAction = l.last_contact_at ?? l.updated_at ?? l.created_at;
                const idle = daysSince(lastAction) ?? 0;
                return (
                  <Card key={l.id} className="p-3 space-y-1 cursor-pointer hover:bg-muted/40" onClick={() => setDetailsId(l.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{l.name}</span>
                      {idle >= STALE_DAYS && (
                        <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{idle}d sem ação</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">Última movimentação: {fmt(l.updated_at ?? l.created_at)}</div>
                    <div className="text-xs text-muted-foreground">Último contato: {fmt(l.last_contact_at)}</div>
                    <div className="text-xs text-muted-foreground">
                      Próximo follow-up: {next ? `${fmt(next.due_date)} · ${labelFor(TASK_TYPES, next.type)}` : "—"}
                    </div>
                    <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                      <WhatsappAction phone={l.phone} size="icon" />
                      <Button size="icon" variant="outline" title="Criar follow-up" onClick={() => setTaskLead(l)}>
                        <CalendarPlus className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" title="Mover etapa no Funil" asChild>
                        <Link to="/funil" search={{ leadId: l.id }}><Kanban className="h-4 w-4" /></Link>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        })}
      </div>

      <LeadDetailsDialog leadId={detailsId} onClose={() => setDetailsId(null)} />
      {taskLead && (
        <QuickTaskDialog leadId={taskLead.id} ownerId={taskLead.owner_id} leadName={taskLead.name}
          onClose={() => setTaskLead(null)} onSaved={() => qc.invalidateQueries()} />
      )}
    </div>
  );
}
