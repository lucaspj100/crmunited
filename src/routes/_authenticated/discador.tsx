import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkPanel } from "@/components/discador/WorkPanel";
import { BasePanel } from "@/components/discador/BasePanel";
import { ImportPanel } from "@/components/discador/ImportPanel";
import { DashboardPanel } from "@/components/discador/DashboardPanel";
import { ConfigPanel } from "@/components/discador/ConfigPanel";

export const Route = createFileRoute("/_authenticated/discador")({
  component: DiscadorPage,
});

function DiscadorPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const [tab, setTab] = useState("trabalhar");

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
            {isAdmin && <TabsTrigger value="base">Base</TabsTrigger>}
            <TabsTrigger value="importar">Importar</TabsTrigger>
            {isAdmin && <TabsTrigger value="painel">Painel</TabsTrigger>}
            <TabsTrigger value="config">Configurações</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="trabalhar" className="mt-4"><WorkPanel /></TabsContent>
        {isAdmin && <TabsContent value="base" className="mt-4"><BasePanel sellers={sellers} /></TabsContent>}
        <TabsContent value="importar" className="mt-4"><ImportPanel sellers={sellers} isAdmin={isAdmin} /></TabsContent>
        {isAdmin && <TabsContent value="painel" className="mt-4"><DashboardPanel sellers={sellers} /></TabsContent>}
        <TabsContent value="config" className="mt-4"><ConfigPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
