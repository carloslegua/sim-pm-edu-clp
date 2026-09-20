// Matriz de evaluación del compromiso (auditoría metodológica PMI): el Panel anunciaba una
// "matriz de compromiso" en Stakeholder Studio que no existía. Compromiso ACTUAL vs DESEADO,
// brecha, prioridad ponderada por poder y hallazgos de coherencia.
import { describe, expect, it } from "vitest";
import {
  approachHint, asLevel, engagementFindings, engagementGap, engagementPriority, engagementSummary,
  levelName, quadrantOf, rankByPriority, ENG_LEVELS, type EngStakeholder
} from "../../src/shared/stakeholder-engagement";

const S = (o: Partial<EngStakeholder> = {}): EngStakeholder => ({ name: "X", power: 80, interest: 80, ...o });
const codes = (s: EngStakeholder, today?: string) => engagementFindings(s, today).map((f) => f.code);

describe("niveles y brecha", () => {
  it("son los 5 niveles de PMI, en orden", () => expect(ENG_LEVELS.map((l) => l.t)).toEqual(["Desconocedor", "Reticente", "Neutral", "Partidario", "Líder"]));
  it("solo 1..5 enteros son niveles; vacío, 0, NaN, texto o decimales = sin evaluar (nunca se inicializa un nivel)", () => {
    expect([asLevel(1), asLevel(5), asLevel("3"), asLevel(" 4 ")]).toEqual([1, 5, 3, 4]);
    expect([asLevel(0), asLevel(6), asLevel(2.5), asLevel(""), asLevel(null), asLevel(undefined), asLevel(NaN), asLevel("x")]).toEqual([null, null, null, null, null, null, null, null]);
    expect(levelName(undefined)).toBe("Sin evaluar");
    expect(levelName(2)).toBe("Reticente");
  });
  it("brecha = deseado − actual; null si falta alguno", () => {
    expect(engagementGap(S({ engCurrent: 2, engDesired: 4 }))).toBe(2);
    expect(engagementGap(S({ engCurrent: 4, engDesired: 4 }))).toBe(0);
    expect(engagementGap(S({ engCurrent: 5, engDesired: 3 }))).toBe(-2);
    expect(engagementGap(S({ engCurrent: 2 }))).toBeNull();
    expect(engagementGap(S())).toBeNull();
  });
  it("cuadrante poder–interés (mismo umbral 50 que la matriz)", () => {
    expect(quadrantOf(50, 50)).toBe("cerca");
    expect(quadrantOf(80, 20)).toBe("satisfecho");
    expect(quadrantOf(20, 80)).toBe("informado");
    expect(quadrantOf(49, 49)).toBe("monitorear");
  });
});

describe("prioridad = brecha × poder/100", () => {
  it("una brecha en alguien con poder pesa más que la misma brecha en alguien sin poder", () => {
    const alto = engagementPriority(S({ power: 90, engCurrent: 2, engDesired: 4 }))!, bajo = engagementPriority(S({ power: 10, engCurrent: 2, engDesired: 4 }))!;
    expect(alto).toEqual({ score: 1.8, level: "alta" });
    expect(bajo).toEqual({ score: 0.2, level: "baja" });
  });
  it("umbrales: ≥1,5 alta, ≥0,75 media, resto baja", () => {
    expect(engagementPriority(S({ power: 75, engCurrent: 3, engDesired: 5 }))!.level).toBe("alta");   // 2 × 0,75 = 1,5
    expect(engagementPriority(S({ power: 75, engCurrent: 3, engDesired: 4 }))!.level).toBe("media");  // 0,75
    expect(engagementPriority(S({ power: 70, engCurrent: 3, engDesired: 4 }))!.level).toBe("baja");   // 0,70
  });
  it("sin brecha positiva o sin evaluar no hay prioridad", () => {
    expect(engagementPriority(S({ engCurrent: 4, engDesired: 4 }))).toBeNull();
    expect(engagementPriority(S({ engCurrent: 5, engDesired: 3 }))).toBeNull();
    expect(engagementPriority(S())).toBeNull();
  });
  it("rankByPriority ordena de mayor a menor y deja fuera a quienes no tienen brecha", () => {
    const l = [S({ name: "a", power: 20, engCurrent: 1, engDesired: 4 }), S({ name: "b", power: 90, engCurrent: 2, engDesired: 4 }), S({ name: "c", engCurrent: 4, engDesired: 4 }), S({ name: "d" })];
    expect(rankByPriority(l).map((r) => r.s.name)).toEqual(["b", "a"]);
  });
});

describe("hallazgos de coherencia", () => {
  it("E1 sin evaluar: aviso si el interesado tiene poder alto, info si no; nada más se evalúa", () => {
    expect(engagementFindings(S())).toEqual([{ code: "E1", severity: "aviso", text: expect.stringMatching(/Sin evaluar .*poder alto/) }]);
    expect(engagementFindings(S({ power: 10, interest: 10 }))[0]).toMatchObject({ code: "E1", severity: "info" });
    expect(codes(S({ engCurrent: 2 }))).toEqual(["E1"]);
  });
  it("E3 brecha sin estrategia: aviso con brecha 1, RIESGO con brecha ≥ 2; con estrategia desaparece", () => {
    const b1 = engagementFindings(S({ engCurrent: 3, engDesired: 4, engOwner: "PM" })).find((f) => f.code === "E3")!;
    const b2 = engagementFindings(S({ engCurrent: 2, engDesired: 4, engOwner: "PM" })).find((f) => f.code === "E3")!;
    expect([b1.severity, b2.severity]).toEqual(["aviso", "riesgo"]);
    expect(codes(S({ engCurrent: 3, engDesired: 4, engOwner: "PM", engStrategy: "Reunión mensual" }))).not.toContain("E3");
  });
  it("E4 brecha sin responsable", () => {
    expect(codes(S({ engCurrent: 3, engDesired: 4, engStrategy: "x" }))).toContain("E4");
    expect(codes(S({ engCurrent: 3, engDesired: 4, engStrategy: "x", engOwner: "PM" }))).not.toContain("E4");
  });
  it("E5 a gestionar de cerca con nivel deseado menor que Partidario", () => {
    expect(codes(S({ engCurrent: 3, engDesired: 3 }))).toContain("E5");
    expect(codes(S({ engCurrent: 3, engDesired: 4, engStrategy: "x", engOwner: "PM" }))).not.toContain("E5");
    expect(codes(S({ power: 10, interest: 10, engCurrent: 3, engDesired: 3 }))).not.toContain("E5");
  });
  it("E6 poder alto con postura reticente o desconocedora es un RIESGO", () => {
    const f = engagementFindings(S({ power: 70, engCurrent: 2, engDesired: 4, engStrategy: "x", engOwner: "PM" })).find((x) => x.code === "E6")!;
    expect(f.severity).toBe("riesgo");
    expect(f.text).toMatch(/Reticente/);
    expect(codes(S({ power: 30, engCurrent: 2, engDesired: 4, engStrategy: "x", engOwner: "PM" }))).not.toContain("E6");
    expect(codes(S({ power: 70, engCurrent: 3, engDesired: 4, engStrategy: "x", engOwner: "PM" }))).not.toContain("E6");
  });
  it("E2 nivel deseado menor que el actual: se pide confirmar", () => {
    expect(codes(S({ engCurrent: 5, engDesired: 3 }))).toContain("E2");
  });
  it("E7 evaluación vieja: solo con fecha de hoy y de evaluación válidas", () => {
    const base = S({ engCurrent: 4, engDesired: 4, engAssessedOn: "2026-01-01" });
    expect(codes(base, "2026-06-01")).toContain("E7");
    expect(codes(base, "2026-02-01")).not.toContain("E7");
    expect(codes(base)).not.toContain("E7");
    expect(codes({ ...base, engAssessedOn: "basura" }, "2026-06-01")).not.toContain("E7");
  });
});

describe("resumen y orientación", () => {
  it("cobertura, brechas, brechas sin estrategia y poder alto resistente", () => {
    const l = [
      S({ engCurrent: 2, engDesired: 4, engStrategy: "x" }),               // brecha con estrategia; poder alto + reticente
      S({ power: 10, engCurrent: 1, engDesired: 3 }),                       // brecha SIN estrategia
      S({ engCurrent: 4, engDesired: 4 }),                                  // sin brecha
      S({})                                                                 // sin evaluar
    ];
    expect(engagementSummary(l)).toEqual({ total: 4, assessed: 3, coveragePct: 75, withGap: 2, withGapNoStrategy: 1, highPowerResistant: 1, byCurrent: [1, 1, 0, 1, 0], byDesired: [0, 0, 1, 2, 0] });
    expect(engagementSummary([])).toMatchObject({ total: 0, coveragePct: 0 });
  });
  it("approachHint orienta según la postura actual y el cuadrante, y no inventa nada sin evaluación", () => {
    expect(approachHint(undefined, 4, "cerca")).toMatch(/Evalúa primero/);
    expect(approachHint(4, 4, "cerca")).toMatch(/Mantener el nivel actual/);
    expect(approachHint(2, 4, "cerca")).toMatch(/Escuchar sus objeciones.*gestionar de cerca/);
    expect(approachHint(1, 3, "monitorear")).toMatch(/Informar.*esfuerzo mínimo/);
  });
});
