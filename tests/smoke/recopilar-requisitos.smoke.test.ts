// Smoke test del módulo Recopilar_Requisitos.html migrado a build TS
// (Fase 4). Servido por HTTP local (no file://): ver el comentario en
// tests/smoke/obs-builder.smoke.test.ts sobre por qué.
//
// Este módulo usa atributos onclick/onchange INLINE (varios generados
// dinámicamente en filas/tarjetas), igual que Cost-management.html.
// main.ts expone esas 13 funciones en window al final del archivo.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import jsdomPkg from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { JSDOM } = jsdomPkg;
const MIME: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    try {
      const path = join(process.cwd(), decodeURIComponent((req.url || "/").split("?")[0]));
      const body = readFileSync(path);
      res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  base = `http://127.0.0.1:${port}/`;
});

afterAll(() => { server.close(); });

const ONCLICK_FNS = [
  "openItemEditor", "loadSampleClick", "removeItem", "promoteToRan",
  "freezeBaseline", "rebaseline", "openModEditor", "setActiveMod", "removeMod", "setModStatus", "updateCcr"
];

describe("Recopilar_Requisitos.html (migrado a requirements.js)", () => {
  it("standalone: carga la demo DISTRIB+ (6 requisitos) y expone las 11 funciones onclick inline", async () => {
    const dom = await JSDOM.fromURL(base + "Recopilar_Requisitos.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".rtm tbody tr").length).toBe(6);
    for (const fn of ONCLICK_FNS) expect(typeof (dom.window as any)[fn]).toBe("function");
  });

  it("con proyecto activo sin datos arranca en blanco (regla de oro), y el editor enlaza RAN/interesado/EDT reales", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            charter: { requirements: [{ id: "ranX", code: "RAN.01", text: "Requisito de alto nivel real" }] },
            stakeholders: { stakeholders: [{ id: "sX", name: "Interesado Real", org: "Org", category: "Interno" }], idCounter: 2 },
            wbs: { rootId: "root", idCounter: 2, nodes: { root: { name: "P", children: ["w1"] }, w1: { name: "Paquete Real", children: [] } } }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Recopilar_Requisitos.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".rtm tbody tr").length).toBe(0); // sin datos -> en blanco, no DISTRIB+

    (dom.window as any).openItemEditor(null);
    await new Promise((r) => setTimeout(r, 50));
    const ranBox = doc.querySelector('#ovBody input[data-pick="ran"]') as HTMLInputElement;
    const wbsBox = doc.querySelector('#ovBody input[data-pick="wbs"]') as HTMLInputElement;
    expect(ranBox).toBeTruthy();
    expect(wbsBox).toBeTruthy();

    (doc.getElementById("e_text") as HTMLTextAreaElement).value = "Nuevo requisito de prueba";
    ranBox.checked = true; wbsBox.checked = true;
    (doc.getElementById("e_stk") as HTMLSelectElement).value = "sX";
    (doc.getElementById("ovOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));

    const GPI = (dom.window as any).GPI;
    const saved = GPI.getModule("requirements");
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].sourceRanIds).toEqual(["ranX"]);
    expect(saved.items[0].wbsNodeIds).toEqual(["w1"]);
  });

  it("SEGURIDAD: un id de requisito/modificación importado con marcado HTML no puede inyectar código (XSS reportado por el usuario)", async () => {
    // Repro: un .json de requisitos manipulado (importado vía Panel de
    // Control, o un proyecto sembrado por otra herramienta) con un Id.
    // que contiene marcado HTML. Antes de este fix, ese campo se
    // insertaba SIN escapar dentro de un onclick inline (onclick="openItemEditor('${id}')")
    // -- suficiente para romper el atributo HTML e inyectar un elemento
    // que se ejecuta con solo abrir el módulo, sin ningún clic.
    const XSS_ID = 'x"><img src=x onerror="window.__xssFired=true">';
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            requirements: {
              // baseline congelada: es la condición para que renderMods()
              // pinte los botones de acción de cada modificación (si no,
              // solo muestra un aviso) -- necesario para ejercer también el
              // Id. malicioso de "changes" en este mismo test.
              baseline: { frozen: true, version: "1.0", date: "2026-01-01", approver: "Ana", snapshot: [] },
              items: [{ id: XSS_ID, code: "REQ.001", text: "Requisito malicioso", type: "funcional", priority: "should", status: "propuesto" }],
              changes: [{ id: XSS_ID, code: "MOD.01", date: "2026-01-01", status: "propuesto", summary: "Modificación maliciosa", impact: {} }],
              idCounter: 2, changeCounter: 2
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Recopilar_Requisitos.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;

    // El marcador nunca se ejecutó con solo abrir el módulo -- ni por
    // atributo inyectado ni por un elemento inyectado en el DOM.
    expect((dom.window as any).__xssFired).toBeUndefined();
    expect(doc.querySelectorAll("img[onerror]").length).toBe(0);

    // El Id. malicioso nunca llega a guardarse ni a renderizarse: se
    // valida y se regenera ANTES (normalizeItem/normalizeMod), así que
    // el botón "Editar" existe y sigue funcionando con un Id. seguro,
    // no con el payload.
    const editBtn = doc.querySelector('.icon-btn[title="Editar"][aria-label="Editar requisito"]') as HTMLElement;
    expect(editBtn).toBeTruthy();
    const onclickAttr = editBtn.getAttribute("onclick") || "";
    expect(onclickAttr).not.toContain('"');
    expect(onclickAttr).toMatch(/^openItemEditor\('[A-Za-z0-9_-]+'\)$/);

    const modEditBtn = doc.querySelector('.icon-btn[title="Editar"][aria-label="Editar modificación"]') as HTMLElement;
    expect(modEditBtn).toBeTruthy();
    const modOnclick = modEditBtn.getAttribute("onclick") || "";
    expect(modOnclick).not.toContain('"');
    expect(modOnclick).toMatch(/^openModEditor\('[A-Za-z0-9_-]+'\)$/);
  });

  it("BUG REPORTADO: 'Promover a RAN' no debe agregar el requisito de A al Acta de B si otra pestaña activó B durante la confirmación", async () => {
    // Repro: "Iniciar Promover a RAN en Requisitos de A, cambiar a B y
    // confirmar: el requisito de A se agrega al Acta de B." -- p1 (A) y p2
    // (B) coexisten desde el arranque; Recopilar Requisitos carga con p1
    // activo. El requisito sembrado NO tiene sourceRanIds, así que aparece
    // como "emergente" (con el botón "Promover a RAN").
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto A", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            charter: { requirements: [] },
            requirements: {
              baseline: { frozen: false, version: "1.0", date: "", approver: "", snapshot: [] },
              items: [{ id: "q1", code: "REQ.001", text: "Requisito de A", type: "funcional", priority: "should", status: "propuesto", sourceRanIds: [] }],
              changes: [], idCounter: 2, changeCounter: 1
            }
          }
        },
        p2: {
          schema: "gpi.project/v1",
          meta: { id: "p2", name: "Proyecto B", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            charter: { requirements: [{ id: "ranB1", code: "RAN.01", text: "RAN real de B" }] }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Recopilar_Requisitos.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document, win = dom.window as any;

    // Iniciar "Promover a RAN" -- abre el diálogo de confirmación.
    win.promoteToRan("q1");
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.getElementById("ov")!.classList.contains("open")).toBe(true);

    // Sin cerrar el diálogo, otra pestaña (el Panel de Control) activa B.
    const db2 = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    db2.activeId = "p2";
    dom.window.localStorage.setItem("gpi_db", JSON.stringify(db2));
    dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "gpi_db" }));
    await new Promise((r) => setTimeout(r, 50));

    // El alumno, sin saber que B ya está activo, confirma el diálogo.
    (doc.getElementById("ovOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    // B (el proyecto activo ahora) NUNCA debe recibir el RAN de A.
    expect(saved.projects.p2.modules.charter.requirements).toHaveLength(1);
    expect(saved.projects.p2.modules.charter.requirements[0].code).toBe("RAN.01");
    // A tampoco debe corromperse (la escritura, correctamente bloqueada, no
    // debe tocarlo).
    expect(saved.projects.p1.modules.charter.requirements).toHaveLength(0);
  });
});
