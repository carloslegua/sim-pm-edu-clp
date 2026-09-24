// PERT sobre la red completa (ramas paralelas): src/shared/pert-network.ts. Usa el CPM real del núcleo.
import { describe, expect, it } from "vitest";
import { cpm, pertCriticalChain, scheduleNetwork } from "../../src/core/gpi-core";
import { SAMPLE_START_DATE, sampleScheduleModules } from "../../src/shared/schedule-sample";
import { PERT_SIM_ITERATIONS, isTriple, probWithin, samplePert, simulatePertNetwork, type SimAct } from "../../src/shared/pert-network";
import { mulberry32 } from "../../src/shared/range-estimating";
import type { CpmFn, NetLink } from "../../src/shared/schedule-risk";

const CPM = cpm as unknown as CpmFn;
const act = (id: string, o: number, m: number, p: number): SimAct => ({ id, dur: (o + 4 * m + p) / 6, o, m, p });
// dos ramas paralelas de 10 d (5–10–15, simétricas) que convergen en un hito de 0 d
const paralelo = () => ({
  acts: [act("a", 5, 10, 15), act("b", 5, 10, 15), { id: "fin", dur: 0 }] as SimAct[],
  links: [{ from: "a", to: "fin", type: "FS" }, { from: "b", to: "fin", type: "FS" }] as NetLink[]
});

describe("Beta-PERT", () => {
  it("reproduce la media (O+4M+P)/6 y la σ (P−O)/6 de PERT y respeta [O, P]", () => {
    const rnd = mulberry32(7), xs = Array.from({ length: 20000 }, () => samplePert(4, 6, 14, rnd));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length, sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo((4 + 24 + 14) / 6, 1); expect(sd).toBeGreaterThan(1.4); expect(sd).toBeLessThan(1.75);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(4); expect(Math.max(...xs)).toBeLessThanOrEqual(14);
  });
  it("terna degenerada: la duración más probable; isTriple valida O ≤ M ≤ P con P > O", () => {
    expect(samplePert(5, 5, 5, mulberry32(1))).toBe(5);
    expect(isTriple(act("x", 1, 2, 3))).toBe(true); expect(isTriple({ id: "x", dur: 2, o: 3, m: 2, p: 1 })).toBe(false); expect(isTriple({ id: "x", dur: 2 })).toBe(false); expect(isTriple(act("x", 5, 5, 5))).toBe(false);
  });
});

describe("simulatePertNetwork", () => {
  it("dos ramas paralelas: P(fin ≤ 10) ≈ 25 % (no el 50 % de una sola rama) — el sesgo de convergencia", () => {
    const { acts, links } = paralelo(), r = simulatePertNetwork(acts, links, null, CPM)!;
    expect(r.iterations).toBe(PERT_SIM_ITERATIONS); expect(r.base).toBeCloseTo(10, 5);
    const p = probWithin(r, 10); expect(p).toBeGreaterThan(0.21); expect(p).toBeLessThan(0.29);
    expect(r.mean).toBeGreaterThan(10.4);                                                   // E[máx(A,B)] > máx(E[A], E[B])
    expect(r.percentiles[90]).toBeGreaterThan(r.percentiles[50]); expect(r.percentiles[50]).toBeGreaterThan(r.percentiles[10]);
  });
  it("el índice de criticidad reparte la criticidad entre las ramas (≈50 % cada una) y el hito de fin siempre es crítico", () => {
    const { acts, links } = paralelo(), r = simulatePertNetwork(acts, links, null, CPM)!;
    expect(r.criticality.a).toBeGreaterThan(0.42); expect(r.criticality.a).toBeLessThan(0.58); expect(r.criticality.a + r.criticality.b).toBeCloseTo(1, 1);
    expect(r.criticality.fin).toBe(1);
  });
  it("una sola cadena: coincide con la aproximación normal de PERT (media y σ)", () => {
    const acts = [act("a", 4, 6, 14), act("b", 2, 4, 6)], links: NetLink[] = [{ from: "a", to: "b", type: "FS" }];
    const r = simulatePertNetwork(acts, links, null, CPM)!, sumTe = acts.reduce((s, a) => s + a.dur, 0), sumVar = acts.reduce((s, a) => s + (((a.p as number) - (a.o as number)) / 6) ** 2, 0);
    expect(r.mean).toBeCloseTo(sumTe, 0); expect(Math.abs(r.sd - Math.sqrt(sumVar))).toBeLessThan(0.25);
    const res = cpm(acts.map((a) => ({ id: a.id, dur: a.dur })), links as never, null as never, {});
    expect(pertCriticalChain(res, links as never, null, { a: 4, b: 0.44 }).ok).toBe(true);
  });
  it("determinista (misma semilla → mismo resultado); sin ternas válidas o con ciclo devuelve null", () => {
    const { acts, links } = paralelo();
    expect(simulatePertNetwork(acts, links, null, CPM)!.sorted).toEqual(simulatePertNetwork(acts, links, null, CPM)!.sorted);
    expect(simulatePertNetwork([{ id: "a", dur: 5 }, { id: "b", dur: 5 }], [{ from: "a", to: "b", type: "FS" }], null, CPM)).toBeNull();
    expect(simulatePertNetwork([act("a", 1, 2, 3), act("b", 1, 2, 3)], [{ from: "a", to: "b", type: "FS" }, { from: "b", to: "a", type: "FS" }], null, CPM)).toBeNull();
  });
  it("red DISTRIB+ completa (43 actividades, 51 enlaces): 2 000 iteraciones en pocos segundos (sin fechas, ~150× más rápido que con ellas) y con media coherente", () => {
    const m = sampleScheduleModules(), net = scheduleNetwork(m.wbs, m.activities, null, m.schedule, null, SAMPLE_START_DATE);
    const acts: SimAct[] = net.nodes.filter((n) => !n.isMilestone).map((n) => ({ id: n.id, dur: n.dur, o: n.dur * 0.8, m: n.dur, p: n.dur * 1.5 }));
    const t0 = Date.now(), r = simulatePertNetwork(acts, net.links as unknown as NetLink[], net.calendar, CPM)!, ms = Date.now() - t0;
    expect(ms).toBeLessThan(4000);                                     // con fechas tardaba ~22 s y congelaba la pantalla
    expect(r.iterations).toBe(2000); expect(r.stochastic).toBeGreaterThan(30); expect(r.elapsedApprox).toBe(false);
    expect(r.mean).toBeGreaterThan(r.base * 0.98); expect(r.percentiles[90]).toBeGreaterThan(r.percentiles[10]);
  });
  it("con desfases en días transcurridos se avisa que se aproximan", () => {
    const acts = [act("a", 4, 6, 8), act("b", 2, 4, 6)], r = simulatePertNetwork(acts, [{ from: "a", to: "b", type: "FS", lag: 3, lagUnit: "ed" }], null, CPM)!;
    expect(r.elapsedApprox).toBe(true);
    expect(simulatePertNetwork(acts, [{ from: "a", to: "b", type: "FS", lag: 3, lagUnit: "d" }], null, CPM)!.elapsedApprox).toBe(false);
  });
  it("las actividades sin terna se quedan en su duración fija y se cuentan aparte", () => {
    const r = simulatePertNetwork([act("a", 5, 10, 15), { id: "b", dur: 8 }], [{ from: "a", to: "b", type: "FS" }], null, CPM)!;
    expect(r.stochastic).toBe(1); expect(r.min).toBeGreaterThanOrEqual(13 - 1e-9); expect(r.max).toBeLessThanOrEqual(23 + 1e-9);
  });
});
