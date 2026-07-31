import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FeedbackInputSchema } from "@/lib/individual-feedback.schema";

export const generateIndividualFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => FeedbackInputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { generateFeedbackWithAi } = await import("@/lib/individual-feedback.server");
    return generateFeedbackWithAi(data, context.userId);
  });
