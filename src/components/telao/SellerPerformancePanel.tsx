import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchProductivity, localIso, formatRangeLabel } from "@/lib/productivity";
import { scoreOf, fmtScore } from "@/lib/scoring";
import { useScoreSettings } from "@/lib/score-settings";
import { TelaoCard, SectionTitle, initials } from "@/components/telao/shared";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";

export type SeriesDay = {
  day: string; ligacoes: number; atendidas: number; interessados: number;
  marcadas: number; realizadas: number; matriculas: number; linkedin: number;
};
type Totals = Omit<SeriesDay, "day">;
const ZERO: Totals = { ligacoes: 0, atendidas: 0, interessados: 0, marcadas: 0, realizadas: 0, matriculas: 0, linkedin: 0 };

export function sumSeries(rows: SeriesDay[]): Totals {
  return rows.reduce<Totals>((a, r) => ({
    ligacoes: a.ligacoes + r.ligacoes, atendidas: a.atendidas + r.atendidas,
    interessados: a.interessados + r.interessados, marcadas: a.marcadas + r.marcadas,
    realizadas: a.realizadas + r.realizadas, matriculas: a.matriculas + r.matriculas,
    linkedin: a.linkedin + r.linkedin,
  }), { ...ZERO });
}

/** Variação % contra a base; null quando a base é zero ("sem base"). */
export function variation(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

/** Mês atual até hoje e o mesmo trecho do mês anterior (comparação justa). */
export function monthToDateRanges(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), prevLastDay));
  return {
    cur: { start: localIso(start), end: localIso(now) },
    prev: { start: localIso(prevStart), end: localIso(prevEnd) },
  };
}

async function fetchSeries(userId: string, start: string, end: string): Promise<SeriesDay[]> {
  const { data, error } = await supabase.rpc("seller_performance_series" as never, { _user_id: userId, _start: start, _end: end } as never);
  if (error) throw error;
  return (data ?? []) as unknown as SeriesDay[];
}

export type PanelSeller = { vendedor_id: string; nome: string; avatar_url: string | null };

export function SellerPerformancePanel({ seller, onClose }: { seller: PanelSeller | null; onClose: () => void }) {
  const open = !!seller;
  const { cur, prev } = monthToDateRanges();
  const { points } = useScoreSettings();
  const id = seller?.vendedor_id ?? "";

  const q = useQuery({
    queryKey: ["seller_panel", id, cur.start, cur.end],
    enabled: open,
    refetchInterval: open ? 60_000 : false,
    queryFn: async () => {
      const [sCur, sPrev, pCur, pPrev] = await Promise.all([
        fetchSeries(id, cur.start, cur.end),
        fetchSeries(id, prev.start, prev.end),
        fetchProductivity({ start: cur.start, end: cur.end, vendedorId: id }),
        fetchProductivity({ start: prev.start, end: prev.end, vendedorId: id }),
      ]);
      return {
        cur: sumSeries(sCur), prev: sumSeries(sPrev),
        scoreCur: pCur[0] ? scoreOf(pCur[0], points) : 0,
        scorePrev: pPrev[0] ? scoreOf(pPrev[0], points) : 0,
      };
    },
  });

  const d = q.data;
  const kpis: { label: string; cur: number; prev: number }[] = d ? [
    { label: "Matrículas", cur: d.cur.matriculas, prev: d.prev.matriculas },
    { label: "Realizadas", cur: d.cur.realizadas, prev: d.prev.realizadas },
    { label: "Agendadas", cur: d.cur.marcadas, prev: d.prev.marcadas },
    { label: "Interessados", cur: d.cur.interessados, prev: d.prev.interessados },
    { label: "Ligações", cur: d.cur.ligacoes, prev: d.prev.ligacoes },
    { label: "Atendidas", cur: d.cur.atendidas, prev: d.prev.atendidas },
    { label: "LinkedIn", cur: d.cur.linkedin, prev: d.prev.linkedin },
  ] : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] overflow-y-auto border-telao-border bg-telao-bg text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <BarChart3 className="h-5 w-5 text-telao-cyan" /> Painel de desempenho
          </DialogTitle>
        </DialogHeader>
        {seller && (
          <div className="space-y-4">
            <TelaoCard className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-telao-cyan/40 bg-telao-border text-xl font-bold">
                {seller.avatar_url ? <img src={seller.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(seller.nome)}
              </div>
              <div>
                <div className="text-xl font-black">{seller.nome}</div>
                <div className="text-xs text-white/60">
                  {formatRangeLabel(cur)} · comparado com {formatRangeLabel(prev)}
                </div>
              </div>
              {d && (
                <div className="ml-auto text-right">
                  <div className="text-4xl font-black tabular-nums text-telao-gold">{fmtScore(d.scoreCur)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">pontos no mês</div>
                  <Delta cur={d.scoreCur} prev={d.scorePrev} />
                </div>
              )}
            </TelaoCard>

            {q.isLoading && <div className="text-sm text-white/60">Carregando…</div>}
            {q.isError && <div className="text-sm text-telao-red">Não foi possível carregar os dados.</div>}

            {d && (
              <>
                <SectionTitle icon={<TrendingUp className="h-4 w-4 text-telao-cyan" />} title="Indicadores do mês" />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {kpis.map((k) => (
                    <TelaoCard key={k.label}>
                      <div className="text-[11px] uppercase tracking-wider text-white/60">{k.label}</div>
                      <div className="mt-1 text-3xl font-black tabular-nums">{k.cur}</div>
                      <div className="text-[11px] text-white/50">antes: {k.prev}</div>
                      <Delta cur={k.cur} prev={k.prev} />
                    </TelaoCard>
                  ))}
                  <TelaoCard>
                    <div className="text-[11px] uppercase tracking-wider text-white/60">WhatsApp</div>
                    <div className="mt-1 text-lg font-bold text-white/50">Sem histórico</div>
                    <div className="text-[11px] text-white/40">não há registro confiável por data</div>
                  </TelaoCard>
                </div>
                <p className="text-[11px] text-white/40">
                  Agendadas contam pela data em que a entrevista foi marcada e para quem marcou.
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const v = variation(cur, prev);
  if (v === null) return <div className="mt-1 text-xs text-white/40">sem base</div>;
  const up = v > 0.5, down = v < -0.5;
  return (
    <div className={`mt-1 flex items-center gap-1 text-xs ${up ? "text-telao-green" : down ? "text-telao-red" : "text-white/50"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {v > 0 ? "+" : ""}{v.toFixed(0)}% vs mês anterior
    </div>
  );
}
