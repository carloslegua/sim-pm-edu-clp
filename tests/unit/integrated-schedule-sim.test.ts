// Simulación integrada de plazo (auditoría, media): eventos de riesgo Y duraciones Beta-PERT en la MISMA iteración (opt-in). Sin activarla, nada cambia.
import { describe, expect, it } from "vitest";
import { cpm } from "../../src/core/gpi-core";
import { makeEngine, type CpmFn, type Network } from "../../src/shared/schedule-risk";
import { simulateEvents, simulateRange, type PertDur, type RiskEventInput } from "../../src/shared/range-estimating";

const CPM = cpm as unknown as CpmFn;
// A(10) → B(10): duración 20; A y B con terna (6, 10, 20)
const net = (): Network => ({
  nodes: [{ id: "a", code: "1.1", name: "A", leafId: "w1", dur: 10, hasDur: true, isMilestone: false }, { id: "b", code: "1.2", name: "B", leafId: "w1", dur: 10, hasDur: true, isMilestone: false }],
  links: [{ from: "a", to: "b", type: "FS" }], calendar: { workDayIdx: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [], provisional: true }, startDate: "", hasElapsedLags: false
});
const pa: PertDur[] = [{ id: "a", dur: 10, o: 6, m: 10, p: 20 }, { id: "b", dur: 10, o: 6, m: 10, p: 20 }];
const ev: RiskEventInput = { id: "e1", name: "Retraso del proveedor", prob: 0.5, low: 0, likely: 0, high: 0, sign: 1, days: { low: 2, likely: 4, high: 8 }, targets: ["a"] };
const sim = () => { const e = makeEngine(net(), CPM)!; return { base: e.base, duration: (d: Record<string, number>) => e.duration(d) }; };

describe("simulateEvents integrado", () => {
  it("sin ternas PERT el resultado es exactamente el de siempre (mismos eventos, misma extensión)", () => {
    const a = simulateEvents([ev], sim(), 2000, 7), b = simulateEvents([ev], sim(), 2000, 7, []);
    expect(a.integrated).toBe(false); expect(b.integrated).toBe(false); expect(Array.from(b.ext as Float64Array)).toEqual(Array.from(a.ext as Float64Array));
  });
  it("con ternas: cada iteración sortea las duraciones y la extensión ya no es solo la de los eventos", () => {
    const solo = simulateEvents([ev], sim(), 4000, 7), todo = simulateEvents([ev], sim(), 4000, 7, pa);
    expect(todo.integrated).toBe(true); expect(todo.pertActs).toBe(2);
    const e = todo.ext as Float64Array, s = solo.ext as Float64Array;
    const mean = (x: Float64Array) => x.reduce((p, q) => p + q, 0) / x.length;
    // Beta-PERT(6,10,20): media (6+4·10+20)/6 = 11 → dos actividades en serie suman +2 d a la media, y el evento suma prob × 4,67 ≈ 2,3
    expect(mean(s)).toBeGreaterThan(1.9); expect(mean(s)).toBeLessThan(2.8);
    expect(mean(e)).toBeGreaterThan(mean(s) + 1.5); expect(mean(e)).toBeLessThan(mean(s) + 2.5);
    expect(Math.min(...Array.from(e))).toBeLessThan(0);                                   // hay iteraciones que terminan ANTES del plan (duraciones cortas): la variabilidad va en ambos sentidos
    expect(new Set(Array.from(e)).size).toBeGreaterThan(new Set(Array.from(s)).size);
  });
  it("los eventos NO cambian de sorteo al activar PERT (flujos aleatorios propios): el costo directo es idéntico", () => {
    const a = simulateEvents([{ ...ev, low: 100, likely: 200, high: 400 }], sim(), 2000, 7), b = simulateEvents([{ ...ev, low: 100, likely: 200, high: 400 }], sim(), 2000, 7, pa);
    expect(Array.from(b.direct)).toEqual(Array.from(a.direct));
  });
  it("es reproducible (misma semilla, mismo resultado) y solo con actividades de terna válida", () => {
    const x = simulateEvents([ev], sim(), 1000, 3, pa), y = simulateEvents([ev], sim(), 1000, 3, pa);
    expect(Array.from(x.ext as Float64Array)).toEqual(Array.from(y.ext as Float64Array));
    const malas = simulateEvents([ev], sim(), 1000, 3, [{ id: "a", dur: 10, o: 20, m: 10, p: 6 }]);   // o > m > p: no es una terna
    expect(malas.integrated).toBe(false);
  });
});

describe("simulateRange integrado", () => {
  it("con pertActs el plazo del resultado se marca integrado y su percentil P90 sube frente al análisis solo de eventos; sin eventos también funciona", () => {
    const e0 = makeEngine(net(), CPM)!, schedule = { base: e0.base, costPerDay: 1000, duration: (d: Record<string, number>) => e0.duration(d) };
    const lines = [{ id: "m1", name: "Partida", ml: 100000, lowPct: -10, highPct: 20 }];
    const a = simulateRange(lines, { events: [ev], schedule, iterations: 3000, seed: 5 })!, b = simulateRange(lines, { events: [ev], schedule, iterations: 3000, seed: 5, pertActs: pa })!;
    expect(a.schedule!.integrated).toBe(false); expect(b.schedule!.integrated).toBe(true); expect(b.schedule!.pertActs).toBe(2);
    expect(b.schedule!.p[90]).toBeGreaterThan(a.schedule!.p[90]); expect(b.p[90]).toBeGreaterThan(a.p[90]);            // más plazo → más costo por día
    const c = simulateRange(lines, { events: [], schedule, iterations: 3000, seed: 5, pertActs: pa })!;
    expect(c.schedule!.integrated).toBe(true); expect(c.schedule!.mean).toBeGreaterThan(e0.base + 1);
  });
  it("outcomes ya calculados sin PERT no se reutilizan cuando se pide integrado (y al revés)", () => {
    const e0 = makeEngine(net(), CPM)!, schedule = { base: e0.base, costPerDay: 0, duration: (d: Record<string, number>) => e0.duration(d) };
    const oc = simulateEvents([ev], schedule, 2000, 5), lines = [{ id: "m1", name: "P", ml: 1000, lowPct: -10, highPct: 10 }];
    expect(simulateRange(lines, { events: [ev], schedule, iterations: 2000, seed: 5, outcomes: oc, pertActs: pa })!.schedule!.integrated).toBe(true);
    expect(simulateRange(lines, { events: [ev], schedule, iterations: 2000, seed: 5, outcomes: oc })!.schedule!.integrated).toBe(false);
  });
});
