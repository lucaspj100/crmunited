import { Flame, Star } from "lucide-react";
import type { ProductivityRow } from "@/lib/productivity";
import type { CareerBadgeInfo } from "@/lib/career";
import { CareerBadge } from "@/components/carreira/CareerBadge";
import { TelaoCard, SectionTitle, initials, type RankedRow } from "./shared";

const FIELDS: { title: string; field: keyof ProductivityRow }[] = [
  { title: "📞 Mais ligações", field: "ligacoes_feitas" },
  { title: "✅ Mais atendidas", field: "ligacoes_atendidas" },
  { title: "🚀 Mais interessados", field: "interessados_gerados" },
  { title: "📅 Mais entrevistas marcadas", field: "entrevistas_marcadas" },
  { title: "🎯 Mais entrevistas realizadas", field: "entrevistas_realizadas" },
  { title: "🎓 Mais matrículas", field: "matriculas" },
];

export function DailyHighlights({ rows, periodLabel }: { rows: ProductivityRow[]; periodLabel: string }) {
  const top = (key: keyof ProductivityRow) => {
    let best: ProductivityRow | null = null;
    for (const r of rows) {
      const v = (r[key] as number) ?? 0;
      if (v > 0 && (!best || ((best[key] as number) ?? 0) < v)) best = r;
    }
    return best;
  };
  return (
    <TelaoCard>
      <SectionTitle icon={<Flame className="h-5 w-5 text-telao-orange" />} title={`Destaques · ${periodLabel}`} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {FIELDS.map((f) => {
          const r = top(f.field);
          return (
            <div key={f.field} className="flex items-center gap-3 rounded-xl border border-telao-border bg-telao-bg/50 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-telao-gold to-telao-orange text-sm font-bold text-telao-bg">
                {r?.avatar_url ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" /> : r ? initials(r.nome) : "—"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-white/60">{f.title}</div>
                <div className="truncate font-semibold">{r?.nome ?? "—"}</div>
              </div>
              <div className="text-2xl font-black tabular-nums text-telao-gold">{r ? (r[f.field] as number) : 0}</div>
            </div>
          );
        })}
      </div>
    </TelaoCard>
  );
}

export function CareerStrip({ ranked, careerBadges }: { ranked: RankedRow[]; careerBadges: Map<string, CareerBadgeInfo> }) {
  const items = ranked.filter((r) => careerBadges.has(r.vendedor_id));
  if (items.length === 0) return null;
  return (
    <TelaoCard className="border-telao-violet/30">
      <SectionTitle icon={<Star className="h-5 w-5 text-telao-violet" />} title="Carreira da equipe" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {items.map((r) => (
          <div key={r.vendedor_id} className="flex items-center justify-between gap-2 rounded-xl border border-telao-border bg-telao-bg/50 px-3 py-2">
            <span className="truncate text-sm font-semibold">{r.nome}</span>
            <CareerBadge info={careerBadges.get(r.vendedor_id)} size="sm" />
          </div>
        ))}
      </div>
    </TelaoCard>
  );
}
