import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sliders, History } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  ACTIVITY_LABELS,
  ACTIVITY_ORDER,
  fetchScoreHistory,
  fmtPoints,
  useSaveScoreSettings,
  useScoreSettings,
  type ActivityKey,
  type ScorePoints,
} from "@/lib/score-settings";

const CONFIRM_TEXT =
  "Esta alteração recalculará a classificação e os pontos de todos os períodos com base nos novos valores. Deseja continuar?";

export function ScoreSettingsCard() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const { points, isLoading } = useScoreSettings();
  const save = useSaveScoreSettings(user?.id ?? null);
  const [draft, setDraft] = useState<Record<ActivityKey, string>>(() => blank(points));
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setDraft(blank(points));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);

  const historyQ = useQuery({
    queryKey: ["score_settings_history"],
    queryFn: fetchScoreHistory,
    enabled: isAdmin,
  });

  const parsed = useMemo(() => {
    const out = {} as ScorePoints;
    for (const k of ACTIVITY_ORDER) out[k] = Number(String(draft[k] ?? "").replace(",", ".")) || 0;
    return out;
  }, [draft]);

  const invalid = ACTIVITY_ORDER.some((k) => {
    const raw = String(draft[k] ?? "").replace(",", ".");
    return raw.trim() === "" || Number.isNaN(Number(raw)) || Number(raw) < 0;
  });
  const dirty = ACTIVITY_ORDER.some((k) => parsed[k] !== points[k]);

  if (!isAdmin) return null;

  async function doSave() {
    setConfirmOpen(false);
    try {
      await save.mutateAsync(parsed);
      toast.success("Pontuação salva. O Telão Comercial foi recalculado com os novos valores.");
    } catch {
      toast.error("Não foi possível salvar a pontuação.");
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Sliders className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Configuração de Pontuação do Telão</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Define quantos pontos cada atividade vale no Telão Comercial. A alteração é aplicada retroativamente:
        todas as atividades já registradas passam a valer o novo peso em qualquer período (hoje, semana, mês,
        personalizado e comparações). A contagem de atividades não é alterada.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIVITY_ORDER.map((k) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`score-${k}`}>{ACTIVITY_LABELS[k]}</Label>
            <Input
              id={`score-${k}`}
              inputMode="decimal"
              value={draft[k] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              disabled={isLoading || save.isPending}
            />
            <p className="text-xs text-muted-foreground">Atual: {fmtPoints(points[k])}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => setConfirmOpen(true)} disabled={invalid || !dirty || save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar pontuação"}
        </Button>
        {!dirty && <span className="text-xs text-muted-foreground">Nenhuma alteração pendente.</span>}
      </div>

      {(historyQ.data ?? []).length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" /> Histórico de alterações
          </div>
          <ul className="space-y-2 text-xs text-muted-foreground">
            {(historyQ.data ?? []).map((h) => {
              const changed = ACTIVITY_ORDER.filter(
                (k) => (h.previous_values?.[k] ?? null) !== (h.new_values?.[k] ?? null),
              );
              return (
                <li key={h.id} className="rounded-md border p-2">
                  <div>{new Date(h.changed_at).toLocaleString("pt-BR")}</div>
                  <div>
                    {changed.length === 0
                      ? "Sem mudanças de valores."
                      : changed
                          .map(
                            (k) =>
                              `${ACTIVITY_LABELS[k]}: ${fmtPoints(Number(h.previous_values?.[k] ?? 0))} → ${fmtPoints(
                                Number(h.new_values?.[k] ?? 0),
                              )}`,
                          )
                          .join(" · ")}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar nova pontuação</DialogTitle>
            <DialogDescription>{CONFIRM_TEXT}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={() => void doSave()}>Continuar e salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function blank(points: ScorePoints): Record<ActivityKey, string> {
  const out = {} as Record<ActivityKey, string>;
  for (const k of ACTIVITY_ORDER) out[k] = String(points[k]).replace(".", ",");
  return out;
}
