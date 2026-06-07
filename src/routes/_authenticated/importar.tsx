import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STATUSES } from "@/lib/constants";
import { normalizePhone } from "@/lib/phone";
import { ensureTaskForStatus } from "@/lib/task-automation";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Copy, UserX } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/importar")({ component: ImportPage });

type RawRow = Record<string, any>;
type Profile = { id: string; full_name: string | null; email: string | null };

type ParsedLead = {
  index: number;
  name: string;
  phone: string;
  company: string;
  source: string;
  observation: string;
  status: string;
  linkedin: string;
  ownerName: string;
  // computed
  phoneNormalized: string | null;
  phoneValid: boolean;
  ownerId: string | null;
  category: "ok" | "duplicado_planilha" | "duplicado_crm" | "telefone_invalido" | "sem_nome" | "sem_vendedor";
  dupInfo?: { leadName?: string; vendor?: string };
};

const HEADER_MAP: Record<string, keyof Omit<ParsedLead, "index" | "phoneNormalized" | "phoneValid" | "ownerId" | "category" | "dupInfo">> = {
  nome: "name", name: "name",
  telefone: "phone", phone: "phone", celular: "phone", whatsapp: "phone", fone: "phone",
  empresa: "company", company: "company", escola: "company",
  origem: "source", source: "source", "origem do lead": "source",
  observacao: "observation", observação: "observation", obs: "observation", observations: "observation", observacoes: "observation", observações: "observation", notes: "observation",
  status: "status", etapa: "status",
  linkedin: "linkedin", "linkedin url": "linkedin",
  vendedor: "ownerName", "vendedor responsavel": "ownerName", "vendedor responsável": "ownerName", owner: "ownerName", responsavel: "ownerName", responsável: "ownerName",
};

const STATUS_MAP: Record<string, string> = {
  novo: "novo", new: "novo",
  interessado: "interessado", interested: "interessado",
  "entrevista marcada": "entrevista_marcada", entrevista_marcada: "entrevista_marcada",
  "entrevista realizada": "entrevista_realizada", entrevista_realizada: "entrevista_realizada",
  matricula: "matricula", matrícula: "matricula", enrolled: "matricula",
  perdido: "perdido", lost: "perdido",
};

function ImportPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [defaultOwner, setDefaultOwner] = useState<string>("");
  const [defaultStatus, setDefaultStatus] = useState<string>("novo");
  const [importing, setImporting] = useState(false);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-import"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").limit(2000);
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data: existingPhones = new Map() } = useQuery({
    queryKey: ["leads-phones-norm"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("name, phone_normalized, owner_id").not("phone_normalized", "is", null).limit(10000);
      if (error) throw error;
      const m = new Map<string, { name: string; owner_id: string }>();
      (data ?? []).forEach((l: any) => { if (l.phone_normalized) m.set(l.phone_normalized, l); });
      return m;
    },
  });

  const parsed = useMemo<ParsedLead[]>(() => {
    if (!rawRows.length) return [];
    const profByName = new Map<string, string>();
    profiles.forEach((p) => {
      if (p.full_name) profByName.set(p.full_name.toLowerCase().trim(), p.id);
      if (p.email) profByName.set(p.email.toLowerCase().trim(), p.id);
    });
    const profById = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "—"]));

    const seenInSheet = new Set<string>();
    return rawRows.map((row, i) => {
      const mapped: any = { name: "", phone: "", company: "", source: "", observation: "", status: "", linkedin: "", ownerName: "" };
      for (const k of Object.keys(row)) {
        const key = String(k || "").toLowerCase().trim();
        const target = HEADER_MAP[key];
        if (target) mapped[target] = String(row[k] ?? "").trim();
      }

      const { normalized, valid } = normalizePhone(mapped.phone);
      const statusGuess = STATUS_MAP[mapped.status.toLowerCase()] || defaultStatus;
      const ownerId = mapped.ownerName ? profByName.get(mapped.ownerName.toLowerCase()) || null : (defaultOwner || null);

      let category: ParsedLead["category"] = "ok";
      let dupInfo: ParsedLead["dupInfo"] | undefined;

      if (!mapped.name) category = "sem_nome";
      else if (normalized && !valid) category = "telefone_invalido";
      else if (normalized && seenInSheet.has(normalized)) { category = "duplicado_planilha"; }
      else if (normalized && existingPhones.has(normalized)) {
        const ex = existingPhones.get(normalized)!;
        category = "duplicado_crm";
        dupInfo = { leadName: ex.name, vendor: profById.get(ex.owner_id) || "—" };
      } else if (!ownerId) category = "sem_vendedor";

      if (normalized && category === "ok") seenInSheet.add(normalized);

      return {
        index: i,
        name: mapped.name,
        phone: mapped.phone,
        company: mapped.company,
        source: mapped.source,
        observation: mapped.observation,
        status: statusGuess,
        linkedin: mapped.linkedin,
        ownerName: mapped.ownerName,
        phoneNormalized: normalized,
        phoneValid: valid,
        ownerId,
        category,
        dupInfo,
      };
    });
  }, [rawRows, profiles, existingPhones, defaultOwner, defaultStatus]);

  const counts = useMemo(() => {
    const c = { total: parsed.length, ok: 0, dupPlan: 0, dupCRM: 0, invalid: 0, noName: 0, noOwner: 0 };
    parsed.forEach((p) => {
      if (p.category === "ok") c.ok++;
      else if (p.category === "duplicado_planilha") c.dupPlan++;
      else if (p.category === "duplicado_crm") c.dupCRM++;
      else if (p.category === "telefone_invalido") c.invalid++;
      else if (p.category === "sem_nome") c.noName++;
      else if (p.category === "sem_vendedor") c.noOwner++;
    });
    return c;
  }, [parsed]);

  const onFile = async (file: File) => {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
    setRawRows(rows);
  };

  const reset = () => { setRawRows([]); setFileName(""); };

  const onImport = async () => {
    if (!user) return;
    const valid = parsed.filter((p) => p.category === "ok");
    if (valid.length === 0) { toast.error("Nenhum lead válido para importar"); return; }
    setImporting(true);
    const payload = valid.map((p) => ({
      name: p.name,
      phone: p.phone || null,
      phone_normalized: p.phoneNormalized,
      phone_invalid: false,
      company: p.company || null,
      source: p.source || null,
      observation: p.observation || null,
      linkedin_url: p.linkedin || null,
      status: p.status as any,
      owner_id: p.ownerId || user.id,
    }));
    // insert em batches de 200
    const inserted: { id: string; owner_id: string; status: string }[] = [];
    for (let i = 0; i < payload.length; i += 200) {
      const chunk = payload.slice(i, i + 200);
      const { data, error } = await supabase.from("leads").insert(chunk).select("id, owner_id, status");
      if (error) { toast.error(error.message); setImporting(false); return; }
      inserted.push(...(data || []) as any);
    }
    // tarefas automáticas
    for (const l of inserted) {
      await ensureTaskForStatus({ leadId: l.id, ownerId: l.owner_id, status: l.status });
    }
    setImporting(false);
    toast.success(`${inserted.length} leads importados`);
    reset();
    qc.invalidateQueries();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Upload className="h-6 w-6 text-primary" />Importar leads</h1>
        <p className="text-sm text-muted-foreground">Envie um arquivo CSV ou Excel (.xlsx, .xls). Os cabeçalhos detectados: nome, telefone, empresa, origem, vendedor, observação, status, linkedin.</p>
      </div>

      {rawRows.length === 0 ? (
        <Card className="p-8 text-center space-y-4">
          <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground" />
          <div>
            <Label htmlFor="file" className="cursor-pointer">
              <span className="text-primary font-medium hover:underline">Escolher arquivo</span>
              <Input id="file" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </Label>
            <p className="text-xs text-muted-foreground mt-2">Aceita .csv, .xlsx, .xls (máx ~5MB)</p>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="text-sm">
                <span className="font-medium">Arquivo:</span> {fileName} · {counts.total} linhas
              </div>
              <Button size="sm" variant="ghost" onClick={reset}>Trocar arquivo</Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Vendedor padrão (quando a planilha não informar)</Label>
                <Select value={defaultOwner} onValueChange={setDefaultOwner}>
                  <SelectTrigger><SelectValue placeholder="Eu mesmo" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status padrão</Label>
                <Select value={defaultStatus} onValueChange={setDefaultStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.filter((s) => s.value !== "perdido" && s.value !== "matricula").map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <Stat icon={CheckCircle2} label="Válidos novos" value={counts.ok} tone="success" />
            <Stat icon={Copy} label="Duplicados (CRM)" value={counts.dupCRM} tone="warning" />
            <Stat icon={Copy} label="Duplicados (planilha)" value={counts.dupPlan} tone="warning" />
            <Stat icon={XCircle} label="Telefone inválido" value={counts.invalid} tone="danger" />
            <Stat icon={UserX} label="Sem vendedor" value={counts.noOwner} tone="warning" />
            <Stat icon={AlertTriangle} label="Sem nome" value={counts.noName} tone="danger" />
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Status revisão</th>
                  <th className="text-left p-2">Nome</th>
                  <th className="text-left p-2">Telefone</th>
                  <th className="text-left p-2">Empresa</th>
                  <th className="text-left p-2">Vendedor</th>
                  <th className="text-left p-2">Origem</th>
                  <th className="text-left p-2">Etapa</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 500).map((p) => (
                  <tr key={p.index} className="border-t">
                    <td className="p-2 text-muted-foreground">{p.index + 1}</td>
                    <td className="p-2"><CategoryBadge p={p} /></td>
                    <td className="p-2">{p.name || <span className="text-muted-foreground italic">—</span>}</td>
                    <td className="p-2">{p.phone}{p.phoneNormalized && p.phoneValid && <div className="text-[10px] text-muted-foreground">→ {p.phoneNormalized}</div>}</td>
                    <td className="p-2">{p.company}</td>
                    <td className="p-2">{p.ownerName || <span className="text-muted-foreground italic">{p.ownerId ? "padrão" : "—"}</span>}</td>
                    <td className="p-2">{p.source}</td>
                    <td className="p-2">{LEAD_STATUSES.find((s) => s.value === p.status)?.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 500 && <div className="p-2 text-xs text-muted-foreground text-center">Mostrando 500 de {parsed.length} linhas. A importação considera todas.</div>}
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset}>Cancelar</Button>
            <Button onClick={onImport} disabled={importing || counts.ok === 0}>
              {importing ? "Importando…" : `Importar ${counts.ok} leads válidos`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function CategoryBadge({ p }: { p: ParsedLead }) {
  switch (p.category) {
    case "ok": return <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-500/30">Pronto</Badge>;
    case "duplicado_crm": return <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30" title={`Existe: ${p.dupInfo?.leadName} (${p.dupInfo?.vendor})`}>Duplicado (CRM)</Badge>;
    case "duplicado_planilha": return <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">Duplicado na planilha</Badge>;
    case "telefone_invalido": return <Badge variant="destructive">Telefone inválido</Badge>;
    case "sem_nome": return <Badge variant="destructive">Sem nome</Badge>;
    case "sem_vendedor": return <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">Sem vendedor</Badge>;
  }
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: "success" | "warning" | "danger" }) {
  const tones = {
    success: "bg-emerald-500/10 border-emerald-500/30",
    warning: "bg-amber-500/10 border-amber-500/30",
    danger: "bg-rose-500/10 border-rose-500/30",
  };
  return (
    <Card className={`p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}
