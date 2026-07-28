import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { periodRange, PERIOD_LABELS, type Period } from "@/lib/productivity";
import {
  CONDITION_LABELS,
  MATERIAL_TYPE_LABELS,
  METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  REASON_LABELS,
  aggregate,
  brl,
  fetchBonusRules,
  fetchMaterialSales,
  saveMaterialSale,
  type BonusReason,
  type MaterialSaleRow,
  type MaterialType,
  type PaymentCondition,
  type PaymentStatus,
} from "@/lib/materials";
import { ConfirmPaymentDialog, StatusChangeDialog } from "@/components/materiais/MaterialDialogs";
import { MaterialFormFields, emptyMaterialForm, parseValue, type MaterialFormState } from "@/components/materiais/MaterialFormFields";

export const Route = createFileRoute("/_authenticated/materiais")({
  component: MateriaisPage,
  head: () => ({
    meta: [
      { title: "Materiais e premiação | CRM United" },
      { name: "description", content: "Controle de materiais vendidos nas matrículas e elegibilidade para premiação individual e de equipe." },
      { property: "og:title", content: "Materiais e premiação | CRM United" },
      { property: "og:description", content: "Acompanhe materiais vendidos, pagamentos e metas de premiação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

type Goal = {
  id: string;
  goal_type: "individual" | "team";
  seller_id: string | null;
  minimum_amount: number;
  bonus_amount: number | null;
  is_active: boolean;
};

function MateriaisPage() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");

  const [period, setPeriod] = useState<Period>("mes");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const range = periodRange(period, customStart, customEnd);

  const [fSeller, setFSeller] = useState<string>("all");
  const [fType, setFType] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fCondition, setFCondition] = useState<string>("all");
  const [fMethod, setFMethod] = useState<string>("all");
  const [fEligible, setFEligible] = useState<string>("all");
  const [fReason, setFReason] = useState<string>("all");
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");

  const [confirming, setConfirming] = useState<MaterialSaleRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ sale: MaterialSaleRow; status: PaymentStatus } | null>(null);
  const [editing, setEditing] = useState<MaterialSaleRow | null>(null);
  const [history, setHistory] = useState<MaterialSaleRow | null>(null);

  const { data: rules } = useQuery({ queryKey: ["material-rules"], queryFn: fetchBonusRules });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["material-sales", range.start, range.end],
    queryFn: () => fetchMaterialSales(range),
  });
  const { data: goals = [] } = useQuery({
    queryKey: ["material-goals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("material_bonus_goals" as never).select("*").eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as Goal[];
    },
  });

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (!isAdmin && r.seller_id !== user?.id) return false;
      if (fSeller !== "all" && r.seller_id !== fSeller) return false;
      if (fType !== "all" && r.material_type !== fType) return false;
      if (fStatus !== "all" && r.payment_status !== fStatus) return false;
      if (fCondition !== "all" && r.payment_condition !== fCondition) return false;
      if (fMethod !== "all" && r.payment_method !== fMethod) return false;
      if (fEligible === "yes" && !r.eligible_for_bonus) return false;
      if (fEligible === "no" && r.eligible_for_bonus) return false;
      if (fReason !== "all" && r.bonus_eligibility_reason !== fReason) return false;
      const v = Number(r.sale_value ?? 0);
      if (fMin && v < Number(fMin.replace(",", "."))) return false;
      if (fMax && v > Number(fMax.replace(",", "."))) return false;
      return true;
    });
  }, [rows, isAdmin, user?.id, fSeller, fType, fStatus, fCondition, fMethod, fEligible, fReason, fMin, fMax]);

  const mine = useMemo(() => visible.filter((r) => r.seller_id === user?.id), [visible, user?.id]);
  const myTotals = aggregate(mine);
  const teamTotals = aggregate(visible);

  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.seller_id, r.seller_name ?? "—");
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const ranking = useMemo(() => {
    const map = new Map<string, MaterialSaleRow[]>();
    for (const r of visible) {
      const arr = map.get(r.seller_id) ?? [];
      arr.push(r);
      map.set(r.seller_id, arr);
    }
    return [...map.entries()]
      .map(([id, list]) => ({
        id,
        name: list[0].seller_name ?? "—",
        totals: aggregate(list),
        goal: goals.find((g) => g.goal_type === "individual" && g.seller_id === id)?.minimum_amount ?? null,
      }))
      .sort((a, b) => b.totals.validTotal - a.totals.validTotal);
  }, [visible, goals]);

  const myGoal = goals.find((g) => g.goal_type === "individual" && g.seller_id === user?.id)?.minimum_amount ?? null;
  const teamGoal = goals.find((g) => g.goal_type === "team")?.minimum_amount ?? null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["material-sales"] });

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Materiais e premiação</h1>
        <p className="text-sm text-muted-foreground">
          Competência pelo mês da matrícula · {PERIOD_LABELS[period]} ({range.start} a {range.end})
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="min-w-[160px]">
          <Label className="text-xs">Período (mês da matrícula)</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <>
            <div><Label className="text-xs">De</Label><Input type="date" className="w-36" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></div>
            <div><Label className="text-xs">Até</Label><Input type="date" className="w-36" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></div>
          </>
        )}
        {isAdmin && (
          <div className="min-w-[160px]">
            <Label className="text-xs">Vendedor</Label>
            <Select value={fSeller} onValueChange={setFSeller}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="min-w-[140px]">
          <Label className="text-xs">Tipo</Label>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((k) => (
                <SelectItem key={k} value={k}>{MATERIAL_TYPE_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs">Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((k) => (
                <SelectItem key={k} value={k}>{PAYMENT_STATUS_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[130px]">
          <Label className="text-xs">Condição</Label>
          <Select value={fCondition} onValueChange={setFCondition}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(Object.keys(CONDITION_LABELS) as PaymentCondition[]).map((k) => (
                <SelectItem key={k} value={k}>{CONDITION_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[130px]">
          <Label className="text-xs">Forma</Label>
          <Select value={fMethod} onValueChange={setFMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[150px]">
          <Label className="text-xs">Elegível</Label>
          <Select value={fEligible} onValueChange={setFEligible}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="yes">Válido para premiação</SelectItem>
              <SelectItem value="no">Não válido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs">Motivo</Label>
          <Select value={fReason} onValueChange={setFReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(REASON_LABELS) as BonusReason[]).map((k) => (
                <SelectItem key={k} value={k}>{REASON_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Valor mín.</Label><Input className="w-28" value={fMin} onChange={(e) => setFMin(e.target.value)} /></div>
        <div><Label className="text-xs">Valor máx.</Label><Input className="w-28" value={fMax} onChange={(e) => setFMax(e.target.value)} /></div>
      </div>

      {/* Painel do vendedor */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Meus materiais</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <Metric label="Materiais" value={String(myTotals.count)} />
          <Metric label="Total vendido" value={brl(myTotals.totalSold)} />
          <Metric label="Total recebido" value={brl(myTotals.totalReceived)} />
          <Metric label="Pago no mês da matrícula" value={brl(myTotals.paidSameMonth)} />
          <Metric label="Pago fora do mês" value={brl(myTotals.paidOtherMonth)} />
          <Metric label="Pendente" value={brl(myTotals.pending)} />
          <Metric label="Abaixo do mínimo" value={brl(myTotals.belowMinimum)} />
          <Metric label="Cancelado" value={brl(myTotals.cancelled)} />
          <Metric label="Estornado" value={brl(myTotals.refunded)} />
          <Metric label="Materiais válidos" value={String(myTotals.countValid)} />
          <Metric label="Válido para premiação" value={brl(myTotals.validTotal)} />
          <Metric
            label="Meta individual"
            value={myGoal == null ? "—" : brl(myGoal)}
            hint={myGoal ? `${((myTotals.validTotal / myGoal) * 100).toFixed(1)}% · faltam ${brl(Math.max(0, myGoal - myTotals.validTotal))}` : undefined}
          />
        </div>
      </section>

      {/* Painel administrativo */}
      {isAdmin && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Premiação de materiais da equipe</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            <Metric label="Total vendido" value={brl(teamTotals.totalSold)} />
            <Metric label="Total recebido" value={brl(teamTotals.totalReceived)} />
            <Metric label="Válido para premiação" value={brl(teamTotals.validTotal)} />
            <Metric label="Pendente" value={brl(teamTotals.pending)} />
            <Metric label="Pago fora do mês" value={brl(teamTotals.paidOtherMonth)} />
            <Metric label="Abaixo do mínimo" value={brl(teamTotals.belowMinimum)} />
            <Metric label="Cancelado" value={brl(teamTotals.cancelled)} />
            <Metric label="Estornado" value={brl(teamTotals.refunded)} />
            <Metric label="Materiais válidos" value={String(teamTotals.countValid)} />
            <Metric label="Meta da equipe" value={teamGoal == null ? "—" : brl(teamGoal)} />
            <Metric
              label="Meta atingida"
              value={teamGoal == null ? "—" : teamTotals.validTotal >= teamGoal ? "Sim" : "Não"}
              hint={teamGoal ? `${((teamTotals.validTotal / teamGoal) * 100).toFixed(2)}%` : undefined}
            />
            <Metric
              label={teamGoal != null && teamTotals.validTotal >= teamGoal ? "Excedente" : "Falta para a meta"}
              value={teamGoal == null ? "—" : brl(Math.abs(teamGoal - teamTotals.validTotal))}
            />
          </div>

          <h3 className="pt-2 text-sm font-semibold">Ranking por vendedor</h3>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Materiais</TableHead>
                  <TableHead className="text-right">Válidos</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Válido premiação</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">Abaixo mín.</TableHead>
                  <TableHead className="text-right">Fora do mês</TableHead>
                  <TableHead className="text-right">Meta</TableHead>
                  <TableHead className="text-right">% meta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="py-6 text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>
                )}
                {ranking.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{r.totals.count}</TableCell>
                    <TableCell className="text-right">{r.totals.countValid}</TableCell>
                    <TableCell className="text-right">{brl(r.totals.totalSold)}</TableCell>
                    <TableCell className="text-right">{brl(r.totals.totalReceived)}</TableCell>
                    <TableCell className="text-right font-semibold">{brl(r.totals.validTotal)}</TableCell>
                    <TableCell className="text-right">{brl(r.totals.pending)}</TableCell>
                    <TableCell className="text-right">{brl(r.totals.belowMinimum)}</TableCell>
                    <TableCell className="text-right">{brl(r.totals.paidOtherMonth)}</TableCell>
                    <TableCell className="text-right">{r.goal == null ? "—" : brl(r.goal)}</TableCell>
                    <TableCell className="text-right">{r.goal ? `${((r.totals.validTotal / r.goal) * 100).toFixed(1)}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Total da equipe considera somente registros válidos para premiação: <strong>{brl(teamTotals.validTotal)}</strong>
          </p>
        </section>
      )}

      {/* Lista */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Lista de materiais</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aluno</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Condição</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead>Premiação</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={12} className="py-6 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && visible.length === 0 && (
                <TableRow><TableCell colSpan={12} className="py-6 text-center text-muted-foreground">Nenhum material no período.</TableCell></TableRow>
              )}
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.lead_name ?? "—"}</TableCell>
                  <TableCell>{r.seller_name ?? "—"}</TableCell>
                  <TableCell>{r.enrollment_date ?? "—"}</TableCell>
                  <TableCell>{r.material_type ? MATERIAL_TYPE_LABELS[r.material_type] : "—"}</TableCell>
                  <TableCell className="text-right">{r.sale_value == null ? "—" : brl(r.sale_value)}</TableCell>
                  <TableCell>{r.payment_condition ? CONDITION_LABELS[r.payment_condition] : "—"}</TableCell>
                  <TableCell>{r.payment_method ? METHOD_LABELS[r.payment_method] : "—"}</TableCell>
                  <TableCell>{PAYMENT_STATUS_LABELS[r.payment_status]}</TableCell>
                  <TableCell>{r.payment_date ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.minimum_allowed_value_snapshot == null ? "—" : brl(r.minimum_allowed_value_snapshot)}</TableCell>
                  <TableCell>
                    <Badge variant={r.eligible_for_bonus ? "default" : "secondary"}>
                      {REASON_LABELS[r.bonus_eligibility_reason]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.payment_status !== "paid" && r.payment_status !== "cancelled" && r.payment_status !== "refunded" && (
                        <Button size="sm" variant="outline" onClick={() => setConfirming(r)}>Confirmar pagamento</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setHistory(r)}>Histórico</Button>
                      {isAdmin && r.payment_status !== "cancelled" && (
                        <Button size="sm" variant="ghost" onClick={() => setStatusTarget({ sale: r, status: "cancelled" })}>Cancelar</Button>
                      )}
                      {isAdmin && r.payment_status === "paid" && (
                        <Button size="sm" variant="ghost" onClick={() => setStatusTarget({ sale: r, status: "refunded" })}>Estornar</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {isAdmin && <GoalsAdmin goals={goals} sellers={sellers} />}

      <ConfirmPaymentDialog sale={confirming} rules={rules} onClose={() => setConfirming(null)} onSaved={refresh} />
      <StatusChangeDialog
        sale={statusTarget?.sale ?? null}
        status={statusTarget?.status ?? "cancelled"}
        onClose={() => setStatusTarget(null)}
        onSaved={refresh}
      />
      <EditMaterialDialog sale={editing} rules={rules} onClose={() => setEditing(null)} onSaved={refresh} />
      <HistoryDialog sale={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function EditMaterialDialog({
  sale, rules, onClose, onSaved,
}: {
  sale: MaterialSaleRow | null;
  rules?: ReturnType<typeof Object> | any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, setState] = useState<MaterialFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const current = state ?? (sale
    ? {
        ...emptyMaterialForm,
        hasMaterial: sale.payment_status !== "exempt",
        materialType: sale.material_type,
        saleValue: sale.sale_value != null ? String(sale.sale_value) : "",
        paymentStatus: sale.payment_status,
        paymentDate: sale.payment_date ?? "",
        paymentCondition: sale.payment_condition,
        paymentMethod: sale.payment_method,
        installmentCount: sale.installment_count != null ? String(sale.installment_count) : "",
        notes: sale.notes ?? "",
      }
    : null);
  if (!sale || !current) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await saveMaterialSale(
        {
          leadId: sale.lead_id,
          enrollmentDate: sale.enrollment_date,
          materialType: current.materialType,
          saleValue: parseValue(current.saleValue),
          paymentStatus: current.hasMaterial ? current.paymentStatus : "exempt",
          paymentDate: current.paymentDate || null,
          paymentCondition: current.paymentCondition,
          paymentMethod: current.paymentMethod,
          installmentCount: parseValue(current.installmentCount),
          notes: current.notes,
        },
        sale.seller_id,
      );
      toast.success("Material atualizado");
      onSaved();
      setState(null);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setState(null); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar material — {sale.lead_name ?? "lead"}</DialogTitle></DialogHeader>
        <MaterialFormFields state={current} onChange={setState} enrollmentDate={sale.enrollment_date} rules={rules} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setState(null); onClose(); }}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ sale, onClose }: { sale: MaterialSaleRow | null; onClose: () => void }) {
  const { data = [] } = useQuery({
    queryKey: ["material-history", sale?.id],
    enabled: !!sale,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_sales_history" as never)
        .select("id, event_type, created_at, change_reason")
        .eq("material_sale_id", sale!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; event_type: string; created_at: string; change_reason: string | null }[];
    },
  });
  if (!sale) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Histórico — {sale.lead_name ?? "lead"}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {data.length === 0 && <p className="text-sm text-muted-foreground">Sem eventos.</p>}
          {data.map((h) => (
            <div key={h.id} className="rounded border p-2 text-xs">
              <div className="font-medium">{h.event_type}</div>
              <div className="text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</div>
              {h.change_reason && <div>{h.change_reason}</div>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoalsAdmin({ goals, sellers }: { goals: Goal[]; sellers: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [type, setType] = useState<"individual" | "team">("team");
  const [sellerId, setSellerId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [bonus, setBonus] = useState("");

  const add = async () => {
    const min = Number(amount.replace(",", "."));
    if (!min || isNaN(min)) return toast.error("Informe o valor mínimo da faixa");
    if (type === "individual" && !sellerId) return toast.error("Selecione o vendedor");
    const { error } = await supabase.from("material_bonus_goals" as never).insert({
      goal_type: type,
      seller_id: type === "individual" ? sellerId : null,
      minimum_amount: min,
      bonus_amount: bonus ? Number(bonus.replace(",", ".")) : null,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Meta cadastrada");
    setAmount(""); setBonus("");
    qc.invalidateQueries({ queryKey: ["material-goals"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("material_bonus_goals" as never).update({ is_active: false } as never).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["material-goals"] });
  };

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Metas e faixas de premiação</h2>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="min-w-[140px]">
          <Label className="text-xs">Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as "individual" | "team")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="team">Equipe</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {type === "individual" && (
          <div className="min-w-[160px]">
            <Label className="text-xs">Vendedor</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div><Label className="text-xs">Valor mínimo da faixa</Label><Input className="w-36" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="20000,00" /></div>
        <div><Label className="text-xs">Prêmio (opcional)</Label><Input className="w-32" value={bonus} onChange={(e) => setBonus(e.target.value)} /></div>
        <Button onClick={add}>Adicionar faixa</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {goals.map((g) => (
          <Badge key={g.id} variant="outline" className="gap-2 py-1">
            {g.goal_type === "team" ? "Equipe" : sellers.find((s) => s.id === g.seller_id)?.name ?? "Vendedor"} · {brl(g.minimum_amount)}
            <button className="text-destructive" onClick={() => remove(g.id)}>×</button>
          </Badge>
        ))}
      </div>
    </section>
  );
}
