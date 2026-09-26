// Smoke test del módulo Validar_Alcance.html (Validar el alcance: PMBOK).
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
  const dom = await JSDOM.fromURL(base + "Validar_Alcance.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const limpio = (html: string) => html.replace(/<\/(div|td|th|tr|li|span|p|b|label)>/g, " ").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const txt = (doc: Document, id: string) => limpio(doc.getElementById(id)!.innerHTML);
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };

// Proyecto conectado: dos entregables en el Enunciado del Alcance, dos paquetes en la EDT, una no conformidad ABIERTA en el paquete 1.1 y dos puestos del OBS
const proyecto = (extra: Record<string, unknown> = {}) => ({
  version: 2, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1 }, modules: {
    scopeStatement: { productScope: "P", projectScope: "P", delCounter: 3, deliverables: [{ id: "del1", code: "DEL.01", name: "Expediente", description: "", acceptanceCriteria: "Aprobado por la supervisión", ranIds: [], reqIds: [] }, { id: "del2", code: "DEL.02", name: "Licencias", description: "", acceptanceCriteria: "Licencia emitida", ranIds: [], reqIds: [] }], assumptions: [], constraints: [], exclusions: [] },
    wbs: { rootId: "w0", idCounter: 4, nodes: { w0: { id: "w0", name: "Proyecto", children: ["w1", "w2"] }, w1: { id: "w1", parentId: "w0", name: "Diseño", children: [], delId: "del1", acceptance: "Planos aptos" }, w2: { id: "w2", parentId: "w0", name: "Permisos", children: [], delId: "del2" } } },
    quality: { idCounter: 3, policy: "", standards: "", metrics: [], checks: [], coq: [], ncrs: [{ id: "n1", code: "NC-01", wbsId: "w1", description: "Planos con errores", severity: "critica", detectedOn: "2026-10-01", status: "abierta", action: "Reemitir", owner: "PM", dueDate: "2026-12-01", closedOn: "" }], inspections: [] },
    obs: { rootId: "r", idCounter: 4, nodes: { r: { id: "r", role: "Gerencia", children: ["o1", "o2"] }, o1: { id: "o1", parentId: "r", role: "Director de Proyecto", children: [] }, o2: { id: "o2", parentId: "r", role: "Comité Directivo / Sponsor", children: [] } } },
    ...extra
  } } }
});

describe("Validar_Alcance.html (Validar el alcance)", () => {
  it("modo independiente: muestra el ejemplo DISTRIB+ (6 validaciones, 1 entregable aceptado, sin hallazgos)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("#tblVal tbody tr").length).toBe(6);
    expect(txt(doc, "kpis")).toMatch(/1\/6 Entregables aceptados/); expect(txt(doc, "kpis")).toMatch(/En orden/); expect(txt(doc, "finds")).toMatch(/Sin hallazgos/);
    expect((doc.querySelector('#tblVal tr[data-id="va1"] [data-f="decision"]') as HTMLSelectElement).value).toBe("aceptado_con_observaciones");
    expect((doc.getElementById("asOf") as HTMLInputElement).value).toBe("2026-11-03");
  });

  it("proyecto conectado: arranca EN BLANCO (regla de oro) y la cobertura lista los entregables del Enunciado sin validar", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(doc.querySelectorAll("#tblVal").length).toBe(0); expect(txt(doc, "mainArea")).toMatch(/Aún no hay validaciones/);
    expect(txt(doc, "cover")).toMatch(/DEL\.01 Expediente .*Aprobado por la supervisión .* sin validación/); expect(txt(doc, "cover")).toMatch(/DEL\.02 Licencias/);
  });

  it("agregar y aceptar un entregable con una no conformidad abierta: V1 (riesgo) y se guarda en el proyecto", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, w = dom as any;
    (doc.getElementById("btnAdd") as HTMLElement).click();
    expect(doc.querySelectorAll("#tblVal tbody tr").length).toBe(1);
    const row = doc.querySelector('#tblVal tr[data-id="va1"]') as HTMLElement, f = (k: string) => row.querySelector(`[data-f="${k}"]`) as HTMLInputElement;
    poner(w, f("delivId"), "del1", "change");
    (row.querySelector("[data-leaves]") as HTMLElement).click();                                            // paquetes vinculados al entregable en la EDT (w1)
    (row.querySelector("[data-crit]") as HTMLElement).click();
    const r2 = doc.querySelector('#tblVal tr[data-id="va1"]') as HTMLElement, g = (k: string) => r2.querySelector(`[data-f="${k}"]`) as HTMLInputElement;
    expect(g("criteria").value).toBe("Aprobado por la supervisión"); expect(Array.from((g("wbsIds") as unknown as HTMLSelectElement).selectedOptions).map((o) => o.value)).toEqual(["w1"]);
    poner(w, g("decision"), "aceptado", "change"); poner(w, g("reviewer"), "Comité Directivo / Sponsor"); poner(w, g("decidedOn"), "2026-10-09"); poner(w, g("evidence"), "Acta de aceptación");
    const t = txt(doc, "finds");
    expect(t).toMatch(/V1 .*se aceptó con 1 no conformidad\(es\) ABIERTA\(S\) en sus paquetes \(1 crítica\(s\)\)/); expect(t).not.toMatch(/V2 /);
    expect(txt(doc, "kpis")).toMatch(/Con riesgos/);
    await esperar(1100);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.scopeValidation;
    expect(saved.records).toHaveLength(1); expect(saved.records[0]).toMatchObject({ code: "VA-01", delivId: "del1", wbsIds: ["w1"], decision: "aceptado", reviewer: "Comité Directivo / Sponsor" });
  });

  it("«Cargar ejemplo» con proyecto conectado enlaza por NOMBRE de entregable y reemplaza; «Nueva validación» vacía", async () => {
    const dom = await abrir(proyecto({ scopeStatement: { productScope: "P", projectScope: "P", delCounter: 2, deliverables: [{ id: "delX", code: "DEL.01", name: "Expediente técnico de ingeniería", description: "", acceptanceCriteria: "Expediente revisado y aprobado por la supervisión; planos aptos para construcción.", ranIds: [], reqIds: [] }], assumptions: [], constraints: [], exclusions: [] } })), doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#tblVal tbody tr").length).toBe(6);
    expect((doc.querySelector('#tblVal tr[data-id="va1"] [data-f="delivId"]') as HTMLSelectElement).value).toBe("delX");                    // el único entregable del proyecto con nombre del ejemplo
    expect(doc.getElementById("statusLeft")!.textContent).toMatch(/5 validación\(es\) no encontraron su entregable/);
    (doc.getElementById("btnClear") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#tblVal").length).toBe(0);
  });

  it("un proyecto con las validaciones ya guardadas las abre tal cual", async () => {
    const dom = await abrir(proyecto({ scopeValidation: { idCounter: 2, asOf: "2026-11-03", records: [{ id: "va1", code: "VA-01", delivId: "del2", wbsIds: ["w2"], decision: "rechazado", observations: "Falta el certificado", reviewer: "Comité Directivo / Sponsor" }] } })), doc = dom.window.document;
    expect(doc.querySelectorAll("#tblVal tbody tr").length).toBe(1);
    expect((doc.querySelector('[data-f="observations"]') as HTMLTextAreaElement).value).toBe("Falta el certificado");
    expect(txt(doc, "kpis")).toMatch(/1 Rechazados/); expect(txt(doc, "cover")).toMatch(/DEL\.02 Licencias .* rechazado/);
  });
});
