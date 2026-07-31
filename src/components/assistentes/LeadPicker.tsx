import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, User, X } from "lucide-react";

export type LeadOption = { id: string; name: string; company: string | null; status: string };

export function LeadPicker({
  value,
  onChange,
}: {
  value: LeadOption | null;
  onChange: (lead: LeadOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["assistant-leads", term],
    enabled: open,
    queryFn: async () => {
      let q = supabase.from("leads").select("id, name, company, status").order("updated_at", { ascending: false }).limit(30);
      if (term.trim()) q = q.ilike("name", `%${term.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeadOption[];
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <User className="mr-2 h-4 w-4" /> Selecionar lead do CRM
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-2" align="start">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar pelo nome…" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-2 text-xs text-muted-foreground">Carregando…</p>
            ) : leads.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">Nenhum lead encontrado.</p>
            ) : (
              leads.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    onChange(l);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{l.name}</span>
                  <span className="text-muted-foreground">
                    {l.company ? ` · ${l.company}` : ""} · {l.status}
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Você vê apenas os leads aos quais tem acesso no CRM.
          </p>
        </PopoverContent>
      </Popover>

      {value && (
        <Badge variant="secondary" className="gap-1">
          {value.name}
          <button type="button" onClick={() => onChange(null)} title="Remover lead">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
    </div>
  );
}
