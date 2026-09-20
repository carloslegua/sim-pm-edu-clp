// Control integrado de cambios (PMBOK): evaluación de las seis áreas, autoridad que exige cada solicitud, aprobación solo con
// evaluación completa, e implementación solo cuando cada línea base afectada está realmente actualizada.
import { describe, expect, it } from "vitest";
import {
  approvalProblems, assessmentGaps, blankCr, crFindings, implementationProblems, nextCode, normalizeCr, portfolio, requiredAuthorityOf, summarize,
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
  const ok = () => facts({ orders: [orden()], mods: [{ id: "m1", code: "MOD-001", title: "Sala" }], scheduleLog: [{ version: "LB-1", date: "2026-07-06" }, { version: "LB-2", date: "2026-08-12" }] }, 10);
  it("todo actualizado: puede pasar a Implementada", () => { expect(implementationProblems(base(), ok())).toEqual([]); });
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
