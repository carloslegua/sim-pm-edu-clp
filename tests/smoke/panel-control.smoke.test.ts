// Smoke test del módulo Panel_Control.html migrado a build TS (Fase 4,
// último módulo — punto de entrada del ecosistema). Servido por HTTP
// local (no file://): ver el comentario en tests/smoke/obs-builder.smoke.test.ts
// sobre por qué.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import jsdomPkg from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { esperarHasta } from "../helpers/esperar";

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

describe("Panel_Control.html (migrado a panel-control.js)", () => {
  it("localStorage vacío: ensureSeed crea el proyecto DISTRIB+ y el launcher pinta las 28 tarjetas de módulo en los 7 dominios de PMBOK 8 (20 activas, 8 módulos faltantes)", async () => {
    const dom = await JSDOM.fromURL(base + "Panel_Control.html", { runScripts: "dangerously", resources: "usable" });
    const doc = dom.window.document;
    await esperarHasta(() => doc.querySelectorAll(".mod-card").length === 28 && doc.querySelectorAll("#projSelect option").length === 1, "que el Panel siembre el proyecto y pinte las 28 tarjetas");
    expect(doc.querySelectorAll("#projSelect option").length).toBe(1);
    expect(doc.querySelector("#projSelect option")!.textContent).toContain("DISTRIB+ S.A.");
    expect(doc.querySelectorAll(".mod-card").length).toBe(28);
    expect(doc.querySelectorAll(".mod-card.active").length).toBe(20);   // + Gestión de Riesgos (Risk_Register.html), Valor Ganado (Valor_Ganado.html), Control de Cambios (Control_Cambios.html), Plan para la Dirección (Plan_Direccion.html), Comunicaciones (Plan_Comunicaciones.html), Calidad (Plan_Calidad.html) y Adquisiciones (Plan_Adquisiciones.html)
    expect(doc.querySelectorAll(".mod-card.soon").length).toBe(8);
    // orden y contenido de los dominios de desempeño del PMBOK 8 (no las 10 áreas de conocimiento del PMBOK 6)
    const sec = Array.from(doc.querySelectorAll("#launchGrid h2.section")).map((h) => h.childNodes[0].textContent!.trim());
    expect(sec).toEqual(["Gobernanza", "Alcance", "Cronograma", "Finanzas", "Interesados", "Recursos", "Riesgo"]);
    const dominio = (n: string) => Array.from(doc.querySelectorAll("#launchGrid h2.section")).find((h) => h.childNodes[0].textContent!.trim() === n)!.nextElementSibling!.textContent!;
    expect(dominio("Gobernanza")).toMatch(/Gestión de la Calidad/); expect(dominio("Gobernanza")).toMatch(/Gestión de las Adquisiciones/); expect(dominio("Gobernanza")).toMatch(/Cierre del Proyecto o Fase/);
    expect(dominio("Interesados")).toMatch(/Gestión de las Comunicaciones/);   // Comunicaciones cae en Interesados
    expect(dominio("Finanzas")).toMatch(/Valor Ganado/);
    expect(dominio("Recursos")).toMatch(/Estimar los Recursos/); expect(dominio("Recursos")).toMatch(/Adquirir Recursos/);   // procesos del dominio sin herramienta: módulo faltante

    (doc.getElementById("btnRename") as HTMLElement).click();
    await esperarHasta(() => doc.getElementById("modalInput"), "el cuadro de renombrar");
    (doc.getElementById("modalInput") as HTMLInputElement).value = "Proyecto Renombrado";
    (doc.getElementById("modalOk") as HTMLElement).click();
    await esperarHasta(() => doc.querySelector("#projSelect option")!.textContent!.includes("Proyecto Renombrado"), "que el selector muestre el nombre nuevo");
    expect(doc.querySelector("#projSelect option")!.textContent).toContain("Proyecto Renombrado");

    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects[saved.activeId].meta.name).toBe("Proyecto Renombrado");
  });

  it("con un proyecto real con WBS + Stakeholders + Charter poblados: el tablero integrado combina datos de varios módulos y 'Vaciar' persiste correctamente", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, currency: "PEN", capex: 10000 },
          modules: {
            wbs: {
              rootId: "root", idCounter: 3,
              nodes: {
                root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
                w1: { id: "w1", parentId: "root", name: "Paquete A", children: [], cost: 4000, start: "2026-01-01", end: "2026-02-01" }
              }
            },
            stakeholders: {
              stakeholders: [
                { name: "A", category: "Interno", power: 80, interest: 80 },
                { name: "B", category: "Cliente", power: 20, interest: 20 }
              ], idCounter: 3
            },
            charter: {
              identification: { sponsor: "Ana", manager: "Beto", client: "X", preparedDate: "2026-01-01", approach: "Predictivo", authority: "X" },
              purpose: "P", businessCase: { justification: "J", investment: "I" }, description: "D", boundaries: "B",
              objectives: [{ dim: "Alcance", objective: "O", criteria: "C" }],
              requirements: [{ id: "r1", code: "RAN.01", text: "t" }],
              deliverables: ["d1"], milestones: [{ name: "m1", date: "2026-01-01" }],
              budget: { amount: 10000, currency: "PEN" }, risks: ["r"], assumptions: ["a"], constraints: ["c"], exclusions: ["e"],
              stakeholders: [{ name: "s1" }], approval: { sponsorName: "Ana", managerName: "Beto" }
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Panel_Control.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    const doc = dom.window.document;
    expect(doc.querySelectorAll("#projSelect option").length).toBe(1); // no reseedea sobre un proyecto existente

    const dashHtml = (doc.getElementById("dashGrid") as HTMLElement).innerHTML;
    expect(dashHtml).toContain(">2<"); // 2 interesados registrados
    expect(dashHtml).toContain("4,000"); // costo EDT rollup

    const charterCard = Array.from(doc.querySelectorAll(".mod-card")).find((c) => c.textContent!.includes("Acta de Constitución")) as HTMLElement;
    expect(charterCard.querySelector(".mod-stat .v")!.textContent).toBe("78%");

    (doc.querySelector('[data-clear="charter"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    (doc.getElementById("modalOk") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    expect(saved.projects.p1.modules.charter).toBeNull();
  });
});
