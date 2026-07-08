import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkPanel } from "@/components/discador/WorkPanel";
import { BasePanel } from "@/components/discador/BasePanel";
import { ImportPanel } from "@/components/discador/ImportPanel";
import { DashboardPanel } from "@/components/discador/DashboardPanel";
import { ConfigPanel } from "@/components/discador/ConfigPanel";
import { MyContactsPanel } from "@/components/discador/MyContactsPanel";
import { WhatsappListPanel } from "@/components/discador/WhatsappListPanel";

type DiscadorSearch = {
  prospect_contact_id?: string;
  open_result?: number;
  task_id?: string;
};

export const Route = createFileRoute("/_authenticated/discador")({
  validateSearch: (raw: Record<string, unknown>): DiscadorSearch => {
    const id = typeof raw.prospect_contact_id === "string" ? raw.prospect_contact_id : undefined;
    const openRaw = raw.open_result;
    const open = typeof openRaw === "number" ? openRaw : typeof openRaw === "string" ? Number(openRaw) : undefined;
    const taskId = typeof raw.task_id === "string" ? raw.task_id : undefined;
    return {
      prospect_contact_id: id,
      open_result: Number.isFinite(open) ? open : undefined,
      task_id: taskId,
    };
  },
  component: DiscadorPage,
});

function DiscadorPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState(search.prospect_contact_id ? "trabalhar" : "trabalhar");

  // Se chegou com prospect_contact_id, força a aba Trabalhar
  useEffect(() => {
    if (search.prospect_contact_id) setTab("trabalhar");
  }, [search.prospect_contact_id]);

  const clearFocus = () => {
    navigate({
      to: "/discador",
      search: { prospect_contact_id: undefined, open_result: undefined, task_id: undefined },
      replace: true,
    });
  };

  const { data: sellers = [] } = useQuery({
    enabled: isAdmin,
    queryKey: ["discador_sellers"],
    queryFn: async () => {
      const { data: ur } = await supabase.from("user_roles").select("user_id").eq("role", "vendedor");
      const ids = (ur ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as { id: string; full_name: string | null; email: string }[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []) as { id: string; full_name: string | null; email: string }[];
    },
  });

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      <header>
        <h1 className="text-xl md:text-2xl font-bold">Discador</h1>
        <p className="hidden md:block text-sm text-muted-foreground">Trabalhe listas frias e envie só os interessados para o CRM.</p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto max-w-full">
          <TabsList className="inline-flex w-max whitespace-nowrap">
            <TabsTrigger value="trabalhar">Trabalhar</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="minha-lista">Minha lista</TabsTrigger>
            {isAdmin && <TabsTrigger value="base">Base</TabsTrigger>}
            <TabsTrigger value="importar">Importar</TabsTrigger>
            {isAdmin && <TabsTrigger value="painel">Painel</TabsTrigger>}
            <TabsTrigger value="config">Configurações</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="trabalhar" className="mt-4">
          <WorkPanel
            focusContactId={search.prospect_contact_id}
            autoOpenResult={search.open_result === 1}
            focusTaskId={search.task_id}
            onFocusConsumed={clearFocus}
          />
        </TabsContent>
        <TabsContent value="whatsapp" className="mt-4"><WhatsappListPanel /></TabsContent>

        <TabsContent value="trabalhar" className="mt-4">
          <WorkPanel
            focusContactId={search.prospect_contact_id}
            autoOpenResult={search.open_result === 1}
            focusTaskId={search.task_id}
            onFocusConsumed={clearFocus}
          />
        </TabsContent>
        <TabsContent value="minha-lista" className="mt-4"><MyContactsPanel /></TabsContent>
        {isAdmin && <TabsContent value="base" className="mt-4"><BasePanel sellers={sellers} /></TabsContent>}
        <TabsContent value="importar" className="mt-4"><ImportPanel sellers={sellers} isAdmin={isAdmin} /></TabsContent>
        {isAdmin && <TabsContent value="painel" className="mt-4"><DashboardPanel sellers={sellers} /></TabsContent>}
        <TabsContent value="config" className="mt-4"><ConfigPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
