/* =========================================================
   Valor Ganado (EVM) — PMBOK (Practice Standard for Earned Value Management) + AACE
   Módulo NUEVO (no es un port): patrón de Registro de Riesgos — addEventListener, window.GPI explícito,
   sin frameworks — compilado a evm.js (IIFE).

   Cierra el ciclo planificar → controlar de la auditoría metodológica: la línea base de COSTO (paquetes de trabajo
   con su costo) y la línea base del CRONOGRAMA (Cronograma/CPM → Salud y línea base) se cruzan con lo que el equipo
   REPORTA en cada corte (avance físico y costo real) para obtener PV, EV, AC, CV, SV, CPI, SPI, los pronósticos
   (EAC/ETC/VAC/TCPI) y el cronograma ganado (Earned Schedule). Los umbrales son los de los planes de Costos y del
   Cronograma. Toda la lógica es PURA y vive en src/shared/evm.ts (con sus pruebas); este archivo es la interfaz.

   Regla de oro: con un proyecto activo arranca EN BLANCO (nada reportado); el ejemplo DISTRIB+ solo se carga con
   «Cargar ejemplo».
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import { esc } from "../../shared/html";
import { installGpiBadge } from "../../shared/gpi-badge";
import { todayLocalISO } from "../../shared/local-date";
import type { EditSession, ProjectMeta } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { normalizeBaseline, type EvmReference } from "../../shared/schedule-control";
import { approvedTransfers, packageBudgets, referenceDrift, type BudgetTransfer } from "../../shared/evm-reference";
import { SAMPLE_START_DATE, sampleScheduleModules, sampleSchedulePlan } from "../../shared/schedule-sample";
import { EVM_SAMPLE_AC, EVM_SAMPLE_COSTS, EVM_SAMPLE_PERCENT, EVM_SAMPLE_REPORTS, EVM_SAMPLE_STATUS_DATE, EVM_SAMPLE_TECHNIQUES } from "../../shared/evm-sample";
import {
  DEFAULT_THRESHOLDS, TECHNIQUES, TECHNIQUE_LABEL, evmCompute, evmStatus, normalizeReports, techniqueFromPlan, workingDaysThrough,
  type EvTechnique, type EvmPackage, type EvmReport, type EvmResult, type EvmThresholds, type Level
} from "../../shared/evm";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const todayISO = (): string => todayLocalISO();
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const numOr = (v: unknown, d: number): number => { const n = Number(v); return v === "" || v === null || v === undefined || !isFinite(n) ? d : n; };

// ---------- datos que el equipo reporta ----------
interface EvmData { statusDate: string; percent: Record<string, number | null>; ac: Record<string, number | null>; techniques: Record<string, EvTechnique>; reports: EvmReport[]; }
const blankData = (): EvmData => ({ statusDate: todayISO(), percent: {}, ac: {}, techniques: {}, reports: [] });
function normalizeData(o: unknown): EvmData {
  const x = rec(o), d = blankData();
  if (typeof x.statusDate === "string" && x.statusDate) d.statusDate = x.statusDate;
  const nums = (v: unknown): Record<string, number | null> => { const out: Record<string, number | null> = {}; Object.keys(rec(v)).forEach((k) => { const raw = rec(v)[k]; out[k] = raw === null || raw === "" || raw === undefined || !isFinite(Number(raw)) ? null : Number(raw); }); return out; };
  d.percent = nums(x.percent); d.ac = nums(x.ac);
  Object.keys(rec(x.techniques)).forEach((k) => { const t = rec(x.techniques)[k]; if (TECHNIQUES.indexOf(t as EvTechnique) >= 0) d.techniques[k] = t as EvTechnique; });
  d.reports = normalizeReports(x.reports);
  return d;
}
let data: EvmData = blankData();

// ---------- contexto: paquetes (BAC), línea base del cronograma, calendario y umbrales ----------
interface Pkg extends EvmPackage { source: string; }
interface Ctx {
  connected: boolean; sym: string; pkgs: Pkg[]; startDate: string; calendar: { workDayIdx: number[]; holidays: string[] }; duration: number;
  baseline: { version: string; date: string } | null; newSinceBaseline: number;
  thresholds: EvmThresholds; defaultTech: EvTechnique; techLabel: string; techApprox: boolean;
  cont: number | null; contAvail: number | null; bacBudget: number | null; issues: string[];
  frozen: boolean;    // el presupuesto por paquete, el inicio y el calendario vienen CONGELADOS con la línea base (no de datos editables)
  notes: string[];    // avisos sobre la referencia (línea base antigua sin congelar, o datos vigentes que ya difieren de lo congelado)
  transfers: BudgetTransfer[];    // órdenes de cambio aprobadas sumadas al presupuesto de su paquete
  unassigned: BudgetTransfer[];   // órdenes aprobadas sin paquete (no se pueden asignar)
}
const CUR: Record<string, string> = { USD: "$", PEN: "S/", EUR: "€" };
function emptyCtx(connected: boolean): Ctx {
  return { connected, sym: "$", pkgs: [], startDate: "", calendar: { workDayIdx: [1, 2, 3, 4, 5], holidays: [] }, duration: 0, baseline: null, newSinceBaseline: 0, thresholds: { ...DEFAULT_THRESHOLDS }, defaultTech: "fisico", techLabel: "% físico avanzado", techApprox: false, cont: null, contAvail: null, bacBudget: null, issues: [], frozen: false, notes: [], transfers: [], unassigned: [] };
}
let ctx: Ctx = emptyCtx(false), ctxDirty = true;
function getCtx(): Ctx { if (ctxDirty) { ctx = buildCtx(); ctxDirty = false; } return ctx; }
function buildCtx(): Ctx {
  const G = window.GPI, connected = !!(G && G.available() && G.active()), c = emptyCtx(connected);
  if (!G || !G.util || !G.util.cpm || !G.util.scheduleNetwork) { c.issues.push("No cargó gpi-core.js: sin el núcleo no se puede calcular el cronograma."); return c; }
  try {
    const wbs = connected ? G.getModule("wbs") : sampleScheduleModules().wbs;
    const m = connected ? null : sampleScheduleModules();
    const act = connected ? G.getModule("activities") : (m as NonNullable<typeof m>).activities;
    const sched = connected ? G.getModule("schedule") : (m as NonNullable<typeof m>).schedule;
    const net = connected ? G.util.activeScheduleNetwork() : G.util.scheduleNetwork(wbs, act, null, sched, sampleSchedulePlan(), SAMPLE_START_DATE);
    if (connected) { const meta = G.meta(); c.sym = CUR[(meta && meta.currency) || ""] || "$"; }
    if (!net) { c.issues.push(connected ? "El proyecto aún no tiene actividades: define la EDT, las actividades y sus enlaces (Cronograma/CPM) para distribuir el costo en el tiempo." : "No se pudo armar el cronograma del ejemplo."); return c; }
    c.startDate = net.startDate || (connected ? "" : SAMPLE_START_DATE);
    c.calendar = { workDayIdx: net.calendar.workDayIdx, holidays: net.calendar.holidays };
    const res = G.util.cpm(net.nodes.map((n) => ({ id: n.id, dur: n.dur })), net.links, net.calendar, {});
    if (!res.ok) { c.issues.push("La red del cronograma tiene un ciclo: corrígela en Cronograma/CPM."); return c; }
    // Línea base del cronograma (LB-n) si existe; si no, el cronograma vigente (y se avisa).
    const bl = connected && sched ? normalizeBaseline((sched as { baseline?: unknown }).baseline) : null;
    const rows: Record<string, { es: number; ef: number }> = {};
    if (bl) bl.snapshot.rows.forEach((r) => { rows[r.id] = r; }); else Object.keys(res.rows).forEach((id) => { rows[id] = res.rows[id]; });
    c.baseline = bl ? { version: bl.version, date: bl.date } : null;
    c.duration = bl ? bl.snapshot.projectDuration : res.projectDuration;
    const spans: Record<string, { es: number; ef: number }> = {};
    net.nodes.filter((n) => !n.isMilestone && n.leafId).forEach((n) => {
      const r = rows[n.id]; if (!r) { if (bl) c.newSinceBaseline++; return; }
      const s = spans[n.leafId as string] || (spans[n.leafId as string] = { es: r.es, ef: r.ef });
      s.es = Math.min(s.es, r.es); s.ef = Math.max(s.ef, r.ef);
    });
    // BAC por paquete: el costo del TRABAJO (Estimar los Costos; si no, el costo de la EDT). Conectado: del proyecto; independiente: el ejemplo.
    let costOf: Record<string, { bac: number; source: string }> = {};
    const leaves = G.util.wbsLeaves(wbs);
    if (connected) {
      const wbsCost: Record<string, number> = {}; leaves.forEach((l) => { wbsCost[l.id] = wbs && wbs.nodes[l.id] ? Number(wbs.nodes[l.id].cost) || 0 : 0; });
      costOf = packageBudgets({ leaves, wbsCost, estimateRows: G.util.costEstimateRows(G.getModule("costEstimate"), act, wbs).map((r) => ({ leafId: r.leafId, subtotal: r.subtotal })) });
    } else leaves.forEach((l) => { if (EVM_SAMPLE_COSTS[l.code]) costOf[l.id] = { bac: EVM_SAMPLE_COSTS[l.code], source: "Ejemplo DISTRIB+" }; });
    c.pkgs = leaves.filter((l) => costOf[l.id]).map((l) => ({ id: l.id, code: l.code, name: l.name, bac: costOf[l.id].bac, es: spans[l.id] ? spans[l.id].es : null, ef: spans[l.id] ? spans[l.id].ef : null, source: costOf[l.id].source }));
    // REFERENCIA CONGELADA (auditoría, alta): con línea base, el presupuesto por paquete, el inicio, el calendario y las fechas de cada paquete son los que se
    // aprobaron con ella, NO los datos editables de hoy. Duplicar una estimación o mover la fecha de inicio no cambia el CPI ni el PV sin una nueva versión LB-n.
    const ev = bl ? bl.snapshot.evm : null;
    if (bl && ev) {
      const live: EvmReference = { calendar: { workDayIdx: net.calendar.workDayIdx.slice(), holidays: net.calendar.holidays.slice() }, packages: c.pkgs.map((p) => ({ id: p.id, code: p.code, name: p.name, bac: p.bac, source: p.source, es: null, ef: null })), total: c.pkgs.reduce((s, p) => s + p.bac, 0) };
      const drift = referenceDrift(ev, bl.snapshot.startDate, net.startDate || "", live);
      if (drift.length) c.notes.push("Después de fijar la línea base " + bl.version + " cambió(aron): " + drift.join("; ") + ". El valor ganado sigue usando lo aprobado en " + bl.version + "; para incorporar esos cambios fija una nueva versión de la línea base (con motivo y aprobación) en Cronograma/CPM.");
      c.frozen = true; c.startDate = bl.snapshot.startDate || c.startDate; c.calendar = { workDayIdx: ev.calendar.workDayIdx.slice(), holidays: ev.calendar.holidays.slice() };
      c.pkgs = ev.packages.map((p) => ({ id: p.id, code: p.code, name: p.name, bac: p.bac, es: p.es, ef: p.ef, source: "Línea base " + bl.version }));
    } else if (bl) c.notes.push("La línea base " + bl.version + " se fijó antes de que el presupuesto por paquete, la fecha de inicio y el calendario se congelaran con ella: esos datos se leen de lo editable hoy y cambiarán si alguien edita la estimación o la fecha de inicio (los índices cambian sin que exista otra línea base). Fija una nueva versión de la línea base (con motivo y aprobación) en Cronograma/CPM para congelarlos.");
    // Órdenes de cambio aprobadas que pasaron al presupuesto del trabajo (contingencia usada, o reserva/fondos incorporados con LB-n): su monto
    // se suma al BAC del paquete que las ejecuta. Sin esto la misma orden se contaba dos veces: como sobrecosto en el costo real y como
    // contingencia ya consumida (auditoría, alta). Se aplican sobre la referencia elegida (congelada o vigente), después de medir su deriva.
    if (connected) {
      const tr = approvedTransfers(rec(G.getModule("cost")).changeOrders, c.pkgs.map((p) => ({ id: p.id, code: p.code })));
      c.pkgs = c.pkgs.map((p) => (tr.byLeaf[p.id] ? { ...p, bac: p.bac + tr.byLeaf[p.id], source: p.source + " + " + tr.applied.filter((t) => t.leafId === p.id).map((t) => t.id).join(", ") } : p));
      c.transfers = tr.applied; c.unassigned = tr.unassigned;
      if (tr.unassigned.length) c.notes.push("Orden(es) de cambio aprobada(s) sin paquete de trabajo: " + tr.unassigned.map((t) => t.id + " (" + Math.round(t.amount).toLocaleString("es-PE") + ")").join(", ") + ". Su monto no se puede sumar al presupuesto de ningún paquete: su gasto aparecerá como sobrecosto. Indica el paquete en Costos.");
    }
    if (!c.pkgs.length) c.issues.push(connected ? "Ningún paquete de trabajo tiene costo: carga la estimación en Estimar los Costos o el costo de los paquetes en WBS Builder." : "El ejemplo no tiene paquetes.");
    // Planes: técnica de valor ganado y umbrales del plan de costos; SV/SPI del plan del cronograma.
    if (connected) {
      const cost = rec(G.getModule("cost")), plan = rec(cost.plan), th = rec(plan.thresholds);
      const t = techniqueFromPlan(plan.evMethod); c.defaultTech = t.technique; c.techApprox = t.approximated; c.techLabel = String(plan.evMethod || TECHNIQUE_LABEL.fisico);
      c.thresholds.cpiWarn = numOr(rec(th.cpi).warn, DEFAULT_THRESHOLDS.cpiWarn); c.thresholds.cpiEsc = numOr(rec(th.cpi).escalate, DEFAULT_THRESHOLDS.cpiEsc);
      c.thresholds.cvWarn = numOr(rec(th.cv).warn, DEFAULT_THRESHOLDS.cvWarn); c.thresholds.cvEsc = numOr(rec(th.cv).escalate, DEFAULT_THRESHOLDS.cvEsc);
      const b = rec(cost.budget), comp = rec(b.computed), tot = rec(cost.changeTotals);
      c.cont = comp.cont == null ? null : Number(comp.cont); c.bacBudget = comp.bac == null ? null : Number(comp.bac);
      c.contAvail = tot.contingencyAvailable == null ? null : Number(tot.contingencyAvailable);
      const sp = rec(G.getModule("schedulePlan")), thr = Array.isArray(sp.controlThresholds) ? sp.controlThresholds.map(rec) : [];
      const spi = thr.filter((x) => x.key === "SPI")[0], sv = thr.filter((x) => x.key === "SV")[0];
      if (spi) { c.thresholds.spiGreen = numOr(spi.greenValue, DEFAULT_THRESHOLDS.spiGreen); c.thresholds.spiRed = numOr(spi.redValue, DEFAULT_THRESHOLDS.spiRed); }
      if (sv) { c.thresholds.svGreenPct = numOr(sv.greenValue, DEFAULT_THRESHOLDS.svGreenPct); c.thresholds.svRedPct = numOr(sv.redValue, DEFAULT_THRESHOLDS.svRedPct); }
    }
  } catch (e) { c.issues.push("No se pudo armar el contexto del proyecto."); }
  return c;
}

// ---------- cálculo ----------
function compute(): EvmResult {
  const C = getCtx();
  return evmCompute({ packages: C.pkgs, percent: data.percent, ac: data.ac, techniques: data.techniques, defaultTechnique: C.defaultTech, statusOffset: workingDaysThrough(C.startDate, data.statusDate, C.calendar), projectDuration: C.duration });
}
function dateOf(off: number): string {
  const G = window.GPI, C = getCtx();
  if (!G || !C.startDate) return "";
  try { return G.util.addWorkingDays(G.util.parseISO(C.startDate), Math.max(0, Math.ceil(off - 1e-9) - 1), C.calendar); } catch (e) { return ""; }
}
const money = (n: number | null | undefined): string => (n == null || !isFinite(n) ? "—" : getCtx().sym + " " + Math.round(n).toLocaleString("es-PE"));
const idx = (v: number | null, d = 2): string => (v === null || !isFinite(v) ? "—" : v.toFixed(d));
const days = (v: number | null): string => (v === null || !isFinite(v) ? "—" : (Math.round(v * 10) / 10) + " d");
const signed = (v: number): string => (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v)).replace(/^\S+ /, getCtx().sym + " ");
const lvlPill = (l: Level | null): string => (l ? `<span class="pill ${l}">${l === "ambar" ? "ÁMBAR" : l.toUpperCase()}</span>` : "");
const cls = (v: number): string => (v < -1e-9 ? "neg" : v > 1e-9 ? "pos" : "");

// ---------- render ----------
function head(): string {
  return `<div class="view-head"><h2>Seguimiento del valor ganado</h2>
    <p>Cruza la <b>línea base</b> (el costo de cada paquete de trabajo, distribuido en el tiempo según el cronograma) con lo que el equipo <b>reporta en cada corte</b> (avance físico y costo real) para saber si el proyecto va bien en <b>costo</b> y en <b>plazo</b>, qué costo final se pronostica y cuándo terminaría. Los umbrales de alerta son los de los planes de Costos y del Cronograma.</p></div>`;
}
function render(): void {
  const C = getCtx(), main = $("mainArea");
  (($("statusDate")) as HTMLInputElement).value = data.statusDate;
  if (!C.pkgs.length) {
    main.innerHTML = head() + `<div class="empty-hint">${C.issues.length ? "<b>No hay nada que medir todavía.</b><br>" + C.issues.map(esc).join("<br>") : "Aún no hay paquetes de trabajo con costo."}<br><br>Usa <b>Cargar ejemplo</b> para ver el caso DISTRIB+ S.A.</div>`;
    return;
  }
  main.innerHTML = head() + `<div id="evTop"></div>` + tableCard(C) + `<div id="evHist">${histCard()}</div>` + notesCard(C);
  wireMain();
  refresh();
}
function tableCard(C: Ctx): string {
  const rows = C.pkgs.map((p) => `<tr class="evrow" data-id="${esc(p.id)}"><td class="mono">${esc(p.code)}</td><td>${esc(p.name)}<div class="muted small">${esc(p.source)}${p.es === null ? " · <span class=\"neg\">sin actividades: no se distribuye en el tiempo</span>" : ""}</div></td>
    <td class="num">${money(p.bac)}</td>
    <td><select class="in" data-id="${esc(p.id)}" data-f="technique" aria-label="Técnica de valor ganado de ${esc(p.code)}">${TECHNIQUES.map((t) => `<option value="${t}" ${((data.techniques[p.id] || C.defaultTech) === t) ? "selected" : ""}>${esc(TECHNIQUE_LABEL[t])}</option>`).join("")}</select></td>
    <td class="num" data-k="plannedPct"></td>
    <td class="num"><input class="in" type="number" min="0" max="100" step="any" data-id="${esc(p.id)}" data-f="percent" value="${data.percent[p.id] == null ? "" : esc(data.percent[p.id])}" aria-label="Avance físico de ${esc(p.code)} (%)"></td>
    <td class="num" data-k="pv"></td><td class="num" data-k="ev"></td>
    <td class="num"><input class="in" type="number" min="0" step="any" data-id="${esc(p.id)}" data-f="ac" value="${data.ac[p.id] == null ? "" : esc(data.ac[p.id])}" aria-label="Costo real de ${esc(p.code)}"></td>
    <td class="num" data-k="cv"></td><td class="num" data-k="sv"></td><td class="num" data-k="cpi"></td><td class="num" data-k="spi"></td></tr>`).join("");
  return `<div class="card"><h3>Por paquete de trabajo</h3><div class="muted small" style="margin-bottom:6px">Reporta el <b>% de avance físico</b> y el <b>costo real acumulado</b> de cada paquete a la fecha de corte. Elige la <b>técnica</b> con que se mide su valor ganado (por omisión, la del Plan de Costos: ${esc(C.techLabel)}).</div>
    <table class="an"><thead><tr><th class="l">Cód.</th><th class="l">Paquete</th><th>BAC</th><th class="l">Técnica</th><th>% plan</th><th>% avance</th><th>PV</th><th>EV</th><th>AC</th><th>CV</th><th>SV</th><th>CPI</th><th>SPI</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr class="tot" id="evTot"><td></td><td>Total</td><td class="num" data-t="bac"></td><td></td><td class="num" data-t="plannedPct"></td><td class="num" data-t="pct"></td><td class="num" data-t="pv"></td><td class="num" data-t="ev"></td><td class="num" data-t="ac"></td><td class="num" data-t="cv"></td><td class="num" data-t="sv"></td><td class="num" data-t="cpi"></td><td class="num" data-t="spi"></td></tr></tfoot></table></div>`;
}
function histCard(): string {
  const rows = data.reports.length ? data.reports.slice().reverse().map((r) => `<tr><td class="mono">${esc(r.date)}</td><td class="num">${days(r.offset)}</td><td class="num">${money(r.pv)}</td><td class="num">${money(r.ev)}</td><td class="num">${money(r.ac)}</td><td class="num">${idx(r.cpi)}</td><td class="num">${idx(r.spi)}</td><td><button class="btn" data-del="${esc(r.date)}" title="Quitar este corte" aria-label="Quitar el corte del ${esc(r.date)}">✕</button></td></tr>`).join("")
    : `<tr><td colspan="8" class="muted">Aún no hay cortes registrados. Usa <b>Registrar corte</b> en cada periodo del plan (Costos: frecuencia de reporte) para dibujar la curva S y ver la tendencia.</td></tr>`;
  return `<div class="card"><h3>Historial de cortes</h3><table class="an"><thead><tr><th class="l">Fecha</th><th>Día</th><th>PV</th><th>EV</th><th>AC</th><th>CPI</th><th>SPI</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function notesCard(C: Ctx): string {
  return `<div class="card"><h3>Cómo se calcula (y sus límites)</h3><ul class="small" style="margin:0 0 0 18px;line-height:1.6;color:var(--ink-1)">
    <li><b>BAC del trabajo</b> = el costo de cada paquete (Estimar los Costos si su estimado está completo; si no, la EDT) <b>más las órdenes de cambio aprobadas que ya pasaron a él</b>: la contingencia usada, y la reserva de gestión o los fondos adicionales incorporados con una versión LB-n${C.transfers.length ? " (aquí: " + esc(C.transfers.map((t) => t.id + " " + money(t.amount)).join(", ")) + ")" : ""}. La contingencia que queda sin usar y la reserva de gestión no se distribuyen al trabajo: se comparan con el sobrecosto pronosticado (VAC). No es el mismo total que la línea base de costos de Costos, que incluye además la contingencia y la escalación.</li>
    <li><b>PV</b>: el costo de cada paquete se reparte <b>linealmente</b> entre el inicio más temprano y el fin más tardío de sus actividades en ${C.baseline ? "la <b>línea base " + esc(C.baseline.version) + "</b> del cronograma" + (C.frozen ? " (con el presupuesto por paquete, la fecha de inicio y el calendario <b>congelados</b> en ella)" : "") : "el cronograma vigente (fija la línea base en Cronograma/CPM para congelarlo)"}.</li>
    <li><b>EV</b> según la técnica de cada paquete: 0/100, 50/50, % físico o LOE (se gana con el tiempo: no mide desempeño). «Hitos ponderados» y «Apportioned effort» del plan se aplican como % físico.</li>
    <li><b>Cronograma ganado</b> (Earned Schedule): el SPI en dinero tiende a 1 al final aunque el proyecto termine tarde; ES/AT y la duración pronosticada lo evitan.</li>
    <li>Sin datos de recursos ni de compromisos: el costo real es el que reportas. El seguimiento por paquete no reemplaza el análisis de causa raíz.</li></ul></div>`;
}
function topHtml(C: Ctx, R: EvmResult): string {
  const st = evmStatus(R, C.thresholds), kp = (l: string, v: string, s: string, lv: Level | null = null, extra = ""): string => `<div class="kpi ${lv || ""}"><div class="l">${l}</div><div class="v ${extra}">${v}</div><div class="s">${s}</div></div>`;
  const T = C.thresholds;
  const kpis = `<div class="kpis">
    ${kp("BAC del trabajo", money(R.bac), C.transfers.length ? "incluye " + C.transfers.length + " orden(es) de cambio aprobada(s)" : "presupuesto del trabajo")}
    ${kp("PV — planificado", money(R.pv), R.percentPlanned.toFixed(1) + " % del BAC")}
    ${kp("EV — ganado", money(R.ev), R.percentComplete.toFixed(1) + " % del BAC")}
    ${kp("AC — costo real", money(R.ac), R.percentSpent.toFixed(1) + " % del BAC")}
    ${kp("CPI", idx(R.cpi), `umbral ≤ ${T.cpiWarn.toFixed(2)} alerta · ≤ ${T.cpiEsc.toFixed(2)} escala`, st.cpi)}
    ${kp("CV", R.ac > 0 ? signed(R.cv) : "—", `alerta ≤ ${signed(T.cvWarn)} · escala ≤ ${signed(T.cvEsc)}`, st.cv, cls(R.cv))}
    ${kp("SPI", idx(R.spi), `verde ≥ ${T.spiGreen.toFixed(2)} · rojo < ${T.spiRed.toFixed(2)}`, st.spi)}
    ${kp("SV", signed(R.sv), R.svPct === null ? "—" : (R.svPct > 0 ? "+" : "") + R.svPct.toFixed(1) + " % del PV · verde ≥ " + T.svGreenPct + " %", st.sv, cls(R.sv))}</div>`;
  const banner = st.cost || st.schedule ? `<div class="${(st.cost === "rojo" || st.schedule === "rojo") ? "warn-box" : "note-box"}" style="margin:0 0 14px"><b>Estado:</b> costo ${lvlPill(st.cost)} · plazo ${lvlPill(st.schedule)}. ${st.cost === "verde" && st.schedule === "verde" ? "Dentro de tolerancia: continuar el monitoreo con la frecuencia del plan." : "Una variación fuera de umbral dispara el análisis de la causa, la actualización del pronóstico y una decisión de respuesta (acción correctiva, uso de la contingencia o solicitud de cambio): no obliga por sí sola a un cambio de línea base."}</div>` : "";
  // pronósticos
  const f = (x: number | null): string => money(x);
  const contNote = C.contAvail !== null && R.vac.typical !== null && R.vac.typical < 0
    ? `El sobrecosto pronosticado (típico) es <b>${money(-R.vac.typical)}</b>; la contingencia disponible es <b>${money(C.contAvail)}</b>${C.transfers.some((t) => t.fund === "Contingencia") ? " (lo ya aprobado con cargo a ella está dentro del BAC del trabajo)" : ""}: ${-R.vac.typical <= C.contAvail ? "la <b>cubre</b>" : "<b>NO alcanza</b>: hay que escalar (reserva de gestión o cambio de línea base)"}.`
    : C.contAvail !== null ? `Contingencia disponible: ${money(C.contAvail)}.` : "";
  const forecast = `<div class="card"><h3>Pronóstico de costo</h3><table class="an"><thead><tr><th class="l">Supuesto</th><th>EAC</th><th>ETC</th><th>VAC</th></tr></thead><tbody>
    <tr><td>Típico: la variación actual se repite (BAC / CPI)</td><td class="num">${f(R.eac.typical)}</td><td class="num">${f(R.etc.typical)}</td><td class="num ${R.vac.typical === null ? "" : cls(R.vac.typical)}">${R.vac.typical === null ? "—" : signed(R.vac.typical)}</td></tr>
    <tr><td>Atípico: fue un hecho aislado (AC + BAC − EV)</td><td class="num">${f(R.eac.atypical)}</td><td class="num">${f(R.etc.atypical)}</td><td class="num ${cls(R.vac.atypical)}">${signed(R.vac.atypical)}</td></tr>
    <tr><td>Combinado: costo y plazo (AC + (BAC − EV) / (CPI × SPI))</td><td class="num">${f(R.eac.combined)}</td><td class="num">${f(R.etc.combined)}</td><td class="num ${R.vac.combined === null ? "" : cls(R.vac.combined)}">${R.vac.combined === null ? "—" : signed(R.vac.combined)}</td></tr></tbody></table>
    <div class="muted small" style="margin-top:6px">TCPI para cerrar en el BAC: <b>${idx(R.tcpiBac)}</b> · para cerrar en el EAC típico: <b>${idx(R.tcpiEac)}</b> (un TCPI mayor que el CPI actual exige un desempeño que el proyecto no ha mostrado).</div>
    ${contNote ? `<div class="note-box">${contNote}${C.bacBudget !== null ? ` BAC de la línea base de costos (con contingencia y escalación): ${money(C.bacBudget)}.` : ""}</div>` : ""}</div>`;
  const finPlan = dateOf(C.duration), finFc = R.ieacT === null ? "" : dateOf(R.ieacT);
  const sched = `<div class="card"><h3>Cronograma ganado (Earned Schedule)</h3><table class="an"><tbody>
    <tr><td>Tiempo real transcurrido (AT)</td><td class="num">${days(R.at)}</td></tr>
    <tr><td>Cronograma ganado (ES): el día en que el PV igualaba al EV de hoy</td><td class="num">${days(R.es)}</td></tr>
    <tr><td>SV(t) = ES − AT</td><td class="num ${cls(R.svT)}">${R.svT > 0 ? "+" : ""}${days(R.svT)}</td></tr>
    <tr><td>SPI(t) = ES / AT</td><td class="num">${idx(R.spiT)}</td></tr>
    <tr><td>Duración planificada → pronosticada (PD / SPI(t))</td><td class="num">${days(C.duration)} → <b>${days(R.ieacT)}</b></td></tr>
    <tr><td>Fin planificado → pronosticado</td><td class="num">${esc(finPlan) || "—"} → <b>${esc(finFc) || "—"}</b></td></tr></tbody></table>
    <div class="muted small" style="margin-top:6px">El SV y el SPI en dinero engañan al final del proyecto (tienden a 0 y 1 aunque termine tarde); estos, en tiempo, no.</div></div>`;
  // avisos de calidad de los datos
  const warns: string[] = [];
  C.notes.forEach((n) => warns.push(n));
  if (!C.baseline) warns.push("No hay línea base del cronograma: el PV se calcula con el cronograma vigente y cambiará cuando este cambie. Fíjala en Cronograma/CPM → Salud y línea base.");
  if (C.newSinceBaseline) warns.push(C.newSinceBaseline + " actividad(es) se agregaron después de la línea base: no tienen fechas base y no se distribuyen en el PV.");
  if (R.unscheduled.length) warns.push(R.unscheduled.length + " paquete(s) con costo no tienen actividades en el cronograma y quedan fuera de los totales (" + R.unscheduled.slice(0, 4).map((p) => p.code).join(", ") + (R.unscheduled.length > 4 ? "…" : "") + ").");
  if (R.unreported) warns.push(R.unreported + " paquete(s) que ya debían estar en marcha no tienen avance reportado: se cuentan como 0 %.");
  if (R.loeShare > 10) warns.push("El " + R.loeShare.toFixed(0) + " % del BAC se mide por LOE (nivel de esfuerzo): su EV es igual a su PV y no mide desempeño; los índices se ven mejor de lo que son.");
  if (C.techApprox) warns.push("El plan de costos declara «" + C.techLabel + "»: este módulo no captura sus datos (pesos por hito o trabajo de referencia) y lo aplica como % físico.");
  if (R.spi !== null && R.pv > 0 && R.spi > 1.5) warns.push("El valor ganado supera con holgura al planificado (SPI " + R.spi.toFixed(2) + "): revisa que el avance reportado corresponda a esta fecha de corte y no a otra; los pronósticos no son confiables así.");
  if (R.ev > R.bac * 1.0001) warns.push("El valor ganado supera el BAC: el avance de algún paquete es mayor que 100 % o el costo del paquete cambió.");
  if (R.at <= 0) warns.push("La fecha de corte es anterior al inicio del proyecto (" + (C.startDate || "sin fecha de inicio") + "): no hay nada planificado todavía.");
  if (!C.startDate) warns.push("El proyecto no tiene fecha de inicio: sin ella no se puede ubicar la fecha de corte en el cronograma.");
  const wbox = warns.length ? `<div class="warn-box"><b>Revisa:</b><ul style="margin:4px 0 0 18px">${warns.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : "";
  return kpis + banner + `<div class="grid2">${forecast}${sched}</div>` + `<div class="card"><h3>Curva S: planificado, ganado y costo real</h3>${curveSvg(C, R)}</div>` + wbox;
}
function curveSvg(C: Ctx, R: EvmResult): string {
  const W = 720, H = 280, l = 66, r = 18, t = 16, b = 42, D = Math.max(1, R.curve.length - 1);
  const reports = data.reports, maxY = Math.max(R.bac, R.ac, R.ev, ...reports.map((x) => Math.max(x.ac, x.ev, x.pv)), 1) * 1.05;
  const X = (d: number): number => l + d / D * (W - l - r), Y = (v: number): number => t + (1 - v / maxY) * (H - t - b);
  const pvPath = R.curve.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" ");
  const series = (key: "ev" | "ac", color: string): string => {
    const pts = reports.map((x) => [x.offset, x[key]] as [number, number]).concat([[R.at, key === "ev" ? R.ev : R.ac]]).filter((p) => p[0] >= 0).sort((a, c) => a[0] - c[0]);
    return `<path d="${pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join(" ")}" fill="none" stroke="${color}" stroke-width="2.2"/>` + pts.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.2" fill="${color}"/>`).join("");
  };
  const short = (v: number): string => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + " M" : Math.round(v / 1000) + " k");
  const yt = [0, 0.25, 0.5, 0.75, 1].map((q) => `<line x1="${l}" x2="${W - r}" y1="${Y(q * maxY).toFixed(1)}" y2="${Y(q * maxY).toFixed(1)}" stroke="#eef2f7"/><text x="${l - 6}" y="${(Y(q * maxY) + 3).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#8992a3">${esc(short(q * maxY))}</text>`).join("");
  const step = D <= 30 ? 5 : D <= 120 ? 20 : 50, xt: string[] = [];
  for (let d = 0; d <= D; d += step) xt.push(`<text x="${X(d).toFixed(1)}" y="${H - 24}" text-anchor="middle" font-size="9.5" fill="#8992a3">${d}</text>`);
  const cut = `<line x1="${X(Math.min(R.at, D)).toFixed(1)}" x2="${X(Math.min(R.at, D)).toFixed(1)}" y1="${t}" y2="${H - b}" stroke="#6c5ce7" stroke-dasharray="4 3"/><text x="${(X(Math.min(R.at, D)) + 4).toFixed(1)}" y="${t + 10}" font-size="9.5" fill="#6c5ce7">corte</text>`;
  const bacLine = `<line x1="${l}" x2="${W - r}" y1="${Y(R.bac).toFixed(1)}" y2="${Y(R.bac).toFixed(1)}" stroke="#b6bfc9" stroke-dasharray="2 3"/><text x="${W - r}" y="${(Y(R.bac) - 4).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#8992a3">BAC</text>`;
  return `<svg class="scurve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva S: valor planificado, valor ganado y costo real por día laborable" xmlns="http://www.w3.org/2000/svg" style="font-family:var(--mono)">${yt}${xt.join("")}${bacLine}<path d="${pvPath}" fill="none" stroke="#00b6ec" stroke-width="2.4"/>${series("ev", "#00a88f")}${series("ac", "#ff5470")}${cut}<text x="${(l + W - r) / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#4d5768">día laborable →</text></svg>
    <div class="lg"><span><i style="background:#00b6ec"></i>PV planificado (${C.baseline ? "línea base " + esc(C.baseline.version) + (C.frozen ? " congelada" : " · presupuesto sin congelar") : "cronograma vigente"})</span><span><i style="background:#00a88f"></i>EV ganado</span><span><i style="background:#ff5470"></i>AC costo real</span></div>`;
}
// Actualiza lo calculado sin reconstruir los campos que el usuario está editando.
function refresh(): void {
  const C = getCtx(), R = compute(), top = document.getElementById("evTop");
  if (top) top.innerHTML = topHtml(C, R);
  const st = evmStatus(R, C.thresholds);
  const rowEl = (id: string): HTMLElement | undefined => Array.from(document.querySelectorAll<HTMLElement>("tr.evrow")).find((e) => e.dataset.id === id);
  R.rows.forEach((r) => {
    const tr = rowEl(r.id); if (!tr) return;
    const set = (k: string, v: string, c = ""): void => { const td = tr.querySelector<HTMLElement>(`[data-k="${k}"]`); if (td) { td.textContent = v; td.className = "num " + c; } };
    set("plannedPct", r.plannedPct.toFixed(0) + " %"); set("pv", money(r.pv)); set("ev", money(r.ev));
    set("cv", r.ac > 0 ? signed(r.cv) : "—", r.ac > 0 ? cls(r.cv) : ""); set("sv", r.pv > 0 || r.ev > 0 ? signed(r.sv) : "—", cls(r.sv)); set("cpi", idx(r.cpi)); set("spi", idx(r.spi));
  });
  const tot = document.getElementById("evTot");
  if (tot) {
    const setT = (k: string, v: string): void => { const td = tot.querySelector<HTMLElement>(`[data-t="${k}"]`); if (td) td.textContent = v; };
    setT("bac", money(R.bac)); setT("plannedPct", R.percentPlanned.toFixed(1) + " %"); setT("pct", R.percentComplete.toFixed(1) + " %"); setT("pv", money(R.pv)); setT("ev", money(R.ev)); setT("ac", money(R.ac));
    setT("cv", R.ac > 0 ? signed(R.cv) : "—"); setT("sv", signed(R.sv)); setT("cpi", idx(R.cpi) + (st.cpi && st.cpi !== "verde" ? " ⚠" : "")); setT("spi", idx(R.spi) + (st.spi && st.spi !== "verde" ? " ⚠" : ""));
  }
}

// ---------- interacciones ----------
function onEdit(el: HTMLInputElement | HTMLSelectElement): void {
  const id = el.dataset.id as string, f = el.dataset.f as string;
  if (f === "technique") data.techniques[id] = el.value as EvTechnique;
  else { const raw = el.value.trim(), v = raw === "" ? null : Number(raw), ok = v !== null && isFinite(v) ? v : null; (f === "percent" ? data.percent : data.ac)[id] = ok; }
  refresh(); save();
}
function wireMain(): void {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#mainArea [data-f]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => onEdit(el)));
  wireHist();
}
function wireHist(): void {
  document.querySelectorAll<HTMLElement>("#evHist [data-del]").forEach((b) => b.addEventListener("click", () => { data.reports = data.reports.filter((r) => r.date !== b.dataset.del); const h = document.getElementById("evHist"); if (h) { h.innerHTML = histCard(); wireHist(); } refresh(); save(); setStatus("Corte quitado del historial."); }));
}
function registerCut(): void {
  const R = compute();
  if (!data.statusDate) { setStatus("Indica la fecha de corte."); return; }
  if (!(R.ev > 0) && !(R.ac > 0)) { setStatus("No hay avance ni costo real que registrar: reporta los paquetes antes de registrar el corte."); return; }
  const rep: EvmReport = { date: data.statusDate, offset: R.at, pv: R.pv, ev: R.ev, ac: R.ac, cpi: R.cpi, spi: R.spi };
  data.reports = data.reports.filter((r) => r.date !== rep.date).concat([rep]).sort((a, b) => a.date.localeCompare(b.date));
  const h = document.getElementById("evHist"); if (h) { h.innerHTML = histCard(); wireHist(); }
  refresh(); save(); setStatus("Corte del " + rep.date + " registrado (CPI " + idx(R.cpi) + " · SPI " + idx(R.spi) + ").");
}
function pullFromWbs(): void {
  const G = window.GPI, C = getCtx();
  if (!C.connected || !G) { setStatus("Abre este módulo desde el Panel de Control para traer el avance de la EDT."); return; }
  const wbs = G.getModule("wbs"); let n = 0;
  C.pkgs.forEach((p) => { const node = wbs && wbs.nodes[p.id], pc = node ? Number(node.percent) : NaN; if (isFinite(pc) && node && node.percent !== "" && node.percent !== undefined) { data.percent[p.id] = Math.max(0, Math.min(100, pc)); n++; } });
  render(); save(); setStatus(n ? "Avance traído de la EDT para " + n + " paquete(s). Revisa el costo real y la técnica de cada uno." : "La EDT no tiene avance cargado en los paquetes de trabajo.");
}
function loadSample(): void {
  const C = getCtx(); data = blankData(); data.statusDate = EVM_SAMPLE_STATUS_DATE;
  C.pkgs.forEach((p) => {   // se empareja por Código EDT con los paquetes del proyecto
    if (EVM_SAMPLE_PERCENT[p.code] !== undefined) data.percent[p.id] = EVM_SAMPLE_PERCENT[p.code];
    if (EVM_SAMPLE_AC[p.code] !== undefined) data.ac[p.id] = EVM_SAMPLE_AC[p.code];
    if (EVM_SAMPLE_TECHNIQUES[p.code]) data.techniques[p.id] = EVM_SAMPLE_TECHNIQUES[p.code];
  });
  data.reports = normalizeReports(EVM_SAMPLE_REPORTS);
}
function exportCsv(): void {
  const C = getCtx(), R = compute(), q = (v: unknown): string => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [["Codigo", "Paquete", "BAC", "Tecnica", "Pct_plan", "Pct_avance", "PV", "EV", "AC", "CV", "SV", "CPI", "SPI"].join(",")];
  R.rows.forEach((r) => lines.push([r.code, r.name, Math.round(r.bac), TECHNIQUE_LABEL[r.technique], r.plannedPct.toFixed(1), r.percent === null ? "" : r.percent, Math.round(r.pv), Math.round(r.ev), Math.round(r.ac), Math.round(r.cv), Math.round(r.sv), r.cpi === null ? "" : r.cpi.toFixed(3), r.spi === null ? "" : r.spi.toFixed(3)].map(q).join(",")));
  lines.push(["", "TOTAL corte " + data.statusDate, Math.round(R.bac), "", R.percentPlanned.toFixed(1), R.percentComplete.toFixed(1), Math.round(R.pv), Math.round(R.ev), Math.round(R.ac), Math.round(R.cv), Math.round(R.sv), R.cpi === null ? "" : R.cpi.toFixed(3), R.spi === null ? "" : R.spi.toFixed(3)].map(q).join(","));
  lines.push(["", "EAC tipico / ETC / VAC", R.eac.typical === null ? "" : Math.round(R.eac.typical), "", "", "", "", "", "", "", R.vac.typical === null ? "" : Math.round(R.vac.typical), "", ""].map(q).join(","));
  void C;
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "valor_ganado_" + data.statusDate + ".csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Seguimiento exportado como CSV.");
}

// ---------- modal ----------
function showConfirm(message: string, title: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = $("modalOverlay"), ok = $("modalConfirmBtn") as HTMLButtonElement, cancel = $("modalCancelBtn") as HTMLButtonElement;
    $("modalTitle").textContent = title; $("modalMessage").textContent = message;
    const done = (r: boolean): void => { overlay.classList.remove("open"); ok.onclick = null; cancel.onclick = null; overlay.onclick = null; document.removeEventListener("keydown", key); resolve(r); };
    const key = (e: KeyboardEvent): void => { if (e.key === "Escape") done(false); else if (e.key === "Enter") done(true); };
    ok.onclick = () => done(true); cancel.onclick = () => done(false); overlay.onclick = (e) => { if (e.target === overlay) done(false); };
    document.addEventListener("keydown", key); overlay.classList.add("open"); ok.focus();
  });
}

// ---------- toolbar ----------
function wireToolbar(): void {
  $("statusDate").addEventListener("change", () => { data.statusDate = ($("statusDate") as HTMLInputElement).value; refresh(); save(); });
  $("btnRegister").addEventListener("click", registerCut);
  $("btnPull").addEventListener("click", pullFromWbs);
  $("btnExportCsv").addEventListener("click", exportCsv);
  $("btnPrint").addEventListener("click", () => window.print());
  $("btnSample").addEventListener("click", () => {
    showConfirm("Esto reemplazará el seguimiento actual con el caso de ejemplo DISTRIB+ S.A. (avance y costo real al 2026-11-03). ¿Continuar?", "Cargar ejemplo").then((ok) => { if (!ok) return; ctxDirty = true; loadSample(); render(); save(); setStatus("Caso de ejemplo cargado."); });
  });
  $("btnReset").addEventListener("click", () => {
    showConfirm("Esto borrará el avance, los costos reales y el historial de cortes. ¿Continuar?", "Nuevo seguimiento").then((ok) => { if (ok) { data = blankData(); render(); save(); setStatus("Seguimiento nuevo iniciado."); } });
  });
}

// ---------- persistencia (proyecto conectado) ----------
let saveFn: () => boolean = () => false;
function save(): void { saveFn(); }
(function gpiBridge() {
  if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
  const proj = window.GPI.active();
  const titleEl = $("projectTitle") as HTMLInputElement, courseEl = $("courseTitle") as HTMLInputElement;
  let loadedProjectId: string | null = null, session: EditSession | null = null, projectStale = false, timer: number | undefined;
  function markProjectStale(): void {
    if (projectStale) return; projectStale = true;
    setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
    const b = document.getElementById("banner");
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el seguimiento aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const payload = () => ({ statusDate: data.statusDate, percent: data.percent, ac: data.ac, techniques: data.techniques, reports: data.reports });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId(); session = window.GPI!.openSession("evm");
    if (p.meta) { if (p.meta.name) titleEl.value = p.meta.name; if (p.meta.course) courseEl.value = p.meta.course; }
    ctxDirty = true;
    const mod = p.modules && (p.modules as Record<string, unknown>).evm;
    if (mod) { data = normalizeData(mod); window.GPI!.rebaseSession(session, payload()); render(); setStatus("Datos cargados desde el Panel de Control."); }
    else { data = blankData(); render(); setStatus("Proyecto sin seguimiento todavía. Reporta el avance y el costo real de los paquetes, o usa Cargar ejemplo para explorar el caso DISTRIB+."); }
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "evm", "El seguimiento de valor ganado", payload(), { name: titleEl.value, course: courseEl.value } as Partial<ProjectMeta>, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  saveFn = () => { window.clearTimeout(timer); timer = window.setTimeout(push, 800); return true; };
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else { ctxDirty = true; render(); } });
  // El cronograma, los costos y los planes los editan otros módulos: se vuelve a leer al próximo uso.
  window.GPI.onChange(() => {
    ctxDirty = true;
    const p = window.GPI!.active(); if (!p || !p.meta) return;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; }
    if (p.meta.name && document.activeElement !== titleEl) titleEl.value = p.meta.name;
    if (p.meta.course && document.activeElement !== courseEl) courseEl.value = p.meta.course;
  });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
})();
function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  installGpiBadge({ name, onSync: pushFn });
}

// ---------- init ----------
wireToolbar();
if (!(window.GPI && window.GPI.available() && window.GPI.active())) { ctxDirty = true; loadSample(); render(); }   // independiente: el ejemplo
else render();
