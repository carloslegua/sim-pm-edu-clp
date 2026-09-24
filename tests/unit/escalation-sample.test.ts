// Ejemplo DISTRIB+ de la escalación (src/shared/escalation-sample.ts): cobertura de la EDT, coherencia con la red y prueba de oro.
// Los paquetes se arman con la red REAL del ejemplo (cpm del núcleo): mismas fechas que ve el módulo de Costos.
import { describe, expect, it } from "vitest";
import { addWorkingDays, cpm, parseISO, scheduleNetwork, wbsLeaves } from "../../src/core/gpi-core";
import { EVM_SAMPLE_COSTS } from "../../src/shared/evm-sample";
import { escalate, simulateEscalation, type EscPackage } from "../../src/shared/escalation";
import { SAMPLE_BASE_DATE, SAMPLE_ESC_LOCKS, SAMPLE_ESC_MIX, buildSampleEscPlan } from "../../src/shared/escalation-sample";
import { SAMPLE_START_DATE, sampleScheduleModules } from "../../src/shared/schedule-sample";

function paquetes(): EscPackage[] {
  const m = sampleScheduleModules(), net = scheduleNetwork(m.wbs, m.activities, null, m.schedule, null, SAMPLE_START_DATE)!;
  const res = cpm(net.nodes.map((n) => ({ id: n.id, dur: n.dur })), net.links, net.calendar as never, {});
  if (!res.ok) throw new Error("ciclo");
  const idx: Record<string, { es: number; ef: number }> = {};
  net.nodes.filter((n) => !n.isMilestone && n.leafId).forEach((n) => { const r = res.rows[n.id], s = idx[n.leafId as string] || (idx[n.leafId as string] = { es: r.es, ef: r.ef }); s.es = Math.min(s.es, r.es); s.ef = Math.max(s.ef, r.ef); });
  const at = (i: number): string => addWorkingDays(parseISO(net.startDate), Math.max(0, Math.ceil(i - 1e-9)), net.calendar as never);
  return wbsLeaves(m.wbs).map((l) => ({ id: l.id, code: l.code, name: l.name, cost: (EVM_SAMPLE_COSTS as Record<string, number>)[l.code], start: at(idx[l.id].es), end: at(idx[l.id].ef - 1) }));
}
const plan = () => buildSampleEscPlan((c) => "w-" + c);

describe("escalation-sample: caso DISTRIB+", () => {
  it("cubre los 18 paquetes de la EDT (mismos Códigos EDT) y cada composición suma 100 %", () => {
    const codes = paquetes().map((p) => p.code).sort();
    expect(codes).toHaveLength(18);
    expect(Object.keys(SAMPLE_ESC_MIX).sort()).toEqual(codes);
    Object.entries(SAMPLE_ESC_MIX).forEach(([c, m]) => expect(Object.values(m).reduce((s, x) => s + x, 0), c).toBe(100));
    Object.keys(SAMPLE_ESC_LOCKS).forEach((c) => expect(codes).toContain(c));
  });
  it("las fechas de la red: inicia el 2026-07-06 y termina el 2027-07-21; la fecha base de precios (2026-07-01) es anterior al primer gasto", () => {
    const p = paquetes(), first = p.map((x) => x.start as string).sort()[0], last = p.map((x) => x.end as string).sort().reverse()[0];
    expect([first, last]).toEqual(["2026-07-06", "2027-07-21"]);
    expect(SAMPLE_BASE_DATE < first).toBe(true);
    expect(p.reduce((s, x) => s + x.cost, 0)).toBe(7100000);
  });
  it("las fijaciones de precio caen antes del gasto de su paquete (contratos previos a la ejecución) y después de la fecha base", () => {
    const p = paquetes();
    Object.entries(SAMPLE_ESC_LOCKS).forEach(([c, d]) => { const k = p.find((x) => x.code === c) as EscPackage; expect(d <= (k.start as string), c).toBe(true); expect(d > SAMPLE_BASE_DATE, c).toBe(true); });
  });
  it("prueba de oro: escalación central sobre el costo base = 112,033 (1,58 %), por cuenta y por año, con fecha media del gasto 2026-12-19", () => {
    const r = escalate(plan(), paquetes());
    expect(Math.round(r.esc)).toBe(112033);
    expect(r.factor).toBeCloseTo(0.0157793, 6);
    expect(r.byAccount.map((a) => [a.id, Math.round(a.esc)])).toEqual([["labor", 43435], ["material", 26930], ["equipment", 8214], ["subcontract", 33454]]);
    expect(r.byYear.map((y) => [y.year, Math.round(y.esc)])).toEqual([[2026, 32356], [2027, 79677]]);
    expect(r.midDate).toBe("2026-12-19");
    expect(r.advisories.filter((a) => a.severity !== "info").map((a) => a.code)).toEqual([]);
    // el precio fijado de 3.1 recorta su escalación: con el 25,6 % del costo aporta menos del 11 % de la escalación
    const k31 = r.byPackage.find((p) => p.code === "3.1")!;
    expect(k31.locked).toBe(true); expect(k31.esc / r.esc).toBeLessThan(0.11);
  });
  it("prueba de oro de la simulación SIN retraso: P50 1,77 % y P90 2,16 % del costo; el central cae en el 20–30 % (el riesgo de la tasa es hacia arriba)", () => {
    const s = simulateEscalation(plan(), paquetes(), { iterations: 10000 })!;
    expect(s.p[50]).toBeCloseTo(0.0176969, 5); expect(s.p[90]).toBeCloseTo(0.0216210, 5);
    expect(s.mean).toBeGreaterThan(s.det);
    expect(s.probAtOrBelowDet).toBeGreaterThan(0.2); expect(s.probAtOrBelowDet).toBeLessThan(0.3);
    expect(s.withDelay).toBe(false); expect(s.uncertainAccounts).toBe(4);
  });
  it("con 30 d de retraso la escalación sube en cada percentil", () => {
    const sin = simulateEscalation(plan(), paquetes(), { iterations: 4000 })!, con = simulateEscalation(plan(), paquetes(), { iterations: 4000, delaysWork: new Float64Array(4000).fill(30) })!;
    [50, 80, 90].forEach((q) => expect(con.p[q]).toBeGreaterThan(sin.p[q]));
  });
});
