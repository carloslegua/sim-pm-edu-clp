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
    const addBtn = doc.querySelector('button[onclick="addCO()"]') as HTMLElement;
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
    const sel = rowOf(doc, id).querySelector("select[data-i]:not([data-f])") as HTMLSelectElement;   // el de ESTADO (una orden por riesgo tiene además el de riesgo vinculado)
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
    expect((estadoSel(doc, "OC-003")).value).toBe("Pendiente");
    expect(toast(doc)).toMatch(/quién aprueba/);
    expect(toast(doc)).toMatch(/autorización expresa del sponsor/);

    setApproval(dom, doc, "OC-003", "Comité de cambios", true);
    setStatus(dom, doc, "OC-003", "Aprobada");
    expect((estadoSel(doc, "OC-003")).value).toBe("Aprobada");
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
    expect((estadoSel(doc, "OC-003")).disabled).toBe(true); // ya forma parte de la línea base
    (rowOf(doc, "OC-003").querySelector('button[onclick^="delCO"]') as HTMLElement).click();
    expect(rowOf(doc, "OC-003")).toBeTruthy();                          // no se puede eliminar
    expect(toast(doc)).toMatch(/ya forma parte de la línea base LB-1/);
  });

  // ---- Política de reservas (plan de riesgos): quién libera la contingencia según el monto, y alerta de agotamiento ----
  const registrarOrden = (dom: any, doc: Document, cost: string, kind = "imprevisto", fund = "Contingencia") => {
    (doc.getElementById("coDesc") as HTMLInputElement).value = "Orden de prueba";
    (doc.getElementById("coKind") as HTMLSelectElement).value = kind;
    (doc.getElementById("coFund") as HTMLSelectElement).value = fund;
    fijar(dom, doc, "coCost", cost, "input");
    (doc.querySelector('button[onclick="addCO()"]') as HTMLElement).click();
  };
  const nivel = (dom: any, doc: Document, id: string, v: string) => { const s = rowOf(doc, id).querySelector('select[data-f="authLevel"]') as HTMLSelectElement; s.value = v; s.dispatchEvent(new dom.window.Event("change", { bubbles: true })); };

  it("política de reservas: una orden a contingencia solo la aprueba el nivel de autoridad que corresponde a su monto (Director de Proyecto → CCB → Sponsor)", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    // ejemplo: hasta 50.000 el Director de Proyecto, hasta 250.000 el CCB, por encima el sponsor
    fijar(dom, doc, "coCost", "180000", "input");
    expect(doc.getElementById("coPolicyHint")!.textContent).toMatch(/una orden de \$ 180,000\.00 con cargo a contingencia la autoriza el CCB/);
    expect(doc.getElementById("coPolicyHint")!.textContent).toMatch(/hasta \$ 50,000\.00: Director de Proyecto · hasta \$ 250,000\.00: CCB · por encima: Sponsor/);
    fijar(dom, doc, "coFund", "Reserva de gestión");
    expect(doc.getElementById("coPolicyHint")!.textContent).toMatch(/fuera de la línea base: la autoriza siempre el Sponsor/);
    fijar(dom, doc, "coFund", "Contingencia");

    registrarOrden(dom, doc, "180000");                                                 // OC-004
    expect(rowOf(doc, "OC-004").textContent).toMatch(/Política de reservas: requiere CCB/);
    setApproval(dom, doc, "OC-004", "Director de Proyecto", false);
    setStatus(dom, doc, "OC-004", "Aprobada");
    expect(estadoSel(doc, "OC-004").value).toBe("Pendiente");                          // el PM no puede liberar 180.000
    expect(toast(doc)).toMatch(/la autoriza el CCB.*la aprobación registrada es del Director de Proyecto/);
    nivel(dom, doc, "OC-004", "ccb");                                                   // el nivel explícito manda sobre el texto del aprobador
    setStatus(dom, doc, "OC-004", "Aprobada");
    expect(estadoSel(doc, "OC-004").value).toBe("Aprobada");
    expect(kpi(doc, 2)).toBe("$ 492,000");                                              // contingencia disponible: 672.000 − 180.000

    registrarOrden(dom, doc, "300000");                                                 // > 250.000: solo el sponsor
    expect(rowOf(doc, "OC-005").textContent).toMatch(/requiere Sponsor/);
    setApproval(dom, doc, "OC-005", "CCB", false);
    setStatus(dom, doc, "OC-005", "Aprobada");
    expect(estadoSel(doc, "OC-005").value).toBe("Pendiente");
    expect(toast(doc)).toMatch(/la autoriza el Sponsor/);

    registrarOrden(dom, doc, "30000");                                                  // ≤ 50.000: basta el Director de Proyecto
    setApproval(dom, doc, "OC-006", "Director de Proyecto", false);
    setStatus(dom, doc, "OC-006", "Aprobada");
    expect(estadoSel(doc, "OC-006").value).toBe("Aprobada");
  });

  it("política de reservas: la orden aprobada conserva su nivel de autoridad y la ya aprobada de antes no se vuelve a juzgar", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    expect(rowOf(doc, "OC-001").textContent).toMatch(/Política de reservas: requiere CCB/);   // 180.000 aprobada por el CCB
    expect((rowOf(doc, "OC-001").querySelector('select[data-f="authLevel"]') as HTMLSelectElement).value).toBe("ccb");
    expect((rowOf(doc, "OC-001").querySelector('select[data-f="authLevel"]') as HTMLSelectElement).disabled).toBe(true);   // aprobada: no se edita
    (dom.window as any).buildDoc();
    expect(doc.getElementById("doc")!.textContent).toMatch(/Política de reservas \(plan de riesgos\)/);
    expect(doc.getElementById("doc")!.textContent).toMatch(/hasta \$ 50,000\.00: Director de Proyecto · hasta \$ 250,000\.00: CCB · por encima: Sponsor/);
    expect(doc.getElementById("doc")!.textContent).toMatch(/OC-001[\s\S]*Aprobada · CCB \(CCB\)/);
  });

  it("política de reservas: alerta de agotamiento cuando la contingencia disponible baja del umbral (25 % de la inicial)", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    expect(doc.getElementById("coDrawdown")!.textContent).toMatch(/Contingencia disponible: 78\.9 % de la inicial \(umbral de alerta 25 %\)/);
    expect(doc.getElementById("coDrawdown")!.textContent).not.toMatch(/Alerta de agotamiento/);
    registrarOrden(dom, doc, "500000");                                                 // 672.000 − 500.000 = 172.000 = 20,2 % de 852.000
    setApproval(dom, doc, "OC-004", "Sponsor", false);
    nivel(dom, doc, "OC-004", "sponsor");
    setStatus(dom, doc, "OC-004", "Aprobada");
    expect(estadoSel(doc, "OC-004").value).toBe("Aprobada");
    expect(doc.getElementById("coDrawdown")!.textContent).toMatch(/Alerta de agotamiento.*\$ 172,000.*20\.2 % de la inicial.*umbral de 25 %/);
  });

  it("política de reservas: la define el plan de riesgos del proyecto; sin ella (o sin límites) la aprobación es la de siempre", async () => {
    const orden = { id: "OC-001", desc: "Refuerzo", cause: "x", cost: 5000, fund: "Contingencia", status: "Pendiente", kind: "imprevisto", approver: "CCB", sponsorAuth: false };
    const conPolitica = await abrirConectado({ ...costoConRangos([orden]), risks: { plan: { reserves: { pmLimit: 1000, ccbLimit: 2000 } }, risks: [] } });
    setStatus(conPolitica, conPolitica.window.document, "OC-001", "Aprobada");
    expect(estadoSel(conPolitica.window.document, "OC-001").value).toBe("Pendiente");                   // 5.000 > 2.000: solo el sponsor
    expect(toast(conPolitica.window.document)).toMatch(/la autoriza el Sponsor \(hasta 1000: Director de Proyecto · hasta 2000: CCB · por encima: Sponsor\)/);
    const sinPolitica = await abrirConectado({ ...costoConRangos([orden]), risks: { plan: {}, risks: [] } });
    setStatus(sinPolitica, sinPolitica.window.document, "OC-001", "Aprobada");
    expect(estadoSel(sinPolitica.window.document, "OC-001").value).toBe("Aprobada");                    // sin límites: como antes
    expect(sinPolitica.window.document.querySelector('select[data-f="authLevel"]')).toBeNull();          // y no se pide un nivel que nadie exige
  });

  it("un cambio de alcance no se aprueba con contingencia; con fondos adicionales y sponsor sí (no exige reserva de gestión) y sube BAC y total", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    // OC-002 (ampliación del cliente = cambio de alcance) parte con Financiamiento adicional
    setApproval(dom, doc, "OC-002", "Sponsor", true);
    setStatus(dom, doc, "OC-002", "Aprobada");
    expect((estadoSel(doc, "OC-002")).value).toBe("Aprobada");
    expect(kpi(doc, 3)).toBe("$ 403,759");                              // la reserva de gestión NO se tocó
    (rowOf(doc, "OC-002").querySelector('button[onclick^="coBaseline"]') as HTMLElement).click();
    expect(kpi(doc, 0)).toBe("$ 8,315,181");                            // + 240,000

    // un cambio de alcance propuesto con contingencia se rechaza al aprobar
    (doc.getElementById("coDesc") as HTMLInputElement).value = "Nueva bodega";
    (doc.getElementById("coCost") as HTMLInputElement).value = "5000";
    (doc.getElementById("coKind") as HTMLSelectElement).value = "alcance";
    (doc.getElementById("coFund") as HTMLSelectElement).value = "Contingencia";
    (doc.querySelector('button[onclick="addCO()"]') as HTMLElement).click();
    setApproval(dom, doc, "OC-004", "CCB", false);
    setStatus(dom, doc, "OC-004", "Aprobada");
    expect((estadoSel(doc, "OC-004")).value).toBe("Pendiente");
    expect(toast(doc)).toMatch(/no se financia con contingencia/);
  });

  it("registrar una orden exige clasificarla, y cada orden muestra su efecto presupuestario", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    (doc.getElementById("coDesc") as HTMLInputElement).value = "Sin clasificar";
    (doc.querySelector('button[onclick="addCO()"]') as HTMLElement).click();
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
    expect((estadoSel(doc, "OC-002")).value).toBe("Pendiente");
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

  // ---- Contingencia por rangos + Monte Carlo (auditoría metodológica AACE): se ofrecía
  // «Simulación Monte Carlo» pero se calculaba una tabla fija de % por clase y percentil.
  const estadoSel = (doc: Document, id: string) => rowOf(doc, id).querySelector("select[data-i]:not([data-f])") as HTMLSelectElement;   // el de estado (el de nivel de autoridad y el de riesgo llevan data-f)
  const dinero = (s: string | null | undefined) => Number(String(s || "").replace(/[^0-9.-]/g, ""));
  const fijar = (dom: any, doc: Document, id: string, v: string, ev = "change") => { const el = doc.getElementById(id) as HTMLInputElement | HTMLSelectElement; el.value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };
  const filaRango = (doc: Document, i: number) => doc.querySelectorAll("#rngBody tr")[i] as HTMLElement;
  const celdaRng = (doc: Document, i: number, f: string) => filaRango(doc, i).querySelector(`input[data-f="${f}"]`) as HTMLInputElement;
  const eventos = (dom: any, doc: Document, on: boolean) => { const c = doc.getElementById("rngRisks") as HTMLInputElement; c.checked = on; c.dispatchEvent(new dom.window.Event("change", { bubbles: true })); };
  const filaP = (doc: Document, q: number) => Array.from(doc.querySelectorAll("#rngResults table")[0].querySelectorAll("tbody tr")).find((r) => r.querySelector("td")!.textContent!.startsWith("P" + q)) as HTMLElement;

  it("REPRO (auditoría AACE): el selector ya NO ofrece «Simulación Monte Carlo» como rótulo de una tabla; cada método es lo que dice ser", async () => {
    const doc = (await abrirStandalone()).window.document;
    const opts = Array.from(doc.querySelectorAll("#contMethod option")).map((o) => o.textContent);
    expect(opts).toEqual([
      "Estimación por rangos + simulación Monte Carlo (AACE 41R-08)",
      "Referencia por clase y percentil (tabla didáctica, no normativa)",
      "Porcentaje manual definido por el equipo"
    ]);
    expect(doc.getElementById("p3")!.textContent).not.toMatch(/según los rangos de exactitud de AACE 18R-97/);
    // por defecto conserva la referencia (y el BAC dorado), pero rotulada como lo que es:
    expect((doc.getElementById("contMethod") as HTMLSelectElement).value).toBe("clase_tabla");
    expect(doc.getElementById("kBAC")!.textContent).toBe("$ 8,075,181");
    expect(doc.getElementById("contPctHint")!.textContent).toMatch(/referencia didáctica.*no proviene de una norma de AACE/);
    expect(doc.getElementById("rangeCard")!.style.display).toBe("none");
  });

  it("rangos + Monte Carlo: simula de verdad (contingencia = P70 − base), los percentiles crecen, y el resultado es reproducible", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    expect(doc.getElementById("rangeCard")!.style.display).toBe("block");
    expect(doc.querySelectorAll("#rngBody tr").length).toBe(5);                      // las 5 fases de DISTRIB+
    expect(doc.getElementById("rngFoot")!.textContent).toMatch(/Cubren el 100\.0 % del costo base/);
    // cobertura completa, todo fundamentado, ρ = 30 %: los únicos avisos son los propios de incluir los eventos
    // (doble conteo con los rangos, doble conteo de costos que dependen del tiempo, costo de las respuestas)
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/Doble conteo/);
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/Costo del plazo: el rango de costo de cada riesgo debe incluir solo costos DIRECTOS/);
    expect(doc.getElementById("rngWarn")!.querySelectorAll("li").length).toBeLessThanOrEqual(3);

    const base = 7100000, cont = dinero(doc.getElementById("kCont")!.textContent);
    const p50 = dinero(filaP(doc, 50).children[1].textContent), p70 = dinero(filaP(doc, 70).children[1].textContent), p90 = dinero(filaP(doc, 90).children[1].textContent);
    expect(cont).toBeCloseTo(p70 - base, -1);                                        // kCont = P70 − Σ más probable (a la unidad de redondeo)
    expect(cont).toBeGreaterThan(0);
    expect(p50).toBeLessThan(p70); expect(p70).toBeLessThan(p90);
    expect(dinero(doc.getElementById("kBAC")!.textContent)).toBeCloseTo(base + cont + dinero(doc.getElementById("kEsc")!.textContent), -1);   // BAC = base + contingencia + escalación
    expect(cont / base).toBeGreaterThan(0.07); expect(cont / base).toBeLessThan(0.12);                                                         // ≈ 9 % (partidas + eventos): un resultado del análisis, no el 12 % de la tabla
    expect(doc.getElementById("rngSvg")!.querySelectorAll("path").length).toBe(1);   // curva S
    expect(doc.getElementById("rngResults")!.textContent).toMatch(/10,000 iteraciones · correlación 30 % · semilla 20260713/);

    // reproducible: recalcular sin cambiar nada da exactamente lo mismo
    (dom.window as any).recalcCont();
    expect(dinero(doc.getElementById("kCont")!.textContent)).toBe(cont);
  });

  it("el percentil de decisión y la correlación mueven la contingencia en el sentido correcto; con ρ = 0 se avisa la subestimación", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    const c = () => dinero(doc.getElementById("kCont")!.textContent);
    fijar(dom, doc, "contPct", "P50"); const c50 = c();
    fijar(dom, doc, "contPct", "P90"); const c90 = c();
    expect(c90).toBeGreaterThan(c50);
    fijar(dom, doc, "contPct", "P80");
    fijar(dom, doc, "corrPct", "0"); const rho0 = c();
    fijar(dom, doc, "corrPct", "100"); const rho100 = c();
    expect(rho100).toBeGreaterThan(rho0);                                            // más correlación = más dispersión = más contingencia al mismo percentil
    fijar(dom, doc, "corrPct", "0");
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/Correlación 0 %.*SUBESTIMA/);
    const sens = Array.from(doc.querySelectorAll("#rngResults table")[1].querySelectorAll("tbody tr")).map((r) => dinero(r.children[1].textContent));
    expect(sens.length).toBe(4);
    for (let i = 1; i < 4; i++) expect(sens[i]).toBeGreaterThan(sens[i - 1]);        // tabla de sensibilidad a la correlación
  });

  it("valida las partidas: un rango incoherente se señala y queda fuera de la simulación; una partida sin costo no se agrega", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    const antes = dinero(doc.getElementById("kCont")!.textContent);
    const lo = celdaRng(doc, 3, "lowPct"); lo.value = "5"; lo.dispatchEvent(new dom.window.Event("change", { bubbles: true })); // mínimo POR ENCIMA del más probable
    expect(filaRango(doc, 3).textContent).toMatch(/el mínimo debe estar entre −100 % y 0 %/);
    expect(filaRango(doc, 3).className).toMatch(/rng-bad/);
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/1 partida\(s\) con datos inválidos quedan fuera/);
    expect(dinero(doc.getElementById("kCont")!.textContent)).not.toBe(antes);
    fijar(dom, doc, "rngName", "Sin costo"); fijar(dom, doc, "rngMl", "0");
    (doc.querySelector('button[onclick="addRange()"]') as HTMLElement).click();
    expect(doc.querySelectorAll("#rngBody tr").length).toBe(5);
    expect(doc.getElementById("gpiToast")!.textContent).toMatch(/costo más probable mayor que cero/);
  });

  it("agregar una partida sin rango usa el de la clase, y sin fundamento se avisa; borrar todas deja la contingencia en 0", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    fijar(dom, doc, "rngName", "Nueva bodega"); fijar(dom, doc, "rngMl", "100000");
    (doc.querySelector('button[onclick="addRange()"]') as HTMLElement).click();
    expect(doc.querySelectorAll("#rngBody tr").length).toBe(6);
    expect(celdaRng(doc, 5, "lowPct").value).toBe("-15"); expect(celdaRng(doc, 5, "highPct").value).toBe("30");   // clase 3
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/1 de 6 partida\(s\) sin fundamento/);
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/suman 7,200,000 \(101\.4 % del costo base/);
    eventos(dom, doc, false);                                                        // sin eventos: solo las partidas
    for (let i = 0; i < 6; i++) (doc.querySelector('#rngBody button[onclick^="delRange"]') as HTMLElement).click();
    expect(doc.querySelectorAll("#rngBody tr")[0].textContent).toMatch(/Sin partidas/);
    expect(dinero(doc.getElementById("kCont")!.textContent)).toBe(0);
    expect(doc.getElementById("contPctHint")!.textContent).toMatch(/la contingencia es 0 hasta definirlas/);
    // con los eventos incluidos, aun sin partidas la exposición de los riesgos abiertos se contempla (estimado base 0 en el análisis)
    eventos(dom, doc, true);
    expect(dinero(doc.getElementById("kCont")!.textContent)).toBeGreaterThan(0);
  });

  it("método manual: % del estimado base con fundamento; oculta el percentil", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "manual");
    fijar(dom, doc, "manualPct", "8");
    expect(dinero(doc.getElementById("kCont")!.textContent)).toBe(568000);           // 8 % de 7.100.000
    expect(doc.getElementById("manualWrap")!.style.display).toBe("block");
    expect(doc.getElementById("contPctWrap")!.style.display).toBe("none");
    expect(doc.getElementById("kContCap")!.textContent).toBe("manual");
    expect(doc.getElementById("contPctHint")!.textContent).toMatch(/definida por el equipo/);
  });

  it("compatibilidad: un proyecto que declaraba «Simulación Monte Carlo» (pero calculaba la tabla) abre con los MISMOS montos, rotulado como referencia didáctica y con aviso", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Costos", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 },
          modules: { cost: {
            meta: { module: "cost_management_plan", version: 2 }, estimate: { class: 3 },
            budget: { baseCost: 1000000, mgmtReservePct: 5, contingency: { method: "Simulación Monte Carlo", percentile: "P70", rate: 0.12 } },
            changeOrders: []
          } }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); } });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect((doc.getElementById("contMethod") as HTMLSelectElement).value).toBe("clase_tabla");
    expect(dinero(doc.getElementById("kCont")!.textContent)).toBe(120000);          // clase 3 · P70 = 12 % (igual que antes)
    expect(doc.getElementById("contPctHint")!.textContent).toMatch(/declaraba «Simulación Monte Carlo», pero lo que se calculaba era esta referencia/);
    expect(doc.getElementById("rangeCard")!.style.display).toBe("none");
  });

  it("persiste en el proyecto: método, correlación, partidas con su fundamento y el resumen de resultados; recargar los conserva", async () => {
    const seedDb = { version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Costos", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 }, modules: {} } } };
    const dom = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); } });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document, win = dom.window as any;
    fijar(dom, doc, "baseCost", "300000", "input");
    fijar(dom, doc, "contMethod", "rangos_mc");
    fijar(dom, doc, "rngName", "Obra civil"); fijar(dom, doc, "rngMl", "200000"); fijar(dom, doc, "rngLo", "-10"); fijar(dom, doc, "rngHi", "40"); fijar(dom, doc, "rngBasis", "Cotización de 3 contratistas");
    (doc.querySelector('button[onclick="addRange()"]') as HTMLElement).click();
    fijar(dom, doc, "rngName", "Equipos"); fijar(dom, doc, "rngMl", "100000");
    (doc.querySelector('button[onclick="addRange()"]') as HTMLElement).click();
    fijar(dom, doc, "corrPct", "50");
    const guardado = win.GPI.getModule("cost").budget;
    expect(guardado.contingency).toMatchObject({ method: "rangos_mc", percentile: "P70" });
    expect(guardado.rangeAnalysis.correlation).toBe(0.5);
    expect(guardado.rangeAnalysis.lines.map((l: any) => [l.name, l.ml, l.lowPct, l.highPct, l.basis])).toEqual([["Obra civil", 200000, -10, 40, "Cotización de 3 contratistas"], ["Equipos", 100000, -15, 30, ""]]);
    expect(guardado.rangeAnalysis.results.p70).toBeGreaterThan(300000);
    expect(guardado.contingency.rate).toBeGreaterThan(0);

    const dom2 = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", dom.window.localStorage.getItem("gpi_db")); } });
    await new Promise((r) => setTimeout(r, 800));
    const d2 = dom2.window.document;
    expect((d2.getElementById("contMethod") as HTMLSelectElement).value).toBe("rangos_mc");
    expect(d2.querySelectorAll("#rngBody tr").length).toBe(2);
    expect((d2.getElementById("corrPct") as HTMLInputElement).value).toBe("50");
    expect(dinero(d2.getElementById("kCont")!.textContent)).toBe(dinero(doc.getElementById("kCont")!.textContent));
  });

  it("«Traer partidas de Estimar los Costos»: una partida por paquete de trabajo con el rango de la clase; al volver a traer conserva rango y fundamento", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Costos", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 }, modules: {
        wbs: { rootId: "root", idCounter: 3, nodes: { root: { id: "root", name: "P", children: ["w1", "w2"] }, w1: { id: "w1", name: "Cimentaciones", children: [] }, w2: { id: "w2", name: "Estructura", children: [] } } },
        activities: { byLeaf: { w1: [{ id: "a1", name: "Excavar", unit: "m3", qty: 1000 }, { id: "a2", name: "Vaciar", unit: "m3", qty: 500 }], w2: [{ id: "a3", name: "Montar", unit: "kg", qty: 2000 }] }, idCounter: 4 },
        costEstimate: { byActivity: { a1: 100, a2: 200, a3: 50 } }
      } } }
    };
    const dom = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); } });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document, win = dom.window as any;
    expect(doc.getElementById("pullRngEst")!.style.display).not.toBe("none");        // conectado a un proyecto
    fijar(dom, doc, "contMethod", "rangos_mc");
    expect(doc.querySelectorAll("#rngBody tr")[0].textContent).toMatch(/Sin partidas/);   // un proyecto real arranca SIN partidas (regla de oro)
    win.pullRangesFromEstimate();
    expect(doc.querySelectorAll("#rngBody tr").length).toBe(2);
    expect(celdaRng(doc, 0, "name").value).toMatch(/Cimentaciones/);
    expect(celdaRng(doc, 0, "ml").value).toBe("200000");                             // 1000×100 + 500×200
    expect(celdaRng(doc, 1, "ml").value).toBe("100000");
    expect(celdaRng(doc, 0, "lowPct").value).toBe("-15");                             // rango inicial = clase 3
    const b = celdaRng(doc, 0, "basis"); b.value = "Cotización vigente"; b.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const lo = celdaRng(doc, 0, "lowPct"); lo.value = "-8"; lo.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    win.pullRangesFromEstimate();                                                     // vuelve a traer: no pisa lo trabajado
    expect(celdaRng(doc, 0, "lowPct").value).toBe("-8");
    expect(celdaRng(doc, 0, "basis").value).toBe("Cotización vigente");
  });

  it("SEGURIDAD: nombres y fundamentos importados con marcado HTML no inyectan código en la tabla de partidas", async () => {
    const XSS = '"><img src=x onerror="window.__xssFired=true">';
    const seedDb = { version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "P", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 }, modules: { cost: {
      meta: { module: "cost_management_plan", version: 2 }, estimate: { class: 3 },
      budget: { baseCost: 100000, contingency: { method: "rangos_mc", percentile: "P70" }, rangeAnalysis: { lines: [{ id: "m-1", name: XSS, ml: 100000, lowPct: -10, highPct: 30, basis: XSS }], correlation: 0.3 } },
      changeOrders: []
    } } } } };
    const dom = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); } });
    await new Promise((r) => setTimeout(r, 900));
    const doc = dom.window.document;
    expect((dom.window as any).__xssFired).toBeUndefined();
    expect(doc.querySelector("#rngBody img")).toBeNull();
    expect(celdaRng(doc, 0, "name").value).toBe(XSS);
    expect(celdaRng(doc, 0, "basis").value).toBe(XSS);
  });

  // ---- Segunda entrega del registro de riesgos: contingencia con eventos, órdenes vinculadas a riesgos ----
  const seedConectado = (modules: Record<string, unknown>) => ({
    version: 1, activeId: "p1",
    projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Costos", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 }, modules } }
  });
  const abrirConectado = async (modules: Record<string, unknown>) => {
    const dom = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(seedConectado(modules))); } });
    await new Promise((r) => setTimeout(r, 800));
    return dom;
  };
  const riesgo = (o: Record<string, unknown>) => ({ id: "x", code: "R-00", title: "Riesgo", type: "amenaza", status: "identificado", prob: 3, impCost: 3, ...o });
  const registro = { plan: {}, risks: [
    riesgo({ id: "a", code: "R-01", title: "Suelo", status: "materializado", costImpact: { low: 100000, likely: 180000, high: 300000 }, actualCost: 180000 }),
    riesgo({ id: "b", code: "R-02", title: "Acero", status: "con_respuesta", impCost: 4, strategy: "mitigar", costImpact: { low: 100000, likely: 250000, high: 500000 }, resProb: 1, resImpCost: 4, resCostImpact: { low: 100000, likely: 250000, high: 500000 } })
  ] };
  const costoConRangos = (changeOrders: unknown[]) => ({ cost: {
    meta: { module: "cost_management_plan", version: 2 }, estimate: { class: 3 },
    budget: { baseCost: 1000000, mgmtReservePct: 5, contingency: { method: "rangos_mc", percentile: "P70" }, rangeAnalysis: { lines: [{ id: "m1", name: "Todo", ml: 1000000, lowPct: -5, highPct: 10, basis: "x" }], correlation: 0.3 } },
    changeOrders
  } });
  const ordenRiesgo = (o: Record<string, unknown> = {}) => ({ id: "OC-001", desc: "Refuerzo", cause: "R-01", cost: 20000, fund: "Contingencia", status: "Pendiente", kind: "riesgo", approver: "CCB", sponsorAuth: false, ...o });
  const selRiesgo = (doc: Document, id: string) => rowOf(doc, id).querySelector('select[data-f="riskId"]') as HTMLSelectElement | null;

  it("(1) los eventos del Registro de Riesgos entran a la simulación: contingencia = incertidumbre de las partidas + aporte de los eventos, y se puede desactivar", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    const panel = doc.getElementById("rngEvents")!;
    expect(panel.textContent).toMatch(/caso de ejemplo DISTRIB\+/);
    expect(panel.textContent).toMatch(/9 riesgo\(s\) abierto\(s\): 9 entran a la simulación/);
    const filasEv = Array.from(panel.querySelectorAll("table")[0].querySelectorAll("tbody tr"));
    expect(filasEv.length).toBe(9);
    expect(filasEv.find((r) => r.textContent!.includes("R-01"))!.textContent).toMatch(/residual/);            // con respuesta evaluada: se usa el residual
    expect(filasEv.find((r) => r.textContent!.includes("R-09"))!.textContent).toMatch(/inherente/);           // aceptación activa: el residual ES el inherente
    expect(filasEv.find((r) => r.textContent!.includes("R-10"))!.textContent).toMatch(/Oportunidad.*−\$/);    // la oportunidad resta
    expect(panel.querySelectorAll("table")[0].querySelector("tfoot")!.textContent).toMatch(/\$ 277,000/);     // valor esperado neto = exposición residual del registro

    const filas = Array.from(panel.querySelectorAll("table")[1].querySelectorAll("tbody tr")).map((r) => dinero(r.children[1].textContent));
    expect(filas.length).toBe(4);                                                                            // partidas · eventos (costo directo) · costo del plazo · total
    const [soloPartidas, aporte, costoPlazo, total] = filas;
    expect(total).toBe(dinero(doc.getElementById("kCont")!.textContent));                                     // el total ES la contingencia del presupuesto
    expect(soloPartidas + aporte + costoPlazo).toBeCloseTo(total, -1);
    expect(costoPlazo).toBeGreaterThan(0);                                                                    // el retraso de los riesgos cuesta (1.500 por día de extensión)
    expect(soloPartidas / 7100000).toBeGreaterThan(0.035); expect(soloPartidas / 7100000).toBeLessThan(0.055);   // ≈ 4,5 %: solo la incertidumbre del estimado
    expect(total / soloPartidas).toBeGreaterThan(1.8);                                                        // con los eventos la contingencia se duplica (≈ 9-10 %)

    eventos(dom, doc, false);                                                                                 // sin eventos: vuelve a solo las partidas
    expect(dinero(doc.getElementById("kCont")!.textContent)).toBeCloseTo(soloPartidas, -1);
    expect(doc.getElementById("rngEvents")!.textContent).toMatch(/NO se incluyen/);
    expect(doc.getElementById("rngWarn")!.textContent).not.toMatch(/Doble conteo/);                           // sin eventos no hay aviso de doble conteo
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/mucho más estrecho que el rango típico de la clase/);   // y el rango total queda estrecho: faltan los riesgos
  });

  it("(1) la exposición de los riesgos ABIERTOS se compara con la contingencia disponible (una media, no un percentil)", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    const t = doc.getElementById("coDrawdown")!.textContent!;
    expect(t).toMatch(/contingencia disponible \(\$ 672,000\) supera el valor esperado neto de la exposición residual de los riesgos abiertos \(\$ 277,000, 9 evento\(s\)\)/);
    expect(t).toMatch(/Es una media \(≈ P50\)/);
  });

  // ---- Tercera entrega: el retraso de los riesgos (CPM real) y su costo ----
  const tablaPlazo = (doc: Document) => Array.from(doc.querySelectorAll("#rngEvents table")).find((t) => /Reserva de plazo/.test(t.textContent!)) as HTMLElement;
  const p80 = (t: string) => { const m = t.replace(/\s+/g, " ").match(/P80\s*(\d+(?:\.\d+)?) d\s*(\d+(?:\.\d+)?) d\s*(\d{4}-\d{2}-\d{2})/); return m ? { dur: Number(m[1]), reserva: Number(m[2]), fin: m[3] } : null; };
  const filasCont = (doc: Document) => Array.from(doc.querySelectorAll("#rngEvents table")[1].querySelectorAll("tbody tr")).map((r) => dinero(r.children[1].textContent));

  it("(plazo) los riesgos retrasan el proyecto según el CPM real: plazo con confianza P50–P90, reserva de plazo y fechas de fin", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    const panel = doc.getElementById("rngEvents")!, t = panel.textContent!.replace(/\s+/g, " ");
    expect(t).toMatch(/Plazo con los riesgos \(CPM real · reserva de plazo\)/);
    expect(t).toMatch(/Plan \(sin riesgos\)\s*273 d\s*—\s*2027-07-21/);
    const r = p80(tablaPlazo(doc).textContent!)!;
    expect(r.dur).toBeGreaterThan(273); expect(r.reserva).toBeCloseTo(r.dur - 273, 0); expect(r.fin > "2027-07-21").toBe(true);
    expect(t).toMatch(/6 evento\(s\) retrasan actividades del cronograma/);          // R-01, R-05, R-06, R-07, R-08, R-09
    expect(t).toMatch(/a \$ 1,500 por día/);
    // cada evento con plazo muestra su efecto en el fin del proyecto (todos en la ruta crítica: días del riesgo = días del proyecto)
    const filasEv = Array.from(panel.querySelectorAll("table")[0].querySelectorAll("tbody tr"));
    expect(filasEv.find((x) => x.textContent!.includes("R-01"))!.textContent).toMatch(/20 d → 20 d/);
    expect(filasEv.find((x) => x.textContent!.includes("R-02"))!.textContent).toMatch(/—/);   // solo costo: sin plazo
  });

  it("(plazo) sin costo por día el retraso no cuesta: la contingencia baja al aporte directo y se avisa", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    const conCosto = dinero(doc.getElementById("kCont")!.textContent);
    fijar(dom, doc, "rngTimeCost", "");
    const sin = dinero(doc.getElementById("kCont")!.textContent);
    expect(sin).toBeLessThan(conCosto);
    expect(filasCont(doc).length).toBe(3);                                             // sin la fila del costo del plazo
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/no hay un costo por día de extensión del plazo/);
    expect(doc.getElementById("rngWarn")!.textContent).not.toMatch(/Costo del plazo:/);
    expect(doc.getElementById("rngEvents")!.textContent).toMatch(/Plazo con los riesgos/);   // el plazo se simula igual
    fijar(dom, doc, "rngTimeCost", "3000");                                            // el doble de costo por día: el costo del plazo crece claramente
    const c3 = filasCont(doc); fijar(dom, doc, "rngTimeCost", "1500"); const c15 = filasCont(doc);
    expect(c3[2] / c15[2]).toBeGreaterThan(1.7); expect(c3[2] / c15[2]).toBeLessThan(2.5);   // ≈ 2× (el P70 de una suma no es exactamente lineal)
  });

  it("(plazo) el costo por día y su fundamento se guardan con el análisis", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    fijar(dom, doc, "rngTimeCost", "2000"); fijar(dom, doc, "rngTimeBasis", "Gastos generales de obra");
    const j = JSON.parse(doc.getElementById("jsonView")!.textContent!);
    expect(j.budget.rangeAnalysis.timeCostPerDay).toBe(2000);
    expect(j.budget.rangeAnalysis.timeCostBasis).toBe("Gastos generales de obra");
    expect(j.budget.rangeAnalysis.results.schedBase).toBe(273);
    expect(j.budget.rangeAnalysis.results.schedP80).toBeGreaterThan(273);
    expect(j.budget.rangeAnalysis.results.timeCostMean).toBeGreaterThan(0);
  });

  it("(plazo) es LA MISMA simulación que la del Registro de Riesgos: el mismo P80, la misma reserva y la misma fecha de fin", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    const enCostos = p80(tablaPlazo(doc).textContent!)!;
    const riesgos = await JSDOM.fromURL(base + "Risk_Register.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 600));
    (riesgos.window.document.querySelector('[data-view="analisis"]') as HTMLElement).click();
    const enRiesgos = p80(riesgos.window.document.getElementById("mainArea")!.textContent!)!;
    expect(enRiesgos).toBeTruthy();
    expect(enCostos).toEqual(enRiesgos);
  });

  it("(plazo) proyecto conectado: usa SU red; la actividad crítica traslada el retraso, la que tiene holgura lo absorbe, y el que no se ubica se avisa", async () => {
    const wbs = { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2", "w3"] }, w1: { id: "w1", name: "Uno", children: [] }, w2: { id: "w2", name: "Dos", children: [] }, w3: { id: "w3", name: "Tres", children: [] } } };
    const activities = { idCounter: 4, byLeaf: { w1: [{ id: "a1", name: "Excavar", unit: "m", qty: 10, perf: 1, teams: 1 }], w2: [{ id: "a2", name: "Rellenar", unit: "m", qty: 5, perf: 1, teams: 1 }], w3: [{ id: "a3", name: "Limpiar", unit: "m", qty: 2, perf: 1, teams: 1 }] } };
    const schedule = { linkCounter: 3, import: null, baseline: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }, { id: "L2", from: "a1", to: "a3", type: "FS", lag: 0, lagUnit: "d" }] };
    const r = (id: string, code: string, wbsIds: string[], days: number) => ({ id, code, title: "Riesgo " + code, type: "amenaza", status: "monitoreo", probPct: 100, wbsIds, timeImpact: { low: days, likely: days, high: days } });
    const cost = costoConRangos([]).cost as Record<string, any>;
    cost.budget.rangeAnalysis.timeCostPerDay = 1000;
    const seed = seedConectado({ wbs, activities, schedule, risks: { plan: {}, idCounter: 4, risks: [r("k1", "R-01", ["w2"], 10), r("k2", "R-02", ["w3"], 2), r("k3", "R-03", [], 5)] }, cost });
    (seed.projects.p1.meta as Record<string, unknown>).startDate = "2026-07-06";
    const dom = await (async () => { const d = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } }); await new Promise((x) => setTimeout(x, 800)); return d; })();
    const doc = dom.window.document, t = doc.getElementById("rngEvents")!.textContent!.replace(/\s+/g, " ");
    expect(t).toMatch(/Plan \(sin riesgos\)\s*15 d/);                                  // 10 + 5 días de la red del proyecto, no los 273 del ejemplo
    expect(t).toMatch(/P50\s*25 d\s*10 d/);                                            // el evento de w2 (crítica) ocurre siempre y suma 10 d; el de w3 (holgura 3 d) se absorbe
    const filas = filasCont(doc);
    expect(filas[1]).toBe(0);                                                          // sin costo directo
    expect(filas[2]).toBe(10000);                                                      // 10 d × 1.000 por día, exacto (el retraso es determinista)
    const ev = Array.from(doc.querySelectorAll("#rngEvents table")[0].querySelectorAll("tbody tr"));
    expect(ev.find((x) => x.textContent!.includes("R-01"))!.textContent).toMatch(/10 d → 10 d/);
    expect(ev.find((x) => x.textContent!.includes("R-02"))!.textContent).toMatch(/2 d → 0 d/);
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/1 riesgo\(s\) con impacto en plazo no están ubicados en el cronograma \(R-03\)/);
  });

  it("(2) OC-001 del ejemplo está vinculada a R-03 y la traza muestra lo consumido por ese riesgo frente a lo previsto", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    expect(rowOf(doc, "OC-001").textContent).toMatch(/↳ R-03 · Suelo con menor capacidad portante/);
    const fila = Array.from(doc.querySelectorAll("#coDrawdown tbody tr")).find((r) => r.textContent!.includes("R-03")) as HTMLElement;
    expect(fila.children[2].textContent).toBe("$ 180,000.00");                     // aprobado con contingencia
    expect(fila.children[5].textContent).toBe("$ 350,000.00");                      // impacto máximo previsto en el análisis del riesgo
    expect(fila.textContent).toMatch(/Dentro de lo previsto/);
    expect(dinero(doc.getElementById("coKpis")!.textContent!.match(/Contingencia disponible\s*\$ ([\d,]+)/)![1])).toBe(672000);
  });

  it("(3) un «riesgo materializado» exige un riesgo del registro: sin vínculo o con un riesgo que aún no ocurrió NO se aprueba; con R-03 (Materializado) sí", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "coKind", "riesgo");
    expect(doc.getElementById("coRiskWrap")!.style.display).toBe("block");
    expect(doc.querySelectorAll("#coRisk option").length).toBe(10);                // «— Vincular —» + las 9 amenazas (R-10 es una oportunidad)
    expect(doc.getElementById("coRiskHint")!.textContent).toMatch(/solo se aprueba cuando el registro lo marca como Materializado/);
    fijar(dom, doc, "coDesc", "Refuerzo de muro"); fijar(dom, doc, "coCost", "5000");
    (doc.querySelector('button[onclick="addCO()"]') as HTMLElement).click();       // sin elegir riesgo
    expect(toast(doc)).toMatch(/sin riesgo vinculado/);
    expect(rowOf(doc, "OC-004").textContent).toMatch(/Riesgo materializado/);
    setApproval(dom, doc, "OC-004", "CCB", false);
    setStatus(dom, doc, "OC-004", "Aprobada");
    expect((rowOf(doc, "OC-004").querySelector("select[data-i]:not([data-f])") as HTMLSelectElement).value).toBe("Pendiente");
    expect(toast(doc)).toMatch(/vincula la orden con el riesgo del Registro de Riesgos.*trabajo imprevisto dentro del alcance/);

    poner(selRiesgo(doc, "OC-004")!, "rk4");                                       // R-04 (tipo de cambio): en monitoreo, todavía no ocurrió
    setStatus(dom, doc, "OC-004", "Aprobada");
    expect(toast(doc)).toMatch(/R-04 figura como «monitoreo».*márcalo como Materializado/);

    poner(selRiesgo(doc, "OC-004")!, "rk3");                                       // R-03 (suelo): materializado
    setStatus(dom, doc, "OC-004", "Aprobada");
    expect((rowOf(doc, "OC-004").querySelector("select[data-i]:not([data-f])") as HTMLSelectElement).value).toBe("Aprobada");
    expect(rowOf(doc, "OC-004").textContent).toMatch(/↳ R-03/);
    const traza = Array.from(doc.querySelectorAll("#coDrawdown tbody tr")).find((r) => r.textContent!.includes("R-03")) as HTMLElement;
    expect(traza.children[2].textContent).toBe("$ 185,000.00");                    // OC-001 (180.000) + OC-004 (5.000) contra el mismo riesgo
    function poner(el: HTMLSelectElement, v: string) { el.value = v; el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }
  });

  it("el ejemplo COMPARTIDO no se desalinea: la orden vinculada que ve el Registro de Riesgos es la OC-001 de Costos (mismo id, riesgo, monto y fondeo)", async () => {
    const { SAMPLE_LINKED_ORDERS } = await import("../../src/shared/risk-sample");
    const dom = await abrirStandalone(), doc = dom.window.document;
    const o = SAMPLE_LINKED_ORDERS[0], fila = rowOf(doc, o.id);
    expect(fila).toBeTruthy();
    expect(dinero(fila.children[4].textContent)).toBe(o.cost);
    expect(fila.textContent).toContain(o.fund);
    expect(fila.textContent).toContain("↳ " + o.riskCode);
    expect(fila.textContent).toMatch(/Aprobada/);
  });

  it("(3) el vínculo solo se exige a los «riesgo materializado»: el trabajo imprevisto y el cambio de alcance se aprueban sin riesgo", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    setApproval(dom, doc, "OC-002", "Sponsor", true);
    setStatus(dom, doc, "OC-002", "Aprobada");                                     // cambio de alcance
    expect((rowOf(doc, "OC-002").querySelector("select[data-i]:not([data-f])") as HTMLSelectElement).value).toBe("Aprobada");
    expect(rowOf(doc, "OC-002").querySelector('select[data-f="riskId"]')).toBeNull();   // ni siquiera ofrece el selector
  });

  it("conectado con un Registro de Riesgos REAL: sus eventos abiertos y cuantificados entran (residual), y los vínculos salen de ese registro", async () => {
    const dom = await abrirConectado({ risks: registro, ...costoConRangos([ordenRiesgo()]) }), doc = dom.window.document;
    expect(doc.getElementById("rangeCard")!.style.display).toBe("block");
    const panel = doc.getElementById("rngEvents")!;
    expect(panel.textContent).toMatch(/Registro de Riesgos del proyecto/);
    expect(panel.textContent).toMatch(/1 riesgo\(s\) abierto\(s\): 1 entran a la simulación/);     // R-01 está materializado: no es incertidumbre
    expect(panel.textContent).toMatch(/R-02.*residual/);
    expect(panel.querySelector("tfoot")!.textContent).toMatch(/\$ 28,333/);                          // 10 % × (100.000 + 250.000 + 500.000)/3
    // el vínculo: la orden legacy no tiene riesgo → no se aprueba; R-02 (con respuesta) tampoco; R-01 (materializado) sí
    const sel = selRiesgo(doc, "OC-001")!;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["— Vincular riesgo —", "R-01 · Suelo (Materializado)", "R-02 · Acero (Con respuesta)"]);
    setStatus(dom, doc, "OC-001", "Aprobada");
    expect(toast(doc)).toMatch(/vincula la orden con el riesgo/);
    sel.value = "b"; sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    setStatus(dom, doc, "OC-001", "Aprobada");
    expect(toast(doc)).toMatch(/R-02 figura como «con respuesta»/);
    (selRiesgo(doc, "OC-001") as HTMLSelectElement).value = "a"; selRiesgo(doc, "OC-001")!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    setStatus(dom, doc, "OC-001", "Aprobada");
    expect((rowOf(doc, "OC-001").querySelector("select[data-i]:not([data-f])") as HTMLSelectElement).value).toBe("Aprobada");
    const guardado = (dom.window as any).GPI.getModule("cost").changeOrders[0];
    expect(guardado).toMatchObject({ status: "Aprobada", riskId: "a", riskCode: "R-01" });         // persiste el vínculo con su foto del código
  });

  it("conectado SIN Registro de Riesgos: la contingencia lo dice, y una orden por «riesgo materializado» no se aprueba (si no estaba registrado, es trabajo imprevisto)", async () => {
    const dom = await abrirConectado(costoConRangos([ordenRiesgo()])), doc = dom.window.document;
    expect(doc.getElementById("rngWarn")!.textContent).toMatch(/no tiene Registro de Riesgos: la contingencia solo cubre la incertidumbre del estimado/);
    expect(doc.getElementById("rngEvents")!.textContent).toMatch(/sin Registro de Riesgos/);
    expect(doc.getElementById("coDrawdown")!.textContent).toMatch(/no tiene Registro de Riesgos: no hay exposición residual/);
    setStatus(dom, doc, "OC-001", "Aprobada");
    expect(toast(doc)).toMatch(/vincula la orden con el riesgo.*si el evento no estaba en el Registro de Riesgos no es un riesgo materializado/);
    fijar(dom, doc, "coKind", "riesgo");
    expect(doc.getElementById("coRiskHint")!.textContent).toMatch(/no tiene riesgos registrados.*trabajo imprevisto dentro del alcance/);
  });

  it("compatibilidad: una orden por riesgo YA aprobada antes del vínculo sigue aprobada (con aviso «sin riesgo vinculado»); y includeRisks se guarda y se recupera", async () => {
    const dom = await abrirConectado({ risks: registro, ...costoConRangos([ordenRiesgo({ status: "Aprobada", approvedOn: "2026-08-03" })]) }), doc = dom.window.document, win = dom.window as any;
    expect(rowOf(doc, "OC-001").textContent).toMatch(/Aprobada/);
    expect(rowOf(doc, "OC-001").textContent).toMatch(/⚠ sin riesgo vinculado/);
    expect(doc.getElementById("coTotal")!.textContent).toBe("$ 20,000.00");            // los totales no cambian
    expect((doc.getElementById("rngRisks") as HTMLInputElement).checked).toBe(true);   // por omisión (el proyecto guardado no traía el campo)
    eventos(dom, doc, false);
    expect(win.GPI.getModule("cost").budget.rangeAnalysis.includeRisks).toBe(false);
    expect(win.GPI.getModule("cost").budget.rangeAnalysis.results.events).toBe(0);
    const dom2 = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", dom.window.localStorage.getItem("gpi_db")); } });
    await new Promise((r) => setTimeout(r, 800));
    expect((dom2.window.document.getElementById("rngRisks") as HTMLInputElement).checked).toBe(false);
  });

  it("SEGURIDAD: título, código y vínculo de un riesgo importado con marcado HTML no inyectan código en las órdenes ni en el panel de eventos", async () => {
    const XSS = '"><img src=x onerror="window.__xssFired=true">';
    const dom = await abrirConectado({
      risks: { risks: [riesgo({ id: XSS, code: XSS, title: XSS, status: "materializado", costImpact: { low: 1, likely: 2, high: 3 } }), riesgo({ id: "z", code: XSS, title: XSS, status: "monitoreo", costImpact: { low: 1, likely: 2, high: 3 } })] },
      ...costoConRangos([ordenRiesgo({ riskId: XSS, riskCode: XSS })])
    });
    const doc = dom.window.document;
    await new Promise((r) => setTimeout(r, 100));
    expect((dom.window as any).__xssFired).toBeUndefined();
    expect(doc.querySelectorAll("#coBody img, #rngEvents img, #coDrawdown img").length).toBe(0);
    expect(doc.querySelector("#coBody [onerror]")).toBeNull();
  });

  it("el documento BOE recoge la base de la contingencia: método, correlación, semilla, partidas y su fundamento", async () => {
    const dom = await abrirStandalone(), doc = dom.window.document;
    fijar(dom, doc, "contMethod", "rangos_mc");
    (dom.window as any).buildDoc();
    const txt = doc.getElementById("doc")!.textContent as string;
    expect(txt).toMatch(/Estimación por rangos \+ simulación Monte Carlo \(AACE 41R-08\), P70/);
    expect(txt).toMatch(/correlación entre partidas 30 %; 10,000 iteraciones \(semilla 20260713, reproducible\)/);
    expect(txt).toMatch(/Contingencia = P70 − estimado base/);
    expect(txt).toMatch(/4 Construcción.*-6 % \/ \+18 %.*Metrados y precios unitarios de subcontratos/);
    expect(txt).toMatch(/Incluye 9 evento\(s\) de riesgo del caso de ejemplo \(R-01, R-02, R-04, R-05, R-06, R-07…\).*residual/);
    eventos(dom, doc, false); (dom.window as any).buildDoc();
    expect(doc.getElementById("doc")!.textContent).toMatch(/No incluye eventos de riesgo discretos/);
    fijar(dom, doc, "contMethod", "clase_tabla");
    (dom.window as any).buildDoc();
    expect(doc.getElementById("doc")!.textContent).toMatch(/Referencia didáctica por clase y percentil: no proviene de una norma de AACE/);
  });
});
