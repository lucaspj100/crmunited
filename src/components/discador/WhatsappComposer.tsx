import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Copy, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  fetchActiveTemplates,
  pickRandomIndex,
  renderTemplate,
  type WhatsappTemplate,
} from "@/lib/whatsapp-templates";
import type { ProspectContact } from "@/lib/prospect-queue";

type Props = {
  contact: ProspectContact;
};

export function WhatsappComposer({ contact }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<number>(-1);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["wpp_templates", "primeira_abordagem"],
    queryFn: () => fetchActiveTemplates("primeira_abordagem"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: sellerName } = useQuery({
    enabled: !!user,
    queryKey: ["seller_name", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user!.id)
        .maybeSingle();
      const full = (data?.full_name ?? "").trim();
      if (full) return full.split(/\s+/)[0];
      return (data?.email ?? "").split("@")[0] || "";
    },
    staleTime: 10 * 60 * 1000,
  });

  const current: WhatsappTemplate | null = useMemo(() => {
    if (index < 0 || index >= templates.length) return null;
    return templates[index];
  }, [index, templates]);

  const message = useMemo(() => {
    if (!current) return "";
    return renderTemplate(current.body, {
      nome: contact.nome,
      empresa: contact.empresa,
      cargo: contact.cargo,
      vendedor: sellerName ?? "",
    });
  }, [current, contact, sellerName]);

  // Reset ao trocar contato
  useEffect(() => {
    setOpen(false);
    setIndex(-1);
  }, [contact.id]);

  const generate = () => {
    if (templates.length === 0) {
      toast.error("Nenhum modelo ativo cadastrado. Peça ao ADM para cadastrar em Configurações.");
      return;
    }
    setIndex(pickRandomIndex(templates.length));
    setOpen(true);
  };

  const trocar = () => {
    if (templates.length === 0) return;
    setIndex((prev) => pickRandomIndex(templates.length, prev));
  };

  const logAction = async (type: "copiado" | "enviado") => {
    if (!user || !current) return;
    try {
      await supabase.from("prospect_attempts").insert({
        prospect_contact_id: contact.id,
        vendedor_id: user.id,
        tipo_acao: "whatsapp",
        telefone_normalizado: contact.telefone_normalizado,
        resultado: type === "enviado" ? "WhatsApp iniciado" : "Mensagem copiada",
        observacao: `Modelo: ${current.name}`,
      });
    } catch {
      // silencioso — não bloqueia UX
    }
  };

  const copiar = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem copiada");
      void logAction("copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const abrirWhatsapp = () => {
    if (!message || !contact.telefone_normalizado) return;
    window.open(
      `https://wa.me/${contact.telefone_normalizado}?text=${encodeURIComponent(message)}`,
      "_blank",
    );
    void logAction("enviado");
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={generate}
        disabled={isLoading}
        className="w-full h-10 justify-center text-sm"
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Gerar mensagem WhatsApp
      </Button>
    );
  }

  return (
    <Card className="border-emerald-500/40">
      <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-600" />
          Mensagem WhatsApp
        </CardTitle>
        {current && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={current.name}>
            {current.name}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-3 pt-2 space-y-2">
        <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words min-h-[120px]">
          {message || <span className="text-muted-foreground italic">A mensagem aparecerá aqui.</span>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" size="sm" variant="outline" onClick={trocar} disabled={templates.length < 2}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Trocar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={copiar} disabled={!message}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={abrirWhatsapp}
            disabled={!message || !contact.telefone_normalizado}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="h-3.5 w-3.5 mr-1" /> Abrir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
