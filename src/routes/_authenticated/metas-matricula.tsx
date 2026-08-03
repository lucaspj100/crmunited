import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Target, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  MONTH_NAMES, currentMonthYear, fetchEnrollmentGoals, monthLabel, type EnrollmentGoal,
} from "@/lib/enrollment-goals";

export const Route = createFileRoute("/_authenticated/metas-matricula")({ component: MetasPage });

type Seller = { id: string; nome: string; team_id: string | null };

function useSellers() {
  return useQuery({
    queryKey: ["sellers_for_goals"],
    staleTime: 60_000,
    queryFn: async (): Promise<Seller[]> => {
      const [profs, roles] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, team_id, status"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profs.error) throw profs.error;
      if (roles.error) throw roles.error;
      const sellerIds = new Set((roles.data ?? []).filter((r) => r.role === "vendedor").map((r) => r.user_id));
      return (profs.data ?? [])
        .filter((p) => sellerIds.has(p.id) && p.status === "ativo")
        .map((p) => ({ id: p.id, nome: p.full_name || p.email || "Vendedor", team_id: p.team_id }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
}

function MetasPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const qc = useQueryClient();
  const nowMY = currentMonthYear();
  const [month, setMonth] = useState(nowMY.month);
  const [year, setYear] = useState(nowMY.year);
  const [editing, setEditing] = useState<EnrollmentGoal | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: sellers = [] } = useSellers();
  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["enrollment_goals", month, year],
    queryFn: () => fetchEnrollmentGoals({ month, year }),
  });

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const sellerName = (id: string) => sellers.find((s) => s.id === id)?.nome ?? id;
  const withoutGoal = useMemo(
    () => sellers.filter((s) => !goals.some((g) => g.seller_id === s.id && g.active)),
    [sellers, goals],
  );

  const remove = async (g: EnrollmentGoal) => {
    const { error } = await supabase.from("seller_enrollment_goals").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    toast.success("Meta excluída");
    qc.invalidateQueries({ queryKey: ["enrollment_goals"] });
    qc.invalidateQueries({ queryKey: ["enrollment_goals_active"] });
  };

  const years = [nowMY.year - 1, nowMY.year, nowMY.year + 1];

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />Metas de matrícula
          </h1>
          <p className="text-sm text-muted-foreground">Meta individual de matrículas por vendedor, por mês.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Nova meta</Button>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Mês</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ano</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="border-b px-4 py-3 font-semibold">Metas de {monthLabel(month, year)}</div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
        ) : goals.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nenhuma meta cadastrada neste mês.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3 text-right">Meta</th>
                  <th className="p-3">Observação</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="p-3 font-medium">{sellerName(g.seller_id)}</td>
                    <td className="p-3 text-right tabular-nums">{g.target_enrollments} matrículas</td>
                    <td className="p-3 text-muted-foreground">{g.notes || "—"}</td>
                    <td className="p-3">
                      {g.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(g)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(g)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {withoutGoal.length > 0 && (
        <Card className="p-4">
          <div className="font-semibold mb-2">Sem meta ativa em {monthLabel(month, year)}</div>
          <div className="flex flex-wrap gap-2">
            {withoutGoal.map((s) => (
              <Badge key={s.id} variant="outline">{s.nome}</Badge>
            ))}
          </div>
        </Card>
      )}

      <GoalDialog
        open={creating || !!editing}
        goal={editing}
        defaultMonth={month}
        defaultYear={year}
        sellers={sellers}
        onClose={() => { setCreating(false); setEditing(null); }}
      />
    </div>
  );
}

function GoalDialog({
  open, goal, defaultMonth, defaultYear, sellers, onClose,
}: {
  open: boolean;
  goal: EnrollmentGoal | null;
  defaultMonth: number;
  defaultYear: number;
  sellers: Seller[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const nowMY = currentMonthYear();
  const [sellerId, setSellerId] = useState(goal?.seller_id ?? "");
  const [month, setMonth] = useState(goal?.month ?? defaultMonth);
  const [year, setYear] = useState(goal?.year ?? defaultYear);
  const [target, setTarget] = useState(String(goal?.target_enrollments ?? 5));
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [active, setActive] = useState(goal?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState("");

  // Reinicializa quando o alvo do diálogo muda
  const currentKey = `${open}-${goal?.id ?? "new"}-${defaultMonth}-${defaultYear}`;
  if (key !== currentKey) {
    setKey(currentKey);
    setSellerId(goal?.seller_id ?? "");
    setMonth(goal?.month ?? defaultMonth);
    setYear(goal?.year ?? defaultYear);
    setTarget(String(goal?.target_enrollments ?? 5));
    setNotes(goal?.notes ?? "");
    setActive(goal?.active ?? true);
  }

  const numeric = Number.parseInt(target, 10);
  const valid = !!sellerId && Number.isFinite(numeric) && numeric > 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const payload = {
      seller_id: sellerId,
      team_id: sellers.find((s) => s.id === sellerId)?.team_id ?? null,
      month,
      year,
      target_enrollments: numeric,
      notes: notes.trim() || null,
      active,
    };
    const res = goal
      ? await supabase.from("seller_enrollment_goals").update(payload).eq("id", goal.id)
      : await supabase.from("seller_enrollment_goals").insert({ ...payload, created_by: user?.id ?? null });
    setSaving(false);
    if (res.error) {
      const msg = res.error.message.includes("seller_enrollment_goals_active_unique")
        ? "Já existe uma meta ativa para esse vendedor neste mês."
        : res.error.message;
      return toast.error(msg);
    }
    toast.success(goal ? "Meta atualizada" : "Meta criada");
    qc.invalidateQueries({ queryKey: ["enrollment_goals"] });
    qc.invalidateQueries({ queryKey: ["enrollment_goals_active"] });
    onClose();
  };

  const years = [nowMY.year - 1, nowMY.year, nowMY.year + 1];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{goal ? "Editar meta" : "Nova meta de matrículas"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vendedor</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger>
              <SelectContent>
                {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mês</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target">Quantidade de matrículas</Label>
            <Input id="target" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observação (opcional)</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Meta ativa
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={!valid || saving}>{saving ? "Salvando…" : "Salvar meta"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
