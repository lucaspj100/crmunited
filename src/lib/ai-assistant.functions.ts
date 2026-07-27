import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  conversation: z.string().max(20000).default(""),
  goal: z.string().max(300).default(""),
  imageDataUrl: z.string().max(8_000_000).nullable().default(null),
  variation: z.boolean().default(false),
});

export const generateAssistantReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    if (!data.conversation.trim() && !data.imageDataUrl) {
      throw new Error("Cole a conversa ou envie um print para gerar a resposta.");
    }
    if (data.imageDataUrl && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(data.imageDataUrl)) {
      throw new Error("Imagem inválida. Envie um print em PNG, JPG ou WEBP.");
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Integração de IA não configurada.");

    const { buildSystemPrompt, generateReply } = await import("@/lib/ai-assistant.server");

    const [{ data: settings }, { data: scripts }] = await Promise.all([
      context.supabase.from("ai_assistant_settings").select("*").eq("id", true).maybeSingle(),
      context.supabase
        .from("sales_scripts")
        .select("title, category, content")
        .eq("is_active", true)
        .order("category")
        .order("sort_order"),
    ]);

    const system = buildSystemPrompt(
      {
        instructions: settings?.instructions ?? "",
        course_information: settings?.course_information ?? "",
        pricing_rules: settings?.pricing_rules ?? "",
        objection_rules: settings?.objection_rules ?? "",
        prohibited_claims: settings?.prohibited_claims ?? "",
      },
      scripts ?? [],
    );

    return await generateReply({
      apiKey,
      system,
      conversation: data.conversation,
      goal: data.goal,
      imageDataUrl: data.imageDataUrl,
      variation: data.variation,
    });
  });
