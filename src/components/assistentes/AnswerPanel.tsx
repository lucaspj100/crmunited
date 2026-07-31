import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Copy, RefreshCw, ThumbsDown, ThumbsUp, Loader2, Database } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { REFINEMENTS, type AssistantAnswer } from "@/lib/ai-assistants";

type Props = {
  answer: AssistantAnswer;
  sources: string[];
  knowledgeVersion: string;
  interactionId: string | null;
  isAdmin: boolean;
  loading: boolean;
  onRegenerate: () => void;
  onRefine: (label: string, current: string) => void;
};

export function AnswerPanel({
  answer,
  sources,
  knowledgeVersion,
  interactionId,
  isAdmin,
  loading,
  onRegenerate,
  onRefine,
}: Props) {
  const [message, setMessage] = useState(answer.mensagem);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);

  useEffect(() => {
    setMessage(answer.mensagem);
    setFeedback(null);
    setComment("");
    setShowComment(false);
  }, [answer]);

  const copyMessage = async () => {
    if (!message.trim()) {
      toast.error("Não há mensagem para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Resposta copiada.");
      if (interactionId) {
        await supabase.from("ai_interactions").update({ copied_message: message }).eq("id", interactionId);
      }
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const sendFeedback = async (value: string, text?: string) => {
    setFeedback(value);
    if (!interactionId) return;
    await supabase
      .from("ai_interactions")
      .update({ feedback: value, feedback_comment: text ?? null })
      .eq("id", interactionId);
    toast.success("Obrigado! Seu retorno foi registrado para análise.");
  };

  const L = answer.leitura;
  const readings: [string, string][] = [
    ["Estágio atual", L.estagio],
    ["Já descoberto", L.descoberto],
    ["Principal necessidade", L.necessidade],
    ["Possível objeção", L.objecao],
    ["Falta descobrir", L.falta_descobrir],
    ["Próximo passo", L.proximo_passo],
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 p-3">
          <h3 className="text-sm font-semibold">1. Leitura da situação</h3>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {readings.map(([label, val]) => (
              <div key={label} className="rounded-md bg-muted/40 p-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="text-xs">{val || "—"}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {answer.estrategia && (
        <Card>
          <CardContent className="space-y-1 p-3">
            <h3 className="text-sm font-semibold">2. Estratégia recomendada</h3>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{answer.estrategia}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-2 p-3">
          <h3 className="text-sm font-semibold">3. Mensagem pronta</h3>
          {answer.mensagem ? (
            <>
              <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} className="text-sm" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={copyMessage}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar resposta
                </Button>
                <Button size="sm" variant="outline" onClick={onRegenerate} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Gerar outra versão
                </Button>
                {REFINEMENTS.map((r) => (
                  <Button
                    key={r.key}
                    size="sm"
                    variant="outline"
                    disabled={loading}
                    onClick={() => onRefine(r.label, message)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Este modo não gera mensagem para o lead — a orientação está nos blocos acima.
            </p>
          )}
        </CardContent>
      </Card>

      {answer.alerta && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">4. Alerta comercial</p>
            <p className="text-xs">{answer.alerta}</p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="space-y-2 p-3">
          <p className="text-xs font-medium">Essa resposta ajudou?</p>
          <div className="flex flex-wrap gap-2">
            {["Funcionou", "Não funcionou", "Resposta boa", "Resposta ruim", "Precisa melhorar"].map((f) => (
              <Button
                key={f}
                size="sm"
                variant={feedback === f ? "default" : "outline"}
                onClick={() => {
                  if (f === "Resposta ruim" || f === "Não funcionou" || f === "Precisa melhorar") {
                    setFeedback(f);
                    setShowComment(true);
                  } else {
                    void sendFeedback(f);
                  }
                }}
              >
                {f === "Funcionou" || f === "Resposta boa" ? (
                  <ThumbsUp className="mr-2 h-3 w-3" />
                ) : (
                  <ThumbsDown className="mr-2 h-3 w-3" />
                )}
                {f}
              </Button>
            ))}
          </div>
          {showComment && (
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[200px] flex-1"
                placeholder="O que ficou errado?"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button
                size="sm"
                onClick={() => {
                  void sendFeedback(feedback ?? "Precisa melhorar", comment);
                  setShowComment(false);
                }}
              >
                Enviar
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            O retorno não altera a IA automaticamente: entra em uma fila para análise da administração.
          </p>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardContent className="space-y-1 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold">
              <Database className="h-3.5 w-3.5" /> Base consultada
            </p>
            <div className="flex flex-wrap gap-1">
              {[...new Set([...answer.base_consultada, ...sources])].map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
            {answer.regras_utilizadas.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Regras aplicadas: {answer.regras_utilizadas.join(" · ")}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">Versão da base: {knowledgeVersion}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
