import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DEFAULT_WHATSAPP_TEMPLATE, getWhatsappTemplate, setWhatsappTemplate } from "@/lib/prospect-status";
import { DEFAULT_DIALER_SETTINGS, validateDialerSettings, type DialerSettings } from "@/lib/prospect-dial";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ConfigPanel() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");

  const [text, setText] = useState(getWhatsappTemplate());
  const [ddd, setDdd] = useState(DEFAULT_DIALER_SETTINGS.ddd_origem);
  const [oper, setOper] = useState(DEFAULT_DIALER_SETTINGS.codigo_operadora_interurbano);

  const { data: mySettings } = useQuery({
    enabled: !!user,
    queryKey: ["dialer_settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("prospect_dialer_settings")
        .select("ddd_origem, codigo_operadora_interurbano")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data as DialerSettings | null) ?? null;
    },
  });

  useEffect(() => {
    if (mySettings) {
      setDdd(mySettings.ddd_origem);
      setOper(mySettings.codigo_operadora_interurbano);
    }
  }, [mySettings]);

  const saveDialer = async () => {
    if (!user) return;
    const err = validateDialerSettings({ ddd_origem: ddd, codigo_operadora_interurbano: oper });
    if (err) { toast.error(err); return; }
    const { error } = await supabase
      .from("prospect_dialer_settings")
      .upsert({ user_id: user.id, ddd_origem: ddd, codigo_operadora_interurbano: oper }, { onConflict: "user_id" });
    if (error) { toast.error(error.message); return; }
    toast.success("Configurações de discagem salvas");
    qc.invalidateQueries({ queryKey: ["dialer_settings"] });
    qc.invalidateQueries({ queryKey: ["dialer_settings_all"] });
  };

  const saveWpp = () => {
    setWhatsappTemplate(text);
    toast.success("Mensagem padrão salva (neste dispositivo)");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Minhas configurações de discagem</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Meu DDD de origem</Label>
              <Input value={ddd} onChange={(e) => setDdd(e.target.value.replace(/\D/g, "").slice(0, 2))} maxLength={2} placeholder="11" inputMode="numeric" />
            </div>
            <div>
              <Label>Minha operadora para interurbano</Label>
              <Input value={oper} onChange={(e) => setOper(e.target.value.replace(/\D/g, "").slice(0, 2))} maxLength={2} placeholder="15" inputMode="numeric" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Exemplos: 15 (Vivo), 21 (Claro), 41 (TIM), 31 (Oi). Se o DDD do contato for igual ao seu DDD, o sistema disca apenas o número local. Caso contrário, disca <code>0 + operadora + DDD + número</code>.
          </p>
          <div><Button onClick={saveDialer}>Salvar configurações</Button></div>
        </CardContent>
      </Card>

      {isAdmin && <AdminDialerTable />}

      <Card>
        <CardHeader><CardTitle>Mensagem padrão de WhatsApp</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <p className="text-xs text-muted-foreground">Usada no botão WhatsApp do Discador. Salva no navegador atual.</p>
          <div className="flex gap-2">
            <Button onClick={saveWpp}>Salvar</Button>
            <Button variant="outline" onClick={() => setText(DEFAULT_WHATSAPP_TEMPLATE)}>Restaurar padrão</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type Seller = { id: string; full_name: string | null; email: string };
type AdminRow = { user_id: string; ddd_origem: string; codigo_operadora_interurbano: string; updated_at: string };

function AdminDialerTable() {
  const qc = useQueryClient();
  const { data: sellers = [] } = useQuery({
    queryKey: ["dialer_sellers"],
    queryFn: async () => {
      const { data: ur } = await supabase.from("user_roles").select("user_id").in("role", ["vendedor", "admin", "franqueado"]);
      const ids = Array.from(new Set((ur ?? []).map((r) => r.user_id)));
      if (!ids.length) return [] as Seller[];
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (data ?? []) as Seller[];
    },
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["dialer_settings_all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("prospect_dialer_settings")
        .select("user_id, ddd_origem, codigo_operadora_interurbano, updated_at");
      return (data ?? []) as AdminRow[];
    },
  });

  const byUser = useMemo(() => new Map(settings.map((s) => [s.user_id, s])), [settings]);
  const [drafts, setDrafts] = useState<Record<string, { ddd: string; oper: string }>>({});

  const getDraft = (s: Seller) => {
    if (drafts[s.id]) return drafts[s.id];
    const cur = byUser.get(s.id);
    return { ddd: cur?.ddd_origem ?? "11", oper: cur?.codigo_operadora_interurbano ?? "15" };
  };

  const update = (id: string, patch: Partial<{ ddd: string; oper: string }>) => {
    setDrafts((d) => ({ ...d, [id]: { ...getDraft({ id, full_name: null, email: "" } as Seller), ...patch } }));
  };

  const save = async (id: string) => {
    const d = getDraft({ id, full_name: null, email: "" } as Seller);
    const err = validateDialerSettings({ ddd_origem: d.ddd, codigo_operadora_interurbano: d.oper });
    if (err) { toast.error(err); return; }
    const { error } = await supabase
      .from("prospect_dialer_settings")
      .upsert({ user_id: id, ddd_origem: d.ddd, codigo_operadora_interurbano: d.oper }, { onConflict: "user_id" });
    if (error) { toast.error(error.message); return; }
    toast.success("Salvo");
    qc.invalidateQueries({ queryKey: ["dialer_settings_all"] });
    qc.invalidateQueries({ queryKey: ["dialer_settings"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Configurações de discagem por vendedor (ADM)</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2">Vendedor</th>
                <th className="p-2">DDD de origem</th>
                <th className="p-2">Código operadora</th>
                <th className="p-2">Atualizado em</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => {
                const d = getDraft(s);
                const cur = byUser.get(s.id);
                return (
                  <tr key={s.id} className="border-t">
                    <td className="p-2">{s.full_name || s.email}</td>
                    <td className="p-2">
                      <Input className="w-20" value={d.ddd} maxLength={2} onChange={(e) => update(s.id, { ddd: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
                    </td>
                    <td className="p-2">
                      <Input className="w-20" value={d.oper} maxLength={2} onChange={(e) => update(s.id, { oper: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
                    </td>
                    <td className="p-2 text-muted-foreground">{cur?.updated_at ? format(new Date(cur.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}</td>
                    <td className="p-2"><Button size="sm" onClick={() => save(s.id)}>Salvar</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
