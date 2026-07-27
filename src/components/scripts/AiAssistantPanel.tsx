import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateAssistantReply } from "@/lib/ai-assistant.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Copy, RefreshCw, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOALS = [
  "Responder o lead",
  "Conduzir para agendamento",
  "Responder objeção",
  "Fazer follow-up",
  "Retomar conversa",
  "Responder de forma mais curta",
  "Encerrar educadamente",
];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Resposta copiada.");
  } catch {
    toast.error("Não foi possível copiar.");
  }
}

export function AiAssistantPanel() {
  const run = useServerFn(generateAssistantReply);
  const [conversation, setConversation] = useState("");
  const [goal, setGoal] = useState(GOALS[0]);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ resposta: string; motivo: string; estagio: string } | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickImage = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/.test(file.type)) {
      toast.error("Envie um print em PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.onerror = () => toast.error("Falha ao carregar a imagem.");
    reader.readAsDataURL(file);
  };

  const generate = async (variation: boolean) => {
    if (!conversation.trim() && !image) {
      toast.error("Cole a conversa ou envie um print.");
      return;
    }
    setLoading(true);
    try {
      const res = await run({ data: { conversation, goal, imageDataUrl: image, variation } });
      setResult(res);
      setShowWhy(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar a resposta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Assistente IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Conversa com o lead</Label>
          <Textarea
            rows={7}
            value={conversation}
            onChange={(e) => setConversation(e.target.value)}
            placeholder="Cole aqui a conversa do WhatsApp…"
            className="mt-1"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Evite enviar dados sensíveis desnecessários. O conteúdo será utilizado apenas para gerar a sugestão de
            resposta.
          </p>
        </div>

        <div>
          <Label>Print da conversa (opcional)</Label>
          <div className="mt-1 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickImage(e.target.files?.[0])}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="mr-2 h-4 w-4" /> Enviar print
            </Button>
            {image && (
              <div className="flex items-center gap-2">
                <img src={image} alt="Print da conversa" className="h-10 w-10 rounded border object-cover" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setImage(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div>
          <Label>O que você quer conseguir com essa resposta?</Label>
          <Select value={goal} onValueChange={setGoal}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GOALS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full" onClick={() => generate(false)} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? "Gerando…" : "Gerar resposta"}
        </Button>

        {result && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="text-xs font-medium text-muted-foreground">Resposta sugerida</div>
            <p className="whitespace-pre-wrap text-sm">{result.resposta}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => copy(result.resposta)}>
                <Copy className="mr-2 h-4 w-4" /> Copiar resposta
              </Button>
              <Button size="sm" variant="outline" onClick={() => generate(true)} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" /> Gerar outra versão
              </Button>
            </div>
            {result.motivo && (
              <div className="pt-1">
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline"
                  onClick={() => setShowWhy((v) => !v)}
                >
                  Por que esta resposta?
                </button>
                {showWhy && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {result.motivo}
                    {result.estagio ? ` (Etapa: ${result.estagio})` : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
