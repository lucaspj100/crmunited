import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { ASSISTANTS, type AssistantAnswer, type AssistantKind } from "@/lib/ai-assistants";

type Row = {
  id: string;
  assistant: AssistantKind;
  mode: string;
  instruction: string;
  input_text: string;
  response: AssistantAnswer;
  feedback: string | null;
  created_at: string;
  lead_id: string | null;
};

export function HistoryPanel() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ai-interactions-mine"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_interactions")
        .select("id, assistant, mode, instruction, input_text, response, feedback, created_at, lead_id")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const remove = async (id: string) => {
    const { error } = await supabase.from("ai_interactions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Registro excluído.");
    qc.invalidateQueries({ queryKey: ["ai-interactions-mine"] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando histórico…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Você ainda não gerou nenhuma resposta com os assistentes.</p>;

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const label = ASSISTANTS.find((a) => a.kind === r.assistant)?.short ?? r.assistant;
        const open = openId === r.id;
        return (
          <Card key={r.id}>
            <CardContent className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{label}</Badge>
                {r.mode && <Badge variant="outline" className="text-[10px]">{r.mode}</Badge>}
                <span className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </span>
                {r.feedback && <Badge className="text-[10px]">{r.feedback}</Badge>}
                <div className="ml-auto flex gap-1">
                  {r.response?.mensagem && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(r.response.mensagem);
                        toast.success("Resposta copiada.");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(open ? null : r.id)}>
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{r.instruction || r.input_text}</p>
              {open && (
                <div className="space-y-2 rounded-md bg-muted/40 p-2 text-xs">
                  <p className="whitespace-pre-wrap"><b>Entrada:</b> {r.input_text || "—"}</p>
                  <p className="whitespace-pre-wrap"><b>Estratégia:</b> {r.response?.estrategia || "—"}</p>
                  <p className="whitespace-pre-wrap"><b>Mensagem:</b> {r.response?.mensagem || "—"}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
