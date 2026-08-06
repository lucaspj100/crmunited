import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { ScholarshipLinksCard } from "@/components/admin/ScholarshipLinksCard";

export const Route = createFileRoute("/_authenticated/links-bolsista")({
  head: () => ({
    meta: [
      { title: "Links do Processo Bolsista — CRM United" },
      { name: "description", content: "Gerencie os links individuais de cada vendedor no processo bolsista." },
      { property: "og:title", content: "Links do Processo Bolsista — CRM United" },
      { property: "og:description", content: "Gerencie os links individuais de cada vendedor no processo bolsista." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LinksBolsistaPage,
});

function LinksBolsistaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          Links do Processo Bolsista
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada vendedor tem um link individual. Leads recebidos entram sempre na etapa “Novo”.
        </p>
      </div>

      <ScholarshipLinksCard />
    </div>
  );
}
