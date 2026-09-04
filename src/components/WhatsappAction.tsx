import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

type Props = {
  phone: string | null | undefined;
  message?: string;
  label?: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "default" | "secondary";
  className?: string;
  stopPropagation?: boolean;
  onOpened?: () => void;
};

/** Botão único de ação de WhatsApp usado em todo o CRM. */
export function WhatsappAction({
  phone,
  message,
  label,
  size = "sm",
  variant = "outline",
  className,
  stopPropagation,
  onOpened,
}: Props) {
  const url = whatsappUrl(phone, message);
  if (!url) return null;
  return (
    <Button asChild size={size} variant={variant} className={cn("gap-1.5", className)} title="Abrir WhatsApp">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          onOpened?.();
        }}
      >
        <MessageCircle className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}
