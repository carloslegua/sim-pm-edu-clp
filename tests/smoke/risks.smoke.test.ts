// Smoke test del módulo Risk_Register.html (Registro de riesgos: PMBOK + AACE).
// Servido por HTTP local (no file://): ver el comentario en tests/smoke/obs-builder.smoke.test.ts.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import jsdomPkg from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { esperarHasta } from "../helpers/esperar";

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

const abrir = async (seed?: unknown) => {
  const dom = await JSDOM.fromURL(base + "Risk_Register.html", {
    runScripts: "dangerously", resources: "usable",
    beforeParse(window: any) { if (seed) window.localStorage.setItem("gpi_db", JSON.stringify(seed)); }
  });
  await esperarHasta(() => dom.window.document.getElementById("mainArea")!.textContent!.trim().length > 0, "que el Registro de riesgos pinte su área principal");
  return dom;
};
const vista = async (dom: any, v: string) => { (dom.window.document.querySelector(`[data-view="${v}"]`) as HTMLElement).click(); await new Promise((r) => setTimeout(r, 30)); };
const proyecto = (modules: Record<string, unknown> = {}) => ({
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 }, modules } }
});
const filas = (doc: Document) => Array.from(doc.querySelectorAll("tr.rk-row")) as HTMLElement[];
const fila = (doc: Document, code: string) => filas(doc).find((r) => r.querySelector("td")!.textContent === code) as HTMLElement;
const campo = (doc: Document, f: string, k?: string) => doc.querySelector(`.det-box [data-f="${f}"]${k ? `[data-k="${k}"]` : ""}`) as HTMLInputElement | HTMLSelectElement;
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };
const pesos = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));

describe("Risk_Register.html (Registro de riesgos)", () => {
  it("standalone: arranca con el ejemplo DISTRIB+ (10 riesgos) y renderiza las 4 vistas sin errores", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(filas(doc).length).toBe(10);
    const stats = Array.from(doc.querySelectorAll("#sidebar .stat .v")).map((v) => v.textContent);
    expect(stats).toEqual(["9", "1", "0", "10"]);                     // abiertos, altos, con hallazgos, total: el ejemplo está limpio
    expect(fila(doc, "R-01").textContent).toMatch(/ALTO · 16/);
    for (const v of ["matriz", "analisis", "plan", "registro"]) { await vista(dom, v); expect(doc.getElementById("mainArea")!.textContent!.length).toBeGreaterThan(200); }
  });

  it("el ejemplo amplía el MISMO caso: R-03 «Suelo» materializado con el costo de la orden OC-001 de Costos (180.000)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    const r3 = fila(doc, "R-03");
    expect(r3.textContent).toMatch(/Materializado/);
    r3.click();
    expect((campo(doc, "actualCost") as HTMLInputElement).value).toBe("180000");   // = OC-001 en Cost-management
    expect(doc.getElementById("det-rk3")!.textContent).toMatch(/OC-001/);
    expect(doc.querySelector("tr.rk-row td:nth-child(2)")!.textContent).toMatch(/Retraso en la licencia municipal/);
  });

  it("la matriz ubica los riesgos abiertos por probabilidad y MAYOR impacto; antes y después de la respuesta; los chips abren el riesgo", async () => {
    const dom = await abrir(), doc = dom.window.document;
    await vista(dom, "matriz");
    const tablas = doc.querySelectorAll("table.mx");
    expect(tablas[0].querySelectorAll(".mx-chip").length).toBe(8);   // 8 amenazas abiertas (R-03 materializado no cuenta)
    expect(tablas[1].querySelectorAll(".mx-chip").length).toBe(1);   // R-10, la única oportunidad
    const celdaAlto = Array.from(tablas[0].querySelectorAll("td.mx-c.lv-alto .mx-chip")).map((c) => c.textContent);
    expect(celdaAlto).toEqual(["R-01"]);                              // P4 × impacto 4 = 16 ≥ 15
    (Array.from(doc.querySelectorAll("#mxGroup .btn")).find((b) => (b as HTMLElement).dataset.w === "residual") as HTMLElement).click();
    expect(doc.querySelectorAll("table.mx")[0].querySelectorAll(".mx-chip").length).toBe(8);   // 7 con respuesta + R-09 (aceptar: residual = inherente)
    expect(doc.querySelectorAll("table.mx")[0].querySelectorAll("td.mx-c.lv-alto .mx-chip").length).toBe(0);  // tras las respuestas ya no hay altos
    (doc.querySelector("table.mx .mx-chip") as HTMLElement).click();  // abre el riesgo en el registro
    expect(doc.querySelector('[data-view="registro"]')!.classList.contains("active")).toBe(true);
    expect(doc.querySelectorAll(".det-box .det-grid").length).toBe(1);
  });

  it("editar recalcula EN VIVO: el puntaje, el valor esperado y los hallazgos (sin reconstruir el formulario)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    fila(doc, "R-02").click();
    const box = doc.querySelector(".det-box") as HTMLElement;
    poner(dom, campo(doc, "prob"), "5", "change");                      // P3 → P5: 5 × 4 = 20
    expect(fila(doc, "R-02").textContent).toMatch(/ALTO · 20/);
    expect(doc.querySelector(".det-box")).toBe(box);                    // el formulario sigue siendo el mismo nodo
    expect(doc.querySelector(".calc")!.textContent).toMatch(/Puntaje inherente[\s\S]*ALTO · 20/);
    expect(pesos(doc.querySelector(".calc")!.textContent!.match(/Valor esperado[^$]*\$\s?([\d,]+)/)![1])).toBe(Math.round(0.9 * (100000 + 250000 + 500000) / 3));   // 90 % × media triangular = 255.000
    poner(dom, campo(doc, "cause"), "", "input");
    expect(doc.querySelector(".calc")!.textContent).toMatch(/enunciado está incompleto/);
  });

  it("cambiar el TIPO no deja una estrategia que no corresponde (amenaza ↔ oportunidad) y avisa que falta la respuesta", async () => {
    const dom = await abrir(), doc = dom.window.document;
    fila(doc, "R-01").click();
    poner(dom, campo(doc, "type"), "oportunidad", "change");           // «mitigar» no es una estrategia de oportunidad
    expect((campo(doc, "strategy") as HTMLSelectElement).value).toBe("");
    const opts = Array.from((campo(doc, "strategy") as HTMLSelectElement).options).map((o) => o.value);
    expect(opts).toEqual(["", "escalar", "explotar", "compartir", "mejorar", "aceptar"]);
    expect(doc.querySelector(".calc")!.textContent).toMatch(/sin estrategia de respuesta/);
  });

  it("nuevo riesgo: numeración R-11, hallazgos desde el inicio y el enunciado causa → evento → efecto se arma solo", async () => {
    const dom = await abrir(), doc = dom.window.document;
    (doc.getElementById("btnAddThreat") as HTMLElement).click();
    expect(filas(doc).length).toBe(11);
    expect(filas(doc)[10].querySelector("td")!.textContent).toBe("R-11");
    const t = doc.querySelector(".calc")!.textContent!;
    expect(t).toMatch(/Falta un título/); expect(t).toMatch(/enunciado está incompleto/); expect(t).toMatch(/propietario/); expect(t).toMatch(/Sin analizar/);
    poner(dom, campo(doc, "cause"), "el proveedor quiebra"); poner(dom, campo(doc, "event"), "se interrumpe el suministro"); poner(dom, campo(doc, "effect"), "retraso de la obra");
    expect(doc.querySelector(".stmt")!.textContent).toBe("Debido a el proveedor quiebra, puede ocurrir que se interrumpe el suministro, lo que causaría retraso de la obra.");
  });

  it("el PLAN gobierna todo: bajar el umbral de «alto» a 12 recolorea el registro y la matriz; un plan incoherente se avisa", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(fila(doc, "R-02").textContent).toMatch(/MEDIO · 12/);
    await vista(dom, "plan");
    poner(dom, doc.querySelector('[data-p="thresholdHigh"]')!, "12");
    await vista(dom, "registro");
    expect(fila(doc, "R-02").textContent).toMatch(/ALTO · 12/);
    expect(doc.querySelector("#sidebar .stat .v")!.nextElementSibling!.textContent).toBe("Abiertos");
    expect(Array.from(doc.querySelectorAll("#sidebar .stat .v"))[1].textContent).toBe("4");   // R-01 (16) y los tres de 12: R-02, R-08 y R-09 (antes solo R-01)
    await vista(dom, "plan");
    poner(dom, doc.querySelector('[data-p="probPct"][data-i="2"]')!, "20");                    // 50 → 20: la escala deja de crecer
    expect(doc.getElementById("planMsg")!.style.display).toBe("block");
    expect(doc.getElementById("planMsg")!.textContent).toMatch(/probabilidades por nivel deben estar entre 0 y 100 y crecer/);
    expect(doc.getElementById("planBands")!.textContent).toMatch(/\$ 71,000/);                // las cotas se traducen a moneda con el costo base de Costos
  });

  it("el análisis calcula el valor esperado (AACE 44R-08) con la media de la triangular, antes y después de la respuesta", async () => {
    const dom = await abrir(), doc = dom.window.document;
    await vista(dom, "analisis");
    const t = doc.getElementById("mainArea")!.textContent!;
    expect(t).toMatch(/Amenazas — valor esperado\s*\$ 734,833/);              // Σ P × (mín + más prob. + máx)/3 de las 8 amenazas abiertas
    expect(t).toMatch(/Oportunidades — valor esperado\s*[−-]\$ 46,667/);
    expect(t).toMatch(/Exposición neta \(antes de la respuesta\)\s*\$ 688,167/);
    expect(t).toMatch(/Amenazas residuales \(después de la respuesta\)\s*\$ 342,333/);
    expect(t).toMatch(/Exposición neta residual\s*\$ 277,000/);
    expect(t).toMatch(/Impacto real de riesgos materializados\s*\$ 180,000/);
    expect(t).toMatch(/Un valor esperado es una media/);                       // no se presenta como contingencia
    expect(t).toMatch(/Hallazgos de coherencia \(0\)/);
    const orden = Array.from(doc.querySelectorAll("table.an tbody tr td:nth-child(2)")).slice(0, 3).map((c) => c.textContent);
    expect(orden[0]).toBe("R-01");                                             // el único ALTO va primero
  });

  it("regla de oro: un proyecto sin riesgos arranca EN BLANCO (no con el ejemplo) y persiste con sesión de edición", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, win = dom.window as any;
    expect(filas(doc).length).toBe(0);
    expect(doc.getElementById("mainArea")!.textContent).toMatch(/Aún no hay riesgos/);
    (doc.getElementById("btnAddOpp") as HTMLElement).click();
    poner(dom, campo(doc, "title"), "Descuento por volumen");
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const mod = win.GPI.getModule("risks");
    expect(mod.risks.length).toBe(1);
    expect(mod.risks[0]).toMatchObject({ code: "R-01", type: "oportunidad", title: "Descuento por volumen" });
    expect(mod.plan.thresholdHigh).toBe(15);
    expect(mod.idCounter).toBe(2);
    const dom2 = await abrir(JSON.parse(dom.window.localStorage.getItem("gpi_db") as string));   // reabrir: lo guardado vuelve
    expect(filas(dom2.window.document).length).toBe(1);
    expect(filas(dom2.window.document)[0].textContent).toMatch(/Descuento por volumen/);
  });

  it("«Cargar ejemplo» en un proyecto real empareja los paquetes de la EDT por Código EDT (lo que no existe se omite)", async () => {
    const wbs = { rootId: "root", idCounter: 6, nodes: {
      root: { id: "root", name: "P", children: ["p1", "p2"] }, p1: { id: "p1", name: "Fase 1", children: ["a"] }, a: { id: "a", name: "Acta", children: [] },
      p2: { id: "p2", name: "Fase 2", children: ["b", "c"] }, b: { id: "b", name: "Estudio de suelos", children: [] }, c: { id: "c", name: "Diseño estructural", children: [] } } };
    const dom = await abrir(proyecto({ wbs })), doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click();
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(filas(doc).length).toBe(10);
    expect(fila(doc, "R-03").textContent).toMatch(/EDT 2\.1/);            // 2.1 existe en esta EDT
    expect(fila(doc, "R-03").textContent).not.toMatch(/4\.2/);            // 4.2 no existe: se omite
    expect(fila(doc, "R-01").textContent).not.toMatch(/EDT/);
  });

  it("compatibilidad y robustez: datos guardados incompletos o con basura abren igual y se leen como «sin analizar»", async () => {
    const sucio = { plan: { thresholdHigh: "x", probPct: [1, 2] }, risks: [
      { id: "a", code: "R-01", title: "Solo título", prob: "9", impCost: "abc", type: "raro", status: "inventado", costImpact: { low: "x" }, wbsIds: "no" },
      "no soy un objeto", null, { id: "b", title: "Con datos", prob: 3, impCost: 3, owner: "PM" }] };
    const dom = await abrir(proyecto({ risks: sucio })), doc = dom.window.document;
    expect(filas(doc).length).toBe(4);
    expect(fila(doc, "R-01").textContent).toMatch(/Sin analizar/);        // prob "9" no es un nivel válido
    expect(fila(doc, "R-01").textContent).toMatch(/AMENAZA/);              // tipo desconocido → amenaza
    await vista(dom, "analisis"); await vista(dom, "matriz"); await vista(dom, "plan");   // ninguna vista se rompe
    expect(doc.getElementById("mainArea")!.textContent).toMatch(/Plan de gestión de los riesgos/);
  });

  it("SEGURIDAD: título, enunciado, propietario, categoría e id importados con marcado HTML no inyectan código en ninguna vista", async () => {
    const XSS = '"><img src=x onerror="window.__xssFired=true">';
    const mal = { id: 'r"x" onmouseover="window.__xssFired=true', code: XSS, title: XSS, cause: XSS, event: XSS, effect: XSS, owner: XSS, category: XSS, response: XSS, trigger: XSS,
      strategy: "mitigar", status: "con_respuesta", prob: 4, impCost: 4, wbsIds: [XSS], costImpact: { low: 1, likely: 2, high: 3 } };
    const dom = await abrir(proyecto({ risks: { plan: { categories: [XSS, "Externo"], methodology: XSS }, risks: [mal] } })), doc = dom.window.document;
    fila(doc, XSS).click();                                                 // abre el detalle
    for (const v of ["matriz", "analisis", "plan", "registro"]) { await vista(dom, v); await new Promise((r) => setTimeout(r, 30)); }
    await new Promise((r) => setTimeout(r, 100));
    expect((dom.window as any).__xssFired).toBeUndefined();
    expect(doc.querySelectorAll("#mainArea img").length).toBe(0);
    expect(doc.querySelector("#mainArea [onmouseover]")).toBeNull();
    (doc.getElementById("btnReport") as HTMLElement).click();
    expect(doc.getElementById("gpiReport")!.querySelectorAll("img").length).toBe(0);
  });

  it("el reporte imprimible incluye resumen, registro con el enunciado, respuestas y prioridad", async () => {
    const dom = await abrir(), doc = dom.window.document;
    try { (doc.getElementById("btnReport") as HTMLElement).click(); } catch (_) { /* window.print() no implementado en jsdom */ }
    const rep = doc.getElementById("gpiReport")!.innerHTML;
    expect(rep).toContain("1. Resumen"); expect(rep).toContain("2. Registro de riesgos"); expect(rep).toContain("3. Respuestas"); expect(rep).toContain("4. Prioridad de atención");
    expect(rep).toContain("Debido a la Municipalidad de Lurín observa el expediente de licencia de edificación, puede ocurrir que se retrasa la emisión de la licencia");
    expect(rep).toContain("Contrato a precio fijo con vigencia de la oferta de 60 días.");
    expect(rep).toMatch(/neta \$ 688,167/);
  });

  // ---- Segunda entrega: lo que Costos tiene aprobado por cada riesgo materializado (solo lectura) ----
  it("un riesgo materializado muestra las órdenes de cambio de Costos vinculadas, y avisa si su costo real no coincide con lo aprobado (R17)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    fila(doc, "R-03").click();
    const t = doc.getElementById("det-rk3")!.textContent!;
    expect(t).toMatch(/Órdenes de cambio vinculadas \(Costos\)/);
    expect(t).toMatch(/OC-001\s*Aprobada\s*Contingencia\s*\$ 180,000/);
    expect(t).toMatch(/Sin hallazgos de coherencia/);                          // 180.000 real = 180.000 aprobado
    poner(dom, campo(doc, "actualCost"), "150000");
    expect(doc.getElementById("calc-rk3")!.textContent).toMatch(/no coincide con lo aprobado en las órdenes de cambio vinculadas en Costos \(180000\)/);
    expect(Array.from(doc.querySelectorAll("#sidebar .stat .v"))[2].textContent).toBe("1");   // ahora hay un riesgo con hallazgos
  });

  it("conectado: lee las órdenes del módulo de Costos del proyecto; sin ninguna vinculada avisa (R18) y con una que difiere avisa (R17)", async () => {
    const mat = { id: "m1", code: "R-03", title: "Suelo", cause: "el suelo es malo", event: "se refuerza la cimentación", effect: "sube el costo", type: "amenaza", status: "materializado", prob: 3, impCost: 3, owner: "PM", wbsIds: [], actualCost: 90000, costImpact: { low: 50000, likely: 90000, high: 150000 } };
    const sinOrden = await abrir(proyecto({ risks: { risks: [mat] }, cost: { changeOrders: [] } }));
    fila(sinOrden.window.document, "R-03").click();
    expect(sinOrden.window.document.getElementById("calc-m1")!.textContent).toMatch(/No hay una orden de cambio vinculada en Costos/);
    const orden = (o: Record<string, unknown>) => ({ id: "OC-007", riskId: "m1", riskCode: "R-03", cost: 100000, status: "Aprobada", fund: "Contingencia", ...o });
    const difiere = await abrir(proyecto({ risks: { risks: [mat] }, cost: { changeOrders: [orden({}), orden({ id: "OC-008", riskId: "otro", cost: 1 })] } }));
    const d = difiere.window.document; fila(d, "R-03").click();
    expect(d.getElementById("det-m1")!.textContent).toMatch(/OC-007/);
    expect(d.getElementById("det-m1")!.textContent).not.toMatch(/OC-008/);        // solo las de ESTE riesgo
    expect(d.getElementById("calc-m1")!.textContent).toMatch(/no coincide con lo aprobado.*\(100000\)/);
    const igual = await abrir(proyecto({ risks: { risks: [mat] }, cost: { changeOrders: [orden({ cost: 90000 })] } }));
    fila(igual.window.document, "R-03").click();
    expect(igual.window.document.getElementById("calc-m1")!.textContent).toMatch(/Sin hallazgos de coherencia/);
  });

  it("un riesgo que NO está materializado no evalúa el vínculo con Costos (no hay nada que contrastar todavía)", async () => {
    const abierto = { id: "m2", code: "R-04", title: "Cambio", cause: "el cliente cambia", event: "pide otro alcance", effect: "sube el costo", type: "amenaza", status: "monitoreo", prob: 2, impCost: 2, owner: "PM", wbsIds: ["w"] };
    const dom = await abrir(proyecto({ risks: { risks: [abierto] }, cost: { changeOrders: [] } }));
    fila(dom.window.document, "R-04").click();
    expect(dom.window.document.getElementById("det-m2")!.textContent).not.toMatch(/Órdenes de cambio vinculadas/);
    expect(dom.window.document.getElementById("calc-m2")!.textContent).not.toMatch(/orden de cambio vinculada/);
  });

  // ---- Tercera entrega: riesgo de plazo (el efecto de cada riesgo en el fin del proyecto, con el CPM real) ----
  const calc = (doc: Document) => doc.querySelector(".calc")!.textContent!.replace(/\s+/g, " ");
  const elegir = (dom: any, sel: HTMLSelectElement, start: string) => {
    Array.from(sel.options).forEach((o) => { o.selected = o.text.startsWith(start); });
    sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  };

  it("un riesgo con impacto en plazo muestra su efecto en el fin del proyecto: la actividad crítica traslada el retraso íntegro", async () => {
    const dom = await abrir(), doc = dom.window.document;
    fila(doc, "R-01").click();
    const t = calc(doc);
    expect(t).toMatch(/Efecto en el cronograma \(CPM\)/);
    expect(t).toMatch(/Se aplica una vez, a la actividad de menor holgura de sus paquetes/);
    expect(t).toMatch(/2\.4\.1.*Trámite de licencia.*crítica/);
    expect(t).toMatch(/Mínimo\s*10 d\s*10 d\s*Más probable\s*20 d\s*20 d\s*Máximo\s*35 d\s*35 d/);       // en la ruta crítica: días del riesgo = días del proyecto
    expect(t).toMatch(/Retrasa el fin del proyecto 20 d \(actividad crítica\)/);
    expect(t).toMatch(/Sin hallazgos de coherencia/);                                     // el ejemplo sigue limpio
  });

  it("afinar con una actividad con holgura: el retraso se absorbe (R20/R21) y el máximo que supera la holgura sí retrasa el proyecto", async () => {
    const dom = await abrir(), doc = dom.window.document;
    fila(doc, "R-08").click();                                                            // paquetes 3.1 y 4.3; retraso 15/25/45 d; nivel de plazo declarado 4
    elegir(dom, campo(doc, "actIds") as HTMLSelectElement, "3.1.1");                      // solo la fabricación, con 78 d de holgura
    let t = calc(doc);
    expect(t).toMatch(/cada.*actividad elegida/);
    expect(t).toMatch(/3\.1\.1.*Fabricación de estructuras metálicas.*holgura 78 d/);
    expect(t).toMatch(/Más probable\s*25 d\s*0 d/);                                           // 25 d < 78 d de holgura: no mueve el fin
    expect(t).toMatch(/[Ll]a holgura de las actividades afectadas \(78 d\) absorbe el impacto más probable/);
    expect(t).toMatch(/El nivel de impacto en plazo \(4\) no concuerda con el efecto real sobre el fin del proyecto/);   // R21
    // con un máximo mayor que la holgura sí retrasa: 90 − 78 = 12 d
    poner(dom, campo(doc, "timeImpact", "high"), "90", "input");
    t = calc(doc);
    expect(t).toMatch(/Máximo\s*90 d\s*12 d/);
    expect(Array.from(doc.querySelectorAll("#sidebar .stat .v"))[2].textContent).toBe("1");   // ahora hay un riesgo con hallazgos
  });

  it("sin paquetes ni actividades no se puede ubicar: se dice, no se inventa un efecto (R19)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    fila(doc, "R-01").click();
    (campo(doc, "wbsIds") as HTMLSelectElement).selectedIndex = -1;
    Array.from((campo(doc, "wbsIds") as HTMLSelectElement).options).forEach((o) => { o.selected = false; });
    campo(doc, "wbsIds").dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const t = calc(doc);
    expect(t).toMatch(/No se puede ubicar en el cronograma: no indica paquetes de la EDT ni actividades/);
    expect(t).toMatch(/no se puede ubicar en el cronograma \(no indica paquetes/);       // R19
  });

  it("cambiar los paquetes descarta las actividades elegidas que ya no son de ellos", async () => {
    const dom = await abrir(), doc = dom.window.document;
    fila(doc, "R-08").click();
    elegir(dom, campo(doc, "actIds") as HTMLSelectElement, "3.1.1");
    Array.from((campo(doc, "wbsIds") as HTMLSelectElement).options).forEach((o) => { o.selected = o.text.startsWith("4.3"); });   // quita 3.1
    campo(doc, "wbsIds").dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(Array.from((campo(doc, "actIds") as HTMLSelectElement).selectedOptions)).toHaveLength(0);
    expect(calc(doc)).toMatch(/Se aplica una vez/);                                       // vuelve a la regla por paquete
  });

  it("Análisis: la simulación de plazo (10.000 iteraciones, CPM real) da la reserva de plazo y las fechas de fin, y cada riesgo su efecto", async () => {
    const dom = await abrir(), doc = dom.window.document;
    await vista(dom, "analisis");
    const t = doc.getElementById("mainArea")!.textContent!.replace(/\s+/g, " ");
    expect(t).toMatch(/Riesgo de plazo — efecto en el fin del proyecto \(CPM\)/);
    expect(t).toMatch(/base 273 d, fin 2027-07-21/);
    expect(t).toMatch(/Plan \(sin riesgos\)\s*273 d\s*—\s*2027-07-21/);
    const p80 = t.match(/P80\s*(\d+(?:\.\d+)?) d\s*([\d.]+) d\s*(\d{4}-\d{2}-\d{2})/)!;
    expect(Number(p80[1])).toBeGreaterThan(273);
    expect(Number(p80[2])).toBeCloseTo(Number(p80[1]) - 273, 0);                         // reserva = P80 − plan
    expect(p80[3] > "2027-07-21").toBe(true);
    expect(t).toMatch(/6 evento\(s\) simulados sobre la red/);                           // los 6 abiertos con plazo: R-01, R-05, R-06, R-07, R-08, R-09
    const filasPlazo = Array.from(doc.querySelectorAll("#mainArea .card table.an")).find((x) => /Fin del proyecto/.test(x.textContent!))!;
    expect(filasPlazo.querySelectorAll("tbody tr").length).toBe(7);                      // 6 riesgos + la suma indicativa
    expect(filasPlazo.textContent).toMatch(/R-01.*2\.4\.1.*crítica/);
    expect(doc.getElementById("mainArea")!.textContent).not.toMatch(/Sin ubicar en el cronograma/);
  });

  it("conectado: usa la red del PROYECTO (EDT + actividades + enlaces), no la del ejemplo; lo que tiene holgura la absorbe", async () => {
    const wbs = { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2", "w3"] }, w1: { id: "w1", name: "Uno", children: [] }, w2: { id: "w2", name: "Dos", children: [] }, w3: { id: "w3", name: "Tres", children: [] } } };
    const activities = { idCounter: 4, byLeaf: { w1: [{ id: "a1", name: "Excavar", unit: "m", qty: 10, perf: 1, teams: 1 }], w2: [{ id: "a2", name: "Rellenar", unit: "m", qty: 5, perf: 1, teams: 1 }], w3: [{ id: "a3", name: "Limpiar", unit: "m", qty: 2, perf: 1, teams: 1 }] } };
    const schedule = { linkCounter: 3, import: null, baseline: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }, { id: "L2", from: "a1", to: "a3", type: "FS", lag: 0, lagUnit: "d" }] };
    const riesgo = (id: string, code: string, w: string) => ({ id, code, title: "Riesgo " + code, cause: "c", event: "e", effect: "f", type: "amenaza", status: "monitoreo", owner: "PM", wbsIds: [w], prob: 3, impCost: 1, impTime: 2, impScope: 1, timeImpact: { low: 3, likely: 5, high: 8 } });
    const seed = proyecto({ wbs, activities, schedule, risks: { plan: {}, idCounter: 3, risks: [riesgo("k1", "R-01", "w2"), riesgo("k2", "R-02", "w3")] } });
    (seed.projects.p1.meta as Record<string, unknown>).startDate = "2026-07-06";
    const dom = await abrir(seed), doc = dom.window.document;
    fila(doc, "R-01").click();                                                            // w2 (Rellenar, 5 d) está en la ruta crítica: 10 + 5 = 15 d
    expect(calc(doc)).toMatch(/1\.2\.1.*Rellenar.*crítica/);
    expect(calc(doc)).toMatch(/Más probable\s*5 d\s*5 d/);
    fila(doc, "R-02").click();                                                            // w3 (Limpiar, 2 d) tiene 3 d de holgura: 5 − 3 = 2 d
    const t2 = doc.querySelector(`#det-k2 .calc`)!.textContent!.replace(/\s+/g, " ");
    expect(t2).toMatch(/1\.3\.1.*Limpiar.*holgura 3 d/);
    expect(t2).toMatch(/Mínimo\s*3 d\s*0 d\s*Más probable\s*5 d\s*2 d\s*Máximo\s*8 d\s*5 d/);
    await vista(dom, "analisis");
    expect(doc.getElementById("mainArea")!.textContent).toMatch(/base 15 d, fin 2026-07-24/);   // 15 días laborables desde el lunes 2026-07-06
  });

  it("conectado sin actividades: avisa que falta el cronograma en vez de inventar un efecto", async () => {
    const r = { id: "k1", code: "R-01", title: "T", cause: "c", event: "e", effect: "f", type: "amenaza", status: "monitoreo", owner: "PM", wbsIds: [], prob: 3, impCost: 1, impTime: 2, impScope: 1, timeImpact: { low: 3, likely: 5, high: 8 } };
    const dom = await abrir(proyecto({ risks: { plan: {}, idCounter: 2, risks: [r] } })), doc = dom.window.document;
    fila(doc, "R-01").click();
    expect(calc(doc)).toMatch(/El proyecto aún no tiene actividades enlazadas/);
    expect(doc.querySelector('[data-f="actIds"]')).toBeNull();                            // no hay actividades que elegir
    await vista(dom, "analisis");
    expect(doc.getElementById("mainArea")!.textContent).toMatch(/aún no tiene actividades enlazadas en el cronograma/);
  });

  // ---- Política de reservas: quién libera la contingencia (la aplica Costos al aprobar órdenes de cambio) ----
  const inpPlan = (doc: Document, p: string) => doc.querySelector(`.pi[data-p="${p}"]`) as HTMLInputElement;

  it("Plan: la política de reservas define quién libera la contingencia por monto y el umbral de alerta; se valida su coherencia", async () => {
    const dom = await abrir(), doc = dom.window.document;
    await vista(dom, "plan");
    expect(inpPlan(doc, "reserves.pmLimit").value).toBe("50000");                     // el ejemplo: PM hasta 50.000, CCB hasta 250.000, alerta al 25 %
    expect(inpPlan(doc, "reserves.ccbLimit").value).toBe("250000");
    expect(inpPlan(doc, "reserves.contAlertPct").value).toBe("25");
    expect(doc.getElementById("planMsg")!.style.display).toBe("none");
    poner(dom, inpPlan(doc, "reserves.ccbLimit"), "40000");                            // el CCB no puede tener menos autoridad que el PM
    expect(doc.getElementById("planMsg")!.textContent).toMatch(/límite del Director de Proyecto no puede superar el del CCB/);
    poner(dom, inpPlan(doc, "reserves.ccbLimit"), "");                                 // vacío = sin tope (todo lo demás lo libera el CCB)
    expect(doc.getElementById("planMsg")!.style.display).toBe("none");
    poner(dom, inpPlan(doc, "reserves.contAlertPct"), "150");
    expect(doc.getElementById("planMsg")!.textContent).toMatch(/entre 0 y 100/);
  });

  it("Plan: un proyecto guardado antes de la política (sin `reserves`) abre sin límites y queda editable", async () => {
    const dom = await abrir(proyecto({ risks: { plan: { reservePolicy: "texto libre" }, idCounter: 1, risks: [] } })), doc = dom.window.document;
    await vista(dom, "plan");
    expect(inpPlan(doc, "reserves.pmLimit").value).toBe("");
    expect(inpPlan(doc, "reserves.ccbLimit").value).toBe("");
    expect(doc.querySelector('.pi[data-p="reservePolicy"]')!.textContent).toBe("texto libre");
    poner(dom, inpPlan(doc, "reserves.pmLimit"), "10000");
    expect(doc.getElementById("planMsg")!.style.display).toBe("none");
  });

  it("el Panel de Control ya lista el módulo y su indicador (riesgos abiertos y altos)", async () => {
    const seed = proyecto({ risks: { risks: [
      { id: "a", code: "R-01", title: "x", prob: 5, impCost: 5, status: "identificado" }, { id: "b", code: "R-02", title: "y", prob: 1, impCost: 1 }, { id: "c", code: "R-03", title: "z", prob: 5, impCost: 5, status: "cerrado" }] } });
    const dom = await JSDOM.fromURL(base + "Panel_Control.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
    const card = Array.from(dom.window.document.querySelectorAll(".mod-card, .card, [data-key]")).find((c) => /Gestión de Riesgos/.test(c.textContent || ""));
    expect(card).toBeTruthy();
    expect(card!.innerHTML).toContain("Risk_Register.html");
    expect(card!.textContent).toMatch(/2\s*riesgos abiertos/);                 // el cerrado no cuenta
    expect(card!.textContent).toMatch(/1\s*de nivel alto/);
  });
});
