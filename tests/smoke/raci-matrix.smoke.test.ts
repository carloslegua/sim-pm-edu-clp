// Smoke test del módulo RACI_Matrix.html migrado a build TS (Fase 4).
// Servido por HTTP local (no file://): ver el comentario en
// tests/smoke/obs-builder.smoke.test.ts sobre por qué (jsdom bloquea
// localStorage bajo file://, a diferencia de los navegadores reales).
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

describe("RACI_Matrix.html (migrado a raci.js)", () => {
  it("sin proyecto activo cae en modo 'sample' con las 18 filas del ejemplo DISTRIB+", async () => {
    const dom = await JSDOM.fromURL(base + "RACI_Matrix.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.getElementById("modeFlag")!.textContent).toContain("Ejemplo independiente");
    expect(doc.querySelectorAll("tr[data-row]").length).toBe(18);
    // El ejemplo trae errores deliberados (ver comentario en main.ts): debe
    // quedar RECHAZADO, no CERTIFICADO -- si algún día da verde, algo se rompió.
    expect(doc.querySelector(".gauge-state")!.textContent).toContain("RECHAZADO");
  });

  it("con WBS/OBS reales activos vincula en modo 'live' y sincroniza R -> WBS.resource", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            wbs: { rootId: "root", idCounter: 3, nodes: { root: { name: "P", children: ["w1"] }, w1: { name: "Paquete 1", children: [], resource: "" } } },
            obs: { rootId: "oroot", idCounter: 2, nodes: { oroot: { id: "oroot", name: "Equipo", children: ["o1"] }, o1: { id: "o1", parentId: "oroot", role: "Responsable X", person: "Ana", type: "core", children: [] } } }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "RACI_Matrix.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.getElementById("modeFlag")!.textContent).toContain("Vinculado a WBS/OBS");
    expect(doc.querySelectorAll("tr[data-row]").length).toBe(1);

    const cell = doc.querySelector('td.cell[data-row="w1"][data-col="o1"]') as HTMLElement;
    cell.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));

    const GPI = (dom.window as any).GPI;
    expect(GPI.getModule("wbs").nodes.w1.resource).toBe("Ana");
    expect(GPI.getModule("raci").assignments.w1).toEqual({ o1: "R" });
  });
});
