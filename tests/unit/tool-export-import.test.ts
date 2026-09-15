// Cobertura de detectTool()/ingestToolExport() (gpi-core.ts): la función que
// permite a Panel de Control recibir el ".json" que exporta CUALQUIERA de
// los 13 módulos-herramienta ("⭱ Importar .json" en cada tarjeta del
// lanzador) y enchufarlo en la porción correspondiente del proyecto activo.
// Esto se volvió el ÚNICO punto de importación por módulo tras retirar los
// botones "Guardar/Abrir (.json)" propios de cada herramienta (a pedido
// explícito del usuario, para centralizar el flujo y evitar confusión) --
// antes de ese cambio, dos de las 13 formas ("gpi.requirements/v1" y
// "gpi.costEstimate/v1") NO tenían caso en detectTool(): el botón de
// importar existía en el Panel pero fallaba en silencio (unknown-format)
// para esos dos módulos. Este test fija, para cada módulo, que su propio
// formato de exportación se reconoce y se enruta correctamente.
import { beforeEach, describe, expect, it } from "vitest";
import { importProject, ingestToolExport, getModule, KEY } from "../../src/core/gpi-core";

beforeEach(() => { localStorage.removeItem(KEY); importProject({}, true); });

describe("ingestToolExport", () => {
  it("obs (gpi.obs/v1)", () => {
    const res = ingestToolExport({ kind: "gpi.obs/v1", rootId: "r", idCounter: 2, nodes: { r: { id: "r", children: [] } } });
    expect(res).toEqual({ ok: true, module: "obs" });
    expect(getModule("obs")).toEqual({ rootId: "r", idCounter: 2, nodes: { r: { id: "r", children: [] } } });
  });

  it("raci (gpi.raci/v1) -- solo assignments, sin fijar filas/columnas (esas se derivan del WBS/OBS vivos)", () => {
    const res = ingestToolExport({ kind: "gpi.raci/v1", assignments: { w1: { o1: "R" } }, rowsSnapshot: [{ id: "w1" }], colsSnapshot: [{ id: "o1" }] });
    expect(res).toEqual({ ok: true, module: "raci" });
    expect(getModule("raci")).toEqual({ assignments: { w1: { o1: "R" } } });
  });

  it("schedulePlan (gpi.schedulePlan/v1)", () => {
    const res = ingestToolExport({ kind: "gpi.schedulePlan/v1", data: { methodology: "CPM" } });
    expect(res).toEqual({ ok: true, module: "schedulePlan" });
    expect(getModule("schedulePlan")).toEqual({ methodology: "CPM" });
  });

  it("cost (gpi.cost/v1)", () => {
    const res = ingestToolExport({ kind: "gpi.cost/v1", data: { estimate: { class: 3 } } });
    expect(res).toEqual({ ok: true, module: "cost" });
    expect(getModule("cost")).toEqual({ estimate: { class: 3 } });
  });

  it("charter (gpi.charter/v1)", () => {
    const res = ingestToolExport({ kind: "gpi.charter/v1", data: { identification: { name: "X" } } });
    expect(res).toEqual({ ok: true, module: "charter" });
    expect(getModule("charter")).toEqual({ identification: { name: "X" } });
  });

  it("scopeStatement (gpi.scopeStatement/v1)", () => {
    const res = ingestToolExport({ kind: "gpi.scopeStatement/v1", data: { productScope: "Alcance" } });
    expect(res).toEqual({ ok: true, module: "scopeStatement" });
    expect(getModule("scopeStatement")).toEqual({ productScope: "Alcance" });
  });

  it("activities (gpi.activities/v1)", () => {
    const res = ingestToolExport({ kind: "gpi.activities/v1", data: { byLeaf: { w1: [{ id: "a1", name: "Excavar" }] }, idCounter: 2 } });
    expect(res).toEqual({ ok: true, module: "activities" });
    expect(getModule("activities")).toEqual({ byLeaf: { w1: [{ id: "a1", name: "Excavar" }] }, idCounter: 2 });
  });

  it("requirements (gpi.requirements/v1) -- caso agregado junto con el retiro del import propio del módulo", () => {
    const data = { baseline: { frozen: false }, items: [{ id: "q1", code: "RQ.01" }], changes: [], idCounter: 2, changeCounter: 1 };
    const res = ingestToolExport({ kind: "gpi.requirements/v1", data });
    expect(res).toEqual({ ok: true, module: "requirements" });
    expect(getModule("requirements")).toEqual(data);
  });

  it("costEstimate (gpi.costEstimate/v1) -- caso agregado junto con el retiro del import propio del módulo", () => {
    const res = ingestToolExport({ kind: "gpi.costEstimate/v1", data: { byActivity: { a1: "190" } } });
    expect(res).toEqual({ ok: true, module: "costEstimate" });
    expect(getModule("costEstimate")).toEqual({ byActivity: { a1: "190" } });
  });

  it("pert (gpi.pert/v1)", () => {
    const res = ingestToolExport({ kind: "gpi.pert/v1", data: { byActivity: { a1: { o: 1, m: 2, p: 3 } }, inputMode: "dias" } });
    expect(res).toEqual({ ok: true, module: "pert" });
    expect(getModule("pert")).toEqual({ byActivity: { a1: { o: 1, m: 2, p: 3 } }, inputMode: "dias" });
  });

  it("schedule / Cronograma CPM (gpi.schedule/v1)", () => {
    const res = ingestToolExport({ kind: "gpi.schedule/v1", data: { links: [{ from: "a1", to: "a2" }], linkCounter: 2 } });
    expect(res).toEqual({ ok: true, module: "schedule" });
    expect(getModule("schedule")).toEqual({ links: [{ from: "a1", to: "a2" }], linkCounter: 2, import: null, baseline: null });
  });

  it("stakeholders (arreglo top-level, sin \"kind\")", () => {
    const res = ingestToolExport({ stakeholders: [{ id: "s1", name: "X" }] });
    expect(res).toEqual({ ok: true, module: "stakeholders" });
    expect(getModule("stakeholders")).toEqual({ stakeholders: [{ id: "s1", name: "X" }], powerWeights: null, interestWeights: null, idCounter: 2 });
  });

  it("wbs (nodes+rootId sin \"kind\" -- formato más antiguo/genérico)", () => {
    const res = ingestToolExport({ rootId: "r", idCounter: 3, nodes: { r: { id: "r", children: [] } } });
    expect(res).toEqual({ ok: true, module: "wbs" });
    expect(getModule("wbs")).toEqual({ rootId: "r", idCounter: 3, nodes: { r: { id: "r", children: [] } } });
  });

  it("formato no reconocido -> unknown-format, no toca el proyecto activo", () => {
    const res = ingestToolExport({ foo: "bar" });
    expect(res).toEqual({ ok: false, reason: "unknown-format" });
  });

  it("sin proyecto activo -> no-active", () => {
    localStorage.removeItem(KEY);
    const res = ingestToolExport({ rootId: "r", idCounter: 1, nodes: {} });
    expect(res).toEqual({ ok: false, reason: "no-active" });
  });
});
