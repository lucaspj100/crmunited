import { Crown } from "lucide-react";
import { fmtScore } from "@/lib/scoring";
import type { CareerBadgeInfo } from "@/lib/career";
import { CareerBadge } from "@/components/carreira/CareerBadge";
import { TelaoCard, SectionTitle, initials, type RankTab, type RankedRow } from "./shared";

const TOP_N = 5;

const TABS: { key: RankTab; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
];

const PLACE_STYLE: Record<number, { card: string; medal: string; score: string }> = {
  1: { card: "border-telao-gold/60 bg-gradient-to-r from-telao-gold/20 via-telao-gold/5 to-telao-card shadow-[0_0_28px_-8px_var(--telao-gold)] animate-telao-glow", medal: "bg-telao-gold text-telao-bg", score: "text-telao-gold" },
  2: { card: "border-telao-cyan/40 bg-gradient-to-r from-telao-cyan/10 to-telao-card", medal: "bg-telao-cyan text-telao-bg", score: "text-telao-cyan" },
  3: { card: "border-telao-orange/40 bg-gradient-to-r from-telao-orange/10 to-telao-card", medal: "bg-telao-orange text-telao-bg", score: "text-telao-orange" },
};

export function RankingBoard({
  tab, onTab, ranked, loading, userId, careerBadges, onSelect,
}: {
  tab: RankTab;
  onTab: (t: RankTab) => void;
  ranked: RankedRow[];
  loading: boolean;
  userId?: string;
  careerBadges: Map<string, CareerBadgeInfo>;
  onSelect?: (r: RankedRow) => void;
}) {
  return (
    <TelaoCard>
      <SectionTitle
        icon={<Crown className="h-5 w-5 text-telao-gold" />}
        title="Top 5 ao vivo"
        right={
          <div role="tablist" className="flex rounded-xl border border-telao-border bg-telao-bg p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => onTab(t.key)}
                className={`min-w-[72px] rounded-lg px-4 py-2 text-sm font-bold transition-colors ${tab === t.key ? "bg-telao-blue text-white shadow-[0_0_16px_-4px_var(--telao-blue)]" : "text-white/60 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="hidden grid-cols-[48px_1fr_repeat(6,72px)_104px] gap-2 px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-white/40 lg:grid">
        <span>#</span><span>Vendedor</span>
        <span className="text-right">Matrículas</span><span className="text-right">Realizadas</span>
        <span className="text-right">Marcadas</span><span className="text-right">Interessados</span>
        <span className="text-right">Ligações</span><span className="text-right">LinkedIn</span>
        <span className="text-right">Pontos</span>
      </div>
      {loading && ranked.length === 0 && <p className="text-sm text-white/60">Carregando ranking…</p>}
      {!loading && ranked.length === 0 && <p className="text-sm text-white/60">Sem dados neste período.</p>}
      <ol className="space-y-2">
        {ranked.slice(0, TOP_N).map((r, i) => {
          const st = PLACE_STYLE[r.position];
          const ahead = i > 0 ? ranked[i - 1] : null;
          const gap = ahead ? ahead.score - r.score : 0;
          const isMe = r.vendedor_id === userId;
          return (
            <li
              key={r.vendedor_id}
              onClick={onSelect ? () => onSelect(r) : undefined}
              className={`animate-fade-in rounded-xl border p-3 transition-colors ${st?.card ?? "border-telao-border bg-telao-bg/50"} ${isMe ? "ring-2 ring-telao-blue/70" : ""} ${onSelect ? "cursor-pointer hover:border-telao-blue/50" : ""}`}
            >
              <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3 lg:grid-cols-[48px_1fr_repeat(6,72px)_104px] lg:gap-2">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-base font-black ${st?.medal ?? "bg-telao-border text-white/80"}`}>{r.position}</div>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-telao-blue to-telao-violet text-sm font-bold sm:flex">
                    {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(r.nome)}
                  </div>
                  <div className="min-w-0">
                    <div className={`truncate font-bold ${r.position === 1 ? "text-lg" : ""}`}>{r.nome}{isMe && <span className="ml-2 text-[10px] font-bold uppercase text-telao-blue">você</span>}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CareerBadge info={careerBadges.get(r.vendedor_id)} size="sm" />
                      {ahead && (
                        <span className="text-[11px] text-white/50">
                          {gap > 0 ? `${fmtScore(gap)} pts para alcançar ${ahead.nome.split(" ")[0]}` : `Empatado com ${ahead.nome.split(" ")[0]}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Stat v={r.matriculas} />
                <Stat v={r.entrevistas_realizadas ?? 0} />
                <Stat v={r.entrevistas_marcadas} />
                <Stat v={r.interessados_gerados} />
                <Stat v={r.ligacoes_feitas} />
                <Stat v={r.linkedins_checkout ?? 0} />
                <div className="text-right">
                  <div className={`text-2xl font-black tabular-nums ${st?.score ?? "text-white"}`}>{fmtScore(r.score)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-white/40">pts</div>
                </div>
              </div>
              {/* Mobile: números principais em linha */}
              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px] text-white/60 sm:grid-cols-6 lg:hidden">
                <span>🎓 Matr. <b className="text-white">{r.matriculas}</b></span>
                <span>🎯 Realiz. <b className="text-white">{r.entrevistas_realizadas ?? 0}</b></span>
                <span>📅 Marc. <b className="text-white">{r.entrevistas_marcadas}</b></span>
                <span>🔥 Inter. <b className="text-white">{r.interessados_gerados}</b></span>
                <span>📞 Lig. <b className="text-white">{r.ligacoes_feitas}</b></span>
                <span>💼 LinkedIn <b className="text-white">{r.linkedins_checkout ?? 0}</b></span>
              </div>
            </li>
          );
        })}
      </ol>
    </TelaoCard>
  );
}

function Stat({ v }: { v: number }) {
  return <div className="hidden text-right text-lg font-bold tabular-nums lg:block">{v}</div>;
}
