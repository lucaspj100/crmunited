import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import {
  adminListUsers, adminListUserAccessLogs, adminResetPasswordTemp,
  adminSendResetEmail, adminSetUserStatus, adminUpdateUserRole,
} from "@/lib/user-admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Shield, Search, KeyRound, History, Ban, CheckCircle2, Copy, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/usuarios-acessos")({ component: UsersAdmin });

type UserRow = Awaited<ReturnType<typeof adminListUsers>>[number];

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    ativo: { label: "Ativo", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    inativo: { label: "Inativo", cls: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400" },
    bloqueado: { label: "Bloqueado", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
    pendente_redefinicao: { label: "Pendente redefinição", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  };
  const m = map[status] ?? { label: status, cls: "bg-zinc-500/15 text-zinc-700" };
  return <Badge className={`${m.cls} border-transparent`}>{m.label}</Badge>;
}

function UsersAdmin() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();

  const listFn = useServerFn(adminListUsers);
  const logsFn = useServerFn(adminListUserAccessLogs);
  const resetTempFn = useServerFn(adminResetPasswordTemp);
  const sendEmailFn = useServerFn(adminSendResetEmail);
  const setStatusFn = useServerFn(adminSetUserStatus);
  const setRoleFn = useServerFn(adminUpdateUserRole);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ativo" | "inativo" | "bloqueado" | "admin" | "vendedor">("all");
  const [logsUser, setLogsUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [statusUser, setStatusUser] = useState<{ user: UserRow; to: "ativo" | "inativo" | "bloqueado" } | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    enabled: isAdmin,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !`${u.full_name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      if (filter === "admin") return u.roles.includes("admin");
      if (filter === "vendedor") return u.roles.includes("vendedor");
      return u.status === filter;
    });
  }, [users, search, filter]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return {
      activeTotal: users.filter((u) => u.status === "ativo").length,
      sellers: users.filter((u) => u.status === "ativo" && u.roles.includes("vendedor")).length,
      admins: users.filter((u) => u.roles.includes("admin")).length,
      inactive: users.filter((u) => u.status !== "ativo").length,
      today: users.filter((u) => u.last_sign_in_at && new Date(u.last_sign_in_at) >= today).length,
    };
  }, [users]);

  const { data: logs = [] } = useQuery({
    queryKey: ["admin-user-logs", logsUser?.id],
    enabled: !!logsUser,
    queryFn: () => logsFn({ data: { userId: logsUser!.id } }),
  });

  if (!isAdmin) {
    toast.error("Acesso negado. Esta área é restrita ao administrador.");
    return <Navigate to="/dashboard" replace />;
  }

  const doResetTemp = async () => {
    if (!resetUser) return;
    try {
      const { tempPassword } = await resetTempFn({ data: { userId: resetUser.id } });
      setTempPassword(tempPassword);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const doSendEmail = async () => {
    if (!resetUser) return;
    try {
      const r = await sendEmailFn({ data: { userId: resetUser.id } });
      if (r.sent) { toast.success("Link de redefinição enviado por e-mail."); setResetUser(null); }
      else toast.info(r.message ?? "Envio de e-mail ainda não configurado. Use a opção de senha temporária.");
    } catch (e) { toast.error((e as Error).message); }
  };

  const doStatus = async () => {
    if (!statusUser) return;
    try {
      await setStatusFn({ data: { userId: statusUser.user.id, status: statusUser.to } });
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setStatusUser(null);
    } catch (e) { toast.error((e as Error).message); }
  };

  const doRoleChange = async (role: "admin" | "vendedor" | "franqueado") => {
    if (!editUser) return;
    try {
      await setRoleFn({ data: { userId: editUser.id, role } });
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditUser(null);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" /> Usuários e Acessos
        </h1>
        <p className="text-sm text-muted-foreground">Gerencie contas, permissões e histórico de acesso ao CRM.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Usuários ativos" value={stats.activeTotal} />
        <StatCard label="Vendedores ativos" value={stats.sellers} />
        <StatCard label="ADMs" value={stats.admins} />
        <StatCard label="Usuários inativos" value={stats.inactive} />
        <StatCard label="Acessos hoje" value={stats.today} />
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou e-mail…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
              <SelectItem value="bloqueado">Bloqueados</SelectItem>
              <SelectItem value="admin">ADM</SelectItem>
              <SelectItem value="vendedor">Vendedores</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Nome</th>
                <th className="px-2 py-2">E-mail</th>
                <th className="px-2 py-2">Perfil</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Último acesso</th>
                <th className="px-2 py-2">Criado em</th>
                <th className="px-2 py-2 text-center">Acessos</th>
                <th className="px-2 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>}
              {filtered.map((u) => (
                <tr key={u.id} className="border-b hover:bg-muted/40">
                  <td className="px-2 py-2 font-medium">{u.full_name || "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-2 py-2">
                    {u.roles.length === 0 ? <span className="text-muted-foreground">—</span> : u.roles.map((r: string) => (
                      <Badge key={r} variant="outline" className="mr-1 uppercase text-[10px]">{r === "admin" ? "ADM" : r}</Badge>
                    ))}
                  </td>
                  <td className="px-2 py-2">{statusBadge(u.status)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{fmtDate(u.last_sign_in_at)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{fmtDate(u.created_at)}</td>
                  <td className="px-2 py-2 text-center">{u.sign_in_count ?? 0}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setLogsUser(u)} title="Ver acessos"><History className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setResetUser(u); setTempPassword(null); }} title="Redefinir senha"><KeyRound className="h-4 w-4" /></Button>
                      {u.status === "ativo"
                        ? <Button size="sm" variant="ghost" onClick={() => setStatusUser({ user: u, to: "inativo" })} title="Inativar"><Ban className="h-4 w-4" /></Button>
                        : <Button size="sm" variant="ghost" onClick={() => setStatusUser({ user: u, to: "ativo" })} title="Ativar"><CheckCircle2 className="h-4 w-4" /></Button>}
                      <Button size="sm" variant="ghost" onClick={() => setEditUser(u)} title="Editar perfil"><Users className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Access logs modal */}
      <Dialog open={!!logsUser} onOpenChange={(v) => !v && setLogsUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de acessos</DialogTitle>
            <DialogDescription>{logsUser?.full_name || logsUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto text-sm">
            {logs.length === 0 ? <p className="p-4 text-muted-foreground">Nenhum registro.</p> : (
              <table className="w-full">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr><th className="px-2 py-2">Data</th><th className="px-2 py-2">Evento</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Detalhes</th></tr>
                </thead>
                <tbody>
                  {logs.map((l: any) => (
                    <tr key={l.id} className="border-b">
                      <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(l.created_at)}</td>
                      <td className="px-2 py-2">{l.event_type}</td>
                      <td className="px-2 py-2">{l.status === "success" ? <span className="text-emerald-600">sucesso</span> : <span className="text-rose-600">falha</span>}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {l.reason && <div>{l.reason}</div>}
                        {l.ip && <div>IP: {l.ip}</div>}
                        {l.user_agent && <div className="truncate max-w-[280px]">{l.user_agent}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset password modal */}
      <Dialog open={!!resetUser} onOpenChange={(v) => !v && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>{resetUser?.full_name || resetUser?.email}</DialogDescription>
          </DialogHeader>
          {tempPassword ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-700">Senha temporária gerada com sucesso.</p>
              <div className="rounded border bg-muted p-3 font-mono text-lg text-center select-all">{tempPassword}</div>
              <p className="text-xs text-muted-foreground">Compartilhe com o usuário. Ele será obrigado a criar uma nova senha no próximo login. Esta senha será exibida apenas uma vez.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(tempPassword); toast.success("Copiado"); }}>
                  <Copy className="h-4 w-4 mr-2" /> Copiar senha
                </Button>
                <Button onClick={() => setResetUser(null)}>Concluir</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Escolha como redefinir a senha:</p>
              <div className="grid gap-2">
                <Button onClick={doResetTemp}><KeyRound className="h-4 w-4 mr-2" /> Gerar senha temporária</Button>
                <Button variant="outline" onClick={doSendEmail}><Mail className="h-4 w-4 mr-2" /> Enviar link de redefinição por e-mail</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Status modal */}
      <Dialog open={!!statusUser} onOpenChange={(v) => !v && setStatusUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{statusUser?.to === "ativo" ? "Ativar usuário" : "Inativar usuário"}</DialogTitle>
            <DialogDescription>
              {statusUser?.to === "ativo"
                ? "O usuário voltará a poder acessar o CRM."
                : "Tem certeza que deseja inativar este usuário? Ele não conseguirá mais acessar o CRM."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStatusUser(null)}>Cancelar</Button>
            <Button variant={statusUser?.to === "ativo" ? "default" : "destructive"} onClick={doStatus}>
              {statusUser?.to === "ativo" ? "Ativar usuário" : "Inativar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit role */}
      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
            <DialogDescription>{editUser?.full_name || editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => doRoleChange("admin")}>Definir como ADM</Button>
            <Button variant="outline" onClick={() => doRoleChange("vendedor")}>Definir como Vendedor</Button>
            <Button variant="outline" onClick={() => doRoleChange("franqueado")}>Definir como Franqueado</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}
