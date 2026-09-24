// Smoke test del módulo Plan_Comunicaciones.html (Plan de Gestión de las Comunicaciones: PMBOK).
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
  const dom = await JSDOM.fromURL(base + "Plan_Comunicaciones.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const limpio = (html: string) => html.replace(/<\/(div|td|th|tr|li|span|p|b|label)>/g, " ").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const txt = (doc: Document, id: string) => limpio(doc.getElementById(id)!.innerHTML);
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };

// Proyecto conectado: dos interesados (uno «a gestionar de cerca») y dos puestos del OBS
const proyecto = (extra: Record<string, unknown> = {}) => ({
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1 }, modules: {
    stakeholders: { idCounter: 3, stakeholders: [{ id: "s1", name: "Sponsor", power: 90, interest: 90, engCurrent: 4, engDesired: 5 }, { id: "s2", name: "Vecinos", power: 20, interest: 80, engCurrent: 2, engDesired: 4 }] },
    obs: { rootId: "r", idCounter: 4, nodes: { r: { id: "r", role: "Gerencia", children: ["o1", "o2"] }, o1: { id: "o1", parentId: "r", role: "Director de Proyecto", children: [] }, o2: { id: "o2", parentId: "r", role: "Asesoría Legal", children: [] } } },
    ...extra
  } } }
});

describe("Plan_Comunicaciones.html (Plan de Gestión de las Comunicaciones)", () => {
  it("modo independiente: muestra el ejemplo DISTRIB+ (11 comunicaciones, 12 interesados cubiertos, sin hallazgos)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("#matrix tbody tr").length).toBe(11);
    expect(txt(doc, "kpis")).toMatch(/12\/12/); expect(txt(doc, "kpis")).toMatch(/66 Canales potenciales entre 12 interesados/); expect(txt(doc, "kpis")).toMatch(/En orden/);
    expect(txt(doc, "finds")).toMatch(/Sin hallazgos/);
    expect((doc.querySelector('#matrix tr[data-id="cm1"] [data-f="frequency"]') as HTMLSelectElement).value).toBe("Quincenal");
  });

  it("proyecto conectado: arranca EN BLANCO (regla de oro) y avisa qué interesados no reciben nada", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(doc.querySelectorAll("#matrix").length).toBe(0); expect(txt(doc, "mainArea")).toMatch(/Aún no hay comunicaciones/);
    expect(txt(doc, "cover")).toMatch(/Sponsor Gestionar de cerca .* ninguna/); expect(txt(doc, "cover")).toMatch(/Vecinos Mantener informado/);
  });

  it("agregar y completar una comunicación: los hallazgos se actualizan al editar y se guarda en el proyecto", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document, w = dom as any;
    (doc.getElementById("btnAdd") as HTMLElement).click();
    expect(doc.querySelectorAll("#matrix tbody tr").length).toBe(1);
    expect(txt(doc, "finds")).toMatch(/M1 .*«Sponsor» es un interesado a gestionar de cerca y no recibe ninguna comunicación/);
    expect(txt(doc, "finds")).toMatch(/M4 .*falta qué información/);
    const row = doc.querySelector('#matrix tr[data-id="cm1"]') as HTMLElement, f = (k: string) => row.querySelector(`[data-f="${k}"]`) as HTMLInputElement;
    poner(w, f("info"), "Avance del proyecto"); poner(w, f("purpose"), "Alinear al sponsor");
    const sel = f("stkIds") as unknown as HTMLSelectElement; Array.from(sel.options).forEach((o) => { o.selected = o.value === "s1"; }); sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    poner(w, f("sender"), "Director de Proyecto"); poner(w, f("frequency"), "Quincenal", "change"); poner(w, f("method"), "Reunión presencial", "change"); poner(w, f("storage"), "Acta");
    const t = txt(doc, "finds");
    expect(t).not.toMatch(/M1 /); expect(t).not.toMatch(/M4 /); expect(t).not.toMatch(/M7 /);
    expect(t).toMatch(/M2 .*«Vecinos» debe pasar del compromiso/);                          // los vecinos siguen sin comunicación con brecha 2
    await esperar(1100);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.comms;
    expect(saved.items).toHaveLength(1); expect(saved.items[0]).toMatchObject({ code: "CM-01", stkIds: ["s1"], frequency: "Quincenal", sender: "Director de Proyecto" });
  });

  it("«Cargar ejemplo» con proyecto conectado reemplaza la matriz; «Nueva matriz» la vacía", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#matrix tbody tr").length).toBe(11);
    expect(doc.getElementById("statusLeft")!.textContent).toMatch(/Caso de ejemplo cargado/);
    (doc.getElementById("btnClear") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(50);
    expect(doc.querySelectorAll("#matrix").length).toBe(0);
  });

  it("un proyecto con la matriz ya guardada la abre tal cual", async () => {
    const dom = await abrir(proyecto({ comms: { idCounter: 2, items: [{ id: "cm1", code: "CM-01", info: "Avance", purpose: "Alinear", stkIds: ["s1", "s2"], sender: "Asesoría Legal", frequency: "Mensual", method: "Informe escrito", storage: "Acta" }], plan: { escalation: "48 h", review: "Mensual" } } })), doc = dom.window.document;
    expect(doc.querySelectorAll("#matrix tbody tr").length).toBe(1);
    expect((doc.querySelector('[data-f="sender"]') as HTMLInputElement).value).toBe("Asesoría Legal");
    expect((doc.getElementById("planEscalation") as HTMLTextAreaElement).value).toBe("48 h");
    expect(txt(doc, "kpis")).toMatch(/2\/2/);
  });
});
