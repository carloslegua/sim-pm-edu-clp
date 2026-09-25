// Smoke test de la escalación por índices en Cost-management.html (AACE RP 58R-10 / 68R-11), servido por HTTP local (no file://).
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
const abrir = async (seed?: unknown, store?: unknown) => {
  const dom = await JSDOM.fromURL(base + "Cost-management.html", { runScripts: "dangerously", resources: "usable", beforeParse(w: any) { if (seed) w.localStorage.setItem("gpi_db", JSON.stringify(seed)); if (store) w.localStorage.setItem("gpi_cost_management_plan", JSON.stringify(store)); } });
  await esperar(1200);
  return dom;
};
const txt = (doc: Document, id: string) => (doc.getElementById(id)!.textContent || "").replace(/\s+/g, " ").trim();
const dinero = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));
const poner = (dom: any, el: Element, v: string, ev = "change") => { (el as HTMLInputElement).value = v; el.dispatchEvent(new dom.window.Event(ev, { bubbles: true })); };
const campo = (doc: Document, sel: string) => doc.querySelector(sel) as HTMLInputElement | HTMLSelectElement;
const tasa = (doc: Document, acc: string, y: string) => campo(doc, `[data-e="rate"][data-acc="${acc}"][data-year="${y}"]`);
const aviso = (doc: Document, code: string) => Array.from(doc.querySelectorAll("#escResults .esc-adv li")).find((l) => l.textContent!.includes(code));

describe("Cost-management.html — escalación por índices (58R-10 / 68R-11)", () => {
  it("ejemplo DISTRIB+: por índices, cuentas y años; escalación financiada P70 = 129,108 y el BAC la suma", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect((doc.getElementById("escMethod") as HTMLSelectElement).value).toBe("indices");
    expect(doc.getElementById("escCard")!.style.display).toBe("block"); expect(doc.getElementById("escSimpleWrap")!.style.display).toBe("none");
    expect(txt(doc, "kEsc")).toBe("$ 129,108"); expect(txt(doc, "kFx")).toBe("$ 0"); expect(txt(doc, "kBAC")).toBe("$ 8,081,108");
    expect(txt(doc, "kEscCap")).toBe("P70 de la simulación");
    const r = txt(doc, "escResults");
    expect(r).toMatch(/Escalación central\$ 92,388/); expect(r).toMatch(/Financiada\$ 129,108/);
    expect(r).toMatch(/P50\$ 116,648/); expect(r).toMatch(/P80\$ 136,949/); expect(r).toMatch(/P90\$ 148,351/);
    // por cuenta (del costo base): Σ = 82,489; de la contingencia (852,000) salen 9,899 al central
    ["Mano de obra", "Materiales", "Equipos", "Subcontratos"].forEach((c) => expect(r).toContain(c));
    expect(r).toMatch(/Mano de obra\$ 2,158,750\$ 32,851/); expect(r).toMatch(/Materiales\$ 2,721,750\$ 18,321/);
    expect(r).toMatch(/2026\$ 3,955,385\$ 22,319/); expect(r).toMatch(/2027\$ 3,144,615\$ 60,170/);
    expect(r).toMatch(/\$ 13,833 corresponde a la contingencia/);
    expect(Number((r.match(/El pronóstico central equivale al P(\d+)/) || [])[1])).toBeLessThan(20);                                   // el retraso del cronograma hace probable escalar más que el central
    expect(r).toMatch(/con el retraso del cronograma del análisis integrado de riesgo/);
    expect(doc.querySelectorAll('#escResults svg.rng-svg').length).toBe(1);
    expect(doc.querySelectorAll('#escInputs input[data-e="rate"]').length).toBe(12);            // 4 cuentas × 3 años (2026–2028)
    expect(txt(doc, "escInputs")).toMatch(/Fecha base de precios: 2026-07-01/);
  });

  it("segrega la contingencia y el tipo de cambio: 58R-10 pide estimarlos por separado; el riesgo de precio del registro se señala (X14)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    expect(txt(doc, "kEsc")).not.toBe(txt(doc, "kFx"));
    expect(aviso(doc, "X14")!.textContent).toMatch(/precio del acero/);
    // régimen flotante: el tipo de cambio es su propia línea y la escalación no cambia
    poner(dom, doc.getElementById("fxMode")!, "float");
    expect(txt(doc, "kEsc")).toBe("$ 129,108"); expect(txt(doc, "kFx")).toBe("$ 170,400");         // 7,100,000 × 30 % × 8 %
    expect(dinero(txt(doc, "kBAC"))).toBe(7100000 + 852000 + Math.round(dinero(txt(doc, "kEsc"))) + 170400);
  });

  it("método simple (proyectos antiguos): una tasa y un punto de gasto = la fórmula de siempre, con aviso para estimados maduros", async () => {
    const dom = await abrir(), doc = dom.window.document;
    poner(dom, doc.getElementById("escMethod")!, "simple");
    expect(doc.getElementById("escCard")!.style.display).toBe("none"); expect(doc.getElementById("escSimpleWrap")!.style.display).toBe("block");
    expect(txt(doc, "kEsc")).toBe("$ 123,181");                                                       // 7,100,000 × (1,035^0,5 − 1)
    expect(txt(doc, "kBAC")).toBe("$ 8,075,181");                                                     // el BAC de antes de la escalación por índices
    expect(txt(doc, "escSummary")).toMatch(/UNA tasa y UN punto de gasto.*clase 3/);                                                    // clase 3: una tasa y un punto de gasto no alcanzan
    poner(dom, doc.getElementById("inflRate")!, "5");
    expect(dinero(txt(doc, "kEsc"))).toBe(Math.round(7100000 * (Math.pow(1.05, 0.5) - 1)));
  });

  it("editar una tasa recalcula EN VIVO sin volver a pintar las entradas (no se pierde el foco)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    const el = tasa(doc, "labor", "2027"), antes = dinero(txt(doc, "kEsc"));
    poner(dom, el, "9");
    expect(tasa(doc, "labor", "2027")).toBe(el);                                                      // el mismo nodo: las entradas no se reconstruyen
    expect(dinero(txt(doc, "kEsc"))).toBeGreaterThan(antes);
    poner(dom, el, "");                                                                               // celda vacía: se mantiene la tasa del año anterior (no rompe)
    expect(dinero(txt(doc, "kEsc"))).toBeGreaterThan(0);
  });

  it("qué escalación se financia: central o un percentil de la simulación; escalar la contingencia se puede apagar", async () => {
    const dom = await abrir(), doc = dom.window.document, prov = campo(doc, '[data-e="prov"]');
    poner(dom, prov, "central"); expect(txt(doc, "kEsc")).toBe("$ 92,388"); expect(txt(doc, "kEscCap")).toBe("pronóstico central");
    poner(dom, campo(doc, '[data-e="prov"]'), "p90"); expect(txt(doc, "kEsc")).toBe("$ 148,351");
    poner(dom, campo(doc, '[data-e="prov"]'), "central");
    const on = campo(doc, '[data-e="onCont"]') as HTMLInputElement;
    on.checked = false; on.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(txt(doc, "kEsc")).toBe("$ 82,489");                                                       // solo el costo base
    expect(aviso(doc, "X12")).toBeTruthy();
    expect(txt(doc, "escResults")).not.toMatch(/corresponde a la contingencia/);
  });

  it("precio fijado por contrato: quitar la fecha de fijación de un paquete sube su escalación; una nueva la baja a 0 si es la fecha base", async () => {
    const dom = await abrir(), doc = dom.window.document;
    poner(dom, campo(doc, '[data-e="prov"]'), "central");
    const antes = dinero(txt(doc, "kEsc"));
    const lock31 = campo(doc, '[data-e="lock"][data-pid="w-3.1"]');
    expect(lock31.value).toBe("2026-09-15");
    poner(dom, lock31, "");                                                                           // sin fijar: escala hasta su gasto real (oct-2026)
    expect(dinero(txt(doc, "kEsc"))).toBeGreaterThan(antes);
    poner(dom, campo(doc, '[data-e="lock"][data-pid="w-3.1"]'), "2026-07-01");                        // fijado en la fecha base: sin escalación
    expect(dinero(txt(doc, "kEsc"))).toBeLessThan(antes);
  });

  it("se guarda y se recupera: método, cuentas, tasas, composición, fijaciones y el resumen de resultados", async () => {
    const dom = await abrir(), doc = dom.window.document;
    poner(dom, tasa(doc, "material", "2027"), "5.5");
    await esperar(50);
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_cost_management_plan")!);
    const e = saved.budget.escalation;
    expect(e).toMatchObject({ method: "indices", provision: "p70", onContingency: true, inflation: 3.5, years: 0.5 });
    expect(e.accounts.find((a: any) => a.id === "material").rates["2027"]).toBe(5.5);
    expect(e.packages["w-3.1"]).toMatchObject({ lock: "2026-09-15", mix: { material: 80, labor: 20 } });
    expect(e.results).toMatchObject({ provision: "p70" }); expect(e.results.financed).toBeGreaterThan(0); expect(e.results.p90).toBeGreaterThan(e.results.p50);
    expect(saved.estimate.boe.date).toBe("2026-07-01");
    const financiada = txt(doc, "kEsc");
    const dom2 = await abrir(undefined, saved);
    expect(txt(dom2.window.document, "kEsc")).toBe(financiada);
    expect(tasa(dom2.window.document, "material", "2027").value).toBe("5.5");
  });

  it("proyecto guardado antes (sin método): se lee como simple y su escalación no cambia", async () => {
    const seed = { version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Antiguo", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 }, modules: { cost: {
      meta: { module: "cost_management_plan", version: 2 }, plan: { currency: "USD" }, estimate: { class: 3, boe: { date: "2026-01-01" } },
      budget: { baseCost: 1000000, contingency: { method: "manual", manualPct: 10, percentile: "P70" }, mgmtReservePct: 5, escalation: { inflation: 4, years: 1, fxShare: 0, fxMode: "frozen", fxBand: 8 } }, changeOrders: []
    } } } } };
    const dom = await abrir(seed), doc = dom.window.document;
    expect((doc.getElementById("escMethod") as HTMLSelectElement).value).toBe("simple");
    expect(txt(doc, "kEsc")).toBe("$ 40,000");                                                        // 1.000.000 × 4 % a 1 año
    expect(txt(doc, "kBAC")).toBe("$ 1,140,000");
  });

  it("proyecto conectado en blanco: arranca por índices SIN datos de ejemplo; sin fecha base ni pronóstico no calcula y dice qué falta", async () => {
    const seed = { version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Nuevo", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1 }, modules: {} } } };
    const dom = await abrir(seed), doc = dom.window.document;
    expect((doc.getElementById("escMethod") as HTMLSelectElement).value).toBe("indices");
    expect(txt(doc, "kEsc")).toBe("$ 0");
    expect(txt(doc, "escSummary")).toMatch(/Sin escalación todavía/); expect(txt(doc, "escSummary")).toMatch(/X1|fecha base de precios/);
    expect(txt(doc, "escInputs")).not.toMatch(/ILUSTRATIV/);                                          // nada del caso DISTRIB+ precargado
    expect(doc.querySelectorAll('#escInputs input[data-e="rate"][value]').length).toBe(0);
    expect(dinero(txt(doc, "kBase"))).toBe(0);
  });

  it("proyecto conectado con su propia red: la escalación sale del costo y las fechas REALES del cronograma (analítico)", async () => {
    // a1 (10 d: 2026-07-06 → 07-17) → a2 (5 d: 07-20 → 07-24); paquetes de 1.000 c/u (Estimar los Costos); precios al 2026-07-01; mano de obra 4 % anual.
    const seed = { version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Live", course: "GPI", currency: "USD", createdAt: 1, updatedAt: 1, startDate: "2026-07-06" }, modules: {
      wbs: { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2"] }, w1: { id: "w1", name: "Excavación", children: [] }, w2: { id: "w2", name: "Relleno", children: [] } } },
      activities: { idCounter: 3, byLeaf: { w1: [{ id: "a1", name: "Excavar", unit: "m", qty: 10, perf: 1, teams: 1 }], w2: [{ id: "a2", name: "Rellenar", unit: "m", qty: 5, perf: 1, teams: 1 }] } },
      costEstimate: { byActivity: { a1: 100, a2: 200 } },
      schedule: { linkCounter: 2, import: null, baseline: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }] },
      cost: { meta: { module: "cost_management_plan", version: 2 }, plan: { currency: "USD" }, estimate: { class: 3, boe: { date: "2026-07-01" } },
        budget: { baseCost: 2000, contingency: { method: "manual", manualPct: 0, percentile: "P70" }, mgmtReservePct: 0,
          escalation: { method: "indices", accounts: [{ id: "labor", rates: { "2026": 4 }, source: "Prueba" }], defaultMix: { labor: 100 }, provision: "central", onContingency: true, correlation: 0.5, inflation: 0, years: 0, fxShare: 0, fxMode: "frozen", fxBand: 0 } }, changeOrders: [] }
    } } } };
    const dom = await abrir(seed), doc = dom.window.document;
    const esperado = 1000 * (Math.pow(1.04, 10.5 / 365) - 1) + 1000 * (Math.pow(1.04, 21 / 365) - 1);      // gasto medio de a1 el día 10,5 y de a2 el día 21 desde la fecha base
    expect(dinero(txt(doc, "kEsc"))).toBe(Math.round(esperado));
    expect(txt(doc, "escResults")).toMatch(/Excavación/);
    expect(txt(doc, "escInputs")).toMatch(/2 paquete\(s\)/);
  });
});
