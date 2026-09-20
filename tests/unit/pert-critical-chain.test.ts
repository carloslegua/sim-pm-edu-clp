// Probabilidad de plazo PERT sobre la ruta crítica (hallazgo "alta" de revisión
// externa): criticalPertSums() (Cronograma/CPM) y criticalPathStats() (PERT)
// SUMABAN todas las actividades críticas -- aunque estuvieran en ramas
// paralelas -- y omitían los desfases. Dos actividades paralelas de 10 días que
// desembocan en un hito: el CPM da 10 d, pero el cálculo tomaba 20 d como media
// y con varianza 1 por actividad informaba ~0 % de terminar en 10 días.
//
// Corrección: pertCriticalChain() solo devuelve momentos (media y varianza) si
// las actividades críticas forman UNA cadena; en cualquier otro caso (ramas
// paralelas/convergentes) dice por qué no es aplicable en vez de inventar un
// número. La media es la duración del proyecto (incluye desfases y calendario)
// y la varianza suma solo las actividades que de verdad determinan el fin.
import { describe, expect, it } from "vitest";
import { cpm, pertCriticalChain, pertProbability } from "../../src/core/gpi-core";
import type { ScheduleLink } from "../../src/core/types";

const L = (from: string, to: string, type: ScheduleLink["type"] = "FS", lag = 0, lagUnit: ScheduleLink["lagUnit"] = "d"): ScheduleLink => ({ from, to, type, lag, lagUnit });
function analizar(nodes: Array<{ id: string; dur: number }>, links: ScheduleLink[], vars: Record<string, number>) {
  const res = cpm(nodes, links, null, {});
  if (!res.ok) throw new Error("ciclo");
  return { res, chain: pertCriticalChain(res, links, null, vars) };
}

describe("pertCriticalChain -- ramas paralelas", () => {
  it("REPRO DEL REPORTE: dos actividades paralelas de 10 d hacia un hito NO son una cadena (antes: media 20 d, ~0 % de terminar en 10 d)", () => {
    const { res, chain } = analizar(
      [{ id: "a", dur: 10 }, { id: "b", dur: 10 }, { id: "h", dur: 0 }],
      [L("a", "h"), L("b", "h")], { a: 1, b: 1, h: 0 });
    expect(res.ok && res.projectDuration).toBe(10);           // el CPM ya era correcto
    expect(res.ok && res.criticalIds.sort()).toEqual(["a", "b", "h"]);
    expect(chain).toEqual({ ok: false, reason: "parallel" }); // ya no se suman las dos ramas
  });

  it("ramas paralelas que nacen de un mismo inicio y se cierran en un hito tampoco", () => {
    const { chain } = analizar(
      [{ id: "i", dur: 0 }, { id: "a", dur: 5 }, { id: "b", dur: 5 }, { id: "h", dur: 0 }],
      [L("i", "a"), L("i", "b"), L("a", "h"), L("b", "h")], { a: 1, b: 1 });
    expect(chain).toEqual({ ok: false, reason: "parallel" });
  });

  it("dos redes independientes igual de largas (dos fuentes) -> paralelas", () => {
    const { chain } = analizar([{ id: "a", dur: 4 }, { id: "b", dur: 4 }], [], { a: 1, b: 1 });
    expect(chain).toEqual({ ok: false, reason: "parallel" });
  });
});

describe("pertCriticalChain -- una sola cadena", () => {
  it("cadena FS simple: media = duración del proyecto, varianza = suma de las de la cadena, y la rama con holgura NO cuenta", () => {
    const { res, chain } = analizar(
      [{ id: "a", dur: 4 }, { id: "b", dur: 6 }, { id: "c", dur: 3 }, { id: "x", dur: 2 }],
      [L("a", "b"), L("b", "c"), L("a", "x"), L("x", "c")], { a: 1, b: 4, c: 1, x: 9 });
    expect(res.ok && res.projectDuration).toBe(13);
    expect(chain).toMatchObject({ ok: true, ids: ["a", "b", "c"], mean: 13, variance: 6 }); // x tiene holgura: su varianza no entra
  });

  it("un hito (varianza 0) dentro de la cadena no la rompe", () => {
    const { chain } = analizar(
      [{ id: "a", dur: 4 }, { id: "m", dur: 0 }, { id: "b", dur: 6 }],
      [L("a", "m"), L("m", "b")], { a: 1, b: 2 });
    expect(chain).toMatchObject({ ok: true, ids: ["a", "m", "b"], mean: 10, variance: 3 });
  });

  it("los desfases entran en la media (antes se omitían): FS+3 d y +1 semana laborable", () => {
    const { res, chain } = analizar(
      [{ id: "a", dur: 4 }, { id: "b", dur: 6 }, { id: "c", dur: 2 }],
      [L("a", "b", "FS", 3), L("b", "c", "FS", 1, "w")], { a: 1, b: 1, c: 1 });
    expect(res.ok && res.projectDuration).toBe(4 + 3 + 6 + 5 + 2); // 1 semana = 5 días laborables (calendario provisional)
    expect(chain).toMatchObject({ ok: true, mean: 20, variance: 3 });
  });

  it("un adelanto (lag negativo) reduce la media", () => {
    const { res, chain } = analizar([{ id: "a", dur: 10 }, { id: "b", dur: 6 }], [L("a", "b", "FS", -2)], { a: 1, b: 1 });
    expect(res.ok && res.projectDuration).toBe(14);
    expect(chain).toMatchObject({ ok: true, mean: 14, variance: 2 });
  });

  it("SS: con A -SS+2-> B la duración de A no decide el fin; solo B aporta varianza", () => {
    const { res, chain } = analizar([{ id: "a", dur: 5 }, { id: "b", dur: 8 }], [L("a", "b", "SS", 2)], { a: 4, b: 1 });
    expect(res.ok && res.projectDuration).toBe(10);          // 2 + 8
    expect(chain).toMatchObject({ ok: true, ids: ["a", "b"], mean: 10, variance: 1 }); // varianza de A (4) no cuenta
  });

  it("FF: con A -FF-> B el fin de B lo fija el fin de A; solo A aporta varianza", () => {
    const { res, chain } = analizar([{ id: "a", dur: 10 }, { id: "b", dur: 3 }], [L("a", "b", "FF")], { a: 4, b: 1 });
    expect(res.ok && res.projectDuration).toBe(10);
    expect(chain).toMatchObject({ ok: true, mean: 10, variance: 4 });
  });

  it("una sola actividad", () => {
    const { chain } = analizar([{ id: "a", dur: 7 }], [], { a: 2.25 });
    expect(chain).toMatchObject({ ok: true, ids: ["a"], mean: 7, variance: 2.25 });
  });

  it("la probabilidad sobre una cadena válida coincide con la normal: P(T <= media) = 50 %", () => {
    const { chain } = analizar([{ id: "a", dur: 4 }, { id: "b", dur: 6 }], [L("a", "b")], { a: 1, b: 3 });
    if (!chain.ok) throw new Error("debía ser cadena");
    const r = pertProbability(chain.mean, chain.variance, 10)!;
    expect(r.prob).toBeCloseTo(0.5, 6);
    expect(r.sigma).toBeCloseTo(2, 6);
  });
});

describe("pertCriticalChain -- desfases en días transcurridos", () => {
  const nodes = [{ id: "a", dur: 4 }, { id: "b", dur: 6 }], links = [L("a", "b", "FS", 3, "ed")];
  it("con fecha de inicio el desfase se calcula sobre fechas reales (depende de fines de semana/feriados): no es una constante que sumar -> 'elapsed', sin inventar un número", () => {
    const res = cpm(nodes, links, null, { startDate: "2026-07-06" });
    expect(pertCriticalChain(res, links, null, { a: 1, b: 1 })).toEqual({ ok: false, reason: "elapsed" });
  });
  it("sin fecha de inicio se usa la aproximación proporcional y sigue siendo una cadena", () => {
    const res = cpm(nodes, links, null, {});
    expect(pertCriticalChain(res, links, null, { a: 1, b: 1 })).toMatchObject({ ok: true, ids: ["a", "b"], variance: 2 });
  });
  it("un desfase transcurrido de 0 no cuenta como tal", () => {
    const l0 = [L("a", "b", "FS", 0, "ed")];
    const res = cpm(nodes, l0, null, { startDate: "2026-07-06" });
    expect(pertCriticalChain(res, l0, null, { a: 1, b: 1 })).toMatchObject({ ok: true, mean: 10, variance: 2 });
  });
});

describe("pertCriticalChain -- entradas degeneradas", () => {
  it("sin actividades críticas -> empty", () => {
    const res = cpm([], [], null, {});
    expect(pertCriticalChain(res, [], null, {})).toEqual({ ok: false, reason: "empty" });
  });
  it("red con ciclo -> empty (el CPM no es válido)", () => {
    const res = cpm([{ id: "a", dur: 1 }, { id: "b", dur: 1 }], [L("a", "b"), L("b", "a")], null, {});
    expect(pertCriticalChain(res, [L("a", "b"), L("b", "a")], null, {})).toEqual({ ok: false, reason: "empty" });
  });
});
