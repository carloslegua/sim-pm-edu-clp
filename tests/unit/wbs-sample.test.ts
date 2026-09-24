// Coherencia del diccionario de la EDT del ejemplo con la EDT DISTRIB+ compartida (regla #6 de CLAUDE.md).
import { describe, expect, it } from "vitest";
import { SAMPLE_WBS_DICTIONARY } from "../../src/shared/wbs-sample";
import { sampleScheduleModules } from "../../src/shared/schedule-sample";
import { analyzeWbs } from "../../src/shared/wbs-quality";

describe("wbs-sample: diccionario del ejemplo", () => {
  it("cubre exactamente los 18 paquetes de trabajo de la EDT DISTRIB+ (mismos códigos)", () => {
    const q = analyzeWbs(sampleScheduleModules().wbs);
    const hojas = Object.keys(q.codes).filter((id) => id !== "w-0" && !(sampleScheduleModules().wbs.nodes[id].children || []).length).map((id) => q.codes[id]);
    expect(hojas.length).toBe(18);
    expect(Object.keys(SAMPLE_WBS_DICTIONARY).sort()).toEqual([...hojas].sort());
  });
  it("cada entrada tiene descripción y criterio de aceptación con contenido; solo el seguimiento (1.3) es esfuerzo continuo", () => {
    Object.entries(SAMPLE_WBS_DICTIONARY).forEach(([code, e]) => {
      expect(e.notes.trim().length, code).toBeGreaterThan(30);
      expect(e.acceptance.trim().length, code).toBeGreaterThan(20);
    });
    expect(Object.entries(SAMPLE_WBS_DICTIONARY).filter(([, e]) => e.loe).map(([c]) => c)).toEqual(["1.3"]);
  });
});
