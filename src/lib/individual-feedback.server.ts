// Lógica de prompt e chamada de IA do piloto "Feedback Individual".
// Server-only: consumido apenas pelo handler em individual-feedback.functions.ts.

import { z } from "zod";
import { generateAiObject } from "@/lib/ai/gateway.server";
import type { FeedbackAiInput, FeedbackSnapshotInput } from "@/lib/individual-feedback.schema";

const TONE_RULES: Record<string, string> = {
  direto: "Tom DIRETO: objetivo e firme, frases curtas, sem rodeios e sem agressividade.",
  equilibrado:
    "Tom EQUILIBRADO: reconhece o ponto positivo, aponta com clareza o principal ponto de melhoria e orienta o próximo passo.",
  motivador:
    "Tom MAIS MOTIVADOR: valoriza a evolução real e apresenta a melhoria como oportunidade de crescimento, sem exagerar elogios.",
};

const REFINEMENT_RULES: Record<string, string> = {
  curto: "Reescreva o feedback anterior mantendo o sentido, porém mais curto e enxuto.",
  direto: "Reescreva o feedback anterior de forma mais direta e objetiva, sem perder o respeito.",
  motivador: "Reescreva o feedback anterior de forma mais motivadora, valorizando a evolução real.",
  outra_versao: "Gere uma nova versão do feedback, com outras palavras, mantendo os mesmos fatos e o mesmo foco.",
};

const SYSTEM = `Você é a assistente de liderança comercial do CRM United. Você escreve feedbacks individuais de fechamento de mês para o gestor usar em uma conversa um a um com o colaborador.

REGRAS ABSOLUTAS
- Use SOMENTE os números fornecidos. Nunca invente números, comportamentos, situações ou fatos.
- Quando faltar informação, trabalhe apenas com o que existe e não especule.
- Nunca faça diagnóstico psicológico ou emocional.
- Nunca afirme falta de esforço se o líder não observou isso.
- Nunca use linguagem ofensiva, humilhante, punitiva ou definitiva ("não serve para a função").
- Nunca cite nome ou dado de outro colaborador. Comparação com a equipe só como média, sem humilhar.
- Escolha UM único ponto de melhoria (o gargalo mais importante) e UM único foco.
- Evite frases genéricas, tom corporativo excessivo, promessas e bronca.
- Fale em segunda pessoa com o colaborador ("você"), em português do Brasil.

FORMATO DO CAMPO "feedback" (texto puro, sem markdown, sem asteriscos):
PONTO POSITIVO
<parágrafo curto e específico>

PRINCIPAL PONTO DE MELHORIA
<parágrafo curto conectando a observação do líder com os números quando houver relação>

FOCO PARA O PRÓXIMO MÊS
<uma ação prática, simples e mensurável>

MENSAGEM FINAL
<encerramento respeitoso, claro e motivador>

O campo "focus" deve conter no máximo 5 palavras (ex.: "Implicação no SPIN").`;

export const FeedbackOutputSchema = z.object({
  feedback: z.string(),
  focus: z.string(),
});

function fmt(n: number | null): string {
  if (n === null) return "sem dado";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function block(title: string, s: FeedbackSnapshotInput): string {
  return [
    `${title}:`,
    `- entrevistas agendadas: ${fmt(s.entrevistas_marcadas)}`,
    `- entrevistas realizadas: ${fmt(s.entrevistas_realizadas)}`,
    `- matrículas: ${fmt(s.matriculas)}`,
    `- leads perdidos: ${fmt(s.perdidos)}`,
    `- ligações feitas: ${fmt(s.ligacoes_feitas)} (atendidas: ${fmt(s.ligacoes_atendidas)})`,
    `- interessados gerados: ${fmt(s.interessados_gerados)}`,
    `- leads com contato registrado (contato marcado como feito, leads únicos): ${fmt(s.leads_trabalhados)}`,
    `- taxa de comparecimento: ${s.taxa_comparecimento === null ? "sem dado" : fmt(s.taxa_comparecimento) + "%"}`,
    `- conversão de entrevistas realizadas em matrículas: ${s.taxa_conversao_realizadas === null ? "sem dado" : fmt(s.taxa_conversao_realizadas) + "%"}`,
    `- pontuação do placar: ${fmt(s.pontuacao)}`,
  ].join("\n");
}

export function buildFeedbackPrompt(data: FeedbackAiInput): string {
  const parts = [
    `Colaborador: ${data.firstName || "colaborador"}${data.cargo ? ` (${data.cargo})` : ""}`,
    `Período analisado: ${data.periodLabel}`,
    TONE_RULES[data.tone],
    "",
    block("NÚMEROS DO PERÍODO", data.current),
    "",
    block("PERÍODO ANTERIOR (para comparação de evolução)", data.previous),
    "",
    block("MÉDIA DA EQUIPE NO PERÍODO", data.teamAverage),
    "",
    data.ranking.position
      ? `Posição no ranking do período: ${data.ranking.position}º de ${data.ranking.total}.`
      : "Posição no ranking: sem dado.",
    `Metas do período (meta diária multiplicada pelos dias): matrículas ${fmt(data.goals.matriculas)}, entrevistas ${fmt(data.goals.entrevistas)}, ligações ${fmt(data.goals.ligacoes)}.`,
    "",
    `OBSERVAÇÕES DO LÍDER (use como base de comportamento; se estiver vazio, não afirme nada sobre comportamento):\n${data.leaderNotes || "(nenhuma)"}`,
    "",
    `SITUAÇÃO ESPECÍFICA INFORMADA:\n${data.extraContext || "(nenhuma)"}`,
  ];

  if (data.refinement && data.previousFeedback) {
    parts.push("", REFINEMENT_RULES[data.refinement], "", `FEEDBACK ANTERIOR:\n${data.previousFeedback}`);
  }

  return parts.join("\n");
}

export async function generateFeedbackWithAi(
  data: FeedbackAiInput,
  userId: string,
): Promise<{ feedback: string; focus: string }> {
  const { object } = await generateAiObject({
    feature: "feedback_individual",
    system: SYSTEM,
    prompt: buildFeedbackPrompt(data),
    schema: FeedbackOutputSchema,
    schemaName: "feedback_individual",
    maxOutputTokens: 1600,
    userId,
    metadata: { tone: data.tone, refinement: data.refinement },
  });

  return { feedback: object.feedback.trim(), focus: object.focus.trim().slice(0, 80) };
}
