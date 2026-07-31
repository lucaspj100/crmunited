import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateAssistantAnswer } from "@/lib/ai-assistants.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  ASSISTANTS,
  MODES,
  TONES,
  type AssistantAnswer,
  type AssistantKind,
  type AttachmentPayload,
} from "@/lib/ai-assistants";
import { AttachmentInput } from "./AttachmentInput";
import { LeadPicker, type LeadOption } from "./LeadPicker";
import { AnswerPanel } from "./AnswerPanel";
import { NegotiationForm, EMPTY_NEGOTIATION, type NegotiationState } from "./NegotiationForm";

export function AssistantWorkspace({ assistant, isAdmin }: { assistant: AssistantKind; isAdmin: boolean }) {
  const run = useServerFn(generateAssistantAnswer);
  const meta = ASSISTANTS.find((a) => a.kind === assistant)!;

  const [mode, setMode] = useState(MODES[assistant][0]);
  const [instruction, setInstruction] = useState("");
  const [text, setText] = useState("");
  const [tones, setTones] = useState<string[]>(["Natural"]);
  const [attachments, setAttachments] = useState<AttachmentPayload[]>([]);
  const [lead, setLead] = useState<LeadOption | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationState>(EMPTY_NEGOTIATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    answer: AssistantAnswer;
    sources: string[];
    knowledgeVersion: string;
    interactionId: string | null;
  } | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    setMode(MODES[assistant][0]);
    setResult(null);
    setError(null);
  }, [assistant]);

  const composedText = useMemo(() => {
    if (assistant !== "negociacao") return text;
    const extras: string[] = [];
    const p = Object.entries(negotiation.presented).filter(([, v]) => v);
    const c = Object.entries(negotiation.current_condition).filter(([, v]) => v);
    if (p.length) extras.push(`Condição apresentada: ${p.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    if (c.length) extras.push(`Condição atual: ${c.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    if (negotiation.already_reduced) extras.push(`Já reduzido: ${negotiation.already_reduced}`);
    if (negotiation.not_changed_yet) extras.push(`Ainda não alterado: ${negotiation.not_changed_yet}`);
    if (negotiation.narrative) extras.push(`Relato: ${negotiation.narrative}`);
    if (negotiation.authorization_data.has) {
      const auth = Object.entries(negotiation.authorization_data)
        .filter(([k, v]) => k !== "has" && v)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(", ");
      extras.push(`Autorização especial recebida: ${auth || "(sem detalhes)"}`);
    } else {
      extras.push("Autorização especial: não possui.");
    }
    return [text, extras.join("\n")].filter(Boolean).join("\n\n");
  }, [assistant, text, negotiation]);

  const generate = async (opts?: { refinement?: string; previousMessage?: string }) => {
    if (inflight.current) return;
    if (!composedText.trim() && attachments.length === 0 && !lead) {
      toast.error("Cole a conversa, envie um print, selecione um lead ou explique o que aconteceu.");
      return;
    }
    inflight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await run({
        data: {
          assistant,
          mode,
          instruction,
          text: composedText,
          tones,
          attachments,
          leadId: lead?.id ?? null,
          refinement: opts?.refinement ?? null,
          previousMessage: opts?.previousMessage ?? null,
          save: true,
        },
      });
      setResult(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar a resposta.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  };

  const toggleTone = (t: string) =>
    setTones((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <Card>
          <CardContent className="space-y-3 p-3">
            <div>
              <h2 className="text-sm font-semibold">{meta.label}</h2>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>

            <LeadPicker value={lead} onChange={setLead} />

            <div>
              <Label className="text-xs">Modo</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {MODES[assistant].map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={mode === m ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setMode(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">O que você precisa fazer agora?</Label>
              <Input
                className="mt-1"
                placeholder="Ex.: preciso criar um follow-up para levar esse lead para a entrevista."
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </div>

            <div>
              <Textarea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    void generate();
                  }
                }}
                placeholder="Cole a conversa, envie um print, selecione um lead ou explique o que aconteceu."
                className="text-sm"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ctrl + Enter para gerar · evite dados sensíveis desnecessários.
              </p>
            </div>

            <AttachmentInput attachments={attachments} onChange={setAttachments} />

            <div>
              <Label className="text-xs">Ações rápidas de tom</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {TONES.map((t) => (
                  <Badge
                    key={t}
                    variant={tones.includes(t) ? "default" : "outline"}
                    className="cursor-pointer text-[10px]"
                    onClick={() => toggleTone(t)}
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={() => generate()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {loading ? "IA analisando…" : "Gerar resposta"}
            </Button>
          </CardContent>
        </Card>

        {assistant === "negociacao" && (
          <NegotiationForm leadId={lead?.id ?? null} value={negotiation} onChange={setNegotiation} />
        )}
      </div>

      <div className="space-y-3">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-2">
              <p className="text-xs">{error}</p>
              <Button size="sm" variant="outline" onClick={() => generate()} disabled={loading}>
                Tentar novamente
              </Button>
            </div>
          </div>
        )}

        {loading && !result && (
          <Card>
            <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A IA está analisando o contexto…
            </CardContent>
          </Card>
        )}

        {result ? (
          <AnswerPanel
            answer={result.answer}
            sources={result.sources}
            knowledgeVersion={result.knowledgeVersion}
            interactionId={result.interactionId}
            isAdmin={isAdmin}
            loading={loading}
            onRegenerate={() => generate()}
            onRefine={(label, current) => generate({ refinement: label, previousMessage: current })}
          />
        ) : (
          !loading && (
            <Card className="border-dashed">
              <CardContent className="space-y-2 p-6 text-center text-sm text-muted-foreground">
                <Sparkles className="mx-auto h-6 w-6 text-primary" />
                <p className="font-medium text-foreground">Nada gerado ainda</p>
                <p className="text-xs">
                  Cole a conversa, envie um print com Ctrl + V, selecione um lead ou descreva a situação e clique em
                  gerar. A resposta vem separada em leitura, estratégia, mensagem pronta e alerta comercial.
                </p>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}
