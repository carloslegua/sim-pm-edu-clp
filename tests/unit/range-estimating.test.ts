// Estimación por rangos + Monte Carlo (AACE 41R-08) para la contingencia. Auditoría
// metodológica: Costos ofrecía «Simulación Monte Carlo» pero calculaba una tabla fija de %
// por clase y percentil. Estas pruebas fijan el modelo contra resultados ANALÍTICOS
// conocidos (media y varianza de la distribución triangular, suma de independientes, suma de
// perfectamente correlacionadas) para que "simulación" signifique simulación de verdad.
import { describe, expect, it } from "vitest";
import {
  contingencyAt, lineProblems, mulberry32, normCdf, rangeAdvisories, simulateRange, triInv, PERCENTILES, type RangeLine
} from "../../src/shared/range-estimating";

const L = (id: string, ml: number, lowPct: number, highPct: number, basis = "x"): RangeLine => ({ id, name: id, ml, lowPct, highPct, basis });
const triMean = (a: number, m: number, b: number) => (a + m + b) / 3;
const triVar = (a: number, m: number, b: number) => (a * a + m * m + b * b - a * m - a * b - m * b) / 18;
const cerca = (x: number, y: number, tolRel: number) => expect(Math.abs(x - y) / Math.abs(y)).toBeLessThan(tolRel);

describe("primitivas", () => {
  it("Φ(x): valores conocidos de la normal estándar", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 5);
    expect(normCdf(-1.959964)).toBeCloseTo(0.025, 5);
    expect(normCdf(1)).toBeCloseTo(0.841345, 5);
  });
  it("inversa triangular: extremos, moda y monotonía", () => {
    expect(triInv(0, 90, 100, 130)).toBeCloseTo(90, 9);
    expect(triInv(1, 90, 100, 130)).toBeCloseTo(130, 9);
    expect(triInv(10 / 40, 90, 100, 130)).toBeCloseTo(100, 9);       // u = (m−a)/(b−a) → moda
    expect(triInv(0.3, 90, 100, 130)).toBeGreaterThan(triInv(0.2, 90, 100, 130));
    expect(triInv(0.7, 100, 100, 100)).toBe(100);                    // sin rango
  });
  it("el generador es determinista: misma semilla, misma secuencia; semillas distintas, distinta", () => {
    const a = mulberry32(7), b = mulberry32(7), c = mulberry32(8);
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    expect(sa).toEqual(sb); expect(sa).not.toEqual(sc);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("simulateRange -- contra resultados analíticos", () => {
  it("una partida: media y desviación de la triangular", () => {
    const r = simulateRange([L("a", 100, -10, 40)], { iterations: 40000 })!;
    const a = 90, m = 100, b = 140;
    cerca(r.mean, triMean(a, m, b), 0.005);
    cerca(r.sd, Math.sqrt(triVar(a, m, b)), 0.02);
    expect(r.ml).toBe(100);
    expect(r.min).toBeGreaterThanOrEqual(90); expect(r.max).toBeLessThanOrEqual(140);
  });
  it("independientes (ρ = 0): la media suma y la VARIANZA suma", () => {
    const ls = [L("a", 100, -10, 30), L("b", 200, -5, 20), L("c", 50, -20, 60)];
    const r = simulateRange(ls, { iterations: 40000, correlation: 0 })!;
    const st = [[90, 100, 130], [190, 200, 240], [40, 50, 80]];
    cerca(r.mean, st.reduce((s, x) => s + triMean(x[0], x[1], x[2]), 0), 0.003);
    cerca(r.sd, Math.sqrt(st.reduce((s, x) => s + triVar(x[0], x[1], x[2]), 0)), 0.03);
  });
  it("perfectamente correlacionadas (ρ = 1): las DESVIACIONES suman (mucha más dispersión que independientes)", () => {
    const ls = [L("a", 100, -10, 30), L("b", 200, -5, 20), L("c", 50, -20, 60)];
    const r1 = simulateRange(ls, { iterations: 40000, correlation: 1 })!, r0 = simulateRange(ls, { iterations: 40000, correlation: 0 })!;
    const st = [[90, 100, 130], [190, 200, 240], [40, 50, 80]];
    cerca(r1.sd, st.reduce((s, x) => s + Math.sqrt(triVar(x[0], x[1], x[2])), 0), 0.03);
    expect(r1.sd).toBeGreaterThan(r0.sd * 1.5);
  });
  it("la dispersión crece de forma MONÓTONA con la correlación, y la media no cambia", () => {
    const ls = Array.from({ length: 12 }, (_, i) => L("p" + i, 100 + i * 10, -10, 35));
    const sds = [0, 0.3, 0.6, 1].map((rho) => simulateRange(ls, { iterations: 20000, correlation: rho })!);
    for (let i = 1; i < sds.length; i++) expect(sds[i].sd).toBeGreaterThan(sds[i - 1].sd);
    cerca(sds[0].mean, sds[3].mean, 0.005);
  });
  it("percentiles ordenados; con cola derecha larga el P50 supera al más probable (contingencia positiva) y P80 > P50", () => {
    const r = simulateRange([L("a", 1000, -10, 50), L("b", 2000, -10, 40)], { iterations: 20000 })!;
    for (let i = 1; i < PERCENTILES.length; i++) expect(r.p[PERCENTILES[i]]).toBeGreaterThan(r.p[PERCENTILES[i - 1]]);
    expect(r.p[50]).toBeGreaterThan(r.ml);
    expect(contingencyAt(r, 80).amount).toBeGreaterThan(contingencyAt(r, 50).amount);
    expect(contingencyAt(r, 50).amount).toBeGreaterThan(0);
    expect(r.curve.length).toBe(99); expect(r.curve[49]).toBeCloseTo(r.p[50], 6);
  });
  it("es reproducible: misma semilla = mismo resultado exacto; otra semilla cambia el resultado", () => {
    const ls = [L("a", 100, -10, 40), L("b", 300, -15, 25)];
    const x = simulateRange(ls, { seed: 1 })!, y = simulateRange(ls, { seed: 1 })!, z = simulateRange(ls, { seed: 2 })!;
    expect(x.p[80]).toBe(y.p[80]);
    expect(x.p[80]).not.toBe(z.p[80]);
  });
  it("sin incertidumbre (mín = más probable = máx) la contingencia es 0 en todos los percentiles", () => {
    const r = simulateRange([L("a", 100, 0, 0), L("b", 50, 0, 0)])!;
    PERCENTILES.forEach((q) => expect(contingencyAt(r, q).amount).toBe(0));
    expect(r.sd).toBe(0);
  });
  it("cola izquierda dominante: el P50 puede quedar bajo el base -> contingencia 0 y 'covered' (nunca negativa)", () => {
    const r = simulateRange([L("a", 100, -40, 5), L("b", 100, -40, 5)], { iterations: 20000 })!;
    const c = contingencyAt(r, 50);
    expect(c.raw).toBeLessThan(0); expect(c.amount).toBe(0); expect(c.covered).toBe(true);
  });
});

describe("eventos de riesgo discretos en la simulación (AACE 40R-08: incertidumbre + riesgo)", () => {
  const E = (id: string, prob: number, low: number, likely: number, high: number, sign: 1 | -1 = 1) => ({ id, name: id, prob, low, likely, high, sign });
  it("un evento solo: media y desviación de la mezcla Bernoulli × triangular (analítico)", () => {
    const r = simulateRange([], { iterations: 60000, events: [E("e", 0.3, 100, 200, 400)] })!;
    const m = triMean(100, 200, 400), ex2 = triVar(100, 200, 400) + m * m;
    cerca(r.mean, 0.3 * m, 0.02);
    cerca(r.sd, Math.sqrt(0.3 * ex2 - (0.3 * m) ** 2), 0.03);
    expect(r.eventsEV).toBeCloseTo(0.3 * m, 9);
    expect(r.events).toBe(1); expect(r.n).toBe(0); expect(r.ml).toBe(0);
  });
  it("sumar eventos desplaza la media exactamente su valor esperado y NO cambia el estimado base", () => {
    const ls = [L("a", 1000, -10, 30), L("b", 2000, -5, 20)];
    const ev = [E("e1", 0.5, 100, 200, 400), E("e2", 0.2, 500, 800, 1500)];
    const sin = simulateRange(ls, { iterations: 40000 })!, con = simulateRange(ls, { iterations: 40000, events: ev })!;
    cerca(con.mean - sin.mean, con.eventsEV, 0.05);
    expect(con.ml).toBe(sin.ml);
    expect(contingencyAt(con, 80).amount).toBeGreaterThan(contingencyAt(sin, 80).amount);   // más exposición = más contingencia al mismo percentil
    expect(con.sd).toBeGreaterThan(sin.sd);
  });
  it("una oportunidad (signo −1) reduce la media y el valor esperado neto", () => {
    const r = simulateRange([L("a", 1000, 0, 0)], { iterations: 40000, events: [E("o", 0.5, 100, 200, 400, -1)] })!;
    expect(r.eventsEV).toBeLessThan(0);
    cerca(r.mean, 1000 + r.eventsEV, 0.01);
    expect(r.min).toBeLessThan(1000);
  });
  it("con eventos y sin partidas hay resultado (estimado base 0); sin nada, no", () => {
    expect(simulateRange([], { events: [E("e", 0.5, 1, 2, 3)] })).not.toBeNull();
    expect(simulateRange([], { events: [] })).toBeNull();
    expect(simulateRange([], {})).toBeNull();
  });
  it("los eventos inválidos se ignoran: probabilidad 0 o > 1, orden mín ≤ más probable ≤ máx roto, negativos", () => {
    const r = simulateRange([L("a", 100, 0, 0)], { events: [E("p0", 0, 1, 2, 3), E("p2", 1.5, 1, 2, 3), E("ord", 0.5, 5, 2, 9), E("neg", 0.5, -1, 2, 3), E("ok", 0.5, 1, 2, 3)] })!;
    expect(r.events).toBe(1);
  });
  it("sigue siendo reproducible con eventos (misma semilla = mismo resultado)", () => {
    const ls = [L("a", 500, -10, 40)], ev = [E("e", 0.4, 10, 50, 120)];
    expect(simulateRange(ls, { seed: 3, events: ev })!.p[80]).toBe(simulateRange(ls, { seed: 3, events: ev })!.p[80]);
  });
  it("sin eventos el resultado es idéntico al de antes (los eventos no alteran la secuencia de las partidas cuando no hay)", () => {
    const ls = [L("a", 100, -10, 40), L("b", 300, -15, 25)];
    expect(simulateRange(ls, { seed: 1, events: [] })!.p[80]).toBe(simulateRange(ls, { seed: 1 })!.p[80]);
  });
  it("el aviso ‘sin incertidumbre’ no se dispara si hay eventos; la comparación con el rango de la clase usa el TOTAL (partidas + eventos)", () => {
    const ls = [L("a", 500, 0, 0, "x")];
    const chico = simulateRange(ls, { events: [E("e", 0.5, 10, 20, 40)] })!;
    expect(rangeAdvisories(ls, chico, 500, { lo: -30, hi: 50 }).join("|")).not.toMatch(/Ninguna partida tiene incertidumbre/);
    expect(rangeAdvisories(ls, chico, 500, { lo: -30, hi: 50 }).join("|")).toMatch(/mucho más estrecho que el rango de exactitud aplicado a la clase/);   // el total sigue siendo estrecho
    const grande = simulateRange(ls, { events: [E("e", 0.9, 150, 250, 400)] })!;                                                             // eventos que sí ensanchan el total (P90 ≈ +80 %)
    expect(rangeAdvisories(ls, grande, 500, { lo: -30, hi: 50 }).join("|")).not.toMatch(/mucho más estrecho/);
  });
});

describe("validación y avisos", () => {
  it("lineProblems: costo > 0, mínimo entre −100 % y 0, máximo ≥ 0", () => {
    expect(lineProblems(L("a", 100, -10, 20))).toEqual([]);
    expect(lineProblems(L("a", 0, -10, 20)).join("|")).toMatch(/mayor que cero/);
    expect(lineProblems(L("a", 100, 5, 20)).join("|")).toMatch(/mínimo/);
    expect(lineProblems(L("a", 100, -120, 20)).join("|")).toMatch(/mínimo/);
    expect(lineProblems(L("a", 100, -10, -1)).join("|")).toMatch(/máximo/);
    expect(lineProblems({ id: "a", name: "a", ml: NaN as unknown as number, lowPct: 0, highPct: 0 }).length).toBe(1);
  });
  it("las partidas inválidas quedan fuera y se cuentan; si no queda ninguna, no hay resultado", () => {
    const r = simulateRange([L("a", 100, -10, 20), L("mal", -5, -10, 20)])!;
    expect(r.n).toBe(1); expect(r.excluded).toBe(1);
    expect(simulateRange([L("mal", 0, 0, 0)])).toBeNull();
    expect(simulateRange([])).toBeNull();
    expect(simulateRange(null)).toBeNull();
  });
  it("avisos: sin partidas, cobertura del costo base, sin fundamento, sin incertidumbre, ρ = 0 y rango más estrecho que la clase", () => {
    expect(rangeAdvisories([], null, 1000)[0]).toMatch(/Define las partidas/);
    const ls = [L("a", 500, -10, 10, ""), L("b", 300, 0, 0, "ok")];
    const r = simulateRange(ls, { correlation: 0 })!;
    const w = rangeAdvisories(ls, r, 1000, { lo: -30, hi: 50 }).join("|");
    expect(w).toMatch(/suman 800 \(80\.0 % del costo base 1,?000\)/);
    expect(w).toMatch(/1 de 2 partida\(s\) sin fundamento/);
    expect(w).toMatch(/1 partida\(s\) sin incertidumbre/);
    expect(w).toMatch(/Correlación 0 %/);
    expect(w).toMatch(/mucho más estrecho que el rango de exactitud aplicado a la clase/);
  });
  it("sin avisos molestos cuando todo está bien: cobertura completa, fundamento y correlación moderada", () => {
    const ls = [L("a", 500, -10, 40), L("b", 500, -10, 40)];
    const r = simulateRange(ls)!;
    expect(rangeAdvisories(ls, r, 1000, { lo: -30, hi: 50 })).toEqual([]);
  });
});
