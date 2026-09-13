// Smoke test del módulo Cronograma_CPM.html migrado a build TS (Fase 4).
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

describe("Cronograma_CPM.html (migrado a cronograma-cpm.js)", () => {
  it("modo ejemplo DISTRIB+: reproduce el resultado dorado del README (53 días, fin 2026-09-16, 9 actividades críticas) y renderiza Red/Gantt sin errores", async () => {
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 300));

    expect(doc.getElementById("kpiDur")!.textContent).toBe("53");
    expect(doc.getElementById("kpiCrit")!.textContent).toBe("9");
    expect(doc.getElementById("kpiFinish")!.textContent).toBe("2026-09-16");
    expect(doc.querySelectorAll("tr.act-row.crit").length).toBe(9);
    expect(doc.getElementById("cycleBanner")!.classList.contains("show")).toBe(false);

    (doc.querySelector('[data-view="red"]') as HTMLElement).click();
    (doc.querySelector('[data-view="gantt"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelector("#netWrap svg")).toBeTruthy();
    expect(doc.querySelector("#ganttWrap svg")).toBeTruthy();
  });

  it("con proyecto activo real: un enlace manual FS entre dos actividades ajusta la duración del proyecto y persiste en GPI.getModule('schedule')", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, startDate: "2026-01-05" },
          modules: {
            wbs: {
              rootId: "root", idCounter: 3,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
                w1: { id: "w1", parentId: "root", name: "Fase 1", children: ["w2"] },
                w2: { id: "w2", parentId: "w1", name: "Paquete A", children: [] }
              }
            },
            activities: {
              byLeaf: { w2: [
                { id: "a1", name: "Excavar zanja", unit: "m³", qty: 100, perf: 25, teams: 1 },
                { id: "a2", name: "Vaciar concreto", unit: "m³", qty: 50, perf: 10, teams: 1 }
              ] }, idCounter: 3
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".act-row").length).toBe(2);
    // sin enlaces: la duración del proyecto es la de la actividad más larga (a2 = 50/10 = 5)
    expect(doc.getElementById("kpiDur")!.textContent).toBe("5");

    (doc.getElementById("btnAddLink") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("lkFrom") as HTMLSelectElement).value = "a1";
    (doc.getElementById("lkTo") as HTMLSelectElement).value = "a2";
    (doc.getElementById("lkAdd") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    (doc.getElementById("modalCancel") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));

    // a1 (dur=4) -> a2 (dur=5) en FS: duración total = 4+5 = 9
    expect(doc.getElementById("kpiDur")!.textContent).toBe("9");
    expect(doc.getElementById("kpiLinks")!.textContent).toBe("1");

    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const sch = saved.projects.p1.modules.schedule;
    expect(sch.links.length).toBe(1);
    expect(sch.links[0]).toMatchObject({ from: "a1", to: "a2", type: "FS" });
  });
});
