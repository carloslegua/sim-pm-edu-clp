// Smoke test del módulo Plan_Calidad.html (Plan de Gestión de la Calidad: PMBOK).
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
  const dom = await JSDOM.fromURL(base + "Plan_Calidad.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const limpio = (html: string) => html.replace(/<\/(div|td|th|tr|li|span|p|b|label)>/g, " ").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const txt = (doc: Document, id: string) => limpio(doc.getElementById(id)!.innerHTML);
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };

// Proyecto conectado: EDT de dos paquetes con su criterio de aceptación en el diccionario (uno de esfuerzo continuo), OBS y presupuesto
const proyecto = (extra: Record<string, unknown> = {}) => ({
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1 }, modules: {
    wbs: { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2", "w3"] },
      w1: { id: "w1", name: "Cimentaciones", children: [], cost: 700000, acceptance: "Ensayos de resistencia del concreto aprobados" }, w2: { id: "w2", name: "Gestión", children: [], cost: 100000, acceptance: "Informe mensual aceptado", loe: true }, w3: { id: "w3", name: "Pruebas", children: [], cost: 200000, acceptance: "Protocolos firmados" } } },
    obs: { rootId: "r", idCounter: 3, nodes: { r: { id: "r", role: "Gerencia", children: ["o1"] }, o1: { id: "o1", parentId: "r", role: "Control de Calidad", children: [] } } },
    cost: { budget: { baseCost: 1000000, computed: { base: 1000000 } }, changeOrders: [] },
    ...extra
  } } }
});

describe("Plan_Calidad.html (Plan de Gestión de la Calidad)", () => {
  it("modo independiente: muestra el ejemplo DISTRIB+ (17 controles, 5 métricas, costo 350.000, sin hallazgos)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("#tblChecks tbody tr").length).toBe(17); expect(doc.querySelectorAll("#tblMetrics tbody tr").length).toBe(5); expect(doc.querySelectorAll("#tblCoq tbody tr").length).toBe(6);
    const k = txt(doc, "kpis"); expect(k).toMatch(/17\/17/); expect(k).toMatch(/\$ 350,000|\$ 350\.000/); expect(k).toMatch(/4\.9 % del costo base/); expect(k).toMatch(/En orden/);
    expect(txt(doc, "finds")).toMatch(/Sin hallazgos/);
    expect(doc.querySelectorAll("#cover tbody tr").length).toBe(18); expect(txt(doc, "cover")).toMatch(/1\.3 Informes de seguimiento y control .* esfuerzo continuo/);
  });

  it("proyecto conectado: arranca EN BLANCO (regla de oro) y la cobertura sale de la EDT y su diccionario", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(doc.querySelectorAll("#tblChecks").length).toBe(0); expect(txt(doc, "mainArea")).toMatch(/Sin actividades de control ni aseguramiento/);
    const c = txt(doc, "cover"); expect(c).toMatch(/Cimentaciones.*Ensayos de resistencia del concreto aprobados.*sin verificación/); expect(c).toMatch(/Gestión.*esfuerzo continuo/);
  });

  it("agregar un control: los hallazgos se actualizan al editar, «Tomar de la EDT» copia el criterio y se guarda en el proyecto", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, w = dom as any;
    (doc.getElementById("btnAddCheck") as HTMLElement).click();
    expect(doc.querySelectorAll("#tblChecks tbody tr").length).toBe(1);
    expect(txt(doc, "finds")).toMatch(/Q1 .*«Cimentaciones»/); expect(txt(doc, "finds")).toMatch(/Q4 .*incompleta/);
    const row = () => doc.querySelector("#tblChecks tbody tr") as HTMLElement, f = (k: string) => row().querySelector(`[data-f="${k}"]`) as HTMLInputElement;
    poner(w, f("wbsId"), "w1", "change");
    (row().querySelector("[data-edt]") as HTMLElement).click();                                                // criterio ← Diccionario de la EDT
    expect(f("criterion").value).toBe("Ensayos de resistencia del concreto aprobados");
    poner(w, f("what"), "Ensayo de probetas"); poner(w, f("kind"), "Control", "change"); poner(w, f("method"), "Ensayo de laboratorio", "change"); poner(w, f("frequency"), "Por vaciado"); poner(w, f("owner"), "Control de Calidad"); poner(w, f("record"), "Informe de ensayo");
    const t = txt(doc, "finds");
    expect(t).not.toMatch(/Q1 .*Cimentaciones/); expect(t).not.toMatch(/Q4 /); expect(t).toMatch(/Q1 .*«Pruebas»/);                // Pruebas (w3) sigue sin verificación
    await esperar(1100);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.quality;
    expect(saved.checks).toHaveLength(1); expect(saved.checks[0]).toMatchObject({ code: "QC-01", wbsId: "w1", kind: "Control", owner: "Control de Calidad" });
  });

  it("costo de la calidad: las partidas suman por categoría y avisan si no hay prevención", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, w = dom as any;
    (doc.getElementById("btnAddCoq") as HTMLElement).click();
    const r = doc.querySelector("#tblCoq tbody tr") as HTMLElement, f = (k: string) => r.querySelector(`[data-f="${k}"]`) as HTMLInputElement;
    poner(w, f("cat"), "evaluacion", "change"); poner(w, f("description"), "Ensayos"); poner(w, f("amount"), "50000");
    expect(txt(doc, "kpis")).toMatch(/S\/ 50,000 Costo de la calidad · 5\.0 % del costo base/); expect(txt(doc, "coqBars")).toMatch(/Evaluación .* 100 %/);
  });

  it("«Cargar ejemplo» con proyecto conectado se enlaza por código de paquete; los que no existen quedan sin paquete y se avisa; «Nuevo plan» vacía", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#tblChecks tbody tr").length).toBe(17);
    expect(doc.getElementById("statusLeft")!.textContent).toMatch(/control\(es\) del ejemplo no encontraron su paquete/);
    (doc.getElementById("btnClear") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#tblChecks").length).toBe(0);
  });
});
