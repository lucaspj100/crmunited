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

const HEADER_MAP: Record<string, keyof Omit<ParsedRow, "index" | "telefone_normalizado" | "ddd" | "valid" | "reason">> = {
  nome: "nome", name: "nome", contato: "nome", contact: "nome",
  telefone: "telefone_original", phone: "telefone_original", celular: "telefone_original", whatsapp: "telefone_original", fone: "telefone_original",
  empresa: "empresa", company: "empresa", organizacao: "empresa",
  cargo: "cargo", role: "cargo", funcao: "cargo", title: "cargo",
  origem: "origem", source: "origem", canal: "origem",
  observacao: "observacao", obs: "observacao", notes: "observacao", note: "observacao", comentario: "observacao",
};

function normHeader(h: string): string {
  return h.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function parseProspectFile(file: File): Promise<RawRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });
}

export function mapRows(rows: RawRow[]): ParsedRow[] {
  const out: ParsedRow[] = [];
  rows.forEach((row, i) => {
    const parsed: ParsedRow = {
      index: i + 2, // linha real considerando header
      nome: null, telefone_original: "", telefone_normalizado: null, ddd: null,
      empresa: null, cargo: null, origem: null, observacao: null, valid: false,
    };
    for (const [k, v] of Object.entries(row)) {
      const key = normHeader(k);
      const dest = HEADER_MAP[key];
      if (!dest) continue;
      const val = v == null ? null : String(v).trim();
      (parsed as any)[dest] = val || null;
    }
    parsed.telefone_original = parsed.telefone_original ? String(parsed.telefone_original) : "";
    if (!parsed.telefone_original) {
      parsed.reason = "Telefone vazio";
      out.push(parsed);
      return;
    }
    const { normalized, ddd, valid } = normalizeProspectPhone(parsed.telefone_original);
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

  // dedupe dentro do próprio lote
  const seen = new Set<string>();
  const dedupedLocal = valid.filter((p) => {
    if (seen.has(p.telefone_normalizado!)) {
      report.duplicatesInProspects++;
      report.errors.push({ line: p.index, reason: "Duplicado dentro da planilha" });
      return false;
    }
    seen.add(p.telefone_normalizado!);
    return true;
  });

  if (dedupedLocal.length === 0) return report;

  const phones = dedupedLocal.map((p) => p.telefone_normalizado!);

  // chunk para evitar limite de URL
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
      report.errors.push({ line: p.index, reason: "Já existe na base de prospecção" });
      return false;
    }
    if (existingLeads.has(p.telefone_normalizado!)) {
      report.duplicatesInLeads++;
      report.errors.push({ line: p.index, reason: "Já é lead no CRM" });
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
