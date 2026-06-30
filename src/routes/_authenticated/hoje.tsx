import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LEAD_STATUSES, LOST_REASONS, labelFor, statusColor, waLink } from "@/lib/constants";
import { MESSAGE_LIBRARY, buildMessage, pickPresetKey, copyToClipboard, leadSummary, rawPhoneDigits } from "@/lib/messages";
import { logLeadEvent } from "@/lib/lead-events";
import { LeadDetailsDialog } from "@/components/LeadDetailsDialog";
import {
  Zap, MessageCircle, Copy, Phone, Eye, Check, Calendar as CalendarIcon, FileText, ChevronRight,
  User, AlertTriangle, Flame, Snowflake, Sun, PhoneCall, Sparkles, Clock,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hoje")({ component: HojePage });

type Lead = {
  id: string; name: string; phone: string | null; company: string | null;
  status: string; owner_id: string; observation: string | null;
  interview_date: string | null; interview_time: string | null;
  last_contact_at: string | null; next_followup_at: string | null;
  lost_reason: string | null; in_rescue: boolean;
  created_at: string;
};
type Task = {
  id: string; lead_id: string | null; type: string; due_date: string; due_time: string | null;
  observation: string | null; status: string; owner_id: string; is_rescue: boolean;
  prospect_contact_id: string | null;
};
type Profile = { id: string; full_name: string | null; email: string | null };
type ProspectMini = {
  id: string; nome: string | null; empresa: string | null; cargo: string | null;
  telefone_normalizado: string; telefone_original: string | null; observacao: string | null;
  vendedor_responsavel_id: string | null;
};

type Reason =
  | "atrasada"
  | "entrevista_hoje"
  | "retorno_pendente"
  | "followup_hoje"
  | "resgate_hoje"
  | "novo_sem_contato"
  | "sem_proxima_acao";

type QueueItem = {
  reason: Reason;
  priority: number;
  sortKey: string;
  lead?: Lead;
  task?: Task;
  prospect?: ProspectMini;
  owner_id: string;
};

const REASON_META: Record<Reason, { label: string; icon: any; color: string }> = {
  atrasada:           { label: "Atrasadas",          icon: AlertTriangle,  color: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
  entrevista_hoje:    { label: "Entrevistas de hoje", icon: CalendarIcon,  color: "bg-violet-500/15 text-violet-700 border-violet-500/30" },
  retorno_pendente:   { label: "Retornos",           icon: PhoneCall,      color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  followup_hoje:      { label: "Follow-ups",         icon: Sun,            color: "bg-primary/15 text-primary border-primary/30" },
  resgate_hoje:       { label: "Resgates",           icon: Zap,            color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  novo_sem_contato:   { label: "Leads novos",        icon: Flame,          color: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
  sem_proxima_acao:   { label: "Sem próxima ação",   icon: Snowflake,      color: "bg-slate-500/15 text-slate-700 border-slate-500/30" },
};

const FILTERS: { key: string; label: string; match: (it: QueueItem) => boolean }[] = [
  { key: "todos",        label: "Todos",            match: () => true },
  { key: "agora",        label: "Agora",            match: (i) => i.reason === "atrasada" || i.reason === "retorno_pendente" || i.reason === "entrevista_hoje" },
  { key: "hoje",         label: "Hoje",             match: () => true },
  { key: "atrasadas",    label: "Atrasadas",        match: (i) => i.reason === "atrasada" },
  { key: "entrevistas",  label: "Entrevistas",      match: (i) => i.reason === "entrevista_hoje" },
  { key: "retornos",     label: "Retornos",         match: (i) => i.reason === "retorno_pendente" },
  { key: "resgates",     label: "Resgates",         match: (i) => i.reason === "resgate_hoje" },
  { key: "sem_acao",     label: "Sem próxima ação", match: (i) => i.reason === "sem_proxima_acao" || i.reason === "novo_sem_contato" },
];

function HojePage() {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const [vendor, setVendor] = useState<string>("me");
  const [filter, setFilter] = useState<string>("todos");
  const [working, setWorking] = useState<QueueItem | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["hoje"],
    queryFn: async () => {
      const [leadsR, tasksR, profR, prospectsR] = await Promise.all([
        supabase.from("leads").select("id,name,phone,company,status,owner_id,observation,interview_date,interview_time,last_contact_at,next_followup_at,lost_reason,in_rescue,created_at").limit(5000),
        supabase.from("tasks").select("id,lead_id,type,due_date,due_time,observation,status,owner_id,is_rescue,prospect_contact_id").eq("status", "pendente").limit(5000),
        supabase.from("profiles").select("id, full_name, email").limit(2000),
        supabase.from("prospect_contacts").select("id,nome,empresa,cargo,telefone_normalizado,telefone_original,observacao,vendedor_responsavel_id").limit(5000),
      ]);
      return {
        leads: (leadsR.data ?? []) as Lead[],
        tasks: (tasksR.data ?? []) as Task[],
        profiles: (profR.data ?? []) as Profile[],
        prospects: (prospectsR.data ?? []) as ProspectMini[],
      };
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  // const now is computed via Date when needed
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const in7Str = in7.toISOString().slice(0, 10);

  const byProfile = useMemo(() => new Map((data?.profiles ?? []).map((p) => [p.id, p])), [data]);
  const byProspect = useMemo(() => new Map((data?.prospects ?? []).map((p) => [p.id, p])), [data]);

  const ownerFilter = (ownerId: string | null | undefined) => {
    if (!ownerId) return false;
    if (!isAdmin) return ownerId === user?.id;
    if (vendor === "all") return true;
    if (vendor === "me") return ownerId === user?.id;
    return ownerId === vendor;
  };

  const queue = useMemo<QueueItem[]>(() => {
    if (!data) return [];
    const leads = data.leads.filter((l) => ownerFilter(l.owner_id) && l.status !== "perdido" && l.status !== "matricula");
    const tasksByLead = new Map<string, Task[]>();
    for (const t of data.tasks.filter((t) => ownerFilter(t.owner_id) && t.lead_id)) {
      const a = tasksByLead.get(t.lead_id!) ?? [];
      a.push(t);
      tasksByLead.set(t.lead_id!, a);
    }
    const seenLeads = new Set<string>();
    const items: QueueItem[] = [];

    // 1) Atrasadas (tasks de leads com due_date < hoje, ou retornos vencidos)
    const overdue = data.tasks.filter((t) => ownerFilter(t.owner_id) && t.due_date < today && t.lead_id)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    for (const t of overdue) {
      const l = leads.find((x) => x.id === t.lead_id);
      if (l && !seenLeads.has(l.id)) {
        seenLeads.add(l.id);
        items.push({ reason: "atrasada", lead: l, task: t, priority: 1, sortKey: t.due_date, owner_id: t.owner_id });
      }
    }

    // 2) Entrevistas hoje
    for (const l of leads) {
      if (seenLeads.has(l.id)) continue;
      if (l.interview_date === today && (l.status === "entrevista_marcada" || l.status === "entrevista_realizada")) {
        seenLeads.add(l.id);
        items.push({ reason: "entrevista_hoje", lead: l, priority: 2, sortKey: l.interview_time ?? "00:00", owner_id: l.owner_id });
      }
    }

    // 3) Retornos pendentes (tasks de prospect_contacts vencidas/hoje)
    const retornos = data.tasks.filter(
      (t) => ownerFilter(t.owner_id) && t.type === "retorno_ligacao" && t.prospect_contact_id && t.due_date <= today,
    ).sort((a, b) => `${a.due_date} ${a.due_time ?? "00:00"}`.localeCompare(`${b.due_date} ${b.due_time ?? "00:00"}`));
    for (const t of retornos) {
      const p = byProspect.get(t.prospect_contact_id!);
      if (!p) continue;
      items.push({ reason: "retorno_pendente", task: t, prospect: p, priority: 3, sortKey: `${t.due_date} ${t.due_time ?? "00:00"}`, owner_id: t.owner_id });
    }

    // 4) Follow-ups hoje (não-resgate)
    const todayTasks = data.tasks.filter((t) => ownerFilter(t.owner_id) && t.due_date === today && !t.is_rescue && t.lead_id && t.type !== "retorno_ligacao")
      .sort((a, b) => (a.due_time ?? "").localeCompare(b.due_time ?? ""));
    for (const t of todayTasks) {
      const l = leads.find((x) => x.id === t.lead_id);
      if (l && !seenLeads.has(l.id)) {
        seenLeads.add(l.id);
        items.push({ reason: "followup_hoje", lead: l, task: t, priority: 4, sortKey: t.due_time ?? "23:59", owner_id: t.owner_id });
      }
    }

    // 5) Resgates hoje
    const rescTasks = data.tasks.filter((t) => ownerFilter(t.owner_id) && t.due_date === today && t.is_rescue && t.lead_id);
    for (const t of rescTasks) {
      const l = leads.find((x) => x.id === t.lead_id);
      if (l && !seenLeads.has(l.id)) {
        seenLeads.add(l.id);
        items.push({ reason: "resgate_hoje", lead: l, task: t, priority: 5, sortKey: t.due_time ?? "23:59", owner_id: t.owner_id });
      }
    }

    // 6) Leads novos sem contato
    for (const l of leads) {
      if (seenLeads.has(l.id)) continue;
      if (l.status === "novo" && !tasksByLead.has(l.id) && !l.last_contact_at) {
        seenLeads.add(l.id);
        items.push({ reason: "novo_sem_contato", lead: l, priority: 6, sortKey: l.created_at, owner_id: l.owner_id });
      }
    }

    // 7) Sem próxima ação
    for (const l of leads) {
      if (seenLeads.has(l.id)) continue;
      const contactedToday = l.last_contact_at?.slice(0, 10) === today;
      if (!tasksByLead.has(l.id) && !contactedToday) {
        seenLeads.add(l.id);
        items.push({ reason: "sem_proxima_acao", lead: l, priority: 7, sortKey: l.last_contact_at ?? l.created_at, owner_id: l.owner_id });
      }
    }

    items.sort((a, b) => a.priority - b.priority || a.sortKey.localeCompare(b.sortKey));
    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, vendor, isAdmin, user?.id]);

  const vendorOptions = useMemo(() => {
    const ids = new Set((data?.leads ?? []).map((l) => l.owner_id));
    return Array.from(ids).map((id) => ({ id, name: byProfile.get(id)?.full_name || byProfile.get(id)?.email || "Vendedor" }));
  }, [data, byProfile]);

  const filterFn = FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
  const filtered = queue.filter(filterFn);

  const grouped = useMemo(() => {
    const g = new Map<Reason, QueueItem[]>();
    for (const it of filtered) {
      const a = g.get(it.reason) ?? [];
      a.push(it);
      g.set(it.reason, a);
    }
    return g;
  }, [filtered]);

  const counts: Record<string, number> = {};
  for (const f of FILTERS) counts[f.key] = queue.filter(f.match).length;

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  const next = queue[0];

  const orderedReasons: Reason[] = ["atrasada", "entrevista_hoje", "retorno_pendente", "followup_hoje", "resgate_hoje", "novo_sem_contato", "sem_proxima_acao"];

  const openItem = (item: QueueItem) => {
    if (item.reason === "retorno_pendente" && item.prospect) {
      navigate({ to: "/discador", search: { prospect_contact_id: item.prospect.id, open_result: 1 } });
      return;
    }
    setWorking(item);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" />Hoje</h1>
          <p className="text-sm text-muted-foreground">{queue.length} ação(ões) priorizadas — comece pelo topo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Select value={vendor} onValueChange={setVendor}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Minhas ações</SelectItem>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {vendorOptions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Próxima melhor ação */}
      <NextBestAction item={next} onWork={() => next && openItem(next)} onDetails={(id) => setDetailsId(id)} />

      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
            className="h-8"
          >
            {f.label}
            <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{counts[f.key] ?? 0}</Badge>
          </Button>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="p-10 text-center">
          <div className="text-lg font-semibold">Nenhuma ação para este filtro 🎉</div>
          <div className="text-sm text-muted-foreground mt-1">
            {queue.length === 0
              ? "Sem ações pendentes. Vá para o Discador para prospectar novos contatos."
              : "Troque o filtro acima para ver outras ações."}
          </div>
          {queue.length === 0 && (
            <Button className="mt-4" onClick={() => navigate({ to: "/discador" })}>
              <PhoneCall className="h-4 w-4 mr-2" />Ir para o Discador
            </Button>
          )}
        </Card>
      )}

      <div className="space-y-5">
        {orderedReasons.map((reason) => {
          const items = grouped.get(reason);
          if (!items || items.length === 0) return null;
          const meta = REASON_META[reason];
          const Icon = meta.icon;
          return (
            <section key={reason} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={meta.color}><Icon className="h-3 w-3 mr-1" />{meta.label}</Badge>
                <span className="text-xs text-muted-foreground">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.slice(0, 50).map((it, i) => (
                  <Row key={`${reason}-${i}`} item={it} isAdmin={isAdmin} owner={byProfile.get(it.owner_id)} onClick={() => openItem(it)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {working && working.lead && (
        <WorkLeadDialog
          item={working as Required<Pick<QueueItem, "lead">> & QueueItem}
          queue={filtered}
          onClose={() => setWorking(null)}
          onAdvance={async () => {
            const idx = filtered.findIndex((q) => q.lead?.id === working.lead?.id);
            const nxt = filtered[idx + 1];
            await qc.invalidateQueries({ queryKey: ["hoje"] });
            await qc.refetchQueries({ queryKey: ["hoje"] });
            if (nxt) setWorking(nxt); else setWorking(null);
          }}
          onOpenDetails={(id) => { setWorking(null); setDetailsId(id); }}
        />
      )}
      <LeadDetailsDialog leadId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

function NextBestAction({ item, onWork, onDetails }: { item: QueueItem | undefined; onWork: () => void; onDetails: (id: string) => void }) {
  if (!item) {
    return (
      <Card className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Sparkles className="h-4 w-4 text-primary" /> Próxima melhor ação
        </div>
        <div className="text-base font-semibold">Nenhuma ação pendente para agora 🎉</div>
        <div className="text-sm text-muted-foreground mt-1">Você pode ir para o Discador e prospectar novos contatos.</div>
      </Card>
    );
  }

  const meta = REASON_META[item.reason];
  const Icon = meta.icon;
  const name = item.lead?.name ?? item.prospect?.nome ?? "Contato";
  const phone = item.lead?.phone ?? item.prospect?.telefone_original ?? (item.prospect?.telefone_normalizado ? `+${item.prospect.telefone_normalizado}` : null);
  const company = item.lead?.company ?? item.prospect?.empresa ?? null;
  const statusLabel = item.lead ? labelFor(LEAD_STATUSES, item.lead.status) : "Prospecção";
  const horario = item.task?.due_time?.slice(0, 5)
    ?? (item.reason === "entrevista_hoje" ? item.lead?.interview_time?.slice(0, 5) : null);

  return (
    <Card className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Sparkles className="h-4 w-4 text-primary" /> Próxima melhor ação
      </div>
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold">{name}</div>
          <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {company && <span>{company}</span>}
            {phone && <span className="font-mono">{phone}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="outline" className={meta.color}><Icon className="h-3 w-3 mr-1" />Motivo: {meta.label}</Badge>
            {horario && <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />{horario}</Badge>}
            {item.lead && <Badge variant="outline" className={statusColor(item.lead.status)}>{statusLabel}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={onWork}><Zap className="h-4 w-4 mr-2" />Trabalhar agora</Button>
          {phone && (
            <Button asChild size="lg" variant="outline">
              <a href={waLink(phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a>
            </Button>
          )}
          {item.lead && (
            <Button size="lg" variant="ghost" onClick={() => onDetails(item.lead!.id)}><Eye className="h-4 w-4 mr-1" />Ver lead</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Row({ item, isAdmin, owner, onClick }: { item: QueueItem; isAdmin: boolean; owner?: Profile; onClick: () => void }) {
  const name = item.lead?.name ?? item.prospect?.nome ?? "Contato";
  const company = item.lead?.company ?? item.prospect?.empresa ?? null;
  const phone = item.lead?.phone ?? item.prospect?.telefone_original ?? (item.prospect?.telefone_normalizado ? `+${item.prospect.telefone_normalizado}` : null);
  const statusLabel = item.lead ? labelFor(LEAD_STATUSES, item.lead.status) : "Prospecção";

  return (
    <Card className="p-3 flex flex-wrap items-center gap-3 hover:bg-accent/30 transition-colors cursor-pointer" onClick={onClick}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{name}</span>
          {item.lead && <Badge variant="outline" className={statusColor(item.lead.status)}>{statusLabel}</Badge>}
          {!item.lead && <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/30">Prospecção</Badge>}
          {item.task && <Badge variant="secondary">{item.task.due_date}{item.task.due_time ? ` ${item.task.due_time.slice(0, 5)}` : ""}</Badge>}
          {item.lead?.interview_date && item.reason === "entrevista_hoje" && (
            <Badge className="bg-violet-500/15 text-violet-700 border-violet-500/30">
              {item.lead.interview_time ? item.lead.interview_time.slice(0, 5) : "Entrevista hoje"}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
          {company && <span>{company}</span>}
          {phone && <span className="font-mono">{phone}</span>}
          {isAdmin && owner && <span className="flex items-center gap-1"><User className="h-3 w-3" />{owner.full_name || owner.email}</span>}
        </div>
      </div>
      <Button size="sm" variant="ghost"><ChevronRight className="h-4 w-4" /></Button>
    </Card>
  );
}

function WorkLeadDialog({
  item, queue, onClose, onAdvance, onOpenDetails,
}: {
  item: QueueItem & { lead: Lead }; queue: QueueItem[]; onClose: () => void; onAdvance: () => void; onOpenDetails: (id: string) => void;
}) {
  const { lead, task, reason } = item;
  const meta = REASON_META[reason];
  const ReasonIcon = meta.icon;
  const initialPreset = pickPresetKey(task?.type, lead.status, task?.is_rescue);
  const [presetKey, setPresetKey] = useState(initialPreset);
  const [completing, setCompleting] = useState(false);

  const message = buildMessage(presetKey, lead);
  const position = queue.findIndex((q) => q.lead?.id === lead.id) + 1;

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2">
                <Badge variant="outline" className={meta.color}><ReasonIcon className="h-3 w-3 mr-1" />{meta.label}</Badge>
                <span>{lead.name}</span>
              </DialogTitle>
              <span className="text-xs text-muted-foreground">{position} / {queue.length}</span>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusColor(lead.status)}>{labelFor(LEAD_STATUSES, lead.status)}</Badge>
              {lead.company && <span className="text-sm text-muted-foreground">{lead.company}</span>}
              {lead.phone && <span className="text-sm font-mono">{lead.phone}</span>}
            </div>

            {task && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="font-medium">Próxima tarefa</div>
                <div className="text-muted-foreground">
                  {task.type} · {new Date(task.due_date + "T00:00:00").toLocaleDateString("pt-BR")}{task.due_time ? ` às ${task.due_time.slice(0, 5)}` : ""}
                </div>
                {task.observation && <div className="text-xs italic mt-1">{task.observation}</div>}
              </div>
            )}

            {reason === "entrevista_hoje" && (
              <div className="rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-sm">
                <div className="font-medium text-violet-700">Entrevista hoje</div>
                <div className="text-muted-foreground">
                  {lead.interview_date && new Date(lead.interview_date + "T00:00:00").toLocaleDateString("pt-BR")}
                  {lead.interview_time ? ` às ${lead.interview_time.slice(0, 5)}` : ""}
                </div>
              </div>
            )}

            {reason === "resgate_hoje" && lead.lost_reason && (
              <div className="rounded-md border bg-amber-500/5 px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Motivo da perda anterior</div>
                <div>{labelFor(LOST_REASONS, lead.lost_reason)}</div>
              </div>
            )}

            {lead.observation && (
              <div className="rounded-md border px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground mb-1">Observação</div>
                <div className="italic">{lead.observation}</div>
              </div>
            )}

            <div>
              <Label className="text-xs">Mensagem pronta</Label>
              <div className="flex gap-2 mt-1">
                <Select value={presetKey} onValueChange={setPresetKey}>
                  <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{MESSAGE_LIBRARY.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" onClick={() => copyToClipboard(message, "Mensagem copiada")}>
                  <Copy className="h-4 w-4 mr-1" />Copiar mensagem
                </Button>
              </div>
              <pre className="mt-2 text-xs whitespace-pre-wrap rounded bg-muted/40 p-2 max-h-32 overflow-auto">{message}</pre>
            </div>

            <div className="flex flex-wrap gap-2">
              {lead.phone && (
                <Button asChild variant="outline"><a href={waLink(lead.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a></Button>
              )}
              {lead.phone && (
                <Button variant="outline" onClick={() => copyToClipboard(rawPhoneDigits(lead.phone), "Telefone copiado")}><Phone className="h-4 w-4 mr-1" />Telefone</Button>
              )}
              <Button variant="outline" onClick={() => copyToClipboard(lead.name, "Nome copiado")}><Copy className="h-4 w-4 mr-1" />Nome</Button>
              <Button variant="outline" onClick={() => copyToClipboard(leadSummary(lead), "Resumo copiado")}><FileText className="h-4 w-4 mr-1" />Resumo</Button>
              <Button variant="ghost" onClick={() => onOpenDetails(lead.id)}><Eye className="h-4 w-4 mr-1" />Detalhes</Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={onAdvance}>Pular <ChevronRight className="h-4 w-4 ml-1" /></Button>
            <Button onClick={() => setCompleting(true)}><Check className="h-4 w-4 mr-1" />Concluir tarefa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {completing && (
        <QuickCompleteDialog
          lead={lead}
          task={task}
          onClose={() => setCompleting(false)}
          onDone={() => { setCompleting(false); onAdvance(); }}
        />
      )}
    </>
  );
}

type NextAction = "auto" | "none" | "entrevista" | "matricula" | "perdido" | "reagendar";

function QuickCompleteDialog({
  lead, task, onClose, onDone,
}: {
  lead: Lead; task?: Task; onClose: () => void; onDone: () => void;
}) {
  const [action, setAction] = useState<NextAction>("auto");
  const [reagDate, setReagDate] = useState("");
  const [intDate, setIntDate] = useState(new Date().toISOString().slice(0, 10));
  const [intTime, setIntTime] = useState("");
  const [intObs, setIntObs] = useState("");
  const [valMat, setValMat] = useState("");
  const [valMen, setValMen] = useState("");
  const [valMad, setValMad] = useState("");
  const [lostReason, setLostReason] = useState<string>("sem_resposta");
  const [saving, setSaving] = useState(false);

  const autoFollowupDays = (type?: string) => {
    switch (type) {
      case "primeiro_contato": return 1;
      case "confirmar_entrevista": return null;
      case "followup_pos": return 3;
      case "resgate": return 7;
      default: return 3;
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (action === "reagendar") {
        if (!task) { toast.error("Não há tarefa para reagendar."); return; }
        if (!reagDate) { toast.error("Escolha a nova data."); return; }
        const { error } = await supabase.from("tasks").update({ due_date: reagDate }).eq("id", task.id);
        if (error) throw error;
        await logLeadEvent({ leadId: lead.id, type: "task_rescheduled", description: `Tarefa reagendada para ${reagDate}` });
        toast.success("Tarefa reagendada");
        onDone();
        return;
      }

      if (task) {
        const { error } = await supabase.from("tasks").update({ status: "concluida" as any }).eq("id", task.id);
        if (error) throw error;
        await logLeadEvent({ leadId: lead.id, type: "task_done", description: `Tarefa "${task.type}" concluída` });
      }
      await supabase.from("leads").update({ last_contact_at: new Date().toISOString() } as any).eq("id", lead.id);

      if (action === "none") { /* nada */ }
      else if (action === "auto") {
        const days = autoFollowupDays(task?.type);
        if (days !== null) {
          const d = new Date(); d.setDate(d.getDate() + days);
          await supabase.from("tasks").insert({
            lead_id: lead.id, owner_id: lead.owner_id, type: "enviar_mensagem" as any,
            due_date: d.toISOString().slice(0, 10), status: "pendente" as any, observation: "Follow-up automático",
          });
          await logLeadEvent({ leadId: lead.id, type: "task_created", description: `Follow-up automático em ${days} dia(s)` });
        }
      } else if (action === "entrevista") {
        if (!intDate) { toast.error("Escolha a data da entrevista."); return; }
        await supabase.from("leads").update({
          status: "entrevista_marcada" as any,
          interview_date: intDate,
          interview_time: intTime || null,
          interview_notes: intObs || null,
        }).eq("id", lead.id);
        const conf = new Date(intDate + "T00:00:00"); conf.setDate(conf.getDate() - 1);
        await supabase.from("tasks").insert({
          lead_id: lead.id, owner_id: lead.owner_id, type: "confirmar_entrevista" as any,
          due_date: conf.toISOString().slice(0, 10), status: "pendente" as any, observation: "Confirmar entrevista",
        });
        await logLeadEvent({ leadId: lead.id, type: "interview_scheduled", description: `Entrevista marcada para ${intDate}${intTime ? " às " + intTime : ""}` });
      } else if (action === "matricula") {
        await supabase.from("leads").update({
          status: "matricula" as any,
          enrollment_value: valMat ? Number(valMat) : null,
          monthly_fee: valMen ? Number(valMen) : null,
          material_value: valMad ? Number(valMad) : null,
        } as any).eq("id", lead.id);
        await supabase.from("tasks").update({ status: "concluida" as any })
          .eq("lead_id", lead.id).eq("status", "pendente");
        await logLeadEvent({ leadId: lead.id, type: "enrolled", description: `Matrícula registrada via Hoje` });
      } else if (action === "perdido") {
        await supabase.from("leads").update({
          status: "perdido" as any,
          lost_reason: lostReason as any,
          lost_type: "definitivo" as any,
        }).eq("id", lead.id);
        await logLeadEvent({ leadId: lead.id, type: "lost", description: `Motivo: ${lostReason}` });
      }

      toast.success("Tarefa concluída");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Concluir — {lead.name}</DialogTitle></DialogHeader>

        <RadioGroup value={action} onValueChange={(v) => setAction(v as NextAction)} className="space-y-2">
          <Opt id="a-auto" value="auto" label="Concluir e criar próximo follow-up automaticamente" recommended />
          <Opt id="a-none" value="none" label="Concluir sem próxima tarefa" />
          <Opt id="a-int" value="entrevista" label="Concluir e marcar entrevista" />
          <Opt id="a-mat" value="matricula" label="Concluir e marcar matrícula" />
          <Opt id="a-perd" value="perdido" label="Concluir e marcar como perdido" />
          {task && <Opt id="a-reag" value="reagendar" label="Reagendar tarefa" />}
        </RadioGroup>

        {action === "entrevista" && (
          <div className="space-y-2 border-t pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Data *</Label><Input type="date" value={intDate} onChange={(e) => setIntDate(e.target.value)} /></div>
              <div><Label>Horário</Label><Input type="time" value={intTime} onChange={(e) => setIntTime(e.target.value)} /></div>
            </div>
            <div><Label>Observação</Label><Textarea rows={2} value={intObs} onChange={(e) => setIntObs(e.target.value)} /></div>
          </div>
        )}

        {action === "matricula" && (
          <div className="grid grid-cols-3 gap-2 border-t pt-3">
            <div><Label>Matrícula</Label><Input type="number" step="0.01" value={valMat} onChange={(e) => setValMat(e.target.value)} /></div>
            <div><Label>Mensalidade</Label><Input type="number" step="0.01" value={valMen} onChange={(e) => setValMen(e.target.value)} /></div>
            <div><Label>Material</Label><Input type="number" step="0.01" value={valMad} onChange={(e) => setValMad(e.target.value)} /></div>
          </div>
        )}

        {action === "perdido" && (
          <div className="border-t pt-3">
            <Label>Motivo *</Label>
            <Select value={lostReason} onValueChange={setLostReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {action === "reagendar" && (
          <div className="border-t pt-3">
            <Label>Nova data *</Label>
            <Input type="date" value={reagDate} onChange={(e) => setReagDate(e.target.value)} />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Opt({ id, value, label, recommended }: { id: string; value: string; label: string; recommended?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="flex-1">
        {label}
        {recommended && <Badge variant="secondary" className="ml-2 text-[10px]">Recomendado</Badge>}
      </Label>
    </div>
  );
}
