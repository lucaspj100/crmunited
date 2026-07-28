import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmPaymentDialog } from "./MaterialDialogs";
import {
  MATERIAL_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  REASON_LABELS,
  brl,
  fetchBonusRules,
  fetchMaterialSaleByLead,
  type MaterialSaleRow,
} from "@/lib/materials";

export function LeadMaterialSection({ leadId, leadName }: { leadId: string; leadName: string }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<MaterialSaleRow | null>(null);
  const { data: rules } = useQuery({ queryKey: ["material-rules"], queryFn: fetchBonusRules });
  const { data: sale } = useQuery({
    queryKey: ["material-sale", leadId],
    queryFn: () => fetchMaterialSaleByLead(leadId),
  });
  if (!sale) return null;

  const row: MaterialSaleRow = { ...sale, lead_name: leadName, seller_name: null };

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">Material</div>
      <div className="text-sm">
        {sale.material_type ? MATERIAL_TYPE_LABELS[sale.material_type] : "Tipo não informado"} ·{" "}
        {sale.sale_value != null ? brl(sale.sale_value) : "sem valor"} · {PAYMENT_STATUS_LABELS[sale.payment_status]}
        {sale.payment_date ? ` em ${sale.payment_date}` : ""}
      </div>
      <Badge variant={sale.eligible_for_bonus ? "default" : "secondary"}>
        {REASON_LABELS[sale.bonus_eligibility_reason]}
      </Badge>
      {sale.payment_status !== "paid" && sale.payment_status !== "cancelled" && sale.payment_status !== "refunded" && (
        <div>
          <Button size="sm" variant="outline" onClick={() => setConfirming(row)}>
            Confirmar pagamento do material
          </Button>
        </div>
      )}
      <ConfirmPaymentDialog
        sale={confirming}
        rules={rules}
        onClose={() => setConfirming(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["material-sale", leadId] });
          qc.invalidateQueries({ queryKey: ["material-sales"] });
        }}
      />
    </div>
  );
}
