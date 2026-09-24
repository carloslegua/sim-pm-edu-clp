// Basis of Estimate (AACE RP 34R-05): src/shared/boe.ts. Lógica pura.
import { describe, expect, it } from "vitest";
import { CHECKLIST_ITEMS, GROUPS, SECTIONS, TEXT_KEYS, blankBoe, boeFindings, completeness, evaluateBoe, normalizeBoe, serializeBoe, type Boe, type BoeCtx, type BoeFacts } from "../../src/shared/boe";

const ctx = (o: Partial<BoeCtx> = {}): BoeCtx => ({ classNum: 3, escalation: 0, baselineVersion: null, baselineDate: "", capex: null, total: null, ...o });
const todo: BoeFacts = { scope: true, execution: true, classification: true, coding: true, currency: true, planning: true, risks: true, contingency: true, mgmt: true, escalation: false, capex: true };
const con = (b: Boe, o: Record<string, string>): Boe => { Object.assign(b.text, o); return b; };
const ids = (l: Array<{ id: string }>) => l.map((s) => s.id);

describe("estructura (índice público de 34R-05)", () => {
  it("las secciones siguen el índice de la práctica: ids únicos, cada campo pertenece a un grupo y 3.15 se omite", () => {
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
    const grupos = new Set(GROUPS.map((g) => g.id));
    SECTIONS.forEach((s) => { expect(grupos.has(s.group), s.id).toBe(true); expect(s.title.length, s.id).toBeGreaterThan(3); expect(s.hint.length, s.id).toBeGreaterThan(20); expect(s.en.length, s.id).toBeGreaterThan(3); });
    ["3.1.1", "3.1.6", "3.2.1", "3.3.2", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.16", "3.17", "3.18", "3.19", "3.20", "3.21", "3.22.A", "3.22.B"].forEach((id) => expect(ids(SECTIONS), id).toContain(id));
    expect(ids(SECTIONS)).not.toContain("3.15");
    expect(TEXT_KEYS).toEqual(expect.arrayContaining(["date", "source", "assumptions", "exclusions", "productivity", "purpose", "boundary", "reconciliation"]));   // los cinco de siempre siguen ahí
  });
  it("cuanto más madura la clase, más secciones se exigen (5 → 1)", () => {
    const req = (c: number) => evaluateBoe(blankBoe(), { ...todo, escalation: true }, c).filter((e) => e.required).length;
    const r = [5, 4, 3, 2, 1].map(req);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
    expect(r[4]).toBe(SECTIONS.length);                              // clase 1: todas
  });
});

describe("normalizeBoe / serializeBoe", () => {
  it("un proyecto anterior solo trae los cinco campos de siempre: el resto queda vacío y el estado es borrador", () => {
    const b = normalizeBoe({ date: "2026-01-05", source: "Cotizaciones", assumptions: "A", exclusions: "E", productivity: "P" });
    expect(b.text).toMatchObject({ date: "2026-01-05", source: "Cotizaciones", assumptions: "A", exclusions: "E", productivity: "P", purpose: "", boundary: "" });
    expect(b.status).toBe("borrador"); expect(b.version).toBe("1.0"); expect(b.team).toEqual([]); expect(b.checklist.every((c) => !c.done)).toBe(true);
    expect(b.checklist.map((c) => c.id)).toEqual(CHECKLIST_ITEMS.map((c) => c.id));
  });
  it("sanea: estado inválido, fecha de aprobación inválida, filas vacías y casillas desconocidas", () => {
    const b = normalizeBoe({ status: "zzz", approvedOn: "03/07/2026", team: [{ name: " ", role: "" }, { name: "Ana", role: "Estimadora" }, "x"], refs: [{ title: "Acta", note: 1 }, {}], checklist: [{ id: "boe", done: true }, { id: "no-existe", done: true }, { id: "risk", done: "sí" }] });
    expect(b.status).toBe("borrador"); expect(b.approvedOn).toBe("");
    expect(b.team).toEqual([{ name: "Ana", role: "Estimadora" }]); expect(b.refs).toEqual([{ title: "Acta", note: "1" }]);
    expect(b.checklist.filter((c) => c.done).map((c) => c.id)).toEqual(["boe"]);            // solo `true` estricto
  });
  it("lo guardado se lee igual (ida y vuelta)", () => {
    const b = blankBoe(); con(b, { purpose: "P", date: "2026-07-01" }); b.status = "revision"; b.reviewedBy = "Rev"; b.team.push({ name: "Ana", role: "R" }); b.checklist[0].done = true;
    expect(normalizeBoe(serializeBoe(b))).toEqual(b);
    expect(serializeBoe(b)).toMatchObject({ date: "2026-07-01", purpose: "P", status: "revision" });
  });
  it("null, arreglos y valores raros dan una BOE en blanco", () => { [null, undefined, [], "x", 3].forEach((v) => expect(normalizeBoe(v)).toEqual(blankBoe())); });
});

describe("completeness — qué falta según la clase", () => {
  it("BOE en blanco, clase 5: faltan propósito, alcance, costos, supuestos y exclusiones; clasificación, moneda y contingencia quedan respaldadas por el proyecto", () => {
    const c = completeness(blankBoe(), todo, 5);
    expect(ids(c.missing)).toEqual(["3.1.1", "3.5", "3.11", "3.12"].concat([]).filter((x) => ids(c.missing).includes(x)));
    expect(ids(c.missing)).toEqual(expect.arrayContaining(["3.1.1", "3.5", "3.11", "3.12"]));
    expect(ids(c.missing)).not.toContain("3.1.6"); expect(ids(c.missing)).not.toContain("3.3.2"); expect(ids(c.missing)).not.toContain("3.16");
    expect(c.evals.find((e) => e.section.id === "3.1.6")!.state).toBe("respaldada");
    expect(c.pct).toBeLessThan(100);
  });
  it("la fecha base Y la fuente de precios son ambas necesarias en 3.5", () => {
    const soloFecha = con(blankBoe(), { date: "2026-07-01" });
    expect(ids(completeness(soloFecha, todo, 5).missing)).toContain("3.5");
    const ambas = con(blankBoe(), { date: "2026-07-01", source: "Cotizaciones" });
    expect(ids(completeness(ambas, todo, 5).missing)).not.toContain("3.5");
  });
  it("la frontera de la escalación (3.5.2) solo se exige si hay escalación y NO la respalda el proyecto: hay que escribirla", () => {
    const sin = completeness(blankBoe(), { ...todo, escalation: false }, 4), con2 = completeness(blankBoe(), { ...todo, escalation: true }, 4);
    expect(ids(sin.missing)).not.toContain("3.5.2"); expect(ids(con2.missing)).toContain("3.5.2");
    expect(ids(completeness(con(blankBoe(), { boundary: "Escalación = …" }), { ...todo, escalation: true }, 4).missing)).not.toContain("3.5.2");
  });
  it("equipo, referencias y anexo A cuentan cuando tienen contenido; una casilla marcada basta para el anexo", () => {
    const b = blankBoe();
    expect(ids(completeness(b, todo, 1).missing)).toEqual(expect.arrayContaining(["3.21", "3.22.A", "3.22.B"]));
    b.team.push({ name: "Ana", role: "" }); b.refs.push({ title: "Acta", note: "" }); b.checklist[0].done = true;
    const m = ids(completeness(b, todo, 1).missing);
    ["3.21", "3.22.A", "3.22.B"].forEach((id) => expect(m).not.toContain(id));
  });
  it("la mano de obra (3.8) se cubre con su texto o con los factores de productividad de siempre", () => {
    expect(ids(completeness(blankBoe(), todo, 2).missing)).toContain("3.8");
    expect(ids(completeness(con(blankBoe(), { productivity: "Factor 1,15" }), todo, 2).missing)).not.toContain("3.8");
  });
  it("las secciones no exigidas a la clase quedan como opcionales", () => {
    const c = completeness(blankBoe(), todo, 5);
    expect(ids(c.optionalMissing)).toEqual(expect.arrayContaining(["3.7", "3.19"]));
    expect(c.required + c.optionalMissing.length).toBeLessThanOrEqual(SECTIONS.length);
  });
});

describe("boeFindings", () => {
  const completa = (): Boe => { const b = blankBoe(); TEXT_KEYS.forEach((k) => { b.text[k] = "x"; }); b.team.push({ name: "Ana", role: "R" }); b.refs.push({ title: "Acta", note: "" }); b.checklist[0].done = true; b.preparedBy = "Ana"; return b; };
  const codes = (b: Boe, c: BoeCtx) => boeFindings(b, todo, c).map((f) => f.code);
  it("B1: aprobada con secciones exigidas sin completar; B2: aprobada sin quién ni cuándo", () => {
    const b = blankBoe(); b.status = "aprobada"; b.preparedBy = "Ana";
    const f = boeFindings(b, todo, ctx({ classNum: 5 }));
    expect(f.find((x) => x.code === "B1")!.severity).toBe("riesgo"); expect(f.find((x) => x.code === "B2")!.severity).toBe("riesgo");
    const ok = completa(); ok.status = "aprobada"; ok.approvedBy = "Sponsor"; ok.approvedOn = "2026-07-03";
    expect(codes(ok, ctx())).toEqual([]);
  });
  it("B2 (aviso): en revisión sin revisor", () => {
    const b = completa(); b.status = "revision";
    expect(boeFindings(b, todo, ctx()).find((x) => x.code === "B2")).toMatchObject({ severity: "aviso" });
    b.reviewedBy = "Jefe"; expect(codes(b, ctx())).toEqual([]);
  });
  it("B3: hay línea base de costos y la BOE sigue en borrador; B4: la BOE se aprobó antes de la última línea base", () => {
    const b = completa();
    expect(codes(b, ctx({ baselineVersion: "LB-1", baselineDate: "2026-08-10" }))).toContain("B3");
    b.status = "aprobada"; b.approvedBy = "S"; b.approvedOn = "2026-07-03";
    const f = boeFindings(b, todo, ctx({ baselineVersion: "LB-1", baselineDate: "2026-08-10" }));
    expect(f.map((x) => x.code)).toEqual(["B4"]); expect(f[0].text).toMatch(/LB-1.*2026-08-10/);
    expect(codes(b, ctx({ baselineVersion: "LB-1", baselineDate: "2026-07-03" }))).toEqual([]);         // misma fecha: no es anterior
  });
  it("B5: hay escalación en el presupuesto pero la BOE no define la frontera con contingencia y tipo de cambio", () => {
    const b = completa(); b.text.boundary = "";
    expect(codes(b, ctx({ escalation: 91000 }))).toContain("B5");
    expect(codes(b, ctx({ escalation: 0 }))).not.toContain("B5");
    b.text.boundary = "definida"; expect(codes(b, ctx({ escalation: 91000 }))).not.toContain("B5");
  });
  it("B6: el presupuesto total supera el CAPEX del Acta; B7: sin preparador; B8: faltan secciones", () => {
    const b = completa();
    expect(codes(b, ctx({ capex: 8500000, total: 8530605 }))).toEqual(["B6"]);
    expect(codes(b, ctx({ capex: 8500000, total: 8483582 }))).toEqual([]);
    expect(codes(b, ctx({ capex: null, total: 9e9 }))).toEqual([]);
    b.preparedBy = ""; expect(codes(b, ctx())).toEqual(["B7"]);
    expect(codes(blankBoe(), ctx({ classNum: 5 }))).toContain("B8");
  });
});
