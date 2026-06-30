import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fetchProductivity, todayIso, type ProductivityRow } from "@/lib/productivity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/checkout-do-dia")({
  component: CheckoutDoDia,
});

type DailyCheckout = {
  id: string;
  vendedor_id: string;
  data: string;
  submitted_at: string;
  linkedin_msgs: number;
  whatsapp_msgs: number;
  observacoes: string | null;
};

function CheckoutDoDia() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = todayIso();

  const { data: snapshot } = useQuery({
    queryKey: ["productivity_me_today", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ProductivityRow | null> => {
      const rows = await fetchProductivity({ start: today, end: today, vendedorId: user!.id });
      return rows[0] ?? null;
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["my_checkout_today", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DailyCheckout | null> => {
      const { data, error } = await supabase
        .from("daily_checkouts" as never)
        .select("*")
        .eq("vendedor_id", user!.id)
        .eq("data", today)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DailyCheckout | null;
    },
  });

  const [linkedin, setLinkedin] = useState(0);
  const [whats, setWhats] = useState(0);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setLinkedin(existing.linkedin_msgs);
      setWhats(existing.whatsapp_msgs);
      setObs(existing.observacoes ?? "");
    }
  }, [existing]);

  const save = async () => {
    if (!user || !snapshot) return;
    setSaving(true);
    const payload = {
      vendedor_id: user.id,
      data: today,
      submitted_at: new Date().toISOString(),
      ligacoes_feitas: snapshot.ligacoes_feitas,
      ligacoes_atendidas: snapshot.ligacoes_atendidas,
      interessados_gerados: snapshot.interessados_gerados,
      entrevistas_marcadas: snapshot.entrevistas_marcadas,
      matriculas: snapshot.matriculas,
      leads_trabalhados: snapshot.leads_trabalhados,
      leads_novos_atribuidos: snapshot.leads_novos_atribuidos,
      linkedin_msgs: linkedin,
      whatsapp_msgs: whats,
      observacoes: obs || null,
    };
    const { error } = await supabase
      .from("daily_checkouts" as never)
      .upsert(payload as never, { onConflict: "vendedor_id,data" });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar checkout: " + error.message);
      return;
    }
    toast.success(existing ? "Checkout atualizado" : "Checkout enviado");
    qc.invalidateQueries({ queryKey: ["my_checkout_today"] });
    qc.invalidateQueries({ queryKey: ["productivity"] });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">Checkout do dia</h1>
        <p className="text-sm text-muted-foreground">
          {existing
            ? `Você já fez o checkout hoje às ${new Date(existing.submitted_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Você pode revisar e atualizar.`
            : "Resumo automático do seu dia. Preencha apenas LinkedIn e WhatsApp."}
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>Resumo automático (CRM)</CardTitle></CardHeader>
        <CardContent>
          {!snapshot ? <p className="text-muted-foreground">Carregando…</p> : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Ligações feitas" value={snapshot.ligacoes_feitas} />
              <Stat label="Ligações atendidas" value={snapshot.ligacoes_atendidas} />
              <Stat label="Interessados gerados" value={snapshot.interessados_gerados} />
              <Stat label="Entrevistas marcadas" value={snapshot.entrevistas_marcadas} />
              <Stat label="Matrículas" value={snapshot.matriculas} />
              <Stat label="Leads trabalhados" value={snapshot.leads_trabalhados} />
              <Stat label="Leads novos" value={snapshot.leads_novos_atribuidos} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Preenchimento manual</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Mensagens no LinkedIn hoje</label>
              <Input type="number" min={0} value={linkedin} onChange={(e) => setLinkedin(Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="text-sm">Mensagens no WhatsApp hoje</label>
              <Input type="number" min={0} value={whats} onChange={(e) => setWhats(Number(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <label className="text-sm">Observações gerais (opcional)</label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={4} />
          </div>
          <Button onClick={save} disabled={saving || !snapshot}>
            {saving ? "Salvando…" : existing ? "Atualizar checkout" : "Enviar checkout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
