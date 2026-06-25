import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Phone, MessageCircle, Check, Clock, Linkedin, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { normalizeProspectPhone } from "@/lib/prospect-phone";
import { playReturnSound } from "@/lib/notification-sound";
type RouterInstance = ReturnType<typeof useRouter>;

type RetornoTask = {
  id: string;
  due_date: string;
  due_time: string | null;
  observation: string | null;
  prospect_contact_id: string | null;
};

type ContactInfo = {
  id: string;
  nome: string | null;
  telefone_normalizado: string;
  telefone_original: string | null;
  empresa: string | null;
  cargo: string | null;
  observacao: string | null;
  origem: string | null;
  linkedin_url: string | null;
};

const POLL_MS = 30_000;

export function ReturnNotificationWatcher() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const tick = async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      console.log("[retorno-watcher] tick", { userId: user.id, now: now.toISOString(), today });

      const { data, error } = await supabase
        .from("tasks")
        .select("id, due_date, due_time, observation, prospect_contact_id")
        .eq("owner_id", user.id)
        .eq("type", "retorno_ligacao" as never)
        .eq("status", "pendente")
        .lte("due_date", today)
        .order("due_date", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error("[retorno-watcher] erro ao buscar tasks", error);
        toast.error(`Erro ao buscar retornos: ${error.message}`);
        return;
      }
      const tasks = (data ?? []) as RetornoTask[];
      console.log(`[retorno-watcher] ${tasks.length} task(s) retorno_ligacao pendentes`);

      for (const raw of tasks) {
        if (shownRef.current.has(raw.id)) continue;
        const time = raw.due_time ?? "00:00:00";
        const due = new Date(`${raw.due_date}T${time}`);
        if (due.getTime() > now.getTime()) continue;

        let contact: ContactInfo | null = null;
        if (raw.prospect_contact_id) {
          const { data: c, error: ce } = await supabase
            .from("prospect_contacts")
            .select("id, nome, telefone_normalizado, telefone_original, empresa, cargo, observacao, origem, linkedin_url")
            .eq("id", raw.prospect_contact_id)
            .maybeSingle();
          if (ce) console.warn("[retorno-watcher] falha ao buscar contato", ce);
          contact = (c as ContactInfo | null) ?? null;
        }

        shownRef.current.add(raw.id);
        showNotification(raw, contact, qc, router);
        void playReturnSound().catch(() => {});
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [user, qc]);

  return null;
}

// Extrai a "Observação do vendedor" do texto estruturado salvo em tasks.observation
function extractSellerNote(observation: string | null): string | null {
  if (!observation) return null;
  const trimmed = observation.trim();
  // Formato novo estruturado
  const m = trimmed.match(/Observa[cç][ãa]o do vendedor:\s*([\s\S]*)$/i);
  if (m && m[1].trim()) return m[1].trim();
  // Formato antigo: "Retornar ligação para Nome - Telefone\n<obs>"
  if (/^Retornar liga[cç][ãa]o para /i.test(trimmed)) {
    const idx = trimmed.indexOf("\n");
    if (idx >= 0) {
      const rest = trimmed.slice(idx + 1).trim();
      return rest || null;
    }
    return null;
  }
  return trimmed || null;
}

function showNotification(task: RetornoTask, contact: ContactInfo | null, qc: ReturnType<typeof useQueryClient>, router: RouterInstance) {
  const nome = contact?.nome || "Contato sem nome";
  const empresa = contact?.empresa?.trim() || "Empresa não informada";
  const cargo = contact?.cargo?.trim() || "Cargo não informado";
  const tel = contact?.telefone_normalizado ?? "";
  const telDisplay = contact?.telefone_original || (tel ? `+${tel}` : "—");
  const links = tel ? normalizeProspectPhone(tel) : { telLink: null as string | null, waLink: null as string | null };
  const horario = task.due_time ? task.due_time.slice(0, 5) : "—";
  const sellerNote = extractSellerNote(task.observation) || "Sem observação registrada";
  const contactNote = contact?.observacao?.trim() || null;
  const linkedin = contact?.linkedin_url?.trim() || null;

  const close = (t: string | number) => toast.dismiss(t);

  const conclude = async (t: string | number) => {
    const { error } = await supabase.from("tasks").update({ status: "concluida" }).eq("id", task.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["retornos_pendentes"] });
    close(t);
    toast.success("Retorno concluído");
  };

  const snooze = async (t: string | number) => {
    const next = new Date(Date.now() + 15 * 60 * 1000);
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
    qc.invalidateQueries({ queryKey: ["retornos_pendentes"] });
    close(t);
    toast.success("Adiado por 15 minutos");
  };

  toast.custom(
    (id) => (
      <div className="w-[400px] max-w-[92vw] rounded-lg border bg-card text-card-foreground shadow-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
            <Clock className="h-4 w-4" />
          </span>
          <div className="text-sm font-semibold">Retorno agendado — {horario}</div>
        </div>

        <div className="space-y-1 text-xs mb-3">
          <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{nome}</span></div>
          <div><span className="text-muted-foreground">Empresa:</span> {empresa}</div>
          <div><span className="text-muted-foreground">Cargo:</span> {cargo}</div>
          <div><span className="text-muted-foreground">Telefone:</span> {telDisplay}</div>
        </div>

        <div className="mb-2 rounded-md bg-muted/50 p-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Observação do retorno</div>
          <div className="text-xs whitespace-pre-wrap break-words">{sellerNote}</div>
        </div>

        {contactNote && (
          <div className="mb-3 rounded-md bg-muted/30 p-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Contexto do contato</div>
            <div className="text-xs whitespace-pre-wrap break-words line-clamp-4">{contactNote}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {links.telLink ? (
            <a href={links.telLink} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs px-2 py-1.5 hover:opacity-90">
              <Phone className="h-3.5 w-3.5" /> Ligar agora
            </a>
          ) : <span />}
          {links.waLink ? (
            <a href={links.waLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-md border text-xs px-2 py-1.5 hover:bg-accent">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          ) : <span />}
          <button onClick={() => void conclude(id)} className="inline-flex items-center justify-center gap-1.5 rounded-md border text-xs px-2 py-1.5 hover:bg-accent">
            <Check className="h-3.5 w-3.5" /> Concluir
          </button>
          <button onClick={() => void snooze(id)} className="inline-flex items-center justify-center gap-1.5 rounded-md border text-xs px-2 py-1.5 hover:bg-accent">
            <Clock className="h-3.5 w-3.5" /> Adiar 15 min
          </button>
          {linkedin && (
            <a href={linkedin} target="_blank" rel="noreferrer" className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-md border text-xs px-2 py-1.5 hover:bg-accent">
              <Linkedin className="h-3.5 w-3.5" /> Abrir LinkedIn
            </a>
          )}
        </div>
      </div>
    ),
    { duration: Infinity, position: "top-right" }
  );
}
