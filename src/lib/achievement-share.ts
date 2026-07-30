import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MONTH_NAMES } from "@/lib/hall-of-fame";

// ───────────────────────── Tipos e catálogos ─────────────────────────

export type ShareFormat = "story" | "feed" | "linkedin";
export type ShareTemplate = "royalty" | "executive" | "podium";
export type TitleKey = "king_of_sales" | "queen_of_sales" | "sales_royalty" | "sales_champion";

export const FORMATS: Record<ShareFormat, { label: string; w: number; h: number; hint: string }> = {
  story: { label: "Story", w: 1080, h: 1920, hint: "9:16 · Instagram/WhatsApp" },
  feed: { label: "Feed", w: 1080, h: 1080, hint: "1:1 · Instagram/Facebook" },
  linkedin: { label: "LinkedIn", w: 1200, h: 627, hint: "1.91:1 · LinkedIn" },
};

export const TEMPLATES: Record<ShareTemplate, { label: string; hint: string }> = {
  royalty: { label: "Realeza", hint: "Coroa, dourado e fundo escuro" },
  executive: { label: "Executivo", hint: "Sóbrio e profissional" },
  podium: { label: "Pódio", hint: "Medalha e colocação em destaque" },
};

export const TITLE_OPTIONS: Array<{ key: TitleKey; label: string }> = [
  { key: "king_of_sales", label: "King of Sales" },
  { key: "queen_of_sales", label: "Queen of Sales" },
  { key: "sales_royalty", label: "Sales Royalty" },
  { key: "sales_champion", label: "Sales Champion" },
];

export const TITLE_TEXT: Record<TitleKey, string> = {
  king_of_sales: "KING OF SALES",
  queen_of_sales: "QUEEN OF SALES",
  sales_royalty: "SALES ROYALTY",
  sales_champion: "SALES CHAMPION",
};

export const DEFAULT_PHRASE = "Fanáticos por resultado. Obcecados por evolução.";
export const TEAM_SIGNATURE = "EQUIPE FANÁTICOS";

export const FALLBACK_PHRASES = [
  DEFAULT_PHRASE,
  "Onde performance vira legado.",
  "Entre metas, desafios e resultados, um nome chegou ao topo.",
  "Resultado não acontece por acaso.",
  "Consistência, atitude e performance.",
  "Quem entrega resultado merece reconhecimento.",
];

/** Peça individual (posição 1-3), peça coletiva do Top 3 ou destaque especial. */
export type ShareSubject =
  | { kind: "solo"; position: number; person: SharePerson }
  | { kind: "top3"; people: SharePerson[] }
  | {
      kind: "highlight";
      categoryKey: string;
      /** Nome público da categoria (nunca a métrica interna). */
      categoryLabel: string;
      person: SharePerson;
      /** Valor formatado (apenas usado quando o vendedor optar por exibir). */
      valueLabel: string;
      /** Destaque dividido com outros vendedores no mês. */
      shared?: boolean;
    };

export type SharePerson = { id: string; nome: string; avatar_url: string | null };

// ───────────────────────── Textos da peça ─────────────────────────

export function monthLabelPt(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

function feminine(titleKey: TitleKey) {
  return titleKey === "queen_of_sales";
}

/** Título principal + subtítulo, respeitando parcial x oficial e a colocação. */
export function pieceTexts(args: {
  subject: ShareSubject;
  titleKey: TitleKey;
  official: boolean;
  year: number;
  month: number;
}): { headline: string; emoji: string; subline: string; statusTag: string } {
  const { subject, titleKey, official, year, month } = args;
  const period = monthLabelPt(year, month);
  // Plural quando a peça reconhece mais de uma pessoa.
  const plural = subject.kind === "top3";
  const statusTag = official
    ? plural ? "RESULTADOS OFICIAIS" : "RESULTADO OFICIAL"
    : plural ? "RESULTADOS PARCIAIS" : "RESULTADO PARCIAL";

  if (subject.kind === "top3") {
    return { emoji: "🏆", headline: "TOP 3 SALES CHAMPIONS", subline: period, statusTag };
  }

  if (subject.kind === "highlight") {
    const t = publicTitleOf(subject.categoryKey);
    return {
      emoji: t?.icon ?? "⭐",
      headline: subject.categoryLabel.toUpperCase(),
      subline: subject.shared ? `${SHARED_HIGHLIGHT_NOTE} — ${period}` : period,
      statusTag,
    };
  }

  if (subject.position === 1) {
    if (!official) {
      return {
        emoji: "👑",
        headline: "CURRENT SALES LEADER",
        subline: `Líder comercial de ${period.toLowerCase()}`,
        statusTag,
      };
    }
    return {
      emoji: "👑",
      headline: TITLE_TEXT[titleKey],
      subline: `${feminine(titleKey) ? "Campeã" : "Campeão"} comercial de ${period.toLowerCase()}`,
      statusTag,
    };
  }

  return {
    emoji: subject.position === 2 ? "🥈" : "🥉",
    headline: "SALES ELITE",
    subline: `${subject.position}º lugar — ${period}`,
    statusTag,
  };
}


/** Legenda pronta para publicação — sem qualquer métrica operacional. */
export function buildCaption(args: {
  subject: ShareSubject;
  titleKey: TitleKey;
  official: boolean;
  year: number;
  month: number;
}): string {
  const { subject, titleKey, official, year, month } = args;
  const period = monthLabelPt(year, month).toLowerCase();
  const monthName = MONTH_NAMES[month - 1].toLowerCase();

  if (subject.kind === "top3") {
    return `Top 3 comercial da Equipe Fanáticos em ${period}. 🏆\n\nReconhecimento para quem entrega consistência, evolução e resultado todos os dias.\n\nO próximo desafio já começou. 🚀\n\n#EquipeFanáticos #Top3 #Vendas #Performance #Resultados`;
  }

  if (subject.position === 1) {
    if (official) {
      const t = TITLE_TEXT[titleKey]
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return `É uma honra encerrar ${monthName} como ${t} da Equipe Fanáticos. 👑\n\nMais do que uma posição, esse resultado representa consistência, aprendizado e evolução durante todo o mês.\n\nSeguimos em busca do próximo nível. 🚀\n\n#EquipeFanáticos #${TITLE_TEXT[titleKey].split(" ").map((w) => w[0] + w.slice(1).toLowerCase()).join("")} #Vendas #Performance #Resultados`;
    }
    return `Fechando o mês entre os principais resultados da Equipe Fanáticos. 👑\n\nA disputa ainda não terminou, mas cada passo já representa evolução, consistência e muito trabalho.\n\nSeguimos até o último dia. 🚀\n\n#EquipeFanáticos #SalesLeader #Vendas #Performance`;
  }

  return `Muito feliz por fazer parte do Top 3 comercial da Equipe Fanáticos neste mês. 🏆\n\nResultado construído com consistência, evolução e vontade de fazer acontecer.\n\nO próximo desafio já começou. 🚀\n\n#EquipeFanáticos #Top3 #Vendas #Performance #Resultados`;
}

// ───────────────────────── Persistência ─────────────────────────

export function usePhrases() {
  return useQuery({
    queryKey: ["share_phrases"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("share_phrases" as never)
        .select("text,is_active,sort_order")
        .order("sort_order", { ascending: true });
      if (error) return FALLBACK_PHRASES;
      const rows = (data ?? []) as unknown as Array<{ text: string; is_active: boolean }>;
      const active = rows.filter((r) => r.is_active).map((r) => r.text);
      return active.length > 0 ? active : FALLBACK_PHRASES;
    },
    staleTime: 5 * 60_000,
  });
}

export type SharePrefs = {
  preferred_title: TitleKey;
  preferred_template: ShareTemplate;
  preferred_format: ShareFormat;
  preferred_phrase: string | null;
};

export function useSharePrefs(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["share_prefs", userId],
    enabled: !!userId,
    queryFn: async (): Promise<SharePrefs | null> => {
      const { data } = await supabase
        .from("share_preferences" as never)
        .select("preferred_title,preferred_template,preferred_format,preferred_phrase")
        .eq("user_id", userId!)
        .maybeSingle();
      return (data ?? null) as unknown as SharePrefs | null;
    },
    staleTime: 60_000,
  });
}

export async function saveSharePrefs(userId: string, prefs: SharePrefs) {
  await supabase
    .from("share_preferences" as never)
    .upsert({ user_id: userId, ...prefs } as never, { onConflict: "user_id" });
}

export async function logShare(args: {
  userId: string;
  subjectUserId: string | null;
  year: number;
  month: number;
  achievement: string;
  position: number | null;
  format: ShareFormat;
  template: ShareTemplate;
  action: "generated" | "download" | "share" | "copy_caption";
  official: boolean;
}) {
  try {
    await supabase.from("achievement_shares" as never).insert({
      user_id: args.userId,
      subject_user_id: args.subjectUserId,
      reference_year: args.year,
      reference_month: args.month,
      achievement: args.achievement,
      position: args.position,
      format: args.format,
      template: args.template,
      action: args.action,
      is_official: args.official,
    } as never);
  } catch {
    /* registro analítico é best-effort */
  }
}

// ───────────────────────── Imagem ─────────────────────────

/** Converte uma foto remota em data URL para evitar bloqueio de CORS na captura. */
export async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function fileNameFor(args: { nome: string; year: number; month: number; format: ShareFormat }) {
  const slug = args.nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "");
  return `fanaticos-${slug}-${args.year}-${String(args.month).padStart(2, "0")}-${args.format}.png`;
}

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
