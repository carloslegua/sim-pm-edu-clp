// Smoke test del módulo Estimar_Costos.html (cost-estimate.js). El costo
// vive a nivel de ACTIVIDAD (reutiliza las de "Definir las Actividades"),
// no de paquete -- ver el comentario de cabecera de
// src/modules/cost-estimate/main.ts para el porqué del rediseño.
// Servido por HTTP local (no file://): ver el comentario en
// tests/smoke/obs-builder.smoke.test.ts sobre por qué.
//
// El caso "importar un .xlsx real y verificar que puebla el estimado" NO
// vive aquí: JSZip nunca resuelve su lectura de contenido (.async(...))
// dentro de jsdom (ver CLAUDE.md, "Trampas ya encontradas"). Esa prueba
// vive en tests/e2e/cost-estimate-import.spec.ts, en Chrome real.
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
  const port = typeof address === "object" && address ? address.port : 0;
  base = `http://127.0.0.1:${port}/`;
});

afterAll(() => { server.close(); });

const seedDb = {
  version: 1, activeId: "p1",
  projects: {
    p1: {
      schema: "gpi.project/v1",
      meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
      modules: {
        wbs: {
          rootId: "root", idCounter: 3,
          nodes: {
            root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
            w1: { id: "w1", parentId: "root", name: "Fase 1", children: ["w2"] },
            w2: { id: "w2", parentId: "w1", name: "Paquete A", children: [] }
          }
        },
        activities: { byLeaf: { w2: [{ id: "a1", name: "Excavar zanja", unit: "m³", qty: 100, perf: 25, teams: 1 }] }, idCounter: 2 }
      }
    }
  }
};

describe("Estimar_Costos.html (cost-estimate.js)", () => {
  it("sin proyecto activo (localStorage vacío vía HTTP): arranca en blanco, sin errores", async () => {
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 900));
    const doc = dom.window.document;
    expect(doc.getElementById("modeChip")!.textContent).toBe("EDT del proyecto");
    expect(doc.querySelectorAll("#estBody tr").length).toBe(0);
  });

  it("modo ejemplo: carga la EDT y las actividades didácticas de DISTRIB+ (mismas que Definir las Actividades), con 21/22 actividades con precio", async () => {
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect(doc.getElementById("modeChip")!.textContent).toBe("MODO EJEMPLO");
    expect(doc.querySelectorAll(".pkg-row").length).toBe(18); // los 18 paquetes de la EDT
    // .act-row incluye las 43 actividades + los 2 hitos de ejemplo (H1 atado
    // a Cimentaciones, H2 suelto) -- ver .milestone-row para distinguirlos.
    expect(doc.querySelectorAll(".act-row").length).toBe(45);
    expect(doc.querySelectorAll(".milestone-row").length).toBe(2);
    expect(doc.getElementById("estBody")!.textContent).toMatch(/Fin de Cimentaciones/);
    expect(doc.getElementById("estBody")!.textContent).toMatch(/Hitos del proyecto/); // sección final para el suelto
    expect(doc.getElementById("estBody")!.textContent).toMatch(/Cierre del Proyecto/);
    expect(doc.getElementById("sbCov")!.textContent).toBe("42/43 actividades con precio");
    expect(doc.getElementById("sbPct")!.textContent).toBe("98%");
    // p43 (Estructura y cobertura) queda "parcial" a propósito: 2 de sus 3
    // actividades tienen precio, la tercera no -- documentado en ARCHITECTURE.md.
    // Es el ÚNICO paquete sin estimado completo -- todos los demás lo tienen.
    // Los hitos NUNCA cuentan aquí (ni en el total ni en la cobertura).
    expect(doc.getElementById("sbPkg")!.textContent).toBe("17/18 paquetes con estimado completo");
    expect(doc.getElementById("sbTotal")!.textContent).toBe("6,160,500");
    expect(doc.getElementById("missList")!.textContent).toMatch(/Todos los paquetes de trabajo tienen actividades definidas/);
  });

  it("con proyecto activo real: la tabla muestra el paquete y su actividad en modo solo lectura", async () => {
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 900));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".pkg-row").length).toBe(1);
    expect(doc.querySelectorAll(".act-row").length).toBe(1);
    expect(doc.querySelectorAll("#estBody input").length).toBe(0);
    // La actividad existe pero no tiene precio: el paquete no aparece "sin
    // actividades" (sí las tiene), pero tampoco tiene estimado completo.
    expect(doc.getElementById("missList")!.textContent).toMatch(/Sin EDT cargada|Todos los paquetes/);
  });

  it("archivo inválido (no es un .xlsx real): avisa con el modal y no toca el estimado existente", async () => {
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 900));
    const doc = dom.window.document;
    const win = dom.window as any;

    // JSZip.loadAsync() SÍ resuelve rápido sobre datos no-zip (rechaza por
    // firma inválida antes de intentar leer contenido) -- esto no depende
    // de la parte de JSZip que cuelga en jsdom.
    const badFile = new win.File(["esto no es un zip"], "estimado.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const input = doc.getElementById("xlsxFileInput") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [badFile], writable: false, configurable: true });
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));

    expect((doc.getElementById("modalOverlay") as HTMLElement).classList.contains("open")).toBe(true);
    expect((doc.getElementById("modalMsg") as HTMLElement).textContent).toMatch(/no parece ser un \.xlsx válido/);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects.p1.modules.costEstimate).toBeUndefined();
  });

  it("'⇩ Cargar ejemplo en el proyecto' SÍ reemplaza el estimado del proyecto activo real, emparejando por Código EDT + nombre de actividad", async () => {
    // La EDT y las actividades sembradas aquí reproducen los códigos 1.1/1.2
    // y los NOMBRES de actividad del caso DISTRIB+ (misma fase "Dirección de
    // Proyecto"), con ids e nombres de paquete DISTINTOS a propósito: el
    // emparejamiento es por Código EDT + Nombre de la actividad, no por ids
    // internos ni por nombre de paquete.
    const seedLive = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            wbs: {
              rootId: "root", idCounter: 4,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
                w1: { id: "w1", parentId: "root", name: "Fase Cualquiera", children: ["w2", "w3"] },
                w2: { id: "w2", parentId: "w1", name: "Paquete con otro nombre A", children: [] },
                w3: { id: "w3", parentId: "w1", name: "Paquete con otro nombre B", children: [] }
              }
            },
            activities: {
              byLeaf: {
                w2: [{ id: "x1", name: "Elaboración y aprobación del acta de constitución", unit: "doc", qty: 1, perf: 0.25, teams: 1 }],
                w3: [
                  { id: "x2", name: "Plan para la dirección del proyecto (líneas base)", unit: "doc", qty: 1, perf: 0.2, teams: 1 },
                  { id: "x3", name: "Planes subsidiarios de gestión", unit: "doc", qty: 6, perf: 0.5, teams: 1 }
                ]
              },
              idCounter: 4
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedLive)); }
    });
    await new Promise((r) => setTimeout(r, 900));
    const doc = dom.window.document;
    (doc.getElementById("btnLoadSampleLive") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect((doc.getElementById("modalOverlay") as HTMLElement).classList.contains("open")).toBe(true);
    expect((doc.getElementById("modalMsg") as HTMLElement).textContent).toMatch(/PROYECTO ACTIVO/);
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 900));

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const est = saved.projects.p1.modules.costEstimate;
    expect(est.byActivity).toMatchObject({ x1: "12000", x2: "20000", x3: "3000" });
    expect(doc.getElementById("modeChip")!.textContent).toBe("EDT del proyecto"); // sigue en modo "live", no "sample"
  });

  it("'⇩ Cargar ejemplo en el proyecto' avisa si el proyecto activo todavía no tiene actividades", async () => {
    const seedNoActs = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: { wbs: { rootId: "root", idCounter: 2, nodes: { root: { id: "root", parentId: null, name: "P", children: ["w1"] }, w1: { id: "w1", parentId: "root", name: "Paquete 1", children: [] } } } }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedNoActs)); }
    });
    await new Promise((r) => setTimeout(r, 900));
    const doc = dom.window.document;
    (doc.getElementById("btnLoadSampleLive") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect((doc.getElementById("modalMsg") as HTMLElement).textContent).toMatch(/todavía no tiene actividades/);
  });
});
