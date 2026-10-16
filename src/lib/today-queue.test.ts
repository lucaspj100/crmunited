import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { neededProspectIds } from "./today-queue";

const t = (o: Partial<{ type: string; prospect_contact_id: string | null; due_date: string; status: string }>) =>
  ({ type: "retorno_ligacao", prospect_contact_id: "p1", due_date: "2026-10-16", status: "pendente", ...o });

describe("neededProspectIds", () => {
  it("inclui retornos de hoje e atrasados", () => {
    expect(neededProspectIds([t({}), t({ prospect_contact_id: "p2", due_date: "2026-10-01" })], "2026-10-16").sort()).toEqual(["p1", "p2"]);
  });
  it("exclui retornos futuros", () => {
    expect(neededProspectIds([t({ due_date: "2026-10-17" })], "2026-10-16")).toEqual([]);
  });
  it("exclui outros tipos e tarefas sem contato", () => {
    expect(neededProspectIds([t({ type: "followup" }), t({ prospect_contact_id: null })], "2026-10-16")).toEqual([]);
  });
  it("não repete o mesmo contato", () => {
    expect(neededProspectIds([t({}), t({})], "2026-10-16")).toEqual(["p1"]);
  });
});

import { buildTodayQueue, type HojeData } from "./today-queue";

describe("buildTodayQueue com contatos reduzidos (dados fictícios)", () => {
  const ME = "u1", OTHER = "u2";
  const task = (id: string, o: Record<string, unknown>) => ({
    id, lead_id: null, type: "retorno_ligacao", due_date: "2026-10-16", due_time: "10:00",
    observation: null, status: "pendente", owner_id: ME, is_rescue: false, prospect_contact_id: null, ...o,
  });
  const pc = (id: string, owner = ME) => ({ id, nome: id, empresa: null, cargo: null, telefone_normalizado: null, telefone_original: null, observacao: null, vendedor_responsavel_id: owner });
  const lead = (id: string, o: Record<string, unknown> = {}) => ({
    id, name: id, phone: null, company: null, status: "interessado", owner_id: ME, observation: null,
    interview_date: null, interview_time: null, last_contact_at: "2026-10-10T10:00:00Z", next_followup_at: null,
    lost_reason: null, in_rescue: false, created_at: "2026-10-01T00:00:00Z", ...o,
  });
  const tasks = [
    task("hoje", { prospect_contact_id: "pHoje", due_time: "15:00" }),
    task("atrasado", { prospect_contact_id: "pAtr", due_date: "2026-10-10" }),
    task("futuro", { prospect_contact_id: "pFut", due_date: "2026-10-20" }),
    task("dup1", { prospect_contact_id: "pDup", due_date: "2026-10-12" }),
    task("dup2", { prospect_contact_id: "pDup", due_date: "2026-10-14" }),
    task("outro", { prospect_contact_id: "pOutro", owner_id: OTHER }),
    task("fu", { type: "followup", lead_id: "L1", prospect_contact_id: null, due_time: "09:00" }),
  ];
  const allProspects = ["pHoje", "pAtr", "pFut", "pDup", "pOutro"].map((id) => pc(id, id === "pOutro" ? OTHER : ME));
  const base = { leads: [lead("L1"), lead("L2", { status: "novo", last_contact_at: null })], tasks, profiles: [] } as unknown as Omit<HojeData, "prospects">;
  const today = "2026-10-16";
  const run = (prospects: unknown[], o = { userId: ME, isAdmin: false, vendor: "me" }) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-16T15:00:00-03:00"));
    const r = buildTodayQueue({ ...base, prospects } as HojeData, o);
    vi.useRealTimers(); return r;
  };
  const needed = () => { const ids = new Set(neededProspectIds(tasks as never, today)); return allProspects.filter((p) => ids.has(p.id)); };

  it("fila idêntica (itens e ordem) à versão com todos os contatos", () => {
    expect(run(needed()).map((i) => i.key)).toEqual(run(allProspects).map((i) => i.key));
    const adm = { userId: ME, isAdmin: true, vendor: "all" };
    expect(run(needed(), adm).map((i) => i.key)).toEqual(run(allProspects, adm).map((i) => i.key));
  });
  it("retorno de hoje e atrasado aparecem; futuro não", () => {
    const keys = run(needed()).map((i) => i.key);
    expect(keys).toContain("task:hoje");
    expect(keys).toContain("task:atrasado");
    expect(keys).not.toContain("task:futuro");
  });
  it("sem duplicidade de contato nem de tarefa; vale o retorno mais antigo", () => {
    const q = run(needed());
    const keys = q.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("task:dup1");
    expect(keys).not.toContain("task:dup2");
  });
  it("vendedor não vê retorno de outro vendedor", () => {
    expect(run(needed()).map((i) => i.key)).not.toContain("task:outro");
  });
  it("ordem: retornos por data/hora, depois follow-up, depois lead novo", () => {
    expect(run(needed()).map((i) => i.key)).toEqual(["task:atrasado", "task:dup1", "task:hoje", "task:fu", "lead:L2"]);
  });
  it("contador do menu = tamanho da fila do próprio usuário", () => {
    expect(run(needed()).length).toBe(5);
  });
});

import { loadHojeData, HOJE_RETRY, HOJE_RETRY_DELAY_MS } from "./today-queue";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

// Cliente falso: nenhuma chamada ao banco real.
function fakeClient(opts: { failProspectCall?: (n: number) => boolean; nProspects?: number } = {}) {
  const n = opts.nProspects ?? 250;
  const tasks = Array.from({ length: n }, (_, i) => ({ id: `t${i}`, type: "retorno_ligacao", status: "pendente", prospect_contact_id: `p${i}`, due_date: "2026-10-16", owner_id: "u1", lead_id: null, is_rescue: false, due_time: null, observation: null }));
  let prospectCalls = 0;
  const calls = { prospect: 0, total: 0 };
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    let ids: string[] = [];
    let ranged = false;
    const self = b as never;
    Object.assign(b, {
      select: () => self, eq: () => self, order: () => self, limit: () => self,
      range: (from: number) => { ranged = from === 0; return self; },
      in: (_c: string, v: string[]) => { ids = v; return self; },
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) => {
        calls.total++;
        let out: unknown;
        if (table === "prospect_contacts") {
          calls.prospect++; prospectCalls++;
          out = opts.failProspectCall?.(prospectCalls) ? { data: null, error: { message: "timeout" } } : { data: ids.map((id) => ({ id })), error: null };
        } else if (table === "tasks") out = { data: ranged ? tasks : [], error: null };
        else out = { data: [], error: null };
        return Promise.resolve(out).then(res, rej);
      },
    });
    return b;
  };
  return { client: { from: builder }, calls };
}

describe("loadHojeData (falhas)", () => {
  it("tudo certo: carrega todos os lotes (250 contatos = 2 lotes)", async () => {
    const { client, calls } = fakeClient();
    const d = await loadHojeData(client, "2026-10-16");
    expect(d.prospects).toHaveLength(250);
    expect(calls.prospect).toBe(2);
  });
  it("falha parcial (2º lote) lança erro em vez de devolver lista incompleta", async () => {
    const { client } = fakeClient({ failProspectCall: (n) => n === 2 });
    await expect(loadHojeData(client, "2026-10-16")).rejects.toThrow("hoje_prospects_failed");
  });
});

describe("comportamento da consulta (React Query)", () => {
  const today = "2026-10-16";
  const make = (client: unknown) => {
    const qc = new QueryClient();
    const obs = new QueryObserver(qc, { queryKey: ["hoje"], queryFn: () => loadHojeData(client, today), retry: HOJE_RETRY, retryDelay: 10 });
    return { qc, obs };
  };
  it("configuração: só 1 nova tentativa, 1,5 s", () => {
    expect(HOJE_RETRY).toBe(1);
    expect(HOJE_RETRY_DELAY_MS).toBe(1500);
  });
  it("recuperação: falha na 1ª tentativa, nova tentativa dá certo", async () => {
    const { client, calls } = fakeClient({ failProspectCall: (n) => n === 1 });
    const { obs } = make(client);
    const r = await obs.refetch();
    expect(r.isSuccess).toBe(true);
    expect(r.data?.prospects).toHaveLength(250);
    expect(calls.prospect).toBe(3); // 1 falha + 2 lotes da nova tentativa
  });
  it("falha persistente: para após 1 nova tentativa e mantém os dados bons anteriores", async () => {
    let failing = false;
    const { client, calls } = fakeClient({ failProspectCall: () => failing });
    const { obs } = make(client);
    const ok = await obs.refetch();
    expect(ok.data?.prospects).toHaveLength(250);
    failing = true;
    const before = calls.prospect;
    const r = await obs.refetch();
    expect(r.isError).toBe(true);
    expect(r.data?.prospects).toHaveLength(250); // fila válida preservada
    expect(calls.prospect - before).toBe(2); // 1 tentativa + 1 nova tentativa, sem ciclo
  });
  it("sem requisições simultâneas duplicadas", async () => {
    const { client, calls } = fakeClient();
    const { qc } = make(client);
    const fn = () => loadHojeData(client, today);
    await Promise.all([qc.fetchQuery({ queryKey: ["hoje"], queryFn: fn }), qc.fetchQuery({ queryKey: ["hoje"], queryFn: fn }), qc.fetchQuery({ queryKey: ["hoje"], queryFn: fn })]);
    expect(calls.prospect).toBe(2);
  });
});
