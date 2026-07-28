import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  CONDITION_LABELS,
  MATERIAL_TYPE_LABELS,
  METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  REASON_LABELS,
  brl,
  computeEligibility,
  minimumFor,
  type BonusRule,
  type MaterialType,
  type PaymentCondition,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/materials";

export type MaterialFormState = {
  hasMaterial: boolean;
  materialType: MaterialType | null;
  saleValue: string;
  paymentStatus: PaymentStatus;
  paymentDate: string;
  paymentCondition: PaymentCondition | null;
  paymentMethod: PaymentMethod | null;
  installmentCount: string;
  notes: string;
};

export const emptyMaterialForm: MaterialFormState = {
  hasMaterial: true,
  materialType: null,
  saleValue: "",
  paymentStatus: "pending",
  paymentDate: "",
  paymentCondition: null,
  paymentMethod: null,
  installmentCount: "",
  notes: "",
};

export function parseValue(v: string): number | null {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return v.trim() === "" || isNaN(n) ? null : n;
}

export function MaterialFormFields({
  state,
  onChange,
  enrollmentDate,
  rules,
  showHasMaterial = true,
}: {
  state: MaterialFormState;
  onChange: (s: MaterialFormState) => void;
  enrollmentDate: string | null;
  rules?: BonusRule[];
  showHasMaterial?: boolean;
}) {
  const set = (patch: Partial<MaterialFormState>) => onChange({ ...state, ...patch });
  const value = parseValue(state.saleValue);
  const min = minimumFor(state.materialType, state.paymentCondition, rules);
  const preview = computeEligibility({
    materialType: state.materialType,
    saleValue: value,
    paymentStatus: state.hasMaterial ? state.paymentStatus : "exempt",
    paymentDate: state.paymentDate || null,
    paymentCondition: state.paymentCondition,
    paymentMethod: state.paymentMethod,
    installmentCount: parseValue(state.installmentCount),
    enrollmentDate,
    minimumAllowedValue: min,
  });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Material</Label>
        {showHasMaterial && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Possui material?</span>
            <Switch
              checked={state.hasMaterial}
              onCheckedChange={(v) => set({ hasMaterial: v, paymentStatus: v ? "pending" : "exempt" })}
            />
          </div>
        )}
      </div>

      {!state.hasMaterial ? (
        <p className="text-xs text-muted-foreground">Matrícula sem material — registrada como isenta.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Tipo do material</Label>
              <Select
                value={state.materialType ?? ""}
                onValueChange={(v) => set({ materialType: v as MaterialType })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((k) => (
                    <SelectItem key={k} value={k}>{MATERIAL_TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor de venda do material (R$)</Label>
              <Input inputMode="decimal" value={state.saleValue} placeholder="0,00"
                onChange={(e) => set({ saleValue: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Situação do pagamento</Label>
              <Select value={state.paymentStatus} onValueChange={(v) => set({ paymentStatus: v as PaymentStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["pending", "paid", "exempt"] as PaymentStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{PAYMENT_STATUS_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Condição de pagamento</Label>
              <Select
                value={state.paymentCondition ?? ""}
                onValueChange={(v) => set({ paymentCondition: v as PaymentCondition })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONDITION_LABELS) as PaymentCondition[]).map((k) => (
                    <SelectItem key={k} value={k}>{CONDITION_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <Select
                value={state.paymentMethod ?? ""}
                onValueChange={(v) => set({ paymentMethod: v as PaymentMethod })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((k) => (
                    <SelectItem key={k} value={k}>{METHOD_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {state.paymentCondition === "installment" && (
              <div>
                <Label className="text-xs">Número de parcelas</Label>
                <Input inputMode="numeric" value={state.installmentCount}
                  onChange={(e) => set({ installmentCount: e.target.value })} placeholder="Ex: 12" />
              </div>
            )}
            {state.paymentStatus === "paid" && (
              <div>
                <Label className="text-xs">Data do pagamento</Label>
                <Input type="date" value={state.paymentDate} onChange={(e) => set({ paymentDate: e.target.value })} />
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea rows={2} value={state.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>

          {min != null && (
            <div className={`rounded-md p-2 text-xs ${preview.priceRuleValid ? "bg-muted" : "bg-destructive/10 text-destructive"}`}>
              <div>Valor mínimo aplicável: <strong>{brl(min)}</strong></div>
              <div>Valor informado: <strong>{value == null ? "—" : brl(value)}</strong></div>
              {value != null && !preview.priceRuleValid && (
                <div>Diferença para o mínimo: <strong>{brl(min - value)}</strong></div>
              )}
              <div>Situação do preço: <strong>{preview.priceRuleValid ? "válido" : "abaixo do mínimo"}</strong></div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Situação preliminar para premiação: <strong>{REASON_LABELS[preview.reason]}</strong>. O registro pode ser
            salvo mesmo assim — o cálculo definitivo é feito pelo sistema.
          </p>
        </>
      )}
    </div>
  );
}
