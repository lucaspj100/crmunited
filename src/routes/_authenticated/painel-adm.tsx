import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, AlertTriangle, Users, Filter } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel-adm")({ component: PainelAdm });

type Period = "hoje" | "semana" | "mes" | "custom";

function periodRange(p: Period, customStart?: string, customEnd?: string): { start: string; end: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = iso(today);
  if (p === "hoje") return { start: end, end };
  if (p === "semana") {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return { start: iso(d), end };
  }
  if (p === "mes") {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: iso(d), end };
  }
  return { start: customStart || end, end: customEnd || end };
}

async function fetchPainel(range: { start: string; end: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoIso = weekAgo.toISOString().slice(0, 10);

  const startIso = `${range.start}T00:00:00`;
  const endIso = `${range.end}T23:59:59`;

  const [profR, leadsR, leadsCreatedR, tasksR] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("leads").select("id, owner_id, status, interview_date, lost_at, in_rescue, rescued_at, created_at, updated_at, enrollment_date"),
    supabase.from("leads").select("id, owner_id, created_at").gte("created_at", startIso).lte("created_at", endIso).limit(20000),
    supabase.from("tasks").select("id, owner_id, due_date, status, type, updated_at").limit(20000),
  ]);

  const profiles = (profR.data ?? []) as { id: string; full_name: string | null; email: string }[];
  const leads = (leadsR.data ?? []) as any[];
  const leadsCreated = (leadsCreatedR.data ?? []) as any[];
  const tasks = (tasksR.data ?? []) as any[];

  // Filtra apenas vendedores que possuem leads ou tarefas
  const activeIds = new Set<string>([
    ...leads.map((l) => l.owner_id).filter(Boolean),
    ...tasks.map((t) => t.owner_id).filter(Boolean),
  ]);

  const rows = profiles
    .filter((p) => activeIds.has(p.id))
    .map((p) => {
      const myLeads = leads.filter((l) => l.owner_id === p.id);
      const myTasks = tasks.filter((t) => t.owner_id === p.id);

      const novosHoje = leadsCreated.filter((l) => l.owner_id === p.id && l.created_at?.slice(0, 10) === today).length;
      const novosSemana = leadsCreated.filter((l) => l.owner_id === p.id && l.created_at?.slice(0, 10) >= weekAgoIso).length;
      const novosPeriodo = leadsCreated.filter((l) => l.owner_id === p.id).length;

      const tarefasHoje = myTasks.filter((t) => t.status === "pendente" && t.due_date === today).length;
      const tarefasAtrasadas = myTasks.filter((t) => t.status === "pendente" && t.due_date < today).length;
      const tarefasConcluidasPeriodo = myTasks.filter(
        (t) => t.status === "concluida" && t.updated_at >= startIso && t.updated_at <= endIso,
      ).length;

      const ativos = myLeads.filter((l) => ["novo", "interessado", "entrevista_marcada", "entrevista_realizada"].includes(l.status));
      const leadIdsComTarefa = new Set(myTasks.filter((t) => t.status === "pendente").map((t) => t.lead_id));
      const semProximaAcao = ativos.filter((l) => !leadIdsComTarefa.has(l.id)).length;

      const entrevistasMarcadasPeriodo = myLeads.filter(
        (l) => l.interview_date && l.interview_date >= range.start && l.interview_date <= range.end,
      ).length;
      const entrevistasRealizadasPeriodo = myLeads.filter(
        (l) => l.status === "entrevista_realizada" && l.updated_at?.slice(0, 10) >= range.start && l.updated_at?.slice(0, 10) <= range.end,
      ).length;
      const noShowPeriodo = myLeads.filter(
        (l) =>
          l.interview_date &&
          l.interview_date >= range.start &&
          l.interview_date <= range.end &&
          l.interview_date < today &&
          l.status === "entrevista_marcada",
      ).length;

      const matriculasPeriodo = myLeads.filter((l) => {
        if (l.status !== "matricula") return false;
        const d = l.enrollment_date as string | null;
        return !!d && d >= range.start && d <= range.end;
      }).length;
      const perdidosPeriodo = myLeads.filter(
        (l) => l.lost_at && l.lost_at.slice(0, 10) >= range.start && l.lost_at.slice(0, 10) <= range.end,
      ).length;

      const totalEntrevistas = entrevistasMarcadasPeriodo;
      const taxaComparecimento = totalEntrevistas > 0 ? Math.round((entrevistasRealizadasPeriodo / totalEntrevistas) * 100) : 0;
      const taxaMatricula = entrevistasRealizadasPeriodo > 0 ? Math.round((matriculasPeriodo / entrevistasRealizadasPeriodo) * 100) : 0;

      const resgatesPeriodo = myLeads.filter(
        (l) => l.in_rescue && l.rescued_at && l.rescued_at.slice(0, 10) >= range.start && l.rescued_at.slice(0, 10) <= range.end,
      ).length;

      return {
        id: p.id,
        name: p.full_name || p.email,
        novosHoje, novosSemana, novosPeriodo,
        tarefasHoje, tarefasAtrasadas, tarefasConcluidasPeriodo,
        semProximaAcao,
        entrevistasMarcadasPeriodo, entrevistasRealizadasPeriodo, noShowPeriodo,
        matriculasPeriodo, perdidosPeriodo,
        taxaComparecimento, taxaMatricula,
        resgatesPeriodo,
      };
    });

  return rows;
}

function PainelAdm() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("franqueado");
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("mes");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<string>("matriculasPeriodo");

  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["painel-adm", range.start, range.end],
    queryFn: () => fetchPainel(range),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return <div className="text-muted-foreground">Acesso restrito a administradores.</div>;
  }

  const filtered = useMemo(() => {
    const list = (rows ?? []).filter((r) => (sellerFilter === "all" ? true : r.id === sellerFilter));
    return [...list].sort((a: any, b: any) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));
  }, [rows, sellerFilter, sortKey]);

  const totals = useMemo(() => {
    const acc = {
      tarefasAtrasadas: 0, semProximaAcao: 0, noShowPeriodo: 0, matriculasPeriodo: 0,
      entrevistasRealizadasPeriodo: 0, entrevistasMarcadasPeriodo: 0,
    };
    for (const r of filtered) {
      acc.tarefasAtrasadas += r.tarefasAtrasadas;
      acc.semProximaAcao += r.semProximaAcao;
      acc.noShowPeriodo += r.noShowPeriodo;
      acc.matriculasPeriodo += r.matriculasPeriodo;
      acc.entrevistasRealizadasPeriodo += r.entrevistasRealizadasPeriodo;
      acc.entrevistasMarcadasPeriodo += r.entrevistasMarcadasPeriodo;
    }
    return acc;
  }, [filtered]);

  const top = filtered[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6 text-primary" />Painel ADM por vendedor</h1>
        <p className="text-sm text-muted-foreground">Ranking, métricas e alertas da operação comercial</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Filter className="h-4 w-4" />Filtros</div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground mb-1">Período</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Últimos 7 dias</SelectItem>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="flex flex-col">
                <label className="text-xs text-muted-foreground mb-1">De</label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-[160px]" />
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-muted-foreground mb-1">Até</label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-[160px]" />
              </div>
            </>
          )}
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground mb-1">Vendedor</label>
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(rows ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground mb-1">Ordenar por</label>
            <Select value={sortKey} onValueChange={setSortKey}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="matriculasPeriodo">Matrículas</SelectItem>
                <SelectItem value="entrevistasRealizadasPeriodo">Entrevistas realizadas</SelectItem>
                <SelectItem value="entrevistasMarcadasPeriodo">Entrevistas marcadas</SelectItem>
                <SelectItem value="tarefasConcluidasPeriodo">Tarefas concluídas</SelectItem>
                <SelectItem value="novosPeriodo">Leads novos</SelectItem>
                <SelectItem value="resgatesPeriodo">Resgates</SelectItem>
                <SelectItem value="tarefasAtrasadas">Tarefas atrasadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {isLoading && <div className="text-muted-foreground">Carregando…</div>}

      {!isLoading && rows && (
        <>
          {/* Alertas clicáveis */}
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold mb-3"><AlertTriangle className="h-4 w-4 text-amber-600" />Alertas da operação</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {filtered
                .filter((r) => r.tarefasAtrasadas > 0)
                .slice(0, 6)
                .map((r) => (
                  <button
                    key={`atr-${r.id}`}
                    onClick={() => navigate({ to: "/tarefas" })}
                    className="text-left rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm hover:bg-rose-500/15"
                  >
                    <span className="font-medium">{r.name}</span> tem <span className="font-bold">{r.tarefasAtrasadas}</span> tarefa(s) atrasada(s)
                  </button>
                ))}
              {filtered
                .filter((r) => r.semProximaAcao > 0)
                .slice(0, 6)
                .map((r) => (
                  <button
                    key={`sna-${r.id}`}
                    onClick={() => navigate({ to: "/fila" })}
                    className="text-left rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm hover:bg-amber-500/15"
                  >
                    <span className="font-medium">{r.name}</span> tem <span className="font-bold">{r.semProximaAcao}</span> lead(s) sem próxima ação
                  </button>
                ))}
              {filtered
                .filter((r) => r.noShowPeriodo > 0)
                .slice(0, 6)
                .map((r) => (
                  <button
                    key={`ns-${r.id}`}
                    onClick={() => navigate({ to: "/tarefas" })}
                    className="text-left rounded-md border border-slate-500/30 bg-slate-500/10 px-3 py-2 text-sm hover:bg-slate-500/15"
                  >
                    <span className="font-medium">{r.name}</span> teve <span className="font-bold">{r.noShowPeriodo}</span> no-show no período
                  </button>
                ))}
              {totals.tarefasAtrasadas === 0 && totals.semProximaAcao === 0 && totals.noShowPeriodo === 0 && (
                <div className="text-sm text-muted-foreground">Sem alertas no momento. Tudo em dia! ✅</div>
              )}
            </div>
          </Card>

          {/* Ranking destaque */}
          {top && (
            <Card className="p-4 bg-primary/5 border-primary/30">
              <div className="flex items-center gap-3">
                <Trophy className="h-8 w-8 text-amber-500" />
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Destaque do período</div>
                  <div className="text-lg font-bold">{top.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {top.matriculasPeriodo} matrículas · {top.entrevistasRealizadasPeriodo} entrevistas realizadas · {top.tarefasConcluidasPeriodo} tarefas concluídas
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Tabela completa */}
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card">Vendedor</TableHead>
                    <TableHead className="text-right" title="Leads novos no período">Novos</TableHead>
                    <TableHead className="text-right" title="Tarefas pendentes hoje">Tar. hoje</TableHead>
                    <TableHead className="text-right" title="Tarefas concluídas no período">Tar. concl.</TableHead>
                    <TableHead className="text-right" title="Tarefas atrasadas">Atrasadas</TableHead>
                    <TableHead className="text-right" title="Leads ativos sem próxima ação">S/ ação</TableHead>
                    <TableHead className="text-right" title="Entrevistas marcadas no período">Ent. marc.</TableHead>
                    <TableHead className="text-right" title="Entrevistas realizadas no período">Ent. real.</TableHead>
                    <TableHead className="text-right" title="No-show no período">No-show</TableHead>
                    <TableHead className="text-right" title="Matrículas no período">Matríc.</TableHead>
                    <TableHead className="text-right" title="Perdidos no período">Perd.</TableHead>
                    <TableHead className="text-right" title="Taxa de comparecimento">% Comp.</TableHead>
                    <TableHead className="text-right" title="Taxa de matrícula sobre entrevistas realizadas">% Matr.</TableHead>
                    <TableHead className="text-right" title="Resgates ativados no período">Resgates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-8">Sem vendedores ativos</TableCell></TableRow>
                  )}
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="sticky left-0 bg-card font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.novosPeriodo}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.tarefasHoje}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.tarefasConcluidasPeriodo}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.tarefasAtrasadas > 0 ? <Badge variant="destructive">{r.tarefasAtrasadas}</Badge> : "0"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.semProximaAcao > 0 ? <Badge variant="outline" className="border-amber-500/40 text-amber-700">{r.semProximaAcao}</Badge> : "0"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.entrevistasMarcadasPeriodo}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.entrevistasRealizadasPeriodo}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.noShowPeriodo}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{r.matriculasPeriodo}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.perdidosPeriodo}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.taxaComparecimento}%</TableCell>
                      <TableCell className="text-right tabular-nums">{r.taxaMatricula}%</TableCell>
                      <TableCell className="text-right tabular-nums">{r.resgatesPeriodo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm"><Link to="/dashboard">Voltar ao dashboard</Link></Button>
          </div>
        </>
      )}
    </div>
  );
}
