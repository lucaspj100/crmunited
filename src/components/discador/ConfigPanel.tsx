import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DEFAULT_WHATSAPP_TEMPLATE, getWhatsappTemplate, setWhatsappTemplate } from "@/lib/prospect-status";
import { toast } from "sonner";

export function ConfigPanel() {
  const [text, setText] = useState(getWhatsappTemplate());

  const save = () => {
    setWhatsappTemplate(text);
    toast.success("Mensagem padrão salva (neste dispositivo)");
  };

  return (
    <Card>
      <CardHeader><CardTitle>Configurações do Discador</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Mensagem padrão de WhatsApp</Label>
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <p className="mt-1 text-xs text-muted-foreground">Usada no botão WhatsApp do Discador. Salva no navegador atual.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={save}>Salvar</Button>
          <Button variant="outline" onClick={() => setText(DEFAULT_WHATSAPP_TEMPLATE)}>Restaurar padrão</Button>
        </div>
      </CardContent>
    </Card>
  );
}
