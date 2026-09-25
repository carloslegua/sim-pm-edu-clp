// Referencia de valor ganado congelada con la línea base: src/shared/evm-reference.ts y su lectura tolerante en schedule-control.ts.
import { describe, expect, it } from "vitest";
import { approvedTransfers, buildEvmReference, packageBudgets, packageSpans, referenceDrift, type RefInput } from "../../src/shared/evm-reference";
import { normalizeBaseline, normalizeEvmReference } from "../../src/shared/schedule-control";

const input = (): RefInput => ({
  leaves: [{ id: "w1", code: "1.1", name: "Excavación" }, { id: "w2", code: "1.2", name: "Relleno" }, { id: "w3", code: "1.3", name: "Sin costo" }],
  estimateRows: [{ leafId: "w1", subtotal: 600 }, { leafId: "w1", subtotal: 400 }, { leafId: "w2", subtotal: null }],
  wbsCost: { w1: 5, w2: 300, w3: 0 },
  activityNodes: [{ id: "a1", leafId: "w1", isMilestone: false }, { id: "a2", leafId: "w1", isMilestone: false }, { id: "a3", leafId: "w2", isMilestone: false }, { id: "h1", leafId: "w2", isMilestone: true }],
  rows: { a1: { es: 0, ef: 4 }, a2: { es: 2, ef: 10 }, a3: { es: 10, ef: 15 }, h1: { es: 99, ef: 99 } }, calendar: { workDayIdx: [1, 2, 3, 4, 5], holidays: ["2026-07-28"] }
});

describe("packageBudgets / packageSpans", () => {
  it("BAC = Estimar los Costos (suma de las actividades del paquete); sin estimado, el costo de la EDT; sin ninguno, sin BAC", () => {
    expect(packageBudgets(input())).toEqual({ w1: { bac: 1000, source: "Estimar los Costos" }, w2: { bac: 300, source: "EDT (WBS Builder)" } });
  });
  it("REPRO (auditoría, alta): un estimado PARCIAL no es el presupuesto del paquete (misma regla que WBS Builder): se usa el costo de la EDT", () => {
    const i = input(); i.estimateRows = [{ leafId: "w1", subtotal: 600 }, { leafId: "w1", subtotal: null }, { leafId: "w2", subtotal: 80 }];
    // w1: una actividad sin precio → EDT (5); w2: completo → 80; w3 sin EDT ni estimado → sin BAC
    expect(packageBudgets(i)).toEqual({ w1: { bac: 5, source: "EDT (WBS Builder)" }, w2: { bac: 80, source: "Estimar los Costos" } });
    i.wbsCost.w1 = 0;                                                                                     // sin costo en la EDT, el parcial es lo único que hay
    expect(packageBudgets(i).w1).toEqual({ bac: 600, source: "Estimar los Costos (parcial)" });
  });
  it("inicio más temprano y fin más tardío de las actividades de cada paquete; los hitos no cuentan", () => {
    expect(packageSpans(input())).toEqual({ w1: { es: 0, ef: 10 }, w2: { es: 10, ef: 15 } });
  });
});

describe("approvedTransfers: órdenes de cambio que pasan al presupuesto del trabajo (auditoría, alta)", () => {
  const leaves = [{ id: "w-4.2", code: "4.2" }, { id: "w-4.5", code: "4.5" }, { id: "w-4.1", code: "4.1" }];
  it("contingencia aprobada → al paquete; reserva/fondos solo si se incorporaron (LB-n); pendientes y rechazadas no", () => {
    const r = approvedTransfers([
      { id: "OC-001", status: "Aprobada", fund: "Contingencia", cost: 180000, wbsId: "w-4.2" },
      { id: "OC-002", status: "Aprobada", fund: "Financiamiento adicional", cost: 240000, wbsId: "w-4.5" },                       // aprobada sin incorporar: aún no
      { id: "OC-003", status: "Aprobada", fund: "Reserva de gestión", cost: 90000, wbsCode: "4.1", baselined: "LB-1" },           // por código (id cambió)
      { id: "OC-004", status: "Pendiente", fund: "Contingencia", cost: 50000, wbsId: "w-4.2" },
      { id: "OC-005", status: "Rechazada", fund: "Contingencia", cost: 70000, wbsId: "w-4.2" }
    ], leaves);
    expect(r.byLeaf).toEqual({ "w-4.2": 180000, "w-4.1": 90000 });
    expect(r.applied.map((t) => t.id)).toEqual(["OC-001", "OC-003"]); expect(r.unassigned).toEqual([]);
  });
  it("una orden aprobada sin paquete (o con uno que ya no existe) no se asigna: se lista para corregirla", () => {
    const r = approvedTransfers([{ id: "OC-001", status: "Aprobada", fund: "Contingencia", cost: 180000 }, { id: "OC-009", status: "Aprobada", fund: "Contingencia", cost: 1, wbsId: "borrado", wbsCode: "9.9" }], leaves);
    expect(r.byLeaf).toEqual({}); expect(r.unassigned.map((t) => t.id)).toEqual(["OC-001", "OC-009"]);
    expect(approvedTransfers(null, leaves)).toEqual({ byLeaf: {}, applied: [], unassigned: [] });   // Costos sin órdenes (o datos basura)
  });
});

describe("buildEvmReference", () => {
  it("congela presupuesto, fechas por paquete, calendario y total", () => {
    const r = buildEvmReference(input());
    expect(r.packages).toEqual([{ id: "w1", code: "1.1", name: "Excavación", bac: 1000, source: "Estimar los Costos", es: 0, ef: 10 }, { id: "w2", code: "1.2", name: "Relleno", bac: 300, source: "EDT (WBS Builder)", es: 10, ef: 15 }]);
    expect(r.total).toBe(1300); expect(r.calendar).toEqual({ workDayIdx: [1, 2, 3, 4, 5], holidays: ["2026-07-28"] });
  });
  it("es una COPIA: editar después el calendario de origen no altera lo congelado", () => {
    const i = input(), r = buildEvmReference(i); i.calendar.holidays.push("2026-08-30"); i.calendar.workDayIdx.push(6);
    expect(r.calendar.holidays).toEqual(["2026-07-28"]); expect(r.calendar.workDayIdx).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("referenceDrift: qué cambió después de congelar", () => {
  const frozen = () => buildEvmReference(input());
  it("sin cambios no dice nada", () => { expect(referenceDrift(frozen(), "2026-07-06", "2026-07-06", frozen())).toEqual([]); });
  it("duplicar la estimación, mover el inicio o cambiar feriados se detecta, con qué cambió", () => {
    const i = input(); i.estimateRows = [{ leafId: "w1", subtotal: 2000 }]; i.calendar.holidays = [];
    const d = referenceDrift(frozen(), "2026-07-06", "2026-08-03", buildEvmReference(i));
    expect(d).toHaveLength(3); expect(d[0]).toMatch(/presupuesto por paquete \(1 paquete\(s\).*2[.,]300.*1[.,]300/); expect(d[1]).toMatch(/2026-08-03 frente a 2026-07-06/); expect(d[2]).toMatch(/calendario laboral/);
  });
  it("sin fecha de inicio en alguno de los dos lados no se compara la fecha", () => { expect(referenceDrift(frozen(), "", "2026-08-03", frozen())).toEqual([]); });
});

describe("normalizeEvmReference / normalizeBaseline", () => {
  const snap = (evm?: unknown) => ({ frozen: true, version: "LB-1", date: "2026-07-06", snapshot: { projectDuration: 15, startDate: "2026-07-06", finishDate: "2026-07-24", nearCriticalDays: 5, rows: [{ id: "a1", es: 0, ef: 10 }], ...(evm === undefined ? {} : { evm }) }, log: [] });
  it("una línea base ANTIGUA (sin referencia) se lee bien y su referencia es null: EVM lo avisa en vez de inventarla", () => {
    expect(normalizeBaseline(snap())!.snapshot.evm).toBeNull(); expect(normalizeEvmReference(null)).toBeNull(); expect(normalizeEvmReference({ packages: "x" })).toBeNull();
  });
  it("una referencia guardada hace ida y vuelta por normalizeBaseline", () => {
    const ref = buildEvmReference(input()), back = normalizeBaseline(snap(JSON.parse(JSON.stringify(ref))))!.snapshot.evm!;
    expect(back).toEqual(ref);
  });
  it("es tolerante con basura: descarta paquetes sin id y completa el total", () => {
    const r = normalizeEvmReference({ calendar: { workDayIdx: ["1", "x", 3], holidays: [5] }, packages: [{ id: "a", bac: "10", es: "2", ef: "" }, { bac: 5 }, null] })!;
    expect(r.packages).toEqual([{ id: "a", code: "", name: "", bac: 10, source: "", es: 2, ef: null }]); expect(r.total).toBe(10); expect(r.calendar).toEqual({ workDayIdx: [1, 3], holidays: ["5"] });
  });
});
