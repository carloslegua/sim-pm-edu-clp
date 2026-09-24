// Control integrado de cambios (PMBOK): evaluación de las seis áreas, autoridad que exige cada solicitud, aprobación solo con
// evaluación completa, e implementación solo cuando cada línea base afectada está realmente actualizada.
import { describe, expect, it } from "vitest";
import {
  approvalProblems, assessmentGaps, blankCr, crFindings, implementationProblems, modFacts, nextCode, normalizeCr, portfolio, requiredAuthorityOf, summarize,
  AREAS, type Area, type AreaState, type ChangeFacts, type ChangeRequest
} from "../../src/shared/change-control";

const POL = { pmLimit: 50000, ccbLimit: 250000, contAlertPct: 25 };
const facts = (o: Partial<ChangeFacts> = {}, delay: number | null = 0): ChangeFacts => ({
  orders: [], mods: [], risks: [], scheduleLog: [], policy: POL, projectDelay: delay === null ? null : () => delay, ...o
});
// SC con las seis áreas evaluadas: `con` = áreas con impacto; el resto, sin impacto
const cr = (con: Area[] = [], o: Partial<ChangeRequest> = {}): ChangeRequest => {
  const c = { ...blankCr("c1", "CR-001"), title: "Cambio", requester: "Cliente", origin: "Solicitud del cliente", approver: "CCB", rationale: "Justificado", ...o };
  AREAS.forEach((a) => { c.impact[a] = { state: (con.indexOf(a) >= 0 ? "con_impacto" : "sin_impacto") as AreaState, note: con.indexOf(a) >= 0 ? "detalle" : "" }; });
  return c;
};

describe("normalización y numeración", () => {
  it("tolerante con datos incompletos o basura; sin evaluar por omisión", () => {
    const c = normalizeCr({ id: "x", status: "inventado", impact: { cost: { state: "con_impacto", note: 5 }, scope: { state: "raro" } }, wbsIds: ["a", "", 3], costDelta: "1500", daysDelta: "x" }, "f");
    expect(c).toMatchObject({ id: "x", code: "x", status: "Pendiente", wbsIds: ["a", "3"], costDelta: 1500, daysDelta: null });
    expect(c.impact.cost).toEqual({ state: "con_impacto", note: "5" }); expect(c.impact.scope.state).toBe("sin_evaluar");
    expect(AREAS.every((a) => normalizeCr(null, "f").impact[a].state === "sin_evaluar")).toBe(true);
  });
  it("numeración correlativa", () => {
    expect(nextCode([])).toBe("CR-001"); expect(nextCode([blankCr("a", "CR-007"), blankCr("b", "CR-002")])).toBe("CR-008");
  });
});

describe("evaluación integrada de impacto", () => {
  it("una solicitud recién creada no tiene ninguna de las seis áreas evaluadas", () => {
    expect(assessmentGaps(blankCr("a", "CR-001"))).toHaveLength(6);
  });
  it("con impacto exige detalle: nota, monto y fuente de fondos, paquetes y días, y los riesgos afectados", () => {
    const c = cr(); c.impact.cost = { state: "con_impacto", note: "" }; c.impact.schedule = { state: "con_impacto", note: "" }; c.impact.quality = { state: "con_impacto", note: "" }; c.impact.risk = { state: "con_impacto", note: "" };
    const g = assessmentGaps(c);
    expect(g).toEqual(expect.arrayContaining(["describe el impacto en calidad", "cuantifica el Δ costo (monto distinto de cero)", "cuantifica el efecto en el plazo: paquetes o actividades afectadas y los días", "indica los riesgos afectados o los nuevos riesgos"]));
    c.costDelta = 5000; c.fund = "Contingencia"; c.daysDelta = 4; c.wbsIds = ["w1"]; c.riskIds = ["r1"]; c.impact.quality.note = "x";
    expect(assessmentGaps(c)).toEqual([]);
  });
});

describe("qué líneas base cambian", () => {
  it("alcance con impacto → MOD; el fin del proyecto se mueve → línea base del cronograma; reserva de gestión o fondos adicionales → línea base de costos", () => {
    const s = summarize(cr(["scope", "schedule", "cost"], { costDelta: 90000, fund: "Reserva de gestión", daysDelta: 5, wbsIds: ["w"] }), facts({}, 5));
    expect(s.baselines).toEqual({ scope: true, schedule: true, cost: true }); expect(s.projectDelay).toBe(5);
    expect(s.reasons.join(" ")).toMatch(/modificación de alcance.*mueve el fin del proyecto \+5 d.*reserva de gestión/);
  });
  it("con contingencia el costo NO cambia la línea base (la contingencia ya está dentro de ella); un retraso absorbido por la holgura tampoco mueve el cronograma", () => {
    const s = summarize(cr(["cost", "schedule"], { costDelta: 30000, fund: "Contingencia", daysDelta: 3, wbsIds: ["w"] }), facts({}, 0));
    expect(s.baselines).toEqual({ scope: false, schedule: false, cost: false });
    expect(s.reasons.join(" ")).toMatch(/contingencia: dentro de la línea base/);
  });
});

describe("autoridad que exige", () => {
  it("sin cambio de línea base ni costo, basta el Director de Proyecto", () => { expect(requiredAuthorityOf(cr(), facts()).level).toBe("pm"); });
  it("cualquier cambio de línea base lo aprueba el CCB", () => {
    expect(requiredAuthorityOf(cr(["scope"]), facts()).level).toBe("ccb");
    expect(requiredAuthorityOf(cr(["schedule"], { daysDelta: 9, wbsIds: ["w"] }), facts({}, 9)).level).toBe("ccb");
  });
  it("contingencia: los tramos de la política de reservas; reserva de gestión y fondos adicionales, el sponsor", () => {
    const con = (m: number, fund = "Contingencia") => requiredAuthorityOf(cr(["cost"], { costDelta: m, fund }), facts()).level;
    expect([con(30000), con(180000), con(300000)]).toEqual(["pm", "ccb", "sponsor"]);
    expect(con(1000, "Reserva de gestión")).toBe("sponsor"); expect(con(1000, "Financiamiento adicional")).toBe("sponsor");
    expect(requiredAuthorityOf(cr(["cost"], { costDelta: 30000, fund: "Contingencia" }), facts({ policy: null })).level).toBe("pm");   // sin política por montos
  });
  it("el más exigente manda: un cambio pequeño de costo que además cambia el plazo de la línea base sigue siendo del CCB", () => {
    expect(requiredAuthorityOf(cr(["cost", "schedule"], { costDelta: 10000, fund: "Contingencia", daysDelta: 5, wbsIds: ["w"] }), facts({}, 5)).level).toBe("ccb");
  });
});

describe("aprobar", () => {
  it("una solicitud completa, con fundamento y con la autoridad que corresponde, puede aprobarse", () => {
    expect(approvalProblems(cr(["cost"], { costDelta: 30000, fund: "Contingencia", approver: "Director de Proyecto" }), facts())).toEqual([]);
    expect(approvalProblems(cr(["cost"], { costDelta: 180000, fund: "Contingencia", approver: "CCB" }), facts())).toEqual([]);
  });
  it("sin evaluar las seis áreas, sin decisor o sin fundamento NO se aprueba", () => {
    const p = approvalProblems({ ...blankCr("a", "CR-001"), title: "T", requester: "Q", origin: "Otro" }, facts());
    expect(p.filter((x) => /falta evaluar/.test(x))).toHaveLength(6); expect(p).toEqual(expect.arrayContaining(["registra quién decide (CCB, sponsor…)", "documenta el fundamento de la decisión"]));
  });
  it("por encima de la autoridad de quien decide: dice quién debe decidir y por qué", () => {
    const p = approvalProblems(cr(["cost"], { costDelta: 180000, fund: "Contingencia", approver: "Director de Proyecto" }), facts());
    expect(p).toHaveLength(1); expect(p[0]).toMatch(/la autoriza el CCB \(monto con cargo a contingencia según la política de reservas\).*la decisión registrada es del Director de Proyecto/);
    expect(approvalProblems(cr(["cost"], { costDelta: 1000, fund: "Reserva de gestión", approver: "CCB" }), facts())[0]).toMatch(/la autoriza el Sponsor/);
    expect(approvalProblems(cr(["cost"], { costDelta: 1000, fund: "Reserva de gestión", approver: "Juan", authLevel: "sponsor" }), facts())).toEqual([]);   // el nivel explícito manda
  });
});

describe("implementar: cada línea base afectada debe estar realmente actualizada", () => {
  const orden = (o: Record<string, unknown> = {}) => ({ id: "OC-002", cost: 240000, fund: "Financiamiento adicional", status: "Aprobada", baselined: "LB-1", ...o });
  const base = () => cr(["scope", "schedule", "cost"], { costDelta: 240000, fund: "Financiamiento adicional", daysDelta: 10, wbsIds: ["w"], status: "Aprobada", decidedOn: "2026-08-10", orderIds: ["OC-002"], modIds: ["m1"], scheduleBaseline: "LB-2" });
  // una MOD aprobada, que responde a CR-001 y cuyos 2 requisitos están en la línea base de requisitos v2.0 (posterior a la decisión)
  const mod = (o: Record<string, unknown> = {}, ev: Record<string, unknown> = {}) => ({ id: "m1", code: "MOD-001", title: "Sala", status: "aprobado", approver: "CCB", ccrRef: "CR-001", evidence: { baselineFrozen: true, baselineVersion: "2.0", baselineDate: "2026-09-30", affected: 2, incorporated: 2, ...ev }, ...o });
  const ok = () => facts({ orders: [orden()], mods: [mod()], scheduleLog: [{ version: "LB-1", date: "2026-07-06" }, { version: "LB-2", date: "2026-08-12" }] }, 10);
  it("todo actualizado: puede pasar a Implementada", () => { expect(implementationProblems(base(), ok())).toEqual([]); });
  it("REPRO (media): una solicitud aprobada vinculada a una modificación RECHAZADA ya no puede marcarse implementada", () => {
    const p = implementationProblems(base(), { ...ok(), mods: [mod({ status: "rechazado" })] });
    expect(p).toHaveLength(1); expect(p[0]).toMatch(/MOD-001 está «Rechazada»: no puede respaldar un cambio de alcance aprobado/);
  });
  it("la modificación debe estar aprobada (no propuesta ni en evaluación) y registrar quién la aprobó; «implementada» también sirve", () => {
    expect(implementationProblems(base(), { ...ok(), mods: [mod({ status: "propuesto" })] })[0]).toMatch(/MOD-001 está «Propuesta»: apruébala en Recopilar Requisitos/);
    expect(implementationProblems(base(), { ...ok(), mods: [mod({ status: "enEvaluacion" })] })[0]).toMatch(/«En evaluación»/);
    expect(implementationProblems(base(), { ...ok(), mods: [mod({ approver: " " })] })[0]).toMatch(/no registra quién la aprobó/);
    expect(implementationProblems(base(), { ...ok(), mods: [mod({ status: "implementado" })] })).toEqual([]);
  });
  it("correspondencia con la solicitud: la MOD debe citar ESTA solicitud (campo CCR); vacío o de otra solicitud es un impedimento", () => {
    expect(implementationProblems(base(), { ...ok(), mods: [mod({ ccrRef: "" })] })[0]).toMatch(/no cita esta solicitud: escribe «CR-001» en su campo de solicitud de cambio \(CCR\)/);
    expect(implementationProblems(base(), { ...ok(), mods: [mod({ ccrRef: "CR-002" })] })[0]).toMatch(/responde a la solicitud «CR-002», no a CR-001/);
    expect(implementationProblems(base(), { ...ok(), mods: [mod({ ccrRef: " cr-001 " })] })).toEqual([]);                         // sin distinguir mayúsculas ni espacios
  });
  it("evidencia de incorporación: la MOD debe afectar requisitos y estar TAL CUAL en la línea base de requisitos vigente, fijada después de la decisión", () => {
    expect(implementationProblems(base(), { ...ok(), mods: [mod({}, { baselineFrozen: false })] })[0]).toMatch(/línea base de requisitos no está congelada/);
    expect(implementationProblems(base(), { ...ok(), mods: [mod({}, { affected: 0, incorporated: 0 })] })[0]).toMatch(/no afecta ningún requisito: no hay evidencia de que el alcance cambió/);
    expect(implementationProblems(base(), { ...ok(), mods: [mod({}, { incorporated: 1 })] })[0]).toMatch(/solo 1 de 2 requisito\(s\) de MOD-001 están tal cual en la línea base de requisitos v2\.0/);
    expect(implementationProblems(base(), { ...ok(), mods: [mod({}, { baselineDate: "2026-08-01" })] })[0]).toMatch(/línea base de requisitos v2\.0 \(2026-08-01\) es anterior a la decisión \(2026-08-10\)/);
  });
  it("una MOD vinculada que ya no existe se avisa; con varias MOD, cada una debe cumplir", () => {
    expect(implementationProblems({ ...base(), modIds: ["m1", "m9"] }, ok())).toEqual(["vincula una modificación de alcance que ya no existe en Recopilar Requisitos"]);
    const f = { ...ok(), mods: [mod(), mod({ id: "m2", code: "MOD-002", status: "rechazado" })] };
    expect(implementationProblems({ ...base(), modIds: ["m1", "m2"] }, f)).toEqual([expect.stringMatching(/MOD-002 está «Rechazada»/)]);
  });
  it("falta cada eslabón: la MOD, la OC, la incorporación a la línea base de costos y la versión del cronograma", () => {
    const sinNada = { ...base(), orderIds: [], modIds: [], scheduleBaseline: "" };
    expect(implementationProblems(sinNada, ok())).toEqual(expect.arrayContaining([
      "registra la modificación de alcance en Recopilar Requisitos y vincúlala (MOD)", "registra la orden de cambio en Costos y vincúlala (OC)", "fija en Cronograma/CPM la nueva versión de la línea base e indica cuál (LB-n)"]));
    expect(implementationProblems(base(), ok().orders.length ? { ...ok(), orders: [orden({ baselined: null })] } : ok())[0]).toMatch(/usa financiamiento adicional y aún no está incorporada a la línea base de costos/);
    expect(implementationProblems(base(), { ...ok(), orders: [orden({ status: "Pendiente" })] })[0]).toMatch(/está «Pendiente»: aprueba la orden en Costos/);
    expect(implementationProblems(base(), { ...ok(), orders: [orden({ cost: 100000 })] })[0]).toMatch(/suman 100000 y el Δ costo de la solicitud es 240000/);
  });
  it("la versión de la línea base debe existir y ser posterior a la decisión", () => {
    expect(implementationProblems({ ...base(), scheduleBaseline: "LB-9" }, ok())[0]).toMatch(/LB-9 no existe/);
    expect(implementationProblems({ ...base(), decidedOn: "2026-09-01" }, ok())[0]).toMatch(/es anterior a la decisión/);
  });
  it("con contingencia no se exige incorporar a la línea base de costos, pero sí la orden aprobada", () => {
    const c = cr(["cost"], { costDelta: 30000, fund: "Contingencia", orderIds: ["OC-001"], status: "Aprobada" });
    expect(implementationProblems(c, facts({ orders: [{ id: "OC-001", cost: 30000, fund: "Contingencia", status: "Aprobada", baselined: null }] }))).toEqual([]);
    expect(implementationProblems(c, facts())[0]).toMatch(/registra la orden de cambio en Costos/);
  });
});

describe("modFacts: la evidencia sale de la rama de Requisitos", () => {
  const item = (id: string, text: string, changeId: string | null, extra: Record<string, unknown> = {}) => ({ id, text, type: "funcional", priority: "must", status: "aprobado", acceptanceCriteria: "ok", verificationMethod: "inspeccion", wbsNodeIds: ["w2", "w1"], sourceRanIds: [], normativeBasis: "", changeId, ...extra });
  const req = (items: unknown[], snapshot: unknown[], frozen = true) => ({ baseline: { frozen, version: "2.0", date: "2026-09-30", snapshot }, items, changes: [{ id: "m1", code: "MOD.01", summary: "Sala", status: "aprobado", approver: "CCB", ccrRef: "CR-002" }] });
  it("requisitos de la MOD incorporados = están en la instantánea de la línea base con el mismo contenido (el orden de los vínculos no importa)", () => {
    const a = item("r1", "Dos tableros", "m1"), b = item("r2", "Cableado", "m1");
    const f = modFacts(req([a, b, item("r3", "Otro", null)], [{ ...a, wbsNodeIds: ["w1", "w2"] }, b]))[0];
    expect(f).toMatchObject({ id: "m1", code: "MOD.01", title: "Sala", status: "aprobado", approver: "CCB", ccrRef: "CR-002" });
    expect(f.evidence).toEqual({ baselineFrozen: true, baselineVersion: "2.0", baselineDate: "2026-09-30", affected: 2, incorporated: 2 });
  });
  it("un requisito agregado o editado DESPUÉS de congelar la línea base no cuenta como incorporado", () => {
    const a = item("r1", "Dos tableros", "m1"), b = item("r2", "Cableado", "m1");
    expect(modFacts(req([a, b], [a]))[0].evidence).toMatchObject({ affected: 2, incorporated: 1 });                                        // b no está en la línea base
    expect(modFacts(req([{ ...a, text: "Dos tableros y un UPS" }, b], [a, b]))[0].evidence).toMatchObject({ affected: 2, incorporated: 1 });   // a se editó después
  });
  it("tolerante: sin rama de requisitos o con datos raros; la MOD sin estado es «propuesta»", () => {
    expect(modFacts(null)).toEqual([]); expect(modFacts({ changes: [null, { id: "m" }] })).toHaveLength(1);
    expect(modFacts({ changes: [{ id: "m" }] })[0]).toMatchObject({ status: "propuesto", approver: "", ccrRef: "", evidence: { baselineFrozen: false, affected: 0, incorporated: 0 } });
  });
});

describe("seguimiento y cartera", () => {
  it("pendiente hace más de 14 días (C1); aprobada sin implementar (C3); origen riesgo sin riesgo (C5); «sin impacto» en plazo que el CPM contradice (C6)", () => {
    const codes = (c: ChangeRequest, f = facts()) => crFindings(c, f, "2026-09-20").map((x) => x.code);
    expect(codes(cr([], { status: "Pendiente", requestedOn: "2026-08-01" }))).toContain("C1");
    expect(codes(cr([], { status: "Pendiente", requestedOn: "2026-09-15" }))).not.toContain("C1");
    expect(codes(cr(["scope"], { status: "Aprobada", decidedOn: "2026-09-01" }))).toContain("C3");
    expect(codes(cr([], { origin: "Riesgo materializado" }))).toContain("C5");
    expect(codes(cr([], { daysDelta: 5, wbsIds: ["w"] }), facts({}, 5))).toContain("C6");
  });
  it("cartera: por estado, costo y días aprobados, y aprobadas con líneas base pendientes", () => {
    const a = cr(["cost"], { costDelta: 100, fund: "Contingencia", status: "Implementada" }), b = cr(["scope"], { status: "Aprobada" }), c = cr([], { status: "Pendiente", requestedOn: "2026-09-01" });
    const p = portfolio([a, b, c], facts({}, 4), "2026-09-20");
    expect(p.byStatus).toMatchObject({ Implementada: 1, Aprobada: 1, Pendiente: 1 });
    expect(p.approvedCost).toBe(100); expect(p.approvedDays).toBe(8); expect(p.pendingBaseline).toBe(1); expect(p.oldestPendingDays).toBe(19);
  });
});
