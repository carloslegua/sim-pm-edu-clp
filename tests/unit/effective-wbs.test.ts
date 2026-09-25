// La EDT EFECTIVA (auditoría, alta) y el ejemplo de Estimar los Costos calibrado contra la EDT del caso.
//  · effectiveWbs(): lo que muestra WBS Builder -- fechas del CPM y costos de Estimar los Costos -- para quien resume la EDT (Panel, Acta,
//    Plan del Cronograma, Costos, Plan para la Dirección). Antes esos módulos leían las fechas y costos MANUALES guardados en la EDT, que nadie
//    actualiza: con el ejemplo DISTRIB+ veían un proyecto que terminaba el 2026-11-06.
//  · Los precios del ejemplo suman, paquete por paquete, el costo de la EDT (antes 6.160.500 frente a 7.100.000).
import { describe, expect, it } from "vitest";
import { applyCostEstimateToWbs, effectiveWbs, wbsLeaves, wbsPhases, wbsRollup } from "../../src/core/gpi-core";
import type { GpiProject, WbsModule } from "../../src/core/types";
import { SAMPLE_CASE_BASE_COST, SAMPLE_CASE_LEAVES } from "../../src/shared/case-distribplus";
import { SAMPLE_UNIT_PRICES } from "../../src/shared/cost-estimate-sample";
import { SAMPLE_START_DATE, sampleScheduleModules, sampleSchedulePlan } from "../../src/shared/schedule-sample";

const costOf = (code: string): number => (SAMPLE_CASE_LEAVES.find((l) => l.code === code) as { cost: number }).cost;
// El caso DISTRIB+ como lo deja «Cargar ejemplo» en cada módulo: la EDT con sus costos y fechas MANUALES (un plan de 4 meses que el CPM reemplaza).
function project(withEstimate = true): GpiProject {
  const m = sampleScheduleModules(), wbs = m.wbs as WbsModule;
  wbsLeaves(wbs).forEach((l) => { Object.assign(wbs.nodes[l.id], { cost: costOf(l.code), start: "2026-08-03", end: "2026-11-06" }); });
  return {
    schema: "gpi.project/v1", meta: { id: "p1", name: "DISTRIB+", code: "", client: "", location: "", sponsor: "", manager: "", startDate: SAMPLE_START_DATE, endDate: "", currency: "USD", capex: "", description: "", course: "", createdAt: 1, updatedAt: 1 },
    modules: { wbs, activities: m.activities, schedule: { links: m.schedule.links, linkCounter: 99, import: null, baseline: null }, schedulePlan: sampleSchedulePlan(), costEstimate: withEstimate ? { byActivity: { ...SAMPLE_UNIT_PRICES } } : null }
  };
}

describe("effectiveWbs: la EDT que ven quienes la resumen es la de WBS Builder", () => {
  it("REPRO (alta): las fechas son las del CPM (fin 2027-07-23), no las manuales guardadas; lo guardado no se toca", () => {
    const p = project(), stored = p.modules.wbs as WbsModule, eff = effectiveWbs(p) as WbsModule;
    expect(wbsRollup(stored).maxEnd).toBe("2026-11-06");                        // lo que leían el Panel, el Acta y el Plan del Cronograma
    expect(wbsRollup(eff).maxEnd).toBe("2027-07-23"); expect(wbsRollup(eff).minStart).toBe("2026-07-06");
    const fases = wbsPhases(eff).map((f) => [f.name, f.end]);
    expect(fases).toContainEqual(["Ingeniería y Diseño", "2026-11-11"]); expect(fases).toContainEqual(["Pruebas y Puesta en Marcha", "2027-07-23"]);
    expect(stored.nodes["w-5.3"].end).toBe("2026-11-06");                       // derivado ≠ persistido: effectiveWbs devuelve una copia
  });
  it("el costo es el de Estimar los Costos donde el estimado está completo; el paquete parcial (4.3) conserva su costo de la EDT", () => {
    const eff = effectiveWbs(project()) as WbsModule;
    expect(eff.nodes["w-4.3"].cost).toBe(1165000);
    expect(wbsRollup(eff).cost).toBe(SAMPLE_CASE_BASE_COST);                   // 7.100.000: el ejemplo de costos ya no cambia el costo base
  });
  it("sin proyecto, sin EDT o sin fecha de inicio no inventa nada", () => {
    expect(effectiveWbs(null)).toBeNull();
    const p = project(false); p.meta.startDate = "";
    expect(wbsRollup(effectiveWbs(p)).maxEnd).toBe("2026-11-06");              // sin fecha de inicio el CPM no fecha: quedan las manuales
  });
});

describe("ejemplo de Estimar los Costos calibrado contra la EDT del caso (prueba de oro)", () => {
  it("cada paquete con estimado completo suma exactamente su costo de la EDT; solo 4.3 queda parcial (sin precio para TR-4)", () => {
    const m = sampleScheduleModules(), sums: Record<string, { sum: number; complete: boolean }> = {};
    wbsLeaves(m.wbs).forEach((l) => {
      const acts = m.activities.byLeaf[l.id] || [];
      sums[l.code] = { sum: acts.reduce((s, a) => s + Number(a.qty) * (SAMPLE_UNIT_PRICES[a.id] || 0), 0), complete: acts.every((a) => SAMPLE_UNIT_PRICES[a.id] > 0) };
    });
    SAMPLE_CASE_LEAVES.forEach((l) => { if (l.code !== "4.3") expect([l.code, sums[l.code].sum, sums[l.code].complete]).toEqual([l.code, l.cost, true]); });
    expect(sums["4.3"]).toEqual({ sum: 792000, complete: false });
    expect(Object.keys(SAMPLE_UNIT_PRICES)).toHaveLength(42);                  // 43 actividades, una sin precio a propósito
  });
  it("cargarlo en WBS Builder fija 17 paquetes sin cambiar ningún costo", () => {
    const p = project(), r = applyCostEstimateToWbs(p.modules.wbs as WbsModule, p.modules.costEstimate, p.modules.activities);
    expect(r.lockedLeafIds).toHaveLength(17);
    wbsLeaves(r.wbs).forEach((l) => expect([l.code, r.wbs.nodes[l.id].cost]).toEqual([l.code, costOf(l.code)]));
  });
});
