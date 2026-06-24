import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { normalizeProspectPhone } from "@/lib/prospect-phone";

export type RawRow = Record<string, unknown>;

export type FieldKey = "nome" | "telefone" | "empresa" | "cargo" | "origem" | "observacao" | "linkedin_url";

export type ColumnMapping = Partial<Record<FieldKey, string | null>>;

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
  linkedin_url: string | null;
  valid: boolean;
  reason?: string;
};

export type ParsedFile = {
  headers: string[];
  rows: RawRow[];
  detected: Required<Record<FieldKey, string | null>>;
};

const ALIASES: Record<FieldKey, string[]> = {
  telefone: [
    "telefone", "telefones", "celular", "celulares", "whatsapp", "whats", "wpp",
    "numero", "número", "numeros", "números", "contato", "fone", "phone",
    "telefone celular", "telefone principal", "tel", "mobile", "mobile phone",
  ],
  nome: [
    "nome", "nome completo", "nomecompleto", "full name", "fullname", "name",
    "pessoa", "contato", "lead", "prospect", "candidato", "first name", "primeiro nome",
  ],
  empresa: [
    "empresa", "empresa atual", "companhia", "organizacao", "organização",
    "company", "current company", "company name", "local de trabalho", "onde trabalha",
    "negocio", "negócio",
  ],
  cargo: [
    "cargo", "profissao", "profissão", "funcao", "função", "ocupacao", "ocupação",
    "job title", "jobtitle", "position", "headline", "titulo", "título",
    "area", "área", "departamento", "role", "title",
  ],
  origem: [
    "origem", "fonte", "lista", "campanha", "canal", "source", "list", "campaign",
  ],
  observacao: [
    "observacao", "observação", "observacoes", "observações", "nota", "notas",
    "comentario", "comentário", "comentarios", "comentários",
    "descricao", "descrição", "note", "notes", "comment", "comments", "obs",
  ],
  linkedin_url: [
    "linkedin", "linkedin url", "url linkedin", "perfil linkedin", "link linkedin",
    "profile url", "linkedin profile", "linkedin_url", "linkedinurl", "perfil",
  ],
};

export function normHeader(h: string): string {
  return String(h ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function detectHeader(headers: string[], field: FieldKey, taken: Set<string>): string | null {
  const aliases = ALIASES[field];
  for (const h of headers) {
    if (taken.has(h)) continue;
    const n = normHeader(h);
    if (aliases.includes(n)) { taken.add(h); return h; }
  }
  // fallback: substring match (e.g. "Telefone celular 1")
  for (const h of headers) {
    if (taken.has(h)) continue;
    const n = normHeader(h);
    if (aliases.some((a) => n.includes(a))) { taken.add(h); return h; }
  }
  return null;
}

/** Converte célula em string segura, sem notação científica nem ".0" finais. */
export function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    let s = v.toFixed(0);
    if (Math.floor(v) !== v) s = String(Math.round(v));
    return s;
  }
  if (typeof v === "boolean") return v ? "true" : "";
  let s = String(v).trim();
  s = s.replace(/\.0+$/, "");
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
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: false });
  const headerSet = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);
  const taken = new Set<string>();
  // ordem: telefone primeiro (mais crítico), depois os outros
  const detected: Required<Record<FieldKey, string | null>> = {
    telefone: detectHeader(headers, "telefone", taken),
    nome: detectHeader(headers, "nome", taken),
    empresa: detectHeader(headers, "empresa", taken),
    cargo: detectHeader(headers, "cargo", taken),
    origem: detectHeader(headers, "origem", taken),
    observacao: detectHeader(headers, "observacao", taken),
    linkedin_url: detectHeader(headers, "linkedin_url", taken),
  };
  return { headers, rows, detected };
}

export function mapRows(rows: RawRow[], mapping: ColumnMapping): ParsedRow[] {
  const out: ParsedRow[] = [];
  const get = (row: RawRow, key: FieldKey): string | null => {
    const col = mapping[key];
    if (!col) return null;
    const v = cellToString(row[col]).trim();
    return v || null;
  };
  rows.forEach((row, i) => {
    const parsed: ParsedRow = {
      index: i + 2,
      nome: get(row, "nome"),
      telefone_original: "",
      telefone_normalizado: null,
      ddd: null,
      empresa: get(row, "empresa"),
      cargo: get(row, "cargo"),
      origem: get(row, "origem"),
      observacao: get(row, "observacao"),
      linkedin_url: get(row, "linkedin_url"),
      valid: false,
    };

    const phoneCol = mapping.telefone;
    if (!phoneCol) {
      parsed.reason = "Coluna de telefone não mapeada";
      out.push(parsed);
      return;
    }
    const rawPhone = cellToString(row[phoneCol]).trim();
    parsed.telefone_original = rawPhone;
    if (!rawPhone) { parsed.reason = "Telefone vazio"; out.push(parsed); return; }
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length < 10) { parsed.reason = "Telefone com poucos dígitos"; out.push(parsed); return; }
    if (digits.length > 13) { parsed.reason = "Telefone com dígitos demais"; out.push(parsed); return; }
    const { normalized, ddd, valid } = normalizeProspectPhone(rawPhone);
    parsed.telefone_normalizado = normalized;
    parsed.ddd = ddd;
    parsed.valid = valid;
    if (!valid) parsed.reason = "Telefone inválido";
    out.push(parsed);
  });
  return out;
}

export type ImportError = { line: number; phone?: string | null; nome?: string | null; reason: string };

export type ImportReport = {
  totalRows: number;
  validRows: number;
  imported: number;
  updated: number;
  duplicatesInProspects: number;
  duplicatesInLeads: number;
  duplicatesInFile: number;
  invalid: number;
  missingPhone: number;
  missingNome: number;
  missingEmpresa: number;
  missingCargo: number;
  errors: ImportError[];
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

export async function importProspects(
  parsed: ParsedRow[],
  mode: DistributionMode,
  createdBy: string,
  options: { updateExisting?: boolean; overwrite?: boolean; isAdmin?: boolean } = {},
): Promise<ImportReport> {
  const report: ImportReport = {
    totalRows: parsed.length,
    imported: 0,
    updated: 0,
    duplicatesInProspects: 0,
    duplicatesInLeads: 0,
    invalid: 0,
    missingNome: 0,
    missingEmpresa: 0,
    missingCargo: 0,
    errors: [],
  };

  const valid = parsed.filter((p) => p.valid && p.telefone_normalizado);
  parsed.filter((p) => !p.valid).forEach((p) => {
    report.invalid++;
    report.errors.push({ line: p.index, reason: p.reason || "Inválido" });
  });

  // Determina o owner final de cada linha ANTES da deduplicação,
  // pois duplicidade no fluxo de discagem é por (telefone + vendedor).
  const validWithOwner = valid.map((p, i) => ({ row: p, owner: pickOwner(mode, i) ?? createdBy }));

  const seen = new Set<string>(); // chave: `${phone}:${owner}`
  const dedupedLocal: { row: ParsedRow; owner: string }[] = [];
  for (const item of validWithOwner) {
    const key = `${item.row.telefone_normalizado}:${item.owner}`;
    if (seen.has(key)) {
      report.duplicatesInProspects++;
      report.errors.push({ line: item.row.index, reason: "Telefone duplicado na planilha para o mesmo vendedor" });
      continue;
    }
    seen.add(key);
    dedupedLocal.push(item);
  }

  if (dedupedLocal.length === 0) return report;

  const phones = dedupedLocal.map((p) => p.row.telefone_normalizado!);
  const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  type Existing = { id: string; nome: string | null; empresa: string | null; cargo: string | null; origem: string | null; observacao: string | null; linkedin_url: string | null; status_prospeccao: string | null; vendedor_responsavel_id: string | null };
  // Pode haver várias linhas com o mesmo telefone (uma por vendedor) — guardamos todas.
  const existingByPhone = new Map<string, Existing[]>();
  for (const c of chunk(phones, 300)) {
    const { data } = await supabase.rpc("prospect_phones_lookup", { _phones: c });
    (data ?? []).forEach((r: any) => {
      const list = existingByPhone.get(r.telefone_normalizado) ?? [];
      list.push(r);
      existingByPhone.set(r.telefone_normalizado, list);
    });
  }
  const findExistingForOwner = (phone: string, owner: string): Existing | undefined => {
    const list = existingByPhone.get(phone);
    if (!list) return undefined;
    return list.find((r) => r.vendedor_responsavel_id === owner);
  };

  // Para o CRM (leads), também é por owner: o mesmo telefone pode existir para outro vendedor.
  const existingLeadsByPhone = new Map<string, Set<string>>(); // phone -> set of owner_ids
  for (const c of chunk(phones, 300)) {
    const { data } = await supabase.from("leads").select("phone_normalized, owner_id").in("phone_normalized", c);
    (data ?? []).forEach((r: any) => {
      if (!r.phone_normalized || !r.owner_id) return;
      const set = existingLeadsByPhone.get(r.phone_normalized) ?? new Set<string>();
      set.add(r.owner_id);
      existingLeadsByPhone.set(r.phone_normalized, set);
    });
  }

  // separa novos x existentes
  const toInsert: { row: ParsedRow; owner: string }[] = [];
  const toUpdate: { row: ParsedRow; existing: Existing }[] = [];

  for (const item of dedupedLocal) {
    const p = item.row;
    const ex = findExistingForOwner(p.telefone_normalizado!, item.owner);
    if (ex) {
      if (options.updateExisting) {
        toUpdate.push({ row: p, existing: ex });
      } else {
        report.duplicatesInProspects++;
        report.errors.push({ line: p.index, reason: "Telefone já existe na sua base de prospecção" });
      }
      continue;
    }
    const leadOwners = existingLeadsByPhone.get(p.telefone_normalizado!);
    if (leadOwners && leadOwners.has(item.owner)) {
      report.duplicatesInLeads++;
      report.errors.push({ line: p.index, reason: "Telefone já existe no seu CRM" });
      continue;
    }
    toInsert.push(item);
  }

  // INSERT novos — owner já foi determinado na etapa de deduplicação
  for (const batch of chunk(toInsert, 500)) {
    const rows = batch.map(({ row: p, owner }) => ({
      nome: p.nome,
      telefone_original: p.telefone_original,
      telefone_normalizado: p.telefone_normalizado!,
      ddd: p.ddd,
      empresa: p.empresa,
      cargo: p.cargo,
      origem: p.origem,
      observacao: p.observacao,
      linkedin_url: p.linkedin_url,
      vendedor_responsavel_id: owner,
      assigned_at: owner ? new Date().toISOString() : null,
      status_prospeccao: "Aguardando ligação",
      created_by: createdBy,
    }));
    const { error, count } = await supabase
      .from("prospect_contacts")
      .insert(rows, { count: "exact" });
    if (error) report.errors.push({ line: 0, reason: `Erro ao inserir lote: ${error.message}` });
    else report.imported += count ?? rows.length;
  }

  // UPDATE existentes
  // - overwrite=false: preenche apenas campos vazios
  // - overwrite=true: substitui pelos novos valores (quando vierem na planilha)
  // status_prospeccao / vendedor_responsavel_id / quantidade_tentativas / histórico nunca são alterados aqui
  for (const { row, existing } of toUpdate) {
    const patch: {
      nome?: string; empresa?: string; cargo?: string; origem?: string; observacao?: string; linkedin_url?: string;
    } = {};
    const apply = (field: "nome" | "empresa" | "cargo" | "origem" | "observacao" | "linkedin_url") => {
      const newVal = row[field];
      const oldVal = (existing as any)[field] as string | null;
      if (!newVal) return;
      if (options.overwrite || !oldVal) patch[field] = newVal;
    };
    apply("nome"); apply("empresa"); apply("cargo"); apply("origem"); apply("observacao"); apply("linkedin_url");
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase.from("prospect_contacts").update(patch).eq("id", existing.id);
    if (error) report.errors.push({ line: row.index, reason: `Falha ao atualizar: ${error.message}` });
    else report.updated++;
  }

  // Diagnóstico: contatos que ficaram sem dados-chave
  for (const { row: p } of dedupedLocal) {
    if (!p.nome) report.missingNome++;
    if (!p.empresa) report.missingEmpresa++;
    if (!p.cargo) report.missingCargo++;
  }

  return report;
}

