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

export const Route = createFileRoute("/_authenticated/relatorios")({ component: RelatoriosPage });

type Lead = { id: string; status: string; company: string | null; source: string | null; owner_id: string; lost_reason: string | null; created_at: string };
type Task = { id: string; owner_id: string; status: string; due_date: string; is_rescue: boolean };

async function fetchData() {
  const [leadsR, tasksR, profilesR] = await Promise.all([
    supabase.from("leads").select("id,status,company,source,owner_id,lost_reason,created_at").limit(10000),
    supabase.from("tasks").select("id,owner_id,status,due_date,is_rescue").limit(10000),
    supabase.from("profiles").select("id,full_name,email").limit(2000),
  ]);
  return {
    leads: (leadsR.data ?? []) as Lead[],
    tasks: (tasksR.data ?? []) as Task[],
    profiles: (profilesR.data ?? []) as any[],
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
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [reason, setReason] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const profileMap = useMemo(() => new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name || p.email || "—"])), [data]);

  const filteredLeads = useMemo(() => {
    if (!data) return [];
    return data.leads.filter((l) => {
      if (vendor !== "all" && l.owner_id !== vendor) return false;
      if (status !== "all" && l.status !== status) return false;
      if (source !== "all" && (l.source || "—") !== source) return false;
      if (reason !== "all" && l.lost_reason !== reason) return false;
      if (from && l.created_at.slice(0, 10) < from) return false;
      if (to && l.created_at.slice(0, 10) > to) return false;
      return true;
    });
  }, [data, vendor, status, source, reason, from, to]);

  const filteredTasks = useMemo(() => {
    if (!data) return [];
    return data.tasks.filter((t) => {
      if (vendor !== "all" && t.owner_id !== vendor) return false;
      if (from && t.due_date < from) return false;
      if (to && t.due_date > to) return false;
      return true;
    });
  }, [data, vendor, from, to]);

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
        </div>
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
    </div>
  );
}
