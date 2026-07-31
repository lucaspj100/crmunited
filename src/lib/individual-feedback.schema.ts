import { z } from "zod";

export const FeedbackSnapshotSchema = z.object({
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

export const FeedbackInputSchema = z.object({
  // Somente o primeiro nome e o cargo são enviados à IA; nenhum dado de contato.
  firstName: z.string().max(60).default(""),
  cargo: z.string().max(60).default(""),
  periodLabel: z.string().max(80).default(""),
  tone: z.enum(["direto", "equilibrado", "motivador"]).default("equilibrado"),
  leaderNotes: z.string().max(4000).default(""),
  extraContext: z.string().max(2000).default(""),
  current: FeedbackSnapshotSchema,
  previous: FeedbackSnapshotSchema,
  teamAverage: FeedbackSnapshotSchema,
  ranking: z.object({ position: z.number().nullable(), total: z.number() }),
  goals: z.object({
    matriculas: z.number().nullable(),
    entrevistas: z.number().nullable(),
    ligacoes: z.number().nullable(),
  }),
  refinement: z.enum(["curto", "direto", "motivador", "outra_versao"]).nullable().default(null),
  previousFeedback: z.string().max(8000).nullable().default(null),
});

export type FeedbackSnapshotInput = z.infer<typeof FeedbackSnapshotSchema>;
export type FeedbackAiInput = z.infer<typeof FeedbackInputSchema>;
