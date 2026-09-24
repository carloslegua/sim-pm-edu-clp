// Smoke test del módulo Plan_Adquisiciones.html (Plan de Gestión de las Adquisiciones: PMBOK).
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
  const dom = await JSDOM.fromURL(base + "Plan_Adquisiciones.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const limpio = (html: string) => html.replace(/<\/(div|td|th|tr|li|span|p|b|label|summary)>/g, " ").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const txt = (doc: Document, id: string) => limpio(doc.getElementById(id)!.innerHTML);
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };
const ficha = (doc: Document, code: string) => Array.from(doc.querySelectorAll("details.pr")).find((d) => d.querySelector("summary b")!.textContent === code) as HTMLElement;
const campo = (doc: Document, code: string, f: string) => ficha(doc, code).querySelector(`[data-f="${f}"]`) as HTMLInputElement;

// Proyecto conectado: EDT de dos paquetes con costo, OBS, un riesgo alto abierto sobre el primero y la clase del estimado
const proyecto = (extra: Record<string, unknown> = {}) => ({
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1 }, modules: {
    wbs: { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2"] }, w1: { id: "w1", name: "Estructuras", children: [], cost: 1000000 }, w2: { id: "w2", name: "Materiales", children: [], cost: 500000 } } },
    obs: { rootId: "r", idCounter: 3, nodes: { r: { id: "r", role: "Gerencia", children: ["o1"] }, o1: { id: "o1", parentId: "r", role: "Jefe de Logística", person: "Proveedor A", children: [] } } },
    cost: { budget: { baseCost: 2000000, computed: { base: 2000000 } }, estimate: { class: 3 }, changeOrders: [] },
    risks: { idCounter: 2, plan: null, risks: [{ id: "k1", code: "R-01", title: "Alza del acero", type: "amenaza", status: "identificado", wbsIds: ["w1"], prob: 5, impCost: 5, impTime: 5, impScope: 5 }] },
    ...extra
  } } }
});

describe("Plan_Adquisiciones.html (Plan de Gestión de las Adquisiciones)", () => {
  it("modo independiente: muestra el ejemplo DISTRIB+ (5 adquisiciones, fecha de corte 2026-08-03, sin hallazgos)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("details.pr").length).toBe(5); expect((doc.getElementById("asOf") as HTMLInputElement).value).toBe("2026-08-03");
    const k = txt(doc, "kpis"); expect(k).toMatch(/5 Adquisiciones planificadas/); expect(k).toMatch(/\$ 3,530,000|\$ 3\.530\.000/); expect(k).toMatch(/50 % del costo base/); expect(k).toMatch(/En orden/);
    expect(txt(doc, "finds")).toMatch(/Sin hallazgos/);
    expect(limpio(ficha(doc, "PR-01").querySelector("summary")!.innerHTML)).toMatch(/Estructuras metálicas prefabricadas.*Convocada.*en curso/);
    expect(limpio(ficha(doc, "PR-02").querySelector("summary")!.innerHTML)).toMatch(/convocar antes del 2026-09-13/);
  });

  it("cambiar la fecha de corte: la convocatoria de PR-02 vence y el plan pasa a riesgo (se guarda con el plan)", async () => {
    const dom = await abrir(), doc = dom.window.document, w = dom as any;
    poner(w, doc.getElementById("asOf")!, "2026-10-01", "change");
    expect(limpio(ficha(doc, "PR-02").querySelector("summary")!.innerHTML)).toMatch(/convocar YA · venció 2026-09-13/);
    expect(txt(doc, "finds")).toMatch(/P1 .*PR-02.*debió lanzarse el 2026-09-13.*hace 18 días/); expect(txt(doc, "kpis")).toMatch(/Con riesgos/);
  });

  it("proyecto conectado: arranca EN BLANCO (regla de oro); agregar una adquisición completa los hallazgos al editar y se guarda", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, w = dom as any;
    expect(doc.querySelectorAll("details.pr").length).toBe(0); expect(txt(doc, "mainArea")).toMatch(/Aún no hay adquisiciones/);
    (doc.getElementById("btnAdd") as HTMLElement).click();
    expect(doc.querySelectorAll("details.pr").length).toBe(1);
    expect(txt(doc, "finds")).toMatch(/P2 .*falta el nombre/); expect(txt(doc, "finds")).toMatch(/P3 .*sin fecha requerida/); expect(txt(doc, "finds")).toMatch(/P10 .*responsable/);
    poner(w, campo(doc, "PR-01", "name"), "Estructuras metálicas");
    const sel = campo(doc, "PR-01", "wbsIds") as unknown as HTMLSelectElement; Array.from(sel.options).forEach((o) => { o.selected = o.value === "w1"; }); sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    poner(w, campo(doc, "PR-01", "contractType"), "Precio fijo (FFP)", "change"); poner(w, campo(doc, "PR-01", "selection"), "Licitación abierta", "change");
    poner(w, campo(doc, "PR-01", "value"), "1000000"); poner(w, campo(doc, "PR-01", "needDate"), "2099-01-01"); poner(w, campo(doc, "PR-01", "leadDays"), "30"); poner(w, campo(doc, "PR-01", "selectionDays"), "30"); poner(w, campo(doc, "PR-01", "owner"), "Jefe de Logística");
    const t = txt(doc, "finds");
    expect(t).not.toMatch(/P2 /); expect(t).not.toMatch(/P3 /); expect(t).not.toMatch(/P6 /);                 // el valor coincide con el costo del paquete en la EDT
    expect(t).toMatch(/P5 .*no define los criterios de selección/);                                         // faltan los criterios ponderados
    expect(t).toMatch(/P8 .*R-01 «Alza del acero».*transfiere, lo mitiga o lo acepta/);                   // el riesgo alto abierto sobre 3.1 no está citado
    (ficha(doc, "PR-01").querySelector("[data-addcrit]") as HTMLElement).click();
    const c0 = ficha(doc, "PR-01").querySelectorAll('[data-cf="name"]'), c0w = ficha(doc, "PR-01").querySelectorAll('[data-cf="weight"]');
    poner(w, c0[0], "Precio"); poner(w, c0w[0], "60");
    expect(txt(doc, "finds")).toMatch(/P5 .*suman 60/);
    await esperar(1100);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.procurement;
    expect(saved.items).toHaveLength(1); expect(saved.items[0]).toMatchObject({ code: "PR-01", name: "Estructuras metálicas", wbsIds: ["w1"], contractType: "Precio fijo (FFP)", value: 1000000, leadDays: 30 }); expect(saved.items[0].criteria).toEqual([{ name: "Precio", weight: 60 }]);
  });

  it("«hacer con recursos propios» no exige contrato, selección ni proveedor", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, w = dom as any;
    (doc.getElementById("btnAdd") as HTMLElement).click();
    poner(w, campo(doc, "PR-01", "decision"), "Hacer (recursos propios)", "change");
    expect(ficha(doc, "PR-01").querySelector('[data-f="contractType"]')).toBeNull();
    expect(limpio(ficha(doc, "PR-01").querySelector("summary")!.innerHTML)).toMatch(/hacer/);
  });

  it("«Cargar ejemplo» con proyecto conectado se enlaza por código (aquí ninguno existe: se avisa); «Nuevo plan» vacía", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("details.pr").length).toBe(5); expect(doc.getElementById("statusLeft")!.textContent).toMatch(/adquisición\(es\) no encontraron sus paquetes/);
    (doc.getElementById("btnClear") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("details.pr").length).toBe(0);
  });
});
