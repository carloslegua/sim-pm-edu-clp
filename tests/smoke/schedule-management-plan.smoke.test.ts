// Smoke test del módulo Schedule_Management_Plan.html migrado a build TS
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

describe("Schedule_Management_Plan.html (migrado a schedule-plan.js)", () => {
  it("standalone (sin proyecto activo): arranca con el ejemplo DISTRIB+ y el checklist RP 38R-06 marca 100%", async () => {
    const dom = await JSDOM.fromURL(base + "Schedule_Management_Plan.html", { runScripts: "dangerously", resources: "usable" });
    const doc = dom.window.document;
    expect((doc.getElementById("intro-objective") as HTMLTextAreaElement).value).toContain("Almacén Logístico DISTRIB+");
    expect(doc.getElementById("sbPct")!.textContent).toBe("100%");
    expect(doc.querySelectorAll("#sbChecklist .chk-item").length).toBeGreaterThan(0);
  });

  it("con proyecto activo real: arranca EN BLANCO (no con el ejemplo), muestra la cobertura RACI vinculada e importa hitos desde la EDT", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, currency: "PEN" },
          modules: {
            wbs: {
              rootId: "root", idCounter: 3,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"], start: "2026-01-01", end: "2026-01-01", cost: 0 },
                w1: { id: "w1", parentId: "root", name: "Fase 1", children: ["w2"], start: "2026-01-05", end: "2026-02-10", cost: 5000 },
                w2: { id: "w2", parentId: "w1", name: "Paquete A", children: [], start: "2026-01-05", end: "2026-02-10", cost: 5000, resource: "" }
              }
            },
            obs: { rootId: "oroot", idCounter: 2, nodes: { oroot: { id: "oroot", name: "Equipo", children: ["o1"] }, o1: { id: "o1", parentId: "oroot", role: "Responsable X", person: "Ana", type: "core", children: [] } } },
            raci: { assignments: { w2: { o1: "R" } } }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Schedule_Management_Plan.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    const doc = dom.window.document;
    expect((doc.getElementById("intro-objective") as HTMLTextAreaElement).value).toBe("");
    expect(doc.getElementById("wbsStatusPanel")!.textContent).toContain("1 fase(s), 1 paquete(s)");
    expect(doc.getElementById("rolesRaciInfoPanel")!.textContent).toContain("1/1 paquetes de trabajo con Responsable");

    const objEl = doc.getElementById("intro-objective") as HTMLTextAreaElement;
    objEl.value = "Objetivo de prueba"; objEl.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));

    (doc.getElementById("btnImportMilestones") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect(doc.querySelectorAll("#mil-table tbody tr").length).toBe(1);

    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const sp = saved.projects.p1.modules.schedulePlan;
    expect(sp.intro.objective).toBe("Objetivo de prueba");
    expect(sp.milestones.length).toBe(1);
    expect(sp.milestones[0].name).toBe("Fin de Fase 1");
  });
});
