import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Award, Construction, Target, Users } from "lucide-react";
import {
  CAREER_ROLE_LABELS,
  QUOTAS_TO_MASTER,
  QUOTA_POINTS_TARGET,
  fmtDateBR,
  monthLabel,
  type CareerOverview,
} from "@/lib/career";

/** Visão de carreira dos cargos de liderança (Gerente / Gerente Master). */
export function LeadershipCareerCard({ o }: { o: CareerOverview }) {
  const quotaTarget = o.quota_points_target || QUOTA_POINTS_TARGET;
  const quotasToMaster = o.quotas_to_master || QUOTAS_TO_MASTER;
  const points = o.structure_month_points ?? 0;
  const quotas = o.career_quotas ?? 0;
  const missing = Math.max(0, quotaTarget - points);
  const earnedThisMonth = points >= quotaTarget;
  const isMaster = o.career_role === "gerente_master";
  const now = new Date();

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Cargo atual</div>
            <div className="text-2xl font-bold">{CAREER_ROLE_LABELS[o.career_role]}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">No cargo desde {fmtDateBR(o.career_role_since)}</Badge>
            <Badge>
              Próximo cargo: {isMaster ? "Gerente Divisional" : CAREER_ROLE_LABELS["gerente_master"]}
            </Badge>
          </div>
        </div>
        {o.leader_name && (
          <div className="text-sm text-muted-foreground">
            Líder direto: <strong className="text-foreground">{o.leader_name}</strong>
          </div>
        )}
        <div className="text-sm text-muted-foreground">
          A partir de Gerente, a pontuação considera a sua produção somada à produção de toda a estrutura
          abaixo de você ({o.structure_size} pessoa(s)).
        </div>
      </Card>

      {isMaster ? (
        <Card className="p-6 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Construction className="h-4 w-4 text-amber-500" /> Próximo nível: Gerente Divisional
          </div>
          <p className="text-sm text-muted-foreground">Regras de progressão em construção.</p>
          <div className="pt-2 text-sm">
            Pontos da estrutura em {monthLabel(now.getMonth() + 1, now.getFullYear())}:{" "}
            <strong>{points}</strong>
          </div>
          <div className="text-xs text-muted-foreground">
            Cotas conquistadas até a promoção: {quotas}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Award className="h-4 w-4 text-primary" /> Cotas acumuladas
            </div>
            <div className="text-3xl font-bold">
              {quotas} / {quotasToMaster}
            </div>
            <Progress value={Math.min(100, (quotas / quotasToMaster) * 100)} />
            <div className="text-xs text-muted-foreground">
              1 cota = 1 mês com {quotaTarget} pontos ou mais na estrutura. As cotas são acumulativas e nunca
              zeram. Ao chegar em {quotasToMaster} cotas você se torna Gerente Master.
            </div>
          </Card>

          <Card className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-primary" /> Pontos da estrutura neste mês
            </div>
            <div className="text-3xl font-bold">
              {points} / {quotaTarget}
            </div>
            <Progress value={Math.min(100, (points / quotaTarget) * 100)} />
            <div className="text-xs text-muted-foreground">
              {earnedThisMonth
                ? "Cota conquistada neste mês."
                : `Faltam ${missing} ponto(s) neste mês para conquistar mais 1 cota.`}
            </div>
            <div className="text-xs text-muted-foreground">
              Cada mês gera no máximo 1 cota, independentemente do total de pontos.
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" /> Subordinados diretos
          </div>
          <div className="space-y-1 text-xs">
            {o.direct_reports.map((d) => (
              <div key={d.user_id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {d.full_name}{" "}
                  <span className="text-muted-foreground">· {CAREER_ROLE_LABELS[d.career_role]}</span>
                </span>
                <span>{d.month_points} pts no mês</span>
              </div>
            ))}
            {o.direct_reports.length === 0 && (
              <div className="text-muted-foreground">Nenhuma pessoa vinculada diretamente a você.</div>
            )}
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm font-semibold">Histórico de cotas</div>
          <div className="space-y-1 text-xs">
            {o.quotas_history.map((q) => (
              <div key={`${q.year}-${q.month}`} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{monthLabel(q.month, q.year)}</span>
                <span className="flex items-center gap-2">
                  {q.structure_points} pts
                  <Badge variant={q.quota_earned ? "default" : "secondary"}>
                    {q.quota_earned ? "Cota conquistada" : "Sem cota"}
                  </Badge>
                </span>
              </div>
            ))}
            {o.quotas_history.length === 0 && (
              <div className="text-muted-foreground">Nenhum mês registrado ainda.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
