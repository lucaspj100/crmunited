import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Star, Construction, TrendingUp, Target, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { CareerAdminPanel } from "@/components/carreira/CareerAdminPanel";
import { LeadershipCareerCard } from "@/components/carreira/LeadershipCareerCard";
import { LeadershipTree } from "@/components/carreira/LeadershipTree";
import {
  CAREER_ROLE_LABELS,
  CAREER_TRACK,
  GOAL_STATUS_LABELS,
  POINTS_PER_STAR,
  STARS_TO_MASTER,
  fmtDateBR,
  isLeaderRole,
  isUnderConstruction,
  monthLabel,
  nextRole,
  useCareerOverview,
  type CareerOverview,
} from "@/lib/career";


export const Route = createFileRoute("/_authenticated/plano-de-carreira")({
  component: CareerPage,
  head: () => ({
    meta: [
      { title: "Plano de carreira · CRM United" },
      { name: "description", content: "Acompanhe sua evolução de cargo, estrelas e metas mensais no CRM United." },
      { property: "og:title", content: "Plano de carreira · CRM United" },
      { property: "og:description", content: "Cargos, estrelas e metas mensais da equipe comercial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TrackStrip({ role }: { role: CareerOverview["career_role"] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CAREER_TRACK.map((r, i) => (
        <div key={r} className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              r === role
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {CAREER_ROLE_LABELS[r]}
          </span>
          {i < CAREER_TRACK.length - 1 && <span className="text-muted-foreground">→</span>}
        </div>
      ))}
    </div>
  );
}

function HowToScore() {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" /> Como ganhar pontos
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <div className="text-sm font-medium">Matrícula</div>
          <div className="text-xs text-muted-foreground">+1 ponto</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-sm font-medium">Matrícula + material pago na mesma semana</div>
          <div className="text-xs text-muted-foreground">+2 pontos no total (não soma em cima do 1)</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A pontuação é semanal (domingo a sábado) e reinicia a cada semana. As estrelas conquistadas são
        acumulativas e nunca zeram.
      </p>
    </Card>
  );
}

function ConsultorView({ o }: { o: CareerOverview }) {
  const stars = Math.min(o.career_stars, STARS_TO_MASTER);
  const toNextStar = POINTS_PER_STAR - (o.week_points % POINTS_PER_STAR);
  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Cargo atual</div>
            <div className="text-2xl font-bold">{CAREER_ROLE_LABELS[o.career_role]}</div>
          </div>
          <Badge variant="secondary">No cargo desde {fmtDateBR(o.career_role_since)}</Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1 text-3xl">
            {Array.from({ length: STARS_TO_MASTER }).map((_, i) => (
              <Star
                key={i}
                className={`h-8 w-8 ${i < stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
              />
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            {o.career_stars} de {STARS_TO_MASTER} estrelas conquistadas
          </div>
          <Progress value={(stars / STARS_TO_MASTER) * 100} />
          <div className="text-xs text-muted-foreground">Próximo nível: Consultor Master</div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" /> Pontuação desta semana
          </div>
          <div className="text-3xl font-bold">{o.week_points} pontos</div>
          <Progress value={((o.week_points % POINTS_PER_STAR) / POINTS_PER_STAR) * 100} />
          <div className="text-xs text-muted-foreground">
            Faltam {toNextStar === POINTS_PER_STAR ? POINTS_PER_STAR : toNextStar} ponto(s) para a próxima estrela
            {o.week_stars_pending > 0 && ` · ${o.week_stars_pending} estrela(s) garantida(s) nesta semana`}
          </div>
          <div className="text-xs text-muted-foreground">
            Semana de {fmtDateBR(o.week_start)} a {fmtDateBR(o.week_end)}
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm font-semibold">Histórico semanal</div>
          <div className="space-y-1 text-xs">
            {o.weeks.map((w) => (
              <div key={w.week_start} className="flex justify-between">
                <span className="text-muted-foreground">
                  {fmtDateBR(w.week_start)} – {fmtDateBR(w.week_end)}
                </span>
                <span>
                  {w.points} pts · {w.stars_awarded} ⭐
                </span>
              </div>
            ))}
            {o.weeks.length === 0 && (
              <div className="text-muted-foreground">Nenhuma semana fechada ainda.</div>
            )}
          </div>
        </Card>
      </div>

      <HowToScore />

      <Card className="p-5 space-y-3">
        <div className="text-sm font-semibold">Sua trilha de carreira</div>
        <TrackStrip role={o.career_role} />
      </Card>
    </div>
  );
}

function GoalView({ o }: { o: CareerOverview }) {
  const next = nextRole(o.career_role);
  const goal = o.goal;
  const pct = goal ? Math.min(100, Math.round((o.month_points / goal.target_points) * 100)) : 0;
  const now = new Date();
  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Cargo atual</div>
            <div className="text-2xl font-bold">{CAREER_ROLE_LABELS[o.career_role]}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {o.career_stars} estrelas
            </Badge>
            {next && <Badge>Próximo cargo: {CAREER_ROLE_LABELS[next]}</Badge>}
          </div>
        </div>
        {o.career_role === "consultor_master" && (
          <p className="text-sm text-muted-foreground">
            Você conquistou as {STARS_TO_MASTER} estrelas. Agora seu próximo passo é se tornar Supervisor.
          </p>
        )}
        {o.career_role === "supervisor" && (
          <p className="text-sm text-muted-foreground">
            Bata a meta mensal definida pela liderança para se tornar Gerente.
          </p>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" /> Meta de {monthLabel(now.getMonth() + 1, now.getFullYear())}
        </div>
        {goal ? (
          <>
            <div className="text-3xl font-bold">
              {o.month_points} / {goal.target_points} pontos
            </div>
            <Progress value={pct} />
            <div className="text-sm text-muted-foreground">{pct}% da meta</div>
            <Badge variant={goal.status === "atingida" ? "default" : "secondary"}>
              {GOAL_STATUS_LABELS[goal.status]}
            </Badge>
          </>
        ) : (
          <div className="space-y-1">
            <div className="text-3xl font-bold">{o.month_points} pontos no mês</div>
            <p className="text-sm text-muted-foreground">
              Sua meta deste mês ainda não foi definida pela liderança.
            </p>
          </div>
        )}
      </Card>

      <HowToScore />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 space-y-2">
          <div className="text-sm font-semibold">Metas anteriores</div>
          <div className="space-y-1 text-xs">
            {o.goals_history.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{monthLabel(g.month, g.year)}</span>
                <span className="flex items-center gap-2">
                  {g.achieved_points} / {g.target_points}
                  <Badge variant={g.status === "atingida" ? "default" : "secondary"}>
                    {GOAL_STATUS_LABELS[g.status]}
                  </Badge>
                </span>
              </div>
            ))}
            {o.goals_history.length === 0 && (
              <div className="text-muted-foreground">Nenhuma meta registrada.</div>
            )}
          </div>
        </Card>
        <Card className="p-5 space-y-3">
          <div className="text-sm font-semibold">Sua trilha de carreira</div>
          <TrackStrip role={o.career_role} />
        </Card>
      </div>
    </div>
  );
}

function UnderConstructionView({ o }: { o: CareerOverview }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Cargo atual</div>
      <div className="text-2xl font-bold">{CAREER_ROLE_LABELS[o.career_role]}</div>
      <Construction className="h-10 w-10 text-amber-500" />
      <div className="text-lg font-semibold">
        Próximos passos do plano de carreira em construção.
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        As regras de evolução para este cargo ainda estão sendo definidas.
      </p>
    </Card>
  );
}

function CareerPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const { data: overview, isLoading, error } = useCareerOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Minha carreira</h1>
        <p className="text-sm text-muted-foreground">
          Sua evolução dentro da United: estrelas, pontos e próximos cargos.
        </p>
      </div>

      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>}
      {error && (
        <Card className="p-6 text-sm text-destructive">
          Não foi possível carregar sua carreira: {(error as Error).message}
        </Card>
      )}

      {overview &&
        (isUnderConstruction(overview.career_role) ? (
          <UnderConstructionView o={overview} />
        ) : isLeaderRole(overview.career_role) ? (
          <LeadershipCareerCard o={overview} />
        ) : overview.career_role === "consultor" ? (
          <ConsultorView o={overview} />
        ) : (
          <GoalView o={overview} />
        ))}

      <LeadershipTree editable={isAdmin} />

      {isAdmin && <CareerAdminPanel />}

    </div>
  );
}
