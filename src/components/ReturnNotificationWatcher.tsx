import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, MessageCircle, Check, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { normalizeProspectPhone } from "@/lib/prospect-phone";

type RetornoTask = {
  id: string;
  due_date: string;
  due_time: string | null;
  observation: string | null;
  prospect_contact_id: string | null;
  prospect_contacts: {
    id: string;
    nome: string | null;
    telefone_normalizado: string;
    telefone_original: string | null;
  } | null;
};

const POLL_MS = 30_000;

export function ReturnNotificationWatcher() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const tick = async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, due_date, due_time, observation, prospect_contact_id, prospect_contacts:prospect_contact_id (id, nome, telefone_normalizado, telefone_original)"
        )
        .eq("owner_id", user.id)
        .eq("type", "retorno_ligacao" as never)
        .eq("status", "pendente")
        .lte("due_date", today)
        .order("due_date", { ascending: true });
      if (cancelled || error || !data) return;

      for (const raw of data as unknown as RetornoTask[]) {
        if (shownRef.current.has(raw.id)) continue;
        // Compor due datetime
        const time = raw.due_time ?? "00:00:00";
        const due = new Date(`${raw.due_date}T${time}`);
        if (due.getTime() > now.getTime()) continue;
        shownRef.current.add(raw.id);
        showNotification(raw, qc);
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [user, qc]);

  return null;
}

function showNotification(task: RetornoTask, qc: ReturnType<typeof useQueryClient>) {
  const c = task.prospect_contacts;
  const nome = c?.nome || "Contato";
  const tel = c?.telefone_normalizado ?? "";
  const telDisplay = c?.telefone_original || (tel ? `+${tel}` : "—");
  const links = normalizeProspectPhone(tel);
  const horario = task.due_time ? task.due_time.slice(0, 5) : "—";

  const close = (t: string | number) => toast.dismiss(t);

  const conclude = async (t: string | number) => {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "concluida" })
      .eq("id", task.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["tasks"] });
    close(t);
    toast.success("Retorno concluído");
  };

  const snooze = async (t: string | number) => {
    const base = task.due_time
      ? new Date(`${task.due_date}T${task.due_time}`)
      : new Date(`${task.due_date}T00:00:00`);
    const next = new Date(Math.max(base.getTime(), Date.now()) + 15 * 60 * 1000);
    const { error } = await supabase
      .from("tasks")
      .update({
        due_date: next.toISOString().slice(0, 10),
        due_time: next.toTimeString().slice(0, 8),
        status: "pendente",
      })
      .eq("id", task.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["tasks"] });
    // Remover do shownRef para que dispare de novo no próximo horário
    close(t);
    toast.success("Adiado por 15 minutos");
  };

  toast.custom(
    (id) => (
      <div className="w-[340px] rounded-lg border bg-card text-card-foreground shadow-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
            <Clock className="h-4 w-4" />
          </span>
          <div className="text-sm font-semibold">Retorno agendado</div>
          <div className="ml-auto text-xs text-muted-foreground">{horario}</div>
        </div>
        <div className="text-sm font-medium truncate">{nome}</div>
        <div className="text-xs text-muted-foreground mb-3 truncate">{telDisplay}</div>
        <div className="grid grid-cols-2 gap-2">
          {links.telLink ? (
            <a
              href={links.telLink}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs px-2 py-1.5 hover:opacity-90"
            >
              <Phone className="h-3.5 w-3.5" /> Ligar agora
            </a>
          ) : <span />}
          {links.waLink ? (
            <a
              href={links.waLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border text-xs px-2 py-1.5 hover:bg-accent"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          ) : <span />}
          <button
            onClick={() => void conclude(id)}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border text-xs px-2 py-1.5 hover:bg-accent"
          >
            <Check className="h-3.5 w-3.5" /> Concluir
          </button>
          <button
            onClick={() => void snooze(id)}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border text-xs px-2 py-1.5 hover:bg-accent"
          >
            <Clock className="h-3.5 w-3.5" /> Adiar 15 min
          </button>
        </div>
      </div>
    ),
    { duration: Infinity, position: "top-right" }
  );
}
