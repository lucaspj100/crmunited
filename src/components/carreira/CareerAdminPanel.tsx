import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Shield, Target } from "lucide-react";
import { toast } from "sonner";
import {
  CAREER_ROLES,
  CAREER_ROLE_LABELS,
  GOAL_STATUS_LABELS,
  MONTH_LABELS,
  fmtDateBR,
  monthLabel,
  useCareerAdminList,
  useCareerOverview,
  useSetCareerRole,
  useSetCareerStars,
  useUpsertCareerGoal,
  type CareerRole,
} from "@/lib/career";

export function CareerAdminPanel() {
  const { data: rows, isLoading } = useCareerAdminList(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const current = rows?.find((r) => r.user_id === selected) ?? null;
  const { data: detail } = useCareerOverview(selected ?? undefined, !!selected);

  const setRole = useSetCareerRole();
  const setStars = useSetCareerStars();
  const upsertGoal = useUpsertCareerGoal();

  const now = new Date();
  const [goalMonth, setGoalMonth] = useState(now.getMonth() + 1);
  const [goalYear, setGoalYear] = useState(now.getFullYear());
  const [goalTarget, setGoalTarget] = useState("");
  const [starsInput, setStarsInput] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter(
      (r) => r.full_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Visão do ADM · Gestão de carreira</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          <Input placeholder="Buscar colaborador…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-[420px] overflow-y-auto rounded-md border divide-y">
            {isLoading && <div className="p-3 text-sm text-muted-foreground">Carregando…</div>}
            {filtered.map((r) => (
              <button
                key={r.user_id}
                type="button"
                onClick={() => {
                  setSelected(r.user_id);
                  setStarsInput(String(r.career_stars));
                  setGoalTarget(r.goal ? String(r.goal.target_points) : "");
                }}
                className={`flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-accent ${
                  selected === r.user_id ? "bg-accent" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {CAREER_ROLE_LABELS[r.career_role]}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-xs text-amber-500">
                  <Star className="h-3.5 w-3.5 fill-current" /> {r.career_stars}
                </span>
              </button>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="p-3 text-sm text-muted-foreground">Nenhum colaborador encontrado.</div>
            )}
          </div>
        </div>

        {!current ? (
          <div className="flex items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
            Selecione um colaborador para administrar a carreira.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-4">
              <div className="text-sm font-semibold">{current.full_name}</div>
              <div className="text-xs text-muted-foreground">{current.email}</div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>No cargo desde {fmtDateBR(current.career_role_since)}</span>
                <span>Pontos da semana: <strong className="text-foreground">{current.week_points}</strong></span>
                <span>Pontos do mês: <strong className="text-foreground">{current.month_points}</strong></span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select
                  value={current.career_role}
                  onValueChange={(v) =>
                    setRole.mutate(
                      { userId: current.user_id, role: v as CareerRole, reason: "Ajuste manual do ADM" },
                      {
                        onSuccess: () => toast.success("Cargo atualizado"),
                        onError: (e) => toast.error((e as Error).message),
                      },
                    )
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAREER_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{CAREER_ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Estrelas acumuladas</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={starsInput}
                    onChange={(e) => setStarsInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setStars.mutate(
                        { userId: current.user_id, stars: Math.max(0, Number(starsInput) || 0) },
                        {
                          onSuccess: () => toast.success("Estrelas atualizadas"),
                          onError: (e) => toast.error((e as Error).message),
                        },
                      )
                    }
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            </div>

            {(current.career_role === "consultor_master" || current.career_role === "supervisor") && (
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Target className="h-4 w-4 text-primary" /> Meta mensal de pontos
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Mês</Label>
                    <Select value={String(goalMonth)} onValueChange={(v) => setGoalMonth(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTH_LABELS.map((m, i) => (
                          <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ano</Label>
                    <Input type="number" value={goalYear} onChange={(e) => setGoalYear(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Meta de pontos</Label>
                    <Input type="number" min={1} value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => {
                        const t = Number(goalTarget);
                        if (!t || t < 1) return toast.error("Informe uma meta válida");
                        upsertGoal.mutate(
                          { userId: current.user_id, month: goalMonth, year: goalYear, target: t },
                          {
                            onSuccess: () => toast.success("Meta salva"),
                            onError: (e) => toast.error((e as Error).message),
                          },
                        );
                      }}
                    >
                      Salvar meta
                    </Button>
                  </div>
                </div>
                {current.goal && (
                  <div className="text-xs text-muted-foreground">
                    Meta atual de {monthLabel(current.goal.month, current.goal.year)}:{" "}
                    <strong className="text-foreground">
                      {current.month_points} / {current.goal.target_points} pontos
                    </strong>{" "}
                    · {GOAL_STATUS_LABELS[current.goal.status]}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border p-4">
                <div className="mb-2 text-sm font-semibold">Histórico semanal</div>
                <div className="space-y-1 text-xs">
                  {(detail?.weeks ?? []).map((w) => (
                    <div key={w.week_start} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {fmtDateBR(w.week_start)} – {fmtDateBR(w.week_end)}
                      </span>
                      <span>
                        {w.points} pts · {w.stars_awarded} ⭐
                      </span>
                    </div>
                  ))}
                  {(detail?.weeks ?? []).length === 0 && (
                    <div className="text-muted-foreground">Sem semanas fechadas.</div>
                  )}
                </div>
              </div>

              <div className="rounded-md border p-4">
                <div className="mb-2 text-sm font-semibold">Metas anteriores</div>
                <div className="space-y-1 text-xs">
                  {(detail?.goals_history ?? []).map((g) => (
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
                  {(detail?.goals_history ?? []).length === 0 && (
                    <div className="text-muted-foreground">Nenhuma meta registrada.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-md border p-4">
              <div className="mb-2 text-sm font-semibold">Evolução de cargos</div>
              <div className="space-y-1 text-xs">
                {(detail?.role_history ?? []).map((h, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span>
                      {h.from_role ? CAREER_ROLE_LABELS[h.from_role] : "—"} →{" "}
                      {CAREER_ROLE_LABELS[h.to_role]} {h.automatic ? "(automático)" : "(ADM)"}
                    </span>
                  </div>
                ))}
                {(detail?.role_history ?? []).length === 0 && (
                  <div className="text-muted-foreground">Sem alterações registradas.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
