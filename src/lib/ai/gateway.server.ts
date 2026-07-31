// Gateway central de IA do CRM United (somente servidor).
//
// Arquitetura provider-agnostic: hoje `openai`, amanhã `gemini` sem mexer nas
// funcionalidades. Nenhuma chave é lida no escopo do módulo — sempre dentro das
// funções, porque o runtime só liga as variáveis de ambiente por requisição.

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";

export type AiProvider = "openai" | "gemini";

export type AiAttachment = {
  /** MIME real do arquivo (nunca chutar: derivar do upload). */
  mimeType: string;
  /** Conteúdo em base64, sem prefixo data:. */
  base64: string;
  fileName?: string;
};

export type AiTextRequest = {
  /** Identificador da funcionalidade, usado no log de uso. */
  feature: string;
  system: string;
  prompt: string;
  attachments?: AiAttachment[];
  maxOutputTokens?: number;
  temperature?: number;
  /** Sobrescreve o modelo padrão do backend. */
  model?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AiTextResult = {
  text: string;
  provider: AiProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export type AiObjectResult<T> = AiTextResult & { object: T };

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_MAX_OUTPUT_TOKENS = 2000;

/** USD por 1M de tokens. Usado apenas para custo estimado nos logs. */
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|gif)$/i;
const PDF_MIME = /^application\/pdf$/i;

export function getAiConfig() {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase() as AiProvider;
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
  const maxOutputTokens = Number(process.env.AI_MAX_OUTPUT_TOKENS ?? DEFAULT_MAX_OUTPUT_TOKENS);
  return {
    provider,
    model,
    maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

function openaiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Integração de IA não configurada.");
  return new OpenAI({ apiKey, timeout: 180_000, maxRetries: 1 });
}

/** Converte anexos para os formatos aceitos pela OpenAI; ignora o que não é suportado. */
function buildContent(prompt: string, attachments: AiAttachment[] | undefined) {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: "text", text: prompt }];
  for (const file of attachments ?? []) {
    if (IMAGE_MIME.test(file.mimeType)) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
      });
    } else if (PDF_MIME.test(file.mimeType)) {
      content.push({
        type: "file",
        file: {
          filename: file.fileName || "documento.pdf",
          file_data: `data:${file.mimeType};base64,${file.base64}`,
        },
      });
    }
  }
  return content;
}

function friendlyError(error: unknown): Error {
  const status = (error as { status?: number })?.status;
  if (status === 401) return new Error("Chave da OpenAI inválida. Avise o administrador.");
  if (status === 429) return new Error("Muitas solicitações agora. Aguarde alguns segundos e tente de novo.");
  if (status === 402 || status === 403) return new Error("Créditos de IA esgotados. Avise o administrador.");
  if (status && status >= 500) return new Error("O provedor de IA está instável. Tente novamente.");
  const message = error instanceof Error ? error.message : "Falha ao gerar a resposta da IA.";
  return new Error(message);
}

async function logUsage(entry: {
  feature: string;
  provider: AiProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  status: "success" | "error";
  errorMessage?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_usage_logs").insert({
      user_id: entry.userId ?? null,
      feature: entry.feature,
      provider: entry.provider,
      model: entry.model,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      total_tokens: entry.inputTokens + entry.outputTokens,
      estimated_cost_usd: entry.estimatedCostUsd,
      duration_ms: entry.durationMs,
      status: entry.status,
      error_message: entry.errorMessage ?? null,
      metadata: (entry.metadata ?? {}) as never,
    } as never);
  } catch {
    // Log de uso nunca deve derrubar a funcionalidade.
  }
}

/** Geração de texto livre. */
export async function generateAiText(request: AiTextRequest): Promise<AiTextResult> {
  const config = getAiConfig();
  const model = request.model || config.model;
  const started = Date.now();

  if (config.provider !== "openai") {
    throw new Error(`Provedor de IA não suportado: ${config.provider}`);
  }

  try {
    const completion = await openaiClient().chat.completions.create({
      model,
      max_completion_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: buildContent(request.prompt, request.attachments) },
      ],
    });

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const estimatedCostUsd = estimateCost(model, inputTokens, outputTokens);
    const text = (completion.choices[0]?.message?.content ?? "").trim();

    await logUsage({
      feature: request.feature,
      provider: config.provider,
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      durationMs: Date.now() - started,
      status: text ? "success" : "error",
      errorMessage: text ? null : "Resposta vazia",
      userId: request.userId ?? null,
      metadata: request.metadata,
    });

    if (!text) throw new Error("A IA não retornou resposta. Tente novamente.");
    return { text, provider: config.provider, model, inputTokens, outputTokens, estimatedCostUsd };
  } catch (error) {
    const friendly = friendlyError(error);
    await logUsage({
      feature: request.feature,
      provider: config.provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      durationMs: Date.now() - started,
      status: "error",
      errorMessage: friendly.message,
      userId: request.userId ?? null,
      metadata: request.metadata,
    });
    throw friendly;
  }
}

/** Geração com resposta estruturada, validada por Zod. */
export async function generateAiObject<T extends z.ZodTypeAny>(
  request: AiTextRequest & { schema: T; schemaName?: string },
): Promise<AiObjectResult<z.infer<T>>> {
  const config = getAiConfig();
  const model = request.model || config.model;
  const started = Date.now();

  if (config.provider !== "openai") {
    throw new Error(`Provedor de IA não suportado: ${config.provider}`);
  }

  try {
    const completion = await openaiClient().chat.completions.create({
      model,
      max_completion_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      response_format: zodResponseFormat(request.schema, request.schemaName ?? "resposta"),
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: buildContent(request.prompt, request.attachments) },
      ],
    });

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const estimatedCostUsd = estimateCost(model, inputTokens, outputTokens);
    const text = (completion.choices[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("A IA não retornou resposta. Tente novamente.");
    const object = request.schema.parse(JSON.parse(text)) as z.infer<T>;

    await logUsage({
      feature: request.feature,
      provider: config.provider,
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      durationMs: Date.now() - started,
      status: "success",
      userId: request.userId ?? null,
      metadata: request.metadata,
    });

    return { text, object, provider: config.provider, model, inputTokens, outputTokens, estimatedCostUsd };
  } catch (error) {
    const friendly = friendlyError(error);
    await logUsage({
      feature: request.feature,
      provider: config.provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      durationMs: Date.now() - started,
      status: "error",
      errorMessage: friendly.message,
      userId: request.userId ?? null,
      metadata: request.metadata,
    });
    throw friendly;
  }
}
