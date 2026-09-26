// Riesgo de plazo (AACE 40R-08 / 57R-09 + PMBOK): el efecto de un riesgo sobre el FIN del proyecto sale de volver a
// correr el CPM con la duración afectada -- no es «los días del riesgo» ni «días − holgura total». Estas pruebas fijan
// la lógica con redes chicas de resultado conocido y la simulación integrada de costo y plazo contra valores analíticos.
import { describe, expect, it } from "vitest";
import { cpm, scheduleNetwork } from "../../src/core/gpi-core";
import { makeEngine, resolveTargets, scheduleImpactOf, delayPhrase, type Network, type NetNode } from "../../src/shared/schedule-risk";
import { simulateEvents, simulateRange } from "../../src/shared/range-estimating";
import { SAMPLE_START_DATE, sampleScheduleModules, sampleSchedulePlan } from "../../src/shared/schedule-sample";
import { riskEventsOf, blankRisk, normalizePlan } from "../../src/shared/risk-analysis";

const N = (id: string, dur: number, leafId: string | null = "p"): NetNode => ({ id, code: id, name: "Act " + id, leafId, dur, hasDur: true, isMilestone: false });
const net = (nodes: NetNode[], links: Network["links"]): Network => ({ nodes, links, calendar: null, startDate: "", hasElapsedLags: false });
const eng = (n: Network) => makeEngine(n, cpm as never)!;

// A(10) → B(5) → D(5) ; A → C(2) → D.   Ruta crítica A-B-D (20 d); C tiene holgura 3 d.
const diamond = () => net([N("A", 10, "pa"), N("B", 5, "pb"), N("C", 2, "pc"), N("D", 5, "pd")], [
  { from: "A", to: "B", type: "FS" }, { from: "A", to: "C", type: "FS" }, { from: "B", to: "D", type: "FS" }, { from: "C", to: "D", type: "FS" }]);

describe("motor: duración con retrasos (CPM real)", () => {
  it("base y holguras de la red", () => {
    const e = eng(diamond());
    expect(e.base).toBe(20);
    expect(e.rows.C.tf).toBe(3);
    expect(e.rows.B.critical).toBe(true);
  });
  it("una actividad crítica traslada el retraso íntegro; una con holgura lo absorbe hasta agotarla y traslada el exceso", () => {
    const e = eng(diamond());
    expect(e.duration({ B: 4 })).toBe(24);
    expect(e.duration({ C: 3 })).toBe(20);            // dentro de la holgura
    expect(e.duration({ C: 5 })).toBe(22);            // 5 − 3 de holgura = 2 d de retraso
    expect(e.duration({ C: 5, B: 1 })).toBe(22);      // se combinan (la ruta por C pasa a ser la mayor)
  });
  it("es EXACTO con enlaces SS: alargar al predecesor de un SS no mueve al sucesor (la holgura total no lo diría)", () => {
    // A(10) —SS+0→ B(10). Ambos arrancan juntos: el fin es 10. Alargar A a 15 lo lleva a 15 (A termina después).
    const e = eng(net([N("A", 10), N("B", 10)], [{ from: "A", to: "B", type: "SS", lag: 0 }]));
    expect(e.base).toBe(10);
    expect(e.duration({ A: 3 })).toBe(13);
    // A(4) —SS+0→ B(10): el fin lo fija B (10); A puede crecer hasta 10 sin efecto pese a que su sucesor no espera su fin.
    const e2 = eng(net([N("A", 4), N("B", 10)], [{ from: "A", to: "B", type: "SS", lag: 0 }]));
    expect(e2.base).toBe(10);
    expect(e2.duration({ A: 5 })).toBe(10);
    expect(e2.duration({ A: 7 })).toBe(11);
  });
  it("un adelanto (oportunidad) acorta solo si la actividad es crítica, y nunca deja una duración negativa", () => {
    const e = eng(diamond());
    expect(e.duration({ B: -2 })).toBe(18);            // A-B-D pasa de 20 a 18 (A-C-D = 17)
    expect(e.duration({ B: -100 })).toBe(17);          // B no baja de 0: manda la otra ruta (A-C-D = 17)
    expect(e.duration({ C: -1 })).toBe(20);            // no es crítica: acortarla no adelanta nada
  });
  it("sin red, sin actividades o con ciclo no hay motor (no se inventa un resultado)", () => {
    expect(makeEngine(null, cpm as never)).toBeNull();
    expect(makeEngine(net([], []), cpm as never)).toBeNull();
    expect(makeEngine(net([N("A", 1), N("B", 1)], [{ from: "A", to: "B", type: "FS" }, { from: "B", to: "A", type: "FS" }]), cpm as never)).toBeNull();
  });
});

describe("a qué actividades afecta un riesgo", () => {
  it("con actividades elegidas: cada una; las que ya no existen se avisan", () => {
    const e = eng(diamond()), r = resolveTargets({ wbsIds: [], actIds: ["B", "C", "zzz"] }, e);
    expect(r.mode).toBe("actividades");
    expect(r.targets.map((t) => t.id)).toEqual(["B", "C"]);
    expect(r.missing).toEqual(["zzz"]);
    expect(r.targets.find((t) => t.id === "B")!.critical).toBe(true);
    expect(r.targets.find((t) => t.id === "C")!.tf).toBe(3);
  });
  it("solo con paquetes: UNA actividad, la de menor holgura del paquete", () => {
    const e = eng(net([N("A", 10, "p1"), N("B", 5, "p2"), N("C", 2, "p2"), N("D", 5, "p3")], [
      { from: "A", to: "B", type: "FS" }, { from: "A", to: "C", type: "FS" }, { from: "B", to: "D", type: "FS" }, { from: "C", to: "D", type: "FS" }]));
    const r = resolveTargets({ wbsIds: ["p2"], actIds: [] }, e);
    expect(r.mode).toBe("paquete");
    expect(r.targets.map((t) => t.id)).toEqual(["B"]);            // B (holgura 0) manda sobre C (holgura 3)
  });
  it("sin paquetes ni actividades, o con paquetes sin actividades: no se puede ubicar y dice por qué", () => {
    const e = eng(diamond());
    expect(resolveTargets({ wbsIds: [], actIds: [] }, e)).toMatchObject({ mode: "ninguno", targets: [] });
    const r = resolveTargets({ wbsIds: ["no-existe"], actIds: [] }, e);
    expect(r.mode).toBe("ninguno"); expect(r.reason).toMatch(/no tienen actividades/);
  });
  it("actividades elegidas que ya no existen caen a sus paquetes", () => {
    const e = eng(diamond()), r = resolveTargets({ wbsIds: ["pb"], actIds: ["zzz"] }, e);
    expect(r.mode).toBe("paquete"); expect(r.targets[0].id).toBe("B"); expect(r.missing).toEqual(["zzz"]);
  });
});

describe("efecto de un riesgo sobre el fin del proyecto", () => {
  const range = { low: 2, likely: 4, high: 10 };
  it("crítica: el proyecto se retrasa lo mismo que la actividad; con holgura: el exceso sobre la holgura", () => {
    const e = eng(diamond());
    const crit = scheduleImpactOf(e, resolveTargets({ wbsIds: [], actIds: ["B"] }, e), range, 0.5, 1);
    expect(crit.delay).toEqual({ low: 2, likely: 4, high: 10 });
    expect(crit.minFloat).toBe(0);
    expect(crit.evDays).toBeCloseTo(0.5 * (2 + 4 + 10) / 3, 1);                  // p × media de la triangular
    const slack = scheduleImpactOf(e, resolveTargets({ wbsIds: [], actIds: ["C"] }, e), range, 0.5, 1);
    expect(slack.delay).toEqual({ low: 0, likely: 1, high: 7 });                   // 2−3→0 · 4−3→1 · 10−3→7
    expect(slack.minFloat).toBe(3);
    expect(slack.evDays!).toBeLessThan(crit.evDays!);
    expect(delayPhrase(slack)).toMatch(/retrasa el fin del proyecto 1 d/);
    expect(delayPhrase(scheduleImpactOf(e, resolveTargets({ wbsIds: [], actIds: ["C"] }, e), { low: 1, likely: 2, high: 3 }, 0.5, 1))).toMatch(/holgura.*absorbe/);
  });
  it("una oportunidad tiene signo negativo: adelanta el fin solo si es crítica", () => {
    const e = eng(diamond());
    expect(scheduleImpactOf(e, resolveTargets({ wbsIds: [], actIds: ["B"] }, e), { low: 1, likely: 2, high: 3 }, 1, -1).delay.likely).toBe(-2);
    expect(scheduleImpactOf(e, resolveTargets({ wbsIds: [], actIds: ["C"] }, e), { low: 1, likely: 2, high: 3 }, 1, -1).delay.likely).toBe(0);
  });
  it("sin ubicar: sin efecto calculado", () => {
    const e = eng(diamond()), im = scheduleImpactOf(e, resolveTargets({ wbsIds: [], actIds: [] }, e), range, 0.5, 1);
    expect(im.mapped).toBe(false); expect(im.delay.likely).toBeNull(); expect(im.evDays).toBeNull();
    expect(delayPhrase(im)).toMatch(/no se puede ubicar/);
  });
});

describe("simulación integrada de costo y plazo", () => {
  // Un solo evento crítico: ocurre con prob 0,4; retraso triangular 2/4/10 d (media 5,33); costo directo 0; 1.000 por día.
  const ev = { id: "e", name: "E", prob: 0.4, low: 0, likely: 0, high: 0, sign: 1 as const, days: { low: 2, likely: 4, high: 10 }, targets: ["B"] };
  const e0 = eng(diamond());
  const sched = { base: e0.base, costPerDay: 1000, duration: (d: Record<string, number>) => e0.duration(d) };
  const res = simulateRange([], { events: [ev], schedule: sched, iterations: 20000 })!;

  it("coincide con lo analítico: P(retraso) = prob, duración media = base + prob × media, costo del plazo = días × costo por día", () => {
    expect(res.schedule).not.toBeNull();
    expect(res.schedule!.probDelay).toBeCloseTo(0.4, 1);
    expect(res.schedule!.mean).toBeCloseTo(20 + 0.4 * (2 + 4 + 10) / 3, 0);
    expect(res.schedule!.timeCostMean).toBeCloseTo(0.4 * (2 + 4 + 10) / 3 * 1000, -2);
    expect(res.mean).toBeCloseTo(res.schedule!.timeCostMean, -1);               // sin costo directo: todo el costo es el del plazo
    expect(res.schedule!.p[50]).toBe(20);                                       // más de la mitad de las iteraciones no se retrasan
    expect(res.schedule!.p[90]).toBeGreaterThan(20);
  });
  it("con costo por día 0 el plazo se simula igual pero no suma costo", () => {
    const r0 = simulateRange([], { events: [ev], schedule: { ...sched, costPerDay: 0 }, iterations: 20000 })!;
    expect(r0.schedule!.timeCostMean).toBe(0); expect(r0.mean).toBe(0);
    expect(r0.schedule!.p[90]).toBe(res.schedule!.p[90]);                       // mismo flujo aleatorio: mismo plazo
  });
  it("los eventos tienen su propio flujo aleatorio: agregar partidas o cambiar la correlación NO cambia el plazo", () => {
    const l = [{ id: "l", name: "L", ml: 1000, lowPct: -10, highPct: 30 }];
    const a = simulateRange(l, { events: [ev], schedule: sched, iterations: 5000, correlation: 0.1 })!, b = simulateRange([], { events: [ev], schedule: sched, iterations: 5000 })!;
    expect(a.schedule!.p).toEqual(b.schedule!.p);
    expect(a.schedule!.mean).toBe(b.schedule!.mean);
  });
  it("los eventos se simulan UNA vez: reutilizar sus resultados da lo mismo que simular todo junto y no vuelve a correr el CPM", () => {
    let corridas = 0;
    const contado = { ...sched, duration: (d: Record<string, number>) => { corridas++; return e0.duration(d); } };
    const l = [{ id: "l", name: "L", ml: 1000, lowPct: -10, highPct: 30 }];
    const junto = simulateRange(l, { events: [ev], schedule: contado, iterations: 5000 })!;
    const enJunto = corridas;
    expect(enJunto).toBeGreaterThan(0);
    corridas = 0;
    const oc = simulateEvents([ev], contado, 5000);
    const primera = corridas;
    expect(primera).toBe(enJunto);                                               // simular los eventos aparte cuesta lo mismo que dentro
    corridas = 0;
    const a = simulateRange(l, { events: [ev], schedule: contado, iterations: 5000, correlation: 0.3, outcomes: oc })!;
    const b = simulateRange(l, { events: [ev], schedule: { ...contado, costPerDay: 2500 }, iterations: 5000, correlation: 0.9, outcomes: oc })!;
    expect(corridas).toBe(0);                                                    // con los resultados ya calculados no se corre más el CPM
    expect(a.p).toEqual(junto.p); expect(a.schedule).toEqual(junto.schedule);    // idéntico a simularlo todo junto
    expect(b.schedule!.p).toEqual(a.schedule!.p);                                // el plazo no depende de la correlación ni del costo por día
    expect(b.schedule!.timeCostMean).toBeCloseTo(a.schedule!.timeCostMean * 2.5, 6);
    // resultados que no corresponden (otras iteraciones) NO se reutilizan: se vuelve a simular
    corridas = 0;
    simulateRange(l, { events: [ev], schedule: contado, iterations: 3000, outcomes: oc });
    expect(corridas).toBeGreaterThan(0);
  });
  it("es reproducible (misma semilla, mismo resultado) y sin `schedule` no hay resultado de plazo", () => {
    const again = simulateRange([], { events: [ev], schedule: sched, iterations: 20000 })!;
    expect(again.schedule).toEqual(res.schedule);
    expect(simulateRange([], { events: [ev], iterations: 5000 })!.schedule).toBeNull();
  });
  it("un evento con actividad con holgura genera menos retraso que el mismo evento sobre la crítica", () => {
    const rc = simulateRange([], { events: [{ ...ev, targets: ["C"] }], schedule: sched, iterations: 10000 })!;
    expect(rc.schedule!.mean).toBeLessThan(res.schedule!.mean);
    expect(rc.schedule!.probDelay).toBeLessThan(res.schedule!.probDelay);
  });
  it("un evento sin ubicar (sin actividades) no retrasa nada aunque traiga días", () => {
    const r = simulateRange([], { events: [{ ...ev, targets: [] }], schedule: sched, iterations: 3000 })!;
    expect(r.schedule!.probDelay).toBe(0); expect(r.schedule!.events).toBe(0); expect(r.schedule!.p[95]).toBe(20);
  });
});

describe("ejemplo DISTRIB+: los riesgos del registro contra la red completa", () => {
  const m = sampleScheduleModules(), n = scheduleNetwork(m.wbs, m.activities, null, m.schedule, sampleSchedulePlan(), SAMPLE_START_DATE);
  const e = makeEngine(n, cpm as never)!;
  it("motor sobre la red real: 273 días", () => { expect(e.base).toBe(273); });
  it("la simulación de 10 eventos con CPM real corre en tiempo razonable y es determinista", () => {
    const plan = normalizePlan({}), risks = [
      { ...blankRisk("a", "R-01"), status: "monitoreo" as const, prob: 3, probPct: 50, wbsIds: ["w-2.4"], timeImpact: { low: 10, likely: 20, high: 35 }, costImpact: { low: 20000, likely: 45000, high: 80000 } }
    ];
    const ctx = riskEventsOf(risks, plan, { targets: (r) => resolveTargets(r, e).targets.map((t) => t.id) });
    expect(ctx.events[0].days).toEqual({ low: 10, likely: 20, high: 35 });
    expect(ctx.events[0].targets!.length).toBe(1);
    const t0 = Date.now(), r1 = simulateRange([], { events: ctx.events, schedule: { base: e.base, costPerDay: 1500, duration: (d) => e.duration(d) } })!;
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(15000);
    expect(r1.schedule!.probDelay).toBeGreaterThan(0.3);
    expect(simulateRange([], { events: ctx.events, schedule: { base: e.base, costPerDay: 1500, duration: (d) => e.duration(d) } })!.schedule).toEqual(r1.schedule);
  });
});
