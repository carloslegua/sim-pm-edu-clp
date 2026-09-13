// Smoke test del módulo WBS_Builder.html migrado a build TS (Fase 4).
// Servido por HTTP local (no file://): ver el comentario en
// tests/smoke/obs-builder.smoke.test.ts sobre por qué.
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

describe("WBS_Builder.html (migrado a wbs.js)", () => {
  it("standalone: arranca en blanco sin errores", async () => {
    const dom = await JSDOM.fromURL(base + "WBS_Builder.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    expect(dom.window.document.querySelectorAll("#canvas .node").length).toBe(1);
  });

  it("'Cargar ejemplo' construye el árbol DISTRIB+ con el costo total documentado (S/ 7,100,000)", async () => {
    const dom = await JSDOM.fromURL(base + "WBS_Builder.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect(doc.querySelector("#statGrid .stat .v")!.textContent).toBe("S/ 7,100,000");
    expect(doc.querySelectorAll("#canvas .node").length).toBeGreaterThan(20);
  });

  it("un paquete con 'R' en la Matriz RACI bloquea el campo Responsable y lo prellena", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            wbs: {
              rootId: "root", idCounter: 2,
              nodes: {
                root: { id: "root", parentId: null, name: "P", children: ["w1"], duration: 0, cost: 0, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" },
                w1: { id: "w1", parentId: "root", name: "Paquete 1", duration: 5, cost: 1000, resource: "", percent: 0, start: "", end: "", notes: "", children: [], collapsed: false, orientation: "spread" }
              }
            },
            obs: { rootId: "oroot", idCounter: 2, nodes: { oroot: { id: "oroot", name: "Equipo", children: ["o1"] }, o1: { id: "o1", parentId: "oroot", role: "Responsable X", person: "Ana", type: "core", children: [] } } },
            raci: { assignments: { w1: { o1: "R" } } }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "WBS_Builder.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const node = Array.from(doc.querySelectorAll("#canvas .node")).find((n) => n.textContent?.includes("Paquete 1")) as HTMLElement;
    expect(node).toBeTruthy();
    node.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const resourceInput = doc.getElementById("f_resource") as HTMLInputElement;
    expect(resourceInput.disabled).toBe(true);
    expect(resourceInput.value).toBe("Ana");
  });

  it("sin RACI y sin OBS: el Responsable queda deshabilitado y pide crear la OBS primero", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            wbs: {
              rootId: "root", idCounter: 2,
              nodes: {
                root: { id: "root", parentId: null, name: "P", children: ["w1"], duration: 0, cost: 0, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" },
                w1: { id: "w1", parentId: "root", name: "Paquete 1", duration: 5, cost: 1000, resource: "", percent: 0, start: "", end: "", notes: "", children: [], collapsed: false, orientation: "spread" }
              }
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "WBS_Builder.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const node = Array.from(doc.querySelectorAll("#canvas .node")).find((n) => n.textContent?.includes("Paquete 1")) as HTMLElement;
    node.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const el = doc.getElementById("f_resource") as HTMLInputElement;
    expect(el.tagName).toBe("INPUT");
    expect(el.disabled).toBe(true);
    expect(doc.getElementById("propsPanel")!.textContent).toMatch(/Aún no existe la OBS/);
  });

  it("sin RACI pero con OBS: el Responsable es una lista desplegable de \"Cargo — Persona\" del OBS", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            wbs: {
              rootId: "root", idCounter: 2,
              nodes: {
                root: { id: "root", parentId: null, name: "P", children: ["w1"], duration: 0, cost: 0, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" },
                w1: { id: "w1", parentId: "root", name: "Paquete 1", duration: 5, cost: 1000, resource: "", percent: 0, start: "", end: "", notes: "", children: [], collapsed: false, orientation: "spread" }
              }
            },
            obs: { rootId: "oroot", idCounter: 2, nodes: { oroot: { id: "oroot", name: "Equipo", children: ["o1"] }, o1: { id: "o1", parentId: "oroot", role: "Jefe de Ingeniería", person: "Ing. Civil", type: "core", children: [] } } }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "WBS_Builder.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const node = Array.from(doc.querySelectorAll("#canvas .node")).find((n) => n.textContent?.includes("Paquete 1")) as HTMLElement;
    node.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const sel = doc.getElementById("f_resource") as HTMLSelectElement;
    expect(sel.tagName).toBe("SELECT");
    const labels = Array.from(sel.options).map((o) => o.textContent);
    expect(labels).toContain("Jefe de Ingeniería — Ing. Civil");
    sel.value = "Jefe de Ingeniería — Ing. Civil";
    sel.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    // WBS Builder no autoguarda con debounce: persiste en beforeunload/visibilitychange.
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects.p1.modules.wbs.nodes.w1.resource).toBe("Jefe de Ingeniería — Ing. Civil");
  });

  it("con actividades y ruta crítica calculable: las fechas del paquete se toman del Cronograma CPM y quedan de solo lectura", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, startDate: "2026-01-05" },
          modules: {
            wbs: {
              rootId: "root", idCounter: 2,
              nodes: {
                root: { id: "root", parentId: null, name: "P", children: ["w1"], duration: 0, cost: 0, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" },
                w1: { id: "w1", parentId: "root", name: "Paquete 1", duration: 5, cost: 1000, resource: "", percent: 0, start: "2020-01-01", end: "2020-01-02", notes: "", children: [], collapsed: false, orientation: "spread" }
              }
            },
            activities: { byLeaf: { w1: [{ id: "a1", name: "Excavar zanja", unit: "m³", qty: "100", perf: "25", teams: "1" }] }, idCounter: 2 }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "WBS_Builder.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const node = Array.from(doc.querySelectorAll("#canvas .node")).find((n) => n.textContent?.includes("Paquete 1")) as HTMLElement;
    node.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const start = doc.getElementById("f_start") as HTMLInputElement;
    const end = doc.getElementById("f_end") as HTMLInputElement;
    const dur = doc.getElementById("f_duration") as HTMLInputElement;
    expect(start.disabled).toBe(true);
    expect(end.disabled).toBe(true);
    expect(dur.disabled).toBe(true);
    // Las fechas manuales sembradas (2020) quedan reemplazadas por las reales del CPM.
    expect(start.value).not.toBe("2020-01-01");
    expect(start.value).not.toBe("");
    expect(doc.getElementById("propsPanel")!.textContent).toMatch(/Tomado del Cronograma \(CPM\)/);
    expect(doc.getElementById("propsPanel")!.textContent).toMatch(/Estimado.*Este costo se ingresa aquí/);
  });
});
