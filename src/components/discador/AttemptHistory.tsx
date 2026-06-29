import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Phone, MessageCircle, Edit3 } from "lucide-react";

export function AttemptHistory({ contactId }: { contactId: string }) {
  const { data } = useQuery({
    queryKey: ["prospect_attempts", contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from("prospect_attempts")
        .select("id, tipo_acao, resultado, observacao, created_at, vendedor_id")
        .eq("prospect_contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(50);
      // Oculta registros legados sem resultado (criados pelo antigo fluxo de "clicar em Ligar").
      return (data ?? []).filter((a) => a.tipo_acao === "edicao" || !!a.resultado);
    },
  });
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">Sem tentativas registradas.</p>;
  return (
    <ul className="space-y-2">
      {data.map((a) => {
        const Icon = a.tipo_acao === "ligacao" ? Phone : a.tipo_acao === "whatsapp" ? MessageCircle : Edit3;
        return (
          <li key={a.id} className="flex gap-3 rounded-md border bg-card p-2 text-sm">
            <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">{a.tipo_acao}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(a.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
              </div>
              {a.resultado && <div className="text-xs">Resultado: {a.resultado}</div>}
              {a.observacao && <div className="text-xs text-muted-foreground">{a.observacao}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
