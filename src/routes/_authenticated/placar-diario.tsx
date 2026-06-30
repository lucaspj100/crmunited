import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchProductivity, periodRange, type Period, type ProductivityRow } from "@/lib/productivity";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Phone, PhoneCall, Sparkles, CalendarCheck, GraduationCap, Trophy, Maximize2, X, Flame, Target, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/placar-diario")({
  component: PlacarDiario,
});

// Pontuação por ação
const POINTS = { call: 1, answered: 2, interested: 5, interview: 10, enrollment: 30 };
// Metas diárias do time (somatório de todos os vendedores)
const TEAM_GOALS = { ligacoes: 500, entrevistas: 20, matriculas: 5 };

function scoreOf(r: ProductivityRow) {
  return (
    r.ligacoes_feitas * POINTS.call +
    r.ligacoes_atendidas * POINTS.answered +
    r.interessados_gerados * POINTS.interested +
    r.entrevistas_marcadas * POINTS.interview +
    r.matriculas * POINTS.enrollment
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function PlacarDiario() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");

  const [period, setPeriod] = useState<Period>("hoje");
  const [now, setNow] = useState(new Date());
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const range = useMemo(() => periodRange(period), [period]);

  const { data: rowsRaw = [], dataUpdatedAt } = useQuery({
    enabled: isAdmin,
    queryKey: ["placar_diario", range.start, range.end],
    queryFn: () => fetchProductivity({ start: range.start, end: range.end, vendedorId: null }),
    refetchInterval: 30_000,
  });

  // Realtime: atualiza assim que houver nova tentativa ou mudança de lead
  const qc = (useQuery as unknown as { getClient?: () => unknown }) && undefined; // no-op marker
  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase
      .channel("placar-diario")
      .on("postgres_changes", { event: "*", schema: "public", table: "prospect_attempts" }, () => {
        void (async () => {
          const { data } = await supabase.rpc("productivity_summary" as never, {
            _start: range.start, _end: range.end, _vendedor_id: null,
          } as never);
          if (Array.isArray(data)) setLive(data as unknown as ProductivityRow[]);
        })();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, () => {
        void (async () => {
          const { data } = await supabase.rpc("productivity_summary" as never, {
            _start: range.start, _end: range.end, _vendedor_id: null,
          } as never);
          if (Array.isArray(data)) setLive(data as unknown as ProductivityRow[]);
        })();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin, range.start, range.end]);

  const [live, setLive] = useState<ProductivityRow[] | null>(null);
  const rows = (live ?? rowsRaw) as ProductivityRow[];

  const ranked = useMemo(() => {
    return [...rows]
      .map((r) => ({ ...r, score: scoreOf(r) }))
      .sort((a, b) => b.score - a.score);
  }, [rows]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      ligacoes: acc.ligacoes + r.ligacoes_feitas,
      atendidas: acc.atendidas + r.ligacoes_atendidas,
      interessados: acc.interessados + r.interessados_gerados,
      entrevistas: acc.entrevistas + r.entrevistas_marcadas,
      matriculas: acc.matriculas + r.matriculas,
    }),
    { ligacoes: 0, atendidas: 0, interessados: 0, entrevistas: 0, matriculas: 0 },
  ), [rows]);

  const top = (key: keyof ProductivityRow) => {
    let best: ProductivityRow | null = null;
    for (const r of rows) {
      const v = r[key] as number;
      if (v > 0 && (!best || (best[key] as number) < v)) best = r;
    }
    return best;
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch { /* ignore */ }
  };

  if (!isAdmin) {
    return <p className="text-muted-foreground">Acesso restrito ao Placar Diário.</p>;
  }

  const lastUpdate = new Date(dataUpdatedAt || now);
  const dateLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-amber-400" />
          <div>
            <div className="text-xs uppercase tracking-widest text-white/60">Telão Comercial</div>
            <div className="text-lg font-bold leading-tight">Placar Comercial — {period === "hoje" ? "Hoje" : period === "semana" ? "Semana" : "Mês"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(["hoje", "semana", "mes"] as const).map((p) => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"}
              className={period === p ? "" : "border-white/20 bg-transparent text-white hover:bg-white/10"}
              onClick={() => setPeriod(p)}>
              {p === "hoje" ? "Hoje" : p === "semana" ? "Semana" : "Mês"}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={toggleFullscreen}>
            {fullscreen ? <X className="h-4 w-4 mr-1" /> : <Maximize2 className="h-4 w-4 mr-1" />}
            {fullscreen ? "Sair" : "Modo Telão"}
          </Button>
          <Link to="/dashboard">
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10">Voltar</Button>
          </Link>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-[1800px] mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm uppercase tracking-wider text-white/60">{dateLabel}</div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight">Vamos bater a meta de hoje 🚀</h1>
          </div>
          <div className="text-right text-xs text-white/60">
            <div>Atualizado em tempo real</div>
            <div>Última atualização: {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          </div>
        </div>

        {/* Totais do time */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <BigStat icon={<Phone className="h-5 w-5" />} label="Ligações" value={totals.ligacoes} color="from-sky-500/30 to-sky-700/10" />
          <BigStat icon={<PhoneCall className="h-5 w-5" />} label="Atendidas" value={totals.atendidas} color="from-emerald-500/30 to-emerald-700/10" />
          <BigStat icon={<Sparkles className="h-5 w-5" />} label="Interessados" value={totals.interessados} color="from-amber-500/30 to-amber-700/10" />
          <BigStat icon={<CalendarCheck className="h-5 w-5" />} label="Entrevistas" value={totals.entrevistas} color="from-violet-500/30 to-violet-700/10" />
          <BigStat icon={<GraduationCap className="h-5 w-5" />} label="Matrículas" value={totals.matriculas} color="from-rose-500/30 to-rose-700/10" />
        </div>

        {/* Metas */}
        {period === "hoje" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-bold">Metas do dia</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <GoalBar label="Ligações" value={totals.ligacoes} goal={TEAM_GOALS.ligacoes} />
              <GoalBar label="Entrevistas marcadas" value={totals.entrevistas} goal={TEAM_GOALS.entrevistas} />
              <GoalBar label="Matrículas" value={totals.matriculas} goal={TEAM_GOALS.matriculas} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-5">
          {/* Ranking */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-bold">Ranking de hoje</h2>
              <span className="text-xs text-white/50 ml-2">Pontuação: ligação 1 · atendida 2 · interessado 5 · entrevista 10 · matrícula 30</span>
            </div>
            <div className="space-y-2">
              {ranked.length === 0 && <p className="text-white/60 text-sm">Sem dados ainda.</p>}
              {ranked.map((r, idx) => (
                <div key={r.vendedor_id} className={`flex items-center gap-3 rounded-xl border border-white/10 p-3 ${idx === 0 ? "bg-gradient-to-r from-amber-500/20 to-transparent" : "bg-white/5"}`}>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black ${idx === 0 ? "bg-amber-400 text-slate-900" : idx === 1 ? "bg-slate-300 text-slate-900" : idx === 2 ? "bg-amber-700 text-white" : "bg-white/10 text-white/80"}`}>
                    {idx + 1}
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-600 font-bold">
                    {initials(r.nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.nome}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/70">
                      <span>📞 {r.ligacoes_feitas}</span>
                      <span>✅ {r.ligacoes_atendidas}</span>
                      <span>✨ {r.interessados_gerados}</span>
                      <span>📅 {r.entrevistas_marcadas}</span>
                      <span>🎓 {r.matriculas}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl md:text-3xl font-black tabular-nums">{r.score}</div>
                    <div className="text-[10px] uppercase tracking-wider text-white/50">pontos</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Destaques */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="h-5 w-5 text-orange-400" />
              <h2 className="text-lg font-bold">Destaques</h2>
            </div>
            <div className="space-y-3">
              <Highlight title="Mais ligações" row={top("ligacoes_feitas")} field="ligacoes_feitas" />
              <Highlight title="Mais atendidas" row={top("ligacoes_atendidas")} field="ligacoes_atendidas" />
              <Highlight title="Mais interessados" row={top("interessados_gerados")} field="interessados_gerados" />
              <Highlight title="Mais entrevistas" row={top("entrevistas_marcadas")} field="entrevistas_marcadas" />
              <Highlight title="Mais matrículas" row={top("matriculas")} field="matriculas" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BigStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${color} p-4`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/70">{icon}{label}</div>
      <div className="mt-2 text-4xl md:text-5xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function GoalBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min(100, (value / Math.max(1, goal)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm text-white/80">{label}</span>
        <span className="text-sm font-bold tabular-nums">{value} / {goal}</span>
      </div>
      <Progress value={pct} className="h-3 bg-white/10" />
      <div className="mt-1 text-[11px] text-white/50">{pct.toFixed(0)}% da meta</div>
    </div>
  );
}

function Highlight({ title, row, field }: { title: string; row: ProductivityRow | null; field: keyof ProductivityRow }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 font-bold text-slate-900">
        {row ? initials(row.nome) : "—"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-white/60">{title}</div>
        <div className="truncate font-semibold">{row?.nome ?? "—"}</div>
      </div>
      <div className="text-2xl font-black tabular-nums">{row ? (row[field] as number) : 0}</div>
    </div>
  );
}
