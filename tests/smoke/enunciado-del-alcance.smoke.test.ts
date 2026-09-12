// Smoke test del módulo Enunciado_del_Alcance.html migrado a build TS
// (Fase 4). Servido por HTTP local (no file://): ver el comentario en
// tests/smoke/obs-builder.smoke.test.ts sobre por qué.
//
// Este módulo usa addEventListener/.onclick= exclusivamente (como
// OBS/RACI, no como Cost-management/Recopilar_Requisitos), así que no
// requiere exponer nada en window.
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

describe("Enunciado_del_Alcance.html (migrado a scope-statement.js)", () => {
  it("standalone: muestra el banner de modo independiente y carga la demo DISTRIB+ (6 entregables)", async () => {
    const dom = await JSDOM.fromURL(base + "Enunciado_del_Alcance.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.getElementById("banner")!.classList.contains("show")).toBe(true);
    expect(doc.querySelectorAll("table.del tbody tr").length).toBe(6);
  });

  it("con proyecto activo arranca en blanco (regla de oro) y 'Sugerir desde el Acta' persiste en GPI", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            charter: { requirements: [{ id: "ranX", code: "RAN.01", text: "RAN real" }], deliverables: ["Entregable clave del Acta"] },
            requirements: { items: [{ id: "q1", code: "REQ.001", text: "Requisito real", sourceRanIds: ["ranX"], wbsNodeIds: [] }], changes: [], idCounter: 2, changeCounter: 1 },
            wbs: { rootId: "root", idCounter: 2, nodes: { root: { name: "P", children: ["w1"] }, w1: { name: "Paquete Real", children: [] } } }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Enunciado_del_Alcance.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.querySelectorAll("table.del tbody tr").length).toBe(0); // sin datos -> en blanco

    (doc.getElementById("btnSuggestDels") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelectorAll("table.del tbody tr").length).toBe(1);

    const GPI = (dom.window as any).GPI;
    const saved = GPI.getModule("scopeStatement");
    expect(saved.deliverables).toHaveLength(1);
  });
});
