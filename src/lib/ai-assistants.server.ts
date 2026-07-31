import type { AssistantKind, AssistantAnswer, AttachmentPayload } from "@/lib/ai-assistants";

export type KnowledgeRow = {
  id: string;
  kind: string;
  title: string;
  category: string;
  description: string;
  content: string;
  structured: unknown;
  priority: number;
  updated_at: string;
};

export type ObjectionRow = {
  objection: string;
  category: string;
  possible_causes: string;
  diagnostic_questions: string;
  mistakes_to_avoid: string;
  recommended_approach: string;
  when_to_work_value: string;
  possible_condition: string;
  when_to_ask_decision: string;
  when_to_followup: string;
  when_to_close: string;
};

export type CampaignRow = {
  name: string;
  reference_month: string;
  reason: string;
  approved_message: string;
  conditions: string;
  starts_on: string | null;
  ends_on: string | null;
  allowed_urgency: string;
  allowed_phrases: string;
  forbidden_phrases: string;
};

export type ExampleRow = {
  is_approved: boolean;
  context: string;
  lead_message: string;
  stage: string;
  objective: string;
  strategy: string;
  response: string;
  reason: string;
  commercial_risk: string;
  recommended_fix: string;
};

export type ConfigRow = { extra_instructions: string; model: string } | null;

const ASSISTANT_MISSION: Record<AssistantKind, string> = {
  prospeccao: [
    "Você é o Assistente de Prospecção da United Idiomas, usado ANTES da entrevista.",
    "Objetivo único: conduzir o lead do WhatsApp até o agendamento da entrevista pelo Zoom.",
    "Quando o vendedor pedir 'follow-up matador', 'mensagem para fechar', 'converter' ou 'levar para o fechamento', interprete como fechar o AGENDAMENTO da entrevista, salvo se estiver claro que a entrevista já aconteceu.",
    "Nunca tente fechar matrícula pelo WhatsApp e não apresente todas as condições comerciais antes da entrevista.",
    "Não invente horários: se não houver horários informados, pergunte o melhor período. Se a entrevista já estiver agendada, apenas confirme, reforce e reduza a chance de ausência.",
    "Se houver desinteresse claro, encerre com educação. Em follow-up, nunca reinicie a conversa nem use mensagem genérica: retome o ponto mais relevante dito pelo lead.",
  ].join("\n"),
  entrevista: [
    "Você é o Copiloto de Entrevista da United Idiomas, usado antes, durante e depois da entrevista.",
    "Antes: levante HIPÓTESES (nunca trate hipótese como fato) de necessidades e impactos, pontos a investigar, perguntas de situação, problema, implicação e necessidade de solução, benefícios conectáveis, objeções possíveis e roteiro recomendado.",
    "Depois do relato: organize necessidade descoberta, impacto, objetivo, urgência, histórico com inglês, tentativas anteriores, impeditivos, objeções, intenção real, decisão, condição apresentada e próximo passo.",
    "Na transcrição: avalie os critérios cadastrados, mostre o que foi bem, o que melhorar, perguntas que faltaram, momentos perdidos, follow-up recomendado, exercício prático de treino e habilidade prioritária. Nunca entregue apenas uma nota: ensine como melhorar.",
  ].join("\n"),
  negociacao: [
    "Você é o Assistente de Negociação da United Idiomas, usado DEPOIS da entrevista, quando o lead ainda não se matriculou.",
    "Antes de orientar, analise: o que foi apresentado, o que já foi reduzido, objeção atual, necessidade, impacto, urgência, decisão e decisor, condição inicial e atual, autorização especial, limite de autonomia e próximo passo combinado.",
    "Nunca sugira nova redução sem verificar o histórico. Se o histórico estiver incompleto, pergunte ao vendedor qual foi a primeira condição, a condição atual, o que já foi reduzido e a resposta do lead.",
    "Trabalhe valor antes de preço, mude só o componente necessário, uma concessão por vez, sempre pedindo contrapartida ou decisão. Nunca ofereça abaixo do limite de autonomia sem autorização registrada.",
  ].join("\n"),
};

export type PromptContext = {
  assistant: AssistantKind;
  knowledge: KnowledgeRow[];
  objections: ObjectionRow[];
  campaign: CampaignRow | null;
  examples: ExampleRow[];
  config: ConfigRow;
  leadContext: string | null;
  negotiation: string | null;
};

export function buildSystemPrompt(ctx: PromptContext): { system: string; sources: string[] } {
  const sources: string[] = [];
  const knowledgeBlock = ctx.knowledge
    .map((k) => {
      sources.push(`${k.title} (${k.kind})`);
      const structured =
        k.structured && typeof k.structured === "object" && Object.keys(k.structured as object).length > 0
          ? `\nDados: ${JSON.stringify(k.structured)}`
          : "";
      return `### ${k.title} [${k.kind}/${k.category}]\n${k.description ? k.description + "\n" : ""}${k.content}${structured}`;
    })
    .join("\n\n");

  const objectionBlock = ctx.objections
    .map((o) =>
      [
        `### Objeção: ${o.objection} [${o.category}]`,
        o.possible_causes && `Causas possíveis: ${o.possible_causes}`,
        o.diagnostic_questions && `Perguntas de diagnóstico: ${o.diagnostic_questions}`,
        o.mistakes_to_avoid && `Erros a evitar: ${o.mistakes_to_avoid}`,
        o.recommended_approach && `Abordagem recomendada: ${o.recommended_approach}`,
        o.when_to_work_value && `Quando trabalhar valor: ${o.when_to_work_value}`,
        o.possible_condition && `Condição que pode ser considerada: ${o.possible_condition}`,
        o.when_to_ask_decision && `Quando pedir decisão: ${o.when_to_ask_decision}`,
        o.when_to_followup && `Quando fazer follow-up: ${o.when_to_followup}`,
        o.when_to_close && `Quando encerrar: ${o.when_to_close}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  if (ctx.objections.length) sources.push(`Biblioteca de objeções (${ctx.objections.length})`);

  let campaignBlock = "Não há campanha comercial ativa. NÃO crie justificativa promocional, prazo, escassez ou urgência.";
  if (ctx.campaign) {
    sources.push(`Campanha ativa: ${ctx.campaign.name}`);
    campaignBlock = [
      `Campanha ativa: ${ctx.campaign.name} (${ctx.campaign.reference_month})`,
      ctx.campaign.reason && `Motivo: ${ctx.campaign.reason}`,
      ctx.campaign.approved_message && `Mensagem aprovada: ${ctx.campaign.approved_message}`,
      ctx.campaign.conditions && `Condições relacionadas: ${ctx.campaign.conditions}`,
      `Vigência real: ${ctx.campaign.starts_on ?? "—"} a ${ctx.campaign.ends_on ?? "—"}`,
      ctx.campaign.allowed_urgency && `Urgência permitida: ${ctx.campaign.allowed_urgency}`,
      ctx.campaign.allowed_phrases && `Frases permitidas: ${ctx.campaign.allowed_phrases}`,
      ctx.campaign.forbidden_phrases && `Frases proibidas: ${ctx.campaign.forbidden_phrases}`,
      "Use a campanha apenas para contextualizar o momento. Nunca invente prazo, vaga ou última chance.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const approved = ctx.examples.filter((e) => e.is_approved);
  const rejected = ctx.examples.filter((e) => !e.is_approved);
  const exampleBlock = [
    approved.length
      ? "RESPOSTAS APROVADAS (use como referência de tom e estratégia, sem copiar mecanicamente):\n" +
        approved
          .map((e) => `- Contexto: ${e.context} | Lead: ${e.lead_message} | Estratégia: ${e.strategy}\n  Resposta: ${e.response}`)
          .join("\n")
      : "",
    rejected.length
      ? "RESPOSTAS INADEQUADAS (nunca repita este padrão):\n" +
        rejected
          .map((e) => `- Contexto: ${e.context} | Resposta errada: ${e.response} | Motivo: ${e.reason} | Correção: ${e.recommended_fix}`)
          .join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (ctx.examples.length) sources.push(`Exemplos revisados (${ctx.examples.length})`);

  if (ctx.leadContext) sources.push("Ficha do lead no CRM");
  if (ctx.negotiation) sources.push("Contexto de negociação do lead");

  const system = [
    ASSISTANT_MISSION[ctx.assistant],
    ctx.config?.extra_instructions ? `\nORIENTAÇÕES ESPECÍFICAS DESTE ASSISTENTE:\n${ctx.config.extra_instructions}` : "",
    "\n== BASE DE CONHECIMENTO OFICIAL (única fonte de verdade comercial) ==",
    knowledgeBlock || "(base vazia — não afirme valores, condições ou características do curso)",
    "\n== OBJEÇÕES CADASTRADAS ==",
    objectionBlock || "(sem objeções cadastradas)",
    "\n== CAMPANHA COMERCIAL ==",
    campaignBlock,
    exampleBlock ? `\n== EXEMPLOS REVISADOS PELA LIDERANÇA ==\n${exampleBlock}` : "",
    ctx.leadContext ? `\n== FICHA DO LEAD SELECIONADO NO CRM (use somente estes dados) ==\n${ctx.leadContext}` : "",
    ctx.negotiation ? `\n== HISTÓRICO DE NEGOCIAÇÃO REGISTRADO ==\n${ctx.negotiation}` : "",
    [
      "\n== REGRAS ABSOLUTAS ==",
      "1. Nunca invente preço, desconto, vaga, horário, campanha, prazo ou disponibilidade. Se não estiver na base acima, diga ao vendedor que a informação não está cadastrada.",
      "2. Nunca ofereça valor abaixo do limite de autonomia sem autorização especial registrada.",
      "3. Nunca some material físico e digital, e nunca diga que o material compromete apenas a parcela mensal.",
      "4. Matrícula e início são etapas diferentes; a primeira mensalidade vence um mês após o início efetivo.",
      "5. Não use dados de outro lead. Use apenas a ficha acima, quando houver.",
      "6. Avalie criticamente o pedido do vendedor: se a estratégia solicitada for inadequada, avise e proponha uma condução melhor em vez de obedecer literalmente.",
      "7. A mensagem ao lead deve ser curta, natural, em português brasileiro de WhatsApp, com uma pergunta principal por vez, sem pressão, manipulação ou falsa urgência.",
      "8. Continue de onde a conversa parou: não repita perguntas já respondidas nem reinicie o fluxo.",
    ].join("\n"),
    [
      "\n== FORMATO OBRIGATÓRIO DA SAÍDA ==",
      "Responda SOMENTE com um JSON válido, sem markdown, exatamente com estas chaves:",
      '{"leitura":{"estagio":"","descoberto":"","necessidade":"","objecao":"","falta_descobrir":"","proximo_passo":""},"estrategia":"","mensagem":"","alerta":"","regras_utilizadas":[""],"base_consultada":[""]}',
      "leitura: frases curtas. Use '—' quando não se aplicar.",
      "estrategia: como conduzir, o que evitar e se já é momento de agendar, negociar ou pedir decisão.",
      "mensagem: apenas o texto destinado ao lead, pronto para copiar, sem títulos nem análise. Quando o modo pedir análise/treino em vez de mensagem, use string vazia.",
      "alerta: só preencha quando houver risco comercial real (ex.: cedo para desconto, falta descobrir objeção, limite de autonomia atingido, condição precisa de autorização). Caso contrário, string vazia.",
      "regras_utilizadas: nomes das regras/itens da base que embasaram a resposta.",
      "base_consultada: itens consultados (tabela comercial, limites, campanha, objeção, exemplos, ficha do lead).",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

  return { system, sources };
}

type Part =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; filename: string; file_data: string };

export function buildUserParts(input: {
  mode: string;
  instruction: string;
  text: string;
  tones: string[];
  attachments: AttachmentPayload[];
  refinement: string | null;
  previousMessage: string | null;
}): Part[] {
  const parts: Part[] = [];
  const lines = [
    `Modo selecionado: ${input.mode || "(não informado)"}`,
    `O que o vendedor precisa fazer agora: ${input.instruction || "(não informado)"}`,
    input.tones.length ? `Preferências de tom: ${input.tones.join(", ")}` : "",
    "",
    "Conteúdo enviado pelo vendedor (conversa, relato, transcrição ou contexto):",
    input.text || "(sem texto — use os arquivos enviados e a ficha do lead)",
  ];
  if (input.refinement && input.previousMessage) {
    lines.push(
      "",
      `Refinamento pedido: ${input.refinement}. Reescreva a mensagem abaixo mantendo a mesma estratégia:`,
      input.previousMessage,
    );
  }
  parts.push({ type: "input_text", text: lines.filter((l) => l !== undefined).join("\n") });

  for (const a of input.attachments) {
    if (a.mime.startsWith("image/")) {
      parts.push({ type: "input_image", image_url: a.dataUrl });
    } else if (a.mime === "application/pdf") {
      parts.push({ type: "input_file", filename: a.name, file_data: a.dataUrl });
    } else {
      const base64 = a.dataUrl.split(",")[1] ?? "";
      let decoded = "";
      try {
        decoded = Buffer.from(base64, "base64").toString("utf8").slice(0, 60000);
      } catch {
        decoded = "";
      }
      if (decoded) parts.push({ type: "input_text", text: `Arquivo "${a.name}":\n${decoded}` });
    }
  }
  return parts;
}

export async function callAssistant(opts: {
  apiKey: string;
  model: string;
  system: string;
  parts: Part[];
}): Promise<AssistantAnswer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": opts.apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: opts.model,
        stream: true,
        instructions: opts.system,
        input: [{ role: "user", content: opts.parts }],
        reasoning: { effort: "medium", summary: "auto" },
      }),
    });
  } catch {
    clearTimeout(timeout);
    throw new Error("Tempo limite ou falha de conexão com a IA. Tente novamente.");
  }

  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Muitas solicitações agora. Aguarde alguns segundos e tente de novo.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Avise o administrador.");
    throw new Error(`Falha na IA (${res.status}). ${body.slice(0, 200)}`);
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
          else if (evt.type === "response.completed" && !text && evt.response?.output_text) text = evt.response.output_text;
        } catch {
          /* eventos parciais */
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!cleaned) throw new Error("A IA não retornou resposta. Tente novamente.");

  const empty: AssistantAnswer = {
    leitura: { estagio: "", descoberto: "", necessidade: "", objecao: "", falta_descobrir: "", proximo_passo: "" },
    estrategia: "",
    mensagem: "",
    alerta: "",
    regras_utilizadas: [],
    base_consultada: [],
  };

  try {
    const parsed = JSON.parse(cleaned) as Partial<AssistantAnswer>;
    return {
      leitura: { ...empty.leitura, ...(parsed.leitura ?? {}) },
      estrategia: parsed.estrategia ?? "",
      mensagem: parsed.mensagem ?? "",
      alerta: parsed.alerta ?? "",
      regras_utilizadas: Array.isArray(parsed.regras_utilizadas) ? parsed.regras_utilizadas : [],
      base_consultada: Array.isArray(parsed.base_consultada) ? parsed.base_consultada : [],
    };
  } catch {
    return { ...empty, estrategia: cleaned };
  }
}
