import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  fmtDate,
  fmtDateTime,
  markFeedbackViewed,
  monthLabel,
  splitFeedbackSections,
  useMySharedFeedbacks,
  type MySharedFeedback,
} from "@/lib/my-feedbacks";

export const Route = createFileRoute("/_authenticated/meus-feedbacks")({
  component: MyFeedbacksPage,
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Meus Feedbacks | CRM United" },
      {
        name: "description",
        content: "Veja os feedbacks individuais que a liderança compartilhou com você, com foco do mês e ação combinada.",
      },
      { property: "og:title", content: "Meus Feedbacks | CRM United" },
      { property: "og:description", content: "Feedbacks compartilhados pela liderança, com foco do próximo mês e ação combinada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function MyFeedbacksPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useMySharedFeedbacks();
  const rows = query.data ?? [];
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (id && rows.some((r) => r.id === id)) setOpenId(id);
  }, [id, rows]);

  const current = rows.find((r) => r.id === openId) ?? null;

  async function open(row: MySharedFeedback) {
    setOpenId(row.id);
    if (!row.viewed_by_collaborator) {
      try {
        await markFeedbackViewed(row.id);
        await queryClient.invalidateQueries({ queryKey: ["my-shared-feedbacks"] });
      } catch {
        /* leitura continua visível mesmo se a marcação falhar */
      }
    }
  }

  function close() {
    setOpenId(null);
    if (id) navigate({ to: "/meus-feedbacks", search: () => ({}), replace: true });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text.trim());
      toast.success("Feedback copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-1 md:p-2">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Meus Feedbacks</h1>
        <p className="text-sm text-muted-foreground">
          Feedbacks que a liderança compartilhou com você. Somente leitura.
        </p>
      </header>

      {query.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      )}

      {!query.isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-60" />
            <p className="text-sm">Você ainda não possui feedbacks compartilhados.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const sections = splitFeedbackSections(row.final_feedback);
          const positive = sections.find((s) => s.title.startsWith("PONTO POSITIVO"))?.body ?? "";
          const improve = sections.find((s) => s.title.startsWith("PRINCIPAL"))?.body ?? "";
          return (
            <Card key={row.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold capitalize">{monthLabel(row.period_start)}</span>
                  {!row.viewed_by_collaborator && <Badge className="bg-rose-500 text-white hover:bg-rose-500">Novo</Badge>}
                  <span className="text-xs text-muted-foreground">
                    Reunião: {fmtDate(row.meeting_date)} · Compartilhado em {fmtDateTime(row.shared_at)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Liderança: {row.admin_name || "—"}
                </div>
                {positive && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ponto positivo</div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm">{positive}</p>
                  </div>
                )}
                {improve && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Principal ponto de melhoria</div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm">{improve}</p>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-[11px] uppercase text-muted-foreground">Foco do próximo mês</div>
                    <div className="text-sm">{row.next_focus || "—"}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-[11px] uppercase text-muted-foreground">Ação combinada</div>
                    <div className="text-sm">{row.agreed_action || "—"}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void open(row)}>Abrir feedback completo</Button>
                  <Button size="sm" variant="outline" onClick={() => void copy(row.final_feedback)}>
                    <Copy className="mr-2 h-4 w-4" /> Copiar
                  </Button>
                  {row.viewed_by_collaborator && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <Check className="h-3.5 w-3.5" /> Lido em {fmtDateTime(row.viewed_at)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!current} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {current ? monthLabel(current.period_start) : "Feedback"}
            </DialogTitle>
          </DialogHeader>
          {current && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Liderança: {current.admin_name || "—"} · Reunião: {fmtDate(current.meeting_date)} · Compartilhado em{" "}
                {fmtDateTime(current.shared_at)}
              </div>
              <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm">{current.final_feedback}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <div className="text-[11px] uppercase text-muted-foreground">Foco do próximo mês</div>
                  <div className="text-sm">{current.next_focus || "—"}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[11px] uppercase text-muted-foreground">Ação combinada</div>
                  <div className="text-sm">{current.agreed_action || "—"}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void copy(current.final_feedback)}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar feedback
                </Button>
                {query.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {current.viewed_by_collaborator && (
                  <span className="text-xs text-emerald-600">Marcado como lido em {fmtDateTime(current.viewed_at)}</span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
