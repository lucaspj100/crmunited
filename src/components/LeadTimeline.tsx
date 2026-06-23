import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { eventMeta } from "@/lib/lead-events";

type Event = {
  id: string;
  lead_id: string;
  user_id: string | null;
  event_type: string;
  description: string | null;
  metadata: any;
  created_at: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function LeadTimeline({ leadId }: { leadId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead-events", leadId],
    queryFn: async () => {
      const [evR, profR] = await Promise.all([
        supabase.from("lead_events").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id, full_name, email").limit(2000),
      ]);
      const profs = new Map<string, string>();
      for (const p of profR.data ?? []) profs.set(p.id, (p as any).full_name || (p as any).email || "—");
      return { events: (evR.data ?? []) as Event[], profs };
    },
    enabled: !!leadId,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground py-2">Carregando histórico…</div>;
  const events = data?.events ?? [];
  if (events.length === 0) return <div className="text-sm text-muted-foreground py-2">Nenhuma atividade registrada ainda.</div>;

  return (
    <div className="space-y-2">
      {events.map((e) => {
        const m = eventMeta(e.event_type);
        const who = e.user_id ? data?.profs.get(e.user_id) ?? "—" : "Sistema";
        return (
          <div key={e.id} className="flex items-start gap-3 rounded-md border bg-card/50 p-2.5">
            <div className="text-xl leading-none">{m.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className={`text-sm font-medium ${m.color}`}>{m.label}</div>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(e.created_at)}</div>
              </div>
              {e.description && <div className="text-xs text-muted-foreground mt-0.5">{e.description}</div>}
              <div className="text-[11px] text-muted-foreground/70 mt-0.5">por {who}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
