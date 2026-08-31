import { Star } from "lucide-react";
import { CAREER_ROLE_LABELS, STARS_TO_MASTER, type CareerBadgeInfo, showsStars } from "@/lib/career";

const ROLE_STYLES: Record<string, string> = {
  consultor: "border-sky-400/40 bg-sky-400/15 text-sky-100",
  consultor_master: "border-violet-400/40 bg-violet-400/15 text-violet-100",
  supervisor: "border-emerald-400/40 bg-emerald-400/15 text-emerald-100",
  gerente: "border-amber-400/40 bg-amber-400/15 text-amber-100",
  gerente_master: "border-orange-400/40 bg-orange-400/15 text-orange-100",
  gerente_divisional: "border-fuchsia-400/40 bg-fuchsia-400/15 text-fuchsia-100",
  diretor: "border-rose-400/40 bg-rose-400/15 text-rose-100",
  franqueado: "border-white/30 bg-white/10 text-white",

};

/** Selo de carreira (cargo + estrelas) reutilizando os dados do Plano de Carreira. */
export function CareerBadge({
  info,
  size = "sm",
}: {
  info: CareerBadgeInfo | null | undefined;
  size?: "sm" | "lg";
}) {
  if (!info) return null;
  const role = info.career_role;
  const label = CAREER_ROLE_LABELS[role] ?? role;
  const stars = showsStars(role) ? Math.max(0, Math.min(STARS_TO_MASTER, info.career_stars ?? 0)) : null;
  const pill = size === "lg" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  const starSize = size === "lg" ? "h-4 w-4" : "h-3 w-3";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full border font-semibold uppercase tracking-wider ${pill} ${ROLE_STYLES[role] ?? ROLE_STYLES["consultor"]}`}
      >
        {label}
      </span>
      {stars !== null && (
        <span className="inline-flex items-center gap-0.5" title={`${stars} de ${STARS_TO_MASTER} estrelas`}>
          {Array.from({ length: STARS_TO_MASTER }).map((_, i) => (
            <Star
              key={i}
              className={`${starSize} ${i < stars ? "fill-amber-400 text-amber-400" : "text-white/25"}`}
            />
          ))}
        </span>
      )}
    </div>
  );
}
