// Validar el Alcance: src/shared/scope-validation.ts y su ejemplo DISTRIB+.
import { describe, expect, it } from "vitest";
import { blankValidation, coverage, nextCode, normalizeAcceptance, normalizeValidation, summary, validationFindings, validationState, type ScopeValidationData, type SvFacts } from "../../src/shared/scope-validation";
import { SAMPLE_DELIVERABLES, buildSampleValidation, sampleValidationFacts } from "../../src/shared/scope-validation-sample";

const facts = (): SvFacts => ({
  deliverables: [{ id: "d1", code: "DEL.01", name: "Expediente", criteria: "Aprobado por la supervisión" }, { id: "d2", code: "DEL.02", name: "Licencias", criteria: "Licencia emitida" }],
  leaves: [{ id: "l1", code: "1.1", name: "Diseño", acceptance: "" }, { id: "l2", code: "1.2", name: "Permisos", acceptance: "" }], roles: ["Comité Directivo / Sponsor", "Director de Proyecto"], openNcr: {}
});
const rec = (o: Record<string, unknown>) => normalizeAcceptance({ id: "v1", code: "VA-01", delivId: "d1", wbsIds: ["l1"], presentedOn: "2026-10-02", presentedBy: "Jefe", reviewer: "Comité Directivo / Sponsor", criteria: "Aprobado por la supervisión", evidence: "Acta", decision: "aceptado", decidedOn: "2026-10-09", ...o }, "v1");
const data = (records: ReturnType<typeof rec>[], asOf = "2026-11-03"): ScopeValidationData => ({ records, asOf, idCounter: 9 });
const codes = (d: ScopeValidationData, f = facts()) => validationFindings(d, f).map((x) => x.code);

describe("normalización", () => {
  it("un .json vacío o viejo se lee en blanco; decisión inválida = pendiente; código siguiente", () => {
    expect(blankValidation()).toEqual({ records: [], asOf: "", idCounter: 1 });
    expect(normalizeAcceptance({ decision: "raro", wbsIds: ["a", 2] }, "x")).toMatchObject({ decision: "pendiente", wbsIds: ["a", "2"] });
    expect(normalizeValidation({ records: [null], asOf: "ayer" })).toMatchObject({ asOf: "", idCounter: 2 }); expect(nextCode([])).toBe("VA-01"); expect(nextCode([rec({ code: "VA-04" })])).toBe("VA-05");
  });
});

describe("validationFindings", () => {
  it("una aceptación completa y sin defectos abiertos no tiene hallazgos (y sin registros no hay nada que revisar)", () => {
    const d = data([rec({}), rec({ id: "v2", code: "VA-02", delivId: "d2", criteria: "Licencia emitida", decision: "pendiente", decidedOn: "", evidence: "", presentedOn: "" })]);
    expect(validationFindings(d, facts())).toEqual([]); expect(validationState(d, facts())).toBe("verde"); expect(validationFindings(data([]), facts())).toEqual([]); expect(validationState(data([]), facts())).toBe("vacio");
  });
  it("REPRO V1: aceptar un entregable con una no conformidad abierta en sus paquetes; crítica = riesgo, otra = aviso; cerrada o sin aceptar, nada", () => {
    const f = facts(); f.openNcr = { l1: { count: 1, critical: 0 } };
    const v = validationFindings(data([rec({})]), f).find((x) => x.code === "V1")!; expect(v.severity).toBe("aviso"); expect(v.text).toMatch(/1 no conformidad\(es\) ABIERTA\(S\)/);
    f.openNcr = { l1: { count: 2, critical: 1 } }; expect(validationFindings(data([rec({})]), f).find((x) => x.code === "V1")!.severity).toBe("riesgo"); expect(validationState(data([rec({})]), f)).toBe("rojo");
    expect(validationFindings(data([rec({ decision: "pendiente" })]), f).some((x) => x.code === "V1")).toBe(false);
  });
  it("V2: aceptado sin quién, fecha o evidencia; V3: rechazado o con observaciones sin decir por qué", () => {
    expect(validationFindings(data([rec({ evidence: "", reviewer: "" })]), facts()).find((x) => x.code === "V2")!.text).toMatch(/sin quién lo acepta, evidencia/);
    expect(codes(data([rec({ decidedOn: "" })]))).toContain("V2");
    expect(codes(data([rec({ decision: "rechazado", observations: "" })]))).toContain("V3"); expect(codes(data([rec({ decision: "rechazado", observations: "Falta el plano 3" })]))).not.toContain("V3");
  });
  it("V4: el criterio con que se validó difiere del vigente del Enunciado (aviso) o no se copió (info)", () => {
    expect(validationFindings(data([rec({ criteria: "Otro criterio" })]), facts()).find((x) => x.code === "V4")!.severity).toBe("aviso");
    expect(validationFindings(data([rec({ criteria: "" })]), facts()).find((x) => x.code === "V4")!.severity).toBe("info");
  });
  it("V8: presentado y sin decisión más de 15 días a la fecha de corte; la fecha de corte del módulo manda sobre el reloj", () => {
    const p = rec({ decision: "pendiente", presentedOn: "2026-10-01", decidedOn: "", evidence: "" });
    expect(validationFindings(data([p]), facts()).find((x) => x.code === "V8")!.text).toMatch(/presentado el 2026-10-01 y sin decisión hace 33 días/);
    expect(codes(data([p], "2026-10-10"))).not.toContain("V8");
    expect(validationFindings({ ...data([p]), asOf: "" }, facts(), "2027-01-01").some((x) => x.code === "V8")).toBe(true);
  });
  it("V5/V6/V7: entregables sin validar, referencias inexistentes, aceptado sin paquetes y aceptante fuera del OBS", () => {
    expect(validationFindings(data([rec({})]), facts()).find((x) => x.code === "V5" && x.recordId === null)!.text).toMatch(/1 entregable\(s\).*Licencias/);
    expect(codes(data([rec({ delivId: "zz" })]))).toContain("V6"); expect(codes(data([rec({ wbsIds: ["zz"] })]))).toContain("V6");
    expect(validationFindings(data([rec({ wbsIds: [] })]), facts()).find((x) => x.code === "V5" && x.recordId === "v1")!.severity).toBe("info");
    expect(validationFindings(data([rec({ reviewer: "Un tercero" })]), facts()).find((x) => x.code === "V7")!.severity).toBe("info");
  });
  it("coverage y summary: sin validación, pendiente, aceptado, rechazado", () => {
    const d = data([rec({}), rec({ id: "v2", code: "VA-02", delivId: "d2", decision: "rechazado" })]), c = coverage(d, facts());
    expect(c.map((r) => r.state)).toEqual(["aceptado", "rechazado"]); expect(summary(d, facts())).toEqual({ deliverables: 2, accepted: 1, pending: 0, rejected: 1, uncovered: 0 });
    expect(summary(data([]), facts())).toMatchObject({ uncovered: 2 });
  });
});

describe("ejemplo DISTRIB+", () => {
  it("seis entregables (los del Enunciado), un expediente aceptado con observaciones y el resto pendiente; sin hallazgos", () => {
    const d = buildSampleValidation(), f = sampleValidationFacts();
    expect(SAMPLE_DELIVERABLES).toHaveLength(6); expect(d.records).toHaveLength(6); expect(d.asOf).toBe("2026-11-03");
    expect(d.records.map((r) => r.decision)).toEqual(["aceptado_con_observaciones", "pendiente", "pendiente", "pendiente", "pendiente", "pendiente"]);
    expect(d.records.every((r) => f.deliverables.some((x) => x.id === r.delivId))).toBe(true); expect(d.records.flatMap((r) => r.wbsIds).every((id) => f.leaves.some((l) => l.id === id))).toBe(true);
    expect(validationFindings(d, f)).toEqual([]); expect(validationFindings(d, f, "2030-01-01")).toEqual([]); expect(validationState(d, f)).toBe("verde");
    expect(summary(d, f)).toEqual({ deliverables: 6, accepted: 1, pending: 5, rejected: 0, uncovered: 0 });
  });
  it("su criterio es el del Enunciado y sus paquetes de ingeniería no tienen defectos abiertos (NC-02 está cerrada; NC-01 es de 3.1)", () => {
    const d = buildSampleValidation(), f = sampleValidationFacts();
    d.records.forEach((r) => expect(r.criteria).toBe(f.deliverables.find((x) => x.id === r.delivId)!.criteria));
    expect(Object.keys(f.openNcr)).toEqual(["w-3.1"]); expect(d.records[0].wbsIds).toEqual(["w-2.1", "w-2.2", "w-2.3"]);
  });
});
