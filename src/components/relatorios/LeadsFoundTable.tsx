import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STATUSES, LOST_REASONS, labelFor, statusColor, waLink } from "@/lib/constants";
import { LeadDetailsDialog } from "@/components/LeadDetailsDialog";
import { exportRowsToXlsx } from "@/lib/xlsx-export";
import { Eye, MessageCircle, ExternalLink, Download, Search, Users } from "lucide-react";
import type { DateBasis, ReportLead } from "@/lib/report-leads";
import { interviewDoneDate, referenceDate } from "@/lib/report-leads";

const PAGE_SIZE = 25;

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const s = d.slice(0, 10);
  const [y, m, day] = s.split("-");
  return y && m && day ? `${day}/${m}/${y}` : s;
}

export function LeadsFoundTable({
  leads,
  doneEvent,
  basis,
  ownerName,
  stageFilter = null,
  passageDate,
}: {
  leads: ReportLead[];
  doneEvent: Map<string, string>;
  basis: DateBasis;
  ownerName: (id: string) => string;
  stageFilter?: string | null;
  passageDate?: (leadId: string) => string | null;
}) {
  const stageLabel = stageFilter ? labelFor(LEAD_STATUSES, stageFilter) : null;
  const passedAt = (l: ReportLead) => (stageFilter ? passageDate?.(l.id) ?? null : null);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("ref_desc");
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = s
      ? leads.filter((l) =>
          [l.name, l.phone, l.company, l.company_name].some((v) => v?.toLowerCase().includes(s)),
        )
      : leads;
    const key = (l: ReportLead) => (stageFilter ? passageDate?.(l.id) ?? "" : referenceDate(l, basis, doneEvent) ?? "");
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case "ref_asc": return key(a).localeCompare(key(b));
        case "created_desc": return b.created_at.localeCompare(a.created_at);
        case "updated_desc": return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
        case "name_asc": return a.name.localeCompare(b.name);
        default: return key(b).localeCompare(key(a));
      }
    });
    return sorted;
  }, [leads, q, sort, basis, doneEvent]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const headers = [
    "Nome", "Telefone", "Empresa", "Profissão/Cargo", "Origem", "Vendedor",
    "Etapa pesquisada", "Data da etapa", "Status atual", "Entrevista realizada",
    "Data de referência", "Última movimentação", "Motivo de perda", "Observações",
  ];

  const exportRows = () =>
    rows.map((l) => [
      l.name,
      l.phone ?? "",
      l.company || l.company_name || "",
      l.profession ?? "",
      l.source ?? "",
      ownerName(l.owner_id),
      stageLabel ?? "",
      stageLabel ? fmt(passedAt(l)) : "",
      labelFor(LEAD_STATUSES, l.status),
      fmt(interviewDoneDate(l, doneEvent)),
      fmt(referenceDate(l, basis, doneEvent)),
      fmt(l.updated_at),
      l.lost_reason ? labelFor(LOST_REASONS, l.lost_reason) : "",
      [l.observation, l.interview_notes].filter(Boolean).join(" | "),
    ]);

  const downloadCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...exportRows()].map((r) => r.map(esc).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-encontrados-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />Leads encontrados
          </h3>
          <p className="text-sm text-muted-foreground">{rows.length} leads encontrados{stageLabel ? ` — passaram por “${stageLabel}” no período` : ""}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 w-64"
              placeholder="Buscar por nome, telefone, empresa…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
            />
          </div>
          <div>
            <Label className="text-xs">Ordenar</Label>
            <Select value={sort} onValueChange={(v) => { setSort(v); setPage(0); }}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ref_desc">Data de referência (mais recente)</SelectItem>
                <SelectItem value="ref_asc">Data de referência (mais antiga)</SelectItem>
                <SelectItem value="created_desc">Criação (mais recente)</SelectItem>
                <SelectItem value="updated_desc">Última movimentação</SelectItem>
                <SelectItem value="name_asc">Nome (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={downloadCsv}><Download className="mr-1 h-4 w-4" />CSV</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportRowsToXlsx(exportRows(), headers, `leads-encontrados-${new Date().toISOString().slice(0, 10)}`, "Leads")}
          >
            <Download className="mr-1 h-4 w-4" />XLSX
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Lead</th>
              <th className="py-2 pr-3">Empresa / Cargo</th>
              <th className="py-2 pr-3">Origem</th>
              <th className="py-2 pr-3">Vendedor</th>
              {stageLabel && <th className="py-2 pr-3">Etapa pesquisada</th>}
              {stageLabel && <th className="py-2 pr-3">Data da etapa</th>}
              <th className="py-2 pr-3">Status atual</th>
              <th className="py-2 pr-3">Entrev. realizada</th>
              <th className="py-2 pr-3">Referência</th>
              <th className="py-2 pr-3">Últ. mov.</th>
              <th className="py-2 pr-3">Perda / Obs.</th>
              <th className="py-2 pr-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={stageLabel ? 12 : 10} className="py-6 text-center text-muted-foreground">Nenhum lead para os filtros selecionados.</td></tr>
            ) : pageRows.map((l) => (
              <tr key={l.id} className="border-t border-border/60 align-top">
                <td className="py-2 pr-3">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.phone || "—"}</div>
                </td>
                <td className="py-2 pr-3">
                  <div>{l.company || l.company_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{l.profession || "—"}</div>
                </td>
                <td className="py-2 pr-3">{l.source || "—"}</td>
                <td className="py-2 pr-3">{ownerName(l.owner_id)}</td>
                {stageLabel && (
                  <td className="py-2 pr-3">
                    <Badge variant="outline" className={statusColor(stageFilter!)}>{stageLabel}</Badge>
                  </td>
                )}
                {stageLabel && <td className="py-2 pr-3 whitespace-nowrap">{fmt(passedAt(l))}</td>}
                <td className="py-2 pr-3">
                  <Badge variant="outline" className={statusColor(l.status)}>{labelFor(LEAD_STATUSES, l.status)}</Badge>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{fmt(interviewDoneDate(l, doneEvent))}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{fmt(referenceDate(l, basis, doneEvent))}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{fmt(l.updated_at)}</td>
                <td className="py-2 pr-3 max-w-[220px]">
                  {l.lost_reason && <div className="text-xs">{labelFor(LOST_REASONS, l.lost_reason)}</div>}
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {[l.observation, l.interview_notes].filter(Boolean).join(" | ") || "—"}
                  </div>
                </td>
                <td className="py-2 pr-0">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Abrir detalhes" onClick={() => setDetailId(l.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Abrir WhatsApp"
                      disabled={!l.phone}
                      asChild={!!l.phone}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Ver no CRM"
                      onClick={() => navigate({ to: "/leads", search: { q: l.name } })}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {current + 1} de {pageCount}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      <LeadDetailsDialog leadId={detailId} onClose={() => setDetailId(null)} />
    </Card>
  );
}
