// Órdenes de cambio de costos (hallazgo "alta" de revisión externa, PMI: reservas y
// alcance / presupuesto y línea base): los textos enseñaban que "un cambio de alcance
// requiere reserva de gestión", y aprobar una orden solo actualizaba totales -- sin
// transferencia presupuestaria ni línea base nueva. Ahora la naturaleza del cambio
// (riesgo materializado / trabajo imprevisto dentro del alcance / cambio de alcance),
// su financiación y su aprobación son ejes separados, y la línea base solo cambia al
// INCORPORAR la orden de forma explícita.
import { describe, expect, it } from "vitest";
import {
  analyzeChangeOrders, contingencyByRisk, orderEffect, planBaselining, validateApproval,
  FUND_CONT, FUND_EXTRA, FUND_MGMT, type CoBaselineEntry, type CoOrder
} from "../../src/shared/change-orders";
import type { RiskRef } from "../../src/shared/risk-analysis";
import { costSummary } from "../../src/core/gpi-core";
import type { CostModule } from "../../src/core/types";

const B = { bac: 1000000, cont: 100000, mgmt: 50000 };
const ok = (o: CoOrder): CoOrder => ({ id: "OC-X", kind: "riesgo", fund: FUND_CONT, cost: 10000, status: "Pendiente", approver: "CCB", sponsorAuth: false, ...o });

describe("validateApproval -- una naturaleza no fuerza una fuente de fondos", () => {
  it("un cambio de alcance NO requiere reserva de gestión: puede financiarse con fondos adicionales (cliente/sponsor)", () => {
    const o = ok({ kind: "alcance", fund: FUND_EXTRA, cost: 240000, sponsorAuth: true });
    expect(validateApproval(o, [o], B)).toEqual([]);
  });
  it("...ni la reserva de gestión es automática: también es válida SI el sponsor la autoriza y alcanza", () => {
    const o = ok({ kind: "alcance", fund: FUND_MGMT, cost: 30000, sponsorAuth: true });
    expect(validateApproval(o, [o], B)).toEqual([]);
  });
  it("un cambio de alcance no se financia con contingencia", () => {
    const o = ok({ kind: "alcance", fund: FUND_CONT });
    expect(validateApproval(o, [o], B).join("|")).toMatch(/no se financia con contingencia/);
  });
  it("un riesgo materializado con contingencia se aprueba sin autorización del sponsor", () => {
    const o = ok({ kind: "riesgo", fund: FUND_CONT, cost: 60000 });
    expect(validateApproval(o, [o], B)).toEqual([]);
  });
  it("trabajo imprevisto dentro del alcance: es válido con contingencia o con reserva autorizada (no es cambio de alcance)", () => {
    const a = ok({ kind: "imprevisto", fund: FUND_CONT });
    const b = ok({ kind: "imprevisto", fund: FUND_MGMT, sponsorAuth: true, cost: 20000 });
    expect(validateApproval(a, [a], B)).toEqual([]);
    expect(validateApproval(b, [b], B)).toEqual([]);
  });
  it("sin clasificar (p. ej. una orden de un .json antiguo) no puede aprobarse hasta clasificarla", () => {
    const o = ok({ kind: undefined });
    expect(validateApproval(o, [o], B).join("|")).toMatch(/clasifica la orden/);
  });
  it("hay que registrar quién aprueba", () => {
    const o = ok({ approver: "  " });
    expect(validateApproval(o, [o], B).join("|")).toMatch(/quién aprueba/);
  });
  it("reserva de gestión y fondos adicionales exigen la autorización EXPRESA del sponsor", () => {
    const m = ok({ kind: "imprevisto", fund: FUND_MGMT, sponsorAuth: false });
    const x = ok({ kind: "alcance", fund: FUND_EXTRA, sponsorAuth: false });
    expect(validateApproval(m, [m], B).join("|")).toMatch(/autorización expresa del sponsor/);
    expect(validateApproval(x, [x], B).join("|")).toMatch(/autorización expresa del sponsor/);
  });
  it("no se puede comprometer más de lo disponible: contingencia y reserva descuentan lo ya aprobado", () => {
    const previa = ok({ id: "OC-1", kind: "riesgo", fund: FUND_CONT, cost: 80000, status: "Aprobada" });
    const otra = ok({ id: "OC-2", kind: "riesgo", fund: FUND_CONT, cost: 30000 });   // 80.000 + 30.000 > 100.000
    expect(validateApproval(otra, [previa, otra], B).join("|")).toMatch(/excede la contingencia disponible \(20000\)/);
    const r1 = ok({ id: "OC-3", kind: "imprevisto", fund: FUND_MGMT, cost: 40000, status: "Aprobada", sponsorAuth: true });
    const r2 = ok({ id: "OC-4", kind: "imprevisto", fund: FUND_MGMT, cost: 20000, sponsorAuth: true });
    expect(validateApproval(r2, [r1, r2], B).join("|")).toMatch(/excede la reserva de gestión disponible \(10000\)/);
  });
  it("re-validar una orden ya aprobada no la cuenta dos veces contra el saldo", () => {
    const o = ok({ kind: "riesgo", fund: FUND_CONT, cost: 100000, status: "Aprobada" });
    expect(validateApproval(o, [o], B)).toEqual([]);
  });
});

describe("riesgo materializado = un riesgo del REGISTRO (auditoría: el registro es la prueba)", () => {
  const RR: RiskRef[] = [
    { id: "rk3", code: "R-03", title: "Suelo", type: "amenaza", status: "materializado" },
    { id: "rk4", code: "R-04", title: "Tipo de cambio", type: "amenaza", status: "monitoreo" },
    { id: "rk10", code: "R-10", title: "Descuento", type: "oportunidad", status: "materializado" }
  ];
  const ord = (o: Partial<CoOrder> = {}): CoOrder => ok({ kind: "riesgo", fund: FUND_CONT, cost: 10000, ...o });
  it("sin vínculo no se aprueba, y el mensaje explica la alternativa correcta (trabajo imprevisto)", () => {
    const o = ord();
    expect(validateApproval(o, [o], B, RR).join("|")).toMatch(/vincula la orden con el riesgo del Registro de Riesgos.*trabajo imprevisto dentro del alcance/);
  });
  it("con un riesgo materializado del registro se aprueba", () => {
    const o = ord({ riskId: "rk3", riskCode: "R-03" });
    expect(validateApproval(o, [o], B, RR)).toEqual([]);
  });
  it("un riesgo que aún NO se materializó no basta: hay que marcarlo Materializado en el registro", () => {
    const o = ord({ riskId: "rk4", riskCode: "R-04" });
    expect(validateApproval(o, [o], B, RR).join("|")).toMatch(/R-04 figura como «monitoreo».*márcalo como Materializado/);
  });
  it("una oportunidad no genera una orden por riesgo materializado; un riesgo eliminado del registro se detecta", () => {
    expect(validateApproval(ord({ riskId: "rk10" }), [], B, RR).join("|")).toMatch(/R-10 es una oportunidad/);
    expect(validateApproval(ord({ riskId: "zz", riskCode: "R-99" }), [], B, RR).join("|")).toMatch(/R-99\) no existe en el Registro de Riesgos/);
  });
  it("el vínculo solo se exige a los «riesgo materializado»; sin registro a mano (undefined) no se comprueba", () => {
    const imp = ok({ kind: "imprevisto", fund: FUND_CONT });
    expect(validateApproval(imp, [imp], B, RR)).toEqual([]);
    const sinVinculo = ord();
    expect(validateApproval(sinVinculo, [sinVinculo], B)).toEqual([]);              // compatibilidad: quien no pasa el registro
    expect(validateApproval(sinVinculo, [sinVinculo], B, [])).not.toEqual([]);      // registro vacío ≠ sin registro: no hay ningún riesgo que vincular
  });
});

describe("contingencyByRisk -- la traza contingencia → riesgo", () => {
  const RR = [{ id: "rk3", code: "R-03", title: "Suelo", type: "amenaza" as const, status: "materializado" as const, plannedMax: 350000 }];
  it("agrupa por riesgo lo aprobado con contingencia, lo aprobado con otras fuentes y lo pendiente", () => {
    const d = contingencyByRisk([
      ok({ id: "OC-1", riskId: "rk3", status: "Aprobada", fund: FUND_CONT, cost: 180000 }),
      ok({ id: "OC-2", riskId: "rk3", status: "Aprobada", fund: FUND_MGMT, cost: 40000 }),
      ok({ id: "OC-3", riskId: "rk3", status: "Pendiente", fund: FUND_CONT, cost: 5000 }),
      ok({ id: "OC-4", riskId: "rk3", status: "Rechazada", fund: FUND_CONT, cost: 9999 }),
      ok({ id: "OC-5", status: "Aprobada", fund: FUND_CONT, cost: 777 })          // sin riesgo: no entra
    ], RR);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ code: "R-03", contingency: 180000, other: 40000, pending: 5000, orphan: false, plannedMax: 350000, over: false });
    expect(d[0].orderIds).toEqual(["OC-1", "OC-2", "OC-3", "OC-4"]);
  });
  it("marca cuando lo aprobado supera el impacto máximo que el análisis había previsto", () => {
    const d = contingencyByRisk([ok({ id: "OC-1", riskId: "rk3", status: "Aprobada", fund: FUND_CONT, cost: 400000 })], RR);
    expect(d[0].over).toBe(true);
  });
  it("un riesgo que ya no está en el registro queda como huérfano, con el código guardado en la orden", () => {
    const d = contingencyByRisk([ok({ id: "OC-1", riskId: "zz", riskCode: "R-77", status: "Aprobada", fund: FUND_CONT, cost: 1 })], RR);
    expect(d[0]).toMatchObject({ code: "R-77", orphan: true, over: false, plannedMax: null });
  });
  it("sin órdenes vinculadas no hay filas", () => expect(contingencyByRisk([ok({ status: "Aprobada" })], RR)).toEqual([]));
});

describe("analyzeChangeOrders -- aprobar reserva fondos; la línea base no cambia hasta incorporar", () => {
  it("contingencia: baja la contingencia disponible y NO toca el BAC ni el total", () => {
    const a = analyzeChangeOrders([ok({ status: "Aprobada", fund: FUND_CONT, cost: 30000 })], B);
    expect(a).toMatchObject({ fromContingency: 30000, contingencyAvailable: 70000, bacCurrent: 1000000, pendingBaseline: 0, totalBudget: 1050000 });
  });
  it("reserva de gestión aprobada: se COMPROMETE (baja la reserva disponible) pero el BAC sigue igual hasta incorporarla; el total no cambia", () => {
    const o = ok({ status: "Aprobada", fund: FUND_MGMT, cost: 20000, sponsorAuth: true });
    const a = analyzeChangeOrders([o], B);
    expect(a).toMatchObject({ fromMgmt: 20000, mgmtAvailable: 30000, bacCurrent: 1000000, pendingBaseline: 20000, totalBudget: 1050000 });
  });
  it("al incorporarla, el BAC sube y desaparece lo pendiente; el total sigue igual (transferencia interna)", () => {
    const a = analyzeChangeOrders([ok({ status: "Aprobada", fund: FUND_MGMT, cost: 20000, sponsorAuth: true, baselined: "LB-1" })], B);
    expect(a).toMatchObject({ bacCurrent: 1020000, pendingBaseline: 0, mgmtAvailable: 30000, totalBudget: 1050000 });
  });
  it("fondos adicionales: suben el BAC (al incorporar) Y el presupuesto total; la reserva de gestión no se toca", () => {
    const o = ok({ status: "Aprobada", fund: FUND_EXTRA, cost: 240000, sponsorAuth: true });
    expect(analyzeChangeOrders([o], B)).toMatchObject({ fromExtra: 240000, mgmtAvailable: 50000, bacCurrent: 1000000, pendingBaseline: 240000, totalBudget: 1290000 });
    expect(analyzeChangeOrders([{ ...o, baselined: "LB-1" }], B)).toMatchObject({ bacCurrent: 1240000, pendingBaseline: 0, totalBudget: 1290000 });
  });
  it("las pendientes y rechazadas no comprometen nada", () => {
    const a = analyzeChangeOrders([ok({ status: "Pendiente", fund: FUND_MGMT, cost: 9999 }), ok({ status: "Rechazada", fund: FUND_CONT, cost: 9999 })], B);
    expect(a).toMatchObject({ approved: 0, pending: 1, mgmtAvailable: 50000, contingencyAvailable: 100000, bacCurrent: 1000000 });
  });
  it("compatibilidad: un .json antiguo (sin naturaleza, solo Contingencia / Reserva de gestión) da los mismos totales que antes", () => {
    const a = analyzeChangeOrders([
      { status: "Aprobada", fund: "Contingencia", cost: 50000 }, { status: "Aprobada", fund: "Reserva de gestión", cost: 20000 }, { status: "Pendiente", cost: 5000 }
    ], B);
    expect(a).toMatchObject({ approved: 70000, fromContingency: 50000, fromMgmt: 20000, pending: 1 });
  });
});

describe("orderEffect -- efecto presupuestario de cada fuente", () => {
  it("contingencia: se redistribuye dentro de la línea base", () => expect(orderEffect(ok({ fund: FUND_CONT, cost: 5 }))).toEqual({ dBac: 0, dContingency: -5, dMgmt: 0, dTotal: 0 }));
  it("reserva de gestión: pasa de la reserva a la línea base (el total no cambia)", () => expect(orderEffect(ok({ fund: FUND_MGMT, cost: 5 }))).toEqual({ dBac: 5, dContingency: 0, dMgmt: -5, dTotal: 0 }));
  it("fondos adicionales: aumentan la línea base y el total", () => expect(orderEffect(ok({ fund: FUND_EXTRA, cost: 5 }))).toEqual({ dBac: 5, dContingency: 0, dMgmt: 0, dTotal: 5 }));
});

describe("planBaselining -- la incorporación a la línea base es explícita y deja versión", () => {
  const aprobada = (o: Partial<CoOrder> = {}): CoOrder => ok({ status: "Aprobada", fund: FUND_MGMT, sponsorAuth: true, cost: 20000, ...o });
  it("crea LB-1 con el BAC anterior y el nuevo", () => {
    const o = aprobada({ id: "OC-7" });
    const r = planBaselining(o, [o], B, [], "2026-07-13");
    expect(r).toEqual({ ok: true, entry: { version: "LB-1", date: "2026-07-13", orderIds: ["OC-7"], bacBefore: 1000000, bacAfter: 1020000, approver: "CCB" } });
  });
  it("las versiones se encadenan: la segunda parte del BAC vigente de la primera", () => {
    const o1 = aprobada({ id: "OC-1", baselined: "LB-1" }), o2 = aprobada({ id: "OC-2", cost: 5000 });
    const log: CoBaselineEntry[] = [{ version: "LB-1", date: "d", orderIds: ["OC-1"], bacBefore: 1000000, bacAfter: 1020000, approver: "CCB" }];
    const r = planBaselining(o2, [o1, o2], B, log, "2026-08-01");
    expect(r).toMatchObject({ ok: true, entry: { version: "LB-2", bacBefore: 1020000, bacAfter: 1025000 } });
  });
  it("rechaza lo que no corresponde: pendiente, contingencia (ya está dentro de la línea base), ya incorporada, monto no positivo", () => {
    const p = ok({ status: "Pendiente", fund: FUND_MGMT }), c = aprobada({ fund: FUND_CONT }), b = aprobada({ baselined: "LB-1" }), z = aprobada({ cost: 0 });
    expect((planBaselining(p, [p], B, [], "d") as { problem: string }).problem).toMatch(/solo se incorpora .* Aprobada/);
    expect((planBaselining(c, [c], B, [], "d") as { problem: string }).problem).toMatch(/contingencia ya está dentro/);
    expect((planBaselining(b, [b], B, [], "d") as { problem: string }).problem).toMatch(/ya está incorporada .* LB-1/);
    expect((planBaselining(z, [z], B, [], "d") as { problem: string }).problem).toMatch(/mayor que cero/);
  });
});

describe("costSummary (Panel) usa el mismo análisis y conserva los campos anteriores", () => {
  it("BAC vigente, pendiente de incorporar y reservas disponibles; los campos históricos no cambian", () => {
    const cost: CostModule = {
      budget: { baseCost: 900000, computed: { base: 900000, cont: 100000, bac: 1000000, total: 1050000 } },
      changeOrders: [
        { status: "Aprobada", fund: "Contingencia", cost: 30000 },
        { status: "Aprobada", fund: "Reserva de gestión", cost: 20000, baselined: "LB-1" },
        { status: "Aprobada", fund: "Financiamiento adicional", cost: 10000 }
      ]
    };
    (cost.budget!.computed as Record<string, unknown>).mgmt = 50000;
    const s = costSummary(cost);
    expect(s).toMatchObject({ bac: 1000000, approvedAmount: 60000, fromContingency: 30000, fromMgmt: 20000, fromExtra: 10000 });
    expect(s).toMatchObject({ bacCurrent: 1020000, pendingBaseline: 10000, contingencyAvailable: 70000, mgmtAvailable: 30000 });
  });
});
