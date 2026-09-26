/* =========================================================
   Plan de Gestión de la Calidad — PMBOK (Planificar la gestión de la calidad)
   Módulo NUEVO (no es un port): patrón de Control de Cambios / Comunicaciones — addEventListener, window.GPI explícito, sin
   frameworks — compilado a quality.js (IIFE).

   Política y normas, MÉTRICAS de calidad, actividades de ASEGURAMIENTO (prevenir) y CONTROL (detectar) por paquete de trabajo y COSTO
   DE LA CALIDAD (prevención + evaluación vs. fallas internas y externas). No duplica: el criterio de aceptación de cada paquete se LEE
   del Diccionario de la EDT (y se puede copiar al control con un clic), los responsables son puestos del OBS y los paquetes con riesgo
   alto salen del Registro de Riesgos; el módulo comprueba que cada paquete con criterio de aceptación tenga cómo verificarse. Lógica
   PURA en src/shared/quality-plan.ts (con sus pruebas); este archivo es la interfaz.

   Regla de oro: con un proyecto activo arranca EN BLANCO; el ejemplo DISTRIB+ solo se carga con «Cargar ejemplo» (en modo
   independiente, sin proyecto, se muestra el ejemplo).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import { esc } from "../../shared/html";
import { installGpiBadge } from "../../shared/gpi-badge";
import type { EditSession } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { gatherQualityFacts } from "../../shared/plan-facts";
import { todayLocalISO } from "../../shared/local-date";
import {
  CHECK_KINDS, COQ_CATS, COQ_GROUP, COQ_LABEL, INSPECTION_RESULTS, NCR_SEVERITIES, NCR_STATUSES, NCR_STATUS_LABEL, QUALITY_METHODS, RESULT_LABEL, SEVERITY_LABEL, blankQuality, coqSummary, coverage, executionSummary,
  nextCheckCode, nextInspectionCode, nextMetricCode, nextNcrCode, normalizeCheck, normalizeCoq, normalizeInspection, normalizeMetric, normalizeNcr, normalizeQuality,
  qualityFindings, qualityState, type QCheck, type QInspection, type QMetric, type QNcr, type QualityData, type QualityFacts, type QualityState
} from "../../shared/quality-plan";
import { buildSampleQuality, sampleQualityFacts } from "../../shared/quality-sample";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }
const CUR: Record<string, string> = { USD: "$", PEN: "S/", EUR: "€" };
const STATE_LABEL: Record<QualityState, string> = { vacio: "Sin datos", verde: "En orden", ambar: "Con avisos", rojo: "Con riesgos" };

// ---------- contexto: EDT (con su diccionario), OBS, riesgos y costo (solo lectura) ----------
let ctx: { connected: boolean; facts: QualityFacts; sym: string } | null = null, ctxDirty = true;
function getCtx(): { connected: boolean; facts: QualityFacts; sym: string } {
  if (ctxDirty || !ctx) {
    const G = window.GPI, connected = !!(G && G.available() && G.active());
    let facts: QualityFacts = { leaves: [], roles: [], highRiskLeafIds: [], baseCost: null }, sym = "$";
    if (!connected) facts = sampleQualityFacts();
    else if (G && G.util) {
      try { const m = G.meta(); sym = CUR[(m && m.currency) || ""] || "$"; facts = gatherQualityFacts(G); } catch (e) { /* noop */ }
    }
    ctx = { connected, facts, sym }; ctxDirty = false;
  }
  return ctx;
}
const money = (n: number | null | undefined): string => (n == null || !isFinite(n) ? "—" : getCtx().sym + " " + Math.round(n).toLocaleString("es-PE"));

// ---------- estado ----------
let data: QualityData = blankQuality();
const newId = (p: string): string => p + data.idCounter++;

// ---------- render ----------
const opts = (list: readonly string[], cur: string): string => `<option value=""></option>` + list.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && list.indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
const leafOpts = (f: QualityFacts, cur: string): string => `<option value=""></option>` + f.leaves.map((l) => `<option value="${esc(l.id)}"${l.id === cur ? " selected" : ""}>${esc(l.code)} ${esc(l.name)}</option>`).join("") + (cur && !f.leaves.some((l) => l.id === cur) ? `<option value="${esc(cur)}" selected>(ya no existe)</option>` : "");
const del = (k: string, id: string): string => `<td><button class="btn sm danger" data-del="${k}:${esc(id)}" title="Eliminar" aria-label="Eliminar">✕</button></td>`;
function metricRow(m: QMetric, f: QualityFacts): string {
  return `<tr data-k="metric" data-id="${esc(m.id)}">
    <td style="width:70px"><input data-f="code" value="${esc(m.code)}" aria-label="Código"></td>
    <td style="min-width:150px"><input data-f="name" value="${esc(m.name)}" aria-label="Métrica"><textarea data-f="definition" placeholder="Definición…" style="margin-top:3px">${esc(m.definition)}</textarea></td>
    <td style="min-width:170px"><select data-f="wbsIds" multiple aria-label="Paquetes">${f.leaves.map((l) => `<option value="${esc(l.id)}"${m.wbsIds.indexOf(l.id) >= 0 ? " selected" : ""}>${esc(l.code)} ${esc(l.name)}</option>`).join("")}</select></td>
    <td style="min-width:150px"><textarea data-f="target" aria-label="Objetivo">${esc(m.target)}</textarea></td>
    <td style="min-width:150px"><textarea data-f="tolerance" aria-label="Tolerancia">${esc(m.tolerance)}</textarea></td>
    <td style="width:150px"><select data-f="method" aria-label="Método">${opts(QUALITY_METHODS, m.method)}</select></td>
    <td style="min-width:110px"><input data-f="frequency" value="${esc(m.frequency)}" aria-label="Frecuencia"></td>
    <td style="min-width:130px"><input data-f="owner" list="rolesList" value="${esc(m.owner)}" aria-label="Responsable"></td>${del("metric", m.id)}</tr>`;
}
function checkRow(c: QCheck, f: QualityFacts, d: QualityData, flagged: Set<string>): string {
  return `<tr data-k="check" data-id="${esc(c.id)}"${flagged.has(c.code) ? ' class="hasf"' : ""}>
    <td style="width:70px"><input data-f="code" value="${esc(c.code)}" aria-label="Código"></td>
    <td style="min-width:150px"><select data-f="wbsId" aria-label="Paquete">${leafOpts(f, c.wbsId)}</select></td>
    <td style="min-width:170px"><textarea data-f="what" aria-label="Qué se verifica">${esc(c.what)}</textarea></td>
    <td style="min-width:170px"><textarea data-f="criterion" aria-label="Criterio">${esc(c.criterion)}</textarea><button class="btn sm" data-edt="${esc(c.id)}" style="margin-top:3px" title="Copiar el criterio de aceptación del Diccionario de la EDT">↧ Tomar de la EDT</button></td>
    <td style="width:120px"><select data-f="kind" aria-label="Tipo">${opts(CHECK_KINDS, c.kind)}</select></td>
    <td style="width:150px"><select data-f="method" aria-label="Método">${opts(QUALITY_METHODS, c.method)}</select></td>
    <td style="min-width:110px"><input data-f="frequency" value="${esc(c.frequency)}" aria-label="Frecuencia"></td>
    <td style="min-width:130px"><input data-f="owner" list="rolesList" value="${esc(c.owner)}" aria-label="Responsable"></td>
    <td style="min-width:150px"><input data-f="record" value="${esc(c.record)}" aria-label="Registro"></td>
    <td style="min-width:120px"><select data-f="metricId" aria-label="Métrica">${`<option value=""></option>` + d.metrics.map((m) => `<option value="${esc(m.id)}"${m.id === c.metricId ? " selected" : ""}>${esc(m.code)}</option>`).join("")}</select></td>${del("check", c.id)}</tr>`;
}
const enumOpts = (list: readonly string[], labels: Record<string, string>, cur: string): string => list.map((o) => `<option value="${o}"${o === cur ? " selected" : ""}>${esc(labels[o])}</option>`).join("");
function inspRow(i: QInspection, d: QualityData): string {
  return `<tr data-k="insp" data-id="${esc(i.id)}">
    <td style="width:70px"><input data-f="code" value="${esc(i.code)}" aria-label="Código"></td>
    <td style="min-width:150px"><select data-f="checkId" aria-label="Control del plan">${`<option value=""></option>` + d.checks.map((c) => `<option value="${esc(c.id)}"${c.id === i.checkId ? " selected" : ""}>${esc(c.code)} ${esc(c.what.slice(0, 50))}</option>`).join("") + (i.checkId && !d.checks.some((c) => c.id === i.checkId) ? `<option value="${esc(i.checkId)}" selected>(ya no existe)</option>` : "")}</select></td>
    <td style="width:130px"><input data-f="date" type="date" value="${esc(i.date)}" aria-label="Fecha"></td>
    <td style="width:150px"><select data-f="result" aria-label="Resultado">${enumOpts(INSPECTION_RESULTS, RESULT_LABEL, i.result)}</select></td>
    <td style="min-width:130px"><input data-f="inspector" list="rolesList" value="${esc(i.inspector)}" aria-label="Inspector"></td>
    <td style="min-width:200px"><textarea data-f="notes" aria-label="Observaciones">${esc(i.notes)}</textarea></td>
    <td style="min-width:120px"><select data-f="ncrId" aria-label="No conformidad">${`<option value=""></option>` + d.ncrs.map((n) => `<option value="${esc(n.id)}"${n.id === i.ncrId ? " selected" : ""}>${esc(n.code)}</option>`).join("")}</select></td>${del("insp", i.id)}</tr>`;
}
function ncrRow(n: QNcr, f: QualityFacts): string {
  return `<tr data-k="ncr" data-id="${esc(n.id)}">
    <td style="width:70px"><input data-f="code" value="${esc(n.code)}" aria-label="Código"></td>
    <td style="min-width:150px"><select data-f="wbsId" aria-label="Paquete">${leafOpts(f, n.wbsId)}</select></td>
    <td style="min-width:200px"><textarea data-f="description" aria-label="Descripción">${esc(n.description)}</textarea></td>
    <td style="width:110px"><select data-f="severity" aria-label="Gravedad">${enumOpts(NCR_SEVERITIES, SEVERITY_LABEL, n.severity)}</select></td>
    <td style="width:130px"><input data-f="detectedOn" type="date" value="${esc(n.detectedOn)}" aria-label="Detectada"></td>
    <td style="width:130px"><select data-f="status" aria-label="Estado">${enumOpts(NCR_STATUSES, NCR_STATUS_LABEL, n.status)}</select></td>
    <td style="min-width:200px"><textarea data-f="action" aria-label="Acción correctiva">${esc(n.action)}</textarea></td>
    <td style="min-width:130px"><input data-f="owner" list="rolesList" value="${esc(n.owner)}" aria-label="Responsable"></td>
    <td style="width:130px"><input data-f="dueDate" type="date" value="${esc(n.dueDate)}" aria-label="Fecha límite"></td>
    <td style="width:130px"><input data-f="closedOn" type="date" value="${esc(n.closedOn)}" aria-label="Cerrada el"></td>${del("ncr", n.id)}</tr>`;
}
function render(): void {
  const C = getCtx(), f = C.facts, root = $("mainArea"), fs = qualityFindings(data, f, todayLocalISO());
  const flagged = new Set<string>();   // filas de control con hallazgo: se marcan por código al inicio de su texto
  fs.forEach((x) => { const m = /^(QC-\d+)/.exec(x.text); if (m) flagged.add(m[1]); });
  root.innerHTML = `
    <div class="view-head"><h2>Plan de calidad</h2>
      <p>La calidad se <b>planifica</b> (métricas y normas), se <b>asegura</b> (prevenir: revisiones y auditorías del proceso) y se <b>controla</b> (detectar: inspecciones, ensayos y pruebas), y cuesta: prevenir y evaluar es más barato que corregir. El criterio de aceptación de cada paquete viene del Diccionario de la EDT; abajo se comprueba que todos tengan cómo verificarse.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="grid2">
      <div class="card fd"><h3>Política de calidad</h3><label for="policy">Compromiso de calidad del proyecto</label><textarea id="policy" data-p="policy">${esc(data.policy)}</textarea></div>
      <div class="card fd"><h3>Normas y especificaciones</h3><label for="standards">Qué define la conformidad (normas, planos, especificaciones)</label><textarea id="standards" data-p="standards">${esc(data.standards)}</textarea></div>
    </div>
    <div class="card"><h3>Métricas de calidad (${data.metrics.length})</h3><p class="hint">Qué se mide, con qué objetivo y tolerancia, y cómo.</p>
      ${data.metrics.length ? `<table class="an" id="tblMetrics"><thead><tr><th>Cód.</th><th>Métrica y definición</th><th>Paquetes</th><th>Objetivo</th><th>Tolerancia</th><th>Método</th><th>Frecuencia</th><th>Responsable</th><th></th></tr></thead><tbody>${data.metrics.map((m) => metricRow(m, f)).join("")}</tbody></table>` : `<div class="empty-hint">Sin métricas. Agrega la primera con <b>＋ Métrica</b>.</div>`}</div>
    <div class="card"><h3>Aseguramiento y control por paquete (${data.checks.length})</h3><p class="hint">Cada paquete con criterio de aceptación necesita al menos una actividad que lo verifique; «Aseguramiento» previene, «Control» detecta.</p>
      ${data.checks.length ? `<table class="an" id="tblChecks"><thead><tr><th>Cód.</th><th>Paquete</th><th>Qué se verifica</th><th>Criterio de aceptación</th><th>Tipo</th><th>Método</th><th>Frecuencia</th><th>Responsable</th><th>Registro</th><th>Métrica</th><th></th></tr></thead><tbody>${data.checks.map((c) => checkRow(c, f, data, flagged)).join("")}</tbody></table>` : `<div class="empty-hint">Sin actividades de control ni aseguramiento. Agrega la primera con <b>＋ Control / aseguramiento</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist></div>
    <div class="card"><h3>Ejecución: inspecciones (${data.inspections.length})</h3><div class="fd" style="max-width:260px"><label for="asOf">Fecha de corte del seguimiento (vacía = hoy)</label><input id="asOf" type="date" data-p="asOf" value="${esc(data.asOf)}"></div><p class="hint">Lo que realmente se inspeccionó, ensayó o probó: qué control del plan, cuándo y con qué resultado. Un resultado «No conforme» exige registrar su no conformidad.</p>
      ${data.inspections.length ? `<table class="an" id="tblInsp"><thead><tr><th>Cód.</th><th>Control del plan</th><th>Fecha</th><th>Resultado</th><th>Inspector</th><th>Observaciones</th><th>No conformidad</th><th></th></tr></thead><tbody>${data.inspections.map((i) => inspRow(i, data)).join("")}</tbody></table>` : `<div class="empty-hint">Sin inspecciones. Cuando empiece la ejecución, registra la primera con <b>＋ Inspección</b>.</div>`}</div>
    <div class="card"><h3>Ejecución: no conformidades (${data.ncrs.length})</h3><p class="hint">Cada defecto detectado con su gravedad, la acción correctiva, quién la hace y para cuándo. Una crítica sin cerrar es un riesgo para la aceptación; una abierta sin acción o vencida se avisa.</p>
      ${data.ncrs.length ? `<table class="an" id="tblNcr"><thead><tr><th>Cód.</th><th>Paquete</th><th>Descripción</th><th>Gravedad</th><th>Detectada</th><th>Estado</th><th>Acción correctiva</th><th>Responsable</th><th>Fecha límite</th><th>Cerrada</th><th></th></tr></thead><tbody>${data.ncrs.map((n) => ncrRow(n, f)).join("")}</tbody></table>` : `<div class="empty-hint">Sin no conformidades registradas.</div>`}</div>
    <div class="card"><h3>Costo de la calidad</h3><p class="hint">Conformidad: prevención + evaluación. No conformidad: fallas internas (antes de la entrega) + externas (después).</p>
      ${data.coq.length ? `<table class="an" id="tblCoq"><thead><tr><th>Categoría</th><th>Descripción</th><th>Monto</th><th></th></tr></thead><tbody>${data.coq.map((c) => `<tr data-k="coq" data-id="${esc(c.id)}"><td style="width:170px"><select data-f="cat" aria-label="Categoría">${COQ_CATS.map((k) => `<option value="${k}"${k === c.cat ? " selected" : ""}>${COQ_LABEL[k]}</option>`).join("")}</select></td><td><input data-f="description" value="${esc(c.description)}" aria-label="Descripción"></td><td style="width:140px"><input data-f="amount" type="number" min="0" step="any" value="${c.amount === null ? "" : c.amount}" aria-label="Monto"></td>${del("coq", c.id)}</tr>`).join("")}</tbody></table>` : `<div class="empty-hint">Sin partidas. Agrega la primera con <b>＋ Partida de costo</b>.</div>`}
      <div class="bars" id="coqBars"></div></div>
    <div class="card"><h3>Cobertura por paquete</h3><div id="cover"></div></div>
    <div class="card"><h3>Hallazgos del plan</h3><div id="finds"></div></div>`;
  refreshMeta(); wireMain();
}
// KPIs, costo, cobertura y hallazgos: se actualizan al editar sin volver a dibujar las tablas (no se pierde el foco).
function refreshMeta(): void {
  const C = getCtx(), f = C.facts, cov = coverage(data, f), today = todayLocalISO(), fs = qualityFindings(data, f, today), st = qualityState(data, f, today), s = coqSummary(data.coq, f.baseCost), ex = executionSummary(data, today);
  const needing = cov.filter((r) => r.needs), ok = needing.filter((r) => r.checks.length).length;
  $("kpis").innerHTML = `<div class="kpi"><b>${ok}/${needing.length}</b><span>Paquetes con criterio de aceptación verificados</span></div>
    <div class="kpi"><b>${data.metrics.length}</b><span>Métricas</span></div>
    <div class="kpi"><b>${data.checks.filter((c) => c.kind === "Aseguramiento").length} / ${data.checks.filter((c) => c.kind === "Control").length}</b><span>Aseguramiento / control</span></div>
    <div class="kpi"><b>${ex.inspections} / ${ex.ncrOpen}</b><span>Inspecciones / no conformidades abiertas${ex.ncrOverdue ? " · " + ex.ncrOverdue + " vencida(s)" : ""}${ex.ncrCritical ? " · " + ex.ncrCritical + " crítica(s)" : ""}</span></div>
    <div class="kpi"><b>${money(s.total)}</b><span>Costo de la calidad${s.pctOfBase !== null ? " · " + s.pctOfBase.toFixed(1) + " % del costo base" : ""}</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado del plan</span></div>`;
  const bars = document.getElementById("coqBars");
  if (bars) bars.innerHTML = s.total > 0 ? COQ_CATS.map((k) => `<div class="bar${COQ_GROUP[k] === "no_conformidad" ? " nc" : ""}"><span>${COQ_LABEL[k]}</span><span><i style="width:${Math.max(1, Math.round(s.byCat[k] / s.total * 100))}%"></i></span><span class="mono">${money(s.byCat[k])} · ${Math.round(s.byCat[k] / s.total * 100)} %</span></div>`).join("") + `<p class="small muted">Conformidad ${money(s.conformity)} (${Math.round(100 - (s.failureShare || 0))} %) · no conformidad ${money(s.nonConformity)} (${Math.round(s.failureShare || 0)} %)</p>` : "";
  $("cover").innerHTML = f.leaves.length ? `<table class="an"><thead><tr><th>Paquete</th><th>Criterio de aceptación (Diccionario de la EDT)</th><th>Controles</th><th>Estado</th></tr></thead><tbody>${cov.map((r) => `<tr><td>${esc(r.leaf.code)} ${esc(r.leaf.name)}${r.highRisk ? ' <span class="pill st-rojo" title="Riesgo alto abierto">riesgo alto</span>' : ""}</td><td class="small">${r.leaf.acceptance.trim() ? esc(r.leaf.acceptance) : '<span class="muted">sin criterio en el diccionario</span>'}</td><td>${r.checks.length ? r.checks.map((c) => esc(c.code)).join(", ") : "—"}</td><td>${!r.needs ? `<span class="pill st-vacio">${r.leaf.loe ? "esfuerzo continuo" : "sin criterio"}</span>` : r.checks.length ? '<span class="pill st-verde">verificado</span>' : `<span class="pill ${r.highRisk ? "st-rojo" : "st-ambar"}">sin verificación</span>`}</td></tr>`).join("")}</tbody></table>` : `<p class="muted small">No hay paquetes de trabajo: arma la EDT en WBS Builder para revisar la cobertura.</p>`;
  const icon = { riesgo: "⛔", aviso: "⚠", info: "ℹ" } as const;
  $("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.checks.length || data.metrics.length || data.coq.length ? "Sin hallazgos." : "Sin nada que revisar todavía."}</p>`;
}
function wireMain(): void {
  const upd = (el: Element): void => {
    const tr = el.closest("tr"), f = el.getAttribute("data-f"); if (!tr || !f) return;
    const k = tr.getAttribute("data-k"), id = tr.getAttribute("data-id");
    const item = (k === "metric" ? data.metrics : k === "check" ? data.checks : k === "insp" ? data.inspections : k === "ncr" ? data.ncrs : data.coq).find((x) => x.id === id) as unknown as Record<string, unknown> | undefined; if (!item) return;
    if (f === "wbsIds") item.wbsIds = Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.value);
    else if (f === "amount") { const v = (el as HTMLInputElement).value; item.amount = v === "" || !isFinite(Number(v)) ? null : Number(v); }
    else item[f] = (el as HTMLInputElement).value;
    refreshMeta(); save();
  };
  ["tblMetrics", "tblChecks", "tblCoq", "tblInsp", "tblNcr"].forEach((tid) => {
    const t = document.getElementById(tid); if (!t) return;
    t.addEventListener("input", (e) => { const x = e.target as Element; if (x.tagName !== "SELECT") upd(x); });
    t.addEventListener("change", (e) => upd(e.target as Element));
  });
  document.querySelectorAll<HTMLElement>("[data-del]").forEach((b) => b.addEventListener("click", () => {
    const [k, id] = (b.dataset.del as string).split(":");
    if (k === "metric") { data.metrics = data.metrics.filter((m) => m.id !== id); data.checks.forEach((c) => { if (c.metricId === id) c.metricId = ""; }); }
    else if (k === "check") { data.checks = data.checks.filter((c) => c.id !== id); data.inspections.forEach((i) => { if (i.checkId === id) i.checkId = ""; }); }
    else if (k === "insp") data.inspections = data.inspections.filter((i) => i.id !== id);
    else if (k === "ncr") { data.ncrs = data.ncrs.filter((n) => n.id !== id); data.inspections.forEach((i) => { if (i.ncrId === id) i.ncrId = ""; }); }
    else data.coq = data.coq.filter((c) => c.id !== id);
    render(); save(); setStatus("Fila eliminada.");
  }));
  document.querySelectorAll<HTMLElement>("[data-edt]").forEach((b) => b.addEventListener("click", () => {
    const c = data.checks.find((x) => x.id === b.dataset.edt), leaf = c && getCtx().facts.leaves.find((l) => l.id === c.wbsId);
    if (!c || !leaf) { setStatus("Elige primero el paquete de trabajo."); return; }
    if (!leaf.acceptance.trim()) { setStatus("El paquete " + leaf.code + " no tiene criterio de aceptación en el Diccionario de la EDT."); return; }
    c.criterion = leaf.acceptance; render(); save(); setStatus("Criterio copiado del Diccionario de la EDT (" + leaf.code + ").");
  }));
  document.querySelectorAll<HTMLTextAreaElement>("[data-p]").forEach((t) => t.addEventListener("input", () => { (data as unknown as Record<string, string>)[t.dataset.p as string] = t.value; refreshMeta(); save(); }));
}

// ---------- acciones ----------
function focusLast(sel: string): void { const els = document.querySelectorAll<HTMLElement>(sel); if (els.length) els[els.length - 1].focus(); }
function addCheck(): void { const id = newId("qc"); data.checks.push(normalizeCheck({ id, code: nextCheckCode(data.checks) }, id)); render(); save(); setStatus("Control agregado: elige el paquete y completa qué se verifica."); focusLast("#tblChecks select[data-f=wbsId]"); }
function addMetric(): void { const id = newId("qm"); data.metrics.push(normalizeMetric({ id, code: nextMetricCode(data.metrics) }, id)); render(); save(); setStatus("Métrica agregada."); focusLast("#tblMetrics input[data-f=name]"); }
function addInsp(): void { const id = newId("in"); data.inspections.push(normalizeInspection({ id, code: nextInspectionCode(data.inspections), date: todayLocalISO() }, id)); render(); save(); setStatus("Inspección agregada: elige el control del plan y el resultado."); focusLast("#tblInsp select[data-f=checkId]"); }
function addNcr(): void { const id = newId("nc"); data.ncrs.push(normalizeNcr({ id, code: nextNcrCode(data.ncrs), detectedOn: todayLocalISO() }, id)); render(); save(); setStatus("No conformidad agregada: elige el paquete y describe el defecto."); focusLast("#tblNcr select[data-f=wbsId]"); }
function addCoq(): void { const id = newId("cq"); data.coq.push(normalizeCoq({ id }, id)); render(); save(); setStatus("Partida agregada."); focusLast("#tblCoq input[data-f=description]"); }
function exportCsv(): void {
  const f = getCtx().facts, leaf = (id: string): string => { const l = f.leaves.find((x) => x.id === id); return l ? l.code + " " + l.name : ""; }, q = (v: string): string => '"' + v.replace(/"/g, '""') + '"';
  const lines = [["Código", "Paquete", "Qué se verifica", "Criterio de aceptación", "Tipo", "Método", "Frecuencia", "Responsable", "Registro", "Métrica"].map(q).join(",")];
  data.checks.forEach((c) => lines.push([c.code, leaf(c.wbsId), c.what, c.criterion, c.kind, c.method, c.frequency, c.owner, c.record, (data.metrics.find((m) => m.id === c.metricId) || { code: "" }).code].map(q).join(",")));
  const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "plan_de_control_de_calidad.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Plan de control exportado como CSV.");
}
function showConfirm(message: string, title: string, okText = "Aceptar"): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = $("modalOverlay"), ok = $("modalConfirmBtn") as HTMLButtonElement, cancel = $("modalCancelBtn") as HTMLButtonElement;
    $("modalTitle").textContent = title; $("modalMessage").textContent = message; ok.textContent = okText;
    const done = (r: boolean): void => { overlay.classList.remove("open"); ok.onclick = null; cancel.onclick = null; overlay.onclick = null; document.removeEventListener("keydown", key); resolve(r); };
    const key = (e: KeyboardEvent): void => { if (e.key === "Escape") done(false); else if (e.key === "Enter") done(true); };
    ok.onclick = () => done(true); cancel.onclick = () => done(false); overlay.onclick = (e) => { if (e.target === overlay) done(false); };
    document.addEventListener("keydown", key); overlay.classList.add("open"); ok.focus();
  });
}
// Con un proyecto conectado el ejemplo se enlaza por código de paquete (1.1…5.3): los id del ejemplo son «w-<código>».
function remapSample(d: QualityData): QualityData {
  const C = getCtx(); if (!C.connected) return d;
  const byCode = new Map(C.facts.leaves.map((l) => [l.code, l.id] as const)), re = (id: string): string => { const c = id.replace(/^w-/, ""); return byCode.get(c) || ""; };
  d.checks.forEach((c) => { c.wbsId = re(c.wbsId); }); d.metrics.forEach((m) => { m.wbsIds = m.wbsIds.map(re).filter(Boolean); }); d.ncrs.forEach((n) => { n.wbsId = re(n.wbsId); });
  return d;
}
function wireToolbar(): void {
  $("btnAddCheck").addEventListener("click", addCheck); $("btnAddMetric").addEventListener("click", addMetric); $("btnAddCoq").addEventListener("click", addCoq); $("btnAddInsp").addEventListener("click", addInsp); $("btnAddNcr").addEventListener("click", addNcr); $("btnCsv").addEventListener("click", exportCsv);
  $("btnSample").addEventListener("click", () => {
    showConfirm("Esto reemplazará el plan actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
      if (!ok) return;
      ctxDirty = true; data = remapSample(buildSampleQuality()); render(); save();
      const C = getCtx(), sin = C.connected ? data.checks.filter((c) => !c.wbsId).length : 0;
      setStatus("Caso de ejemplo cargado." + (sin ? " " + sin + " control(es) del ejemplo no encontraron su paquete en la EDT del proyecto: carga el ejemplo en WBS Builder (o elige tus paquetes) para enlazarlos." : ""));
    });
  });
  $("btnClear").addEventListener("click", () => {
    showConfirm("Esto borrará las métricas, los controles, el costo de la calidad y la política. ¿Continuar?", "Nuevo plan").then((ok) => { if (ok) { data = blankQuality(); render(); save(); setStatus("Plan nuevo iniciado."); } });
  });
}

// ---------- persistencia (proyecto conectado) ----------
let saveFn: () => boolean = () => false;
function save(): void { saveFn(); }
(function gpiBridge() {
  if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
  const proj = window.GPI.active();
  let loadedProjectId: string | null = null, session: EditSession | null = null, projectStale = false, timer: number | undefined;
  function markProjectStale(): void {
    if (projectStale) return; projectStale = true;
    setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
    const b = document.getElementById("banner");
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el plan de calidad aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const payload = () => ({ policy: data.policy, standards: data.standards, metrics: data.metrics, checks: data.checks, coq: data.coq, idCounter: data.idCounter, inspections: data.inspections, ncrs: data.ncrs, asOf: data.asOf });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId(); session = window.GPI!.openSession("quality"); ctxDirty = true;
    const mod = p.modules && (p.modules as Record<string, unknown>).quality;
    if (mod && typeof mod === "object") { data = normalizeQuality(mod); window.GPI!.rebaseSession(session, payload()); render(); setStatus("Datos cargados desde el Panel de Control."); }
    else { data = blankQuality(); render(); setStatus("Proyecto sin plan de calidad todavía. Agrega el primer control, o usa Cargar ejemplo para explorar el caso DISTRIB+."); }
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "quality", "El plan de calidad", payload(), null, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  saveFn = () => { window.clearTimeout(timer); timer = window.setTimeout(push, 800); return true; };
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  // La EDT (y su diccionario), el OBS, los riesgos y el costo los editan otros módulos: se vuelve a leer al volver o cuando cambian.
  const reread = (): void => { ctxDirty = true; const a = document.activeElement; if (!(a && $("mainArea").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render(); else refreshMeta(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else reread(); });
  window.GPI.onChange(() => { if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; } reread(); });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
})();
function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  installGpiBadge({ name, onSync: pushFn, accent: "#00937f", hover: "#00c2a8" });
}

// ---------- init ----------
wireToolbar();
if (!(window.GPI && window.GPI.available() && window.GPI.active())) { data = buildSampleQuality(); ctxDirty = true; render(); }   // independiente: el ejemplo
else render();
