import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Info,
  Loader2,
  Minus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PERIOD_LABELS,
  formatRangeLabel,
  periodRange,
  previousPeriodRange,
  todayIso,
  type Period,
} from "@/lib/productivity";
import {
  TONE_HINT,
  TONE_LABEL,
  TREND_LABEL,
  VS_AVERAGE_LABEL,
  buildFeedbackMetrics,
  deleteFeedback,
  fmtNum,
  fmtPct,
  listFeedbacks,
  saveFeedback,
  shareFeedback,
  shareStatusLabel,
  trendOf,
  unshareFeedback,
  vsAverage,

  type FeedbackMetrics,
  type FeedbackRow,
  type FeedbackTone,
} from "@/lib/individual-feedback";
import { generateIndividualFeedback } from "@/lib/individual-feedback.functions";

export const Route = createFileRoute("/_authenticated/feedback-individual")({
  component: FeedbackIndividualPage,
  head: () => ({
    meta: [
      { title: "Feedback Individual | CRM United" },
      {
        name: "description",
        content: "Geração de feedback individual do time comercial com números reais do CRM, observações do líder e apoio de IA.",
      },
      { property: "og:title", content: "Feedback Individual | CRM United" },
      { property: "og:description", content: "Feedback mensal individual com indicadores do CRM e foco prático para o próximo mês." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PERIOD_OPTIONS: Period[] = ["mes", "mes_passado", "semana", "semana_passada", "custom"];
const TONES: FeedbackTone[] = ["direto", "equilibrado", "motivador"];

type Member = { id: string; full_name: string | null; email: string | null; avatar_url: string | null; role: string };

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  franqueado: "Franqueado",
  vendedor: "Vendedor",
};

function FeedbackIndividualPage() {
  const { roles, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");
  const queryClient = useQueryClient();
  const generate = useServerFn(generateIndividualFeedback);

  const [sellerId, setSellerId] = useState<string>("");
  const [period, setPeriod] = useState<Period>("mes");
  const [customStart, setCustomStart] = useState(todayIso());
  const [customEnd, setCustomEnd] = useState(todayIso());
  const [meetingDate, setMeetingDate] = useState(todayIso());
  const [tone, setTone] = useState<FeedbackTone>("equilibrado");
  const [leaderNotes, setLeaderNotes] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [generated, setGenerated] = useState("");
  const [finalText, setFinalText] = useState("");
  const [nextFocus, setNextFocus] = useState("");
  const [agreedAction, setAgreedAction] = useState("");
  const [shared, setShared] = useState(false);
  const [editing, setEditing] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (roles.length > 0 && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [roles, isAdmin, navigate]);

  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);
  const prevRange = useMemo(() => previousPeriodRange(period, range), [period, range]);
  const periodLabel = `${PERIOD_LABELS[period]} · ${formatRangeLabel(range)}`;

  const membersQuery = useQuery({
    queryKey: ["feedback-members"],
    enabled: isAdmin,
    queryFn: async (): Promise<Member[]> => {
      const [{ data: profiles, error }, { data: rolesRows }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, avatar_url").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      const roleByUser = new Map((rolesRows ?? []).map((r) => [r.user_id, r.role as string]));
      return (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        avatar_url: p.avatar_url,
        role: roleByUser.get(p.id) ?? "vendedor",
      }));
    },
  });

  const member = membersQuery.data?.find((m) => m.id === sellerId) ?? null;

  const metricsQuery = useQuery({
    queryKey: ["feedback-metrics", sellerId, range.start, range.end],
    enabled: isAdmin && !!sellerId,
    queryFn: (): Promise<FeedbackMetrics> =>
      buildFeedbackMetrics({
        sellerId,
        cargo: ROLE_LABEL[member?.role ?? "vendedor"] ?? "Vendedor",
        current: range,
        previous: prevRange,
        label: periodLabel,
      }),
  });

  const historyQuery = useQuery({
    queryKey: ["feedback-history", sellerId],
    enabled: isAdmin && !!sellerId,
    queryFn: () => listFeedbacks(sellerId),
  });

  const metrics = metricsQuery.data ?? null;

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <ShieldAlert className="h-5 w-5" /> Área restrita a administradores.
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleGenerate(refinement: "curto" | "direto" | "motivador" | "outra_versao" | null) {
    if (!sellerId || !metrics) {
      toast.error("Selecione um colaborador primeiro.");
      return;
    }
    setGenerating(true);
    try {
      const res = await generate({
        data: {
          firstName: (member?.full_name ?? "").split(" ")[0] ?? "",
          cargo: metrics.seller.cargo,
          periodLabel,
          tone,
          leaderNotes,
          extraContext,
          current: metrics.current,
          previous: metrics.previous,
          teamAverage: metrics.teamAverage,
          ranking: metrics.ranking,
          goals: metrics.goals,
          refinement,
          previousFeedback: refinement ? finalText || generated : null,
        },
      });
      setGenerated(res.feedback);
      setFinalText(res.feedback);
      if (res.focus && !nextFocus) setNextFocus(res.focus);
      setEditing(true);
      toast.success("Feedback gerado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar o feedback.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!finalText.trim()) return;
    try {
      await navigator.clipboard.writeText(finalText.trim());
      toast.success("Feedback copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  async function handleSave() {
    if (!sellerId || !user) return;
    if (!finalText.trim()) {
      toast.error("Gere ou escreva o feedback antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      await saveFeedback({
        id: editingId,
        subjectUserId: sellerId,
        createdBy: user.id,
        period: { start: range.start, end: range.end, label: periodLabel },
        meetingDate: meetingDate || null,
        metrics,
        leaderNotes,
        extraContext,
        tone,
        generated,
        final: finalText,
        nextFocus,
        agreedAction,
        shared,
      });
      await queryClient.invalidateQueries({ queryKey: ["feedback-history", sellerId] });
      setEditingId(null);
      toast.success("Feedback salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar o feedback.");
    } finally {
      setSaving(false);
    }
  }

  function loadIntoForm(row: FeedbackRow) {
    setLeaderNotes(row.leader_notes);
    setExtraContext(row.extra_context);
    setTone((row.tone as FeedbackTone) ?? "equilibrado");
    setGenerated(row.generated_feedback);
    setFinalText(row.final_feedback || row.generated_feedback);
    setNextFocus(row.next_focus);
    setAgreedAction(row.agreed_action);
    setShared(row.shared_with_collaborator);
    setMeetingDate(row.meeting_date ?? todayIso());
    setEditingId(row.id);
    setEditing(true);
    toast.info("Feedback carregado para edição.");
  }

  async function handleDelete(id: string) {
    try {
      await deleteFeedback(id);
      await queryClient.invalidateQueries({ queryKey: ["feedback-history", sellerId] });
      if (editingId === id) setEditingId(null);
      toast.success("Feedback excluído.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Feedback Individual</h1>
        <p className="text-sm text-muted-foreground">
          Números reais do CRM, sua leitura como líder e um foco prático para o próximo mês.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Selecione o colaborador</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Colaborador</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger><SelectValue placeholder="Escolha um colaborador" /></SelectTrigger>
              <SelectContent>
                {(membersQuery.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Período analisado</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label>De</Label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Até</Label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Data da reunião</Label>
            <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {!sellerId && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Selecione um colaborador para carregar os indicadores do período.
          </CardContent>
        </Card>
      )}

      {sellerId && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-bold">
              {member?.avatar_url ? (
                <img src={member.avatar_url} alt={`Foto de ${member.full_name ?? ""}`} className="h-full w-full object-cover" />
              ) : (
                (member?.full_name ?? member?.email ?? "?").charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{member?.full_name || member?.email}</div>
              <div className="text-sm text-muted-foreground">{ROLE_LABEL[member?.role ?? "vendedor"]}</div>
            </div>
            <div className="ml-auto text-right text-xs text-muted-foreground">
              <div>{periodLabel}</div>
              <div>vs. {formatRangeLabel(prevRange)}</div>
              {metrics?.ranking.position && (
                <Badge variant="secondary" className="mt-1">
                  {metrics.ranking.position}º de {metrics.ranking.total} no placar
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {sellerId && metricsQuery.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      )}

      {sellerId && metricsQuery.isError && (
        <Card><CardContent className="p-4 text-sm text-destructive">Erro ao carregar os indicadores.</CardContent></Card>
      )}

      {metrics && !metricsQuery.isLoading && (
        <>
          {!metrics.hasData && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Este colaborador não tem atividade registrada no período selecionado. O feedback será gerado apenas com a
                sua observação.
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Entrevistas agendadas" value={fmtNum(metrics.current.entrevistas_marcadas)}
              prev={metrics.previous.entrevistas_marcadas} cur={metrics.current.entrevistas_marcadas}
              avg={metrics.teamAverage.entrevistas_marcadas} goal={metrics.goals.entrevistas}
              hint="Leads únicos cuja data de entrevista agendada (data original, se houve reagendamento) cai dentro do período. Reagendamento não gera contagem nova." />
            <MetricCard label="Entrevistas realizadas" value={fmtNum(metrics.current.entrevistas_realizadas)}
              prev={metrics.previous.entrevistas_realizadas} cur={metrics.current.entrevistas_realizadas}
              avg={metrics.teamAverage.entrevistas_realizadas}
              hint="Leads únicos com data de realização da entrevista dentro do período." />
            <MetricCard label="Matrículas" value={fmtNum(metrics.current.matriculas)}
              prev={metrics.previous.matriculas} cur={metrics.current.matriculas}
              avg={metrics.teamAverage.matriculas} goal={metrics.goals.matriculas}
              hint="Leads únicos com data real da matrícula dentro do período." />
            <MetricCard label="Taxa de comparecimento" value={fmtPct(metrics.current.taxa_comparecimento)}
              prev={metrics.previous.taxa_comparecimento} cur={metrics.current.taxa_comparecimento}
              avg={metrics.teamAverage.taxa_comparecimento}
              hint="Entrevistas realizadas ÷ entrevistas agendadas × 100." />
            <MetricCard label="Conversão realizadas → matrículas" value={fmtPct(metrics.current.taxa_conversao_realizadas)}
              prev={metrics.previous.taxa_conversao_realizadas} cur={metrics.current.taxa_conversao_realizadas}
              avg={metrics.teamAverage.taxa_conversao_realizadas}
              hint="Matrículas ÷ entrevistas realizadas × 100." />
            <MetricCard label="Leads perdidos" value={fmtNum(metrics.current.perdidos)}
              prev={metrics.previous.perdidos} cur={metrics.current.perdidos}
              avg={metrics.teamAverage.perdidos} invert
              hint="Leads únicos que registraram evento de perda no período (histórico do lead)." />
            <MetricCard label="Interessados gerados" value={fmtNum(metrics.current.interessados_gerados)}
              prev={metrics.previous.interessados_gerados} cur={metrics.current.interessados_gerados}
              avg={metrics.teamAverage.interessados_gerados}
              hint="Leads únicos que passaram para o status Interessado (ou avançaram além dele) dentro do período." />
            <MetricCard label="Ligações feitas" value={fmtNum(metrics.current.ligacoes_feitas)}
              prev={metrics.previous.ligacoes_feitas} cur={metrics.current.ligacoes_feitas}
              avg={metrics.teamAverage.ligacoes_feitas} goal={metrics.goals.ligacoes}
              hint="Quantidade de tentativas de ligação registradas no discador no período (atividades, não leads únicos)." />
            <MetricCard label="Leads com contato registrado" value={fmtNum(metrics.current.leads_trabalhados)}
              prev={metrics.previous.leads_trabalhados} cur={metrics.current.leads_trabalhados}
              avg={metrics.teamAverage.leads_trabalhados}
              hint="Leads ÚNICOS do colaborador cujo campo “último contato” foi marcado dentro do período. Esse campo é preenchido apenas quando o vendedor marca o contato como feito na página Hoje. Não inclui ligações do discador, follow-ups, mudanças de etapa nem edições do lead." />

          </div>
        </>
      )}

      {sellerId && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Sua leitura como líder</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>O que você observou nesse colaborador?</Label>
              <Textarea
                rows={6}
                value={leaderNotes}
                onChange={(e) => setLeaderNotes(e.target.value)}
                placeholder="Escreva o que você percebeu no mês. Ex.: mostrou constância na prospecção, mas ainda perde oportunidades por não aprofundar a necessidade na entrevista."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Alguma situação específica que deve entrar no feedback? (opcional)</Label>
              <Textarea
                rows={3}
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
                placeholder="Ex.: evoluiu bastante nas últimas duas semanas depois do treinamento de SPIN."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tom do feedback</Label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <Button key={t} type="button" size="sm" variant={tone === t ? "default" : "outline"} onClick={() => setTone(t)}>
                    {TONE_LABEL[t]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{TONE_HINT[tone]}</p>
            </div>
            <Button onClick={() => handleGenerate(null)} disabled={generating || metricsQuery.isLoading} className="w-full sm:w-auto">
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {generating ? "Gerando feedback…" : "Gerar feedback"}
            </Button>
          </CardContent>
        </Card>
      )}

      {(generated || finalText) && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Feedback</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <Textarea rows={16} value={finalText} onChange={(e) => setFinalText(e.target.value)} className="font-mono text-sm" />
            ) : (
              <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm">{finalText}</div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleCopy}><Copy className="mr-2 h-4 w-4" /> Copiar feedback</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>{editing ? "Visualizar" : "Editar"}</Button>
              <Button size="sm" variant="outline" disabled={generating} onClick={() => handleGenerate("curto")}>Deixar mais curto</Button>
              <Button size="sm" variant="outline" disabled={generating} onClick={() => handleGenerate("direto")}>Deixar mais direto</Button>
              <Button size="sm" variant="outline" disabled={generating} onClick={() => handleGenerate("motivador")}>Deixar mais motivador</Button>
              <Button size="sm" variant="outline" disabled={generating} onClick={() => handleGenerate("outra_versao")}>Gerar outra versão</Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Foco principal do próximo mês</Label>
                <Input value={nextFocus} onChange={(e) => setNextFocus(e.target.value)} placeholder="Ex.: Implicação no SPIN" />
              </div>
              <div className="space-y-1.5">
                <Label>Ação combinada (opcional)</Label>
                <Input value={agreedAction} onChange={(e) => setAgreedAction(e.target.value)} placeholder="Ex.: enviar uma entrevista por semana para análise." />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <Switch id="shared" checked={shared} onCheckedChange={setShared} />
                <Label htmlFor="shared" className="cursor-pointer">Compartilhado com o colaborador?</Label>
                <span className="text-xs text-muted-foreground">{shared ? "Sim" : "Não"}</span>
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {editingId ? "Salvar alterações" : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sellerId && (
        <Collapsible>
          <Card>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between p-4 text-left">
                <span className="text-base font-semibold">Histórico de feedbacks</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                {historyQuery.isLoading && <Skeleton className="h-16 w-full" />}
                {historyQuery.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum feedback salvo para este colaborador.</p>
                )}
                {(historyQuery.data ?? []).map((row) => (
                  <div key={row.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{row.period_label || formatRangeLabel({ start: row.period_start, end: row.period_end })}</span>
                      <Badge variant="outline">{TONE_LABEL[(row.tone as FeedbackTone) ?? "equilibrado"]}</Badge>
                      <Badge variant={row.shared_with_collaborator ? "default" : "secondary"}>
                        {row.shared_with_collaborator ? "Compartilhado" : "Privado"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{shareStatusLabel(row)}</span>
                      <span className="text-xs text-muted-foreground">
                        Reunião: {row.meeting_date ? formatRangeLabel({ start: row.meeting_date, end: row.meeting_date }) : "—"}
                      </span>
                    </div>
                    {row.next_focus && <div className="mt-1 text-xs text-muted-foreground">Foco: {row.next_focus}</div>}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-primary">Abrir feedback</summary>
                      <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">
                        {row.final_feedback || row.generated_feedback}
                      </div>
                    </details>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={async () => {
                        await navigator.clipboard.writeText((row.final_feedback || row.generated_feedback).trim());
                        toast.success("Feedback copiado.");
                      }}>Copiar</Button>
                      <Button size="sm" variant="outline" onClick={() => loadIntoForm(row)}>Editar</Button>
                      {row.shared_with_collaborator ? (
                        <Button size="sm" variant="outline" onClick={() => void handleShare(row.id, false)}>
                          Retirar compartilhamento
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => void handleShare(row.id, true)}>
                          <Send className="mr-1 h-4 w-4" /> Compartilhar com o colaborador
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(row.id)}>
                        <Trash2 className="mr-1 h-4 w-4" /> Excluir
                      </Button>
                    </div>

                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  cur,
  prev,
  avg,
  goal,
  invert,
  hint,
}: {
  label: string;
  value: string;
  cur: number | null;
  prev: number | null;
  avg: number | null;
  goal?: number | null;
  invert?: boolean;
  hint?: string;
}) {
  const trend = trendOf(cur, prev);
  const rel = vsAverage(cur, avg);
  const good = invert ? trend === "down" : trend === "up";
  const bad = invert ? trend === "up" : trend === "down";
  const TrendIcon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-1.5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          {hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Como este indicador é calculado: ${label}`}
                  className="mt-0.5 text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                {hint}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className={good ? "text-emerald-600" : bad ? "text-rose-600" : "text-muted-foreground"}>
            <TrendIcon className="mr-1 inline h-3 w-3" />
            {TREND_LABEL[trend]}
          </span>
          {rel && <Badge variant="secondary" className="text-[10px]">{VS_AVERAGE_LABEL[rel]}</Badge>}
          {goal ? <span className="text-muted-foreground">meta {fmtNum(goal)}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
