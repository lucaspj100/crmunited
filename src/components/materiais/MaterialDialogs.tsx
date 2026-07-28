import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { MaterialFormFields, emptyMaterialForm, parseValue, type MaterialFormState } from "./MaterialFormFields";
import {
  saveMaterialSale,
  updateMaterialStatus,
  type BonusRule,
  type MaterialSaleRow,
  type PaymentStatus,
} from "@/lib/materials";

export function ConfirmPaymentDialog({
  sale,
  rules,
  onClose,
  onSaved,
}: {
  sale: MaterialSaleRow | null;
  rules?: BonusRule[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<MaterialFormState>(() => ({
    ...emptyMaterialForm,
    hasMaterial: true,
    materialType: sale?.material_type ?? null,
    saleValue: sale?.sale_value != null ? String(sale.sale_value) : "",
    paymentStatus: "paid",
    paymentDate: sale?.payment_date ?? new Date().toISOString().slice(0, 10),
    paymentCondition: sale?.payment_condition ?? null,
    paymentMethod: sale?.payment_method ?? null,
    installmentCount: sale?.installment_count != null ? String(sale.installment_count) : "",
    notes: sale?.notes ?? "",
  }));
  const [saving, setSaving] = useState(false);
  if (!sale || !user) return null;

  const submit = async () => {
    if (!state.paymentDate) return toast.error("Informe a data real do pagamento");
    if (!state.materialType) return toast.error("Informe o tipo do material");
    if (!state.paymentCondition) return toast.error("Informe a condição de pagamento");
    if (!state.paymentMethod) return toast.error("Informe a forma de pagamento");
    if (parseValue(state.saleValue) == null) return toast.error("Informe o valor recebido");
    setSaving(true);
    try {
      await saveMaterialSale(
        {
          leadId: sale.lead_id,
          enrollmentDate: sale.enrollment_date,
          materialType: state.materialType,
          saleValue: parseValue(state.saleValue),
          paymentStatus: "paid",
          paymentDate: state.paymentDate,
          paymentCondition: state.paymentCondition,
          paymentMethod: state.paymentMethod,
          installmentCount: parseValue(state.installmentCount),
          notes: state.notes,
        },
        sale.seller_id,
      );
      toast.success("Pagamento do material confirmado");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Confirmar pagamento do material — {sale.lead_name ?? "lead"}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Informe a data real em que o aluno pagou (não a data de hoje, se forem diferentes).
        </p>
        <div onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault(); }}>
          <MaterialFormFields
            state={state}
            onChange={setState}
            enrollmentDate={sale.enrollment_date}
            rules={rules}
            showHasMaterial={false}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Confirmar pagamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export function StatusChangeDialog({
  sale,
  status,
  onClose,
  onSaved,
}: {
  sale: MaterialSaleRow | null;
  status: PaymentStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  if (!sale || !user) return null;
  const title = status === "cancelled" ? "Cancelar material" : "Registrar estorno";

  const submit = async () => {
    if (reason.trim().length < 5) return toast.error("Informe uma justificativa");
    setSaving(true);
    try {
      await updateMaterialStatus(sale.id, status, reason.trim(), user.id);
      toast.success(`${title} concluído`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title} — {sale.lead_name ?? "lead"}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          O registro não é apagado: apenas muda de situação e sai automaticamente da premiação.
        </p>
        <div>
          <Label>Justificativa *</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
