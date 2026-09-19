/* ============================================================
   GPI · Recopilar Requisitos — vanilla JS module
   Port mecánico del <script> inline de Recopilar_Requisitos.html (Fase 4
   de MIGRATION.md): misma lógica, mismo comportamiento. Se agregan tipos
   y se compila a requirements.js (IIFE) para que el HTML lo cargue como
   <script src="requirements.js"> en vez de tenerlo inline.

   Igual que Cost-management.html: el HTML usa atributos onclick/onchange
   INLINE (varios generados dinámicamente en filas/tarjetas) para 13
   funciones. Se exponen explícitamente en window al final de este
   archivo -- ver el comentario detallado en src/modules/cost/main.ts.
   También referencia GPI como identificador global bare (sin window.).

   DELIBERADAMENTE NO se usa GPI.ui.esc (modo suelto sin gpi-core.js).
   ============================================================ */
import type * as GpiCore from "../../core/gpi-core";
import type { CharterModule, RequirementItem, RequirementsModule, Stakeholder, WbsModule } from "../../core/types";

type GpiApi = typeof GpiCore.GPI;
declare global {
  var GPI: GpiApi | undefined;
}

/* ===================== Vocabularios ===================== */
type Vocab = Array<[string, string]>;
const TYPES: Vocab = [
  ["negocio", "De negocio"], ["interesado", "De interesado"],
  ["funcional", "Funcional (solución)"], ["nofuncional", "No funcional (solución)"],
  ["transicion", "De transición"], ["calidad", "De calidad"]
];
const PRIOS: Vocab = [["must", "Imprescindible (Must)"], ["should", "Importante (Should)"], ["could", "Deseable (Could)"], ["wont", "Excluido (Won't)"]];
const METHODS: Vocab = [["", "—"], ["inspeccion", "Inspección"], ["prueba", "Prueba"], ["demostracion", "Demostración"], ["analisis", "Análisis"]];
const VSTATES: Vocab = [["pendiente", "Pendiente"], ["verificado", "Verificado"], ["fallido", "Fallido"]];
const STATUS: Vocab = [["propuesto", "Propuesto"], ["aprobado", "Aprobado"], ["enDiseno", "En diseño"], ["implementado", "Implementado"], ["verificado", "Verificado"], ["diferido", "Diferido"], ["cancelado", "Cancelado"]];
const MODSTATUS: Vocab = [["propuesto", "Propuesta"], ["enEvaluacion", "En evaluación"], ["aprobado", "Aprobada"], ["rechazado", "Rechazada"], ["implementado", "Implementada"]];
function lab(list: Vocab, k: string | undefined): string { for (let i = 0; i < list.length; i++) { if (list[i][0] === k) return list[i][1]; } return k || "—"; }

/* ===================== Estado ===================== */
const STORE_KEY = "gpi_requirements";

interface ReqUi {
  id: string; code: string; text: string; type: string; priority: string;
  sourceRanIds: string[]; stakeholderId: string; _stkHint: string;
  wbsNodeIds: string[]; _wbsMatch: string[] | null;
  acceptanceCriteria: string; verificationMethod: string; verificationStatus: string;
  status: string; normativeBasis: string; origin: string; changeId: string | null; notes: string;
}
interface ModImpact { scope: string; schedule: string; cost: string; wbs: string; }
interface ModUi {
  id: string; code: string; date: string; requestedBy: string; approver: string;
  status: string; summary: string; justification: string; impact: ModImpact; ccrRef: string;
}
interface Baseline { frozen: boolean; version: string; date: string; approver: string; snapshot: ReqUi[]; }
interface ReqState {
  baseline: Baseline; items: ReqUi[]; changes: ModUi[];
  activeChangeId: string | null; idCounter: number; changeCounter: number;
}

let state: ReqState = { baseline: { frozen: false, version: "1.0", date: "", approver: "", snapshot: [] }, items: [], changes: [], activeChangeId: null, idCounter: 1, changeCounter: 1 };
let userEdited = false;
// Id. del proyecto activo cuando esta pestaña cargó sus datos -- se
// compara contra GPI.activeId() antes de cada guardado (ver save()) para
// nunca escribir estos requisitos sobre un proyecto distinto que se haya
// activado desde otra pestaña mientras esta seguía abierta (bug real
// reportado por el usuario, confirmado sistémico en los 13 módulos de
// herramienta).
let loadedProjectId: string | null = null;
let projectStale = false;
function markProjectStale(): void {
  if (projectStale) return;
  projectStale = true;
  const t = $("saveTxt"), d = $("saveDot");
  if (t) t.textContent = "⚠ El proyecto activo cambió en otra pestaña: no se puede guardar aquí";
  if (d) d.style.background = "#dc3546";
}

function $(id: string): HTMLElement { return document.getElementById(id) as HTMLElement; }
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
// Bug real reportado por el usuario: un id de requisito/modificación
// importado desde un .json se interpolaba SIN escapar dentro de un
// manejador onclick/onchange inline (ver renderList()/renderChanges()
// más abajo) -- un id manipulado con una comilla doble rompía el
// atributo HTML e inyectaba marcado que se ejecuta con solo abrir el
// módulo, sin ningún clic. Mismo tipo de vulnerabilidad ya corregida en
// Stakeholder Studio (ahí basta con escapar para HTML, porque el id
// vive en un atributo data-* plano); acá hace falta una capa MÁS,
// porque el id vive DENTRO de un literal de cadena JS ('...') que a su
// vez vive dentro del atributo HTML onclick="..." -- escapar solo para
// HTML no alcanza: el navegador decodifica las entidades del atributo
// ANTES de compilar el manejador como JS, así que un id con una comilla
// simple seguiría pudiendo cerrar el literal de cadena y ejecutar JS
// arbitrario AL HACER CLIC aunque se hubiera escapado solo para HTML.
// Defensa en dos capas:
// 1) isSafeId(): todo id que entra por normalizeItem()/normalizeMod()
//    -- de un .json importado o de datos ya guardados -- se valida
//    contra un patrón seguro y se regenera si no lo cumple, así un id
//    malicioso nunca llega a guardarse ni a renderizarse.
// 2) escJsAttr(): cada sitio que igual interpola un id dentro de un
//    onclick/onchange inline lo escapa PRIMERO para el literal de
//    cadena JS (comilla simple, backslash) y RECIÉN DESPUÉS para el
//    atributo HTML (comilla doble, &, <, >) -- defensa en profundidad,
//    por si algún id llegara a state sin pasar por normalizeItem/
//    normalizeMod.
function isSafeId(v: unknown): v is string { return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v); }
function escJsAttr(s: unknown): string {
  const jsSafe = String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return esc(jsSafe);
}
function reqCode(n: number): string { return "REQ." + (n < 100 ? ("00" + n).slice(-3) : String(n)); }
function modCode(n: number): string { return "MOD." + (n < 10 ? "0" + n : String(n)); }
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function repDate(s: string | undefined): string { if (!s) return "—"; const p = String(s).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s; }

/* ===================== Puente GPI ===================== */
function gpiOn(): boolean { try { return typeof GPI !== "undefined" && !!GPI && GPI.available() && !!GPI.active(); } catch (e) { return false; } }
function util(): GpiApi["util"] | null { return (typeof GPI !== "undefined" && GPI && GPI.util) ? GPI.util : null; }

/* Lecturas del ecosistema (Acta, Interesados, EDT) */
function getRans(): GpiCore.CharterRan[] {
  const u = util(); if (u && gpiOn()) return u.charterRans((GPI as GpiApi).getModule("charter") || {});
  if (u && DEMO.charter) return u.charterRans(DEMO.charter);
  return [];
}
function getStakeholders(): Array<{ id: string; name: string; org: string; category: string }> {
  const sh = gpiOn() ? ((GPI as GpiApi).getModule("stakeholders") || {}).stakeholders : (DEMO.stakeholders || []);
  return (sh || []).map((s) => ({ id: s.id, name: s.name || "", org: s.org || "", category: s.category || "" }));
}
function stakeholderById(id: string | null | undefined): { id: string; name: string; org: string; category: string } | null {
  if (!id) return null;
  const all = getStakeholders(); for (let i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; } return null;
}
function getWbs(): WbsModule | null { return gpiOn() ? ((GPI as GpiApi).getModule("wbs") || null) : (DEMO.wbs || null); }
function getLeaves(): GpiCore.WbsLeafRow[] { const u = util(); const w = getWbs(); return (u && w) ? u.wbsLeaves(w) : []; }
function wbsNodeLabel(id: string): { id: string; code: string; name: string; leaf: boolean } | null {
  const u = util(), w = getWbs(); if (!u || !w || !w.nodes || !w.nodes[id]) return null;
  const codes = u.wbsCodes(w); return { id, code: codes[id] || "", name: (w.nodes[id].name || ""), leaf: !(w.nodes[id].children && w.nodes[id].children!.length) };
}
function validNodeIds(): Record<string, boolean> { const w = getWbs(), set: Record<string, boolean> = {}; if (w && w.nodes) Object.keys(w.nodes).forEach((k) => { set[k] = true; }); return set; }

/* ===================== Guardado ===================== */
["input", "change", "click"].forEach((ev) => document.addEventListener(ev, (e) => { if (e.isTrusted) userEdited = true; }, true));
function collect(): RequirementsModule {
  return {
    baseline: state.baseline as unknown as RequirementsModule["baseline"],
    items: state.items as unknown as RequirementItem[],
    changes: state.changes as unknown as Array<Record<string, unknown>>,
    idCounter: state.idCounter, changeCounter: state.changeCounter
  } as unknown as RequirementsModule;
}
function save(): void {
  if (gpiOn() && !(GPI as GpiApi).getModule("requirements") && !userEdited && !state.items.length) { return; }
  if (gpiOn() && loadedProjectId != null && (GPI as GpiApi).activeId() !== loadedProjectId) { markProjectStale(); return; }
  let synced = false;
  if (gpiOn()) {
    try { (GPI as GpiApi).setModule("requirements", collect(), loadedProjectId); synced = true; $("saveTxt").textContent = "Sincronizado con el Panel"; } catch (e) { /* noop */ }
  }
  if (!synced) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(collect()));
      $("saveTxt").textContent = "Guardado " + new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { $("saveTxt").textContent = "Sin persistencia"; $("saveDot").style.background = "#dc3546"; }
  }
}
function flash(): void { $("saveDot").style.background = "#6c5ce7"; setTimeout(() => { $("saveDot").style.background = "#12a56a"; }, 400); }
function touch(): void { userEdited = true; save(); flash(); renderAll(); }

function applyData(d: any): void {
  if (!d) return;
  state.baseline = Object.assign({ frozen: false, version: "1.0", date: "", approver: "", snapshot: [] }, d.baseline || {});
  state.items = Array.isArray(d.items) ? d.items.map(normalizeItem) : [];
  state.changes = Array.isArray(d.changes) ? d.changes.map(normalizeMod) : [];
  state.activeChangeId = d.activeChangeId || null;
  state.idCounter = Number(d.idCounter) || (state.items.length + 1);
  state.changeCounter = Number(d.changeCounter) || (state.changes.length + 1);
}
function normalizeItem(it: any): ReqUi {
  it = it || {};
  return {
    id: isSafeId(it.id) ? it.id : ("q" + (state.idCounter++)), code: it.code || reqCode(state.items ? state.items.length + 1 : 1),
    text: it.text || "", type: it.type || "funcional", priority: it.priority || "should",
    sourceRanIds: Array.isArray(it.sourceRanIds) ? it.sourceRanIds : [],
    stakeholderId: it.stakeholderId || "", _stkHint: it._stkHint || "",
    wbsNodeIds: Array.isArray(it.wbsNodeIds) ? it.wbsNodeIds : [], _wbsMatch: it._wbsMatch || null,
    acceptanceCriteria: it.acceptanceCriteria || "", verificationMethod: it.verificationMethod || "",
    verificationStatus: it.verificationStatus || "pendiente", status: it.status || "propuesto",
    normativeBasis: it.normativeBasis || "", origin: it.origin || "baseline", changeId: it.changeId || null,
    notes: it.notes || ""
  };
}
function normalizeMod(m: any): ModUi {
  m = m || {};
  return {
    id: isSafeId(m.id) ? m.id : ("m" + (state.changeCounter++)), code: m.code || modCode(state.changes ? state.changes.length + 1 : 1),
    date: m.date || todayISO(), requestedBy: m.requestedBy || "", approver: m.approver || "",
    status: m.status || "propuesto", summary: m.summary || "", justification: m.justification || "",
    impact: Object.assign({ scope: "", schedule: "", cost: "", wbs: "" }, m.impact || {}), ccrRef: m.ccrRef || ""
  };
}

/* ===================== Demo autocontenida (modo suelto) ===================== */
const DEMO: { charter: CharterModule; stakeholders: Stakeholder[]; wbs: WbsModule } = {
  charter: {
    requirements: [
      { id: "ran1", code: "RAN.01", text: "Nave de almacenamiento con altura libre y capacidad de racks conforme a la ingeniería de detalle aprobada." },
      { id: "ran2", code: "RAN.02", text: "Cumplimiento del Reglamento Nacional de Edificaciones y de la normativa de seguridad (INDECI)." },
      { id: "ran3", code: "RAN.03", text: "Instalaciones eléctricas y sanitarias dimensionadas para la operación logística proyectada." },
      { id: "ran4", code: "RAN.04", text: "Patio de maniobras apto para vehículos de carga pesada." }
    ]
  },
  stakeholders: [
    { id: "s1", name: "Gerencia General DISTRIB+", org: "DISTRIB+ S.A.", category: "Interno" },
    { id: "s4", name: "Municipalidad de Lurín", org: "Gobierno Local", category: "Regulador" },
    { id: "s6", name: "SUNAFIL", org: "Estado", category: "Regulador" },
    { id: "s9", name: "Futuros operarios del almacén", org: "DISTRIB+ S.A.", category: "Interno" },
    { id: "s10", name: "Clientes / distribuidores", org: "Cartera comercial", category: "Cliente" }
  ],
  wbs: (function () {
    const n = {
      root: { id: "root", name: "Almacén DISTRIB+ (demo)", children: ["f1", "f2", "f3"] },
      f1: { id: "f1", name: "Obra civil", children: ["l1", "l2", "l3"] },
      f2: { id: "f2", name: "Instalaciones", children: ["l4"] },
      f3: { id: "f3", name: "Exteriores", children: ["l5"] },
      l1: { id: "l1", name: "Movimiento de tierras", children: [], cost: 0 },
      l2: { id: "l2", name: "Estructura y cobertura", children: [], cost: 0 },
      l3: { id: "l3", name: "Acabados y cerramientos", children: [], cost: 0 },
      l4: { id: "l4", name: "Instalaciones MEP (eléctricas y sanitarias)", children: [], cost: 0 },
      l5: { id: "l5", name: "Patio de maniobras", children: [], cost: 0 }
    };
    return { rootId: "root", idCounter: 6, nodes: n };
  })()
};

/* ===================== Caso DISTRIB+ (Cargar ejemplo) ===================== */
interface SampleItem { ran: string[]; stk: string; stkHint: string; wbs: string[]; type: string; priority: string; text: string; accept: string; method: string; status: string; norm?: string; }
const SAMPLE_ITEMS: SampleItem[] = [
  { ran: ["ran1"], stk: "s1", stkHint: "Gerencia General DISTRIB+", wbs: ["estructura", "cobertura"], type: "funcional", priority: "must",
    text: "La nave debe alcanzar la altura libre y la capacidad de racks definidas en la ingeniería de detalle.",
    accept: "Altura libre y disposición de racks verificadas contra los planos de ingeniería aprobados.", method: "inspeccion", status: "aprobado" },
  { ran: ["ran1"], stk: "s9", stkHint: "Futuros operarios del almacén", wbs: ["acabado"], type: "nofuncional", priority: "should",
    text: "Los acabados y la circulación interior deben permitir una operación logística segura y fluida.",
    accept: "Pisos, señalización y anchos de pasillo aptos para montacargas según layout operativo.", method: "inspeccion", status: "propuesto" },
  { ran: ["ran2"], stk: "s4", stkHint: "Municipalidad de Lurín", wbs: ["licencia", "estructura"], type: "calidad", priority: "must",
    text: "El diseño y la construcción deben cumplir el RNE y las exigencias de seguridad (INDECI).",
    accept: "Expediente y obra conformes al RNE; licencias municipales y certificado de seguridad aprobados.", method: "inspeccion", status: "aprobado", norm: "RNE · INDECI" },
  { ran: ["ran3"], stk: "s1", stkHint: "Gerencia General DISTRIB+", wbs: ["MEP", "eléctr", "sanitar"], type: "funcional", priority: "must",
    text: "Las instalaciones eléctricas y sanitarias deben dimensionarse para la operación logística proyectada.",
    accept: "Cargas eléctricas y caudales sanitarios probados y conformes a memoria de cálculo.", method: "prueba", status: "enDiseno" },
  { ran: ["ran4"], stk: "s10", stkHint: "Clientes / distribuidores", wbs: ["patio", "movimiento", "tierra"], type: "funcional", priority: "should",
    text: "El patio de maniobras debe permitir el giro y estacionamiento de vehículos de carga pesada.",
    accept: "Radios de giro y áreas de maniobra verificados con vehículo de diseño (tráiler).", method: "demostracion", status: "propuesto" },
  { ran: [], stk: "s6", stkHint: "SUNAFIL", wbs: ["estructura"], type: "calidad", priority: "must",
    text: "Deben preverse rutas de evacuación y señalización de seguridad conforme a la normativa de SST.",
    accept: "Rutas, señalización y equipamiento de emergencia conformes a la Ley 29783 y su reglamento.", method: "inspeccion", status: "propuesto", norm: "Ley 29783 (SST)" }
];
function resolveWbs(keywords: string[]): string[] {
  const leaves = getLeaves(), out: string[] = [], used: Record<string, boolean> = {};
  (keywords || []).forEach((kw0) => {
    const kw = String(kw0).toLowerCase();
    for (let i = 0; i < leaves.length; i++) {
      if (!used[leaves[i].id] && (leaves[i].name || "").toLowerCase().indexOf(kw) !== -1) { out.push(leaves[i].id); used[leaves[i].id] = true; break; }
    }
  });
  return out;
}
function buildSample(): void {
  state = { baseline: { frozen: false, version: "1.0", date: "", approver: "", snapshot: [] }, items: [], changes: [], activeChangeId: null, idCounter: 1, changeCounter: 1 };
  SAMPLE_ITEMS.forEach((s, i) => {
    state.items.push(normalizeItem({
      id: "q" + (i + 1), code: reqCode(i + 1), text: s.text, type: s.type, priority: s.priority,
      sourceRanIds: s.ran.slice(), stakeholderId: s.stk, _stkHint: s.stkHint,
      wbsNodeIds: resolveWbs(s.wbs), _wbsMatch: s.wbs,
      acceptanceCriteria: s.accept, verificationMethod: s.method, verificationStatus: "pendiente",
      status: s.status, normativeBasis: s.norm || "", origin: "baseline", changeId: null
    }));
  });
  state.idCounter = state.items.length + 1;
}

/* ===================== Carga ===================== */
function load(): void {
  if (gpiOn()) {
    const d = (GPI as GpiApi).getModule("requirements");
    if (d) applyData(d);       // ya hay datos del proyecto
    return;                   // proyecto activo sin datos → arranca en blanco (regla de oro)
  }
  let d; try { d = JSON.parse(localStorage.getItem(STORE_KEY) as string); } catch (e) { /* noop */ }
  if (d) applyData(d); else buildSample();   // modo suelto: demo autocontenida
}

/* ===================== Modales ===================== */
function ovConfirm(title: string, msg: string, okText?: string, danger?: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    $("ovTitle").textContent = title || ""; $("ovMsg").textContent = msg || ""; $("ovMsg").style.display = "";
    const body = $("ovBody"); body.style.display = "none"; body.innerHTML = ""; $("ovModal").classList.remove("wide");
    const ok = $("ovOk") as HTMLButtonElement, cancel = $("ovCancel") as HTMLButtonElement;
    ok.textContent = okText || "Continuar"; ok.className = "btn " + (danger ? "danger" : "primary"); cancel.style.display = ""; cancel.textContent = "Cancelar";
    function done(v: boolean) { $("ov").classList.remove("open"); ok.onclick = cancel.onclick = null; $("ov").onclick = null; document.removeEventListener("keydown", key); resolve(v); }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { done(false); return; }
      if (e.key === "Enter") { done(true); return; }
      if (e.key !== "Tab") return;
      // Trap de foco: Tab no debe escapar del modal hacia el fondo de la página.
      const f = Array.from($("ovModal").querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    ok.onclick = () => done(true); cancel.onclick = () => done(false); $("ov").onclick = (e) => { if (e.target === $("ov")) done(false); };
    document.addEventListener("keydown", key); $("ov").classList.add("open"); ok.focus();
  });
}
function ovAlert(title: string, msg: string): Promise<void> {
  return new Promise((resolve) => {
    $("ovTitle").textContent = title || ""; $("ovMsg").textContent = msg || ""; $("ovMsg").style.display = "";
    const body = $("ovBody"); body.style.display = "none"; body.innerHTML = ""; $("ovModal").classList.remove("wide");
    const ok = $("ovOk") as HTMLButtonElement, cancel = $("ovCancel") as HTMLButtonElement; ok.textContent = "Entendido"; ok.className = "btn primary"; cancel.style.display = "none";
    function done() { $("ov").classList.remove("open"); ok.onclick = null; $("ov").onclick = null; document.removeEventListener("keydown", key); resolve(); }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") { done(); return; }
      if (e.key !== "Tab") return;
      // Trap de foco: Tab no debe escapar del modal hacia el fondo de la página.
      const f = Array.from($("ovModal").querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    ok.onclick = done; $("ov").onclick = (e) => { if (e.target === $("ov")) done(); };
    document.addEventListener("keydown", key); $("ov").classList.add("open"); ok.focus();
  });
}
interface FormModalOpts { title?: string; msg?: string; bodyHTML?: string; okText?: string; wide?: boolean; onOpen?: (body: HTMLElement) => void; }
function openFormModal(opts: FormModalOpts): Promise<boolean> {
  return new Promise((resolve) => {
    $("ovTitle").textContent = opts.title || ""; $("ovMsg").textContent = opts.msg || ""; $("ovMsg").style.display = opts.msg ? "" : "none";
    const body = $("ovBody"); body.style.display = ""; body.innerHTML = opts.bodyHTML || ""; $("ovModal").classList.toggle("wide", !!opts.wide);
    const ok = $("ovOk") as HTMLButtonElement, cancel = $("ovCancel") as HTMLButtonElement; ok.textContent = opts.okText || "Guardar"; ok.className = "btn primary"; cancel.style.display = ""; cancel.textContent = "Cancelar";
    function done(v: boolean) { $("ov").classList.remove("open"); ok.onclick = cancel.onclick = null; $("ov").onclick = null; document.removeEventListener("keydown", key); resolve(v); if (!v) { body.innerHTML = ""; body.style.display = "none"; } }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { done(false); return; }
      if (e.key !== "Tab") return;
      // Trap de foco: Tab no debe escapar del modal hacia el fondo de la página.
      const f = Array.from($("ovModal").querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    ok.onclick = () => done(true); cancel.onclick = () => done(false); $("ov").onclick = (e) => { if (e.target === $("ov")) done(false); };
    document.addEventListener("keydown", key); $("ov").classList.add("open"); if (opts.onOpen) opts.onOpen(body);
  });
}
function clearOvBody(): void { const b = $("ovBody"); b.innerHTML = ""; b.style.display = "none"; }

/* ===================== Tabs ===================== */
$("tabs").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest(".tab") as HTMLElement | null; if (!b) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === b));
  document.querySelectorAll(".panel").forEach((s) => s.classList.toggle("active", s.id === b.dataset.p));
});

/* ===================== Helpers de presentación ===================== */
function ranMapById(): Record<string, GpiCore.CharterRan> { const m: Record<string, GpiCore.CharterRan> = {}; getRans().forEach((r) => { m[r.id] = r; }); return m; }
function ranChips(it: ReqUi): string {
  const m = ranMapById(), src = it.sourceRanIds || [];
  if (!src.length) return '<span class="chip none">sin RAN (emergente)</span>';
  return '<div class="chips">' + src.map((id) => (
    m[id] ? '<span class="chip ran" title="' + esc(m[id].text) + '">' + esc(m[id].code) + '</span>'
      : '<span class="chip miss" title="RAN inexistente en el Acta">RAN?</span>'
  )).join("") + '</div>';
}
function stkChip(it: ReqUi): string {
  if (!it.stakeholderId) return '<span class="chip none">sin origen</span>';
  const s = stakeholderById(it.stakeholderId);
  if (s) return '<span class="chip stk" title="' + esc(s.org || "") + '">◉ ' + esc(s.name) + '</span>';
  return '<span class="chip miss" title="El interesado no está en el registro">⚠ registro incompleto' + (it._stkHint ? ': ' + esc(it._stkHint) : "") + '</span>';
}
function wbsChips(it: ReqUi): string {
  const nodes = it.wbsNodeIds || [], valid = validNodeIds();
  if (!nodes.length) return '<span class="chip none">sin EDT</span>';
  return '<div class="chips">' + nodes.map((id) => {
    if (!valid[id]) return '<span class="chip miss" title="Paquete eliminado en la EDT">⚠ eliminado</span>';
    const l = wbsNodeLabel(id); return '<span class="chip wbs" title="' + esc(l ? l.name : "") + '">' + esc(l ? (l.code || "?") : "?") + ((l && l.leaf) ? "" : " ▸") + '</span>';
  }).join("") + '</div>';
}
function modById(id: string | null): ModUi | null { for (let i = 0; i < state.changes.length; i++) { if (state.changes[i].id === id) return state.changes[i]; } return null; }
function originBadge(it: ReqUi): string {
  const mod = it.changeId ? modById(it.changeId) : null;
  if (it.origin === "change") return '<span class="obadge mod" title="Requisito incorporado por una modificación de alcance">' + (mod ? esc(mod.code) : "MOD") + '</span>';
  if (it.changeId) return '<span class="obadge lb">LB</span> <span class="obadge mod" title="Requisito de la línea base modificado por">' + (mod ? esc(mod.code) : "MOD") + '</span>';
  return '<span class="obadge lb" title="Requisito de la línea base original">LB</span>';
}

/* ===================== Render maestro ===================== */
function renderAll(): void { renderMatrix(); renderCoverage(); renderBaseline(); renderMods(); renderDiff(); }

/* ===================== 01 · Matriz ===================== */
let h2 = "";
function renderMatrix(): void {
  const u = util();
  const audit = u ? u.requirementsAudit(collect(), gpiOn() ? (GPI as GpiApi).getModule("charter") : DEMO.charter, getWbs() || undefined) : null;
  const host = $("mtxHost"); let h = "";

  if (audit) {
    const stCls = audit.state === "verde" ? "pos" : (audit.state === "ambar" ? "mid" : "neg");
    h += '<div class="kpis">'
      + kpiBox(audit.total, "REQUISITOS (REQ)", "registrados en la matriz")
      + kpiBox(audit.tracePct + "%", "TRAZADOS A LA EDT", audit.reqsWithoutWbs + " sin paquete", stCls)
      + kpiBox((audit.rans - audit.ransUncovered.length) + "/" + audit.rans, "RAN CUBIERTOS", audit.ransUncovered.length + " RAN sin desarrollar", audit.ransUncovered.length ? "mid" : "pos")
      + kpiBox(audit.baselineFrozen ? ("v" + (audit.baselineVersion || "1.0")) : "—", "LÍNEA BASE", audit.baselineFrozen ? (audit.changes + " modificación(es)") : "aún no congelada", audit.baselineFrozen ? "pos" : "mid")
      + '</div>';
  }

  const frozen = state.baseline.frozen;
  h += '<div class="lb-banner ' + (frozen ? "frozen" : "open") + '">'
    + '<div class="ic">' + (frozen ? "🔒" : "✎") + '</div>'
    + '<div class="txt"><b>' + (frozen ? ("Línea base v" + esc(state.baseline.version) + " congelada") : "Etapa 1 · Construcción de la línea base") + '</b>'
    + '<p>' + (frozen
      ? ("Aprobada el " + repDate(state.baseline.date) + (state.baseline.approver ? (" por " + esc(state.baseline.approver)) : "") + ". Los cambios se registran como modificaciones de alcance.")
      : "Edita libremente los requisitos. Cuando el conjunto esté aprobado, congélalo en la pestaña « Línea base ».") + '</p></div>'
    + (frozen ? '<span class="lb-tag">' + esc(activeModLabel()) + '</span>' : "")
    + '<button class="btn primary sm" onclick="openItemEditor(null)">+ Agregar requisito</button>'
    + '</div>';

  if (!state.items.length) {
    h += '<div class="card"><div class="card-b"><div class="empty-state">'
      + '<div class="big">📝</div><h3>Sin requisitos aún</h3>'
      + '<p>Empieza trayendo los requisitos de alto nivel del Acta (RAN) y desarrollándolos en requisitos REQ.00X, o carga el caso de ejemplo DISTRIB+ para explorar la herramienta.</p>'
      + '<div class="btn-row" style="justify-content:center">'
      + '<button class="btn primary" onclick="openItemEditor(null)">+ Agregar el primero</button>'
      + '<button class="btn cyan" onclick="loadSampleClick()">Cargar ejemplo DISTRIB+</button>'
      + '</div></div></div></div>';
    host.innerHTML = h; return;
  }

  h += '<div class="card"><div class="tbl-wrap"><table class="rtm"><thead><tr>'
    + '<th>Cód.</th><th>Requisito</th><th>Prioridad</th><th>Origen (RAN · interesado)</th><th>Entregable · EDT</th><th>Verificación</th><th>Estado</th><th>Etapa</th><th></th>'
    + '</tr></thead><tbody>';
  state.items.forEach((it) => {
    h += '<tr class="' + (it.status === "cancelado" ? "cancelled" : "") + '">'
      + '<td class="mono">' + esc(it.code) + '</td>'
      + '<td><div class="req-text">' + esc(it.text || "(sin texto)") + '</div><small>' + esc(lab(TYPES, it.type)) + (it.normativeBasis ? (' · ' + esc(it.normativeBasis)) : "") + '</small></td>'
      + '<td>' + prioPill(it.priority) + '</td>'
      + '<td>' + ranChips(it) + '<div style="margin-top:4px">' + stkChip(it) + '</div></td>'
      + '<td>' + wbsChips(it) + '</td>'
      + '<td><span class="ver-dot ' + esc(it.verificationStatus) + '"></span>' + esc(lab(METHODS, it.verificationMethod) || "—") + '</td>'
      + '<td><span class="st ' + esc(it.status) + '">' + esc(lab(STATUS, it.status)) + '</span></td>'
      + '<td>' + originBadge(it) + '</td>'
      + '<td><div class="mini-actions"><button class="icon-btn" title="Editar" aria-label="Editar requisito" onclick="openItemEditor(\'' + escJsAttr(it.id) + '\')">✎</button>'
      + '<button class="icon-btn danger" title="Eliminar" aria-label="Eliminar requisito" onclick="removeItem(\'' + escJsAttr(it.id) + '\')">🗑</button></div></td>'
      + '</tr>';
  });
  h += '</tbody></table></div></div>';

  if (audit) {
    const warns: string[] = [];
    if (audit.ransUncovered.length) warns.push('<span class="tag">RAN</span> ' + audit.ransUncovered.length + ' requisito(s) de alto nivel del Acta sin ningún REQ que los desarrolle');
    if (audit.reqsWithoutWbs) warns.push('<span class="tag">EDT</span> ' + audit.reqsWithoutWbs + ' requisito(s) sin paquete de trabajo (trazabilidad hacia abajo incompleta)');
    if (audit.leavesWithoutReq.length) warns.push('<span class="tag">Alcance</span> ' + audit.leavesWithoutReq.length + ' paquete(s) de la EDT sin requisito asociado (posible sobre-alcance)');
    if (audit.reqsBrokenWbs) warns.push('<span class="tag">Enlace</span> ' + audit.reqsBrokenWbs + ' requisito(s) apuntan a un paquete eliminado (re-vincular)');
    if (audit.reqsWithoutStk) warns.push('<span class="tag">Origen</span> ' + audit.reqsWithoutStk + ' requisito(s) sin interesado registrado como origen');
    if (audit.reqsWithoutAccept) warns.push('<span class="tag">V&V</span> ' + audit.reqsWithoutAccept + ' requisito(s) sin criterio de aceptación (no verificable)');
    if (warns.length) {
      h2 = '<div class="card"><div class="card-h"><div><h3>Hallazgos de trazabilidad</h3><div class="sub">Revisiones automáticas sobre el Acta, los interesados y la EDT.</div></div></div>'
        + '<div class="card-b"><ul class="warn-list">' + warns.map((w) => '<li>' + w + '</li>').join("") + '</ul></div></div>';
      host.innerHTML = h + h2; return;
    }
  }
  host.innerHTML = h;
}
function kpiBox(v: string | number, lbl: string, cap: string, cls?: string): string { return '<div class="kpi"><div class="lab">' + esc(lbl) + '</div><div class="val ' + (cls || "") + '">' + esc(String(v)) + '</div><div class="cap">' + esc(cap) + '</div></div>'; }
function prioPill(p: string): string { return '<span class="pill ' + esc(p) + '">' + esc(lab(PRIOS, p).replace(/ \(.*/, '')) + '</span>'; }
function activeModLabel(): string { const m = state.activeChangeId ? modById(state.activeChangeId) : null; return m ? ("↳ cambios → " + m.code) : "sin modificación activa"; }

/* ===================== Toast ===================== */
function showToast(msg: string): void {
  let t = document.getElementById("gpiToast");
  if (!t) {
    t = document.createElement("div"); t.id = "gpiToast";
    t.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:2000;background:#1A1A1C;color:#fff;font-family:'Manrope',sans-serif;font-size:12.5px;font-weight:600;line-height:1.5;padding:10px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:520px;text-align:center;opacity:0;transition:opacity .2s;pointer-events:none;";
    document.body.appendChild(t);
  }
  const el = t as HTMLElement & { _t?: ReturnType<typeof setTimeout> };
  el.textContent = msg; el.style.opacity = "1"; clearTimeout(el._t); el._t = setTimeout(() => { el.style.opacity = "0"; }, 3200);
}

/* ===================== Editor de requisito ===================== */
function selOpts(list: Vocab, cur: string | undefined): string { return list.map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? " selected" : "") + '>' + esc(o[1]) + '</option>').join(""); }
function stkSelect(cur: string | undefined): string {
  const all = getStakeholders(); let found = false; let opts = '<option value="">— sin interesado —</option>';
  all.forEach((s) => { if (s.id === cur) found = true; opts += '<option value="' + esc(s.id) + '"' + (s.id === cur ? " selected" : "") + '>' + esc(s.name) + (s.org ? (" · " + esc(s.org)) : "") + '</option>'; });
  if (cur && !found) opts = '<option value="' + esc(cur) + '" selected>⚠ registro incompleto — completar en Stakeholder Studio</option>' + opts;
  return opts;
}
function picklist(kind: string, itemsArr: Array<{ id: string; code?: string; name?: string; text?: string }>, checkedSet: Record<string, boolean>, emptyMsg: string): string {
  if (!itemsArr.length) return '<div class="picklist"><div class="empty">' + esc(emptyMsg) + '</div></div>';
  return '<div class="picklist">' + itemsArr.map((o) => {
    const id = o.id, code = o.code || "", txt = o.name || o.text || "";
    return '<label><input type="checkbox" data-pick="' + kind + '" value="' + esc(id) + '"' + (checkedSet[id] ? " checked" : "") + '>'
      + '<span class="co">' + esc(code) + '</span><span>' + esc(txt) + '</span></label>';
  }).join("") + '</div>';
}

function openItemEditor(id: string | null): void {
  if (state.baseline.frozen && !state.activeChangeId) {
    ovConfirm("Línea base congelada", "Para agregar o modificar requisitos después de congelar la línea base, primero crea o activa una modificación de alcance. ¿Ir a « Modificaciones de alcance » ahora?", "Ir a Modificaciones").then((ok) => {
      if (ok) { (document.querySelector('.tab[data-p="p4"]') as HTMLElement).click(); }
    });
    return;
  }
  const it = id ? state.items.filter((x) => x.id === id)[0] : null;
  const cur: ReqUi = it || ({ text: "", type: "funcional", priority: "should", sourceRanIds: [], stakeholderId: "", wbsNodeIds: [], acceptanceCriteria: "", verificationMethod: "", verificationStatus: "pendiente", status: "propuesto", normativeBasis: "" } as unknown as ReqUi);
  const ranSet: Record<string, boolean> = {}; (cur.sourceRanIds || []).forEach((r) => { ranSet[r] = true; });
  const wbsSet: Record<string, boolean> = {}; (cur.wbsNodeIds || []).forEach((w) => { wbsSet[w] = true; });
  const rans = getRans(), leaves = getLeaves().map((l) => ({ id: l.id, code: l.code, name: l.name }));
  const stkBroken = cur.stakeholderId && !stakeholderById(cur.stakeholderId);

  const body = ''
    + '<label class="f"><span>Requisito</span><textarea id="e_text" placeholder="Condición o capacidad que el producto/servicio debe satisfacer…">' + esc(cur.text) + '</textarea></label>'
    + '<div class="row row-2">'
    + '<label class="f"><span>Tipo</span><select id="e_type">' + selOpts(TYPES, cur.type) + '</select></label>'
    + '<label class="f"><span>Prioridad (MoSCoW)</span><select id="e_prio">' + selOpts(PRIOS, cur.priority) + '</select></label>'
    + '</div>'
    + '<label class="f"><span>Origen · requisito(s) de alto nivel del Acta (RAN)</span>'
    + '<div class="hint">Todo RAN debería desarrollarse en al menos un REQ. Un requisito sin RAN se considera <b>emergente</b> (legítimo, pero señalado).</div>'
    + picklist("ran", rans, ranSet, "El Acta aún no tiene requisitos de alto nivel (RAN). Regístralos en el módulo Acta de Constitución.") + '</label>'
    + '<label class="f"><span>Origen · interesado que lo plantea</span>'
    + '<div class="hint">Debe salir del registro de interesados. Si no está, regístralo y realiza el mapeo completo en Stakeholder Studio.</div>'
    + '<select id="e_stk">' + stkSelect(cur.stakeholderId) + '</select>'
    + (stkBroken ? '<div class="note warn" style="margin-top:6px">⚠ <b>Registro incompleto:</b> este interesado no está en el registro del proyecto. <a href="Stakeholder_Studio.html">Abrir Stakeholder Studio ▸</a></div>' : '')
    + '</label>'
    + '<label class="f"><span>Entregable · paquete(s) de la EDT que lo satisfacen</span>'
    + '<div class="hint">Trazabilidad hacia abajo. Al guardar se conservan solo los paquetes marcados aquí.</div>'
    + picklist("wbs", leaves, wbsSet, "No hay una EDT con paquetes de trabajo en el proyecto activo. Constrúyela en WBS Builder.") + '</label>'
    + '<label class="f"><span>Criterio de aceptación</span><textarea id="e_accept" placeholder="Condición medible bajo la cual el requisito se da por satisfecho…">' + esc(cur.acceptanceCriteria) + '</textarea></label>'
    + '<div class="row row-2">'
    + '<label class="f"><span>Método de verificación</span><select id="e_method">' + selOpts(METHODS, cur.verificationMethod) + '</select></label>'
    + '<label class="f"><span>Estado de verificación</span><select id="e_vstatus">' + selOpts(VSTATES, cur.verificationStatus) + '</select></label>'
    + '</div>'
    + '<div class="row row-2">'
    + '<label class="f"><span>Estado del requisito</span><select id="e_status">' + selOpts(STATUS, cur.status) + '</select></label>'
    + '<label class="f"><span>Base normativa (opcional)</span><input id="e_norm" value="' + esc(cur.normativeBasis) + '" placeholder="RNE, INDECI, Ley 29783…"></label>'
    + '</div>';

  const subt = state.baseline.frozen
    ? (id ? 'Cambio registrado bajo la modificación activa ' + esc(activeModLabel().replace("↳ cambios → ", ""))
      : 'Nuevo requisito · se incorpora por la modificación ' + esc(activeModLabel().replace("↳ cambios → ", "")))
    : 'Etapa 1 · forma parte de la línea base en construcción';

  openFormModal({ title: id ? ("Editar " + esc((it as ReqUi).code)) : "Nuevo requisito", msg: subt, bodyHTML: body, okText: id ? "Guardar cambios" : "Agregar requisito", wide: true })
    .then((ok) => {
      if (!ok) { return; }
      const text = ($("e_text") as HTMLTextAreaElement).value.trim();
      if (!text) { clearOvBody(); ovAlert("Falta el requisito", "Escribe el texto del requisito antes de guardar."); return; }
      const picked: { ran: string[]; wbs: string[] } = { ran: [], wbs: [] };
      document.querySelectorAll('#ovBody [data-pick]').forEach((c) => { const el = c as HTMLInputElement; if (el.checked) picked[el.dataset.pick as "ran" | "wbs"].push(el.value); });
      const data = {
        text, type: ($("e_type") as HTMLSelectElement).value, priority: ($("e_prio") as HTMLSelectElement).value,
        sourceRanIds: picked.ran, stakeholderId: ($("e_stk") as HTMLSelectElement).value, wbsNodeIds: picked.wbs,
        acceptanceCriteria: ($("e_accept") as HTMLTextAreaElement).value.trim(), verificationMethod: ($("e_method") as HTMLSelectElement).value,
        verificationStatus: ($("e_vstatus") as HTMLSelectElement).value, status: ($("e_status") as HTMLSelectElement).value, normativeBasis: ($("e_norm") as HTMLInputElement).value.trim()
      };
      if (id) {
        Object.assign(it as ReqUi, data);
        if (state.baseline.frozen && (it as ReqUi).origin === "baseline") (it as ReqUi).changeId = state.activeChangeId;   // baseline modificado por MOD
      } else {
        const ni = normalizeItem(Object.assign({ id: "q" + (state.idCounter++), code: reqCode(nextReqNum()) }, data));
        ni.origin = state.baseline.frozen ? "change" : "baseline";
        ni.changeId = state.baseline.frozen ? state.activeChangeId : null;
        state.items.push(ni);
      }
      clearOvBody(); touch();
      showToast(id ? "Requisito actualizado." : "Requisito agregado.");
    });
}
function nextReqNum(): number {
  let mx = 0; state.items.forEach((it) => { const m = /REQ\.0*(\d+)/.exec(it.code || ""); if (m) mx = Math.max(mx, Number(m[1])); }); return mx + 1;
}

function removeItem(id: string): void {
  const it = state.items.filter((x) => x.id === id)[0]; if (!it) return;
  if (state.baseline.frozen) {
    if (!state.activeChangeId) {
      ovConfirm("Línea base congelada", "Eliminar un requisito de una línea base congelada es una modificación de alcance. Crea o activa una modificación primero. ¿Ir a « Modificaciones de alcance »?", "Ir a Modificaciones").then((ok) => { if (ok) (document.querySelector('.tab[data-p="p4"]') as HTMLElement).click(); });
      return;
    }
    ovConfirm("Dar de baja " + it.code, "El requisito se marcará como « Cancelado » bajo la modificación activa (se conserva en la matriz para trazabilidad). ¿Continuar?", "Dar de baja", true).then((ok) => {
      if (!ok) return; it.status = "cancelado"; it.changeId = state.activeChangeId; touch(); showToast(it.code + " dado de baja.");
    });
  } else {
    ovConfirm("Eliminar " + it.code, "Se eliminará este requisito de la línea base en construcción. ¿Continuar?", "Eliminar", true).then((ok) => {
      if (!ok) return; state.items = state.items.filter((x) => x.id !== id); touch(); showToast(it.code + " eliminado.");
    });
  }
}

function loadSampleClick(): void {
  const go = () => { buildSample(); userEdited = true; save(); flash(); renderAll(); showToast("Caso DISTRIB+ cargado."); };
  if (state.items.length || state.changes.length) {
    ovConfirm("Cargar ejemplo DISTRIB+", "Esto reemplazará los requisitos y modificaciones actuales de este módulo por el caso de ejemplo. ¿Continuar?", "Cargar ejemplo", true).then((ok) => { if (ok) go(); });
  } else go();
}

/* ===================== 02 · Cobertura RAN → REQ ===================== */
function renderCoverage(): void {
  const host = $("covHost"), rans = getRans();
  const byRan: Record<string, ReqUi[]> = {}; rans.forEach((r) => { byRan[r.id] = []; });
  const emergent: ReqUi[] = [];
  state.items.forEach((it) => {
    (it.sourceRanIds || []).forEach((rid) => { if (byRan[rid]) { byRan[rid].push(it); } });
    if (!(it.sourceRanIds || []).length) emergent.push(it);
  });
  let h = '<div class="card"><div class="card-h"><div><h3>Cobertura de los requisitos de alto nivel (RAN)</h3>'
    + '<div class="sub">Trazabilidad hacia el origen: todo <b>RAN</b> del Acta debería desarrollarse en al menos un <b>REQ</b>. Los RAN provienen del módulo Acta de Constitución.</div></div>'
    + '<a class="btn sm" href="Project_Charter.html">Abrir Acta ▸</a></div><div class="card-b">';
  if (!rans.length) {
    h += '<div class="note info">El Acta aún no tiene requisitos de alto nivel (RAN). Regístralos en el módulo <a href="Project_Charter.html">Acta de Constitución</a> (sección 6) para poder trazarlos aquí.</div>';
  } else {
    h += '<div class="tbl-wrap"><table class="cov"><thead><tr><th>RAN</th><th>Desarrollado por</th><th style="text-align:center">Estado</th></tr></thead><tbody>';
    rans.forEach((r) => {
      const reqs = byRan[r.id];
      const chips = reqs.length ? '<div class="chips">' + reqs.map((it) => '<span class="chip ran" title="' + esc(it.text) + '">' + esc(it.code) + '</span>').join("") + '</div>' : '<span class="muted">—</span>';
      const st = reqs.length ? '<span class="st verificado">✓ cubierto</span>' : '<span class="st cancelado">⚠ sin cobertura</span>';
      h += '<tr><td class="ran-cell"><code>' + esc(r.code) + '</code>' + esc(r.text) + '</td><td>' + chips + '</td><td style="text-align:center">' + st + '</td></tr>';
    });
    h += '</tbody></table></div>';
    const uncovered = rans.filter((r) => !byRan[r.id].length);
    if (uncovered.length) h += '<div class="note warn" style="margin-top:14px">Hay <b>' + uncovered.length + '</b> requisito(s) de alto nivel sin desarrollar. Cierra la brecha creando un REQ que los desarrolle, o revisa si el RAN sigue vigente.</div>';
    else h += '<div class="note ok" style="margin-top:14px">✓ Todos los RAN del Acta están desarrollados en al menos un requisito.</div>';
  }
  h += '</div></div>';

  h += '<div class="card"><div class="card-h"><div><h3>Requisitos emergentes (sin RAN)</h3>'
    + '<div class="sub">Aparecidos durante la elicitación, sin un requisito de alto nivel de origen. Es metodológicamente válido (elaboración progresiva); conviene decidir si son legítimos o si falta un RAN en el Acta.</div></div></div><div class="card-b">';
  if (!emergent.length) { h += '<div class="note ok">No hay requisitos emergentes: todos trazan a un RAN del Acta.</div>'; } else {
    h += '<div class="tbl-wrap"><table><thead><tr><th>Cód.</th><th>Requisito</th><th>Interesado</th><th></th></tr></thead><tbody>';
    emergent.forEach((it) => {
      h += '<tr><td class="mono">' + esc(it.code) + '</td><td>' + esc(it.text) + '</td><td>' + stkChip(it) + '</td>'
        + '<td style="text-align:right"><button class="btn sm" onclick="promoteToRan(\'' + escJsAttr(it.id) + '\')">↥ Promover a RAN del Acta</button></td></tr>';
    });
    h += '</tbody></table></div><div class="note info" style="margin-top:12px">« Promover a RAN » agrega el texto del requisito como un nuevo requisito de alto nivel en el Acta y lo enlaza aquí, cerrando el panorama de alto nivel.</div>';
  }
  h += '</div></div>';
  host.innerHTML = h;
}
function promoteToRan(id: string): void {
  const it = state.items.filter((x) => x.id === id)[0]; if (!it) return;
  if (!gpiOn()) { ovAlert("Modo suelto", "Para promover un requisito a RAN del Acta, abre este módulo desde el Panel de Control (así se comparte el Acta del proyecto)."); return; }
  ovConfirm("Promover a RAN", "Se agregará este requisito como un nuevo RAN en el Acta de Constitución y se enlazará como su origen. ¿Continuar?", "Promover").then((ok) => {
    if (!ok) return;
    const ch = (GPI as GpiApi).getModule("charter") || ({} as CharterModule); ch.requirements = Array.isArray(ch.requirements) ? ch.requirements : [];
    let mx = 0; ch.requirements.forEach((r) => { const m = r && typeof r === "object" && r.code && /RAN\.0*(\d+)/.exec(r.code); if (m) mx = Math.max(mx, Number(m[1])); });
    const num = mx + 1, code = "RAN." + (num < 10 ? "0" + num : num), rid = "ran" + num;
    ch.requirements.push({ id: rid, code, text: it.text });
    (GPI as GpiApi).setModule("charter", ch);
    it.sourceRanIds = (it.sourceRanIds || []).concat([rid]);
    touch(); showToast(it.code + " ahora traza a " + code + " (agregado al Acta).");
  });
}

/* ===================== 03 · Línea base ===================== */
function renderBaseline(): void {
  const host = $("lbHost"), b = state.baseline, n = state.items.length;
  let h = '';
  if (!b.frozen) {
    h += '<div class="card"><div class="card-h"><div><h3>Etapa 1 · Congelar la línea base de requisitos</h3>'
      + '<div class="sub">Mientras construyes la línea base, la matriz es totalmente editable. Al congelarla se guarda una copia inmutable (versión, fecha y aprobador) y, a partir de ahí, todo cambio se gestiona como una modificación de alcance con trazabilidad.</div></div></div><div class="card-b">'
      + '<div class="row row-3">'
      + '<label class="f"><span>Versión</span><input id="lb_ver" class="mono" value="' + esc(b.version || "1.0") + '"></label>'
      + '<label class="f"><span>Fecha de aprobación</span><input id="lb_date" type="date" value="' + esc(b.date || todayISO()) + '"></label>'
      + '<label class="f"><span>Aprobado por</span><input id="lb_appr" value="' + esc(b.approver || "") + '" placeholder="Patrocinador / CCB"></label>'
      + '</div>'
      + '<div class="note ' + (n ? "info" : "warn") + '" style="margin:4px 0 14px">' + (n ? ('Se congelarán <b>' + n + '</b> requisito(s) como línea base v' + esc(b.version || "1.0") + '.') : 'Agrega al menos un requisito en la pestaña « Matriz » antes de congelar.') + '</div>'
      + '<button class="btn primary" ' + (n ? '' : 'disabled') + ' onclick="freezeBaseline()">🔒 Congelar línea base</button>'
      + '</div></div>';
  } else {
    h += '<div class="card"><div class="card-h"><div><h3>Línea base v' + esc(b.version) + ' · congelada</h3>'
      + '<div class="sub">Etapa 2 · los cambios se gestionan como modificaciones de alcance.</div></div>'
      + '<span class="lb-tag">🔒 v' + esc(b.version) + '</span></div><div class="card-b">'
      + '<div class="row row-3">'
      + '<div class="kpi"><div class="lab">Requisitos en la línea base</div><div class="val">' + (b.snapshot ? b.snapshot.length : 0) + '</div></div>'
      + '<div class="kpi"><div class="lab">Fecha de aprobación</div><div class="val" style="font-size:15px">' + repDate(b.date) + '</div></div>'
      + '<div class="kpi"><div class="lab">Aprobado por</div><div class="val" style="font-size:14px">' + esc(b.approver || "—") + '</div></div>'
      + '</div>'
      + '<div class="note info" style="margin-top:14px">Para modificar la línea base, ve a « Modificaciones de alcance », crea/activa una modificación y edita la matriz: cada cambio quedará atribuido a esa modificación (MOD.0X) y visible en « Trazabilidad de cambios ».</div>'
      + '<div class="divider" style="height:1px;background:var(--line);margin:16px 0"></div>'
      + '<h4 style="font-size:13px;margin-bottom:6px">Re-línea base (rebaselining)</h4>'
      + '<p class="muted" style="font-size:12.5px;margin:0 0 10px">Cuando las modificaciones aprobadas justifiquen una nueva línea base aprobada, puedes congelar el estado actual como una versión nueva. Úsalo con criterio: normalmente tras la aprobación formal de las modificaciones.</p>'
      + '<button class="btn" onclick="rebaseline()">⟳ Congelar nueva versión (v' + esc(nextVersion(b.version)) + ')</button>'
      + '</div></div>';
  }
  host.innerHTML = h;
}
function nextVersion(v: string | undefined): string { const m = /^(\d+)(?:\.(\d+))?/.exec(String(v || "1.0")); const maj = m ? Number(m[1]) : 1; return (maj + 1) + ".0"; }
function freezeBaseline(): void {
  if (!state.items.length) return;
  const ver = ($("lb_ver") as HTMLInputElement).value.trim() || "1.0", date = ($("lb_date") as HTMLInputElement).value || todayISO(), appr = ($("lb_appr") as HTMLInputElement).value.trim();
  ovConfirm("Congelar línea base", "Se guardará una copia inmutable de los " + state.items.length + " requisitos como línea base v" + ver + ". A partir de aquí los cambios se registran como modificaciones de alcance. ¿Continuar?", "Congelar").then((ok) => {
    if (!ok) return;
    state.items.forEach((it) => { if (!it.origin) it.origin = "baseline"; });
    state.baseline = { frozen: true, version: ver, date, approver: appr, snapshot: JSON.parse(JSON.stringify(state.items)) };
    touch(); showToast("Línea base v" + ver + " congelada."); (document.querySelector('.tab[data-p="p1"]') as HTMLElement).click();
  });
}
function rebaseline(): void {
  const nv = nextVersion(state.baseline.version);
  ovConfirm("Nueva línea base", "Se congelará el estado ACTUAL de la matriz como línea base v" + nv + " (la anterior queda como historial). ¿Continuar?", "Congelar v" + nv).then((ok) => {
    if (!ok) return;
    state.baseline.version = nv; state.baseline.date = todayISO(); state.baseline.snapshot = JSON.parse(JSON.stringify(state.items));
    touch(); showToast("Nueva línea base v" + nv + " congelada.");
  });
}

/* ===================== 04 · Modificaciones de alcance ===================== */
function affectedOf(modId: string): ReqUi[] { return state.items.filter((it) => it.changeId === modId); }
function renderMods(): void {
  const host = $("modHost"), frozen = state.baseline.frozen;
  let h = '<div class="card"><div class="card-h"><div><h3>Modificaciones de la línea base del alcance</h3>'
    + '<div class="sub">Etapa 2. Cada modificación (<b>MOD.0X</b>) agrupa altas, cambios y bajas de requisitos posteriores a la línea base. Activa una modificación para que la matriz atribuya a ella los cambios que hagas. Preparado para enlazarse con el módulo <b>Control Integrado de Cambios</b>.</div></div>'
    + '<button class="btn primary sm" ' + (frozen ? '' : 'disabled title="Primero congela la línea base"') + ' onclick="openModEditor(null)">+ Nueva modificación</button></div><div class="card-b">';
  if (!frozen) {
    h += '<div class="note warn">Aún no has congelado la línea base. Una modificación de alcance solo tiene sentido sobre una línea base aprobada: ve a « Línea base » y congélala primero.</div>';
  } else if (!state.changes.length) {
    h += '<div class="note info">No hay modificaciones registradas. Mientras no crees una, la línea base v' + esc(state.baseline.version) + ' permanece intacta.</div>';
  } else {
    state.changes.forEach((m) => {
      const aff = affectedOf(m.id), isActive = state.activeChangeId === m.id;
      h += '<div class="mod-item' + (isActive ? ' active' : '') + '">'
        + '<div class="mh"><div><span class="code">' + esc(m.code) + '</span> <span class="st ' + statusToStClass(m.status) + '">' + esc(lab(MODSTATUS, m.status)) + '</span>'
        + '<div class="meta">' + repDate(m.date) + (m.requestedBy ? (' · solicita: ' + esc(m.requestedBy)) : "") + (m.approver ? (' · aprueba: ' + esc(m.approver)) : "") + '</div></div>'
        + '<div class="mini-actions">'
        + '<button class="btn sm ' + (isActive ? 'primary' : '') + '" onclick="setActiveMod(\'' + escJsAttr(m.id) + '\')">' + (isActive ? '✓ Activa' : 'Activar') + '</button>'
        + '<button class="icon-btn" title="Editar" aria-label="Editar modificación" onclick="openModEditor(\'' + escJsAttr(m.id) + '\')">✎</button>'
        + '<button class="icon-btn danger" title="Eliminar" aria-label="Eliminar modificación" onclick="removeMod(\'' + escJsAttr(m.id) + '\')">🗑</button>'
        + '</div></div>'
        + (m.summary ? '<div style="font-size:12.5px;margin-top:8px"><b>' + esc(m.summary) + '</b></div>' : '')
        + (m.justification ? '<div class="muted" style="font-size:12px;margin-top:3px">' + esc(m.justification) + '</div>' : '')
        + '<div class="impact-grid">'
        + impBox("Alcance", m.impact.scope) + impBox("Cronograma", m.impact.schedule) + impBox("Costo", m.impact.cost) + impBox("EDT", m.impact.wbs)
        + '</div>'
        + '<div style="margin-top:10px;font-size:12px"><b>Requisitos afectados:</b> ' + (aff.length ? ('<span class="chips" style="display:inline-flex">' + aff.map((it) => '<span class="chip ran">' + esc(it.code) + '</span>').join("") + '</span>') : '<span class="muted">ninguno aún — actívala y edita la matriz</span>') + '</div>'
        + '<div class="row row-2" style="margin-top:10px">'
        + '<label class="f" style="margin:0"><span>Estado</span><select onchange="setModStatus(\'' + escJsAttr(m.id) + '\',this.value)">' + selOpts(MODSTATUS, m.status) + '</select></label>'
        + '<label class="f" style="margin:0"><span>Solicitud de cambio (CCR) — Control Integrado de Cambios</span><input value="' + esc(m.ccrRef) + '" placeholder="ID de la solicitud (pendiente del módulo)" onchange="updateCcr(\'' + escJsAttr(m.id) + '\',this.value)"></label>'
        + '</div>'
        + '<div class="note info" style="margin-top:8px;font-size:11.5px">El campo CCR quedará enlazado automáticamente cuando exista el módulo <code class="k">changes</code> (Control Integrado de Cambios): este MOD referenciará su solicitud formal y la decisión del CCB.</div>'
        + '</div>';
    });
  }
  h += '</div></div>';
  host.innerHTML = h;
}
function impBox(t: string, v: string): string { return '<div class="ib"><b>' + esc(t) + '</b>' + (v ? esc(v) : '<span class="muted">—</span>') + '</div>'; }
function statusToStClass(s: string): string { return s === "aprobado" ? "verificado" : (s === "rechazado" ? "cancelado" : (s === "implementado" ? "implementado" : (s === "enEvaluacion" ? "enDiseno" : "propuesto"))); }
function setActiveMod(id: string): void { state.activeChangeId = (state.activeChangeId === id) ? null : id; touch(); showToast(state.activeChangeId ? ("Modificación activa: " + (modById(id) || { code: "" }).code) : "Sin modificación activa."); }
function setModStatus(id: string, val: string): void { const m = modById(id); if (m) { m.status = val; touch(); } }
function updateCcr(id: string, val: string): void { const m = modById(id); if (m) { m.ccrRef = val.trim(); userEdited = true; save(); } }
function removeMod(id: string): void {
  const m = modById(id); if (!m) return; const aff = affectedOf(id);
  const msg = aff.length ? ("Esta modificación afecta a " + aff.length + " requisito(s). Se eliminarán los REQ que introdujo y se desvincularán los que solo modificó. ¿Continuar?") : "¿Eliminar esta modificación?";
  ovConfirm("Eliminar " + m.code, msg, "Eliminar", true).then((ok) => {
    if (!ok) return;
    state.items = state.items.filter((it) => { if (it.changeId !== id) return true; if (it.origin === "change") return false; it.changeId = null; return true; });
    state.changes = state.changes.filter((x) => x.id !== id);
    if (state.activeChangeId === id) state.activeChangeId = null;
    touch(); showToast(m.code + " eliminada.");
  });
}
function openModEditor(id: string | null): void {
  const m = id ? modById(id) : null;
  const cur: ModUi = m || ({ date: todayISO(), requestedBy: "", approver: "", status: "propuesto", summary: "", justification: "", impact: { scope: "", schedule: "", cost: "", wbs: "" }, ccrRef: "" } as unknown as ModUi);
  const body = ''
    + '<label class="f"><span>Resumen del cambio</span><input id="m_sum" value="' + esc(cur.summary) + '" placeholder="Ej.: Incorporar sistema de rociadores contra incendios"></label>'
    + '<label class="f"><span>Justificación</span><textarea id="m_just" placeholder="Motivo del cambio, origen (interesado, normativa, hallazgo)…">' + esc(cur.justification) + '</textarea></label>'
    + '<div class="row row-3">'
    + '<label class="f"><span>Fecha</span><input id="m_date" type="date" value="' + esc(cur.date) + '"></label>'
    + '<label class="f"><span>Solicita</span><input id="m_req" value="' + esc(cur.requestedBy) + '"></label>'
    + '<label class="f"><span>Estado</span><select id="m_status">' + selOpts(MODSTATUS, cur.status) + '</select></label>'
    + '</div>'
    + '<div style="font-weight:700;font-size:12px;margin:2px 0 8px">Evaluación de impacto</div>'
    + '<div class="row row-2">'
    + '<label class="f"><span>Alcance</span><input id="m_iscope" value="' + esc(cur.impact.scope) + '" placeholder="+1 requisito, nuevo entregable…"></label>'
    + '<label class="f"><span>Cronograma</span><input id="m_isched" value="' + esc(cur.impact.schedule) + '" placeholder="+5 días…"></label>'
    + '</div>'
    + '<div class="row row-2">'
    + '<label class="f"><span>Costo</span><input id="m_icost" value="' + esc(cur.impact.cost) + '" placeholder="+ USD 12,000…"></label>'
    + '<label class="f"><span>EDT</span><input id="m_iwbs" value="' + esc(cur.impact.wbs) + '" placeholder="nuevo paquete 3.4…"></label>'
    + '</div>'
    + '<label class="f"><span>Aprueba</span><input id="m_appr" value="' + esc(cur.approver) + '" placeholder="CCB / patrocinador"></label>';
  openFormModal({ title: id ? ("Editar " + esc((m as ModUi).code)) : "Nueva modificación de alcance", msg: "Se numerará " + (id ? esc((m as ModUi).code) : modCode(nextModNum())) + ".", bodyHTML: body, okText: id ? "Guardar" : "Crear modificación", wide: true })
    .then((ok) => {
      if (!ok) { return; }
      const data = {
        summary: ($("m_sum") as HTMLInputElement).value.trim(), justification: ($("m_just") as HTMLTextAreaElement).value.trim(), date: ($("m_date") as HTMLInputElement).value || todayISO(),
        requestedBy: ($("m_req") as HTMLInputElement).value.trim(), approver: ($("m_appr") as HTMLInputElement).value.trim(), status: ($("m_status") as HTMLSelectElement).value,
        impact: { scope: ($("m_iscope") as HTMLInputElement).value.trim(), schedule: ($("m_isched") as HTMLInputElement).value.trim(), cost: ($("m_icost") as HTMLInputElement).value.trim(), wbs: ($("m_iwbs") as HTMLInputElement).value.trim() }
      };
      if (id) { Object.assign(m as ModUi, data); } else { const nm = normalizeMod(Object.assign({ id: "m" + (state.changeCounter++), code: modCode(nextModNum()) }, data)); state.changes.push(nm); state.activeChangeId = nm.id; }
      clearOvBody(); touch(); showToast(id ? "Modificación actualizada." : "Modificación creada y activada.");
    });
}
function nextModNum(): number { let mx = 0; state.changes.forEach((m) => { const x = /MOD\.0*(\d+)/.exec(m.code || ""); if (x) mx = Math.max(mx, Number(x[1])); }); return mx + 1; }

/* ===================== 05 · Trazabilidad de cambios (diff) ===================== */
function eqArr(a: string[] | undefined, b: string[] | undefined): boolean { const aa = (a || []).slice().sort(), bb = (b || []).slice().sort(); return aa.join("|") === bb.join("|"); }
function renderDiff(): void {
  const host = $("diffHost");
  if (!state.baseline.frozen) {
    host.innerHTML = '<div class="card"><div class="card-b"><div class="empty-state"><div class="big">🧭</div><h3>Sin línea base congelada</h3><p>La comparación entre la línea base y el estado actual estará disponible cuando congeles la línea base en la pestaña « Línea base ».</p></div></div></div>';
    return;
  }
  const snap = state.baseline.snapshot || [], snapById: Record<string, ReqUi> = {}; snap.forEach((s) => { snapById[s.id] = s; });
  const curById: Record<string, ReqUi> = {}; state.items.forEach((it) => { curById[it.id] = it; });
  const added: ReqUi[] = [], modified: Array<{ it: ReqUi; diffs: string[][] }> = [], cancelled: Array<{ it: ReqUi; s: ReqUi }> = [], removed: ReqUi[] = [];
  state.items.forEach((it) => {
    const s = snapById[it.id];
    if (!s) { added.push(it); return; }
    if (it.status === "cancelado" && s.status !== "cancelado") { cancelled.push({ it, s }); return; }
    const diffs: string[][] = [];
    if (it.text !== s.text) diffs.push(["Texto", s.text, it.text]);
    if (it.priority !== s.priority) diffs.push(["Prioridad", lab(PRIOS, s.priority), lab(PRIOS, it.priority)]);
    if (it.type !== s.type) diffs.push(["Tipo", lab(TYPES, s.type), lab(TYPES, it.type)]);
    if (it.status !== s.status) diffs.push(["Estado", lab(STATUS, s.status), lab(STATUS, it.status)]);
    if ((it.acceptanceCriteria || "") !== (s.acceptanceCriteria || "")) diffs.push(["Criterio de aceptación", s.acceptanceCriteria || "—", it.acceptanceCriteria || "—"]);
    if (!eqArr(it.wbsNodeIds, s.wbsNodeIds)) diffs.push(["Enlace EDT", "(cambió)", "(cambió)"]);
    if (!eqArr(it.sourceRanIds, s.sourceRanIds)) diffs.push(["Origen RAN", "(cambió)", "(cambió)"]);
    if (diffs.length) modified.push({ it, diffs });
  });
  snap.forEach((s) => { if (!curById[s.id]) removed.push(s); });

  let h = '<div class="card"><div class="card-h"><div><h3>Trazabilidad de cambios · línea base v' + esc(state.baseline.version) + ' → estado actual</h3>'
    + '<div class="sub">Delta entre la copia inmutable de la línea base y la matriz actual. Cada cambio se atribuye a la modificación (MOD.0X) que lo introdujo.</div></div></div><div class="card-b">';
  h += '<div class="kpis" style="margin-bottom:16px">'
    + kpiBox(added.length, "ALTAS", "requisitos nuevos", "pos")
    + kpiBox(modified.length, "MODIFICADOS", "respecto a la línea base", "mid")
    + kpiBox(cancelled.length, "BAJAS", "dados de baja", "neg")
    + kpiBox(snap.length, "LÍNEA BASE", "requisitos originales") + '</div>';

  if (!added.length && !modified.length && !cancelled.length && !removed.length) {
    h += '<div class="note ok">La matriz coincide con la línea base v' + esc(state.baseline.version) + ': aún no hay cambios registrados.</div>';
  }
  function modTag(it: ReqUi): string { const m = it.changeId ? modById(it.changeId) : null; return m ? ('<span class="obadge mod">' + esc(m.code) + '</span>') : ''; }
  if (added.length) {
    h += '<div class="diff-group"><h4>➕ Altas</h4>';
    added.forEach((it) => { h += '<div class="diff-row add"><div class="dh">' + esc(it.code) + ' ' + modTag(it) + ' — ' + esc(it.text) + '</div><div class="df new">Incorporado a la matriz.</div></div>'; });
    h += '</div>';
  }
  if (modified.length) {
    h += '<div class="diff-group"><h4>✎ Modificados</h4>';
    modified.forEach((o) => {
      const fields = o.diffs.map((d) => '<div class="df"><b>' + esc(d[0]) + ':</b> <span class="old">' + esc(String(d[1]).slice(0, 80)) + '</span> → <span class="new">' + esc(String(d[2]).slice(0, 80)) + '</span></div>').join("");
      h += '<div class="diff-row mod"><div class="dh">' + esc(o.it.code) + ' ' + modTag(o.it) + ' — ' + esc(o.it.text.slice(0, 90)) + '</div>' + fields + '</div>';
    });
    h += '</div>';
  }
  if (cancelled.length) {
    h += '<div class="diff-group"><h4>🚫 Bajas</h4>';
    cancelled.forEach((o) => { h += '<div class="diff-row del"><div class="dh">' + esc(o.it.code) + ' ' + modTag(o.it) + ' — ' + esc(o.it.text) + '</div><div class="df old">Dado de baja (cancelado).</div></div>'; });
    h += '</div>';
  }
  if (removed.length) {
    h += '<div class="diff-group"><h4>🗑 Eliminados</h4>';
    removed.forEach((s) => { h += '<div class="diff-row del"><div class="dh">' + esc(s.code) + ' — ' + esc(s.text) + '</div><div class="df old">Ya no está en la matriz.</div></div>'; });
    h += '</div>';
  }
  h += '</div></div>';
  host.innerHTML = h;
}

/* ===================== Badge flotante ===================== */
function gpiBadge(): void {
  if ($("gpiBadge")) return;
  const name = (gpiOn() && (GPI as GpiApi).meta() && (GPI as GpiApi).meta()!.name) || "—";
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:18px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-bdot{width:8px;height:8px;border-radius:50%;background:#6c5ce7;box-shadow:0 0 0 3px rgba(108,92,231,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#6c5ce7;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#6c5ce7;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.className = "gpi-badge"; bar.id = "gpiBadge";
  bar.innerHTML = '<span class="gpi-bdot"></span><span>Panel: <b>' + String(name).replace(/</g, "&lt;") + '</b></span>'
    + '<button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  (bar.querySelector("#gpiSyncBtn") as HTMLElement).addEventListener("click", function () { save(); const b = this as HTMLElement, t = b.textContent; b.textContent = "✓ Sincronizado"; setTimeout(() => { b.textContent = t; }, 1400); });
}

/* ===================== Init ===================== */
function init(): void {
  load(); renderAll();
  const connected = gpiOn();
  if (connected) loadedProjectId = (GPI as GpiApi).activeId();
  if (!connected || (GPI as GpiApi).getModule("requirements") || state.items.length) { if (connected) save(); } else { $("saveTxt").textContent = "Sin guardar aún: se sincronizará con tu primer cambio"; }
  if (connected) {
    gpiBadge();
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
    if ((GPI as GpiApi).onChange) (GPI as GpiApi).onChange(() => {
      if (loadedProjectId != null && (GPI as GpiApi).activeId() !== loadedProjectId) { markProjectStale(); return; }
      try { const el = document.querySelector("#gpiBadge b"); const m = (GPI as GpiApi).meta(); if (el && m && m.name) el.textContent = m.name; } catch (e) { /* noop */ }
      renderAll();
    });
  }
}
init();

// Exposición explícita en window: el HTML de este módulo usa atributos
// onclick/onchange inline, varios generados dinámicamente en filas/tarjetas
// (ver el comentario detallado en src/modules/cost/main.ts).
Object.assign(window, {
  openItemEditor, loadSampleClick, removeItem, promoteToRan,
  freezeBaseline, rebaseline, openModEditor, setActiveMod, removeMod, setModStatus, updateCcr
});
