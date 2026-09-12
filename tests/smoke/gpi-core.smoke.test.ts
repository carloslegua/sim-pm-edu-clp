// Smoke test de la Fase 1 (MIGRATION.md): confirma que el port de gpi-core.js
// a TypeScript sigue funcionando igual que el original antes de tocar ningún
// módulo HTML. No reemplaza la cobertura priorizada por riesgo de la Fase 2
// (cpm con el dataset DISTRIB+, pertProbability, audits, etc.) — esto es
// solo la red de seguridad mínima para el port mecánico.
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProject, setModule, getModule, active, meta, defaultMeta,
  util
} from "../../src/core/gpi-core";
import type { WbsModule } from "../../src/core/types";

beforeEach(() => {
  localStorage.clear();
});

describe("capa de datos (localStorage)", () => {
  it("crea un proyecto y lo deja activo", () => {
    const id = createProject({ name: "Proyecto de prueba" });
    expect(active()?.meta.id).toBe(id);
    expect(meta()?.name).toBe("Proyecto de prueba");
  });

  it("guarda y relee un módulo sin perder datos (round-trip)", () => {
    createProject();
    const wbs: WbsModule = {
      rootId: "root", idCounter: 3,
      nodes: {
        root: { name: "Proyecto", children: ["a", "b"] },
        a: { name: "Fase A", children: [], cost: 100 },
        b: { name: "Fase B", children: [], cost: 200 }
      }
    };
    setModule("wbs", wbs);
    expect(getModule("wbs")).toEqual(wbs);
  });

  it("defaultMeta trae los valores por defecto documentados", () => {
    const m = defaultMeta();
    expect(m.currency).toBe("USD");
    expect(m.name).toBe("Proyecto sin título");
  });
});

describe("GPI.util — árbol WBS", () => {
  const wbs: WbsModule = {
    rootId: "root", idCounter: 4,
    nodes: {
      root: { name: "Proyecto", children: ["p1"] },
      p1: { name: "Fase 1", children: ["p1.1", "p1.2"] },
      "p1.1": { name: "Paquete 1.1", children: [], cost: 1000 },
      "p1.2": { name: "Paquete 1.2", children: [], cost: 500 }
    }
  };

  it("wbsLeaves devuelve solo los nodos hoja, con código jerárquico", () => {
    const leaves = util.wbsLeaves(wbs);
    expect(leaves.map((l) => l.id)).toEqual(["p1.1", "p1.2"]);
    expect(leaves[0].code).toBe("1.1");
  });

  it("wbsRollup suma el costo de las hojas, no de los nodos intermedios", () => {
    expect(util.wbsRollup(wbs).cost).toBe(1500);
  });
});

describe("GPI.util.cpm — red de precedencias", () => {
  it("calcula la duración del proyecto y la ruta crítica en una cadena FS simple", () => {
    const nodes = [{ id: "A", dur: 3 }, { id: "B", dur: 2 }, { id: "C", dur: 4 }];
    const links = [
      { from: "A", to: "B", type: "FS" as const },
      { from: "B", to: "C", type: "FS" as const }
    ];
    const result = util.cpm(nodes, links, { workDayIdx: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [], provisional: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projectDuration).toBe(9);
      expect(result.criticalIds.sort()).toEqual(["A", "B", "C"]);
    }
  });

  it("detecta ciclos y no calcula fechas sobre una red inválida", () => {
    const nodes = [{ id: "A", dur: 1 }, { id: "B", dur: 1 }];
    const links = [
      { from: "A", to: "B", type: "FS" as const },
      { from: "B", to: "A", type: "FS" as const }
    ];
    const result = util.cpm(nodes, links);
    expect(result.ok).toBe(false);
  });
});

describe("GPI.util.pertProbability", () => {
  it("da 50% cuando el plazo objetivo coincide con la duración esperada", () => {
    const r = util.pertProbability(20, 4, 20);
    expect(r).not.toBeNull();
    expect(r!.prob).toBeCloseTo(0.5, 3);
  });
});

describe("GPI.util.parsePredecessorCell", () => {
  it("parsea id, tipo y desfase, y canonicaliza tipos en español", () => {
    const { preds, errors } = util.parsePredecessorCell("4;5CC+2d");
    expect(errors).toHaveLength(0);
    expect(preds).toEqual([
      { netId: 4, type: "FS", lag: 0, lagUnit: "d" },
      { netId: 5, type: "SS", lag: 2, lagUnit: "d" }
    ]);
  });
});
