// Smoke test de la calidad de la EDT en WBS_Builder.html (estructura, diccionario y tamaño; lógica en shared/wbs-quality.ts).
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
  const dom = await JSDOM.fromURL(base + "WBS_Builder.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const cargarEjemplo = async (doc: Document) => {
  (doc.getElementById("btnSample") as HTMLElement).click(); await esperar(50);
  (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(100);
};
const quality = (doc: Document) => doc.getElementById("qualityBox")!.textContent!.replace(/\s+/g, " ");
const grupo = (doc: Document, code: string) => doc.querySelector(`.q-group[data-code="${code}"]`) as HTMLDetailsElement | null;
const nodo = (doc: Document, texto: string) => Array.from(doc.querySelectorAll("#canvas .node")).find((n) => n.textContent!.includes(texto)) as HTMLElement;
const clic = (dom: any, el: Element) => el.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
const escribir = (dom: any, el: Element, v: string) => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event("input", { bubbles: true })); };

// Proyecto conectado: r → f1 (w1, w2) · f2 (w3, w4); todos con costo y fechas pero SIN diccionario (proyecto viejo o del alumno).
const leaf = (id: string, parentId: string, name: string, over: Record<string, unknown> = {}) => ({ id, parentId, name, duration: 5, cost: 1000, resource: "Ana", percent: 0, start: "2026-08-03", end: "2026-08-07", notes: "", children: [], collapsed: false, orientation: "spread", ...over });
const proyecto = (over: Record<string, Record<string, unknown>> = {}) => ({
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 }, modules: { wbs: { rootId: "root", idCounter: 9, nodes: {
    root: { id: "root", parentId: null, name: "P", children: ["f1", "f2"], duration: 0, cost: 0, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" },
    f1: { id: "f1", parentId: "root", name: "Ingeniería", children: ["w1", "w2"], duration: 0, cost: 0, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" },
    f2: { id: "f2", parentId: "root", name: "Construcción", children: ["w3", "w4"], duration: 0, cost: 0, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" },
    w1: leaf("w1", "f1", "Estudio de suelos", over.w1), w2: leaf("w2", "f1", "Diseño estructural", over.w2),
    w3: leaf("w3", "f2", "Cimentaciones", over.w3), w4: leaf("w4", "f2", "Estructura y cobertura", over.w4)
  } } } } }
});

describe("WBS_Builder.html — calidad de la EDT", () => {
  it("una EDT en blanco no tiene nada que revisar", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(quality(doc)).toMatch(/Agrega fases y paquetes para revisar la calidad/);
    expect(doc.querySelectorAll(".q-group").length).toBe(0);
  });

  it("ejemplo DISTRIB+: diccionario completo (18/18) y un único aviso real, S2: Estructuras metálicas concentra el 25,6 % del costo", async () => {
    const dom = await abrir(), doc = dom.window.document;
    await cargarEjemplo(doc);
    const q = quality(doc);
    expect(q).toMatch(/Con avisos/); expect(q).toMatch(/1 aviso\b/);
    expect(q).toMatch(/Diccionario completo\s*18\/18 paquetes · 100 %/);
    expect(doc.querySelectorAll(".q-group").length).toBe(1);
    const s2 = grupo(doc, "S2")!;
    expect(s2.textContent).toMatch(/Estructuras metálicas prefabricadas/); expect(s2.textContent).toMatch(/25\.6 %/);
    expect(doc.querySelectorAll("#canvas .node .q-flag").length).toBe(1);                              // marca solo en ese nodo
    expect(nodo(doc, "Estructuras metálicas prefabricadas").querySelector(".q-flag")!.textContent).toBe("1");
    expect(doc.getElementById("statGrid")!.textContent).toMatch(/S\/ 7,100,000/);                    // el resto del módulo no cambió
  });

  it("clic en un hallazgo: selecciona el elemento, muestra sus hallazgos y su diccionario", async () => {
    const dom = await abrir(), doc = dom.window.document;
    await cargarEjemplo(doc);
    clic(dom, doc.querySelector(".q-item")!); await esperar(50);
    expect((doc.getElementById("f_name") as HTMLInputElement).value).toBe("Estructuras metálicas prefabricadas");
    expect(doc.getElementById("nodeQuality")!.textContent).toMatch(/S2/);
    expect((doc.getElementById("f_accept") as HTMLTextAreaElement).value).toMatch(/certificados de calidad/);
    expect((doc.getElementById("f_notes") as HTMLTextAreaElement).value).toMatch(/R-02/);
  });

  it("vista de tabla = diccionario: descripción, criterio de aceptación, marca LOE en el seguimiento y hallazgos", async () => {
    const dom = await abrir(), doc = dom.window.document;
    await cargarEjemplo(doc);
    (doc.getElementById("viewTableBtn") as HTMLElement).click(); await esperar(50);
    const t = doc.getElementById("tableView")!;
    expect(t.textContent).toMatch(/Criterio de aceptación/); expect(t.textContent).toMatch(/Descripción del trabajo/);
    const fila = (txt: string) => Array.from(t.querySelectorAll("tr")).find((r) => r.textContent!.includes(txt)) as HTMLElement;
    expect(fila("Cimentaciones").textContent).toMatch(/Cimentación conforme a planos/);
    expect(t.querySelectorAll(".loe-tag").length).toBe(1);
    expect(fila("Informes de seguimiento y control").querySelector(".loe-tag")).toBeTruthy();
    expect(t.querySelectorAll(".q-flag").length).toBe(1);
  });

  it("EDT nueva: nombres de plantilla y repetidos se marcan (E1, E2 en riesgo) y se corrigen al renombrar", async () => {
    const dom = await abrir(), doc = dom.window.document;
    (doc.getElementById("btnAddPhase") as HTMLElement).click(); await esperar(30);
    (doc.getElementById("btnAddPhase") as HTMLElement).click(); await esperar(30);   // dos «Nueva fase» hermanas
    expect(quality(doc)).toMatch(/Con riesgos/);
    expect(grupo(doc, "E2")).toBeTruthy(); expect(grupo(doc, "E1")!.querySelector(".q-n")!.textContent).toBe("2");
    expect(grupo(doc, "E5")).toBeNull();                                          // ninguna fase está descompuesta: no hay contraste
    escribir(dom, doc.getElementById("f_name")!, "Ingeniería"); await esperar(30);   // la fase 2 (seleccionada)
    expect(grupo(doc, "E2")).toBeNull();
    expect(grupo(doc, "E1")!.querySelector(".q-n")!.textContent).toBe("1");
    expect(quality(doc)).toMatch(/Con avisos/);
  });

  it("proyecto sin diccionario (guardado antes de esta vista): abre sin error y pide descripción, criterio y responsable", async () => {
    const seed = proyecto({ w1: { resource: "" } });
    const dom = await abrir(seed), doc = dom.window.document;
    expect(grupo(doc, "D1")!.querySelector(".q-n")!.textContent).toBe("4");
    expect(grupo(doc, "D2")!.querySelector(".q-n")!.textContent).toBe("4");
    expect(grupo(doc, "D3")!.querySelector(".q-n")!.textContent).toBe("1");
    expect(quality(doc)).toMatch(/Diccionario completo\s*0\/4 paquetes · 0 %/);
  });

  it("completar el diccionario de un paquete actualiza el avance y los grupos EN VIVO", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    clic(dom, nodo(doc, "Estudio de suelos")); await esperar(30);
    escribir(dom, doc.getElementById("f_notes")!, "Calicatas y ensayos de laboratorio."); await esperar(20);
    escribir(dom, doc.getElementById("f_accept")!, "Informe geotécnico aprobado."); await esperar(20);
    expect(grupo(doc, "D1")!.querySelector(".q-n")!.textContent).toBe("3");
    expect(grupo(doc, "D2")!.querySelector(".q-n")!.textContent).toBe("3");
    expect(quality(doc)).toMatch(/Diccionario completo\s*1\/4 paquetes · 25 %/);
    expect(doc.getElementById("nodeQuality")!.textContent).toBe("");              // ese paquete quedó sin hallazgos
    expect(doc.querySelector("#canvas .node[data-id='w1'] .q-flag")).toBeNull();
    expect(doc.querySelector("#canvas .node[data-id='w2'] .q-flag")).toBeTruthy();
  });

  it("paquete largo (S1): se avisa, y marcarlo como esfuerzo continuo (LOE) lo exime; criterio y LOE se guardan en el proyecto", async () => {
    const dom = await abrir(proyecto({ w1: { start: "2026-01-05", end: "2026-05-29" } })), doc = dom.window.document;
    expect(grupo(doc, "S1")!.textContent).toMatch(/Estudio de suelos.*dura 145 d/);
    clic(dom, nodo(doc, "Estudio de suelos")); await esperar(30);
    escribir(dom, doc.getElementById("f_accept")!, "Aceptado por el sponsor.");
    const loe = doc.getElementById("f_loe") as HTMLInputElement;
    loe.checked = true; loe.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await esperar(30);
    expect(grupo(doc, "S1")).toBeNull();
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const w1 = JSON.parse(dom.window.localStorage.getItem("gpi_db")!).projects.p1.modules.wbs.nodes.w1;
    expect(w1.acceptance).toBe("Aceptado por el sponsor."); expect(w1.loe).toBe(true);
    // desmarcar quita la marca (no deja `false` suelto en el proyecto)
    loe.checked = false; loe.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await esperar(30);
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    expect("loe" in JSON.parse(dom.window.localStorage.getItem("gpi_db")!).projects.p1.modules.wbs.nodes.w1).toBe(false);
    expect(grupo(doc, "S1")).toBeTruthy();
  });

  it("los grupos abiertos se conservan al editar (el panel se vuelve a pintar con cada tecla)", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    const d1 = grupo(doc, "D1")!; d1.open = true; d1.dispatchEvent(new dom.window.Event("toggle")); await esperar(20);
    clic(dom, nodo(doc, "Cimentaciones")); await esperar(30);
    escribir(dom, doc.getElementById("f_notes")!, "Zapatas de la nave."); await esperar(20);
    expect(grupo(doc, "D1")!.open).toBe(true);
    expect(grupo(doc, "D2")!.open).toBe(false);
  });

  it("el reporte imprimible incluye el criterio de aceptación y la sección «Calidad de la EDT»", async () => {
    const dom = await abrir(), doc = dom.window.document;
    (dom.window as any).print = () => {};
    await cargarEjemplo(doc);
    (doc.getElementById("btnReport") as HTMLElement).click(); await esperar(100);
    const rep = doc.getElementById("gpiReport")!.textContent!.replace(/\s+/g, " ");
    expect(rep).toMatch(/Criterio de aceptación/); expect(rep).toMatch(/Cimentación conforme a planos/);
    expect(rep).toMatch(/3\. Calidad de la EDT/); expect(rep).toMatch(/18 de 18 paquetes \(100 %\)/); expect(rep).toMatch(/S2/);
  });
});
