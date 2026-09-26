// Plan para la Dirección (integrador): src/shared/pm-plan.ts. Lógica pura.
import { describe, expect, it } from "vitest";
import { PLAN_COMPONENTS, STATE_LABEL, approvalBlockers, areaRows, digestOf, emptyFacts, integrationFindings, snapshotDiff, snapshotOf, stableStringify, worstState, type PlanFacts } from "../../src/shared/pm-plan";

const base = (version: string, date: string, approver = "CCB") => ({ has: true, version, date, approver });
// Un proyecto completo y coherente (todo en orden).
function completo(): PlanFacts {
  const f = emptyFacts("2026-09-01");
  f.charter = { has: true, pct: 100, end: "2027-07-21", approach: "Predictivo" };
  f.approach = { lifecycle: "Predictivo por fases", tailoring: "Sin adaptación de las áreas", configuration: "Líneas base versionadas", changeProcess: "CCB según montos" };
  f.scope = { has: true, state: "verde", base: base("1.0", "2026-07-10"), notDecomposed: 0 };
  f.requirements = { has: true, state: "verde", base: base("1.0", "2026-07-10"), total: 6 };
  f.wbs = { leaves: 18, state: "verde", dictPct: 100, riesgo: 0, aviso: 0 };
  f.schedule = { has: true, ok: true, activities: 43, duration: 273, start: "2026-07-06", finish: "2027-07-21", critical: 34, base: base("LB-1", "2026-07-12"), deviationPct: 0 };
  f.cost = { has: true, bac: 8000000, bacCurrent: 8000000, total: 8400000, pendingBaseline: 0, capex: 8500000, boeStatus: "aprobada", boeApprovedOn: "2026-07-12", baselineVersion: "", baselineDate: "" };
  f.risks = { total: 10, open: 8, high: 0 }; f.stakeholders = { count: 12, close: 4 };
  f.resources = { roles: 12, withPerson: 12, leaves: 18, withR: 18, withoutA: 0 };
  f.changes = { total: 2, pending: 0, approvedOpen: 0, oldestPending: null };
  f.evm = { reports: 3, lastCut: "2026-10-30" };
  f.quality = { has: true, state: "verde", needing: 17, verified: 17, checks: 17, coqTotal: 350000 };
  f.comms = { has: true, state: "verde", items: 11, covered: 12, stakeholders: 12, closeUncovered: 0 };
  f.procurement = { has: true, state: "verde", items: 5, total: 3530000, late: 0, soon: 0, asOf: "2026-08-03" };
  f.projectEnd = "2027-07-21"; f.contractualEnd = "2027-07-21";
  return f;
}
const codes = (f: PlanFacts) => integrationFindings(f).map((x) => x.code);

describe("areaRows / estado del plan", () => {
  it("un proyecto vacío: las 14 áreas sin datos, cada una con su módulo (ninguna queda «sin módulo»)", () => {
    const rows = areaRows(emptyFacts());
    expect(rows.every((r) => r.state === "vacio")).toBe(true); expect(rows.every((r) => !!r.file && !r.unavailable)).toBe(true);
    expect(rows.length).toBe(14); expect(rows.filter((r) => ["quality", "comms", "procurement"].indexOf(r.key) >= 0).map((r) => r.file)).toEqual(["Plan_Calidad.html", "Plan_Comunicaciones.html", "Plan_Adquisiciones.html"]);
  });
  it("un proyecto coherente: las áreas con datos quedan en orden, incluidos los planes de calidad, comunicaciones y adquisiciones", () => {
    const rows = areaRows(completo()), by = (k: string) => rows.find((r) => r.key === k)!;
    ["charter", "requirements", "scope", "wbs", "schedule", "cost", "risks", "stakeholders", "resources", "changes", "evm", "quality", "comms", "procurement"].forEach((k) => expect(by(k).state, k).toBe("verde"));
    expect(by("quality").metric).toMatch(/17\/17 paquetes verificados · 17 control\(es\)/); expect(by("comms").metric).toBe("11 comunicación(es) · 12/12 interesados cubiertos"); expect(by("procurement").metric).toMatch(/5 adquisición\(es\).* 0 convocatoria\(s\) vencida\(s\)/);
    expect(by("schedule").metric).toBe("273 d laborables · fin 2027-07-21 · LB-1"); expect(by("cost").metric).toMatch(/BAC 8[.,]000[.,]000 · BOE aprobada/);
  });
  it("cronograma: sin línea base o muy desviado → ámbar; con ciclo → rojo. Costos: BOE sin aprobar → ámbar; sobre el CAPEX → rojo", () => {
    const f = completo(), st = (k: string) => areaRows(f).find((r) => r.key === k)!.state;
    f.schedule.base = { has: false, version: "", date: "", approver: "" }; expect(st("schedule")).toBe("ambar");
    f.schedule.base = base("LB-1", "2026-07-12"); f.schedule.deviationPct = 15; expect(st("schedule")).toBe("ambar");
    f.schedule.ok = false; expect(st("schedule")).toBe("rojo");
    f.cost.boeStatus = "revision"; expect(st("cost")).toBe("ambar");
    f.cost.total = 9000000; expect(st("cost")).toBe("rojo");
  });
  it("worstState y etiquetas", () => {
    expect(worstState(["vacio", "verde", "ambar"])).toBe("ambar"); expect(worstState([])).toBe("vacio"); expect(worstState(["rojo", "ambar"])).toBe("rojo");
    expect(STATE_LABEL.verde).toBe("En orden");
  });
});

describe("integrationFindings — el cruce entre líneas base", () => {
  it("un proyecto coherente y con el plan sin aprobar: solo la sugerencia de aprobarlo (P13)", () => { expect(codes(completo())).toEqual(["P13"]); });
  it("P1: hay planes y líneas base pero no Acta; P10: sin Registro de Riesgos", () => {
    const f = completo(); f.charter = { has: false, pct: 0, end: "", approach: "Predictivo" }; f.risks = { total: 0, open: 0, high: 0 };
    expect(codes(f)).toEqual(expect.arrayContaining(["P1", "P10"]));
    expect(codes(emptyFacts())).toEqual([]);                                                       // nada que integrar: nada que avisar
  });
  it("P2/P3/P4: sin línea base de alcance, de requisitos ni de cronograma; BOE sin aprobar", () => {
    const f = completo(); f.scope.base = { has: false, version: "", date: "", approver: "" }; f.requirements.base = { has: false, version: "", date: "", approver: "" };
    f.schedule.base = { has: false, version: "", date: "", approver: "" }; f.cost.boeStatus = "borrador";
    const c = codes(f); expect(c.filter((x) => x === "P2")).toHaveLength(2); expect(c).toEqual(expect.arrayContaining(["P3", "P4"]));
  });
  it("P5: el alcance cambió DESPUÉS de las líneas base del cronograma y del costo", () => {
    const f = completo(); f.scope.base = base("2.0", "2026-08-20");
    const t = integrationFindings(f).filter((x) => x.code === "P5").map((x) => x.text);
    expect(t).toHaveLength(2); expect(t[0]).toMatch(/v2\.0, 2026-08-20.*LB-1, 2026-07-12/); expect(t[1]).toMatch(/2026-08-20.*BOE \(2026-07-12\)/);
  });
  it("P6: cambios aprobados sin implementar; P9: pendientes de más de 14 días", () => {
    const f = completo(); f.changes = { total: 3, pending: 1, approvedOpen: 2, oldestPending: 19 };
    const c = codes(f); expect(c).toContain("P6"); expect(c).toContain("P9");
    f.changes.oldestPending = 10; expect(codes(f)).not.toContain("P9");
  });
  it("P7: el cronograma termina después de la fecha del proyecto (del Acta / hito contractual); P8: el presupuesto supera el CAPEX", () => {
    const f = completo(); f.schedule.finish = "2027-09-15";
    const p7 = integrationFindings(f).find((x) => x.code === "P7")!; expect(p7.text).toMatch(/2027-09-15, 56 día\(s\) después.*2027-07-21/);
    f.contractualEnd = ""; f.projectEnd = "2026-11-06"; expect(integrationFindings(f).find((x) => x.code === "P7")!.text).toMatch(/2026-11-06/);        // sin hito contractual, la fecha del proyecto
    f.schedule.finish = "2026-11-06"; expect(codes(f)).not.toContain("P7");
    f.cost.total = 8500001; expect(integrationFindings(f).find((x) => x.code === "P8")!.text).toMatch(/8[.,]500[.,]001.*8[.,]500[.,]000/);
    f.cost.capex = null; expect(codes(f)).not.toContain("P8");
  });
  it("P15–P19: los planes subsidiarios se cruzan con el cronograma, el presupuesto y los interesados", () => {
    const f = completo(); f.procurement.late = 2; f.quality.verified = 15; f.comms.closeUncovered = 1; f.procurement.total = 9000000;
    const by = (c: string) => integrationFindings(f).find((x) => x.code === c)!;
    expect(by("P15").text).toMatch(/2 adquisición\(es\).*vencida.*2026-08-03/); expect(by("P16").text).toMatch(/2 paquete\(s\) con criterio de aceptación sin ninguna actividad/);
    expect(by("P18").text).toMatch(/1 interesado\(s\) a gestionar de cerca sin ninguna comunicación/); expect(by("P19").text).toMatch(/9[.,]000[.,]000.*supera el BAC vigente.*8[.,]000[.,]000/);
    const g = completo(); g.quality = emptyFacts().quality; g.procurement = emptyFacts().procurement;
    const p17 = integrationFindings(g).filter((x) => x.code === "P17"); expect(p17.map((x) => x.area)).toEqual(["Calidad", "Adquisiciones"]); expect(p17[0].severity).toBe("info");
    expect(codes(emptyFacts())).toEqual([]);                                                       // sin nada que integrar no hay que avisar de planes faltantes
  });
  it("P21/P22: el alcance aprobado incluye la EDT y su diccionario: si el trabajo en edición difiere, o la línea base se congeló sin EDT, se avisa", () => {
    const f = completo(); expect(codes(f)).not.toContain("P21");
    f.scope.drift = { wbsInBaseline: true, wbsChanges: 0, enunciadoChanged: false }; expect(codes(f)).toEqual(["P13"]);            // coincide con lo aprobado: nada que avisar
    f.scope.drift = { wbsInBaseline: true, wbsChanges: 3, enunciadoChanged: true };
    const p = integrationFindings(f).find((x) => x.code === "P21")!; expect(p.severity).toBe("aviso"); expect(p.text).toMatch(/difiere de la línea base del alcance v1\.0: 3 cambio\(s\) en la EDT y su diccionario y cambios en el enunciado/);
    f.scope.drift = { wbsInBaseline: false, wbsChanges: 0, enunciadoChanged: false }; expect(integrationFindings(f).find((x) => x.code === "P22")!.text).toMatch(/se congeló sin la EDT y su diccionario/);
    f.scope.base = { has: false, version: "", date: "", approver: "" }; expect(codes(f)).not.toContain("P22");                     // sin línea base del alcance no aplica
  });
  it("P23: el Acta declara un enfoque no predictivo y la suite modela uno predictivo (sin declarar, o predictivo/cascada, no avisa)", () => {
    const f = completo(); f.charter.approach = "Ágil";
    const p = integrationFindings(f).find((x) => x.code === "P23")!; expect(p.severity).toBe("aviso"); expect(p.text).toMatch(/«Ágil».*PREDICTIVO/);
    f.charter.approach = "Híbrido"; expect(codes(f)).toContain("P23");
    ["Predictivo", "predictivo (cascada)", "Cascada", ""].forEach((a) => { f.charter.approach = a; expect(codes(f), a).not.toContain("P23"); });
    expect(codes(emptyFacts())).toEqual([]);
  });
  it("P24: el plan no declara ciclo de vida, adaptación, configuración ni proceso de cambios: los nombra uno a uno", () => {
    const f = completo(); f.approach = { lifecycle: "", tailoring: "  ", configuration: "x", changeProcess: "" };
    expect(integrationFindings(f).find((x) => x.code === "P24")!.text).toMatch(/no declara: ciclo de vida y enfoque de desarrollo; adaptación \(tailoring\); proceso de gestión de cambios\./);
    f.approach = { lifecycle: "a", tailoring: "b", configuration: "c", changeProcess: "d" }; expect(codes(f)).not.toContain("P24");
  });
  it("el enfoque declarado es un componente del plan: si cambia tras la aprobación, el plan queda con cambios sin aprobar", () => {
    expect(PLAN_COMPONENTS.map((c) => c.key)).toContain("planApproach");
    const f = completo(); f.digests = { planApproach: "h1" };
    const snap = snapshotOf(f), f2 = { ...f, digests: { planApproach: "h2" } };
    expect(snapshotDiff(snap, snapshotOf(f2))).toEqual([{ label: "Enfoque, ciclo de vida y adaptación", from: "aprobado", to: "modificado" }]);
  });
  it("P11: el pronóstico se desvía más del 10 % de la línea base", () => {
    const f = completo(); f.schedule.deviationPct = 12.34; expect(integrationFindings(f).find((x) => x.code === "P11")!.text).toMatch(/12\.3 %/);
    f.schedule.deviationPct = 9; expect(codes(f)).not.toContain("P11");
  });
});

describe("plan aprobado: instantánea y desactualización", () => {
  const aprobar = (f: PlanFacts) => { f.plan = { status: "aprobado", version: "1.0", approvedBy: "Sponsor", approvedOn: "2026-07-15", snapshot: snapshotOf(f), docPreserved: true }; return f; };
  it("la instantánea guarda las líneas base y las huellas de cada componente; un plan recién aprobado queda limpio", () => {
    const f = completo(); f.digests = { charter: "a1", quality: "q1" }; aprobar(f);
    expect(f.plan.snapshot).toEqual({ scopeVersion: "1.0", scopeDate: "2026-07-10", requirementsVersion: "1.0", scheduleVersion: "LB-1", scheduleDate: "2026-07-12", scheduleFinish: "2027-07-21", bacCurrent: 8000000, costBaseline: "", boeStatus: "aprobada", digests: { charter: "a1", quality: "q1" } });
    expect(codes(f)).toEqual([]);
  });
  it("P12: si cambian las líneas base después de aprobar, el plan queda desactualizado y dice qué cambió", () => {
    const f = aprobar(completo());
    f.cost.bacCurrent = 8090000; f.cost.baselineVersion = "LB-1"; f.schedule.base = base("LB-2", "2026-09-30"); f.schedule.finish = "2027-08-10";
    const p = integrationFindings(f).find((x) => x.code === "P12")!;
    expect(p.severity).toBe("riesgo"); expect(p.text).toMatch(/plan aprobado \(v1\.0, 2026-07-15\) tiene CAMBIOS SIN APROBAR desde su aprobación/);
    expect(p.text).toMatch(/Línea base del cronograma LB-1 → LB-2/); expect(p.text).toMatch(/Fin del cronograma 2027-07-21 → 2027-08-10/); expect(p.text).toMatch(/BAC vigente 8[.,]000[.,]000 → 8[.,]090[.,]000/); expect(p.text).toMatch(/nueva versión/);
    expect(snapshotDiff(f.plan.snapshot!, snapshotOf(f)).map((d) => d.label)).toEqual(["Línea base del cronograma", "Fin del cronograma", "BAC vigente", "Línea base de costos"]);
  });
  it("REPRO (alta): si cambia el CONTENIDO de un plan subsidiario (p. ej. la política de calidad) después de aprobar, el plan queda con cambios sin aprobar y dice cuál", () => {
    const f = completo(); f.digests = { charter: digestOf({ p: "a" }), quality: digestOf({ policy: "Política aprobada" }), comms: digestOf(null) }; aprobar(f);
    expect(codes(f)).toEqual([]);                                                              // sin cambios: limpio
    f.digests = { ...f.digests, quality: digestOf({ policy: "Política MODIFICADA después de aprobar" }) };
    const p = integrationFindings(f).find((x) => x.code === "P12")!;
    expect(p.severity).toBe("riesgo"); expect(p.text).toMatch(/Plan de Calidad aprobado → modificado/); expect(p.text).not.toMatch(/Acta de Constitución/);
    expect(snapshotDiff(f.plan.snapshot!, snapshotOf(f)).map((d) => d.label)).toEqual(["Plan de Calidad"]);
    f.digests = { ...f.digests, comms: digestOf({ items: [1] }) };                             // un plan que no existía y se creó después también cuenta
    expect(snapshotDiff(f.plan.snapshot!, snapshotOf(f)).map((d) => d.label)).toEqual(["Plan de Calidad", "Plan de Comunicaciones"]);
  });
  it("P20: aprobado antes de conservar el contenido (sin huellas o sin documento) no se puede demostrar y se avisa; los registros vivos no cuentan como cambio", () => {
    const f = completo(); f.digests = { quality: "q1" }; aprobar(f); f.plan.docPreserved = false;
    expect(integrationFindings(f).find((x) => x.code === "P20")!.text).toMatch(/antes de conservar su contenido/);
    const g = completo(); g.plan = { status: "aprobado", version: "1.0", approvedBy: "S", approvedOn: "2026-07-15", snapshot: (() => { const s = snapshotOf(g); delete s.digests; return s; })(), docPreserved: true };
    expect(codes(g)).toContain("P20");
    expect(PLAN_COMPONENTS.map((c) => c.key)).not.toContain("evm"); expect(PLAN_COMPONENTS.map((c) => c.key)).not.toContain("changes"); expect(PLAN_COMPONENTS.map((c) => c.key)).not.toContain("stakeholders");
    expect(PLAN_COMPONENTS.map((c) => c.key)).toContain("riskPlan");
  });
  it("digestOf: estable (no depende del orden de las claves), sensible a cualquier cambio de contenido y distingue tipos", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(digestOf({ a: 1, b: 2 })).toBe(digestOf({ b: 2, a: 1 })); expect(digestOf({ p: "x" })).not.toBe(digestOf({ p: "y" })); expect(digestOf({ a: 1 })).not.toBe(digestOf({ a: "1" }));
    expect(digestOf(null)).toBe(digestOf(undefined)); expect(digestOf([1, 2])).not.toBe(digestOf([2, 1])); expect(digestOf({ a: undefined, b: 1 })).toBe(digestOf({ b: 1 }));
    const seen = new Set<string>(); for (let i = 0; i < 2000; i++) seen.add(digestOf({ i, t: "texto " + i })); expect(seen.size).toBe(2000);   // sin colisiones en una muestra
  });
  it("P14: aprobado sin quién ni cuándo es un riesgo", () => {
    const f = aprobar(completo()); f.plan.approvedBy = ""; expect(integrationFindings(f).find((x) => x.code === "P14")!.severity).toBe("riesgo");
  });
  it("approvalBlockers: lo que se aprueba es el conjunto de las tres líneas base", () => {
    expect(approvalBlockers(completo())).toEqual([]);
    const f = completo(); f.scope.base = { has: false, version: "", date: "", approver: "" }; f.schedule.base = { has: false, version: "", date: "", approver: "" }; f.cost.has = false;
    expect(approvalBlockers(f)).toEqual(["falta la línea base del alcance", "falta la línea base del cronograma", "falta el presupuesto (línea base de costos)"]);
  });
});
