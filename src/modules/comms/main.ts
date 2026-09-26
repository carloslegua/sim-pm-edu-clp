/* =========================================================
   Plan de Gestión de las Comunicaciones — PMBOK (Planificar la gestión de las comunicaciones)
   Módulo NUEVO (no es un port): patrón de Control de Cambios — addEventListener, window.GPI explícito, sin frameworks — compilado
   a comms.js (IIFE).

   La matriz de comunicaciones (qué información, para qué, a quién, quién la emite, con qué frecuencia y medio, y dónde queda el
   registro) más las reglas del plan (escalamiento, restricciones, actualización). Los destinatarios se ELIGEN de Stakeholder
   Studio (por id) y los emisores son puestos del OBS: el módulo no duplica ninguno. Revisa la matriz contra los interesados (a quien
   hay que gestionar de cerca o subir de compromiso no le puede faltar una comunicación). Lógica PURA en src/shared/comms-plan.ts
   (con sus pruebas); este archivo es la interfaz.

   Regla de oro: con un proyecto activo arranca EN BLANCO; el ejemplo DISTRIB+ solo se carga con «Cargar ejemplo» (en modo
   independiente, sin proyecto, se muestra el ejemplo).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import { esc } from "../../shared/html";
import { installGpiBadge } from "../../shared/gpi-badge";
import type { EditSession } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { levelName } from "../../shared/stakeholder-engagement";
import { gatherCommFacts } from "../../shared/plan-facts";
import { todayLocalISO } from "../../shared/local-date";
import {
  FREQUENCIES, LOG_STATUSES, LOG_STATUS_LABEL, METHODS, blankItem, channelsFor, commFindings, commState, coverage, nextCode, nextLogCode, normalizeComms, normalizeLog,
  type CommData, type CommFacts, type CommItem, type CommLog, type CommState
} from "../../shared/comms-plan";
import { buildSampleComms, sampleCommFacts } from "../../shared/comms-sample";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }
const STATE_LABEL: Record<CommState, string> = { vacio: "Sin datos", verde: "En orden", ambar: "Con avisos", rojo: "Con riesgos" };
const QUAD: Record<string, string> = { cerca: "Gestionar de cerca", satisfecho: "Mantener satisfecho", informado: "Mantener informado", monitorear: "Monitorear" };

// ---------- contexto: interesados y puestos del OBS (solo lectura) ----------
let ctx: { connected: boolean; facts: CommFacts } | null = null, ctxDirty = true;
function getCtx(): { connected: boolean; facts: CommFacts } {
  if (ctxDirty || !ctx) {
    const G = window.GPI, connected = !!(G && G.available() && G.active());
    let facts: CommFacts = { stakeholders: [], roles: [] };
    if (!connected) facts = sampleCommFacts();
    else if (G && G.util) {
      try { facts = gatherCommFacts(G); } catch (e) { /* noop */ }
    }
    ctx = { connected, facts }; ctxDirty = false;
  }
  return ctx;
}

// ---------- estado ----------
let data: CommData = normalizeComms(null);
const byId = (id: string | undefined): CommItem | undefined => data.items.find((c) => c.id === id);

// ---------- render ----------
const opts = (list: readonly string[], cur: string): string => `<option value=""></option>` + list.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && list.indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
function rowHtml(c: CommItem, f: CommFacts, flagged: Set<string>): string {
  const stkOpts = f.stakeholders.map((s) => `<option value="${esc(s.id)}"${c.stkIds.indexOf(s.id) >= 0 ? " selected" : ""}>${esc(s.name)}</option>`).join("");
  const missing = c.stkIds.filter((i) => !f.stakeholders.some((s) => s.id === i));
  return `<tr data-id="${esc(c.id)}"${flagged.has(c.id) ? ' class="hasf"' : ""}>
    <td style="width:74px"><input data-f="code" value="${esc(c.code)}" aria-label="Código"></td>
    <td style="min-width:190px"><textarea data-f="info" aria-label="Información">${esc(c.info)}</textarea></td>
    <td style="min-width:190px"><textarea data-f="purpose" aria-label="Propósito">${esc(c.purpose)}</textarea></td>
    <td style="min-width:170px"><select data-f="stkIds" multiple aria-label="Destinatarios">${stkOpts}${missing.map((i) => `<option value="${esc(i)}" selected>(ya no existe: ${esc(i)})</option>`).join("")}</select><input data-f="audience" placeholder="Otra audiencia…" value="${esc(c.audience)}" style="margin-top:3px"></td>
    <td style="min-width:140px"><input data-f="sender" list="rolesList" value="${esc(c.sender)}" aria-label="Emisor"></td>
    <td style="width:110px"><select data-f="frequency" aria-label="Frecuencia">${opts(FREQUENCIES, c.frequency)}</select></td>
    <td style="width:150px"><select data-f="method" aria-label="Medio">${opts(METHODS, c.method)}</select></td>
    <td style="min-width:140px"><input data-f="channel" value="${esc(c.channel)}" aria-label="Canal o formato"></td>
    <td style="min-width:150px"><input data-f="storage" value="${esc(c.storage)}" aria-label="Registro"></td>
    <td><button class="btn sm danger" data-del="${esc(c.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
}
function logRow(l: CommLog): string {
  return `<tr data-lk="log" data-id="${esc(l.id)}">
    <td style="width:74px"><input data-lf="code" value="${esc(l.code)}" aria-label="Código"></td>
    <td style="min-width:170px"><select data-lf="itemId" aria-label="Comunicación del plan">${`<option value=""></option>` + data.items.map((c) => `<option value="${esc(c.id)}"${c.id === l.itemId ? " selected" : ""}>${esc(c.code)} ${esc(c.info.slice(0, 45))}</option>`).join("") + (l.itemId && !data.items.some((c) => c.id === l.itemId) ? `<option value="${esc(l.itemId)}" selected>(ya no existe)</option>` : "")}</select></td>
    <td style="width:130px"><input data-lf="date" type="date" value="${esc(l.date)}" aria-label="Fecha"></td>
    <td style="width:130px"><select data-lf="status" aria-label="Estado">${LOG_STATUSES.map((s) => `<option value="${s}"${s === l.status ? " selected" : ""}>${LOG_STATUS_LABEL[s]}</option>`).join("")}</select></td>
    <td style="min-width:130px"><input data-lf="by" list="rolesList" value="${esc(l.by)}" aria-label="Emitió"></td>
    <td style="min-width:200px"><textarea data-lf="summary" aria-label="Qué se comunicó o motivo">${esc(l.summary)}</textarea></td>
    <td style="min-width:150px"><input data-lf="evidence" value="${esc(l.evidence)}" aria-label="Evidencia"></td>
    <td><button class="btn sm danger" data-dellog="${esc(l.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
}
function render(): void {
  const C = getCtx(), f = C.facts, root = $("mainArea");
  const flagged = new Set(commFindings(data, f, todayLocalISO()).map((x) => x.itemId).filter((x): x is string => !!x));
  root.innerHTML = `
    <div class="view-head"><h2>Matriz de comunicaciones</h2>
      <p>Cada fila responde: <b>qué</b> información, <b>para qué</b>, <b>a quién</b>, <b>quién</b> la emite, <b>cada cuánto</b>, <b>por qué medio</b> y <b>dónde queda el registro</b>. Los destinatarios salen de Stakeholder Studio y los emisores del OBS. Abajo se revisa que a cada interesado le llegue lo que su estrategia exige.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="card"><h3>Comunicaciones (${data.items.length})</h3>
      ${data.items.length ? `<table class="an" id="matrix"><thead><tr><th>Cód.</th><th>Información</th><th>Propósito</th><th>Destinatarios</th><th>Emisor</th><th>Frecuencia</th><th>Medio</th><th>Canal / formato</th><th>Registro</th><th></th></tr></thead><tbody>${data.items.map((c) => rowHtml(c, f, flagged)).join("")}</tbody></table>
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>`
        : `<div class="empty-hint">Aún no hay comunicaciones. Agrega la primera con <b>＋ Nueva comunicación</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
    </div>
    <div class="card"><h3>Ejecución: bitácora de comunicaciones emitidas (${data.log.length})</h3><p class="hint">Lo que realmente se comunicó (o se reprogramó u omitió): qué comunicación del plan, cuándo, quién y dónde queda la evidencia. Contra la fecha de corte se avisa la comunicación periódica sin emitir.</p>
      <div class="fd" style="max-width:260px"><label for="asOf">Fecha de corte del seguimiento (vacía = hoy)</label><input id="asOf" type="date" data-p="asOf" value="${esc(data.asOf)}"></div>
      ${data.log.length ? `<table class="an" id="tblLog"><thead><tr><th>Cód.</th><th>Comunicación del plan</th><th>Fecha</th><th>Estado</th><th>Emitió</th><th>Qué se comunicó / motivo</th><th>Evidencia</th><th></th></tr></thead><tbody>${data.log.map((l) => logRow(l)).join("")}</tbody></table>` : `<div class="empty-hint">Sin comunicaciones registradas. Cuando empiece la ejecución, registra la primera con <b>＋ Comunicación emitida</b>.</div>`}</div>
    <div class="grid2">
      <div class="card fd"><h3>Escalamiento</h3><label for="planEscalation">Ruta y plazos para los asuntos sin respuesta</label><textarea id="planEscalation" data-p="escalation">${esc(data.plan.escalation)}</textarea></div>
      <div class="card fd"><h3>Restricciones y confidencialidad</h3><label for="planRestrictions">Quién puede decir qué, idioma, información restringida</label><textarea id="planRestrictions" data-p="restrictions">${esc(data.plan.restrictions)}</textarea></div>
      <div class="card fd"><h3>Actualización del plan</h3><label for="planReview">Cuándo y cómo se revisa la matriz</label><textarea id="planReview" data-p="review">${esc(data.plan.review)}</textarea></div>
    </div>
    <div class="card"><h3>Cobertura de interesados</h3><div id="cover"></div></div>
    <div class="card"><h3>Hallazgos del plan</h3><div id="finds"></div></div>`;
  refreshMeta(); wireMain();
}
// KPIs, cobertura y hallazgos: se actualizan al editar sin volver a dibujar la matriz (no se pierde el foco).
function refreshMeta(): void {
  const C = getCtx(), f = C.facts, cov = coverage(data.items, f), fs = commFindings(data, f, todayLocalISO()), st = commState(data, f, todayLocalISO());
  const covered = cov.filter((r) => r.items.length).length;
  $("kpis").innerHTML = `<div class="kpi"><b>${data.items.length}</b><span>Comunicaciones planificadas</span></div>
    <div class="kpi"><b>${covered}/${f.stakeholders.length}</b><span>Interesados con comunicación</span></div>
    <div class="kpi"><b>${fs.length}</b><span>Hallazgos</span></div>
    <div class="kpi"><b>${channelsFor(f.stakeholders.length)}</b><span>Canales potenciales entre ${f.stakeholders.length} interesados (n(n−1)/2)</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado del plan</span></div>`;
  $("cover").innerHTML = f.stakeholders.length ? `<table class="an"><thead><tr><th>Interesado</th><th>Estrategia</th><th>Compromiso</th><th>Comunicaciones</th></tr></thead><tbody>${cov.map((r) => `<tr><td>${esc(r.stk.name)}</td><td>${r.stk.quadrant ? esc(QUAD[r.stk.quadrant]) : '<span class="muted">—</span>'}</td><td>${r.stk.engCurrent !== null || r.stk.engDesired !== null ? esc(levelName(r.stk.engCurrent)) + " → " + esc(levelName(r.stk.engDesired)) : "—"}</td><td>${r.items.length ? r.items.map((c) => esc(c.code)).join(", ") : '<span class="pill st-ambar">ninguna</span>'}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted small">No hay interesados registrados: define quiénes son en Stakeholder Studio para revisar la cobertura.</p>`;
  const icon = { riesgo: "⛔", aviso: "⚠", info: "ℹ" } as const;
  $("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.items.length ? "Sin hallazgos." : "Sin comunicaciones que revisar."}</p>`;
}
function wireMain(): void {
  const m = document.getElementById("matrix");
  const upd = (el: Element): void => {
    const tr = el.closest("tr"), c = tr && byId(tr.getAttribute("data-id") || ""), f = el.getAttribute("data-f") as keyof CommItem | null; if (!c || !f) return;
    if (f === "stkIds") c.stkIds = Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.value);
    else (c as unknown as Record<string, string>)[f] = (el as HTMLInputElement).value;
    refreshMeta(); save();
  };
  if (m) {
    m.addEventListener("input", (e) => { const t = e.target as Element; if (t.tagName !== "SELECT") upd(t); });
    m.addEventListener("change", (e) => upd(e.target as Element));
    m.querySelectorAll<HTMLElement>("[data-del]").forEach((b) => b.addEventListener("click", () => { data.items = data.items.filter((c) => c.id !== b.dataset.del); render(); save(); setStatus("Comunicación eliminada."); }));
  }
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-p]").forEach((t) => t.addEventListener("input", () => { const k = t.dataset.p as string; if (k === "asOf") data.asOf = t.value; else (data.plan as unknown as Record<string, string>)[k] = t.value; refreshMeta(); save(); }));
  const lg = document.getElementById("tblLog");
  if (lg) {
    const updLog = (el: Element): void => { const tr = el.closest("tr"), l = tr && data.log.find((x) => x.id === tr.getAttribute("data-id")), f = el.getAttribute("data-lf"); if (!l || !f) return; (l as unknown as Record<string, string>)[f] = (el as HTMLInputElement).value; refreshMeta(); save(); };
    lg.addEventListener("input", (e) => { const t = e.target as Element; if (t.tagName !== "SELECT") updLog(t); });
    lg.addEventListener("change", (e) => updLog(e.target as Element));
    lg.querySelectorAll<HTMLElement>("[data-dellog]").forEach((b) => b.addEventListener("click", () => { data.log = data.log.filter((l) => l.id !== b.dataset.dellog); render(); save(); setStatus("Registro eliminado."); }));
  }
}

// ---------- acciones ----------
function addItem(): void {
  const id = "cm" + data.idCounter++, c = blankItem(id, nextCode(data.items)); data.items.push(c); render(); save(); setStatus(c.code + " creada: completa qué, para qué, a quién y cada cuánto.");
  const row = document.querySelector(`tr[data-id="${id}"] textarea`) as HTMLElement | null; if (row) row.focus();
}
function addLog(): void {
  const id = "lg" + data.idCounter++, l = normalizeLog({ id, code: nextLogCode(data.log), date: todayLocalISO() }, id); data.log.push(l); render(); save(); setStatus(l.code + " creada: elige la comunicación del plan y registra la evidencia.");
  const row = document.querySelector(`tr[data-id="${id}"] select`) as HTMLElement | null; if (row) row.focus();
}
function exportCsv(): void {
  const f = getCtx().facts, name = (id: string): string => (f.stakeholders.find((s) => s.id === id) || { name: id }).name, q = (v: string): string => '"' + v.replace(/"/g, '""') + '"';
  const lines = [["Código", "Información", "Propósito", "Destinatarios", "Emisor", "Frecuencia", "Medio", "Canal", "Registro"].map(q).join(",")];
  data.items.forEach((c) => lines.push([c.code, c.info, c.purpose, c.stkIds.map(name).concat(c.audience ? [c.audience] : []).join("; "), c.sender, c.frequency, c.method, c.channel, c.storage].map(q).join(",")));
  const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "matriz_de_comunicaciones.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Matriz exportada como CSV.");
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
function wireToolbar(): void {
  $("btnAdd").addEventListener("click", addItem); $("btnAddLog").addEventListener("click", addLog);
  $("btnCsv").addEventListener("click", exportCsv);
  $("btnSample").addEventListener("click", () => {
    showConfirm("Esto reemplazará la matriz actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
      if (!ok) return;
      data = buildSampleComms(); render(); save();
      const C = getCtx(), miss = C.connected ? data.items.flatMap((c) => c.stkIds).filter((i, k, a) => a.indexOf(i) === k && !C.facts.stakeholders.some((s) => s.id === i)) : [];
      setStatus("Caso de ejemplo cargado." + (miss.length ? " Los destinatarios (s1…s12) se enlazan con los interesados del ejemplo de Stakeholder Studio: cárgalo allí (o elige tus interesados) para que coincidan." : ""));
    });
  });
  $("btnClear").addEventListener("click", () => {
    showConfirm("Esto borrará toda la matriz de comunicaciones y las reglas del plan. ¿Continuar?", "Nueva matriz").then((ok) => { if (ok) { data = normalizeComms(null); render(); save(); setStatus("Matriz nueva iniciada."); } });
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
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar la matriz de comunicaciones aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const payload = () => ({ items: data.items, plan: data.plan, idCounter: data.idCounter, log: data.log, asOf: data.asOf });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId(); session = window.GPI!.openSession("comms"); ctxDirty = true;
    const mod = p.modules && (p.modules as Record<string, unknown>).comms;
    if (mod && typeof mod === "object") { data = normalizeComms(mod); window.GPI!.rebaseSession(session, payload()); render(); setStatus("Datos cargados desde el Panel de Control."); }
    else { data = normalizeComms(null); render(); setStatus("Proyecto sin plan de comunicaciones todavía. Agrega la primera comunicación, o usa Cargar ejemplo para explorar el caso DISTRIB+."); }
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "comms", "El plan de comunicaciones", payload(), null, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  saveFn = () => { window.clearTimeout(timer); timer = window.setTimeout(push, 800); return true; };
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  // Los interesados y el OBS los editan otros módulos: se vuelve a leer al volver a esta pestaña o cuando cambian.
  const reread = (): void => { ctxDirty = true; const a = document.activeElement; if (!(a && $("mainArea").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render(); else refreshMeta(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else reread(); });
  window.GPI.onChange(() => { if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; } reread(); });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
})();
function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  installGpiBadge({ name, onSync: pushFn, accent: "#1f63d1", hover: "#3a86ff" });
}

// ---------- init ----------
wireToolbar();
if (!(window.GPI && window.GPI.available() && window.GPI.active())) { data = buildSampleComms(); ctxDirty = true; render(); }   // independiente: el ejemplo
else render();
