// Registro de riesgos: base PMI (enunciado causa–evento–efecto, matriz P×I con umbrales del plan,
// estrategias por tipo, residual) y AACE (valor esperado con rango de tres puntos, exposición
// residual como base de la contingencia). Estas pruebas fijan el cálculo y cada guarda de coherencia.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN, blankRisk, buildMatrix, costLevel, impactMean, inherentEV, inherentScore, levelOf, nextCode, normalizePlan,
  normalizeRisk, portfolio, probEffective, rangeProblems, rankRisks, residualOf, riskEventsOf, riskFindings, riskScore, strategiesFor,
  timeLevel, toLevel, toNum, toRiskRef, validatePlan, type Risk
} from "../../src/shared/risk-analysis";
import { riskPortfolio } from "../../src/core/gpi-core";

const P = DEFAULT_PLAN;
const R = (o: Partial<Risk> = {}): Risk => ({ ...blankRisk("r1", "R-01"), title: "T", cause: "c", event: "e", effect: "f", owner: "PM", ...o });
const codes = (r: Risk, opts = {}) => riskFindings(r, P, opts).map((f) => f.code);

describe("normalización tolerante (datos importados)", () => {
  it("toNum / toLevel: solo números válidos; niveles 1..5 enteros", () => {
    expect([toNum("12"), toNum(" 3,5 "), toNum(""), toNum(null), toNum("x"), toNum(NaN), toNum(7)]).toEqual([12, null, null, null, null, null, 7]);
    expect([toLevel(1), toLevel("5"), toLevel(0), toLevel(6), toLevel(2.5), toLevel("a")]).toEqual([1, 5, null, null, null, null]);
  });
  it("normalizeRisk rellena valores por omisión y descarta basura sin romperse", () => {
    const r = normalizeRisk({ id: "x", type: "raro", status: "inventado", prob: "9", impCost: "4", costImpact: { low: "10", likely: "x" }, wbsIds: "no-array", proximity: "ayer" }, "f");
    expect(r).toMatchObject({ id: "x", code: "x", type: "amenaza", status: "identificado", prob: null, impCost: 4, wbsIds: [], proximity: "" });
    expect(r.costImpact).toEqual({ low: 10, likely: null, high: null });
    expect(normalizeRisk(null, "f").id).toBe("f");
  });
  it("normalizePlan: valores por omisión, arreglos de longitud incorrecta se descartan, categorías vacías vuelven a las de PMI", () => {
    const p = normalizePlan({ probPct: [1, 2], thresholdMedium: "8", categories: ["  ", ""] });
    expect(p.probPct).toEqual(DEFAULT_PLAN.probPct);
    expect(p.thresholdMedium).toBe(8);
    expect(p.categories).toEqual(DEFAULT_PLAN.categories);
    expect(normalizePlan(undefined)).toEqual(DEFAULT_PLAN);
  });
});

describe("plan: escalas y umbrales", () => {
  it("el plan por omisión es coherente", () => expect(validatePlan(P)).toEqual([]));
  it("las escalas deben crecer y los umbrales cumplir 1 ≤ medio < alto ≤ 25", () => {
    const m = validatePlan({ ...P, probPct: [10, 30, 30, 70, 90], costBandsPct: [5, 3, 8, 10], timeBandsDays: [0, 5, 6, 7], thresholdMedium: 15, thresholdHigh: 15, reviewDays: 0, categories: ["A", "a"] }).join("|");
    expect(m).toMatch(/probabilidades/); expect(m).toMatch(/costo/); expect(m).toMatch(/plazo/); expect(m).toMatch(/umbrales/); expect(m).toMatch(/revisión/); expect(m).toMatch(/categorías/);
  });
  it("nivel de impacto a partir de un valor cuantificado, según las cotas del plan", () => {
    expect([0.5, 1, 1.01, 3, 4, 8, 10.5].map((pct) => costLevel(pct * 1000, 100000, P))).toEqual([1, 1, 2, 2, 3, 4, 5]);
    expect(costLevel(50, 0, P)).toBeNull();
    expect([3, 5, 6, 15, 16, 31, 61].map((d) => timeLevel(d, P))).toEqual([1, 1, 2, 2, 3, 4, 5]);
  });
  it("puntaje = probabilidad × MAYOR impacto; niveles según los umbrales del plan", () => {
    expect(riskScore(3, 2, 4, null)).toBe(12);
    expect(riskScore(null, 2, 4, 3)).toBeNull(); expect(riskScore(3, null, null, null)).toBeNull();
    expect([5, 6, 12, 14, 15, 25].map((s) => levelOf(s, P))).toEqual(["bajo", "medio", "medio", "medio", "alto", "alto"]);
    expect(levelOf(null, P)).toBeNull();
    expect(levelOf(10, { ...P, thresholdMedium: 4, thresholdHigh: 9 })).toBe("alto");
  });
});

describe("valor esperado (AACE 44R-08)", () => {
  it("impacto esperado = media de la triangular con los 3 puntos; con uno solo, ese valor; inválido = sin valor", () => {
    expect(impactMean({ low: 100, likely: 200, high: 400 })).toBeCloseTo(233.3333, 4);
    expect(impactMean({ low: null, likely: 250, high: null })).toBe(250);
    expect(impactMean({ low: null, likely: null, high: null })).toBeNull();
    expect(impactMean({ low: 300, likely: 200, high: 400 })).toBeNull();
  });
  it("rangeProblems: negativos y orden mín ≤ más probable ≤ máx", () => {
    expect(rangeProblems({ low: -1, likely: 2, high: 3 }, "X")[0]).toMatch(/negativos/);
    expect(rangeProblems({ low: 5, likely: 2, high: 9 }, "X")[0]).toMatch(/mínimo supera al más probable/);
    expect(rangeProblems({ low: 1, likely: 9, high: 4 }, "X")[0]).toMatch(/más probable supera al máximo/);
    expect(rangeProblems({ low: 1, likely: 2, high: 3 }, "X")).toEqual([]);
  });
  it("probabilidad efectiva: la cuantificada manda; si no, la del nivel del plan", () => {
    expect(probEffective(35, 5, P)).toBe(0.35); expect(probEffective(null, 4, P)).toBe(0.7);
    expect(probEffective(null, null, P)).toBeNull(); expect(probEffective(150, 2, P)).toBe(0.3);
  });
  it("EV = probabilidad × media del rango, en costo y en plazo", () => {
    const r = R({ prob: 3, costImpact: { low: 100, likely: 200, high: 400 }, timeImpact: { low: 5, likely: 10, high: 15 } });
    expect(inherentEV(r, P).cost).toBeCloseTo(0.5 * 233.3333, 3);
    expect(inherentEV(r, P).time).toBeCloseTo(0.5 * 10, 6);
    expect(inherentEV(R({ prob: 3 }), P)).toEqual({ cost: null, time: null });
  });
});

describe("riesgo residual", () => {
  it("aceptar: el residual ES el inherente (no hay respuesta que lo reduzca)", () => {
    const r = R({ prob: 4, impCost: 3, costImpact: { low: null, likely: 1000, high: null }, strategy: "aceptar" });
    const s = residualOf(r, P);
    expect(s).toMatchObject({ assessed: true, derived: true, prob: 4, score: 12 });
    expect(s.ev.cost).toBeCloseTo(700, 6);
  });
  it("con respuesta sin evaluar el residual no está evaluado; al evaluarlo se calcula su puntaje y EV", () => {
    const base = R({ prob: 4, impCost: 4, costImpact: { low: null, likely: 1000, high: null }, strategy: "mitigar" });
    expect(residualOf(base, P).assessed).toBe(false);
    const s = residualOf({ ...base, resProb: 2, resImpCost: 3, resCostImpact: { low: null, likely: 600, high: null } }, P);
    expect(s).toMatchObject({ assessed: true, derived: false, score: 6 });
    expect(s.ev.cost).toBeCloseTo(0.3 * 600, 6);
  });
  it("sin estrategia no hay residual", () => expect(residualOf(R({ prob: 4, impCost: 4 }), P).assessed).toBe(false));
});

describe("hallazgos de coherencia", () => {
  it("R0/R1 título y enunciado causa–evento–efecto; R2 propietario (riesgo si el puntaje es alto)", () => {
    expect(codes(R({ title: "", cause: "" }))).toEqual(expect.arrayContaining(["R0", "R1"]));
    expect(codes(R({ owner: "" }))).toContain("R2");
    expect(riskFindings(R({ owner: "", prob: 5, impCost: 5 }), P).find((f) => f.code === "R2")!.severity).toBe("riesgo");
    expect(riskFindings(R({ owner: "", prob: 1, impCost: 1 }), P).find((f) => f.code === "R2")!.severity).toBe("aviso");
  });
  it("R3 sin analizar; los hallazgos de análisis no se disparan sin puntaje", () => {
    expect(codes(R())).toContain("R3");
    expect(codes(R({ prob: 3 }))).toContain("R3");
    expect(codes(R({ status: "cerrado" }))).not.toContain("R3");
  });
  it("R4 nivel medio/alto sin estrategia (riesgo si alto); bajo no la exige", () => {
    expect(riskFindings(R({ prob: 5, impCost: 5 }), P).find((f) => f.code === "R4")!.severity).toBe("riesgo");
    expect(riskFindings(R({ prob: 3, impCost: 3 }), P).find((f) => f.code === "R4")!.severity).toBe("aviso");
    expect(codes(R({ prob: 1, impCost: 2 }))).not.toContain("R4");
    expect(codes(R({ prob: 5, impCost: 5, strategy: "mitigar" }))).not.toContain("R4");
  });
  it("R5 aceptar una amenaza ALTA exige aceptación activa; una oportunidad no", () => {
    expect(codes(R({ prob: 5, impCost: 5, strategy: "aceptar" }))).toContain("R5");
    expect(codes(R({ type: "oportunidad", prob: 5, impCost: 5, strategy: "aceptar" }))).not.toContain("R5");
    expect(codes(R({ prob: 2, impCost: 3, strategy: "aceptar" }))).not.toContain("R5");
  });
  it("R6 estrategia que no corresponde al tipo (amenaza vs oportunidad)", () => {
    expect(codes(R({ strategy: "explotar" }))).toContain("R6");
    expect(codes(R({ type: "oportunidad", strategy: "mitigar" }))).toContain("R6");
    expect(codes(R({ type: "oportunidad", strategy: "explotar" }))).not.toContain("R6");
    expect(strategiesFor("amenaza")).toContain("evitar"); expect(strategiesFor("oportunidad")).toContain("mejorar");
  });
  it("R7/R8 residual: mayor que el inherente, o respuesta sin residual evaluado", () => {
    expect(codes(R({ prob: 3, impCost: 3, strategy: "mitigar" }))).toContain("R8");
    expect(codes(R({ prob: 3, impCost: 3, strategy: "mitigar", resProb: 4, resImpCost: 4 }))).toContain("R7");
    expect(codes(R({ prob: 3, impCost: 3, strategy: "mitigar", resProb: 1, resImpCost: 2, responseOwner: "X" }))).not.toEqual(expect.arrayContaining(["R7", "R8"]));
    // en una OPORTUNIDAD, tras «mejorar» el residual mayor que el inherente es lo deseado: no es un hallazgo
    expect(codes(R({ type: "oportunidad", prob: 3, impCost: 3, strategy: "mejorar", resProb: 4, resImpCost: 3, responseOwner: "X" }))).not.toContain("R7");
  });
  it("R10 impacto en costo ≥ 3 sin cuantificar; R11 nivel declarado vs valor cuantificado (≥ 2 niveles)", () => {
    expect(codes(R({ prob: 3, impCost: 3, strategy: "mitigar" }))).toContain("R10");
    expect(codes(R({ prob: 3, impCost: 3, strategy: "mitigar", costImpact: { low: null, likely: 50000, high: null } }))).not.toContain("R10");
    // 50.000 sobre 1.000.000 = 5 % → nivel 3, y se declaró 1
    expect(codes(R({ prob: 3, impCost: 1, costImpact: { low: null, likely: 50000, high: null } }), { costBase: 1000000 })).toContain("R11");
    expect(codes(R({ prob: 3, impCost: 3, costImpact: { low: null, likely: 50000, high: null } }), { costBase: 1000000 })).not.toContain("R11");
    expect(codes(R({ prob: 3, impTime: 1, timeImpact: { low: null, likely: 45, high: null } }))).toContain("R11");   // 45 días = nivel 4
  });
  it("R15 rangos incoherentes; R16 probabilidad cuantificada fuera del nivel", () => {
    expect(codes(R({ prob: 3, impCost: 3, costImpact: { low: 500, likely: 100, high: 900 } }))).toContain("R15");
    expect(codes(R({ prob: 2, impCost: 2, probPct: 95 }))).toContain("R16");
    expect(codes(R({ prob: 2, impCost: 2, probPct: 35 }))).not.toContain("R16");
  });
  it("R9 sin paquetes de la EDT / referencias a paquetes que ya no existen", () => {
    expect(codes(R())).toContain("R9");
    expect(codes(R({ wbsIds: ["w1"] }), { leafIds: ["w1", "w2"] })).not.toContain("R9");
    expect(riskFindings(R({ wbsIds: ["zz"] }), P, { leafIds: ["w1"] }).find((f) => f.code === "R9")!.text).toMatch(/ya no existen/);
  });
  it("R12 revisión vencida solo en riesgos abiertos y con fechas válidas", () => {
    const base = R({ prob: 2, impCost: 2, reviewedOn: "2026-01-01", wbsIds: ["w"] });
    expect(codes(base, { today: "2026-03-01" })).toContain("R12");
    expect(codes(base, { today: "2026-01-20" })).not.toContain("R12");
    expect(codes({ ...base, status: "cerrado" }, { today: "2026-03-01" })).not.toContain("R12");
    expect(codes({ ...base, reviewedOn: "basura" }, { today: "2026-03-01" })).not.toContain("R12");
  });
  it("R13 materializado sin impacto real registrado", () => {
    expect(codes(R({ status: "materializado" }))).toContain("R13");
    expect(codes(R({ status: "materializado", actualCost: 180000 }))).not.toContain("R13");
    expect(codes(R({ status: "materializado", actualDelay: 5 }))).not.toContain("R13");
  });
});

describe("eventos para la contingencia (riskEventsOf) y vínculo con Costos", () => {
  const q = (o: Partial<Risk>): Risk => R({ prob: 3, impCost: 3, costImpact: { low: 100, likely: 200, high: 400 }, ...o });
  it("usa el RESIDUAL cuando la respuesta lo tiene cuantificado (la contingencia cubre lo que queda), y lo rotula", () => {
    const r = q({ strategy: "mitigar", resProb: 2, resImpCost: 2, resCostImpact: { low: 50, likely: 100, high: 200 } });
    const { events, excluded, ev } = riskEventsOf([r], P);
    expect(excluded).toEqual([]);
    expect(events[0]).toMatchObject({ prob: 0.3, low: 50, likely: 100, high: 200, sign: 1, basis: "residual", code: "R-01" });
    expect(ev).toBeCloseTo(0.3 * (50 + 100 + 200) / 3, 9);
  });
  it("aceptar activa = el residual ES el inherente; sin residual cuantificado se usa el inherente (conservador) y se rotula", () => {
    expect(riskEventsOf([q({ strategy: "aceptar" })], P).events[0]).toMatchObject({ prob: 0.5, likely: 200, basis: "inherente" });
    expect(riskEventsOf([q({ strategy: "mitigar", resProb: 2, resImpCost: 2 })], P).events[0]).toMatchObject({ prob: 0.5, likely: 200, basis: "inherente (residual sin cuantificar)" });
    expect(riskEventsOf([q({})], P).events[0].basis).toBe("inherente");
  });
  it("la probabilidad cuantificada manda sobre la del nivel; con solo el más probable el impacto es fijo", () => {
    const e = riskEventsOf([q({ probPct: 25, costImpact: { low: null, likely: 300, high: null } })], P).events[0];
    expect(e).toMatchObject({ prob: 0.25, low: 300, likely: 300, high: 300 });
  });
  it("las oportunidades restan (signo −1) y el valor esperado es neto", () => {
    const { events, ev } = riskEventsOf([q({ id: "a", code: "R-01" }), q({ id: "b", code: "R-02", type: "oportunidad", strategy: "aceptar" })], P);
    expect(events.map((x) => x.sign)).toEqual([1, -1]);
    expect(ev).toBeCloseTo(0, 9);                                                 // mismas cifras, signos opuestos
  });
  it("materializados y cerrados NO entran; los no cuantificables se listan con su motivo", () => {
    const set = [q({ id: "m", code: "R-01", status: "materializado" }), q({ id: "c", code: "R-02", status: "cerrado" }),
      R({ id: "s", code: "R-03", prob: 3, impCost: 3 }), q({ id: "np", code: "R-04", prob: null }), q({ id: "bad", code: "R-05", costImpact: { low: 900, likely: 200, high: 400 } }), q({ id: "ok", code: "R-06" })];
    const { events, excluded } = riskEventsOf(set, P);
    expect(events.map((e) => e.code)).toEqual(["R-06"]);
    expect(excluded.map((x) => [x.code, x.reason])).toEqual([["R-03", "sin impacto en costo cuantificado"], ["R-04", "sin probabilidad"], ["R-05", "rango de costo incoherente"]]);
  });
  it("R17/R18: el costo real de un riesgo materializado se contrasta con las órdenes vinculadas en Costos (solo si se conoce Costos)", () => {
    const m = R({ status: "materializado", actualCost: 180000, wbsIds: ["w"], prob: 3, impCost: 3 });
    const c = (linked?: { approved: number; count: number }) => riskFindings(m, P, { linked }).map((f) => f.code);
    expect(c({ approved: 180000, count: 1 })).not.toEqual(expect.arrayContaining(["R17", "R18"]));
    expect(c({ approved: 150000, count: 1 })).toContain("R17");
    expect(c({ approved: 0, count: 1 })).not.toContain("R17");                  // solo pendientes: aún no hay nada aprobado que contrastar
    expect(c({ approved: 0, count: 0 })).toContain("R18");
    expect(c(undefined)).not.toEqual(expect.arrayContaining(["R17", "R18"]));   // sin Costos a mano no se evalúa
    expect(riskFindings(R({ status: "materializado", actualCost: null, actualDelay: 5 }), P, { linked: { approved: 0, count: 0 } }).map((f) => f.code)).not.toContain("R18");
  });
  it("toRiskRef conserva lo que necesita quien vincula", () => expect(toRiskRef(R({ id: "z", code: "R-09", title: "T", status: "monitoreo" }))).toEqual({ id: "z", code: "R-09", title: "T", type: "amenaza", status: "monitoreo" }));
});

describe("riskPortfolio del núcleo (indicador del Panel)", () => {
  it("normaliza al leer: módulo vacío, nulo o con basura no rompe y cuenta solo lo válido", () => {
    expect(riskPortfolio(null)).toMatchObject({ total: 0, open: 0 });
    expect(riskPortfolio({})).toMatchObject({ total: 0 });
    const pf = riskPortfolio({ risks: [{ id: "a", prob: 5, impCost: 5 }, { id: "b", prob: 5, impCost: 5, status: "cerrado" }, "x", null, { id: "c", prob: "9" }] });
    expect(pf).toMatchObject({ total: 5, open: 4, closed: 1 });
    expect(pf.byLevel).toMatchObject({ alto: 1, sin: 3 });                                    // "x", null y prob inválida quedan sin analizar
  });
  it("usa el plan del proyecto: con otro umbral el mismo riesgo cambia de nivel", () => {
    const risks = [{ id: "a", prob: 3, impCost: 4 }];                                       // puntaje 12
    expect(riskPortfolio({ risks }).byLevel).toMatchObject({ medio: 1, alto: 0 });
    expect(riskPortfolio({ risks, plan: { thresholdMedium: 4, thresholdHigh: 10 } }).byLevel).toMatchObject({ alto: 1 });
  });
});

describe("matriz P×I, cartera y prioridad", () => {
  const set = [
    R({ id: "a", code: "R-01", prob: 4, impCost: 3, impTime: 5, strategy: "mitigar", resProb: 2, resImpTime: 3, category: "Externo", costImpact: { low: null, likely: 1000, high: null } }),
    R({ id: "b", code: "R-02", prob: 4, impCost: 5, category: "Externo", owner: "", proximity: "corta" }),
    R({ id: "c", code: "R-03", prob: 2, impScope: 2, category: "Técnico", proximity: "inmediata" }),
    R({ id: "d", code: "R-04", type: "oportunidad", prob: 3, impCost: 3, category: "Técnico", strategy: "mejorar", costImpact: { low: null, likely: 400, high: null }, resProb: 4, resImpCost: 3, resCostImpact: { low: null, likely: 400, high: null } }),
    R({ id: "e", code: "R-05", status: "materializado", prob: 5, impCost: 5, actualCost: 500 }),
    R({ id: "f", code: "R-06", status: "cerrado", prob: 5, impCost: 5 }),
    R({ id: "g", code: "R-07" })
  ];
  it("ubica cada riesgo abierto en su celda usando el MAYOR impacto; materializados y cerrados no cuentan", () => {
    const g = buildMatrix(set, "amenaza", "inherent", P);
    expect(g.length).toBe(5); expect(g[0].length).toBe(5);
    expect(g[0][0]).toMatchObject({ prob: 5, imp: 1, score: 5, level: "bajo" });        // esquina superior izquierda
    expect(g[4][4]).toMatchObject({ prob: 1, imp: 5, score: 5 });
    expect(g[0][4]).toMatchObject({ prob: 5, imp: 5, score: 25, level: "alto", ids: [] }); // e (materializado) y f (cerrado) fuera
    expect(g[1][4].ids).toEqual(["a", "b"]);                                               // P4 × impacto 5: a por su impacto en plazo (5 > 3 en costo) y b por costo
    expect(g[1][4].level).toBe("alto");
    expect(g[1][4].score).toBe(20);
    expect(g[3][1].ids).toEqual(["c"]);                                                    // P2 × impacto 2
  });
  it("la matriz residual solo incluye los riesgos con residual evaluado y usa esos valores", () => {
    const g = buildMatrix(set, "amenaza", "residual", P);
    const all = g.flatMap((r) => r.flatMap((c) => c.ids));
    expect(all).toEqual(["a"]);                                                            // b y c no tienen respuesta
    expect(g[3][2].ids).toEqual(["a"]);                                                    // residual P2 × impacto 3
  });
  it("las oportunidades tienen su propia matriz", () => {
    const g = buildMatrix(set, "oportunidad", "inherent", P);
    expect(g.flatMap((r) => r.flatMap((c) => c.ids))).toEqual(["d"]);
  });
  it("cartera: conteos, niveles, cobertura y valor esperado de amenazas − oportunidades (antes y después de la respuesta)", () => {
    const pf = portfolio(set, P);
    expect(pf).toMatchObject({ total: 7, open: 5, threats: 6, opportunities: 1, materialized: 1, closed: 1, actualCost: 500 });
    expect(pf.byLevel).toEqual({ alto: 2, medio: 1, bajo: 1, sin: 1 });                    // a=20, b=20 alto; d=9 medio; c=4 bajo; g sin analizar
    expect(pf.evThreatCost).toBeCloseTo(0.7 * 1000, 6);                                    // solo a está cuantificada
    expect(pf.evOpportunityCost).toBeCloseTo(0.5 * 400, 6);
    expect(pf.netEvCost).toBeCloseTo(700 - 200, 6);
    expect(pf.resEvOpportunityCost).toBeCloseTo(0.7 * 400, 6);                             // residual de d (P4)
    expect(pf.coverage).toMatchObject({ openCount: 5, withResponse: 2, analyzed: 4, quantified: 2 });
    expect(pf.byCategory[0]).toMatchObject({ category: "Externo", count: 2 });
  });
  it("prioridad: mayor puntaje primero y, a igual puntaje, la proximidad más cercana; sin analizar y cerrados fuera", () => {
    const rk = rankRisks(set, P).map((r) => r.code);
    expect(rk).toEqual(["R-02", "R-01", "R-04", "R-03"].filter((c) => rk.indexOf(c) >= 0));
    expect(rk[0]).toBe("R-02");                                                            // 20 con proximidad corta antes que R-01 (20, sin proximidad)
    expect(rk).not.toContain("R-05"); expect(rk).not.toContain("R-06"); expect(rk).not.toContain("R-07");
  });
  it("nextCode continúa la numeración aunque haya huecos", () => {
    expect(nextCode([])).toBe("R-01");
    expect(nextCode([R({ code: "R-03" }), R({ code: "R-10" })])).toBe("R-11");
    expect(nextCode([R({ code: "sin numero" })])).toBe("R-01");
  });
  it("inherentScore usa el mayor de los tres impactos", () => expect(inherentScore(R({ prob: 2, impCost: 1, impTime: 4, impScope: 3 }))).toBe(8));
});
