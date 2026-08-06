import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarCheck, CalendarX, GraduationCap, Heart } from "lucide-react";
import { logLeadEvent } from "@/lib/lead-events";
import {
  CONFIRMATION_LABELS,
  CONFIRMATION_STATUS,
  QUALIFICATION_FIELDS,
  awaitingConfirmation,
  classificationMeta,
  formStatusLabel,
  formatRequestedInterview,
  hasFormScheduling,
  isScholarshipLead,
} from "@/lib/scholarship";
import { notifyArena } from "@/lib/arena-dispatch";

export type ScholarshipLead = Record<string, unknown> & {
  id: string;
  status: string;
  owner_id: string;
};

function val(lead: ScholarshipLead, key: string): string | null {
  const v = lead[key];
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

/** Etiqueta compacta do processo bolsista para o card do funil. */
export function ScholarshipCardBadges({ lead }: { lead: ScholarshipLead }) {
  if (!isScholarshipLead(lead as never)) return null;
  const cls = classificationMeta(lead["scholarship_classification"] as string | null);
  const waiting = awaitingConfirmation(lead as never);
  const scheduled = hasFormScheduling(lead as never);
  const confirmation = lead["confirmation_status"] as string | null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[9px] font-medium text-sky-700 dark:text-sky-300">
        Processo bolsista
      </span>
      {cls && (
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0 text-[9px] font-medium">
          {cls.emoji} {cls.label}
        </span>
      )}
      {lead["high_priority"] === true && (
        <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/10 px-1.5 py-0 text-[9px] font-medium text-rose-700 dark:text-rose-300">
          Alta prioridade
        </span>
      )}
      {formStatusLabel(lead["form_status"] as string | null) && (
        <span className="text-[9px] text-muted-foreground">
          {formStatusLabel(lead["form_status"] as string | null)}
        </span>
      )}
      {scheduled && (
        <span
          className={`w-full inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
            waiting
              ? "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200 font-semibold"
              : "border-border bg-muted text-muted-foreground"
          }`}
        >
          <CalendarCheck className="h-3 w-3 shrink-0" />
          {formatRequestedInterview(lead["requested_interview_at"] as string | null)}
          {" · "}
          {CONFIRMATION_LABELS[confirmation ?? ""] ?? "Aguardando confirmação"}
        </span>
      )}
    </div>
  );
}

/** Seção completa de qualificação + ações do vendedor no modal de detalhes. */
export function ScholarshipSection({
  lead,
  onChanged,
}: {
  lead: ScholarshipLead;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!isScholarshipLead(lead as never)) return null;

  const cls = classificationMeta(lead["scholarship_classification"] as string | null);
  const scheduled = hasFormScheduling(lead as never);
  const requestedIso = lead["requested_interview_at"] as string | null;
  const confirmation = lead["confirmation_status"] as string | null;
  const answers = (lead["form_answers"] ?? {}) as Record<string, unknown>;

  const closeConfirmTask = async () => {
    await supabase
      .from("tasks")
      .update({ status: "concluida" })
      .eq("lead_id", lead.id)
      .eq("type", "confirmar_entrevista")
      .eq("status", "pendente");
  };

  const onConfirmInterview = async () => {
    if (!requestedIso) return;
    if (!window.confirm("Confirmar a entrevista e mover o lead para “Entrevista marcada”?")) return;
    setBusy(true);
    const d = new Date(requestedIso);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("leads")
      .update({
        status: "entrevista_marcada",
        interview_date: d.toISOString().slice(0, 10),
        interview_time: d.toISOString().slice(11, 16),
        confirmation_status: CONFIRMATION_STATUS.confirmed,
        confirmed_by: u.user?.id ?? null,
        confirmed_at: new Date().toISOString(),
        last_confirmation_attempt_at: new Date().toISOString(),
        form_status: "confirmado_pelo_vendedor",
      })
      .eq("id", lead.id);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    await closeConfirmTask();
    await logLeadEvent({
      leadId: lead.id,
      type: "interview_confirmed",
      description: "Entrevista do processo bolsista confirmada pelo vendedor",
      metadata: { requested_interview_at: requestedIso },
    });
    await logLeadEvent({
      leadId: lead.id,
      type: "status_change",
      description: "novo → entrevista_marcada (confirmação manual)",
      metadata: { from: lead.status, to: "entrevista_marcada", origin: "processo_bolsista" },
    });
    await notifyArena(lead.id, "crm_interview_scheduled");
    setBusy(false);
    toast.success("Entrevista confirmada e lead movido para Entrevista marcada");
    qc.invalidateQueries();
    onChanged?.();
  };

  const onNotConfirmed = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("leads")
      .update({
        confirmation_status: CONFIRMATION_STATUS.notConfirmed,
        last_confirmation_attempt_at: new Date().toISOString(),
        form_status: "nao_confirmou",
      })
      .eq("id", lead.id);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    await closeConfirmTask();
    await logLeadEvent({
      leadId: lead.id,
      type: "note",
      description: "Candidato não confirmou a entrevista do formulário",
      metadata: { requested_interview_at: requestedIso },
    });
    setBusy(false);
    toast.success("Registrado como não confirmado. O lead permanece em Novo.");
    qc.invalidateQueries();
    onChanged?.();
  };

  const onConfirmInterest = async () => {
    setBusy(true);
    const { error } = await supabase.from("leads").update({ status: "interessado" }).eq("id", lead.id);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    await logLeadEvent({
      leadId: lead.id,
      type: "status_change",
      description: "novo → interessado (confirmação manual de interesse)",
      metadata: { from: lead.status, to: "interessado", origin: "processo_bolsista" },
    });
    setBusy(false);
    toast.success("Lead movido para Interessado");
    qc.invalidateQueries();
    onChanged?.();
  };

  return (
    <div className="rounded-md border p-3 space-y-3 bg-sky-500/5 border-sky-500/30">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5 text-sky-600" />
          Qualificação do processo bolsista
        </div>
        {cls && <Badge variant="secondary">{cls.emoji} {cls.label}</Badge>}
        {lead["high_priority"] === true && <Badge variant="destructive">Alta prioridade</Badge>}
        {formStatusLabel(lead["form_status"] as string | null) && (
          <Badge variant="outline">{formStatusLabel(lead["form_status"] as string | null)}</Badge>
        )}
      </div>

      {scheduled && (
        <div
          className={`rounded-md border p-2 text-sm ${
            confirmation === CONFIRMATION_STATUS.waiting
              ? "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100"
              : "bg-muted/40"
          }`}
        >
          <div className="font-medium">
            Agendamento realizado pelo formulário — {(CONFIRMATION_LABELS[confirmation ?? ""] ?? "aguardando confirmação").toLowerCase()}.
          </div>
          <div className="text-xs mt-0.5">Horário escolhido: {formatRequestedInterview(requestedIso)}</div>
        </div>
      )}

      <div className="space-y-2">
        {QUALIFICATION_GROUPS.map((g) => (
          <div key={g.title} className="rounded-md border bg-background/60 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {g.title}
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {g.fields.map((f) => {
                const v = qualificationValue(lead as Record<string, unknown>, f);
                return (
                  <div key={f.key} className="text-xs leading-snug">
                    <span className="text-muted-foreground">{f.label}: </span>
                    <span className={v === QUALIFICATION_EMPTY ? "italic text-muted-foreground" : "font-medium"}>
                      {v}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="rounded-md border bg-background/60 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Agendamento
          </div>
          {requestedIso ? (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              <div className="text-xs">
                <span className="text-muted-foreground">Data e hora solicitadas: </span>
                <span className="font-medium">{formatRequestedInterview(requestedIso)}</span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">Origem do agendamento: </span>
                <span className="font-medium">
                  {(lead["scheduling_source"] as string | null) === "formulario_bolsista"
                    ? "Formulário do processo bolsista"
                    : ((lead["scheduling_source"] as string | null) ?? QUALIFICATION_EMPTY)}
                </span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">Status de confirmação: </span>
                <span className="font-medium">
                  {CONFIRMATION_LABELS[confirmation ?? ""] ?? "Aguardando confirmação"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs italic text-muted-foreground">Sem agendamento pelo formulário.</div>
          )}
        </div>
      </div>


      {Object.keys(answers).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Ver todas as respostas do formulário</summary>
          <div className="mt-1 space-y-0.5">
            {Object.entries(answers).map(([k, v]) => (
              <div key={k}>
                <span className="text-muted-foreground">{k}: </span>
                <span className="font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {scheduled && confirmation !== CONFIRMATION_STATUS.confirmed && (
          <Button type="button" size="sm" onClick={onConfirmInterview} disabled={busy} className="gap-1.5">
            <CalendarCheck className="h-3.5 w-3.5" />Confirmar entrevista
          </Button>
        )}
        {scheduled && confirmation !== CONFIRMATION_STATUS.notConfirmed && (
          <Button type="button" size="sm" variant="outline" onClick={onNotConfirmed} disabled={busy} className="gap-1.5">
            <CalendarX className="h-3.5 w-3.5" />Não confirmou
          </Button>
        )}
        {lead.status === "novo" && (
          <Button type="button" size="sm" variant="outline" onClick={onConfirmInterest} disabled={busy} className="gap-1.5">
            <Heart className="h-3.5 w-3.5" />Confirmar interesse
          </Button>
        )}
      </div>
    </div>
  );
}
