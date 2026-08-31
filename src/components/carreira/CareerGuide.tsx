import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Award,
  BookOpen,
  Construction,
  GitBranch,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  CAREER_ROLE_LABELS,
  POINTS_PER_ENROLLMENT,
  POINTS_PER_ENROLLMENT_WITH_MATERIAL,
  POINTS_PER_STAR,
  QUOTAS_TO_MASTER,
  QUOTA_POINTS_TARGET,
  STARS_TO_MASTER,
  hasDefinedNextStep,
  nextRole,
  type CareerRole,
} from "@/lib/career";

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm text-muted-foreground">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </li>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">{children}</div>
  );
}

function Example({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

/** Como pontuar — regras válidas para toda a produção individual. */
function ScoringRules() {
  return (
    <ul className="space-y-1.5">
      <Rule>
        Cada matrícula vale <strong className="text-foreground">{POINTS_PER_ENROLLMENT} ponto</strong>.
      </Rule>
      <Rule>
        Se o material didático for pago na hora ou dentro da mesma semana da matrícula, aquela matrícula
        passa a valer{" "}
        <strong className="text-foreground">{POINTS_PER_ENROLLMENT_WITH_MATERIAL} pontos</strong>.
      </Rule>
      <Rule>
        1 matrícula + material pago na mesma semana = {POINTS_PER_ENROLLMENT_WITH_MATERIAL} pontos no
        total, e não {POINTS_PER_ENROLLMENT + POINTS_PER_ENROLLMENT_WITH_MATERIAL}.
      </Rule>
    </ul>
  );
}

function ConsultorGuide() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Star className="h-4 w-4 text-amber-400" /> Como você conquista estrelas
        </div>
        <ScoringRules />
        <ul className="space-y-1.5">
          <Rule>
            A cada <strong className="text-foreground">{POINTS_PER_STAR} pontos</strong> conquistados na
            semana, você ganha <strong className="text-foreground">1 estrela</strong>.
          </Rule>
          <Rule>A pontuação semanal zera no início de uma nova semana.</Rule>
          <Rule>Suas estrelas nunca zeram.</Rule>
        </ul>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <Example
            key={n}
            label={`${n * POINTS_PER_STAR} pontos na semana`}
            value={`${n} estrela${n > 1 ? "s" : ""}`}
          />
        ))}
      </div>

      <Highlight>
        Ao conquistar <strong>{STARS_TO_MASTER} estrelas</strong> você se torna{" "}
        <strong>{CAREER_ROLE_LABELS.consultor_master}</strong>.
      </Highlight>
    </div>
  );
}

function GoalRoleGuide({ role }: { role: "consultor_master" | "supervisor" }) {
  const next = nextRole(role);
  return (
    <div className="space-y-4">
      <Highlight>
        Seu próximo passo é <strong>{next ? CAREER_ROLE_LABELS[next] : "—"}</strong>.
      </Highlight>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" /> Como funciona a meta mensal
        </div>
        <ul className="space-y-1.5">
          {role === "consultor_master" && (
            <Rule>
              Ao atingir {STARS_TO_MASTER} estrelas você se tornou{" "}
              {CAREER_ROLE_LABELS.consultor_master}.
            </Rule>
          )}
          <Rule>O ADM define uma meta mensal de pontos para você.</Rule>
          <Rule>
            Se atingir a meta do mês, você se torna{" "}
            <strong className="text-foreground">{next ? CAREER_ROLE_LABELS[next] : "—"}</strong>.
          </Rule>
          <Rule>
            Se não atingir a meta naquele mês, você continua sendo {CAREER_ROLE_LABELS[role]}.
          </Rule>
          <Rule>Não existe rebaixamento automático.</Rule>
          <Rule>Uma nova meta pode ser definida para o mês seguinte.</Rule>
        </ul>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> Como somar pontos
        </div>
        <ScoringRules />
      </div>
    </div>
  );
}

function StructureExplainer() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <GitBranch className="h-4 w-4 text-primary" /> Sua estrutura
      </div>
      <p className="text-sm text-muted-foreground">
        A pontuação da estrutura inclui todos os níveis abaixo de você, não só os diretos:
      </p>
      <div className="rounded-md border p-3 text-sm">
        Gerente → Supervisor → Consultor
        <div className="text-xs text-muted-foreground">
          A produção do Consultor também chega ao Gerente.
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A estrutura é configurada pelo ADM e pode ser flexível.
      </p>
    </div>
  );
}

function GerenteGuide() {
  return (
    <div className="space-y-4">
      <Highlight>
        A partir do cargo de Gerente, sua pontuação passa a considerar não apenas sua produção
        individual, mas também toda a produção da estrutura abaixo de você.
      </Highlight>

      <div className="rounded-md border p-3 text-sm">
        <div className="font-medium">Exemplo</div>
        <div className="text-muted-foreground">
          O Gerente João fez 3 pontos e a equipe abaixo dele fez 24 pontos → pontuação total da
          estrutura de João: <strong className="text-foreground">27 pontos</strong>.
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Award className="h-4 w-4 text-primary" /> Como funcionam as cotas
        </div>
        <ul className="space-y-1.5">
          <Rule>
            {QUOTA_POINTS_TARGET} pontos ou mais de estrutura dentro de um mês ={" "}
            <strong className="text-foreground">1 cota</strong>.
          </Rule>
          <Rule>Cada mês pode gerar no máximo 1 cota.</Rule>
          <Rule>As cotas acumulam e não zeram.</Rule>
          <Rule>
            São necessárias <strong className="text-foreground">{QUOTAS_TO_MASTER} cotas</strong> para se
            tornar {CAREER_ROLE_LABELS.gerente_master}.
          </Rule>
        </ul>
        <div className="grid gap-2 sm:grid-cols-3">
          {[QUOTA_POINTS_TARGET, 40, 70].map((p) => (
            <Example key={p} label={`${p} pontos no mês`} value="1 cota" />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> Como cada ponto é gerado
        </div>
        <ScoringRules />
      </div>

      <StructureExplainer />
    </div>
  );
}

function GerenteMasterGuide() {
  return (
    <div className="space-y-4">
      <Highlight>
        Você alcançou o nível de <strong>{CAREER_ROLE_LABELS.gerente_master}</strong>.
      </Highlight>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Sua produção continua considerando</div>
        <ul className="space-y-1.5">
          <Rule>seus próprios pontos;</Rule>
          <Rule>
            toda a produção das pessoas abaixo de você na árvore: Gerentes, Supervisores, Consultores
            Master, Consultores e outros níveis configurados pelo ADM.
          </Rule>
        </ul>
        <ScoringRules />
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Construction className="h-4 w-4 text-amber-500" /> Próximo nível:{" "}
          {CAREER_ROLE_LABELS.gerente_divisional}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Os critérios para evolução de {CAREER_ROLE_LABELS.gerente_master} para{" "}
          {CAREER_ROLE_LABELS.gerente_divisional} ainda estão sendo definidos.
        </p>
      </div>

      <StructureExplainer />
    </div>
  );
}

function UnderConstructionGuide({ role }: { role: CareerRole }) {
  return (
    <div className="space-y-3">
      <Highlight>
        Cargo atual: <strong>{CAREER_ROLE_LABELS[role]}</strong>.
      </Highlight>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Construction className="h-4 w-4 text-amber-500" />
        Próximos passos do plano de carreira em construção.
      </div>
    </div>
  );
}

/** Explicação da progressão, adaptada ao cargo atual do usuário. */
export function CareerGuide({ role }: { role: CareerRole }) {
  const next = hasDefinedNextStep(role) ? nextRole(role) : null;

  let body: React.ReactNode;
  if (role === "consultor") body = <ConsultorGuide />;
  else if (role === "consultor_master" || role === "supervisor")
    body = <GoalRoleGuide role={role} />;
  else if (role === "gerente") body = <GerenteGuide />;
  else if (role === "gerente_master") body = <GerenteMasterGuide />;
  else body = <UnderConstructionGuide role={role} />;

  return (
    <Card className="p-5">
      <Accordion type="single" collapsible defaultValue="guide">
        <AccordionItem value="guide" className="border-0">
          <AccordionTrigger className="py-0 hover:no-underline">
            <div className="flex flex-wrap items-center gap-2 text-left">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Como funciona minha carreira</span>
              <Badge variant="secondary">{CAREER_ROLE_LABELS[role]}</Badge>
              {next && <Badge>Próximo nível: {CAREER_ROLE_LABELS[next]}</Badge>}
              {role === "gerente_master" && (
                <Badge variant="outline">
                  Próximo nível: {CAREER_ROLE_LABELS.gerente_divisional} · em construção
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">{body}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
