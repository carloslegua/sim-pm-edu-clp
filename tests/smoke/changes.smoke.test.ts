// Smoke test del módulo Control_Cambios.html (Control Integrado de Cambios: PMBOK).
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
  const dom = await JSDOM.fromURL(base + "Control_Cambios.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const limpio = (html: string) => html.replace(/<\/(div|td|th|tr|li|span|p|b|label)>/g, " ").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const kpis = (doc: Document) => limpio(doc.getElementById("kpiBox")!.innerHTML);
const fila = (doc: Document, code: string) => Array.from(doc.querySelectorAll("tr.cr-row")).find((r) => r.querySelector("td")!.textContent === code) as HTMLElement;
const abrirFila = (doc: Document, code: string) => { fila(doc, code).click(); return fila(doc, code); };
const detalle = (doc: Document, code: string) => doc.getElementById("det-" + fila(doc, code).dataset.id)!;
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };
const campo = (doc: Document, code: string, f: string, a?: string, k?: string) => detalle(doc, code).querySelector(`[data-f="${f}"]${a ? `[data-a="${a}"]` : ""}${k ? `[data-k="${k}"]` : ""}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const elegir = (dom: any, el: HTMLSelectElement, values: string[]) => { Array.from(el.options).forEach((o) => { o.selected = values.indexOf(o.value) >= 0; }); el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); };
const calc = (doc: Document, code: string) => limpio(detalle(doc, code).querySelector('[id^="calc-"]')!.innerHTML);

// Proyecto conectado con su propia red: a1 (10 d) → a2 (5 d); paquetes 1.1 y 1.2
const proyecto = (extra: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1, startDate: "2026-07-06", ...meta }, modules: {
    wbs: { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2"] }, w1: { id: "w1", name: "Excavación", children: [] }, w2: { id: "w2", name: "Relleno", children: [] } } },
    activities: { idCounter: 3, byLeaf: { w1: [{ id: "a1", name: "Excavar", unit: "m", qty: 10, perf: 1, teams: 1 }], w2: [{ id: "a2", name: "Rellenar", unit: "m", qty: 5, perf: 1, teams: 1 }] } },
    schedule: { linkCounter: 2, import: null, baseline: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }] },
    ...extra
  } } }
});

describe("Control_Cambios.html (Control Integrado de Cambios)", () => {
  it("modo independiente: arranca con las 3 solicitudes del caso DISTRIB+ y sus áreas evaluadas", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("tr.cr-row").length).toBe(3);
    expect(doc.getElementById("btnSample")).toBeTruthy();
    const k = kpis(doc);
    expect(k).toMatch(/Pendientes 2/); expect(k).toMatch(/Aprobadas sin implementar 1/);
    expect(fila(doc, "CR-001").textContent).toMatch(/Aprobada/);
    expect(fila(doc, "CR-002").textContent).toMatch(/Pendiente/);
  });

  it("CR-001 aprobada por el CCB: exige actualizar la línea base del cronograma antes de implementarse", async () => {
    const dom = await abrir(), doc = dom.window.document;
    abrirFila(doc, "CR-001");
    const t = calc(doc, "CR-001");
    expect(t).toMatch(/Líneas base que deben cambiar/);
    expect(t).toMatch(/cronograma/);
    expect(t).toMatch(/Para implementarla falta/);
    expect((campo(doc, "CR-001", "status") as HTMLSelectElement).value).toBe("Aprobada");
  });

  it("no deja pasar a Implementada sin línea base: rechaza el cambio de estado y lo explica", async () => {
    const dom = await abrir(), doc = dom.window.document;
    abrirFila(doc, "CR-001");
    poner(dom, campo(doc, "CR-001", "status"), "Implementada", "change");
    expect((campo(doc, "CR-001", "status") as HTMLSelectElement).value).toBe("Aprobada");
    expect(calc(doc, "CR-001")).toMatch(/No se puede pasar a «Implementada»/);
    expect(doc.getElementById("statusLeft")!.textContent).toMatch(/CR-001/);
  });

  it("CR-002 con riesgo y calidad sin evaluar no se puede aprobar; CR-003 (reserva de gestión) exige al sponsor", async () => {
    const dom = await abrir(), doc = dom.window.document;
    abrirFila(doc, "CR-002");
    expect(calc(doc, "CR-002")).toMatch(/No se puede aprobar todavía/);
    poner(dom, campo(doc, "CR-002", "status"), "Aprobada", "change");
    expect((campo(doc, "CR-002", "status") as HTMLSelectElement).value).toBe("Pendiente");
    abrirFila(doc, "CR-003");
    expect(calc(doc, "CR-003")).toMatch(/Autoridad requerida: Sponsor/);
  });

  it("el efecto en el plazo sale del CPM: la holgura de 4.5 absorbe los 10 d; en la ruta crítica se propagan", async () => {
    const dom = await abrir(), doc = dom.window.document;
    abrirFila(doc, "CR-002");
    expect(limpio(detalle(doc, "CR-002").querySelector('[id^="eff-"]')!.innerHTML)).toMatch(/la holgura lo absorbe/);
    abrirFila(doc, "CR-003");
    expect(limpio(detalle(doc, "CR-003").querySelector('[id^="eff-"]')!.innerHTML)).toMatch(/\+\d+(\.\d)? d el fin del proyecto/);
  });

  it("crear una solicitud nueva: arranca sin evaluar y no se puede aprobar; Eliminar pide confirmación", async () => {
    const dom = await abrir(), doc = dom.window.document;
    (doc.getElementById("btnAdd") as HTMLElement).click();
    expect(doc.querySelectorAll("tr.cr-row").length).toBe(4);
    expect(fila(doc, "CR-004")).toBeTruthy();
    poner(dom, campo(doc, "CR-004", "status"), "Aprobada", "change");
    expect((campo(doc, "CR-004", "status") as HTMLSelectElement).value).toBe("Pendiente");
    (doc.getElementById("btnDelete") as HTMLElement).click();
    expect(doc.getElementById("modalOverlay")!.classList.contains("open")).toBe(true);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(30);
    expect(doc.querySelectorAll("tr.cr-row").length).toBe(3);
  });

  it("exporta CSV con las solicitudes", async () => {
    const dom = await abrir(), doc = dom.window.document;
    let blobText = "";
    (dom.window as any).URL.createObjectURL = (b: Blob) => { b.text().then((t) => { blobText = t; }); return "blob:x"; };
    (dom.window as any).URL.revokeObjectURL = () => {};
    (doc.getElementById("btnExportCsv") as HTMLElement).click(); await esperar(50);
    expect(blobText).toMatch(/CR-001/); expect(blobText).toMatch(/CR-003/);
  });

  it("proyecto conectado sin solicitudes: arranca EN BLANCO (regla de oro) y luego «Cargar ejemplo» las carga", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(doc.querySelectorAll("tr.cr-row").length).toBe(0);
    expect(doc.getElementById("mainArea")!.textContent).toMatch(/Aún no hay solicitudes/);
    (doc.getElementById("btnSample") as HTMLElement).click();
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(100);
    expect(doc.querySelectorAll("tr.cr-row").length).toBe(3);
  });

  it("proyecto conectado: guarda en gpi_db.projects.<id>.modules.changes y los cambios sobreviven a recargar", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    (doc.getElementById("btnAdd") as HTMLElement).click();
    poner(dom, campo(doc, "CR-001", "title"), "Ampliar el patio de maniobras");
    await esperar(1000);
    const db = JSON.parse(dom.window.localStorage.getItem("gpi_db")!);
    const ch = db.projects.p1.modules.changes;
    expect(ch.requests.length).toBe(1);
    expect(ch.requests[0].title).toBe("Ampliar el patio de maniobras");
    // recarga con lo guardado
    const dom2 = await abrir(db), doc2 = dom2.window.document;
    expect(doc2.querySelectorAll("tr.cr-row").length).toBe(1);
    expect(doc2.querySelector("tr.cr-row")!.textContent).toMatch(/Ampliar el patio de maniobras/);
  });

  it("proyecto conectado: lee órdenes de cambio de Costos y la línea base del cronograma del proyecto (no las del ejemplo)", async () => {
    const seed = proyecto({
      cost: { changeOrders: [{ id: "OC-777", cost: 5000, fund: "Contingencia", status: "Aprobada", baselined: null }] },
      requirements: { changes: [{ id: "m1", code: "MOD-01", summary: "Agregar zona fría" }] }
    });
    const dom = await abrir(seed), doc = dom.window.document;
    (doc.getElementById("btnAdd") as HTMLElement).click();
    const det = detalle(doc, "CR-001");
    const ord = det.querySelector('[data-f="orderIds"]') as HTMLSelectElement;
    expect(Array.from(ord.options).map((o) => o.value)).toEqual(["OC-777"]);
    const mod = det.querySelector('[data-f="modIds"]') as HTMLSelectElement;
    expect(Array.from(mod.options).map((o) => o.textContent)).toEqual(["MOD-01 Agregar zona fría"]);
    // en ese proyecto solo existen 2 paquetes
    const wb = det.querySelector('[data-f="wbsIds"]') as HTMLSelectElement;
    expect(wb.options.length).toBe(2);
  });

  it("proyecto conectado: días sobre la actividad crítica de un red propia se propagan al fin (a1 10 d → a2 5 d)", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    (doc.getElementById("btnAdd") as HTMLElement).click();
    elegir(dom, campo(doc, "CR-001", "wbsIds") as HTMLSelectElement, [(campo(doc, "CR-001", "wbsIds") as HTMLSelectElement).options[0].value]);
    poner(dom, campo(doc, "CR-001", "daysDelta"), "4");
    expect(limpio(detalle(doc, "CR-001").querySelector('[id^="eff-"]')!.innerHTML)).toMatch(/\+4 d el fin del proyecto/);
  });

  it("proyecto activo cambiado en otra pestaña: no guarda sobre el otro proyecto y avisa", async () => {
    const seed = proyecto(); (seed.projects as any).p2 = { schema: "gpi.project/v1", meta: { id: "p2", name: "Otro", createdAt: 1, updatedAt: 1 }, modules: {} };
    const dom = await abrir(seed), doc = dom.window.document;
    const db = JSON.parse(dom.window.localStorage.getItem("gpi_db")!); db.activeId = "p2"; dom.window.localStorage.setItem("gpi_db", JSON.stringify(db));
    dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "gpi_db" }));
    (doc.getElementById("btnAdd") as HTMLElement).click();
    dom.window.dispatchEvent(new dom.window.Event("beforeunload")); await esperar(1000);
    const after = JSON.parse(dom.window.localStorage.getItem("gpi_db")!);
    expect(after.projects.p2.modules.changes).toBeUndefined();
    expect(doc.getElementById("banner")!.classList.contains("show")).toBe(true);
  });
});
