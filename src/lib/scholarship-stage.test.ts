import { describe, expect, it } from "vitest";
import { decideFormStageChange, LOST_REASON_FORM } from "@/lib/scholarship";

const base = { created: false, currentStatus: "novo", currentLostReason: null, classification: "curioso", formCompleted: false, hasSchedule: false };

describe("mudança automática de etapa pelo formulário", () => {
  it("A: curioso + incompleto → permanece em Novo", () => {
    expect(decideFormStageChange(base)).toBeNull();
    expect(decideFormStageChange({ ...base, created: true })).toBeNull();
  });
  it("B: sem_fit_financeiro + incompleto → permanece em Novo", () => {
    expect(decideFormStageChange({ ...base, classification: "sem_fit_financeiro" })).toBeNull();
  });
  it("C: curioso + concluído + sem agendamento → Perdido", () => {
    expect(decideFormStageChange({ ...base, formCompleted: true })).toBe("disqualify");
  });
  it("D: sem_fit_financeiro + concluído + sem agendamento → Perdido", () => {
    expect(decideFormStageChange({ ...base, classification: "sem_fit_financeiro", formCompleted: true, created: true })).toBe("disqualify");
  });
  it("E: perdido por desqualificado_formulario + agendamento → reativa", () => {
    expect(decideFormStageChange({ ...base, currentStatus: "perdido", currentLostReason: LOST_REASON_FORM, classification: "quente", formCompleted: true, hasSchedule: true })).toBe("reactivate");
  });
  it("F: perdido por outro motivo → não reativa", () => {
    for (const r of ["sem_interesse", "achou_caro", null]) {
      expect(decideFormStageChange({ ...base, currentStatus: "perdido", currentLostReason: r, hasSchedule: true, formCompleted: true })).toBeNull();
      expect(decideFormStageChange({ ...base, currentStatus: "perdido", currentLostReason: r, formCompleted: true })).toBeNull();
    }
  });
  it("G: com agendamento nunca desqualifica", () => {
    expect(decideFormStageChange({ ...base, formCompleted: true, hasSchedule: true })).toBeNull();
    expect(decideFormStageChange({ ...base, formCompleted: true, hasSchedule: true, created: true })).toBeNull();
  });
  it("H: etapas avançadas não mudam", () => {
    for (const s of ["interessado", "entrevista_marcada", "matricula"]) {
      expect(decideFormStageChange({ ...base, currentStatus: s, formCompleted: true })).toBeNull();
      expect(decideFormStageChange({ ...base, currentStatus: s, formCompleted: true, hasSchedule: true })).toBeNull();
    }
  });
});
