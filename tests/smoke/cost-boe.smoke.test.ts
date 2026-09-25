// Smoke test de la Basis of Estimate en Cost-management.html (AACE RP 34R-05), servido por HTTP local (no file://).
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import jsdomPkg from "jsdom";
import { SECTIONS } from "../../src/shared/boe";
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
const abrir = async (seed?: unknown, store?: unknown) => {
  const dom = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); if (store) w.localStorage.setItem("gpi_cost_management_plan", JSON.stringify(store)); } });
  await esperar(1200);
  return dom;
};
const txt = (doc: Document, id: string) => (doc.getElementById(id)!.textContent || "").replace(/\s+/g, " ").trim();
const poner = (dom: any, el: Element, v: string, ev = "input") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };
const proyecto = (cost?: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 }, modules: { ...(cost ? { cost } : {}), ...extra } } } });
const exigidas = (doc: Document) => Number((txt(doc, "boeStatus").match(/se exigen (\d+) de/) || [])[1]);
const faltan = (doc: Document) => Array.from(doc.querySelectorAll("#boeStatus [data-goto]")).map((b) => b.getAttribute("data-goto"));

describe("Cost-management.html — Basis of Estimate (34R-05)", () => {
  it("ejemplo DISTRIB+: la BOE sigue el índice de 34R-05 (32 secciones en 8 grupos), está aprobada y completa para la clase 3, sin hallazgos", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(doc.querySelectorAll("#boeForm .boe-sec").length).toBe(SECTIONS.length); expect(SECTIONS.length).toBe(32);
    expect(doc.querySelectorAll("#boeForm details.boe-grp").length).toBe(8);
    expect((doc.getElementById("boeStatusSel") as HTMLSelectElement).value).toBe("aprobada");
    expect((doc.getElementById("boeApprover") as HTMLInputElement).value).toMatch(/Sponsor/); expect((doc.getElementById("boeApprovedOn") as HTMLInputElement).value).toBe("2026-07-03");
    const s = txt(doc, "boeStatus");
    expect(s).toMatch(/Estimado de clase 3/); expect(s).toMatch(/\(100 %\)/); expect(s).toMatch(/Todas las secciones que se exigen para un estimado de clase 3/);
    expect(doc.querySelectorAll("#boeStatus .esc-adv li").length).toBe(0);                          // ni B5 (define la frontera) ni B6 (queda dentro del CAPEX)
    expect((doc.getElementById("boeDate") as HTMLInputElement).value).toBe("2026-07-01");
    expect((doc.getElementById("boeAssum") as HTMLTextAreaElement).value).toMatch(/Diseño al 30 %/);
    expect((doc.getElementById("boe_boundary") as HTMLTextAreaElement).value).toMatch(/NO incluye escalación/);
    expect(doc.querySelectorAll("#boeList-team tbody tr").length).toBe(5);
    expect(doc.querySelectorAll("#boeList-checklist input:checked").length).toBe(8);               // todo salvo la conciliación con proyectos similares
  });

  it("las secciones que vienen del proyecto se citan de su fuente: clase, contingencia, escalación, tipo de cambio, CAPEX", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(txt(doc, "auto-3.1.6")).toMatch(/Clase 3/);
    expect(txt(doc, "auto-3.16")).toMatch(/\$ 852,000/);
    expect(txt(doc, "auto-3.17")).toMatch(/5 % de la línea base = \$ 404,055/);
    expect(txt(doc, "auto-3.5.2")).toMatch(/Escalación: por índices.*\$ 129,108.*tipo de cambio: \$ 0.*contingencia.*excluye ambos/);
    expect(txt(doc, "auto-3.3.2")).toMatch(/Moneda del plan: USD/);
    expect(txt(doc, "auto-3.18")).toMatch(/CAPEX de referencia: \$ 8,500,000.*presupuesto total \$ 8,485,163.*dentro del CAPEX/);
    expect(txt(doc, "auto-3.14")).toMatch(/R-01/);
    expect(txt(doc, "auto-3.6")).toMatch(/273 d.*inicio 2026-07-06/);
  });

  it("proyecto conectado en blanco: la BOE arranca EN BLANCO (regla de oro) y dice qué falta según la clase", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect((doc.getElementById("boeAssum") as HTMLTextAreaElement).value).toBe(""); expect((doc.getElementById("boeExcl") as HTMLTextAreaElement).value).toBe("");
    expect((doc.getElementById("boeProd") as HTMLTextAreaElement).value).toBe(""); expect((doc.getElementById("boeDate") as HTMLInputElement).value).toBe("");
    expect((doc.getElementById("boeStatusSel") as HTMLSelectElement).value).toBe("borrador");
    const f = faltan(doc);
    ["3.1.1", "3.5", "3.11", "3.12"].forEach((id) => expect(f).toContain(id));
    expect(f).not.toContain("3.1.6");                                                                // la clase la respalda el proyecto
    expect(txt(doc, "boeStatus")).toMatch(/Estimado de clase 3/);
    expect(txt(doc, "boeStatus")).toMatch(/criterio didáctico/); expect(txt(doc, "boeStatus")).toMatch(/Containments/);
    expect(txt(doc, "boeStatus")).toMatch(/B8/);
  });

  it("cuanto más madura la clase, más secciones se exigen; completar una sección la saca de la lista EN VIVO", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    const clase = (n: number) => { (doc.querySelector(`#classbar button[data-c="${n}"]`) as HTMLElement).click(); return exigidas(doc); };
    const n5 = clase(5), n4 = clase(4), n3 = clase(3), n2 = clase(2), n1 = clase(1);
    expect([n5, n4, n3, n2, n1].every((x, i, a) => i === 0 || x > a[i - 1])).toBe(true); expect(n1).toBe(SECTIONS.length - 1);   // clase 1: todas salvo la frontera de la escalación (aquí no hay escalación)
    clase(3);
    const antes = faltan(doc).length;
    poner(dom, doc.getElementById("boe_purpose")!, "Sustentar el presupuesto de autorización.");
    expect(faltan(doc)).not.toContain("3.1.1"); expect(faltan(doc).length).toBe(antes - 1);
    expect(txt(doc, "st-3.1.1")).toBe("Completa");
    // el hallazgo lleva a la sección: abre su grupo y enfoca el campo
    (doc.querySelector('#boeStatus [data-goto="3.4"]') as HTMLElement).click();
    expect(doc.querySelector<HTMLDetailsElement>('#boeForm details[data-g="g3"]')!.open).toBe(true);
  });

  it("estado de aprobación: aprobar una BOE incompleta es un riesgo (B1); exige quién y cuándo (B2); en revisión pide revisor", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    const sel = doc.getElementById("boeStatusSel") as HTMLSelectElement;
    poner(dom, sel, "revision", "change");
    expect(txt(doc, "boeStatus")).toMatch(/B2.*sin indicar quién la revisa/);
    poner(dom, sel, "aprobada", "change");
    const t = txt(doc, "boeStatus");
    expect(t).toMatch(/B1.*«Aprobada» pero le faltan \d+ sección/);
    expect((doc.getElementById("boeApprovedOn") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);      // se propone la fecha de hoy
    expect(t).toMatch(/B2.*quién la aprueba/);
    poner(dom, doc.getElementById("boeApprover")!, "Gerencia General");
    expect(txt(doc, "boeStatus")).not.toMatch(/B2/);
    expect(doc.querySelector("#boeStatus .esc-adv li.riesgo")).toBeTruthy();
  });

  it("equipo, documentos de referencia y anexo A: se agregan, quitan y marcan; cuentan para la completitud", async () => {
    const dom = await abrir(proyecto()), doc = dom.window.document;
    expect(faltan(doc)).toEqual(expect.arrayContaining(["3.21", "3.22.B"]));
    (doc.querySelector('#boeList-team button.btn.sm[onclick*="boeListAdd"]') as HTMLElement).click();
    poner(dom, doc.querySelector('#boeList-team input[data-f="name"]')!, "Ana (estimadora)");
    expect(faltan(doc)).not.toContain("3.21");
    (doc.querySelector('#boeList-refs button.btn.sm[onclick*="boeListAdd"]') as HTMLElement).click();
    poner(dom, doc.querySelector('#boeList-refs input[data-f="title"]')!, "Acta de Constitución");
    expect(faltan(doc)).not.toContain("3.22.B");
    const chk = doc.querySelector('#boeList-checklist input[data-id="boe"]') as HTMLInputElement; chk.checked = true; chk.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(faltan(doc)).not.toContain("3.22.A");
    (doc.querySelector('#boeList-team button[onclick*="boeListDel"]') as HTMLElement).click();
    expect(doc.querySelectorAll("#boeList-team tbody tr").length).toBe(0); expect(faltan(doc)).toContain("3.21");
  });

  it("se guarda con los campos de siempre (date, source, assumptions, exclusions, productivity) y sobrevive a recargar", async () => {
    const dom = await abrir(), doc = dom.window.document;
    for (const ev of ["input", "change"]) { poner(dom, doc.getElementById("boe_purpose")!, "Propósito modificado", ev); poner(dom, doc.getElementById("boeVersion")!, "1.1", ev); }
    await esperar(60);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_cost_management_plan")!), b = saved.estimate.boe;
    expect(b).toMatchObject({ date: "2026-07-01", purpose: "Propósito modificado", version: "1.1", status: "aprobada" });
    ["source", "assumptions", "exclusions", "productivity"].forEach((k) => expect(typeof b[k]).toBe("string"));
    expect(b.team).toHaveLength(5); expect(b.checklist.find((c: any) => c.id === "reconc").done).toBe(false);
    const dom2 = await abrir(undefined, saved), d2 = dom2.window.document;
    expect((d2.getElementById("boe_purpose") as HTMLTextAreaElement).value).toBe("Propósito modificado"); expect((d2.getElementById("boeVersion") as HTMLInputElement).value).toBe("1.1");
  });

  it("proyecto guardado antes (solo los cinco campos de siempre): abre sin error, conserva lo escrito y el resto queda vacío en borrador", async () => {
    const seed = proyecto({ meta: { module: "cost_management_plan", version: 2 }, plan: { currency: "USD" }, estimate: { class: 3, boe: { date: "2026-01-05", source: "Cotizaciones 2025", assumptions: "Supuesto A", exclusions: "Exclusión B", productivity: "Factor 1,15" } }, budget: { baseCost: 1000000, contingency: { method: "manual", manualPct: 10, percentile: "P70" }, mgmtReservePct: 5, escalation: { inflation: 4, years: 1, fxShare: 0, fxMode: "frozen", fxBand: 8 } }, changeOrders: [] });
    const dom = await abrir(seed), doc = dom.window.document;
    expect((doc.getElementById("boeDate") as HTMLInputElement).value).toBe("2026-01-05"); expect((doc.getElementById("boeSource") as HTMLInputElement).value).toBe("Cotizaciones 2025");
    expect((doc.getElementById("boeAssum") as HTMLTextAreaElement).value).toBe("Supuesto A"); expect((doc.getElementById("boeProd") as HTMLTextAreaElement).value).toBe("Factor 1,15");
    expect((doc.getElementById("boe_purpose") as HTMLTextAreaElement).value).toBe(""); expect((doc.getElementById("boeStatusSel") as HTMLSelectElement).value).toBe("borrador");
    expect(faltan(doc)).not.toContain("3.5"); expect(faltan(doc)).not.toContain("3.11");             // lo escrito antes cuenta
    expect(txt(doc, "kEsc")).toBe("$ 40,000");                                                        // y la escalación simple no cambió
  });

  it("58R-10: con escalación en el presupuesto la BOE debe definir la frontera con contingencia y tipo de cambio (B5)", async () => {
    const seed = proyecto({ meta: { module: "cost_management_plan", version: 2 }, plan: { currency: "USD" }, estimate: { class: 3, boe: { date: "2026-07-01" } },
      budget: { baseCost: 1000000, contingency: { method: "manual", manualPct: 10, percentile: "P70" }, mgmtReservePct: 5, escalation: { inflation: 4, years: 1, fxShare: 0, fxMode: "frozen", fxBand: 8 } }, changeOrders: [] });
    const dom = await abrir(seed), doc = dom.window.document;
    expect(txt(doc, "boeStatus")).toMatch(/B5.*sección 3\.5\.2/); expect(faltan(doc)).toContain("3.5.2");
    poner(dom, doc.getElementById("boe_boundary")!, "Escalación = índices de mercado; contingencia = riesgos del proyecto; tipo de cambio aparte.");
    expect(txt(doc, "boeStatus")).not.toMatch(/B5/); expect(faltan(doc)).not.toContain("3.5.2");
  });

  it("la BOE es la base del control de cambios: con línea base en borrador (B3) o aprobada ANTES de la última línea base (B4) se avisa", async () => {
    const cost = (boe: Record<string, unknown>) => ({ meta: { module: "cost_management_plan", version: 2 }, plan: { currency: "USD" }, estimate: { class: 5, boe },
      budget: { baseCost: 1000000, contingency: { method: "manual", manualPct: 10, percentile: "P70" }, mgmtReservePct: 5, escalation: { inflation: 0, years: 0, fxShare: 0, fxMode: "frozen", fxBand: 8 } }, changeOrders: [],
      baselineLog: [{ version: "LB-1", date: "2026-08-10", orderIds: ["OC-003"], bacBefore: 1100000, bacAfter: 1190000, approver: "CCB" }] });
    const dom = await abrir(proyecto(cost({ status: "borrador", date: "2026-07-01" }))), doc = dom.window.document;
    expect(txt(doc, "boeStatus")).toMatch(/B3.*línea base de costos \(LB-1\).*borrador/);
    const completa: Record<string, unknown> = { status: "aprobada", approvedBy: "Sponsor", approvedOn: "2026-07-03", preparedBy: "Ana", date: "2026-07-01", source: "S", purpose: "P", scope: "A", assumptions: "S", exclusions: "E", currencyNote: "USD" };
    const dom2 = await abrir(proyecto(cost(completa))), d2 = dom2.window.document;
    expect(txt(d2, "boeStatus")).toMatch(/B4.*2026-07-03.*LB-1.*2026-08-10/);
  });

  it("el documento (pestaña 05) trae la BOE en el orden de 34R-05, con lo que viene del proyecto y el anexo A", async () => {
    const dom = await abrir(), doc = dom.window.document;
    (doc.querySelector('.tab[data-p="p5"]') as HTMLElement).click();
    const d = txt(doc, "doc");
    expect(d).toMatch(/Basis of Estimate \(AACE RP 34R-05\)/); expect(d).toMatch(/1\.0 · Aprobada/); expect(d).toMatch(/3\.1\.1 Propósito/); expect(d).toMatch(/3\.22\.A Anexo A/);
    expect(d).toMatch(/3\.5\.2 Frontera entre escalación, contingencia, asignaciones y tipo de cambio/); expect(d).toMatch(/☑ Basis of Estimate \(este documento\)/); expect(d).toMatch(/☐ Conciliación y comparación con proyectos similares/);
    expect(d).toMatch(/Nivel de detalle.*clase 3.*100 %/);
    expect(d.indexOf("3.1.1 Propósito")).toBeLessThan(d.indexOf("3.11 Supuestos")); expect(d.indexOf("3.11 Supuestos")).toBeLessThan(d.indexOf("3.21 Equipo estimador"));
  });
});
