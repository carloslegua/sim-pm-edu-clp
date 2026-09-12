// Prioridad 6 de Fase 2: getters derivados de bajo riesgo, pero con
// compatibilidad de esquema antiguo que vale la pena fijar en un test
// (p. ej. charterRans con arreglo de strings vs. objetos {id,code,text}).
import { describe, expect, it } from "vitest";
import {
  costSummary, applyRaciToWbs, charterRans, scopeDeliverables, reqByWbsLeaf,
  wbsDelIds, raciCoverage
} from "../../src/core/gpi-core";
import type { CostModule, WbsModule, RaciModule, ObsModule, CharterModule, ScopeStatementModule, RequirementsModule } from "../../src/core/types";

describe("costSummary", () => {
  it("deriva BAC, presupuesto total y % de contingencia sobre el estimado base", () => {
    const cost: CostModule = {
      estimate: { class: 3 },
      budget: { baseCost: 7100000, computed: { base: 7100000, cont: 852000, bac: 8075181, total: 8478941 } },
      changeOrders: [
        { status: "Aprobada", fund: "Contingencia", cost: 50000 },
        { status: "Aprobada", fund: "Reserva de gestión", cost: 20000 },
        { status: "Pendiente", cost: 5000 }
      ]
    };
    const s = costSummary(cost);
    expect(s.baseCost).toBe(7100000);
    expect(s.bac).toBe(8075181);
    expect(s.total).toBe(8478941);
    expect(s.contingencyPct).toBe(12); // 852000/7100000
    expect(s.approvedAmount).toBe(70000);
    expect(s.fromContingency).toBe(50000);
    expect(s.fromMgmt).toBe(20000);
    expect(s.pending).toBe(1);
    expect(s.estimateClass).toBe(3);
  });

  it("sin datos, hasData es false y todo queda en 0", () => {
    const s = costSummary(null);
    expect(s.hasData).toBe(false);
    expect(s.baseCost).toBe(0);
  });
});

describe("charterRans — compatibilidad de esquema", () => {
  it("acepta el esquema antiguo (arreglo de strings)", () => {
    const rans = charterRans({ requirements: ["Debe soportar 500 pedidos/día", "Debe operar 24/7"] } as CharterModule);
    expect(rans).toEqual([
      { id: "ran1", code: "RAN.01", text: "Debe soportar 500 pedidos/día" },
      { id: "ran2", code: "RAN.02", text: "Debe operar 24/7" }
    ]);
  });

  it("acepta el esquema nuevo (objetos {id,code,text}) y respeta id/code explícitos", () => {
    const rans = charterRans({ requirements: [{ id: "ranX", code: "RAN.9", text: "Custom" }] });
    expect(rans).toEqual([{ id: "ranX", code: "RAN.9", text: "Custom" }]);
  });

  it("descarta entradas vacías o solo espacios", () => {
    const rans = charterRans({ requirements: ["", "   ", "Válido"] } as CharterModule);
    expect(rans).toHaveLength(1);
    expect(rans[0].text).toBe("Válido");
  });
});

describe("scopeDeliverables", () => {
  it("normaliza y codifica DEL.0X, generando ids/códigos por defecto si faltan", () => {
    const scope: ScopeStatementModule = {
      deliverables: [{ id: "", code: "", name: "Almacén construido" } as any],
      idCounter: 1, delCounter: 1
    };
    const dels = scopeDeliverables(scope);
    expect(dels[0].id).toBe("del1");
    expect(dels[0].code).toBe("DEL.01");
    expect(dels[0].ranIds).toEqual([]);
  });
});

describe("wbsDelIds", () => {
  it("recolecta los delId presentes en cualquier nodo de la EDT", () => {
    const wbs: WbsModule = {
      rootId: "root", idCounter: 2,
      nodes: { root: { name: "P", children: ["wp1"] }, wp1: { name: "WP1", children: [], delId: "del1" } }
    };
    expect(wbsDelIds(wbs)).toEqual({ del1: true });
  });
});

describe("reqByWbsLeaf", () => {
  it("devuelve los requisitos que referencian un paquete de trabajo dado", () => {
    const req: RequirementsModule = {
      items: [
        { id: "r1", code: "REQ.001", text: "A", wbsNodeIds: ["wp1"] },
        { id: "r2", code: "REQ.002", text: "B", wbsNodeIds: ["wp2"] }
      ],
      changes: [], idCounter: 3, changeCounter: 1
    };
    expect(reqByWbsLeaf(req, "wp1")).toEqual([{ id: "r1", code: "REQ.001", text: "A" }]);
    expect(reqByWbsLeaf(req, "wp-inexistente")).toEqual([]);
  });
});

describe("applyRaciToWbs", () => {
  it("fija el 'resource' de las hojas con Responsable asignado, sin tocar las que no tienen R", () => {
    const wbs: WbsModule = {
      rootId: "root", idCounter: 3,
      nodes: {
        root: { name: "P", children: ["wp1", "wp2"] },
        wp1: { name: "WP1", children: [], resource: "Sin asignar" },
        wp2: { name: "WP2", children: [], resource: "Ya tenía alguien" }
      }
    };
    const obs: ObsModule = {
      rootId: "obsRoot", idCounter: 2,
      nodes: { obsRoot: { name: "Equipo", children: ["r1"] }, r1: { role: "Analista", person: "Ana", children: [] } }
    };
    const raci: RaciModule = { assignments: { wp1: { r1: "R" } } }; // wp2 no tiene R
    const out = applyRaciToWbs(wbs, raci, obs);
    expect(out?.nodes.wp1.resource).toBe("Ana");
    expect(out?.nodes.wp2.resource).toBe("Ya tenía alguien"); // no se toca
  });

  it("sin datos de RACI/OBS, devuelve el WBS clonado sin cambios", () => {
    const wbs: WbsModule = { rootId: "root", idCounter: 1, nodes: { root: { name: "P", children: [] } } };
    const out = applyRaciToWbs(wbs, null, null);
    expect(out).toEqual(wbs);
    expect(out).not.toBe(wbs); // es una copia, no la misma referencia
  });
});

describe("raciCoverage", () => {
  it("cuenta paquetes con/sin Responsable y con Accountable múltiple", () => {
    const wbs: WbsModule = {
      rootId: "root", idCounter: 3,
      nodes: {
        root: { name: "P", children: ["wp1", "wp2"] },
        wp1: { name: "WP1", children: [] },
        wp2: { name: "WP2", children: [] }
      }
    };
    const raci: RaciModule = {
      assignments: {
        wp1: { r1: "R", r2: "A" },
        wp2: { r1: "A", r2: "A" } // dos Accountable
      }
    };
    const cov = raciCoverage(raci, wbs);
    expect(cov.total).toBe(2);
    expect(cov.withR).toBe(1);
    expect(cov.withoutR.map((l) => l.id)).toEqual(["wp2"]);
    expect(cov.multiA.map((l) => l.id)).toEqual(["wp2"]);
  });
});
