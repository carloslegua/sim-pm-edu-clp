// Línea base del alcance con EDT y diccionario: src/shared/scope-baseline.ts (auditoría, media).
import { describe, expect, it } from "vitest";
import { advanceScopeBaseline, normalizeScopeBaseline, scopeDriftOf, scopeSnapshotOf, wbsScopeCodes, wbsScopeDiff, wbsScopeOf, type ScopeBaselineData } from "../../src/shared/scope-baseline";
import { newVersionProblems, suggestNextVersion } from "../../src/shared/requirements-baseline";

const node = (o: Record<string, unknown>) => ({ children: [], cost: 100, duration: 5, start: "2026-07-06", end: "2026-07-10", percent: 10, resource: "PM", ...o });
const wbs = (over: Record<string, unknown> = {}) => ({
  rootId: "r", idCounter: 9,
  nodes: {
    r: node({ id: "r", name: "Proyecto", children: ["f1", "f2"] }),
    f1: node({ id: "f1", name: "Ingeniería", children: ["w1", "w2"] }),
    f2: node({ id: "f2", name: "Construcción", children: ["w3"] }),
    w1: node({ id: "w1", name: "Estudio de suelos", notes: "Calicatas y ensayos", acceptance: "Informe firmado", delId: "d1" }),
    w2: node({ id: "w2", name: "Diseño estructural", notes: "Memoria y planos", acceptance: "Expediente aprobado" }),
    w3: node({ id: "w3", name: "Cimentaciones", notes: "Zapatas", acceptance: "Ensayos aprobados", loe: false }),
    ...over
  }
});
const est = () => ({ deliverables: [{ id: "d1", code: "DEL.01", name: "Terreno" }], assumptions: [{ id: "a1", text: "Terreno libre" }], constraints: [], exclusions: [], productScope: "Almacén", projectScope: "Obra completa" });
const base = (b: Partial<ScopeBaselineData> = {}): ScopeBaselineData => ({ frozen: true, version: "1.0", date: "2026-07-10", approver: "Sponsor", reason: "Línea base inicial", snapshot: scopeSnapshotOf(est(), wbs()), history: [], ...b });

describe("wbsScopeOf: solo la parte de ALCANCE de la EDT", () => {
  it("guarda estructura y diccionario (descripción, criterio, LOE, entregable); NO costo, duración, fechas, avance ni responsable", () => {
    const s = wbsScopeOf(wbs())!;
    expect(s.rootId).toBe("r"); expect(s.nodes.w1).toEqual({ name: "Estudio de suelos", children: [], delId: "d1", notes: "Calicatas y ensayos", acceptance: "Informe firmado", loe: false });
    expect(JSON.stringify(s)).not.toMatch(/cost|duration|start|percent|resource/);
    expect(s.nodes.f1.children).toEqual(["w1", "w2"]);
  });
  it("sin EDT (o sin raíz) no hay parte de alcance; tolerante con basura", () => {
    expect(wbsScopeOf(null)).toBeNull(); expect(wbsScopeOf({ rootId: "x", nodes: {} })).toBeNull(); expect(wbsScopeOf({ rootId: "r", nodes: { r: null } })).toBeNull();
    expect(wbsScopeOf({ rootId: "r", nodes: { r: { children: [1, "a"], notes: 5 } } })!.nodes.r).toMatchObject({ children: ["1", "a"], notes: "5", name: "" });
  });
  it("códigos jerárquicos por recorrido en profundidad", () => { expect(wbsScopeCodes(wbsScopeOf(wbs())!)).toEqual({ f1: "1", w1: "1.1", w2: "1.2", f2: "2", w3: "2.1" }); });
});

describe("wbsScopeDiff: qué cambió de la EDT y del diccionario después de aprobar", () => {
  const frozen = () => wbsScopeOf(wbs())!;
  it("sin cambios no hay diferencias; el costo, la duración o el avance NO cuentan (son de otras líneas base)", () => {
    expect(wbsScopeDiff(frozen(), wbsScopeOf(wbs()))).toEqual([]);
    const otros = wbs({ w1: node({ id: "w1", name: "Estudio de suelos", notes: "Calicatas y ensayos", acceptance: "Informe firmado", delId: "d1", cost: 999999, duration: 90, percent: 100, resource: "Otro" }) });
    expect(wbsScopeDiff(frozen(), wbsScopeOf(otros))).toEqual([]);
  });
  it("REPRO (media): modificar un paquete o su diccionario mientras la línea base conserva su versión se detecta, con el código y qué cambió", () => {
    const live = wbs({ w1: node({ id: "w1", name: "Estudio geotécnico ampliado", notes: "Calicatas, ensayos y sondeos", acceptance: "Informe firmado", delId: "d1" }), w3: node({ id: "w3", name: "Cimentaciones", notes: "Zapatas", acceptance: "Ensayos aprobados", loe: true }) });
    const d = wbsScopeDiff(frozen(), wbsScopeOf(live));
    expect(d.map((x) => [x.code, x.kind])).toEqual([["1.1", "renombrado"], ["1.1", "diccionario"], ["2.1", "diccionario"]]);
    expect(d[0].detail).toBe("«Estudio de suelos» → «Estudio geotécnico ampliado»"); expect(d[1].detail).toBe("cambió descripción del trabajo"); expect(d[2].detail).toBe("cambió esfuerzo continuo (LOE)");
  });
  it("agregado, eliminado y movido de padre", () => {
    const live = wbs({ f1: node({ id: "f1", name: "Ingeniería", children: ["w1"] }), f2: node({ id: "f2", name: "Construcción", children: ["w3", "w2", "w4"] }), w4: node({ id: "w4", name: "Nuevo paquete", notes: "", acceptance: "" }) });
    const d = wbsScopeDiff(frozen(), wbsScopeOf(live));
    expect(d.filter((x) => x.kind === "movido").map((x) => x.id)).toEqual(["w2"]); expect(d.find((x) => x.kind === "movido")!.detail).toMatch(/1\.2 → 2\.2/);
    expect(d.filter((x) => x.kind === "agregado").map((x) => x.name)).toEqual(["Nuevo paquete"]);
    const sinW3 = wbs({ f2: node({ id: "f2", name: "Construcción", children: [] }) }); delete (sinW3.nodes as Record<string, unknown>).w3;
    expect(wbsScopeDiff(frozen(), wbsScopeOf(sinW3)).filter((x) => x.kind === "eliminado").map((x) => x.name)).toEqual(["Cimentaciones"]);
    expect(wbsScopeDiff(frozen(), null).every((x) => x.kind === "eliminado")).toBe(true);                    // sin EDT vigente: todo lo aprobado «ya no está»
  });
});

describe("línea base versionada", () => {
  it("la instantánea incluye el enunciado Y la EDT con su diccionario", () => {
    const s = base().snapshot!; expect(Object.keys(s).sort()).toEqual(["assumptions", "constraints", "deliverables", "exclusions", "productScope", "projectScope", "wbs"]);
    expect(s.wbs!.nodes.w2.acceptance).toBe("Expediente aprobado");
  });
  it("una línea base ANTIGUA (sin EDT, sin motivo ni historial) se lee sin fallar y su `wbs` queda sin definir", () => {
    const viejo = normalizeScopeBaseline({ frozen: true, version: "1.0", date: "2026-07-10", approver: "S", snapshot: { deliverables: [], productScope: "x" } });
    expect(viejo).toMatchObject({ frozen: true, reason: "", history: [] }); expect(viejo.snapshot!.wbs).toBeUndefined();
    expect(normalizeScopeBaseline(null)).toMatchObject({ frozen: false, version: "1.0", snapshot: null, history: [] });
  });
  it("nueva versión: archiva la vigente COMPLETA (con su EDT y diccionario) y la siguiente lleva su aprobador, fecha y motivo", () => {
    const live = wbs({ w1: node({ id: "w1", name: "Estudio geotécnico", notes: "Otra descripción", acceptance: "x" }) });
    const nb = advanceScopeBaseline(base(), scopeSnapshotOf(est(), live), { version: "2.0", date: "2026-09-30", approver: "CCB", reason: "Incorpora CR-002" }, "2026-09-30");
    expect(nb).toMatchObject({ frozen: true, version: "2.0", approver: "CCB", reason: "Incorpora CR-002" }); expect(nb.snapshot!.wbs!.nodes.w1.name).toBe("Estudio geotécnico");
    expect(nb.history).toHaveLength(1); expect(nb.history[0]).toMatchObject({ version: "1.0", approver: "Sponsor", reason: "Línea base inicial", supersededOn: "2026-09-30" });
    expect(nb.history[0].snapshot!.wbs!.nodes.w1.name).toBe("Estudio de suelos");                              // la v1.0 archivada conserva SU EDT
    expect(normalizeScopeBaseline(JSON.parse(JSON.stringify(nb)))).toEqual(nb);                              // ida y vuelta
    expect(newVersionProblems(base(), { version: "1.0", date: "2026-09-30", approver: "CCB", reason: "x" })[0]).toMatch(/ya existe/); expect(suggestNextVersion(nb)).toBe("3.0");
  });
});

describe("scopeDriftOf: trabajo en edición frente a lo aprobado", () => {
  it("sin línea base congelada no hay diferencias que medir", () => { expect(scopeDriftOf(base({ frozen: false }), est(), wbs())).toMatchObject({ frozen: false, total: 0 }); });
  it("sin cambios: cero; un cambio del enunciado y otro de la EDT suman por separado", () => {
    expect(scopeDriftOf(base(), est(), wbs())).toMatchObject({ frozen: true, wbsInBaseline: true, enunciadoChanged: false, total: 0 });
    const e = est(); e.assumptions.push({ id: "a2", text: "Nuevo supuesto" });
    const d = scopeDriftOf(base(), e, wbs({ w2: node({ id: "w2", name: "Diseño estructural", notes: "Distinta", acceptance: "Expediente aprobado" }) }));
    expect(d.enunciadoChanged).toBe(true); expect(d.wbsChanges).toHaveLength(1); expect(d.total).toBe(2);
  });
  it("una línea base anterior a incluir la EDT no se puede comparar: se indica, no se inventa", () => {
    const viejo = normalizeScopeBaseline({ frozen: true, version: "1.0", snapshot: { ...est() } });
    expect(scopeDriftOf(viejo, est(), wbs())).toMatchObject({ frozen: true, wbsInBaseline: false, wbsChanges: [], enunciadoChanged: false });
  });
});
