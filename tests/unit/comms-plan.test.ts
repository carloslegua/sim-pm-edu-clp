// Plan de Comunicaciones: src/shared/comms-plan.ts y su ejemplo DISTRIB+.
import { describe, expect, it } from "vitest";
import { blankItem, blankPlan, channelsFor, commFindings, commState, coverage, nextCode, nextLogCode, normalizeComms, normalizeLog, type CommData, type CommFacts } from "../../src/shared/comms-plan";
import { SAMPLE_COMM_ROLES, SAMPLE_COMM_STAKEHOLDERS, buildSampleComms, sampleCommFacts } from "../../src/shared/comms-sample";

const facts = (): CommFacts => ({
  roles: ["Director de Proyecto", "Asesoría Legal"],
  stakeholders: [
    { id: "a", name: "Sponsor", quadrant: "cerca", engCurrent: 4, engDesired: 5 }, { id: "b", name: "Vecinos", quadrant: "informado", engCurrent: 2, engDesired: 4 },
    { id: "c", name: "Prensa", quadrant: "monitorear", engCurrent: 1, engDesired: 1 }
  ]
});
const item = (o: Record<string, unknown>) => ({ ...blankItem("x", "CM-01"), info: "Avance", purpose: "Alinear", sender: "Director de Proyecto", frequency: "Mensual", method: "Informe escrito", storage: "Acta", ...o });
const data = (items: ReturnType<typeof item>[]): CommData => ({ items, plan: { escalation: "48 h al PM", restrictions: "", review: "Mensual" }, idCounter: 9, log: [], asOf: "" });
const codes = (d: CommData, f = facts()) => commFindings(d, f).map((x) => x.code);

describe("normalización y utilidades", () => {
  it("un .json viejo o vacío se lee sin fallar", () => {
    expect(normalizeComms(null)).toEqual({ items: [], plan: blankPlan(), idCounter: 1, log: [], asOf: "" });
    const d = normalizeComms({ items: [{ id: "q", info: "x", stkIds: ["a", 3], frequency: "Semanal" }, null], plan: { escalation: "e" } });
    expect(d.items).toHaveLength(2); expect(d.items[0].stkIds).toEqual(["a", "3"]); expect(d.items[1].code).toBe("cm2"); expect(d.plan.escalation).toBe("e"); expect(d.idCounter).toBe(3);
  });
  it("código siguiente y canales potenciales n(n−1)/2", () => {
    expect(nextCode([])).toBe("CM-01"); expect(nextCode([blankItem("a", "CM-07"), blankItem("b", "CM-02")])).toBe("CM-08");
    expect(channelsFor(12)).toBe(66); expect(channelsFor(1)).toBe(0); expect(channelsFor(0)).toBe(0);
  });
});

describe("commFindings", () => {
  it("una matriz completa y sin brechas no tiene hallazgos", () => {
    const d = data([item({ id: "1", stkIds: ["a", "c"], frequency: "Mensual" }), item({ id: "2", code: "CM-02", stkIds: ["b"], frequency: "Quincenal" })]);
    expect(commFindings(d, facts())).toEqual([]); expect(commState(d, facts())).toBe("verde");
  });
  it("M1: interesado a gestionar de cerca sin comunicación es un riesgo; M2: con brecha de compromiso, aviso; M3: sin brecha, info", () => {
    const d = data([item({ id: "1", stkIds: [] , audience: "equipo" })]), f = commFindings(d, facts());
    expect(f.find((x) => x.code === "M1")!.severity).toBe("riesgo"); expect(f.find((x) => x.code === "M2")!.text).toMatch(/Vecinos.*2 al 4/); expect(f.find((x) => x.code === "M3")!.text).toMatch(/Prensa/);
    expect(commState(d, facts())).toBe("rojo");
  });
  it("M2: brecha de 2 o más niveles atendida solo con comunicaciones puntuales", () => {
    const d = data([item({ id: "1", stkIds: ["a", "c"] }), item({ id: "2", stkIds: ["b"], frequency: "Única vez" })]);
    expect(commFindings(d, facts()).find((x) => x.code === "M2")!.text).toMatch(/Vecinos.*2 niveles.*puntuales/);
    d.items[1].frequency = "Mensual"; expect(codes(d)).not.toContain("M2");
  });
  it("M4–M9: información o propósito, destinatarios, interesado inexistente, emisor, frecuencia/medio, registro", () => {
    const c = codes(data([item({ id: "1", info: "", stkIds: [] }), item({ id: "2", stkIds: ["zz"], sender: "" }), item({ id: "3", stkIds: ["a"], sender: "Chofer", frequency: "", storage: "" })]));
    ["M4", "M5", "M6", "M7", "M8", "M9"].forEach((k) => expect(c, k).toContain(k));
    const m7 = commFindings(data([item({ id: "3", stkIds: ["a", "b", "c"], sender: "Chofer" })]), facts()).find((x) => x.code === "M7")!; expect(m7.severity).toBe("info"); expect(m7.text).toMatch(/no figura entre los puestos del OBS/);
  });
  it("M10: sobrecomunicar a quien solo se monitorea; M11/M12: el plan sin escalamiento ni revisión", () => {
    const d = data([item({ id: "1", stkIds: ["a", "b", "c"], frequency: "Semanal" })]);
    expect(commFindings(d, facts()).find((x) => x.code === "M10")!.text).toMatch(/Prensa.*se sobrecomunica/);
    d.plan = blankPlan(); expect(codes(d)).toEqual(expect.arrayContaining(["M11", "M12"]));
  });
  it("sin destinatarios registrados en el proyecto (lista vacía) no marca M6, y sin comunicaciones el estado es vacío", () => {
    expect(codes(data([item({ id: "1", stkIds: ["z"] })]), { stakeholders: [], roles: [] })).not.toContain("M6");
    expect(commState(data([]), facts())).toBe("vacio");
  });
  it("coverage cuenta las comunicaciones y la brecha de cada interesado", () => {
    const r = coverage([item({ id: "1", stkIds: ["a"] })], facts());
    expect(r.map((x) => x.items.length)).toEqual([1, 0, 0]); expect(r.map((x) => x.gap)).toEqual([1, 2, 0]);
  });
});

describe("ejemplo DISTRIB+", () => {
  it("11 comunicaciones que cubren a los 12 interesados del caso, con emisores del OBS, y el plan queda en orden", () => {
    const d = buildSampleComms(), f = sampleCommFacts();
    expect(d.items).toHaveLength(11); expect(d.log).toHaveLength(12); expect(d.idCounter).toBe(24);
    expect(SAMPLE_COMM_STAKEHOLDERS.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12"]);
    const cubiertos = new Set(d.items.flatMap((c) => c.stkIds)); expect(cubiertos.size).toBe(12);
    expect(d.items.every((c) => SAMPLE_COMM_ROLES.indexOf(c.sender) >= 0)).toBe(true);
    expect(commFindings(d, f)).toEqual([]); expect(commState(d, f)).toBe("verde");
  });
  it("cada estrategia de compromiso del caso tiene su comunicación con la frecuencia que ya dice Stakeholder Studio", () => {
    const by = (code: string) => buildSampleComms().items.find((c) => c.code === code)!;
    expect(by("CM-01").frequency).toBe("Quincenal"); expect(by("CM-01").stkIds).toEqual(["s1"]);        // reunión de avance quincenal con el sponsor
    expect(by("CM-02").frequency).toBe("Mensual"); expect(by("CM-02").stkIds).toContain("s2");          // informe mensual al banco
    expect(by("CM-03").frequency).toBe("Semanal"); expect(by("CM-03").sender).toBe("Asesoría Legal");    // seguimiento semanal de la licencia (2.4)
    expect(by("CM-04").frequency).toBe("Mensual"); expect(by("CM-05").frequency).toBe("Quincenal");
    expect(by("CM-06").frequency).toBe("Semanal"); expect(by("CM-06").sender).toBe("Jefe de Logística"); // fabricación 3.1
  });
});

describe("bitácora de comunicaciones emitidas (ejecución)", () => {
  const lg = (o: Record<string, unknown>) => normalizeLog({ id: "l", code: "LG-01", itemId: "1", date: "2026-11-01", status: "emitida", by: "Director de Proyecto", summary: "Avance", evidence: "Acta", ...o }, "l");
  const base = (log: ReturnType<typeof lg>[], asOf = "2026-11-03") => ({ ...data([item({ id: "1", stkIds: ["a"], frequency: "Quincenal" }), item({ id: "2", code: "CM-02", stkIds: ["b", "c"], frequency: "Por hito" })]), log, asOf });
  it("un .json sin bitácora se lee en blanco; código siguiente; estado y fecha inválidos se corrigen", () => {
    expect(normalizeComms({ items: [] }).log).toEqual([]); expect(normalizeComms({ items: [] }).asOf).toBe(""); expect(nextLogCode([])).toBe("LG-01"); expect(nextLogCode([lg({ code: "LG-04" })])).toBe("LG-05");
    expect(normalizeLog({ status: "rara" }, "x").status).toBe("emitida"); expect(normalizeComms({ asOf: "ayer" }).asOf).toBe("");
  });
  it("sin bitácora no hay hallazgos de ejecución (aún no empezó)", () => { expect(codes(base([]))).not.toEqual(expect.arrayContaining(["M13", "M14", "M15", "M16"])); });
  it("REPRO M16: la comunicación quincenal sin emitir en más de dos períodos (30 d) se avisa con la fecha de corte; una reciente no", () => {
    const viejo = commFindings(base([lg({ date: "2026-09-20" })]), facts()).find((x) => x.code === "M16")!; expect(viejo.severity).toBe("aviso"); expect(viejo.text).toMatch(/quincenal.*2026-09-20 \(hace 44 días\).*2026-11-03/);
    expect(codes(base([lg({ date: "2026-10-20" })]))).not.toContain("M16");
    expect(commFindings(base([lg({ itemId: "2" })]), facts()).find((x) => x.code === "M16")!.text).toMatch(/no hay ninguna emitida/);   // hay bitácora pero ninguna de la quincenal
  });
  it("M15: el interesado a gestionar de cerca sin comunicación emitida en 45 días; solo cuenta lo EMITIDO", () => {
    const f = facts();
    expect(commFindings(base([lg({ date: "2026-09-01" })]), f).find((x) => x.code === "M15")!.text).toMatch(/Sponsor.*2026-09-01.*63 días/);
    expect(commFindings(base([lg({ date: "2026-10-30", status: "reprogramada", summary: "por agenda" })]), f).some((x) => x.code === "M15")).toBe(true);   // reprogramada no cuenta
    expect(commFindings(base([lg({ date: "2026-10-30" })]), f).some((x) => x.code === "M15")).toBe(false);
  });
  it("M13/M14: entrada sin comunicación del plan, omitida o reprogramada sin motivo, emitida sin evidencia", () => {
    expect(codes(base([lg({ itemId: "zz" })]))).toContain("M13");
    expect(commFindings(base([lg({ status: "omitida", summary: "" })]), facts()).find((x) => x.code === "M14")!.text).toMatch(/omitida y no dice por qué/);
    expect(commFindings(base([lg({ evidence: "" })]), facts()).find((x) => x.code === "M14")!.severity).toBe("info");
  });
  it("la fecha de corte del plan manda sobre el reloj", () => { expect(codes(base([lg({ date: "2026-09-20" })], "2026-10-01"))).not.toContain("M16"); });
});
