// Smoke test del módulo Cost-management.html migrado a build TS (Fase 4).
// Servido por HTTP local (no file://): ver el comentario en
// tests/smoke/obs-builder.smoke.test.ts sobre por qué.
//
// Este módulo usa atributos onclick/onchange/oninput INLINE en el HTML
// (no addEventListener), así que main.ts expone explícitamente esas
// funciones en window (Object.assign al final del archivo). Este test
// verifica que ese cableado sobrevive al bundle de Vite.
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

describe("Cost-management.html (migrado a cost.js)", () => {
  it("standalone: calcula el BAC de ejemplo y las funciones onclick inline quedan expuestas en window", async () => {
    const dom = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    // Valores de ejemplo documentados: base 7,100,000 -> BAC 8,075,181 (Clase 3, P70).
    // Moneda por defecto USD (coherente con el CAPEX del caso DISTRIB+ en Charter/
    // Alcance/Cronograma, todos en USD -- ver ARCHITECTURE.md, "Dataset de referencia").
    expect(doc.getElementById("kBAC")!.textContent).toBe("$ 8,075,181");
    expect(doc.querySelectorAll("#coBody tr").length).toBe(2); // SAMPLE_CO

    for (const fn of ["exportJSON", "importJSON", "save", "recalcCont", "onBaseInput", "pullFromWBS", "pullFromCostEstimate", "addCO", "coStatus", "delCO", "buildDoc"]) {
      expect(typeof (dom.window as any)[fn]).toBe("function");
    }

    (doc.getElementById("coDesc") as HTMLInputElement).value = "Prueba";
    (doc.getElementById("coCost") as HTMLInputElement).value = "1000";
    const addBtn = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Agregar")) as HTMLElement;
    addBtn.click(); // dispara onclick="addCO()" -> window.addCO
    expect(doc.querySelectorAll("#coBody tr").length).toBe(3);
  });

  it("regla de oro: no crea la rebanada 'cost' hasta la primera edición real del usuario", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Costos", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 },
          modules: { wbs: { rootId: "root", idCounter: 2, nodes: { root: { name: "P", children: ["w1"] }, w1: { name: "Paquete 1", children: [], cost: 500000 } } } }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Cost-management.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const GPI = (dom.window as any).GPI;

    expect((dom.window.document.getElementById("baseCost") as HTMLInputElement).value).toBe("500000"); // seedFromProject

    (dom.window as any).save();
    expect(GPI.getModule("cost")).toBeNull(); // sin edición real: nada de BAC fantasma

    (dom.window as any).pullFromWBS(); // edición real -> ahora sí persiste
    const saved = GPI.getModule("cost");
    expect(saved).toBeTruthy();
    expect(saved.budget.baseCost).toBe(500000);
  });

  it("pullFromCostEstimate trae el total de Estimar los Costos (Cantidad × Precio unitario), no el rollup del WBS", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Costos", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 },
          modules: {
            wbs: { rootId: "root", idCounter: 2, nodes: { root: { name: "P", children: ["w1"] }, w1: { name: "Paquete 1", children: [], cost: 500000 } } },
            costEstimate: { byLeaf: { w1: { unit: "m³", qty: 2000, unitPrice: 190 } } }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Cost-management.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const GPI = (dom.window as any).GPI;

    (dom.window as any).pullFromCostEstimate();
    const baseCost = (dom.window.document.getElementById("baseCost") as HTMLInputElement).value;
    expect(baseCost).toBe("380000"); // 2000 x 190, no los 500000 del WBS
    expect(GPI.getModule("cost").budget.baseCost).toBe(380000);
  });
});
