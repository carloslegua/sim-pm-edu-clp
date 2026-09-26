// Smoke test del módulo Gestion_Conocimiento.html (Gestionar el conocimiento del proyecto: lecciones aprendidas, PMBOK).
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
  const dom = await JSDOM.fromURL(base + "Gestion_Conocimiento.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const limpio = (html: string) => html.replace(/<\/(div|td|th|tr|li|span|p|b|label)>/g, " ").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const txt = (doc: Document, id: string) => limpio(doc.getElementById(id)!.innerHTML);
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };

// Proyecto conectado: un Registro de Riesgos con un riesgo MATERIALIZADO (R-01) y uno abierto (R-02), un paquete y un puesto del OBS
const proyecto = (extra: Record<string, unknown> = {}) => ({
  version: 2, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1 }, modules: {
    risks: { idCounter: 3, plan: null, risks: [{ id: "k1", code: "R-01", title: "Suelo débil", type: "amenaza", status: "materializado", wbsIds: ["w1"], prob: 5, impCost: 5, impTime: 5, impScope: 5 }, { id: "k2", code: "R-02", title: "Alza del acero", type: "amenaza", status: "identificado", wbsIds: ["w1"], prob: 3, impCost: 3, impTime: 3, impScope: 3 }] },
    wbs: { rootId: "w0", idCounter: 3, nodes: { w0: { id: "w0", name: "Proyecto", children: ["w1"] }, w1: { id: "w1", parentId: "w0", name: "Cimentaciones", children: [] } } },
    obs: { rootId: "r", idCounter: 3, nodes: { r: { id: "r", role: "Gerencia", children: ["o1"] }, o1: { id: "o1", parentId: "r", role: "Jefe de Ingeniería", children: [] } } },
    ...extra
  } } }
});

describe("Gestion_Conocimiento.html (Gestión del conocimiento: lecciones aprendidas)", () => {
  it("modo independiente: muestra el ejemplo DISTRIB+ (8 lecciones, R-03 con su lección, sin hallazgos)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("#tblLessons tbody tr").length).toBe(8);
    expect(txt(doc, "kpis")).toMatch(/8 Lecciones registradas/); expect(txt(doc, "kpis")).toMatch(/0\/1 Riesgos materializados sin lección/); expect(txt(doc, "kpis")).toMatch(/En orden/);
    expect(txt(doc, "finds")).toMatch(/Sin hallazgos/); expect(txt(doc, "cover")).toMatch(/R-03 Suelo con menor capacidad portante que la esperada LL-04/);
  });

  it("proyecto conectado: arranca EN BLANCO (regla de oro) y avisa el riesgo materializado sin lección", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(doc.querySelectorAll("#tblLessons").length).toBe(0); expect(txt(doc, "mainArea")).toMatch(/Aún no hay lecciones/);
    expect(txt(doc, "cover")).toMatch(/R-01 Suelo débil ninguna/); expect(txt(doc, "finds")).toMatch(/K3 .*R-01 «Suelo débil» se MATERIALIZÓ y ninguna lección lo cita/);
  });

  it("agregar y completar la lección de ese riesgo: K3 desaparece, K1 avisa la recomendación que falta y se guarda en el proyecto", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, w = dom as any;
    (doc.getElementById("btnAdd") as HTMLElement).click();
    expect(doc.querySelectorAll("#tblLessons tbody tr").length).toBe(1);
    const row = doc.querySelector('#tblLessons tr[data-id="ll1"]') as HTMLElement, f = (k: string) => row.querySelector(`[data-f="${k}"]`) as HTMLInputElement;
    poner(w, f("riskCode"), "R-01"); poner(w, f("situation"), "Apareció un suelo débil en la excavación"); poner(w, f("lesson"), "Las calicatas no cubrieron la zona de mayor carga");
    let t = txt(doc, "finds"); expect(t).not.toMatch(/K3 /); expect(t).toMatch(/K1 .*QUÉ HACER distinto/);
    poner(w, f("recommendation"), "Más calicatas por área de cimentación"); poner(w, f("owner"), "Jefe de Ingeniería"); poner(w, f("status"), "validada", "change");
    t = txt(doc, "finds"); expect(t).not.toMatch(/K1 /); expect(txt(doc, "kpis")).toMatch(/1\/1 Validadas o transferidas/);
    await esperar(1100);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.knowledge;
    expect(saved.lessons).toHaveLength(1); expect(saved.lessons[0]).toMatchObject({ code: "LL-01", riskCode: "R-01", status: "validada", owner: "Jefe de Ingeniería" });
  });

  it("«Cargar ejemplo» con proyecto conectado reemplaza el registro y avisa los riesgos que no existen; «Nuevo registro» lo vacía", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#tblLessons tbody tr").length).toBe(8); expect(doc.getElementById("statusLeft")!.textContent).toMatch(/lección\(es\) citan riesgos .* que no están en el Registro de Riesgos/);
    (doc.getElementById("btnClear") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#tblLessons").length).toBe(0);
  });
});
