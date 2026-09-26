// Plan de Adquisiciones: src/shared/procurement-plan.ts y su ejemplo DISTRIB+ (contra el CPM real, la EDT, el OBS y los riesgos).
import { describe, expect, it } from "vitest";
import { cpm, scheduleNetwork, wbsCodes } from "../../src/core/gpi-core";
import { SAMPLE_START_DATE, sampleScheduleModules, sampleSchedulePlan } from "../../src/shared/schedule-sample";
import {
  addDays, blankProcurement, criteriaSum, daysBetween, launchBy, nextCode, normalizeItem, normalizeProcurement, procurementFindings, procurementState, summary,
  type ProcData, type ProcFacts, type ProcItem, adminSummary, nextClaimCode, nextPaymentCode, normalizeClaim, normalizePayment } from "../../src/shared/procurement-plan";
import { SAMPLE_AS_OF, buildSampleProcurement, sampleProcurementFacts } from "../../src/shared/procurement-sample";
import { SAMPLE_OBS_ROLES } from "../../src/shared/case-distribplus";
import { buildSampleQuality } from "../../src/shared/quality-sample";

const facts = (): ProcFacts => ({
  leaves: [{ id: "l1", code: "3.1", name: "Estructuras", cost: 1000 }, { id: "l2", code: "3.2", name: "Materiales", cost: 500 }], roles: ["Jefe de Logística"],
  risks: [{ id: "r1", code: "R-02", title: "Alza del acero", wbsIds: ["l1"], high: true, threat: true }, { id: "r2", code: "R-10", title: "Descuento", wbsIds: ["l2"], high: true, threat: false }], suppliers: ["Proveedor A"], estimateClass: 3, baseCost: 10000
});
const crit = [{ name: "Precio", weight: 50 }, { name: "Técnica", weight: 30 }, { name: "Plazo", weight: 20 }];
const item = (o: Record<string, unknown> = {}): ProcItem => normalizeItem({ id: "p1", code: "PR-01", name: "Estructuras", wbsIds: ["l1"], decision: "Comprar", contractType: "Precio fijo (FFP)", selection: "Licitación abierta", criteria: crit, value: 1000, needDate: "2026-12-01", leadDays: 30, selectionDays: 30, supplier: "Proveedor A", status: "Planificada", owner: "Jefe de Logística", riskIds: ["r1"], ...o }, "p1");
const data = (items: ProcItem[], o: Partial<ProcData> = {}): ProcData => ({ strategy: "Estrategia", performance: "Desempeño", approvals: "Aprobaciones", asOf: "2026-08-03", items, idCounter: 9, admin: { payments: [], claims: [] }, ...o });
const codes = (d: ProcData, f = facts()) => procurementFindings(d, f).map((x) => x.code);

describe("fechas y normalización", () => {
  it("fecha límite = requerida − plazo del proveedor − tiempo de selección; null si falta algo", () => {
    expect(launchBy(item())).toBe("2026-10-02"); expect(launchBy(item({ leadDays: null }))).toBeNull(); expect(launchBy(item({ needDate: "" }))).toBeNull();
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28"); expect(daysBetween("2026-08-03", "2026-09-13")).toBe(41); expect(daysBetween("", "2026-01-01")).toBeNull();
  });
  it("un .json viejo o vacío se lee sin fallar; estado desconocido = planificada; código siguiente", () => {
    expect(blankProcurement("2026-01-01")).toEqual({ strategy: "", performance: "", approvals: "", asOf: "2026-01-01", items: [], idCounter: 1, admin: { payments: [], claims: [] } });
    const d = normalizeProcurement({ items: [{ id: "a", status: "raro", value: "12", criteria: [{ name: "P", weight: "60" }], full: false }, null], asOf: "mal" }, "2026-05-05");
    expect(d.items[0]).toMatchObject({ status: "Planificada", value: 12, full: false }); expect(d.items[0].criteria[0].weight).toBe(60); expect(d.asOf).toBe("2026-05-05"); expect(d.items[1].code).toBe("pr2");
    expect(nextCode([])).toBe("PR-01"); expect(nextCode([item({ code: "PR-07" })])).toBe("PR-08"); expect(criteriaSum(item())).toBe(100);
  });
});

describe("procurementFindings", () => {
  it("un plan completo y coherente no tiene hallazgos", () => { const d = data([item()]); expect(procurementFindings(d, facts())).toEqual([]); expect(procurementState(d, facts())).toBe("verde"); });
  it("P1: convocatoria vencida sobre la fecha de corte es un riesgo; próxima (≤ 30 d) es informativa; ya convocada no molesta", () => {
    const late = procurementFindings(data([item({ needDate: "2026-09-01" })]), facts()).find((x) => x.code === "P1")!;
    expect(late.severity).toBe("riesgo"); expect(late.text).toMatch(/debió lanzarse el 2026-07-03.*hace 31 días.*2026-08-03/);
    expect(procurementFindings(data([item({ needDate: "2026-10-20" })]), facts()).find((x) => x.code === "P1")!.severity).toBe("info");    // launchBy 2026-08-21: 18 d
    expect(codes(data([item({ needDate: "2026-09-01", status: "Convocada" })]))).not.toContain("P1");
    expect(procurementState(data([item({ needDate: "2026-09-01" })]), facts())).toBe("rojo");
  });
  it("P2/P10: sin nombre o decisión, paquete inexistente, sin responsable o fuera del OBS", () => {
    expect(codes(data([item({ name: "", decision: "" })]))).toContain("P2"); expect(codes(data([item({ wbsIds: ["zz"] })]))).toContain("P2");
    expect(codes(data([item({ owner: "" })]))).toContain("P10"); expect(procurementFindings(data([item({ owner: "Chofer" })]), facts()).find((x) => x.code === "P10")!.severity).toBe("info");
  });
  it("P3: sin fecha requerida o sin plazos no se puede calcular cuándo convocar", () => { expect(codes(data([item({ needDate: "" })]))).toContain("P3"); expect(codes(data([item({ selectionDays: null })]))).toContain("P3"); });
  it("P4: precio fijo con un estimado de clase 4 o 5 (definición insuficiente); sin tipo de contrato", () => {
    const f = facts(); f.estimateClass = 4;
    expect(procurementFindings(data([item()]), f).find((x) => x.code === "P4")!.text).toMatch(/precio fijo.*clase 4/);
    expect(codes(data([item({ contractType: "Precio unitario" })]), f)).not.toContain("P4"); expect(codes(data([item({ contractType: "" })]))).toContain("P4");
  });
  it("P5: criterios de selección que no suman 100, faltantes o menos de tres; la adjudicación directa pide justificación", () => {
    expect(procurementFindings(data([item({ criteria: [{ name: "Precio", weight: 60 }, { name: "Plazo", weight: 30 }, { name: "Técnica", weight: 5 }] })]), facts()).find((x) => x.code === "P5")!.text).toMatch(/suman 95/);
    expect(codes(data([item({ criteria: [] })]))).toContain("P5"); expect(procurementFindings(data([item({ criteria: [{ name: "Precio", weight: 70 }, { name: "Plazo", weight: 30 }] })]), facts()).find((x) => x.code === "P5")!.severity).toBe("info");
    const dir = procurementFindings(data([item({ selection: "Adjudicación directa", criteria: [] })]), facts()).filter((x) => x.code === "P5"); expect(dir).toHaveLength(1); expect(dir[0].text).toMatch(/justificación/);
    expect(codes(data([item({ selection: "" })]))).toContain("P5");
  });
  it("P6: valor sin definir o que difiere más de 10 % del costo de la EDT; no aplica si el contrato no cubre todo el paquete", () => {
    expect(procurementFindings(data([item({ value: 1200 })]), facts()).find((x) => x.code === "P6")!.text).toMatch(/1[.,]200.*10 %.*1[.,]000/);
    expect(codes(data([item({ value: 1090 })]))).not.toContain("P6"); expect(codes(data([item({ value: null })]))).toContain("P6"); expect(codes(data([item({ value: 200, full: false })]))).not.toContain("P6");
  });
  it("P7/P12: adjudicada sin proveedor o fecha; proveedor que no está en el OBS ni entre los interesados", () => {
    expect(codes(data([item({ status: "Adjudicada", supplier: "", awardDate: "" })]))).toContain("P7"); expect(codes(data([item({ status: "Contratada", awardDate: "2026-07-20" })]))).not.toContain("P7");
    expect(codes(data([item({ supplier: "Ferretería X" })]))).toContain("P12"); expect(codes(data([item({ supplier: "proveedor a" })]))).not.toContain("P12");
  });
  it("P8: el riesgo alto que afecta sus paquetes y no cita (una oportunidad no obliga); una cita a un riesgo que ya no existe", () => {
    expect(procurementFindings(data([item({ riskIds: [] })]), facts()).find((x) => x.code === "P8")!.text).toMatch(/R-02 «Alza del acero».*transfiere, lo mitiga o lo acepta/);
    expect(codes(data([item({ wbsIds: ["l2"], value: 500, riskIds: [] })]))).not.toContain("P8");                                  // R-10 es oportunidad
    expect(codes(data([item({ riskIds: ["r1", "rx"] })]))).toContain("P8");
  });
  it("P13: plan sin estrategia, desempeño de proveedores o autorizaciones; «hacer» no exige contrato ni selección", () => {
    expect(codes(data([item()], { strategy: "", performance: "", approvals: "" })).filter((c) => c === "P13")).toHaveLength(3);
    expect(codes(data([item({ decision: "Hacer (recursos propios)", contractType: "", selection: "", criteria: [], needDate: "", supplier: "" })]))).toEqual([]);
    expect(procurementFindings(data([]), facts())).toEqual([]); expect(procurementState(data([]), facts())).toBe("vacio");
  });
  it("summary: valor total, estado, peso sobre el costo base y convocatorias vencidas o próximas", () => {
    const s = summary(data([item({ needDate: "2026-09-01" }), item({ id: "p2", code: "PR-02", needDate: "2026-10-20" }), item({ id: "p3", code: "PR-03", status: "Contratada", value: 500 })]), facts());
    expect(s).toMatchObject({ total: 2500, count: 3, late: 1, soon: 1 }); expect(s.byStatus.Contratada).toBe(1); expect(s.pctOfBase).toBeCloseTo(25, 5);
  });
});

describe("ejemplo DISTRIB+", () => {
  const cpmDates = (): Record<string, { s: string; f: string }> => {
    const m = sampleScheduleModules(), net = scheduleNetwork(m.wbs, m.activities, null, m.schedule, sampleSchedulePlan(), SAMPLE_START_DATE), res = cpm(net.nodes.map((n) => ({ id: n.id, dur: n.dur })), net.links as never, net.calendar, { startDate: SAMPLE_START_DATE });
    if (!res.ok) throw new Error("ciclo");
    const codes = wbsCodes(m.wbs), by: Record<string, { s: string; f: string }> = {};
    net.nodes.forEach((n) => { const r = res.rows[n.id]; if (!r || !n.leafId) return; const k = codes[n.leafId]; if (!by[k]) by[k] = { s: r.startDate, f: r.finishDate }; else { if (r.startDate < by[k].s) by[k].s = r.startDate; if (r.finishDate > by[k].f) by[k].f = r.finishDate; } });
    return by;
  };
  it("5 adquisiciones sin hallazgos a la fecha de corte (aprobación del plan) y con las convocatorias por delante", () => {
    const d = buildSampleProcurement(), f = sampleProcurementFacts();
    expect(d.items).toHaveLength(5); expect(d.asOf).toBe(SAMPLE_AS_OF); expect(procurementFindings(d, f)).toEqual([]); expect(procurementState(d, f)).toBe("verde");
    expect(d.items.map((i) => launchBy(i))).toEqual(["2026-08-17", "2026-09-15", "2026-09-10", "2026-12-31", "2026-10-03"]);
  });
  it("las fechas requeridas y los plazos son las del CRONOGRAMA CPM real: fin del paquete de procura y inicio = requerida − plazo del proveedor", () => {
    const d = buildSampleProcurement(), cd = cpmDates(), by = (c: string) => d.items.find((i) => i.code === c)!;
    (["3.1:PR-01", "3.2:PR-02", "3.3:PR-03", "4.5:PR-04"] as const).forEach((k) => { const [leaf, pr] = k.split(":"), it = by(pr); expect(it.needDate, pr).toBe(cd[leaf].f); expect(addDays(it.needDate, -(it.leadDays as number)), pr).toBe(cd[leaf].s); });
    expect(by("PR-05").needDate).toBe(cd["4.1"].s);                                                    // los ensayos se necesitan cuando arranca 4.1
  });
  it("el valor de cada compra es el costo de su paquete en la EDT; el servicio de ensayos coincide con la partida de evaluación del costo de la calidad", () => {
    const d = buildSampleProcurement(), f = sampleProcurementFacts(), cost = (c: string) => f.leaves.find((l) => l.code === c)!.cost;
    expect(d.items.slice(0, 4).map((i) => i.value)).toEqual([cost("3.1"), cost("3.2"), cost("3.3"), cost("4.5")]);
    const ensayos = buildSampleQuality().coq.find((c) => /Ensayos de laboratorio/.test(c.description))!; expect(d.items[4].value).toBe(ensayos.amount);
    expect(d.items[4].full).toBe(false);
  });
  it("los responsables y proveedores son del OBS; los riesgos altos que afectan los paquetes están citados", () => {
    const d = buildSampleProcurement(), f = sampleProcurementFacts();
    d.items.forEach((i) => expect(SAMPLE_OBS_ROLES).toContain(i.owner));
    d.items.filter((i) => i.supplier).forEach((i) => expect(f.suppliers).toContain(i.supplier));
    const alto = f.risks.filter((r) => r.high && r.threat); expect(alto.length).toBeGreaterThan(0);
    alto.filter((r) => d.items.some((i) => r.wbsIds.some((w) => i.wbsIds.indexOf(w) >= 0))).forEach((r) => expect(d.items.some((i) => i.riskIds.indexOf(r.id) >= 0), r.code).toBe(true));
    d.items.forEach((i) => expect(criteriaSum(i)).toBe(100));
  });
});

describe("administración de contratos (ejecución): pagos y reclamos", () => {
  const pay = (o: Record<string, unknown>) => normalizePayment({ id: "g", code: "PG-01", itemId: "p1", date: "2026-08-01", concept: "Anticipo", amount: 300, status: "pagado", ...o }, "g");
  const claim = (o: Record<string, unknown>) => normalizeClaim({ id: "c", code: "RC-01", itemId: "p1", date: "2026-07-20", description: "Retraso de entrega", amount: 50, status: "abierto", ...o }, "c");
  const admin = (payments: ReturnType<typeof pay>[], claims: ReturnType<typeof claim>[] = [], its = [item({ status: "Contratada", awardDate: "2026-07-20" })]) => data(its, { admin: { payments, claims } });
  it("un .json sin administración se lee en blanco; códigos siguientes; estados inválidos se corrigen", () => {
    expect(normalizeProcurement({ items: [] }).admin).toEqual({ payments: [], claims: [] }); expect(nextPaymentCode([])).toBe("PG-01"); expect(nextClaimCode([claim({ code: "RC-07" })])).toBe("RC-08");
    expect(normalizePayment({ status: "x" }, "a").status).toBe("programado"); expect(normalizeClaim({ status: "x" }, "a").status).toBe("abierto");
  });
  it("sin pagos ni reclamos no hay hallazgos de ejecución", () => { expect(codes(admin([]))).not.toEqual(expect.arrayContaining(["P14", "P15", "P16", "P17"])); });
  it("REPRO P14: lo PAGADO por encima del valor del contrato es un riesgo; solo programado por encima, aviso; retenido no cuenta", () => {
    const f = (payments: ReturnType<typeof pay>[]) => procurementFindings(admin(payments), facts()).find((x) => x.code === "P14");
    expect(f([pay({ amount: 600 }), pay({ id: "h", code: "PG-02", amount: 500 })])!.severity).toBe("riesgo");   // 1100 > 1000
    expect(f([pay({ amount: 600 }), pay({ id: "h", code: "PG-02", amount: 500, status: "programado" })])!.severity).toBe("aviso");
    expect(f([pay({ amount: 600 }), pay({ id: "h", code: "PG-02", amount: 900, status: "retenido" })])).toBeUndefined();
    expect(procurementState(admin([pay({ amount: 1200 })]), facts())).toBe("rojo");
  });
  it("P15: pagos de una adquisición sin contratar o que no existe", () => {
    expect(procurementFindings(admin([pay({})], [], [item({ status: "Convocada" })]), facts()).find((x) => x.code === "P15")!.text).toMatch(/pagos realizados pero está «Convocada»/);
    expect(procurementFindings(admin([pay({ itemId: "zz" })]), facts()).find((x) => x.code === "P15")!.text).toMatch(/no corresponde a ninguna adquisición/);
  });
  it("P16: reclamo ABIERTO más de 30 días a la fecha de corte; resuelto o reciente no", () => {
    const f = (c: ReturnType<typeof claim>) => procurementFindings(admin([], [c]), facts()).find((x) => x.code === "P16");   // corte 2026-08-03
    expect(f(claim({ date: "2026-06-20" }))!.text).toMatch(/ABIERTO hace 44 días/); expect(f(claim({ date: "2026-07-20" }))).toBeUndefined(); expect(f(claim({ date: "2026-06-20", status: "resuelto", resolvedOn: "2026-07-01" }))).toBeUndefined();
  });
  it("adminSummary cuenta pagos, lo pagado, contratos pagados de más y reclamos abiertos / viejos", () => {
    expect(adminSummary(admin([pay({ amount: 700 }), pay({ id: "h", amount: 400 })], [claim({ date: "2026-06-20" }), claim({ id: "d", date: "2026-07-30" })]))).toEqual({ payments: 2, paid: 1100, overpaid: 1, claimsOpen: 2, claimsStale: 1 });
  });
});
