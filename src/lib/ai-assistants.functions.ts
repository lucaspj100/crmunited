import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Attachment = z.object({
  name: z.string().max(200),
  mime: z.string().max(100),
  size: z.number().int().nonnegative(),
  dataUrl: z.string().max(22_000_000),
});

const Input = z.object({
  assistant: z.enum(["prospeccao", "entrevista", "negociacao"]),
  mode: z.string().max(120).default(""),
  instruction: z.string().max(2000).default(""),
  text: z.string().max(60000).default(""),
  tones: z.array(z.string().max(60)).max(6).default([]),
  attachments: z.array(Attachment).max(4).default([]),
  leadId: z.string().uuid().nullable().default(null),
  refinement: z.string().max(60).nullable().default(null),
  previousMessage: z.string().max(6000).nullable().default(null),
  save: z.boolean().default(true),
});

export const generateAssistantAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const hasContent = data.text.trim() || data.attachments.length > 0 || data.leadId;
    if (!hasContent) {
      throw new Error("Cole a conversa, envie um print, selecione um lead ou explique o que aconteceu.");
    }

    for (const a of data.attachments) {
      const isImage = /^image\/(png|jpe?g|webp)$/.test(a.mime);
      const isDoc = a.mime === "application/pdf" || a.mime === "text/plain";
      if (!isImage && !isDoc) throw new Error(`Arquivo "${a.name}" não é aceito.`);
      if (!a.dataUrl.startsWith("data:")) throw new Error(`Arquivo "${a.name}" inválido.`);
      if (isImage && a.size > 10 * 1024 * 1024) throw new Error(`"${a.name}" passa de 10 MB.`);
      if (!isImage && a.size > 15 * 1024 * 1024) throw new Error(`"${a.name}" passa de 15 MB.`);
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Integração de IA não configurada.");

    // Proteção contra chamadas duplicadas / uso excessivo.
    const since = new Date(Date.now() - 15_000).toISOString();
    const { count: recent } = await context.supabase
      .from("ai_interactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", since);
    if ((recent ?? 0) >= 4) throw new Error("Muitas gerações seguidas. Aguarde alguns segundos.");

    const today = new Date().toISOString().slice(0, 10);

    const [knowledgeRes, objectionsRes, campaignRes, examplesRes, configRes] = await Promise.all([
      context.supabase
        .from("ai_knowledge_items")
        .select("id, kind, title, category, description, content, structured, priority, updated_at, assistants, valid_from, valid_until")
        .eq("is_active", true)
        .order("priority", { ascending: true }),
      context.supabase.from("ai_objections").select("*").eq("is_active", true),
      context.supabase
        .from("ai_campaigns")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("ai_examples")
        .select("*")
        .eq("is_active", true)
        .eq("assistant", data.assistant)
        .order("updated_at", { ascending: false })
        .limit(12),
      context.supabase.from("ai_assistant_configs").select("*").eq("assistant", data.assistant).maybeSingle(),
    ]);

    const knowledge = (knowledgeRes.data ?? []).filter((k) => {
      const list = (k.assistants ?? []) as string[];
      const okAssistant = list.length === 0 || list.includes(data.assistant);
      const okFrom = !k.valid_from || k.valid_from <= today;
      const okUntil = !k.valid_until || k.valid_until >= today;
      return okAssistant && okFrom && okUntil;
    });

    const objections = (objectionsRes.data ?? []).filter((o) => {
      const list = (o.assistants ?? []) as string[];
      return list.length === 0 || list.includes(data.assistant);
    });

    const campaignRow = (campaignRes.data ?? [])[0] ?? null;
    const campaign =
      campaignRow &&
      (!campaignRow.starts_on || campaignRow.starts_on <= today) &&
      (!campaignRow.ends_on || campaignRow.ends_on >= today)
        ? campaignRow
        : null;

    // Ficha do lead: lida com o cliente do próprio usuário, então o RLS garante que
    // ninguém acessa lead de outro vendedor.
    let leadContext: string | null = null;
    let negotiation: string | null = null;
    if (data.leadId) {
      const { buildLeadContext } = await import("@/lib/ai-lead-context.server");
      const built = await buildLeadContext(context.supabase, data.leadId);
      if (!built) throw new Error("Lead não encontrado ou sem permissão de acesso.");
      leadContext = built.lead;
      negotiation = built.negotiation;
    }

    const { buildSystemPrompt, buildUserParts, callAssistant } = await import("@/lib/ai-assistants.server");

    const { system, sources } = buildSystemPrompt({
      assistant: data.assistant,
      knowledge: knowledge as never,
      objections: objections as never,
      campaign: campaign as never,
      examples: (examplesRes.data ?? []) as never,
      config: (configRes.data ?? null) as never,
      leadContext,
      negotiation,
    });

    const parts = buildUserParts({
      mode: data.mode,
      instruction: data.instruction,
      text: data.text,
      tones: data.tones,
      attachments: data.attachments,
      refinement: data.refinement,
      previousMessage: data.previousMessage,
    });

    const model = configRes.data?.model || "openai/gpt-5.5";
    const answer = await callAssistant({ apiKey, model, system, parts });

    const knowledgeVersion =
      knowledge.reduce((acc, k) => (k.updated_at > acc ? k.updated_at : acc), "").slice(0, 19) || today;

    let interactionId: string | null = null;
    if (data.save) {
      const { data: inserted } = await context.supabase
        .from("ai_interactions")
        .insert({
          user_id: context.userId,
          assistant: data.assistant,
          mode: data.mode,
          lead_id: data.leadId,
          instruction: data.instruction,
          input_text: data.text.slice(0, 20000),
          // Somente metadados: o conteúdo dos arquivos nunca é persistido.
          attachments: data.attachments.map((a) => ({ name: a.name, mime: a.mime, size: a.size })),
          tones: data.tones,
          response: answer as never,
          sources: { itens: sources } as never,
          knowledge_version: knowledgeVersion,
        })
        .select("id")
        .maybeSingle();
      interactionId = inserted?.id ?? null;
    }

    return { answer, sources, knowledgeVersion, interactionId };
  });
