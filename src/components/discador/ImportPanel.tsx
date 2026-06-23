import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import {
  parseProspectFile,
  mapRows,
  importProspects,
  type ParsedRow,
  type ParsedFile,
  type ImportReport,
  type DistributionMode,
  type ColumnMapping,
  type FieldKey,
} from "@/lib/prospect-import";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";

type Seller = { id: string; full_name: string | null; email: string };

const NONE = "__none__";
const FIELDS: { key: FieldKey; label: string; required: boolean }[] = [
  { key: "telefone", label: "Telefone", required: true },
  { key: "nome", label: "Nome", required: false },
  { key: "empresa", label: "Empresa", required: false },
  { key: "cargo", label: "Cargo / Profissão", required: false },
  { key: "origem", label: "Origem", required: false },
  { key: "observacao", label: "Observação", required: false },
];

export function ImportPanel({ sellers, isAdmin = false }: { sellers: Seller[]; isAdmin?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mode, setMode] = useState<"none" | "single" | "round_robin">(isAdmin ? "none" : "single");
  const [singleId, setSingleId] = useState<string>(isAdmin ? "" : (user?.id ?? ""));
  const [selectedSellers, setSelectedSellers] = useState<Set<string>>(new Set());
  const [updateExisting, setUpdateExisting] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const parsed: ParsedRow[] | null = useMemo(() => {
    if (!file) return null;
    return mapRows(file.rows, mapping);
  }, [file, mapping]);

  const onFile = async (f: File) => {
    setReport(null);
    setFile(null);
    setMapping({});
    try {
      const result = await parseProspectFile(f);
      setFile(result);
      setMapping(result.detected);
      const detectedCount = Object.values(result.detected).filter(Boolean).length;
      if (result.detected.telefone) {
        toast.success(`${result.rows.length} linhas lidas — ${detectedCount} campo(s) detectado(s) automaticamente`);
      } else {
        toast.warning(`${result.rows.length} linhas lidas — selecione a coluna de telefone manualmente`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao ler planilha");
    }
  };

  const importar = async () => {
    if (!parsed || !user) return;
    const distribution: DistributionMode =
      mode === "single" && singleId ? { kind: "single", userId: singleId } :
      mode === "round_robin" ? { kind: "round_robin", userIds: Array.from(selectedSellers) } :
      { kind: "none" };
    if (mode === "single" && !singleId) { toast.error("Escolha um vendedor"); return; }
    if (mode === "round_robin" && selectedSellers.size === 0) { toast.error("Selecione vendedores"); return; }
    setImporting(true);
    const r = await importProspects(parsed, distribution, user.id, { updateExisting, overwrite });
    setImporting(false);
    setReport(r);
    qc.invalidateQueries({ queryKey: ["prospect_contacts_admin"] });
    qc.invalidateQueries({ queryKey: ["prospect_dashboard"] });
    if (r.imported > 0 || r.updated > 0) toast.success(`Importados ${r.imported} · Atualizados ${r.updated}`);
    else toast.error("Nenhum contato foi importado nem atualizado. Confira a prévia.");
  };

  const toggleSeller = (id: string) => {
    const next = new Set(selectedSellers);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSellers(next);
  };

  const setField = (key: FieldKey, value: string) => {
    setMapping((m) => ({ ...m, [key]: value === NONE ? null : value }));
  };

  const valid = parsed?.filter((p) => p.valid).length ?? 0;
  const invalid = parsed?.filter((p) => !p.valid).length ?? 0;
  const noneValid = parsed != null && parsed.length > 0 && valid === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Importar planilha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie um arquivo CSV ou Excel. O sistema detecta automaticamente as colunas
            <strong> Telefone, Nome, Empresa, Cargo, Origem e Observação</strong> a partir de variações comuns
            (ex.: "Full Name", "Company", "Job Title"). Confirme o mapeamento abaixo antes de importar.
          </p>
          <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />

          {file && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                <div>Total de linhas lidas: <strong>{file.rows.length}</strong></div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Colunas encontradas na planilha</div>
                  <div className="flex flex-wrap gap-1">
                    {file.headers.length > 0
                      ? file.headers.map((h) => <Badge key={h} variant="outline">{h}</Badge>)
                      : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                {parsed && (
                  <div>Válidas: <strong className="text-green-600">{valid}</strong> · Inválidas: <strong className="text-red-600">{invalid}</strong></div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-base">Mapear colunas da planilha</Label>
                <p className="text-xs text-muted-foreground">
                  Para cada campo do sistema, escolha qual coluna da planilha corresponde. Telefone é obrigatório, os demais são opcionais.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <div key={f.key}>
                      <Label className="text-xs">
                        {f.label}{f.required && <span className="text-red-600"> *</span>}
                      </Label>
                      <Select value={mapping[f.key] ?? NONE} onValueChange={(v) => setField(f.key, v)}>
                        <SelectTrigger><SelectValue placeholder="— não mapear —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— não mapear —</SelectItem>
                          {file.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {!mapping.telefone && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Selecione qual coluna contém o telefone (obrigatório).
                  </p>
                )}
              </div>

              {noneValid && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Nenhum contato foi importado porque a coluna de telefone não foi identificada ou os telefones não passaram na validação. Confira a prévia abaixo.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && parsed.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Prévia ({Math.min(parsed.length, 10)} de {parsed.length} linhas)</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-xs">
                  <tr>
                    <th className="p-2 text-left">Linha</th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Telefone</th>
                    <th className="p-2 text-left">Normalizado</th>
                    <th className="p-2 text-left">Empresa</th>
                    <th className="p-2 text-left">Cargo</th>
                    <th className="p-2 text-left">Origem</th>
                    <th className="p-2 text-left">Observação</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 10).map((p) => (
                    <tr key={p.index} className="border-t align-top">
                      <td className="p-2 text-muted-foreground">{p.index}</td>
                      <td className="p-2">{p.nome ?? "—"}</td>
                      <td className="p-2 font-mono text-xs">{p.telefone_original || "—"}</td>
                      <td className="p-2 font-mono text-xs">{p.telefone_normalizado ? `+${p.telefone_normalizado}` : "—"}</td>
                      <td className="p-2">{p.empresa ?? "—"}</td>
                      <td className="p-2">{p.cargo ?? "—"}</td>
                      <td className="p-2">{p.origem ?? "—"}</td>
                      <td className="p-2 max-w-[16rem] truncate" title={p.observacao ?? ""}>{p.observacao ?? "—"}</td>
                      <td className="p-2">
                        {p.valid
                          ? <Badge variant="secondary" className="bg-green-100 text-green-700">válido</Badge>
                          : <Badge variant="secondary" className="bg-red-100 text-red-700">{p.reason || "inválido"}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 10 && (
                <div className="p-2 text-center text-xs text-muted-foreground">Prévia das 10 primeiras linhas — {parsed.length - 10} a mais serão processadas na importação</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {parsed && valid > 0 && (
        <Card>
          <CardHeader><CardTitle>Distribuição e opções</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <Checkbox checked={updateExisting} onCheckedChange={(v) => setUpdateExisting(v === true)} />
              <span>
                <strong>Atualizar contatos existentes com dados da planilha</strong>
                <br />
                <span className="text-muted-foreground text-xs">
                  Telefones já cadastrados não serão duplicados. Apenas campos vazios (nome, empresa, cargo, origem, observação) serão preenchidos.
                  Histórico, tentativas, vendedor e status são preservados.
                </span>
              </span>
            </label>

            {updateExisting && (
              <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
                <span>
                  <strong>Sobrescrever dados existentes</strong>
                  <br />
                  <span className="text-muted-foreground text-xs">
                    Substituir nome, empresa, cargo, origem e observação pelos valores da nova planilha,
                    mesmo quando o contato já tiver esses campos preenchidos. Status, vendedor, tentativas e histórico continuam preservados.
                  </span>
                </span>
              </label>
            )}

            <div>
              <Label>Modo de distribuição (somente para novos contatos)</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Importar sem responsável (distribuir depois)</SelectItem>
                  <SelectItem value="single">Atribuir todos a um vendedor</SelectItem>
                  <SelectItem value="round_robin">Distribuir automaticamente (rodízio)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "single" && (
              <div>
                <Label>Vendedor</Label>
                <Select value={singleId} onValueChange={setSingleId}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {mode === "round_robin" && (
              <div className="space-y-2">
                <Label>Vendedores ativos</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sellers.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <Checkbox checked={selectedSellers.has(s.id)} onCheckedChange={() => toggleSeller(s.id)} />
                      <span className="truncate">{s.full_name || s.email}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={importar} disabled={importing} size="lg">
              <Upload className="h-4 w-4 mr-2" />
              {importing ? "Importando…" : updateExisting ? `Confirmar importação / atualização (${valid})` : `Confirmar importação (${valid})`}
            </Button>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader><CardTitle>Relatório da importação</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Total de linhas lidas: <strong>{report.totalRows}</strong></div>
            <div>Novos contatos importados: <strong className="text-green-600">{report.imported}</strong></div>
            <div>Contatos existentes atualizados: <strong className="text-blue-600">{report.updated}</strong></div>
            <div>Duplicados ignorados (já na prospecção): <strong>{report.duplicatesInProspects}</strong></div>
            <div>Duplicados ignorados (já no CRM): <strong>{report.duplicatesInLeads}</strong></div>
            <div>Telefones inválidos: <strong className="text-red-600">{report.invalid}</strong></div>
            <hr className="my-2" />
            <div className="text-xs uppercase text-muted-foreground">Diagnóstico dos contatos válidos</div>
            <div>Sem nome: <strong>{report.missingNome}</strong></div>
            <div>Sem empresa: <strong>{report.missingEmpresa}</strong></div>
            <div>Sem cargo: <strong>{report.missingCargo}</strong></div>
            {report.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-muted-foreground">Ver detalhes ({report.errors.length})</summary>
                <ul className="mt-2 max-h-60 overflow-auto space-y-1 text-xs">
                  {report.errors.slice(0, 500).map((e, i) => (
                    <li key={i}>Linha {e.line}: {e.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
