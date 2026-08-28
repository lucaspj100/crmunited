import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STATUSES, LOST_REASONS, labelFor, statusColor } from "@/lib/constants";
import { BarChart3 } from "lucide-react";
import { useTeams, primaryTeamId, ALL_TEAMS } from "@/lib/teams";
import { LeadsFoundTable } from "@/components/relatorios/LeadsFoundTable";
import {
  QUICK_FILTERS,
  applyQuickFilter,
  referenceDate,
  type DateBasis,
  type QuickFilter,
  type ReportLead,
} from "@/lib/report-leads";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: RelatoriosPage });

type Lead = ReportLead;
type Task = { id: string; owner_id: string; status: string; due_date: string; is_rescue: boolean };

const LEAD_COLS =
  "id,name,phone,company,company_name,profession,source,status,owner_id,lost_reason,lost_type,lost_at,observation,interview_notes,interview_date,interview_done_date,enrollment_date,next_followup_at,last_contact_at,created_at,updated_at";

async function fetchData() {
  const [leadsR, tasksR, profilesR, eventsR] = await Promise.all([
    supabase.from("leads").select(LEAD_COLS).limit(10000),
    supabase.from("tasks").select("id,owner_id,status,due_date,is_rescue").limit(10000),
    supabase.from("profiles").select("id,full_name,email,team_id").limit(2000),
    supabase
      .from("lead_events")
      .select("lead_id,created_at")
      .eq("event_type", "interview_done")
      .order("created_at", { ascending: true })
      .limit(10000),
  ]);
  const doneEvent = new Map<string, string>();
  for (const e of (eventsR.data ?? []) as { lead_id: string; created_at: string }[]) {
    if (!doneEvent.has(e.lead_id)) doneEvent.set(e.lead_id, e.created_at);
  }
  return {
    leads: (leadsR.data ?? []) as unknown as Lead[],
    tasks: (tasksR.data ?? []) as Task[],
    profiles: (profilesR.data ?? []) as any[],
    doneEvent,
  };
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
  const [vendor, setVendor] = useState("all");
  const { data: teams = [] } = useTeams();
  const [teamSel, setTeamSel] = useState<string>("");
  const effectiveTeam = teamSel || primaryTeamId(teams) || ALL_TEAMS;
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [reason, setReason] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [basis, setBasis] = useState<DateBasis>("stage");
  const [quick, setQuick] = useState<QuickFilter>("none");

  const profileMap = useMemo(() => new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name || p.email || "—"])), [data]);

  const teamOwnerIds = useMemo(() => {
    if (effectiveTeam === ALL_TEAMS) return null;
    return new Set((data?.profiles ?? []).filter((p) => p.team_id === effectiveTeam).map((p) => p.id));
  }, [data, effectiveTeam]);

  const filteredLeads = useMemo(() => {
    if (!data) return [];
    const today = new Date().toISOString().slice(0, 10);
    const base = data.leads.filter((l) => {
      if (teamOwnerIds && !teamOwnerIds.has(l.owner_id)) return false;
      if (vendor !== "all" && l.owner_id !== vendor) return false;
      if (status !== "all" && l.status !== status) return false;
      if (source !== "all" && (l.source || "—") !== source) return false;
      if (reason !== "all" && l.lost_reason !== reason) return false;
      const ref = referenceDate(l, basis, data.doneEvent) ?? l.created_at.slice(0, 10);
      if (from && ref < from) return false;
      if (to && ref > to) return false;
      return true;
    });
    return applyQuickFilter(base, quick, data.doneEvent, today);
  }, [data, teamOwnerIds, vendor, status, source, reason, from, to, basis, quick]);


  const filteredTasks = useMemo(() => {
    if (!data) return [];
    return data.tasks.filter((t) => {
      if (teamOwnerIds && !teamOwnerIds.has(t.owner_id)) return false;
      if (vendor !== "all" && t.owner_id !== vendor) return false;
      if (from && t.due_date < from) return false;
      if (to && t.due_date > to) return false;
      return true;
    });
  }, [data, teamOwnerIds, vendor, from, to]);

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  const todayStr = new Date().toISOString().slice(0, 10);
  const byVendedor = group(filteredLeads, (l) => profileMap.get(l.owner_id) ?? "—");
  const byEmpresa = group(filteredLeads.filter((l) => l.company), (l) => l.company!);
  const byStatusRows = group(filteredLeads, (l) => labelFor(LEAD_STATUSES, l.status));
  const byReason = group(filteredLeads.filter((l) => l.lost_reason), (l) => labelFor(LOST_REASONS, l.lost_reason!));
  const bySource = group(filteredLeads, (l) => l.source || "—");

  const tarefasConcluidas = group(filteredTasks.filter((t) => t.status === "concluida"), (t) => profileMap.get(t.owner_id) ?? "—");
  const tarefasAtrasadas = group(filteredTasks.filter((t) => t.status === "pendente" && t.due_date < todayStr), (t) => profileMap.get(t.owner_id) ?? "—");
  const resgatesPendentes = filteredTasks.filter((t) => t.is_rescue && t.status === "pendente").length;
  const resgatesRealizados = filteredTasks.filter((t) => t.is_rescue && t.status === "concluida").length;

  // Conversão por etapa
  const cnt = (s: string) => filteredLeads.filter((l) => l.status === s).length;
  const novos = cnt("novo"), interes = cnt("interessado"), em = cnt("entrevista_marcada"), er = cnt("entrevista_realizada"), mat = cnt("matricula"), perd = cnt("perdido");
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const totalEntradas = novos + interes + em + er + mat + perd;
  const conversionRows: [string, number][] = [
    ["Novo → Interessado", pct(interes + em + er + mat, totalEntradas)],
    ["Interessado → Entrevista marcada", pct(em + er + mat, interes + em + er + mat + perd)],
    ["Entrev. marcada → realizada", pct(er + mat, em + er + mat)],
    ["Entrev. realizada → Matrícula", pct(mat, er + mat)],
  ];

  const sourceOptions = Array.from(new Set(data.leads.map((l) => l.source || "—")));

  const Block = ({ title, rows, badgeColor, suffix }: { title: string; rows: [string, number | string][]; badgeColor?: (k: string) => string; suffix?: string }) => (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
        <div className="space-y-2">
          {rows.slice(0, 15).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="truncate">{k}</span>
              <Badge variant="outline" className={badgeColor?.(k)}>{v}{suffix}</Badge>
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
        <p className="text-sm text-muted-foreground">Visão consolidada com filtros</p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label className="text-xs">Equipe</Label>
            <Select value={effectiveTeam} onValueChange={setTeamSel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                <SelectItem value={ALL_TEAMS}>Todas as equipes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Vendedor</Label>
            <Select value={vendor} onValueChange={setVendor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {data.profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {LEAD_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origem</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Motivo de perda</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {LOST_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Base da data</Label>
            <Select value={basis} onValueChange={(v) => setBasis(v as DateBasis)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stage">Data real da etapa</SelectItem>
                <SelectItem value="created">Data de criação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Filtro rápido</Label>
            <Select value={quick} onValueChange={(v) => setQuick(v as QuickFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUICK_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Com “Data real da etapa”, o período usa a data da entrevista realizada, da matrícula, da perda ou da entrevista marcada — conforme o status do lead.
        </p>
      </Card>


      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Block title="Leads por vendedor" rows={byVendedor} />
        <Block title="Leads por status" rows={byStatusRows} badgeColor={(k) => {
          const s = LEAD_STATUSES.find((x) => x.label === k); return s ? statusColor(s.value) : "";
        }} />
        <Block title="Leads por origem" rows={bySource} />
        <Block title="Leads por empresa" rows={byEmpresa} />
        <Block title="Motivos de perda" rows={byReason} />
        <Block title="Conversão por etapa" rows={conversionRows} suffix="%" />
        <Block title="Tarefas concluídas por vendedor" rows={tarefasConcluidas} />
        <Block title="Tarefas atrasadas por vendedor" rows={tarefasAtrasadas} />
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Resgates</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Pendentes</span><Badge variant="outline">{resgatesPendentes}</Badge></div>
            <div className="flex justify-between"><span>Realizados</span><Badge variant="outline">{resgatesRealizados}</Badge></div>
          </div>
        </Card>
      </div>

      <LeadsFoundTable
        leads={filteredLeads}
        doneEvent={data.doneEvent}
        basis={basis}
        ownerName={(id) => profileMap.get(id) ?? "—"}
      />
    </div>
  );

}
