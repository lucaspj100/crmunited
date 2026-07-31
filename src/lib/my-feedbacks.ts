import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Somente o conteúdo compartilhável: nunca inclui observações privadas do líder nem os números internos. */
export type MySharedFeedback = {
  id: string;
  period_start: string;
  period_end: string;
  period_label: string;
  meeting_date: string | null;
  final_feedback: string;
  next_focus: string;
  agreed_action: string;
  shared_at: string | null;
  viewed_by_collaborator: boolean;
  viewed_at: string | null;
  admin_name: string | null;
};

export function monthLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", " de ");
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("pt-BR");
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export async function listMySharedFeedbacks(): Promise<MySharedFeedback[]> {
  const { data, error } = await supabase.rpc("my_shared_feedbacks");
  if (error) throw error;
  return (data ?? []) as MySharedFeedback[];
}

export async function markFeedbackViewed(id: string): Promise<void> {
  const { error } = await supabase.rpc("mark_feedback_viewed", { _id: id });
  if (error) throw error;
}

export function useMySharedFeedbacks(enabled = true) {
  return useQuery({
    queryKey: ["my-shared-feedbacks"],
    enabled,
    queryFn: listMySharedFeedbacks,
    staleTime: 60_000,
  });
}

/** Seções extraídas do texto padronizado do feedback (fallback: texto completo). */
export function splitFeedbackSections(text: string): { title: string; body: string }[] {
  const titles = ["PONTO POSITIVO", "PRINCIPAL PONTO DE MELHORIA", "FOCO PARA O PRÓXIMO MÊS", "MENSAGEM FINAL"];
  const found: { title: string; index: number }[] = [];
  for (const t of titles) {
    const i = text.indexOf(t);
    if (i >= 0) found.push({ title: t, index: i });
  }
  if (found.length === 0) return [{ title: "Feedback", body: text.trim() }];
  found.sort((a, b) => a.index - b.index);
  return found.map((f, i) => ({
    title: f.title,
    body: text.slice(f.index + f.title.length, i + 1 < found.length ? found[i + 1].index : undefined).trim(),
  }));
}

const SEEN_KEY = "crm.my-feedbacks.notified";

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Aviso interno para o colaborador quando um feedback novo é compartilhado.
 * Cada feedback avisa uma única vez por dispositivo (não duplica se o ADM salvar de novo).
 */
export function useMyFeedbackNotifications(enabled: boolean, onOpen: (id: string) => void) {
  const query = useMySharedFeedbacks(enabled);
  const queryClient = useQueryClient();
  const rows = query.data ?? [];
  const unviewed = rows.filter((r) => !r.viewed_by_collaborator);

  useEffect(() => {
    if (!enabled || unviewed.length === 0) return;
    const seen = readSeen();
    const fresh = unviewed.filter((r) => !seen.includes(r.id));
    if (fresh.length === 0) return;
    for (const row of fresh) {
      toast.info(`Você recebeu um novo feedback referente a ${monthLabel(row.period_start)}.`, {
        duration: 12_000,
        action: { label: "Abrir", onClick: () => onOpen(row.id) },
      });
    }
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((r) => r.id)].slice(-200)));
    } catch {
      /* armazenamento indisponível */
    }
    void queryClient;
  }, [enabled, unviewed, onOpen, queryClient]);

  return { unviewedCount: unviewed.length, hasAny: rows.length > 0, isLoading: query.isLoading };
}
