// La red de actividades de ejemplo COMPARTIDA (shared/schedule-sample.ts) es una copia de la que siembran «Definir las
// Actividades» y Cronograma/CPM en el proyecto real. Esta prueba de oro impide que se desalineen: con inicio
// 2026-07-06 el CPM da 273 días laborables, 34 nodos críticos y fin 2027-07-21 (ARCHITECTURE.md, «Dataset de
// referencia (DISTRIB+)»; cifras verificadas en Chrome real con el proyecto completo).
import { describe, expect, it } from "vitest";
import { cpm, scheduleNetwork } from "../../src/core/gpi-core";
import { SAMPLE_LINK_PLAN, SAMPLE_START_DATE, sampleScheduleModules } from "../../src/shared/schedule-sample";

const net = () => { const m = sampleScheduleModules(); return scheduleNetwork(m.wbs, m.activities, null, m.schedule, null, SAMPLE_START_DATE); };

describe("red de ejemplo DISTRIB+ (fuente compartida)", () => {
  it("43 actividades + 3 hitos, y ningún enlace del plan queda sin resolver", () => {
    const n = net();
    expect(n.nodes.filter((x) => !x.isMilestone)).toHaveLength(43);
    expect(n.nodes.filter((x) => x.isMilestone).map((x) => x.code)).toEqual(["H1", "H2", "H3"]);
    expect(n.links).toHaveLength(SAMPLE_LINK_PLAN.length);
    expect(n.nodes.every((x) => x.hasDur)).toBe(true);                       // todas tienen metrado y rendimiento
  });
  it("prueba de oro del CPM: 273 días laborables, 34 críticos, fin 2027-07-21", () => {
    const n = net(), r = cpm(n.nodes.map((x) => ({ id: x.id, dur: x.dur })), n.links, n.calendar, { startDate: n.startDate });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.projectDuration).toBe(273);
    expect(r.criticalIds).toHaveLength(34);
    expect(r.projectFinishDate).toBe("2027-07-21");
  });
  it("los hitos quedan donde el módulo de Actividades los pone (H1 al inicio, H2 en 4.2, H3 al final) y el orden sigue la EDT", () => {
    const n = net(), codes = n.nodes.map((x) => x.code);
    expect(codes[0]).toBe("H1");
    expect(codes[codes.length - 1]).toBe("H3");
    expect(n.nodes.find((x) => x.code === "H2")!.leafId).toBe("w-4.2");
    expect(codes.indexOf("4.2.5")).toBeLessThan(codes.indexOf("H2"));
    expect(codes.indexOf("H2")).toBeLessThan(codes.indexOf("4.3.1"));
  });
});
