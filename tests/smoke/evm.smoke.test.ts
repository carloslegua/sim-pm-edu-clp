// Smoke test del módulo Valor_Ganado.html (Valor Ganado / EVM: PMBOK + AACE).
// Servido por HTTP local (no file://): ver el comentario en tests/smoke/obs-builder.smoke.test.ts.
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
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;
});
afterAll(() => { server.close(); });

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const abrir = async (seed?: unknown) => {
  const dom = await JSDOM.fromURL(base + "Valor_Ganado.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
// texto visible con un espacio entre celdas y bloques (textContent los pega: «BAC (trabajo)S/ 7,100,000»)
const top = (doc: Document) => doc.getElementById("evTop")!.innerHTML.replace(/<\/(div|td|th|tr|li|span|p|b)>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const fila = (doc: Document, code: string) => Array.from(doc.querySelectorAll("tr.evrow")).find((r) => r.querySelector("td")!.textContent === code) as HTMLElement;
const celda = (doc: Document, code: string, k: string) => fila(doc, code).querySelector(`[data-k="${k}"]`)!.textContent!.replace(/\s+/g, " ");
const dinero = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };
const campo = (doc: Document, code: string, f: string) => fila(doc, code).querySelector(`[data-f="${f}"]`) as HTMLInputElement | HTMLSelectElement;

// Proyecto conectado con su propia red: a1 (10 d) → a2 (5 d); paquetes 1.1 y 1.2 de 1.000 cada uno (Estimar los Costos)
const proyecto = (extra: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1, startDate: "2026-07-06", ...meta }, modules: {
    wbs: { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2"] }, w1: { id: "w1", name: "Excavación", children: [], percent: 60 }, w2: { id: "w2", name: "Relleno", children: [] } } },
    activities: { idCounter: 3, byLeaf: { w1: [{ id: "a1", name: "Excavar", unit: "m", qty: 10, perf: 1, teams: 1 }], w2: [{ id: "a2", name: "Rellenar", unit: "m", qty: 5, perf: 1, teams: 1 }] } },
    costEstimate: { byActivity: { a1: 100, a2: 200 } },
    schedule: { linkCounter: 2, import: null, baseline: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }] },
    ...extra
  } } }
});

describe("Valor_Ganado.html (Valor Ganado / EVM)", () => {
  it("modo independiente: arranca con el ejemplo DISTRIB+ y su cifras salen de la red y de los costos (corte 2026-11-03)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("tr.evrow").length).toBe(18);
    const t = top(doc);
    expect(t).toMatch(/BAC del trabajo \$ 7,100,000/);
    expect(t).toMatch(/PV — planificado \$ 3,439,533 48\.4 % del BAC/);
    expect(t).toMatch(/EV — ganado \$ 3,182,500 44\.8 % del BAC/);
    expect(t).toMatch(/AC — costo real \$ 3,253,500/);
    expect(t).toMatch(/CPI 0\.98/); expect(t).toMatch(/SPI 0\.93/);
    expect(t).toMatch(/CV −\$ 71,000/);
    expect(doc.querySelectorAll("#evTop .kpi.ambar").length).toBeGreaterThanOrEqual(2);              // SPI, SV y CV en ámbar
    expect(doc.querySelectorAll("#evTop .kpi.verde").length).toBeGreaterThanOrEqual(1);              // CPI verde: el peor de los indicadores manda
    expect(t).toMatch(/Estado: costo ÁMBAR · plazo ÁMBAR/);
    // pronósticos y cronograma ganado
    expect(t).toMatch(/Típico.*\$ 7,2\d\d,\d{3}/);
    expect(t).toMatch(/Cronograma ganado \(Earned Schedule\)/);
    expect(t).toMatch(/Tiempo real transcurrido \(AT\) 85 d/);
    expect(t).toMatch(/Duración planificada → pronosticada \(PD \/ SPI\(t\)\) 273 d → (2[89]\d|3\d\d)(\.\d)? d/);
    // historial y curva S
    expect(doc.querySelectorAll("#evHist tbody tr").length).toBe(3);
    expect(doc.querySelectorAll("#evTop svg.scurve path").length).toBeGreaterThanOrEqual(3);          // PV, EV y AC
    expect(t).toMatch(/No hay línea base del cronograma/);                                            // el ejemplo usa el cronograma vigente y lo dice
  });

  it("técnicas por paquete: 2.4 (licencia) con 0/100 no gana hasta emitirse; 1.3 es LOE (EV = PV); el resto % físico", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(celda(doc, "2.4", "ev")).toBe("$ 0");                                                     // 90 % de gestión pero 0/100
    expect((campo(doc, "2.4", "technique") as HTMLSelectElement).value).toBe("cero_cien");
    expect((campo(doc, "1.3", "technique") as HTMLSelectElement).value).toBe("loe");
    expect(celda(doc, "1.3", "ev")).toBe(celda(doc, "1.3", "pv"));                                    // LOE: se gana lo planificado
  });

  it("editar recalcula EN VIVO sin reconstruir los campos: el avance sube el EV, la técnica lo cambia y el costo real mueve el CPI", async () => {
    const dom = await abrir(), doc = dom.window.document;
    const inp = campo(doc, "2.4", "percent");
    const ev0 = dinero(top(doc).match(/EV — ganado \$ ([\d,]+)/)![1]);
    poner(dom, campo(doc, "2.4", "technique"), "fisico", "change");                                    // 90 % físico de 64.000 = 57.600
    expect(celda(doc, "2.4", "ev")).toBe("$ 57,600");
    expect(dinero(top(doc).match(/EV — ganado \$ ([\d,]+)/)![1])).toBe(ev0 + 57600);
    expect(campo(doc, "2.4", "percent")).toBe(inp);                                                   // el campo sigue siendo el mismo nodo
    poner(dom, campo(doc, "3.1", "technique"), "cero_cien", "change");                                 // estructuras al 90 % con 0/100: no gana nada
    expect(celda(doc, "3.1", "ev")).toBe("$ 0");
    expect(top(doc)).toMatch(/SPI 0\.[0-8]\d/);                                                        // SPI cae con menos EV
    poner(dom, campo(doc, "3.1", "ac"), "3000000");                                                    // el costo real se dispara
    expect(top(doc)).toMatch(/CPI 0\.[0-9]\d/);
    expect(top(doc)).toMatch(/Estado: costo ROJO/);
  });

  it("cambiar la fecha de corte mueve el PV a lo que la línea base pedía a ese día; antes del inicio no hay nada planificado", async () => {
    const dom = await abrir(), doc = dom.window.document;
    poner(dom, doc.getElementById("statusDate")!, "2026-08-18", "change");                               // día 30 (el calendario del caso descansa el 28 y 29 de julio): PV 145.563
    expect(top(doc)).toMatch(/PV — planificado \$ 145,563/); expect(top(doc)).toMatch(/Tiempo real transcurrido \(AT\) 30 d/);
    poner(dom, doc.getElementById("statusDate")!, "2026-06-01", "change");
    expect(top(doc)).toMatch(/PV — planificado \$ 0/);
    expect(top(doc)).toMatch(/fecha de corte es anterior al inicio del proyecto/);
  });

  it("registrar un corte lo agrega al historial y a la curva S (uno por fecha: repetir la fecha lo reemplaza); se puede quitar", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("#evHist tbody tr").length).toBe(3);
    (doc.getElementById("btnRegister") as HTMLElement).click();                                        // corte del 2026-11-03
    expect(doc.querySelectorAll("#evHist tbody tr").length).toBe(4);
    expect(doc.querySelector("#evHist tbody tr")!.textContent).toMatch(/2026-11-03.*85 d.*\$ 3,439,533.*\$ 3,182,500.*\$ 3,253,500.*0\.98.*0\.93/);   // el más reciente primero
    (doc.getElementById("btnRegister") as HTMLElement).click();
    expect(doc.querySelectorAll("#evHist tbody tr").length).toBe(4);                                   // misma fecha: reemplaza
    (doc.querySelector('#evHist [data-del="2026-11-03"]') as HTMLElement).click();
    expect(doc.querySelectorAll("#evHist tbody tr").length).toBe(3);
  });

  it("proyecto conectado: arranca EN BLANCO (nada reportado); el BAC es el costo del trabajo de Estimar los Costos; el PV sale de su red", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(doc.querySelectorAll("tr.evrow").length).toBe(2);
    expect(top(doc)).toMatch(/BAC del trabajo S\/ 2,000/);                                            // 10×100 + 5×200
    poner(dom, doc.getElementById("statusDate")!, "2026-07-17", "change");                               // 10 días laborables: el paquete 1.1 (a1) debía estar completo
    expect(top(doc)).toMatch(/PV — planificado S\/ 1,000/);
    expect(top(doc)).toMatch(/EV — ganado S\/ 0/);                                                    // sin avance reportado
    expect(top(doc)).toMatch(/1 paquete\(s\) que ya debían estar en marcha no tienen avance reportado/);
    expect(celda(doc, "1.1", "plannedPct")).toBe("100 %");
    expect(top(doc)).toMatch(/Estimar los Costos|BAC/);
    expect(doc.querySelector("tr.evrow")!.textContent).toMatch(/Estimar los Costos/);
  });

  it("consume los planes: la técnica y los umbrales de CPI/CV salen del Plan de Costos, y SPI/SV del Plan del Cronograma; compara el sobrecosto con la contingencia", async () => {
    const seed = proyecto({
      cost: { plan: { evMethod: "0/100 (al completar)", thresholds: { cpi: { warn: 0.98, escalate: 0.92 }, cv: { warn: -100, escalate: -500 } } }, budget: { computed: { bac: 2500, cont: 300 } }, changeTotals: { contingencyAvailable: 80 } },
      schedulePlan: { controlThresholds: [{ key: "SPI", greenValue: 1.0, redValue: 0.97 }, { key: "SV", greenValue: -1, redValue: -3 }] }
    });
    const dom = await abrir(seed), doc = dom.window.document;
    expect((campo(doc, "1.1", "technique") as HTMLSelectElement).value).toBe("cero_cien");            // la del plan de costos
    poner(dom, doc.getElementById("statusDate")!, "2026-07-17", "change");
    poner(dom, campo(doc, "1.1", "percent"), "100"); poner(dom, campo(doc, "1.1", "ac"), "1100");      // EV 1.000, PV 1.000, AC 1.100
    const t = top(doc);
    expect(t).toMatch(/CPI 0\.91/); expect(t).toMatch(/umbral ≤ 0\.98 alerta · ≤ 0\.92 escala/);      // los umbrales del plan de costos
    expect(doc.querySelectorAll("#evTop .kpi.rojo").length).toBeGreaterThanOrEqual(1);                  // 0,909 ≤ 0,92: escalamiento (con el 0,95/0,90 por omisión sería ámbar)
    expect(t).toMatch(/verde ≥ 1\.00 · rojo < 0\.97/);                                                // los del plan del cronograma
    expect(t).toMatch(/El sobrecosto pronosticado \(típico\) es S\/ 2\d\d.*contingencia disponible es S\/ 80.*NO alcanza/);
    poner(dom, campo(doc, "1.1", "percent"), "50");                                                    // 0/100: al 50 % no gana nada
    expect(celda(doc, "1.1", "ev")).toBe("S/ 0");
  });

  it("REPRO (auditoría, alta): una orden aprobada con contingencia pasa al presupuesto de SU paquete; sin paquete se avisa (antes se contaba dos veces)", async () => {
    const seed = proyecto({ cost: { budget: { computed: { bac: 3000, cont: 1000 } }, changeTotals: { contingencyAvailable: 200 }, changeOrders: [
      { id: "OC-001", status: "Aprobada", fund: "Contingencia", cost: 500, wbsId: "w1", wbsCode: "1.1" },
      { id: "OC-002", status: "Aprobada", fund: "Contingencia", cost: 300 },                                           // sin paquete
      { id: "OC-003", status: "Pendiente", fund: "Contingencia", cost: 900, wbsId: "w2" },                              // pendiente: no
      { id: "OC-004", status: "Aprobada", fund: "Reserva de gestión", cost: 700, wbsId: "w2" }] } });                  // sin incorporar a la línea base: aún no
    const dom = await abrir(seed), doc = dom.window.document, t = top(doc);
    expect(t).toMatch(/BAC del trabajo S\/ 2,500 incluye 1 orden\(es\) de cambio aprobada\(s\)/);                  // 2.000 + 500
    expect(doc.querySelector("tr.evrow")!.textContent).toMatch(/Estimar los Costos \+ OC-001/);
    expect(t).toMatch(/sin paquete de trabajo: OC-002 \(300\)/);
    poner(dom, doc.getElementById("statusDate")!, "2026-07-17", "change");
    poner(dom, campo(doc, "1.1", "percent"), "100"); poner(dom, campo(doc, "1.1", "ac"), "1500");                    // el refuerzo se gastó: 1.000 + 500
    expect(top(doc)).toMatch(/CPI 1\.00/);                                                                            // antes: 1.000 / 1.500 = 0,67 (sobrecosto que la contingencia ya cubría)
    expect(top(doc)).toMatch(/lo ya aprobado con cargo a ella está dentro del BAC del trabajo|Contingencia disponible/);
  });

  it("usa la LÍNEA BASE del cronograma si existe (PV congelado) y lo dice; sin ella avisa que usa el cronograma vigente", async () => {
    const baseline = { frozen: true, version: "LB-1", date: "2026-07-06", snapshot: { projectDuration: 30, startDate: "2026-07-06", finishDate: "2026-08-14", nearCriticalDays: 5, rows: [
      { id: "a1", code: "1.1.1", name: "Excavar", isMilestone: false, dur: 10, es: 0, ef: 20, tf: 0, critical: true },      // la línea base era MÁS lenta que la red actual
      { id: "a2", code: "1.2.1", name: "Rellenar", isMilestone: false, dur: 5, es: 20, ef: 30, tf: 0, critical: true }] },
      log: [{ version: "LB-1", date: "2026-07-06", reason: "Inicial", approver: "Sponsor", sponsorAuth: false, projectDuration: 30, finishDate: "2026-08-14", deviationPct: null }] };
    const dom = await abrir(proyecto({ schedule: { linkCounter: 2, import: null, baseline, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }] } })), doc = dom.window.document;
    poner(dom, doc.getElementById("statusDate")!, "2026-07-17", "change");                               // día 10: con la línea base a1 iba al 50 % (0→20), no al 100 %
    expect(celda(doc, "1.1", "plannedPct")).toBe("50 %");
    expect(top(doc)).toMatch(/PV — planificado S\/ 500/);
    expect(top(doc)).toMatch(/línea base LB-1/);
    expect(top(doc)).not.toMatch(/No hay línea base del cronograma/);
    expect(top(doc)).toMatch(/Duración planificada → pronosticada.*30 d/);                             // PD de la línea base, no la de la red actual
  });

  // ---- Auditoría (alta): la línea base congela presupuesto por paquete, inicio, calendario y estructura, no solo las fechas ----
  const lb = (evm: unknown) => ({ frozen: true, version: "LB-1", date: "2026-07-06", snapshot: { projectDuration: 15, startDate: "2026-07-06", finishDate: "2026-07-24", nearCriticalDays: 5, ...(evm ? { evm } : {}), rows: [
    { id: "a1", code: "1.1.1", name: "Excavar", isMilestone: false, dur: 10, es: 0, ef: 10, tf: 0, critical: true }, { id: "a2", code: "1.2.1", name: "Rellenar", isMilestone: false, dur: 5, es: 10, ef: 15, tf: 0, critical: true }] },
    log: [{ version: "LB-1", date: "2026-07-06", reason: "Inicial", approver: "Sponsor", sponsorAuth: false, projectDuration: 15, finishDate: "2026-07-24", deviationPct: null }] });
  const REF = { calendar: { workDayIdx: [1, 2, 3, 4, 5], holidays: [] }, total: 2000, packages: [
    { id: "w1", code: "1.1", name: "Excavación", bac: 1000, source: "Línea base", es: 0, ef: 10 }, { id: "w2", code: "1.2", name: "Relleno", bac: 1000, source: "Línea base", es: 10, ef: 15 }] };
  const conBase = (baseline: unknown, estimate: Record<string, number>, meta: Record<string, unknown> = {}) => proyecto({
    schedule: { linkCounter: 2, import: null, baseline, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }] }, costEstimate: { byActivity: estimate },
    evm: { statusDate: "2026-07-17", percent: { w1: 50 }, ac: { w1: 600 }, techniques: {}, reports: [] }
  }, meta);
  const cifras = (doc: Document) => { const t = top(doc), g = (re: RegExp) => (t.match(re) || [])[1] || "—"; return { bac: g(/BAC del trabajo \S+ ([\d,]+)/), pv: g(/PV — planificado \S+ ([\d,]+)/), ev: g(/EV — ganado \S+ ([\d,]+)/), cpi: g(/CPI ([\d.]+)/) }; };

  it("REPRO (alta) con la línea base CONGELADA: duplicar la estimación NO cambia el CPI (0,83 se queda en 0,83, sigue ROJO) y se avisa qué difiere", async () => {
    const base = cifras((await abrir(conBase(lb(REF), { a1: 100, a2: 200 }))).window.document);
    expect(base).toMatchObject({ bac: "2,000", pv: "1,000", ev: "500", cpi: "0.83" });
    const dom = await abrir(conBase(lb(REF), { a1: 200, a2: 400 })), doc = dom.window.document;          // la estimación se DUPLICÓ (BAC vivo 4.000)
    expect(cifras(doc)).toEqual(base);                                                                    // …y las cifras no se mueven
    expect(doc.querySelectorAll("#evTop .kpi.rojo").length).toBeGreaterThanOrEqual(1);                   // el estado sigue rojo, no pasa a verde
    expect(top(doc)).toMatch(/Después de fijar la línea base LB-1 cambió\(aron\): el presupuesto por paquete \(2 paquete\(s\); total vigente 4[.,]000 frente a 2[.,]000/);
    expect(top(doc)).toMatch(/fija una nueva versión de la línea base/); expect(top(doc)).toMatch(/línea base LB-1 congelada/);
    expect(doc.body.textContent).toMatch(/presupuesto por paquete, la fecha de inicio y el calendario congelados/);   // tarjeta «Cómo se calcula»
  });
  it("REPRO (alta): cambiar la fecha de inicio del proyecto NO altera el PV con la línea base congelada (y se avisa)", async () => {
    const base = cifras((await abrir(conBase(lb(REF), { a1: 100, a2: 200 }))).window.document);
    const doc = (await abrir(conBase(lb(REF), { a1: 100, a2: 200 }, { startDate: "2026-08-03" }))).window.document;
    expect(cifras(doc)).toEqual(base); expect(top(doc)).toMatch(/la fecha de inicio \(2026-08-03 frente a 2026-07-06 en la línea base\)/);
  });
  it("una línea base ANTIGUA (sin referencia congelada) conserva el comportamiento y lo AVISA: duplicar la estimación sí mueve el CPI (0,83 → 1,67)", async () => {
    expect(cifras((await abrir(conBase(lb(null), { a1: 100, a2: 200 }))).window.document).cpi).toBe("0.83");
    const doc = (await abrir(conBase(lb(null), { a1: 200, a2: 400 }))).window.document;
    expect(cifras(doc).cpi).toBe("1.67");
    expect(top(doc)).toMatch(/La línea base LB-1 se fijó antes de que el presupuesto por paquete, la fecha de inicio y el calendario se congelaran/); expect(top(doc)).toMatch(/presupuesto sin congelar/);
  });
  it("sin cambios entre lo congelado y lo vigente no hay aviso de diferencias", async () => {
    expect(top((await abrir(conBase(lb(REF), { a1: 100, a2: 200 }))).window.document)).not.toMatch(/Después de fijar la línea base/);
  });

  it("traer el avance de la EDT completa los % de los paquetes que lo tienen; lo reportado se guarda con el proyecto y sobrevive a recargar", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    (doc.getElementById("btnPull") as HTMLElement).click();
    expect((campo(doc, "1.1", "percent") as HTMLInputElement).value).toBe("60");                       // w1 tiene percent 60 en la EDT
    expect((campo(doc, "1.2", "percent") as HTMLInputElement).value).toBe("");                         // w2 no tiene: se queda sin reportar
    poner(dom, campo(doc, "1.1", "ac"), "700");
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.evm;
    expect(saved).toMatchObject({ percent: { w1: 60 }, ac: { w1: 700 } });
    expect(typeof saved.statusDate).toBe("string");
    const otra = await abrir(JSON.parse(dom.window.localStorage.getItem("gpi_db") as string)), d2 = otra.window.document;
    expect((campo(d2, "1.1", "percent") as HTMLInputElement).value).toBe("60");
    expect((campo(d2, "1.1", "ac") as HTMLInputElement).value).toBe("700");
  });

  it("«Cargar ejemplo» en un proyecto conectado se empareja por Código EDT con sus paquetes y lo que no existe se omite", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect((doc.getElementById("statusDate") as HTMLInputElement).value).toBe("2026-11-03");
    expect((campo(doc, "1.1", "percent") as HTMLInputElement).value).toBe("100");                       // 1.1 existe en el ejemplo y en el proyecto
    expect((campo(doc, "1.1", "ac") as HTMLInputElement).value).toBe("12000");
    expect(doc.querySelectorAll("#evHist tbody tr").length).toBe(3);
  });

  it("proyecto sin actividades: dice qué falta en vez de inventar un cronograma", async () => {
    const seed = proyecto(); const mods = seed.projects.p1.modules as Record<string, unknown>; mods.activities = { idCounter: 1, byLeaf: {} }; mods.schedule = { linkCounter: 1, import: null, baseline: null, links: [] };
    const dom = await abrir(seed), doc = dom.window.document;
    expect(doc.querySelectorAll("tr.evrow").length).toBe(0);
    expect(doc.getElementById("mainArea")!.textContent).toMatch(/aún no tiene actividades/);
  });

  it("«Nuevo seguimiento» borra lo reportado y el historial", async () => {
    const dom = await abrir(), doc = dom.window.document;
    (doc.getElementById("btnReset") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#evHist tbody tr").length).toBe(1);                                  // solo la fila «Aún no hay cortes»
    expect(top(doc)).toMatch(/EV — ganado \$ 0/);
    expect((campo(doc, "1.1", "percent") as HTMLInputElement).value).toBe("");
  });
});
