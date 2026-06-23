import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import { parseProspectFile, mapRows, importProspects, type ParsedRow, type ImportReport, type DistributionMode } from "@/lib/prospect-import";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet } from "lucide-react";

type Seller = { id: string; full_name: string | null; email: string };

export function ImportPanel({ sellers }: { sellers: Seller[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [mode, setMode] = useState<"none" | "single" | "round_robin">("none");
  const [singleId, setSingleId] = useState<string>("");
  const [selectedSellers, setSelectedSellers] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const onFile = async (file: File) => {
    setReport(null);
    try {
      const raw = await parseProspectFile(file);
      const mapped = mapRows(raw);
      setParsed(mapped);
      toast.success(`${raw.length} linhas lidas`);
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
    toast.success(`Importados ${r.imported} contatos`);
  };

  const toggleSeller = (id: string) => {
    const next = new Set(selectedSellers);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSellers(next);
  };

  const valid = parsed?.filter((p) => p.valid).length ?? 0;
  const invalid = parsed?.filter((p) => !p.valid).length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Importar planilha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie um arquivo CSV ou Excel. A única coluna obrigatória é <strong>telefone</strong>.
            Colunas reconhecidas: nome, telefone, empresa, cargo, origem, observação.
          </p>
          <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          {parsed && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div>Total de linhas lidas: <strong>{parsed.length}</strong></div>
              <div>Válidas: <strong className="text-green-600">{valid}</strong> · Inválidas: <strong className="text-red-600">{invalid}</strong></div>
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && (
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
              <Upload className="h-4 w-4 mr-2" />{importing ? "Importando…" : "Importar"}
            </Button>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader><CardTitle>Relatório da importação</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Linhas lidas: <strong>{report.totalRows}</strong></div>
            <div>Importadas: <strong className="text-green-600">{report.imported}</strong></div>
            <div>Duplicadas (já na prospecção): <strong>{report.duplicatesInProspects}</strong></div>
            <div>Duplicadas (já no CRM): <strong>{report.duplicatesInLeads}</strong></div>
            <div>Inválidas: <strong className="text-red-600">{report.invalid}</strong></div>
            {report.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-muted-foreground">Ver detalhes ({report.errors.length})</summary>
                <ul className="mt-2 max-h-60 overflow-auto space-y-1 text-xs">
                  {report.errors.slice(0, 200).map((e, i) => (
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
