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

    // El reporte imprimible trae Predecesoras (con datos reales del ejemplo,
    // que sí tiene enlaces) y Auditoría (en "—" porque el ejemplo nunca pegó
    // un cronograma real de MS Project) -- ambas explicadas en una leyenda,
    // no solo como columnas vacías o sin contexto.
    try { (doc.getElementById("btnReport") as HTMLElement).click(); } catch (_) { /* window.print() no implementado en jsdom */ }
    const report = doc.getElementById("gpiReport")!.innerHTML;
    expect(report).toContain("Predecesoras");
    expect(report).toContain("Auditoría");
    expect(report).toMatch(/Predecesoras:.*Id\. de red/);
    expect(report).toMatch(/Auditoría:.*«📋 Pegar cronograma»/);
    expect(report).toContain("SS+4d"); // token real del enlace L3 (a3→a4, SS, 4 días) del ejemplo
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

  it("Cronograma-CPM ahora sí ve los hitos: su Id (netId) coincide con Definir las Actividades/Estimar los Costos", async () => {
    // Mismo seed (EDT + actividades + hito en 'activities') que
    // activity-definition/cost-estimate.smoke.test.ts -- esos dos módulos
    // ya verifican la secuencia sin saltos 0,1,2,3,4,5,6,7 con el hito
    // ocupando el 5 (ver ARCHITECTURE.md, "El 'Id.' de Definir las
    // Actividades..."). Cronograma-CPM ahora arma su fullRowsSnapshot()
    // con el mismo criterio (placeLooseMilestones(), hito atado a w2), así
    // que debe coincidir Id. por Id. -- ya no le falta la fila del hito ni
    // corre el resto de las filas.
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
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedWithMilestone)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const rows = Array.from(doc.querySelectorAll("#cpmBody tr"));
    const idOf = (row: Element) => row.querySelector(".n-cell")!.textContent;
    expect(rows.map(idOf)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
    const msRow = rows[5]; // Id. 5 = el hito, justo después de a1(3)/a2(4), antes de w3(6)/a3(7)
    expect(msRow.className).toMatch(/milestone-row/);
    expect(msRow.querySelector(".code-cell")!.textContent).toMatch(/◆\s*H1/);
    expect(msRow.querySelectorAll("td")[3].textContent).toBe("0"); // columna Duración: 0 por definición
  });

  it("un hito es un nodo CPM real: duración 0, ES=EF, y propaga la fecha de fin de su predecesora a su sucesora", async () => {
    // Verifica lo que quedó sin probar a nivel unitario en GPI.util.cpm():
    // un nodo dur=0 encadenado como sucesor Y predecesor de actividades
    // reales calcula ES=EF y traslada la fecha sin desfase -- ver también
    // el caso nuevo en tests/unit/cpm.test.ts.
    const seedWithMilestone = {
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
                { id: "a1", name: "Excavar zanja", unit: "m³", qty: 100, perf: 25, teams: 1 }, // dur = ceil(100/25) = 4
                { id: "a2", name: "Vaciar concreto", unit: "m³", qty: 50, perf: 10, teams: 1 } // dur = ceil(50/10) = 5
              ] }, idCounter: 3,
              milestones: [{ id: "m1", code: "H1", name: "Fin de excavación", leafId: "w2" }]
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedWithMilestone)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;

    // a1 -> hito -> a2, enlace manual (mismo flujo de "＋ Enlace manual" que usaría un alumno)
    (doc.getElementById("btnAddLink") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("lkFrom") as HTMLSelectElement).value = "a1";
    (doc.getElementById("lkTo") as HTMLSelectElement).value = "m1";
    (doc.getElementById("lkAdd") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("lkFrom") as HTMLSelectElement).value = "m1";
    (doc.getElementById("lkTo") as HTMLSelectElement).value = "a2";
    (doc.getElementById("lkAdd") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalCancel") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));

    expect(doc.getElementById("kpiDur")!.textContent).toBe("9"); // 4 (a1) + 0 (hito) + 5 (a2)
    const rows = Array.from(doc.querySelectorAll("#cpmBody tr.act-row"));
    const cellsOf = (row: Element) => Array.from(row.querySelectorAll("td")).map((td) => td.textContent!.trim());
    const msRow = rows.filter((r) => r.className.indexOf("milestone-row") >= 0)[0];
    expect(msRow).toBeTruthy();
    const msCells = cellsOf(msRow);
    expect(msCells[4]).toBe("4"); // ES del hito = EF de a1
    expect(msCells[5]).toBe("4"); // EF del hito = ES (duración 0)
    const a2Row = rows.filter((r) => r.textContent!.indexOf("Vaciar concreto") >= 0)[0];
    expect(cellsOf(a2Row)[4]).toBe("4"); // ES de a2 = EF del hito, sin desfase
    expect(cellsOf(a2Row)[5]).toBe("9"); // EF de a2 = 4 + 5
  });

  it("'⇩ Cargar ejemplo en el proyecto' SÍ agrega enlaces al proyecto activo real, emparejando por Código EDT + nombre de actividad", async () => {
    // A diferencia de "Modo ejemplo" (sandbox chico y congelado, ver el
    // primer test de este archivo), esta acción resuelve SAMPLE_LINK_PLAN
    // (código+nombre) contra la EDT/actividades REALES -- ver el
    // comentario de loadSampleIntoProject() en cronograma-cpm/main.ts. La
    // EDT sembrada aquí reproduce el código "4.2" del caso DISTRIB+ con un
    // nombre de fase/paquete DISTINTO a propósito (el emparejamiento es
    // por código, no por nombre de paquete), y solo dos actividades reales
    // bajo ese paquete -- "Excavación de zanjas para zapatas" y "Solado de
    // concreto e=10 cm" -- que en SAMPLE_LINK_PLAN están unidas por un
    // enlace FS dentro del paquete 4.2. Ningún otro enlace del plan puede
    // resolver (le faltan las demás actividades), así que debe quedar
    // exactamente ese enlace.
    const seedLive = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, startDate: "2026-01-05" },
          modules: {
            wbs: {
              rootId: "root", idCounter: 8,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto Live", children: ["f1", "f2", "f3", "f4"] },
                f1: { id: "f1", parentId: "root", name: "Fase 1", children: ["p11"] },
                p11: { id: "p11", parentId: "f1", name: "Paquete 1.1", children: [] },
                f2: { id: "f2", parentId: "root", name: "Fase 2", children: ["p21"] },
                p21: { id: "p21", parentId: "f2", name: "Paquete 2.1", children: [] },
                f3: { id: "f3", parentId: "root", name: "Fase 3", children: ["p31"] },
                p31: { id: "p31", parentId: "f3", name: "Paquete 3.1", children: [] },
                f4: { id: "f4", parentId: "root", name: "Fase Cualquiera", children: ["p41", "p42"] },
                p41: { id: "p41", parentId: "f4", name: "Paquete 4.1", children: [] },
                p42: { id: "p42", parentId: "f4", name: "Paquete con otro nombre", children: [] }
              }
            },
            activities: {
              byLeaf: { p42: [
                { id: "x1", name: "Excavación de zanjas para zapatas", unit: "m³", qty: 620, perf: 60, teams: 2 },
                { id: "x2", name: "Solado de concreto e=10 cm", unit: "m²", qty: 480, perf: 120, teams: 1 }
              ] }, idCounter: 3
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedLive)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    (doc.getElementById("btnLoadSampleLive") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect((doc.getElementById("modalOverlay") as HTMLElement).classList.contains("open")).toBe(true);
    expect((doc.getElementById("modalMsg") as HTMLElement).textContent).toMatch(/PROYECTO ACTIVO/);
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 200));

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const sch = saved.projects.p1.modules.schedule;
    expect(sch.links).toHaveLength(1);
    expect(sch.links[0]).toMatchObject({ from: "x1", to: "x2", type: "FS" });
    expect(doc.getElementById("modeChip")!.textContent).toBe("Proyecto"); // sigue en modo "live", no "sample"
  });

  it("'⇩ Cargar ejemplo en el proyecto' avisa si la EDT del proyecto activo está vacía", async () => {
    const seedNoWbs = {
      version: 1, activeId: "p1",
      projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 }, modules: {} } }
    };
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedNoWbs)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    (doc.getElementById("btnLoadSampleLive") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect((doc.getElementById("modalMsg") as HTMLElement).textContent).toMatch(/EDT del proyecto activo está vacía/);
  });

  it("'⇩ Cargar ejemplo en el proyecto' avisa si el proyecto activo todavía no tiene actividades", async () => {
    const seedNoActs = {
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
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedNoActs)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    (doc.getElementById("btnLoadSampleLive") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect((doc.getElementById("modalMsg") as HTMLElement).textContent).toMatch(/todavía no tiene actividades/);
  });
});
