// Avance real y pronóstico del cronograma (auditoría, media): el CPM se recalcula sobre lo que FALTA, con la fecha de corte como inicio mínimo.
import { describe, expect, it } from "vitest";
import { cpm, scheduleNetwork } from "../../src/core/gpi-core";
import { computeForecast, normalizeProgress, spreadPackagePct, workOffset, type CpmFnP } from "../../src/shared/schedule-progress";
import { SAMPLE_START_DATE, sampleScheduleModules, sampleSchedulePlan } from "../../src/shared/schedule-sample";
import { EVM_SAMPLE_PERCENT, EVM_SAMPLE_STATUS_DATE } from "../../src/shared/evm-sample";

const CPM = cpm as unknown as CpmFnP;
const CAL = { workDayIdx: [1, 2, 3, 4, 5], holidays: [] as string[] };
// A(10) → B(10) → C(10) y D(5) en paralelo hacia C; inicio lunes 2026-07-06 (offset 0)
const chain = () => ({
  nodes: [{ id: "a", dur: 10, isMilestone: false, code: "1.1", name: "A" }, { id: "b", dur: 10, isMilestone: false, code: "1.2", name: "B" }, { id: "c", dur: 10, isMilestone: false, code: "1.3", name: "C" }],
  links: [{ from: "a", to: "b", type: "FS" as const }, { from: "b", to: "c", type: "FS" as const }],
  calendar: CAL, startDate: "2026-07-06", cpm: CPM
});

describe("cpm con inicio mínimo (minStart)", () => {
  it("sin minStart el resultado es el de siempre; con minStart, la actividad no empieza antes", () => {
    const c = chain(), links = c.links as never;
    expect((cpm([{ id: "a", dur: 10 }, { id: "b", dur: 10 }], links, CAL as never, { startDate: "2026-07-06" }) as { projectDuration: number }).projectDuration).toBe(20);
    const r = cpm([{ id: "a", dur: 10, minStart: 5 }, { id: "b", dur: 10 }], links, CAL as never, { startDate: "2026-07-06" }) as { projectDuration: number; rows: Record<string, { es: number }> };
    expect(r.rows.a.es).toBe(5); expect(r.projectDuration).toBe(25);
  });
});

describe("workOffset", () => {
  it("cuenta días laborables desde el inicio sin contar la fecha; salta fines de semana y feriados", () => {
    expect(workOffset("2026-07-06", "2026-07-06", CAL)).toBe(0);
    expect(workOffset("2026-07-06", "2026-07-13", CAL)).toBe(5);                // lunes a lunes: 5 laborables
    expect(workOffset("2026-07-06", "2026-07-11", CAL)).toBe(5);                // sábado: el offset es el del lunes siguiente
    expect(workOffset("2026-07-06", "2026-07-13", { ...CAL, holidays: ["2026-07-08"] })).toBe(4);
    expect(workOffset("2026-07-06", "2026-07-01", CAL)).toBe(0);                // antes del inicio
    expect(workOffset("", "2026-07-01", CAL)).toBeNull();
  });
});

describe("normalizeProgress", () => {
  it("recorta a 0–100, descarta basura y exige una fecha ISO", () => {
    expect(normalizeProgress({ statusDate: "2026-08-01", pct: { a: 150, b: -5, c: "x", d: "", e: 42.34 } })).toEqual({ statusDate: "2026-08-01", pct: { a: 100, b: 0, e: 42.3 } });
    expect(normalizeProgress({ statusDate: "01/08/2026" }).statusDate).toBe(""); expect(normalizeProgress(null)).toEqual({ statusDate: "", pct: {} });
  });
});

describe("computeForecast", () => {
  it("sin fecha de corte o sin inicio del proyecto: no calcula y dice por qué", () => {
    expect(computeForecast({ ...chain(), progress: { statusDate: "", pct: {} } })).toMatchObject({ ok: false, reason: expect.stringMatching(/fecha de corte/) });
    expect(computeForecast({ ...chain(), startDate: "", progress: { statusDate: "2026-07-20", pct: {} } })).toMatchObject({ ok: false, reason: expect.stringMatching(/fecha de inicio/) });
  });
  it("REPRO: A terminada y en plazo, corte a mitad de B (50 %): el fin se mantiene; si B va al 20 % el fin se corre", () => {
    // corte 2026-07-20 = offset 10 (A terminó a tiempo). B (10 d) planificada del 10 al 20.
    const enPlazo = computeForecast({ ...chain(), progress: { statusDate: "2026-07-20", pct: { a: 100, b: 0 } } });
    expect(enPlazo).toMatchObject({ ok: true, planDuration: 30, forecastDuration: 30, delayDays: 0, done: 1, notStarted: 2 });
    // corte 2026-07-27 = offset 15: B debería ir a mitad (50 %) — con 20 % le quedan 8 d → termina en el 23 → fin 31 (+1)
    const atrasada = computeForecast({ ...chain(), progress: { statusDate: "2026-07-27", pct: { a: 100, b: 20 } } });
    expect(atrasada.forecastDuration).toBe(15 + 8 + 10); expect(atrasada.delayDays).toBe(3); expect(atrasada.pctPlanned).toBeCloseTo((10 + 5) / 30 * 100, 1);
    expect(atrasada.pctActual).toBeCloseTo((10 + 2) / 30 * 100, 1); expect(atrasada.spiT).toBeCloseTo(12 / 15, 2);
    expect(atrasada.late.map((l) => l.code)).toEqual(["1.2", "1.3"]); expect(atrasada.late[0].slipDays).toBe(3);
  });
  it("un corte con todo sin empezar y adelantado al plan no puede adelantar el fin; lo terminado no ocupa tiempo", () => {
    const todo = computeForecast({ ...chain(), progress: { statusDate: "2026-07-20", pct: {} } });
    expect(todo.forecastDuration).toBe(40);   // A no se hizo: el corte (offset 10) manda: 10 + 30
    expect(todo.delayDays).toBe(10);
    const listo = computeForecast({ ...chain(), progress: { statusDate: "2026-07-20", pct: { a: 100, b: 100, c: 100 } } });
    expect(listo.forecastDuration).toBe(0); expect(listo.done).toBe(3);
  });
  it("contra la línea base: días de diferencia del pronóstico con la duración aprobada", () => {
    const f = computeForecast({ ...chain(), baselineDuration: 28, baselineFinish: "2026-08-12", progress: { statusDate: "2026-07-27", pct: { a: 100, b: 20 } } });
    expect(f.vsBaselineDays).toBe(5); expect(f.baselineFinish).toBe("2026-08-12");
  });
  it("los hitos no se fijan al corte", () => {
    const c = chain(); c.nodes.push({ id: "h", dur: 0, isMilestone: true, code: "H1", name: "Hito" }); (c.links as Array<{ from: string; to: string; type: "FS" }>).push({ from: "a", to: "h", type: "FS" });
    const f = computeForecast({ ...c, progress: { statusDate: "2026-07-27", pct: { a: 100, b: 50 } } });
    expect(f.ok).toBe(true); expect(f.done).toBe(1);
  });
});

describe("spreadPackagePct", () => {
  it("las primeras actividades del paquete se completan y la última queda parcial (por duración)", () => {
    const r = spreadPackagePct([{ id: "x1", code: "3.1.1", dur: 4 }, { id: "x2", code: "3.1.2", dur: 4 }, { id: "x3", code: "3.1.3", dur: 2 }, { id: "y1", code: "2.4.1", dur: 5 }], { "3.1": 90, "2.4": 100 });
    expect(r).toEqual({ x1: 100, x2: 100, x3: 50, y1: 100 });
    expect(spreadPackagePct([{ id: "z", code: "9.9.1", dur: 3 }], { "1.1": 100 })).toEqual({});
  });
});

describe("caso de oro DISTRIB+: el avance de Valor Ganado al corte 2026-11-03 traducido a actividades", () => {
  it("calcula un pronóstico coherente con la red (273 d) y con el avance del ejemplo", () => {
    const m = sampleScheduleModules(), n = scheduleNetwork(m.wbs, m.activities, null, m.schedule, sampleSchedulePlan(), SAMPLE_START_DATE);
    const pct = spreadPackagePct(n.nodes.map((x) => ({ id: x.id, code: x.code, dur: x.dur, isMilestone: x.isMilestone })), EVM_SAMPLE_PERCENT);
    const f = computeForecast({ nodes: n.nodes.map((x) => ({ id: x.id, dur: x.dur, isMilestone: x.isMilestone, code: x.code, name: x.name })), links: n.links as never, calendar: n.calendar, startDate: n.startDate, cpm: CPM, progress: { statusDate: EVM_SAMPLE_STATUS_DATE, pct } });
    expect(f.ok).toBe(true); expect(f.planDuration).toBe(273); expect(f.planFinish).toBe("2027-07-23"); expect(f.statusOffset).toBe(84);      // el «día laborable 85» de Valor Ganado (1-based) es el offset 84 del CPM
    expect(f.done + f.inProgress + f.notStarted).toBe(43); expect([f.done, f.inProgress, f.notStarted]).toEqual([17, 3, 23]);
    // Por DURACIÓN el proyecto va en plazo (SPI(t) 1,02): el SPI 0,925 de Valor Ganado pesa por COSTO y la licencia (2.4, técnica 0/100) no gana valor hasta emitirse.
    // Lo que sí se atrasa es 3.1.2 (12 d), fuera de la ruta crítica.
    expect(f.forecastFinish).toBe("2027-07-19"); expect(f.forecastDuration).toBe(269); expect(f.delayDays).toBe(-4); expect(f.spiT).toBeCloseTo(1.021, 2);
    expect(f.late[0]).toMatchObject({ code: "3.1.2", slipDays: 12 });
    expect(f.pctActual).toBeGreaterThan(0); expect(f.pctPlanned).toBeGreaterThan(0);
    expect(f.forecastDuration).toBeGreaterThanOrEqual(84);                      // no puede terminar antes del corte
  });
});
