import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, ExternalLink, GraduationCap, ChevronRight } from "lucide-react";
import { PLAYBOOK_ASSISTANTS, PLAYBOOK_BLOCKS } from "@/lib/playbook";

export const Route = createFileRoute("/_authenticated/playbook")({
  head: () => ({
    meta: [
      { title: "Playbook Comercial — CRM United" },
      {
        name: "description",
        content:
          "Guia de execução comercial: método da call em seis etapas e acesso aos assistentes de treinamento externos.",
      },
      { property: "og:title", content: "Playbook Comercial — CRM United" },
      {
        property: "og:description",
        content: "Consulte o método comercial, revise cada etapa da call e acesse os assistentes de treinamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlaybookPage,
});

function PlaybookPage() {
  return (
    <div className="max-w-full space-y-5">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
          <BookOpen className="h-5 w-5 text-primary" />
          Playbook Comercial
        </h1>
        <p className="text-sm text-muted-foreground">
          Seu guia de execução comercial. Consulte o método, revise cada etapa da call e acesse os assistentes de
          treinamento.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Assistentes de Treinamento</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PLAYBOOK_ASSISTANTS.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <CardHeader className="space-y-2 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    ChatGPT
                  </Badge>
                </div>
                <CardTitle className="text-sm">{a.title}</CardTitle>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{a.category}</span>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-3">
                <p className="text-xs text-muted-foreground">{a.description}</p>
                <Button asChild size="sm" className="w-full" disabled={a.status !== "active"}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    {a.cta}
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Playbook de Call</h2>
        <Accordion type="multiple" className="space-y-2">
          {PLAYBOOK_BLOCKS.map((b) => (
            <AccordionItem key={b.id} value={b.id} className="rounded-lg border bg-card px-3">
              <AccordionTrigger className="py-3 text-left hover:no-underline">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {b.step}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{b.title}</div>
                    <div className="text-xs font-normal text-muted-foreground">{b.description}</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4 pl-9">
                {b.points && (
                  <ul className="space-y-1.5">
                    {b.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm">
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {b.groups && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {b.groups.map((g) => (
                      <div key={g.label} className="rounded-lg border bg-muted/40 p-3">
                        <div className="text-xs font-semibold">{g.label}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{g.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {b.highlights?.map((h) => (
                  <div
                    key={h}
                    className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm font-medium text-foreground"
                  >
                    {h}
                  </div>
                ))}

                {b.flow && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {b.flow.map((f, i) => (
                      <span key={f} className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[11px]">
                          {f}
                        </Badge>
                        {i < b.flow!.length - 1 && <span className="text-xs text-muted-foreground">→</span>}
                      </span>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
