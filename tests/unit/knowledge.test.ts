// Gestión del Conocimiento (lecciones aprendidas): src/shared/knowledge.ts y su ejemplo DISTRIB+.
import { describe, expect, it } from "vitest";
import { blankKnowledge, knowledgeFindings, knowledgeState, nextCode, normalizeKnowledge, normalizeLesson, summary, type KFacts, type KnowledgeData } from "../../src/shared/knowledge";
import { buildSampleKnowledge, sampleKnowledgeFacts } from "../../src/shared/knowledge-sample";
import { buildSampleRisks } from "../../src/shared/risk-sample";

const facts = (): KFacts => ({ materialized: [{ code: "R-03", title: "Suelo débil" }], riskCodes: ["R-01", "R-03"], leaves: [{ id: "l1", code: "1.1", name: "Diseño" }], roles: ["Jefe de Ingeniería", "Director de Proyecto"] });
const ll = (o: Record<string, unknown>) => normalizeLesson({ id: "a", code: "LL-01", date: "2026-09-02", kind: "problema", category: "Riesgos", wbsId: "l1", riskCode: "R-03", situation: "Apareció un suelo débil", lesson: "Las calicatas no cubrieron la zona", recommendation: "Más calicatas", owner: "Jefe de Ingeniería", audience: "", status: "validada", ...o }, "a");
const data = (lessons: ReturnType<typeof ll>[], asOf = "2026-11-03"): KnowledgeData => ({ lessons, asOf, idCounter: 9 });
const codes = (d: KnowledgeData, f = facts()) => knowledgeFindings(d, f).map((x) => x.code);

describe("normalización", () => {
  it("un .json vacío se lee en blanco; valores inválidos toman su valor por omisión; código siguiente", () => {
    expect(blankKnowledge()).toEqual({ lessons: [], asOf: "", idCounter: 1 });
    expect(normalizeLesson({ kind: "x", status: "y" }, "z")).toMatchObject({ kind: "problema", status: "capturada" });
    expect(normalizeKnowledge({ lessons: [null], asOf: "mal" })).toMatchObject({ asOf: "", idCounter: 2 }); expect(nextCode([])).toBe("LL-01"); expect(nextCode([ll({ code: "LL-09" })])).toBe("LL-10");
  });
});

describe("knowledgeFindings", () => {
  it("una lección completa que cita el riesgo materializado no tiene hallazgos; sin lecciones ni riesgos materializados, nada que revisar", () => {
    const d = data([ll({})]); expect(knowledgeFindings(d, facts())).toEqual([]); expect(knowledgeState(d, facts())).toBe("verde");
    expect(knowledgeFindings(data([]), { ...facts(), materialized: [] })).toEqual([]); expect(knowledgeState(data([]), facts())).toBe("vacio");
  });
  it("REPRO K3: un riesgo MATERIALIZADO que ninguna lección cita se avisa aunque el registro esté vacío", () => {
    const f = knowledgeFindings(data([]), facts()).find((x) => x.code === "K3")!; expect(f.severity).toBe("aviso"); expect(f.text).toMatch(/R-03 «Suelo débil» se MATERIALIZÓ/);
    expect(codes(data([ll({ riskCode: "" })]))).toContain("K3"); expect(codes(data([ll({ riskCode: "r-03" })]))).not.toContain("K3");   // sin distinguir mayúsculas
  });
  it("K1: sin recomendación accionable; K2: sin situación o sin lección", () => {
    expect(knowledgeFindings(data([ll({ recommendation: "" })]), facts()).find((x) => x.code === "K1")!.text).toMatch(/QUÉ HACER distinto/);
    expect(codes(data([ll({ situation: "" })]))).toContain("K2"); expect(codes(data([ll({ lesson: " " })]))).toContain("K2");
  });
  it("K4: capturada sin validar más de 30 días a la fecha de corte; validada o reciente, no", () => {
    expect(knowledgeFindings(data([ll({ status: "capturada", date: "2026-09-02" })]), facts()).find((x) => x.code === "K4")!.text).toMatch(/hace 62 días/);
    expect(codes(data([ll({ status: "capturada", date: "2026-10-20" })]))).not.toContain("K4"); expect(codes(data([ll({ status: "capturada", date: "2026-09-02" })], "2026-09-10"))).not.toContain("K4");
  });
  it("K5: transferida sin destinatarios; K6/K7: responsable fuera del OBS, paquete o riesgo inexistentes", () => {
    expect(codes(data([ll({ status: "transferida", audience: "" })]))).toContain("K5"); expect(codes(data([ll({ status: "transferida", audience: "Oficina de proyectos" })]))).not.toContain("K5");
    expect(knowledgeFindings(data([ll({ owner: "Un tercero" })]), facts()).find((x) => x.code === "K6")!.severity).toBe("info");
    expect(codes(data([ll({ wbsId: "zz" })]))).toContain("K7"); expect(knowledgeFindings(data([ll({ riskCode: "R-99" })]), facts()).find((x) => x.code === "K7")!.text).toMatch(/R-99 que no existe/);
  });
  it("summary cuenta por estado y por tipo", () => {
    expect(summary(data([ll({}), ll({ id: "b", status: "capturada", kind: "buena_practica" })]))).toEqual({ total: 2, byStatus: { capturada: 1, validada: 1, transferida: 0 }, byKind: { buena_practica: 1, problema: 1, oportunidad: 0 } });
  });
});

describe("ejemplo DISTRIB+", () => {
  it("ocho lecciones al corte del caso; cada riesgo citado existe en el Registro y el único materializado (R-03) tiene su lección; sin hallazgos", () => {
    const d = buildSampleKnowledge(), f = sampleKnowledgeFacts(), risks = buildSampleRisks((c) => "w-" + c);
    expect(d.lessons).toHaveLength(8); expect(d.asOf).toBe("2026-11-03"); expect(f.materialized.map((r) => r.code)).toEqual(["R-03"]);
    d.lessons.filter((l) => l.riskCode).forEach((l) => expect(risks.some((r) => r.code === l.riskCode), l.code).toBe(true));
    expect(d.lessons.some((l) => l.riskCode === "R-03")).toBe(true); expect(d.lessons.every((l) => f.leaves.some((x) => x.id === l.wbsId))).toBe(true);
    expect(knowledgeFindings(d, f)).toEqual([]); expect(knowledgeFindings(d, f, "2030-01-01")).toEqual([]); expect(knowledgeState(d, f)).toBe("verde");
    expect(summary(d)).toEqual({ total: 8, byStatus: { capturada: 2, validada: 6, transferida: 0 }, byKind: { buena_practica: 4, problema: 3, oportunidad: 1 } });
  });
  it("todas dicen qué hacer distinto y sus responsables son puestos del OBS del caso", () => {
    const d = buildSampleKnowledge(), f = sampleKnowledgeFacts();
    d.lessons.forEach((l) => { expect(l.recommendation.length, l.code).toBeGreaterThan(30); expect(f.roles, l.code).toContain(l.owner); });
  });
});
