// Endpoint público seguro para o formulário do processo bolsista.
// Protegido por segredo compartilhado no header — nunca expõe chaves do CRM.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const str = (max: number) => z.string().trim().max(max).optional().nullable();

const schema = z.object({
  public_slug: z.string().trim().min(2).max(60),
  external_lead_id: z.string().trim().min(3).max(120),
  nome: z.string().trim().min(1).max(200),
  whatsapp: z.string().trim().min(8).max(40),
  email: z.string().trim().email().max(200),
  cidade_estado: str(200),
  profissao: str(200),
  empresa: str(200),
  nivel_ingles: str(200),
  motivo_ingles: str(2000),
  impacto_ingles: str(2000),
  perdeu_oportunidade: str(2000),
  motivo_nao_faz_curso: str(2000),
  prazo_inicio: str(200),
  alinhamento_financeiro: str(200),
  decisao_entrevista: str(200),
  classificacao: str(60),
  alta_prioridade: z.boolean().optional().nullable(),
  status_formulario: str(60),
  etapa_formulario: str(120),
  respostas_json: z.record(z.unknown()).optional().nullable(),
  entrevista_solicitada_para: str(60),
  formulario_concluido: z.boolean().optional().nullable(),
  origem: str(120),
  source_system: str(60),
});

const MAX_BODY_BYTES = 64 * 1024;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, x-scholarship-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });

export const Route = createFileRoute("/api/public/receive-scholarship-lead")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "content-type, x-scholarship-secret",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
          },
        }),
      POST: async ({ request }) => {
        const secret = process.env["SCHOLARSHIP_WEBHOOK_SECRET"];
        if (!secret) {
          console.error("[scholarship] SCHOLARSHIP_WEBHOOK_SECRET ausente");
          return json({ ok: false, error: "not_configured" }, 503);
        }
        const provided = request.headers.get("x-scholarship-secret") ?? "";
        if (provided.length !== secret.length || provided !== secret) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
          return json({ ok: false, error: "payload_too_large" }, 413);
        }

        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(raw);
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const parsed = schema.safeParse(parsedBody);
        if (!parsed.success) {
          return json({ ok: false, error: "invalid_payload" }, 400);
        }

        const { receiveScholarshipLead } = await import("@/lib/scholarship.server");
        const result = await receiveScholarshipLead(parsed.data);

        if (!result.ok) {
          const status = result.code === "invalid_slug" ? 404 : result.code === "invalid_phone" ? 400 : 500;
          return json({ ok: false, error: result.code }, status);
        }
        return json({ ok: true, lead_id: result.lead_id, created: result.created, status: result.status }, 200);
      },
    },
  },
});
