import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Snapshot = z.object({
  entrevistas_marcadas: z.number(),
  entrevistas_realizadas: z.number(),
  matriculas: z.number(),
  perdidos: z.number(),
  ligacoes_feitas: z.number(),
  ligacoes_atendidas: z.number(),
  interessados_gerados: z.number(),
  leads_trabalhados: z.number(),
  taxa_comparecimento: z.number().nullable(),
  taxa_conversao_realizadas: z.number().nullable(),
  pontuacao: z.number(),
});

const Input = z.object({
  // Somente o primeiro nome e o cargo são enviados à IA; nenhum dado de contato.
  firstName: z.string().max(60).default(""),
  cargo: z.string().max(60).default(""),
  periodLabel: z.string().max(80).default(""),
  tone: z.enum(["direto", "equilibrado", "motivador"]).default("equilibrado"),
  leaderNotes: z.string().max(4000).default(""),
  extraContext: z.string().max(2000).default(""),
  current: Snapshot,
  previous: Snapshot,
  teamAverage: Snapshot,
  ranking: z.object({ position: z.number().nullable(), total: z.number() }),
  goals: z.object({
    matriculas: z.number().nullable(),
    entrevistas: z.number().nullable(),
    ligacoes: z.number().nullable(),
  }),
  refinement: z.enum(["curto", "direto", "motivador", "outra_versao"]).nullable().default(null),
  previousFeedback: z.string().max(8000).nullable().default(null),
});

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

function fmt(n: number | null): string {
  if (n === null) return "sem dado";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function block(title: string, s: z.infer<typeof Snapshot>): string {
  return [
    `${title}:`,
    `- entrevistas agendadas: ${fmt(s.entrevistas_marcadas)}`,
    `- entrevistas realizadas: ${fmt(s.entrevistas_realizadas)}`,
    `- matrículas: ${fmt(s.matriculas)}`,
    `- leads perdidos: ${fmt(s.perdidos)}`,
    `- ligações feitas: ${fmt(s.ligacoes_feitas)} (atendidas: ${fmt(s.ligacoes_atendidas)})`,
    `- interessados gerados: ${fmt(s.interessados_gerados)}`,
    `- leads trabalhados: ${fmt(s.leads_trabalhados)}`,
    `- taxa de comparecimento: ${s.taxa_comparecimento === null ? "sem dado" : fmt(s.taxa_comparecimento) + "%"}`,
    `- conversão de entrevistas realizadas em matrículas: ${s.taxa_conversao_realizadas === null ? "sem dado" : fmt(s.taxa_conversao_realizadas) + "%"}`,
    `- pontuação do placar: ${fmt(s.pontuacao)}`,
  ].join("\n");
}

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

FORMATO OBRIGATÓRIO DA RESPOSTA (texto puro, sem markdown, sem asteriscos):
PONTO POSITIVO
<parágrafo curto e específico>

PRINCIPAL PONTO DE MELHORIA
<parágrafo curto conectando a observação do líder com os números quando houver relação>

FOCO PARA O PRÓXIMO MÊS
<uma ação prática, simples e mensurável>

MENSAGEM FINAL
<encerramento respeitoso, claro e motivador>

FOCO_SUGERIDO: <no máximo 5 palavras, curto, ex.: Implicação no SPIN>`;

async function callGateway(apiKey: string, system: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        stream: true,
        instructions: system,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        reasoning: { effort: "medium", summary: "auto" },
      }),
    });
  } catch {
    clearTimeout(timeout);
    throw new Error("Tempo limite ou falha de conexão com a IA. Tente novamente.");
  }

  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    if (res.status === 429) throw new Error("Muitas solicitações agora. Aguarde alguns segundos e tente de novo.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Avise o administrador.");
    throw new Error(`Falha na IA (${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const evt = JSON.parse(raw) as { type?: string; delta?: string; response?: { output_text?: string } };
          if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") text += evt.delta;
          else if (evt.type === "response.completed" && !text && evt.response?.output_text) {
            text = evt.response.output_text;
          }
        } catch {
          /* eventos parciais */
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const cleaned = text.trim();
  if (!cleaned) throw new Error("A IA não retornou resposta. Tente novamente.");
  return cleaned;
}

export const generateIndividualFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Integração de IA não configurada.");

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

    const raw = await callGateway(apiKey, SYSTEM, parts.join("\n"));

    let focus = "";
    let feedback = raw;
    const match = raw.match(/FOCO_SUGERIDO:\s*(.+)\s*$/i);
    if (match) {
      focus = match[1].trim().slice(0, 80);
      feedback = raw.slice(0, match.index).trim();
    }

    return { feedback, focus };
  });
