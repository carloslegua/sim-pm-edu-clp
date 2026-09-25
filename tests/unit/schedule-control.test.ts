// Control del cronograma: salud de la red (verificaciones tipo DCMA), línea base versionada y su comparación con el
// pronóstico (desplazamiento del fin, reserva de cronograma, consumo de holgura de la ruta casi crítica).
import { describe, expect, it } from "vitest";
import { cpm, scheduleNetwork } from "../../src/core/gpi-core";
import {
  compareBaseline, deviationPct, makeSnapshot, needsSponsor, nextVersion, normalizeBaseline, planOf, scheduleHealth,
  type CtlLink, type CtlNode, type CtlPlan
} from "../../src/shared/schedule-control";
import { SAMPLE_START_DATE, sampleScheduleModules, sampleSchedulePlan } from "../../src/shared/schedule-sample";

const N = (id: string, dur: number, o: Partial<CtlNode> = {}): CtlNode => ({ id, code: id, name: "Act " + id, isMilestone: false, hasDur: true, dur, ...o });
const L = (from: string, to: string, type = "FS", lag = 0): CtlLink => ({ from, to, type, lag, lagUnit: "d" });
const run = (nodes: CtlNode[], links: CtlLink[]) => {
  const r = cpm(nodes.map((n) => ({ id: n.id, dur: n.dur })), links as never, null, {});
  if (!r.ok) throw new Error("ciclo");
  return r;
};
const PLAN: CtlPlan = { nearCriticalDays: 10, nearCriticalDefined: true, reservePct: 10, rebaselinePct: 5, floatGreen: 40, floatRed: 70 };
const health = (nodes: CtlNode[], links: CtlLink[], plan = PLAN) => scheduleHealth(nodes, links, run(nodes, links).rows, plan);
const check = (h: ReturnType<typeof health>, key: string) => h.checks.find((c) => c.key === key)!;

describe("umbrales del Plan de Gestión del Cronograma", () => {
  it("lee los umbrales del plan y usa valores por omisión (y lo dice) cuando el plan no los define", () => {
    expect(planOf(null)).toMatchObject({ nearCriticalDays: 10, nearCriticalDefined: false, reservePct: 0, rebaselinePct: 0, floatGreen: 40, floatRed: 70 });
    expect(planOf({
      criticalPath: { nearCriticalThresholdDays: 5 }, scheduleReserve: { pct: 8 }, changeControl: { baselineChangeThresholdPct: 5 },
      controlThresholds: [{ key: "SPI" }, { key: "HOLGURA", greenValue: 30, redValue: 60 }]
    })).toEqual({ nearCriticalDays: 5, nearCriticalDefined: true, reservePct: 8, rebaselinePct: 5, floatGreen: 30, floatRed: 60 });
    expect(planOf({ criticalPath: { nearCriticalThresholdDays: 0 }, controlThresholds: [{ key: "HOLGURA", greenValue: 70, redValue: 40 }] }))   // rojo ≤ verde: incoherente → por omisión
      .toMatchObject({ nearCriticalDays: 10, floatGreen: 70, floatRed: 70 });
  });
});

describe("salud de la red", () => {
  it("una red limpia (cadena FS con hitos de inicio y fin) aprueba todo", () => {
    const nodes = [N("S", 0, { isMilestone: true }), N("A", 5), N("B", 8), N("F", 0, { isMilestone: true })];
    const h = health(nodes, [L("S", "A"), L("A", "B"), L("B", "F")]);
    expect(h.checks.filter((c) => c.pass === false)).toEqual([]);
    expect(h.passed).toBe(h.evaluated);
  });
  it("lógica faltante: un extremo abierto en medio de la red se cuenta; el inicio y el fin del proyecto no", () => {
    const nodes = [N("S", 0, { isMilestone: true }), N("A", 5), N("B", 5), N("C", 5), N("F", 0, { isMilestone: true })];
    // C no tiene sucesora (queda «colgando» y no llega al fin)
    const h = health(nodes, [L("S", "A"), L("A", "B"), L("A", "C"), L("B", "F")]);
    const c = check(h, "logic");
    expect(c.count).toBe(1); expect(c.items[0]).toMatch(/C Act C/);
    expect(c.pass).toBe(false);                                                 // 1 de 5 = 20 % > 5 %
  });
  it("sin hitos de inicio/fin se admite UN inicio y UN fin (los de menor ES y mayor EF)", () => {
    const nodes = [N("A", 5), N("B", 5), N("C", 5)];
    expect(check(health(nodes, [L("A", "B"), L("B", "C")]), "logic").count).toBe(0);
    expect(check(health(nodes, [L("A", "B")]), "logic").count).toBe(1);          // C queda aislada: sin predecesora ni sucesora
  });
  it("adelantos (desfase negativo): cero tolerancia; desfases positivos y relaciones no-FS según sus umbrales", () => {
    const nodes = [N("A", 10), N("B", 10), N("C", 10)];
    const h = health(nodes, [L("A", "B", "FS", -2), L("B", "C", "SS", 3)]);
    expect(check(h, "leads")).toMatchObject({ count: 1, pass: false }); expect(check(h, "leads").items[0]).toMatch(/A → B FS-2d/);
    expect(check(h, "lags")).toMatchObject({ count: 1, pass: false });          // 1 de 2 = 50 % > 5 %
    expect(check(h, "fs")).toMatchObject({ count: 1, total: 2, pass: false });   // 50 % < 90 %
    expect(check(health(nodes, [L("A", "B"), L("B", "C")]), "fs")).toMatchObject({ pct: 100, pass: true });
  });
  it("holgura alta (> 44 d), duración alta (> 44 d) y actividades sin duración", () => {
    const nodes = [N("A", 10), N("B", 50), N("C", 5), N("D", 5, { hasDur: false, dur: 0 }), N("Z", 100)];
    const h = health(nodes, [L("A", "B"), L("A", "C"), L("B", "Z"), L("C", "Z"), L("A", "D"), L("D", "Z")]);
    expect(check(h, "highDur")).toMatchObject({ count: 2, pass: false });         // B (50) y Z (100)
    expect(check(h, "highFloat").items.join()).toMatch(/C Act C/);               // C flota 50 d en paralelo a B
    expect(check(h, "noDur")).toMatchObject({ count: 1, pass: false });
    expect(check(h, "negFloat")).toMatchObject({ count: 0, pass: true });
  });
  it("ruta casi crítica según el umbral del plan; informativa (no aprueba ni reprueba)", () => {
    const nodes = [N("S", 0, { isMilestone: true }), N("A", 10), N("B", 8), N("C", 3), N("F", 0, { isMilestone: true })];
    const links = [L("S", "A"), L("S", "B"), L("S", "C"), L("A", "F"), L("B", "F"), L("C", "F")];
    const h = health(nodes, links, { ...PLAN, nearCriticalDays: 2 });            // B tiene holgura 2, C 7
    expect(check(h, "near")).toMatchObject({ count: 1, pass: null }); expect(check(h, "near").items[0]).toMatch(/B Act B/);
    expect(check(health(nodes, links, { ...PLAN, nearCriticalDays: 7 }), "near").count).toBe(2);
    expect(check(h, "critShare")).toMatchObject({ count: 1, total: 3, pass: null });
    expect(h.evaluated).toBe(h.checks.filter((c) => c.pass !== null).length);
  });
  it("red DISTRIB+ completa: lo que enseña (desfases SS y holguras enormes en Procura), sin adelantos", () => {
    const m = sampleScheduleModules(), n = scheduleNetwork(m.wbs, m.activities, null, m.schedule, sampleSchedulePlan(), SAMPLE_START_DATE);
    const nodes: CtlNode[] = n.nodes.map((x) => ({ id: x.id, code: x.code, name: x.name, isMilestone: x.isMilestone, hasDur: x.hasDur, dur: x.dur }));
    const links = n.links as unknown as CtlLink[], r = run(nodes, links);
    const h = scheduleHealth(nodes, links, r.rows, planOf({ criticalPath: { nearCriticalThresholdDays: 5 } }));
    expect(check(h, "leads")).toMatchObject({ count: 0, pass: true });
    expect(check(h, "fs")).toMatchObject({ count: 47, total: 51, pass: true });                     // 92,2 % FS
    expect(check(h, "lags")).toMatchObject({ count: 4, pass: false });                             // 4 SS con desfase de 51 enlaces = 7,8 %
    expect(check(h, "highFloat").count).toBe(8);                                                   // informes (1.3), Procura (3.1, 3.2, 3.3): 236, 78, 47 y 162 d
    expect(check(h, "highFloat").pass).toBe(false);
    expect(check(h, "highDur")).toMatchObject({ count: 0, pass: true });
    expect(check(h, "noDur")).toMatchObject({ count: 0, pass: true });
    expect(check(h, "negFloat").count).toBe(0);
    expect(check(h, "near").count).toBe(2);                                                        // 2.3.1 y 2.3.2 (holgura 1 d)
  });
});

describe("línea base", () => {
  const nodes = [N("S", 0, { isMilestone: true }), N("A", 10), N("B", 5), N("C", 3), N("F", 0, { isMilestone: true })];
  const links = [L("S", "A"), L("A", "B"), L("A", "C"), L("B", "F"), L("C", "F")];   // A-B crítica (15 d); C holgura 2
  const snap = () => { const r = run(nodes, links); return makeSnapshot(nodes, r.rows, r.projectDuration, "2026-07-06", "2026-07-24", 5); };
  const now = (nn: CtlNode[]) => { const r = run(nn, links); return { rows: r.rows, dur: r.projectDuration }; };

  it("la instantánea guarda duración, fechas y, por actividad, ES/EF/holgura/criticidad", () => {
    const s = snap();
    expect(s).toMatchObject({ projectDuration: 15, startDate: "2026-07-06", finishDate: "2026-07-24", nearCriticalDays: 5 });
    expect(s.rows.find((r) => r.id === "C")).toMatchObject({ dur: 3, tf: 2, critical: false });
    expect(s.rows.find((r) => r.id === "B")).toMatchObject({ tf: 0, critical: true });
  });
  it("normalización tolerante: lo guardado antes (null, otro esquema, basura) se lee como «sin línea base»; una válida hace viaje de ida y vuelta", () => {
    expect(normalizeBaseline(null)).toBeNull();
    expect(normalizeBaseline({ frozen: true, version: "v1", date: "2026-01-01" })).toBeNull();      // el tipo viejo, sin instantánea
    expect(normalizeBaseline({ snapshot: { rows: "x" } })).toBeNull();
    const b = { frozen: true, version: "LB-1", date: "2026-07-06", snapshot: snap(), log: [{ version: "LB-1", date: "2026-07-06", reason: "Línea base inicial", approver: "Sponsor", sponsorAuth: true, projectDuration: 15, finishDate: "2026-07-24", deviationPct: null }] };
    // una línea base sin referencia de valor ganado (anterior a congelarla) se lee con `evm: null`; el resto hace ida y vuelta idéntico
    expect(normalizeBaseline(JSON.parse(JSON.stringify(b)))).toEqual({ ...b, snapshot: { ...b.snapshot, evm: null } });
    expect(nextVersion(normalizeBaseline(b))).toBe("LB-2"); expect(nextVersion(null)).toBe("LB-1");
  });
  it("sin cambios: no hay desplazamiento ni cambios; con actividades nuevas o quitadas se listan", () => {
    const cmp = compareBaseline(snap(), nodes, now(nodes).rows, 15, PLAN);
    expect(cmp).toMatchObject({ durationDelta: 0, durationDeltaPct: 0, changed: [], added: [], removed: [] });
    expect(cmp.near.level).not.toBeNull();                                                          // C (holgura 2 ≤ 5) es casi crítica
    const otro = compareBaseline(snap(), nodes.filter((n) => n.id !== "C"), now(nodes.filter((n) => n.id !== "C")).rows, 15, PLAN);
    expect(otro.removed).toEqual(["C Act C"]);
  });
  it("un retraso en la ruta crítica desplaza el fin, lista lo cambiado y consume la reserva de cronograma", () => {
    const tarde = nodes.map((n) => (n.id === "B" ? { ...n, dur: 7 } : n)), c = now(tarde);
    const cmp = compareBaseline(snap(), tarde, c.rows, c.dur, PLAN);
    expect(cmp.durationDelta).toBe(2);
    expect(cmp.durationDeltaPct).toBeCloseTo(13.33, 1);
    expect(cmp.changed.map((x) => x.id)).toContain("B");
    expect(cmp.changed.find((x) => x.id === "B")).toMatchObject({ durDelta: 2, efDelta: 2 });
    expect(cmp.reserveDays).toBeCloseTo(1.5, 9);                                                    // 10 % de 15 d
    expect(cmp.reserveConsumedPct).toBeCloseTo(133.33, 1);                                          // 2 d > 1,5 d de reserva
    expect(compareBaseline(snap(), tarde, c.rows, c.dur, { ...PLAN, reservePct: 0 }).reserveConsumedPct).toBeNull();
  });
  it("consumo de holgura de la ruta casi crítica contra el umbral verde/rojo del plan", () => {
    // C tenía 2 d de holgura: si su duración sube 1 d consume el 50 % (ámbar con 40/70); si sube 2 d consume el 100 % y pasa a ser crítica (rojo)
    const con = (durC: number) => { const nn = nodes.map((n) => (n.id === "C" ? { ...n, dur: durC } : n)), c = now(nn); return compareBaseline(snap(), nn, c.rows, c.dur, PLAN); };
    expect(con(3).near).toMatchObject({ meanPct: 0, level: "verde" });
    expect(con(4).near).toMatchObject({ meanPct: 50, level: "ambar" });
    const rojo = con(5);
    expect(rojo.near).toMatchObject({ meanPct: 100, level: "rojo" });
    expect(rojo.near.newCritical).toEqual(["C Act C"]);
    expect(con(4).near.items[0]).toMatchObject({ id: "C", tfBase: 2, tfNow: 1, consumedPct: 50 });
    expect(compareBaseline(snap(), nodes, now(nodes).rows, 15, { ...PLAN, floatGreen: 0.5 + 40, floatRed: 60 }).near.level).toBe("verde");
  });
  it("rebaselinar exige al sponsor solo si la desviación de la duración supera el umbral del plan (5 %)", () => {
    const s = snap();
    expect(deviationPct(s, 15.5)).toBeCloseTo(3.33, 1);
    expect(needsSponsor(s, 15.5, PLAN)).toBe(false);          // 3,3 % ≤ 5 %
    expect(needsSponsor(s, 16, PLAN)).toBe(true);             // 6,7 % > 5 %
    expect(needsSponsor(s, 14, PLAN)).toBe(true);             // adelantarse también es un cambio (|−6,7 %|)
    expect(needsSponsor(s, 99, { ...PLAN, rebaselinePct: 0 })).toBe(false);   // sin umbral en el plan: no se exige
    expect(needsSponsor(null, 99, PLAN)).toBe(false);
  });
});
