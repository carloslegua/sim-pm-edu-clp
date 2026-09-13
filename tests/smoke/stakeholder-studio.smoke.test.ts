// Smoke test del módulo Stakeholder_Studio.html migrado a build TS
// (Fase 4). Servido por HTTP local (no file://): ver el comentario en
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

describe("Stakeholder_Studio.html (migrado a stakeholder-studio.js)", () => {
  it("standalone (sin proyecto activo): arranca con el ejemplo DISTRIB+ (12 interesados) y renderiza las 3 vistas sin errores", async () => {
    const dom = await JSDOM.fromURL(base + "Stakeholder_Studio.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".reg-card").length).toBe(12);
    expect(doc.querySelector(".stat .v")!.textContent).toBe("12");

    (doc.querySelector('[data-view="poderInteres"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelectorAll(".bubble").length).toBe(12);

    (doc.querySelector('[data-view="prominencia"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelectorAll(".bubble").length).toBe(12);
  });

  it("el poder derivado se recalcula en vivo al cambiar un criterio ponderado (5 criterios × pesos por defecto)", async () => {
    const dom = await JSDOM.fromURL(base + "Stakeholder_Studio.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    (doc.querySelector('[data-view="registro"]') as HTMLElement).click();
    (doc.querySelector(".reg-header") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));

    expect(doc.querySelector(".q-power")!.textContent).toBe("95"); // Gerencia General: pos5 res5 net5 veto5 expert4, pesos iguales 20%
    const sel = doc.querySelector('.d-pc[data-crit="res"]') as HTMLSelectElement;
    sel.value = "1";
    sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelector(".q-power")!.textContent).toBe("75"); // (5+1+5+5+4)*20/100=4 -> (4-1)/4*100=75
  });

  it("con proyecto activo real sin interesados aún: arranca en blanco (regla de oro) y persiste en GPI.getModule('stakeholders')", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 }, modules: {} } }
    };
    const dom = await JSDOM.fromURL(base + "Stakeholder_Studio.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".reg-card").length).toBe(1); // blankAnalysis(), no el ejemplo DISTRIB+

    (doc.getElementById("btnAdd") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelectorAll(".reg-card").length).toBe(2);

    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const mod = saved.projects.p1.modules.stakeholders;
    expect(mod.stakeholders.length).toBe(2);
  });
});
