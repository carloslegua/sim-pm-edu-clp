// Prioridad 4 de Fase 2: los "audits" tienen bajo riesgo numérico pero
// reglas de negocio graduadas (umbrales verde/ámbar/rojo, restricciones
// hard vs. soft en raciAudit) fáciles de desplazar por un off-by-one.
import { describe, expect, it } from "vitest";
import {
  charterAudit, schedulePlanAudit, raciAudit, requirementsAudit, scopeAudit, traceMatrix,
  wbsLeaves, obsNodes
} from "../../src/core/gpi-core";
import type { CharterModule, SchedulePlanModule, WbsModule, ObsModule, RequirementsModule, ScopeStatementModule } from "../../src/core/types";

describe("charterAudit", () => {
  it("un acta vacía o null da estado rojo y 0%", () => {
    expect(charterAudit(null).state).toBe("rojo");
    expect(charterAudit({}).pct).toBe(0);
  });

  it("un acta completa en las 23 dimensiones da verde y 100%", () => {
    const full: CharterModule = {
      identification: { sponsor: "Ana", manager: "Luis", client: "Cliente", preparedDate: "2026-01-01", authority: "Alta", approach: "predictivo" },
      purpose: "Justificación",
      businessCase: { justification: "Reduce costos", investment: "1000000" },
      description: "Descripción de alto nivel",
      boundaries: "Límites declarados",
      requirements: ["RAN 1"],
      deliverables: ["Entregable 1"],
      objectives: [
        { dim: "Alcance", objective: "Cumplir alcance", criteria: "100%" },
        { dim: "Cronograma", objective: "A tiempo", criteria: "Sin atraso" },
        { dim: "Costo", objective: "Dentro del BAC", criteria: "CPI>=1" }
      ],
      milestones: [{ name: "Hito 1", date: "2026-06-01" }],
      budget: { amount: 100 },
      risks: ["riesgo"], assumptions: ["supuesto"], constraints: ["restricción"], exclusions: ["exclusión"],
      stakeholders: ["interesado"],
      sponsors: [{ name: "Patrocinador" }],
      approval: { sponsorName: "Ana", managerName: "Luis" },
      preAssignedResources: ["recurso"],
      approvalRequirements: [{ item: "Diseño", approver: "Comité" }],
      exitCriteria: ["criterio de salida"]
    };
    const audit = charterAudit(full);
    expect(audit.state).toBe("verde");
    expect(audit.pct).toBe(100);
    expect(audit.okCount).toBe(audit.total);
  });

  it("con la mitad de los ítems queda en ámbar", () => {
    const half: CharterModule = {
      identification: { sponsor: "Ana", manager: "Luis" }, // roles ok, contexto/autoridad/enfoque no
      purpose: "Justificación", description: "Descripción", boundaries: "Límites",
      requirements: ["RAN 1"], deliverables: ["Entregable 1"]
    };
    const audit = charterAudit(half);
    expect(audit.pct).toBeGreaterThanOrEqual(15);
    expect(audit.pct).toBeLessThan(80);
    expect(audit.state).not.toBe("verde");
  });
});

describe("schedulePlanAudit", () => {
  it("un plan vacío da rojo", () => {
    expect(schedulePlanAudit(null).state).toBe("rojo");
  });

  it("calendario incompleto (sin horas/día) no cuenta como completo", () => {
    const sp: SchedulePlanModule = { calendar: { workDays: ["lun", "mar"] } };
    const audit = schedulePlanAudit(sp);
    const calItem = audit.items.find((i) => i.id === "calendario");
    expect(calItem?.ok).toBe(false);
  });

  it("calendario con días y horas/día sí cuenta como completo", () => {
    const sp: SchedulePlanModule = { calendar: { workDays: ["lun", "mar", "mie", "jue", "vie"], hoursPerDay: 8 } };
    const audit = schedulePlanAudit(sp);
    expect(audit.items.find((i) => i.id === "calendario")?.ok).toBe(true);
  });
});

describe("raciAudit — restricciones Hard vs. Soft", () => {
  const leaves = wbsLeaves({
    rootId: "root", idCounter: 3,
    nodes: {
      root: { name: "P", children: ["p1", "p2"] },
      p1: { name: "Paquete 1", children: [] },
      p2: { name: "Paquete 2", children: [] }
    }
  } satisfies WbsModule);
  const cols = obsNodes({
    rootId: "root", idCounter: 3,
    nodes: {
      root: { name: "Equipo", children: ["r1", "r2"] },
      r1: { parentId: "root", role: "Director", children: [] },
      r2: { parentId: "root", role: "Rol fantasma", children: [] }
    }
  } satisfies ObsModule);

  it("una fila completamente vacía (HR-01) bloquea la matriz -> rojo / score 0", () => {
    const audit = raciAudit(leaves, cols, { [leaves[0].id]: { [cols[0].id]: "R" } }); // p2 sin ninguna asignación
    expect(audit.hard.HR01.length).toBeGreaterThan(0);
    expect(audit.state).toBe("rojo");
    expect(audit.score).toBe(0);
  });

  it("sin Accountable (HR-02) o con más de uno (HR-03) también bloquea", () => {
    const noA = raciAudit(leaves, cols, {
      [leaves[0].id]: { [cols[0].id]: "R" },
      [leaves[1].id]: { [cols[0].id]: "R" }
    });
    expect(noA.hard.HR02.length).toBe(2);
    expect(noA.state).toBe("rojo");

    const doubleA = raciAudit(leaves, cols, {
      [leaves[0].id]: { [cols[0].id]: "A", [cols[1].id]: "A" },
      [leaves[1].id]: { [cols[0].id]: "A", [cols[1].id]: "R" }
    });
    expect(doubleA.hard.HR03.length).toBe(1);
    expect(doubleA.state).toBe("rojo");
  });

  it("con las 4 hard restrictions satisfechas, el puntaje depende de las soft restrictions", () => {
    const clean = raciAudit(leaves, cols, {
      [leaves[0].id]: { [cols[0].id]: "A", [cols[1].id]: "R" },
      [leaves[1].id]: { [cols[0].id]: "A", [cols[1].id]: "R" }
    });
    expect(clean.hardCount).toBe(0);
    // "Rol fantasma" (cols[1]/r2) SÍ tiene R en ambas filas, así que no es SR-03 aquí.
    expect(clean.state).toBe("verde");
    expect(clean.score).toBeGreaterThanOrEqual(95);
  });

  it("SR-03: un rol sin ninguna R ni A en toda la matriz se marca como 'rol fantasma'", () => {
    // r2 (cols[1]) recibe "C" en ambas filas, nunca R ni A: SR-03 debe
    // detectar que esa columna nunca se usa como responsable/aprobador,
    // sin importar que las hard restrictions (A/R por fila) fallen aparte.
    const audit = raciAudit(leaves, cols, {
      [leaves[0].id]: { [cols[0].id]: "A", [cols[1].id]: "C" },
      [leaves[1].id]: { [cols[0].id]: "A", [cols[1].id]: "C" }
    });
    expect(audit.soft.SR03.map((c) => c.id)).toContain(cols[1].id);
  });

  it("una matriz sin filas (EDT vacía) da estado 'vacio', no rojo", () => {
    expect(raciAudit([], [], {}).state).toBe("vacio");
  });
});

describe("requirementsAudit", () => {
  const charter: CharterModule = { requirements: [{ id: "ran1", code: "RAN.01", text: "Requisito de alto nivel" }] };
  const wbs: WbsModule = {
    rootId: "root", idCounter: 2,
    nodes: { root: { name: "P", children: ["wp1"] }, wp1: { name: "Paquete 1", children: [] } }
  };

  it("sin requisitos y sin RAN, el estado es 'vacio'", () => {
    expect(requirementsAudit({ items: [] } as unknown as RequirementsModule, null, null).state).toBe("vacio");
  });

  it("un requisito trazado a su RAN y a un paquete de la EDT válido da verde", () => {
    const req: RequirementsModule = {
      items: [{ id: "req1", code: "REQ.001", text: "Debe soportar X", sourceRanIds: ["ran1"], wbsNodeIds: ["wp1"] }],
      changes: [], idCounter: 2, changeCounter: 1
    };
    const audit = requirementsAudit(req, charter, wbs);
    expect(audit.ransUncovered).toHaveLength(0);
    expect(audit.tracePct).toBe(100);
    expect(audit.state).toBe("verde");
  });

  it("un requisito sin RAN de origen (emergente) no cubre el RAN existente", () => {
    const req: RequirementsModule = {
      items: [{ id: "req1", code: "REQ.001", text: "Emergente", sourceRanIds: [], wbsNodeIds: ["wp1"] }],
      changes: [], idCounter: 2, changeCounter: 1
    };
    const audit = requirementsAudit(req, charter, wbs);
    expect(audit.reqsWithoutRan).toBe(1);
    expect(audit.ransUncovered.map((r) => r.id)).toContain("ran1");
  });
});

describe("scopeAudit", () => {
  const req: RequirementsModule = {
    items: [{ id: "req1", code: "REQ.001", text: "X" }], changes: [], idCounter: 2, changeCounter: 1
  };
  const wbs: WbsModule = {
    rootId: "root", idCounter: 2,
    nodes: { root: { name: "P", children: ["wp1"] }, wp1: { name: "Paquete 1", children: [], delId: "del1" } }
  };

  it("un entregable con REQ válido, criterio de aceptación y ya descompuesto en la EDT da verde", () => {
    const scope: ScopeStatementModule = {
      deliverables: [{ id: "del1", code: "DEL.01", name: "Entregable", acceptanceCriteria: "Debe cumplir X", reqIds: ["req1"] }],
      idCounter: 2, delCounter: 2
    };
    const audit = scopeAudit(scope, req, {}, wbs);
    expect(audit.delsWithoutReq).toHaveLength(0);
    expect(audit.delsNotDecomposed).toHaveLength(0);
    expect(audit.state).toBe("verde");
  });

  it("un entregable sin ningún REQ que lo justifique es sobre-alcance", () => {
    const scope: ScopeStatementModule = {
      deliverables: [{ id: "del1", code: "DEL.01", name: "Entregable", acceptanceCriteria: "X", reqIds: [] }],
      idCounter: 2, delCounter: 2
    };
    const audit = scopeAudit(scope, req, {}, wbs);
    expect(audit.delsWithoutReq).toHaveLength(1);
    expect(audit.reqsWithoutDel).toHaveLength(1); // el REQ tampoco queda cubierto
  });
});

describe("traceMatrix — cruce fino DEL↔WP", () => {
  // Caso explícito del README: un REQ puede tener su DEL "anfitrión" y su(s)
  // paquete(s) de trabajo, pero si el paquete NO cuelga (por delId, subiendo
  // el árbol) de ESE MISMO entregable, hay una incoherencia que ninguna
  // auditoría por separado detecta.
  const req: RequirementsModule = {
    items: [{ id: "req1", code: "REQ.001", text: "X", sourceRanIds: ["ran1"], wbsNodeIds: ["wp1"] }],
    changes: [], idCounter: 2, changeCounter: 1
  };
  const charter: CharterModule = { requirements: [{ id: "ran1", code: "RAN.01", text: "Y" }] };

  it("coherente: el WP cuelga del mismo DEL que acoge el REQ -> verde", () => {
    const scope: ScopeStatementModule = {
      deliverables: [{ id: "del1", code: "DEL.01", name: "D1", reqIds: ["req1"] }], idCounter: 2, delCounter: 2
    };
    const wbs: WbsModule = {
      rootId: "root", idCounter: 2,
      nodes: { root: { name: "P", children: ["wp1"] }, wp1: { name: "WP1", children: [], delId: "del1" } }
    };
    const m = traceMatrix(req, charter, scope, wbs);
    expect(m.rows[0].state).toBe("verde");
    expect(m.kpi.delWpMismatch).toBe(0);
  });

  it("incoherente: el WP cuelga de un DEL DISTINTO al que acoge el REQ -> ámbar", () => {
    const scope: ScopeStatementModule = {
      deliverables: [
        { id: "del1", code: "DEL.01", name: "D1", reqIds: ["req1"] },
        { id: "del2", code: "DEL.02", name: "D2", reqIds: [] }
      ],
      idCounter: 3, delCounter: 3
    };
    const wbs: WbsModule = {
      rootId: "root", idCounter: 2,
      nodes: { root: { name: "P", children: ["wp1"] }, wp1: { name: "WP1", children: [], delId: "del2" } }
    };
    const m = traceMatrix(req, charter, scope, wbs);
    expect(m.rows[0].flags.delWpMismatch).toBe(true);
    expect(m.rows[0].state).toBe("ambar");
  });

  it("REQ sin entregable o sin paquete es rojo (falta alcance o falta ejecución)", () => {
    const scope: ScopeStatementModule = { deliverables: [], idCounter: 1, delCounter: 1 };
    const wbs: WbsModule = { rootId: "root", idCounter: 1, nodes: { root: { name: "P", children: [] } } };
    const m = traceMatrix(req, charter, scope, wbs);
    expect(m.rows[0].state).toBe("rojo");
    expect(m.rows[0].flags.noDel).toBe(true);
    expect(m.rows[0].flags.noWp).toBe(true);
  });
});
