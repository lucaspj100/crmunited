import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Beaker, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import type { ProspectContact } from "@/lib/prospect-queue";
import { enableReturnSound, isReturnSoundEnabled, playReturnSound, disableReturnSound } from "@/lib/notification-sound";

type Props = { contact: ProspectContact | null };

export function ReturnsDebugCard({ contact }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: pending } = useQuery({
    enabled: !!user,
    queryKey: ["retornos_pendentes", user?.id],
    refetchInterval: 15_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, due_date, due_time")
        .eq("owner_id", user!.id)
        .eq("type", "retorno_ligacao" as never)
        .eq("status", "pendente");
      if (error) {
        console.error("[retornos-debug] erro", error);
        return { total: 0, overdue: 0, today };
      }
      const now = new Date();
      let overdue = 0;
      for (const t of data ?? []) {
        const time = (t as { due_time: string | null }).due_time ?? "00:00:00";
        const due = new Date(`${(t as { due_date: string }).due_date}T${time}`);
        if (due.getTime() <= now.getTime()) overdue++;
      }
      return { total: data?.length ?? 0, overdue, today };
    },
  });

  const criarTeste = async () => {
    if (!user) return;
    if (!contact) { toast.error("Carregue um contato na fila para criar a task de teste"); return; }
    const future = new Date(Date.now() + 10_000);
    const due_date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    const due_time = `${String(future.getHours()).padStart(2, "0")}:${String(future.getMinutes()).padStart(2, "0")}:${String(future.getSeconds()).padStart(2, "0")}`;
    const payload = {
      owner_id: user.id,
      prospect_contact_id: contact.id,
      lead_id: contact.lead_id ?? null,
      type: "retorno_ligacao",
      status: "pendente",
      due_date,
      due_time,
      observation: `[TESTE] Notificação em 10s para ${contact.nome || "contato"}`,
    };
    console.log("[retornos-debug] criando task de teste", payload);
    const { error } = await supabase.from("tasks").insert(payload as never);
    if (error) {
      console.error("[retornos-debug] falha", error);
      toast.error(`Falha ao criar task: ${error.message}`);
      return;
    }
    toast.success("Task criada. Notificação em ~10s + tempo de poll");
    qc.invalidateQueries({ queryKey: ["retornos_pendentes"] });
  };

  const total = pending?.total ?? 0;
  const overdue = pending?.overdue ?? 0;

  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => { setSoundOn(isReturnSoundEnabled()); }, []);

  const ativarSom = async () => {
    const ok = await enableReturnSound();
    if (ok) { setSoundOn(true); toast.success("Som dos retornos ativado"); }
    else toast.error("Não foi possível ativar o som neste navegador");
  };
  const desativarSom = () => { disableReturnSound(); setSoundOn(false); toast.success("Som desativado"); };
  const testarSom = async () => {
    if (!isReturnSoundEnabled()) { toast.error("Ative o som primeiro"); return; }
    const ok = await playReturnSound();
    if (!ok) toast.error("Falha ao tocar som");
  };

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Bell className="h-4 w-4 text-amber-600" />
          <span className="font-medium">Retornos pendentes:</span>
          <span>{total}</span>
          {overdue > 0 && (
            <span className="ml-2 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {overdue} vencido(s) agora
            </span>
          )}
          {!soundOn && (
            <span className="text-xs text-muted-foreground">Ative o som dos retornos para ouvir alertas.</span>
          )}
        </div>
        <div className="md:ml-auto flex gap-2 flex-wrap">
          {soundOn ? (
            <Button size="sm" variant="outline" onClick={desativarSom}>
              <Volume2 className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Som ativado
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={ativarSom}>
              <VolumeX className="h-3.5 w-3.5 mr-1" /> Ativar som
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={testarSom} disabled={!soundOn}>
            Testar som
          </Button>
          <Button size="sm" variant="outline" onClick={criarTeste}>
            <Beaker className="h-3.5 w-3.5 mr-1" /> Testar notificação agora
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
