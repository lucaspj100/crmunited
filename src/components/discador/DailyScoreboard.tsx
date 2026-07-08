import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Phone, MessageCircle, Users, Sparkles, CalendarCheck, Clock, Flame, Settings2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DEFAULT_CALL_GOAL = 100;
const MIN_RECOMMENDED_GOAL = 70;
const INTERESTED_RESULTS = ["Interessado", "Pediu WhatsApp"];

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatSince(date: Date | null): string {
  if (!date) return "Nenhuma ação hoje";
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "Última ação agora";
  if (diffMin < 60) return `Última ação há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `Última ação há ${h}h${m ? ` ${m}min` : ""}`;
}

function rhythmMessage(calls: number, goal: number): string {
  if (calls <= 0) return "Você ainda não começou sua sprint hoje.";
  if (calls <= 15) return "Bom começo. Continue o ritmo.";
  if (calls <= 35) return "Você está ganhando ritmo. Continue.";
  if (calls < goal) return "Falta pouco para bater a meta.";
  return "Meta batida. Excelente trabalho.";
}

type DailyStats = {
  calls: number;
  whats: number;
  whatsStarted: number;
  worked: number;
  interested: number;
  interviews: number;
  lastActionAt: string | null;
};

export function DailyScoreboard({
  onStartSprint,
  hasContact,
}: {
  onStartSprint?: () => void;
  hasContact?: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayISO = startOfTodayISO();
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);

  const { data: goalRow } = useQuery({
    enabled: !!user,
    queryKey: ["seller_daily_goal", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_daily_goals")
        .select("daily_calls_goal")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const callGoal = goalRow?.daily_calls_goal ?? DEFAULT_CALL_GOAL;

  const { data } = useQuery<DailyStats>({
    enabled: !!user,
    queryKey: ["daily_scoreboard", user?.id, todayISO],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [attemptsRes, interviewsRes] = await Promise.all([
        supabase
          .from("prospect_attempts")
          .select("tipo_acao, resultado, prospect_contact_id, created_at")
          .eq("vendedor_id", user!.id)
          .gte("created_at", todayISO)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user!.id)
          .eq("status", "entrevista_marcada")
          .gte("updated_at", todayISO),
      ]);
      const attempts = (attemptsRes.data ?? []) as Array<{
        tipo_acao: string; resultado: string | null; prospect_contact_id: string; created_at: string;
      }>;
      // Conta apenas tentativas com resultado preenchido (evita duplicatas legadas sem resultado).
      const withResult = attempts.filter((a) => !!a.resultado);
      const calls = withResult.filter((a) => a.tipo_acao === "ligacao").length;
      const whats = withResult.filter((a) => a.tipo_acao === "whatsapp").length;
      const worked = new Set(withResult.map((a) => a.prospect_contact_id)).size;
      const interested = withResult.filter((a) => a.resultado && INTERESTED_RESULTS.includes(a.resultado)).length;
      const lastActionAt = attempts[0]?.created_at ?? null;
      return {
        calls, whats, worked, interested,
        interviews: interviewsRes.count ?? 0,
        lastActionAt,
      };
    },
  });

  // tick a cada 30s para atualizar o "há X min"
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const stats = data ?? { calls: 0, whats: 0, worked: 0, interested: 0, interviews: 0, lastActionAt: null };
  const lastDate = useMemo(() => (stats.lastActionAt ? new Date(stats.lastActionAt) : null), [stats.lastActionAt]);
  const goalProgress = Math.min(100, (stats.calls / callGoal) * 100);
  const message = rhythmMessage(stats.calls, callGoal);

  return (
    <Card className="border-2">
      <CardContent className="p-3 md:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-semibold">Placar de hoje</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />{formatSince(lastDate)}
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          <Metric icon={<Phone className="h-3.5 w-3.5" />} label="Ligações" value={stats.calls} />
          <Metric icon={<MessageCircle className="h-3.5 w-3.5" />} label="WhatsApp" value={stats.whats} />
          <Metric icon={<Users className="h-3.5 w-3.5" />} label="Trabalhados" value={stats.worked} />
          <Metric icon={<Sparkles className="h-3.5 w-3.5" />} label="Interessados" value={stats.interested} />
          <Metric icon={<CalendarCheck className="h-3.5 w-3.5" />} label="Entrevistas" value={stats.interviews} />
        </div>

        <div className="rounded-md border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">Sprint de Ligações</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold">{stats.calls} / {callGoal} ligações hoje</span>
              <button
                type="button"
                onClick={() => setGoalDialogOpen(true)}
                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-background"
                title="Configurar meta"
              >
                <Settings2 className="h-3 w-3" />
                <span className="hidden sm:inline">Configurar meta</span>
              </button>
            </div>
          </div>
          <Progress value={goalProgress} className="h-2" />
          <p className="text-xs text-muted-foreground">{message}</p>
          {onStartSprint && (
            <button
              onClick={onStartSprint}
              disabled={!hasContact}
              className="w-full mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold h-10 disabled:opacity-50"
            >
              <Phone className="h-4 w-4" />
              {stats.calls === 0 ? "Iniciar sprint" : "Continuar sprint"}
            </button>
          )}
        </div>
      </CardContent>
      <GoalDialog
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
        currentGoal={callGoal}
        userId={user?.id}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["seller_daily_goal", user?.id] })}
      />
    </Card>
  );
}

function GoalDialog({
  open, onOpenChange, currentGoal, userId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentGoal: number;
  userId?: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<string>(String(currentGoal));
  useEffect(() => { if (open) setValue(String(currentGoal)); }, [open, currentGoal]);

  const numeric = Number.parseInt(value, 10);
  const isValid = Number.isFinite(numeric) && numeric > 0;
  const isLow = isValid && numeric < MIN_RECOMMENDED_GOAL;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!userId || !isValid) throw new Error("Meta inválida");
      const { error } = await supabase
        .from("seller_daily_goals")
        .upsert({ user_id: userId, daily_calls_goal: numeric }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meta diária atualizada");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao salvar meta"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar meta diária</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="daily-calls-goal">Meta diária de ligações</Label>
            <Input
              id="daily-calls-goal"
              type="number"
              inputMode="numeric"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Exemplo: 100 ligações por dia.</p>
          </div>
          {isLow && (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Essa meta está baixa para outbound B2C. Recomendamos pelo menos 70 ligações por dia.</span>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-2 flex flex-col items-center text-center">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className="text-lg md:text-xl font-bold leading-tight">{value}</div>
    </div>
  );
}
