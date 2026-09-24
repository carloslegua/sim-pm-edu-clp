// Smoke test del módulo Plan_Direccion.html (Plan para la Dirección del Proyecto: integrador de líneas base).
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
  const dom = await JSDOM.fromURL(base + "Plan_Direccion.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); } });
  await esperar(700);
  return dom;
};
const limpio = (html: string) => html.replace(/<\/(div|td|th|tr|li|span|p|b|label)>/g, " ").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const estado = (doc: Document) => limpio(doc.getElementById("stateView")!.innerHTML);
const documento = (doc: Document) => limpio(doc.getElementById("docView")!.innerHTML);
const pestana = (doc: Document, v: string) => (doc.querySelector(`#tabs .tab[data-view="${v}"]`) as HTMLElement).click();

const FRENTE = { frozen: true, version: "1.0", date: "2026-07-10", approver: "Sponsor" };
// a1 (10 d) → a2 (5 d); paquetes 1.1 y 1.2 (red mínima, 15 días laborables)
const proyecto = (extra: Record<string, unknown> = {}) => ({
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1, startDate: "2026-07-06", capex: "5000" }, modules: {
    wbs: { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2"] }, w1: { id: "w1", name: "Excavación", children: [] }, w2: { id: "w2", name: "Relleno", children: [] } } },
    activities: { idCounter: 3, byLeaf: { w1: [{ id: "a1", name: "Excavar", unit: "m", qty: 10, perf: 1, teams: 1 }], w2: [{ id: "a2", name: "Rellenar", unit: "m", qty: 5, perf: 1, teams: 1 }] } },
    schedule: { linkCounter: 2, import: null, baseline: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }] },
    ...extra
  } } }
});
// Las tres líneas base que exige la aprobación: alcance, cronograma (LB-1) y presupuesto
const conLineasBase = () => proyecto({
  scopeStatement: { productScope: "Terreno nivelado", deliverables: [{ id: "d1", code: "E1", name: "Terreno nivelado", acceptanceCriteria: "Cotas ±2 cm" }], baseline: FRENTE, idCounter: 1, delCounter: 2 },
  schedule: { linkCounter: 2, import: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }], baseline: { frozen: true, version: "LB-1", date: "2026-07-12", snapshot: { projectDuration: 15, startDate: "2026-07-06", finishDate: "2026-07-24", nearCriticalDays: 5, rows: [{ id: "a1", code: "1.1.1", name: "Excavar", isMilestone: false, dur: 10, es: 0, ef: 10, tf: 0, critical: true }] }, log: [{ version: "LB-1", date: "2026-07-12", reason: "Línea base inicial", approver: "Sponsor", sponsorAuth: true, projectDuration: 15, finishDate: "2026-07-24", deviationPct: null }] } },
  cost: { budget: { baseCost: 4000, computed: { base: 4000, cont: 400, bac: 4400, total: 4600 } }, changeOrders: [], estimate: { class: 3 } }
});

describe("Plan_Direccion.html (Plan para la Dirección del Proyecto)", () => {
  it("sin proyecto activo: no inventa el caso DISTRIB+; avisa y no ofrece documento", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(estado(doc)).toMatch(/Sin proyecto activo/);
    expect(estado(doc)).not.toMatch(/DISTRIB/);
    pestana(doc, "doc");
    expect(documento(doc)).toMatch(/Sin proyecto activo/);
    expect(doc.getElementById("btnApprove")).toBeNull();
  });

  it("proyecto sin líneas base: muestra las 14 áreas, avisa y bloquea la aprobación", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(doc.querySelectorAll("#stateView tbody tr").length).toBeGreaterThan(14);
    const t = estado(doc);
    expect(t).toMatch(/Plan de Calidad.*Sin datos/); expect(t).toMatch(/Plan de Comunicaciones.*Sin datos/); expect(t).toMatch(/Plan de Adquisiciones.*Sin datos/);
    expect(t).toMatch(/P17 .*Calidad: El Plan de Calidad aún no está elaborado/);                          // hay planes y líneas base pero faltan los planes subsidiarios
    expect(t).toMatch(/15 d laborables .* sin línea base/);                                  // el cronograma sí se lee de la red del proyecto
    expect(t).toMatch(/P3 .*El cronograma no tiene línea base/);
    expect(t).toMatch(/No se puede aprobar todavía: falta la línea base del alcance; falta la línea base del cronograma; falta el presupuesto/);
    expect((doc.getElementById("btnApprove") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Documento: portada, contenido y las secciones del plan con los datos de la EDT y del cronograma", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    pestana(doc, "doc");
    const t = documento(doc);
    expect(t).toMatch(/Plan para la dirección del proyecto\s*Proyecto Live/); expect(t).toMatch(/Contenido/);
    // en el orden de las áreas de conocimiento: alcance, cronograma, costos, calidad, recursos, comunicaciones, riesgos, adquisiciones, interesados…
    const titulos = ["1. Descripción del proyecto", "2. Plan de gestión del alcance", "3. Plan de gestión del cronograma", "4. Plan de gestión de costos", "5. Plan de gestión de la calidad", "6. Plan de gestión de recursos", "7. Plan de gestión de las comunicaciones", "8. Plan de gestión de riesgos", "9. Plan de gestión de las adquisiciones", "10. Plan de involucramiento", "11. Control integrado de cambios", "12. Medición del desempeño", "13. Líneas base y aprobación"];
    titulos.forEach((s) => expect(t, s).toContain(s));
    const pos = (s: string) => doc.querySelector("#docView .paper")!.textContent!.lastIndexOf(s);
    titulos.slice(1).forEach((s, i) => expect(pos(s), s).toBeGreaterThan(pos(titulos[i])));
    expect(t).toMatch(/Excavación/); expect(t).toMatch(/Relleno/);                            // EDT con diccionario
    expect(t).toMatch(/Duración \(días laborables\) 15/);
    expect(doc.querySelectorAll("#docView .toc a").length).toBeGreaterThan(10);
  });

  it("los planes de calidad, comunicaciones y adquisiciones se resumen en el estado y se documentan (con su fecha de convocatoria vencida como aviso)", async () => {
    const seed = proyecto({
      quality: { idCounter: 3, checks: [{ id: "qc1", code: "QC-01", wbsId: "w1", what: "Ensayo de probetas", criterion: "f'c ≥ 210", kind: "Control", method: "Ensayo de laboratorio", frequency: "Por vaciado", owner: "Control de Calidad", record: "Informe" }], metrics: [], coq: [{ id: "cq1", cat: "prevencion", description: "Revisiones", amount: 1000 }] },
      comms: { idCounter: 2, items: [{ id: "cm1", code: "CM-01", info: "Avance", purpose: "Alinear", stkIds: [], audience: "Sponsor", sender: "PM", frequency: "Mensual", method: "Informe escrito", storage: "Acta" }], plan: {} },
      procurement: { idCounter: 2, asOf: "2026-10-01", items: [{ id: "pr1", code: "PR-01", name: "Estructuras", wbsIds: ["w1"], decision: "Comprar", contractType: "Precio unitario", selection: "Concurso de precios", criteria: [{ name: "Precio", weight: 100 }], value: 900, needDate: "2026-10-15", leadDays: 10, selectionDays: 30, status: "Planificada", owner: "PM" }] }
    });
    const dom = await abrir(seed), doc = dom.window.document, t = estado(doc);
    expect(t).toMatch(/Plan de Calidad.*1 control\(es\) · costo de la calidad/); expect(t).toMatch(/Plan de Comunicaciones.*1 comunicación\(es\)/); expect(t).toMatch(/Plan de Adquisiciones.*1 adquisición\(es\).*1 convocatoria\(s\) vencida\(s\)/);
    expect(t).toMatch(/P15 .*Adquisiciones: 1 adquisición\(es\) con la convocatoria ya vencida a la fecha de corte 2026-10-01/);
    expect(t).not.toMatch(/P17 /);                                                                        // los tres planes existen
    pestana(doc, "doc");
    const d = documento(doc);
    expect(d).toMatch(/5\. Plan de gestión de la calidad/); expect(d).toMatch(/Ensayo de probetas/); expect(d).toMatch(/7\. Plan de gestión de las comunicaciones/); expect(d).toMatch(/CM-01.*Avance.*Alinear.*Sponsor/);
    expect(d).toMatch(/9\. Plan de gestión de las adquisiciones/); expect(d).toMatch(/PR-01.*Estructuras.*Precio unitario.*Precio 100 %.*2026-10-15.*2026-09-05/);   // convocar antes del 2026-10-15 − 40 d
  });

  it("con las tres líneas base se puede aprobar: guarda versión, quién, cuándo y la instantánea; sin nombre no aprueba", async () => {
    const dom = await abrir(conLineasBase()), doc = dom.window.document, w = dom.window as any;
    const btn = doc.getElementById("btnApprove") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(estado(doc)).toMatch(/P4 .*Basis of Estimate no está aprobada/);                   // la BOE sin aprobar avisa, no bloquea
    btn.click(); await esperar(50);
    expect(doc.getElementById("statusLeft")!.textContent).toMatch(/Indica quién aprueba/);
    expect(doc.getElementById("modalOverlay")!.classList.contains("open")).toBe(false);
    const ap = doc.getElementById("pfApprover") as HTMLInputElement; ap.value = "Rosa Paredes, Sponsor"; ap.dispatchEvent(new w.Event("input", { bubbles: true }));
    btn.click(); await esperar(50);
    expect(doc.getElementById("modalOverlay")!.classList.contains("open")).toBe(true);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(1100);
    expect(estado(doc)).toMatch(/Plan aprobado v1\.0 por Rosa Paredes, Sponsor/);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.pmplan;
    expect(saved.status).toBe("aprobado"); expect(saved.version).toBe("1.0"); expect(saved.approvedBy).toBe("Rosa Paredes, Sponsor");
    expect(saved.snapshot).toMatchObject({ scopeVersion: "1.0", scheduleVersion: "LB-1", bacCurrent: 4400 });
  });

  it("plan aprobado y luego cambia una línea base: queda desactualizado; «Nueva versión» conserva el historial", async () => {
    const seed = conLineasBase() as any;
    seed.projects.p1.modules.pmplan = { version: "1.0", status: "aprobado", approvedBy: "Rosa Paredes", approvedOn: "2026-07-15", snapshot: { scopeVersion: "1.0", scopeDate: "2026-07-10", requirementsVersion: "", scheduleVersion: "LB-1", scheduleDate: "2026-07-12", scheduleFinish: "2026-07-24", bacCurrent: 4200, costBaseline: "", boeStatus: "borrador" }, history: [] };
    const dom = await abrir(seed), doc = dom.window.document;
    expect(estado(doc)).toMatch(/Plan aprobado con CAMBIOS SIN APROBAR/);                    // el BAC vigente ya no es el aprobado (4.200 → 4.400)
    expect(estado(doc)).toMatch(/P12 .*BAC vigente/);
    expect(estado(doc)).toMatch(/P20 .*antes de conservar su contenido/);                     // este plan se aprobó sin huellas ni documento: no se puede demostrar
    (doc.getElementById("btnNewVersion") as HTMLElement).click(); await esperar(50);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(1100);
    expect(estado(doc)).toMatch(/Versiones anteriores: v1\.0 \(2026-07-15\)/);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.pmplan;
    expect(saved.status).toBe("borrador"); expect(saved.version).toBe("2.0"); expect(saved.history).toHaveLength(1); expect(saved.snapshot).toBeNull();
  });

  // ---- Auditoría (alta): el documento del plan aprobado NO puede cambiar sin una nueva aprobación ----
  const aprobarPlan = async (seed: unknown) => {
    const dom = await abrir(seed), doc = dom.window.document, w = dom.window as any;
    const ap = doc.getElementById("pfApprover") as HTMLInputElement; ap.value = "Rosa Paredes, Sponsor"; ap.dispatchEvent(new w.Event("input", { bubbles: true }));
    (doc.getElementById("btnApprove") as HTMLElement).click(); await esperar(50);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(1100);
    return JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
  };
  const conCalidad = (politica: string) => { const s = conLineasBase() as any; s.projects.p1.modules.quality = { idCounter: 2, policy: politica, standards: "RNE", metrics: [], checks: [], coq: [{ id: "cq1", cat: "prevencion", description: "Revisiones", amount: 1000 }] }; return s; };

  it("REPRO (alta): aprobar y luego modificar la política de calidad — el documento sigue siendo el APROBADO (con la política aprobada), se avisa el cambio y lo vigente es un borrador", async () => {
    const db = await aprobarPlan(conCalidad("Política aprobada por el sponsor")), mod = db.projects.p1.modules.pmplan;
    expect(mod.status).toBe("aprobado"); expect(mod.approvedDoc).toMatch(/Política aprobada por el sponsor/); expect(mod.approvedDoc).toMatch(/Aprobado/);
    expect(Object.keys(mod.snapshot.digests)).toEqual(expect.arrayContaining(["quality", "comms", "procurement", "charter", "wbs", "schedule", "cost", "meta"]));
    // …el alumno edita después la política de calidad (otro módulo) y vuelve a abrir el plan
    db.projects.p1.modules.quality.policy = "Política MODIFICADA después de aprobar";
    const dom = await abrir(db), doc = dom.window.document;
    expect(estado(doc)).toMatch(/Plan aprobado con CAMBIOS SIN APROBAR .*Plan de Calidad \(aprobado → modificado\)/); expect(estado(doc)).toMatch(/P12 /);
    expect((doc.getElementById("btnNewVersion") as HTMLElement).textContent).toMatch(/con los cambios/);
    pestana(doc, "doc");
    let d = documento(doc);
    expect(d).toMatch(/Documento APROBADO v1\.0/); expect(d).toMatch(/cambios sin aprobar\s*:\s*Plan de Calidad/);
    expect(d).toMatch(/Política aprobada por el sponsor/); expect(d).not.toMatch(/MODIFICADA/);                  // lo aprobado, intacto
    // el borrador vigente se ve solo a pedido y se declara como tal
    (doc.getElementById("docCurrent") as HTMLElement).click(); d = documento(doc);
    expect(d).toMatch(/BORRADOR con los datos actuales\s*, no es el documento aprobado v1\.0/); expect(d).toMatch(/Política MODIFICADA después de aprobar/); expect(d).toMatch(/Borrador con cambios sin aprobar \(sobre la v1\.0 aprobada\)/);
    (doc.getElementById("docBack") as HTMLElement).click(); expect(documento(doc)).toMatch(/Política aprobada por el sponsor/);
  });

  it("exportar a Word con cambios sin aprobar exporta el documento APROBADO (nunca uno reconstruido que se haga pasar por él)", async () => {
    const db = await aprobarPlan(conCalidad("Política aprobada por el sponsor"));
    db.projects.p1.modules.quality.policy = "Política MODIFICADA después de aprobar";
    const dom = await abrir(db), doc = dom.window.document, w = dom.window as any;
    let parts: string[] = [], name = ""; w.Blob = function (p: string[]) { parts = p; }; w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {}; w.HTMLAnchorElement.prototype.click = function () { name = this.download; };
    (doc.getElementById("btnWord") as HTMLElement).click();
    expect(name).toBe("plan_para_la_direccion_v1.0_aprobada.doc"); expect(parts.join("")).toMatch(/Política aprobada por el sponsor/); expect(parts.join("")).not.toMatch(/MODIFICADA/);
  });

  it("los registros VIVOS (valor ganado, riesgos individuales, interesados, cambios) siguen cambiando durante la ejecución sin invalidar el plan aprobado", async () => {
    const db = await aprobarPlan(conCalidad("Política aprobada"));
    db.projects.p1.modules.evm = { statusDate: "2026-09-01", percent: { w1: 50 }, ac: { w1: 600 }, techniques: {}, reports: [{ date: "2026-09-01", offset: 5, pv: 1, ev: 1, ac: 1, cpi: 1, spi: 1 }] };
    db.projects.p1.modules.stakeholders = { idCounter: 2, stakeholders: [{ id: "s1", name: "Nuevo interesado", power: 50, interest: 50 }] };
    db.projects.p1.modules.changes = { idCounter: 2, requests: [{ id: "cr1", code: "CR-001", title: "Cambio nuevo", status: "Pendiente" }] };
    const doc = (await abrir(db)).window.document;
    expect(estado(doc)).not.toMatch(/CAMBIOS SIN APROBAR/); expect(estado(doc)).toMatch(/Plan aprobado v1\.0 por Rosa Paredes, Sponsor .*sin cambios desde la aprobación/);
    pestana(doc, "doc"); expect(documento(doc)).toMatch(/Documento aprobado v1\.0.*sin cambios desde la aprobación/); expect(documento(doc)).not.toMatch(/Nuevo interesado/);   // el aprobado los conserva como estaban
  });

  it("«Nueva versión» conserva el documento de la versión anterior (verlo desde el historial) y el borrador nuevo usa lo vigente", async () => {
    const db = await aprobarPlan(conCalidad("Política aprobada por el sponsor"));
    db.projects.p1.modules.quality.policy = "Política MODIFICADA después de aprobar";
    const dom = await abrir(db), doc = dom.window.document;
    (doc.getElementById("btnNewVersion") as HTMLElement).click(); await esperar(50);
    (doc.getElementById("modalConfirmBtn") as HTMLElement).click(); await esperar(1100);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.pmplan;
    expect(saved.status).toBe("borrador"); expect(saved.version).toBe("2.0"); expect(saved.approvedDoc).toBe(""); expect(saved.history).toHaveLength(1); expect(saved.history[0].doc).toMatch(/Política aprobada por el sponsor/);
    pestana(doc, "doc"); expect(documento(doc)).toMatch(/Política MODIFICADA después de aprobar/); expect(documento(doc)).not.toMatch(/Documento APROBADO/);   // el borrador v2.0 refleja lo vigente
    pestana(doc, "state"); (doc.querySelector("[data-histdoc]") as HTMLElement).click();
    expect(documento(doc)).toMatch(/Versión anterior v1\.0/); expect(documento(doc)).toMatch(/Política aprobada por el sponsor/); expect(documento(doc)).not.toMatch(/MODIFICADA/);
  });

  it("Exportar a Word genera un .doc HTML y no toca el proyecto", async () => {
    const dom = await abrir(conLineasBase()), doc = dom.window.document, w = dom.window as any;
    let parts: string[] = [], type = "", name = "";                                          // el Blob de jsdom no se puede leer: se captura lo que recibe
    w.Blob = function (p: string[], o: { type: string }) { parts = p; type = o.type; };
    w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function () { name = this.download; };
    (doc.getElementById("btnWord") as HTMLElement).click();
    expect(name).toBe("plan_para_la_direccion_borrador.doc");                                // aún sin aprobar: el archivo lo dice
    expect(type).toBe("application/msword");
    const txt = parts.join("");
    expect(txt).toMatch(/xmlns:w="urn:schemas-microsoft-com:office:word"/); expect(txt).toMatch(/Plan para la dirección del proyecto/); expect(txt).toMatch(/Terreno nivelado/);
    expect(JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.pmplan).toBeUndefined();
  });
});
