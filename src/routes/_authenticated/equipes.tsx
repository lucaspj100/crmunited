import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import {
  adminListTeams, adminSaveTeam, adminSetPrimaryTeam, adminDeleteTeam, adminMoveUsersToTeam,
} from "@/lib/team-admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UsersRound, Plus, Pencil, Eye, Crown, Trash2, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/equipes")({ component: TeamsAdmin });

type TeamRow = Awaited<ReturnType<typeof adminListTeams>>["teams"][number];

function TeamsAdmin() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();

  const listFn = useServerFn(adminListTeams);
  const saveFn = useServerFn(adminSaveTeam);
  const primaryFn = useServerFn(adminSetPrimaryTeam);
  const deleteFn = useServerFn(adminDeleteTeam);
  const moveFn = useServerFn(adminMoveUsersToTeam);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-teams"],
    queryFn: () => listFn(),
    enabled: isAdmin,
  });

  const teams = data?.teams ?? [];
  const unassigned = data?.unassigned ?? [];
  const allMembers = useMemo(
    () => teams.flatMap((t: TeamRow) => t.members.map((m: any) => ({ ...m, team_name: t.name }))),
    [teams],
  );

  const [editTeam, setEditTeam] = useState<Partial<TeamRow> | null>(null);
  const [membersTeam, setMembersTeam] = useState<TeamRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [confirmPrimary, setConfirmPrimary] = useState<TeamRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TeamRow | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<TeamRow | null>(null);
  const [confirmMove, setConfirmMove] = useState(false);

  if (!isAdmin) return <Navigate to="/dashboard" />;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-teams"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const doSave = async () => {
    if (!editTeam?.name || editTeam.name.trim().length < 2) return toast.error("Informe o nome da equipe.");
    try {
      await saveFn({
        data: {
          id: editTeam.id,
          name: editTeam.name,
          description: editTeam.description ?? null,
          manager_id: editTeam.manager_id ?? null,
          is_active: editTeam.is_active ?? true,
          include_in_main_dashboard: editTeam.include_in_main_dashboard ?? false,
        },
      });
      toast.success("Equipe salva");
      setEditTeam(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const doPrimary = async () => {
    if (!confirmPrimary) return;
    try {
      await primaryFn({ data: { teamId: confirmPrimary.id } });
      toast.success(`"${confirmPrimary.name}" agora é a equipe principal.`);
      setConfirmPrimary(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const doDeactivate = async () => {
    if (!confirmDeactivate) return;
    try {
      await saveFn({
        data: {
          id: confirmDeactivate.id,
          name: confirmDeactivate.name,
          description: confirmDeactivate.description,
          manager_id: confirmDeactivate.manager_id,
          is_active: !confirmDeactivate.is_active,
          include_in_main_dashboard: confirmDeactivate.include_in_main_dashboard,
        },
      });
      toast.success("Status da equipe atualizado");
      setConfirmDeactivate(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteFn({ data: { teamId: confirmDelete.id } });
      toast.success("Equipe excluída");
      setConfirmDelete(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const doMove = async () => {
    if (selected.length === 0 || !moveTarget) return;
    try {
      const r = await moveFn({ data: { userIds: selected, teamId: moveTarget } });
      toast.success(`${r.moved} usuário(s) movido(s).`);
      setSelected([]);
      setMoveTarget("");
      setConfirmMove(false);
      setMembersTeam(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-primary" /> Equipes
          </h1>
          <p className="text-sm text-muted-foreground">
            Separe os usuários da United em equipes. As métricas de cada equipe não se misturam.
          </p>
        </div>
        <Button onClick={() => setEditTeam({ name: "", is_active: true, include_in_main_dashboard: false })}>
          <Plus className="h-4 w-4 mr-2" /> Nova equipe
        </Button>
      </div>

      {unassigned.length > 0 && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5">
          <p className="text-sm">
            <strong>{unassigned.length}</strong> usuário(s) sem equipe. Mova-os para uma equipe para que apareçam corretamente nos indicadores.
          </p>
        </Card>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t: TeamRow) => (
            <Card key={t.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{t.name}</h3>
                    {t.is_primary && <Badge className="bg-primary/15 text-primary border-transparent"><Crown className="h-3 w-3 mr-1" />Principal</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.description || "Sem descrição"}</p>
                </div>
                <Badge variant={t.is_active ? "outline" : "secondary"}>{t.is_active ? "Ativa" : "Inativa"}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Responsável:</span> {t.manager_name || "—"}</div>
                <div><span className="text-muted-foreground">Usuários:</span> {t.member_count}</div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  {t.include_in_main_dashboard ? "Aparece no dashboard principal" : "Não aparece no dashboard principal"}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditTeam(t)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                <Button size="sm" variant="outline" onClick={() => { setMembersTeam(t); setSelected([]); }}>
                  <Eye className="h-4 w-4 mr-1" />Integrantes
                </Button>
                {!t.is_primary && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmPrimary(t)}><Crown className="h-4 w-4 mr-1" />Tornar principal</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setConfirmDeactivate(t)}>
                  {t.is_active ? "Desativar" : "Ativar"}
                </Button>
                {!t.is_primary && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(t)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Editar / criar */}
      <Dialog open={!!editTeam} onOpenChange={(v) => !v && setEditTeam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTeam?.id ? "Editar equipe" : "Nova equipe"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={editTeam?.name ?? ""} onChange={(e) => setEditTeam((p) => ({ ...p!, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={editTeam?.description ?? ""} onChange={(e) => setEditTeam((p) => ({ ...p!, description: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Responsável</Label>
              <Select
                value={editTeam?.manager_id ?? "none"}
                onValueChange={(v) => setEditTeam((p) => ({ ...p!, manager_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {allMembers.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded border p-3">
              <div><p className="text-sm font-medium">Equipe ativa</p></div>
              <Switch checked={editTeam?.is_active ?? true} onCheckedChange={(v) => setEditTeam((p) => ({ ...p!, is_active: v }))} />
            </div>
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="text-sm font-medium">Aparecer no dashboard principal</p>
                <p className="text-xs text-muted-foreground">Inclui os números desta equipe na visão geral padrão.</p>
              </div>
              <Switch
                checked={editTeam?.include_in_main_dashboard ?? false}
                onCheckedChange={(v) => setEditTeam((p) => ({ ...p!, include_in_main_dashboard: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTeam(null)}>Cancelar</Button>
            <Button onClick={doSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Integrantes */}
      <Dialog open={!!membersTeam} onOpenChange={(v) => !v && setMembersTeam(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Integrantes — {membersTeam?.name}</DialogTitle>
            <DialogDescription>Selecione um ou vários usuários para mover de equipe.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto">
            {(membersTeam?.members ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum usuário nesta equipe.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-2 py-2">Nome</th>
                    <th className="px-2 py-2">E-mail</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(membersTeam?.members ?? []).map((m: any) => (
                    <tr key={m.id} className="border-b">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={selected.includes(m.id)}
                          onCheckedChange={(v) =>
                            setSelected((prev) => (v ? [...prev, m.id] : prev.filter((x) => x !== m.id)))
                          }
                        />
                      </td>
                      <td className="px-2 py-2 font-medium">{m.full_name || "—"}</td>
                      <td className="px-2 py-2 text-muted-foreground">{m.email}</td>
                      <td className="px-2 py-2">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={moveTarget} onValueChange={setMoveTarget}>
              <SelectTrigger className="sm:w-[240px]"><SelectValue placeholder="Mover para…" /></SelectTrigger>
              <SelectContent>
                {teams.filter((t: TeamRow) => t.id !== membersTeam?.id).map((t: TeamRow) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={selected.length === 0 || !moveTarget} onClick={() => setConfirmMove(true)}>
              <ArrowRightLeft className="h-4 w-4 mr-2" /> Mover {selected.length > 0 ? `(${selected.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmMove}
        title="Mover usuários"
        description={`Confirma mover ${selected.length} usuário(s) para outra equipe? Os registros continuam vinculados ao usuário.`}
        onCancel={() => setConfirmMove(false)}
        onConfirm={doMove}
      />
      <ConfirmDialog
        open={!!confirmPrimary}
        title="Alterar equipe principal"
        description={`"${confirmPrimary?.name}" passará a ser a equipe padrão do dashboard, telão, ranking e relatórios.`}
        onCancel={() => setConfirmPrimary(null)}
        onConfirm={doPrimary}
      />
      <ConfirmDialog
        open={!!confirmDeactivate}
        title={confirmDeactivate?.is_active ? "Desativar equipe" : "Ativar equipe"}
        description={confirmDeactivate?.is_active
          ? "A equipe deixará de aparecer como opção padrão nos filtros. Nenhum dado será perdido."
          : "A equipe voltará a ficar disponível nos filtros."}
        onCancel={() => setConfirmDeactivate(null)}
        onConfirm={doDeactivate}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Excluir equipe"
        description="Esta ação não pode ser desfeita. Equipes com usuários não podem ser excluídas."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        destructive
      />
    </div>
  );
}

function ConfirmDialog({
  open, title, description, onCancel, onConfirm, destructive,
}: { open: boolean; title: string; description: string; onCancel: () => void; onConfirm: () => void; destructive?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
