// Coherencia del ejemplo: las 3 órdenes de cambio que el Control de Cambios enlaza (SAMPLE_COST_ORDERS) deben ser
// exactamente las del ejemplo de Costos (mismo id, monto, fondo y estado) — regla #6: es UN solo proyecto.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SAMPLE_COST_ORDERS, SAMPLE_CRS, buildSampleCrs } from "../../src/shared/change-sample";
import { SAMPLE_PLAN, buildSampleRisks } from "../../src/shared/risk-sample";
import { sampleScheduleModules } from "../../src/shared/schedule-sample";
import { normalizeCr } from "../../src/shared/change-control";

describe("change-sample: coherencia con el resto del caso DISTRIB+", () => {
  it("las órdenes de cambio coinciden con las del ejemplo de Costos (id, monto, fondo, estado)", () => {
    const src = readFileSync("src/modules/cost/main.ts", "utf8");
    const enCostos = Array.from(src.matchAll(/\{ id: "(OC-\d+)", desc: "[^"]*", cause: "[^"]*", cost: (\d+), fund: "([^"]+)", status: "([^"]+)"/g))
      .map((m) => ({ id: m[1], cost: Number(m[2]), fund: m[3], status: m[4] }));
    expect(enCostos.length).toBe(3);
    expect(SAMPLE_COST_ORDERS.map((o) => ({ id: o.id, cost: o.cost, fund: o.fund, status: o.status }))).toEqual(enCostos);
  });

  it("cada solicitud del ejemplo resuelve sus paquetes y su riesgo contra los datos reales del caso", () => {
    // los códigos EDT de las solicitudes existen como hojas de la EDT del ejemplo
    const codigos = new Set(Object.values((sampleScheduleModules().wbs as { nodes: Record<string, { code?: string }> }).nodes).map((n) => n.code).filter(Boolean));
    const usados: string[] = [];
    const riesgos = buildSampleRisks((code) => "w-" + code);
    const crs = buildSampleCrs((code) => { usados.push(code); return "w-" + code; }, (code) => { const r = riesgos.find((x) => x.code === code); return r ? r.id : ""; });
    expect(crs.length).toBe(SAMPLE_CRS.length);
    crs.forEach((c) => {
      c.riskIds.forEach((r) => expect(riesgos.some((x) => x.id === r)).toBe(true));
      c.orderIds.forEach((o) => expect(SAMPLE_COST_ORDERS.some((x) => x.id === o)).toBe(true));
      expect(normalizeCr(c, c.id).code).toBe(c.code);
    });
    expect(usados.length).toBeGreaterThan(0);
    if (codigos.size) usados.forEach((u) => expect(codigos.has(u)).toBe(true));
    expect(SAMPLE_PLAN.reserves).toBeTruthy();
  });
});
