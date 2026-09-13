// Smoke test del módulo Project_Charter.html migrado a build TS (Fase 4).
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

describe("Project_Charter.html (migrado a project-charter.js)", () => {
  it("standalone (sin proyecto activo): arranca vacía (0%) y 'Cargar ejemplo' lleva el checklist DISTRIB+ a 100%", async () => {
    const dom = await JSDOM.fromURL(base + "Project_Charter.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    expect(doc.getElementById("sbPct")!.textContent).toBe("0%");

    (doc.getElementById("btnSample") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));

    expect((doc.querySelector('[data-bind="identification.sponsor"]') as HTMLInputElement).value).toBe("Gerencia General DISTRIB+");
    expect(doc.getElementById("sbPct")!.textContent).toBe("100%");
    expect(doc.querySelectorAll(".ran-code").length).toBe(4);
    expect(doc.querySelectorAll("#tblObjectives tbody tr").length).toBe(4);
  });

  it("con proyecto activo real: precarga sponsor/director/CAPEX desde los metadatos comunes, e importa hitos desde la EDT e interesados clave desde Stakeholder Studio", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, sponsor: "Ana Sponsor", manager: "Beto Manager", capex: 500000, currency: "PEN" },
          modules: {
            wbs: {
              rootId: "root", idCounter: 3,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
                w1: { id: "w1", parentId: "root", name: "Fase 1", children: [], start: "2026-01-05", end: "2026-02-10", cost: 5000 }
              }
            },
            stakeholders: {
              stakeholders: [
                { name: "Interesado Alto", org: "Org A", role: "Sponsor", power: 90, interest: 80, notes: "Nota A" },
                { name: "Interesado Bajo", org: "Org B", role: "Observador", power: 10, interest: 10, notes: "Nota B" }
              ], idCounter: 3
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Project_Charter.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect((doc.querySelector('[data-bind="identification.sponsor"]') as HTMLInputElement).value).toBe("Ana Sponsor");
    expect((doc.querySelector('[data-bind="identification.manager"]') as HTMLInputElement).value).toBe("Beto Manager");
    expect((doc.querySelector('[data-bind="budget.amount"]') as HTMLInputElement).value).toBe("500000");

    (doc.getElementById("btnImportMilestones") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect(doc.querySelectorAll("#tblMilestones tbody tr").length).toBe(1);

    (doc.getElementById("btnImportStakeholders") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    // solo el interesado con poder e interés >= 50 (cuadrante "gestionar de cerca") se importa
    expect(doc.querySelectorAll("#tblStakeholders tbody tr").length).toBe(1);

    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const ch = saved.projects.p1.modules.charter;
    expect(ch.milestones.length).toBe(1);
    expect(ch.milestones[0].name).toBe("Fin de Fase 1");
    expect(ch.stakeholders.length).toBe(1);
    expect(ch.stakeholders[0].name).toBe("Interesado Alto");
  });
});
