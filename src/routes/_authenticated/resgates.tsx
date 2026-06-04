import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LOST_REASONS, labelFor, waLink } from "@/lib/constants";
import { RotateCw, MessageCircle, Linkedin, Check, Calendar, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/resgates")({ component: ResgatesPage });

type Task = { id: string; lead_id: string; due_date: string; status: string; rescue_reason: string | null; observation: string | null; owner_id: string };
type Lead = { id: string; name: string; phone: string | null; company: string | null; linkedin_url: string | null };

async function fetchResgates() {
  const [tasksR, leadsR] = await Promise.all([
    supabase.from("tasks").select("*").eq("is_rescue", true).eq("status", "pendente").order("due_date").limit(2000),
    supabase.from("leads").select("id,name,phone,company,linkedin_url").limit(2000),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
  const monthEnd = new Date(); monthEnd.setDate(monthEnd.getDate() + 30);
  const byLead = new Map((leadsR.data ?? []).map((l: any) => [l.id, l as Lead]));
  const tasks = (tasksR.data ?? []) as Task[];
  return {
    byLead,
    late: tasks.filter((t) => t.due_date < today),
    today: tasks.filter((t) => t.due_date === today),
    week: tasks.filter((t) => t.due_date > today && t.due_date <= weekEnd.toISOString().slice(0,10)),
    month: tasks.filter((t) => t.due_date > weekEnd.toISOString().slice(0,10) && t.due_date <= monthEnd.toISOString().slice(0,10)),
  };
}

function ResgatesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["resgates"], queryFn: fetchResgates });

  const complete = async (t: Task) => {
    await supabase.from("tasks").update({ status: "concluida" }).eq("id", t.id);
    await supabase.from("leads").update({ status: "interessado", lost_reason: null, lost_type: null, rescue_date: null }).eq("id", t.lead_id);
    toast.success("Lead resgatado — voltou para 'Interessado'");
    qc.invalidateQueries();
  };
  const reschedule = async (t: Task) => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    await supabase.from("tasks").update({ due_date: d.toISOString().slice(0,10) }).eq("id", t.id);
    toast.success("Resgate adiado em 30 dias");
    qc.invalidateQueries();
  };
  const markDefinitive = async (t: Task) => {
    await supabase.from("tasks").update({ status: "cancelada" }).eq("id", t.id);
    await supabase.from("leads").update({ lost_type: "definitivo", rescue_date: null }).eq("id", t.lead_id);
    toast.success("Marcado como perdido definitivo");
    qc.invalidateQueries();
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  const Row = ({ t, tone }: { t: Task; tone?: "danger" | "today" }) => {
    const lead = data.byLead.get(t.lead_id); if (!lead) return null;
    const bg = tone === "danger" ? "border-l-4 border-l-rose-500 bg-rose-500/5" : tone === "today" ? "border-l-4 border-l-primary bg-primary/5" : "border-l-4 border-l-muted";
    return (
      <Card className={`p-4 ${bg}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-semibold">{lead.name}</div>
            <div className="text-sm text-muted-foreground">
              {lead.company && <>{lead.company} · </>}
              {lead.phone && <>{lead.phone} · </>}
              <span>Resgate: {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
            </div>
            {t.rescue_reason && <Badge variant="outline" className="mt-1">Motivo anterior: {labelFor(LOST_REASONS, t.rescue_reason)}</Badge>}
          </div>
          <div className="flex flex-wrap gap-1">
            {lead.phone && <Button asChild size="sm" variant="outline"><a href={waLink(lead.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>}
            {lead.linkedin_url && <Button asChild size="sm" variant="outline"><a href={lead.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4" /></a></Button>}
            <Button size="sm" onClick={() => complete(t)}><Check className="h-4 w-4 mr-1" />Resgatar</Button>
            <Button size="sm" variant="ghost" onClick={() => reschedule(t)}><Calendar className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => markDefinitive(t)}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    );
  };

  const Section = ({ title, items, tone }: { title: string; items: Task[]; tone?: "danger" | "today" }) => (
    <div>
      <div className="mb-2 text-sm font-semibold text-muted-foreground">{title} <Badge variant="secondary">{items.length}</Badge></div>
      <div className="space-y-2">{items.length === 0 ? <Card className="p-4 text-sm text-muted-foreground">Nada por aqui.</Card> : items.map((t) => <Row key={t.id} t={t} tone={tone} />)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><RotateCw className="h-6 w-6 text-primary" />Resgates Futuros</h1>
        <p className="text-sm text-muted-foreground">Leads perdidos que devem ser retomados</p>
      </div>
      <Section title="Resgates atrasados" items={data.late} tone="danger" />
      <Section title="Resgates de hoje" items={data.today} tone="today" />
      <Section title="Esta semana" items={data.week} />
      <Section title="Este mês" items={data.month} />
    </div>
  );
}
