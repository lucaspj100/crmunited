import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { normalizeProspectPhone } from "@/lib/prospect-phone";

export type RawRow = Record<string, unknown>;

export type ParsedRow = {
  index: number;
  nome: string | null;
  telefone_original: string;
  telefone_normalizado: string | null;
  ddd: string | null;
  empresa: string | null;
  cargo: string | null;
  origem: string | null;
  observacao: string | null;
  valid: boolean;
  reason?: string;
};

export type ParsedFile = {
  headers: string[];
  rows: RawRow[];
  detectedPhoneHeader: string | null;
};

const PHONE_HEADERS = ["telefone", "celular", "whatsapp", "numero", "número", "contato", "fone", "phone"];
const FIELD_MAP: Record<string, "nome" | "empresa" | "cargo" | "origem" | "observacao"> = {
  nome: "nome", name: "nome", contato: "nome", contact: "nome",
  empresa: "empresa", company: "empresa", organizacao: "empresa",
  cargo: "cargo", role: "cargo", funcao: "cargo", title: "cargo",
  origem: "origem", source: "origem", canal: "origem",
  observacao: "observacao", obs: "observacao", notes: "observacao", note: "observacao", comentario: "observacao",
};

export function normHeader(h: string): string {
  return String(h ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Converte qualquer valor de célula (incluindo números do Excel) para string segura,
 * sem notação científica e sem ".0" sobrando. */
export function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    // evita notação científica para números grandes (telefones)
    let s = v.toFixed(0);
    // se o original tinha casa decimal, garante que perdemos
    if (Math.floor(v) !== v) s = String(Math.round(v));
    return s;
  }
  if (typeof v === "boolean") return v ? "true" : "";
  let s = String(v).trim();
  // remove .0 / .00 finais
  s = s.replace(/\.0+$/, "");
  // remove notação científica residual ex.: "4.19999e+10"
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = Math.round(n).toString();
  }
  return s;
}

export async function parseProspectFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // raw:false faz o xlsx retornar valores já formatados como string quando possível
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: false });
  const headerSet = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);
  const detectedPhoneHeader = headers.find((h) => PHONE_HEADERS.includes(normHeader(h))) ?? null;
  return { headers, rows, detectedPhoneHeader };
}

export function mapRows(rows: RawRow[], phoneHeader: string | null): ParsedRow[] {
  const out: ParsedRow[] = [];
  rows.forEach((row, i) => {
    const parsed: ParsedRow = {
      index: i + 2,
      nome: null, telefone_original: "", telefone_normalizado: null, ddd: null,
      empresa: null, cargo: null, origem: null, observacao: null, valid: false,
    };

    // demais colunas
    for (const [k, v] of Object.entries(row)) {
      const key = normHeader(k);
      const dest = FIELD_MAP[key];
      if (!dest) continue;
      const val = cellToString(v).trim();
      (parsed as any)[dest] = val || null;
    }

    if (!phoneHeader) {
      parsed.reason = "Coluna de telefone não encontrada";
      out.push(parsed);
      return;
    }

    const rawPhone = cellToString(row[phoneHeader]).trim();
    parsed.telefone_original = rawPhone;
    if (!rawPhone) {
      parsed.reason = "Telefone vazio";
      out.push(parsed);
      return;
    }
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      parsed.reason = "Telefone com poucos dígitos";
      out.push(parsed);
      return;
    }
    if (digits.length > 13) {
      parsed.reason = "Telefone com dígitos demais";
      out.push(parsed);
      return;
    }
    const { normalized, ddd, valid } = normalizeProspectPhone(rawPhone);
    parsed.telefone_normalizado = normalized;
    parsed.ddd = ddd;
    parsed.valid = valid;
    if (!valid) parsed.reason = "Telefone inválido";
    out.push(parsed);
  });
  return out;
}

export type ImportReport = {
  totalRows: number;
  imported: number;
  duplicatesInProspects: number;
  duplicatesInLeads: number;
  invalid: number;
  errors: { line: number; reason: string }[];
};

export type DistributionMode =
  | { kind: "none" }
  | { kind: "single"; userId: string }
  | { kind: "round_robin"; userIds: string[] };

function pickOwner(mode: DistributionMode, index: number): string | null {
  if (mode.kind === "single") return mode.userId;
  if (mode.kind === "round_robin" && mode.userIds.length > 0) {
    return mode.userIds[index % mode.userIds.length];
  }
  return null;
}

export async function importProspects(parsed: ParsedRow[], mode: DistributionMode, createdBy: string): Promise<ImportReport> {
  const report: ImportReport = {
    totalRows: parsed.length,
    imported: 0,
    duplicatesInProspects: 0,
    duplicatesInLeads: 0,
    invalid: 0,
    errors: [],
  };

  const valid = parsed.filter((p) => p.valid && p.telefone_normalizado);
  parsed.filter((p) => !p.valid).forEach((p) => {
    report.invalid++;
    report.errors.push({ line: p.index, reason: p.reason || "Inválido" });
  });

  const seen = new Set<string>();
  const dedupedLocal = valid.filter((p) => {
    if (seen.has(p.telefone_normalizado!)) {
      report.duplicatesInProspects++;
      report.errors.push({ line: p.index, reason: "Telefone duplicado na planilha" });
      return false;
    }
    seen.add(p.telefone_normalizado!);
    return true;
  });

  if (dedupedLocal.length === 0) return report;

  const phones = dedupedLocal.map((p) => p.telefone_normalizado!);
  const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  const existingProspects = new Set<string>();
  for (const c of chunk(phones, 300)) {
    const { data } = await supabase
      .from("prospect_contacts")
      .select("telefone_normalizado")
      .in("telefone_normalizado", c);
    (data ?? []).forEach((r) => existingProspects.add(r.telefone_normalizado));
  }

  const existingLeads = new Set<string>();
  for (const c of chunk(phones, 300)) {
    const { data } = await supabase
      .from("leads")
      .select("phone_normalized")
      .in("phone_normalized", c);
    (data ?? []).forEach((r) => r.phone_normalized && existingLeads.add(r.phone_normalized));
  }

  const toInsert = dedupedLocal.filter((p) => {
    if (existingProspects.has(p.telefone_normalizado!)) {
      report.duplicatesInProspects++;
      report.errors.push({ line: p.index, reason: "Telefone já existe na Base de Prospecção" });
      return false;
    }
    if (existingLeads.has(p.telefone_normalizado!)) {
      report.duplicatesInLeads++;
      report.errors.push({ line: p.index, reason: "Telefone já existe no CRM" });
      return false;
    }
    return true;
  });

  let idx = 0;
  for (const batch of chunk(toInsert, 500)) {
    const rows = batch.map((p) => {
      const owner = pickOwner(mode, idx++);
      return {
        nome: p.nome,
        telefone_original: p.telefone_original,
        telefone_normalizado: p.telefone_normalizado!,
        ddd: p.ddd,
        empresa: p.empresa,
        cargo: p.cargo,
        origem: p.origem,
        observacao: p.observacao,
        vendedor_responsavel_id: owner,
        assigned_at: owner ? new Date().toISOString() : null,
        status_prospeccao: "Aguardando ligação",
        created_by: createdBy,
      };
    });
    const { error, count } = await supabase
      .from("prospect_contacts")
      .insert(rows, { count: "exact" });
    if (error) {
      report.errors.push({ line: 0, reason: `Erro ao inserir lote: ${error.message}` });
    } else {
      report.imported += count ?? rows.length;
    }
  }

  return report;
}
