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
