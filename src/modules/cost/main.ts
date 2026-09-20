/* ============================================================
   GPI · Planificar la Gestión Financiera (Cost Management Plan) — vanilla JS module (ES6)
   Port mecánico del <script> inline de Cost-management.html (Fase 4 de
   MIGRATION.md): misma lógica, mismo comportamiento. Se agregan tipos y
   se compila a cost.js (IIFE) para que el HTML lo cargue como
   <script src="cost.js"> en vez de tenerlo inline.

   IMPORTANTE — a diferencia de OBS/RACI: el HTML de este módulo usa
   atributos onclick/onchange/oninput INLINE (no addEventListener) para
   ~20 funciones (save, recalcCont, onBaseInput,
   pullFromWBS, pullFromCostEstimate, addCO, coStatus, delCO, buildDoc, coEdit,
   coBaseline, coKindHint, evalVariance, onContMethod, addRange, delRange, rangeEdit,
   pullRangesFromEstimate, pullRangesFromWbs, applyClassRange), incluidas varias generadas dinámicamente en filas de tabla
   (coStatus, coEdit, coBaseline, delCO). Vite
   compila este módulo en su propio closure: esas funciones NO quedan
   accesibles por nombre desde el HTML a menos que se expongan
   explícitamente en window (al final de este archivo). El HTML no se
   reescribe a addEventListener en esta migración -- sería un cambio de
   comportamiento/alcance mayor a "portar a TypeScript".

   Persistencia: modules.cost del proyecto activo (gpi-core.js).
   Respaldo standalone: localStorage["gpi_cost_management_plan"].

   DELIBERADAMENTE NO se usa GPI.ui.esc (ver el mismo comentario en
   src/modules/obs/main.ts): el modo standalone debe seguir funcionando
   sin gpi-core.js.
   ============================================================ */
import type * as GpiCore from "../../core/gpi-core";
import type { ActivitiesModule, CostEstimateModule, CostModule, EditSession, ProjectMeta, WbsModule, WriteResult } from "../../core/types";
import { classifyVariance, validateThresholds, type CostThresholds, type VarianceLevel } from "../../shared/cost-variance";
import {
  contingencyAt, lineProblems, rangeAdvisories, simulateEvents, simulateRange, DEFAULT_CORRELATION, DEFAULT_ITERATIONS, DEFAULT_SEED,
  type EventOutcomes, type RangeLine, type RangeResult
} from "../../shared/range-estimating";
import {
  STATUS_LABEL, normalizePlan as normalizeRiskPlan, normalizeRisk, riskEventsOf, toRiskRef,
  type ExcludedRisk, type Risk, type RiskEvent, type RiskPlan
} from "../../shared/risk-analysis";
import { SAMPLE_PLAN as SAMPLE_RISK_PLAN, buildSampleRisks } from "../../shared/risk-sample";
import { SAMPLE_START_DATE, sampleScheduleModules } from "../../shared/schedule-sample";
import { fmtDays, makeEngine, resolveTargets, type Engine, type Network } from "../../shared/schedule-risk";
import {
  analyzeChangeOrders, contingencyByRisk, orderEffect, planBaselining, validateApproval,
  CO_KIND_HINT, CO_KIND_LABEL, FUND_CONT, FUND_EXTRA,
  type CoAnalysis, type CoBaselineEntry, type CoKind
} from "../../shared/change-orders";

type GpiApi = typeof GpiCore.GPI;
declare global {
  // Este módulo referencia GPI como identificador global bare (no
  // window.GPI), igual que el original: var GPI de gpi-core.js crea una
  // propiedad real de window, accesible por nombre en cualquier scope.
  var GPI: GpiApi | undefined;
}

const STORE_KEY = "gpi_cost_management_plan";

// lo/hi: los mismos extremos del texto "range" en forma numérica (% sobre el estimado). Se usan como
// valor INICIAL sugerido para el rango de cada partida y como referencia para avisar de un análisis
// demasiado optimista (ver shared/range-estimating.ts); no son un resultado del análisis.
interface EstimateClassDef { mat: string; use: string; meth: string; range: string; lo: number; hi: number; desc: string; }

/* ---- Clases de estimado AACE RP 17R-97 (genérico) ---- */
const CLASSES: Record<number, EstimateClassDef> = {
  5: { mat: "0% – 2%", use: "Screening / evaluación conceptual", meth: "Estocástico (paramétrico, capacidad)", range: "-30% / +50% (típico)", lo: -30, hi: 50, desc: "Estimado de orden de magnitud. Mínima definición de ingeniería; se usa para descartar alternativas." },
  4: { mat: "1% – 15%", use: "Estudio de factibilidad", meth: "Predominantemente estocástico", range: "-20% / +40%", lo: -20, hi: 40, desc: "Basado en factores y equipos mayores. Soporta decisiones de continuidad del proyecto." },
  3: { mat: "10% – 40%", use: "Autorización de presupuesto / control base", meth: "Mixto estocástico–determinístico", range: "-15% / +30%", lo: -15, hi: 30, desc: "Semidetallado. Marca el paso de estudio a ejecución; suele ser la base del control." },
  2: { mat: "30% – 75%", use: "Control y oferta / licitación", meth: "Predominantemente determinístico", range: "-10% / +20%", lo: -10, hi: 20, desc: "Detallado por partidas. Usado para control detallado y para ofertar." },
  1: { mat: "65% – 100%", use: "Estimado definitivo / cierre de oferta", meth: "Determinístico (cantidades y precios)", range: "-5% / +15%", lo: -5, hi: 15, desc: "Máxima definición. Verificación final y check estimate." }
};

const CUR: Record<string, string> = { PEN: "S/", USD: "$", EUR: "€" };
function $(id: string): HTMLElement { return document.getElementById(id) as HTMLElement; }
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string)); }

// Una orden de cambio se evalúa en tres ejes que NO se deducen unos de otros (ver
// shared/change-orders.ts): naturaleza (kind), fuente de fondos (fund) y aprobación
// (approver/sponsorAuth). Los campos nuevos son opcionales: los .json antiguos abren igual.
interface ChangeOrder {
  id: string; desc: string; cause: string; cost: number; fund: string; status: string;
  kind?: string; approver?: string; sponsorAuth?: boolean; approvedOn?: string; baselined?: string | null;
  riskId?: string; riskCode?: string;   // vínculo con el Registro de Riesgos (kind = "riesgo")
  [key: string]: unknown; // compatible con CoOrder (shared/change-orders.ts)
}

/* Órdenes de cambio del caso de ejemplo: SOLO se siembran en modo
   independiente (sin gpi-core). Con un proyecto activo, el módulo arranca
   sin órdenes: así abrir la herramienta nunca escribe datos de ejemplo
   en el proyecto del alumno. Cubren las TRES naturalezas: un riesgo materializado
   (contingencia), una ampliación del cliente (cambio de alcance, fondos adicionales)
   y trabajo imprevisto dentro del alcance (reserva de gestión, con sponsor). */
const SAMPLE_CO: ChangeOrder[] = [
  { id: "OC-001", desc: "Refuerzo de cimentación por hallazgo geotécnico", cause: "R-03 Suelo", cost: 180000, fund: "Contingencia", status: "Aprobada", kind: "riesgo", approver: "CCB", sponsorAuth: false, approvedOn: "2026-08-03", riskId: "rk3", riskCode: "R-03" },
  { id: "OC-002", desc: "Ampliación de sala eléctrica solicitada por cliente", cause: "Cambio alcance", cost: 240000, fund: "Financiamiento adicional", status: "Pendiente", kind: "alcance", approver: "", sponsorAuth: false },
  { id: "OC-003", desc: "Demolición de losa existente no identificada en el levantamiento", cause: "No identificado en el RBS", cost: 90000, fund: "Reserva de gestión", status: "Pendiente", kind: "imprevisto", approver: "", sponsorAuth: false }
];

/* Partidas del análisis de rangos del caso de ejemplo: SOLO en modo independiente (igual que las
   órdenes de cambio). Son las 5 fases de la EDT de DISTRIB+ y suman exactamente el costo base
   (S/ 7.100.000), de modo que el análisis por rangos cubre el 100 % del estimado. Sus rangos expresan
   SOLO la incertidumbre del estimado (metrados, precios unitarios): los riesgos discretos del caso
   (R-01…R-10 del Registro de Riesgos) entran aparte como eventos, para no contarlos dos veces. */
const SAMPLE_RANGES: RangeLine[] = [
  { id: "m-1", name: "1 Dirección de Proyecto", ml: 195000, lowPct: -3, highPct: 10, basis: "Costo de personal propio a tarifas vigentes; variación por dedicación." },
  { id: "m-2", name: "2 Ingeniería y Diseño", ml: 355000, lowPct: -5, highPct: 15, basis: "Diseño estructural al 80 %; incertidumbre de los metrados finales de diseño." },
  { id: "m-3", name: "3 Procura", ml: 2950000, lowPct: -4, highPct: 10, basis: "Cotizaciones vigentes de los Proveedores A/B/C: variación de cantidades y de precios unitarios dentro de la vigencia de la oferta (la volatilidad del acero y del tipo de cambio son eventos del registro: R-02, R-04)." },
  { id: "m-4", name: "4 Construcción", ml: 3315000, lowPct: -6, highPct: 18, basis: "Metrados y precios unitarios de subcontratos aún por cerrar (los rendimientos, el suelo, el paro y los vecinos son eventos del registro: R-09, R-03, R-05, R-07)." },
  { id: "m-5", name: "5 Pruebas y Puesta en Marcha", ml: 285000, lowPct: -3, highPct: 10, basis: "Alcance de las pruebas de instalaciones por confirmar con QA/QC." }
];

/* Costo de cada día de extensión del plazo del caso de ejemplo (solo modo independiente): Dirección de Proyecto y gastos
   generales de obra, repartidos en los 273 días laborables del cronograma DISTRIB+. Los rangos de costo de los riesgos
   son DIRECTOS; el costo del retraso lo calcula la simulación como días de extensión × este costo por día. */
const SAMPLE_TIME_COST = 1500;
const SAMPLE_TIME_BASIS = "Dirección de Proyecto y gastos generales de obra (supervisión, alquileres, seguros): ≈ 410.000, el 5,8 % del costo base, repartidos en los 273 días laborables del cronograma.";

interface BudgetComputed { base: number; cont: number; esc: number; bac: number; mgmt: number; total: number; }
type ChangeTotals = CoAnalysis;
interface CostState {
  curClass: number;
  co: ChangeOrder[];
  baselines: CoBaselineEntry[];
  ranges: RangeLine[];          // partidas del análisis de rangos (método «rangos_mc»)
  legacyMethod: string;         // método que declaraba un proyecto antiguo (solo para avisar), "" si no aplica
  _budget?: BudgetComputed;
  _coTotals?: ChangeTotals;
}

const state: CostState = {
  curClass: 3,
  co: [],
  baselines: [],
  ranges: [],
  legacyMethod: ""
};

/* ---------- Tabs ---------- */
$("tabs").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest(".tab") as HTMLElement | null; if (!b) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  b.classList.add("active"); $(b.dataset.p as string).classList.add("active");
  if (b.dataset.p === "p5") { buildDoc(); }
});

/* ---------- Estimate class ---------- */
$("classbar").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null; if (!b) return;
  userEdited = true;
  state.curClass = +(b.dataset.c as string);
  document.querySelectorAll("#classbar button").forEach((x) => x.classList.remove("on"));
  b.classList.add("on"); renderClass(); recalcCont(); save();
});
/* «Referencia por clase y percentil»: tabla DIDÁCTICA de % de contingencia por clase del estimado y
   percentil (a menor madurez del diseño, mayor contingencia para el mismo nivel de confianza).
   OJO: estos porcentajes NO provienen de una norma de AACE -- son una referencia para enseñar el
   efecto de la clase y el percentil, y así se rotulan en pantalla. Antes se presentaban bajo el
   nombre «Simulación Monte Carlo» y citando la 18R-97 (clasificación de estimados para industria de
   proceso, no una metodología de contingencia): auditoría metodológica. La contingencia de un
   estimado se determina con el análisis de rangos + Monte Carlo (RP 41R-08), que sí está implementado. */
const CONT_MATRIX: Record<number, Record<string, number>> = {
  5: { P50: 0.15, P70: 0.25, P80: 0.32, P90: 0.45 },
  4: { P50: 0.10, P70: 0.18, P80: 0.24, P90: 0.32 },
  3: { P50: 0.07, P70: 0.12, P80: 0.16, P90: 0.22 },
  2: { P50: 0.04, P70: 0.08, P80: 0.11, P90: 0.15 },
  1: { P50: 0.02, P70: 0.05, P80: 0.07, P90: 0.10 }
};
function contingencyRate(): number {
  const row = CONT_MATRIX[state.curClass] || CONT_MATRIX[3];
  const key = $("contPct") ? (($("contPct") as HTMLSelectElement).value) : "P70";
  const v = row[key];
  return (typeof v === "number") ? v : row.P70;
}
function renderClass(): void {
  const c = CLASSES[state.curClass];
  $("classDesc").innerHTML = `<b>Clase ${state.curClass}.</b> ${c.desc}`;
  $("cMat").textContent = c.mat; $("cUse").textContent = c.use; $("cMeth").textContent = c.meth; $("cRange").textContent = c.range;
}

/* ---------- Helpers ---------- */
const sym = (): string => CUR[($("cur") as HTMLSelectElement).value] || "S/";
function fmt(n: number | null | undefined): string { if (n == null || !isFinite(n)) return "—"; return sym() + " " + Math.round(n).toLocaleString("es-PE"); }
function fmt2(n: number | null | undefined): string { if (n == null || !isFinite(n)) return "—"; return sym() + " " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/* ---------- Estimación de costos (sincroniza pestañas 01 y 03) ---------- */
function onBaseInput(src: HTMLInputElement): void {
  const other = (src.id === "baseCost" ? $("actCostP1") : $("baseCost")) as HTMLInputElement | null;
  if (other) other.value = src.value;
  save(); recalcCont();
}

/* ---------- Método de contingencia ---------- */
// Auditoría metodológica: se ofrecía «Simulación Monte Carlo» pero se calculaba una tabla fija. Ahora
// cada método es lo que dice ser: rangos + Monte Carlo (RP 41R-08, implementado en
// shared/range-estimating.ts), la tabla se rotula como referencia didáctica, o un % manual del equipo.
type ContMethod = "rangos_mc" | "clase_tabla" | "manual";
const METHOD_LABEL: Record<ContMethod, string> = {
  rangos_mc: "Estimación por rangos + simulación Monte Carlo (AACE 41R-08)",
  clase_tabla: "Referencia por clase y percentil (tabla didáctica, no normativa)",
  manual: "Porcentaje manual definido por el equipo"
};
function contMethod(): ContMethod { const v = ($("contMethod") as HTMLSelectElement).value; return v === "rangos_mc" || v === "manual" ? v : "clase_tabla"; }
const pctNum = (): number => parseInt(($("contPct") as HTMLSelectElement).value.replace(/\D/g, ""), 10) || 70;
function corrValue(): number { const v = parseFloat(($("corrPct") as HTMLInputElement).value); return isFinite(v) ? Math.max(0, Math.min(100, v)) / 100 : DEFAULT_CORRELATION; }
// La simulación es determinista (semilla fija): se memoriza por partidas + correlación para no repetirla en cada tecla.
const simCache: Record<string, RangeResult | null> = {};
// ---- contexto de RIESGOS: el registro del proyecto (conectado) o el caso de ejemplo (independiente) ----
// Costos LEE el Registro de Riesgos, nunca lo escribe: los eventos abiertos y cuantificados entran a la simulación
// de la contingencia, y las órdenes por «riesgo materializado» se vinculan a un riesgo de ese registro.
interface RiskCtx { source: "registro" | "ejemplo" | "sin registro"; risks: Risk[]; plan: RiskPlan; }
function riskCtx(): RiskCtx {
  if (gpiOn()) {
    try {
      const m = (GPI as GpiApi).getModule("risks");
      if (m && Array.isArray(m.risks)) return { source: "registro", risks: m.risks.map((o, i) => normalizeRisk(o, "rk" + (i + 1))), plan: normalizeRiskPlan(m.plan) };
    } catch (e) { /* noop */ }
    return { source: "sin registro", risks: [], plan: normalizeRiskPlan(null) };
  }
  return { source: "ejemplo", risks: buildSampleRisks((c) => "w-" + c), plan: SAMPLE_RISK_PLAN };
}
const riskRefs = (ctx: RiskCtx) => ctx.risks.map((r) => ({ ...toRiskRef(r), plannedMax: r.costImpact.high !== null ? r.costImpact.high : r.costImpact.likely }));
function includeRisksOn(): boolean { const c = document.getElementById("rngRisks") as HTMLInputElement | null; return !c || c.checked; }
// ---- cronograma: la red de actividades y el CPM (AACE 40R-08 / 65R-11: el riesgo de plazo cuesta) ----
// Costos LEE la red, no la escribe: conectado, la del proyecto; independiente, la red DISTRIB+ completa. Se arma
// perezosamente y se invalida cuando otro módulo cambia el proyecto o al volver a esta pestaña.
let net: Network | null = null, eng: Engine | null = null, netDirty = true;
function getEng(): Engine | null {
  if (!netDirty) return eng;
  netDirty = false; net = null; eng = null;
  Object.keys(simCache).forEach((k) => { delete simCache[k]; });   // la red cambió: las simulaciones guardadas ya no valen
  Object.keys(eventOutcomes).forEach((k) => { delete eventOutcomes[k]; });
  try {
    if (typeof GPI === "undefined" || !GPI || !GPI.util || !GPI.util.cpm || !GPI.util.scheduleNetwork) return null;
    if (gpiOn()) net = GPI.util.activeScheduleNetwork();
    else { const m = sampleScheduleModules(); net = GPI.util.scheduleNetwork(m.wbs, m.activities, null, m.schedule, null, SAMPLE_START_DATE); }
    eng = makeEngine(net, GPI.util.cpm);
  } catch (e) { net = null; eng = null; }
  return eng;
}
// Costo de cada día de extensión del plazo (gastos generales, dirección, alquileres): lo que convierte un retraso en costo.
function timeCostPerDay(): number { const el = document.getElementById("rngTimeCost") as HTMLInputElement | null, v = el ? parseFloat(el.value) : 0; return isFinite(v) && v > 0 ? v : 0; }
function finishOf(days: number): string {
  if (typeof GPI === "undefined" || !GPI || !net || !net.startDate) return "";
  try { return GPI.util.addWorkingDays(GPI.util.parseISO(net.startDate), Math.max(0, Math.ceil(days - 1e-9) - 1), net.calendar as { workDayIdx?: number[]; holidays?: string[] }); } catch (e) { return ""; }
}
interface EventsCtx { source: RiskCtx["source"]; events: RiskEvent[]; excluded: ExcludedRisk[]; unmapped: string[]; ev: number; responseCost: number; open: number; }
function eventsCtx(): EventsCtx {
  const c = riskCtx(), g = getEng();
  const e = riskEventsOf(c.risks, c.plan, { targets: (r) => (g ? resolveTargets(r, g).targets.map((t) => t.id) : []) });
  const open = c.risks.filter((r) => r.status !== "materializado" && r.status !== "cerrado");
  return { source: c.source, events: e.events, excluded: e.excluded, unmapped: e.unmapped, ev: e.ev, responseCost: open.reduce((s, r) => s + (r.responseCost || 0), 0), open: open.length };
}
// Los eventos (su costo directo y cuánto extienden el plazo) NO dependen de las partidas, de la correlación ni del costo
// por día: se simulan UNA vez por conjunto de eventos y red (el CPM es lo caro) y se reutilizan en cada recálculo.
const eventOutcomes: Record<string, EventOutcomes> = {};
function outcomesFor(events: RiskEvent[], g: Engine | null): EventOutcomes | undefined {
  if (!events.length) return undefined;
  const key = JSON.stringify([events.map((e) => [e.id, e.prob, e.low, e.likely, e.high, e.sign, e.days, e.targets]), g ? g.base : null]);
  if (!(key in eventOutcomes)) {
    if (Object.keys(eventOutcomes).length > 6) Object.keys(eventOutcomes).forEach((k) => { delete eventOutcomes[k]; });
    eventOutcomes[key] = simulateEvents(events, g ? { base: g.base, duration: (d) => g.duration(d) } : null, DEFAULT_ITERATIONS, DEFAULT_SEED);
  }
  return eventOutcomes[key];
}
// `withSchedule = false` simula solo el costo directo de los eventos (para separar su aporte del costo del retraso).
function simulate(rho: number, withEvents: boolean = includeRisksOn(), withSchedule: boolean = true): RangeResult | null {
  const events = withEvents ? eventsCtx().events : [];
  const g = withEvents ? getEng() : null, cpd = g && withSchedule ? timeCostPerDay() : 0;
  const key = JSON.stringify([state.ranges.map((l) => [l.ml, l.lowPct, l.highPct]), rho, events.map((e) => [e.id, e.prob, e.low, e.likely, e.high, e.sign, e.days, e.targets]), g && withSchedule ? [g.base, cpd] : null]);
  if (!(key in simCache)) {
    if (Object.keys(simCache).length > 24) Object.keys(simCache).forEach((k) => { delete simCache[k]; });
    simCache[key] = simulateRange(state.ranges, {
      correlation: rho, iterations: DEFAULT_ITERATIONS, seed: DEFAULT_SEED, events, outcomes: outcomesFor(events, g),
      schedule: g && withSchedule ? { base: g.base, costPerDay: cpd, duration: (d) => g.duration(d) } : undefined
    });
  }
  return simCache[key];
}
interface ContCalc { cont: number; method: ContMethod; res: RangeResult | null; note: string; }
function contingencyCalc(base: number): ContCalc {
  const m = contMethod();
  if (m === "manual") {
    const p = Math.max(0, parseFloat(($("manualPct") as HTMLInputElement).value) || 0);
    return { cont: base * p / 100, method: m, res: null, note: "Contingencia = <b>" + p + " %</b> del estimado base, definida por el equipo: documenta su fundamento." };
  }
  if (m === "rangos_mc") {
    const res = simulate(corrValue());
    if (!res) return { cont: 0, method: m, res: null, note: "Aún no hay partidas válidas: la contingencia es <b>0</b> hasta definirlas (o traerlas del estimado)." };
    const c = contingencyAt(res, pctNum());
    return { cont: c.amount, method: m, res, note: "Contingencia = <b>P" + pctNum() + "</b> de la simulación (" + (res.events ? "partidas + <b>" + res.events + " evento(s) de riesgo</b>" : "partidas") + ") − estimado base (Σ costo más probable)" + (c.covered ? ": el estimado base ya supera ese percentil, no hace falta reserva." : ".") };
  }
  const rate = contingencyRate();
  return { cont: base * rate, method: m, res: null, note: "Clase <b>" + state.curClass + "</b> · <b>" + ($("contPct") as HTMLSelectElement).value + "</b> → <b>" + (rate * 100).toFixed(1) + " %</b> del estimado base. Es una <b>referencia didáctica</b> (no proviene de una norma de AACE): a menor madurez del diseño, mayor contingencia para el mismo nivel de confianza. Para determinar la contingencia de un estimado usa la <b>estimación por rangos + simulación Monte Carlo</b>." };
}
function renderContUi(calc: ContCalc, base: number): void {
  const hint = document.getElementById("contPctHint");
  if (hint) hint.innerHTML = calc.note + (calc.method === "clase_tabla" && state.legacyMethod
    ? "<br><b>Nota:</b> este proyecto declaraba «" + esc(state.legacyMethod) + "», pero lo que se calculaba era esta referencia por clase y percentil; ahora se rotula como lo que es." : "");
  $("rangeCard").style.display = calc.method === "rangos_mc" ? "block" : "none";
  $("manualWrap").style.display = calc.method === "manual" ? "block" : "none";
  $("contPctWrap").style.display = calc.method === "manual" ? "none" : "block";
  if (calc.method === "rangos_mc") renderRange(calc, base);
}

/* ---------- Análisis de rangos (método «rangos_mc») ---------- */
const sgn = (n: number): string => (n > 0 ? "+" : "") + n;
function curveSvg(res: RangeResult, p: number): string {
  const W = 560, H = 240, l = 58, r = 16, t = 14, b = 40;
  const lo = Math.min(res.curve[0], res.ml), hi = Math.max(res.curve[98], res.ml), span = hi - lo || 1;
  const xs = (v: number): number => l + (v - lo) / span * (W - l - r), ys = (q: number): number => t + (100 - q) / 100 * (H - t - b);
  const path = res.curve.map((v, i) => (i ? "L" : "M") + xs(v).toFixed(1) + "," + ys(i + 1).toFixed(1)).join(" ");
  const short = (v: number): string => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + " M" : Math.round(v).toLocaleString("es-PE");
  // extremos anclados hacia adentro: una etiqueta centrada en el borde del gráfico se recorta
  const xt = [lo, lo + span / 2, hi].map((v, i) => `<text x="${xs(v).toFixed(1)}" y="${H - 22}" text-anchor="${["start", "middle", "end"][i]}" class="rng-tick">${esc(short(v))}</text>`).join("");
  const yt = [0, 25, 50, 75, 100].map((q) => `<line x1="${l}" x2="${W - r}" y1="${ys(q)}" y2="${ys(q)}" class="rng-grid"/><text x="${l - 6}" y="${ys(q) + 3}" text-anchor="end" class="rng-tick">${q}%</text>`).join("");
  const pv = res.p[p], px = xs(pv), py = ys(p), mx = xs(res.ml);
  return `<svg id="rngSvg" viewBox="0 0 ${W} ${H}" class="rng-svg" role="img" aria-label="Curva S del costo total simulado: probabilidad acumulada de no superar cada costo. Estimado base ${esc(short(res.ml))}; P${p} ${esc(short(pv))}.">
    ${yt}${xt}
    <line x1="${mx}" x2="${mx}" y1="${t}" y2="${H - b}" class="rng-base"/><text x="${mx + 4}" y="${t + 10}" class="rng-tick">Base</text>
    <path d="${path}" class="rng-line"/>
    <line x1="${px}" x2="${px}" y1="${py}" y2="${H - b}" class="rng-sel"/><line x1="${l}" x2="${px}" y1="${py}" y2="${py}" class="rng-sel"/>
    <circle cx="${px}" cy="${py}" r="5" class="rng-dot"/><text x="${Math.min(px + 9, W - 40)}" y="${py + 16}" class="rng-tick" font-weight="700">P${p}</text>
    <text x="${(l + W - r) / 2}" y="${H - 4}" text-anchor="middle" class="rng-cap">Costo total del estimado</text>
    <text x="14" y="${(t + H - b) / 2}" text-anchor="middle" class="rng-cap" transform="rotate(-90 14 ${(t + H - b) / 2})">Prob. de no superarlo</text>
    <line id="rngCross" x1="0" x2="0" y1="${t}" y2="${H - b}" class="rng-cross" style="display:none"/>
    <rect id="rngHit" x="${l}" y="${t}" width="${W - l - r}" height="${H - t - b}" fill="transparent"/>
  </svg>`;
}
// Avisos propios de incluir los eventos del registro de riesgos.
function eventAdvisories(): string[] {
  if (!includeRisksOn()) return [];
  const ec = eventsCtx(), out: string[] = [];
  if (ec.source === "sin registro") out.push("Este proyecto no tiene Registro de Riesgos: la contingencia solo cubre la incertidumbre del estimado. Registra los riesgos para incluir los eventos discretos.");
  if (ec.events.length) out.push("Doble conteo: los rangos de las partidas deben expresar solo la incertidumbre del estimado (metrados, precios). Si ya incluyen los eventos del registro (p. ej. precio del acero, suelo, paros), esos riesgos se cuentan dos veces.");
  const g = getEng(), cpd = timeCostPerDay(), delayers = ec.events.filter((e) => e.days && e.targets && e.targets.length).length;
  if (ec.unmapped.length) out.push(!g
    ? "El proyecto no tiene cronograma (actividades y enlaces): el impacto en plazo de " + ec.unmapped.length + " riesgo(s) (" + ec.unmapped.slice(0, 4).join(", ") + (ec.unmapped.length > 4 ? "…" : "") + ") no se refleja, ni tampoco su costo."
    : ec.unmapped.length + " riesgo(s) con impacto en plazo no están ubicados en el cronograma (" + ec.unmapped.slice(0, 4).join(", ") + (ec.unmapped.length > 4 ? "…" : "") + "): su retraso, y el costo de ese retraso, no entran. Indica sus paquetes o actividades en el Registro de Riesgos.");
  if (delayers && cpd <= 0) out.push("Estos riesgos retrasan el proyecto, pero no hay un costo por día de extensión del plazo: ese retraso no se traduce a costo (AACE 40R-08). Defínelo (gastos generales, dirección, alquileres por día).");
  if (delayers && cpd > 0) out.push("Costo del plazo: el rango de costo de cada riesgo debe incluir solo costos DIRECTOS. Lo que depende del tiempo (gastos generales, dirección, alquileres) ya lo calcula la simulación (días de extensión × costo por día); si también está en el rango del riesgo, se cuenta dos veces.");
  if (g && net && net.hasElapsedLags) out.push("La red tiene desfases en días transcurridos («ed»): sin fecha de inicio real el cálculo los aproxima, así que el plazo base puede diferir del de Cronograma/CPM.");
  if (ec.excluded.length) out.push(ec.excluded.length + " riesgo(s) abierto(s) no se pueden cuantificar y no suman a la contingencia: " + ec.excluded.slice(0, 4).map((x) => x.code + " (" + x.reason + ")").join(", ") + (ec.excluded.length > 4 ? "…" : "") + ".");
  if (ec.responseCost > 0) out.push("El costo de las respuestas planificadas (" + fmt(ec.responseCost) + ") debe estar dentro del estimado base o de la línea base, no en la contingencia.");
  return out;
}
// Panel de eventos: qué riesgos entran a la simulación, con qué base (residual / inherente) y cuánto aportan a la contingencia.
function renderEvents(res: RangeResult | null, p: number): void {
  const box = $("rngEvents"), on = includeRisksOn();
  if (!on) { box.innerHTML = `<div class="muted small">Los eventos de riesgo NO se incluyen: la contingencia cubre solo la incertidumbre de las partidas.</div>`; return; }
  const ec = eventsCtx();
  const src = ec.source === "registro" ? "Registro de Riesgos del proyecto" : ec.source === "ejemplo" ? "caso de ejemplo DISTRIB+ (modo independiente)" : "sin Registro de Riesgos";
  if (!ec.events.length) { box.innerHTML = `<div class="muted small"><b>Fuente:</b> ${esc(src)}. ${ec.source === "sin registro" ? "" : "No hay riesgos abiertos con probabilidad e impacto en costo o en plazo cuantificados."}</div>`; return; }
  const g = getEng(), cpd = timeCostPerDay(), s = res ? res.schedule : null;
  const only = simulate(corrValue(), false), direct = simulate(corrValue(), true, false);
  const cA = only ? contingencyAt(only, p).amount : 0, cB = direct ? contingencyAt(direct, p).amount : 0, cC = res ? contingencyAt(res, p).amount : 0;
  // Efecto de un evento sobre el fin del proyecto con su impacto en plazo más probable (el CPM se vuelve a correr).
  const plazoDe = (e: RiskEvent): string => {
    if (!e.days || !e.targets || !e.targets.length || !g) return "—";
    const d: Record<string, number> = {}; e.targets.forEach((id) => { d[id] = e.sign * (e.days as { likely: number }).likely; });
    const dur = g.duration(d);
    return e.days.likely + " d → " + (dur === null ? "—" : fmtDays(Math.round(Math.abs(dur - g.base) * 10) / 10));
  };
  const rows = ec.events.slice(0, 14).map((e) => `<tr><td class="mono">${esc(e.code)}</td><td>${esc(e.title)}</td><td>${e.type === "amenaza" ? "Amenaza" : "Oportunidad"}</td><td class="num">${Math.round(e.prob * 100)} %</td><td class="num">${e.low || e.likely || e.high ? fmt(e.low) + " / " + fmt(e.likely) + " / " + fmt(e.high) : "—"}</td><td class="num">${plazoDe(e)}</td><td class="muted">${esc(e.basis)}</td><td class="num">${e.sign < 0 ? "−" : ""}${fmt(e.prob * (e.low + e.likely + e.high) / 3)}</td></tr>`).join("");
  const showTime = !!s && cpd > 0;
  const sched = s && g ? `<div class="eyebrow" style="margin:14px 0 6px">Plazo con los riesgos (CPM real · reserva de plazo)</div>
    <table class="rng-res" style="max-width:520px"><thead><tr><th>Confianza</th><th class="num">Duración</th><th class="num">Reserva de plazo</th><th>Fin</th></tr></thead><tbody>
      <tr><td>Plan (sin riesgos)</td><td class="num">${fmtDays(s.base)}</td><td class="num">—</td><td>${esc(finishOf(s.base)) || "—"}</td></tr>
      ${[50, 70, 80, 90].map((q) => `<tr class="${q === p ? "rng-selrow" : ""}"><td>P${q}${q === p ? " · decisión" : ""}</td><td class="num">${fmtDays(s.p[q])}</td><td class="num">${fmtDays(Math.max(0, s.p[q] - s.base))}</td><td>${esc(finishOf(s.p[q])) || "—"}</td></tr>`).join("")}</tbody></table>
    <div class="muted" style="font-size:11.5px;margin-top:6px">${s.events} evento(s) retrasan actividades del cronograma · probabilidad de terminar después de lo previsto ${Math.round(s.probDelay * 1000) / 10} % · retraso medio ${fmtDays(Math.round((s.mean - s.base) * 10) / 10)}${cpd > 0 ? " · costo medio de la extensión " + fmt(s.timeCostMean) + " (a " + fmt(cpd) + " por día)" : ""}. Es la misma simulación del Registro de Riesgos (mismos eventos y semilla).</div>` : "";
  box.innerHTML = `<div class="muted small" style="margin-bottom:6px"><b>Fuente:</b> ${esc(src)} · ${ec.open} riesgo(s) abierto(s): <b>${ec.events.length}</b> entran a la simulación${ec.excluded.length ? ", " + ec.excluded.length + " sin cuantificar" : ""}. La contingencia cubre la exposición que <b>queda tras la respuesta</b> (residual).</div>
    <div style="overflow-x:auto"><table class="rng-res"><thead><tr><th>Cód.</th><th>Riesgo</th><th>Tipo</th><th class="num">Prob.</th><th class="num">Costo directo: mín / más prob. / máx</th><th class="num">Plazo: más prob. → fin del proyecto</th><th>Base</th><th class="num">Valor esperado (costo)</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr style="font-weight:700"><td colspan="7">Valor esperado neto de los eventos${ec.events.length > 14 ? " (incluye los " + (ec.events.length - 14) + " no mostrados)" : ""}</td><td class="num">${fmt(ec.ev)}</td></tr></tfoot></table></div>
    <table class="rng-res" style="margin-top:10px;max-width:520px"><thead><tr><th>Contingencia P${p}</th><th class="num">Monto</th></tr></thead><tbody>
      <tr><td>Solo incertidumbre de las partidas</td><td class="num">${fmt(cA)}</td></tr>
      <tr><td>+ aporte de los eventos de riesgo (costo directo)</td><td class="num">${fmt(cB - cA)}</td></tr>
      ${showTime ? `<tr><td>+ costo de la extensión del plazo (días × costo por día)</td><td class="num">${fmt(cC - cB)}</td></tr>` : ""}
      <tr class="rng-selrow"><td>Contingencia total${showTime ? " (partidas + eventos + plazo)" : " (partidas + eventos)"}</td><td class="num">${fmt(cC)}</td></tr></tbody></table>${sched}`;
}
function renderRange(calc: ContCalc, base: number): void {
  const res = calc.res, p = pctNum(), cls = CLASSES[state.curClass];
  const lineIn = (i: number, f: string, v: unknown, w: string, type = "text", extra = ""): string =>
    `<input ${type === "number" ? 'type="number" step="0.1"' : ""} class="rng-in" style="width:${w}" value="${escA(v)}" data-i="${i}" data-f="${f}" onchange="rangeEdit(this)" ${extra}>`;
  $("rngBody").innerHTML = state.ranges.length ? state.ranges.map((l, i) => {
    const pr = lineProblems(l), ml = Number(l.ml);
    const okv = !pr.length;
    return `<tr class="${okv ? "" : "rng-bad"}">
      <td>${lineIn(i, "name", l.name, "100%", "text", 'aria-label="Nombre de la partida"')}</td>
      <td>${lineIn(i, "ml", l.ml, "110px", "number", 'aria-label="Costo más probable"')}</td>
      <td>${lineIn(i, "lowPct", l.lowPct, "70px", "number", 'aria-label="Mínimo en porcentaje"')}</td>
      <td>${lineIn(i, "highPct", l.highPct, "70px", "number", 'aria-label="Máximo en porcentaje"')}</td>
      <td class="num muted">${okv ? fmt(ml * (1 + Number(l.lowPct) / 100)) : "—"}</td><td class="num muted">${okv ? fmt(ml * (1 + Number(l.highPct) / 100)) : "—"}</td>
      <td>${lineIn(i, "basis", l.basis || "", "100%", "text", 'placeholder="Fundamento del rango" aria-label="Fundamento del rango"')}${okv ? "" : `<div class="rng-msg">⚠ ${esc(pr.join("; "))}</div>`}</td>
      <td><button class="btn ghost sm" onclick="delRange(${i})" title="Eliminar partida" aria-label="Eliminar partida">✕</button></td></tr>`;
  }).join("") : `<tr><td colspan="8" class="muted">Sin partidas: agrégalas abajo o tráelas del estimado de costos.</td></tr>`;
  const sumMl = state.ranges.reduce((s, l) => s + (lineProblems(l).length ? 0 : Number(l.ml)), 0);
  $("rngFoot").innerHTML = `<tr style="font-weight:700"><td>Σ partidas</td><td class="num">${fmt(sumMl)}</td><td colspan="6" class="muted" style="font-weight:500;font-size:11.5px">${base ? "Cubren el " + (sumMl / base * 100).toFixed(1) + " % del costo base " + fmt(base) : "Define el costo base"}</td></tr>`;

  const warn = rangeAdvisories(state.ranges, res, base, { lo: cls.lo, hi: cls.hi }).concat(eventAdvisories());
  renderEvents(res, p);
  $("rngWarn").innerHTML = warn.length ? "<b>Revisa:</b><ul>" + warn.map((w) => `<li>${esc(w)}</li>`).join("") + "</ul>" : "";
  $("rngWarn").style.display = warn.length ? "block" : "none";

  if (!res) { $("rngResults").innerHTML = ""; return; }
  const row = (q: number): string => { const c = contingencyAt(res, q); return `<tr class="${q === p ? "rng-selrow" : ""}"><td>P${q}${q === p ? " · decisión" : ""}</td><td class="num">${fmt(res.p[q])}</td><td class="num">${fmt(c.amount)}</td><td class="num">${res.ml ? (c.amount / res.ml * 100).toFixed(1) + " %" : "—"}</td></tr>`; };
  const sens = [0, 0.3, 0.6, 1].map((rho) => { const s = simulate(rho); const c = s ? contingencyAt(s, p).amount : 0; const cur = Math.abs(rho - corrValue()) < 0.005; return `<tr class="${cur ? "rng-selrow" : ""}"><td>${Math.round(rho * 100)} %${cur ? " · actual" : ""}</td><td class="num">${fmt(c)}</td><td class="num">${res.ml ? (c / res.ml * 100).toFixed(1) + " %" : "—"}</td></tr>`; }).join("");
  $("rngResults").innerHTML = `<div class="rng-grid2">
      <div>
        <div class="eyebrow" style="margin:0 0 6px">Distribución del costo total</div>
        <table class="rng-res"><thead><tr><th>Percentil</th><th class="num">Costo total</th><th class="num">Contingencia (P − base)</th><th class="num">% del base</th></tr></thead>
          <tbody>${[10, 50, 70, 80, 90].map(row).join("")}</tbody></table>
        <div class="muted" style="font-size:11.5px;margin-top:6px">Estimado base Σ más probable ${fmt(res.ml)} · media ${fmt(res.mean)} · σ ${fmt(res.sd)} · rango simulado ${fmt(res.min)} – ${fmt(res.max)} · ${res.iterations.toLocaleString("es-PE")} iteraciones · correlación ${Math.round(res.correlation * 100)} % · semilla ${res.seed}</div>
        <div class="eyebrow" style="margin:14px 0 6px">Efecto de la correlación (contingencia P${p})</div>
        <table class="rng-res"><thead><tr><th>Correlación entre partidas</th><th class="num">Contingencia</th><th class="num">% del base</th></tr></thead><tbody>${sens}</tbody></table>
        <div class="muted" style="font-size:11.5px;margin-top:6px">Con correlación 0 % las partidas se tratan como independientes y la dispersión del total se <b>subestima</b>.</div>
      </div>
      <div>${curveSvg(res, p)}<div id="rngHover" class="muted" style="font-size:12px;min-height:18px;margin-top:4px">Pasa el cursor sobre la curva para leer el costo de cada percentil.</div></div>
    </div>`;
  const hit = document.getElementById("rngHit"), cross = document.getElementById("rngCross"), out = document.getElementById("rngHover");
  if (hit && cross && out) {
    const svg = document.getElementById("rngSvg") as unknown as SVGSVGElement;
    const W = 560, l = 58, r = 16, lo = Math.min(res.curve[0], res.ml), hi = Math.max(res.curve[98], res.ml), span = hi - lo || 1;
    hit.addEventListener("mousemove", (e) => {
      const rect = svg.getBoundingClientRect(), vx = (e.clientX - rect.left) / (rect.width || 1) * W;
      const cost = lo + Math.max(0, Math.min(1, (vx - l) / (W - l - r))) * span;
      let q = 1; while (q < 99 && res.curve[q] < cost) q++;                     // primer percentil cuyo costo alcanza el del cursor
      cross.setAttribute("x1", String(vx)); cross.setAttribute("x2", String(vx)); cross.style.display = "";
      out.textContent = "P" + q + ": " + fmt(res.curve[q - 1]) + " · contingencia " + fmt(Math.max(0, res.curve[q - 1] - res.ml));
    });
    hit.addEventListener("mouseleave", () => { cross.style.display = "none"; });
  }
}
function onContMethod(): void { userEdited = true; recalcCont(); save(); }
function addRange(): void {
  userEdited = true;
  const name = ($("rngName") as HTMLInputElement), ml = +($("rngMl") as HTMLInputElement).value;
  if (!name.value.trim() || !(ml > 0)) { name.focus(); name.style.borderColor = "#dc3546"; showToast("Indica el nombre y un costo más probable mayor que cero."); return; }
  name.style.borderColor = "";
  const cls = CLASSES[state.curClass], loI = ($("rngLo") as HTMLInputElement).value, hiI = ($("rngHi") as HTMLInputElement).value;
  state.ranges.push({ id: "m-" + (Date.now().toString(36) + state.ranges.length), name: name.value.trim(), ml,
    lowPct: loI === "" ? cls.lo : +loI, highPct: hiI === "" ? cls.hi : +hiI, basis: ($("rngBasis") as HTMLInputElement).value.trim() });
  name.value = ""; ($("rngMl") as HTMLInputElement).value = ""; ($("rngLo") as HTMLInputElement).value = ""; ($("rngHi") as HTMLInputElement).value = ""; ($("rngBasis") as HTMLInputElement).value = "";
  recalcCont(); save(); flash();
}
function delRange(i: number): void { userEdited = true; state.ranges.splice(i, 1); recalcCont(); save(); }
function rangeEdit(el: HTMLInputElement): void {
  const l = state.ranges[+(el.dataset.i as string)]; if (!l) return;
  userEdited = true;
  const f = el.dataset.f as string;
  if (f === "name") l.name = el.value; else if (f === "basis") l.basis = el.value;
  else (l as unknown as Record<string, number>)[f] = el.value === "" ? NaN : +el.value;
  recalcCont(); save();
}
// Trae partidas por PAQUETE DE TRABAJO. Si la partida ya existía se conserva su rango y su fundamento
// (solo se actualiza el costo); las partidas escritas a mano no se tocan.
function mergePulled(items: Array<{ id: string; name: string; ml: number }>): void {
  const cls = CLASSES[state.curClass], prev = new Map(state.ranges.map((l) => [l.id, l]));
  const pulled: RangeLine[] = items.map((it) => { const old = prev.get(it.id); return old ? { ...old, name: it.name, ml: it.ml } : { id: it.id, name: it.name, ml: it.ml, lowPct: cls.lo, highPct: cls.hi, basis: "" }; });
  state.ranges = pulled.concat(state.ranges.filter((l) => l.id.indexOf("r-") !== 0));
  userEdited = true; recalcCont(); save(); flash();
  showToast(pulled.length + " partida(s) traídas. Los rangos nuevos parten de la clase " + state.curClass + ": ajústalos y fundaméntalos.");
}
function pullRangesFromEstimate(): void {
  if (!gpiOn()) { showToast("Abre este módulo desde el Panel de Control para conectar el estimado."); return; }
  const G = GPI as GpiApi;
  const rows = G.util.costEstimateRows(G.getModule("costEstimate") as CostEstimateModule | null, G.getModule("activities") as ActivitiesModule | null, G.getModule("wbs") as WbsModule | null);
  const by = new Map<string, { name: string; ml: number }>();
  rows.forEach((r) => { if (r.subtotal && r.subtotal > 0) { const k = by.get(r.leafId) || { name: (r.code + " " + r.leafName).trim(), ml: 0 }; k.ml += r.subtotal; by.set(r.leafId, k); } });
  if (!by.size) { showToast("Aún no hay actividades con Cantidad y Precio unitario cargados en Estimar los Costos."); return; }
  mergePulled(Array.from(by, ([id, v]) => ({ id: "r-" + id, name: v.name, ml: Math.round(v.ml) })));
}
function pullRangesFromWbs(): void {
  if (!gpiOn()) { showToast("Abre este módulo desde el Panel de Control para conectar la EDT."); return; }
  const G = GPI as GpiApi, wbs = G.getModule("wbs") as WbsModule | null;
  const items = G.util.wbsLeaves(wbs).map((lf) => ({ id: "r-" + lf.id, name: (lf.code + " " + lf.name).trim(), ml: Math.round(Number((wbs as WbsModule).nodes[lf.id].cost) || 0) })).filter((x) => x.ml > 0);
  if (!items.length) { showToast("La EDT del proyecto activo aún no tiene costos cargados en WBS Builder."); return; }
  mergePulled(items);
}
// Aplica el rango típico de la clase SOLO a las partidas que aún no tienen fundamento (no pisa lo trabajado).
function applyClassRange(): void {
  const cls = CLASSES[state.curClass]; let n = 0;
  state.ranges.forEach((l) => { if (!String(l.basis || "").trim()) { l.lowPct = cls.lo; l.highPct = cls.hi; n++; } });
  userEdited = true; recalcCont(); save();
  showToast(n ? "Rango de la clase " + state.curClass + " aplicado a " + n + " partida(s) sin fundamento." : "Todas las partidas ya tienen fundamento: no se cambió ninguna.");
}

/* ---------- Contingencia / inflación ---------- */
function recalcCont(): void {
  $("fxBandWrap").style.display = ($("fxMode") as HTMLSelectElement).value === "float" ? "block" : "none";
  const base = +($("baseCost") as HTMLInputElement).value || 0;
  const calc = contingencyCalc(base);
  const cont = calc.cont;
  const i = (+($("inflRate") as HTMLInputElement).value || 0) / 100, n = +($("inflYears") as HTMLInputElement).value || 0;
  const escInfl = base * (Math.pow(1 + i, n) - 1);
  let escFx = 0;
  if (($("fxMode") as HTMLSelectElement).value === "float") { escFx = base * ((+($("fxShare") as HTMLInputElement).value || 0) / 100) * ((+($("fxBand") as HTMLInputElement).value || 0) / 100); }
  const escT = escInfl + escFx;
  // Línea base de costos (BAC) = estimado base + contingencia + escalamiento.
  const bac = base + cont + escT;
  // PMBOK: la reserva de gestión es un % de la LÍNEA BASE y queda FUERA de ella.
  const mgmt = bac * ((+($("mgmtPct") as HTMLInputElement).value || 0) / 100);
  const total = bac + mgmt;
  renderContUi(calc, base);
  $("kBase").textContent = fmt(base);
  $("kCont").textContent = fmt(cont); $("kContCap").textContent = calc.method === "manual" ? "manual" : ($("contPct") as HTMLSelectElement).value;
  $("kEsc").textContent = fmt(escT);
  $("kBAC").textContent = fmt(bac);
  $("kMgmt").textContent = fmt(mgmt);
  $("kTotal").textContent = fmt(total);
  $("kContP").textContent = base ? ((cont / base) * 100).toFixed(1) + "%" : "—";
  $("kEscP").textContent = base ? ((escT / base) * 100).toFixed(1) + "%" : "—";
  state._budget = { base, cont, esc: escT, bac, mgmt, total };
  renderCO(); // los saldos de las órdenes dependen del presupuesto recién calculado (y renderCO ya llama buildJSON)
}

/* ---------- Órdenes de cambio ---------- */
// Presupuesto inicial contra el que se validan y analizan las órdenes.
function coBudget(): { bac: number; cont: number; mgmt: number } {
  const b = state._budget; return b ? { bac: b.bac, cont: b.cont, mgmt: b.mgmt } : { bac: 0, cont: 0, mgmt: 0 };
}
const todayISO = (): string => new Date().toISOString().slice(0, 10);
// Como esc(), pero seguro dentro de un atributo entre comillas (value="...").
const escA = (s: unknown): string => esc(s).replace(/"/g, "&quot;");
const kindLabel = (k?: string): string => (k && (CO_KIND_LABEL as Record<string, string>)[k]) || "Sin clasificar";
// Efecto presupuestario de la orden, en palabras (qué cambia en el BAC, las reservas y el total).
function effectText(r: ChangeOrder): string {
  const e = orderEffect(r), sg = (n: number): string => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt2(Math.abs(n)).replace(/^\S+\s/, "");
  if (r.fund === FUND_CONT) return "BAC sin cambio · contingencia " + sg(e.dContingency);
  if (r.fund === FUND_EXTRA) return "BAC " + sg(e.dBac) + " al incorporar · total " + sg(e.dTotal);
  return "BAC " + sg(e.dBac) + " al incorporar · reserva de gestión " + sg(e.dMgmt) + " · total sin cambio";
}
// Opciones de «riesgo vinculado»: las AMENAZAS del registro con su estado (una orden por riesgo materializado
// solo se aprueba cuando el registro lo marca Materializado).
function riskOptions(ctx: RiskCtx, selectedId?: string, selectedCode?: string): string {
  const th = ctx.risks.filter((r) => r.type === "amenaza");
  const opts = th.map((r) => `<option value="${escA(r.id)}" ${r.id === selectedId ? "selected" : ""}>${esc(r.code + " · " + (r.title || "sin título").slice(0, 44) + " (" + STATUS_LABEL[r.status] + ")")}</option>`).join("");
  const orphan = selectedId && !th.some((r) => r.id === selectedId) ? `<option value="${escA(selectedId)}" selected>${esc((selectedCode || "?") + " (no está en el registro)")}</option>` : "";
  return `<option value="">— Vincular riesgo —</option>${opts}${orphan}`;
}
function renderCO(): void {
  const tb = $("coBody"); tb.innerHTML = "";
  const ctx = riskCtx(), refs = riskRefs(ctx);
  state.co.forEach((r, i) => {
    const locked = r.status !== "Pendiente";               // aprobada/rechazada: los datos de aprobación no se editan
    const usesReserve = r.fund !== FUND_CONT;              // reserva de gestión o fondos adicionales: requiere sponsor
    const linked = r.riskId ? ctx.risks.find((x) => x.id === r.riskId) : undefined;
    const riskCell = r.kind !== "riesgo" ? "" : !locked
      ? `<select class="mono" style="padding:3px 5px;max-width:190px;margin-top:5px;font-size:11px" data-i="${i}" data-f="riskId" onchange="coEdit(this)" aria-label="Riesgo vinculado a la orden ${escA(r.id)}">${riskOptions(ctx, r.riskId, r.riskCode)}</select>`
      : `<div class="${r.riskId ? "muted" : "bad-txt"}" style="font-size:11px;margin-top:4px">${r.riskId ? "↳ " + esc(linked ? linked.code + " · " + linked.title : (r.riskCode || "?") + " (no está en el registro)") : "⚠ sin riesgo vinculado"}</div>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(r.id)}</td>
      <td>${esc(r.desc)}</td>
      <td><span class="pill ${r.kind ? "ok" : "bad"}" title="${escA(r.kind ? (CO_KIND_HINT as Record<string, string>)[r.kind] : "Clasifica la orden antes de aprobarla")}">${esc(kindLabel(r.kind))}</span>${riskCell}</td>
      <td class="muted">${esc(r.cause)}</td>
      <td class="num">${fmt2(+r.cost)}</td>
      <td><span class="pill ${r.fund === FUND_CONT ? "ok" : "warn"}">${esc(r.fund)}</span></td>
      <td class="co-appr">
        <input class="mono" style="width:120px;padding:5px 7px" placeholder="Aprobador (CCB…)" value="${escA(r.approver || "")}" data-i="${i}" data-f="approver" onchange="coEdit(this)" ${locked ? "disabled" : ""} aria-label="Quién aprueba la orden ${escA(r.id)}">
        ${usesReserve ? `<label style="display:block;font-size:11px;margin-top:4px"><input type="checkbox" data-i="${i}" data-f="sponsorAuth" onchange="coEdit(this)" ${r.sponsorAuth ? "checked" : ""} ${locked ? "disabled" : ""}> Sponsor autoriza</label>` : ""}
        ${r.approvedOn ? `<div class="muted" style="font-size:11px">${esc(r.approvedOn)}</div>` : ""}
      </td>
      <td><select class="mono" style="padding:5px 8px" data-i="${i}" onchange="coStatus(this)" ${r.baselined ? "disabled" : ""}>
        ${["Pendiente", "Aprobada", "Rechazada"].map((s) => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td class="muted" style="font-size:11.5px">${esc(effectText(r))}</td>
      <td>${r.baselined ? `<span class="pill ok">${esc(r.baselined)}</span>`
        : r.status === "Aprobada" && usesReserve ? `<button class="btn sm" onclick="coBaseline(${i})" title="Incorpora esta orden a la línea base (crea una versión nueva)">Incorporar a la línea base</button>`
        : r.status === "Aprobada" ? `<span class="muted" style="font-size:11.5px">Dentro de la línea base</span>` : "—"}</td>
      <td><button class="btn ghost sm" onclick="delCO(${i})" title="Eliminar orden de cambio" aria-label="Eliminar orden de cambio">✕</button></td>`;
    tb.appendChild(tr);
  });
  const an = analyzeChangeOrders(state.co, coBudget());
  state._coTotals = an;
  $("coTotal").textContent = fmt2(an.approved);
  $("coSplit").textContent = `Contingencia ${fmt2(an.fromContingency)} · Reserva de gestión ${fmt2(an.fromMgmt)} · Financiamiento adicional ${fmt2(an.fromExtra)}`;
  const kp = (lab: string, val: number, cap: string): string => `<div class="kpi"><div class="lab">${lab}</div><div class="val ${val < 0 ? "neg" : "neu"}">${fmt(val)}</div><div class="cap">${cap}</div></div>`;
  $("coKpis").innerHTML =
    kp("BAC vigente", an.bacCurrent, an.bacCurrent === an.bacInitial ? "línea base inicial" : "inicial " + fmt(an.bacInitial) + " + incorporado") +
    kp("Pendiente de incorporar", an.pendingBaseline, "aprobado, aún fuera de la línea base") +
    kp("Contingencia disponible", an.contingencyAvailable, "dentro de la línea base") +
    kp("Reserva de gestión disponible", an.mgmtAvailable, "fuera de la línea base · sponsor");
  $("blBody").innerHTML = state.baselines.length
    ? state.baselines.map((v) => `<tr><td class="mono">${esc(v.version)}</td><td>${esc(v.date)}</td><td>${esc(v.orderIds.join(", "))}</td><td class="num">${fmt2(v.bacBefore)}</td><td class="num">${fmt2(v.bacAfter)}</td><td>${esc(v.approver || "—")}</td></tr>`).join("")
    : `<tr><td class="muted" colspan="6">Sin cambios de línea base: el BAC vigente es el inicial.</td></tr>`;
  renderDrawdown(refs, an.contingencyAvailable);
  buildJSON();
}
// La traza contingencia → riesgo, y la contingencia disponible frente a la exposición residual de los riesgos abiertos.
function renderDrawdown(refs: ReturnType<typeof riskRefs>, available: number): void {
  const dd = contingencyByRisk(state.co, refs), ec = eventsCtx();
  const rows = dd.length ? dd.map((d) => `<tr><td class="mono">${esc(d.code)}</td><td>${esc(d.title)}</td><td class="num">${fmt2(d.contingency)}</td><td class="num">${fmt2(d.other)}</td><td class="num">${fmt2(d.pending)}</td><td class="num">${d.plannedMax === null ? "—" : fmt2(d.plannedMax)}</td><td>${d.orphan ? `<span class="pill bad">Riesgo eliminado</span>` : d.over ? `<span class="pill bad" title="Lo aprobado supera el impacto máximo que el análisis del riesgo había previsto">Supera lo previsto</span>` : `<span class="pill ok">Dentro de lo previsto</span>`}</td></tr>`).join("")
    : `<tr><td class="muted" colspan="7">Ninguna orden está vinculada a un riesgo del registro.</td></tr>`;
  const expo = ec.source === "sin registro" ? "Este proyecto no tiene Registro de Riesgos: no hay exposición residual que contrastar con la contingencia."
    : ec.events.length ? `La contingencia disponible (<b>${fmt(available)}</b>) ${available >= ec.ev ? "supera" : "<b>NO alcanza</b>"} el valor esperado neto de la exposición residual de los riesgos abiertos (<b>${fmt(ec.ev)}</b>, ${ec.events.length} evento(s)). Es una media (≈ P50): una contingencia a un percentil de decisión debe superarla con holgura.`
      : "No hay riesgos abiertos con impacto en costo cuantificado en el registro.";
  $("coDrawdown").innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>Riesgo</th><th>Descripción</th><th class="num">Aprobado con contingencia</th><th class="num">Aprobado con otras fuentes</th><th class="num">Pendiente</th><th class="num">Impacto máx. previsto</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div><div class="note" style="margin-top:10px">${expo}</div>`;
}
// Muestra la guía de la naturaleza elegida al registrar la solicitud, y el selector de riesgo si es un «riesgo materializado».
function coKindHint(): void {
  const k = ($("coKind") as HTMLSelectElement).value as CoKind | "";
  $("coKindHint").textContent = k ? CO_KIND_HINT[k] : "Clasifica el cambio: la naturaleza no decide por sí sola la fuente de fondos.";
  const wrap = $("coRiskWrap"); wrap.style.display = k === "riesgo" ? "block" : "none";
  if (k === "riesgo") {
    const ctx = riskCtx(), n = ctx.risks.filter((r) => r.type === "amenaza").length;
    $("coRisk").innerHTML = riskOptions(ctx);
    $("coRiskHint").textContent = n ? "Un riesgo materializado es uno que ya ESTABA en el registro y ocurrió. La orden solo se aprueba cuando el registro lo marca como Materializado." : "El proyecto no tiene riesgos registrados. Si el evento no estaba en el Registro de Riesgos, no es un riesgo materializado: clasifícalo como trabajo imprevisto dentro del alcance.";
  }
}
function coStatus(sel: HTMLSelectElement): void {
  const r = state.co[+(sel.dataset.i as string)];
  if (r.baselined) { showToast(r.id + " ya está incorporada a la línea base " + r.baselined + ": su estado no se puede cambiar."); renderCO(); return; }
  if (sel.value === "Aprobada") {
    const problems = validateApproval(r, state.co, coBudget(), riskRefs(riskCtx()));
    if (problems.length) { showToast("No se puede aprobar " + r.id + ": " + problems.join("; ") + "."); renderCO(); return; }
    r.approvedOn = todayISO();
  } else { delete r.approvedOn; }
  userEdited = true;
  r.status = sel.value; renderCO(); save();
}
// Datos de aprobación (quién aprueba, autorización del sponsor): solo con la orden Pendiente.
function coEdit(el: HTMLInputElement | HTMLSelectElement): void {
  const r = state.co[+(el.dataset.i as string)]; if (!r || r.status !== "Pendiente") return;
  userEdited = true;
  const f = el.dataset.f;
  if (f === "approver") r.approver = el.value.trim();
  else if (f === "sponsorAuth") r.sponsorAuth = (el as HTMLInputElement).checked;
  else if (f === "riskId") {   // vínculo con el Registro de Riesgos (guarda el id y una foto del código)
    const ref = riskCtx().risks.find((x) => x.id === el.value);
    if (el.value) { r.riskId = el.value; r.riskCode = ref ? ref.code : r.riskCode; } else { delete r.riskId; delete r.riskCode; }
    renderCO();
  }
  save();
}
// Incorporar a la línea base: acción EXPLÍCITA (aprobar no la toca) que deja una versión LB-n.
function coBaseline(i: number): void {
  const r = state.co[i], plan = planBaselining(r, state.co, coBudget(), state.baselines, todayISO());
  if (!plan.ok) { showToast("No se puede incorporar " + r.id + " a la línea base: " + plan.problem + "."); return; }
  userEdited = true;
  r.baselined = plan.entry.version; state.baselines.push(plan.entry);
  renderCO(); save(); flash(); showToast(r.id + " incorporada: " + plan.entry.version + " (BAC " + fmt(plan.entry.bacBefore) + " → " + fmt(plan.entry.bacAfter) + ").");
}
function addCO(): void {
  userEdited = true;
  const descInput = $("coDesc") as HTMLInputElement;
  const desc = descInput.value.trim();
  if (!desc) { descInput.focus(); descInput.style.borderColor = "#dc3546"; return; }
  descInput.style.borderColor = "";
  const kindSel = $("coKind") as HTMLSelectElement;
  if (!kindSel.value) { kindSel.focus(); kindSel.style.borderColor = "#dc3546"; showToast("Clasifica el cambio: riesgo materializado, trabajo imprevisto dentro del alcance o cambio de alcance."); return; }
  kindSel.style.borderColor = "";
  const n = state.co.length + 1;
  const order: ChangeOrder = {
    id: "OC-" + String(n).padStart(3, "0"),
    desc,
    cause: ($("coCause") as HTMLInputElement).value.trim() || "—",
    cost: +($("coCost") as HTMLInputElement).value || 0,
    fund: ($("coFund") as HTMLSelectElement).value,
    status: "Pendiente",
    kind: kindSel.value, approver: "", sponsorAuth: false
  };
  if (kindSel.value === "riesgo") {
    const rid = ($("coRisk") as HTMLSelectElement).value, ref = riskCtx().risks.find((x) => x.id === rid);
    if (rid) { order.riskId = rid; order.riskCode = ref ? ref.code : undefined; } else showToast("Orden registrada sin riesgo vinculado: no podrá aprobarse hasta vincularla con un riesgo del registro.");
  }
  state.co.push(order);
  descInput.value = ""; ($("coCause") as HTMLInputElement).value = ""; ($("coCost") as HTMLInputElement).value = ""; kindSel.value = ""; coKindHint();
  renderCO(); save(); flash(); descInput.focus();
}
function delCO(i: number): void {
  const r = state.co[i];
  if (r.baselined) { showToast(r.id + " ya forma parte de la línea base " + r.baselined + ": no se puede eliminar."); return; }
  if (r.status === "Aprobada") { showToast(r.id + " está Aprobada (fondos comprometidos): devuélvela a Pendiente o Rechazada antes de eliminarla."); return; }
  userEdited = true; state.co.splice(i, 1); renderCO(); save();
}

/* ---------- Documento BOE (recopilación integral) ---------- */
function boeCORows(): string {
  if (!state.co.length) return `<tr><td class="muted" colspan="7">Sin órdenes de cambio registradas</td></tr>`;
  return state.co.map((r) => `<tr>
    <td class="mono">${esc(r.id)}</td><td>${esc(r.desc)}</td><td>${esc(kindLabel(r.kind))}${r.riskCode ? " · " + esc(r.riskCode) : ""}</td><td>${esc(r.cause)}</td>
    <td style="text-align:right" class="mono">${fmt2(+r.cost)}</td><td>${esc(r.fund)}</td>
    <td>${esc(r.status)}${r.status === "Aprobada" ? " · " + esc(r.approver || "—") + (r.sponsorAuth ? " (sponsor)" : "") : ""}${r.baselined ? " · " + esc(r.baselined) : ""}</td></tr>`).join("");
}
// Base de la contingencia en el BOE cuando se determinó por rangos + Monte Carlo (RP 41R-08).
function rangeDocHtml(): string {
  if (contMethod() !== "rangos_mc") return "";
  const res = simulate(corrValue()), p = pctNum();
  const lines = state.ranges.length
    ? state.ranges.map((l) => `<tr><td>${esc(l.name)}</td><td style="text-align:right" class="mono">${fmt(Number(l.ml))}</td><td style="text-align:right" class="mono">${sgn(Number(l.lowPct))} % / ${sgn(Number(l.highPct))} %</td><td>${esc(l.basis || "— (sin fundamento)")}</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">Sin partidas definidas</td></tr>`;
  const ec = includeRisksOn() ? eventsCtx() : null;
  const evTxt = ec && ec.events.length
    ? `Incluye <b>${ec.events.length} evento(s) de riesgo</b> del ${ec.source === "registro" ? "Registro de Riesgos del proyecto" : "caso de ejemplo"} (${esc(ec.events.slice(0, 6).map((e) => e.code).join(", "))}${ec.events.length > 6 ? "…" : ""}), con su riesgo <b>residual</b> cuando está cuantificado; valor esperado neto ${fmt(ec.ev)}.`
    : "No incluye eventos de riesgo discretos (ninguno cuantificado en el registro, o se excluyeron).";
  // Plazo integrado (AACE 65R-11): efecto de los eventos sobre el fin del proyecto y su costo.
  const sc = res && res.schedule, cpd = timeCostPerDay(), basisT = (($("rngTimeBasis") as HTMLInputElement | null) || { value: "" }).value.trim();
  const schedTxt = sc && sc.events
    ? ` <b>Plazo:</b> ${sc.events} evento(s) retrasan actividades del cronograma (CPM real, duración base ${fmtDays(sc.base)}); con P${p} el plazo es ${fmtDays(sc.p[p])} (reserva de plazo ${fmtDays(Math.max(0, sc.p[p] - sc.base))}${finishOf(sc.p[p]) ? ", fin " + esc(finishOf(sc.p[p])) : ""}).${cpd > 0 ? " La extensión del plazo se costea a " + fmt(cpd) + " por día" + (basisT ? " (" + esc(basisT) + ")" : "") + ": costo medio " + fmt(sc.timeCostMean) + ", incluido en la contingencia." : " No se definió un costo por día de extensión: el retraso no se traduce a costo."}`
    : "";
  return `<p style="font-size:12.5px;margin:10px 0 4px"><b>Base de la contingencia — estimación por rangos y simulación Monte Carlo (AACE RP 41R-08 y 40R-08).</b> ${res
    ? `Distribución triangular por partida; correlación entre partidas ${Math.round(res.correlation * 100)} %; ${res.iterations.toLocaleString("es-PE")} iteraciones (semilla ${res.seed}, reproducible). Estimado base Σ más probable ${fmt(res.ml)}; P50 ${fmt(res.p[50])}, P${p} ${fmt(res.p[p])}. Contingencia = P${p} − estimado base = <b>${fmt(contingencyAt(res, p).amount)}</b>. Cubre la incertidumbre de los rangos del estimado. ${evTxt}${schedTxt}`
    : "Aún no hay partidas válidas."}</p>
    <table class="dt"><thead><tr><td style="font-weight:700;color:var(--muted)">Partida</td><td style="font-weight:700;color:var(--muted);text-align:right">Más probable</td><td style="font-weight:700;color:var(--muted);text-align:right">Mín / Máx</td><td style="font-weight:700;color:var(--muted)">Fundamento del rango</td></tr></thead><tbody>${lines}</tbody></table>`;
}
function buildDoc(): void {
  recalcCont();
  const c = CLASSES[state.curClass], b = state._budget || ({} as Partial<BudgetComputed>), t = state._coTotals || ({} as Partial<ChangeTotals>);
  const cpiW = (+($("cpiWarn") as HTMLInputElement).value).toFixed(2), cpiE = (+($("cpiEsc") as HTMLInputElement).value).toFixed(2);
  const cvW = fmt2(+($("cvWarn") as HTMLInputElement).value), cvE = fmt2(+($("cvEsc") as HTMLInputElement).value);
  const fxTxt = ($("fxMode") as HTMLSelectElement).value === "frozen" ? "congelado a fecha base" : "flotante con banda ±" + ($("fxBand") as HTMLInputElement).value + "%";
  $("doc").innerHTML = `
    <div class="doc-h">Plan de Gestión Financiera &amp; Basis of Estimate</div>
    <p class="doc-meta">Generado ${new Date().toLocaleDateString("es-PE")} · Fecha base del estimado: ${esc(($("boeDate") as HTMLInputElement).value) || "—"} · Moneda base: ${esc(($("cur") as HTMLSelectElement).value)} (${sym()}) · Clase AACE: <b>Clase ${state.curClass}</b></p>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">01</span>Reglas normativas del plan (PMBOK 8)</h4>
      <div class="dgrid">
        <table class="dt">
          <tr><td>Moneda base</td><td>${esc(($("cur") as HTMLSelectElement).value)} — ${sym()}</td></tr>
          <tr><td>Método de EV por defecto</td><td>${esc(($("evMethod") as HTMLSelectElement).value)}</td></tr>
        </table>
        <table class="dt">
          <tr><td>Periodicidad de reporte</td><td>${esc(($("reportFreq") as HTMLSelectElement).value)}</td></tr>
          <tr><td>Actualización de pronósticos</td><td>${esc(($("fcastFreq") as HTMLSelectElement).value)}</td></tr>
          <tr><td>Estructuras enlazadas</td><td>WBS · CBS · OBS · RBS</td></tr>
          <tr><td>Code of Accounts</td><td class="mono" style="font-size:11px">[WBS]-[FASE]-[DISC]-[TIPO]-[SEC]</td></tr>
        </table>
      </div>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">02</span>Umbrales de control · KPI de costos</h4>
      <table class="dt">
        <tr><td>CPI — alerta / escalamiento</td><td>≤ ${cpiW}  /  ≤ ${cpiE}</td></tr>
        <tr><td>CV — alerta / escalamiento</td><td>≤ ${cvW}  /  ≤ ${cvE}</td></tr>
        <tr><td>Respuesta al superar el umbral</td><td><b>Alerta:</b> analizar la causa, actualizar el pronóstico y aplicar acciones correctivas (autoridad del director del proyecto). <b>Escalamiento:</b> decisión del sponsor / CCB con el pronóstico actualizado. Una orden de cambio solo se registra si la respuesta modifica la línea base o usa reservas.</td></tr>
      </table>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">03</span>Clase de estimado (AACE RP 17R-97)</h4>
      <table class="dt">
        <tr><td>Clase</td><td>Clase ${state.curClass} — ${esc(c.desc)}</td></tr>
        <tr><td>Madurez del diseño</td><td>${esc(c.mat)}</td></tr>
        <tr><td>Metodología</td><td>${esc(c.meth)}</td></tr>
        <tr><td>Uso previsto</td><td>${esc(c.use)}</td></tr>
        <tr><td>Rango de exactitud típico</td><td>${esc(c.range)}</td></tr>
      </table>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">04</span>Bases del estimado (AACE RP 34R-05)</h4>
      <table class="dt">
        <tr><td>Fecha base</td><td>${esc(($("boeDate") as HTMLInputElement).value) || "—"}</td></tr>
        <tr><td>Fuente de precios</td><td>${esc(($("boeSource") as HTMLInputElement).value) || "—"}</td></tr>
        <tr><td>Supuestos</td><td>${esc(($("boeAssum") as HTMLTextAreaElement).value) || "—"}</td></tr>
        <tr><td>Exclusiones</td><td>${esc(($("boeExcl") as HTMLTextAreaElement).value) || "—"}</td></tr>
        <tr><td>Factores de productividad</td><td>${esc(($("boeProd") as HTMLTextAreaElement).value) || "—"}</td></tr>
      </table>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">05</span>Contingencia, escalation y presupuesto</h4>
      <table class="dt">
        <tr><td>Estimación de costos de las actividades</td><td>${fmt(b.base)}</td></tr>
        <tr><td>Contingencia</td><td>${fmt(b.cont)} — ${esc(METHOD_LABEL[contMethod()])}${contMethod() === "manual" ? "" : ", " + esc((($("contPct") as HTMLSelectElement).selectedOptions[0].text).split(" ")[0])} (${b.base ? ((b.cont as number) / b.base * 100).toFixed(1) : "—"}%)</td></tr>
        ${contMethod() === "clase_tabla" ? `<tr><td></td><td class="muted">Referencia didáctica por clase y percentil: no proviene de una norma de AACE ni de un análisis de riesgo del proyecto.</td></tr>` : ""}
        ${contMethod() === "manual" ? `<tr><td>Fundamento del porcentaje</td><td>${esc(($("manualBasis") as HTMLTextAreaElement).value) || "— (documentar)"}</td></tr>` : ""}
        <tr><td>Escalation / FX</td><td>${fmt(b.esc)} — inflación ${esc(($("inflRate") as HTMLInputElement).value)}% a ${esc(($("inflYears") as HTMLInputElement).value)} años; componente FX ${esc(($("fxShare") as HTMLInputElement).value)}%, TC ${fxTxt}</td></tr>
        <tr><td><b>BAC — línea base de costos${state.baselines.length ? " (inicial)" : ""}</b></td><td><b>${fmt(b.bac)}</b> (excluye reserva de gestión)</td></tr>
        <tr><td>Reserva de gestión</td><td>${fmt(b.mgmt)} — propiedad del sponsor</td></tr>
        <tr><td><b>Presupuesto total</b></td><td><b>${fmt(b.total)}</b></td></tr>
        ${state.baselines.length ? `<tr><td><b>BAC vigente</b></td><td><b>${fmt(t.bacCurrent)}</b> — ${esc(state.baselines[state.baselines.length - 1].version)} (${state.baselines.length} cambio(s) de línea base)</td></tr>` : ""}
      </table>
      ${rangeDocHtml()}
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">06</span>Registro de órdenes de cambio</h4>
      <table class="dt">
        <tr><td style="font-weight:700;color:var(--muted)">ID</td><td style="color:var(--muted);font-weight:700">Descripción · Naturaleza · Causa · Δ Costo · Fondeo · Estado y aprobación</td></tr>
      </table>
      <table class="dt" style="margin-top:2px">
        <thead><tr>
          <td style="width:auto;font-weight:700;color:var(--muted)">ID</td><td style="font-weight:700;color:var(--muted)">Descripción</td>
          <td style="font-weight:700;color:var(--muted)">Naturaleza</td>
          <td style="font-weight:700;color:var(--muted)">Causa</td><td style="font-weight:700;color:var(--muted);text-align:right">Δ Costo</td>
          <td style="font-weight:700;color:var(--muted)">Fondeo</td><td style="font-weight:700;color:var(--muted)">Estado y aprobación</td>
        </tr></thead>
        <tbody>${boeCORows()}</tbody>
      </table>
      <p style="font-size:12.5px;margin:8px 0 0">Total aprobado: <b>${fmt2(t.approved || 0)}</b> — contingencia ${fmt2(t.fromContingency || 0)}, reserva de gestión ${fmt2(t.fromMgmt || 0)}, financiamiento adicional ${fmt2(t.fromExtra || 0)}. Disponible: contingencia ${fmt2(t.contingencyAvailable || 0)}, reserva de gestión ${fmt2(t.mgmtAvailable || 0)}. Aprobado pendiente de incorporar a la línea base: ${fmt2(t.pendingBaseline || 0)}.</p>
      ${state.baselines.length ? `<table class="dt" style="margin-top:6px"><tbody>${state.baselines.map((v) => `<tr><td class="mono">${esc(v.version)}</td><td>${esc(v.date)} · ${esc(v.orderIds.join(", "))} · aprobó ${esc(v.approver || "—")}</td><td style="text-align:right" class="mono">${fmt2(v.bacBefore)} → ${fmt2(v.bacAfter)}</td></tr>`).join("")}</tbody></table>` : ""}
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">07</span>Proceso de cambio y pronósticos</h4>
      <p style="font-size:12.5px;margin:0">Ante una variación que cruce los umbrales anteriores: (1) detectar y clasificar la variación contra los umbrales (una variación no es, por sí sola, una orden de cambio), (2) analizar la causa raíz y actualizar el pronóstico ETC/EAC, (3) decidir la respuesta: acción correctiva o preventiva dentro del plan, uso de la contingencia, o solicitud de cambio si exige modificar la línea base o comprometer la reserva de gestión, (4) si corresponde una orden, clasificar el cambio (riesgo materializado, trabajo imprevisto dentro del alcance o cambio de alcance: no se asume la fuente de fondos), (5) registrarla con su financiación y efecto presupuestario, (6) evaluar en el CCB (el sponsor autoriza el uso de la reserva de gestión o de fondos adicionales) y, solo si se aprueba y se decide, incorporar a la línea base con una versión nueva (LB-n), (7) actualizar ETC/EAC con frecuencia ${esc(($("fcastFreq") as HTMLSelectElement).value).toLowerCase()} y comunicar en el reporte de desempeño.</p>
    </section>`;
  buildJSON();
}

/* ---------- Persistencia ---------- */
function collect(): Record<string, unknown> {
  return {
    meta: { module: "cost_management_plan", version: 2, updated: new Date().toISOString() },
    plan: {
      currency: ($("cur") as HTMLSelectElement).value,
      evMethod: ($("evMethod") as HTMLSelectElement).value, reportFreq: ($("reportFreq") as HTMLSelectElement).value,
      forecastFreq: ($("fcastFreq") as HTMLSelectElement).value,
      thresholds: {
        cpi: { warn: +($("cpiWarn") as HTMLInputElement).value, escalate: +($("cpiEsc") as HTMLInputElement).value },
        cv: { warn: +($("cvWarn") as HTMLInputElement).value, escalate: +($("cvEsc") as HTMLInputElement).value }
      }
    },
    estimate: {
      class: state.curClass, boe: {
        date: ($("boeDate") as HTMLInputElement).value, source: ($("boeSource") as HTMLInputElement).value,
        assumptions: ($("boeAssum") as HTMLTextAreaElement).value, exclusions: ($("boeExcl") as HTMLTextAreaElement).value, productivity: ($("boeProd") as HTMLTextAreaElement).value
      }
    },
    budget: {
      baseCost: +($("baseCost") as HTMLInputElement).value,
      // method guarda el CÓDIGO del método (rangos_mc | clase_tabla | manual); los proyectos antiguos traían una
      // etiqueta libre ("Simulación Monte Carlo"…) que applyData() mapea. rate = lo que realmente se aplicó.
      contingency: {
        method: contMethod(), methodLabel: METHOD_LABEL[contMethod()], percentile: ($("contPct") as HTMLSelectElement).value,
        rate: state._budget && state._budget.base ? state._budget.cont / state._budget.base : 0,
        manualPct: +($("manualPct") as HTMLInputElement).value || 0, manualBasis: ($("manualBasis") as HTMLTextAreaElement).value
      },
      rangeAnalysis: {
        lines: state.ranges, correlation: corrValue(), iterations: DEFAULT_ITERATIONS, seed: DEFAULT_SEED, includeRisks: includeRisksOn(),
        timeCostPerDay: timeCostPerDay(), timeCostBasis: (($("rngTimeBasis") as HTMLInputElement | null) || { value: "" }).value, results: rangeSummary()
      },
      mgmtReservePct: +($("mgmtPct") as HTMLInputElement).value, escalation: {
        inflation: +($("inflRate") as HTMLInputElement).value, years: +($("inflYears") as HTMLInputElement).value,
        fxShare: +($("fxShare") as HTMLInputElement).value, fxMode: ($("fxMode") as HTMLSelectElement).value, fxBand: +($("fxBand") as HTMLInputElement).value
      },
      computed: state._budget || null
    },
    changeOrders: state.co, changeTotals: state._coTotals || null, baselineLog: state.baselines
  };
}
// Resumen guardado del análisis de rangos (la simulación es determinista: se puede recalcular igual).
function rangeSummary(): Record<string, number> | null {
  const r = simulate(corrValue());
  if (!r) return null;
  const out: Record<string, number> = { ml: r.ml, mean: r.mean, sd: r.sd, p10: r.p[10], p50: r.p[50], p70: r.p[70], p80: r.p[80], p90: r.p[90], events: r.events, eventsEV: r.eventsEV };
  if (r.schedule) Object.assign(out, { schedBase: r.schedule.base, schedP50: r.schedule.p[50], schedP70: r.schedule.p[70], schedP80: r.schedule.p[80], schedP90: r.schedule.p[90], schedProbDelay: r.schedule.probDelay, timeCostMean: r.schedule.timeCostMean });
  return out;
}
function buildJSON(): void { $("jsonView").textContent = JSON.stringify(collect(), null, 2); }

/* ---------- Conexión con gpi-core (proyecto activo) ---------- */
function gpiOn(): boolean { try { return typeof GPI !== "undefined" && !!GPI && GPI.available() && !!GPI.active(); } catch (e) { return false; } }

/* Aviso no bloqueante (reemplaza alert(): los diálogos nativos se silencian
   en vistas embebidas/iframes, igual que en los demás módulos del ecosistema). */
function showToast(msg: string): void {
  let t = document.getElementById("gpiToast");
  if (!t) {
    t = document.createElement("div"); t.id = "gpiToast";
    t.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:2000;background:#1A1A1C;color:#fff;font-family:'Manrope',sans-serif;font-size:12.5px;font-weight:600;line-height:1.5;padding:10px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:520px;text-align:center;opacity:0;transition:opacity .2s;pointer-events:none;";
    document.body.appendChild(t);
  }
  const el = t as HTMLElement & { _t?: ReturnType<typeof setTimeout> };
  el.textContent = msg; el.style.opacity = "1";
  clearTimeout(el._t); el._t = setTimeout(() => { el.style.opacity = "0"; }, 3200);
}

function seedFromProject(): void {
  try {
    const meta = (GPI as GpiApi).meta() || ({} as Partial<ProjectMeta>);
    if (meta.currency && CUR[meta.currency]) ($("cur") as HTMLSelectElement).value = meta.currency;
    const wbs = (GPI as GpiApi).getModule("wbs") as WbsModule | null;
    const roll = ((GPI as GpiApi).util && wbs) ? (GPI as GpiApi).util.wbsRollup(wbs) : null;
    // Con proyecto activo la estimación base sale de la EDT real; si aún no
    // hay costos cargados, parte de 0 (no del valor de demostración del HTML).
    const v = (roll && roll.cost > 0) ? Math.round(roll.cost) : 0;
    ($("baseCost") as HTMLInputElement).value = String(v); ($("actCostP1") as HTMLInputElement).value = String(v);
  } catch (e) { /* noop */ }
}
function pullFromWBS(): void {
  if (!gpiOn()) { showToast("Abre este módulo desde el Panel de Control para conectar la EDT."); return; }
  userEdited = true;
  const wbs = (GPI as GpiApi).getModule("wbs") as WbsModule | null;
  const roll = ((GPI as GpiApi).util && wbs) ? (GPI as GpiApi).util.wbsRollup(wbs) : null;
  if (!roll || !roll.cost) { showToast("La EDT del proyecto activo aún no tiene costos cargados en WBS Builder."); return; }
  const v = Math.round(roll.cost); ($("baseCost") as HTMLInputElement).value = String(v); ($("actCostP1") as HTMLInputElement).value = String(v);
  save(); recalcCont(); flash();
}
function pullFromCostEstimate(): void {
  if (!gpiOn()) { showToast("Abre este módulo desde el Panel de Control para conectar la EDT."); return; }
  userEdited = true;
  const wbs = (GPI as GpiApi).getModule("wbs") as WbsModule | null;
  const activities = (GPI as GpiApi).getModule("activities") as ActivitiesModule | null;
  const estimate = (GPI as GpiApi).getModule("costEstimate") as CostEstimateModule | null;
  const total = ((GPI as GpiApi).util && wbs) ? (GPI as GpiApi).util.costEstimateTotal(estimate, activities, wbs) : 0;
  if (!total) { showToast("Aún no hay actividades con Cantidad y Precio unitario cargados en Estimar los Costos."); return; }
  const v = Math.round(total); ($("baseCost") as HTMLInputElement).value = String(v); ($("actCostP1") as HTMLInputElement).value = String(v);
  save(); recalcCont(); flash();
}

/* La rebanada "cost" del proyecto solo se crea tras una edición real del
   usuario (o si ya existía). El autoguardado al salir no debe escribir el
   estado por defecto de la página en un proyecto donde nadie tocó nada. */
let userEdited = false;
["input", "change"].forEach((ev) => document.addEventListener(ev, (e) => { if (e.isTrusted) userEdited = true; }, true));

// Id. del proyecto activo cuando esta pestaña cargó sus datos -- se
// compara contra GPI.activeId() antes de cada guardado (ver save()) para
// nunca escribir esta gestión de costos sobre un proyecto distinto que
// se haya activado desde otra pestaña mientras esta seguía abierta (bug
// real reportado por el usuario, confirmado sistémico en los 13 módulos
// de herramienta).
let loadedProjectId: string | null = null;
let projectStale = false;
function markProjectStale(): void {
  if (projectStale) return;
  projectStale = true;
  const t = $("saveTxt"), d = $("saveDot");
  if (t) t.textContent = "⚠ El proyecto activo cambió en otra pestaña: no se puede guardar aquí";
  if (d) d.style.background = "#dc3546";
}

// Versión de los costos que esta pestaña cargó (ver GPI.openSession): el
// núcleo no sobrescribe si otra pestaña los cambió después.
let session: EditSession | null = null;
// El texto de estado sale del resultado REAL de la escritura (revisión
// externa, hallazgo "media": con un error de cuota forzado el núcleo
// conservaba los cambios pendientes pero esta pantalla decía "Sincronizado
// con el Panel", porque se ignoraba el resultado y se marcaba éxito siempre).
function reportWrite(r: WriteResult): void {
  if (r.status === "rejected" && r.reason === "project-changed") { markProjectStale(); return; }
  $("saveTxt").textContent = (GPI as GpiApi).describeWrite(r, "Estos datos de costos");
  $("saveDot").style.background = "#dc3546";
}

/* ---------- Umbrales de control y evaluación de una variación ---------- */
function thresholds(): CostThresholds {
  const n = (id: string): number => parseFloat(($(id) as HTMLInputElement).value);
  return { cpiWarn: n("cpiWarn"), cpiEsc: n("cpiEsc"), cvWarn: n("cvWarn"), cvEsc: n("cvEsc") };
}
// Escalar debe ser MÁS grave que alertar: se avisa si los umbrales son incoherentes.
function checkThresholds(): void {
  const box = document.getElementById("thrMsg"); if (!box) return;
  const p = validateThresholds(thresholds());
  box.style.display = p.length ? "block" : "none";
  box.innerHTML = p.length ? "<b>⚠ Umbrales incoherentes:</b> " + p.map(esc).join(" · ") : "";
}
const LEVEL_UI: Record<VarianceLevel, { pill: string; label: string }> = {
  green: { pill: "ok", label: "Verde — dentro de tolerancia" }, amber: { pill: "warn", label: "Ámbar — alerta" }, red: { pill: "bad", label: "Rojo — escalamiento" }
};
function evalVariance(): void {
  const raw = (id: string): number | null => { const v = ($(id) as HTMLInputElement).value; return v === "" ? null : parseFloat(v); };
  const box = $("varOut"), r = classifyVariance(raw("varCpi"), raw("varCv"), thresholds());
  if (!r.evaluated || !r.level) { box.innerHTML = "Ingresa un valor para clasificar la variación."; return; }
  const sub = (name: string, l: VarianceLevel | null): string => l ? `${name}: <span class="pill ${LEVEL_UI[l].pill}">${LEVEL_UI[l].label}</span> ` : "";
  box.innerHTML = `<div style="margin-bottom:8px">${sub("CPI", r.cpi)}${sub("CV", r.cv)}</div>
    <div style="margin-bottom:6px"><b>Qué corresponde hacer:</b></div>
    <ol style="margin:0 0 0 18px;padding:0">${r.response.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
}

function save(): void {
  checkThresholds();
  if (gpiOn() && !(GPI as GpiApi).getModule("cost") && !userEdited) { buildJSON(); return; }
  if (gpiOn() && loadedProjectId != null && (GPI as GpiApi).activeId() !== loadedProjectId) { markProjectStale(); return; }
  let synced = false;
  if (gpiOn()) {
    const r = (GPI as GpiApi).saveModule("cost", collect() as unknown as CostModule, session);
    if (!session && r.status === "saved") session = (GPI as GpiApi).openSession("cost");
    if (r.status === "saved" || r.status === "unchanged") { synced = true; $("saveTxt").textContent = "Sincronizado con el Panel"; }
    else { reportWrite(r); $("fcastEcho").textContent = ($("fcastFreq") as HTMLSelectElement).value.toLowerCase(); buildJSON(); return; }
  }
  if (!synced) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(collect()));
      $("saveTxt").textContent = "Guardado " + new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { $("saveTxt").textContent = "Sin persistencia"; $("saveDot").style.background = "#dc3546"; }
  }
  $("fcastEcho").textContent = ($("fcastFreq") as HTMLSelectElement).value.toLowerCase();
  buildJSON();
}
function flash(): void { $("saveDot").style.background = "#00B6EC"; setTimeout(() => $("saveDot").style.background = "#12a56a", 400); }

function applyData(d: any): void {
  if (!d) return;
  const p = d.plan || {}, b = d.budget || {}, e = d.estimate || {};
  if (p.currency) ($("cur") as HTMLSelectElement).value = p.currency;
  if (p.evMethod) ($("evMethod") as HTMLSelectElement).value = p.evMethod;
  if (p.reportFreq) ($("reportFreq") as HTMLSelectElement).value = p.reportFreq;
  if (p.forecastFreq) ($("fcastFreq") as HTMLSelectElement).value = p.forecastFreq;
  if (p.thresholds) {
    const th = p.thresholds;
    if (th.cpi) { ($("cpiWarn") as HTMLInputElement).value = th.cpi.warn; ($("cpiEsc") as HTMLInputElement).value = th.cpi.escalate; }
    if (th.cv) { ($("cvWarn") as HTMLInputElement).value = th.cv.warn; ($("cvEsc") as HTMLInputElement).value = th.cv.escalate; }
  }
  if (e.class) state.curClass = e.class;
  if (e.boe) {
    ($("boeDate") as HTMLInputElement).value = e.boe.date || ""; ($("boeSource") as HTMLInputElement).value = e.boe.source || "";
    ($("boeAssum") as HTMLTextAreaElement).value = e.boe.assumptions || ""; ($("boeExcl") as HTMLTextAreaElement).value = e.boe.exclusions || ""; ($("boeProd") as HTMLTextAreaElement).value = e.boe.productivity || "";
  }
  if (b.baseCost) { ($("baseCost") as HTMLInputElement).value = b.baseCost; ($("actCostP1") as HTMLInputElement).value = b.baseCost; }
  if (b.contingency) {
    const m = b.contingency.method;
    if (m === "rangos_mc" || m === "clase_tabla" || m === "manual") ($("contMethod") as HTMLSelectElement).value = m;
    else if (m) { // proyecto antiguo: declaraba «Simulación Monte Carlo» u otro, pero calculaba la tabla por clase
      ($("contMethod") as HTMLSelectElement).value = "clase_tabla"; state.legacyMethod = String(m);
    }
    if (b.contingency.manualPct != null) ($("manualPct") as HTMLInputElement).value = b.contingency.manualPct;
    if (b.contingency.manualBasis) ($("manualBasis") as HTMLTextAreaElement).value = b.contingency.manualBasis;
    let pc = b.contingency.percentile;
    // compatibilidad con proyectos guardados con el esquema antiguo (0.06/0.10/0.15/0.20)
    if (typeof pc === "number" || /^0?\./.test(String(pc))) pc = ({ "0.06": "P50", "0.1": "P70", "0.10": "P70", "0.15": "P80", "0.2": "P90", "0.20": "P90" } as Record<string, string>)[String(pc)] || "P70";
    if (pc) ($("contPct") as HTMLSelectElement).value = pc;
  }
  if (b.mgmtReservePct != null) ($("mgmtPct") as HTMLInputElement).value = b.mgmtReservePct;
  if (b.escalation) {
    const x = b.escalation; ($("inflRate") as HTMLInputElement).value = x.inflation; ($("inflYears") as HTMLInputElement).value = x.years;
    ($("fxShare") as HTMLInputElement).value = x.fxShare; ($("fxMode") as HTMLSelectElement).value = x.fxMode; ($("fxBand") as HTMLInputElement).value = x.fxBand;
  }
  if (b.rangeAnalysis) {
    const ra = b.rangeAnalysis;
    if (Array.isArray(ra.lines)) {
      state.ranges = ra.lines.map((l: Record<string, unknown>, i: number): RangeLine => ({ id: String(l.id || "m-" + i), name: String(l.name || ""), ml: Number(l.ml), lowPct: Number(l.lowPct), highPct: Number(l.highPct), basis: String(l.basis || "") }));
    }
    if (ra.correlation != null && isFinite(Number(ra.correlation))) ($("corrPct") as HTMLInputElement).value = String(Math.round(Number(ra.correlation) * 100));
    // Proyectos guardados antes de incluir los eventos de riesgo no traen el campo: se leen como «incluidos» (el valor por omisión).
    if (ra.includeRisks === false) ($("rngRisks") as HTMLInputElement).checked = false;
    // Campos de la integración con el cronograma: los proyectos guardados antes no los traen y se leen como «sin costo por día».
    if (ra.timeCostPerDay != null && isFinite(Number(ra.timeCostPerDay))) ($("rngTimeCost") as HTMLInputElement).value = String(ra.timeCostPerDay > 0 ? ra.timeCostPerDay : "");
    if (ra.timeCostBasis != null) ($("rngTimeBasis") as HTMLInputElement).value = String(ra.timeCostBasis);
  }
  if (d.changeOrders) state.co = d.changeOrders;
  if (Array.isArray(d.baselineLog)) state.baselines = d.baselineLog; // .json antiguos: sin versiones de línea base
}
function load(): void {
  if (gpiOn()) {
    const d = (GPI as GpiApi).getModule("cost");
    if (d) applyData(d); else seedFromProject();   // primera conexión con este proyecto: sin órdenes de ejemplo
    return;
  }
  // Modo independiente (sin gpi-core): demo autocontenida con caso de ejemplo.
  let d; try { d = JSON.parse(localStorage.getItem(STORE_KEY) as string); } catch (e) { /* noop */ }
  if (d) applyData(d);
  else {
    state.co = JSON.parse(JSON.stringify(SAMPLE_CO)); state.ranges = JSON.parse(JSON.stringify(SAMPLE_RANGES));
    ($("rngTimeCost") as HTMLInputElement).value = String(SAMPLE_TIME_COST); ($("rngTimeBasis") as HTMLInputElement).value = SAMPLE_TIME_BASIS;
  }
}
/* ---------- Barra de proyecto (badge flotante) ---------- */
function gpiBadge(): void {
  if (document.getElementById("gpiBadge")) return;
  const name = (gpiOn() && (GPI as GpiApi).meta() && (GPI as GpiApi).meta()!.name) || "—";
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:18px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-bdot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div");
  bar.className = "gpi-badge"; bar.id = "gpiBadge";
  bar.innerHTML = '<span class="gpi-bdot"></span><span>Panel: <b>' + String(name).replace(/</g, "&lt;") + "</b></span>"
    + '<button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  (bar.querySelector("#gpiSyncBtn") as HTMLElement).addEventListener("click", function () {
    save(); const b = bar.querySelector("#gpiSyncBtn") as HTMLElement, t = b.textContent; b.textContent = "✓ Sincronizado";
    setTimeout(function () { b.textContent = t; }, 1400);
  });
}

/* ---------- Init ---------- */
function init(reload: boolean): void {
  session = gpiOn() ? (GPI as GpiApi).openSession("cost") : null; // en el mismo instante en que load() lee el dato
  load();
  const connected = gpiOn();
  if (connected) loadedProjectId = (GPI as GpiApi).activeId();
  const pw1 = document.getElementById("pullWbs1"), pw3 = document.getElementById("pullWbs3");
  if (pw1) pw1.style.display = connected ? "inline-flex" : "none";
  if (pw3) pw3.style.display = connected ? "inline-flex" : "none";
  const pe1 = document.getElementById("pullEst1"), pe3 = document.getElementById("pullEst3");
  if (pe1) pe1.style.display = connected ? "inline-flex" : "none";
  if (pe3) pe3.style.display = connected ? "inline-flex" : "none";
  ["pullRngEst", "pullRngWbs"].forEach((id) => { const b = document.getElementById(id); if (b) b.style.display = connected ? "inline-flex" : "none"; });
  document.querySelectorAll("#classbar button").forEach((x) => x.classList.toggle("on", +(x as HTMLElement).dataset.c! === state.curClass));
  renderClass(); renderCO(); recalcCont(); buildDoc(); checkThresholds();
  // Guardar solo si ya existe la rebanada "cost" del proyecto (o si estamos en
  // modo independiente). Con solo ABRIR la página no se crea el módulo: eso
  // evitaba antes que el Panel mostrara un BAC fantasma sin acción del alumno.
  if (!connected || (GPI as GpiApi).getModule("cost")) { save(); }
  else { $("saveTxt").textContent = "Sin guardar aún: se sincronizará con tu primer cambio"; buildJSON(); }
  if (connected) {
    gpiBadge();
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", function () { if (document.hidden) save(); else { netDirty = true; recalcCont(); } });
    // Reactividad entre pestañas: si cambian los metadatos o la EDT en otra
    // pestaña, refresca el nombre del proyecto que muestra el badge flotante.
    if ((GPI as GpiApi).onChange) (GPI as GpiApi).onChange(function () {
      netDirty = true;   // el cronograma (actividades, enlaces, calendario) lo editan otros módulos
      if (loadedProjectId != null && (GPI as GpiApi).activeId() !== loadedProjectId) { markProjectStale(); return; }
      try {
        const el = document.querySelector("#gpiBadge b"); const m = (GPI as GpiApi).meta();
        if (el && m && m.name) el.textContent = m.name;
      } catch (e) { /* noop */ }
      // El Registro de Riesgos puede haber cambiado en otra pestaña: la contingencia, los vínculos y la traza lo leen de ahí.
      // Solo se recalcula (no se guarda): no es una edición de esta pestaña. Se omite si hay un campo del formulario en edición.
      const ae = document.activeElement;
      if (!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) recalcCont();
    });
  }
  if (reload) { (document.querySelector('[data-p="p1"]') as HTMLElement).click(); }
}
init(false);

// Exposición explícita en window: el HTML de este módulo usa atributos
// onclick/onchange/oninput inline (ver el comentario de cabecera de este
// archivo) que buscan estas funciones POR NOMBRE en el ámbito global.
// Sin esto, Vite las deja encerradas en el closure del bundle y cada
// clic tira "x is not defined".
Object.assign(window, { save, recalcCont, onBaseInput, pullFromWBS, pullFromCostEstimate, addCO, coStatus, delCO, buildDoc, coEdit, coBaseline, coKindHint, evalVariance, onContMethod, addRange, delRange, rangeEdit, pullRangesFromEstimate, pullRangesFromWbs, applyClassRange });
