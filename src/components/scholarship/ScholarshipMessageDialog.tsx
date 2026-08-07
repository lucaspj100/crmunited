import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Copy, MessageCircle } from "lucide-react";
import { waLink } from "@/lib/constants";

export function ScholarshipMessageDialog({
  open,
  onOpenChange,
  title,
  description,
  message,
  phone,
  onOpenWhatsapp,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  message: string;
  phone?: string | null;
  onOpenWhatsapp?: () => void;
}) {
  const [text, setText] = useState(message);

  useEffect(() => {
    if (open) setText(message);
  }, [open, message]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar a mensagem");
    }
  };

  const openWa = () => {
    const url = waLink(phone, text);
    if (url === "#") {
      toast.error("Lead sem telefone válido");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenWhatsapp?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={11} className="text-sm" />
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="sm:mr-auto">
            Cancelar
          </Button>
          <Button type="button" variant="outline" onClick={copy} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" />Copiar mensagem
          </Button>
          {!!phone && (
            <Button type="button" onClick={openWa} className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />Abrir WhatsApp
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
