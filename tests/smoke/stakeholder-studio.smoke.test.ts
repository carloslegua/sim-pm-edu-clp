// Smoke test del módulo Stakeholder_Studio.html migrado a build TS
// (Fase 4). Servido por HTTP local (no file://): ver el comentario en
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

describe("Stakeholder_Studio.html (migrado a stakeholder-studio.js)", () => {
  it("standalone (sin proyecto activo): arranca con el ejemplo DISTRIB+ (12 interesados) y renderiza las 3 vistas sin errores", async () => {
    const dom = await JSDOM.fromURL(base + "Stakeholder_Studio.html", { runScripts: "dangerously", resources: "usable" });
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".reg-card").length).toBe(12);
    expect(doc.querySelector(".stat .v")!.textContent).toBe("12");

    (doc.querySelector('[data-view="poderInteres"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelectorAll(".bubble").length).toBe(12);

    (doc.querySelector('[data-view="prominencia"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelectorAll(".bubble").length).toBe(12);
  });

  it("el poder derivado se recalcula en vivo al cambiar un criterio ponderado (5 criterios × pesos por defecto)", async () => {
    const dom = await JSDOM.fromURL(base + "Stakeholder_Studio.html", { runScripts: "dangerously", resources: "usable" });
    const doc = dom.window.document;
    (doc.querySelector('[data-view="registro"]') as HTMLElement).click();
    (doc.querySelector(".reg-header") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));

    expect(doc.querySelector(".q-power")!.textContent).toBe("95"); // Gerencia General: pos5 res5 net5 veto5 expert4, pesos iguales 20%
    const sel = doc.querySelector('.d-pc[data-crit="res"]') as HTMLSelectElement;
    sel.value = "1";
    sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelector(".q-power")!.textContent).toBe("75"); // (5+1+5+5+4)*20/100=4 -> (4-1)/4*100=75
  });

  it("con proyecto activo real sin interesados aún: arranca en blanco (regla de oro) y persiste en GPI.getModule('stakeholders')", async () => {
    const seedDb = {
      version: 1, activeId: "p1",
      projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 }, modules: {} } }
    };
    const dom = await JSDOM.fromURL(base + "Stakeholder_Studio.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    const doc = dom.window.document;
    expect(doc.querySelectorAll(".reg-card").length).toBe(1); // blankAnalysis(), no el ejemplo DISTRIB+

    (doc.getElementById("btnAdd") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.querySelectorAll(".reg-card").length).toBe(2);

    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string);
    const mod = saved.projects.p1.modules.stakeholders;
    expect(mod.stakeholders.length).toBe(2);
  });

  it("SEGURIDAD: un Id. o valor de Legitimidad importado con marcado HTML no puede inyectar código (XSS reportado por el usuario)", async () => {
    // Repro: un .json de interesados manipulado (importado vía Panel de
    // Control, o un proyecto sembrado por otra herramienta) con un Id. o
    // un valor de Legitimidad/Urgencia que contiene marcado HTML. Antes de
    // este fix, esos campos se insertaban SIN escapar en atributos
    // (data-id="${s.id}") y en contenido de texto (${s[key]}) dentro de
    // .innerHTML -- suficiente para romper el atributo/elemento e inyectar
    // HTML/JS arbitrario que corre en el origen del sitio (con acceso de
    // lectura/escritura a TODOS los proyectos de ese localStorage).
    const XSS_ID = 'mal1" onmouseover="window.__xssFired=true" data-x="';
    const XSS_LEGIT = '<img src=x onerror="window.__xssFired=true">';
    const seedDb = {
      version: 1, activeId: "p1",
      projects: {
        p1: {
          schema: "gpi.project/v1",
          meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
          modules: {
            stakeholders: {
              stakeholders: [{
                id: XSS_ID, name: "Interesado malicioso", org: "Org", role: "Rol",
                category: "Interno", power: 50, interest: 50, legitimacy: XSS_LEGIT, urgency: 50,
                powerCriteria: { pos: 3, res: 3, net: 3, veto: 3, expert: 3 },
                interestCriteria: { afect: 3, stake: 3, align: 3, prox: 3, atten: 3 }
              }], idCounter: 2
            }
          }
        }
      }
    };
    const dom = await JSDOM.fromURL(base + "Stakeholder_Studio.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { window.localStorage.setItem("gpi_db", JSON.stringify(seedDb)); }
    });
    const doc = dom.window.document;

    // Desplegar la ficha -- es donde se renderizan el Id. (atributo) y la
    // Legitimidad (texto) crudos.
    (doc.querySelector(".reg-header") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));

    // El marcador nunca se ejecutó: ni por el atributo inyectado
    // (onmouseover) ni por el elemento inyectado en el texto (<img onerror>).
    expect((dom.window as any).__xssFired).toBeUndefined();
    expect(doc.querySelectorAll(".d-val img").length).toBe(0);
    expect(doc.querySelectorAll("img[onerror]").length).toBe(0);

    // El Id. completo sigue siendo el valor ÚNICO del atributo data-id (no
    // se "escapó" del atributo hacia uno nuevo como onmouseover).
    const card = doc.querySelector(".reg-card") as HTMLElement;
    expect(card.getAttribute("data-id")).toBe(XSS_ID);
    expect(card.hasAttribute("onmouseover")).toBe(false);

    // La Legitimidad se ve como texto literal, no como HTML interpretado.
    expect(doc.querySelector(".d-val")!.textContent).toBe(XSS_LEGIT);

    // La vista Matriz Poder-Interés también renderiza el Id. en un atributo
    // (burbuja SVG) -- misma protección ahí.
    (doc.querySelector('[data-view="poderInteres"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    const bubble = doc.querySelector(".bubble") as SVGElement;
    expect(bubble.getAttribute("data-id")).toBe(XSS_ID);
    expect(bubble.hasAttribute("onmouseover")).toBe(false);
    expect((dom.window as any).__xssFired).toBeUndefined();
  });

  // ---- Matriz de compromiso (auditoría metodológica PMI): el Panel la anunciaba y no existía.
  const abrir = async (seed?: unknown) => {
    const dom = await JSDOM.fromURL(base + "Stakeholder_Studio.html", {
      runScripts: "dangerously", resources: "usable",
      beforeParse(window: any) { if (seed) window.localStorage.setItem("gpi_db", JSON.stringify(seed)); }
    });
    return dom;
  };
  const verCompromiso = async (dom: any) => { (dom.window.document.querySelector('[data-view="compromiso"]') as HTMLElement).click(); await new Promise((r) => setTimeout(r, 50)); };
  const proyecto = (stakeholders: unknown[], idCounter = 10) => ({
    version: 1, activeId: "p1",
    projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 }, modules: { stakeholders: { stakeholders, idCounter } } } }
  });
  const fila = (doc: Document, nombre: string) => Array.from(doc.querySelectorAll("tr.eng-r")).find((r) => r.querySelector(".eng-name")!.textContent === nombre) as HTMLElement;
  const sel = (dom: any, el: Element, v: string) => { (el as HTMLSelectElement).value = v; el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); };

  it("la vista «Compromiso» existe y el ejemplo DISTRIB+ trae los 12 interesados evaluados (mismos ids/nombres del caso)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    await verCompromiso(dom);
    expect(doc.querySelectorAll("tr.eng-r").length).toBe(12);
    expect(doc.getElementById("sidebar")!.textContent).toMatch(/12\/12/);
    // marcadores: Gerencia General (actual Partidario 4 → deseado Líder 5); Constructora (4 = 4)
    const g = fila(doc, "Gerencia General DISTRIB+");
    expect(g.querySelector('td[data-lv="4"] .eng-mk.c')!.textContent).toBe("C");
    expect(g.querySelector('td[data-lv="5"] .eng-mk.d')!.textContent).toBe("D");
    expect(g.querySelector(".e-gap")!.textContent).toBe("+1");
    expect(fila(doc, "Constructora principal").querySelector('td[data-lv="4"] .eng-mk.cd')!.textContent).toBe("C=D");
    // el sindicato (poder 65, reticente) es la mayor prioridad y el único «poder alto en riesgo»
    expect(fila(doc, "Sindicato de construcción civil").querySelector(".e-gap")!.textContent).toBe("+2");
    expect(fila(doc, "Sindicato de construcción civil").querySelector(".eng-finds")!.textContent).toMatch(/RIESGO.*Poder alto con postura «Reticente»/);
    expect(doc.querySelector("#sidebar .strat-box .st")!.textContent).toMatch(/MEDIA · 1\.3\s+Sindicato de construcción civil/);
    expect(Array.from(doc.querySelectorAll("#sidebar .stat .l")).map((l) => l.textContent)).toContain("Poder alto en riesgo");
  });

  it("los niveles NUNCA se inicializan: un interesado nuevo queda «Sin evaluar» y no genera brecha ni prioridad", async () => {
    const dom = await abrir(proyecto([])), doc = dom.window.document; // proyecto real sin interesados: arranca en blanco
    await verCompromiso(dom);
    const f = doc.querySelector("tr.eng-r") as HTMLElement;
    expect((f.querySelector(".e-cur") as HTMLSelectElement).value).toBe("");
    expect((f.querySelector(".e-des") as HTMLSelectElement).value).toBe("");
    expect(f.querySelectorAll(".eng-mk").length).toBe(0);
    expect(f.querySelector(".e-gap")!.textContent).toBe("—");
    expect(f.querySelector(".e-prio")!.textContent).toBe("—");
    expect(f.querySelector(".eng-finds")!.textContent).toMatch(/Sin evaluar/);
  });

  it("evaluar actualiza marcadores, brecha, prioridad y hallazgos; la estrategia resuelve el hallazgo EN VIVO; y todo persiste en el proyecto", async () => {
    const dom = await abrir(proyecto([])), doc = dom.window.document, win = dom.window as any;
    await verCompromiso(dom);
    sel(dom, (doc.querySelector(".e-cur") as Element), "2");
    sel(dom, (doc.querySelector(".e-des") as Element), "4");
    let f = doc.querySelector("tr.eng-r") as HTMLElement;
    expect(f.querySelector('td[data-lv="2"] .eng-mk.c')).toBeTruthy();
    expect(f.querySelector('td[data-lv="4"] .eng-mk.d')).toBeTruthy();
    expect(f.querySelector(".e-gap")!.textContent).toBe("+2");
    expect(f.querySelector(".e-prio")!.textContent).toMatch(/MEDIA · 1/);        // poder 50 × brecha 2 / 100 = 1
    expect(f.querySelector(".eng-finds")!.textContent).toMatch(/RIESGO.*brecha de 2 nivel\(es\) y no hay estrategia/);
    expect(f.querySelector(".eng-finds")!.textContent).toMatch(/AVISO.*no tiene un responsable/);

    const ta = f.querySelector("textarea.e-str") as HTMLTextAreaElement;         // el placeholder orienta con la postura actual
    expect(ta.placeholder).toMatch(/Escuchar sus objeciones/);
    ta.value = "Reunión mensual con el comité vecinal"; ta.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    const own = doc.querySelector("input.e-own") as HTMLInputElement;
    own.value = "Residente de Obra"; own.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    f = doc.querySelector("tr.eng-r") as HTMLElement;
    expect(f.querySelector(".eng-finds")!.textContent).not.toMatch(/no hay estrategia/);
    expect(f.querySelector(".eng-finds")!.textContent).not.toMatch(/responsable/);

    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(win.localStorage.getItem("gpi_db") as string).projects.p1.modules.stakeholders.stakeholders[0];
    expect(saved).toMatchObject({ engCurrent: 2, engDesired: 4, engStrategy: "Reunión mensual con el comité vecinal", engOwner: "Residente de Obra" });
    expect(saved.engAssessedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("compatibilidad: un proyecto guardado ANTES de esta vista (sin campos de compromiso) abre igual, «Sin evaluar», sin perder datos", async () => {
    const viejo = { id: "s1", name: "Interesado antiguo", org: "Org", role: "Rol", category: "Interno", power: 50, interest: 50, legitimacy: 50, urgency: 50,
      powerCriteria: { pos: 3, res: 3, net: 3, veto: 3, expert: 3 }, interestCriteria: { afect: 3, stake: 3, align: 3, prox: 3, atten: 3 } };
    const dom = await abrir(proyecto([viejo], 2)), doc = dom.window.document;
    await verCompromiso(dom);
    expect(doc.querySelectorAll("tr.eng-r").length).toBe(1);
    expect(doc.getElementById("sidebar")!.textContent).toMatch(/0\/1/);
    expect(doc.querySelector("tr.eng-r")!.textContent).toMatch(/Interesado antiguo/);
    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const saved = JSON.parse(dom.window.localStorage.getItem("gpi_db") as string).projects.p1.modules.stakeholders.stakeholders[0];
    expect(saved).toMatchObject({ id: "s1", name: "Interesado antiguo", org: "Org", legitimacy: 50 });   // nada se perdió
    expect(saved.engCurrent).toBeUndefined();                                                           // y nada se inventó
  });

  it("valores inválidos importados (0, 9, texto) se leen como «sin evaluar», no rompen la vista", async () => {
    const raro = { id: "s1", name: "Raro", org: "", role: "", category: "Interno", power: 50, interest: 50, legitimacy: 50, urgency: 50, engCurrent: 9, engDesired: "abc",
      powerCriteria: { pos: 3, res: 3, net: 3, veto: 3, expert: 3 }, interestCriteria: { afect: 3, stake: 3, align: 3, prox: 3, atten: 3 } };
    const dom = await abrir(proyecto([raro], 2)), doc = dom.window.document;
    await verCompromiso(dom);
    const f = doc.querySelector("tr.eng-r") as HTMLElement;
    expect((f.querySelector(".e-cur") as HTMLSelectElement).value).toBe("");
    expect(f.querySelectorAll(".eng-mk").length).toBe(0);
  });

  it("SEGURIDAD: estrategia, responsable y nombre importados con marcado HTML no inyectan código en la matriz", async () => {
    const XSS = '"><img src=x onerror="window.__xssFired=true">';
    const mal = { id: "s1", name: XSS, org: "", role: "", category: "Interno", power: "<b onmouseover=1>", interest: 50, legitimacy: 50, urgency: 50,
      engCurrent: 2, engDesired: 4, engStrategy: XSS, engOwner: XSS,
      powerCriteria: { pos: 3, res: 3, net: 3, veto: 3, expert: 3 }, interestCriteria: { afect: 3, stake: 3, align: 3, prox: 3, atten: 3 } };
    const dom = await abrir(proyecto([mal], 2)), doc = dom.window.document;
    await verCompromiso(dom);
    await new Promise((r) => setTimeout(r, 100));
    expect((dom.window as any).__xssFired).toBeUndefined();
    expect(doc.querySelector("tr.eng-r img")).toBeNull();
    expect((doc.querySelector("textarea.e-str") as HTMLTextAreaElement).value).toBe(XSS);   // texto literal
    expect((doc.querySelector("input.e-own") as HTMLInputElement).value).toBe(XSS);
  });

  it("el reporte imprimible incluye la evaluación del compromiso (resumen, brechas y estrategias)", async () => {
    const dom = await abrir(), doc = dom.window.document;
    try { (doc.getElementById("btnReport") as HTMLElement).click(); } catch (_) { /* window.print() no implementado en jsdom */ }
    const rep = doc.getElementById("gpiReport")!.innerHTML;
    expect(rep).toContain("3. Evaluación del compromiso de los interesados");
    expect(rep).toMatch(/Evaluados<\/td><td><b>12\/12<\/b>/);
    expect(rep).toContain("Acuerdo laboral previo al inicio de obra");
    expect(rep).toContain("Reticente");
  });
});
