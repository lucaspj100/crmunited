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

function PerformanceItem({
  icon: Icon,
  label,
  value,
  completed = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  completed?: boolean;
}) {
  const active = value > 0;
  return (
    <div
      className={`group relative min-h-28 overflow-hidden rounded-md border p-3.5 transition-all motion-safe:hover:-translate-y-0.5 ${
        completed
          ? "border-success/40 bg-success/10 shadow-sm shadow-success/10"
          : active
            ? "border-primary/25 bg-primary/5 hover:border-primary/45 hover:shadow-sm"
            : "border-border/70 bg-background/55 hover:border-primary/25"
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-0.5 ${completed ? "bg-success" : active ? "bg-primary" : "bg-border"}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {completed ? <CheckCircle2 className="h-4 w-4 text-success motion-safe:animate-pulse" /> : <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />}
      </div>
      <div className="mt-3 text-3xl font-black tabular-nums">{value}</div>
      <div className={`mt-1 text-[10px] font-semibold uppercase ${completed ? "text-success" : active ? "text-primary" : "text-muted-foreground"}`}>
        {completed ? "Concluído" : active ? "Em andamento" : "Pendente"}
      </div>
    </div>
  );
}

function CareerProgress({ overview }: { overview: NonNullable<ReturnType<typeof useCareerOverview>["data"]> }) {
  if (showsStars(overview.career_role)) {
    const pointsInStar = overview.week_points % POINTS_PER_STAR;
    const missing = pointsInStar === 0 ? POINTS_PER_STAR : POINTS_PER_STAR - pointsInStar;
    const percentage = (pointsInStar / POINTS_PER_STAR) * 100;
    return (
      <div className="space-y-2.5 border-t border-primary/10 pt-4">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-muted-foreground">Próxima estrela</span>
          <span className="font-bold tabular-nums">{pointsInStar} / {POINTS_PER_STAR} pts · {percentage.toFixed(0)}%</span>
        </div>
        <Progress value={percentage} className="h-3.5 bg-primary/10" />
        <p className="text-[11px] text-muted-foreground">Faltam {missing} pt{missing === 1 ? "" : "s"} para avançar.</p>
      </div>
    );
  }

  if (isLeaderRole(overview.career_role)) {
    const target = overview.quota_points_target || QUOTA_POINTS_TARGET;
    const percentage = Math.min(100, (overview.structure_month_points / target) * 100);
    return (
      <div className="space-y-2.5 border-t border-primary/10 pt-4">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-muted-foreground">Produção da estrutura no mês</span>
          <span className="font-bold tabular-nums">{overview.structure_month_points} / {target} pts · {percentage.toFixed(0)}%</span>
        </div>
        <Progress value={percentage} className="h-3.5 bg-primary/10" />
        <p className="text-[11px] text-muted-foreground">Progresso da sua estrutura no ciclo atual.</p>
      </div>
    );
  }

  if (overview.goal) {
    const percentage = Math.min(100, (overview.month_points / overview.goal.target_points) * 100);
    return (
      <div className="space-y-2.5 border-t border-primary/10 pt-4">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-muted-foreground">Meta de carreira do mês</span>
          <span className="font-bold tabular-nums">{overview.month_points} / {overview.goal.target_points} pts · {percentage.toFixed(0)}%</span>
        </div>
        <Progress value={percentage} className="h-3.5 bg-primary/10" />
        <p className="text-[11px] text-muted-foreground">Continue avançando na sua meta de carreira.</p>
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
    <Link to={to} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-xs transition-colors hover:border-primary/50 ${tones[tone]}`}>
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
    <div className="mx-auto max-w-[1500px] space-y-4 rounded-lg bg-muted/35 p-3 sm:p-4 lg:p-5">
      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/15 via-card/95 to-accent/30 p-5 shadow-md shadow-primary/5 md:p-6">
          <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start xl:flex-col xl:items-center xl:text-center 2xl:flex-row 2xl:items-start 2xl:text-left">
            <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-primary text-4xl font-black text-primary-foreground shadow-lg shadow-primary/15 ring-2 ring-primary/30 md:h-36 md:w-36">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={`Foto de ${displayName}`} className="h-full w-full object-cover" />
              ) : (
                initials(displayName)
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-primary xl:justify-center 2xl:justify-start">
                  <UserRound className="h-4 w-4" /> Painel de performance
                </div>
                <h1 className="mt-1 break-words text-3xl font-black leading-tight md:text-4xl">{displayName}</h1>
                <div className="mt-2 flex xl:justify-center 2xl:justify-start"><CareerBadge info={careerInfo} size="lg" /></div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="rounded-md border border-primary/15 bg-background/65 px-3 py-2.5 text-left">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">Placar de hoje</div>
                  <div className="mt-0.5 text-xl font-black tabular-nums">{fmtScore(mine?.score ?? 0)} <span className="text-xs font-medium text-muted-foreground">pontos</span></div>
                </div>
                {rank >= 0 && (
                  <div className="flex items-center justify-between rounded-md border border-primary/25 bg-primary px-3 py-2.5 text-primary-foreground shadow-sm shadow-primary/20">
                    <div className="text-left"><div className="text-[10px] font-semibold uppercase opacity-80">Ranking diário</div><div className="text-2xl font-black tabular-nums">#{rank + 1}</div></div>
                    <Medal className="h-7 w-7" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground xl:justify-center 2xl:justify-start">
                <Sparkles className="h-4 w-4 text-primary" />
                <strong className="text-foreground">{career?.week_points ?? 0}</strong> pontos de carreira nesta semana
              </div>
              {career && <CareerProgress overview={career} />}
            </div>
          </div>
        </Card>

        <Card className="border-primary/15 bg-card/95 p-5 shadow-md shadow-primary/5 transition-shadow hover:shadow-lg md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionTitle icon={Target}>Missão de hoje</SectionTitle>
              <p className="mt-1 text-xs text-muted-foreground">Cada avanço fortalece sua posição no placar.</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/20 bg-primary/10"><Trophy className="h-5 w-5 text-primary" /></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3">
            <PerformanceItem icon={CalendarCheck} label="Entrevistas marcadas" value={mine?.entrevistas_marcadas ?? 0} />
            <PerformanceItem icon={CheckCircle2} label="Entrevistas realizadas" value={mine?.entrevistas_realizadas ?? 0} />
            <PerformanceItem icon={GraduationCap} label="Matrículas" value={mine?.matriculas ?? 0} completed={!!goalProgress && goalProgress.done >= goalProgress.target} />
            <PerformanceItem icon={ListChecks} label="Tarefas concluídas" value={data.tasksDoneToday} />
          </div>
          {goalProgress && (
            <div className="mt-4 space-y-2.5 rounded-md border border-primary/15 bg-primary/5 p-4">
              <div className="flex items-end justify-between gap-3">
                <div><div className="text-[10px] font-bold uppercase text-primary">Meta mensal</div><div className="mt-0.5 text-lg font-black tabular-nums">{goalProgress.done} / {goalProgress.target} <span className="text-xs font-medium text-muted-foreground">matrículas</span></div></div>
                <span className="text-2xl font-black tabular-nums text-primary">{goalProgress.percentage.toFixed(0)}%</span>
              </div>
              <Progress value={goalProgress.barValue} className="h-4 bg-primary/10" />
              <p className="text-xs text-muted-foreground">{goalProgress.message}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="overflow-hidden border-primary/15 bg-card/95 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3.5">
            <SectionTitle icon={Clock3}>Próxima entrevista</SectionTitle>
            <Button asChild size="sm" variant="outline"><Link to="/tarefas">Abrir tarefas <ArrowRight /></Link></Button>
          </div>
          <div className="p-5">
          {nextInterview ? (
            <div className="rounded-md border-l-4 border-primary bg-primary/5 px-5 py-4">
              <div className="text-5xl font-black leading-none tabular-nums text-primary md:text-6xl">{nextInterview.time}</div>
              <div className="mt-3 break-words text-xl font-bold">{nextInterview.leadName}</div>
              <div className="mt-1 text-xs text-muted-foreground">Entrevista aguardando realização</div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma entrevista pendente para hoje.
            </div>
          )}
          {otherInterviews.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {otherInterviews.map((item) => (
                <div key={item.id} className={`rounded-md border px-2.5 py-1.5 text-xs ${item.done ? "border-success/25 bg-success/10 text-success" : "border-border/70 bg-muted/40"}`}>
                  <span className="font-bold tabular-nums">{item.time}</span> · {item.leadName}
                  {item.done && <CheckCircle2 className="ml-1 inline h-3 w-3" />}
                </div>
              ))}
            </div>
          )}
          </div>
        </Card>

        <Card className="border-primary/10 bg-card/95 p-5 shadow-sm">
          <SectionTitle icon={Sparkles}>Seu desempenho hoje</SectionTitle>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <PerformanceItem icon={CalendarCheck} label="Agendadas" value={mine?.entrevistas_marcadas ?? 0} />
            <PerformanceItem icon={CheckCircle2} label="Realizadas" value={mine?.entrevistas_realizadas ?? 0} />
            <PerformanceItem icon={GraduationCap} label="Matrículas" value={mine?.matriculas ?? 0} />
            <PerformanceItem icon={ListChecks} label="Tarefas concluídas" value={data.tasksDoneToday} />
          </div>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/80 p-4 shadow-sm">
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

      <section className="overflow-hidden rounded-md border border-border/70 bg-card/80 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/25 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Seu funil atual</h2>
            <p className="text-xs text-muted-foreground">Distribuição dos seus leads por etapa.</p>
          </div>
          <Button asChild size="sm" variant="ghost"><Link to="/funil" search={{ leadId: undefined }}>Ver funil <ArrowRight /></Link></Button>
        </div>
        <div className="grid grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-6">
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
    <div className="border-b border-r p-4 transition-colors hover:bg-primary/5 sm:min-h-24">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5 text-primary" />{label}</div>
      <div className="mt-2 text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}