// Prioridad 5 de Fase 2: recorridos recursivos de árbol (WBS/OBS). Riesgo
// bajo pero fixtures de 3-4 niveles y casos borde (raíz vacía, children
// ausente) son baratos de cubrir y protegen contra off-by-one en la
// codificación jerárquica "1.2.3".
import { describe, expect, it } from "vitest";
import {
  wbsRollup, wbsCodes, wbsLeaves, wbsPhases, obsNodes, activitiesStats, pertStats
} from "../../src/core/gpi-core";
import type { WbsModule, ObsModule, ActivitiesModule, PertModule } from "../../src/core/types";

const wbs: WbsModule = {
  rootId: "root", idCounter: 10,
  nodes: {
    root: { name: "Proyecto", children: ["f1", "f2"] },
    f1: { name: "Fase 1", children: ["f1.1", "f1.2"], start: "2026-01-05", end: "2026-02-01" },
    "f1.1": { name: "Paquete 1.1", children: [], cost: 1000, resource: "Ana" },
    "f1.2": { name: "Paquete 1.2", children: [], cost: 500, resource: "Ana" },
    f2: { name: "Fase 2", children: ["f2.1"], start: "2026-02-02", end: "2026-03-01" },
    "f2.1": { name: "Paquete 2.1", children: [], cost: 2000, resource: "Luis" }
  }
};

describe("wbsRollup / wbsCodes / wbsLeaves", () => {
  it("wbsRollup suma el costo solo de las hojas, no de nodos intermedios", () => {
    const r = wbsRollup(wbs);
    expect(r.cost).toBe(3500);
    expect(r.leafCount).toBe(3);
    expect(r.count).toBe(5); // todos menos la raíz
    expect(r.minStart).toBe("2026-01-05");
    expect(r.maxEnd).toBe("2026-03-01");
  });

  it("wbsCodes asigna códigos jerárquicos 1, 1.1, 1.2, 2, 2.1", () => {
    const codes = wbsCodes(wbs);
    expect(codes.f1).toBe("1");
    expect(codes["f1.1"]).toBe("1.1");
    expect(codes["f1.2"]).toBe("1.2");
    expect(codes.f2).toBe("2");
    expect(codes["f2.1"]).toBe("2.1");
    expect(codes.root).toBe("0");
  });

  it("wbsLeaves solo devuelve los nodos hoja, en orden de árbol", () => {
    const leaves = wbsLeaves(wbs);
    expect(leaves.map((l) => l.id)).toEqual(["f1.1", "f1.2", "f2.1"]);
    expect(leaves[0].code).toBe("1.1");
  });

  it("con WBS null/vacío no revienta, devuelve valores neutros", () => {
    expect(wbsRollup(null)).toEqual({ cost: 0, count: 0, leafCount: 0, minStart: "", maxEnd: "" });
    expect(wbsLeaves(null)).toEqual([]);
    expect(wbsCodes(undefined)).toEqual({});
  });

  it("wbsPhases calcula costo y rango de fechas por fase (hijos directos de la raíz)", () => {
    const phases = wbsPhases(wbs);
    expect(phases).toEqual([
      { id: "f1", name: "Fase 1", start: "2026-01-05", end: "2026-02-01", cost: 1500 },
      { id: "f2", name: "Fase 2", start: "2026-02-02", end: "2026-03-01", cost: 2000 }
    ]);
  });
});

describe("obsNodes", () => {
  const obs: ObsModule = {
    rootId: "root", idCounter: 4,
    nodes: {
      root: { id: "root", name: "Equipo", children: ["dir", "core"] },
      dir: { id: "dir", parentId: "root", role: "Director", person: "Luis", children: ["core2"] },
      core2: { id: "core2", parentId: "dir", role: "Analista", children: [] },
      core: { id: "core", parentId: "root", role: "QA", children: [] }
    }
  };

  it("excluye la raíz y codifica jerárquicamente por posición entre hermanos", () => {
    const nodes = obsNodes(obs);
    expect(nodes.map((n) => n.id)).toEqual(["dir", "core2", "core"]);
    expect(nodes.find((n) => n.id === "dir")?.code).toBe("1");
    expect(nodes.find((n) => n.id === "core2")?.code).toBe("1.1");
    expect(nodes.find((n) => n.id === "core")?.code).toBe("2");
  });
});

describe("activitiesStats", () => {
  it("calcula cobertura de paquetes con actividades y detecta huérfanas", () => {
    const act: ActivitiesModule = {
      idCounter: 3,
      byLeaf: {
        "f1.1": [{ id: "a1", name: "Actividad 1" }],
        "no-existe": [{ id: "a2", name: "Huérfana" }] // el paquete ya no existe en la EDT
      }
    };
    const stats = activitiesStats(act, wbs);
    expect(stats.leaves).toBe(3); // f1.1, f1.2, f2.1
    expect(stats.covered).toBe(1); // solo f1.1 tiene actividades
    expect(stats.orphans).toBe(1);
    expect(stats.uncovered.map((l) => l.id)).toEqual(["f1.2", "f2.1"]);
    expect(stats.pct).toBe(33); // 1/3 redondeado
  });
});

describe("pertStats", () => {
  it("calcula TE y varianza con la fórmula PERT clásica, siguiendo la M automática a la duración", () => {
    const act: ActivitiesModule = {
      idCounter: 2,
      byLeaf: { "f1.1": [{ id: "a1", name: "Excavación", unit: "m³", qty: 100, perf: 10, teams: 1 }] } // dur = ceil(100/10) = 10
    };
    const pert: PertModule = { inputMode: "dias", byActivity: { a1: { o: "8", m: "", mAuto: true, p: "18" } } };
    const stats = pertStats(pert, act, wbs);
    const row = stats.rows[0];
    expect(row.dur).toBe(10);
    expect(row.m).toBe(10); // M automática sigue a la duración
    expect(row.te).toBeCloseTo((8 + 4 * 10 + 18) / 6, 6);
    expect(row.variance).toBeCloseTo(Math.pow((18 - 8) / 6, 2), 6);
    expect(row.valid).toBe(true);
    expect(stats.complete).toBe(1);
    expect(stats.invalid).toBe(0);
  });

  it("marca inválida una terna donde O > M (documentado como caso de prueba en el README)", () => {
    const act: ActivitiesModule = {
      idCounter: 2,
      byLeaf: { "f1.1": [{ id: "a1", name: "A", unit: "u", qty: 10, perf: 10, teams: 1 }] } // dur = 1
    };
    const pert: PertModule = { inputMode: "dias", byActivity: { a1: { o: "5", m: "", mAuto: true, p: "8" } } }; // o(5) > m(1)
    const stats = pertStats(pert, act, wbs);
    expect(stats.rows[0].valid).toBe(false);
    expect(stats.invalid).toBe(1);
  });

  it("tolera coma decimal y separador de miles en las cantidades (como Excel)", () => {
    const act: ActivitiesModule = {
      idCounter: 2,
      byLeaf: { "f1.1": [{ id: "a1", name: "A", unit: "kg", qty: "38.500", perf: "2.500", teams: 1 }] }
    };
    const pert: PertModule = { inputMode: "dias", byActivity: {} };
    const stats = pertStats(pert, act, wbs);
    expect(stats.rows[0].dur).toBe(Math.ceil(38500 / 2500));
  });
});
