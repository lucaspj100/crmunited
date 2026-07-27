export type AssistantSettings = {
  instructions: string;
  course_information: string;
  pricing_rules: string;
  objection_rules: string;
  prohibited_claims: string;
};

export type ScriptRef = { title: string; category: string; content: string };

export function buildSystemPrompt(s: AssistantSettings, scripts: ScriptRef[]): string {
  const scriptBlock = scripts
    .slice(0, 40)
    .map((x) => `- [${x.category}] ${x.title}\n${x.content}`)
    .join("\n\n");

  return [
    s.instructions,
    "",
    "== INFORMAÇÕES OFICIAIS DO CURSO ==",
    s.course_information,
    "",
    "== REGRAS DE VALORES ==",
    s.pricing_rules,
    "",
    "== REGRAS DE OBJEÇÃO ==",
    s.objection_rules,
    "",
    "== O QUE VOCÊ NUNCA PODE AFIRMAR ==",
    s.prohibited_claims,
    "",
    "== SCRIPTS OFICIAIS DA EQUIPE (use como base de tom e conteúdo) ==",
    scriptBlock,
    "",
    "== FORMATO OBRIGATÓRIO DA SAÍDA ==",
    "Responda SOMENTE com um JSON válido, sem markdown, no formato:",
    '{"resposta":"mensagem curta pronta para o vendedor copiar e enviar","motivo":"1 ou 2 frases explicando a escolha","estagio":"etapa atual da conversa"}',
    "O campo resposta deve conter apenas a mensagem final, sem aspas extras e sem análise.",
  ].join("\n");
}

type Part = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };

export async function generateReply(opts: {
  apiKey: string;
  system: string;
  conversation: string;
  goal: string;
  imageDataUrl?: string | null;
  variation: boolean;
}): Promise<{ resposta: string; motivo: string; estagio: string }> {
  const parts: Part[] = [];
  parts.push({
    type: "input_text",
    text: [
      opts.goal ? `Objetivo do vendedor: ${opts.goal}` : "Objetivo do vendedor: responder o lead.",
      "",
      "Conversa (colada pelo vendedor):",
      opts.conversation || "(sem texto colado — use o print enviado)",
      opts.variation ? "\nGere uma versão diferente da anterior, mantendo a mesma estratégia." : "",
    ].join("\n"),
  });
  if (opts.imageDataUrl) parts.push({ type: "input_image", image_url: opts.imageDataUrl });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

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
        model: "openai/gpt-5.5",
        stream: true,
        instructions: opts.system,
        input: [{ role: "user", content: parts }],
        reasoning: { effort: "low", summary: "auto" },
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
          /* ignora eventos parciais */
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!cleaned) throw new Error("A IA não retornou resposta. Tente novamente.");
  try {
    const parsed = JSON.parse(cleaned) as { resposta?: string; motivo?: string; estagio?: string };
    if (parsed.resposta) {
      return { resposta: parsed.resposta, motivo: parsed.motivo ?? "", estagio: parsed.estagio ?? "" };
    }
  } catch {
    /* fallback abaixo */
  }
  return { resposta: cleaned, motivo: "", estagio: "" };
}
