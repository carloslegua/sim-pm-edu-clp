// Smoke test del módulo nuevo Estimar_Costos.html (cost-estimate.js).
// Servido por HTTP local (no file://): ver el comentario en
// tests/smoke/obs-builder.smoke.test.ts sobre por qué.
//
// El caso "importar un .xlsx real y verificar que puebla el estimado" NO
// vive aquí: JSZip nunca resuelve su lectura de contenido (.async(...))
// dentro de jsdom (ver CLAUDE.md, "Trampas ya encontradas" -- el mismo
// hallazgo que llevó a mover ese caso a un test E2E para Activity_Definition).
// Esa prueba vive en tests/e2e/cost-estimate-import.spec.ts, en Chrome real.
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

describe("Estimar_Costos.html (cost-estimate.js)", () => {
  it("sin proyecto activo (localStorage vacío vía HTTP): arranca en blanco, sin errores", async () => {
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.getElementById("modeChip")!.textContent).toBe("EDT del proyecto");
    expect(doc.querySelectorAll("#estBody tr").length).toBe(0);
  });

  it("modo ejemplo: carga la EDT y el estimado didáctico de DISTRIB+, con cobertura 100% y total S/ 7.100.000", async () => {
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 500));
    const doc = dom.window.document;
    (doc.getElementById("btnSample") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect(doc.getElementById("modeChip")!.textContent).toBe("MODO EJEMPLO");
    expect(doc.querySelectorAll(".pkg-row").length).toBe(18);
    expect(doc.getElementById("sbCov")!.textContent).toBe("18/18 paquetes estimados");
    expect(doc.getElementById("sbPct")!.textContent).toBe("100%");
    expect(doc.getElementById("sbTotal")!.textContent).toBe("7,100,000");
  });

  it("con proyecto activo real: la tabla muestra los paquetes de la EDT en modo solo lectura", async () => {
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 900));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".pkg-row").length).toBe(1);
    expect(doc.querySelectorAll("#estBody input").length).toBe(0);
    // El paquete todavía no tiene estimado: aparece en "Paquetes sin estimado".
    expect(doc.getElementById("missList")!.textContent).toMatch(/Paquete A/);
  });

  it("archivo inválido (no es un .xlsx real): avisa con el modal y no toca el estimado existente", async () => {
    const dom = await JSDOM.fromURL(base + "Estimar_Costos.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
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
});
