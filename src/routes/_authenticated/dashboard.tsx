import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { LayoutDashboard, Users, CalendarCheck, GraduationCap, TrendingDown, ListChecks, AlertTriangle, RotateCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

async function fetchDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [leadsR, tasksR, leadsTasksR] = await Promise.all([
    supabase.from("leads").select("id,status").limit(5000),
    supabase.from("tasks").select("id,due_date,status,is_rescue").limit(5000),
    supabase.from("leads").select("id,status").in("status", ["interessado", "entrevista_marcada", "entrevista_realizada"]).limit(5000),
  ]);
  const leads = (leadsR.data ?? []) as { id: string; status: string }[];
  const tasks = (tasksR.data ?? []) as { id: string; due_date: string; status: string; is_rescue: boolean }[];
  const activeLeads = (leadsTasksR.data ?? []) as { id: string; status: string }[];

  // leads without future task
  const futureTaskLeadIds = new Set(
    tasks.filter((t) => t.status === "pendente" && t.due_date >= today).map((t) => (t as any).lead_id),
  );
  // We don't have lead_id in tasks select above — fetch ids
  const { data: pendingTasks } = await supabase
    .from("tasks").select("lead_id").eq("status", "pendente").gte("due_date", today).limit(5000);
  const pendingLeadIds = new Set(((pendingTasks ?? []) as { lead_id: string }[]).map((t) => t.lead_id));
  const leadsNoTask = activeLeads.filter((l) => !pendingLeadIds.has(l.id)).length;

  const count = (s: string) => leads.filter((l) => l.status === s).length;
  const interessados = count("interessado");
  const entMarc = count("entrevista_marcada");
  const entReal = count("entrevista_realizada");
  const matric = count("matricula");
  const perdidos = count("perdido");
  const totalFunnel = interessados + entMarc + entReal + matric + perdidos;

  const tasksToday = tasks.filter((t) => t.due_date === today && t.status === "pendente").length;
  const tasksLate = tasks.filter((t) => t.due_date < today && t.status === "pendente").length;
  const tasksDoneToday = tasks.filter((t) => t.due_date === today && t.status === "concluida").length;
  const rescuesPending = tasks.filter((t) => t.is_rescue && t.status === "pendente").length;

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  return {
    totalFunnel, interessados, entMarc, entReal, matric, perdidos,
    convInteressadoEntrevista: pct(entMarc + entReal + matric, interessados + entMarc + entReal + matric + perdidos),
    convEntrevistaRealizada: pct(entReal + matric, entMarc + entReal + matric),
    convMatricula: pct(matric, entReal + matric),
    tasksToday, tasksLate, tasksDoneToday, leadsNoTask, rescuesPending,
  };
}

function Stat({ icon: Icon, label, value, sub, tone = "default" }: { icon: any; label: string; value: number | string; sub?: string; tone?: "default" | "danger" | "warning" | "success" | "primary" }) {
  const tones: Record<string, string> = {
    default: "bg-card",
    danger: "bg-rose-500/10 border-rose-500/30",
    warning: "bg-amber-500/10 border-amber-500/30",
    success: "bg-emerald-500/10 border-emerald-500/30",
    primary: "bg-primary/5 border-primary/30",
  };
  return (
    <Card className={`p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-background/60 p-2"><Icon className="h-5 w-5 text-primary" /></div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
      <div className="mt-3 text-3xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><LayoutDashboard className="h-6 w-6 text-primary" />Dashboard Comercial</h1>
        <p className="text-sm text-muted-foreground">Visão geral da operação</p>
      </div>

      <div>
        <div className="text-sm font-medium text-muted-foreground mb-2">Funil</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat icon={Users} label="Interessados" value={data.interessados} tone="primary" />
          <Stat icon={CalendarCheck} label="Entrev. marcadas" value={data.entMarc} />
          <Stat icon={CalendarCheck} label="Entrev. realizadas" value={data.entReal} />
          <Stat icon={GraduationCap} label="Matrículas" value={data.matric} tone="success" />
          <Stat icon={TrendingDown} label="Perdidos" value={data.perdidos} tone="danger" />
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-muted-foreground mb-2">Taxas de conversão</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat icon={TrendingDown} label="Interessado → Entrevista" value={`${data.convInteressadoEntrevista}%`} />
          <Stat icon={TrendingDown} label="Entrev. marcada → realizada" value={`${data.convEntrevistaRealizada}%`} />
          <Stat icon={TrendingDown} label="Entrev. realizada → matrícula" value={`${data.convMatricula}%`} />
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-muted-foreground mb-2">Operação diária</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat icon={ListChecks} label="Tarefas hoje" value={data.tasksToday} tone="primary" />
          <Stat icon={AlertTriangle} label="Tarefas atrasadas" value={data.tasksLate} tone="danger" />
          <Stat icon={ListChecks} label="Concluídas hoje" value={data.tasksDoneToday} tone="success" />
          <Stat icon={AlertTriangle} label="Leads sem tarefa" value={data.leadsNoTask} tone="warning" />
          <Stat icon={RotateCw} label="Resgates pendentes" value={data.rescuesPending} />
        </div>
      </div>
    </div>
  );
}
