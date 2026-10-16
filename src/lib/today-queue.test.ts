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
