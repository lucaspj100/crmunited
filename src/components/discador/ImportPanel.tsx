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
} from "@/lib/prospect-import";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";

type Seller = { id: string; full_name: string | null; email: string };

export function ImportPanel({ sellers }: { sellers: Seller[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [phoneCol, setPhoneCol] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "single" | "round_robin">("none");
  const [singleId, setSingleId] = useState<string>("");
  const [selectedSellers, setSelectedSellers] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const parsed: ParsedRow[] | null = useMemo(() => {
    if (!file) return null;
    return mapRows(file.rows, phoneCol);
  }, [file, phoneCol]);

  const onFile = async (f: File) => {
    setReport(null);
    setFile(null);
    setPhoneCol(null);
    try {
      const result = await parseProspectFile(f);
      setFile(result);
      setPhoneCol(result.detectedPhoneHeader);
      if (result.detectedPhoneHeader) {
        toast.success(`${result.rows.length} linhas lidas — coluna de telefone: "${result.detectedPhoneHeader}"`);
      } else {
        toast.warning(`${result.rows.length} linhas lidas — selecione manualmente a coluna do telefone`);
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
    const r = await importProspects(parsed, distribution, user.id);
    setImporting(false);
    setReport(r);
    qc.invalidateQueries({ queryKey: ["prospect_contacts_admin"] });
    qc.invalidateQueries({ queryKey: ["prospect_dashboard"] });
    if (r.imported > 0) toast.success(`Importados ${r.imported} contatos`);
    else toast.error("Nenhum contato foi importado. Confira a prévia.");
  };

  const toggleSeller = (id: string) => {
    const next = new Set(selectedSellers);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSellers(next);
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
            Envie um arquivo CSV ou Excel. A única coluna obrigatória é <strong>telefone</strong>
            {" "}(aceita: telefone, celular, whatsapp, número, contato, fone, phone).
            Demais colunas reconhecidas: nome, empresa, cargo, origem, observação.
          </p>
          <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />

          {file && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div>Total de linhas lidas: <strong>{file.rows.length}</strong></div>
                <div>Colunas detectadas: <strong>{file.headers.join(", ") || "—"}</strong></div>
                {parsed && (
                  <div>Válidas: <strong className="text-green-600">{valid}</strong> · Inválidas: <strong className="text-red-600">{invalid}</strong></div>
                )}
              </div>

              <div>
                <Label>Coluna de telefone</Label>
                <Select value={phoneCol ?? ""} onValueChange={(v) => setPhoneCol(v || null)}>
                  <SelectTrigger><SelectValue placeholder="Selecione a coluna com o telefone…" /></SelectTrigger>
                  <SelectContent>
                    {file.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!phoneCol && (
                  <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Qual coluna contém o telefone?
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
          <CardHeader><CardTitle>Prévia ({parsed.length} linhas)</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-xs">
                  <tr>
                    <th className="p-2 text-left">Linha</th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Telefone original</th>
                    <th className="p-2 text-left">Normalizado</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 500).map((p) => (
                    <tr key={p.index} className="border-t">
                      <td className="p-2 text-muted-foreground">{p.index}</td>
                      <td className="p-2">{p.nome ?? "—"}</td>
                      <td className="p-2 font-mono text-xs">{p.telefone_original || "—"}</td>
                      <td className="p-2 font-mono text-xs">{p.telefone_normalizado ? `+${p.telefone_normalizado}` : "—"}</td>
                      <td className="p-2">
                        {p.valid
                          ? <Badge variant="secondary" className="bg-green-100 text-green-700">válido</Badge>
                          : <Badge variant="secondary" className="bg-red-100 text-red-700">{p.reason || "inválido"}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 500 && (
                <div className="p-2 text-center text-xs text-muted-foreground">Mostrando 500 de {parsed.length} linhas</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {parsed && valid > 0 && (
        <Card>
          <CardHeader><CardTitle>Distribuição</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Modo</Label>
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
              <Upload className="h-4 w-4 mr-2" />{importing ? "Importando…" : `Importar ${valid} contatos`}
            </Button>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader><CardTitle>Relatório da importação</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Total de linhas lidas: <strong>{report.totalRows}</strong></div>
            <div>Contatos válidos: <strong className="text-green-600">{report.totalRows - report.invalid}</strong></div>
            <div>Contatos inválidos: <strong className="text-red-600">{report.invalid}</strong></div>
            <div>Duplicados (já na prospecção): <strong>{report.duplicatesInProspects}</strong></div>
            <div>Duplicados (já no CRM): <strong>{report.duplicatesInLeads}</strong></div>
            <div>Importados com sucesso: <strong className="text-green-600">{report.imported}</strong></div>
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
