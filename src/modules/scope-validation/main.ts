/* =========================================================
   Validar el Alcance — PMBOK (Validar el alcance)
   Módulo NUEVO (no es un port): patrón de Calidad / Comunicaciones — addEventListener, window.GPI explícito, sin frameworks — compilado a
   scope-validation.js (IIFE).

   La ACEPTACIÓN FORMAL de cada entregable del Enunciado del Alcance por quien lo recibe: contra qué criterio, con qué evidencia (acta o protocolo),
   quién firma y cuándo. No duplica: los entregables y sus criterios se LEEN del Enunciado, los paquetes que los componen se eligen de la EDT y las
   no conformidades abiertas salen del Plan de Calidad (aceptar con defectos abiertos es lo que este módulo señala). Lógica PURA en
   src/shared/scope-validation.ts (con sus pruebas); este archivo es la interfaz.

   Regla de oro: con un proyecto activo arranca EN BLANCO; el ejemplo DISTRIB+ solo se carga con «Cargar ejemplo» (en modo independiente, sin
   proyecto, se muestra el ejemplo).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import { esc } from "../../shared/html";
import { installGpiBadge } from "../../shared/gpi-badge";
import { todayLocalISO } from "../../shared/local-date";
import type { EditSession } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { gatherValidationFacts } from "../../shared/plan-facts";
import {
  DECISIONS, DECISION_LABEL, blankValidation, coverage, nextCode, normalizeAcceptance, normalizeValidation, summary, validationFindings, validationState,
  type Acceptance, type ScopeValidationData, type SvFacts, type ValidationState
} from "../../shared/scope-validation";
import { buildSampleValidation, sampleValidationFacts } from "../../shared/scope-validation-sample";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }
const STATE_LABEL: Record<ValidationState, string> = { vacio: "Sin datos", verde: "En orden", ambar: "Con avisos", rojo: "Con riesgos" };
const COV_LABEL: Record<string, string> = { sin_validacion: "sin validación", pendiente: "pendiente", aceptado: "aceptado", rechazado: "rechazado" };
const COV_CLASS: Record<string, string> = { sin_validacion: "st-ambar", pendiente: "st-vacio", aceptado: "st-verde", rechazado: "st-rojo" };

// ---------- contexto: Enunciado del Alcance, EDT, Plan de Calidad y OBS (solo lectura) ----------
let ctx: { connected: boolean; facts: SvFacts } | null = null, ctxDirty = true;
function getCtx(): { connected: boolean; facts: SvFacts } {
  if (ctxDirty || !ctx) {
    const G = window.GPI, connected = !!(G && G.available() && G.active());
    let facts: SvFacts = { deliverables: [], leaves: [], roles: [], openNcr: {}, leavesOf: {} };
    if (!connected) facts = sampleValidationFacts();
    else if (G && G.util) { try { facts = gatherValidationFacts(G); } catch (e) { /* noop */ } }
    ctx = { connected, facts }; ctxDirty = false;
  }
  return ctx;
}

// ---------- estado ----------
let data: ScopeValidationData = blankValidation();
const newId = (): string => "va" + data.idCounter++;

// ---------- render ----------
const enumOpts = (list: readonly string[], labels: Record<string, string>, cur: string): string => list.map((o) => `<option value="${o}"${o === cur ? " selected" : ""}>${esc(labels[o])}</option>`).join("");
function recRow(r: Acceptance, f: SvFacts, flagged: Set<string>): string {
  const delOpts = `<option value=""></option>` + f.deliverables.map((d) => `<option value="${esc(d.id)}"${d.id === r.delivId ? " selected" : ""}>${esc(d.code)} ${esc(d.name)}</option>`).join("") + (r.delivId && !f.deliverables.some((d) => d.id === r.delivId) ? `<option value="${esc(r.delivId)}" selected>(ya no existe)</option>` : "");
  const leafOpts = f.leaves.map((l) => `<option value="${esc(l.id)}"${r.wbsIds.indexOf(l.id) >= 0 ? " selected" : ""}>${esc(l.code)} ${esc(l.name)}</option>`).join("");
  return `<tr data-id="${esc(r.id)}"${flagged.has(r.id) ? ' class="hasf"' : ""}>
    <td style="width:70px"><input data-f="code" value="${esc(r.code)}" aria-label="Código"></td>
    <td style="min-width:170px"><select data-f="delivId" aria-label="Entregable">${delOpts}</select></td>
    <td style="min-width:170px"><select data-f="wbsIds" multiple aria-label="Paquetes de la EDT">${leafOpts}</select><button class="btn sm" data-leaves="${esc(r.id)}" style="margin-top:3px" title="Tomar los paquetes vinculados a este entregable en WBS Builder">↧ Paquetes del entregable</button></td>
    <td style="width:130px"><input data-f="presentedOn" type="date" value="${esc(r.presentedOn)}" aria-label="Presentado el"><input data-f="presentedBy" list="rolesList" value="${esc(r.presentedBy)}" placeholder="Presentó…" style="margin-top:3px" aria-label="Presentó"></td>
    <td style="min-width:140px"><input data-f="reviewer" list="rolesList" value="${esc(r.reviewer)}" aria-label="Quién acepta"></td>
    <td style="min-width:190px"><textarea data-f="criteria" aria-label="Criterio de aceptación">${esc(r.criteria)}</textarea><button class="btn sm" data-crit="${esc(r.id)}" style="margin-top:3px" title="Copiar el criterio de aceptación del Enunciado del Alcance">↧ Tomar del Enunciado</button></td>
    <td style="width:170px"><select data-f="decision" aria-label="Decisión">${enumOpts(DECISIONS, DECISION_LABEL, r.decision)}</select><input data-f="decidedOn" type="date" value="${esc(r.decidedOn)}" style="margin-top:3px" aria-label="Fecha de la decisión"></td>
    <td style="min-width:150px"><input data-f="evidence" value="${esc(r.evidence)}" aria-label="Evidencia"></td>
    <td style="min-width:190px"><textarea data-f="observations" aria-label="Observaciones">${esc(r.observations)}</textarea></td>
    <td><button class="btn sm danger" data-del="${esc(r.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
}
function render(): void {
  const C = getCtx(), f = C.facts, root = $("mainArea"), flagged = new Set(validationFindings(data, f, todayLocalISO()).map((x) => x.recordId).filter((x): x is string => !!x));
  root.innerHTML = `
    <div class="view-head"><h2>Validar el alcance</h2>
      <p>Validar es que <b>quien recibe</b> acepte formalmente cada entregable terminado, contra el criterio con que se definió. No es lo mismo que controlar la calidad: la calidad verifica que el entregable es <b>correcto</b>; la validación lo hace <b>aceptar</b>. Los entregables y sus criterios salen del Enunciado del Alcance; los defectos abiertos, del Plan de Calidad.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="card"><h3>Validaciones (${data.records.length})</h3>
      <div class="fd" style="max-width:260px;margin-bottom:8px"><label for="asOf">Fecha de corte del seguimiento (vacía = hoy)</label><input id="asOf" type="date" value="${esc(data.asOf)}"></div>
      ${data.records.length ? `<table class="an" id="tblVal"><thead><tr><th>Cód.</th><th>Entregable</th><th>Paquetes</th><th>Presentado</th><th>Quién acepta</th><th>Criterio</th><th>Decisión</th><th>Evidencia</th><th>Observaciones</th><th></th></tr></thead><tbody>${data.records.map((r) => recRow(r, f, flagged)).join("")}</tbody></table>
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>`
        : `<div class="empty-hint">Aún no hay validaciones. Agrega la primera con <b>＋ Validación</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
    </div>
    <div class="card"><h3>Cobertura de entregables</h3><div id="cover"></div></div>
    <div class="card"><h3>Hallazgos</h3><div id="finds"></div></div>`;
  refreshMeta(); wireMain();
}
// KPIs, cobertura y hallazgos: se actualizan al editar sin volver a dibujar la tabla (no se pierde el foco).
function refreshMeta(): void {
  const C = getCtx(), f = C.facts, today = todayLocalISO(), cov = coverage(data, f), fs = validationFindings(data, f, today), st = validationState(data, f, today), s = summary(data, f);
  $("kpis").innerHTML = `<div class="kpi"><b>${s.accepted}/${s.deliverables}</b><span>Entregables aceptados</span></div>
    <div class="kpi"><b>${s.pending}</b><span>Pendientes de decisión</span></div>
    <div class="kpi"><b>${s.rejected}</b><span>Rechazados</span></div>
    <div class="kpi"><b>${s.uncovered}</b><span>Sin ninguna validación</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado</span></div>`;
  $("cover").innerHTML = f.deliverables.length ? `<table class="an"><thead><tr><th>Entregable (Enunciado del Alcance)</th><th>Criterio de aceptación</th><th>Validaciones</th><th>Estado</th></tr></thead><tbody>${cov.map((r) => `<tr><td>${esc(r.deliverable.code)} ${esc(r.deliverable.name)}</td><td class="small">${r.deliverable.criteria.trim() ? esc(r.deliverable.criteria) : '<span class="muted">sin criterio en el Enunciado</span>'}</td><td>${r.records.length ? r.records.map((x) => esc(x.code)).join(", ") : "—"}</td><td><span class="pill ${COV_CLASS[r.state]}">${COV_LABEL[r.state]}</span></td></tr>`).join("")}</tbody></table>`
    : `<p class="muted small">No hay entregables: define los entregables y sus criterios de aceptación en el Enunciado del Alcance para poder validarlos.</p>`;
  const icon = { riesgo: "⛔", aviso: "⚠", info: "ℹ" } as const;
  $("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.records.length ? "Sin hallazgos." : "Sin validaciones que revisar."}</p>`;
}
function wireMain(): void {
  const asOf = document.getElementById("asOf") as HTMLInputElement | null;
  if (asOf) asOf.addEventListener("change", () => { data.asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOf.value) ? asOf.value : ""; refreshMeta(); save(); });
  const t = document.getElementById("tblVal"); if (!t) return;
  const upd = (el: Element): void => {
    const tr = el.closest("tr"), r = tr && data.records.find((x) => x.id === tr.getAttribute("data-id")), fld = el.getAttribute("data-f"); if (!r || !fld) return;
    if (fld === "wbsIds") r.wbsIds = Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.value); else (r as unknown as Record<string, string>)[fld] = (el as HTMLInputElement).value;
    refreshMeta(); save();
  };
  t.addEventListener("input", (e) => { const x = e.target as Element; if (x.tagName !== "SELECT") upd(x); });
  t.addEventListener("change", (e) => upd(e.target as Element));
  t.querySelectorAll<HTMLElement>("[data-del]").forEach((b) => b.addEventListener("click", () => { data.records = data.records.filter((x) => x.id !== b.dataset.del); render(); save(); setStatus("Validación eliminada."); }));
  t.querySelectorAll<HTMLElement>("[data-crit]").forEach((b) => b.addEventListener("click", () => {
    const r = data.records.find((x) => x.id === b.dataset.crit), dv = r && getCtx().facts.deliverables.find((d) => d.id === r.delivId);
    if (!r || !dv) { setStatus("Elige primero el entregable."); return; }
    if (!dv.criteria.trim()) { setStatus("El entregable " + dv.code + " no tiene criterio de aceptación en el Enunciado del Alcance."); return; }
    r.criteria = dv.criteria; render(); save(); setStatus("Criterio copiado del Enunciado del Alcance (" + dv.code + ").");
  }));
  t.querySelectorAll<HTMLElement>("[data-leaves]").forEach((b) => b.addEventListener("click", () => {
    const r = data.records.find((x) => x.id === b.dataset.leaves), ids = r && (getCtx().facts.leavesOf || {})[r.delivId];
    if (!r || !r.delivId) { setStatus("Elige primero el entregable."); return; }
    if (!ids || !ids.length) { setStatus("Ningún elemento de la EDT está vinculado a ese entregable: vincúlalo en WBS Builder o elige los paquetes a mano."); return; }
    r.wbsIds = ids.slice(); render(); save(); setStatus("Paquetes tomados de la EDT (" + ids.length + ").");
  }));
}

// ---------- acciones ----------
function addRecord(): void {
  const id = newId(), r = normalizeAcceptance({ id, code: nextCode(data.records) }, id); data.records.push(r); render(); save(); setStatus(r.code + " creada: elige el entregable y registra la decisión.");
  const el = document.querySelector(`tr[data-id="${id}"] select`) as HTMLElement | null; if (el) el.focus();
}
function exportCsv(): void {
  const f = getCtx().facts, dn = (id: string): string => { const d = f.deliverables.find((x) => x.id === id); return d ? d.code + " " + d.name : ""; }, ln = (ids: string[]): string => ids.map((i) => (f.leaves.find((l) => l.id === i) || { code: "" }).code).filter(Boolean).join("; "), q = (v: string): string => '"' + v.replace(/"/g, '""') + '"';
  const lines = [["Código", "Entregable", "Paquetes", "Presentado el", "Presentó", "Quién acepta", "Criterio", "Decisión", "Fecha de la decisión", "Evidencia", "Observaciones"].map(q).join(",")];
  data.records.forEach((r) => lines.push([r.code, dn(r.delivId), ln(r.wbsIds), r.presentedOn, r.presentedBy, r.reviewer, r.criteria, DECISION_LABEL[r.decision], r.decidedOn, r.evidence, r.observations].map(q).join(",")));
  const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "validacion_del_alcance.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Validaciones exportadas como CSV.");
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
// Con un proyecto conectado el ejemplo se enlaza por NOMBRE de entregable (el del Enunciado) y por código EDT (1.1…5.3): lo que no existe queda sin enlazar.
function sampleForProject(): ScopeValidationData {
  const C = getCtx(); if (!C.connected) return buildSampleValidation();
  const del = new Map(C.facts.deliverables.map((d) => [d.name.trim().toLowerCase(), d.id] as const)), leaf = new Map(C.facts.leaves.map((l) => [l.code, l.id] as const));
  return buildSampleValidation((n) => del.get(n.trim().toLowerCase()) || "", (c) => leaf.get(c) || "");
}
function wireToolbar(): void {
  $("btnAdd").addEventListener("click", addRecord); $("btnCsv").addEventListener("click", exportCsv);
  $("btnSample").addEventListener("click", () => {
    showConfirm("Esto reemplazará las validaciones actuales con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
      if (!ok) return;
      ctxDirty = true; data = sampleForProject(); render(); save();
      const C = getCtx(), sin = C.connected ? data.records.filter((r) => !r.delivId).length : 0;
      setStatus("Caso de ejemplo cargado." + (sin ? " " + sin + " validación(es) no encontraron su entregable en el Enunciado del Alcance del proyecto: carga el ejemplo en Enunciado del Alcance (o elige tus entregables) para enlazarlas." : ""));
    });
  });
  $("btnClear").addEventListener("click", () => {
    showConfirm("Esto borrará todas las validaciones. ¿Continuar?", "Nueva validación").then((ok) => { if (ok) { data = blankValidation(); render(); save(); setStatus("Validación nueva iniciada."); } });
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
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar la validación del alcance aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const payload = () => ({ records: data.records, asOf: data.asOf, idCounter: data.idCounter });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId(); session = window.GPI!.openSession("scopeValidation"); ctxDirty = true;
    const mod = p.modules && (p.modules as Record<string, unknown>).scopeValidation;
    if (mod && typeof mod === "object") { data = normalizeValidation(mod); window.GPI!.rebaseSession(session, payload()); render(); setStatus("Datos cargados desde el Panel de Control."); }
    else { data = blankValidation(); render(); setStatus("Proyecto sin validaciones todavía. Agrega la primera, o usa Cargar ejemplo para explorar el caso DISTRIB+."); }
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "scopeValidation", "La validación del alcance", payload(), null, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  saveFn = () => { window.clearTimeout(timer); timer = window.setTimeout(push, 800); return true; };
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  // El Enunciado, la EDT, el Plan de Calidad y el OBS los editan otros módulos: se vuelve a leer al volver o cuando cambian.
  const reread = (): void => { ctxDirty = true; const a = document.activeElement; if (!(a && $("mainArea").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render(); else refreshMeta(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else reread(); });
  window.GPI.onChange(() => { if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; } reread(); });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
})();
function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  installGpiBadge({ name, onSync: pushFn, accent: "#5646c9", hover: "#6c5ce7" });
}

// ---------- init ----------
wireToolbar();
if (!(window.GPI && window.GPI.available() && window.GPI.active())) { data = buildSampleValidation(); ctxDirty = true; render(); }   // independiente: el ejemplo
else render();
