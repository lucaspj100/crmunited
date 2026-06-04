import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STATUSES, labelFor, statusColor, waLink, LOST_REASONS } from "@/lib/constants";
import { NewLeadDialog } from "@/components/NewLeadDialog";
import { MessageCircle, Linkedin, Users, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leads")({ component: LeadsPage });

type Lead = {
  id: string; name: string; phone: string | null; company: string | null; linkedin_url: string | null;
  observation: string | null; status: string; owner_id: string; created_at: string;
  lost_reason: string | null;
};

function LeadsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data as Lead[];
    },
  });

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return [l.name, l.phone, l.company].some((v) => v?.toLowerCase().includes(s));
    });
  }, [leads, q, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6 text-primary" />Leads</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {leads.length} leads</p>
        </div>
        <NewLeadDialog />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome, empresa, telefone…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Nenhum lead encontrado. <NewLeadDialog trigger={<Button variant="link">Cadastre o primeiro</Button>} />
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{l.name}</h3>
                    <Badge variant="outline" className={statusColor(l.status)}>{labelFor(LEAD_STATUSES, l.status)}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    {l.company && <span>{l.company}</span>}
                    {l.phone && <span>{l.phone}</span>}
                    <span className="text-xs">Cadastro: {new Date(l.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                  {l.observation && <p className="mt-2 text-sm">{l.observation}</p>}
                  {l.status === "perdido" && l.lost_reason && (
                    <p className="mt-1 text-xs text-rose-600">Motivo: {labelFor(LOST_REASONS, l.lost_reason)}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {l.phone && (
                    <Button asChild size="sm" variant="outline">
                      <a href={waLink(l.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a>
                    </Button>
                  )}
                  {l.linkedin_url && (
                    <Button asChild size="sm" variant="outline">
                      <a href={l.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4 mr-1" />LinkedIn</a>
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
