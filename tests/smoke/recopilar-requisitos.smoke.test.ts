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
  "exportJSON", "importJSON", "openItemEditor", "loadSampleClick", "removeItem", "promoteToRan",
  "freezeBaseline", "rebaseline", "openModEditor", "setActiveMod", "removeMod", "setModStatus", "updateCcr"
];

describe("Recopilar_Requisitos.html (migrado a requirements.js)", () => {
  it("standalone: carga la demo DISTRIB+ (6 requisitos) y expone las 13 funciones onclick inline", async () => {
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
});
