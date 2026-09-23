import { describe, expect, it } from "vitest";
import { needsFormTriage, shouldAutoDisqualify, SCHOLARSHIP_SYSTEM, SCHEDULING_SOURCE_FORM } from "@/lib/scholarship";

const base = { source_system: SCHOLARSHIP_SYSTEM, status: "novo" } as const;

describe("triagem do processo bolsista", () => {
  it("A: curioso sem agendamento → desqualificação automática", () => {
    expect(shouldAutoDisqualify({ ...base, scholarship_classification: "curioso" })).toBe(true);
  });

  it("B: sem_fit_financeiro sem agendamento → desqualificação automática", () => {
    expect(shouldAutoDisqualify({ ...base, scholarship_classification: "sem_fit_financeiro" })).toBe(true);
  });

  it("C: morno concluído sem agendar → fica em Novo e aparece na triagem", () => {
    const lead = { ...base, scholarship_classification: "morno", form_completed: true };
    expect(shouldAutoDisqualify(lead)).toBe(false);
    expect(needsFormTriage(lead)).toBe(true);
  });

  it("D: quente sem agendamento → triagem, nunca automático", () => {
    const lead = { ...base, scholarship_classification: "quente" };
    expect(shouldAutoDisqualify(lead)).toBe(false);
    expect(needsFormTriage(lead)).toBe(true);
  });

  it("E: agendou pelo formulário → fluxo normal, fora da triagem", () => {
    const lead = {
      ...base,
      scholarship_classification: "curioso",
      requested_interview_at: "2026-10-01T14:00:00.000Z",
      scheduling_source: SCHEDULING_SOURCE_FORM,
    };
    expect(shouldAutoDisqualify(lead)).toBe(false);
    expect(needsFormTriage(lead)).toBe(false);
  });

  it("G: lead fora do processo bolsista não é afetado", () => {
    const lead = { source: "Discador", status: "novo", scholarship_classification: "curioso" };
    expect(shouldAutoDisqualify(lead)).toBe(false);
    expect(needsFormTriage(lead)).toBe(false);
  });

  it("não traz leads já avançados ou perdidos para a triagem", () => {
    for (const status of ["perdido", "matricula", "interessado", "entrevista_marcada"]) {
      expect(needsFormTriage({ ...base, status })).toBe(false);
    }
  });
});
