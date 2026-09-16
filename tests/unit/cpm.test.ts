// Prioridad 1 de Fase 2 (MIGRATION.md): cpm es la función más compleja del
// núcleo (4 tipos de relación, calendario laboral) y ya tuvo un bug real
// documentado en el README (red fragmentada por actividades sin terna PERT
// válida, que truncaba la ruta crítica de 9 a 4 actividades).
import { describe, expect, it } from "vitest";
import { cpm, type CpmNode } from "../../src/core/gpi-core";
import type { ScheduleLink } from "../../src/core/types";

const CAL_5X8 = { workDayIdx: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [], provisional: false };

describe("cpm — dataset dorado DISTRIB+ (regresión end-to-end)", () => {
  // Datos reales tomados de Cronograma_CPM.html (función SAMPLE): mismas
  // 12 actividades, mismos 13 enlaces y mismo calendario que usa el propio
  // módulo Cronograma/CPM para su "Modo ejemplo". El resultado esperado
  // (53 días, fin 2026-09-16, ruta crítica a1-a2-a3-a4-a8-a9-a10-a11-a12)
  // es el que el README documenta como "verificado".
  const durations: Record<string, number> = {
    a1: 4, a2: 4, a3: 10, a4: 12, a5: 8, a6: 9, a7: 9, a8: 6, a9: 8, a10: 5, a11: 8, a12: 8
  };
  const nodes: CpmNode[] = Object.keys(durations).map((id) => ({ id, dur: durations[id] }));
  const links: ScheduleLink[] = [
    { from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" },
    { from: "a2", to: "a3", type: "FS", lag: 0, lagUnit: "d" },
    { from: "a3", to: "a4", type: "SS", lag: 4, lagUnit: "d" },
    { from: "a2", to: "a5", type: "FS", lag: 0, lagUnit: "d" },
    { from: "a5", to: "a6", type: "SS", lag: 3, lagUnit: "d" },
    { from: "a5", to: "a7", type: "SS", lag: 2, lagUnit: "d" },
    { from: "a6", to: "a8", type: "FS", lag: 0, lagUnit: "d" },
    { from: "a7", to: "a8", type: "FS", lag: 0, lagUnit: "d" },
    { from: "a4", to: "a8", type: "FS", lag: 0, lagUnit: "d" },
    { from: "a8", to: "a9", type: "FS", lag: 0, lagUnit: "d" },
    { from: "a9", to: "a10", type: "SS", lag: 2, lagUnit: "d" },
    { from: "a10", to: "a11", type: "FS", lag: 3, lagUnit: "d" },
    { from: "a11", to: "a12", type: "SS", lag: 5, lagUnit: "d" }
  ];

  it("duración total, fecha de fin y ruta crítica coinciden con el README", () => {
    const result = cpm(nodes, links, CAL_5X8, { startDate: "2026-07-06" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projectDuration).toBe(53);
    expect(result.projectFinishDate).toBe("2026-09-16");
    expect(result.criticalIds.slice().sort()).toEqual(
      ["a1", "a2", "a3", "a4", "a8", "a9", "a10", "a11", "a12"].sort()
    );
    // a5, a6 y a7 tienen holgura: no deben aparecer en la ruta crítica
    expect(result.criticalIds).not.toContain("a5");
    expect(result.criticalIds).not.toContain("a6");
    expect(result.criticalIds).not.toContain("a7");
  });

  it("no se fragmenta si una actividad queda sin red de precedencias (regresión del bug de PERT)", () => {
    // El bug original: actividades sin terna PERT válida quedaban FUERA de
    // la red y partían la cadena de precedencias. cpm() no depende de PERT
    // en absoluto (solo de nodes+links+dur), así que la red completa debe
    // seguir intacta aunque falten datos de otras capas.
    const result = cpm(nodes, links, CAL_5X8, { startDate: "2026-07-06" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.criticalIds.length).toBe(9); // no 4, como en el bug original
  });
});

describe("cpm — tipos de relación individuales", () => {
  it("FS: el sucesor no puede empezar antes de que termine el predecesor (+ lag)", () => {
    const r = cpm(
      [{ id: "A", dur: 3 }, { id: "B", dur: 2 }],
      [{ from: "A", to: "B", type: "FS", lag: 2, lagUnit: "d" }],
      CAL_5X8
    );
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rows.B.es).toBe(5); expect(r.projectDuration).toBe(7); }
  });

  it("SS: el sucesor no puede empezar antes de que empiece el predecesor (+ lag)", () => {
    const r = cpm(
      [{ id: "A", dur: 5 }, { id: "B", dur: 2 }],
      [{ from: "A", to: "B", type: "SS", lag: 3, lagUnit: "d" }],
      CAL_5X8
    );
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rows.B.es).toBe(3); expect(r.rows.B.ef).toBe(5); }
  });

  it("FF: el sucesor no puede terminar antes de que termine el predecesor (+ lag)", () => {
    const r = cpm(
      [{ id: "A", dur: 6 }, { id: "B", dur: 2 }],
      [{ from: "A", to: "B", type: "FF", lag: 1, lagUnit: "d" }],
      CAL_5X8
    );
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rows.B.ef).toBe(7); expect(r.rows.B.es).toBe(5); }
  });

  it("SF: el sucesor no puede terminar antes de que empiece el predecesor (+ lag)", () => {
    const r = cpm(
      [{ id: "A", dur: 4 }, { id: "B", dur: 2 }],
      [{ from: "A", to: "B", type: "SF", lag: 3, lagUnit: "d" }],
      CAL_5X8
    );
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rows.B.ef).toBe(3); expect(r.rows.B.es).toBe(1); }
  });

  it("convierte el lag en semanas y horas a días laborables usando el calendario", () => {
    const r = cpm(
      [{ id: "A", dur: 1 }, { id: "B", dur: 1 }],
      [{ from: "A", to: "B", type: "FS", lag: 1, lagUnit: "w" }],
      CAL_5X8 // semana de 5 días laborables -> 1 semana = 5 días
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows.B.es).toBe(6); // ef(A)=1 + 5 días de lag

    const r2 = cpm(
      [{ id: "A", dur: 1 }, { id: "B", dur: 1 }],
      [{ from: "A", to: "B", type: "FS", lag: 16, lagUnit: "h" }],
      CAL_5X8 // 8 h/día -> 16 h = 2 días
    );
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.rows.B.es).toBe(3);
  });
});

describe("cpm — casos límite", () => {
  it("detecta ciclos y no calcula fechas", () => {
    const r = cpm(
      [{ id: "A", dur: 1 }, { id: "B", dur: 1 }],
      [{ from: "A", to: "B", type: "FS" }, { from: "B", to: "A", type: "FS" }]
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.cycles.sort()).toEqual(["A", "B"]);
  });

  it("ignora enlaces auto-referenciados (from === to)", () => {
    const r = cpm([{ id: "A", dur: 3 }], [{ from: "A", to: "A", type: "FS" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.projectDuration).toBe(3);
  });

  it("sin enlaces, cada actividad es crítica y define su propia duración", () => {
    const r = cpm([{ id: "A", dur: 3 }, { id: "B", dur: 7 }], []);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.projectDuration).toBe(7); expect(r.criticalIds).toEqual(["B"]); }
  });

  it("un nodo de duración 0 (hito) encadenado como sucesor y predecesor: ES=EF=LS=LF, propaga la fecha sin desfase", () => {
    // Cronograma/CPM ahora trata los hitos como nodos CPM reales (ver
    // ARCHITECTURE.md, "El 'Id.' de Definir las Actividades...") -- esto
    // nunca se había probado a nivel unitario aunque el código ya lo
    // soportaba por inspección (dur[id]>0?1:0 en el cálculo de finishDate).
    const r = cpm(
      [{ id: "A", dur: 4 }, { id: "M", dur: 0 }, { id: "B", dur: 5 }],
      [{ from: "A", to: "M", type: "FS" }, { from: "M", to: "B", type: "FS" }],
      CAL_5X8, { startDate: "2026-01-05" }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.M.es).toBe(4); expect(r.rows.M.ef).toBe(4); // ES=EF: duración 0
    expect(r.rows.M.ls).toBe(4); expect(r.rows.M.lf).toBe(4); // en la ruta crítica, también LS=LF
    expect(r.rows.M.startDate).toBe(r.rows.M.finishDate); // misma fecha de calendario, sin desfase de 1 día
    expect(r.rows.B.es).toBe(4); // el sucesor arranca exactamente donde el hito, sin desfase
    expect(r.projectDuration).toBe(9); // 4 (A) + 0 (M) + 5 (B)
    expect(r.criticalIds).toContain("M"); // un hito en la única ruta también es crítico
  });
});
