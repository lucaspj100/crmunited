// Campanhas WhatsApp (F1): estrutura isolada. Contatos importados aqui NÃO entram
// no Discador, Lista WhatsApp, Funil, Leads ou qualquer estrutura de prospecção.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { normalizePhone } from "@/lib/phone";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Pause, Play, Plus, Square, Upload } from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  closed_at: string | null;
};
type Stats = { total: number; pending: number; sent: number; failed: number; cancelled: number };
const EMPTY: Stats = { total: 0, pending: 0, sent: 0, failed: 0, cancelled: 0 };

const CAMPAIGN_STATUS: Record<string, string> = { active: "Ativa", paused: "Pausada", closed: "Encerrada" };
const CONTACT_STATUS: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  failed: "Falha",
  cancelled: "Cancelado",
};

function CampaignBadge({ status }: { status: string }) {
  const label = CAMPAIGN_STATUS[status] ?? status;
  if (status === "active") return <Badge>{label}</Badge>;
  if (status === "paused") return <Badge variant="secondary">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const NAME_KEYS = ["nome", "name", "contato"];
const PHONE_KEYS = ["telefone", "phone", "celular", "whatsapp", "fone", "numero"];
const COMPANY_KEYS = ["empresa", "company", "companhia"];

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const k of Object.keys(row)) {
    const n = norm(k);
    if (keys.some((key) => n === key || n.startsWith(key))) {
      const v = row[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  return null;
}

async function parseFile(file: File) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const seen = new Set<string>();
  const valid: { name: string | null; phone: string; normalized_phone: string; company: string | null }[] = [];
  let invalid = 0;
  let dup = 0;
  for (const r of rows) {
    const phone = pick(r, PHONE_KEYS);
    const { normalized, valid: ok } = normalizePhone(phone);
    if (!phone || !ok || !normalized) {
      invalid++;
      continue;
    }
    if (seen.has(normalized)) {
      dup++;
      continue;
    }
    seen.add(normalized);
    valid.push({ name: pick(r, NAME_KEYS), phone, normalized_phone: normalized, company: pick(r, COMPANY_KEYS) });
  }
  return { valid, invalid, dup };
}

async function importContacts(campaignId: string, file: File) {
  const { valid, invalid, dup } = await parseFile(file);
  let inserted = 0;
  for (let i = 0; i < valid.length; i += 500) {
    const chunk = valid.slice(i, i + 500).map((c) => ({ ...c, campaign_id: campaignId }));
    const { data, error } = await supabase
      .from("whatsapp_campaign_contacts")
      .upsert(chunk, { onConflict: "campaign_id,normalized_phone", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    inserted += data?.length ?? 0;
  }
  const already = valid.length - inserted;
  toast.success(
    `${inserted} contatos importados` +
      (invalid ? ` · ${invalid} telefones inválidos` : "") +
      (dup + already ? ` · ${dup + already} repetidos ignorados` : ""),
  );
}

function useStats() {
  return useQuery({
    queryKey: ["whatsapp-campaign-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("whatsapp_campaign_stats");
      if (error) throw error;
      const m = new Map<string, Stats>();
      (data ?? []).forEach((r) =>
        m.set(r.campaign_id, {
          total: Number(r.total),
          pending: Number(r.pending),
          sent: Number(r.sent),
          failed: Number(r.failed),
          cancelled: Number(r.cancelled),
        }),
      );
      return m;
    },
  });
}

export function WhatsappCampaigns() {
  const [openId, setOpenId] = useState<string | null>(null);
  if (openId) return <CampaignDetail id={openId} onBack={() => setOpenId(null)} />;
  return <CampaignList onOpen={setOpenId} />;
}

function CampaignList({ onOpen }: { onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: stats } = useStats();
  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_campaigns")
        .select("id, name, status, created_at, closed_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data: c, error } = await supabase
        .from("whatsapp_campaigns")
        .insert({ name: name.trim(), created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      if (file) await importContacts(c.id, file);
      else toast.success("Campanha criada");
      qc.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-campaign-stats"] });
      setCreating(false);
      setName("");
      setFile(null);
      onOpen(c.id);
    } catch (e) {
      toast.error("Não foi possível criar a campanha: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const rows = data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Contatos das campanhas ficam separados do Discador, Lista WhatsApp, Funil e Leads.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova campanha
        </Button>
      </div>
      <Card className="p-0 overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhuma campanha criada ainda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Campanha</th>
                <th className="px-4 py-2 font-medium">Situação</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
                <th className="px-4 py-2 font-medium text-right">Pendentes</th>
                <th className="px-4 py-2 font-medium text-right">Enviados</th>
                <th className="px-4 py-2 font-medium text-right">Falhas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const s = stats?.get(c.id) ?? EMPTY;
                return (
                  <tr key={c.id} className="border-t cursor-pointer hover:bg-muted/30" onClick={() => onOpen(c.id)}>
                    <td className="px-4 py-2 font-semibold">{c.name}</td>
                    <td className="px-4 py-2"><CampaignBadge status={c.status} /></td>
                    <td className="px-4 py-2 text-right">{s.total.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right">{s.pending.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right">{s.sent.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right">{s.failed.toLocaleString("pt-BR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome da campanha (ex.: Fechamento Outubro)" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="space-y-1">
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">
                Opcional. Colunas reconhecidas: Nome, Telefone e Empresa.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saving || !name.trim()}>{saving ? "Salvando…" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CampaignDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const { data: stats } = useStats();
  const s = stats?.get(id) ?? EMPTY;

  const { data: campaign } = useQuery({
    queryKey: ["whatsapp-campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_campaigns")
        .select("id, name, status, created_at, closed_at")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Campaign;
    },
  });
  const { data: contacts, isLoading } = useQuery({
    queryKey: ["whatsapp-campaign-contacts", id],
    queryFn: async () => {
      const all: { id: string; name: string | null; phone: string; company: string | null; status: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("whatsapp_campaign_contacts")
          .select("id, name, phone, company, status")
          .eq("campaign_id", id)
          .order("created_at")
          .range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["whatsapp-campaign", id] });
    qc.invalidateQueries({ queryKey: ["whatsapp-campaign-contacts", id] });
    qc.invalidateQueries({ queryKey: ["whatsapp-campaign-stats"] });
    qc.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
  };

  const setStatus = async (status: "active" | "paused" | "closed") => {
    setBusy(true);
    const now = new Date().toISOString();
    const patch =
      status === "paused" ? { status, paused_at: now } : status === "closed" ? { status, closed_at: now } : { status, paused_at: null };
    const { error } = await supabase.from("whatsapp_campaigns").update(patch).eq("id", id);
    if (!error && status === "closed") {
      await supabase.from("whatsapp_campaign_contacts").update({ status: "cancelled" }).eq("campaign_id", id).eq("status", "pending");
    }
    setBusy(false);
    setConfirmClose(false);
    if (error) toast.error(error.message);
    else toast.success(status === "paused" ? "Campanha pausada" : status === "closed" ? "Campanha encerrada" : "Campanha retomada");
    refresh();
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      await importContacts(id, f);
    } catch (e) {
      toast.error("Falha na importação: " + (e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    }
  };

  const closed = campaign?.status === "closed";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Campanhas</Button>
          <h2 className="text-xl font-semibold">{campaign?.name ?? "…"}</h2>
          {campaign && <CampaignBadge status={campaign.status} />}
        </div>
        {!closed && (
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
            <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> Importar XLSX/CSV
            </Button>
            {campaign?.status === "active" ? (
              <Button variant="outline" disabled={busy} onClick={() => setStatus("paused")}><Pause className="h-4 w-4 mr-1" /> Pausar</Button>
            ) : (
              <Button variant="outline" disabled={busy} onClick={() => setStatus("active")}><Play className="h-4 w-4 mr-1" /> Retomar</Button>
            )}
            <Button variant="destructive" disabled={busy} onClick={() => setConfirmClose(true)}><Square className="h-4 w-4 mr-1" /> Encerrar</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Total", s.total],
          ["Pendentes", s.pending],
          ["Enviados", s.sent],
          ["Falhas", s.failed],
        ].map(([label, v]) => (
          <Card key={label as string} className="p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold">{(v as number).toLocaleString("pt-BR")}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : !contacts?.length ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhum contato. Importe um arquivo XLSX ou CSV.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2">{c.name ?? "—"}</td>
                  <td className="px-4 py-2">{c.phone}</td>
                  <td className="px-4 py-2">{c.company ?? "—"}</td>
                  <td className="px-4 py-2">{CONTACT_STATUS[c.status] ?? c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar campanha?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Os {s.pending.toLocaleString("pt-BR")} contatos pendentes passarão para "Cancelado". Essa ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(false)}>Voltar</Button>
            <Button variant="destructive" disabled={busy} onClick={() => setStatus("closed")}>Encerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
