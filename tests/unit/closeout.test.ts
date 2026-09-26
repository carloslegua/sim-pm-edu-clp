// Cierre del Proyecto o Fase: src/shared/closeout.ts y su ejemplo DISTRIB+.
import { describe, expect, it } from "vitest";
import { autoChecks, blankCloseout, closeState, closeoutFindings, emptyFacts, nextCode, normalizeCloseout, normalizeItem, pendingChecks, type CloseFacts, type CloseoutData } from "../../src/shared/closeout";
import { buildSampleCloseout, sampleCloseFacts } from "../../src/shared/closeout-sample";

const listo = (): CloseFacts => ({ ...emptyFacts(), deliverables: { total: 6, accepted: 6 }, ncr: { open: 0, critical: 0 }, contracts: { total: 5, notDelivered: 0, claimsOpen: 0 }, lessons: { total: 8, transferred: 8 }, changes: { open: 0 }, bac: 8000000, roles: ["Director de Proyecto"] });
const item = (o: Record<string, unknown> = {}) => normalizeItem({ id: "i", code: "CI-01", area: "Alcance", what: "Aceptación formal", owner: "Director de Proyecto", dueDate: "2027-07-23", status: "hecho", doneOn: "2027-07-20", evidence: "Acta", ...o }, "i");
const data = (o: Partial<CloseoutData> = {}): CloseoutData => ({ ...blankCloseout(), items: [item()], asOf: "2027-07-25", ...o });
const cerrado = (o: Record<string, unknown> = {}) => ({ closed: true, closedOn: "2027-07-30", approvedBy: "Comité Directivo / Sponsor", report: "Informe final", finalCost: 7900000, outcome: "Objetivos cumplidos", ...o });

describe("normalización", () => {
  it("un .json vacío se lee como un proyecto sin cerrar; valores inválidos toman su valor por omisión; código siguiente", () => {
    expect(blankCloseout()).toMatchObject({ kind: "proyecto", phase: "", items: [], asOf: "", idCounter: 1, closure: { closed: false, finalCost: null } });
    expect(normalizeCloseout({ kind: "x", closure: { finalCost: "abc", closed: "si" } })).toMatchObject({ kind: "proyecto", closure: { finalCost: null, closed: false } }); expect(normalizeItem({ status: "raro" }, "a").status).toBe("pendiente");
    expect(nextCode([])).toBe("CI-01"); expect(nextCode([item({ code: "CI-07" })])).toBe("CI-08");
  });
});

describe("comprobaciones automáticas", () => {
  it("todo resuelto: siete comprobaciones que cumplen y nada pendiente", () => {
    const d = data({ closure: cerrado() }), c = autoChecks(d, listo());
    expect(c.map((x) => x.ok)).toEqual([true, true, true, true, true, true, true]); expect(pendingChecks(d, listo())).toEqual([]);
  });
  it("sin datos para juzgar es null (no «falta»); el costo final sin registrar SÍ falta; sobre el presupuesto no cumple", () => {
    const c = autoChecks(data({ items: [] }), emptyFacts()), by = (k: string) => c.find((x) => x.key === k)!;
    expect(by("entregables").ok).toBeNull(); expect(by("contratos").ok).toBeNull(); expect(by("lecciones").ok).toBeNull(); expect(by("lista").ok).toBeNull(); expect(by("costo").ok).toBe(false);
    expect(autoChecks(data({ closure: cerrado({ finalCost: 8100000 }) }), listo()).find((x) => x.key === "costo")!.ok).toBe(false);
  });
  it("cada frente lee su módulo: entregables, calidad, contratos, lecciones y cambios", () => {
    const f = { ...listo(), deliverables: { total: 6, accepted: 1 }, ncr: { open: 2, critical: 1 }, contracts: { total: 5, notDelivered: 3, claimsOpen: 1 }, lessons: { total: 8, transferred: 3 }, changes: { open: 3 } };
    const p = pendingChecks(data({ closure: cerrado() }), f).map((x) => x.key); expect(p).toEqual(["entregables", "calidad", "contratos", "lecciones", "cambios"]);
    expect(autoChecks(data(), f).find((x) => x.key === "calidad")!.detail).toMatch(/2 abierta\(s\) \(1 crítica\(s\)\)/);
  });
});

describe("closeoutFindings", () => {
  it("un cierre completo, aprobado y con todo resuelto no tiene hallazgos", () => {
    const d = data({ closure: cerrado() }); expect(closeoutFindings(d, listo())).toEqual([]); expect(closeState(d, listo())).toBe("verde"); expect(closeState(blankCloseout(), listo())).toBe("vacio");
  });
  it("REPRO C1: declarar el cierre con frentes sin resolver es un RIESGO (cierre con deuda) y los nombra", () => {
    const f = { ...listo(), deliverables: { total: 6, accepted: 5 }, ncr: { open: 1, critical: 0 } };
    const c = closeoutFindings(data({ closure: cerrado() }), f).find((x) => x.code === "C1")!; expect(c.severity).toBe("riesgo"); expect(c.text).toMatch(/2 frente\(s\) sin resolver.*entregables aceptados por el cliente \(5 de 6.*no conformidades/);
    expect(closeState(data({ closure: cerrado() }), f)).toBe("rojo");
  });
  it("sin declarar el cierre, lo pendiente solo se informa (C7): no es un riesgo", () => {
    const f = { ...listo(), lessons: { total: 8, transferred: 0 } }, r = closeoutFindings(data(), f);
    expect(r.find((x) => x.code === "C7")!.severity).toBe("info"); expect(r.some((x) => x.severity === "riesgo")).toBe(false);
  });
  it("C2: cierre sin aprobador, fecha o informe final; C4: fase sin nombre; C8: costo final sobre el presupuesto", () => {
    expect(closeoutFindings(data({ closure: cerrado({ approvedBy: "", closedOn: "" }) }), listo()).find((x) => x.code === "C2")!.text).toMatch(/sin quién lo aprueba ni fecha/);
    expect(closeoutFindings(data({ closure: cerrado({ report: "" }) }), listo()).find((x) => x.code === "C2")!.text).toMatch(/sin informe final/);
    expect(closeoutFindings(data({ kind: "fase", phase: "", closure: cerrado() }), listo()).some((x) => x.code === "C4")).toBe(true); expect(closeoutFindings(data({ kind: "fase", phase: "Construcción", closure: cerrado() }), listo()).some((x) => x.code === "C4")).toBe(false);
    expect(closeoutFindings(data({ closure: cerrado({ finalCost: 8400000 }) }), listo()).find((x) => x.code === "C8")!.text).toMatch(/8[.,]400[.,]000.*5 %/);
  });
  it("C3: ítem pendiente sin responsable o sin fecha, o vencido a la fecha de corte; C5/C6 info", () => {
    expect(closeoutFindings(data({ items: [item({ status: "pendiente", owner: "" })] }), listo()).find((x) => x.code === "C3")!.text).toMatch(/pendiente sin responsable/);
    expect(closeoutFindings(data({ items: [item({ status: "pendiente", dueDate: "2027-07-01" })] }), listo()).find((x) => x.code === "C3")!.text).toMatch(/venció el 2027-07-01/);
    expect(closeoutFindings(data({ items: [item({ status: "pendiente", dueDate: "2027-09-01" })] }), listo()).some((x) => x.code === "C3")).toBe(false);
    expect(closeoutFindings(data({ items: [item({ evidence: "" })] }), listo()).find((x) => x.code === "C5")!.severity).toBe("info"); expect(closeoutFindings(data({ items: [item({ owner: "Un tercero" })] }), listo()).find((x) => x.code === "C6")!.severity).toBe("info");
  });
});

describe("ejemplo DISTRIB+", () => {
  it("el cierre está PREPARADO, no declarado: siete ítems con responsable del OBS y fecha posterior al fin del cronograma (2027-07-23); lo que impide cerrar hoy sale de las demás herramientas", () => {
    const d = buildSampleCloseout(), f = sampleCloseFacts();
    expect(d.items).toHaveLength(7); expect(d.closure.closed).toBe(false); expect(d.asOf).toBe("2026-11-03");
    d.items.forEach((i) => { expect(f.roles, i.code).toContain(i.owner); expect(i.dueDate >= "2027-07-23", i.code).toBe(true); expect(i.status).toBe("pendiente"); });
    expect(pendingChecks(d, f).map((x) => x.key)).toEqual(["entregables", "calidad", "contratos", "lecciones", "cambios", "costo", "lista"]);
    expect(closeoutFindings(d, f).map((x) => x.code)).toEqual(["C7"]); expect(closeState(d, f)).toBe("verde");
  });
  it("las cifras del caso al corte coinciden con los demás ejemplos", () => {
    const f = sampleCloseFacts(); expect(f.deliverables).toEqual({ total: 6, accepted: 1 }); expect(f.lessons.total).toBe(8); expect(f.ncr.open).toBe(1); expect(f.bac).toBe(8081108);
  });
});
