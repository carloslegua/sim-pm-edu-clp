// Smoke test del módulo Activity_Definition.html migrado a build TS (Fase 4).
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
  });

  it("con proyecto activo real: agregar una actividad calcula la duración (Met/(#Eq×R)) y persiste en GPI.getModule('activities')", async () => {
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
    const dom = await JSDOM.fromURL(base + "Activity_Definition.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".pkg-row").length).toBe(1);

    (doc.querySelector('[data-add="w2"]') as HTMLElement).dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const nameInput = doc.querySelector('input[data-leaf="w2"][data-i="0"][data-f="name"]') as HTMLInputElement;
    const qtyInput = doc.querySelector('input[data-leaf="w2"][data-i="0"][data-f="qty"]') as HTMLInputElement;
    const perfInput = doc.querySelector('input[data-leaf="w2"][data-i="0"][data-f="perf"]') as HTMLInputElement;
    nameInput.value = "Excavar zanja"; nameInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    qtyInput.value = "100"; qtyInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    perfInput.value = "25"; perfInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));

    const durCell = qtyInput.closest("tr")!.querySelector(".dur-cell") as HTMLElement;
    expect(durCell.textContent).toBe("4");

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const acts = saved.projects.p1.modules.activities;
    expect(acts.byLeaf.w2[0].name).toBe("Excavar zanja");
    expect(acts.byLeaf.w2[0].qty).toBe("100");
    expect(acts.byLeaf.w2[0].perf).toBe("25");
  });
});
