// Smoke test del módulo Enunciado_del_Alcance.html migrado a build TS
// (Fase 4). Servido por HTTP local (no file://): ver el comentario en
// tests/smoke/obs-builder.smoke.test.ts sobre por qué.
//
// Este módulo usa addEventListener/.onclick= exclusivamente (como
// OBS/RACI, no como Cost-management/Recopilar_Requisitos), así que no
// requiere exponer nada en window.
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

describe("Enunciado_del_Alcance.html (migrado a scope-statement.js)", () => {
  it("standalone: muestra el banner de modo independiente y carga la demo DISTRIB+ (6 entregables)", async () => {
    const dom = await JSDOM.fromURL(base + "Enunciado_del_Alcance.html", { runScripts: "dangerously", resources: "usable" });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.getElementById("banner")!.classList.contains("show")).toBe(true);
    expect(doc.querySelectorAll("table.del tbody tr").length).toBe(6);
  });

  it("con proyecto activo arranca en blanco (regla de oro) y 'Sugerir desde el Acta' persiste en GPI", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            charter: { requirements: [{ id: "ranX", code: "RAN.01", text: "RAN real" }], deliverables: ["Entregable clave del Acta"] },
            requirements: { items: [{ id: "q1", code: "REQ.001", text: "Requisito real", sourceRanIds: ["ranX"], wbsNodeIds: [] }], changes: [], idCounter: 2, changeCounter: 1 },
            wbs: { rootId: "root", idCounter: 2, nodes: { root: { name: "P", children: ["w1"] }, w1: { name: "Paquete Real", children: [] } } }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Enunciado_del_Alcance.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    await new Promise((r) => setTimeout(r, 800));
    const doc = dom.window.document;
    expect(doc.querySelectorAll("table.del tbody tr").length).toBe(0); // sin datos -> en blanco

    (doc.getElementById("btnSuggestDels") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelectorAll("table.del tbody tr").length).toBe(1);

    const GPI = (dom.window as any).GPI;
    const saved = GPI.getModule("scopeStatement");
    expect(saved.deliverables).toHaveLength(1);
  });

  // ---- Auditoría (media): la línea base del alcance incluye la EDT y su diccionario, versionados junto con el enunciado ----
  const wbsMod = (over: Record<string, unknown> = {}) => ({ rootId: "r", idCounter: 9, nodes: {
    r: { id: "r", name: "Proyecto", children: ["f1"], cost: 0 },
    f1: { id: "f1", name: "Ingeniería", children: ["w1", "w2"], cost: 0 },
    w1: { id: "w1", name: "Estudio de suelos", children: [], cost: 28000, duration: 10, start: "2026-07-06", end: "2026-07-17", percent: 40, resource: "Geotecnia", notes: "Calicatas y ensayos", acceptance: "Informe firmado", delId: "d1" },
    w2: { id: "w2", name: "Diseño estructural", children: [], cost: 165000, notes: "Memoria y planos", acceptance: "Expediente aprobado" }, ...over } });
  const semilla = (baseline: unknown = null, wbsOver: Record<string, unknown> = {}) => ({ version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 }, modules: {
    wbs: wbsMod(wbsOver),
    scopeStatement: { productScope: "Almacén", projectScope: "Obra", deliverables: [{ id: "d1", code: "DEL.01", name: "Terreno", description: "", acceptanceCriteria: "Cotas ±2 cm", ranIds: [], reqIds: [] }], assumptions: [], constraints: [], exclusions: [], baseline: baseline || { frozen: false, version: "1.0", date: "", approver: "", snapshot: null }, idCounter: 3, delCounter: 2 }
  } } } });
  const abrir = async (seed: unknown) => {
    const dom = await JSDOM.fromURL(base + "Enunciado_del_Alcance.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
    await new Promise((r) => setTimeout(r, 800));
    return dom;
  };
  const host = (doc: Document) => (doc.getElementById("baselineHost") as HTMLElement).textContent!.replace(/\s+/g, " ");
  const poner = (dom: any, id: string, v: string) => { const el = dom.window.document.getElementById(id) as HTMLInputElement; el.value = v; el.dispatchEvent(new dom.window.Event("input", { bubbles: true })); };

  it("REPRO (media): al congelar, la línea base guarda la EDT y su diccionario (descripción, criterio, LOE, entregable) y NO el costo ni las fechas", async () => {
    const dom = await abrir(semilla()), doc = dom.window.document;
    expect(host(doc)).toMatch(/de la EDT y de su diccionario/);                                              // el texto de congelar ya menciona la EDT y el diccionario
    poner(dom, "b_appr", "Sponsor"); (doc.getElementById("btnFreeze") as HTMLElement).click(); await new Promise((r) => setTimeout(r, 1200));
    const b = (dom.window as any).GPI.getModule("scopeStatement").baseline;
    expect(b).toMatchObject({ frozen: true, version: "1.0", approver: "Sponsor", reason: "Línea base inicial" });
    expect(Object.keys(b.snapshot).sort()).toEqual(["assumptions", "constraints", "deliverables", "exclusions", "productScope", "projectScope", "wbs"]);
    expect(b.snapshot.wbs.nodes.w1).toEqual({ name: "Estudio de suelos", children: [], delId: "d1", notes: "Calicatas y ensayos", acceptance: "Informe firmado", loe: false });
    expect(JSON.stringify(b.snapshot.wbs)).not.toMatch(/28000|165000|2026-07-06|Geotecnia|percent/);              // costo, fechas, avance y responsable son de otras líneas base
    expect(host(doc)).toMatch(/3 elemento\(s\) de la EDT con su diccionario/);                              // fase + 2 paquetes (sin contar la raíz)
  });

  it("modificar la EDT o su diccionario DESPUÉS de congelar se ve como trabajo en edición distinto de lo aprobado (con código y qué cambió)", async () => {
    const dom0 = await abrir(semilla()); poner(dom0, "b_appr", "Sponsor"); (dom0.window.document.getElementById("btnFreeze") as HTMLElement).click(); await new Promise((r) => setTimeout(r, 1200));
    const db = JSON.parse(dom0.window.localStorage.getItem("gpi_db") as string);
    expect(host(dom0.window.document)).toMatch(/✓ El enunciado, la EDT y su diccionario coinciden con lo aprobado en la v1\.0/);
    db.projects.p1.modules.wbs.nodes.w1.name = "Estudio geotécnico ampliado"; db.projects.p1.modules.wbs.nodes.w2.acceptance = "Expediente aprobado y sellado";   // alguien edita la EDT en WBS Builder
    const doc = (await abrir(db)).window.document, t = host(doc);
    expect(t).toMatch(/Trabajo en edición distinto de lo aprobado \(v1\.0\)/); expect(t).toMatch(/1\.1 Estudio geotécnico ampliado — renombrado: «Estudio de suelos» → «Estudio geotécnico ampliado»/);
    expect(t).toMatch(/1\.2 Diseño estructural — diccionario: cambió criterio de aceptación/); expect(t).toMatch(/Lo aprobado sigue siendo la instantánea/);
    expect((doc.getElementById("baselineState") as HTMLElement).textContent).toMatch(/2 cambio\(s\) sin aprobar/);
    const snap = db.projects.p1.modules.scopeStatement.baseline.snapshot.wbs; expect(snap.nodes.w1.name).toBe("Estudio de suelos");   // lo aprobado NO cambió
  });

  it("nueva versión: pide aprobador y motivo, no repite versión, y ARCHIVA la vigente completa (con su EDT); ya no hay «Descongelar»", async () => {
    const dom0 = await abrir(semilla()); poner(dom0, "b_appr", "Sponsor"); (dom0.window.document.getElementById("btnFreeze") as HTMLElement).click(); await new Promise((r) => setTimeout(r, 1200));
    const db = JSON.parse(dom0.window.localStorage.getItem("gpi_db") as string); db.projects.p1.modules.wbs.nodes.w1.name = "Estudio geotécnico ampliado";
    const dom = await abrir(db), doc = dom.window.document;
    expect(doc.getElementById("btnUnfreeze")).toBeNull();
    poner(dom, "nv_ver", "1.0"); poner(dom, "nv_appr", ""); poner(dom, "nv_reason", "");
    (doc.getElementById("btnNewVer") as HTMLElement).click();
    expect((doc.getElementById("nv_msg") as HTMLElement).textContent).toMatch(/la versión 1\.0 ya existe.*registra quién aprueba.*documenta el motivo/);
    poner(dom, "nv_ver", "2.0"); poner(dom, "nv_appr", "CCB"); poner(dom, "nv_reason", "Incorpora el estudio ampliado (CR-004)");
    (doc.getElementById("btnNewVer") as HTMLElement).click(); await new Promise((r) => setTimeout(r, 1200));
    const b = (dom.window as any).GPI.getModule("scopeStatement").baseline;
    expect(b).toMatchObject({ version: "2.0", approver: "CCB", reason: "Incorpora el estudio ampliado (CR-004)" }); expect(b.snapshot.wbs.nodes.w1.name).toBe("Estudio geotécnico ampliado");
    expect(b.history).toHaveLength(1); expect(b.history[0]).toMatchObject({ version: "1.0", approver: "Sponsor" }); expect(b.history[0].snapshot.wbs.nodes.w1.name).toBe("Estudio de suelos");
    const t = host(doc); expect(t).toMatch(/Historial de versiones \(1\)/); expect(t).toMatch(/v1\.0.*aprobada.*por Sponsor.*1 entregable\(s\).*3 elemento\(s\) de la EDT/); expect(t).toMatch(/✓ El enunciado, la EDT y su diccionario coinciden con lo aprobado en la v2\.0/);
  });

  it("una línea base ANTIGUA (sin la EDT) se lee sin fallar y se avisa que no se puede comprobar; una nueva versión la incluye", async () => {
    const viejo = { frozen: true, version: "1.0", date: "2026-07-10", approver: "Sponsor", snapshot: { deliverables: [], assumptions: [], constraints: [], exclusions: [], productScope: "", projectScope: "" } };
    const dom = await abrir(semilla(viejo)), doc = dom.window.document;
    expect(host(doc)).toMatch(/se congeló antes de incluir la EDT y su diccionario/); expect((doc.getElementById("baselineState") as HTMLElement).textContent).toMatch(/Congelada v1\.0/);
    poner(dom, "nv_appr", "CCB"); poner(dom, "nv_reason", "Incluye la EDT y su diccionario"); (doc.getElementById("btnNewVer") as HTMLElement).click(); await new Promise((r) => setTimeout(r, 1200));
    const b = (dom.window as any).GPI.getModule("scopeStatement").baseline; expect(b.snapshot.wbs.nodes.w1.acceptance).toBe("Informe firmado"); expect(b.history[0].snapshot.wbs).toBeUndefined();
    expect(host(doc)).not.toMatch(/antes de incluir la EDT/);
  });
});
