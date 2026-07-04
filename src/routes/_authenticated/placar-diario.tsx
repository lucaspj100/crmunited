import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchProductivity, periodRange, type Period, type ProductivityRow } from "@/lib/productivity";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Phone, PhoneCall, Sparkles, CalendarCheck, GraduationCap, Trophy, Maximize2, X, Flame, Target, Crown, Users, MessageCircle, Linkedin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Filtra usuários técnicos que não devem aparecer no placar/ranking
function isRealSeller(nome: string | null | undefined): boolean {
  if (!nome) return false;
  const n = nome.trim().toLowerCase();
  if (!n) return false;
  const blocked = ["placar", "telão", "telao", "teste", "test", "sistema", "admin"];
  return !blocked.some((b) => n === b || n.startsWith(b + " "));
}

export const Route = createFileRoute("/_authenticated/placar-diario")({
  component: PlacarDiario,
});

// Pontuação por ação
const POINTS = { call: 1, answered: 2, interested: 30, interview: 60, enrollment: 300, whatsapp: 0.1, linkedin: 0.1 };
// Metas diárias do time (somatório de todos os vendedores)
const TEAM_GOALS = { ligacoes: 500, entrevistas: 20, matriculas: 5 };

function scoreOf(r: ProductivityRow) {
  return (
    r.ligacoes_feitas * POINTS.call +
    r.ligacoes_atendidas * POINTS.answered +
    r.interessados_gerados * POINTS.interested +
    r.entrevistas_marcadas * POINTS.interview +
    r.matriculas * POINTS.enrollment +
    (r.whatsapps_checkout ?? 0) * POINTS.whatsapp +
    (r.linkedins_checkout ?? 0) * POINTS.linkedin
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function fmtScore(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
    enabled: true,
    queryKey: ["placar_diario", range.start, range.end],
    queryFn: () => fetchProductivity({ start: range.start, end: range.end, vendedorId: null }),
    refetchInterval: 30_000,
  });

  // Realtime: atualiza assim que houver nova tentativa ou mudança de lead
  const qc = (useQuery as unknown as { getClient?: () => unknown }) && undefined; // no-op marker
  useEffect(() => {
    // open to all authenticated
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
  }, [range.start, range.end]);

  const [live, setLive] = useState<ProductivityRow[] | null>(null);
  const rowsAll = (live ?? rowsRaw) as ProductivityRow[];
  // Filtra usuários técnicos (Placar, teste etc.) e deduplica por vendedor_id
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return rowsAll.filter((r) => {
      if (!isRealSeller(r.nome)) return false;
      if (seen.has(r.vendedor_id)) return false;
      seen.add(r.vendedor_id);
      return true;
    });
  }, [rowsAll]);

  const ranked = useMemo(() => {
    return [...rows]
      .map((r) => ({ ...r, score: scoreOf(r) }))
      .sort((a, b) => b.score - a.score);
  }, [rows]);

  const [selectedSeller, setSelectedSeller] = useState<(ProductivityRow & { score: number }) | null>(null);

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

        {/* Totais do time — apenas ADM/Franqueado */}
        {isAdmin && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <BigStat icon={<Phone className="h-5 w-5" />} label="Ligações" value={totals.ligacoes} color="from-sky-500/30 to-sky-700/10" />
            <BigStat icon={<PhoneCall className="h-5 w-5" />} label="Atendidas" value={totals.atendidas} color="from-emerald-500/30 to-emerald-700/10" />
            <BigStat icon={<Sparkles className="h-5 w-5" />} label="Interessados" value={totals.interessados} color="from-amber-500/30 to-amber-700/10" />
            <BigStat icon={<CalendarCheck className="h-5 w-5" />} label="Entrevistas" value={totals.entrevistas} color="from-violet-500/30 to-violet-700/10" />
            <BigStat icon={<GraduationCap className="h-5 w-5" />} label="Matrículas" value={totals.matriculas} color="from-rose-500/30 to-rose-700/10" />
          </div>
        )}

        {/* Metas — apenas ADM/Franqueado (dados consolidados da equipe) */}
        {isAdmin && period === "hoje" && (
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

        {/* Mensagem motivacional (todos) */}
        {!isAdmin && (
          <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent p-5">
            <div className="flex items-center gap-3">
              <Flame className="h-6 w-6 text-orange-400" />
              <div>
                <div className="text-xs uppercase tracking-widest text-white/60">Foco do dia</div>
                <div className="text-xl md:text-2xl font-bold">Cada ligação é uma nova chance. Bora fazer acontecer! 🚀</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-5">
          {/* Pódio - Top 3 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-bold">Pódio de hoje — Top 3</h2>
              <span className="text-xs text-white/50 ml-2">Pontuação: ligação 1 · atendida 2 · interessado 30 · entrevista 60 · matrícula 300 · WhatsApp 0,1 · LinkedIn 0,1</span>
            </div>
            <div className="space-y-3">
              {ranked.length === 0 && <p className="text-white/60 text-sm">Sem dados ainda.</p>}
              {ranked.slice(0, 3).map((r, idx) => {
                const medal = idx === 0 ? "bg-amber-400 text-slate-900" : idx === 1 ? "bg-slate-300 text-slate-900" : "bg-amber-700 text-white";
                const size = idx === 0 ? "h-20 w-20 text-2xl" : "h-16 w-16 text-xl";
                return (
                  <div key={r.vendedor_id} className={`flex items-center gap-4 rounded-xl border border-white/10 p-4 ${idx === 0 ? "bg-gradient-to-r from-amber-500/25 to-transparent" : "bg-white/5"}`}>
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-black text-xl ${medal}`}>
                      {idx + 1}
                    </div>
                    <div className={`shrink-0 overflow-hidden rounded-full border-2 ${idx === 0 ? "border-amber-400" : "border-white/20"} bg-gradient-to-br from-sky-500 to-violet-600 ${size} flex items-center justify-center font-bold`}>
                      {r.avatar_url
                        ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" />
                        : <span>{initials(r.nome)}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate font-bold ${idx === 0 ? "text-2xl" : "text-xl"}`}>{r.nome}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/70 mt-1">
                        <span>📞 {r.ligacoes_feitas}</span>
                        <span>✅ {r.ligacoes_atendidas}</span>
                        <span>✨ {r.interessados_gerados}</span>
                        <span>📅 {r.entrevistas_marcadas}</span>
                        <span>🎓 {r.matriculas}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-black tabular-nums ${idx === 0 ? "text-5xl" : "text-4xl"}`}>{fmtScore(r.score)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-white/50">pontos</div>
                    </div>
                  </div>
                );
              })}
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

        {/* Ranking completo da equipe — apenas ADM/Franqueado */}
        {isAdmin && (
          <FullRanking ranked={ranked} onSelect={(r) => setSelectedSeller(r)} />
        )}

        {/* Diagnóstico Comercial — apenas ADM/Franqueado */}
        {isAdmin && <AdmDiagnostic totals={totals} rows={rows} />}
      </div>

      <SellerDetailDialog
        seller={selectedSeller}
        period={period}
        onClose={() => setSelectedSeller(null)}
      />
    </div>
  );
}

function AdmDiagnostic({
  totals, rows,
}: {
  totals: { ligacoes: number; atendidas: number; interessados: number; entrevistas: number; matriculas: number };
  rows: ProductivityRow[];
}) {
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");
  const taxaAtend = pct(totals.atendidas, totals.ligacoes);
  const convInter = pct(totals.interessados, totals.ligacoes);
  const convEntrev = pct(totals.entrevistas, totals.interessados);
  const convMatr = pct(totals.matriculas, totals.entrevistas);

  const alerts: { nome: string; msg: string }[] = [];
  for (const r of rows) {
    const total = r.ligacoes_feitas + r.ligacoes_atendidas + r.interessados_gerados + r.entrevistas_marcadas + r.matriculas;
    if (total === 0) { alerts.push({ nome: r.nome, msg: "Sem atividade no dia" }); continue; }
    if (r.ligacoes_feitas >= 30 && r.ligacoes_atendidas / Math.max(1, r.ligacoes_feitas) < 0.15) {
      alerts.push({ nome: r.nome, msg: `Baixa taxa de atendimento (${r.ligacoes_atendidas}/${r.ligacoes_feitas})` });
    }
    if (r.ligacoes_atendidas >= 15 && r.interessados_gerados / Math.max(1, r.ligacoes_atendidas) < 0.1) {
      alerts.push({ nome: r.nome, msg: `Muitas atendidas, poucos interessados (${r.interessados_gerados}/${r.ligacoes_atendidas})` });
    }
    if (r.entrevistas_marcadas >= 3 && r.matriculas === 0) {
      alerts.push({ nome: r.nome, msg: `${r.entrevistas_marcadas} entrevistas sem matrícula` });
    }
  }

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-white/5 to-transparent p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-bold">Diagnóstico Comercial — Visão do ADM</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Taxa de atendimento" value={taxaAtend} hint="atendidas / ligações" />
        <KpiCard label="Ligação → Interessado" value={convInter} hint="interessados / ligações" />
        <KpiCard label="Interessado → Entrevista" value={convEntrev} hint="entrevistas / interessados" />
        <KpiCard label="Entrevista → Matrícula" value={convMatr} hint="matrículas / entrevistas" />
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Alertas de gargalo</div>
        {alerts.length === 0 ? (
          <div className="text-sm text-white/60">Sem gargalos identificados no período.</div>
        ) : (
          <ul className="space-y-1.5">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="font-semibold">{a.nome}</span>
                <span className="text-white/70">— {a.msg}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-wider text-white/60">{label}</div>
      <div className="mt-1 text-2xl md:text-3xl font-black tabular-nums">{value}</div>
      <div className="text-[10px] text-white/40">{hint}</div>
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
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-400 to-orange-600 font-bold text-slate-900">
        {row?.avatar_url
          ? <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
          : (row ? initials(row.nome) : "—")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-white/60">{title}</div>
        <div className="truncate font-semibold">{row?.nome ?? "—"}</div>
      </div>
      <div className="text-2xl font-black tabular-nums">{row ? (row[field] as number) : 0}</div>
    </div>
  );
}

type RankedRow = ProductivityRow & { score: number };

function FullRanking({ ranked, onSelect }: { ranked: RankedRow[]; onSelect: (r: RankedRow) => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-5 w-5 text-sky-400" />
        <h2 className="text-lg font-bold">Ranking completo da equipe</h2>
        <span className="text-xs text-white/50 ml-2">Clique em um vendedor para ver os detalhes</span>
      </div>
      {ranked.length === 0 ? (
        <p className="text-white/60 text-sm">Nenhum vendedor no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-white/50 border-b border-white/10">
                <th className="py-2 pr-2 w-10">#</th>
                <th className="py-2 pr-2">Vendedor</th>
                <th className="py-2 px-2 text-right">Ligações</th>
                <th className="py-2 px-2 text-right">Atend.</th>
                <th className="py-2 px-2 text-right">Interes.</th>
                <th className="py-2 px-2 text-right">Entrev.</th>
                <th className="py-2 px-2 text-right">Matr.</th>
                <th className="py-2 px-2 text-right">WA</th>
                <th className="py-2 px-2 text-right">LI</th>
                <th className="py-2 pl-2 text-right">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, idx) => (
                <tr
                  key={r.vendedor_id}
                  onClick={() => onSelect(r)}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="py-3 pr-2 font-bold text-white/70">{idx + 1}</td>
                  <td className="py-3 pr-2">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/20 bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center font-bold text-xs">
                        {r.avatar_url
                          ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" />
                          : <span>{initials(r.nome)}</span>}
                      </div>
                      <span className="font-semibold truncate">{r.nome}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums">{r.ligacoes_feitas}</td>
                  <td className="py-3 px-2 text-right tabular-nums">{r.ligacoes_atendidas}</td>
                  <td className="py-3 px-2 text-right tabular-nums">{r.interessados_gerados}</td>
                  <td className="py-3 px-2 text-right tabular-nums">{r.entrevistas_marcadas}</td>
                  <td className="py-3 px-2 text-right tabular-nums">{r.matriculas}</td>
                  <td className="py-3 px-2 text-right tabular-nums">{r.whatsapps_checkout ?? 0}</td>
                  <td className="py-3 px-2 text-right tabular-nums">{r.linkedins_checkout ?? 0}</td>
                  <td className="py-3 pl-2 text-right font-black tabular-nums text-amber-300">{fmtScore(r.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SellerDetailDialog({
  seller, period, onClose,
}: {
  seller: RankedRow | null;
  period: Period;
  onClose: () => void;
}) {
  const open = !!seller;
  const periodLabel = period === "hoje" ? "hoje" : period === "semana" ? "na semana" : "no mês";
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {seller ? `Resultados de ${seller.nome}` : ""}
            <span className="ml-2 text-xs font-normal text-muted-foreground">({periodLabel})</span>
          </DialogTitle>
        </DialogHeader>
        {seller && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-primary/30 bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center font-bold text-xl text-white">
                {seller.avatar_url
                  ? <img src={seller.avatar_url} alt="" className="h-full w-full object-cover" />
                  : <span>{initials(seller.nome)}</span>}
              </div>
              <div>
                <div className="text-lg font-bold">{seller.nome}</div>
                <div className="text-sm text-muted-foreground">{seller.email}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-3xl font-black tabular-nums">{fmtScore(seller.score)}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">pontos</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <DetailStat icon={<Phone className="h-4 w-4" />} label="Ligações" value={seller.ligacoes_feitas} />
              <DetailStat icon={<PhoneCall className="h-4 w-4" />} label="Atendidas" value={seller.ligacoes_atendidas} />
              <DetailStat icon={<Sparkles className="h-4 w-4" />} label="Interessados" value={seller.interessados_gerados} />
              <DetailStat icon={<CalendarCheck className="h-4 w-4" />} label="Entrevistas" value={seller.entrevistas_marcadas} />
              <DetailStat icon={<GraduationCap className="h-4 w-4" />} label="Matrículas" value={seller.matriculas} />
              <DetailStat icon={<MessageCircle className="h-4 w-4" />} label="WhatsApps" value={seller.whatsapps_checkout ?? 0} />
              <DetailStat icon={<Linkedin className="h-4 w-4" />} label="LinkedIns" value={seller.linkedins_checkout ?? 0} />
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Taxas de conversão</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <ConvCard label="Atendimento" value={pct(seller.ligacoes_atendidas, seller.ligacoes_feitas)} hint="atend / lig" />
                <ConvCard label="Lig → Interes." value={pct(seller.interessados_gerados, seller.ligacoes_feitas)} hint="interes / lig" />
                <ConvCard label="Interes → Entrev." value={pct(seller.entrevistas_marcadas, seller.interessados_gerados)} hint="entrev / interes" />
                <ConvCard label="Entrev → Matr." value={pct(seller.matriculas, seller.entrevistas_marcadas)} hint="matr / entrev" />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function ConvCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}
