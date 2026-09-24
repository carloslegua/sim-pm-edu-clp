// Escalación por índices y Monte Carlo (AACE 58R-10 / 68R-11): src/shared/escalation.ts. Lógica pura.
// Las cifras esperadas se calculan aquí con fórmulas ANALÍTICAS independientes de la implementación.
import { describe, expect, it } from "vitest";
import {
  dayNum, escalate, escalationAdvisories, fxExposure, horizonYears, indexAt, isoOfDay, normalizeEscPlan, provisionFactor, rateFor, simpleEscalation,
  simpleMethodAdvisory, simulateEscalation, type EscPackage, type EscPlan
} from "../../src/shared/escalation";

const pk = (id: string, cost: number, start: string | null, end: string | null): EscPackage => ({ id, code: id.toUpperCase(), name: "Paquete " + id, cost, start, end });
// Plan con las cuentas dadas ({ id: { año: tasa % } }) y la composición por omisión.
const plan = (base: string, accs: Record<string, Record<string, number>>, mix: Record<string, number>, extra: Partial<EscPlan> = {}, unc: Record<string, [number, number]> = {}): EscPlan =>
  normalizeEscPlan({
    method: "indices", accounts: Object.keys(accs).map((id) => ({ id, rates: accs[id], source: "Fuente de prueba", low: unc[id] ? unc[id][0] : 0, high: unc[id] ? unc[id][1] : 0 })), defaultMix: mix, ...extra
  }, base);

describe("fechas e índices", () => {
  it("dayNum / isoOfDay: ida y vuelta y fechas inválidas", () => {
    expect(isoOfDay(dayNum("2026-07-06") as number)).toBe("2026-07-06");
    expect((dayNum("2026-07-07") as number) - (dayNum("2026-07-06") as number)).toBe(1);
    ["", "2026-13-01", "2026-02-30", "26-07-06", null, undefined, "2026/07/06"].forEach((v) => expect(dayNum(v)).toBeNull());
  });
  it("índice = 1 en la fecha base y crece de forma compuesta por año: 1,04 tras 365 d al 4 %", () => {
    const r = { "2026": 4 };
    expect(indexAt(r, "2026-01-01", "2026-01-01")).toBeCloseTo(1, 12);
    expect(indexAt(r, "2026-01-01", "2027-01-01")).toBeCloseTo(1.04, 12);
    expect(indexAt(r, "2026-07-01", "2026-12-31")).toBeCloseTo(Math.pow(1.04, 183 / 365), 12);
  });
  it("cambia de tasa con el año calendario y mantiene la última más allá del pronóstico", () => {
    expect(indexAt({ "2026": 4, "2027": 6 }, "2026-01-01", "2027-07-02")).toBeCloseTo(1.04 * Math.pow(1.06, 182 / 365), 12);
    expect(indexAt({ "2026": 4 }, "2026-01-01", "2027-07-02")).toBeCloseTo(Math.pow(1.04, 547 / 365), 12);
  });
  it("antes de la fecha base el índice es 1; sin fecha o sin tasas no hay índice; el desplazamiento suma puntos a las tasas", () => {
    expect(indexAt({ "2026": 4 }, "2026-06-01", "2026-01-01")).toBeCloseTo(1, 12);
    expect(indexAt({ "2026": 4 }, "", "2026-01-01")).toBeNull();
    expect(indexAt({}, "2026-01-01", "2027-01-01")).toBeNull();
    expect(indexAt({ "2026": 4 }, "2026-01-01", "2027-01-01", 1)).toBeCloseTo(1.05, 12);
  });
  it("rateFor: la definida; si falta, la última anterior; antes de la primera, la primera", () => {
    const r = { "2027": 3, "2029": 5 };
    expect([2026, 2027, 2028, 2029, 2031].map((y) => rateFor(r, y))).toEqual([3, 3, 3, 5, 5]);
    expect(rateFor({}, 2026)).toBeNull();
  });
  it("método elemental y tipo de cambio: fórmulas y solo con régimen flotante", () => {
    expect(simpleEscalation(1000, 3.5, 0.5)).toBeCloseTo(1000 * (Math.pow(1.035, 0.5) - 1), 10);
    expect(simpleEscalation(1000, 0, 5)).toBe(0);
    expect(fxExposure(1000, 30, 8, true)).toBeCloseTo(24, 10);
    expect(fxExposure(1000, 30, 8, false)).toBe(0);
  });
});

describe("escalate — pronóstico central (58R-10)", () => {
  it("relación básica: $Escalación = base × [Índice(fecha de gasto) / Índice(fecha base) − 1]", () => {
    const r = escalate(plan("2026-01-01", { labor: { "2026": 4 } }, { labor: 100 }), [pk("a", 1000, "2027-01-01", "2027-01-01")]);
    expect(r.ok).toBe(true); expect(r.esc).toBeCloseTo(40, 9); expect(r.factor).toBeCloseTo(0.04, 12);
    expect(r.midDate).toBe("2027-01-01");
  });
  it("reparte el costo en el tiempo (lineal por mes): coincide con la media analítica del índice sobre el año", () => {
    const r = escalate(plan("2026-01-01", { labor: { "2026": 4 } }, { labor: 100 }), [pk("a", 1200, "2026-01-01", "2026-12-31")]);
    const exacta = 1200 * (0.04 / (365 * (Math.pow(1.04, 1 / 365) - 1)) - 1);   // media de 1,04^(d/365), d = 0…364
    expect(Math.abs(r.esc - exacta) / exacta).toBeLessThan(5e-4);
    expect(r.byYear).toHaveLength(1); expect(r.byYear[0]).toMatchObject({ year: 2026 }); expect(r.byYear[0].base).toBeCloseTo(1200, 9);
  });
  it("gastar más tarde escala más: el mismo costo al final del año pesa más que al principio", () => {
    const p = plan("2026-01-01", { labor: { "2026": 4 } }, { labor: 100 });
    const pronto = escalate(p, [pk("a", 1000, "2026-01-05", "2026-01-10")]).esc, tarde = escalate(p, [pk("a", 1000, "2026-11-01", "2026-11-10")]).esc;
    expect(tarde).toBeGreaterThan(pronto * 10);
  });
  it("precio fijado por contrato: el índice deja de correr en esa fecha", () => {
    const base = plan("2026-01-01", { labor: { "2026": 4 } }, { labor: 100 });
    const con = (lock: string) => plan("2026-01-01", { labor: { "2026": 4 } }, { labor: 100 }, { packages: { a: { lock } } });
    const p = [pk("a", 1000, "2026-06-01", "2026-06-30")];
    const libre = escalate(base, p).esc;
    // fijado ANTES del gasto (día 120 desde la base): todo el costo escala solo hasta esa fecha
    expect(escalate(con("2026-05-01"), p).esc).toBeCloseTo(1000 * (Math.pow(1.04, 120 / 365) - 1), 9);
    expect(escalate(con("2026-05-01"), p).byPackage[0]).toMatchObject({ lock: "2026-05-01", locked: true });
    expect(escalate(con("2026-01-01"), p).esc).toBeCloseTo(0, 12);                  // fijado en la fecha base: sin escalación
    expect(escalate(con("2026-06-15"), p).esc).toBeLessThan(libre);                   // fijado a mitad del gasto: solo escala la primera mitad
    expect(escalate(con("2027-06-15"), p).esc).toBeCloseTo(libre, 12);                // fijado después del gasto: no cambia nada
  });
  it("índice compuesto: cada cuenta con su tasa y su peso en el paquete; por paquete se puede sobrescribir la composición", () => {
    const acc = { labor: { "2026": 4 }, material: { "2026": 10 } };
    const p = [pk("a", 1000, "2027-01-01", "2027-01-01")];
    const r = escalate(plan("2026-01-01", acc, { labor: 50, material: 50 }), p);
    expect(r.esc).toBeCloseTo(1000 * (0.5 * 0.04 + 0.5 * 0.10), 9);
    expect(r.byAccount.map((a) => [a.id, Math.round(a.esc * 1e6) / 1e6])).toEqual([["labor", 20], ["material", 50]]);
    expect(r.byAccount.reduce((s, a) => s + a.esc, 0)).toBeCloseTo(r.esc, 9);
    expect(escalate(plan("2026-01-01", acc, { labor: 50, material: 50 }, { packages: { a: { mix: { material: 100 } } } }), p).esc).toBeCloseTo(100, 9);
  });
  it("la composición se normaliza (no tiene que sumar 100) y una cuenta sin pronóstico NO se escala y se avisa (X3)", () => {
    const p = [pk("a", 1000, "2027-01-01", "2027-01-01")];
    expect(escalate(plan("2026-01-01", { labor: { "2026": 4 }, material: { "2026": 10 } }, { labor: 1, material: 1 }), p).esc).toBeCloseTo(70, 9);
    const r = escalate(plan("2026-01-01", { labor: { "2026": 4 } }, { labor: 50, material: 50 }), p);
    expect(r.esc).toBeCloseTo(20, 9);                                               // solo la mitad con pronóstico
    expect(r.advisories.map((a) => a.code)).toContain("X3");
  });
  it("suma por paquete, por año y por cuenta = total; varios años con su propia tasa", () => {
    const pkgs = [pk("a", 600000, "2026-08-01", "2027-03-31"), pk("b", 400000, "2027-01-15", "2027-09-30")];
    const r = escalate(plan("2026-07-01", { labor: { "2026": 4, "2027": 5 }, material: { "2026": 3, "2027": 3.5 } }, { labor: 60, material: 40 }), pkgs);
    expect(r.esc).toBeGreaterThan(0);
    expect(r.byPackage.reduce((s, p) => s + p.esc, 0)).toBeCloseTo(r.esc, 6);
    expect(r.byYear.reduce((s, y) => s + y.esc, 0)).toBeCloseTo(r.esc, 6);
    expect(r.byYear.reduce((s, y) => s + y.base, 0)).toBeCloseTo(1000000, 6);
    expect(r.byYear.map((y) => y.year)).toEqual([2026, 2027]);
    expect(r.byPackage[1].pct).toBeGreaterThan(r.byPackage[0].pct * 0.5);
    expect(r.byPackage.map((p) => p.pct.toFixed(1))).toEqual(r.byPackage.map((p) => (p.esc / p.cost * 100).toFixed(1)));
  });
  it("sin fecha base, sin pronósticos o sin fechas: no calcula y dice por qué (riesgo)", () => {
    const p = [pk("a", 1000, "2027-01-01", "2027-01-31")];
    const a = escalate(plan("", { labor: { "2026": 4 } }, { labor: 100 }), p);
    expect(a.ok).toBe(false); expect(a.esc).toBe(0); expect(a.advisories[0]).toMatchObject({ code: "X1", severity: "riesgo" });
    const b = escalate(plan("2026-01-01", {}, { labor: 100 }), p);
    expect(b.advisories[0]).toMatchObject({ code: "X2", severity: "riesgo" });
    const c = escalate(plan("2026-01-01", { labor: { "2026": 4 } }, { labor: 100 }), [pk("a", 1000, null, null)]);
    expect(c.advisories[0]).toMatchObject({ code: "X7", severity: "riesgo" });
    expect(c.base).toBe(1000);
  });
  it("un paquete sin fechas se ubica en la fecha media del gasto y se avisa (X6)", () => {
    const r = escalate(plan("2026-01-01", { labor: { "2026": 4 } }, { labor: 100 }), [pk("a", 1000, "2026-10-01", "2026-10-01"), pk("b", 1000, null, null)]);
    expect(r.ok).toBe(true); expect(r.undated).toEqual(["B"]);
    expect(r.byPackage[1].esc).toBeCloseTo(r.byPackage[0].esc, 9);                // misma fecha
    expect(r.advisories.map((a) => a.code)).toContain("X6");
  });
  it("gasto anterior a la fecha base: no se escala (X11); pronóstico corto: se mantiene la última tasa (X4); sin fuente (X5)", () => {
    const r = escalate(plan("2026-06-01", { labor: { "2026": 4 } }, { labor: 100 }), [pk("a", 1000, "2026-01-10", "2026-01-20"), pk("b", 1000, "2028-01-10", "2028-01-20")]);
    expect(r.byPackage[0].esc).toBe(0);
    const codes = r.advisories.map((a) => a.code);
    expect(codes).toContain("X11"); expect(codes).toContain("X4");
    const sinFuente = escalate(normalizeEscPlan({ method: "indices", accounts: [{ id: "labor", rates: { "2026": 4 } }], defaultMix: { labor: 100 } }, "2026-01-01"), [pk("a", 1000, "2027-01-01", "2027-01-01")]);
    expect(sinFuente.advisories.map((a) => a.code)).toContain("X5");
  });
  it("paquetes sin costo se ignoran; horizonYears cubre desde la fecha base hasta el último año de gasto", () => {
    expect(escalate(plan("2026-01-01", { labor: { "2026": 4 } }, { labor: 100 }), [pk("a", 0, "2027-01-01", "2027-01-01"), pk("b", 500, "2027-01-01", "2027-01-01")]).base).toBe(500);
    expect(horizonYears("2026-07-01", [pk("a", 1, "2026-08-01", "2027-07-21")])).toEqual([2026, 2027, 2028]);
    expect(horizonYears("", [])).toEqual([]);
    expect(horizonYears("2026-07-01", [])).toEqual([2026, 2027, 2028]);
  });
});

describe("simulateEscalation — Monte Carlo (68R-11)", () => {
  const pkgs = [pk("a", 600000, "2026-08-01", "2027-03-31"), pk("b", 400000, "2027-01-15", "2027-09-30")];
  const accs = { labor: { "2026": 4, "2027": 5 }, material: { "2026": 3, "2027": 3.5 } };
  const N = 2000;
  it("sin incertidumbre ni retraso todas las iteraciones dan el pronóstico central", () => {
    const p = plan("2026-07-01", accs, { labor: 60, material: 40 }), s = simulateEscalation(p, pkgs, { iterations: N }) as NonNullable<ReturnType<typeof simulateEscalation>>;
    const det = escalate(p, pkgs);
    expect(s.det).toBeCloseTo(det.factor, 12);
    expect(s.sd).toBeLessThan(1e-9); expect(s.p[10]).toBeCloseTo(det.factor, 12); expect(s.p[90]).toBeCloseTo(det.factor, 12);
    expect(s.probAtOrBelowDet).toBe(1); expect(s.uncertainAccounts).toBe(0); expect(s.withDelay).toBe(false);
  });
  it("con incertidumbre en las tasas: percentiles ordenados; el central cae dentro del rango; la media supera al central si el riesgo es hacia arriba", () => {
    const p = plan("2026-07-01", accs, { labor: 60, material: 40 }, {}, { labor: [-1, 3], material: [-1.5, 4] });
    const s = simulateEscalation(p, pkgs, { iterations: N }) as NonNullable<ReturnType<typeof simulateEscalation>>;
    expect(s.sd).toBeGreaterThan(0);
    expect(s.p[5]).toBeLessThan(s.p[50]); expect(s.p[50]).toBeLessThan(s.p[90]); expect(s.p[90]).toBeLessThan(s.p[95]);
    expect(s.min).toBeLessThan(s.det); expect(s.max).toBeGreaterThan(s.det);
    expect(s.mean).toBeGreaterThan(s.det);                                          // triangular asimétrica (mín −1, máx +3): media de +0,67 pp
    expect(s.probAtOrBelowDet).toBeGreaterThan(0.2); expect(s.probAtOrBelowDet).toBeLessThan(0.6);
    expect(s.curve).toHaveLength(99); expect(s.curve[0]).toBeLessThanOrEqual(s.curve[98]);
    expect(s.uncertainAccounts).toBe(2);
  });
  it("es determinista (semilla fija) y la semilla cambia el resultado", () => {
    const p = plan("2026-07-01", accs, { labor: 60, material: 40 }, {}, { labor: [-1, 3], material: [-1.5, 4] });
    const a = simulateEscalation(p, pkgs, { iterations: N, seed: 7 }), b = simulateEscalation(p, pkgs, { iterations: N, seed: 7 }), c = simulateEscalation(p, pkgs, { iterations: N, seed: 8 });
    expect(a).toEqual(b); expect(a!.p[50]).not.toBe(c!.p[50]);
  });
  it("correlación entre cuentas: con 100 % las cuentas se mueven juntas y el total se dispersa más que con 0 %", () => {
    const u = { labor: [-2, 4], material: [-2, 4] } as Record<string, [number, number]>;
    const sd = (rho: number) => (simulateEscalation(plan("2026-07-01", accs, { labor: 50, material: 50 }, { correlation: rho }, u), pkgs, { iterations: N }) as NonNullable<ReturnType<typeof simulateEscalation>>).sd;
    expect(sd(1)).toBeGreaterThan(sd(0) * 1.2);
  });
  it("retraso del cronograma (análisis integrado): desplaza el gasto y sube la escalación, progresivamente", () => {
    const p = plan("2026-07-01", accs, { labor: 60, material: 40 });
    const sin = simulateEscalation(p, pkgs, { iterations: N }) as NonNullable<ReturnType<typeof simulateEscalation>>;
    const d20 = new Float64Array(N).fill(20), d40 = new Float64Array(N).fill(40);
    const c20 = simulateEscalation(p, pkgs, { iterations: N, delaysWork: d20 }) as NonNullable<ReturnType<typeof simulateEscalation>>, c40 = simulateEscalation(p, pkgs, { iterations: N, delaysWork: d40 }) as NonNullable<ReturnType<typeof simulateEscalation>>;
    expect(c20.withDelay).toBe(true); expect(c20.delayMeanCal).toBeCloseTo(28, 9);       // 20 d laborables = 28 d de calendario
    expect(c20.p[50]).toBeGreaterThan(sin.p[50]); expect(c40.p[50]).toBeGreaterThan(c20.p[50]);
    expect(simulateEscalation(p, pkgs, { iterations: N, delaysWork: new Float64Array(N - 1).fill(20) })!.withDelay).toBe(false);   // largo distinto: se ignora
  });
  it("un retraso NO afecta a los paquetes con precio fijado antes de su gasto", () => {
    const p = plan("2026-07-01", accs, { labor: 60, material: 40 }, { packages: { a: { lock: "2026-07-15" }, b: { lock: "2026-07-15" } } });
    const s = simulateEscalation(p, pkgs, { iterations: N, delaysWork: new Float64Array(N).fill(40) }) as NonNullable<ReturnType<typeof simulateEscalation>>;
    expect(s.p[50]).toBeCloseTo(s.det, 12);
  });
  it("sin lo necesario devuelve null; provisionFactor elige el central o el percentil", () => {
    expect(simulateEscalation(plan("", accs, { labor: 100 }), pkgs, { iterations: N })).toBeNull();
    const p = plan("2026-07-01", accs, { labor: 60, material: 40 }, { provision: "p80" }, { labor: [-1, 3], material: [-1, 3] });
    const res = escalate(p, pkgs), s = simulateEscalation(p, pkgs, { iterations: N });
    expect(provisionFactor(p, res, s).factor).toBe(s!.p[80]); expect(provisionFactor(p, res, s).label).toBe("P80 de la simulación");
    expect(provisionFactor({ ...p, provision: "central" }, res, s).factor).toBe(res.factor);
    expect(provisionFactor(p, res, null).label).toMatch(/sin simulación/);
  });
});

describe("normalizeEscPlan y avisos", () => {
  it("un proyecto guardado antes (sin método) se lee como simple; un plan nuevo es por índices", () => {
    expect(normalizeEscPlan({ inflation: 3.5, years: 0.5, fxShare: 30 }).method).toBe("simple");
    expect(normalizeEscPlan(undefined).method).toBe("indices");
    expect(normalizeEscPlan({ method: "indices" }).method).toBe("indices");
  });
  it("sanea: años inválidos, tasas vacías, fechas de fijación inválidas, correlación fuera de rango y rangos con el signo correcto", () => {
    const p = normalizeEscPlan({ method: "indices", correlation: 4, provision: "p99", accounts: [{ id: "labor", rates: { "2026": "4", "26": 3, "2027": "", "2028": "x" }, low: 2, high: -1 }], packages: { a: { lock: "2026-13-01", mix: { labor: 0 } }, b: { lock: "2026-08-01", mix: { labor: 30, material: 70 } } } }, "2026-07-01");
    expect(p.accounts[0].rates).toEqual({ "2026": 4 }); expect(p.accounts[0].low).toBe(0); expect(p.accounts[0].high).toBe(0);
    expect(p.correlation).toBe(1); expect(p.provision).toBe("central"); expect(p.baseDate).toBe("2026-07-01");
    expect(p.packages).toEqual({ b: { lock: "2026-08-01", mix: { labor: 30, material: 70 } } });
    expect(p.accounts.map((a) => a.id)).toEqual(["labor", "material", "equipment", "subcontract"]);
  });
  it("avisos de la simulación: sin incertidumbre (X9), sin retraso (X10), contingencia sin escalar (X12), riesgo de precio que se solapa (X14)", () => {
    const p = plan("2026-07-01", { labor: { "2026": 4 } }, { labor: 100 }, { onContingency: false }), pk1 = [pk("a", 1000, "2027-01-01", "2027-01-01")];
    const res = escalate(p, pk1), sim = simulateEscalation(p, pk1, { iterations: 1000 });
    const codes = escalationAdvisories(p, res, sim, { riskTitles: ["Alza del precio del acero estructural", "Retraso en la licencia"] }).map((a) => a.code);
    ["X9", "X10", "X12", "X14"].forEach((c) => expect(codes).toContain(c));
    expect(escalationAdvisories(p, res, sim, { riskTitles: ["Retraso en la licencia"] }).map((a) => a.code)).not.toContain("X14");
  });
  it("método simple con estimado de clase 1–3: avisa que una tasa y un punto de gasto no alcanzan (X13)", () => {
    expect(simpleMethodAdvisory(3)).toMatchObject({ code: "X13", severity: "aviso" });
    expect(simpleMethodAdvisory(4)).toBeNull(); expect(simpleMethodAdvisory(undefined)).toBeNull();
  });
});
