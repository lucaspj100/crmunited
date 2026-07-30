/**
 * Títulos públicos do Hall da Fama.
 *
 * As chaves técnicas das categorias (calls, answered, …) continuam existindo no
 * código e no banco. Este arquivo é a ÚNICA fonte dos nomes exibidos ao público,
 * das frases de reconhecimento e da forma neutra de apresentar o número.
 */

export type CategoryKey =
  | "calls" | "answered" | "interested" | "interviews" | "interviews_done"
  | "enrollments" | "conversion" | "consistency" | "evolution";

export type PublicTitle = {
  /** Nome público exibido no CRM, nos cards e na cerimônia. */
  label: string;
  /** Frase curta de reconhecimento usada na peça compartilhável. */
  phrase: string;
  /** Rótulo interno da métrica real (uso apenas dentro do CRM). */
  internalLabel: string;
  icon: string;
};

export const PUBLIC_TITLES: Record<CategoryKey, PublicTitle> = {
  calls: {
    label: "Destaque em Conexões",
    phrase: "Consistência para abrir conversas e criar novas oportunidades.",
    internalLabel: "Mais ligações",
    icon: "📞",
  },
  answered: {
    label: "Destaque em Relacionamento",
    phrase: "Presença e atenção em cada oportunidade de contato.",
    internalLabel: "Mais atendimentos",
    icon: "✅",
  },
  interested: {
    label: "Gerador de Oportunidades",
    phrase: "Destaque na criação de novas possibilidades para o time.",
    internalLabel: "Mais interessados",
    icon: "✨",
  },
  interviews: {
    label: "Destaque em Agendamentos",
    phrase: "Organização e execução para transformar interesse em próximos passos.",
    internalLabel: "Mais entrevistas marcadas",
    icon: "📅",
  },
  interviews_done: {
    label: "Destaque em Performance",
    phrase: "Compromisso para transformar agendas em encontros realizados.",
    internalLabel: "Mais entrevistas realizadas",
    icon: "🎯",
  },
  enrollments: {
    label: "Campeão de Resultados",
    phrase: "Performance que transforma oportunidades em conquistas.",
    internalLabel: "Mais matrículas",
    icon: "🎓",
  },
  conversion: {
    label: "Excelência em Conversão",
    phrase: "Estratégia e qualidade para transformar oportunidades em resultados.",
    internalLabel: "Melhor conversão",
    icon: "🏹",
  },
  consistency: {
    label: "Destaque em Consistência",
    phrase: "Resultado construído com disciplina durante todo o mês.",
    internalLabel: "Maior consistência",
    icon: "🔁",
  },
  evolution: {
    label: "Evolução do Mês",
    phrase: "Crescimento que demonstra dedicação, aprendizado e atitude.",
    internalLabel: "Maior evolução",
    icon: "📈",
  },
};

export function publicTitleOf(key: string): PublicTitle | null {
  return PUBLIC_TITLES[key as CategoryKey] ?? null;
}

export function publicLabelOf(key: string, fallback: string): string {
  return publicTitleOf(key)?.label ?? fallback;
}

export function publicPhraseOf(key: string, fallback: string): string {
  return publicTitleOf(key)?.phrase ?? fallback;
}

/**
 * Apresentação neutra do número na peça pública.
 * Percentuais e "dias" mantêm o significado original; contagens viram
 * "N ações realizadas no mês" para não distorcer a métrica.
 */
export function neutralValueLabel(key: string, valueLabel: string): string {
  if (!valueLabel || valueLabel === "—") return "";
  if (valueLabel.includes("%") || valueLabel.includes("dias")) return valueLabel;
  return `${valueLabel} ações realizadas no mês`;
}

export const SHARED_HIGHLIGHT_NOTE = "Destaque compartilhado";

export const ELIGIBILITY_NOTICE =
  "Usuários não elegíveis ao Hall da Fama foram removidos dos resultados. Eles continuam aparecendo normalmente no placar, telão e relatórios.";
