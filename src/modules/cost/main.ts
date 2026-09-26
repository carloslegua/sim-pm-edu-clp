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
import { installGpiBadge } from "../../shared/gpi-badge";
import { todayLocalISO } from "../../shared/local-date";
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
import { ACCURACY_SOURCE, accuracyOriginText, accuracyRange, appliedAccuracy, classAdvisory, definitionMaturity, normalizeAccuracyOverride, overrideProblem, pct as pctTxt, publishedBandText, type AccuracyOverride, type EstimateClass, type MaturityInput } from "../../shared/estimate-class";
import { SAMPLE_START_DATE, sampleScheduleModules, sampleSchedulePlan } from "../../shared/schedule-sample";
import { fmtDays, makeEngine, resolveTargets, type Engine, type Network } from "../../shared/schedule-risk";
import type { PertDur } from "../../shared/range-estimating";
import {
  analyzeChangeOrders, contingencyByRisk, orderEffect, planBaselining, requiredAuthority, validateApproval,
  CO_KIND_HINT, CO_KIND_LABEL, FUND_CONT, FUND_EXTRA, FUND_MGMT,
  type CoAnalysis, type CoBaselineEntry, type CoKind
} from "../../shared/change-orders";
import { AUTH_LABEL, AUTH_LEVELS, authLevelOf, contingencyAlert, hasTiers, levelCovers, tiersText, type AuthLevel, type ReservePolicy as ReservePolicyT } from "../../shared/reserve-policy";
import {
  ACCOUNT_IDS, ACCOUNT_LABEL, DEFAULT_MIX, PROVISIONS, PROVISION_LABEL, blankEscPlan, escalate, escalationAdvisories, fxExposure, horizonYears, normalizeEscPlan,
  provisionFactor, simpleEscalation, simpleMethodAdvisory, simulateEscalation, type Advisory, type EscPackage, type EscPlan, type EscResult, type EscSim
} from "../../shared/escalation";
import { buildSampleEscPlan } from "../../shared/escalation-sample";
import { CHECKLIST_ITEMS, GROUPS, SECTIONS, STATUSES, STATUS_LABEL as BOE_STATUS_LABEL, blankBoe, boeFindings, completeness, normalizeBoe, serializeBoe, type Boe, type BoeCtx, type BoeFacts, type BoeSection } from "../../shared/boe";
import { SAMPLE_CAPEX, buildSampleBoe } from "../../shared/boe-sample";
import { EVM_SAMPLE_COSTS } from "../../shared/evm-sample";
import { packageBudgets } from "../../shared/evm-reference";
import { SAMPLE_CASE_LEAVES } from "../../shared/case-distribplus";
import { normalizeBaseline } from "../../shared/schedule-control";

type GpiApi = typeof GpiCore.GPI;
declare global {
  // Este módulo referencia GPI como identificador global bare (no
  // window.GPI), igual que el original: var GPI de gpi-core.js crea una
  // propiedad real de window, accesible por nombre en cualquier scope.
  var GPI: GpiApi | undefined;
}

const STORE_KEY = "gpi_cost_management_plan";

// Los extremos del rango de exactitud NO viven aquí: se resuelven con classAccuracy() (shared/estimate-class.ts), que
// distingue la banda publicada por AACE 56R-08 (edificación), el parámetro didáctico del simulador y el ajuste
// declarado por el proyecto. Sirven como valor INICIAL sugerido para el rango de cada partida y como referencia para
// avisar de un análisis demasiado optimista (ver shared/range-estimating.ts); no son un resultado del análisis.
interface EstimateClassDef { mat: string; use: string; meth: string; desc: string; }

/* ---- Clases de estimado AACE RP 17R-97 (genérico): madurez, uso y método ---- */
const CLASSES: Record<number, EstimateClassDef> = {
  5: { mat: "0% – 2%", use: "Screening / evaluación conceptual", meth: "Estocástico (paramétrico, capacidad)", desc: "Estimado de orden de magnitud. Mínima definición de ingeniería; se usa para descartar alternativas." },
  4: { mat: "1% – 15%", use: "Estudio de factibilidad", meth: "Predominantemente estocástico", desc: "Basado en factores y equipos mayores. Soporta decisiones de continuidad del proyecto." },
  3: { mat: "10% – 40%", use: "Autorización de presupuesto / control base", meth: "Mixto estocástico–determinístico", desc: "Semidetallado. Marca el paso de estudio a ejecución; suele ser la base del control." },
  2: { mat: "30% – 75%", use: "Control y oferta / licitación", meth: "Predominantemente determinístico", desc: "Detallado por partidas. Usado para control detallado y para ofertar." },
  1: { mat: "65% – 100%", use: "Estimado definitivo / cierre de oferta", meth: "Determinístico (cantidades y precios)", desc: "Máxima definición. Verificación final y check estimate." }
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
  // Paquete de la EDT que ejecuta el cambio (opcional: las órdenes anteriores no lo traen). Al aprobarse con contingencia, o al incorporarse
  // a la línea base, su monto pasa al presupuesto de ese paquete en Valor Ganado (shared/evm-reference.ts, approvedTransfers).
  wbsId?: string; wbsCode?: string;
  [key: string]: unknown; // compatible con CoOrder (shared/change-orders.ts)
}

/* Órdenes de cambio del caso de ejemplo: SOLO se siembran en modo
   independiente (sin gpi-core). Con un proyecto activo, el módulo arranca
   sin órdenes: así abrir la herramienta nunca escribe datos de ejemplo
   en el proyecto del alumno. Cubren las TRES naturalezas: un riesgo materializado
   (contingencia), una ampliación del cliente (cambio de alcance, fondos adicionales)
   y trabajo imprevisto dentro del alcance (reserva de gestión, con sponsor). */
const SAMPLE_CO: ChangeOrder[] = [
  { id: "OC-001", desc: "Refuerzo de cimentación por hallazgo geotécnico", cause: "R-03 Suelo", cost: 180000, fund: "Contingencia", status: "Aprobada", kind: "riesgo", approver: "CCB", authLevel: "ccb", sponsorAuth: false, approvedOn: "2026-09-02", riskId: "rk3", riskCode: "R-03", wbsId: "w-4.2", wbsCode: "4.2" },
  { id: "OC-002", desc: "Ampliación de sala eléctrica solicitada por cliente", cause: "Cambio alcance", cost: 240000, fund: "Financiamiento adicional", status: "Pendiente", kind: "alcance", approver: "", sponsorAuth: false, wbsId: "w-4.5", wbsCode: "4.5" },
  { id: "OC-003", desc: "Demolición de losa existente no identificada en el levantamiento", cause: "No identificado en el RBS", cost: 90000, fund: "Reserva de gestión", status: "Pendiente", kind: "imprevisto", approver: "", sponsorAuth: false, wbsId: "w-4.1", wbsCode: "4.1" }
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

// `esc` = escalación + tipo de cambio (compatibilidad con lo guardado: BAC = base + contingencia + esc); AACE los separa: `escIdx` y `fx`.
interface BudgetComputed { base: number; cont: number; esc: number; escIdx?: number; fx?: number; bac: number; mgmt: number; total: number; }
type ChangeTotals = CoAnalysis;
interface CostState {
  curClass: number;
  acc: AccuracyOverride | null; // ajuste del rango de exactitud declarado por el proyecto (con su justificación); null = el didáctico
  co: ChangeOrder[];
  baselines: CoBaselineEntry[];
  ranges: RangeLine[];          // partidas del análisis de rangos (método «rangos_mc»)
  legacyMethod: string;         // método que declaraba un proyecto antiguo (solo para avisar), "" si no aplica
  boe: Boe;                     // Basis of Estimate (AACE 34R-05): texto por sección, estado de aprobación, equipo, documentos y anexo A
  esc: EscPlan;                 // escalación por índices (AACE 58R-10 / 68R-11); la fecha base de precios es la de la BOE (`boeDate`)
  _budget?: BudgetComputed;
  _coTotals?: ChangeTotals;
  _escCalc?: EscCalc;
}

const state: CostState = {
  curClass: 3,
  acc: null,
  co: [],
  baselines: [],
  ranges: [],
  legacyMethod: "",
  boe: blankBoe(),
  esc: blankEscPlan()
};

/* ---------- Tabs ---------- */
$("tabs").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest(".tab") as HTMLElement | null; if (!b) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  b.classList.add("active"); $(b.dataset.p as string).classList.add("active");
  if (b.dataset.p === "p5") { buildDoc(); } else if (b.dataset.p === "p2") { refreshBoe(); }
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
// Rango de exactitud vigente de la clase declarada: ajuste del proyecto (si es válido) o parámetro didáctico.
function classAccuracy(): ReturnType<typeof appliedAccuracy> { return appliedAccuracy(state.curClass as EstimateClass, state.acc); }
function renderClass(): void {
  const c = CLASSES[state.curClass], a = classAccuracy();
  $("classDesc").innerHTML = `<b>Clase ${state.curClass}.</b> ${c.desc}`;
  $("cMat").textContent = c.mat; $("cUse").textContent = c.use; $("cMeth").textContent = c.meth;
  $("cRange").textContent = `${pctTxt(a.lo)} / ${pctTxt(a.hi)}`; $("cRangeOrigin").textContent = accuracyOriginText(a);
  $("cRangePub").textContent = publishedBandText(state.curClass as EstimateClass);
  const prob = overrideProblem(state.acc);
  $("accNotes").innerHTML = (prob ? `<div class="note" style="border-color:#dc3546;background:#fdecef"><b>⚠</b> ${esc(prob)} Mientras tanto se usa el parámetro didáctico.</div>` : "") + a.notes.filter((n) => !prob || !n.startsWith("El ajuste")).map((n) => `<div class="muted small" style="margin-top:4px">${esc(n)}</div>`).join("");
  renderMaturity();
}
// Los campos se rellenan SOLO al cargar datos o al volver al didáctico: si se rellenaran en cada render se borraría lo que el alumno aún está escribiendo.
function fillAccuracyForm(): void { const ov = state.acc; ($("accLo") as HTMLInputElement).value = ov ? String(ov.lo) : ""; ($("accHi") as HTMLInputElement).value = ov ? String(ov.hi) : ""; ($("accWhy") as HTMLInputElement).value = ov ? ov.why : ""; }
function readAccuracyForm(): void {
  const lo = ($("accLo") as HTMLInputElement).value.trim(), hi = ($("accHi") as HTMLInputElement).value.trim(), why = ($("accWhy") as HTMLInputElement).value;
  userEdited = true;
  state.acc = lo === "" && hi === "" && !why.trim() ? null : normalizeAccuracyOverride({ lo: lo === "" ? null : lo, hi: hi === "" ? null : hi, why });
  renderClass(); recalcCont(); save();
}
["accLo", "accHi", "accWhy"].forEach((id) => $(id).addEventListener("change", readAccuracyForm));
$("accClear").addEventListener("click", () => { state.acc = null; userEdited = true; fillAccuracyForm(); renderClass(); recalcCont(); save(); });

/* ---------- Madurez de la definición y clase del estimado (AACE 17R-97 / 56R-08) ---------- */
// La clase RESULTA de la madurez de la definición del proyecto: se estima con lo que la suite conoce (orientativo) y se
// contrasta con la clase declarada. Solo con un proyecto conectado: en modo independiente no hay datos que evaluar.
function maturityInputs(): MaturityInput | null {
  if (!gpiOn()) return null;
  const G = GPI as GpiApi;
  try {
    const ch = G.getModule("charter"), sc = G.getModule("scopeStatement"), rq = G.getModule("requirements"), wbs = G.getModule("wbs"), act = G.getModule("activities"), est = G.getModule("costEstimate");
    const leaves = G.util.wbsLeaves(wbs).length, ra = rq ? G.util.requirementsAudit(rq, ch, wbs) : null;
    const rows = G.util.costEstimateRows(est, act, wbs);
    getEng();
    const acts = net ? net.nodes.filter((n) => !n.isMilestone) : [], linked = new Set<string>();
    if (net) net.links.forEach((l) => { linked.add(l.from); linked.add(l.to); });
    return {
      charter: ch ? G.util.charterAudit(ch).pct / 100 : 0,
      scope: sc ? G.util.scopeAudit(sc, rq, ch, wbs).decompPct / 100 : 0,
      requirements: ra && ra.total ? (ra.baselineFrozen ? 0.5 : 0) + ra.tracePct / 100 * 0.5 : 0,
      wbs: leaves ? 1 : 0,
      activities: leaves ? G.util.activitiesStats(act, wbs).pct / 100 : 0,
      pricing: rows.length ? rows.filter((r) => r.subtotal != null && r.subtotal > 0).length / rows.length : 0,
      schedule: acts.length ? acts.filter((n) => linked.has(n.id)).length / acts.length : 0
    };
  } catch (e) { return null; }
}
function renderMaturity(): void {
  const box = document.getElementById("clsMaturity"); if (!box) return;
  const inp = maturityInputs();
  if (!inp) { box.innerHTML = `<div class="note">La clase de un estimado <b>resulta de la madurez de la definición del proyecto</b> (AACE 17R-97). Con un proyecto conectado se estima esa madurez con los datos de la suite (acta, alcance, requisitos, EDT, actividades, precios y cronograma) y se contrasta con la clase que elijas.</div>`; return; }
  const m = definitionMaturity(inp), adv = classAdvisory(state.curClass as EstimateClass, m.pct);
  const rows = m.items.map((i) => `<tr><td>${esc(i.label)}<div class="muted" style="font-size:11px">${esc(i.hint)}</div></td><td class="num">${Math.round(i.value * 100)} %</td><td class="num">${i.weight}</td><td class="num">${(Math.round(i.points * 10) / 10).toFixed(1)}</td></tr>`).join("");
  box.innerHTML = `<div class="eyebrow" style="margin:0 0 6px">Madurez de la definición, estimada con los datos del proyecto</div>
    <div style="overflow-x:auto"><table class="rng-res"><thead><tr><th>Elemento de la definición</th><th class="num">Avance</th><th class="num">Peso</th><th class="num">Aporta</th></tr></thead><tbody>${rows}
      <tr class="rng-selrow"><td><b>Madurez estimada</b> → clase sugerida <b>${m.class}</b></td><td></td><td class="num">100</td><td class="num"><b>${(Math.round(m.pct * 10) / 10).toFixed(1)} %</b></td></tr></tbody></table></div>
    <div class="note" style="margin-top:8px;${adv.level === "aviso" ? "border-color:#dc3546;background:#fdecef" : ""}">${adv.level === "aviso" ? "<b>⚠</b> " : ""}${esc(adv.text)}</div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">Es una estimación <b>orientativa</b> con pesos didácticos: la clase real depende de entregables de definición (ingeniería, especificaciones, cotizaciones firmes) que la suite solo ve en parte. Sirve para avisar cuando la clase declarada no se sostiene, no para decidirla.</div>`;
}
// Filas del BOE: madurez estimada y rango de exactitud aplicado al estimado con contingencia.
function classDocRows(): string {
  const inp = maturityInputs(), b = state._budget;
  const mat = inp ? (() => { const m = definitionMaturity(inp); return `<tr><td>Madurez estimada de la definición</td><td>≈ ${Math.round(m.pct)} % (clase sugerida ${m.class}); ${esc(classAdvisory(state.curClass as EstimateClass, m.pct).text)}</td></tr>`; })() : "";
  const acc = b && b.base > 0 ? (() => { const a = classAccuracy(), r = accuracyRange(b.base + b.cont, a.lo, a.hi); return `<tr><td>Rango de exactitud aplicado</td><td>Sobre el estimado con contingencia (${fmt(b.base + b.cont)}): mínimo ${fmt(r.min)} · máximo ${fmt(r.max)} (${pctTxt(a.lo)} / ${pctTxt(a.hi)}: ${esc(accuracyOriginText(a))}; presupone contingencia aplicada). ${esc(a.notes.join(" "))}</td></tr><tr><td>Referencia publicada</td><td>${esc(publishedBandText(state.curClass as EstimateClass))}. Práctica: ${esc(ACCURACY_SOURCE.practice)}, ${esc(ACCURACY_SOURCE.sector)}, ${esc(ACCURACY_SOURCE.revision)}.</td></tr>`; })() : "";
  return mat + acc;
}
// Rango de exactitud esperado, aplicado al presupuesto (antes solo se mostraba el texto «−15 % / +30 %»).
function renderAccuracy(base: number, cont: number, res: RangeResult | null): void {
  const box = document.getElementById("accBox"); if (!box) return;
  if (!(base > 0)) { box.style.display = "none"; return; }
  const a = classAccuracy(), est = base + cont, r = accuracyRange(est, a.lo, a.hi);
  const sim = res ? ` El análisis por rangos simula un costo total de <b>${fmt(res.p[10])}</b> (P10) a <b>${fmt(res.p[90])}</b> (P90).` : "";
  box.style.display = "block";
  box.innerHTML = `<b>Rango de exactitud — clase ${state.curClass} (${pctTxt(a.lo)} / ${pctTxt(a.hi)}): ${esc(accuracyOriginText(a))}.</b> Sobre el estimado con contingencia (<b>${fmt(est)}</b> = costo base + contingencia) el costo final va de <b>${fmt(r.min)}</b> a <b>${fmt(r.max)}</b>.${sim} Referencia publicada: ${esc(publishedBandText(state.curClass as EstimateClass))}. La exactitud real depende de los entregables de definición y del análisis de riesgo específico del proyecto; los rangos de AACE son indicativos, no metas.${a.notes.length ? "<br><b>⚠</b> " + esc(a.notes.join(" ")) : ""}`;
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
// Escalación: paquetes con su costo y fechas (se arman con la red) y la simulación de escalación (determinista: se memoriza).
interface EscCtx { pkgs: EscPackage[]; note: string; }
let escCtx: EscCtx | null = null;
const escSimCache: Record<string, EscSim | null> = {};
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
// Opt-in (por omisión NO): sortear también las duraciones Beta-PERT de las actividades con terna válida en la MISMA iteración que los eventos de riesgo.
function pertOn(): boolean { const c = document.getElementById("rngPert") as HTMLInputElement | null; return !!c && c.checked; }
function pertCount(): number { return net ? net.nodes.filter((n) => !n.isMilestone && n.pert).length : 0; }
function pertActsOf(): PertDur[] { if (!pertOn() || !net) return []; return net.nodes.filter((n) => !n.isMilestone && n.pert).map((n) => ({ id: n.id, dur: n.dur, o: (n.pert as { o: number }).o, m: (n.pert as { m: number }).m, p: (n.pert as { p: number }).p })); }
// ---- cronograma: la red de actividades y el CPM (AACE 40R-08 / 57R-09: el riesgo de plazo cuesta) ----
// Costos LEE la red, no la escribe: conectado, la del proyecto; independiente, la red DISTRIB+ completa. Se arma
// perezosamente y se invalida cuando otro módulo cambia el proyecto o al volver a esta pestaña.
let net: Network | null = null, eng: Engine | null = null, netDirty = true;
function getEng(): Engine | null {
  if (!netDirty) return eng;
  netDirty = false; net = null; eng = null; escCtx = null;
  Object.keys(escSimCache).forEach((k) => { delete escSimCache[k]; });
  Object.keys(simCache).forEach((k) => { delete simCache[k]; });   // la red cambió: las simulaciones guardadas ya no valen
  Object.keys(eventOutcomes).forEach((k) => { delete eventOutcomes[k]; });
  try {
    if (typeof GPI === "undefined" || !GPI || !GPI.util || !GPI.util.cpm || !GPI.util.scheduleNetwork) return null;
    if (gpiOn()) net = GPI.util.activeScheduleNetwork();
    else { const m = sampleScheduleModules(); net = GPI.util.scheduleNetwork(m.wbs, m.activities, null, m.schedule, sampleSchedulePlan(), SAMPLE_START_DATE); }
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
function outcomesFor(events: RiskEvent[], g: Engine | null, pa: PertDur[] = []): EventOutcomes | undefined {
  if (!events.length && !(g && pa.length)) return undefined;
  const key = JSON.stringify([events.map((e) => [e.id, e.prob, e.low, e.likely, e.high, e.sign, e.days, e.targets]), g ? g.base : null, pa.length ? pa.map((a) => [a.id, a.dur, a.o, a.m, a.p]) : 0]);
  if (!(key in eventOutcomes)) {
    if (Object.keys(eventOutcomes).length > 6) Object.keys(eventOutcomes).forEach((k) => { delete eventOutcomes[k]; });
    eventOutcomes[key] = simulateEvents(events, g ? { base: g.base, duration: (d) => g.duration(d) } : null, DEFAULT_ITERATIONS, DEFAULT_SEED, pa);
  }
  return eventOutcomes[key];
}
// `withSchedule = false` simula solo el costo directo de los eventos (para separar su aporte del costo del retraso).
function simulate(rho: number, withEvents: boolean = includeRisksOn(), withSchedule: boolean = true): RangeResult | null {
  const events = withEvents ? eventsCtx().events : [];
  const g = withEvents ? getEng() : null, cpd = g && withSchedule ? timeCostPerDay() : 0, pa = g && withSchedule ? pertActsOf() : [];
  const key = JSON.stringify([state.ranges.map((l) => [l.ml, l.lowPct, l.highPct]), rho, events.map((e) => [e.id, e.prob, e.low, e.likely, e.high, e.sign, e.days, e.targets]), g && withSchedule ? [g.base, cpd] : null, pa.length ? pa.map((a) => [a.id, a.dur, a.o, a.m, a.p]) : 0]);
  if (!(key in simCache)) {
    if (Object.keys(simCache).length > 24) Object.keys(simCache).forEach((k) => { delete simCache[k]; });
    simCache[key] = simulateRange(state.ranges, {
      correlation: rho, iterations: DEFAULT_ITERATIONS, seed: DEFAULT_SEED, events, outcomes: outcomesFor(events, g, pa), pertActs: pa.length ? pa : undefined,
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
  { const pc = $("rngPert") as HTMLInputElement, n = pertCount(); pc.disabled = n === 0 && !pc.checked; $("rngPertNote").textContent = n ? n + " actividad(es) con terna PERT válida (o ≤ m ≤ p) en Análisis PERT." : "Ninguna actividad tiene una terna PERT válida en este proyecto: esta opción no cambiaría nada."; }
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
    <div class="muted" style="font-size:11.5px;margin-top:6px">${s.events} evento(s) retrasan actividades del cronograma · probabilidad de terminar después de lo previsto ${Math.round(s.probDelay * 1000) / 10} % · retraso medio ${fmtDays(Math.round((s.mean - s.base) * 10) / 10)}${cpd > 0 ? " · costo medio de la extensión " + fmt(s.timeCostMean) + " (a " + fmt(cpd) + " por día)" : ""}.${s.integrated ? " <b>Incluye la variabilidad de " + s.pertActs + " duración(es) PERT sorteada(s) en la misma iteración</b> (opción activada): por eso ya no coincide con el análisis de plazo del Registro de Riesgos, que usa las duraciones determinísticas." : " Es la misma simulación del Registro de Riesgos (mismos eventos y semilla)."}</div>` : "";
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
  const res = calc.res, p = pctNum(), cls = classAccuracy();
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
  const cls = classAccuracy(), loI = ($("rngLo") as HTMLInputElement).value, hiI = ($("rngHi") as HTMLInputElement).value;
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
  const cls = classAccuracy(), prev = new Map(state.ranges.map((l) => [l.id, l]));
  const pulled: RangeLine[] = items.map((it) => { const old = prev.get(it.id); return old ? { ...old, name: it.name, ml: it.ml } : { id: it.id, name: it.name, ml: it.ml, lowPct: cls.lo, highPct: cls.hi, basis: "" }; });
  state.ranges = pulled.concat(state.ranges.filter((l) => l.id.indexOf("r-") !== 0));
  userEdited = true; recalcCont(); save(); flash();
  showToast(pulled.length + " partida(s) traídas. Los rangos nuevos parten de la clase " + state.curClass + ": ajústalos y fundaméntalos.");
}
function pullRangesFromEstimate(): void {
  if (!gpiOn()) { showToast("Abre este módulo desde el Panel de Control para conectar el estimado."); return; }
  const G = GPI as GpiApi;
  const rows = G.util.costEstimateRows(G.getModule("costEstimate") as CostEstimateModule | null, G.getModule("activities") as ActivitiesModule | null, G.getModule("wbs") as WbsModule | null);
  if (!rows.some((r) => r.subtotal != null && r.subtotal > 0)) { showToast("Aún no hay actividades con Cantidad y Precio unitario cargados en Estimar los Costos."); return; }
  // Misma regla que WBS Builder y Valor Ganado: el estimado del paquete solo si está completo; si no, su costo de la EDT.
  const wbs = G.getModule("wbs") as WbsModule | null, leaves = G.util.wbsLeaves(wbs), wbsCost: Record<string, number> = {};
  leaves.forEach((l) => { wbsCost[l.id] = wbs && wbs.nodes[l.id] ? Number(wbs.nodes[l.id].cost) || 0 : 0; });
  const pb = packageBudgets({ leaves, wbsCost, estimateRows: rows.map((r) => ({ leafId: r.leafId, subtotal: r.subtotal })) });
  mergePulled(leaves.filter((l) => pb[l.id]).map((l) => ({ id: "r-" + l.id, name: (l.code + " " + l.name).trim(), ml: Math.round(pb[l.id].bac) })));
}
function pullRangesFromWbs(): void {
  if (!gpiOn()) { showToast("Abre este módulo desde el Panel de Control para conectar la EDT."); return; }
  const G = GPI as GpiApi, wbs = G.util.effectiveWbs();   // con los costos que muestra WBS Builder
  const items = G.util.wbsLeaves(wbs).map((lf) => ({ id: "r-" + lf.id, name: (lf.code + " " + lf.name).trim(), ml: Math.round(Number((wbs as WbsModule).nodes[lf.id].cost) || 0) })).filter((x) => x.ml > 0);
  if (!items.length) { showToast("La EDT del proyecto activo aún no tiene costos cargados en WBS Builder."); return; }
  mergePulled(items);
}
// Aplica el rango típico de la clase SOLO a las partidas que aún no tienen fundamento (no pisa lo trabajado).
function applyClassRange(): void {
  const cls = classAccuracy(); let n = 0;
  state.ranges.forEach((l) => { if (!String(l.basis || "").trim()) { l.lowPct = cls.lo; l.highPct = cls.hi; n++; } });
  userEdited = true; recalcCont(); save();
  showToast(n ? "Rango de la clase " + state.curClass + " aplicado a " + n + " partida(s) sin fundamento." : "Todas las partidas ya tienen fundamento: no se cambió ninguna.");
}

/* ---------- Escalación por índices (AACE RP 58R-10 / 68R-11) ---------- */
// Costos LEE la EDT, las actividades y el cronograma (no los escribe): cada paquete con su costo y las fechas en que se gasta. Conectado: los
// del proyecto (con la línea base del cronograma si existe, como el EVM); independiente: el caso DISTRIB+.
function escPackages(): EscCtx {
  getEng();                                             // reconstruye la red si cambió (y descarta este contexto)
  if (escCtx) return escCtx;
  const out: EscCtx = { pkgs: [], note: "" };
  try {
    if (typeof GPI === "undefined" || !GPI || !GPI.util || !GPI.util.cpm) { out.note = "No cargó gpi-core.js: sin el núcleo no se puede armar el cronograma."; escCtx = out; return out; }
    const connected = gpiOn(), m = connected ? null : sampleScheduleModules();
    const wbs = connected ? GPI.getModule("wbs") : (m as NonNullable<typeof m>).wbs;
    const act = connected ? GPI.getModule("activities") : (m as NonNullable<typeof m>).activities;
    const sched = connected ? GPI.getModule("schedule") : (m as NonNullable<typeof m>).schedule;
    const leaves = GPI.util.wbsLeaves(wbs);
    const costOf: Record<string, number> = {};
    if (connected) {
      // Mismo presupuesto por paquete que WBS Builder y Valor Ganado: el estimado solo si está completo; si no, el costo de la EDT.
      const wbsCost: Record<string, number> = {}; leaves.forEach((l) => { wbsCost[l.id] = wbs && wbs.nodes[l.id] ? Number(wbs.nodes[l.id].cost) || 0 : 0; });
      const pb = packageBudgets({ leaves, wbsCost, estimateRows: GPI.util.costEstimateRows(GPI.getModule("costEstimate"), act, wbs).map((r) => ({ leafId: r.leafId, subtotal: r.subtotal })) });
      Object.keys(pb).forEach((id) => { costOf[id] = pb[id].bac; });
    } else leaves.forEach((l) => { if ((EVM_SAMPLE_COSTS as Record<string, number>)[l.code]) costOf[l.id] = (EVM_SAMPLE_COSTS as Record<string, number>)[l.code]; });
    const spans: Record<string, { start: string; end: string }> = {};
    if (net && eng && net.startDate) {
      const bl = connected && sched ? normalizeBaseline((sched as { baseline?: unknown }).baseline) : null;
      const rows: Record<string, { es: number; ef: number }> = {};
      if (bl) bl.snapshot.rows.forEach((r) => { rows[r.id] = r; }); else Object.keys(eng.rows).forEach((id) => { rows[id] = eng ? eng.rows[id] : { es: 0, ef: 0 }; });
      const cal = net.calendar as { workDayIdx?: number[]; holidays?: string[] }, util = (GPI as GpiApi).util, start = util.parseISO(net.startDate);
      const dateAt = (i: number): string => util.addWorkingDays(start, Math.max(0, Math.ceil(i - 1e-9)), cal);
      const idx: Record<string, { es: number; ef: number }> = {};
      net.nodes.filter((n) => !n.isMilestone && n.leafId).forEach((n) => { const r = rows[n.id]; if (!r) return; const s = idx[n.leafId as string] || (idx[n.leafId as string] = { es: r.es, ef: r.ef }); s.es = Math.min(s.es, r.es); s.ef = Math.max(s.ef, r.ef); });
      Object.keys(idx).forEach((id) => { spans[id] = { start: dateAt(idx[id].es), end: dateAt(idx[id].ef - 1) }; });
    } else out.note = connected ? "El proyecto aún no tiene actividades y enlaces (Cronograma/CPM) ni fecha de inicio: sin ellos no se sabe cuándo se gasta cada paquete." : "No se pudo armar el cronograma del ejemplo.";
    out.pkgs = leaves.filter((l) => costOf[l.id]).map((l) => ({ id: l.id, code: l.code, name: l.name, cost: costOf[l.id], start: spans[l.id] ? spans[l.id].start : null, end: spans[l.id] ? spans[l.id].end : null }));
    if (!out.pkgs.length && !out.note) out.note = connected ? "Ningún paquete de trabajo tiene costo: carga la estimación en Estimar los Costos o el costo de los paquetes en WBS Builder." : "El ejemplo no tiene paquetes.";
  } catch (e) { out.note = "No se pudo armar el contexto del proyecto."; }
  escCtx = out; return out;
}
// La escalación se simula con los MISMOS retrasos del análisis integrado de riesgo (Registro de Riesgos y contingencia): cada iteración trae
// su extensión del plazo, que desplaza el gasto. Sin eventos con impacto en plazo ubicados en el cronograma, no hay variable de plazo.
const ocIds = new WeakMap<object, number>(); let ocSeq = 0;
function escDelays(): Float64Array | null {
  if (!includeRisksOn()) return null;
  const g = getEng(); if (!g) return null;
  const ev = eventsCtx().events;
  const pa = pertActsOf(), oc = ev.length || pa.length ? outcomesFor(ev, g, pa) : undefined;
  return oc && oc.ext ? oc.ext : null;
}
function escSim(plan: EscPlan, pkgs: EscPackage[]): EscSim | null {
  const d = escDelays();
  if (d && !ocIds.has(d)) ocIds.set(d, ++ocSeq);
  const key = JSON.stringify([plan.baseDate, plan.accounts.map((a) => [a.id, a.rates, a.low, a.high]), plan.defaultMix, plan.packages, plan.correlation, pkgs.map((p) => [p.id, p.cost, p.start, p.end]), d ? ocIds.get(d) : 0]);
  if (!(key in escSimCache)) {
    if (Object.keys(escSimCache).length > 12) Object.keys(escSimCache).forEach((k) => { delete escSimCache[k]; });
    escSimCache[key] = simulateEscalation(plan, pkgs, { iterations: DEFAULT_ITERATIONS, seed: DEFAULT_SEED, delaysWork: d });
  }
  return escSimCache[key];
}
type EscMethod = "simple" | "indices";
const escMethodVal = (): EscMethod => (($("escMethod") as HTMLSelectElement).value === "simple" ? "simple" : "indices");
interface EscCalc {
  method: EscMethod; esc: number; central: number; funded: number; scale: number; onCont: number;
  res: EscResult | null; sim: EscSim | null; provLabel: string; provQ: number | null; adv: Advisory[]; ctx: EscCtx;
}
// Escalación del presupuesto. Simple: base × ((1 + i)ⁿ − 1) (como siempre). Por índices: factor de escalación (central o percentil de la simulación)
// × (costo base + contingencia si se escala): «Escalation on Contingency» — la contingencia también se gasta en el futuro.
function escCalc(base: number, cont: number): EscCalc {
  const method = escMethodVal(), ctx = method === "indices" ? escPackages() : { pkgs: [], note: "" } as EscCtx;
  state.esc.method = method;
  if (method === "simple") {
    const i = +($("inflRate") as HTMLInputElement).value || 0, n = +($("inflYears") as HTMLInputElement).value || 0, esc = simpleEscalation(base, i, n), a = simpleMethodAdvisory(state.curClass);
    return { method, esc, central: esc, funded: base, scale: 1, onCont: 0, res: null, sim: null, provLabel: "escalación simple", provQ: null, adv: a ? [a] : [], ctx };
  }
  const plan = state.esc; plan.baseDate = ($("boeDate") as HTMLInputElement).value || "";
  const res = escalate(plan, ctx.pkgs), sim = res.ok ? escSim(plan, ctx.pkgs) : null, prov = provisionFactor(plan, res, sim);
  const funded = base + (plan.onContingency ? cont : 0), scale = res.base > 0 ? base / res.base : 0;
  const adv = escalationAdvisories(plan, res, sim, { classNum: state.curClass, riskTitles: riskCtx().risks.map((r) => r.title || "") });
  if (ctx.note && !res.ok) adv.unshift({ code: "X7", severity: "riesgo", text: ctx.note });
  return {
    method, esc: res.ok ? prov.factor * funded : 0, central: res.ok ? res.factor * funded : 0, funded, scale, onCont: plan.onContingency ? cont : 0,
    res, sim, provLabel: prov.label, provQ: plan.provision === "central" || !sim ? null : Number(plan.provision.slice(1)), adv, ctx
  };
}
const pct1 = (x: number): string => (x * 100).toFixed(1) + " %";
// Tablas de entrada: pronóstico de índices por cuenta y año, incertidumbre, composición por omisión, opciones y, por paquete, composición y fijación de precio.
let escInputsKey = "";
function escYears(ctx: EscCtx): number[] {
  const ys = new Set<number>(horizonYears(($("boeDate") as HTMLInputElement).value, ctx.pkgs));
  state.esc.accounts.forEach((a) => Object.keys(a.rates).forEach((y) => ys.add(Number(y))));   // nunca se oculta lo ya ingresado
  return Array.from(ys).sort((a, b) => a - b);
}
function renderEscInputs(ctx: EscCtx): void {
  const p = state.esc, years = escYears(ctx), bd = ($("boeDate") as HTMLInputElement).value;
  escInputsKey = JSON.stringify([years, ctx.pkgs.map((k) => k.id), bd]);
  const acc = p.accounts.map((a) => `<tr><td><b>${esc(ACCOUNT_LABEL[a.id])}</b></td>
      <td><input class="esc-in wide" data-e="src" data-acc="${a.id}" value="${escA(a.source)}" placeholder="¿De qué economista o fuente sale este pronóstico?" aria-label="Fuente del pronóstico de ${escA(ACCOUNT_LABEL[a.id])}" onchange="escEdit(this)"></td>
      ${years.map((y) => `<td class="num"><input class="esc-in" type="number" step="0.1" data-e="rate" data-acc="${a.id}" data-year="${y}" value="${a.rates[String(y)] === undefined ? "" : a.rates[String(y)]}" aria-label="Tasa anual ${y} de ${escA(ACCOUNT_LABEL[a.id])}" onchange="escEdit(this)"></td>`).join("")}
      <td class="num"><input class="esc-in" type="number" step="0.1" max="0" data-e="low" data-acc="${a.id}" value="${a.low}" aria-label="Incertidumbre mínima de ${escA(ACCOUNT_LABEL[a.id])}" onchange="escEdit(this)"></td>
      <td class="num"><input class="esc-in" type="number" step="0.1" min="0" data-e="high" data-acc="${a.id}" value="${a.high}" aria-label="Incertidumbre máxima de ${escA(ACCOUNT_LABEL[a.id])}" onchange="escEdit(this)"></td></tr>`).join("");
  const mixIn = (id: string, m: Record<string, number> | undefined, ph: string, attrs: string): string => `<input class="esc-in" style="width:56px" type="number" min="0" step="1" ${attrs} value="${m && m[id] ? m[id] : ""}" placeholder="${ph}" aria-label="Composición ${escA(ACCOUNT_LABEL[id])} (%)" onchange="escEdit(this)">`;
  const pk = ctx.pkgs.map((k) => { const o = p.packages[k.id] || {}; return `<tr><td class="mono">${esc(k.code)}</td><td>${esc(k.name)}</td>
      ${ACCOUNT_IDS.map((id) => `<td class="num">${mixIn(id, o.mix, String(p.defaultMix[id] || 0), `data-e="pmix" data-pid="${escA(k.id)}" data-acc="${id}"`)}</td>`).join("")}
      <td><input class="esc-in date" type="date" data-e="lock" data-pid="${escA(k.id)}" value="${escA(o.lock || "")}" aria-label="Fecha de fijación del precio de ${escA(k.name)}" onchange="escEdit(this)"></td></tr>`; }).join("");
  $("escInputs").innerHTML = `
    <div class="note" style="margin:0 0 10px">Fecha base de precios: <b>${esc(bd) || "— (defínela en la pestaña 02, Basis of Estimate)"}</b>. El índice vale 1,00 en esa fecha. ${ctx.pkgs.length ? "<b>" + ctx.pkgs.length + " paquete(s)</b> con costo se reparten en el tiempo según sus fechas del cronograma." : ""}</div>
    <div class="eyebrow esc-sec">Pronóstico de índices por cuenta de costo</div>
    <div style="overflow-x:auto"><table class="esc-tbl"><thead><tr><th>Cuenta</th><th>Fuente del pronóstico</th>${years.map((y) => `<th class="num">${y} (% anual)</th>`).join("")}<th class="num" title="Cuánto puede ser MENOR la tasa que el pronóstico (puntos porcentuales, ≤ 0)">Mín (pp)</th><th class="num" title="Cuánto puede ser MAYOR la tasa que el pronóstico (puntos porcentuales, ≥ 0)">Máx (pp)</th></tr></thead><tbody>${acc}</tbody></table></div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">Tasa anual esperada de cada cuenta por año calendario (más allá del último año se mantiene la última). «Mín / Máx» es el rango de incertidumbre de la tasa para la simulación (AACE 68R-11). El pronóstico debe venir de un economista o de una fuente reconocida: <b>no extrapoles</b> la tendencia pasada.</div>
    <div style="margin-top:14px;display:grid;grid-template-columns:minmax(300px,1.6fr) minmax(200px,1fr) minmax(160px,.7fr);gap:18px;align-items:start">
      <div><div class="eyebrow" style="margin-bottom:6px">Composición por omisión del costo (%)</div><div style="display:flex;gap:8px;flex-wrap:wrap">${ACCOUNT_IDS.map((id) => `<label class="muted small" style="display:flex;flex-direction:column;gap:2px">${esc(ACCOUNT_LABEL[id])}<input class="esc-in" type="number" min="0" step="1" data-e="dmix" data-acc="${id}" value="${p.defaultMix[id] || 0}" onchange="escEdit(this)"></label>`).join("")}</div></div>
      <div><label class="f"><span>Escalación que se financia en el presupuesto</span><select class="mono" data-e="prov" onchange="escEdit(this)">${PROVISIONS.map((q) => `<option value="${q}" ${p.provision === q ? "selected" : ""}>${esc(PROVISION_LABEL[q])}</option>`).join("")}</select></label></div>
      <div><label class="f"><span>Correlación entre las cuentas (%)</span><input class="mono" type="number" min="0" max="100" step="5" data-e="corr" value="${Math.round(p.correlation * 100)}" onchange="escEdit(this)"></label></div>
    </div>
    <label class="rng-chk" style="margin-top:6px"><input type="checkbox" data-e="onCont" ${p.onContingency ? "checked" : ""} onchange="escEdit(this)"><span><b>Escalar también la contingencia</b> <span class="muted">(58R-10: «Escalation on Contingency»; la contingencia se gasta a lo largo del proyecto, como el costo base)</span></span></label>
    <details class="esc-det"><summary>Paquetes: composición del costo por cuenta y fijación del precio (${ctx.pkgs.length})</summary>
      <div class="muted" style="font-size:11.5px;margin:8px 0">Cada paquete usa la composición por omisión salvo que la cambies. Con <b>fecha de fijación del precio</b> (contrato o compra a precio fijo) el índice deja de correr desde esa fecha: la exposición a la escalación termina cuando el precio se cierra.</div>
      <div style="overflow-x:auto"><table class="esc-tbl"><thead><tr><th>Cód.</th><th>Paquete</th>${ACCOUNT_IDS.map((id) => `<th class="num">${esc(ACCOUNT_LABEL[id])} %</th>`).join("")}<th>Precio fijado el</th></tr></thead><tbody>${pk || `<tr><td colspan="7" class="muted">${esc(ctx.note || "Sin paquetes con costo.")}</td></tr>`}</tbody></table></div>
    </details>`;
}
function escCurveSvg(sim: EscSim, funded: number, provQ: number | null): string {
  const W = 560, H = 220, l = 58, r = 16, t = 14, b = 40, cv = sim.curve.map((f) => f * funded), det = sim.det * funded;
  const lo = Math.min(cv[0], det), hi = Math.max(cv[98], det), span = hi - lo || 1;
  const xs = (v: number): number => l + (v - lo) / span * (W - l - r), ys = (q: number): number => t + (100 - q) / 100 * (H - t - b);
  const short = (v: number): string => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + " M" : Math.round(v).toLocaleString("es-PE");
  const path = cv.map((v, i) => (i ? "L" : "M") + xs(v).toFixed(1) + "," + ys(i + 1).toFixed(1)).join(" ");
  const xt = [lo, lo + span / 2, hi].map((v, i) => `<text x="${xs(v).toFixed(1)}" y="${H - 22}" text-anchor="${["start", "middle", "end"][i]}" class="rng-tick">${esc(short(v))}</text>`).join("");
  const yt = [0, 25, 50, 75, 100].map((q) => `<line x1="${l}" x2="${W - r}" y1="${ys(q)}" y2="${ys(q)}" class="rng-grid"/><text x="${l - 6}" y="${ys(q) + 3}" text-anchor="end" class="rng-tick">${q}%</text>`).join("");
  const mk = provQ ? (() => { const px = xs(sim.p[provQ] * funded), py = ys(provQ); return `<line x1="${px}" x2="${px}" y1="${py}" y2="${H - b}" class="rng-sel"/><circle cx="${px}" cy="${py}" r="5" class="rng-dot"/><text x="${Math.min(px + 9, W - 40)}" y="${py + 16}" class="rng-tick" font-weight="700">P${provQ}</text>`; })() : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="rng-svg" role="img" aria-label="Curva S de la escalación simulada: probabilidad acumulada de no superar cada monto. Pronóstico central ${esc(short(det))}.">
    ${yt}${xt}<line x1="${xs(det)}" x2="${xs(det)}" y1="${t}" y2="${H - b}" class="rng-base"/><text x="${xs(det) + 4}" y="${t + 10}" class="rng-tick">Central</text>
    <path d="${path}" class="rng-line"/>${mk}
    <text x="${(l + W - r) / 2}" y="${H - 4}" text-anchor="middle" class="rng-cap">Escalación (monto)</text>
  </svg>`;
}
function renderEscResults(c: EscCalc): void {
  const box = $("escResults"), res = c.res, sim = c.sim;
  const adv = c.adv.length ? `<div class="eyebrow esc-sec">Revisa</div><ul class="esc-adv">${c.adv.map((a) => `<li class="${a.severity}"><b class="cd">${a.code}</b>${esc(a.text)}</li>`).join("")}</ul>` : "";
  if (!res || !res.ok) { box.innerHTML = `<div class="note"><b>Escalación = 0 por ahora.</b> Completa lo que falta:</div>${adv}`; return; }
  const k = c.scale;
  const kp =(lab: string, v: string, cap: string): string => `<div class="kpi"><div class="lab">${lab}</div><div class="val neu">${v}</div><div class="cap">${cap}</div></div>`;
  const q = (n: number): string => (sim ? fmt(sim.p[n] * c.funded) : "—");
  const kpis = `<div class="kpis k5">${kp("Escalación central", fmt(c.central), pct1(res.factor) + " del costo · fecha media del gasto " + esc(res.midDate || "—"))}
    ${kp("Financiada", fmt(c.esc), esc(c.provLabel))}${kp("P50", q(50), "simulación")}${kp("P80", q(80), "simulación")}${kp("P90", q(90), "simulación")}</div>`;
  const byAcc = res.byAccount.map((a) => `<tr><td>${esc(a.label)}</td><td class="num">${fmt(a.base * k)}</td><td class="num">${fmt(a.esc * k)}</td><td class="num">${a.pct.toFixed(2)} %</td></tr>`).join("");
  const byYear = res.byYear.map((y) => `<tr><td>${y.year}</td><td class="num">${fmt(y.base * k)}</td><td class="num">${fmt(y.esc * k)}</td><td class="num">${fmt((y.base + y.esc) * k)}</td></tr>`).join("");
  const top = res.byPackage.slice().sort((a, b) => b.esc - a.esc).slice(0, 8).map((p) => `<tr><td class="mono">${esc(p.code)}</td><td>${esc(p.name)}${p.undated ? ` <span class="muted small">(sin fechas)</span>` : ""}</td><td class="num">${fmt(p.cost * k)}</td><td class="num">${fmt(p.esc * k)}</td><td class="num">${p.pct.toFixed(2)} %</td><td class="muted small">${p.lock ? "precio fijado " + esc(p.lock) : ""}</td></tr>`).join("");
  const simTxt = sim && sim.sd < 1e-12
    ? `Simulación Monte Carlo (AACE 68R-11): sin incertidumbre definida en los índices ni variable de plazo, todas las iteraciones dan el pronóstico central. Define el rango de las tasas (Mín / Máx) para medir la incertidumbre de la escalación.`
    : sim
    ? `Simulación Monte Carlo (AACE 68R-11): ${sim.iterations.toLocaleString("es-PE")} iteraciones (semilla ${sim.seed}, reproducible) · tasas de ${sim.uncertainAccounts} cuenta(s) con rango, correlación ${Math.round(sim.correlation * 100)} %${sim.withDelay ? " · con el retraso del cronograma del análisis integrado de riesgo (media " + Math.round(sim.delayMeanCal) + " d de calendario, P80 " + Math.round(sim.delayP80Cal) + " d)" : " · sin variable de plazo"}. El pronóstico central equivale al <b>P${Math.round(sim.probAtOrBelowDet * 100)}</b>: hay ${Math.round(sim.probAtOrBelowDet * 100)} % de probabilidad de que la escalación no lo supere. Media ${fmt(sim.mean * c.funded)} · σ ${fmt(sim.sd * c.funded)}.`
    : "";
  box.innerHTML = `${kpis}
    <div class="rng-grid2" style="margin-top:14px">
      <div>
        <div class="eyebrow esc-sec" style="margin-top:0">Por cuenta de costo</div>
        <table class="esc-tbl"><thead><tr><th>Cuenta</th><th class="num">Costo base</th><th class="num" title="Escalación del costo base (la de la contingencia se indica abajo)">Escalación</th><th class="num">% de la cuenta</th></tr></thead><tbody>${byAcc}</tbody></table>
        <div class="eyebrow esc-sec">Por año (flujo de caja)</div>
        <table class="esc-tbl"><thead><tr><th>Año</th><th class="num">Costo base</th><th class="num" title="Escalación del costo base (la de la contingencia se indica abajo)">Escalación</th><th class="num">Costo escalado</th></tr></thead><tbody>${byYear}</tbody></table>
        ${c.onCont ? `<div class="muted small" style="margin-top:8px">De la escalación financiada, <b>${fmt(c.funded > 0 ? c.esc * c.onCont / c.funded : 0)}</b> corresponde a la contingencia (${fmt(c.onCont)}), que se gasta a lo largo del proyecto como el costo base (58R-10, «Escalation on Contingency»).</div>` : ""}
      </div>
      <div>${sim ? escCurveSvg(sim, c.funded, c.provQ) : ""}</div>
    </div>
    <div class="eyebrow esc-sec">Paquetes con mayor escalación</div>
    <table class="esc-tbl"><thead><tr><th>Cód.</th><th>Paquete</th><th class="num">Costo</th><th class="num">Escalación</th><th class="num">%</th><th></th></tr></thead><tbody>${top}</tbody></table>
    ${simTxt ? `<div class="muted" style="font-size:11.5px;margin-top:10px">${simTxt}</div>` : ""}
    ${adv}
    <div class="note" style="margin-top:12px"><b>Qué cubre y qué no.</b> Escalación = cambio general de precios de mercado (incluye la inflación); <b>excluye</b> la contingencia (riesgos específicos del proyecto) y el tipo de cambio, que se estiman aparte. Se calcula por cuenta de costo con su propio índice, en el momento en que se gasta cada paquete (mensual) y hasta la fecha de fijación del precio si la hay. La simulación mide la incertidumbre de las <b>tasas</b> (rango por cuenta, correlacionadas) y el <b>retraso</b> del cronograma; no simula la incertidumbre del costo (ya está en la contingencia, que se escala) ni la forma de la curva de gasto (lineal por paquete). Las tasas y la forma de la distribución de la incertidumbre son datos del equipo: AACE recomienda que los aporte un economista.</div>`;
}
function renderEsc(c: EscCalc): void {
  const on = c.method === "indices";
  $("escCard").style.display = on ? "block" : "none";
  $("escSimpleWrap").style.display = on ? "none" : "block";
  ($("escMethod") as HTMLSelectElement).value = c.method;
  $("escSummary").innerHTML = on
    ? (c.res && c.res.ok
      ? `Escalación <b>${fmt(c.esc)}</b> (${c.res.base ? pct1(c.esc / (c.funded || 1)) : "—"} del costo ${c.onCont ? "base más contingencia" : "base"}) con <b>${esc(c.provLabel)}</b>${c.sim ? "; pronóstico central " + fmt(c.central) + "." : "."} Detalle, pronósticos por cuenta y simulación abajo.`
      : `<b>Sin escalación todavía:</b> ${c.adv.filter((a) => a.severity === "riesgo").map((a) => esc(a.text)).join(" ") || "completa el pronóstico de índices."}`)
    : `Escalación simple <b>${fmt(c.esc)}</b>.${c.adv.length ? " " + c.adv.map((a) => esc(a.text)).join(" ") : ""}`;
  if (!on) return;
  if (escInputsKey === "" || escInputsKey !== JSON.stringify([escYears(c.ctx), c.ctx.pkgs.map((k) => k.id), ($("boeDate") as HTMLInputElement).value])) renderEscInputs(c.ctx);
  renderEscResults(c);
}
function onEscMethod(): void { userEdited = true; state.esc.method = escMethodVal(); escInputsKey = ""; recalcCont(); save(); }
// Edición de las entradas de la escalación (data-e = qué campo): se guarda en el plan y se recalcula sin volver a pintar las entradas (no se pierde el foco).
function escEdit(el: HTMLInputElement | HTMLSelectElement): void {
  userEdited = true;
  const p = state.esc, e = el.dataset.e, acc = el.dataset.acc || "", a = p.accounts.find((x) => x.id === acc), v = el.value.trim(), n = v === "" ? NaN : Number(v);
  if (e === "src" && a) a.source = v;
  else if (e === "rate" && a) { const y = String(el.dataset.year); if (isFinite(n)) a.rates[y] = n; else delete a.rates[y]; }
  else if (e === "low" && a) a.low = isFinite(n) ? Math.min(0, n) : 0;
  else if (e === "high" && a) a.high = isFinite(n) ? Math.max(0, n) : 0;
  else if (e === "dmix") { if (isFinite(n) && n > 0) p.defaultMix[acc] = n; else delete p.defaultMix[acc]; if (!Object.keys(p.defaultMix).length) p.defaultMix = { ...DEFAULT_MIX }; }
  else if (e === "pmix") {
    const pid = String(el.dataset.pid), o = p.packages[pid] || (p.packages[pid] = {}), m = o.mix || (o.mix = {});
    if (isFinite(n) && n > 0) m[acc] = n; else delete m[acc];
    if (!Object.keys(m).length) delete o.mix; if (!o.mix && !o.lock) delete p.packages[pid];
  }
  else if (e === "lock") { const pid = String(el.dataset.pid), o = p.packages[pid] || (p.packages[pid] = {}); if (v) o.lock = v; else delete o.lock; if (!o.mix && !o.lock) delete p.packages[pid]; }
  else if (e === "prov") p.provision = (PROVISIONS.indexOf(v as never) >= 0 ? v : "central") as EscPlan["provision"];
  else if (e === "corr") p.correlation = Math.max(0, Math.min(100, isFinite(n) ? n : 50)) / 100;
  else if (e === "onCont") p.onContingency = (el as HTMLInputElement).checked;
  recalcCont(); save();
}

/* ---------- Contingencia / escalación ---------- */
function recalcCont(): void {
  $("fxBandWrap").style.display = ($("fxMode") as HTMLSelectElement).value === "float" ? "block" : "none";
  const base = +($("baseCost") as HTMLInputElement).value || 0;
  const calc = contingencyCalc(base);
  const cont = calc.cont;
  const ec = escCalc(base, cont), escIdx = ec.esc;
  // El tipo de cambio se cuantifica APARTE de la escalación (58R-10): solo con régimen flotante.
  const fx = fxExposure(base, +($("fxShare") as HTMLInputElement).value || 0, +($("fxBand") as HTMLInputElement).value || 0, ($("fxMode") as HTMLSelectElement).value === "float");
  const escT = escIdx + fx;
  // Línea base de costos (BAC) = estimado base + contingencia + escalación + tipo de cambio.
  const bac = base + cont + escT;
  // PMBOK: la reserva de gestión es un % de la LÍNEA BASE y queda FUERA de ella.
  const mgmt = bac * ((+($("mgmtPct") as HTMLInputElement).value || 0) / 100);
  const total = bac + mgmt;
  renderContUi(calc, base);
  renderEsc(ec);
  $("kBase").textContent = fmt(base);
  $("kCont").textContent = fmt(cont); $("kContCap").textContent = calc.method === "manual" ? "manual" : ($("contPct") as HTMLSelectElement).value;
  $("kEsc").textContent = fmt(escIdx); $("kEscCap").textContent = ec.method === "indices" ? ec.provLabel : "escalación simple";
  $("kFx").textContent = fmt(fx);
  $("kBAC").textContent = fmt(bac);
  $("kMgmt").textContent = fmt(mgmt);
  $("kTotal").textContent = fmt(total);
  $("kContP").textContent = base ? ((cont / base) * 100).toFixed(1) + "%" : "—";
  $("kEscP").textContent = base ? ((escIdx / base) * 100).toFixed(1) + "%" : "—";
  state._budget = { base, cont, esc: escT, escIdx, fx, bac, mgmt, total };
  state._escCalc = ec;
  refreshBoe();   // la BOE cita el presupuesto, la escalación y las reservas
  renderAccuracy(base, cont, calc.res);
  renderCO(); // los saldos de las órdenes dependen del presupuesto recién calculado (y renderCO ya llama buildJSON)
}

/* ---------- Órdenes de cambio ---------- */
// Presupuesto inicial contra el que se validan y analizan las órdenes.
function coBudget(): { bac: number; cont: number; mgmt: number } {
  const b = state._budget; return b ? { bac: b.bac, cont: b.cont, mgmt: b.mgmt } : { bac: 0, cont: 0, mgmt: 0 };
}
const todayISO = (): string => todayLocalISO();
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
// Nivel de autoridad de la orden según la política de reservas del plan de riesgos: qué exige el monto y con qué nivel se
// aprueba. Solo para órdenes con cargo a contingencia y cuando la política define límites (la reserva de gestión y los
// fondos adicionales siempre son del sponsor: para eso está su casilla).
function authCell(r: ChangeOrder, i: number, pol: ReservePolicyT, locked: boolean, usesReserve: boolean): string {
  if (usesReserve || !hasTiers(pol)) return "";
  const need = requiredAuthority(r, pol), have = authLevelOf(r), ok = levelCovers(have, need);
  const opts = ["" as AuthLevel | "", ...AUTH_LEVELS].map((v) => `<option value="${v}" ${(have || "") === v ? "selected" : ""}>${v ? esc(AUTH_LABEL[v]) : "— Nivel de autoridad —"}</option>`).join("");
  return `<select class="mono" style="padding:3px 5px;max-width:150px;margin-top:5px;font-size:11px" data-i="${i}" data-f="authLevel" onchange="coEdit(this)" ${locked ? "disabled" : ""} aria-label="Nivel de autoridad con que se aprueba la orden ${escA(r.id)}">${opts}</select>
    <div class="${!locked && !ok ? "bad-txt" : "muted"}" style="font-size:11px;margin-top:3px" title="${escA(tiersText(pol, (n) => fmt2(n)))}">Política de reservas: requiere <b>${need ? esc(AUTH_LABEL[need]) : "—"}</b>${!locked && !ok ? " ⚠" : ""}</div>`;
}
// Paquetes de trabajo a los que se asigna una orden: los de la EDT del proyecto (conectado) o los del caso (independiente; mismos ids
// «w-<código>» que la red de ejemplo).
function coLeaves(): Array<{ id: string; code: string; name: string }> {
  if (gpiOn()) { try { return (GPI as GpiApi).util.wbsLeaves((GPI as GpiApi).getModule("wbs")).map((l) => ({ id: l.id, code: l.code, name: l.name })); } catch (e) { return []; } }
  return SAMPLE_CASE_LEAVES.map((l) => ({ id: "w-" + l.code, code: l.code, name: l.name }));
}
// El paquete de una orden: por id y, si ya no está (EDT editada o proyecto importado), por su código.
function coLeafOf(r: ChangeOrder, leaves: Array<{ id: string; code: string; name: string }>): { id: string; code: string; name: string } | null {
  return leaves.find((l) => l.id === r.wbsId) || (r.wbsCode ? leaves.find((l) => l.code === r.wbsCode) : undefined) || null;
}
function wbsOptions(leaves: Array<{ id: string; code: string; name: string }>, selected: string): string {
  return `<option value="">— Paquete de la EDT —</option>` + leaves.map((l) => `<option value="${escA(l.id)}" ${l.id === selected ? "selected" : ""}>${esc(l.code + " " + l.name)}</option>`).join("");
}
function renderCO(): void {
  const tb = $("coBody"); tb.innerHTML = "";
  const ctx = riskCtx(), refs = riskRefs(ctx), leaves = coLeaves();
  const form = $("coWbs") as HTMLSelectElement, keep = form.value; form.innerHTML = wbsOptions(leaves, keep);
  state.co.forEach((r, i) => {
    const locked = r.status !== "Pendiente";               // aprobada/rechazada: los datos de aprobación no se editan
    const usesReserve = r.fund !== FUND_CONT;              // reserva de gestión o fondos adicionales: requiere sponsor
    const linked = r.riskId ? ctx.risks.find((x) => x.id === r.riskId) : undefined;
    const riskCell = r.kind !== "riesgo" ? "" : !locked
      ? `<select class="mono" style="padding:3px 5px;max-width:190px;margin-top:5px;font-size:11px" data-i="${i}" data-f="riskId" onchange="coEdit(this)" aria-label="Riesgo vinculado a la orden ${escA(r.id)}">${riskOptions(ctx, r.riskId, r.riskCode)}</select>`
      : `<div class="${r.riskId ? "muted" : "bad-txt"}" style="font-size:11px;margin-top:4px">${r.riskId ? "↳ " + esc(linked ? linked.code + " · " + linked.title : (r.riskCode || "?") + " (no está en el registro)") : "⚠ sin riesgo vinculado"}</div>`;
    // Paquete que ejecuta el cambio: editable siempre (una orden ya aprobada sin paquete debe poder asignarse). Aprobada sin paquete = Valor
    // Ganado no puede sumar su monto al presupuesto de ningún paquete.
    const leaf = coLeafOf(r, leaves), toBudget = r.status === "Aprobada" && (r.fund === FUND_CONT || !!r.baselined);
    const pkgCell = `<select class="mono" style="padding:3px 5px;max-width:230px;margin-top:5px;font-size:11px" data-i="${i}" data-f="wbsId" onchange="coEdit(this)" aria-label="Paquete de la EDT de la orden ${escA(r.id)}">${wbsOptions(leaves, leaf ? leaf.id : "")}</select>`
      + (!leaf && toBudget ? `<div class="bad-txt" style="font-size:11px;margin-top:3px">⚠ Sin paquete: Valor Ganado no puede sumar este monto al presupuesto del trabajo</div>` : "");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(r.id)}</td>
      <td>${esc(r.desc)}${pkgCell}</td>
      <td><span class="pill ${r.kind ? "ok" : "bad"}" title="${escA(r.kind ? (CO_KIND_HINT as Record<string, string>)[r.kind] : "Clasifica la orden antes de aprobarla")}">${esc(kindLabel(r.kind))}</span>${riskCell}</td>
      <td class="muted">${esc(r.cause)}</td>
      <td class="num">${fmt2(+r.cost)}</td>
      <td><span class="pill ${r.fund === FUND_CONT ? "ok" : "warn"}">${esc(r.fund)}</span></td>
      <td class="co-appr">
        <input class="mono" style="width:120px;padding:5px 7px" placeholder="Aprobador (CCB…)" value="${escA(r.approver || "")}" data-i="${i}" data-f="approver" onchange="coEdit(this)" ${locked ? "disabled" : ""} aria-label="Quién aprueba la orden ${escA(r.id)}">
        ${authCell(r, i, ctx.plan.reserves, locked, usesReserve)}
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
  coPolicyHint();
  buildJSON();
}
// Al registrar una orden: qué instancia debe autorizarla según su monto y su fuente de fondos (política de reservas).
function coPolicyHint(): void {
  const box = document.getElementById("coPolicyHint"); if (!box) return;
  const pol = riskCtx().plan.reserves, fund = ($("coFund") as HTMLSelectElement).value, cost = +($("coCost") as HTMLInputElement).value || 0;
  let msg = "";
  if (fund !== FUND_CONT) msg = "<b>Política de reservas:</b> " + esc(fund) + " está fuera de la línea base: la autoriza siempre el <b>Sponsor</b>, sin importar el monto.";
  else if (hasTiers(pol)) {
    const need = requiredAuthority({ fund, cost }, pol);
    msg = "<b>Política de reservas:</b> " + (cost > 0 ? "una orden de " + fmt2(cost) + " con cargo a contingencia la autoriza el <b>" + esc(AUTH_LABEL[need as AuthLevel]) + "</b>" : "la contingencia la libera el nivel que corresponde al monto") + " (" + esc(tiersText(pol, (n) => fmt2(n))) + ").";
  }
  box.style.display = msg ? "block" : "none"; box.innerHTML = msg;
}
// La traza contingencia → riesgo, y la contingencia disponible frente a la exposición residual de los riesgos abiertos.
function renderDrawdown(refs: ReturnType<typeof riskRefs>, available: number): void {
  const dd = contingencyByRisk(state.co, refs), ec = eventsCtx();
  // Política de reservas: alerta de agotamiento (la contingencia disponible bajó del umbral del plan de riesgos).
  const al = contingencyAlert(available, coBudget().cont, riskCtx().plan.reserves);
  const alertHtml = al ? `<div class="note" style="margin-top:10px;${al.alert ? "border-color:#dc3546;background:#fdecef" : ""}">${al.alert ? "<b>⚠ Alerta de agotamiento:</b> la contingencia disponible (" + fmt(available) + ") es el " + al.pct.toFixed(1) + " % de la inicial, por debajo del umbral de " + al.threshold + " % del plan de riesgos: escala al sponsor según la política de reservas." : "Contingencia disponible: " + al.pct.toFixed(1) + " % de la inicial (umbral de alerta " + al.threshold + " %)."}</div>` : "";
  const rows = dd.length ? dd.map((d) => `<tr><td class="mono">${esc(d.code)}</td><td>${esc(d.title)}</td><td class="num">${fmt2(d.contingency)}</td><td class="num">${fmt2(d.other)}</td><td class="num">${fmt2(d.pending)}</td><td class="num">${d.plannedMax === null ? "—" : fmt2(d.plannedMax)}</td><td>${d.orphan ? `<span class="pill bad">Riesgo eliminado</span>` : d.over ? `<span class="pill bad" title="Lo aprobado supera el impacto máximo que el análisis del riesgo había previsto">Supera lo previsto</span>` : `<span class="pill ok">Dentro de lo previsto</span>`}</td></tr>`).join("")
    : `<tr><td class="muted" colspan="7">Ninguna orden está vinculada a un riesgo del registro.</td></tr>`;
  const expo = ec.source === "sin registro" ? "Este proyecto no tiene Registro de Riesgos: no hay exposición residual que contrastar con la contingencia."
    : ec.events.length ? `La contingencia disponible (<b>${fmt(available)}</b>) ${available >= ec.ev ? "supera" : "<b>NO alcanza</b>"} el valor esperado neto de la exposición residual de los riesgos abiertos (<b>${fmt(ec.ev)}</b>, ${ec.events.length} evento(s)). Es una media (≈ P50): una contingencia a un percentil de decisión debe superarla con holgura.`
      : "No hay riesgos abiertos con impacto en costo cuantificado en el registro.";
  $("coDrawdown").innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>Riesgo</th><th>Descripción</th><th class="num">Aprobado con contingencia</th><th class="num">Aprobado con otras fuentes</th><th class="num">Pendiente</th><th class="num">Impacto máx. previsto</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div><div class="note" style="margin-top:10px">${expo}</div>${alertHtml}`;
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
    const ctx = riskCtx(), problems = validateApproval(r, state.co, coBudget(), riskRefs(ctx), ctx.plan.reserves);
    if (problems.length) { showToast("No se puede aprobar " + r.id + ": " + problems.join("; ") + "."); renderCO(); return; }
    r.approvedOn = todayISO();
  } else { delete r.approvedOn; }
  userEdited = true;
  r.status = sel.value; renderCO(); save();
}
// Datos de aprobación (quién aprueba, autorización del sponsor): solo con la orden Pendiente.
function coEdit(el: HTMLInputElement | HTMLSelectElement): void {
  const r = state.co[+(el.dataset.i as string)]; if (!r) return;
  const f = el.dataset.f;
  if (f === "wbsId") {   // el paquete se puede asignar también a una orden ya aprobada (las anteriores a este campo no lo traen)
    const l = coLeaves().find((x) => x.id === el.value);
    userEdited = true;
    if (l) { r.wbsId = l.id; r.wbsCode = l.code; } else { delete r.wbsId; delete r.wbsCode; }
    renderCO(); save(); return;
  }
  if (r.status !== "Pendiente") return;
  userEdited = true;
  if (f === "approver") r.approver = el.value.trim();
  else if (f === "sponsorAuth") r.sponsorAuth = (el as HTMLInputElement).checked;
  else if (f === "authLevel") { if (el.value) r.authLevel = el.value; else delete r.authLevel; renderCO(); }
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
  const pk = coLeaves().find((l) => l.id === ($("coWbs") as HTMLSelectElement).value);
  if (pk) { order.wbsId = pk.id; order.wbsCode = pk.code; }
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

/* ---------- Basis of Estimate (AACE RP 34R-05) ---------- */
// La BOE se guarda en `estimate.boe`: los cinco campos de siempre conservan su nombre (y sus ids del HTML) y el resto se suma.
const LEGACY_ID: Record<string, string> = { date: "boeDate", source: "boeSource", assumptions: "boeAssum", exclusions: "boeExcl", productivity: "boeProd" };
const boeId = (k: string): string => LEGACY_ID[k] || "boe_" + k;
const FIELD_LABEL: Record<string, string> = { date: "Fecha base de los precios (de ella se mide la escalación)", source: "Fuente de los precios", labor: "Tarifas, jornada y rendimientos", productivity: "Factores de productividad y de ajuste" };
const nl2br = (s: string): string => esc(s).replace(/\n/g, "<br>");
// CAPEX de referencia del Acta: conectado, el de los datos del proyecto (si es un número); independiente, el del caso de ejemplo.
function capexValue(): number | null {
  if (!gpiOn()) return SAMPLE_CAPEX;
  try {
    const m = (GPI as GpiApi).meta(), raw = m && m.capex ? String(m.capex).trim() : "";
    if (!raw || !/^[\d.,\s]+$/.test(raw)) return null;
    const n = Number(raw.replace(/[,\s]/g, "")); return n > 0 ? n : null;
  } catch (e) { return null; }
}
// Lo que se puede derivar del proyecto: respalda la sección aunque el texto esté vacío.
function boeFacts(): BoeFacts {
  const b = state._budget, connected = gpiOn(), g = getEng();
  let scope = false, coding = !connected;
  try {
    if (connected) {
      const sc = (GPI as GpiApi).getModule("scopeStatement") as { productScope?: string; projectScope?: string } | null;
      scope = !!sc && !!((sc.productScope || "").trim() || (sc.projectScope || "").trim());
      coding = (GPI as GpiApi).util.wbsLeaves((GPI as GpiApi).getModule("wbs")).length > 0;
    }
  } catch (e) { /* noop */ }
  return { scope, execution: !!g, classification: true, coding, currency: true, planning: !!g, risks: riskCtx().risks.length > 0, contingency: !!b && b.cont > 0, mgmt: !!b && b.mgmt > 0, escalation: !!b && b.esc > 0, capex: capexValue() !== null };
}
function boeCtx(): BoeCtx {
  const b = state._budget, last = state.baselines.length ? state.baselines[state.baselines.length - 1] : null;
  return { classNum: state.curClass, escalation: b ? b.esc : 0, baselineVersion: last ? last.version : null, baselineDate: last ? String(last.date || "") : "", capex: capexValue(), total: b ? b.total : null };
}
// Contenido de una sección que viene del proyecto (solo lectura): la BOE lo cita, no lo duplica.
function boeAutoHtml(k: string): string {
  const b = state._budget, ec = state._escCalc, c = CLASSES[state.curClass], g = getEng(), connected = gpiOn();
  const none = (t: string): string => `<span class="muted">${t}</span>`;
  switch (k) {
    case "scope": {
      if (!connected) return none("En modo independiente no hay un Enunciado del Alcance conectado: escribe el alcance abajo.");
      const sc = (GPI as GpiApi).getModule("scopeStatement") as { productScope?: string; projectScope?: string; deliverables?: unknown[] } | null;
      const t = sc ? [sc.productScope, sc.projectScope].filter((x) => x && x.trim()).join(" ") : "";
      return t ? `<b>Del Enunciado del Alcance:</b> ${esc(t)}${sc && Array.isArray(sc.deliverables) ? " · " + sc.deliverables.length + " entregable(s)." : ""}` : none("El proyecto aún no tiene Enunciado del Alcance: defínelo o escribe el alcance abajo.");
    }
    case "execution": case "planning": {
      if (!g) return none("Sin cronograma (actividades y enlaces en Cronograma/CPM): la duración y las fechas no se pueden citar.");
      const crit = Object.keys(g.rows).filter((id) => g.rows[id].critical).length, fin = finishOf(g.base);
      return `<b>Cronograma del proyecto:</b> ${fmtDays(g.base)} laborables${net && net.startDate ? ", inicio " + esc(net.startDate) : ""}${fin ? ", fin " + esc(fin) : ""} · ${crit} actividad(es) críticas${k === "planning" && ec && ec.res && ec.res.ok ? " · fecha media del gasto " + esc(ec.res.midDate || "—") : ""}.`;
    }
    case "classification": return `<b>Clase ${state.curClass}</b> — ${esc(c.desc)} Madurez del diseño ${esc(c.mat)}; uso previsto: ${esc(c.use)}; rango de exactitud ${pctTxt(classAccuracy().lo)} / ${pctTxt(classAccuracy().hi)} (${esc(accuracyOriginText(classAccuracy()))}; referencia: ${esc(publishedBandText(state.curClass as EstimateClass))}).`;
    case "coding": { const n = escPackages().pkgs.length; return `<b>EDT:</b> ${n ? n + " paquete(s) de trabajo con costo" : "sin paquetes con costo"}, con Código EDT jerárquico. Cuentas de escalación: ${ACCOUNT_IDS.map((id) => esc(ACCOUNT_LABEL[id])).join(", ")}.`; }
    case "currency": return `<b>Moneda del plan:</b> ${esc(($("cur") as HTMLSelectElement).value)} (${sym()}). Componente en moneda extranjera ${esc(($("fxShare") as HTMLInputElement).value)} %, tipo de cambio ${($("fxMode") as HTMLSelectElement).value === "frozen" ? "congelado a la fecha base" : "flotante con banda ±" + esc(($("fxBand") as HTMLInputElement).value) + " %"}; su exposición (${fmt(b ? b.fx : 0)}) se cuantifica aparte de la escalación.`;
    case "risks": {
      const rc = riskCtx(), open = rc.risks.filter((r) => r.status !== "materializado" && r.status !== "cerrado");
      return rc.source === "sin registro" ? none("Este proyecto no tiene Registro de Riesgos.") : `<b>Registro de Riesgos (${rc.source === "registro" ? "del proyecto" : "caso de ejemplo"}):</b> ${rc.risks.length} riesgo(s), ${open.length} abierto(s)${open.length ? ": " + esc(open.slice(0, 5).map((r) => r.code + " " + (r.title || "")).join("; ")) + (open.length > 5 ? "…" : "") : ""}.`;
    }
    case "contingency": return b ? `<b>${esc(METHOD_LABEL[contMethod()])}:</b> ${fmt(b.cont)}${b.base ? " (" + ((b.cont / b.base) * 100).toFixed(1) + " % del costo base)" : ""}${contMethod() === "manual" ? "" : ", " + esc(($("contPct") as HTMLSelectElement).value)}.` : "";
    case "mgmt": return b ? `<b>${esc(($("mgmtPct") as HTMLInputElement).value)} % de la línea base = ${fmt(b.mgmt)}</b>, propiedad del sponsor y fuera de la línea base.` : "";
    case "escalation": return b && ec ? `<b>Escalación:</b> ${ec.method === "indices" ? "por índices (58R-10 / 68R-11), " + esc(ec.provLabel) : "método simple"} ${fmt(b.escIdx || 0)}; <b>tipo de cambio:</b> ${fmt(b.fx || 0)}; la contingencia (${fmt(b.cont)}) excluye ambos.` : "";
    case "capex": { const cx = capexValue(); return cx !== null && b ? `<b>CAPEX de referencia:</b> ${fmt(cx)} · presupuesto total ${fmt(b.total)} → ${b.total <= cx + 0.5 ? "dentro del CAPEX" : "SUPERA el CAPEX en " + fmt(b.total - cx)}.` : none("Sin CAPEX de referencia (Acta de Constitución)."); }
    default: return "";
  }
}
const boeOpen = new Set<string>(["g1"]);
const boeStateLabel = (e: { state: string; applies: boolean }): string => (!e.applies ? "No aplica" : e.state === "completa" ? "Completa" : e.state === "respaldada" ? "Respaldada por el proyecto" : e.state === "falta" ? "Falta" : "Opcional");
function renderBoe(): void {
  if (!document.getElementById("boeForm")) return;
  const B = state.boe;
  const meta = (id: string, label: string, val: string, k: string, type = "text"): string => `<label class="f"><span>${label}</span><input id="${id}" class="mono" type="${type}" value="${escA(val)}" data-b="meta" data-k="${k}" oninput="boeEdit(this)" onchange="save()"></label>`;
  $("boeHead").innerHTML = `<div class="boe-head">
      ${meta("boeVersion", "Versión de la BOE", B.version, "version")}
      <label class="f"><span>Estado</span><select id="boeStatusSel" class="mono" data-b="meta" data-k="status" onchange="boeEdit(this);save()">${STATUSES.map((s) => `<option value="${s}" ${B.status === s ? "selected" : ""}>${BOE_STATUS_LABEL[s]}</option>`).join("")}</select></label>
      ${meta("boePrepared", "Preparó", B.preparedBy, "preparedBy")}${meta("boeReviewed", "Revisó", B.reviewedBy, "reviewedBy")}${meta("boeApprover", "Aprueba", B.approvedBy, "approvedBy")}${meta("boeApprovedOn", "Fecha de aprobación", B.approvedOn, "approvedOn", "date")}
    </div><div class="muted small" style="margin-top:6px">Proceso de 34R-05: borrador → revisión → aprobación → cambios y actualizaciones. La BOE es la base del control de cambios: cuando la línea base cambia, se actualiza y se vuelve a aprobar.</div>`;
  const field = (k: string, s: BoeSection): string => {
    const v = B.text[k] || "", attr = `id="${boeId(k)}" data-b="text" data-k="${k}" oninput="boeEdit(this)" onchange="save()" aria-label="${escA(s.id + " " + s.title)}"`;
    const lab = FIELD_LABEL[k] ? `<span>${esc(FIELD_LABEL[k])}</span>` : "";
    if (k === "date") return `<label class="f">${lab}<input type="date" class="mono" ${attr} value="${escA(v)}"></label>`;
    if (k === "source") return `<label class="f">${lab}<input ${attr} value="${escA(v)}" placeholder="Ej. cotizaciones vigentes, base de precios, contratos"></label>`;
    return `<label class="f">${lab}<textarea ${attr} rows="3" placeholder="${escA(s.placeholder || "")}">${esc(v)}</textarea></label>`;
  };
  const sec = (s: BoeSection): string => `<div class="boe-sec" id="sec-${s.id}"><h5>${s.id} ${esc(s.title)} <span class="en">· ${esc(s.en)}</span><span class="boe-st" id="st-${s.id}"></span></h5>
      <div class="boe-hint">${esc(s.hint)}</div>${s.auto ? `<div class="boe-auto" id="auto-${s.id}"></div>` : ""}
      ${s.list ? `<div id="boeList-${s.list}"></div>` : s.keys.map((k) => field(k, s)).join("")}</div>`;
  $("boeForm").innerHTML = GROUPS.map((g) => `<details class="boe-grp" data-g="${g.id}" ${boeOpen.has(g.id) ? "open" : ""}><summary>${esc(g.title)}<span class="boe-gc" id="gc-${g.id}"></span></summary>${SECTIONS.filter((s) => s.group === g.id).map(sec).join("")}</details>`).join("");
  document.querySelectorAll<HTMLDetailsElement>("#boeForm details.boe-grp").forEach((d) => d.addEventListener("toggle", () => { const id = d.dataset.g as string; if (d.open) boeOpen.add(id); else boeOpen.delete(id); }));
  renderBoeLists(); refreshBoe();
}
function renderBoeLists(): void {
  const B = state.boe, cell = (kind: string, i: number, f: string, v: string, ph: string): string => `<td><input data-kind="${kind}" data-i="${i}" data-f="${f}" value="${escA(v)}" placeholder="${ph}" oninput="boeListEdit(this)" onchange="save()" aria-label="${ph}"></td>`;
  const tbl = (kind: "team" | "refs", head: string[], f: [string, string], rows: Array<Record<string, string>>): string => `<table class="boe-list"><thead><tr><td class="muted small">${head[0]}</td><td class="muted small">${head[1]}</td><td></td></tr></thead><tbody>${rows.map((r, i) => `<tr>${cell(kind, i, f[0], r[f[0]], head[0])}${cell(kind, i, f[1], r[f[1]], head[1])}<td style="width:34px"><button class="btn ghost sm" onclick="boeListDel('${kind}',${i})" aria-label="Quitar">✕</button></td></tr>`).join("")}</tbody></table><button class="btn sm" style="margin-top:6px" onclick="boeListAdd('${kind}')">+ Agregar</button>`;
  const t = document.getElementById("boeList-team"), r = document.getElementById("boeList-refs"), c = document.getElementById("boeList-checklist");
  if (t) t.innerHTML = tbl("team", ["Nombre o cargo", "Rol en el estimado"], ["name", "role"], B.team as unknown as Array<Record<string, string>>);
  if (r) r.innerHTML = tbl("refs", ["Documento o proyecto", "Nota"], ["title", "note"], B.refs as unknown as Array<Record<string, string>>);
  if (c) c.innerHTML = `<div class="boe-chk">${CHECKLIST_ITEMS.map((it) => `<label><input type="checkbox" data-id="${it.id}" ${B.checklist.some((x) => x.id === it.id && x.done) ? "checked" : ""} onchange="boeCheck(this)"> ${esc(it.label)}</label>`).join("")}</div>`;
}
function refreshBoe(): void {
  if (!document.getElementById("boeStatus")) return;
  const facts = boeFacts(), ctx = boeCtx(), c = completeness(state.boe, facts, state.curClass), f = boeFindings(state.boe, facts, ctx);
  const miss = c.missing.length ? `<div class="boe-miss">${c.missing.map((s) => `<button type="button" data-goto="${s.id}">${esc(s.id + " " + s.title)}</button>`).join("")}</div>` : `<div class="muted small">Todas las secciones que se exigen para un estimado de clase ${state.curClass} están completas o respaldadas por el proyecto.</div>`;
  const fl = f.length ? `<ul class="esc-adv" style="margin-top:8px">${f.map((x) => `<li class="${x.severity}"><b class="cd">${x.code}</b>${esc(x.text)}</li>`).join("")}</ul>` : "";
  $("boeStatus").innerHTML = `<div><b>Estimado de clase ${state.curClass}</b> · se exigen <b>${c.required}</b> de ${SECTIONS.length} secciones · completas o respaldadas por el proyecto: <b>${c.done}</b> (${c.pct} %)</div>
    <div class="boe-bar"><div style="width:${c.pct}%"></div></div>${miss}${fl}
    <div style="margin-top:8px"><button type="button" class="btn sm" id="boeOpenAll">Abrir todas las secciones</button> <button type="button" class="btn sm" id="boeCloseAll">Plegar todas</button></div>
    <div class="muted" style="font-size:11.5px;margin-top:8px">Qué secciones se exigen según la clase es un <b>criterio didáctico</b> de este módulo: 34R-05 (§4) dice que el detalle de la BOE depende de la definición del proyecto, de su valor y de su tipo, pero no fija una lista por clase. La sección 3.15 del índice público («Containments») no se pudo verificar y se omite.</div>`;
  $("boeStatus").querySelectorAll<HTMLElement>("[data-goto]").forEach((b) => b.addEventListener("click", () => {
    const s = SECTIONS.find((x) => x.id === b.dataset.goto); if (!s) return;
    const d = document.querySelector<HTMLDetailsElement>(`#boeForm details[data-g="${s.group}"]`); if (d) { d.open = true; boeOpen.add(s.group); }
    const el = document.getElementById("sec-" + s.id); if (el) { el.scrollIntoView({ block: "center" }); const i = el.querySelector<HTMLElement>("textarea,input"); if (i) i.focus(); }
  }));
  const setAll = (open: boolean): void => { document.querySelectorAll<HTMLDetailsElement>("#boeForm details.boe-grp").forEach((d) => { d.open = open; const id = d.dataset.g as string; if (open) boeOpen.add(id); else boeOpen.delete(id); }); };
  const oa = document.getElementById("boeOpenAll"), ca = document.getElementById("boeCloseAll");
  if (oa) oa.addEventListener("click", () => setAll(true)); if (ca) ca.addEventListener("click", () => setAll(false));
  const done: Record<string, [number, number]> = {};
  c.evals.forEach((e) => {
    const st = document.getElementById("st-" + e.section.id);
    if (st) { st.textContent = boeStateLabel(e); st.className = "boe-st " + (!e.applies ? "opcional" : e.state); }
    const au = document.getElementById("auto-" + e.section.id); if (au && e.section.auto) au.innerHTML = boeAutoHtml(e.section.auto);
    if (e.required) { const g = done[e.section.group] || (done[e.section.group] = [0, 0]); g[1]++; if (e.state === "completa" || e.state === "respaldada") g[0]++; }
  });
  GROUPS.forEach((g) => { const el = document.getElementById("gc-" + g.id); if (el) el.textContent = done[g.id] ? done[g.id][0] + "/" + done[g.id][1] + " exigidas" : "opcionales"; });
}
function boeEdit(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  userEdited = true;
  const kind = el.dataset.b, k = el.dataset.k || "", B = state.boe;
  if (kind === "text") B.text[k] = el.value;
  else if (kind === "meta") {
    if (k === "status") {
      B.status = STATUSES.indexOf(el.value as never) >= 0 ? el.value as Boe["status"] : "borrador";
      if (B.status === "aprobada" && !B.approvedOn) { B.approvedOn = todayISO(); const d = document.getElementById("boeApprovedOn") as HTMLInputElement | null; if (d) d.value = B.approvedOn; }
    } else if (k === "approvedOn") B.approvedOn = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : "";
    else (B as unknown as Record<string, string>)[k] = el.value;
  }
  if (kind === "text" && k === "date") recalcCont(); else refreshBoe();   // la fecha base de precios mueve la escalación
}
function boeListAdd(kind: "team" | "refs"): void { userEdited = true; if (kind === "team") state.boe.team.push({ name: "", role: "" }); else state.boe.refs.push({ title: "", note: "" }); renderBoeLists(); refreshBoe(); save(); }
function boeListDel(kind: "team" | "refs", i: number): void { userEdited = true; state.boe[kind].splice(i, 1); renderBoeLists(); refreshBoe(); save(); }
function boeListEdit(el: HTMLInputElement): void {
  userEdited = true;
  const kind = el.dataset.kind as "team" | "refs", i = Number(el.dataset.i), f = el.dataset.f as string, row = state.boe[kind][i] as unknown as Record<string, string> | undefined;
  if (row) row[f] = el.value; refreshBoe();
}
function boeCheck(el: HTMLInputElement): void { userEdited = true; const it = state.boe.checklist.find((x) => x.id === el.dataset.id); if (it) it.done = el.checked; refreshBoe(); save(); }
// La BOE en el documento (pestaña 05): en el orden de 34R-05, con lo que viene del proyecto citado junto al texto.
function boeDocHtml(): string {
  const B = state.boe, facts = boeFacts(), c = completeness(B, facts, state.curClass), f = boeFindings(B, facts, boeCtx());
  const head = `<table class="dt">
      <tr><td>Versión · estado</td><td>${esc(B.version)} · <b>${BOE_STATUS_LABEL[B.status]}</b></td></tr>
      <tr><td>Preparó · revisó</td><td>${esc(B.preparedBy) || "—"} · ${esc(B.reviewedBy) || "—"}</td></tr>
      <tr><td>Aprobó</td><td>${esc(B.approvedBy) || "—"}${B.approvedOn ? " · " + esc(B.approvedOn) : ""}</td></tr>
      <tr><td>Nivel de detalle</td><td>Estimado de clase ${state.curClass}: ${c.required} sección(es) exigidas, ${c.done} completas o respaldadas por el proyecto (${c.pct} %)${c.missing.length ? ". <b>Faltan:</b> " + esc(c.missing.map((s) => s.id + " " + s.title).join("; ")) : ""}.</td></tr></table>`;
  const listHtml = (s: BoeSection): string => s.list === "team" ? B.team.filter((m) => m.name.trim()).map((m) => esc(m.name) + (m.role.trim() ? " — " + esc(m.role) : "")).join("<br>")
    : s.list === "refs" ? B.refs.filter((r) => r.title.trim()).map((r) => esc(r.title) + (r.note.trim() ? " — " + esc(r.note) : "")).join("<br>")
    : CHECKLIST_ITEMS.map((it) => (B.checklist.some((x) => x.id === it.id && x.done) ? "☑ " : "☐ ") + esc(it.label)).join("<br>");
  const groups = GROUPS.map((g) => {
    const rows = c.evals.filter((e) => e.section.group === g.id && e.applies).map((e) => {
      const s = e.section, txt = s.list ? listHtml(s) : s.keys.map((k) => B.text[k] ? (s.keys.length > 1 && FIELD_LABEL[k] ? `<i>${esc(FIELD_LABEL[k])}:</i> ` : "") + nl2br(B.text[k]) : "").filter(Boolean).join("<br>");
      const auto = s.auto && facts[s.auto] ? boeAutoHtml(s.auto) : "";
      if (!txt && !auto && !e.required) return "";
      return `<tr><td>${s.id} ${esc(s.title)}</td><td>${auto}${auto && txt ? "<br>" : ""}${txt || (auto ? "" : `<span class="muted">— (falta)</span>`)}</td></tr>`;
    }).join("");
    return rows ? `<p style="font-size:12.5px;margin:12px 0 4px"><b>${esc(g.title)}</b></p><table class="dt">${rows}</table>` : "";
  }).join("");
  return head + groups + (f.length ? `<p style="font-size:12.5px;margin:10px 0 0"><b>Revisar:</b> ${f.map((x) => esc(x.code + " — " + x.text)).join(" · ")}</p>` : "");
}

/* ---------- Documento BOE (recopilación integral) ---------- */
function boeCORows(): string {
  if (!state.co.length) return `<tr><td class="muted" colspan="7">Sin órdenes de cambio registradas</td></tr>`;
  return state.co.map((r) => `<tr>
    <td class="mono">${esc(r.id)}</td><td>${esc(r.desc)}</td><td>${esc(kindLabel(r.kind))}${r.riskCode ? " · " + esc(r.riskCode) : ""}</td><td>${esc(r.cause)}</td>
    <td style="text-align:right" class="mono">${fmt2(+r.cost)}</td><td>${esc(r.fund)}</td>
    <td>${esc(r.status)}${r.status === "Aprobada" ? " · " + esc(r.approver || "—") + (authLevelOf(r) ? " (" + esc(AUTH_LABEL[authLevelOf(r) as AuthLevel]) + ")" : "") : ""}${r.baselined ? " · " + esc(r.baselined) : ""}</td></tr>`).join("");
}
// Política de reservas (plan de gestión de riesgos) que gobierna la aprobación de las órdenes de cambio.
function policyDocHtml(): string {
  const pol = riskCtx().plan.reserves, al = contingencyAlert((state._coTotals && state._coTotals.contingencyAvailable) || 0, coBudget().cont, pol);
  const tiers = hasTiers(pol) ? "La <b>contingencia</b> la libera la instancia que corresponde al monto de cada orden (" + esc(tiersText(pol, (n) => fmt2(n))) + ")." : "El plan de riesgos no define límites de autoridad por monto para liberar la contingencia.";
  return `<p style="font-size:12.5px;margin:8px 0 0"><b>Política de reservas (plan de riesgos):</b> ${tiers} La <b>reserva de gestión</b> (${esc(FUND_MGMT)}, fuera de la línea base) y el <b>financiamiento adicional</b> los autoriza siempre el sponsor.${pol.contAlertPct !== null ? " Se escala si la contingencia disponible baja del " + pol.contAlertPct + " % de la inicial" + (al ? " (hoy " + al.pct.toFixed(1) + " %)" : "") + "." : ""}</p>`;
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
  // Plazo integrado (AACE 57R-09): efecto de los eventos sobre el fin del proyecto y su costo.
  const sc = res && res.schedule, cpd = timeCostPerDay(), basisT = (($("rngTimeBasis") as HTMLInputElement | null) || { value: "" }).value.trim();
  const schedTxt = sc && (sc.events || sc.integrated)
    ? ` <b>Plazo:</b> ${sc.events} evento(s) retrasan actividades del cronograma${sc.integrated ? " y las duraciones de <b>" + sc.pertActs + " actividad(es) se sortean también (Beta-PERT) en la misma iteración</b>" : ""} (CPM real, duración base ${fmtDays(sc.base)}); con P${p} el plazo es ${fmtDays(sc.p[p])} (reserva de plazo ${fmtDays(Math.max(0, sc.p[p] - sc.base))}${finishOf(sc.p[p]) ? ", fin " + esc(finishOf(sc.p[p])) : ""}).${cpd > 0 ? " La extensión del plazo se costea a " + fmt(cpd) + " por día" + (basisT ? " (" + esc(basisT) + ")" : "") + ": costo medio " + fmt(sc.timeCostMean) + ", incluido en la contingencia." : " No se definió un costo por día de extensión: el retraso no se traduce a costo."}`
    : "";
  return `<p style="font-size:12.5px;margin:10px 0 4px"><b>Base de la contingencia — estimación por rangos y simulación Monte Carlo (AACE RP 41R-08 y 40R-08).</b> ${res
    ? `Distribución triangular por partida; correlación entre partidas ${Math.round(res.correlation * 100)} %; ${res.iterations.toLocaleString("es-PE")} iteraciones (semilla ${res.seed}, reproducible). Estimado base Σ más probable ${fmt(res.ml)}; P50 ${fmt(res.p[50])}, P${p} ${fmt(res.p[p])}. Contingencia = P${p} − estimado base = <b>${fmt(contingencyAt(res, p).amount)}</b>. Cubre la incertidumbre de los rangos del estimado. ${evTxt}${schedTxt}`
    : "Aún no hay partidas válidas."}</p>
    <table class="dt"><thead><tr><td style="font-weight:700;color:var(--muted)">Partida</td><td style="font-weight:700;color:var(--muted);text-align:right">Más probable</td><td style="font-weight:700;color:var(--muted);text-align:right">Mín / Máx</td><td style="font-weight:700;color:var(--muted)">Fundamento del rango</td></tr></thead><tbody>${lines}</tbody></table>`;
}
// Base de la escalación en la BOE (AACE 34R-05 / 58R-10 / 68R-11): qué es escalación, índices, tiempo, precios fijados y simulación.
function escDocHtml(): string {
  const c = state._escCalc; if (!c || c.method !== "indices") return "";
  const p = state.esc, bd = ($("boeDate") as HTMLInputElement).value;
  const years = escYears(c.ctx);
  const head = `<thead><tr><td style="font-weight:700;color:var(--muted)">Cuenta</td>${years.map((y) => `<td style="font-weight:700;color:var(--muted);text-align:right">${y}</td>`).join("")}<td style="font-weight:700;color:var(--muted)">Fuente del pronóstico · rango de la tasa (pp)</td></tr></thead>`;
  const rows = p.accounts.filter((a) => Object.keys(a.rates).length).map((a) => `<tr><td>${esc(ACCOUNT_LABEL[a.id])}</td>${years.map((y) => `<td style="text-align:right" class="mono">${a.rates[String(y)] === undefined ? "—" : a.rates[String(y)] + " %"}</td>`).join("")}<td>${esc(a.source || "— (sin fuente: documentar)")} · ${a.low} / +${a.high}</td></tr>`).join("");
  const locked = c.res ? c.res.byPackage.filter((k) => k.lock) : [];
  const res = c.res, sim = c.sim;
  return `<p style="font-size:12.5px;margin:10px 0 4px"><b>Base de la escalación — por índices (AACE RP 58R-10 y 68R-11).</b> Escalación = cambio general de precios de mercado, incluida la inflación; <b>excluye</b> la contingencia (riesgos específicos del proyecto) y el tipo de cambio, que se estiman aparte. Fórmula: costo del período × [índice en la fecha de gasto ÷ índice en la fecha base − 1], por cuenta de costo. Fecha base de precios: <b>${esc(bd) || "— (definir)"}</b>.${res && res.ok ? ` Los ${c.ctx.pkgs.length} paquetes se reparten en el tiempo (mensual, lineal) según sus fechas del cronograma; fecha media ponderada del gasto ${esc(res.midDate || "—")}.` : ""}</p>
    ${rows ? `<table class="dt">${head}<tbody>${rows}</tbody></table>` : `<p class="muted" style="font-size:12.5px">Sin pronóstico de índices definido.</p>`}
    ${res && res.ok ? `<p style="font-size:12.5px;margin:8px 0 0">Composición por omisión del costo: ${ACCOUNT_IDS.filter((id) => p.defaultMix[id]).map((id) => esc(ACCOUNT_LABEL[id]) + " " + p.defaultMix[id] + " %").join(" · ")}${Object.keys(p.packages).some((id) => p.packages[id].mix) ? "; " + Object.keys(p.packages).filter((id) => p.packages[id].mix).length + " paquete(s) con composición propia" : ""}. ${locked.length ? "<b>Precio fijado</b> por contrato: " + esc(locked.map((k) => k.code + " (" + k.lock + ")").join(", ")) + " — desde esa fecha el índice no corre." : "Ningún paquete tiene el precio fijado."}
      Escalación del pronóstico central <b>${fmt(c.central)}</b> (${pct1(res.factor)} del costo${p.onContingency ? "; incluye la escalación de la contingencia, «Escalation on Contingency»" : "; la contingencia no se escala"}). Se financia <b>${fmt(c.esc)}</b> (${esc(c.provLabel)}).${sim ? ` Simulación Monte Carlo (68R-11; ${sim.iterations.toLocaleString("es-PE")} iteraciones, semilla ${sim.seed}, correlación entre cuentas ${Math.round(sim.correlation * 100)} %${sim.withDelay ? ", con el retraso del análisis integrado de riesgo" : ", sin variable de plazo"}): P50 ${fmt(sim.p[50] * c.funded)}, P70 ${fmt(sim.p[70] * c.funded)}, P80 ${fmt(sim.p[80] * c.funded)}, P90 ${fmt(sim.p[90] * c.funded)}; el pronóstico central equivale al P${Math.round(sim.probAtOrBelowDet * 100)}.` : ""}</p>` : ""}
    ${c.adv.length ? `<p style="font-size:12.5px;margin:8px 0 0"><b>Revisar:</b> ${c.adv.map((a) => esc(a.code + " — " + a.text)).join(" · ")}</p>` : ""}
    <p class="muted" style="font-size:12px;margin:8px 0 0">Límites: no se simula la incertidumbre del costo (está en la contingencia, que se escala) ni la forma de la curva de gasto (lineal por paquete); las tasas y sus rangos son datos del equipo y deben provenir de un economista o de una fuente reconocida.</p>`;
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
      <h4 class="dsec-t"><span class="dn">01</span>Reglas normativas del plan (PMBOK)</h4>
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
        <tr><td>Rango de exactitud</td><td>${pctTxt(classAccuracy().lo)} / ${pctTxt(classAccuracy().hi)} — ${esc(accuracyOriginText(classAccuracy()))}</td></tr>
        <tr><td>Referencia publicada</td><td>${esc(publishedBandText(state.curClass as EstimateClass))} (${esc(ACCURACY_SOURCE.practice)}, ${esc(ACCURACY_SOURCE.revision)})</td></tr>
        ${classDocRows()}
      </table>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">04</span>Basis of Estimate (AACE RP 34R-05)</h4>
      ${boeDocHtml()}
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">05</span>Contingencia, escalation y presupuesto</h4>
      <table class="dt">
        <tr><td>Estimación de costos de las actividades</td><td>${fmt(b.base)}</td></tr>
        <tr><td>Contingencia</td><td>${fmt(b.cont)} — ${esc(METHOD_LABEL[contMethod()])}${contMethod() === "manual" ? "" : ", " + esc((($("contPct") as HTMLSelectElement).selectedOptions[0].text).split(" ")[0])} (${b.base ? ((b.cont as number) / b.base * 100).toFixed(1) : "—"}%)</td></tr>
        ${contMethod() === "clase_tabla" ? `<tr><td></td><td class="muted">Referencia didáctica por clase y percentil: no proviene de una norma de AACE ni de un análisis de riesgo del proyecto.</td></tr>` : ""}
        ${contMethod() === "manual" ? `<tr><td>Fundamento del porcentaje</td><td>${esc(($("manualBasis") as HTMLTextAreaElement).value) || "— (documentar)"}</td></tr>` : ""}
        <tr><td>Escalación</td><td>${fmt(b.escIdx)} — ${escMethodVal() === "indices" ? "por índices y en el tiempo (AACE 58R-10 / 68R-11); ver la base abajo" : "método simple: inflación " + esc(($("inflRate") as HTMLInputElement).value) + " % a " + esc(($("inflYears") as HTMLInputElement).value) + " años (una tasa y un punto de gasto)"}</td></tr>
        <tr><td>Tipo de cambio (aparte)</td><td>${fmt(b.fx)} — componente en moneda extranjera ${esc(($("fxShare") as HTMLInputElement).value)} %, TC ${fxTxt}</td></tr>
        <tr><td><b>BAC — línea base de costos${state.baselines.length ? " (inicial)" : ""}</b></td><td><b>${fmt(b.bac)}</b> (excluye reserva de gestión)</td></tr>
        <tr><td>Reserva de gestión</td><td>${fmt(b.mgmt)} — propiedad del sponsor</td></tr>
        <tr><td><b>Presupuesto total</b></td><td><b>${fmt(b.total)}</b></td></tr>
        ${state.baselines.length ? `<tr><td><b>BAC vigente</b></td><td><b>${fmt(t.bacCurrent)}</b> — ${esc(state.baselines[state.baselines.length - 1].version)} (${state.baselines.length} cambio(s) de línea base)</td></tr>` : ""}
      </table>
      ${rangeDocHtml()}
      ${escDocHtml()}
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
      ${policyDocHtml()}
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
      class: state.curClass, accuracy: state.acc, boe: serializeBoe(state.boe)   // 34R-05: date, source, assumptions, exclusions y productivity conservan su nombre; el resto se suma
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
        includePert: pertOn(), timeCostPerDay: timeCostPerDay(), timeCostBasis: (($("rngTimeBasis") as HTMLInputElement | null) || { value: "" }).value, results: rangeSummary()
      },
      mgmtReservePct: +($("mgmtPct") as HTMLInputElement).value, escalation: {
        // Los cuatro primeros y el tipo de cambio son los de siempre (proyectos antiguos los leen igual); lo demás es la escalación por
        // índices (AACE 58R-10 / 68R-11). Sin `method` un proyecto guardado antes se lee como «simple».
        inflation: +($("inflRate") as HTMLInputElement).value, years: +($("inflYears") as HTMLInputElement).value,
        fxShare: +($("fxShare") as HTMLInputElement).value, fxMode: ($("fxMode") as HTMLSelectElement).value, fxBand: +($("fxBand") as HTMLInputElement).value,
        method: escMethodVal(), baseDate: ($("boeDate") as HTMLInputElement).value, accounts: state.esc.accounts, defaultMix: state.esc.defaultMix,
        packages: state.esc.packages, onContingency: state.esc.onContingency, provision: state.esc.provision, correlation: state.esc.correlation,
        results: escSummary()
      },
      computed: state._budget || null
    },
    changeOrders: state.co, changeTotals: state._coTotals || null, baselineLog: state.baselines
  };
}
// Resumen guardado de la escalación por índices (la simulación es determinista: se puede recalcular igual).
function escSummary(): Record<string, unknown> | null {
  const c = state._escCalc;
  if (!c || c.method !== "indices" || !c.res || !c.res.ok) return null;
  const out: Record<string, unknown> = { funded: c.funded, central: c.central, financed: c.esc, factor: c.res.factor, provision: state.esc.provision, midDate: c.res.midDate };
  if (c.sim) Object.assign(out, { p50: c.sim.p[50] * c.funded, p70: c.sim.p[70] * c.funded, p80: c.sim.p[80] * c.funded, p90: c.sim.p[90] * c.funded, probAtOrBelowCentral: c.sim.probAtOrBelowDet, withDelay: c.sim.withDelay });
  return out;
}
// Resumen guardado del análisis de rangos (la simulación es determinista: se puede recalcular igual).
function rangeSummary(): Record<string, number> | null {
  const r = simulate(corrValue());
  if (!r) return null;
  const out: Record<string, number> = { ml: r.ml, mean: r.mean, sd: r.sd, p10: r.p[10], p50: r.p[50], p70: r.p[70], p80: r.p[80], p90: r.p[90], events: r.events, eventsEV: r.eventsEV };
  if (r.schedule) Object.assign(out, { schedBase: r.schedule.base, schedP50: r.schedule.p[50], schedP70: r.schedule.p[70], schedP80: r.schedule.p[80], schedP90: r.schedule.p[90], schedPertActs: r.schedule.pertActs, schedProbDelay: r.schedule.probDelay, timeCostMean: r.schedule.timeCostMean });
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
    const wbs = (GPI as GpiApi).util.effectiveWbs();   // la EDT tal como la muestra WBS Builder (con los costos de Estimar los Costos)
    const roll = ((GPI as GpiApi).util && wbs) ? (GPI as GpiApi).util.wbsRollup(wbs) : null;
    // Con proyecto activo la estimación base sale de la EDT real; si aún no
    // hay costos cargados, parte de 0 (no del valor de demostración del HTML).
    const v = (roll && roll.cost > 0) ? Math.round(roll.cost) : 0;
    ($("baseCost") as HTMLInputElement).value = String(v); ($("actCostP1") as HTMLInputElement).value = String(v);
  } catch (e) { /* noop */ }
}
// «Cargar ejemplo en el proyecto» (auditoría, media): el ejemplo DISTRIB+ de Costos (órdenes de cambio, partidas por rangos, costo por día, escalación por índices y BOE)
// solo existía en el modo independiente; con un proyecto conectado el módulo arranca en blanco (regla de oro de los ejemplos) y no había forma de cargarlo. Es una
// ACCIÓN EXPLÍCITA del alumno (dos pulsaciones si ya hay datos): reemplaza lo de Costos y lo ata a los paquetes REALES de la EDT (por Código EDT) y, si existe, al Registro de Riesgos.
let sampleArmedAt = 0;
function loadSampleIntoProject(): void {
  if (!gpiOn()) { showToast("Abre este módulo desde el Panel de Control para cargar el ejemplo en un proyecto."); return; }
  const G = GPI as GpiApi, leaves = G.util.wbsLeaves(G.util.effectiveWbs());
  if (!leaves.length) { showToast("La EDT del proyecto activo está vacía: carga primero el ejemplo en WBS Builder."); return; }
  const btn = $("btnLoadSampleCost");
  if ((state.co.length || state.ranges.length) && Date.now() - sampleArmedAt > 6000) {
    sampleArmedAt = Date.now(); btn.textContent = "¿Reemplazar los datos de Costos? Pulsa de nuevo";
    setTimeout(() => { btn.textContent = "⇩ Cargar ejemplo en el proyecto"; }, 6000); return;
  }
  sampleArmedAt = 0; btn.textContent = "⇩ Cargar ejemplo en el proyecto";
  const idByCode: Record<string, string> = {}; leaves.forEach((l) => { idByCode[l.code] = l.id; });
  const rc = riskCtx(); let unlinked = 0;
  state.co = SAMPLE_CO.map((o) => {
    const c: ChangeOrder = { ...o, wbsId: o.wbsCode ? idByCode[o.wbsCode] || "" : "" };
    if (c.riskCode) { const rk = rc.source === "registro" ? rc.risks.find((r) => r.code === c.riskCode) : null; if (rk) c.riskId = rk.id; else { delete c.riskId; unlinked++; } }
    return c;
  });
  state.ranges = JSON.parse(JSON.stringify(SAMPLE_RANGES));
  ($("rngTimeCost") as HTMLInputElement).value = String(SAMPLE_TIME_COST); ($("rngTimeBasis") as HTMLInputElement).value = SAMPLE_TIME_BASIS;
  state.esc = buildSampleEscPlan((c) => idByCode[c] || ""); ($("escMethod") as HTMLSelectElement).value = "indices"; escInputsKey = "";
  state.boe = buildSampleBoe(); renderBoe();
  seedFromProject();   // el costo base sale de la EDT del proyecto
  userEdited = true; netDirty = true; renderCO(); recalcCont(); buildDoc(); checkThresholds(); save(); flash();
  showToast("Ejemplo DISTRIB+ cargado en Costos (" + state.co.length + " órdenes de cambio, " + state.ranges.length + " partidas, escalación por índices y BOE)." + (unlinked ? " La orden de cambio por riesgo no quedó vinculada: carga el ejemplo del Registro de Riesgos y vuelve a cargarlo." : ""));
}
function pullFromWBS(): void {
  if (!gpiOn()) { showToast("Abre este módulo desde el Panel de Control para conectar la EDT."); return; }
  userEdited = true;
  const wbs = (GPI as GpiApi).util.effectiveWbs();   // la EDT tal como la muestra WBS Builder (con los costos de Estimar los Costos)
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
  const G = GPI as GpiApi, rows = G.util && wbs ? G.util.costEstimateRows(estimate, activities, wbs) : [];
  if (!rows.some((r) => r.subtotal != null && r.subtotal > 0)) { showToast("Aún no hay actividades con Cantidad y Precio unitario cargados en Estimar los Costos."); return; }
  // Paquete por paquete con la regla de WBS Builder: el estimado donde está completo; donde falta algún precio, el costo de la EDT
  // (sumar solo lo que tiene precio daba un costo base menor que el real).
  const leaves = G.util.wbsLeaves(wbs), wbsCost: Record<string, number> = {};
  leaves.forEach((l) => { wbsCost[l.id] = wbs && wbs.nodes[l.id] ? Number(wbs.nodes[l.id].cost) || 0 : 0; });
  const pb = packageBudgets({ leaves, wbsCost, estimateRows: rows.map((r) => ({ leafId: r.leafId, subtotal: r.subtotal })) });
  const total = Object.keys(pb).reduce((s, id) => s + pb[id].bac, 0), fromWbs = Object.keys(pb).filter((id) => pb[id].source !== "Estimar los Costos").length;
  const v = Math.round(total); ($("baseCost") as HTMLInputElement).value = String(v); ($("actCostP1") as HTMLInputElement).value = String(v);
  save(); recalcCont(); flash();
  if (fromWbs) showToast(fromWbs + " paquete(s) sin estimado completo se tomaron con su costo de la EDT.");
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
  state.acc = normalizeAccuracyOverride(e.accuracy);   // ajuste del rango de exactitud del proyecto (opcional: un proyecto antiguo no lo trae)
  fillAccuracyForm();
  if (e.boe) { state.boe = normalizeBoe(e.boe); renderBoe(); }   // un proyecto guardado antes solo trae los cinco campos de siempre: el resto queda vacío y el estado en borrador
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
    // Un proyecto guardado antes de la escalación por índices no trae `method`: se lee como «simple» y sus cifras no cambian.
    state.esc = normalizeEscPlan(x); ($("escMethod") as HTMLSelectElement).value = state.esc.method; escInputsKey = "";
  }
  if (b.rangeAnalysis) {
    const ra = b.rangeAnalysis;
    if (Array.isArray(ra.lines)) {
      state.ranges = ra.lines.map((l: Record<string, unknown>, i: number): RangeLine => ({ id: String(l.id || "m-" + i), name: String(l.name || ""), ml: Number(l.ml), lowPct: Number(l.lowPct), highPct: Number(l.highPct), basis: String(l.basis || "") }));
    }
    if (ra.correlation != null && isFinite(Number(ra.correlation))) ($("corrPct") as HTMLInputElement).value = String(Math.round(Number(ra.correlation) * 100));
    // Proyectos guardados antes de incluir los eventos de riesgo no traen el campo: se leen como «incluidos» (el valor por omisión).
    if (ra.includeRisks === false) ($("rngRisks") as HTMLInputElement).checked = false;
    // Sorteo integrado de duraciones PERT: opt-in; los proyectos guardados antes no lo traen y quedan sin él.
    ($("rngPert") as HTMLInputElement).checked = ra.includePert === true;
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
    // Escalación del caso: por índices, con la fecha base de precios de la BOE (los mismos 18 paquetes y las mismas fechas de la red).
    state.esc = buildSampleEscPlan((c) => "w-" + c); ($("escMethod") as HTMLSelectElement).value = "indices"; escInputsKey = "";
    state.boe = buildSampleBoe(); renderBoe();   // la BOE del caso trae la fecha base de precios (SAMPLE_BASE_DATE) y el resto de sus secciones
  }
}
/* ---------- Barra de proyecto (badge flotante) ---------- */
function gpiBadge(): void {
  installGpiBadge({ name: (gpiOn() && (GPI as GpiApi).meta() && (GPI as GpiApi).meta()!.name) || "—", onSync: () => { save(); }, id: "gpiBadge", dotClass: "gpi-bdot", bottom: 18 });
}

/* ---------- Init ---------- */
function init(reload: boolean): void {
  session = gpiOn() ? (GPI as GpiApi).openSession("cost") : null; // en el mismo instante en que load() lee el dato
  renderBoe();   // los campos de la BOE (fecha base, etc.) existen antes de cargar y de calcular
  load();
  const connected = gpiOn();
  if (connected) loadedProjectId = (GPI as GpiApi).activeId();
  const bls = document.getElementById("btnLoadSampleCost"); if (bls) bls.style.display = connected ? "inline-flex" : "none";
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
Object.assign(window, { coPolicyHint, save, recalcCont, onBaseInput, loadSampleIntoProject, pullFromWBS, pullFromCostEstimate, addCO, coStatus, delCO, buildDoc, coEdit, coBaseline, coKindHint, evalVariance, onContMethod, addRange, delRange, rangeEdit, pullRangesFromEstimate, pullRangesFromWbs, applyClassRange, onEscMethod, escEdit, boeEdit, boeListAdd, boeListDel, boeListEdit, boeCheck });
