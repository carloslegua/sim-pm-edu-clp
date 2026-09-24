// Smoke test del módulo Plan_Direccion.html (Plan para la Dirección del Proyecto: integrador de líneas base).
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
  const dom = await JSDOM.fromURL(base + "Plan_Direccion.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const limpio = (html: string) => html.replace(/<\/(div|td|th|tr|li|span|p|b|label)>/g, " ").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const estado = (doc: Document) => limpio(doc.getElementById("stateView")!.innerHTML);
const documento = (doc: Document) => limpio(doc.getElementById("docView")!.innerHTML);
const pestana = (doc: Document, v: string) => (doc.querySelector(`#tabs .tab[data-view="${v}"]`) as HTMLElement).click();

const FRENTE = { frozen: true, version: "1.0", date: "2026-07-10", approver: "Sponsor" };
// a1 (10 d) → a2 (5 d); paquetes 1.1 y 1.2 (red mínima, 15 días laborables)
const proyecto = (extra: Record<string, unknown> = {}) => ({
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1, startDate: "2026-07-06", capex: "5000" }, modules: {
    wbs: { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2"] }, w1: { id: "w1", name: "Excavación", children: [] }, w2: { id: "w2", name: "Relleno", children: [] } } },
    activities: { idCounter: 3, byLeaf: { w1: [{ id: "a1", name: "Excavar", unit: "m", qty: 10, perf: 1, teams: 1 }], w2: [{ id: "a2", name: "Rellenar", unit: "m", qty: 5, perf: 1, teams: 1 }] } },
    schedule: { linkCounter: 2, import: null, baseline: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }] },
    ...extra
  } } }
});
// Las tres líneas base que exige la aprobación: alcance, cronograma (LB-1) y presupuesto
const conLineasBase = () => proyecto({
  scopeStatement: { productScope: "Terreno nivelado", deliverables: [{ id: "d1", code: "E1", name: "Terreno nivelado", acceptanceCriteria: "Cotas ±2 cm" }], baseline: FRENTE, idCounter: 1, delCounter: 2 },
  schedule: { linkCounter: 2, import: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }], baseline: { frozen: true, version: "LB-1", date: "2026-07-12", snapshot: { projectDuration: 15, startDate: "2026-07-06", finishDate: "2026-07-24", nearCriticalDays: 5, rows: [{ id: "a1", code: "1.1.1", name: "Excavar", isMilestone: false, dur: 10, es: 0, ef: 10, tf: 0, critical: true }] }, log: [{ version: "LB-1", date: "2026-07-12", reason: "Línea base inicial", approver: "Sponsor", sponsorAuth: true, projectDuration: 15, finishDate: "2026-07-24", deviationPct: null }] } },
  cost: { budget: { baseCost: 4000, computed: { base: 4000, cont: 400, bac: 4400, total: 4600 } }, changeOrders: [], estimate: { class: 3 } }
});

describe("Plan_Direccion.html (Plan para la Dirección del Proyecto)", () => {
  it("sin proyecto activo: no inventa el caso DISTRIB+; avisa y no ofrece documento", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(estado(doc)).toMatch(/Sin proyecto activo/);
    expect(estado(doc)).not.toMatch(/DISTRIB/);
    pestana(doc, "doc");
    expect(documento(doc)).toMatch(/Sin proyecto activo/);
    expect(doc.getElementById("btnApprove")).toBeNull();
  });

  it("proyecto sin líneas base: muestra las 14 áreas (3 sin módulo), avisa y bloquea la aprobación", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(doc.querySelectorAll("#stateView tbody tr").length).toBeGreaterThan(14);
    const t = estado(doc);
    expect(t).toMatch(/Plan de Calidad.*sin módulo en la suite/); expect(t).toMatch(/Plan de Comunicaciones/); expect(t).toMatch(/Plan de Adquisiciones/);
    expect(t).toMatch(/15 d laborables .* sin línea base/);                                  // el cronograma sí se lee de la red del proyecto
    expect(t).toMatch(/P3 .*El cronograma no tiene línea base/);
    expect(t).toMatch(/No se puede aprobar todavía: falta la línea base del alcance; falta la línea base del cronograma; falta el presupuesto/);
    expect((doc.getElementById("btnApprove") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Documento: portada, contenido y las secciones del plan con los datos de la EDT y del cronograma", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    pestana(doc, "doc");
    const t = documento(doc);
    expect(t).toMatch(/Plan para la dirección del proyecto\s*Proyecto Live/); expect(t).toMatch(/Contenido/);
    ["1. Descripción del proyecto", "2. Plan de gestión del alcance", "3. Plan de gestión del cronograma", "4. Plan de gestión de costos", "5. Plan de gestión de riesgos", "6. Plan de involucramiento", "7. Plan de gestión de recursos", "8. Control integrado de cambios", "9. Medición del desempeño", "10. Líneas base y aprobación"]
      .forEach((s) => expect(t, s).toContain(s));
    expect(t).toMatch(/Excavación/); expect(t).toMatch(/Relleno/);                            // EDT con diccionario
    expect(t).toMatch(/Duración \(días laborables\) 15/);
    expect(doc.querySelectorAll("#docView .toc a").length).toBeGreaterThan(10);
  });

  it("con las tres líneas base se puede aprobar: guarda versión, quién, cuándo y la instantánea; sin nombre no aprueba", async () => {
    const dom = await abrir(conLineasBase()), doc = dom.window.document, w = dom.window as any;
    const btn = doc.getElementById("btnApprove") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(estado(doc)).toMatch(/P4 .*Basis of Estimate no está aprobada/);                   // la BOE sin aprobar avisa, no bloquea
    btn.click(); await esperar(50);
    expect(doc.getElementById("statusLeft")!.textContent).toMatch(/Indica quién aprueba/);
    expect(doc.getElementById("modalOverlay")!.classList.contains("open")).toBe(false);
    const ap = doc.getElementById("pfApprover") as HTMLInputElement; ap.value = "Rosa Paredes, Sponsor"; ap.dispatchEvent(new w.Event("input", { bubbles: true }));
    btn.click(); await esperar(50);
    expect(doc.getElementById("modalOverlay")!.classList.contains("open")).toBe(true);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(1100);
    expect(estado(doc)).toMatch(/Plan aprobado v1\.0 por Rosa Paredes, Sponsor/);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.pmplan;
    expect(saved.status).toBe("aprobado"); expect(saved.version).toBe("1.0"); expect(saved.approvedBy).toBe("Rosa Paredes, Sponsor");
    expect(saved.snapshot).toMatchObject({ scopeVersion: "1.0", scheduleVersion: "LB-1", bacCurrent: 4400 });
  });

  it("plan aprobado y luego cambia una línea base: queda desactualizado; «Nueva versión» conserva el historial", async () => {
    const seed = conLineasBase() as any;
    seed.projects.p1.modules.pmplan = { version: "1.0", status: "aprobado", approvedBy: "Rosa Paredes", approvedOn: "2026-07-15", snapshot: { scopeVersion: "1.0", scopeDate: "2026-07-10", requirementsVersion: "", scheduleVersion: "LB-1", scheduleDate: "2026-07-12", scheduleFinish: "2026-07-24", bacCurrent: 4200, costBaseline: "", boeStatus: "borrador" }, history: [] };
    const dom = await abrir(seed), doc = dom.window.document;
    expect(estado(doc)).toMatch(/Plan aprobado desactualizado/);                              // el BAC vigente ya no es el aprobado (4.200 → 4.400)
    expect(estado(doc)).toMatch(/P12 .*BAC vigente/);
    (doc.getElementById("btnNewVersion") as HTMLElement).click(); await esperar(50);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(1100);
    expect(estado(doc)).toMatch(/Versiones anteriores: v1\.0 \(2026-07-15\)/);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.pmplan;
    expect(saved.status).toBe("borrador"); expect(saved.version).toBe("2.0"); expect(saved.history).toHaveLength(1); expect(saved.snapshot).toBeNull();
  });

  it("Exportar a Word genera un .doc HTML y no toca el proyecto", async () => {
    const dom = await abrir(conLineasBase()), doc = dom.window.document, w = dom.window as any;
    let parts: string[] = [], type = "", name = "";                                          // el Blob de jsdom no se puede leer: se captura lo que recibe
    w.Blob = function (p: string[], o: { type: string }) { parts = p; type = o.type; };
    w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function () { name = this.download; };
    (doc.getElementById("btnWord") as HTMLElement).click();
    expect(name).toBe("plan_para_la_direccion_v1.0.doc");
    expect(type).toBe("application/msword");
    const txt = parts.join("");
    expect(txt).toMatch(/xmlns:w="urn:schemas-microsoft-com:office:word"/); expect(txt).toMatch(/Plan para la dirección del proyecto/); expect(txt).toMatch(/Terreno nivelado/);
    expect(JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.pmplan).toBeUndefined();
  });
});
