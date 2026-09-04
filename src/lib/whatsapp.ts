// Ponto único de abertura do WhatsApp no CRM.
// Toda tela deve usar waLink() para a URL e openWhatsapp() para abrir,
// garantindo um padrão consistente e interceptável (clique em <a href>).
import { waLink } from "@/lib/constants";

export { waLink };

export function whatsappUrl(phone: string | null | undefined, message?: string): string | null {
  const url = waLink(phone, message);
  return url === "#" ? null : url;
}

/** Abre o WhatsApp simulando um clique em link real (interceptável por extensão). */
export function openWhatsapp(phone: string | null | undefined, message?: string): boolean {
  const url = whatsappUrl(phone, message);
  if (!url) return false;
  if (typeof document === "undefined") return false;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
