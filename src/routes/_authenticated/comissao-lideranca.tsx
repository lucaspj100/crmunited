import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { AlertTriangle, Download, RefreshCw, ShieldAlert } from "lucide-react";
import { periodRange, PERIOD_LABELS, formatRangeLabel, todayIso, type Period } from "@/lib/productivity";
import { exportRowsToXlsx } from "@/lib/xlsx-export";
import {
  COMMISSION_STATUS_LABEL,
  DASH,
  EXPORT_HEADERS,
  ROLE_LABEL,
  brl,
  dateBr,
  pct,
  summarize,
  summarizeBySeller,
  toCsv,
  toExportRow,
  type CommissionRow,
  type CommissionStatus,
} from "@/lib/leadership-commission";
import {
  lcBackfill,
  lcEditCommission,
  lcListCommissions,
  lcListConfig,
  lcRecalculate,
  lcSaveRule,
  lcSetStatus,
  lcToggleRule,
} from "@/lib/leadership-commission.functions";

export const Route = createFileRoute("/_authenticated/comissao-lideranca")({
  component: ComissaoLiderancaPage,
  head: () => ({
    meta: [
      { title: "Comissão da Liderança | CRM United" },
      { name: "description", content: "Configuração e acompanhamento da comissão da liderança sobre as matrículas realizadas pela equipe." },
      { property: "og:title", content: "Comissão da Liderança | CRM United" },
      { property: "og:description", content: "Regras por colaborador e cargo, histórico, status e relatórios de comissão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PERIODS: Period[] = ["hoje", "ontem", "semana", "semana_passada", "mes", "mes_passado", "custom"];

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatusBadge({ s }: { s: CommissionStatus }) {
  const variant =
    s === "paga" || s === "confirmada" ? "default" : s === "estornada" || s === "cancelada" ? "destructive" : "secondary";
  return <Badge variant={variant as any}>{COMMISSION_STATUS_LABEL[s]}</Badge>;
}

function ComissaoLiderancaPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta área é exclusiva de administradores.
        </p>
      </div>
    );
  }

  return <Content />;
}

function Content() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("month");
  const [customStart, setCustomStart] = useState(todayIso());
  const [customEnd, setCustomEnd] = useState(todayIso());
  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const [fEmployee, setFEmployee] = useState("all");
  const [fRole, setFRole] = useState("all");
  const [fCommissionStatus, setFCommissionStatus] = useState("all");
  const [fEnrollmentStatus, setFEnrollmentStatus] = useState("all");
  const [fType, setFType] = useState("all");
  const [fConfigured, setFConfigured] = useState("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const listConfig = useServerFn(lcListConfig);
  const listCommissions = useServerFn(lcListCommissions);

  const configQ = useQuery({ queryKey: ["lc-config"], queryFn: () => listConfig({} as any) });
  const rowsQ = useQuery({
    queryKey: ["lc-rows", range.start, range.end],
    queryFn: () => listCommissions({ data: { start: range.start, end: range.end } }) as Promise<CommissionRow[]>,
  });

  const all = (rowsQ.data ?? []) as CommissionRow[];
  const rows = useMemo(
    () =>
      all.filter((r) => {
        if (fEmployee !== "all" && r.employee_id !== fEmployee) return false;
        if (fRole !== "all" && r.employee_role_snapshot !== fRole) return false;
        if (fCommissionStatus !== "all" && r.commission_status !== fCommissionStatus) return false;
        if (fEnrollmentStatus !== "all" && r.enrollment_status !== fEnrollmentStatus) return false;
        if (fType !== "all" && r.commission_type_snapshot !== fType) return false;
        if (fConfigured === "yes" && r.commission_status === "nao_configurada") return false;
        if (fConfigured === "no" && r.commission_status !== "nao_configurada") return false;
        return true;
      }),
    [all, fEmployee, fRole, fCommissionStatus, fEnrollmentStatus, fType, fConfigured],
  );

  const summary = useMemo(() => summarize(rows), [rows]);
  const bySeller = useMemo(() => summarizeBySeller(rows), [rows]);
  const paged = rows.slice(page * pageSize, page * pageSize + pageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lc-rows"] });
    qc.invalidateQueries({ queryKey: ["lc-config"] });
  };

  const backfill = useServerFn(lcBackfill);
  const [backfilling, setBackfilling] = useState(false);
  const runBackfill = async () => {
    setBackfilling(true);
    try {
      const res: any = await backfill({ data: { start: range.start, end: range.end } });
      toast.success(`Matrículas verificadas: ${res.processed}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar comissões");
    } finally {
      setBackfilling(false);
    }
  };

  const exportXlsx = () => {
    exportRowsToXlsx(rows.map(toExportRow), EXPORT_HEADERS, `comissao-lideranca-${range.start}_${range.end}.xlsx`, "Comissões");
  };
  const exportCsv = () => {
    const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `comissao-lideranca-${range.start}_${range.end}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const employees = (configQ.data as any)?.employees ?? [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Comissão da Liderança</h1>
          <p className="text-sm text-muted-foreground">
            Comissão calculada exclusivamente sobre o valor da matrícula — material didático não entra no cálculo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={runBackfill} disabled={backfilling}>
            <RefreshCw className="mr-1 h-4 w-4" /> Gerar comissões do período
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx}>
            <Download className="mr-1 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </div>
      </header>

      {/* Filtros de período */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-1">
          {PERIODS.map((p) => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8" />
            </div>
          </div>
        )}
        <div className="ml-auto text-xs text-muted-foreground">{formatRangeLabel(range)}</div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        <Metric label="Prevista" value={brl(summary.prevista)} />
        <Metric label="Confirmada" value={brl(summary.confirmada)} />
        <Metric label="Paga" value={brl(summary.paga)} />
        <Metric label="Estornada" value={brl(summary.estornada)} />
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Metric label="Total líquido" value={brl(summary.liquido)} hint="confirmadas + pagas − estornadas" />
            </div>
          </TooltipTrigger>
          <TooltipContent>Confirmadas + pagas − estornadas. Uma comissão paga não é contada novamente como confirmada.</TooltipContent>
        </Tooltip>
        <Metric label="Matrículas com comissão" value={String(summary.comComissao)} />
        <Metric label="Sem configuração" value={String(summary.semConfiguracao)} />
      </div>

      {summary.semConfiguracao > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {summary.semConfiguracao} matrícula(s) sem regra de comissão configurada. Configure a regra e use “Recalcular” no histórico.
        </div>
      )}

      <Tabs defaultValue="historico">
        <TabsList>
          <TabsTrigger value="historico">Histórico de comissões</TabsTrigger>
          <TabsTrigger value="colaboradores">Resumo por colaborador</TabsTrigger>
          <TabsTrigger value="config">Configuração de comissões</TabsTrigger>
        </TabsList>

        <TabsContent value="historico" className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <FilterSelect label="Colaborador" value={fEmployee} onChange={setFEmployee} options={[{ v: "all", l: "Todos" }, ...employees.map((e: any) => ({ v: e.id, l: e.full_name }))]} />
            <FilterSelect label="Cargo" value={fRole} onChange={setFRole} options={[{ v: "all", l: "Todos" }, ...Object.entries(ROLE_LABEL).map(([v, l]) => ({ v, l }))]} />
            <FilterSelect label="Status da comissão" value={fCommissionStatus} onChange={setFCommissionStatus} options={[{ v: "all", l: "Todos" }, ...Object.entries(COMMISSION_STATUS_LABEL).map(([v, l]) => ({ v, l }))]} />
            <FilterSelect label="Status da matrícula" value={fEnrollmentStatus} onChange={setFEnrollmentStatus} options={[{ v: "all", l: "Todos" }, { v: "matricula", l: "Matrícula" }, { v: "perdido", l: "Perdido" }]} />
            <FilterSelect label="Tipo" value={fType} onChange={setFType} options={[{ v: "all", l: "Todos" }, { v: "percentage", l: "Percentual" }, { v: "fixed", l: "Valor fixo" }]} />
            <FilterSelect label="Configuração" value={fConfigured} onChange={setFConfigured} options={[{ v: "all", l: "Todas" }, { v: "yes", l: "Comissão configurada" }, { v: "no", l: "Não configurada" }]} />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-right">Matrícula</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Fixo</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Obs.</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsQ.isLoading && (
                  <TableRow><TableCell colSpan={14} className="text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
                )}
                {!rowsQ.isLoading && paged.length === 0 && (
                  <TableRow><TableCell colSpan={14} className="text-center text-sm text-muted-foreground">Nenhuma comissão no período.</TableCell></TableRow>
                )}
                {paged.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{dateBr(r.enrollment_date)}</TableCell>
                    <TableCell>{r.student_name ?? DASH}</TableCell>
                    <TableCell>{r.employee_name_snapshot ?? DASH}</TableCell>
                    <TableCell>{r.employee_role_snapshot ? ROLE_LABEL[r.employee_role_snapshot] ?? r.employee_role_snapshot : DASH}</TableCell>
                    <TableCell className="text-right">{brl(r.enrollment_amount)}</TableCell>
                    <TableCell>{r.commission_type_snapshot === "percentage" ? "Percentual" : r.commission_type_snapshot === "fixed" ? "Valor fixo" : DASH}</TableCell>
                    <TableCell className="text-right">{r.commission_type_snapshot === "percentage" ? pct(r.commission_percentage_snapshot) : DASH}</TableCell>
                    <TableCell className="text-right">{r.commission_type_snapshot === "fixed" ? brl(r.fixed_amount_snapshot) : DASH}</TableCell>
                    <TableCell className="text-right font-semibold">{brl(r.commission_amount)}</TableCell>
                    <TableCell>{r.enrollment_status}</TableCell>
                    <TableCell>
                      <StatusBadge s={r.commission_status} />
                      {r.needs_compensation && (
                        <div className="text-[11px] text-destructive">valor a compensar</div>
                      )}
                    </TableCell>
                    <TableCell>{dateBr(r.payment_date)}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{r.notes ?? DASH}</TableCell>
                    <TableCell className="text-right">
                      <RowActions row={r} onDone={refresh} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{rows.length} registro(s)</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span>{page + 1}/{totalPages}</span>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="colaboradores">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-right">Matrículas</TableHead>
                  <TableHead className="text-right">Total matrículas</TableHead>
                  <TableHead className="text-right">Prevista</TableHead>
                  <TableHead className="text-right">Confirmada</TableHead>
                  <TableHead className="text-right">Paga</TableHead>
                  <TableHead className="text-right">Estornada</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySeller.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Sem dados no período.</TableCell></TableRow>
                )}
                {bySeller.map((s) => (
                  <TableRow key={s.employee_id}>
                    <TableCell>{s.nome}</TableCell>
                    <TableCell>{s.cargo}</TableCell>
                    <TableCell className="text-right">{s.matriculas}</TableCell>
                    <TableCell className="text-right">{brl(s.totalMatriculas)}</TableCell>
                    <TableCell className="text-right">{brl(s.prevista)}</TableCell>
                    <TableCell className="text-right">{brl(s.confirmada)}</TableCell>
                    <TableCell className="text-right">{brl(s.paga)}</TableCell>
                    <TableCell className="text-right">{brl(s.estornada)}</TableCell>
                    <TableCell className="text-right font-semibold">{brl(s.liquido)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="config">
          <ConfigTab data={configQ.data as any} onDone={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ================= AÇÕES POR LINHA =================
function RowActions({ row, onDone }: { row: CommissionRow; onDone: () => void }) {
  const setStatus = useServerFn(lcSetStatus);
  const edit = useServerFn(lcEditCommission);
  const recalc = useServerFn(lcRecalculate);

  const [payOpen, setPayOpen] = useState(false);
  const [payDate, setPayDate] = useState(todayIso());
  const [editOpen, setEditOpen] = useState(false);
  const [amount, setAmount] = useState(String(row.commission_amount ?? ""));
  const [notes, setNotes] = useState(row.notes ?? "");
  const [reason, setReason] = useState("");
  const [recalcOpen, setRecalcOpen] = useState(false);
  const [recalcReason, setRecalcReason] = useState("");

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na operação");
    }
  };

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {row.commission_status === "prevista" && (
        <Button size="sm" variant="outline" onClick={() => run(() => setStatus({ data: { id: row.id, status: "confirmada" } }), "Comissão confirmada")}>Confirmar</Button>
      )}
      {(row.commission_status === "confirmada" || row.commission_status === "prevista") && (
        <Button size="sm" onClick={() => setPayOpen(true)}>Marcar paga</Button>
      )}
      {(row.commission_status === "confirmada" || row.commission_status === "paga") && (
        <Button size="sm" variant="destructive" onClick={() => run(() => setStatus({ data: { id: row.id, status: "estornada", reason: "Estorno manual" } }), "Comissão estornada")}>Estornar</Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>Editar</Button>
      <Button size="sm" variant="ghost" onClick={() => setRecalcOpen(true)}>Recalcular</Button>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marcar comissão como paga</DialogTitle></DialogHeader>
          <Label className="text-xs">Data do pagamento</Label>
          <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button onClick={() => { setPayOpen(false); run(() => setStatus({ data: { id: row.id, status: "paga", payment_date: payDate } }), "Pagamento registrado"); }}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar comissão</DialogTitle>
            <DialogDescription>Toda alteração fica registrada na auditoria.</DialogDescription>
          </DialogHeader>
          <Label className="text-xs">Valor da comissão (R$)</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <Label className="text-xs">Observação</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Label className="text-xs">Motivo da alteração (obrigatório)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              disabled={reason.trim().length < 3}
              onClick={() => {
                const v = Number(amount.replace(/\./g, "").replace(",", "."));
                setEditOpen(false);
                run(() => edit({ data: { id: row.id, commission_amount: Number.isFinite(v) ? v : null, notes, reason } }), "Comissão atualizada");
              }}
            >Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recalcOpen} onOpenChange={setRecalcOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recalcular comissão</DialogTitle>
            <DialogDescription>
              A regra vigente hoje será aplicada a esta matrícula. Comissões pagas ou estornadas não são recalculadas.
            </DialogDescription>
          </DialogHeader>
          <Label className="text-xs">Motivo (obrigatório)</Label>
          <Textarea value={recalcReason} onChange={(e) => setRecalcReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecalcOpen(false)}>Cancelar</Button>
            <Button
              disabled={recalcReason.trim().length < 3}
              onClick={() => { setRecalcOpen(false); run(() => recalc({ data: { id: row.id, reason: recalcReason } }), "Comissão recalculada"); }}
            >Recalcular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ================= CONFIGURAÇÃO =================
function ConfigTab({ data, onDone }: { data: any; onDone: () => void }) {
  const [ruleDialog, setRuleDialog] = useState<{ scope: "individual" | "role"; employee?: any; role?: string; rule?: any } | null>(null);
  const toggle = useServerFn(lcToggleRule);

  if (!data) return <div className="p-4 text-sm text-muted-foreground">Carregando…</div>;

  const roleRuleFor = (role: string) => (data.roleRules ?? []).find((r: any) => r.role_name === role);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Regras padrão por cargo</h2>
        <div className="grid gap-2 md:grid-cols-3">
          {Object.entries(ROLE_LABEL).map(([role, label]) => {
            const r = roleRuleFor(role);
            return (
              <div key={role} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{label}</div>
                  <Button size="sm" variant="outline" onClick={() => setRuleDialog({ scope: "role", role, rule: r })}>Editar</Button>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {r
                    ? r.commission_type === "percentage"
                      ? `${pct(Number(r.commission_percentage))} sobre o valor da matrícula`
                      : `${brl(Number(r.fixed_amount))} por matrícula`
                    : "Sem regra configurada"}
                </div>
                {r && <div className="text-[11px] text-muted-foreground">Vigente desde {dateBr(r.valid_from)}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Configuração por colaborador</h2>
        <p className="text-xs text-muted-foreground">A regra individual tem prioridade sobre a regra do cargo.</p>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Status do usuário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Percentual / valor</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Regra ativa</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.employees ?? []).map((e: any) => {
                const eff = e.effective_rule;
                return (
                  <TableRow key={e.id}>
                    <TableCell>{e.full_name}</TableCell>
                    <TableCell>{e.role ? ROLE_LABEL[e.role] ?? e.role : DASH}</TableCell>
                    <TableCell>{e.status}</TableCell>
                    <TableCell>
                      {eff ? (eff.commission_type === "percentage" ? "Percentual" : "Valor fixo") : DASH}
                      {e.effective_source === "role" && <span className="ml-1 text-[11px] text-muted-foreground">(cargo)</span>}
                    </TableCell>
                    <TableCell>
                      {eff
                        ? eff.commission_type === "percentage"
                          ? pct(Number(eff.commission_percentage))
                          : brl(Number(eff.fixed_amount))
                        : <span className="text-destructive">Comissão não configurada</span>}
                    </TableCell>
                    <TableCell>{eff ? dateBr(eff.valid_from) : DASH}</TableCell>
                    <TableCell>
                      {e.rule ? (
                        <Switch
                          checked={e.rule.is_active}
                          onCheckedChange={async (v) => {
                            await toggle({ data: { id: e.rule.id, is_active: v } });
                            onDone();
                          }}
                        />
                      ) : DASH}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setRuleDialog({ scope: "individual", employee: e, rule: e.rule })}>Editar</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {ruleDialog && (
        <RuleDialog
          config={ruleDialog}
          onClose={() => setRuleDialog(null)}
          onSaved={() => { setRuleDialog(null); onDone(); }}
        />
      )}
    </div>
  );
}

function RuleDialog({ config, onClose, onSaved }: { config: any; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(lcSaveRule);
  const existing = config.rule;
  const [type, setType] = useState<"percentage" | "fixed">(existing?.commission_type ?? "percentage");
  const [value, setValue] = useState(
    existing ? String(existing.commission_type === "percentage" ? existing.commission_percentage : existing.fixed_amount) : "",
  );
  const [validFrom, setValidFrom] = useState(existing?.valid_from ?? todayIso());
  const [saving, setSaving] = useState(false);

  const title = config.scope === "individual" ? `Comissão sobre matrículas de ${config.employee?.full_name}` : `Regra padrão — ${ROLE_LABEL[config.role] ?? config.role}`;

  const submit = async () => {
    const n = Number(value.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) { toast.error("Informe um valor válido"); return; }
    setSaving(true);
    try {
      await save({
        data: {
          rule_scope: config.scope,
          employee_id: config.scope === "individual" ? config.employee.id : null,
          role_name: config.scope === "role" ? config.role : null,
          commission_type: type,
          commission_percentage: type === "percentage" ? n : null,
          fixed_amount: type === "fixed" ? n : null,
          valid_from: validFrom,
          is_active: true,
        },
      });
      toast.success("Regra salva");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar regra");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Escolha apenas um tipo: percentual OU valor fixo. A base é sempre o valor da matrícula.</DialogDescription>
        </DialogHeader>

        <Label className="text-xs">Tipo de comissão</Label>
        <Select value={type} onValueChange={(v) => setType(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage">Percentual sobre o valor da matrícula</SelectItem>
            <SelectItem value="fixed">Valor fixo por matrícula</SelectItem>
          </SelectContent>
        </Select>

        <Label className="text-xs">{type === "percentage" ? "Percentual (%)" : "Valor fixo (R$)"}</Label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder={type === "percentage" ? "5" : "50,00"} />

        <Label className="text-xs">Data de início da regra</Label>
        <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />

        <p className="text-[11px] text-muted-foreground">
          Comissões já geradas não são recalculadas automaticamente. Use “Recalcular” no histórico quando necessário.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>Salvar regra</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
