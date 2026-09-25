// La red de actividades de ejemplo COMPARTIDA (shared/schedule-sample.ts) es una copia de la que siembran «Definir las
// Actividades» y Cronograma/CPM en el proyecto real. Esta prueba de oro impide que se desalineen: con inicio
// 2026-07-06 y el calendario del caso (lunes a viernes, feriados del 28 y 29 de julio) el CPM da 273 días laborables, 34
// nodos críticos y fin 2027-07-23 (ARCHITECTURE.md, «Dataset de referencia (DISTRIB+)»).
import { describe, expect, it } from "vitest";
import { cpm, holidayDates, projectCalendar, scheduleNetwork } from "../../src/core/gpi-core";
import { SAMPLE_CALENDAR, SAMPLE_LINK_PLAN, SAMPLE_START_DATE, sampleScheduleModules, sampleSchedulePlan } from "../../src/shared/schedule-sample";

const net = () => { const m = sampleScheduleModules(); return scheduleNetwork(m.wbs, m.activities, null, m.schedule, sampleSchedulePlan(), SAMPLE_START_DATE); };

describe("red de ejemplo DISTRIB+ (fuente compartida)", () => {
  it("43 actividades + 3 hitos, y ningún enlace del plan queda sin resolver", () => {
    const n = net();
    expect(n.nodes.filter((x) => !x.isMilestone)).toHaveLength(43);
    expect(n.nodes.filter((x) => x.isMilestone).map((x) => x.code)).toEqual(["H1", "H2", "H3"]);
    expect(n.links).toHaveLength(SAMPLE_LINK_PLAN.length);
    expect(n.nodes.every((x) => x.hasDur)).toBe(true);                       // todas tienen metrado y rendimiento
  });
  it("prueba de oro del CPM: 273 días laborables, 34 críticos, fin 2027-07-23 con el calendario del caso", () => {
    const n = net(), r = cpm(n.nodes.map((x) => ({ id: x.id, dur: x.dur })), n.links, n.calendar, { startDate: n.startDate });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.projectDuration).toBe(273);
    expect(r.criticalIds).toHaveLength(34);
    expect(r.projectFinishDate).toBe("2027-07-23");
  });
  it("REPRO (auditoría, alta): los feriados del Plan del Cronograma ({date, name}) se aplican; antes se ignoraban y el fin era el 2027-07-21", () => {
    expect(projectCalendar(sampleSchedulePlan()).holidays).toEqual(["2026-07-28", "2026-07-29", "2026-08-30"]);
    expect(holidayDates(["2026-07-28", { date: "2026-07-29", name: "x" }, { name: "sin fecha" }, "no es fecha", null])).toEqual(["2026-07-28", "2026-07-29"]);
    expect(projectCalendar(sampleSchedulePlan()).workDayIdx).toEqual([1, 2, 3, 4, 5]);                     // un solo calendario: lunes a viernes
    expect(SAMPLE_CALENDAR.workDays).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie"]);
    const n = net(), sin = cpm(n.nodes.map((x) => ({ id: x.id, dur: x.dur })), n.links, { ...n.calendar, holidays: [] }, { startDate: n.startDate });
    expect(sin.ok && sin.projectFinishDate).toBe("2027-07-21");                                            // los dos feriados laborables corren el fin dos días
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
