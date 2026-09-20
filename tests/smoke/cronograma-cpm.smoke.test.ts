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
    expect(report).toMatch(/Auditoría:.*«⇧ Importar desde Excel»/);
    expect(report).toContain("SS+4d"); // token real del enlace L3 (a3→a4, SS, 4 días) del ejemplo
  });

  // ---- Salud de la red y línea base (auditoría metodológica: el CPM servía para planificar, no para controlar) ----
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const vistaControl = async (dom: any) => { (dom.window.document.querySelector('[data-view="control"]') as HTMLElement).click(); await esperar(30); };
  const proyectoConEnlaces = (extra: Record<string, unknown> = {}) => ({
    version: 1, activeId: "p1",
    projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, startDate: "2026-01-05" }, modules: {
      wbs: { rootId: "root", idCounter: 3, nodes: { root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] }, w1: { id: "w1", parentId: "root", name: "Fase 1", children: ["w2"] }, w2: { id: "w2", parentId: "w1", name: "Paquete A", children: [] } } },
      activities: { byLeaf: { w2: [{ id: "a1", name: "Excavar zanja", unit: "m³", qty: 100, perf: 25, teams: 1 }, { id: "a2", name: "Vaciar concreto", unit: "m³", qty: 50, perf: 10, teams: 1 }] }, idCounter: 3 },
      ...extra
    } } }
  });
  const abrirCon = async (seed: unknown) => {
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
    await esperar(800);
    return dom;
  };
  const fijar = async (dom: any, approver: string, extraCheck = false) => {
    const doc = dom.window.document;
    (doc.getElementById("btnBaseline") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("blApprover") as HTMLInputElement).value = approver;
    if (extraCheck) (doc.getElementById("blSponsor") as HTMLInputElement).checked = true;
    (doc.getElementById("blOk") as HTMLElement).click(); await esperar(80);
  };

  it("Salud y línea base (ejemplo): evalúa la red con verificaciones tipo DCMA y la línea base exige motivo y aprobador; el Gantt la marca", async () => {
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", { runScripts: "dangerously", resources: "usable" });
    await esperar(500);
    const doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click(); await esperar(300);
    await vistaControl(dom);
    const t = () => doc.getElementById("ctlWrap")!.textContent!.replace(/\s+/g, " ");
    expect(t()).toMatch(/Salud de la red/);
    expect(t()).toMatch(/\d+ de \d+ verificaciones cumplen/);
    expect(t()).toMatch(/Adelantos \(desfase negativo\).*0 \/ 13.*0.*✓ cumple/);
    expect(t()).toMatch(/Todavía no hay una línea base/);
    expect(t()).toMatch(/Ruta casi crítica \(holgura ≤ 10 d\).*umbral por omisión: el Plan no lo define/);

    (doc.getElementById("btnBaseline") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("blOk") as HTMLElement).click();                               // sin aprobador
    expect(doc.getElementById("blMsg")!.textContent).toMatch(/Registra quién aprueba/);
    (doc.getElementById("blApprover") as HTMLInputElement).value = "Sponsor";
    (doc.getElementById("blOk") as HTMLElement).click(); await esperar(80);
    expect(t()).toMatch(/Línea base del cronograma · LB-1/);
    expect(t()).toMatch(/53 → 53 d.*\+0 d|53 → 53 d/);
    expect(t()).toMatch(/Ninguna actividad cambió/);
    expect(t()).toMatch(/LB-1.*Línea base inicial aprobada.*Sponsor/);
    (doc.querySelector('[data-view="gantt"]') as HTMLElement).click(); await esperar(30);
    expect(doc.getElementById("ganttWrap")!.innerHTML).toMatch(/línea base LB-1/);
    expect(doc.querySelectorAll("#ganttWrap rect[fill='#5b6472']").length).toBeGreaterThan(5);      // una marca por actividad
  });

  it("Línea base (proyecto real): se guarda versionada; el pronóstico se mide contra ella con los umbrales del plan (reserva, holgura); rebaselinar sobre el umbral exige al sponsor", async () => {
    const dom = await abrirCon(proyectoConEnlaces({ schedulePlan: { criticalPath: { nearCriticalThresholdDays: 5 }, scheduleReserve: { pct: 10 }, changeControl: { baselineChangeThresholdPct: 5 } } }));
    const doc = dom.window.document, t = () => doc.getElementById("ctlWrap")!.textContent!.replace(/\s+/g, " ");
    await vistaControl(dom);
    expect(t()).toMatch(/Ruta casi crítica \(holgura ≤ 5 d\)/);                       // el umbral es el del plan, no el de omisión
    expect(t()).not.toMatch(/umbral por omisión/);
    await fijar(dom, "Sponsor");                                                       // sin enlaces: 5 d (a2)
    expect(t()).toMatch(/Línea base del cronograma · LB-1/);
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    let sch = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.schedule;
    expect(sch.baseline).toMatchObject({ version: "LB-1", frozen: true, snapshot: { projectDuration: 5 } });
    expect(sch.baseline.log).toHaveLength(1);

    // el alumno enlaza a1 → a2 (FS): 4 + 5 = 9 d; la línea base sigue diciendo 5
    (doc.getElementById("btnAddLink") as HTMLElement).click(); await esperar(50);
    (doc.getElementById("lkFrom") as HTMLSelectElement).value = "a1"; (doc.getElementById("lkTo") as HTMLSelectElement).value = "a2";
    (doc.getElementById("lkAdd") as HTMLElement).click(); await esperar(100);
    (doc.getElementById("modalCancel") as HTMLElement).click(); await esperar(50);
    expect(doc.getElementById("kpiDur")!.textContent).toBe("9");
    await vistaControl(dom);
    expect(t()).toMatch(/5 → 9 d/);
    expect(t()).toMatch(/\+4 d \(\+80 %\)/);                                           // desplazamiento del fin
    expect(t()).toMatch(/800 %.*reserva de cronograma consumida \(0\.5 d = 10 %\)/);   // la reserva del plan (10 % de 5 d) se consumió 8 veces
    expect(t()).toMatch(/Excavar zanja|Vaciar concreto/);                              // lo que cambió
    expect(t()).toMatch(/Versiones de la línea base/);

    // rebaselinar: la desviación (+80 %) supera el umbral del plan (5 %): exige la autorización del sponsor
    (doc.getElementById("btnBaseline") as HTMLElement).click(); await esperar(30);
    expect(doc.getElementById("blSponsor")).toBeTruthy();
    (doc.getElementById("blReason") as HTMLInputElement).value = "Se enlazó la excavación con el vaciado";
    (doc.getElementById("blApprover") as HTMLInputElement).value = "CCB";
    (doc.getElementById("blOk") as HTMLElement).click();
    expect(doc.getElementById("blMsg")!.textContent).toMatch(/autorización del sponsor/);
    (doc.getElementById("blSponsor") as HTMLInputElement).checked = true;
    (doc.getElementById("blOk") as HTMLElement).click(); await esperar(80);
    expect(t()).toMatch(/Línea base del cronograma · LB-2/);
    expect(t()).toMatch(/Ninguna actividad cambió/);
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    sch = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.schedule;
    expect(sch.baseline.version).toBe("LB-2");
    expect(sch.baseline.log.map((e: any) => e.version)).toEqual(["LB-1", "LB-2"]);         // el historial conserva la versión anterior
    expect(sch.baseline.log[1]).toMatchObject({ reason: "Se enlazó la excavación con el vaciado", approver: "CCB", sponsorAuth: true });
    expect(sch.baseline.log[1].deviationPct).toBeCloseTo(80, 5);
  });

  it("Línea base: sin umbral de rebaselinado en el plan no se exige al sponsor; una «baseline» de un esquema anterior se ignora (sin línea base)", async () => {
    const dom = await abrirCon(proyectoConEnlaces({ schedule: { links: [], linkCounter: 1, import: null, baseline: { frozen: true, version: "v0", date: "2025-01-01" } } }));
    const doc = dom.window.document, t = () => doc.getElementById("ctlWrap")!.textContent!.replace(/\s+/g, " ");
    await vistaControl(dom);
    expect(t()).toMatch(/Todavía no hay una línea base/);                              // lo heredado sin instantánea no cuenta
    await fijar(dom, "Director de Proyecto");
    (doc.getElementById("btnBaseline") as HTMLElement).click(); await esperar(30);
    expect(doc.getElementById("blSponsor")).toBeNull();                                // el plan no define umbral: no hay nada que exigir
    (doc.getElementById("blReason") as HTMLInputElement).value = "Ajuste menor";
    (doc.getElementById("blApprover") as HTMLInputElement).value = "CCB";
    (doc.getElementById("blOk") as HTMLElement).click(); await esperar(80);
    expect(t()).toMatch(/Línea base del cronograma · LB-2/);
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

  it("BUG REPORTADO: si otra pestaña activa un proyecto distinto, agregar un enlace (guardado inmediato, no solo al salir) NO debe sobrescribir ese otro proyecto", async () => {
    // Mismo repro que project-charter.smoke.test.ts, pero para el módulo de
    // mayor exposición: commit() llama gpiPush() en CADA edición (agregar
    // un enlace manual), no solo al cerrar la pestaña.
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto A", course: "GPI", createdAt: 1, updatedAt: 1, startDate: "2026-01-05" },
          modules: {
            wbs: {
              rootId: "root", idCounter: 3,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto A", children: ["w1"] },
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
        },
        p2: {
          schema: "gpi.project/v1",
          meta: { id: "p2", name: "Proyecto B", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: { schedule: { links: [], linkCounter: 1, import: null, baseline: null } }
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

    // Otra pestaña (el Panel de Control) activa el proyecto B, SIN que esta
    // pestaña se recargue -- mismo mecanismo (storage event) que ya usan
    // los E2E de sincronización entre módulos.
    const db2 = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    db2.activeId = "p2";
    dom.window.localStorage.setItem("gpi_db", JSON.stringify(db2));
    dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "gpi_db" }));
    await new Promise((r) => setTimeout(r, 50));

    // El alumno, sin darse cuenta, agrega un enlace manual en esta pestaña
    // (ya desactualizada) -- esto dispara commit() -> gpiPush() de inmediato.
    (doc.getElementById("btnAddLink") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("lkFrom") as HTMLSelectElement).value = "a1";
    (doc.getElementById("lkTo") as HTMLSelectElement).value = "a2";
    (doc.getElementById("lkAdd") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    (doc.getElementById("modalCancel") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    // B (el proyecto activo ahora) nunca debe recibir el enlace de A.
    expect(saved.projects.p2.modules.schedule.links).toEqual([]);
    expect(saved.projects.p2.meta.name).toBe("Proyecto B");
    // A tampoco debe quedar con el enlace "guardado" (el guardado fue
    // rechazado, no silenciosamente redirigido): sigue como se sembró.
    expect(saved.projects.p1.modules.schedule).toBeUndefined();
  });

  // Hallazgo "alta" de revisión externa: la probabilidad de plazo PERT sumaba TODAS
  // las actividades críticas aunque estuvieran en ramas paralelas, y omitía los
  // desfases. Dos actividades paralelas de 10 d (σ² = 1 cada una) hacia un hito:
  // el CPM da 10 d, pero se usaban 20 d de media y se informaba ~0 % de terminar
  // en 10 d. Ahora, con ramas paralelas, no se inventa un número.
  function seedPert(links: unknown[]) {
    return {
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
  const fs = (id: string, from: string, to: string, lag = 0) => ({ id, from, to, type: "FS", lag, lagUnit: "d", source: "manual" });
  async function abrirConPlazo(seed: unknown, plazo: string) {
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seed)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const inp = doc.getElementById("probTarget") as HTMLInputElement;
    inp.value = plazo; inp.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    return doc;
  }

  it("REPRO (alta): dos ramas paralelas de 10 d hacia un hito -- el CPM da 10 d y la probabilidad PERT NO se calcula (antes: media 20 d y ~0 %)", async () => {
    const doc = await abrirConPlazo(seedPert([fs("L1", "a1", "m1"), fs("L2", "a2", "m1")]), "10");
    expect(doc.getElementById("kpiDur")!.textContent).toBe("10");      // el CPM ya era correcto
    const out = doc.getElementById("probOut")!;
    expect(out.querySelector(".p")!.textContent).toBe("—");            // antes: "0%"
    expect(out.querySelector(".z")!.textContent).toMatch(/no aplicable/);
    expect(out.querySelector(".z")!.textContent).toMatch(/paralelas/);
  });

  it("una cadena válida sí da probabilidad y la media incluye el desfase: a1 -FS+3d-> a2 = 10 + 3 + 10 = 23 d (antes: ΣTE = 20, sin el desfase)", async () => {
    const doc = await abrirConPlazo(seedPert([fs("L1", "a1", "a2", 3)]), "23");
    expect(doc.getElementById("kpiDur")!.textContent).toBe("23");
    const out = doc.getElementById("probOut")!;
    expect(out.querySelector(".p")!.textContent).toBe("50%");          // plazo = media -> Z = 0
    expect(out.querySelector(".z")!.textContent).toMatch(/E\[T\]=23/);
    expect(out.querySelector(".z")!.textContent).toMatch(/σ=1\.4/);   // √(1+1)
  });

  it("el modo de duración de la pantalla (Determinística / PERT) no cambia la probabilidad: siempre se evalúa con las duraciones esperadas", async () => {
    const seed = seedPert([fs("L1", "a1", "a2", 3)]);
    const doc = await abrirConPlazo(seed, "26");
    const antes = doc.getElementById("probOut")!.innerHTML;
    (doc.getElementById("durPert") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect(doc.getElementById("probOut")!.innerHTML).toBe(antes);
  });

  // Hallazgo "alta" de revisión externa: los desfases en días TRANSCURRIDOS se
  // convertían con una proporción semanal (lag × 5/7). Un hito el viernes 10/07/2026
  // + 3 días transcurridos es el lunes 13/07 (offset 1), no el martes 14/07 (offset 2).
  function seedEd(startDate: string) {
    return {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, startDate },
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
              byLeaf: { w2: [{ id: "a1", name: "Sucesora", unit: "m³", qty: 20, perf: 10, teams: 1 }] },
              idCounter: 2,
              milestones: [{ id: "m1", code: "H1", name: "Hito del viernes", leafId: "w2" }]
            },
            schedule: { links: [{ id: "L1", from: "m1", to: "a1", type: "FS", lag: 3, lagUnit: "ed", source: "manual" }], linkCounter: 2, import: null, baseline: null }
          }
        }
      }
    };
  }
  async function abrirEd(startDate: string) {
    const dom = await JSDOM.fromURL(base + "Cronograma_CPM.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedEd(startDate))); }
    });
    await new Promise((r) => setTimeout(r, 800));
    return dom.window.document;
  }
  const esOf = (doc: Document, code: string) => {
    const row = Array.from(doc.querySelectorAll("#cpmBody tr.act-row")).find((r) => r.querySelector(".act-name")!.textContent!.includes(code))!;
    return row.querySelectorAll("td")[4].textContent;
  };

  it("REPRO (alta): hito el viernes 10/07/2026 + 3 días transcurridos -> la sucesora arranca en el offset 1 (lunes 13/07), no en el 2 (martes 14/07)", async () => {
    const doc = await abrirEd("2026-07-10");
    expect(esOf(doc, "Sucesora")).toBe("1");                            // antes: "2"
    expect(doc.getElementById("issues")!.textContent).not.toMatch(/aproximada/); // hay fecha de inicio: cálculo real, sin aviso
  });

  it("sin fecha de inicio no hay fechas reales: se conserva la proporción y se avisa que es aproximada", async () => {
    const doc = await abrirEd("");
    expect(doc.getElementById("issues")!.textContent).toMatch(/días transcurridos.*aproximada/);
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
