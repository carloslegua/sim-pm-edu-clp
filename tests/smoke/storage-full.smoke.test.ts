// Auditoría (alta): con el almacenamiento LLENO (todo setItem falla, getItem funciona) los módulos deben seguir mostrando el proyecto REAL, no
// caer al ejemplo DISTRIB+. Antes GPI.available() era una sonda de escritura y los módulos la usaban para saber si había proyecto.
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
// Un proyecto real pequeño (S/ 1.000) ya guardado; después toda escritura falla como con la cuota agotada.
const semilla = { version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto real S/ 1.000", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1 }, modules: { cost: { budget: { baseCost: 1000, computed: { base: 1000 } }, changeOrders: [] } } } } };
const abrirLleno = async (file: string) => {
  const dom = await JSDOM.fromURL(base + file, {
    runScripts: "dangerously", resources: "usable",
    beforeParse(w: any) {
      w.localStorage.setItem("gpi_db", JSON.stringify(semilla));
      w.Storage.prototype.setItem = function () { throw new w.DOMException("Quota exceeded", "QuotaExceededError"); };
    }
  });
  await esperar(900);
  return dom;
};

describe("almacenamiento lleno: el módulo muestra el proyecto real, no el ejemplo", () => {
  it("el núcleo lo ve legible y no escribible", async () => {
    const dom = await abrirLleno("Valor_Ganado.html"), G = (dom.window as any).GPI;
    expect(G.available()).toBe(true); expect(G.canWrite()).toBe(false); expect(G.active().meta.name).toBe("Proyecto real S/ 1.000");
  });
  it("aviso persistente en TODOS los módulos: dice que no se está guardando y cómo recuperar (exportar desde el Panel); en el Panel no se remite a sí mismo", async () => {
    for (const f of ["Valor_Ganado.html", "Plan_Calidad.html", "WBS_Builder.html", "Cronograma_CPM.html", "Project_Charter.html"]) {
      const doc = (await abrirLleno(f)).window.document, n = doc.getElementById("gpi-storage-notice");
      expect(n, f).not.toBeNull(); expect(n!.textContent, f).toMatch(/los cambios no se están guardando/); expect(n!.querySelector('a[href="Panel_Control.html"]'), f).not.toBeNull();
    }
    const panel = (await abrirLleno("Panel_Control.html")).window.document.getElementById("gpi-storage-notice");
    expect(panel).not.toBeNull(); expect(panel!.querySelector("a")).toBeNull(); expect(panel!.textContent).toMatch(/botón Exportar/);
  }, 40000);
  it("con espacio disponible no hay aviso", async () => {
    const dom = await JSDOM.fromURL(base + "Valor_Ganado.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(semilla)); } });
    await esperar(700); expect(dom.window.document.getElementById("gpi-storage-notice")).toBeNull();
  });
  it("Valor Ganado: NO carga DISTRIB+ (USD 7.100.000, 18 paquetes) sobre el proyecto de S/ 1.000", async () => {
    const doc = (await abrirLleno("Valor_Ganado.html")).window.document, cuerpo = doc.body.cloneNode(true) as HTMLElement;
    cuerpo.querySelectorAll("script,style").forEach((n) => n.remove());                              // solo lo que ve el alumno, no el código
    const t = cuerpo.textContent as string;
    expect(t).toMatch(/Proyecto sin seguimiento todavía/);                                           // modo CONECTADO y en blanco (su mensaje ofrece «Cargar ejemplo», no lo carga)
    expect(t).not.toMatch(/7[.,]100[.,]000/); expect(t).not.toMatch(/18 paquetes/);                  // ni el presupuesto ni la EDT del ejemplo
    expect((doc.getElementById("btnSample") as HTMLElement | null) !== null).toBe(true);
  });
  it("Control de Cambios, Plan de Calidad, Comunicaciones y Adquisiciones arrancan EN BLANCO (proyecto real), no con el ejemplo", async () => {
    expect((await abrirLleno("Control_Cambios.html")).window.document.querySelectorAll("tr.cr-row").length).toBe(0);
    expect((await abrirLleno("Plan_Calidad.html")).window.document.querySelectorAll("#tblChecks").length).toBe(0);
    expect((await abrirLleno("Plan_Comunicaciones.html")).window.document.querySelectorAll("#matrix").length).toBe(0);
    expect((await abrirLleno("Plan_Adquisiciones.html")).window.document.querySelectorAll("details.pr").length).toBe(0);
  });
  it("el Panel de Control sigue mostrando el proyecto real (sin el aviso de «sin almacenamiento»)", async () => {
    const doc = (await abrirLleno("Panel_Control.html")).window.document;
    expect(doc.querySelector("#projSelect option")!.textContent).toContain("Proyecto real S/ 1.000");
    expect(doc.getElementById("banner")!.classList.contains("show")).toBe(false);
  });
});
