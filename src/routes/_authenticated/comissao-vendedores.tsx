import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, ShieldAlert, Wallet } from "lucide-react";
import { periodRange, PERIOD_LABELS, formatRangeLabel, todayIso, type Period } from "@/lib/productivity";
import {
  DASH,
  SELLER_COMMISSION_STATUS_LABEL,
  aggregateBySeller,
  brl,
  dateBr,
  pct,
  summarizeSellerCommissions,
  type SellerCommissionRow,
} from "@/lib/seller-commission";
import {
  scGeneratePending,
  scListCommissions,
  scListConfig,
  scRecalculateOne,
  scSaveRule,
} from "@/lib/seller-commission.functions";

export const Route = createFileRoute("/_authenticated/comissao-vendedores")({
  component: ComissaoVendedoresPage,
  head: () => ({
    meta: [
      { title: "Comissão dos Vendedores | CRM United" },
      {
        name: "description",
        content: "Configure o percentual de comissão de cada vendedor e acompanhe as comissões geradas por matrícula.",
      },
      { property: "og:title", content: "Comissão dos Vendedores | CRM United" },
      { property: "og:description", content: "Percentual individual, histórico de vigências e resumo de comissões por vendedor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PERIODS: Period[] = ["hoje", "ontem", "semana", "semana_passada", "mes", "mes_passado", "custom"];

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function ComissaoVendedoresPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();

  const [period, setPeriod] = useState<Period>("mes");
  const [customStart, setCustomStart] = useState(todayIso());
  const [customEnd, setCustomEnd] = useState(todayIso());
  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const listConfig = useServerFn(scListConfig);
  const listCommissions = useServerFn(scListCommissions);
  const saveRule = useServerFn(scSaveRule);
  const generatePending = useServerFn(scGeneratePending);
  const recalcOne = useServerFn(scRecalculateOne);

  const { data: config } = useQuery({
    queryKey: ["sc-config"],
    queryFn: () => listConfig(),
    enabled: isAdmin,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sc-commissions", range.start, range.end],
    queryFn: () => listCommissions({ data: { start: range.start, end: range.end } }) as Promise<SellerCommissionRow[]>,
    enabled: isAdmin,
  });

  const totals = useMemo(() => summarizeSellerCommissions(rows), [rows]);
  const bySeller = useMemo(() => aggregateBySeller(rows), [rows]);
  const pctBySeller = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of config?.sellers ?? []) if (s.rule) m.set(s.id, Number(s.rule.commission_percentage));
    return m;
  }, [config]);

  const [editing, setEditing] = useState<{ id: string; nome: string; percentage: string; validFrom: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isAdmin) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">Somente administradores podem configurar a comissão dos vendedores.</p>
      </Card>
    );
  }

  async function submitRule() {
    if (!editing) return;
    const value = Number(editing.percentage.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      toast.error("Informe um percentual entre 0 e 100.");
      return;
    }
    setSaving(true);
    try {
      await saveRule({
        data: {
          seller_id: editing.id,
          commission_percentage: value,
          valid_from: editing.validFrom,
        },
      });
      toast.success("Percentual salvo. As comissões anteriores permanecem inalteradas.");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["sc-config"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar percentual");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Comissão dos Vendedores
          </h1>
          <p className="text-sm text-muted-foreground">
            Percentual individual sobre o valor da matrícula · {formatRangeLabel(range)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-[150px]" />
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-[150px]" />
            </>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const r = (await generatePending({ data: { start: range.start, end: range.end } })) as { processed: number };
                toast.success(`${r.processed} matrícula(s) verificada(s) no período.`);
                await qc.invalidateQueries({ queryKey: ["sc-commissions"] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro ao gerar comissões");
              }
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Gerar pendentes
          </Button>
        </div>
      </div>

      {totals.naoConfiguradas > 0 && (
        <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div className="text-sm">
            {totals.naoConfiguradas} matrícula(s) sem percentual configurado no período. Configure o percentual do vendedor e
            clique em <strong>Gerar pendentes</strong>.
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Comissão gerada" value={brl(totals.comissao)} />
        <Metric label="Matrículas" value={String(totals.matriculas)} />
        <Metric label="Total em matrículas" value={brl(totals.totalMatriculas)} />
        <Metric label="Sem percentual" value={String(totals.naoConfiguradas)} />
      </div>

      <Tabs defaultValue="resumo">
        <TabsList>
          <TabsTrigger value="resumo">Resumo por vendedor</TabsTrigger>
          <TabsTrigger value="percentuais">Percentuais</TabsTrigger>
          <TabsTrigger value="historico">Comissões do período</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="mt-3">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Percentual atual</TableHead>
                  <TableHead className="text-right">Matrículas</TableHead>
                  <TableHead className="text-right">Valor total das matrículas</TableHead>
                  <TableHead className="text-right">Comissão gerada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySeller.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nenhuma comissão no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  bySeller.map((s) => (
                    <TableRow key={s.seller_id}>
                      <TableCell className="font-medium">{s.nome}</TableCell>
                      <TableCell>{pct(pctBySeller.get(s.seller_id) ?? null)}</TableCell>
                      <TableCell className="text-right">{s.matriculas}</TableCell>
                      <TableCell className="text-right">{brl(s.totalMatriculas)}</TableCell>
                      <TableCell className="text-right font-semibold">{brl(s.comissao)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="percentuais" className="mt-3">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Percentual atual</TableHead>
                  <TableHead>Vigente desde</TableHead>
                  <TableHead>Histórico</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(config?.sellers ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.full_name || s.email}</TableCell>
                    <TableCell>
                      {s.rule ? (
                        <Badge variant="outline">{pct(Number(s.rule.commission_percentage))}</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          não configurado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{dateBr(s.rule?.valid_from)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.history.length <= 1
                        ? DASH
                        : s.history
                            .slice(1)
                            .map((h: any) => `${pct(Number(h.commission_percentage))} (${dateBr(h.valid_from)})`)
                            .join(" · ")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing({
                            id: s.id,
                            nome: s.full_name || s.email,
                            percentage: s.rule ? String(s.rule.commission_percentage) : "",
                            validFrom: todayIso(),
                          })
                        }
                      >
                        {s.rule ? "Alterar" : "Configurar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-3">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Valor da matrícula</TableHead>
                  <TableHead className="text-right">Percentual</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Nenhuma comissão no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{dateBr(r.enrollment_date)}</TableCell>
                      <TableCell>{r.student_name_snapshot ?? DASH}</TableCell>
                      <TableCell>{r.seller_name_snapshot ?? DASH}</TableCell>
                      <TableCell className="text-right">{brl(r.enrollment_value_snapshot)}</TableCell>
                      <TableCell className="text-right">{pct(r.commission_percentage_snapshot)}</TableCell>
                      <TableCell className="text-right font-semibold">{brl(r.commission_amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{SELLER_COMMISSION_STATUS_LABEL[r.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await recalcOne({ data: { leadId: r.lead_id } });
                              toast.success("Comissão recalculada com o mesmo percentual.");
                              await qc.invalidateQueries({ queryKey: ["sc-commissions"] });
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Erro ao recalcular");
                            }
                          }}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Percentual de {editing?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Percentual (%)</Label>
              <Input
                inputMode="decimal"
                value={editing?.percentage ?? ""}
                onChange={(e) => setEditing((p) => (p ? { ...p, percentage: e.target.value } : p))}
                placeholder="20"
              />
            </div>
            <div>
              <Label>Vigente a partir de</Label>
              <Input
                type="date"
                value={editing?.validFrom ?? todayIso()}
                onChange={(e) => setEditing((p) => (p ? { ...p, validFrom: e.target.value } : p))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Matrículas já registradas mantêm o percentual aplicado na época. Somente novas matrículas usam o novo valor.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={submitRule} disabled={saving}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
