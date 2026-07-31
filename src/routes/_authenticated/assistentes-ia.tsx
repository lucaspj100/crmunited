import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { ASSISTANTS, type AssistantKind } from "@/lib/ai-assistants";
import { AssistantWorkspace } from "@/components/assistentes/AssistantWorkspace";
import { HistoryPanel } from "@/components/assistentes/HistoryPanel";
import { KnowledgeAdmin } from "@/components/assistentes/KnowledgeAdmin";

export const Route = createFileRoute("/_authenticated/assistentes-ia")({
  head: () => ({
    meta: [
      { title: "Assistentes IA — CRM Comercial" },
      {
        name: "description",
        content:
          "Central de assistentes de IA do time comercial: prospecção, entrevista e negociação, com base de conhecimento oficial da escola.",
      },
      { property: "og:title", content: "Assistentes IA — CRM Comercial" },
      {
        property: "og:description",
        content: "Prospecção, entrevista e negociação com apoio de IA treinada na base comercial oficial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssistantesPage,
});

function AssistantesPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const [assistant, setAssistant] = useState<AssistantKind>("prospeccao");

  return (
    <div className="max-w-full space-y-4">
      <header>
        <h1 className="text-xl font-bold md:text-2xl">Assistentes IA</h1>
        <p className="text-sm text-muted-foreground">
          Três assistentes especializados nas etapas do processo comercial, usando apenas a base oficial da escola.
        </p>
      </header>

      <Tabs defaultValue="assistentes">
        <TabsList className="flex-wrap">
          <TabsTrigger value="assistentes">Assistentes</TabsTrigger>
          <TabsTrigger value="historico">Meu histórico</TabsTrigger>
          {isAdmin && <TabsTrigger value="gestao">Gestão da IA</TabsTrigger>}
        </TabsList>

        <TabsContent value="assistentes" className="mt-3 space-y-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {ASSISTANTS.map((a) => (
              <Button
                key={a.kind}
                size="sm"
                variant={assistant === a.kind ? "default" : "outline"}
                className="whitespace-nowrap"
                onClick={() => setAssistant(a.kind)}
              >
                {a.short}
              </Button>
            ))}
          </div>
          <AssistantWorkspace key={assistant} assistant={assistant} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="historico" className="mt-3">
          <HistoryPanel />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="gestao" className="mt-3">
            <KnowledgeAdmin />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
