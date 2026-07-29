import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useTeams, primaryTeamId, teamParam, ALL_TEAMS } from "@/lib/teams";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Crown, Trophy, ChevronLeft, ChevronRight, Info, Landmark, Sparkles, Clapperboard,
  Lock, Unlock, RefreshCw, X, ArrowLeft, Share2,
} from "lucide-react";
import {
  MONTH_NAMES, monthLabel, monthRange, currentMonthYear, isCurrentMonth, isFutureMonth,
  daysToMonthEnd, fetchMonthRanking, computeCategories, highlightOf, TIEBREAKERS,
  fetchHallRecord, fetchHallHistory, closeMonth, reopenMonth,
  type RankedRow, type CategoryWinner, type HallRecord,
} from "@/lib/hall-of-fame";
import { fmtScore, POINTS_LEGEND } from "@/lib/scoring";
import { ShareAchievementDialog } from "@/components/hall/ShareAchievementDialog";
import type { ShareSubject } from "@/lib/achievement-share";


export const Route = createFileRoute("/_authenticated/placar-hall-da-fama")({
  component: HallDaFama,
});

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function Avatar({ row, size = "h-20 w-20", ring = "border-white/20" }: { row: { nome: string; avatar_url: string | null }; size?: string; ring?: string }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-full border-2 ${ring} bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center font-bold`}>
      {row.avatar_url
        ? <img src={row.avatar_url} alt={row.nome} className="h-full w-full object-cover" />
        : <span>{initials(row.nome)}</span>}
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 40 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      dur: 2.4 + Math.random() * 1.6,
      color: ["#facc15", "#f59e0b", "#fb923c", "#fde68a", "#ffffff"][i % 5],
    })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-[-10%] block h-2 w-2 rounded-[1px] opacity-90"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animation: `hof-fall ${p.dur}s linear ${p.delay}s forwards`,
          }}
        />
      ))}
      <style>{`@keyframes hof-fall{to{transform:translateY(110vh) rotate(540deg);opacity:0}}`}</style>
    </div>
  );
}

function HallDaFama() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const qc = useQueryClient();

  const cur = currentMonthYear();
  const [year, setYear] = useState(cur.year);
  const [month, setMonth] = useState(cur.month);

  const { data: teams = [] } = useTeams();
  const [teamSel, setTeamSel] = useState<string>("");
  const effectiveTeam = teamSel || primaryTeamId(teams) || ALL_TEAMS;
  const teamId = teamParam(effectiveTeam);

  const running = isCurrentMonth(year, month);

  const { data: record, isLoading: loadingRecord } = useQuery({
    queryKey: ["hof_record", year, month],
    queryFn: () => fetchHallRecord(year, month),
  });

  const { data: liveRanking = [], isLoading: loadingLive } = useQuery({
    queryKey: ["hof_ranking", year, month, effectiveTeam],
    queryFn: () => fetchMonthRanking({ year, month, teamId, withActiveDays: true }),
    refetchInterval: running ? 60_000 : false,
  });

  const prevMonthRef = useMemo(() => {
    const d = new Date(year, month - 2, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, [year, month]);

  const { data: prevRanking = [] } = useQuery({
    queryKey: ["hof_ranking", prevMonthRef.year, prevMonthRef.month, effectiveTeam],
    queryFn: () => fetchMonthRanking({ year: prevMonthRef.year, month: prevMonthRef.month, teamId }),
  });

  const isClosed = !!record && record.status === "closed";
  const ranking: RankedRow[] = isClosed ? (record!.ranking_snapshot ?? []) : liveRanking;
  const categories: CategoryWinner[] = useMemo(
    () => (isClosed ? (record!.category_winners ?? []) : computeCategories(liveRanking, prevRanking)),
    [isClosed, record, liveRanking, prevRanking],
  );

  // Confete apenas na primeira visualização de um resultado oficial.
  const [confetti, setConfetti] = useState(false);
  useEffect(() => {
    if (!isClosed || !record) return;
    const key = `hof-seen-${record.id}`;
    if (typeof window === "undefined" || localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    setConfetti(true);
    const t = setTimeout(() => setConfetti(false), 4500);
    return () => clearTimeout(t);
  }, [isClosed, record]);

  // Fechamento automático do mês anterior no primeiro acesso (somente admin).
  useEffect(() => {
    if (!isAdmin) return;
    const prev = (() => { const d = new Date(cur.year, cur.month - 2, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; })();
    let cancelled = false;
    void (async () => {
      const existing = await fetchHallRecord(prev.year, prev.month);
      if (cancelled || existing) return;
      const rk = await fetchMonthRanking({ year: prev.year, month: prev.month, teamId, withActiveDays: true });
      if (cancelled || rk.length === 0) return;
      const before = await fetchMonthRanking({
        year: new Date(prev.year, prev.month - 2, 1).getFullYear(),
        month: new Date(prev.year, prev.month - 2, 1).getMonth() + 1,
        teamId,
      });
      await closeMonth({ year: prev.year, month: prev.month, ranking: rk, categories: computeCategories(rk, before), userId: user?.id ?? null });
      if (!cancelled) void qc.invalidateQueries({ queryKey: ["hof_record"] });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, teamId]);

  const { data: history = [] } = useQuery({ queryKey: ["hof_history"], queryFn: fetchHallHistory });

  const champion = ranking[0];
  const gapToSecond = ranking.length > 1 ? (ranking[0].score - ranking[1].score) : null;

  const goMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    if (isFutureMonth(d.getFullYear(), d.getMonth() + 1)) return;
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const [ceremony, setCeremony] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Compartilhamento de conquistas: cada vendedor compartilha a própria; admin pode compartilhar qualquer uma.
  const [share, setShare] = useState<ShareSubject | null>(null);
  const canShare = (id: string) => isAdmin || user?.id === id;
  const shareSolo = (row: RankedRow, position: number) =>
    setShare({ kind: "solo", position, person: { id: row.vendedor_id, nome: row.nome, avatar_url: row.avatar_url } });
  const shareTop3 = () =>
    setShare({
      kind: "top3",
      people: ranking.slice(0, 3).map((r) => ({ id: r.vendedor_id, nome: r.nome, avatar_url: r.avatar_url })),
    });


  const doClose = async () => {
    setBusy(true);
    try {
      const rec = await closeMonth({ year, month, ranking: liveRanking, categories, userId: user?.id ?? null, existing: record ?? null });
      if (!rec) toast.error("Sem dados suficientes para fechar o mês.");
      else toast.success(`Resultado oficial de ${monthLabel(year, month)} registrado.`);
      void qc.invalidateQueries({ queryKey: ["hof_record"] });
      void qc.invalidateQueries({ queryKey: ["hof_history"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const doReopen = async () => {
    if (!record) return;
    setBusy(true);
    try {
      await reopenMonth(record.id, user?.id ?? null, record);
      toast.success("Fechamento reaberto. Você pode recalcular o resultado.");
      setReopenOpen(false);
      void qc.invalidateQueries({ queryKey: ["hof_record"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const loading = loadingRecord || loadingLive;

  if (ceremony) {
    return <Ceremony ranking={ranking} categories={categories} periodLabel={monthLabel(year, month)} onExit={() => setCeremony(false)} />;
  }

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
        {confetti && <Confetti />}

        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/80 px-4 md:px-6 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Landmark className="h-6 w-6 text-amber-400" />
              <div>
                <div className="text-base md:text-xl font-black tracking-tight">🏛️ HALL DA FAMA COMERCIAL</div>
                <div className="text-[11px] md:text-xs uppercase tracking-widest text-white/60">Resultados passam. Legados ficam.</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-white/20 px-1">
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => goMonth(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[130px] text-center text-sm font-semibold">{monthLabel(year, month)}</span>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10 disabled:opacity-30"
                  disabled={isCurrentMonth(year, month)}
                  onClick={() => goMonth(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-9 w-[130px] border-white/20 bg-transparent text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)} disabled={isFutureMonth(year, i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => { const y = Number(v); setYear(y); if (isFutureMonth(y, month)) setMonth(currentMonthYear().month); }}>
                <SelectTrigger className="h-9 w-[100px] border-white/20 bg-transparent text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => cur.year - i).map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin && teams.length > 1 && (
                <Select value={effectiveTeam} onValueChange={setTeamSel}>
                  <SelectTrigger className="h-9 w-[170px] border-white/20 bg-transparent text-white"><SelectValue placeholder="Equipe" /></SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    <SelectItem value={ALL_TEAMS}>Todas as equipes</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {isAdmin && ranking.length > 0 && (
                <Button size="sm" variant="outline" className="border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20" onClick={() => setCeremony(true)}>
                  <Clapperboard className="mr-1 h-4 w-4" /> Iniciar cerimônia
                </Button>
              )}
              <Link to="/placar-diario">
                <Button size="sm" variant="ghost" className="text-white hover:bg-white/10">
                  <ArrowLeft className="mr-1 h-4 w-4" /> Placar
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1600px] space-y-6 px-4 md:px-6 py-6">
          {/* Status do período */}
          <div className={`rounded-2xl border p-4 ${isClosed ? "border-emerald-400/30 bg-emerald-500/10" : "border-amber-400/30 bg-amber-500/10"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">
                  {isClosed ? "✅ Resultado oficial" : running ? "⏳ Resultado parcial — o mês ainda não foi encerrado" : "⏳ Resultado parcial — mês não fechado oficialmente"}
                </div>
                <div className="text-xs text-white/70">
                  Período: {monthRange(year, month).start.split("-").reverse().join("/")} a {monthRange(year, month).end.split("-").reverse().join("/")} · America/Sao_Paulo
                  {running && ` · Faltam ${daysToMonthEnd()} dia(s) para o fechamento de ${MONTH_NAMES[month - 1].toLowerCase()}.`}
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  {!isClosed && !running && ranking.length > 0 && (
                    <Button size="sm" disabled={busy} onClick={doClose} className="bg-amber-500 text-slate-900 hover:bg-amber-400">
                      {record ? <RefreshCw className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}
                      {record ? "Recalcular resultado" : "Fechar mês"}
                    </Button>
                  )}
                  {isClosed && (
                    <Button size="sm" variant="outline" disabled={busy} className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => setReopenOpen(true)}>
                      <Unlock className="mr-1 h-4 w-4" /> Reabrir fechamento
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {loading && <p className="text-white/60">Carregando resultados…</p>}

          {!loading && ranking.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/70">
              Ainda não existem atividades registradas neste período.
            </div>
          )}

          {ranking.length > 0 && champion && (
            <>
              {/* Campeão */}
              <div className="relative overflow-hidden rounded-3xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/25 via-amber-500/5 to-transparent p-5 md:p-8 shadow-[0_0_60px_-15px_rgba(251,191,36,0.5)]">
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-400/20 blur-3xl" />
                <div className="relative flex flex-col items-center gap-6 md:flex-row md:items-start">
                  <div className="relative">
                    <Crown className="absolute -top-6 left-1/2 h-9 w-9 -translate-x-1/2 text-amber-300 drop-shadow" />
                    <Avatar row={champion} size="h-28 w-28 md:h-36 md:w-36 text-3xl" ring="border-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1 text-center md:text-left">
                    <div className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">
                      {isClosed ? `👑 Campeão de ${MONTH_NAMES[month - 1]}` : `👑 Líder atual de ${MONTH_NAMES[month - 1].toLowerCase()}`}
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black tracking-tight">{champion.nome}</h1>
                    <div className="mt-1 flex items-center justify-center gap-2 md:justify-start">
                      <Trophy className="h-6 w-6 text-amber-400" />
                      <span className="text-3xl md:text-4xl font-black tabular-nums text-amber-300">{fmtScore(champion.score)}</span>
                      <span className="text-sm text-white/60">pontos</span>
                    </div>
                    <p className="mt-2 text-sm text-white/80">
                      {isClosed
                        ? `👑 ${champion.nome} entrou para a história. Campeão comercial de ${monthLabel(year, month)}.`
                        : gapToSecond === null
                          ? "Único vendedor com atividade no período."
                          : gapToSecond === 0
                            ? "A liderança está empatada."
                            : `${champion.nome.split(" ")[0]} está ${fmtScore(gapToSecond)} pontos à frente de ${ranking[1].nome.split(" ")[0]}.`}
                    </p>
                    <p className="mt-1 text-xs text-amber-200/90">Principal destaque: {highlightOf(champion)}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      <MiniStat label="Ligações" value={champion.ligacoes_feitas} />
                      <MiniStat label="Atendidos" value={champion.ligacoes_atendidas} />
                      <MiniStat label="Interessados" value={champion.interessados_gerados} />
                      <MiniStat label="Agendadas" value={champion.entrevistas_marcadas} />
                      <MiniStat label="Realizadas" value={champion.entrevistas_realizadas ?? 0} />
                      <MiniStat label="Matrículas" value={champion.matriculas} />
                    </div>
                    {canShare(champion.vendedor_id) && (
                      <Button
                        size="sm"
                        className="mt-4 bg-amber-500 text-slate-950 hover:bg-amber-400"
                        onClick={() => shareSolo(champion, 1)}
                      >
                        <Share2 className="mr-1 h-4 w-4" /> 📲 Compartilhar conquista
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Pódio Top 3 */}
              <Podium ranking={ranking} canShare={canShare} onShare={shareSolo} onShareTop3={shareTop3} />


              {/* Destaques */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                  <h2 className="text-lg font-bold">🔥 Destaques do mês</h2>
                  <InfoTip
                    title="Critérios de desempate"
                    lines={["Maior número de matrículas", "Maior número de entrevistas realizadas", "Maior pontuação total", "Ordem alfabética"]}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {categories.map((c) => <CategoryCard key={c.key} c={c} />)}
                </div>
              </div>

              {/* Ranking completo do mês */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-bold">Ranking completo do mês</h2>
                  <InfoTip title="Critérios de desempate do ranking" lines={TIEBREAKERS} />
                  <span className="ml-auto hidden text-xs text-white/50 md:block">Pontuação: {POINTS_LEGEND}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-white/50">
                      <tr>
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">Vendedor</th>
                        <th className="p-2 text-right">Lig.</th>
                        <th className="p-2 text-right">Atend.</th>
                        <th className="p-2 text-right">Interes.</th>
                        <th className="p-2 text-right">Agend.</th>
                        <th className="p-2 text-right">Realiz.</th>
                        <th className="p-2 text-right">Matríc.</th>
                        <th className="p-2 text-right">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r, i) => (
                        <tr key={r.vendedor_id} className="border-t border-white/5">
                          <td className="p-2 font-bold text-white/60">{i + 1}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <Avatar row={r} size="h-8 w-8 text-xs" />
                              <span className="font-medium">{r.nome}</span>
                            </div>
                          </td>
                          <td className="p-2 text-right tabular-nums">{r.ligacoes_feitas}</td>
                          <td className="p-2 text-right tabular-nums">{r.ligacoes_atendidas}</td>
                          <td className="p-2 text-right tabular-nums">{r.interessados_gerados}</td>
                          <td className="p-2 text-right tabular-nums">{r.entrevistas_marcadas}</td>
                          <td className="p-2 text-right tabular-nums">{r.entrevistas_realizadas ?? 0}</td>
                          <td className="p-2 text-right tabular-nums">{r.matriculas}</td>
                          <td className="p-2 text-right font-black tabular-nums text-amber-300">{fmtScore(r.score)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Galeria de campeões */}
          <ChampionsGallery
            history={history}
            onOpen={(h) => { setYear(h.reference_year); setMonth(h.reference_month); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        </div>

        <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reabrir fechamento</DialogTitle>
              <DialogDescription>
                Esta ação permitirá recalcular o resultado oficial do mês. Deseja continuar?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancelar</Button>
              <Button disabled={busy} onClick={doReopen}>Reabrir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="text-xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function InfoTip({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-white/50 hover:text-white"><Info className="h-4 w-4" /></button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="text-xs font-semibold">{title}</div>
        <ol className="ml-4 list-decimal text-xs">{lines.map((l) => <li key={l}>{l}</li>)}</ol>
      </TooltipContent>
    </Tooltip>
  );
}

const PODIUM_STYLES = [
  { ring: "border-amber-400", bg: "from-amber-500/25", label: "1º lugar", medal: "🥇", height: "md:mt-0", text: "text-amber-300" },
  { ring: "border-slate-300", bg: "from-slate-300/20", label: "2º lugar", medal: "🥈", height: "md:mt-10", text: "text-slate-200" },
  { ring: "border-amber-700", bg: "from-amber-700/25", label: "3º lugar", medal: "🥉", height: "md:mt-16", text: "text-amber-600" },
];

type ShareHandlers = {
  canShare?: (id: string) => boolean;
  onShare?: (row: RankedRow, position: number) => void;
  onShareTop3?: () => void;
};

function PodiumCard({ row, place, canShare, onShare }: { row: RankedRow; place: number } & ShareHandlers) {
  const s = PODIUM_STYLES[place];
  return (
    <div className={`flex flex-col items-center rounded-2xl border border-white/10 bg-gradient-to-b ${s.bg} to-transparent p-5 ${s.height}`}>
      <div className="text-3xl">{s.medal}</div>
      <Avatar row={row} size={place === 0 ? "h-24 w-24 text-2xl" : "h-20 w-20 text-xl"} ring={s.ring} />
      <div className={`mt-2 text-xs font-bold uppercase tracking-widest ${s.text}`}>{s.label}</div>
      <div className="text-center text-lg font-black leading-tight">{row.nome}</div>
      <div className={`text-3xl font-black tabular-nums ${s.text}`}>{fmtScore(row.score)}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50">pontos</div>
      <div className="mt-2 flex gap-3 text-xs text-white/70">
        <span>🎓 {row.matriculas} matrículas</span>
        <span>🎯 {row.entrevistas_realizadas ?? 0} realizadas</span>
      </div>
      <p className="mt-1 text-center text-[11px] text-white/60">Destaque: {highlightOf(row)}</p>
      {onShare && canShare?.(row.vendedor_id) && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 border-white/20 bg-white/5 text-white hover:bg-white/15"
          onClick={() => onShare(row, place + 1)}
        >
          <Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar
        </Button>
      )}
    </div>
  );
}

function Podium({ ranking, canShare, onShare, onShareTop3 }: { ranking: RankedRow[] } & ShareHandlers) {
  const top = ranking.slice(0, 3);
  // Desktop: 2º | 1º | 3º — Mobile: 1º, 2º, 3º
  const desktopOrder = [top[1], top[0], top[2]].filter(Boolean) as RankedRow[];
  const placeOf = (r: RankedRow) => top.findIndex((t) => t.vendedor_id === r.vendedor_id);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Crown className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-bold">Pódio do mês — Top {top.length}</h2>
        {onShareTop3 && top.length === 3 && (
          <Button size="sm" variant="ghost" className="ml-auto text-white/80 hover:text-white" onClick={onShareTop3}>
            <Share2 className="mr-1 h-4 w-4" /> Compartilhar Top 3
          </Button>
        )}
      </div>
      <div className="hidden gap-4 md:grid" style={{ gridTemplateColumns: `repeat(${desktopOrder.length}, minmax(0,1fr))` }}>
        {desktopOrder.map((r) => (
          <PodiumCard key={r.vendedor_id} row={r} place={placeOf(r)} canShare={canShare} onShare={onShare} />
        ))}
      </div>
      <div className="grid gap-4 md:hidden">
        {top.map((r, i) => <PodiumCard key={r.vendedor_id} row={r} place={i} canShare={canShare} onShare={onShare} />)}
      </div>
    </div>
  );
}


function CategoryCard({ c }: { c: CategoryWinner }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">{c.icon}</span>
        <span className="text-sm font-bold">{c.label}</span>
        <span className="ml-auto text-sm font-black text-amber-300">{c.valueLabel}</span>
        <InfoTip title={c.label} lines={[c.description, "Desempate: matrículas → entrevistas realizadas → pontuação → ordem alfabética"]} />
      </div>
      {c.winners.length === 0 ? (
        <p className="mt-2 text-xs text-white/50">{c.empty ?? "Sem dados no período."}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {c.winners.map((w) => (
            <div key={w.vendedor_id} className="flex items-center gap-2">
              <Avatar row={w} size="h-8 w-8 text-xs" />
              <span className="truncate text-sm">{w.nome}</span>
            </div>
          ))}
          {c.winners.length > 1 && <p className="text-[11px] text-white/50">Empate técnico entre os vendedores acima.</p>}
        </div>
      )}
    </div>
  );
}

function ChampionsGallery({ history, onOpen }: { history: HallRecord[]; onOpen: (h: HallRecord) => void }) {
  const [yearFilter, setYearFilter] = useState("all");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [placeFilter, setPlaceFilter] = useState("all");

  const years = useMemo(() => Array.from(new Set(history.map((h) => h.reference_year))).sort((a, b) => b - a), [history]);
  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of history) for (const r of h.ranking_snapshot?.slice(0, 3) ?? []) map.set(r.vendedor_id, r.nome);
    return [...map.entries()];
  }, [history]);

  const filtered = history.filter((h) => {
    if (yearFilter !== "all" && String(h.reference_year) !== yearFilter) return false;
    if (sellerFilter !== "all") {
      const idx = (h.ranking_snapshot ?? []).slice(0, 3).findIndex((r) => r.vendedor_id === sellerFilter);
      if (idx < 0) return false;
      if (placeFilter !== "all" && String(idx + 1) !== placeFilter) return false;
    } else if (placeFilter !== "all") {
      if (!(h.ranking_snapshot ?? [])[Number(placeFilter) - 1]) return false;
    }
    return true;
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-bold">🏆 Galeria de Campeões</h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="h-8 w-[110px] border-white/20 bg-transparent text-white text-xs"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="h-8 w-[160px] border-white/20 bg-transparent text-white text-xs"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {sellers.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={placeFilter} onValueChange={setPlaceFilter}>
            <SelectTrigger className="h-8 w-[130px] border-white/20 bg-transparent text-white text-xs"><SelectValue placeholder="Colocação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas colocações</SelectItem>
              <SelectItem value="1">1º lugar</SelectItem>
              <SelectItem value="2">2º lugar</SelectItem>
              <SelectItem value="3">3º lugar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-white/60">Nenhum mês fechado ainda. Os campeões aparecem aqui após o fechamento mensal.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((h) => {
            const snap = h.ranking_snapshot ?? [];
            const champ = snap[0];
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => onOpen(h)}
                className="rounded-xl border border-white/10 bg-slate-950/40 p-4 text-left transition hover:border-amber-400/50 hover:bg-amber-500/10"
              >
                <div className="text-xs uppercase tracking-widest text-amber-300">{monthLabel(h.reference_year, h.reference_month)}</div>
                {champ ? (
                  <>
                    <div className="mt-2 flex items-center gap-3">
                      <Avatar row={champ} size="h-12 w-12 text-sm" ring="border-amber-400" />
                      <div className="min-w-0">
                        <div className="truncate font-bold">👑 {champ.nome}</div>
                        <div className="text-xs text-white/60">{fmtScore(champ.score)} pontos · 🎓 {champ.matriculas} matrículas</div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-0.5 text-xs text-white/60">
                      {snap[1] && <div>🥈 {snap[1].nome} — {fmtScore(snap[1].score)} pts</div>}
                      {snap[2] && <div>🥉 {snap[2].nome} — {fmtScore(snap[2].score)} pts</div>}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-white/50">Sem ranking registrado.</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Ceremony({
  ranking, categories, periodLabel, onExit,
}: { ranking: RankedRow[]; categories: CategoryWinner[]; periodLabel: string; onExit: () => void }) {
  const [step, setStep] = useState(0);
  const top = ranking.slice(0, 3);
  const steps: Array<() => React.ReactNode> = [
    () => (
      <div className="text-center">
        <Landmark className="mx-auto h-16 w-16 text-amber-400" />
        <h1 className="mt-4 text-4xl md:text-7xl font-black tracking-tight">HALL DA FAMA COMERCIAL</h1>
        <p className="mt-3 text-lg md:text-2xl text-white/70">{periodLabel}</p>
        <p className="mt-6 text-sm text-white/50">Clique para começar</p>
      </div>
    ),
    () => (
      <div className="w-full max-w-5xl">
        <h2 className="mb-6 text-center text-3xl md:text-5xl font-black">🔥 Destaques do mês</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => <CategoryCard key={c.key} c={c} />)}
        </div>
      </div>
    ),
    ...[2, 1, 0].filter((i) => top[i]).map((i) => () => (
      <div className="text-center animate-in fade-in zoom-in duration-500">
        <div className="text-2xl md:text-4xl font-bold text-white/70">{i === 0 ? "👑 O CAMPEÃO" : i === 1 ? "🥈 Vice-campeão" : "🥉 Terceiro lugar"}</div>
        <div className="mt-6 flex flex-col items-center gap-4">
          <Avatar row={top[i]} size="h-40 w-40 text-5xl" ring={i === 0 ? "border-amber-400" : i === 1 ? "border-slate-300" : "border-amber-700"} />
          <div className="text-4xl md:text-6xl font-black">{top[i].nome}</div>
          <div className="text-5xl md:text-7xl font-black text-amber-300 tabular-nums">{fmtScore(top[i].score)}</div>
          <div className="text-sm uppercase tracking-widest text-white/50">pontos · {highlightOf(top[i])}</div>
        </div>
      </div>
    )),
    () => (
      <div className="w-full max-w-5xl">
        <h2 className="mb-6 text-center text-3xl md:text-5xl font-black">🏆 Top {top.length} — {periodLabel}</h2>
        <Podium ranking={ranking} />
      </div>
    ),
  ];
  const last = step >= steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-white"
      onClick={() => !last && setStep((s) => s + 1)}
    >
      {step >= 2 && step < steps.length - 1 && <Confetti />}
      <div className="w-full flex justify-center">{steps[step]()}</div>
      <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 gap-3" onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={onExit}>
          <X className="mr-1 h-4 w-4" /> Sair da cerimônia
        </Button>
        <Button disabled={last} className="bg-amber-500 text-slate-900 hover:bg-amber-400" onClick={() => setStep((s) => s + 1)}>
          Próximo <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
      <div className="fixed left-6 bottom-6 text-xs text-white/40">Etapa {step + 1} de {steps.length}</div>
    </div>
  );
}
