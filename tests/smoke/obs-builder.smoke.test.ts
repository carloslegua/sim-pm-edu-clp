// Smoke test del módulo OBS_Builder.html migrado a build TS (Fase 4).
//
// OJO: se sirve por HTTP local, no por file://. jsdom trata file:// como
// origen OPACO y bloquea localStorage por completo (a diferencia de
// Chrome/Firefox reales, que sí lo permiten ahí -- así es como esta app
// funciona hoy en producción). Bajo file:// en jsdom, GPI.available()
// devuelve false y el puente con el Panel (gpiBridge) no hace nada -- no
// es un bug de la app, es una limitación del entorno de prueba. Servir
// por HTTP evita el falso negativo y prueba el flujo real de punta a
// punta (igual que GitHub Pages o un servidor local, el otro modo de
// despliegue que el README documenta).
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

describe("OBS_Builder.html (migrado a obs.js)", () => {
  it("arranca en blanco sin proyecto activo, sin errores", async () => {
    const dom = await JSDOM.fromURL(base + "OBS_Builder.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect((dom.window as any).GPI.available()).toBe(true);
    expect(doc.querySelectorAll("#canvas .node").length).toBe(1); // solo el nodo raíz
    expect(doc.getElementById("gpi-stakeholders")).toBeTruthy(); // confirma que gpiBridge corrió
    expect(doc.querySelector(".gpi-badge")).toBeTruthy();
  });

  it("guarda el organigrama en GPI al crear un proyecto y disparar beforeunload (push)", async () => {
    const beforeunloadHandlers: Array<() => void> = [];
    const dom = await JSDOM.fromURL(base + "OBS_Builder.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) {
        const origAdd = window.addEventListener.bind(window);
        window.addEventListener = (type: string, handler: any, opts?: unknown) => {
          if (type === "beforeunload") beforeunloadHandlers.push(handler);
          return origAdd(type, handler, opts);
        };
      }
    });
    await new Promise((r) => setTimeout(r, 500));
    const GPI = (dom.window as any).GPI;
    GPI.createProject({ name: "Proyecto de prueba" });
    expect(beforeunloadHandlers.length).toBe(1);
    beforeunloadHandlers[0]();
    const saved = GPI.getModule("obs");
    expect(saved).toBeTruthy();
    expect(Object.keys(saved.nodes)).toHaveLength(1);
  });

  it("carga (pull) el organigrama de un proyecto ya activo al abrir la página", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto X", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {}
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "OBS_Builder.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const titleInput = dom.window.document.getElementById("projectTitle") as HTMLInputElement;
    expect(titleInput.value).toBe("Organización del Proyecto — Proyecto X");
  });
});
