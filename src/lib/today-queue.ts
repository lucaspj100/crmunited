import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type Lead = {
  id: string; name: string; phone: string | null; company: string | null;
  status: string; owner_id: string; observation: string | null;
  interview_date: string | null; interview_time: string | null;
  last_contact_at: string | null; next_followup_at: string | null;
  lost_reason: string | null; in_rescue: boolean;
  created_at: string;
};
export type Task = {
  id: string; lead_id: string | null; type: string; due_date: string; due_time: string | null;
  observation: string | null; status: string; owner_id: string; is_rescue: boolean;
  prospect_contact_id: string | null;
};
export type Profile = { id: string; full_name: string | null; email: string | null };
export type ProspectMini = {
  id: string; nome: string | null; empresa: string | null; cargo: string | null;
  telefone_normalizado: string; telefone_original: string | null; observacao: string | null;
  vendedor_responsavel_id: string | null;
};

export type Reason =
  | "atrasada"
  | "atualizar_resultado"
  | "retorno_pendente"
  | "followup_hoje"
  | "resgate_hoje"
  | "novo_sem_contato"
  | "sem_proxima_acao";

export type QueueItem = {
  key: string;
  reason: Reason;
  priority: number;
  sortKey: string;
  lead?: Lead;
  task?: Task;
  prospect?: ProspectMini;
  owner_id: string;
};

export type HojeData = {
  leads: Lead[];
  tasks: Task[];
  profiles: Profile[];
  prospects: ProspectMini[];
};

/** Data local no formato YYYY-MM-DD (evita bug de timezone do toISOString em UTC). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fonte única de dados da página Hoje (mesma queryKey usada pelo badge do menu). */
export function useHojeData() {
  return useQuery({
    queryKey: ["hoje"],
    queryFn: async (): Promise<HojeData> => {
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
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Regra única de montagem da fila "Hoje".
 * `vendor`: "me" | "all" | <userId> (apenas admin/franqueado pode usar "all"/<userId>).
 */
export function buildTodayQueue(
  data: HojeData | undefined,
  opts: { userId: string | undefined; isAdmin: boolean; vendor: string },
): QueueItem[] {
  if (!data) return [];
  const { userId, isAdmin, vendor } = opts;
  const today = localToday();

  const ownerFilter = (ownerId: string | null | undefined) => {
    if (!ownerId) return false;
    if (!isAdmin) return ownerId === userId;
    if (vendor === "all") return true;
    if (vendor === "me") return ownerId === userId;
    return ownerId === vendor;
  };

  const byProspect = new Map(data.prospects.map((p) => [p.id, p]));

  const allLeads = data.leads.filter((l) => ownerFilter(l.owner_id) && l.status !== "perdido" && l.status !== "matricula");
  const leadById = new Map(allLeads.map((l) => [l.id, l]));
  const scheduledLeads = allLeads.filter((l) => l.status === "entrevista_marcada");
  const leads = allLeads.filter((l) => l.status !== "entrevista_marcada");

  const tasksByLead = new Map<string, Task[]>();
  for (const t of data.tasks.filter((t) => ownerFilter(t.owner_id) && t.lead_id)) {
    const a = tasksByLead.get(t.lead_id!) ?? [];
    a.push(t);
    tasksByLead.set(t.lead_id!, a);
  }
  const seenLeads = new Set<string>();
  const seenTasks = new Set<string>();
  const items: QueueItem[] = [];

  // 1) Atrasadas
  const overdue = data.tasks.filter((t) => ownerFilter(t.owner_id) && t.due_date < today && t.lead_id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  for (const t of overdue) {
    const l = leadById.get(t.lead_id!);
    if (l && !seenLeads.has(l.id)) {
      seenLeads.add(l.id);
      seenTasks.add(t.id);
      items.push({ key: `task:${t.id}`, reason: "atrasada", lead: l, task: t, priority: 1, sortKey: t.due_date, owner_id: t.owner_id });
    }
  }

  // 2) Atualizar resultado de entrevista
  const nowHm = new Date().toTimeString().slice(0, 5);
  for (const l of scheduledLeads) {
    if (!l.interview_date) continue;
    const passed =
      l.interview_date < today ||
      (l.interview_date === today && (l.interview_time?.slice(0, 5) ?? "23:59") <= nowHm);
    if (!passed) continue;
    if (seenLeads.has(l.id)) continue;
    const pendingTasks = tasksByLead.get(l.id);
    if (pendingTasks && pendingTasks.length > 0) continue;
    seenLeads.add(l.id);
    items.push({
      key: `interview:${l.id}`,
      reason: "atualizar_resultado",
      lead: l,
      priority: 2,
      sortKey: `${l.interview_date} ${l.interview_time ?? "00:00"}`,
      owner_id: l.owner_id,
    });
  }

  // 3) Retornos pendentes (prospect_contacts)
  const retornos = data.tasks.filter(
    (t) => ownerFilter(t.owner_id) && t.type === "retorno_ligacao" && t.prospect_contact_id && t.due_date <= today,
  ).sort((a, b) => `${a.due_date} ${a.due_time ?? "00:00"}`.localeCompare(`${b.due_date} ${b.due_time ?? "00:00"}`));
  const seenProspects = new Set<string>();
  for (const t of retornos) {
    const p = byProspect.get(t.prospect_contact_id!);
    if (!p) continue;
    if (seenTasks.has(t.id)) continue;
    // dedup: apenas o retorno mais antigo/atual por contato
    if (seenProspects.has(p.id)) continue;
    seenProspects.add(p.id);
    seenTasks.add(t.id);
    items.push({ key: `task:${t.id}`, reason: "retorno_pendente", task: t, prospect: p, priority: 3, sortKey: `${t.due_date} ${t.due_time ?? "00:00"}`, owner_id: t.owner_id });
  }

  // 4) Follow-ups hoje (não-resgate)
  const todayTasks = data.tasks.filter((t) => ownerFilter(t.owner_id) && t.due_date === today && !t.is_rescue && t.lead_id && t.type !== "retorno_ligacao")
    .sort((a, b) => (a.due_time ?? "").localeCompare(b.due_time ?? ""));
  for (const t of todayTasks) {
    const l = leadById.get(t.lead_id!);
    if (l && !seenLeads.has(l.id)) {
      seenLeads.add(l.id);
      seenTasks.add(t.id);
      items.push({ key: `task:${t.id}`, reason: "followup_hoje", lead: l, task: t, priority: 4, sortKey: t.due_time ?? "23:59", owner_id: t.owner_id });
    }
  }

  // 5) Resgates hoje
  const rescTasks = data.tasks.filter((t) => ownerFilter(t.owner_id) && t.due_date === today && t.is_rescue && t.lead_id);
  for (const t of rescTasks) {
    const l = leadById.get(t.lead_id!);
    if (l && !seenLeads.has(l.id)) {
      seenLeads.add(l.id);
      seenTasks.add(t.id);
      items.push({ key: `task:${t.id}`, reason: "resgate_hoje", lead: l, task: t, priority: 5, sortKey: t.due_time ?? "23:59", owner_id: t.owner_id });
    }
  }

  // 6) Leads novos sem contato
  for (const l of leads) {
    if (seenLeads.has(l.id)) continue;
    if (l.status === "novo" && !tasksByLead.has(l.id) && !l.last_contact_at) {
      seenLeads.add(l.id);
      items.push({ key: `lead:${l.id}`, reason: "novo_sem_contato", lead: l, priority: 6, sortKey: l.created_at, owner_id: l.owner_id });
    }
  }

  // 7) Sem próxima ação
  for (const l of leads) {
    if (seenLeads.has(l.id)) continue;
    const contactedToday = l.last_contact_at?.slice(0, 10) === today;
    if (!tasksByLead.has(l.id) && !contactedToday) {
      seenLeads.add(l.id);
      items.push({ key: `lead:${l.id}`, reason: "sem_proxima_acao", lead: l, priority: 7, sortKey: l.last_contact_at ?? l.created_at, owner_id: l.owner_id });
    }
  }

  items.sort((a, b) => a.priority - b.priority || a.sortKey.localeCompare(b.sortKey));
  return items;
}

/** Contagem oficial de ações pendentes do usuário logado (aba "Todos" da página Hoje). */
export function useTodayActionsCount() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const { data } = useHojeData();
  return useMemo(
    () => buildTodayQueue(data, { userId: user?.id, isAdmin, vendor: "me" }).length,
    [data, user?.id, isAdmin],
  );
}
