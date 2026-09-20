// Smoke test del módulo Project_Charter.html migrado a build TS (Fase 4).
// Servido por HTTP local (no file://): ver el comentario en
// tests/smoke/obs-builder.smoke.test.ts sobre por qué.
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

describe("Project_Charter.html (migrado a project-charter.js)", () => {
  it("standalone (sin proyecto activo): arranca vacía (0%) y 'Cargar ejemplo' lleva el checklist DISTRIB+ a 100%", async () => {
    const dom = await JSDOM.fromURL(base + "Project_Charter.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    expect(doc.getElementById("sbPct")!.textContent).toBe("0%");

    (doc.getElementById("btnSample") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));

    expect((doc.querySelector('[data-bind="identification.sponsor"]') as HTMLInputElement).value).toBe("Gerencia General DISTRIB+");
    expect(doc.getElementById("sbPct")!.textContent).toBe("100%");
    expect(doc.querySelectorAll(".ran-code").length).toBe(4);
    expect(doc.querySelectorAll("#tblObjectives tbody tr").length).toBe(4);
  });

  it("con proyecto activo real: precarga sponsor/director/CAPEX desde los metadatos comunes, e importa hitos desde la EDT e interesados clave desde Stakeholder Studio", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, sponsor: "Ana Sponsor", manager: "Beto Manager", capex: 500000, currency: "PEN" },
          modules: {
            wbs: {
              rootId: "root", idCounter: 3,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
                w1: { id: "w1", parentId: "root", name: "Fase 1", children: [], start: "2026-01-05", end: "2026-02-10", cost: 5000 }
              }
            },
            stakeholders: {
              stakeholders: [
                { name: "Interesado Alto", org: "Org A", role: "Sponsor", power: 90, interest: 80, notes: "Nota A" },
                { name: "Interesado Bajo", org: "Org B", role: "Observador", power: 10, interest: 10, notes: "Nota B" }
              ], idCounter: 3
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Project_Charter.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect((doc.querySelector('[data-bind="identification.sponsor"]') as HTMLInputElement).value).toBe("Ana Sponsor");
    expect((doc.querySelector('[data-bind="identification.manager"]') as HTMLInputElement).value).toBe("Beto Manager");
    expect((doc.querySelector('[data-bind="budget.amount"]') as HTMLInputElement).value).toBe("500000");

    (doc.getElementById("btnImportMilestones") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect(doc.querySelectorAll("#tblMilestones tbody tr").length).toBe(1);

    (doc.getElementById("btnImportStakeholders") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    // solo el interesado con poder e interés >= 50 (cuadrante "gestionar de cerca") se importa
    expect(doc.querySelectorAll("#tblStakeholders tbody tr").length).toBe(1);

    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const ch = saved.projects.p1.modules.charter;
    expect(ch.milestones.length).toBe(1);
    expect(ch.milestones[0].name).toBe("Fin de Fase 1");
    expect(ch.stakeholders.length).toBe(1);
    expect(ch.stakeholders[0].name).toBe("Interesado Alto");
  });

  it("BUG REPORTADO (alta): otra pestaña actualiza el MISMO proyecto y el guardado de salida del Acta NO reemplaza la descripción nueva por la antigua", async () => {
    // Repro: "abrir el Acta, actualizarla desde otra pestaña y ejecutar el
    // guardado de salida de la primera. La descripción nueva quedó
    // reemplazada por la antigua, vacía." La guarda por projectId no lo
    // detectaba (es el mismo proyecto); ahora la sesión de edición compara
    // la versión del Acta que cargó.
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto A", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: { charter: { description: "" } }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Project_Charter.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 600));
    const doc = dom.window.document;

    // Otra pestaña (Acta abierta en otra ventana, o el Panel) actualiza la descripción.
    const db2 = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    db2.projects.p1.modules.charter = { description: "Descripción NUEVA escrita en la otra pestaña" };
    db2.projects.p1.revs = { charter: 1 };
    dom.window.localStorage.setItem("gpi_db", JSON.stringify(db2));

    // (a) guardado de salida SIN modificaciones propias: no escribe nada.
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    let saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects.p1.modules.charter.description).toBe("Descripción NUEVA escrita en la otra pestaña");

    // (b) guardado con una edición propia sobre la versión vieja: conflicto,
    // NO se sobrescribe y el usuario ve el aviso.
    const sponsor = doc.querySelector('[data-bind="identification.sponsor"]') as HTMLInputElement;
    sponsor.value = "Sponsor editado en la pestaña vieja";
    sponsor.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects.p1.modules.charter.description).toBe("Descripción NUEVA escrita en la otra pestaña");
    expect(saved.projects.p1.modules.charter.identification).toBeUndefined();
    expect(doc.getElementById("statusLeft")!.textContent).toMatch(/cambió en otra pestaña/);
  });

  async function abrirActa(modules: Record<string, unknown>, meta: Record<string, unknown> = {}) {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: { p1: { schema: "gpi.project/v1", meta: Object.assign({ id: "p1", name: "Proyecto A", course: "GPI", createdAt: 1, updatedAt: 1 }, meta), modules } }
    };
    const dom = await JSDOM.fromURL(base + "Project_Charter.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 600));
    return dom;
  }
  function editarSponsor(dom: any, valor: string) {
    const el = dom.window.document.querySelector('[data-bind="identification.sponsor"]') as HTMLInputElement;
    el.value = valor;
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  }

  it("REPRO (alta): tras un fallo de cuota, reintentar con los mismos datos NO dice «Sincronizado» sin guardar", async () => {
    const dom = await abrirActa({ charter: { description: "anterior" } });
    const win = dom.window as any, doc = dom.window.document;
    const boton = () => doc.getElementById("gpiSyncBtn") as HTMLElement;

    const real = win.Storage.prototype.setItem;
    win.Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === "gpi_db") throw new win.DOMException("Quota exceeded", "QuotaExceededError");
      return real.call(this, k, v);
    };
    editarSponsor(dom, "Sponsor nuevo");
    boton().click();
    expect(boton().textContent).toMatch(/Sin sincronizar/);
    expect(win.GPI.hasUnsavedChanges()).toBe(true);

    // Reintento con el almacenamiento aún lleno: sigue sin sincronizar.
    boton().click();
    expect(boton().textContent).toMatch(/Sin sincronizar/);

    // Almacenamiento restablecido: el mismo reintento guarda DE VERDAD.
    win.Storage.prototype.setItem = real;
    boton().click();
    expect(boton().textContent).toMatch(/✓ Sincronizado/);
    expect(win.GPI.hasUnsavedChanges()).toBe(false);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects.p1.modules.charter.identification.sponsor).toBe("Sponsor nuevo");
  });

  it("REPRO (media): un conflicto del Acta no deja pasar sus metadatos por separado (patrocinador S0 en el Acta y S1 en el proyecto)", async () => {
    const dom = await abrirActa({ charter: { identification: { sponsor: "S0" } } }, { sponsor: "S0" });
    const win = dom.window as any, doc = dom.window.document;
    // Otra pestaña actualiza el Acta (sube la revisión).
    win.GPI.writeModule("charter", { identification: { sponsor: "de-otra-pestaña" } });

    editarSponsor(dom, "S1"); // esta pestaña edita el patrocinador: Acta y meta.sponsor cambian juntos
    (doc.getElementById("gpiSyncBtn") as HTMLElement).click();

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects.p1.modules.charter.identification.sponsor).toBe("de-otra-pestaña");
    expect(saved.projects.p1.meta.sponsor).toBe("S0"); // antes quedaba "S1"
    expect((doc.getElementById("gpiSyncBtn") as HTMLElement).textContent).toMatch(/Sin sincronizar/);
  });

  it("BUG REPORTADO: si otra pestaña activa un proyecto distinto mientras el Acta sigue abierta, el guardado de salida NO debe sobrescribir ese otro proyecto", async () => {
    // Repro exacta: "abrir el Acta del proyecto A, activar B desde el
    // Panel y ejecutar el guardado de salida del Acta. B terminó con el
    // nombre de A y recibió su acta." -- p1 (A) y p2 (B) coexisten desde
    // el arranque; el Acta carga con p1 activo.
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto A", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {}
        },
        p2: {
          schema: "gpi.project/v1",
          meta: { id: "p2", name: "Proyecto B", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: { charter: { identification: { sponsor: "Sponsor real de B" } } }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Project_Charter.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    expect((doc.getElementById("projectTitle") as HTMLInputElement).value).toBe("Proyecto A");

    // El alumno edita el Acta de A...
    (doc.querySelector('[data-bind="identification.sponsor"]') as HTMLInputElement).value = "Sponsor editado en A";
    (doc.querySelector('[data-bind="identification.sponsor"]') as HTMLInputElement).dispatchEvent(new dom.window.Event("input", { bubbles: true }));

    // ...y, SIN recargar esta pestaña, otra pestaña (el Panel de Control)
    // activa el proyecto B -- simulado igual que en
    // tests/e2e/wbs-authority-propagation.spec.ts: se escribe localStorage
    // directo y se dispara el evento "storage" que GPI.onChange() escucha.
    const db2 = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    db2.activeId = "p2";
    dom.window.localStorage.setItem("gpi_db", JSON.stringify(db2));
    dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "gpi_db" }));
    await new Promise((r) => setTimeout(r, 50));

    // El alumno cierra/oculta la pestaña del Acta -- se dispara el guardado de salida.
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    // B (el proyecto activo ahora) NUNCA debe recibir el Acta ni el nombre de A.
    expect(saved.projects.p2.meta.name).toBe("Proyecto B");
    expect(saved.projects.p2.modules.charter.identification.sponsor).toBe("Sponsor real de B");
    // A tampoco debe corromperse (el guardado, correctamente rechazado, no debe tocarlo).
    expect(saved.projects.p1.meta.name).toBe("Proyecto A");
    expect(saved.projects.p1.modules.charter).toBeUndefined();
  });
});
