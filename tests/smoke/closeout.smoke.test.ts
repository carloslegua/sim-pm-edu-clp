// Smoke test del módulo Cierre_Proyecto.html (Cerrar el proyecto o fase: PMBOK).
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
  const dom = await JSDOM.fromURL(base + "Cierre_Proyecto.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const limpio = (html: string) => html.replace(/<\/(div|td|th|tr|li|span|p|b|label)>/g, " ").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const txt = (doc: Document, id: string) => limpio(doc.getElementById(id)!.innerHTML);
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };

// Proyecto conectado: dos entregables (uno aceptado), una no conformidad crítica abierta, una lección sin transferir y un puesto del OBS
const proyecto = (extra: Record<string, unknown> = {}) => ({
  version: 2, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1 }, modules: {
    scopeStatement: { productScope: "P", projectScope: "P", delCounter: 3, deliverables: [{ id: "del1", code: "DEL.01", name: "Expediente", description: "", acceptanceCriteria: "Aprobado", ranIds: [], reqIds: [] }, { id: "del2", code: "DEL.02", name: "Licencias", description: "", acceptanceCriteria: "Emitida", ranIds: [], reqIds: [] }], assumptions: [], constraints: [], exclusions: [] },
    scopeValidation: { idCounter: 2, records: [{ id: "va1", code: "VA-01", delivId: "del1", decision: "aceptado", reviewer: "Director de Proyecto", decidedOn: "2026-10-09", evidence: "Acta" }] },
    quality: { idCounter: 2, policy: "", standards: "", metrics: [], checks: [], coq: [], inspections: [], ncrs: [{ id: "n1", code: "NC-01", wbsId: "w1", description: "Fisura", severity: "critica", detectedOn: "2026-10-01", status: "abierta", action: "Reparar", owner: "PM", dueDate: "2026-12-01", closedOn: "" }] },
    knowledge: { idCounter: 2, lessons: [{ id: "ll1", code: "LL-01", situation: "s", lesson: "l", recommendation: "r", status: "validada" }] },
    obs: { rootId: "r", idCounter: 3, nodes: { r: { id: "r", role: "Gerencia", children: ["o1"] }, o1: { id: "o1", parentId: "r", role: "Director de Proyecto", children: [] } } },
    ...extra
  } } }
});

describe("Cierre_Proyecto.html (Cerrar el proyecto o fase)", () => {
  it("modo independiente: muestra el ejemplo DISTRIB+ (cierre preparado, no declarado: 7 ítems pendientes y 7 frentes que impiden cerrar)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("#tblItems tbody tr").length).toBe(7);
    expect(txt(doc, "kpis")).toMatch(/0\/7 Comprobaciones que cumplen/); expect(txt(doc, "kpis")).toMatch(/7 Frentes que impiden cerrar/); expect(txt(doc, "kpis")).toMatch(/Abierto/);
    expect(txt(doc, "checks")).toMatch(/Entregables aceptados por el cliente 1 de 6 entregables aceptados falta/); expect(txt(doc, "checks")).toMatch(/Lecciones aprendidas transferidas 0 de 8 transferidas falta/);
    expect(txt(doc, "finds")).toMatch(/C7 .*Para poder cerrar faltan/); expect((doc.getElementById("closed") as HTMLInputElement).checked).toBe(false);
  });

  it("proyecto conectado: arranca EN BLANCO (regla de oro) pero las comprobaciones ya leen el resto del proyecto", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(doc.querySelectorAll("#tblItems").length).toBe(0); expect(txt(doc, "mainArea")).toMatch(/Aún no hay ítems/);
    const c = txt(doc, "checks");
    expect(c).toMatch(/1 de 2 entregables aceptados falta/); expect(c).toMatch(/1 abierta\(s\) \(1 crítica\(s\)\) falta/); expect(c).toMatch(/0 de 1 transferidas falta/);
  });

  it("REPRO C1: declarar el cierre con frentes sin resolver es un riesgo y se guarda; sin aprobador ni informe, avisos", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, w = dom as any;
    const closed = doc.getElementById("closed") as HTMLInputElement; closed.checked = true; closed.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const t = txt(doc, "finds");
    expect(t).toMatch(/C1 .*Se declaró el cierre con \d+ frente\(s\) sin resolver/); expect(t).toMatch(/C2 .*sin quién lo aprueba ni fecha/); expect(t).toMatch(/C2 .*sin informe final/);
    expect(txt(doc, "kpis")).toMatch(/Declarado/); expect(txt(doc, "kpis")).toMatch(/Con riesgos/);
    poner(w, doc.getElementById("approvedBy")!, "Director de Proyecto"); poner(w, doc.getElementById("closedOn")!, "2027-07-30"); poner(w, doc.getElementById("finalCost")!, "7900000");
    await esperar(1100);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.closeout;
    expect(saved.closure).toMatchObject({ closed: true, approvedBy: "Director de Proyecto", closedOn: "2027-07-30", finalCost: 7900000 });
  });

  it("agregar un ítem de la lista de verificación: sin responsable ni fecha se avisa (C3) y al completarlo desaparece", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, w = dom as any;
    (doc.getElementById("btnAdd") as HTMLElement).click();
    expect(doc.querySelectorAll("#tblItems tbody tr").length).toBe(1); expect(txt(doc, "finds")).toMatch(/C3 .*pendiente sin responsable ni fecha límite/);
    const row = doc.querySelector('#tblItems tr[data-id="ci1"]') as HTMLElement, f = (k: string) => row.querySelector(`[data-f="${k}"]`) as HTMLInputElement;
    poner(w, f("what"), "Archivar el dossier"); poner(w, f("owner"), "Director de Proyecto"); poner(w, f("dueDate"), "2099-01-01");
    expect(txt(doc, "finds")).not.toMatch(/C3 /);
  });

  it("«Cargar ejemplo» reemplaza y «Nuevo cierre» vacía; un proyecto con el cierre ya guardado lo abre tal cual", async () => {
    const dom = await abrir(proyecto({ closeout: { kind: "fase", phase: "Construcción", idCounter: 2, items: [{ id: "ci1", code: "CI-01", area: "Alcance", what: "Aceptar", owner: "Director de Proyecto", dueDate: "2099-01-01", status: "hecho", doneOn: "2026-10-09", evidence: "Acta" }], closure: { closed: false, finalCost: null } } })), doc = dom.window.document;
    expect((doc.getElementById("kind") as HTMLSelectElement).value).toBe("fase"); expect((doc.getElementById("phase") as HTMLInputElement).value).toBe("Construcción"); expect(doc.querySelectorAll("#tblItems tbody tr").length).toBe(1);
    (doc.getElementById("btnSample") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#tblItems tbody tr").length).toBe(7);
    (doc.getElementById("btnClear") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#tblItems").length).toBe(0);
  });
});
