// Dos bugs reales reportados por el usuario en las importaciones .json:
//
// 1) Un proyecto con "schema" reconocido y "meta", pero SIN "modules",
//    se aceptaba tal cual (normalizeToProject() devolvía el objeto sin
//    tocar) -- y cada GPI.getModule(...) posterior (~60 sitios en los
//    13 módulos y en Panel de Control) reventaba con TypeError al leer
//    sobre "modules" undefined.
// 2) Una EDT (o un organigrama OBS) con referencias circulares en
//    "children" se aceptaba intacta, y el primer recorrido recursivo
//    del núcleo sobre esos datos (wbsCodes, wbsLeaves, obsNodes...)
//    entraba en recursión infinita y desbordaba la pila.
//
// Fix en src/core/gpi-core.ts: normalizeToProject() ahora garantiza
// "modules" como objeto (regla ya aplicada por setModule/ingestToolExport,
// que hacían "p.modules = p.modules || {}" pero solo DESPUÉS del primer
// getModule() que ya podía haber reventado); getModule() gana una
// segunda capa de defensa por si igual llega undefined. sanitizeTree()
// -- nueva, usada por detectTool() (import de un solo módulo) y
// normalizeToProject() (import de un proyecto completo) -- poda
// cualquier referencia de "children" que forme un ciclo, apunte a un id
// inexistente, o le dé un segundo padre a un nodo, ANTES de guardar.
import { beforeEach, describe, expect, it } from "vitest";
import {
  KEY, createProject, exportActive, getModule, ingestToolExport,
  importProject, obsNodes, wbsCodes, wbsLeaves
} from "../../src/core/gpi-core";

beforeEach(() => { localStorage.removeItem(KEY); });

describe("importar un proyecto con 'modules' ausente no revienta la lectura", () => {
  it("importProject() con schema/meta reconocidos y sin 'modules' -- getModule()/exportActive() no lanzan", () => {
    const brokenProject = {
      schema: "gpi.project/v1",
      meta: { id: null, name: "Proyecto sin modules", course: "GPI", createdAt: 1, updatedAt: 1 }
      // sin "modules" -- el caso real reportado por el usuario
    };
    expect(() => importProject(brokenProject)).not.toThrow();
    expect(() => getModule("wbs")).not.toThrow();
    expect(getModule("wbs")).toBeNull();
    const exported = exportActive();
    expect(exported).not.toBeNull();
    expect(exported!.modules).toEqual({});

    // El proyecto sigue siendo usable después: setModule real, normal.
    expect(getModule("charter")).toBeNull();
  });

  it("getModule() no revienta aunque 'modules' llegue undefined por otra vía (segunda capa de defensa)", () => {
    createProject({ name: "Proyecto normal" });
    // Simular un proyecto tocado a mano (versión vieja de localStorage,
    // o edición directa) donde "modules" no sobrevivió.
    const db = JSON.parse(localStorage.getItem(KEY) as string);
    const id = db.activeId as string;
    delete db.projects[id].modules;
    localStorage.setItem(KEY, JSON.stringify(db));

    expect(() => getModule("wbs")).not.toThrow();
    expect(getModule("wbs")).toBeNull();
  });
});

describe("una EDT/OBS con referencias circulares no cuelga el núcleo (se poda antes de guardar)", () => {
  it("importProject() con modules.wbs cíclico (A hijo de B y B hijo de A) -- wbsCodes()/wbsLeaves() terminan y no incluyen el ciclo", () => {
    const cyclicProject = {
      schema: "gpi.project/v1",
      meta: { id: null, name: "Proyecto con EDT cíclica", course: "GPI", createdAt: 1, updatedAt: 1 },
      modules: {
        wbs: {
          rootId: "root", idCounter: 3,
          nodes: {
            root: { id: "root", name: "Proyecto", children: ["a"] },
            a: { id: "a", name: "Fase A", children: ["b"] },
            b: { id: "b", name: "Fase B", children: ["a"] } // ciclo: b -> a -> b
          }
        }
      }
    };
    expect(() => importProject(cyclicProject)).not.toThrow();
    const wbs = getModule("wbs");
    expect(wbs).not.toBeNull();

    // El recorrido debe terminar (si hubiera vuelto a colgar, este test
    // nunca llegaría a estas aserciones -- Vitest lo mataría por timeout).
    const codes = wbsCodes(wbs);
    expect(codes.root).toBe("0");
    expect(codes.a).toBe("1");
    // "b" quedó como hijo de "a" (primera referencia alcanzada desde la
    // raíz); la referencia de vuelta de "b" hacia "a" se podó, así que
    // "a" NO vuelve a aparecer como hijo de "b".
    expect(codes.b).toBe("1.1");
    expect(wbsLeaves(wbs).map((r) => r.id)).toEqual(["b"]);
  });

  it("ingestToolExport() con un export de WBS Builder cíclico (import de un solo módulo) -- se poda igual", () => {
    createProject({ name: "Proyecto real" });
    const cyclicWbsExport = {
      rootId: "root", idCounter: 3,
      nodes: {
        root: { id: "root", name: "Proyecto", children: ["a"] },
        a: { id: "a", name: "Fase A", children: ["b"] },
        b: { id: "b", name: "Fase B", children: ["a"] }
      }
    };
    const res = ingestToolExport(cyclicWbsExport);
    expect(res.ok).toBe(true);
    expect(res.module).toBe("wbs");
    const wbs = getModule("wbs");
    expect(wbsCodes(wbs)).toEqual({ root: "0", a: "1", b: "1.1" });
  });

  it("un organigrama OBS cíclico también se poda (obsNodes() termina)", () => {
    createProject({ name: "Proyecto real" });
    const cyclicObsExport = {
      kind: "gpi.obs/v1", idCounter: 3,
      rootId: "root",
      nodes: {
        root: { id: "root", parentId: null, children: ["a"] },
        a: { id: "a", parentId: "root", role: "Rol A", children: ["b"] },
        b: { id: "b", parentId: "a", role: "Rol B", children: ["a"] } // ciclo
      }
    };
    const res = ingestToolExport(cyclicObsExport);
    expect(res.ok).toBe(true);
    expect(res.module).toBe("obs");
    const obs = getModule("obs");
    const rows = obsNodes(obs);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("una referencia 'children' colgante (id que no existe en 'nodes') se descarta sin romper el resto", () => {
    createProject({ name: "Proyecto real" });
    const danglingWbsExport = {
      rootId: "root", idCounter: 2,
      nodes: {
        root: { id: "root", name: "Proyecto", children: ["a", "fantasma"] },
        a: { id: "a", name: "Fase A", children: [] }
      }
    };
    const res = ingestToolExport(danglingWbsExport);
    expect(res.ok).toBe(true);
    const wbs = getModule("wbs");
    expect(wbsLeaves(wbs).map((r) => r.id)).toEqual(["a"]);
  });
});
