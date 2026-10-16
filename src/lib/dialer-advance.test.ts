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
