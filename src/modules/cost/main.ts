/* ============================================================
   GPI · Planificar la Gestión Financiera (Cost Management Plan) — vanilla JS module (ES6)
   Port mecánico del <script> inline de Cost-management.html (Fase 4 de
   MIGRATION.md): misma lógica, mismo comportamiento. Se agregan tipos y
   se compila a cost.js (IIFE) para que el HTML lo cargue como
   <script src="cost.js"> en vez de tenerlo inline.

   IMPORTANTE — a diferencia de OBS/RACI: el HTML de este módulo usa
   atributos onclick/onchange/oninput INLINE (no addEventListener) para
   ~13 funciones (save, recalcCont, onBaseInput,
   pullFromWBS, pullFromCostEstimate, addCO, coStatus, delCO, buildDoc, coEdit,
   coBaseline, coKindHint, evalVariance), incluidas varias generadas dinámicamente en filas de tabla
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
  analyzeChangeOrders, orderEffect, planBaselining, validateApproval,
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

interface EstimateClassDef { mat: string; use: string; meth: string; range: string; desc: string; }

/* ---- Clases de estimado AACE RP 17R-97 (genérico) ---- */
const CLASSES: Record<number, EstimateClassDef> = {
  5: { mat: "0% – 2%", use: "Screening / evaluación conceptual", meth: "Estocástico (paramétrico, capacidad)", range: "-30% / +50% (típico)", desc: "Estimado de orden de magnitud. Mínima definición de ingeniería; se usa para descartar alternativas." },
  4: { mat: "1% – 15%", use: "Estudio de factibilidad", meth: "Predominantemente estocástico", range: "-20% / +40%", desc: "Basado en factores y equipos mayores. Soporta decisiones de continuidad del proyecto." },
  3: { mat: "10% – 40%", use: "Autorización de presupuesto / control base", meth: "Mixto estocástico–determinístico", range: "-15% / +30%", desc: "Semidetallado. Marca el paso de estudio a ejecución; suele ser la base del control." },
  2: { mat: "30% – 75%", use: "Control y oferta / licitación", meth: "Predominantemente determinístico", range: "-10% / +20%", desc: "Detallado por partidas. Usado para control detallado y para ofertar." },
  1: { mat: "65% – 100%", use: "Estimado definitivo / cierre de oferta", meth: "Determinístico (cantidades y precios)", range: "-5% / +15%", desc: "Máxima definición. Verificación final y check estimate." }
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
  [key: string]: unknown; // compatible con CoOrder (shared/change-orders.ts)
}

/* Órdenes de cambio del caso de ejemplo: SOLO se siembran en modo
   independiente (sin gpi-core). Con un proyecto activo, el módulo arranca
   sin órdenes: así abrir la herramienta nunca escribe datos de ejemplo
   en el proyecto del alumno. Cubren las TRES naturalezas: un riesgo materializado
   (contingencia), una ampliación del cliente (cambio de alcance, fondos adicionales)
   y trabajo imprevisto dentro del alcance (reserva de gestión, con sponsor). */
const SAMPLE_CO: ChangeOrder[] = [
  { id: "OC-001", desc: "Refuerzo de cimentación por hallazgo geotécnico", cause: "R-03 Suelo", cost: 180000, fund: "Contingencia", status: "Aprobada", kind: "riesgo", approver: "CCB", sponsorAuth: false, approvedOn: "2026-08-03" },
  { id: "OC-002", desc: "Ampliación de sala eléctrica solicitada por cliente", cause: "Cambio alcance", cost: 240000, fund: "Financiamiento adicional", status: "Pendiente", kind: "alcance", approver: "", sponsorAuth: false },
  { id: "OC-003", desc: "Demolición de losa existente no identificada en el levantamiento", cause: "No identificado en el RBS", cost: 90000, fund: "Reserva de gestión", status: "Pendiente", kind: "imprevisto", approver: "", sponsorAuth: false }
];

interface BudgetComputed { base: number; cont: number; esc: number; bac: number; mgmt: number; total: number; }
type ChangeTotals = CoAnalysis;
interface CostState {
  curClass: number;
  co: ChangeOrder[];
  baselines: CoBaselineEntry[];
  _budget?: BudgetComputed;
  _coTotals?: ChangeTotals;
}

const state: CostState = {
  curClass: 3,
  co: [],
  baselines: []
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
/* Contingencia derivada de la CLASE del estimado (AACE 18R-97) y del percentil.
   A menor madurez del diseño, mayor contingencia para el mismo nivel de confianza.
   Antes el % era fijo (6/10/15/20) e ignoraba la clase: error metodológico. */
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

/* ---------- Contingencia / inflación ---------- */
function recalcCont(): void {
  $("fxBandWrap").style.display = ($("fxMode") as HTMLSelectElement).value === "float" ? "block" : "none";
  const base = +($("baseCost") as HTMLInputElement).value || 0;
  const contRate = contingencyRate();
  const cont = base * contRate;
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
  const hint = document.getElementById("contPctHint");
  if (hint) hint.innerHTML = "Clase <b>" + state.curClass + "</b> · <b>" + ($("contPct") as HTMLSelectElement).value + "</b> → contingencia <b>" + (contRate * 100).toFixed(1) + "%</b> del estimado base (AACE 18R-97: a menor madurez del diseño, mayor contingencia para el mismo nivel de confianza).";
  $("kBase").textContent = fmt(base);
  $("kCont").textContent = fmt(cont); $("kContCap").textContent = ($("contPct") as HTMLSelectElement).value;
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
function renderCO(): void {
  const tb = $("coBody"); tb.innerHTML = "";
  state.co.forEach((r, i) => {
    const locked = r.status !== "Pendiente";               // aprobada/rechazada: los datos de aprobación no se editan
    const usesReserve = r.fund !== FUND_CONT;              // reserva de gestión o fondos adicionales: requiere sponsor
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(r.id)}</td>
      <td>${esc(r.desc)}</td>
      <td><span class="pill ${r.kind ? "ok" : "bad"}" title="${escA(r.kind ? (CO_KIND_HINT as Record<string, string>)[r.kind] : "Clasifica la orden antes de aprobarla")}">${esc(kindLabel(r.kind))}</span></td>
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
  buildJSON();
}
// Muestra la guía de la naturaleza elegida al registrar la solicitud.
function coKindHint(): void {
  const k = ($("coKind") as HTMLSelectElement).value as CoKind | "";
  $("coKindHint").textContent = k ? CO_KIND_HINT[k] : "Clasifica el cambio: la naturaleza no decide por sí sola la fuente de fondos.";
}
function coStatus(sel: HTMLSelectElement): void {
  const r = state.co[+(sel.dataset.i as string)];
  if (r.baselined) { showToast(r.id + " ya está incorporada a la línea base " + r.baselined + ": su estado no se puede cambiar."); renderCO(); return; }
  if (sel.value === "Aprobada") {
    const problems = validateApproval(r, state.co, coBudget());
    if (problems.length) { showToast("No se puede aprobar " + r.id + ": " + problems.join("; ") + "."); renderCO(); return; }
    r.approvedOn = todayISO();
  } else { delete r.approvedOn; }
  userEdited = true;
  r.status = sel.value; renderCO(); save();
}
// Datos de aprobación (quién aprueba, autorización del sponsor): solo con la orden Pendiente.
function coEdit(el: HTMLInputElement): void {
  const r = state.co[+(el.dataset.i as string)]; if (!r || r.status !== "Pendiente") return;
  userEdited = true;
  if (el.dataset.f === "approver") r.approver = el.value.trim(); else if (el.dataset.f === "sponsorAuth") r.sponsorAuth = el.checked;
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
  state.co.push({
    id: "OC-" + String(n).padStart(3, "0"),
    desc,
    cause: ($("coCause") as HTMLInputElement).value.trim() || "—",
    cost: +($("coCost") as HTMLInputElement).value || 0,
    fund: ($("coFund") as HTMLSelectElement).value,
    status: "Pendiente",
    kind: kindSel.value, approver: "", sponsorAuth: false
  });
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
    <td class="mono">${esc(r.id)}</td><td>${esc(r.desc)}</td><td>${esc(kindLabel(r.kind))}</td><td>${esc(r.cause)}</td>
    <td style="text-align:right" class="mono">${fmt2(+r.cost)}</td><td>${esc(r.fund)}</td>
    <td>${esc(r.status)}${r.status === "Aprobada" ? " · " + esc(r.approver || "—") + (r.sponsorAuth ? " (sponsor)" : "") : ""}${r.baselined ? " · " + esc(r.baselined) : ""}</td></tr>`).join("");
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
        <tr><td>Contingencia</td><td>${fmt(b.cont)} — ${esc(($("contMethod") as HTMLSelectElement).value)}, ${esc((($("contPct") as HTMLSelectElement).selectedOptions[0].text).split(" ")[0])} (${b.base ? ((b.cont as number) / b.base * 100).toFixed(1) : "—"}%)</td></tr>
        <tr><td>Escalation / FX</td><td>${fmt(b.esc)} — inflación ${esc(($("inflRate") as HTMLInputElement).value)}% a ${esc(($("inflYears") as HTMLInputElement).value)} años; componente FX ${esc(($("fxShare") as HTMLInputElement).value)}%, TC ${fxTxt}</td></tr>
        <tr><td><b>BAC — línea base de costos${state.baselines.length ? " (inicial)" : ""}</b></td><td><b>${fmt(b.bac)}</b> (excluye reserva de gestión)</td></tr>
        <tr><td>Reserva de gestión</td><td>${fmt(b.mgmt)} — propiedad del sponsor</td></tr>
        <tr><td><b>Presupuesto total</b></td><td><b>${fmt(b.total)}</b></td></tr>
        ${state.baselines.length ? `<tr><td><b>BAC vigente</b></td><td><b>${fmt(t.bacCurrent)}</b> — ${esc(state.baselines[state.baselines.length - 1].version)} (${state.baselines.length} cambio(s) de línea base)</td></tr>` : ""}
      </table>
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
      baseCost: +($("baseCost") as HTMLInputElement).value, contingency: { method: ($("contMethod") as HTMLSelectElement).value, percentile: ($("contPct") as HTMLSelectElement).value, rate: contingencyRate() },
      mgmtReservePct: +($("mgmtPct") as HTMLInputElement).value, escalation: {
        inflation: +($("inflRate") as HTMLInputElement).value, years: +($("inflYears") as HTMLInputElement).value,
        fxShare: +($("fxShare") as HTMLInputElement).value, fxMode: ($("fxMode") as HTMLSelectElement).value, fxBand: +($("fxBand") as HTMLInputElement).value
      },
      computed: state._budget || null
    },
    changeOrders: state.co, changeTotals: state._coTotals || null, baselineLog: state.baselines
  };
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
    if (b.contingency.method) ($("contMethod") as HTMLSelectElement).value = b.contingency.method;
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
  else state.co = JSON.parse(JSON.stringify(SAMPLE_CO));
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
    document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
    // Reactividad entre pestañas: si cambian los metadatos o la EDT en otra
    // pestaña, refresca el nombre del proyecto que muestra el badge flotante.
    if ((GPI as GpiApi).onChange) (GPI as GpiApi).onChange(function () {
      if (loadedProjectId != null && (GPI as GpiApi).activeId() !== loadedProjectId) { markProjectStale(); return; }
      try {
        const el = document.querySelector("#gpiBadge b"); const m = (GPI as GpiApi).meta();
        if (el && m && m.name) el.textContent = m.name;
      } catch (e) { /* noop */ }
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
Object.assign(window, { save, recalcCont, onBaseInput, pullFromWBS, pullFromCostEstimate, addCO, coStatus, delCO, buildDoc, coEdit, coBaseline, coKindHint, evalVariance });
