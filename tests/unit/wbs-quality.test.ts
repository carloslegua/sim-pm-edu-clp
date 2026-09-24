// Calidad de la EDT: estructura, diccionario y tamaño (src/shared/wbs-quality.ts). Lógica pura.
import { describe, expect, it } from "vitest";
import { LIMITS, RULES, analyzeWbs, calendarDays, looksLikeActivity, type QNode, type QWbs } from "../../src/shared/wbs-quality";

// Paquete completo por defecto: descripción, criterio, responsable, costo y fechas coherentes.
const leaf = (id: string, name: string, over: Partial<QNode> = {}): QNode => ({ id, name, children: [], cost: 1000, duration: 5, start: "2026-08-03", end: "2026-08-07", resource: "Ana", notes: "Trabajo descrito.", acceptance: "Aceptado por el cliente.", ...over });
const parent = (id: string, name: string, children: string[]): QNode => ({ id, name, children });
const tree = (nodes: QNode[]): QWbs => { const m: Record<string, QNode> = {}; nodes.forEach((n) => { m[n.id as string] = n; }); return { rootId: "r", nodes: m }; };
const codesOf = (q: ReturnType<typeof analyzeWbs>, code: string) => q.findings.filter((f) => f.code === code).map((f) => f.nodeCode);

// r → f1 (a, b) · f2 (c, d): sana
const sana = (): QNode[] => [parent("r", "Proyecto", ["f1", "f2"]), parent("f1", "Ingeniería", ["a", "b"]), parent("f2", "Construcción", ["c", "d"]),
  leaf("a", "Estudio de suelos"), leaf("b", "Diseño estructural"), leaf("c", "Cimentaciones"), leaf("d", "Estructura y cobertura")];

describe("analyzeWbs — base", () => {
  it("sin EDT o solo con la raíz: estado vacío, sin hallazgos", () => {
    expect(analyzeWbs(null).state).toBe("vacio");
    expect(analyzeWbs({ rootId: "r", nodes: { r: { id: "r", name: "P", children: [] } } }).state).toBe("vacio");
    expect(analyzeWbs({ rootId: "zz", nodes: {} }).findings).toEqual([]);
  });
  it("una EDT sana no da hallazgos, calcula los códigos y el diccionario completo", () => {
    const q = analyzeWbs(tree(sana()));
    expect(q.findings).toEqual([]);
    expect(q.state).toBe("verde");
    expect(q.codes).toMatchObject({ r: "0", f1: "1", a: "1.1", b: "1.2", f2: "2", c: "2.1", d: "2.2" });
    expect(q.leaves).toBe(4); expect(q.maxDepth).toBe(2);
    expect(q.dictionary).toEqual({ complete: 4, total: 4, pct: 100 });
  });
  it("ignora nodos huérfanos y no se cuelga con ciclos (el hijo apunta a un ancestro)", () => {
    const n = sana(); n.push(leaf("huerfano", "Sin padre")); (n[3].children as string[]).push("f1");   // a → f1 (ciclo)
    const q = analyzeWbs(tree(n));
    expect(q.codes.huerfano).toBeUndefined();
    expect(q.leaves).toBe(4);   // el enlace a→f1 se descarta (f1 ya estaba visitado): «a» sigue siendo hoja y no hay bucle
  });
});

describe("analyzeWbs — estructura", () => {
  it("E4: un solo hijo no es una descomposición (también en la raíz: una sola fase)", () => {
    const n = sana(); n[1].children = ["a"]; n.splice(4, 1);       // f1 solo con «a»
    const q = analyzeWbs(tree(n));
    expect(codesOf(q, "E4")).toEqual(["1"]);
    expect(analyzeWbs(tree([parent("r", "P", ["f1"]), parent("f1", "F", ["a", "b"]), leaf("a", "Uno"), leaf("b", "Dos")])).findings.map((f) => f.code)).toEqual(["E4"]);
  });
  it("E2: nombres repetidos entre hermanos son un riesgo; E3: el mismo nombre en otra rama es informativo", () => {
    const n = sana(); n[3] = leaf("a", "Estudio de suelos"); n[4] = leaf("b", "estudio  de SUELOS");   // hermanos: igual sin tildes/mayúsculas/espacios
    const q = analyzeWbs(tree(n));
    expect(codesOf(q, "E2")).toEqual(["1.1", "1.2"]);
    expect(q.findings.find((f) => f.code === "E2")!.severity).toBe("riesgo");
    expect(q.state).toBe("rojo");
    const m = sana(); m[5] = leaf("c", "Pruebas"); m[3] = leaf("a", "Pruebas");
    const q2 = analyzeWbs(tree(m));
    expect(codesOf(q2, "E3")).toEqual(["1.1", "2.1"]); expect(codesOf(q2, "E2")).toEqual([]);
    expect(q2.state).toBe("verde");                                   // solo info: no cambia el estado
  });
  it("E1: nombre vacío es aviso alto (riesgo) y nombre de plantilla, aviso", () => {
    const n = sana(); n[3] = leaf("a", "  "); n[4] = leaf("b", "Nuevo paquete");
    const q = analyzeWbs(tree(n));
    expect(q.findings.filter((f) => f.code === "E1").map((f) => [f.nodeCode, f.severity])).toEqual([["1.1", "riesgo"], ["1.2", "aviso"]]);
  });
  it("E8: nombres que empiezan con verbo en infinitivo (con excepciones de sustantivos)", () => {
    ["Realizar pruebas", "Elaborar el informe", "instalar tableros", "Construir la nave"].forEach((s) => expect(looksLikeActivity(s)).toBe(true));
    ["Diseño estructural", "Alquiler de equipos", "Dossier de calidad", "Taller mecánico", "Pruebas de instalaciones", "Cimentaciones", "Acta de entrega y cierre", "Movimiento de tierras", "Líder de obra", "Ingeniería"].forEach((s) => expect(looksLikeActivity(s)).toBe(false));
    const n = sana(); n[3] = leaf("a", "Realizar estudio de suelos");
    expect(codesOf(analyzeWbs(tree(n)), "E8")).toEqual(["1.1"]);
  });
  it("E5: una fase sin descomponer solo se avisa cuando hay otras fases descompuestas (una EDT plana no es un error)", () => {
    const n = sana(); n.push(leaf("f3", "Cierre")); (n[0].children as string[]).push("f3");
    expect(codesOf(analyzeWbs(tree(n)), "E5")).toEqual(["3"]);
    const plana = tree([parent("r", "P", ["a", "b"]), leaf("a", "Uno"), leaf("b", "Dos")]);
    expect(analyzeWbs(plana).findings).toEqual([]);
  });
  it("E6/E7: profundidad mayor que " + LIMITS.maxDepth + " y más de " + LIMITS.maxChildren + " hijos", () => {
    const n: QNode[] = [parent("r", "P", ["n1"])];
    for (let i = 1; i <= 6; i++) n.push(i < 6 ? parent("n" + i, "Nivel " + i, ["n" + (i + 1), "x" + i]) : leaf("n6", "Nivel 6"));
    for (let i = 1; i <= 5; i++) n.push(leaf("x" + i, "Hermano " + i));
    const q = analyzeWbs(tree(n));
    expect(codesOf(q, "E6")).toEqual(["1.1.1.1.1.1", "1.1.1.1.1.2"]);   // los dos hijos de n5 están en el nivel 6
    const kids = Array.from({ length: LIMITS.maxChildren + 1 }, (_, i) => "k" + i);
    const m = tree([parent("r", "P", ["f", "g"]), parent("f", "Fase grande", kids), parent("g", "Otra", ["g1", "g2"]), leaf("g1", "Uno"), leaf("g2", "Dos"), ...kids.map((k, i) => leaf(k, "Elemento " + i))]);
    expect(codesOf(analyzeWbs(m), "E7")).toEqual(["1"]);
  });
});

describe("analyzeWbs — diccionario y tamaño", () => {
  it("D1–D5: descripción, criterio, responsable, costo y duración/fechas de cada paquete", () => {
    const n = sana();
    n[3] = leaf("a", "Estudio de suelos", { notes: "", acceptance: "  ", resource: "" });
    n[4] = leaf("b", "Diseño estructural", { cost: 0 });
    n[5] = leaf("c", "Cimentaciones", { start: "", end: "", duration: 0 });
    const q = analyzeWbs(tree(n));
    expect(codesOf(q, "D1")).toEqual(["1.1"]); expect(codesOf(q, "D2")).toEqual(["1.1"]); expect(codesOf(q, "D3")).toEqual(["1.1"]);
    expect(codesOf(q, "D4")).toEqual(["1.2"]); expect(codesOf(q, "D5")).toEqual(["2.1"]);
    expect(q.dictionary).toEqual({ complete: 3, total: 4, pct: 75 });
    expect(q.state).toBe("ambar");
  });
  it("D5: sin fechas basta la duración numérica; D6: una sola fecha o fin antes del inicio", () => {
    const n = sana();
    n[3] = leaf("a", "Estudio de suelos", { start: "", end: "", duration: 8 });
    n[4] = leaf("b", "Diseño estructural", { end: "" });
    n[5] = leaf("c", "Cimentaciones", { start: "2026-09-10", end: "2026-09-01" });
    const q = analyzeWbs(tree(n));
    expect(codesOf(q, "D5")).toEqual([]);
    expect(codesOf(q, "D6")).toEqual(["1.2", "2.1"]);
    expect(q.findings.find((f) => f.nodeCode === "2.1" && f.code === "D6")!.severity).toBe("riesgo");
  });
  it("S1: paquete demasiado largo (por fechas de calendario); el esfuerzo continuo (LOE) queda exento", () => {
    expect(calendarDays("2026-07-21", "2026-10-23")).toBe(95);
    expect(calendarDays("2026-10-23", "2026-07-21")).toBeNull();
    expect(calendarDays("", "2026-07-21")).toBeNull();
    const n = sana(); n[3] = leaf("a", "Estudio de suelos", { start: "2026-07-21", end: "2026-10-23" });
    expect(codesOf(analyzeWbs(tree(n)), "S1")).toEqual(["1.1"]);
    n[3] = leaf("a", "Estudio de suelos", { start: "2026-07-21", end: "2026-10-23", loe: true });
    expect(codesOf(analyzeWbs(tree(n)), "S1")).toEqual([]);
    n[3] = leaf("a", "Estudio de suelos", { start: "", end: "", duration: 61 });
    expect(codesOf(analyzeWbs(tree(n)), "S1")).toEqual(["1.1"]);
    n[3] = leaf("a", "Estudio de suelos", { start: "", end: "", duration: 60 });
    expect(codesOf(analyzeWbs(tree(n)), "S1")).toEqual([]);
  });
  it("S2: un paquete que concentra más del " + LIMITS.maxCostSharePct + " % del costo (solo con " + LIMITS.minLeavesForShare + " paquetes o más; LOE exento)", () => {
    const con = (n: number, big: Partial<QNode> = {}): QWbs => {
      const ids = Array.from({ length: n }, (_, i) => "p" + i);
      return tree([parent("r", "P", ["f", "g"]), parent("f", "F", ids.slice(0, 3)), parent("g", "G", ids.slice(3)), ...ids.map((id, i) => leaf(id, "Paquete " + String.fromCharCode(65 + i), i === 0 ? { cost: 5000, ...big } : { cost: 1000 }))]);
    };
    const q = analyzeWbs(con(6));                                       // 5000 de 10000 = 50 %
    expect(codesOf(q, "S2")).toEqual(["1.1"]);
    expect(q.findings.find((f) => f.code === "S2")!.text).toMatch(/50 %/);
    expect(codesOf(analyzeWbs(con(6, { loe: true })), "S2")).toEqual([]);
    expect(codesOf(analyzeWbs(con(4)), "S2")).toEqual([]);              // con pocos paquetes es natural que uno pese mucho
  });
});

describe("analyzeWbs — resumen", () => {
  it("agrupa por regla, ordena por severidad, indexa por nodo y cuenta", () => {
    const n = sana(); n[3] = leaf("a", "Estudio de suelos", { notes: "" }); n[4] = leaf("b", "Estudio de suelos", { notes: "" });
    const q = analyzeWbs(tree(n));
    expect(q.groups.map((g) => g.code)).toEqual(["E2", "D1"]);                  // riesgo antes que aviso
    expect(q.groups[0].items).toHaveLength(2);
    expect(q.groups.every((g) => g.title && g.hint)).toBe(true);
    expect(q.byNode.a.map((f) => f.code).sort()).toEqual(["D1", "E2"]);
    expect(q.counts).toEqual({ riesgo: 2, aviso: 2, info: 0 });
    expect(q.state).toBe("rojo");
  });
  it("todas las reglas tienen código único, título y explicación", () => {
    expect(new Set(RULES.map((r) => r.code)).size).toBe(RULES.length);
    RULES.forEach((r) => { expect(r.title.length).toBeGreaterThan(5); expect(r.hint.length).toBeGreaterThan(30); });
  });
});
