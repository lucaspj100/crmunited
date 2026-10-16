import { describe, it, expect } from "vitest";
import { pickLocalNext, pickNextContactId } from "./dialer-advance";

describe("pickLocalNext (avanço sem esperar o banco)", () => {
  it("avança para o contato seguinte ao trabalhado", () => {
    expect(pickLocalNext(["a", "b", "c"], "b")).toBe("c");
  });
  it("no fim da fila, volta para a mesma posição sem repetir o trabalhado", () => {
    expect(pickLocalNext(["a", "b", "c"], "c")).toBe("b");
  });
  it("não reapresenta contatos já trabalhados nesta sessão", () => {
    expect(pickLocalNext(["a", "b", "c", "d"], "a", new Set(["b"]))).toBe("c");
  });
  it("último contato da fila: retorna null para buscar dados novos", () => {
    expect(pickLocalNext(["a"], "a")).toBeNull();
    expect(pickLocalNext(["a", "b"], "a", new Set(["b"]))).toBeNull();
  });
  it("contato atual fora da fila (ex.: retorno em foco): usa o topo", () => {
    expect(pickLocalNext(["a", "b"], "x")).toBe("a");
  });
});

describe("pickNextContactId (após dados novos)", () => {
  it("prefere o primeiro posterior ainda disponível", () => {
    expect(pickNextContactId(["a", "b", "c", "d"], "a", ["a", "c", "d"])).toBe("c");
  });
  it("fila vazia retorna null", () => {
    expect(pickNextContactId(["a"], "a", [])).toBeNull();
  });
  it("só sobrou o próprio contato: mantém ele (comportamento original)", () => {
    expect(pickNextContactId(["a"], "a", ["a"])).toBe("a");
  });
});

import { shouldApplyRemoteContact } from "./dialer-advance";
describe("shouldApplyRemoteContact (sincronização entre aparelhos)", () => {
  const base = { remote: "A", current: "B", seqNow: 5, pendingWrites: 0, localWriteFailed: false, worked: new Set<string>() };
  it("resposta antiga chegando depois do avanço é descartada", () => {
    expect(shouldApplyRemoteContact({ ...base, seqAtStart: 4 })).toBe(false);
  });
  it("gravação do contato atual demorando (>2s) bloqueia a resposta", () => {
    expect(shouldApplyRemoteContact({ ...base, seqAtStart: 5, pendingWrites: 1 })).toBe(false);
  });
  it("falha na gravação: não volta ao valor antigo do banco", () => {
    expect(shouldApplyRemoteContact({ ...base, seqAtStart: 5, localWriteFailed: true })).toBe(false);
  });
  it("recém-trabalhado ainda elegível não volta à tela", () => {
    expect(shouldApplyRemoteContact({ ...base, seqAtStart: 5, worked: new Set(["A"]) })).toBe(false);
  });
  it("mudança legítima de outro aparelho é aplicada", () => {
    expect(shouldApplyRemoteContact({ ...base, remote: "C", seqAtStart: 5 })).toBe(true);
    expect(shouldApplyRemoteContact({ ...base, remote: "C" })).toBe(true); // Realtime
  });
  it("navegação rápida: cada navegação invalida a consulta anterior", () => {
    expect(shouldApplyRemoteContact({ ...base, seqAtStart: 2, seqNow: 7 })).toBe(false);
  });
  it("mesmo contato da tela não dispara nada (sem ciclo)", () => {
    expect(shouldApplyRemoteContact({ ...base, remote: "B", seqAtStart: 5 })).toBe(false);
  });
});

import { vi } from "vitest";
import { SessionSyncWriter } from "./dialer-advance";

function setup(results: boolean[], opts: { slow?: boolean } = {}) {
  let t = 1000;
  const timers: { fn: () => void; ms: number }[] = [];
  let inFlight = 0, maxInFlight = 0;
  const calls: (string | null)[] = [];
  const resolvers: ((v: boolean) => void)[] = [];
  const save = vi.fn(async (id: string | null) => {
    calls.push(id); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    const r = opts.slow ? await new Promise<boolean>((res) => resolvers.push(res)) : (results.shift() ?? false);
    inFlight--; return r;
  });
  const onSynced = vi.fn(), onGiveUp = vi.fn();
  const w = new SessionSyncWriter({
    save, onSynced, onGiveUp, now: () => t,
    schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length as never; },
    cancel: () => { timers.length = 0; },
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const fire = async () => { const x = timers.shift(); t += x!.ms; x!.fn(); await flush(); return x!.ms; };
  return { w, calls, timers, onSynced, onGiveUp, flush, fire, resolvers, max: () => maxInFlight };
}

describe("SessionSyncWriter (limite de tentativas da sincronização)", () => {
  it("sucesso na primeira tentativa", async () => {
    const s = setup([true]); s.w.write("B"); await s.flush();
    expect(s.calls).toEqual(["B"]); expect(s.onSynced).toHaveBeenCalledWith("B"); expect(s.w.busy).toBe(false);
  });
  it("sucesso após uma e após duas falhas, com intervalos crescentes", async () => {
    const a = setup([false, true]); a.w.write("B"); await a.flush();
    expect(await a.fire()).toBe(2000); expect(a.onSynced).toHaveBeenCalledWith("B");
    const b = setup([false, false, true]); b.w.write("B"); await b.flush();
    expect(await b.fire()).toBe(2000); expect(await b.fire()).toBe(4000);
    expect(b.calls).toHaveLength(3); expect(b.onSynced).toHaveBeenCalledTimes(1);
  });
  it("falha persistente: 1 + 3 tentativas, depois libera e avisa", async () => {
    const s = setup([false, false, false, false, false]); s.w.write("B"); await s.flush();
    await s.fire(); await s.fire(); expect(await s.fire()).toBe(8000);
    expect(s.calls).toHaveLength(4); expect(s.timers).toHaveLength(0);
    expect(s.onGiveUp).toHaveBeenCalledTimes(1); expect(s.w.busy).toBe(false); expect(s.w.gaveUpAt).toBeGreaterThan(0);
  });
  it("navegação durante tentativa pendente cancela a antiga", async () => {
    const s = setup([false, true]); s.w.write("B"); await s.flush();
    expect(s.timers).toHaveLength(1); s.w.write("C"); await s.flush();
    expect(s.calls).toEqual(["B", "C"]); expect(s.timers).toHaveLength(0); expect(s.onSynced).toHaveBeenCalledWith("C");
  });
  it("nunca há duas gravações ao mesmo tempo para uma mesma seleção", async () => {
    const s = setup([], { slow: true }); s.w.write("B"); await s.flush();
    expect(s.w.busy).toBe(true); s.resolvers.shift()!(false); await s.flush();
    expect(s.max()).toBe(1); expect(s.timers).toHaveLength(1);
  });
  it("só grava a sessão — não repete a tentativa de ligação", async () => {
    const s = setup([false, false, false, false]); s.w.write("B"); await s.flush();
    await s.fire(); await s.fire(); await s.fire();
    expect(s.calls.every((c) => c === "B")).toBe(true); // mesma chamada de sessão; nenhuma outra escrita
  });
});

describe("leitura após esgotar as tentativas", () => {
  it("resposta antiga (lida antes da desistência) é ignorada; nova leitura é aceita", () => {
    const gaveUpAt = 5000;
    const accept = (readStartedAt: number) => readStartedAt > gaveUpAt;
    expect(accept(4000)).toBe(false);
    expect(accept(6000)).toBe(true);
  });
  it("outro aparelho durante a falha é ignorado enquanto há tentativas, aceito depois", () => {
    const base = { remote: "C", current: "B", seqNow: 1, localWriteFailed: false, worked: new Set<string>() };
    expect(shouldApplyRemoteContact({ ...base, pendingWrites: 1 })).toBe(false);
    expect(shouldApplyRemoteContact({ ...base, pendingWrites: 0 })).toBe(true);
  });
});
