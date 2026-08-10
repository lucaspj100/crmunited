import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Wallet } from "lucide-react";
import { periodRange, PERIOD_LABELS, formatRangeLabel, todayIso, type Period } from "@/lib/productivity";
import {
  DASH,
  SELLER_COMMISSION_STATUS_LABEL,
  brl,
  dateBr,
  pct,
  summarizeSellerCommissions,
  type SellerCommissionRow,
} from "@/lib/seller-commission";
import { scMyCommissions } from "@/lib/seller-commission.functions";

export const Route = createFileRoute("/_authenticated/minha-comissao")({
  component: MinhaComissaoPage,
  head: () => ({
    meta: [
      { title: "Minha Comissão | CRM United" },
      {
        name: "description",
        content: "Acompanhe suas comissões por matrícula, o percentual vigente e o total previsto no período.",
      },
      { property: "og:title", content: "Minha Comissão | CRM United" },
      { property: "og:description", content: "Comissões geradas pelas suas matrículas, com percentual e valores detalhados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PERIODS: Period[] = ["hoje", "ontem", "semana", "semana_passada", "mes", "mes_passado", "custom"];

function MinhaComissaoPage() {
  const [period, setPeriod] = useState<Period>("mes");
  const [customStart, setCustomStart] = useState(todayIso());
  const [customEnd, setCustomEnd] = useState(todayIso());
  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const fetchMine = useServerFn(scMyCommissions);
  const { data, isLoading } = useQuery({
    queryKey: ["my-commission", range.start, range.end],
    queryFn: () =>
      fetchMine({ data: { start: range.start, end: range.end } }) as Promise<{
        rows: SellerCommissionRow[];
        rule: { commission_percentage: number; valid_from: string } | null;
      }>,
  });

  const rows = data?.rows ?? [];
  const totals = useMemo(() => summarizeSellerCommissions(rows), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Minha Comissão
          </h1>
          <p className="text-sm text-muted-foreground">
            Comissão sobre o valor da matrícula · {formatRangeLabel(range)}
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
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Comissão no período</div>
          <div className="mt-1 text-2xl font-bold">{brl(totals.comissao)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Matrículas</div>
          <div className="mt-1 text-2xl font-bold">{totals.matriculas}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Valor total das matrículas</div>
          <div className="mt-1 text-2xl font-bold">{brl(totals.totalMatriculas)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Meu percentual atual</div>
          <div className="mt-1 text-2xl font-bold">{pct(data?.rule?.commission_percentage ?? null)}</div>
          {data?.rule && (
            <div className="text-xs text-muted-foreground">vigente desde {dateBr(data.rule.valid_from)}</div>
          )}
        </Card>
      </div>

      {!isLoading && !data?.rule && (
        <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div className="text-sm">
            Seu percentual de comissão ainda não foi configurado. Fale com a administração para liberar o cálculo.
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data da matrícula</TableHead>
              <TableHead>Aluno</TableHead>
              <TableHead className="text-right">Valor da matrícula</TableHead>
              <TableHead className="text-right">Percentual</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhuma matrícula com comissão neste período.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{dateBr(r.enrollment_date)}</TableCell>
                  <TableCell>{r.student_name_snapshot ?? DASH}</TableCell>
                  <TableCell className="text-right">{brl(r.enrollment_value_snapshot)}</TableCell>
                  <TableCell className="text-right">{pct(r.commission_percentage_snapshot)}</TableCell>
                  <TableCell className="text-right font-semibold">{brl(r.commission_amount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{SELLER_COMMISSION_STATUS_LABEL[r.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
