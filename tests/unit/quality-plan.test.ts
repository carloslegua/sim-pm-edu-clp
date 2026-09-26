// Plan de Calidad: src/shared/quality-plan.ts y su ejemplo DISTRIB+.
import { describe, expect, it } from "vitest";
import { blankQuality, coqSummary, coverage, executionSummary, nextCheckCode, nextInspectionCode, nextMetricCode, nextNcrCode, normalizeCheck, normalizeInspection, normalizeMetric, normalizeNcr, normalizeQuality, qualityFindings, qualityState, type QualityData, type QualityFacts } from "../../src/shared/quality-plan";
import { buildSampleQuality, sampleQualityFacts } from "../../src/shared/quality-sample";
import { SAMPLE_OBS_ROLES } from "../../src/shared/case-distribplus";
import { SAMPLE_WBS_DICTIONARY } from "../../src/shared/wbs-sample";

const facts = (): QualityFacts => ({
  leaves: [
    { id: "l1", code: "1.1", name: "Cimentación", acceptance: "Ensayos de resistencia aprobados", loe: false, cost: 100 },
    { id: "l2", code: "1.2", name: "Gestión", acceptance: "Informe aceptado", loe: true, cost: 50 },
    { id: "l3", code: "1.3", name: "Sin criterio", acceptance: "", loe: false, cost: 10 }
  ], roles: ["Control de Calidad", "Jefe de Ingeniería"], highRiskLeafIds: [], baseCost: 1000
});
const chk = (o: Record<string, unknown> = {}) => normalizeCheck({ id: "c1", code: "QC-01", wbsId: "l1", what: "Ensayo de probetas", criterion: "f'c ≥ 210", kind: "Control", method: "Ensayo de laboratorio", frequency: "Por vaciado", owner: "Control de Calidad", record: "Informe", ...o }, "c1");
const data = (o: Partial<QualityData> = {}): QualityData => ({ ...blankQuality(), policy: "Política", standards: "RNE", checks: [chk()], coq: [{ id: "q1", cat: "prevencion", description: "Revisiones", amount: 100 }, { id: "q2", cat: "evaluacion", description: "Ensayos", amount: 200 }], ...o });
const codes = (d: QualityData, f = facts()) => qualityFindings(d, f).map((x) => x.code);

describe("normalización", () => {
  it("un .json viejo o vacío se lee sin fallar; categorías desconocidas del costo pasan a prevención", () => {
    expect(normalizeQuality(null)).toEqual({ policy: "", standards: "", metrics: [], checks: [], coq: [], idCounter: 1, inspections: [], ncrs: [], asOf: "" });
    const d = normalizeQuality({ checks: [{ id: "a", wbsId: "l1" }, null], coq: [{ cat: "xx", amount: "12" }, { cat: "falla_interna", amount: "" }], metrics: [{ name: "M" }] });
    expect(d.checks).toHaveLength(2); expect(d.coq[0]).toMatchObject({ cat: "prevencion", amount: 12 }); expect(d.coq[1].amount).toBeNull(); expect(d.metrics[0].code).toBe("qm1");
    expect(normalizeMetric({ wbsIds: ["a", 2] }, "z").wbsIds).toEqual(["a", "2"]);
  });
  it("códigos siguientes", () => { expect(nextMetricCode([])).toBe("QM-01"); expect(nextCheckCode([chk({ code: "QC-09" })])).toBe("QC-10"); });
});

describe("coqSummary", () => {
  it("separa conformidad y no conformidad, su peso sobre el costo base y la parte de fallas", () => {
    const s = coqSummary([{ id: "a", cat: "prevencion", description: "", amount: 100 }, { id: "b", cat: "evaluacion", description: "", amount: 100 }, { id: "c", cat: "falla_interna", description: "", amount: 100 }, { id: "d", cat: "falla_externa", description: "", amount: null }], 8000);
    expect(s).toMatchObject({ conformity: 200, nonConformity: 100, total: 300 }); expect(s.pctOfBase).toBeCloseTo(3.75, 5); expect(s.failureShare).toBeCloseTo(33.33, 1);
    expect(coqSummary([], null)).toMatchObject({ total: 0, pctOfBase: null, failureShare: null });
  });
});

describe("qualityFindings", () => {
  it("un plan completo (control del paquete con criterio, aseguramiento, costo sano) no tiene hallazgos graves", () => {
    const d = data({ checks: [chk(), chk({ id: "c2", code: "QC-02", kind: "Aseguramiento", wbsId: "l1" })] });
    expect(qualityFindings(d, facts()).filter((x) => x.severity !== "info")).toEqual([]); expect(qualityState(d, facts())).toBe("verde");
  });
  it("Q1: paquete con criterio de aceptación sin control; los de esfuerzo continuo (LOE) y los sin criterio quedan exentos", () => {
    const q1 = qualityFindings(data({ checks: [] , coq: data().coq }), facts()).filter((x) => x.code === "Q1");
    expect(q1).toHaveLength(1); expect(q1[0].text).toMatch(/1\.1 «Cimentación».*Ensayos de resistencia aprobados/);
  });
  it("Q2: si el paquete tiene un riesgo alto abierto, la falta de control es un riesgo", () => {
    const f = facts(); f.highRiskLeafIds = ["l1"]; const q = qualityFindings(data({ checks: [chk({ wbsId: "l2" })] }), f).find((x) => x.code === "Q2")!;
    expect(q.severity).toBe("riesgo"); expect(qualityState(data({ checks: [chk({ wbsId: "l2" })] }), f)).toBe("rojo");
  });
  it("Q4–Q6, Q8: control incompleto, sin registro, responsable fuera del OBS, paquete o métrica inexistentes", () => {
    const c = codes(data({ checks: [chk({ criterion: "" }), chk({ id: "c2", owner: "Chofer", record: "" }), chk({ id: "c3", wbsId: "zz", metricId: "nada" })] }));
    ["Q4", "Q5", "Q6", "Q8"].forEach((k) => expect(c, k).toContain(k));
  });
  it("Q7: métrica sin objetivo o método, o que ningún control usa", () => {
    const m = normalizeMetric({ id: "m1", code: "QM-01", name: "Resistencia", target: "", method: "" }, "m1");
    const f = qualityFindings(data({ metrics: [m] }), facts()).filter((x) => x.code === "Q7");
    expect(f).toHaveLength(2); expect(f.map((x) => x.severity).sort()).toEqual(["aviso", "info"]);
    const ok = normalizeMetric({ id: "m1", code: "QM-01", name: "Resistencia", target: "≥ f'c", method: "Ensayo de laboratorio" }, "m1");
    expect(qualityFindings(data({ metrics: [ok], checks: [chk({ metricId: "m1" })] }), facts()).filter((x) => x.code === "Q7")).toEqual([]);
  });
  it("Q9: todo control y nada de aseguramiento; Q11: sin política o sin normas", () => {
    expect(codes(data())).toContain("Q9"); expect(codes(data({ policy: "", standards: "" })).filter((c) => c === "Q11")).toHaveLength(2);
  });
  it("Q10: sin costo de la calidad, sin prevención, o más de la mitad en fallas", () => {
    expect(codes(data({ coq: [] }))).toContain("Q10");
    const sinPrev = qualityFindings(data({ coq: [{ id: "a", cat: "evaluacion", description: "", amount: 10 }] }), facts()).find((x) => x.code === "Q10")!; expect(sinPrev.text).toMatch(/no invierte nada en prevención/);
    const fallas = qualityFindings(data({ coq: [{ id: "a", cat: "prevencion", description: "", amount: 10 }, { id: "b", cat: "falla_interna", description: "", amount: 90 }] }), facts()).find((x) => x.code === "Q10")!; expect(fallas.text).toMatch(/90 %.*fallas/);
    expect(codes(data({ coq: [{ id: "a", cat: "prevencion", description: "", amount: null }] }))).toContain("Q10");
  });
  it("sin nada cargado no hay hallazgos y el estado es vacío; coverage marca qué paquetes necesitan control", () => {
    expect(qualityFindings(blankQuality(), facts())).toEqual([]); expect(qualityState(blankQuality(), facts())).toBe("vacio");
    expect(coverage(data(), facts()).map((r) => [r.needs, r.checks.length])).toEqual([[true, 1], [false, 0], [false, 0]]);
  });
});

describe("ejemplo DISTRIB+", () => {
  it("un control por cada paquete con criterio de aceptación (17: solo 1.3 es esfuerzo continuo), con el criterio del Diccionario de la EDT y sin hallazgos", () => {
    const d = buildSampleQuality(), f = sampleQualityFacts();
    expect(d.checks).toHaveLength(17); expect(d.metrics).toHaveLength(5); expect(d.coq).toHaveLength(6);
    expect(coverage(d, f).filter((r) => r.needs).every((r) => r.checks.length >= 1)).toBe(true);
    d.checks.forEach((c) => { const code = f.leaves.find((l) => l.id === c.wbsId)!.code; expect(c.criterion).toBe(SAMPLE_WBS_DICTIONARY[code].acceptance); });
    expect(qualityFindings(d, f)).toEqual([]); expect(qualityState(d, f)).toBe("verde");
  });
  it("los responsables son puestos del OBS; las métricas y los controles se enlazan por id; los paquetes con riesgo alto tienen control", () => {
    const d = buildSampleQuality(), f = sampleQualityFacts();
    [...d.checks.map((c) => c.owner), ...d.metrics.map((m) => m.owner)].forEach((o) => expect(SAMPLE_OBS_ROLES).toContain(o));
    d.checks.filter((c) => c.metricId).forEach((c) => expect(d.metrics.some((m) => m.id === c.metricId)).toBe(true));
    expect(d.metrics.every((m) => d.checks.some((c) => c.metricId === m.id))).toBe(true);
    expect(f.highRiskLeafIds.length).toBeGreaterThan(0); expect(coverage(d, f).filter((r) => r.highRisk).every((r) => r.checks.length > 0)).toBe(true);
  });
  it("el costo de la calidad del ejemplo: 350.000 (4,9 % del costo base), con más conformidad que fallas", () => {
    const s = coqSummary(buildSampleQuality().coq, sampleQualityFacts().baseCost);
    expect(s.total).toBe(350000); expect(s.conformity).toBe(240000); expect(s.nonConformity).toBe(110000); expect(s.pctOfBase).toBeCloseTo(4.93, 1);
  });
});

describe("ejecución: inspecciones y no conformidades", () => {
  const ins = (o: Record<string, unknown>) => normalizeInspection({ id: "i", code: "IN-01", checkId: "c1", date: "2026-11-01", result: "conforme", inspector: "QA", ...o }, "i");
  const ncr = (o: Record<string, unknown>) => normalizeNcr({ id: "n", code: "NC-01", wbsId: "l1", description: "Soldadura fuera de tolerancia", severity: "mayor", detectedOn: "2026-10-20", status: "en_correccion", action: "Reproceso", owner: "Proveedor", dueDate: "2026-11-20", ...o }, "n");
  const exec = (inspections: ReturnType<typeof ins>[], ncrs: ReturnType<typeof ncr>[], asOf = "2026-11-03"): QualityData => ({ ...data({ checks: [chk({ id: "c1", wbsId: "l1" })] }), inspections, ncrs, asOf });
  it("un .json sin ejecución se lee en blanco; códigos siguientes; valores inválidos se corrigen", () => {
    const d = normalizeQuality({ checks: [] }); expect(d.inspections).toEqual([]); expect(d.ncrs).toEqual([]); expect(d.asOf).toBe("");
    expect(nextInspectionCode([])).toBe("IN-01"); expect(nextNcrCode([ncr({ code: "NC-09" })])).toBe("NC-10");
    expect(normalizeInspection({ result: "rara" }, "x").result).toBe("conforme"); expect(normalizeNcr({ severity: "x", status: "y" }, "x")).toMatchObject({ severity: "menor", status: "abierta" });
  });
  it("una ejecución completa y al día no tiene hallazgos", () => {
    const d = exec([ins({ result: "no_conforme", ncrId: "n" })], [ncr({})]);
    expect(qualityFindings(d, facts()).filter((x) => /^Q1[2-5]$/.test(x.code))).toEqual([]);
  });
  it("Q12: una no conformidad CRÍTICA sin cerrar es un riesgo; una vencida, aviso (info si es menor); cerrada no cuenta", () => {
    const f = (n: ReturnType<typeof ncr>) => qualityFindings(exec([], [n]), facts()).filter((x) => x.code === "Q12");
    expect(f(ncr({ severity: "critica" }))[0].severity).toBe("riesgo"); expect(qualityState(exec([], [ncr({ severity: "critica" })]), facts())).toBe("rojo");
    const v = f(ncr({ dueDate: "2026-10-30" }))[0]; expect(v.severity).toBe("aviso"); expect(v.text).toMatch(/vencía el 2026-10-30 y sigue en corrección/);
    expect(f(ncr({ dueDate: "2026-10-30", severity: "menor" }))[0].severity).toBe("info");
    expect(f(ncr({ severity: "critica", status: "cerrada", closedOn: "2026-10-25" }))).toEqual([]);
  });
  it("la fecha de corte del seguimiento manda sobre el reloj (el ejemplo no envejece)", () => {
    const d = exec([], [ncr({ dueDate: "2026-11-20" })]); expect(qualityFindings(d, facts(), "2027-03-01").some((x) => x.code === "Q12")).toBe(false);
    d.asOf = ""; expect(qualityFindings(d, facts(), "2027-03-01").some((x) => x.code === "Q12")).toBe(true);
  });
  it("Q13: inspección NO CONFORME sin no conformidad registrada; Q15: sin control del plan o sin fecha", () => {
    expect(qualityFindings(exec([ins({ result: "no_conforme" })], []), facts()).find((x) => x.code === "Q13")!.text).toMatch(/NO CONFORME sin una no conformidad/);
    expect(qualityFindings(exec([ins({ checkId: "zz" })], []), facts()).find((x) => x.code === "Q15")!.text).toMatch(/no corresponde a ningún control del plan/);
    expect(qualityFindings(exec([ins({ date: "" })], []), facts()).find((x) => x.code === "Q15")!.severity).toBe("info");
  });
  it("Q14: abierta sin acción, responsable o fecha límite (aviso); cerrada sin acción o sin fecha de cierre (info)", () => {
    expect(qualityFindings(exec([], [ncr({ action: "" })]), facts()).find((x) => x.code === "Q14")!.severity).toBe("aviso");
    expect(qualityFindings(exec([], [ncr({ status: "cerrada", closedOn: "" })]), facts()).find((x) => x.code === "Q14")!.severity).toBe("info");
  });
  it("executionSummary cuenta inspecciones, abiertas, vencidas a la fecha de corte y críticas", () => {
    const d = exec([ins({ result: "no_conforme", ncrId: "n" }), ins({ id: "j" })], [ncr({ dueDate: "2026-10-30" }), ncr({ id: "m", severity: "critica" }), ncr({ id: "k", status: "cerrada", closedOn: "2026-10-25" })]);
    expect(executionSummary(d, "2030-01-01")).toEqual({ inspections: 2, nonConforming: 1, ncrs: 3, ncrOpen: 2, ncrOverdue: 1, ncrCritical: 1 });
  });
  it("el ejemplo DISTRIB+ trae su ejecución al corte del caso (2026-11-03) y sigue sin hallazgos", () => {
    const d = buildSampleQuality(), f = sampleQualityFacts();
    expect(d.asOf).toBe("2026-11-03"); expect(d.inspections).toHaveLength(8); expect(d.ncrs.map((n) => [n.code, n.status])).toEqual([["NC-01", "en_correccion"], ["NC-02", "cerrada"]]);
    expect(d.inspections.find((i) => i.result === "no_conforme")!.ncrId).toBe("nc1"); expect(d.inspections.every((i) => d.checks.some((c) => c.id === i.checkId))).toBe(true);
    expect(qualityFindings(d, f)).toEqual([]); expect(qualityFindings(d, f, "2030-01-01")).toEqual([]);
    expect(executionSummary(d, "")).toEqual({ inspections: 8, nonConforming: 1, ncrs: 2, ncrOpen: 1, ncrOverdue: 0, ncrCritical: 0 });
  });
});
