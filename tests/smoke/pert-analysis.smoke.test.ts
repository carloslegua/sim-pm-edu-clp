// Smoke test del módulo Pert_Analysis.html migrado a build TS (Fase 4).
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

describe("Pert_Analysis.html (migrado a pert.js)", () => {
  it("sin proyecto activo (localStorage vacío vía HTTP): arranca en blanco, sin errores", async () => {
    const dom = await JSDOM.fromURL(base + "Pert_Analysis.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.getElementById("modeChip")!.textContent).toBe("Actividades del proyecto");
    expect(doc.querySelectorAll("#actsBody tr").length).toBe(0);
  });

  it("modo ejemplo DISTRIB+: detecta la terna O>M>P inválida de a8 y calcula la probabilidad PERT sobre la ruta crítica (TE, no duración determinística)", async () => {
    const dom = await JSDOM.fromURL(base + "Pert_Analysis.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 200));
    expect(doc.getElementById("modeChip")!.textContent).toBe("MODO EJEMPLO");
    expect(doc.querySelectorAll(".act-row").length).toBe(12);
    expect(doc.querySelectorAll(".row-invalid").length).toBe(1);
    expect((doc.getElementById("sbInvalid") as HTMLElement).style.display).not.toBe("none");
    // ruta crítica calculada sobre TE (probabilística), con probabilidad de cumplimiento > 0
    const prob = doc.getElementById("sbCpProb")!.textContent as string;
    expect(prob.endsWith("%")).toBe(true);
    expect(parseFloat(prob)).toBeGreaterThan(0);
    expect(doc.getElementById("sbCpPath")!.innerHTML).toContain("Ruta crítica");
  });

  it("con proyecto activo real: la M sigue en automático a la Dur base, TE se calcula con O/P ingresados y persiste en GPI.getModule('pert')", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            wbs: {
              rootId: "root", idCounter: 3,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
                w1: { id: "w1", parentId: "root", name: "Fase 1", children: ["w2"] },
                w2: { id: "w2", parentId: "w1", name: "Paquete A", children: [] }
              }
            },
            activities: { byLeaf: { w2: [{ id: "a1", name: "Excavar zanja", unit: "m³", qty: 100, perf: 25, teams: 1 }] }, idCounter: 2 }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Pert_Analysis.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".act-row").length).toBe(1);
    expect(doc.querySelector(".durbase")!.textContent).toBe("4"); // 100/(1×25) = 4
    const mInput = doc.querySelector('input[data-act="a1"][data-f="m"]') as HTMLInputElement;
    expect(mInput.value).toBe("4");
    expect(mInput.classList.contains("m-auto")).toBe(true);

    const oInput = doc.querySelector('input[data-act="a1"][data-f="o"]') as HTMLInputElement;
    const pInput = doc.querySelector('input[data-act="a1"][data-f="p"]') as HTMLInputElement;
    oInput.value = "2"; oInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    pInput.value = "8"; pInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));

    const teCell = doc.querySelector('[data-der="te"]') as HTMLElement;
    expect(teCell.textContent).toBe("4.3"); // (2+4*4+8)/6 = 4.333...

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const pertMod = saved.projects.p1.modules.pert;
    expect(pertMod.byActivity.a1.o).toBe("2");
    expect(pertMod.byActivity.a1.p).toBe("8");
    expect(pertMod.byActivity.a1.mAuto).toBe(true);
  });

  it("el Id de cada fila coincide con el de Definir las Actividades/Estimar los Costos para la misma EDT (los hitos, que PERT no procesa, no corren la numeración)", async () => {
    // Mismo seed (EDT + actividades + hito en 'activities') que su
    // equivalente en activity-definition.smoke.test.ts y
    // cost-estimate.smoke.test.ts -- PERT ni siquiera lee
    // "activities.milestones", así que su numeración ya no se ve afectada
    // por hitos; este test confirma que el resultado (0,1,2,3,4,5,6) es
    // exactamente el mismo Id que ven esos otros dos módulos.
    const seedWithMilestone = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            wbs: {
              rootId: "root", idCounter: 4,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
                w1: { id: "w1", parentId: "root", name: "Fase 1", children: ["w2", "w3"] },
                w2: { id: "w2", parentId: "w1", name: "Paquete A", children: [] },
                w3: { id: "w3", parentId: "w1", name: "Paquete B", children: [] }
              }
            },
            activities: {
              byLeaf: {
                w2: [{ id: "a1", name: "Actividad 1", unit: "m³", qty: 10, perf: 5, teams: 1 }, { id: "a2", name: "Actividad 2", unit: "m³", qty: 10, perf: 5, teams: 1 }],
                w3: [{ id: "a3", name: "Actividad 3", unit: "m³", qty: 10, perf: 5, teams: 1 }]
              },
              idCounter: 4,
              milestones: [{ id: "m1", code: "H1", name: "Hito intermedio", leafId: "w2" }]
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Pert_Analysis.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedWithMilestone)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const rows = Array.from(doc.querySelectorAll("#actsBody tr"));
    const idOf = (row: Element) => row.querySelector(".n-cell")!.textContent;
    expect(rows.map(idOf)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });
});
