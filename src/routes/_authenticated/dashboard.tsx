import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Users, CalendarCheck, GraduationCap, TrendingDown, ListChecks, AlertTriangle, RotateCw, Sparkles, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

async function fetchDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const last7 = new Date(); last7.setDate(last7.getDate() - 7);
  const last7Iso = last7.toISOString();
  const [leadsR, tasksR, pendingTasksR] = await Promise.all([
    supabase.from("leads").select("id,status,in_rescue,rescued_at").limit(5000),
    supabase.from("tasks").select("id,due_date,status,is_rescue,lead_id,type").limit(5000),
    supabase.from("tasks").select("lead_id").eq("status", "pendente").gte("due_date", today).limit(5000),
  ]);
  const leads = (leadsR.data ?? []) as { id: string; status: string; in_rescue: boolean; rescued_at: string | null }[];
  const tasks = (tasksR.data ?? []) as { id: string; due_date: string; status: string; is_rescue: boolean; lead_id: string; type: string }[];
  const pendingLeadIds = new Set(((pendingTasksR.data ?? []) as { lead_id: string }[]).map((t) => t.lead_id));

  const count = (s: string) => leads.filter((l) => l.status === s).length;
  const novos = count("novo");
  const interessados = count("interessado");
  const entMarc = count("entrevista_marcada");
  const entReal = count("entrevista_realizada");
  const matric = count("matricula");
  const perdidos = count("perdido");

  const activeLeads = leads.filter((l) => ["novo", "interessado", "entrevista_marcada", "entrevista_realizada"].includes(l.status));
  const leadsNoTask = activeLeads.filter((l) => !pendingLeadIds.has(l.id)).length;

  const leadIdsComPrimeiroContato = new Set(
    tasks.filter((t) => t.type === "primeiro_contato" && t.status === "pendente").map((t) => t.lead_id),
  );
  const novosSemContato = leads.filter((l) => l.status === "novo" && !leadIdsComPrimeiroContato.has(l.id)).length;

  const entrevistasHoje = tasks.filter((t) => t.type === "confirmar_entrevista" && t.due_date === today && t.status === "pendente").length;

  const tasksToday = tasks.filter((t) => t.due_date === today && t.status === "pendente").length;
  const tasksLate = tasks.filter((t) => t.due_date < today && t.status === "pendente").length;
  const tasksDoneToday = tasks.filter((t) => t.due_date === today && t.status === "concluida").length;
  const rescuesPending = tasks.filter((t) => t.is_rescue && t.status === "pendente").length;
  const rescuesToday = tasks.filter((t) => t.is_rescue && t.status === "pendente" && t.due_date <= today).length;

  // Indicadores de Resgate (esteira em_rescue)
  const emRescate = leads.filter((l) => l.in_rescue).length;
  const rescatesHoje = leads.filter((l) => l.in_rescue && l.rescued_at && l.rescued_at.slice(0, 10) === today).length;
  const reativados7d = leads.filter((l) => l.in_rescue && l.rescued_at && l.rescued_at >= last7Iso).length;

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const totalFunnel = novos + interessados + entMarc + entReal + matric + perdidos;

  return {
    totalFunnel, novos, interessados, entMarc, entReal, matric, perdidos,
    convNovoInteressado: pct(interessados + entMarc + entReal + matric, novos + interessados + entMarc + entReal + matric + perdidos),
    convInteressadoEntrevista: pct(entMarc + entReal + matric, interessados + entMarc + entReal + matric + perdidos),
    convEntrevistaRealizada: pct(entReal + matric, entMarc + entReal + matric),
    convMatricula: pct(matric, entReal + matric),
    tasksToday, tasksLate, tasksDoneToday, leadsNoTask, rescuesPending, rescuesToday,
    novosSemContato, entrevistasHoje, emRescate, rescatesHoje, reativados7d,
  };
}

function Stat({ icon: Icon, label, value, sub, tone = "default", to }: { icon: any; label: string; value: number | string; sub?: string; tone?: "default" | "danger" | "warning" | "success" | "primary" | "info"; to?: string }) {
  const tones: Record<string, string> = {
    default: "bg-card",
    danger: "bg-rose-500/10 border-rose-500/30",
    warning: "bg-amber-500/10 border-amber-500/30",
    success: "bg-emerald-500/10 border-emerald-500/30",
    primary: "bg-primary/5 border-primary/30",
    info: "bg-slate-500/10 border-slate-500/30",
  };
  const inner = (
    <Card className={`p-4 ${tones[tone]} ${to ? "hover:shadow-md transition-shadow cursor-pointer" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-background/60 p-2"><Icon className="h-5 w-5 text-primary" /></div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
      <div className="mt-3 text-3xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
  return to ? <Link to={to as any}>{inner}</Link> : inner;
}

function AlertItem({ count, label, tone, to }: { count: number; label: string; tone: "danger" | "warning" | "info"; to?: string }) {
  if (count === 0) return null;
  const tones = {
    danger: "bg-rose-500/10 border-rose-500/30 text-rose-700",
    warning: "bg-amber-500/10 border-amber-500/30 text-amber-800",
    info: "bg-blue-500/10 border-blue-500/30 text-blue-700",
  };
  const content = (
    <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>
      <span>{label}</span>
      <Badge variant="outline">{count}</Badge>
    </div>
  );
  return to ? <Link to={to as any}>{content}</Link> : content;
}

function Dashboard() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const { data: interviews } = useQuery({
    queryKey: ["dashboard-interviews-today"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, owner_id, interview_time, interview_date, status")
        .eq("interview_date", today)
        .in("status", ["entrevista_marcada", "entrevista_realizada"])
        .limit(500);
      const l = (leads ?? []) as { id: string; name: string; owner_id: string | null; interview_time: string | null; status: string }[];
      if (l.length === 0) return [];
      const ownerIds = Array.from(new Set(l.map((x) => x.owner_id).filter(Boolean) as string[]));
      const profR = ownerIds.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", ownerIds)
        : { data: [] as any[] };
      const profMap = new Map(((profR.data ?? []) as any[]).map((p) => [p.id, (p.full_name || p.email || "Vendedor") as string]));
      return l
        .map((x) => ({
          id: x.id,
          time: x.interview_time ? x.interview_time.slice(0, 5) : "—",
          leadName: x.name ?? "Lead",
          ownerName: x.owner_id ? (profMap.get(x.owner_id) ?? "Vendedor") : "Vendedor",
          done: x.status === "entrevista_realizada",
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
    },
  });
  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  const anyAlert = data.novosSemContato + data.tasksLate + data.entrevistasHoje + data.leadsNoTask + data.rescuesToday > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><LayoutDashboard className="h-6 w-6 text-primary" />Dashboard Comercial</h1>
        <p className="text-sm text-muted-foreground">Visão geral da operação</p>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-primary" />Entrevistas de hoje {isAdmin ? "(time)" : "(suas)"}</div>
          <Link to="/tarefas" className="text-xs text-primary hover:underline">Ver tarefas →</Link>
        </div>
        {!interviews || interviews.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma entrevista marcada para hoje.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {interviews.map((it) => (
              <Link key={it.id} to="/tarefas" className="group">
                <div className={`rounded-lg border px-3 py-2 hover:border-primary transition-colors ${it.done ? "bg-emerald-500/10 border-emerald-500/30" : "bg-primary/5"}`}>
                  <div className="text-xl font-bold tabular-nums leading-none">{it.time}</div>
                  <div className="text-xs text-muted-foreground mt-1 max-w-[180px] truncate">{it.leadName}</div>
                  {isAdmin && <div className="text-[10px] text-muted-foreground/80 truncate">{it.ownerName}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {anyAlert && (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3"><Sparkles className="h-4 w-4 text-primary" />Alertas importantes</div>
          <div className="space-y-2">
            <AlertItem count={data.tasksLate} label="Tarefas atrasadas" tone="danger" to="/tarefas" />
            <AlertItem count={data.novosSemContato} label="Leads novos sem primeiro contato" tone="warning" to="/tarefas" />
            <AlertItem count={data.entrevistasHoje} label="Entrevistas marcadas para hoje" tone="info" to="/tarefas" />
            <AlertItem count={data.leadsNoTask} label="Leads sem próxima ação" tone="warning" to="/tarefas" />
            <AlertItem count={data.rescuesToday} label="Resgates para hoje" tone="info" to="/resgates" />
          </div>
        </Card>
      )}

      <div>
        <div className="text-sm font-medium text-muted-foreground mb-2">Funil</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat icon={Sparkles} label="Novos" value={data.novos} tone="info" />
          <Stat icon={Users} label="Interessados" value={data.interessados} tone="primary" />
          <Stat icon={CalendarCheck} label="Entrev. marcadas" value={data.entMarc} />
          <Stat icon={CalendarCheck} label="Entrev. realizadas" value={data.entReal} />
          <Stat icon={GraduationCap} label="Matrículas" value={data.matric} tone="success" />
          <Stat icon={TrendingDown} label="Perdidos" value={data.perdidos} tone="danger" />
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-muted-foreground mb-2">Taxas de conversão</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={TrendingDown} label="Novo → Interessado" value={`${data.convNovoInteressado}%`} />
          <Stat icon={TrendingDown} label="Interessado → Entrevista" value={`${data.convInteressadoEntrevista}%`} />
          <Stat icon={TrendingDown} label="Marcada → Realizada" value={`${data.convEntrevistaRealizada}%`} />
          <Stat icon={TrendingDown} label="Realizada → Matrícula" value={`${data.convMatricula}%`} />
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-muted-foreground mb-2">Operação diária</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat icon={CalendarCheck} label="Entrevistas hoje" value={data.entrevistasHoje} tone="info" to="/tarefas" />
          <Stat icon={ListChecks} label="Tarefas hoje" value={data.tasksToday} tone="primary" to="/tarefas" />
          <Stat icon={AlertTriangle} label="Tarefas atrasadas" value={data.tasksLate} tone="danger" to="/tarefas" />
          <Stat icon={ListChecks} label="Concluídas hoje" value={data.tasksDoneToday} tone="success" />
          <Stat icon={AlertTriangle} label="Leads sem tarefa" value={data.leadsNoTask} tone="warning" to="/tarefas" />
          <Stat icon={RotateCw} label="Resgates pendentes" value={data.rescuesPending} to="/resgates" />
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-muted-foreground mb-2">Esteira de Resgate</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={RotateCw} label="Leads em Resgate" value={data.emRescate} tone="warning" to="/resgates" />
          <Stat icon={RotateCw} label="Entraram hoje" value={data.rescatesHoje} />
          <Stat icon={RotateCw} label="Reativados (7d)" value={data.reativados7d} tone="success" />
          <Stat icon={TrendingDown} label="Perdidos no funil" value={data.perdidos} tone="danger" to="/perdidos" />
        </div>
      </div>
    </div>
  );
}
