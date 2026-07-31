import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type NegotiationState = {
  presented: Record<string, string>;
  current_condition: Record<string, string>;
  already_reduced: string;
  not_changed_yet: string;
  narrative: string;
  authorization_data: Record<string, string | boolean>;
};

export const EMPTY_NEGOTIATION: NegotiationState = {
  presented: {},
  current_condition: {},
  already_reduced: "",
  not_changed_yet: "",
  narrative: "",
  authorization_data: { has: false },
};

const PRESENTED_FIELDS: [string, string][] = [
  ["matricula", "Matrícula"],
  ["mensalidade", "Mensalidade"],
  ["tipo_material", "Tipo de material"],
  ["valor_material", "Valor do material"],
  ["forma_pagamento", "Forma de pagamento"],
  ["data_inicio", "Data de início"],
  ["primeiro_vencimento", "1º vencimento"],
  ["observacoes", "Observações"],
];

const CURRENT_FIELDS: [string, string][] = [
  ["matricula", "Matrícula atual"],
  ["mensalidade", "Mensalidade atual"],
  ["material", "Material atual"],
  ["valor", "Valor atual"],
];

const AUTH_FIELDS: [string, string][] = [
  ["autorizado_por", "Autorizado por"],
  ["item", "Item autorizado"],
  ["condicao", "Condição autorizada"],
  ["forma_pagamento", "Forma de pagamento"],
  ["data", "Data"],
  ["validade", "Validade"],
  ["condicao_uso", "Condição para utilização"],
  ["observacao", "Observação"],
];

export function NegotiationForm({
  leadId,
  value,
  onChange,
}: {
  leadId: string | null;
  value: NegotiationState;
  onChange: (next: NegotiationState) => void;
}) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from("ai_negotiation_contexts").select("*").eq("lead_id", leadId).maybeSingle();
      if (!alive || !data) return;
      onChange({
        presented: (data.presented ?? {}) as Record<string, string>,
        current_condition: (data.current_condition ?? {}) as Record<string, string>,
        already_reduced: data.already_reduced ?? "",
        not_changed_yet: data.not_changed_yet ?? "",
        narrative: data.narrative ?? "",
        authorization_data: (data.authorization_data ?? { has: false }) as Record<string, string | boolean>,
      });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const save = async () => {
    if (!leadId) {
      toast.error("Selecione um lead do CRM para salvar a negociação.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("ai_negotiation_contexts").upsert(
      {
        lead_id: leadId,
        presented: value.presented,
        current_condition: value.current_condition,
        already_reduced: value.already_reduced,
        not_changed_yet: value.not_changed_yet,
        narrative: value.narrative,
        authorization_data: value.authorization_data,
      },
      { onConflict: "lead_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Negociação salva neste lead.");
  };

  const setPresented = (k: string, v: string) => onChange({ ...value, presented: { ...value.presented, [k]: v } });
  const setCurrent = (k: string, v: string) =>
    onChange({ ...value, current_condition: { ...value.current_condition, [k]: v } });
  const setAuth = (k: string, v: string | boolean) =>
    onChange({ ...value, authorization_data: { ...value.authorization_data, [k]: v } });

  const hasAuth = !!value.authorization_data.has;

  return (
    <Card>
      <CardContent className="space-y-4 p-3">
        <div>
          <p className="mb-2 text-sm font-semibold">Condição apresentada na entrevista</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PRESENTED_FIELDS.map(([k, label]) => (
              <div key={k}>
                <Label className="text-[11px]">{label}</Label>
                <Input
                  className="mt-1 h-8 text-xs"
                  value={value.presented[k] ?? ""}
                  onChange={(e) => setPresented(k, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Condição atual</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CURRENT_FIELDS.map(([k, label]) => (
              <div key={k}>
                <Label className="text-[11px]">{label}</Label>
                <Input
                  className="mt-1 h-8 text-xs"
                  value={value.current_condition[k] ?? ""}
                  onChange={(e) => setCurrent(k, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[11px]">O que já foi reduzido</Label>
              <Textarea
                rows={2}
                className="mt-1 text-xs"
                value={value.already_reduced}
                onChange={(e) => onChange({ ...value, already_reduced: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[11px]">O que ainda não foi alterado</Label>
              <Textarea
                rows={2}
                className="mt-1 text-xs"
                value={value.not_changed_yet}
                onChange={(e) => onChange({ ...value, not_changed_yet: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs font-semibold">Contexto da negociação</Label>
          <Textarea
            rows={3}
            className="mt-1 text-xs"
            placeholder="Conte o que aconteceu na entrevista, o que foi apresentado, qual objeção o lead trouxe e o que você já respondeu."
            value={value.narrative}
            onChange={(e) => onChange({ ...value, narrative: e.target.value })}
          />
        </div>

        <div className="rounded-md border p-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Autorização especial recebida</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{hasAuth ? "Sim" : "Não"}</span>
              <Switch checked={hasAuth} onCheckedChange={(v) => setAuth("has", v)} />
            </div>
          </div>
          {hasAuth && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {AUTH_FIELDS.map(([k, label]) => (
                <div key={k}>
                  <Label className="text-[11px]">{label}</Label>
                  <Input
                    className="mt-1 h-8 text-xs"
                    value={String(value.authorization_data[k] ?? "")}
                    onChange={(e) => setAuth(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <Button size="sm" variant="outline" onClick={save} disabled={saving || !leadId}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar negociação no lead
        </Button>
      </CardContent>
    </Card>
  );
}
