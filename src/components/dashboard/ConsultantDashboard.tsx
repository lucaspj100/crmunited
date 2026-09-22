import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  GraduationCap,
  ListChecks,
  Medal,
  RotateCw,
  Sparkles,
  Target,
  TrendingDown,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CareerBadge } from "@/components/carreira/CareerBadge";
import { useAuth } from "@/lib/auth-context";
import {
  POINTS_PER_STAR,
  QUOTA_POINTS_TARGET,
  STARS_TO_MASTER,
  isLeaderRole,
  showsStars,
  useCareerOverview,
} from "@/lib/career";
import {
  computeGoalProgress,
  currentMonthYear,
  monthRange,
  useMyActiveGoal,
} from "@/lib/enrollment-goals";
import { fetchProductivity, todayIso, type ProductivityRow } from "@/lib/productivity";
import { fmtScore, isRealSeller, scoreOf } from "@/lib/scoring";
import { useScoreSettings } from "@/lib/score-settings";
import { supabase } from "@/integrations/supabase/client";

export type DashboardData = {
  totalFunnel: number;
  novos: number;
  interessados: number;
  entMarc: number;
  entReal: number;
  matric: number;
  perdidos: number;
  convNovoInteressado: number;
  convInteressadoEntrevista: number;
  convEntrevistaRealizada: number;
  convMatricula: number;
  tasksToday: number;
  tasksLate: number;
  tasksDoneToday: number;
  leadsNoTask: number;
  rescuesPending: number;
  rescuesToday: number;
  novosSemContato: number;
  entrevistasHoje: number;
  emRescate: number;
  rescatesHoje: number;
  reativados7d: number;
};

export type DashboardInterview = {
  id: string;
  time: string;
  leadName: string;
  ownerName: string;
  done: boolean;
};

type Props = {
  data: DashboardData;
  interviews: DashboardInterview[];
};

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="h-4 w-4 text-primary" />
      <span>{children}</span>
    </div>
  );
}

function PerformanceItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="group rounded-lg border bg-background/70 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function CareerProgress({ overview }: { overview: NonNullable<ReturnType<typeof useCareerOverview>["data"]> }) {
  if (showsStars(overview.career_role)) {
    const pointsInStar = overview.week_points % POINTS_PER_STAR;
    const missing = pointsInStar === 0 ? POINTS_PER_STAR : POINTS_PER_STAR - pointsInStar;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Progresso para a próxima estrela</span>
          <span className="font-semibold">Faltam {missing} pt{missing === 1 ? "" : "s"}</span>
        </div>
        <Progress value={(pointsInStar / POINTS_PER_STAR) * 100} className="h-2.5" />
      </div>
    );
  }

  if (isLeaderRole(overview.career_role)) {
    const target = overview.quota_points_target || QUOTA_POINTS_TARGET;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Produção da estrutura no mês</span>
          <span className="font-semibold">{overview.structure_month_points} / {target} pts</span>
        </div>
        <Progress value={Math.min(100, (overview.structure_month_points / target) * 100)} className="h-2.5" />
      </div>
    );
  }

  if (overview.goal) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Meta de carreira do mês</span>
          <span className="font-semibold">{overview.month_points} / {overview.goal.target_points} pts</span>
        </div>
        <Progress value={Math.min(100, (overview.month_points / overview.goal.target_points) * 100)} className="h-2.5" />
      </div>
    );
  }

  return <p className="text-xs text-muted-foreground">{overview.month_points} pontos de carreira no mês.</p>;
}

function AlertChip({ count, label, tone, to }: { count: number; label: string; tone: "danger" | "warning" | "info"; to: "/tarefas" | "/resgates" }) {
  if (count === 0) return null;
  const tones = {
    danger: "border-destructive/25 bg-destructive/5 text-destructive",
    warning: "border-warning/30 bg-warning/10 text-warning-foreground",
    info: "border-primary/20 bg-primary/5 text-foreground",
  };
  return (
    <Link to={to} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors hover:border-primary/50 ${tones[tone]}`}>
      <span>{label}</span>
      <Badge variant="outline" className="tabular-nums">{count}</Badge>
    </Link>
  );
}

export function ConsultantDashboard({ data, interviews }: Props) {
  const { user } = useAuth();
  const today = todayIso();
  const { month, year } = currentMonthYear();
  const monthDates = monthRange(month, year);
  const { data: career } = useCareerOverview(undefined, !!user);
  const { data: enrollmentGoal } = useMyActiveGoal(month, year);
  const { points: scorePoints } = useScoreSettings();

  const { data: profile } = useQuery({
    enabled: !!user,
    queryKey: ["my_profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: row, error } = await supabase
        .from("profiles")
        .select("id,full_name,email,avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return row;
    },
  });

  const { data: todayRows = [] } = useQuery({
    enabled: !!user,
    queryKey: ["dashboard-performance-today", today],
    queryFn: () => fetchProductivity({ start: today, end: today, vendedorId: null, teamId: null }),
    refetchInterval: 30_000,
  });

  const { data: monthRows = [] } = useQuery({
    enabled: !!user,
    queryKey: ["dashboard-performance-month", monthDates.start, monthDates.end, user?.id],
    queryFn: () => fetchProductivity({ start: monthDates.start, end: monthDates.end, vendedorId: user?.id, teamId: null }),
    refetchInterval: 60_000,
  });

  const ranked = todayRows
    .filter((row) => isRealSeller(row.nome))
    .map((row) => ({ ...row, score: scoreOf(row, scorePoints) }))
    .sort((a, b) => b.score - a.score);
  const mine = ranked.find((row) => row.vendedor_id === user?.id) ?? null;
  const rank = ranked.findIndex((row) => row.vendedor_id === user?.id);
  const monthMine = monthRows.find((row) => row.vendedor_id === user?.id) ?? null;
  const goalProgress = enrollmentGoal
    ? computeGoalProgress(monthMine?.matriculas ?? 0, enrollmentGoal.target_enrollments)
    : null;

  const unfinished = interviews.filter((item) => !item.done);
  const currentTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const nextInterview = unfinished.find((item) => item.time !== "—" && item.time >= currentTime) ?? unfinished[0] ?? null;
  const otherInterviews = interviews.filter((item) => item.id !== nextInterview?.id);
  const careerInfo = career
    ? { user_id: career.user_id, full_name: career.full_name, career_role: career.career_role, career_stars: career.career_stars }
    : null;
  const displayName = profile?.full_name || career?.full_name || profile?.email || user?.email || "Consultor";
  const hasAlerts = data.tasksLate + data.novosSemContato + data.leadsNoTask + data.rescuesToday + data.entrevistasHoje > 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-lg md:p-6">
          <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-primary text-3xl font-black text-primary-foreground shadow-lg ring-2 ring-primary/30">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={`Foto de ${displayName}`} className="h-full w-full object-cover" />
              ) : (
                initials(displayName)
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
                  <UserRound className="h-4 w-4" /> Painel de performance
                </div>
                <h1 className="mt-1 truncate text-3xl font-bold">{displayName}</h1>
              </div>
              <CareerBadge info={careerInfo} size="lg" />
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <span><strong>{career?.week_points ?? 0}</strong> pontos de carreira nesta semana</span>
                <span><strong>{fmtScore(mine?.score ?? 0)}</strong> pontos no placar hoje</span>
                {rank >= 0 && <span className="flex items-center gap-1"><Medal className="h-4 w-4 text-primary" /> Ranking diário: <strong>#{rank + 1}</strong></span>}
              </div>
              {career && <CareerProgress overview={career} />}
            </div>
          </div>
        </Card>

        <Card className="border-primary/15 p-5 shadow-md transition-shadow hover:shadow-lg md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionTitle icon={Target}>Missão de hoje</SectionTitle>
              <p className="mt-1 text-xs text-muted-foreground">Mantenha o ritmo nas ações que movem seu funil.</p>
            </div>
            <Trophy className="h-8 w-8 text-primary/70" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <PerformanceItem icon={CalendarCheck} label="Entrevistas marcadas" value={mine?.entrevistas_marcadas ?? 0} />
            <PerformanceItem icon={CheckCircle2} label="Entrevistas realizadas" value={mine?.entrevistas_realizadas ?? 0} />
            <PerformanceItem icon={GraduationCap} label="Matrículas" value={mine?.matriculas ?? 0} />
            <PerformanceItem icon={ListChecks} label="Tarefas concluídas" value={data.tasksDoneToday} />
          </div>
          {goalProgress && (
            <div className="mt-5 space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium">Meta mensal de matrículas</span>
                <span className="font-bold tabular-nums">{goalProgress.done} / {goalProgress.target}</span>
              </div>
              <Progress value={goalProgress.barValue} className="h-2.5" />
              <p className="text-xs text-muted-foreground">{goalProgress.message}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle icon={Clock3}>Próxima entrevista</SectionTitle>
            <Button asChild size="sm" variant="outline">
              <Link to="/tarefas">Abrir tarefas <ArrowRight /></Link>
            </Button>
          </div>
          {nextInterview ? (
            <div className="mt-5 rounded-lg border border-primary/25 bg-primary/5 p-4">
              <div className="text-4xl font-bold tabular-nums text-primary">{nextInterview.time}</div>
              <div className="mt-2 truncate text-lg font-semibold">{nextInterview.leadName}</div>
              <div className="mt-1 text-xs text-muted-foreground">Entrevista aguardando realização</div>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma entrevista pendente para hoje.
            </div>
          )}
          {otherInterviews.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {otherInterviews.map((item) => (
                <div key={item.id} className={`rounded-md border px-2.5 py-2 text-xs ${item.done ? "bg-success/10 text-success" : "bg-muted/40"}`}>
                  <span className="font-bold tabular-nums">{item.time}</span> · {item.leadName}
                  {item.done && <CheckCircle2 className="ml-1 inline h-3 w-3" />}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 shadow-sm">
          <SectionTitle icon={Sparkles}>Seu desempenho hoje</SectionTitle>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PerformanceItem icon={CalendarCheck} label="Agendadas" value={mine?.entrevistas_marcadas ?? 0} />
            <PerformanceItem icon={CheckCircle2} label="Realizadas" value={mine?.entrevistas_realizadas ?? 0} />
            <PerformanceItem icon={GraduationCap} label="Matrículas" value={mine?.matriculas ?? 0} />
            <PerformanceItem icon={ListChecks} label="Tarefas concluídas" value={data.tasksDoneToday} />
          </div>
        </Card>
      </div>

      <Card className="p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={AlertTriangle}>Alertas importantes</SectionTitle>
          {!hasAlerts && <span className="text-xs text-muted-foreground">Nenhuma pendência crítica agora.</span>}
        </div>
        {hasAlerts && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <AlertChip count={data.tasksLate} label="Tarefas atrasadas" tone="danger" to="/tarefas" />
            <AlertChip count={data.novosSemContato} label="Novos sem contato" tone="warning" to="/tarefas" />
            <AlertChip count={data.leadsNoTask} label="Leads sem próxima ação" tone="warning" to="/tarefas" />
            <AlertChip count={data.rescuesToday} label="Resgates para hoje" tone="info" to="/resgates" />
            <AlertChip count={data.entrevistasHoje} label="Entrevistas do dia" tone="info" to="/tarefas" />
          </div>
        )}
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Seu funil atual</h2>
            <p className="text-xs text-muted-foreground">Distribuição dos seus leads por etapa.</p>
          </div>
          <Button asChild size="sm" variant="ghost"><Link to="/funil" search={{ leadId: undefined }}>Ver funil <ArrowRight /></Link></Button>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card sm:grid-cols-3 lg:grid-cols-6">
          <FunnelStage icon={Sparkles} label="Novos" value={data.novos} />
          <FunnelStage icon={Users} label="Interessados" value={data.interessados} />
          <FunnelStage icon={CalendarCheck} label="Entrev. marcadas" value={data.entMarc} />
          <FunnelStage icon={CheckCircle2} label="Entrev. realizadas" value={data.entReal} />
          <FunnelStage icon={GraduationCap} label="Matrículas" value={data.matric} />
          <FunnelStage icon={TrendingDown} label="Perdidos" value={data.perdidos} />
        </div>
      </section>
    </div>
  );
}

function FunnelStage({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="border-b border-r p-4 transition-colors hover:bg-muted/40 sm:min-h-24">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5 text-primary" />{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}