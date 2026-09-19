// Smoke test del módulo Activity_Definition.html migrado a build TS (Fase 4)
// y luego rediseñado: la grilla interactiva se reemplazó por un flujo de
// exportar plantilla .xlsx → completar afuera (Excel o MS Project) →
// importar el archivo terminado (a pedido del usuario: el cronograma real
// del curso se trabaja en MS Project). Servido por HTTP local (no file://):
// ver el comentario en tests/smoke/obs-builder.smoke.test.ts sobre por qué.
//
// El caso "importar un .xlsx real y verificar que puebla las actividades"
// NO vive aquí: JSZip nunca resuelve su lectura de contenido (.async(...))
// dentro de jsdom (verificado con un diagnóstico aislado -- cuelga incluso
// sin compresión, aunque loadAsync() sí procesa la estructura del zip). Esa
// prueba vive en tests/e2e/activity-definition-import.spec.ts, en Chrome
// real, donde JSZip funciona igual que para un alumno de verdad. Ver
// CLAUDE.md, "Trampas ya encontradas".
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
        }
      }
    }
  }
};

describe("Activity_Definition.html (migrado a activities.js)", () => {
  it("sin proyecto activo (localStorage vacío vía HTTP): arranca en blanco, sin errores", async () => {
    const dom = await JSDOM.fromURL(base + "Activity_Definition.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.getElementById("modeChip")!.textContent).toBe("EDT del proyecto");
    expect(doc.querySelectorAll("#actsBody tr").length).toBe(0);
  });

  it("modo ejemplo: 'Explorar con el modo ejemplo' carga la EDT y actividades didácticas de DISTRIB+", async () => {
    const dom = await JSDOM.fromURL(base + "Activity_Definition.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    (doc.getElementById("btnSampleInner") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect(doc.getElementById("modeChip")!.textContent).toBe("MODO EJEMPLO");
    expect(doc.querySelectorAll(".pkg-row").length).toBeGreaterThan(5);
    expect(doc.querySelectorAll(".act-row").length).toBeGreaterThan(5);
    // Tres hitos ilustrativos -- H1 suelto AL PRINCIPIO de todo, H2 atado a
    // un paquete (Cimentaciones), H3 suelto AL FINAL de todo -- ver
    // sampleActivities(). Ninguno se agrupa en un capítulo aparte: cada uno
    // aparece exactamente en su posición dentro del listado.
    expect(doc.querySelectorAll(".milestone-row").length).toBe(3);
    const rows = Array.from(doc.querySelectorAll("#actsBody tr"));
    expect(rows[0].className).toMatch(/proj-row/); // fila 0: tarea resumen del proyecto
    expect(rows[1].className).toMatch(/milestone-row/); // el hito suelto sin ancla va justo después, antes de la fase 1
    expect(rows[1].textContent).toMatch(/Inicio del Proyecto/);
    expect(rows[rows.length - 1].className).toMatch(/milestone-row/); // el hito suelto anclado al último paquete queda al final de todo
    expect(rows[rows.length - 1].textContent).toMatch(/Cierre del Proyecto/);
    expect(doc.getElementById("actsBody")!.textContent).toMatch(/Fin de Cimentaciones/);
    expect(doc.getElementById("actsBody")!.textContent).not.toMatch(/Hitos del proyecto/);
  });

  it("el Id es consecutivo SIN SALTOS: un hito también ocupa su propio número (como un Task ID de MS Project)", async () => {
    // w2 (1.1) tiene 2 actividades + 1 hito atado (se lista después de sus
    // actividades); w3 (1.2) tiene 1 actividad más. El hito consume el
    // siguiente número disponible (5) igual que cualquier otra fila -- así
    // esta tabla se puede cotejar fila por fila contra MS Project, donde un
    // hito también es una fila con su propio Task ID, nunca un hueco.
    const seedWithMilestone = {
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
                w1: { id: "w1", parentId: "root", name: "Fase 1", children: ["w2", "w3"] },
                w2: { id: "w2", parentId: "w1", name: "Paquete A", children: [] },
                w3: { id: "w3", parentId: "w1", name: "Paquete B", children: [] }
              }
            },
            activities: {
              byLeaf: {
                w2: [{ id: "a1", name: "Actividad 1", unit: "m³", qty: 10, perf: 5, teams: 1 }, { id: "a2", name: "Actividad 2", unit: "m³", qty: 10, perf: 5, teams: 1 }],
                w3: [{ id: "a3", name: "Actividad 3", unit: "m³", qty: 10, perf: 5, teams: 1 }]
              },
              idCounter: 4,
              milestones: [{ id: "m1", code: "H1", name: "Hito intermedio", leafId: "w2" }]
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Activity_Definition.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedWithMilestone)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const rows = Array.from(doc.querySelectorAll("#actsBody tr"));
    const idOf = (row: Element) => row.querySelector(".n-cell")!.textContent;
    // 0=proyecto, 1=Fase 1, 2=Paquete A, 3=Actividad 1, 4=Actividad 2,
    // 5=hito (consume número), 6=Paquete B, 7=Actividad 3.
    expect(rows.map(idOf)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
    expect(rows[5].className).toMatch(/milestone-row/);
    expect(rows[6].textContent).toMatch(/Paquete B/);
  });

  it("con proyecto activo real: la tabla muestra los paquetes de la EDT en modo solo lectura", async () => {
    const dom = await JSDOM.fromURL(base + "Activity_Definition.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".pkg-row").length).toBe(1);
    // Ya no hay inputs de edición por celda ni botón "+ Actividad": el
    // módulo pasó a ser de solo lectura (las actividades entran por import).
    expect(doc.querySelectorAll("#actsBody input").length).toBe(0);
    expect(doc.querySelectorAll(".btn-add-act").length).toBe(0);
  });

  it("archivo inválido (no es un .xlsx real): avisa con el modal y no toca las actividades existentes", async () => {
    const dom = await JSDOM.fromURL(base + "Activity_Definition.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const win = dom.window as any;

    // JSZip.loadAsync() SÍ resuelve rápido sobre datos no-zip (rechaza por
    // firma inválida antes de intentar leer contenido) -- esto no depende
    // de la parte de JSZip que cuelga en jsdom (ver comentario del archivo).
    const badFile = new win.File(["esto no es un zip"], "actividades.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const input = doc.getElementById("xlsxFileInput") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [badFile], writable: false, configurable: true });
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));

    expect((doc.getElementById("modalOverlay") as HTMLElement).classList.contains("open")).toBe(true);
    expect((doc.getElementById("modalMsg") as HTMLElement).textContent).toMatch(/no parece ser un \.xlsx válido/);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects.p1.modules.activities).toBeUndefined();
  });

  it("SEGURIDAD/UX: si JSZip no llegó a cargar, el aviso lo dice -- no confunde 'librería ausente' con 'archivo inválido'", async () => {
    // Bug real reportado por el usuario: con el CDN de JSZip bloqueado, un
    // .xlsx VÁLIDO producía el mismo mensaje engañoso que un archivo
    // corrupto ("no parece ser un .xlsx válido"). JSZip ahora se vendoriza
    // en el repo (jszip.min.js, ver Activity_Definition.html) en vez de
    // depender de un CDN, así que esto ya no puede pasar por falta de
    // Internet -- pero la comprobación explícita sigue siendo necesaria por
    // cualquier otro motivo por el que window.JSZip no llegue a existir
    // (bloqueo del navegador, caché corrupta, etc.). Se simula borrando
    // window.JSZip después de que la página cargó, igual que "CDN bloqueado"
    // desde el punto de vista del código que importa el archivo.
    const dom = await JSDOM.fromURL(base + "Activity_Definition.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    const win = dom.window as any;
    expect(win.JSZip).toBeDefined(); // confirma que sí cargó localmente antes de borrarlo a propósito
    delete win.JSZip;

    const anyFile = new win.File(["contenido irrelevante"], "actividades.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const input = doc.getElementById("xlsxFileInput") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [anyFile], writable: false, configurable: true });
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));

    expect((doc.getElementById("modalOverlay") as HTMLElement).classList.contains("open")).toBe(true);
    const msg = (doc.getElementById("modalMsg") as HTMLElement).textContent || "";
    expect(msg).toMatch(/no se pudo cargar la librería/i);
    expect(msg).not.toMatch(/no parece ser un \.xlsx válido/);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects.p1.modules.activities).toBeUndefined();
  });

  it("'⇩ Cargar ejemplo en el proyecto' SÍ reemplaza las actividades del proyecto activo real, emparejando por Código EDT", async () => {
    // A diferencia del "Modo ejemplo" (sandbox), esta acción reconcilia las
    // actividades de ejemplo de DISTRIB+ contra la EDT REAL -- ver el
    // comentario de loadSampleIntoProject() en activities/main.ts. La EDT
    // sembrada aquí reproduce los códigos 1.1 y 1.2 del caso DISTRIB+
    // (misma fase "Dirección de Proyecto"), con nombres de paquete
    // DISTINTOS a propósito: el emparejamiento es por Código EDT, no por
    // nombre de paquete.
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
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Activity_Definition.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedLive)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    (doc.getElementById("btnLoadSampleLive") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect((doc.getElementById("modalOverlay") as HTMLElement).classList.contains("open")).toBe(true);
    expect((doc.getElementById("modalMsg") as HTMLElement).textContent).toMatch(/PROYECTO ACTIVO/);
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 900));

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const acts = saved.projects.p1.modules.activities;
    expect(acts.byLeaf.w2).toHaveLength(1); // 1.1 = Acta de constitución
    expect(acts.byLeaf.w2[0].name).toMatch(/acta de constitución/i);
    expect(acts.byLeaf.w3).toHaveLength(2); // 1.2 = Plan de gestión del proyecto (2 actividades)
    expect(doc.getElementById("modeChip")!.textContent).toBe("EDT del proyecto"); // sigue en modo "live", no "sample"
  });

  it("'⇩ Cargar ejemplo en el proyecto' avisa si la EDT del proyecto activo está vacía", async () => {
    const seedNoWbs = {
      version: 1, activeId: "p1",
      projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 }, modules: {} } }
    };
    const dom = await JSDOM.fromURL(base + "Activity_Definition.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedNoWbs)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    (doc.getElementById("btnLoadSampleLive") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect((doc.getElementById("modalMsg") as HTMLElement).textContent).toMatch(/EDT del proyecto activo está vacía/);
  });
});
