// Prioridad 3 de Fase 2: parsing con reglas de locale (coma decimal vs.
// separador de lista, códigos ES→EN) y detección de ciclos -- alta
// complejidad de ramas, buen candidato a tests tabulares.
import { describe, expect, it } from "vitest";
import { buildScheduleLinks, parsePredecessorCell, scheduleValidate } from "../../src/core/gpi-core";
import type { SnapshotRow } from "../../src/core/gpi-core";
import type { ScheduleLink } from "../../src/core/types";

describe("parsePredecessorCell", () => {
  it.each([
    ["5", [{ netId: 5, type: "FS", lag: 0, lagUnit: "d" }]],
    ["5FS", [{ netId: 5, type: "FS", lag: 0, lagUnit: "d" }]],
    ["5SS+3", [{ netId: 5, type: "SS", lag: 3, lagUnit: "d" }]],
    ["5FF-2", [{ netId: 5, type: "FF", lag: -2, lagUnit: "d" }]],
    ["4;5CC+2d", [{ netId: 4, type: "FS", lag: 0, lagUnit: "d" }, { netId: 5, type: "SS", lag: 2, lagUnit: "d" }]],
    ["4,5", [{ netId: 4, type: "FS", lag: 0, lagUnit: "d" }, { netId: 5, type: "FS", lag: 0, lagUnit: "d" }]],
    ["9FC-1d", [{ netId: 9, type: "FS", lag: -1, lagUnit: "d" }]],
    ["3FF+1 sem", [{ netId: 3, type: "FF", lag: 1, lagUnit: "w" }]],
    ["3SF+2h", [{ netId: 3, type: "SF", lag: 2, lagUnit: "h" }]],
    ["3FS+2ed", [{ netId: 3, type: "FS", lag: 2, lagUnit: "ed" }]],
    ["3CF+1,5d", [{ netId: 3, type: "SF", lag: 1.5, lagUnit: "d" }]], // coma decimal DENTRO del lag
    ["", []]
  ] as const)("parsea %j sin errores", (input, expected) => {
    const { preds, errors } = parsePredecessorCell(input);
    expect(errors).toHaveLength(0);
    expect(preds).toEqual(expected);
  });

  it("reporta 'sin-id' cuando el token no empieza con un número", () => {
    const { preds, errors } = parsePredecessorCell("abc");
    expect(preds).toHaveLength(0);
    expect(errors[0].reason).toBe("sin-id");
  });

  it("reporta 'sintaxis' con un tipo de relación inválido seguido de basura", () => {
    const { errors } = parsePredecessorCell("5XY+2d");
    expect(errors[0].reason).toBe("sintaxis");
  });

  it("reporta 'desfase' cuando el signo no está seguido de un número", () => {
    const { errors } = parsePredecessorCell("5FS+d");
    expect(errors[0].reason).toBe("desfase");
  });
});

describe("scheduleValidate", () => {
  it("red válida: ok=true y devuelve el orden topológico", () => {
    const links: ScheduleLink[] = [{ from: "a", to: "b", type: "FS" }, { from: "b", to: "c", type: "FS" }];
    const r = scheduleValidate(["a", "b", "c"], links);
    expect(r.ok).toBe(true);
    expect(r.order).toEqual(["a", "b", "c"]);
    expect(r.openStart).toEqual(["a"]);
    expect(r.openEnd).toEqual(["c"]);
  });

  it("detecta un ciclo y marca ok=false", () => {
    const links: ScheduleLink[] = [{ from: "a", to: "b", type: "FS" }, { from: "b", to: "a", type: "FS" }];
    const r = scheduleValidate(["a", "b"], links);
    expect(r.ok).toBe(false);
    expect(r.cycles.sort()).toEqual(["a", "b"]);
  });

  it("detecta auto-enlaces y referencias colgantes por separado", () => {
    const links: ScheduleLink[] = [{ from: "a", to: "a", type: "FS" }, { from: "a", to: "zzz", type: "FS" }];
    const r = scheduleValidate(["a"], links);
    expect(r.ok).toBe(false);
    expect(r.selfLoops).toHaveLength(1);
    expect(r.dangling).toHaveLength(1);
  });

  it("los duplicados son un aviso, no bloquean la red", () => {
    const links: ScheduleLink[] = [{ from: "a", to: "b", type: "FS" }, { from: "a", to: "b", type: "FS" }];
    const r = scheduleValidate(["a", "b"], links);
    expect(r.ok).toBe(true);
    expect(r.duplicates).toHaveLength(1);
  });
});

describe("buildScheduleLinks", () => {
  const snapshot: SnapshotRow[] = [
    { netId: 0, kind: "project", name: "Proyecto" },
    { netId: 1, kind: "summary", name: "Fase 1" },
    { netId: 2, kind: "activity", name: "Actividad A", activityId: "a1" },
    { netId: 3, kind: "activity", name: "Actividad B", activityId: "a2" }
  ];

  it("resuelve un enlace válido entre dos actividades por su N.º", () => {
    const r = buildScheduleLinks([{ netId: 3, name: "Actividad B", predCell: "2FS" }], snapshot);
    expect(r.links).toEqual([{ from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }]);
    expect(r.rejected).toHaveLength(0);
  });

  it("rechaza un enlace hacia el proyecto (N.º 0)", () => {
    const r = buildScheduleLinks([{ netId: 3, name: "Actividad B", predCell: "0" }], snapshot);
    expect(r.links).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("enlace-a-proyecto");
  });

  it("rechaza un enlace hacia una fila resumen", () => {
    const r = buildScheduleLinks([{ netId: 3, name: "Actividad B", predCell: "1" }], snapshot);
    expect(r.rejected[0].reason).toBe("enlace-a-resumen");
  });

  it("rechaza un auto-enlace (una actividad enlazada a sí misma)", () => {
    const r = buildScheduleLinks([{ netId: 2, name: "Actividad A", predCell: "2" }], snapshot);
    expect(r.rejected[0].reason).toBe("auto-enlace");
  });

  it("marca colgante una predecesora que no existe en el snapshot", () => {
    const r = buildScheduleLinks([{ netId: 3, name: "Actividad B", predCell: "99" }], snapshot);
    expect(r.rejected[0].reason).toBe("colgante");
  });

  it("detecta desfase de N.º cuando el nombre pegado no coincide con el snapshot", () => {
    const r = buildScheduleLinks([{ netId: 3, name: "Otro nombre", predCell: "2" }], snapshot);
    expect(r.rowErrors[0].reason).toBe("nombre-no-coincide");
  });

  it("extrae fechas de auditoría cuando la fila trae start/finish", () => {
    const r = buildScheduleLinks(
      [{ netId: 2, name: "Actividad A", start: "2026-01-05", finish: "2026-01-10", predCell: "" }],
      snapshot
    );
    expect(r.dates.a1).toEqual({ start: "2026-01-05", finish: "2026-01-10" });
  });

  it("colapsa enlaces duplicados en vez de repetirlos", () => {
    const r = buildScheduleLinks(
      [{ netId: 3, name: "Actividad B", predCell: "2FS;2FS" }],
      snapshot
    );
    expect(r.links).toHaveLength(1);
    expect(r.duplicates).toHaveLength(1);
  });
});
