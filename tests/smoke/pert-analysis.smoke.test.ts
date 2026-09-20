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

  // Mismo hallazgo "alta" que en Cronograma/CPM: criticalPathStats() sumaba todas
  // las actividades críticas aunque estuvieran en ramas paralelas.
  function seedRamas(links: unknown[]) {
    return {
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
            activities: {
              byLeaf: { w2: [
                { id: "a1", name: "Rama uno", unit: "m³", qty: 100, perf: 10, teams: 1 },
                { id: "a2", name: "Rama dos", unit: "m³", qty: 100, perf: 10, teams: 1 }
              ] },
              idCounter: 3,
              milestones: [{ id: "m1", code: "H1", name: "Hito de cierre", leafId: "w2" }]
            },
            pert: { byActivity: { a1: { o: "7", p: "13" }, a2: { o: "7", p: "13" } }, inputMode: "dias" }, // TE = 10, σ² = 1
            schedule: { links, linkCounter: links.length + 1, import: null, baseline: null }
          }
        }
      }
    };
  }
  const fsLink = (id: string, from: string, to: string, lag = 0) => ({ id, from, to, type: "FS", lag, lagUnit: "d", source: "manual" });
  async function abrirRamas(links: unknown[], plazo: string) {
    const dom = await JSDOM.fromURL(base + "Pert_Analysis.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedRamas(links))); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const inp = doc.getElementById("sbTarget") as HTMLInputElement;
    inp.value = plazo; inp.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    return doc;
  }

  it("REPRO (alta): dos ramas paralelas de 10 d hacia un hito -- la probabilidad PERT NO se calcula (antes: media 20 d y ~0 % de terminar en 10 d)", async () => {
    const doc = await abrirRamas([fsLink("L1", "a1", "m1"), fsLink("L2", "a2", "m1")], "10");
    expect(doc.getElementById("sbCpProb")!.textContent).toBe("—");     // antes: "0.0%"
    expect(doc.getElementById("sbCpTe")!.textContent).toBe("—");
    expect(doc.getElementById("sbCpPath")!.textContent).toMatch(/No aplicable/);
    expect(doc.getElementById("sbCpPath")!.textContent).toMatch(/paralelas/);
  });

  it("una cadena válida sí da probabilidad y la media incluye el desfase: a1 -FS+3d-> a2 = 23 d (antes: 20 d, sin el desfase)", async () => {
    const doc = await abrirRamas([fsLink("L1", "a1", "a2", 3)], "23");
    expect(doc.getElementById("sbCpTe")!.textContent).toBe("23 d");
    expect(doc.getElementById("sbCpProb")!.textContent).toBe("50.0%"); // plazo = media -> Z = 0
    expect(doc.getElementById("sbCpPath")!.textContent).toContain("Ruta crítica (2 act.)");
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

  it("PERT nunca ve hitos: su Id para paquetes/actividades no se ve afectado por ellos (aunque Definir las Actividades/Estimar los Costos sí les asignan un número ahí)", async () => {
    // Mismo seed (EDT + actividades + hito en 'activities') que su
    // equivalente en activity-definition.smoke.test.ts y
    // cost-estimate.smoke.test.ts -- PERT ni siquiera lee
    // "activities.milestones", así que su propia numeración sigue siendo
    // 0,1,2,3,4,5,6 pase lo que pase con los hitos: NO es la misma
    // secuencia que ahora produce Activities/Estimar los Costos para w3/a3
    // (ahí el hito sí consume un número, así que esas dos tablas quedan
    // "corridas" respecto de PERT a partir del hito -- ver ARCHITECTURE.md).
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
