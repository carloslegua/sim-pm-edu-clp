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
    expect(doc.querySelectorAll("#coBody tr").length).toBe(3); // SAMPLE_CO: riesgo, cambio de alcance, imprevisto

    for (const fn of ["save", "recalcCont", "onBaseInput", "pullFromWBS", "pullFromCostEstimate", "addCO", "coStatus", "delCO", "buildDoc", "coEdit", "coBaseline", "coKindHint", "evalVariance"]) {
      expect(typeof (dom.window as any)[fn]).toBe("function");
    }

    (doc.getElementById("coDesc") as HTMLInputElement).value = "Prueba";
    (doc.getElementById("coCost") as HTMLInputElement).value = "1000";
    (doc.getElementById("coKind") as HTMLSelectElement).value = "riesgo"; // la naturaleza es obligatoria
    const addBtn = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Agregar")) as HTMLElement;
    addBtn.click(); // dispara onclick="addCO()" -> window.addCO
    expect(doc.querySelectorAll("#coBody tr").length).toBe(4);
  });

  // ---- Órdenes de cambio (hallazgo "alta" de revisión externa; PMI: reservas y alcance /
  // presupuesto y línea base). Los textos enseñaban que un cambio de alcance requiere
  // reserva de gestión y "Aprobada" solo actualizaba totales, sin transferencia ni
  // línea base nueva.
  async function abrirStandalone() {
    const dom = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    return dom;
  }
  const change = (dom: any, el: Element) => el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  const rowOf = (doc: Document, id: string) => Array.from(doc.querySelectorAll("#coBody tr")).find((r) => r.querySelector("td")!.textContent === id) as HTMLElement;
  const kpi = (doc: Document, n: number) => doc.querySelectorAll("#coKpis .val")[n].textContent;
  const toast = (doc: Document) => doc.getElementById("gpiToast")?.textContent || "";
  function setStatus(dom: any, doc: Document, id: string, value: string) {
    const sel = rowOf(doc, id).querySelector("select") as HTMLSelectElement;
    sel.value = value; change(dom, sel);
  }
  function setApproval(dom: any, doc: Document, id: string, approver: string, sponsor: boolean) {
    const r = rowOf(doc, id);
    const inp = r.querySelector('input[data-f="approver"]') as HTMLInputElement; inp.value = approver; change(dom, inp);
    const chk = r.querySelector('input[data-f="sponsorAuth"]') as HTMLInputElement | null;
    if (chk) { chk.checked = sponsor; change(dom, chk); }
  }

  it("REPRO (alta): los textos ya NO enseñan que un cambio de alcance requiere reserva de gestión; distinguen tres situaciones", async () => {
    const doc = (await abrirStandalone()).window.document;
    const flow = doc.querySelector(".flow")!.textContent as string;
    expect(flow).not.toMatch(/cambio de alcance \(requiere reserva de gestión/i);
    expect(flow).toMatch(/riesgo materializado/i);
    expect(flow).toMatch(/trabajo imprevisto dentro del alcance/i);
    expect(flow).toMatch(/no decide por sí sola/i);
    expect(doc.getElementById("p4")!.textContent).not.toMatch(/Reserva de gestión \(cambio de alcance, requiere sponsor\)/);
    expect(Array.from(doc.querySelectorAll("#coFund option")).map((o) => o.textContent)).toEqual(["Contingencia", "Reserva de gestión", "Financiamiento adicional"]);
  });

  // ---- Auditoría metodológica (PMI): el flujo enseñaba "rojo = orden de cambio obligatoria".
  it("REPRO (auditoría PMI): una variación fuera de umbral ya NO se equipara con una orden de cambio; el flujo incluye pronosticar y decidir la respuesta", async () => {
    const doc = (await abrirStandalone()).window.document;
    const p4 = doc.getElementById("p4")!.textContent as string, p1 = doc.getElementById("p1")!.textContent as string; // los umbrales viven en la pestaña 1
    expect(p4).not.toMatch(/orden de cambio obligatoria/i);
    expect(p1 + p4).not.toMatch(/Escalamiento · orden de cambio/);
    expect(p1).toMatch(/Escalamiento · decisión del sponsor \/ CCB/);
    expect(p4).toMatch(/Ningún nivel es, por sí solo, una orden de cambio/);
    const steps = Array.from(doc.querySelectorAll(".flow h4")).map((h) => h.textContent);
    expect(steps.indexOf("Decidir la respuesta")).toBeGreaterThan(steps.indexOf("Analizar la causa raíz y actualizar el pronóstico"));
    expect(steps.indexOf("Decidir la respuesta")).toBeLessThan(steps.indexOf("Registrar la solicitud de cambio")); // primero se decide, después se registra
  });

  it("'Evaluar una variación' clasifica contra los umbrales y explica la respuesta; rojo NO exige una orden de cambio", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    const set = (id: string, v: string) => { const el = doc.getElementById(id) as HTMLInputElement; el.value = v; el.dispatchEvent(new dom.window.Event("input", { bubbles: true })); };
    const out = () => doc.getElementById("varOut")!.textContent as string;
    expect(out()).toMatch(/Ingresa un valor/);
    set("varCpi", "1.02");                                            // umbrales por defecto: 0.95 / 0.90
    expect(out()).toMatch(/Verde — dentro de tolerancia/);
    set("varCpi", "0.93");
    expect(out()).toMatch(/Ámbar — alerta/);
    expect(out()).toMatch(/La línea base no cambia/);
    set("varCpi", "0.85");
    expect(out()).toMatch(/Rojo — escalamiento/);
    expect(out()).toMatch(/Escalar al sponsor \/ CCB/);
    expect(out()).toMatch(/no obliga por sí sola a registrar una orden de cambio/);
    set("varCpi", "1.0"); set("varCv", "-120000");                    // el peor de los indicadores manda
    expect(out()).toMatch(/CPI: Verde/); expect(out()).toMatch(/CV: Rojo/);
    set("varCpi", ""); set("varCv", "");
    expect(out()).toMatch(/Ingresa un valor/);
  });

  it("umbrales incoherentes (escalar menos grave que alertar) se avisan", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    const box = doc.getElementById("thrMsg") as HTMLElement;
    expect(box.style.display).toBe("none");
    const esc = doc.getElementById("cpiEsc") as HTMLInputElement; esc.value = "0.97"; esc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(box.style.display).toBe("block");
    expect(box.textContent).toMatch(/CPI: el umbral de escalamiento \(0\.97\)/);
    esc.value = "0.90"; esc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(box.style.display).toBe("none");
  });

  it("REPRO (alta): aprobar una orden exige quién aprueba y la autorización del sponsor; y NO cambia la línea base (BAC vigente) hasta incorporarla", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    expect(kpi(doc, 0)).toBe("$ 8,075,181");                           // BAC vigente = inicial
    setStatus(dom, doc, "OC-003", "Aprobada");                          // imprevisto con reserva de gestión, sin aprobador ni sponsor
    expect((rowOf(doc, "OC-003").querySelector("select") as HTMLSelectElement).value).toBe("Pendiente");
    expect(toast(doc)).toMatch(/quién aprueba/);
    expect(toast(doc)).toMatch(/autorización expresa del sponsor/);

    setApproval(dom, doc, "OC-003", "Comité de cambios", true);
    setStatus(dom, doc, "OC-003", "Aprobada");
    expect((rowOf(doc, "OC-003").querySelector("select") as HTMLSelectElement).value).toBe("Aprobada");
    // aprobar RESERVA la reserva de gestión, pero la línea base sigue igual:
    expect(kpi(doc, 0)).toBe("$ 8,075,181");                            // BAC vigente: sin cambio (antes: nadie lo distinguía)
    expect(kpi(doc, 1)).toBe("$ 90,000");                               // aprobado, pendiente de incorporar
    expect(kpi(doc, 3)).toBe("$ 313,759");                              // reserva disponible: 403,759 - 90,000
    expect(doc.getElementById("blBody")!.textContent).toMatch(/Sin cambios de línea base/);

    // incorporación EXPLÍCITA: crea LB-1 y sube el BAC
    (rowOf(doc, "OC-003").querySelector('button[onclick^="coBaseline"]') as HTMLElement).click();
    expect(kpi(doc, 0)).toBe("$ 8,165,181");                            // + 90,000
    expect(kpi(doc, 1)).toBe("$ 0");
    expect(doc.getElementById("blBody")!.textContent).toMatch(/LB-1.*OC-003.*8,075,181.*8,165,181.*Comité de cambios/);
    expect((rowOf(doc, "OC-003").querySelector("select") as HTMLSelectElement).disabled).toBe(true); // ya forma parte de la línea base
    (rowOf(doc, "OC-003").querySelector('button[onclick^="delCO"]') as HTMLElement).click();
    expect(rowOf(doc, "OC-003")).toBeTruthy();                          // no se puede eliminar
    expect(toast(doc)).toMatch(/ya forma parte de la línea base LB-1/);
  });

  it("un cambio de alcance no se aprueba con contingencia; con fondos adicionales y sponsor sí (no exige reserva de gestión) y sube BAC y total", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    // OC-002 (ampliación del cliente = cambio de alcance) parte con Financiamiento adicional
    setApproval(dom, doc, "OC-002", "Sponsor", true);
    setStatus(dom, doc, "OC-002", "Aprobada");
    expect((rowOf(doc, "OC-002").querySelector("select") as HTMLSelectElement).value).toBe("Aprobada");
    expect(kpi(doc, 3)).toBe("$ 403,759");                              // la reserva de gestión NO se tocó
    (rowOf(doc, "OC-002").querySelector('button[onclick^="coBaseline"]') as HTMLElement).click();
    expect(kpi(doc, 0)).toBe("$ 8,315,181");                            // + 240,000

    // un cambio de alcance propuesto con contingencia se rechaza al aprobar
    (doc.getElementById("coDesc") as HTMLInputElement).value = "Nueva bodega";
    (doc.getElementById("coCost") as HTMLInputElement).value = "5000";
    (doc.getElementById("coKind") as HTMLSelectElement).value = "alcance";
    (doc.getElementById("coFund") as HTMLSelectElement).value = "Contingencia";
    (Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Agregar")) as HTMLElement).click();
    setApproval(dom, doc, "OC-004", "CCB", false);
    setStatus(dom, doc, "OC-004", "Aprobada");
    expect((rowOf(doc, "OC-004").querySelector("select") as HTMLSelectElement).value).toBe("Pendiente");
    expect(toast(doc)).toMatch(/no se financia con contingencia/);
  });

  it("registrar una orden exige clasificarla, y cada orden muestra su efecto presupuestario", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    (doc.getElementById("coDesc") as HTMLInputElement).value = "Sin clasificar";
    (Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Agregar")) as HTMLElement).click();
    expect(doc.querySelectorAll("#coBody tr").length).toBe(3);          // no se agregó
    expect(toast(doc)).toMatch(/Clasifica el cambio/);
    expect(rowOf(doc, "OC-001").textContent).toMatch(/BAC sin cambio · contingencia −180,000\.00/);
    expect(rowOf(doc, "OC-003").textContent).toMatch(/BAC \+90,000\.00 al incorporar · reserva de gestión −90,000\.00 · total sin cambio/);
    expect(rowOf(doc, "OC-002").textContent).toMatch(/BAC \+240,000\.00 al incorporar · total \+240,000\.00/);
  });

  it("compatibilidad: un proyecto guardado con órdenes antiguas (sin naturaleza ni aprobación) abre igual; las pendientes exigen clasificarse; la versión de línea base persiste", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Costos", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 },
          modules: {
            cost: {
              meta: { module: "cost_management_plan", version: 2 },
              budget: { baseCost: 1000000, mgmtReservePct: 5, contingency: { method: "Simulación Monte Carlo", percentile: "P70" } },
              changeOrders: [
                { id: "OC-001", desc: "Antigua aprobada", cause: "R-01", cost: 50000, fund: "Contingencia", status: "Aprobada" },
                { id: "OC-002", desc: "Antigua pendiente", cause: "R-02", cost: 20000, fund: "Reserva de gestión", status: "Pendiente" }
              ]
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Cost-management.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document, win = dom.window as any;
    expect(doc.querySelectorAll("#coBody tr").length).toBe(2);
    expect(rowOf(doc, "OC-001").textContent).toMatch(/Sin clasificar/);
    expect(doc.getElementById("coTotal")!.textContent).toBe("$ 50,000.00"); // mismos totales que antes

    setApproval(dom, doc, "OC-002", "CCB", true);
    setStatus(dom, doc, "OC-002", "Aprobada");
    expect((rowOf(doc, "OC-002").querySelector("select") as HTMLSelectElement).value).toBe("Pendiente");
    expect(toast(doc)).toMatch(/clasifica la orden/);

    // guardado con sesión: la rebanada conserva las órdenes y nunca borra campos
    win.save();
    const saved = win.GPI.getModule("cost");
    expect(saved.changeOrders.length).toBe(2);
    expect(saved.baselineLog).toEqual([]);
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

  it("pullFromCostEstimate trae el total de Estimar los Costos (suma de Cantidad × Precio unitario por actividad), no el rollup del WBS", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Costos", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 },
          modules: {
            wbs: { rootId: "root", idCounter: 2, nodes: { root: { name: "P", children: ["w1"] }, w1: { name: "Paquete 1", children: [], cost: 500000 } } },
            activities: { byLeaf: { w1: [{ id: "a1", name: "Movimiento de tierras", unit: "m³", qty: 2000, perf: 190, teams: 1 }] }, idCounter: 2 },
            costEstimate: { byActivity: { a1: 190 } }
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

  it("BUG REPORTADO (media): con cuota agotada la pantalla NO dice 'Sincronizado con el Panel' -- el estado sale del resultado real de la escritura", async () => {
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
    const win = dom.window as any;

    // Cuota agotada: solo la escritura de "gpi_db" falla (la sonda de
    // disponibilidad de 1 byte sigue funcionando, como en un navegador real).
    const realSetItem = win.Storage.prototype.setItem;
    win.Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === "gpi_db") throw new win.DOMException("Quota exceeded", "QuotaExceededError");
      return realSetItem.call(this, k, v);
    };

    win.pullFromWBS(); // edición real -> intenta guardar
    const txt = win.document.getElementById("saveTxt").textContent as string;
    expect(txt).not.toMatch(/Sincronizado/);
    expect(txt).toMatch(/SIN guardar/);
    expect(win.GPI.hasUnsavedChanges()).toBe(true); // el núcleo sí conservó el cambio en memoria
  });
});
