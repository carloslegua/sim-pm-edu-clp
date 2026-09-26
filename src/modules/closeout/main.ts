/* =========================================================
   Cierre del Proyecto o Fase — PMBOK (Cerrar el proyecto o fase)
   Módulo NUEVO (no es un port): patrón de Calidad / Comunicaciones — addEventListener, window.GPI explícito, sin frameworks — compilado a
   closeout.js (IIFE).

   La puerta de SALIDA: cerrar no es un botón, es comprobar que todo lo prometido está hecho, aceptado, pagado, liberado y aprendido, y dejar quién
   lo aprueba. No captura de nuevo lo que ya viven en otras herramientas: LEE el estado de cada frente (entregables aceptados, no conformidades,
   contratos y reclamos, lecciones transferidas, cambios abiertos, costo final contra el presupuesto) y suma una lista de verificación propia y el
   registro de la aprobación del cierre. Se puede DECLARAR el cierre con pendientes, pero queda escrito como riesgo. Lógica PURA en
   src/shared/closeout.ts (con sus pruebas); este archivo es la interfaz.

   Regla de oro: con un proyecto activo arranca EN BLANCO; el ejemplo DISTRIB+ solo se carga con «Cargar ejemplo» (en modo independiente, sin
   proyecto, se muestra el ejemplo).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import { esc } from "../../shared/html";
import { installGpiBadge } from "../../shared/gpi-badge";
import { todayLocalISO } from "../../shared/local-date";
import type { EditSession } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { gatherCloseFacts } from "../../shared/plan-facts";
import {
  AREAS, ITEM_LABEL, ITEM_STATUSES, KINDS, autoChecks, blankCloseout, closeState, closeoutFindings, emptyFacts, nextCode, normalizeCloseout, normalizeItem,
  type CloseFacts, type CloseItem, type CloseState, type CloseoutData
} from "../../shared/closeout";
import { buildSampleCloseout, sampleCloseFacts } from "../../shared/closeout-sample";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }
const STATE_LABEL: Record<CloseState, string> = { vacio: "Sin datos", verde: "En orden", ambar: "Con avisos", rojo: "Con riesgos" };

// ---------- contexto: el estado de cada frente, leído de su módulo (solo lectura) ----------
let ctx: { connected: boolean; facts: CloseFacts } | null = null, ctxDirty = true;
function getCtx(): { connected: boolean; facts: CloseFacts } {
  if (ctxDirty || !ctx) {
    const G = window.GPI, connected = !!(G && G.available() && G.active());
    let facts: CloseFacts = emptyFacts();
    if (!connected) facts = sampleCloseFacts();
    else if (G && G.util) { try { facts = gatherCloseFacts(G); } catch (e) { /* noop */ } }
    ctx = { connected, facts }; ctxDirty = false;
  }
  return ctx;
}

// ---------- estado ----------
let data: CloseoutData = blankCloseout();
const newId = (): string => "ci" + data.idCounter++;

// ---------- render ----------
const enumOpts = (list: readonly string[], labels: Record<string, string>, cur: string): string => list.map((o) => `<option value="${o}"${o === cur ? " selected" : ""}>${esc(labels[o])}</option>`).join("");
const areaOpts = (cur: string): string => `<option value=""></option>` + AREAS.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && (AREAS as readonly string[]).indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
function itemRow(i: CloseItem, flagged: Set<string>): string {
  return `<tr data-id="${esc(i.id)}"${flagged.has(i.id) ? ' class="hasf"' : ""}>
    <td style="width:70px"><input data-f="code" value="${esc(i.code)}" aria-label="Código"></td>
    <td style="width:130px"><select data-f="area" aria-label="Área">${areaOpts(i.area)}</select></td>
    <td style="min-width:240px"><textarea data-f="what" aria-label="Qué hay que cerrar">${esc(i.what)}</textarea></td>
    <td style="min-width:150px"><input data-f="owner" list="rolesList" value="${esc(i.owner)}" aria-label="Responsable"></td>
    <td style="width:130px"><input data-f="dueDate" type="date" value="${esc(i.dueDate)}" aria-label="Fecha límite"></td>
    <td style="width:130px"><select data-f="status" aria-label="Estado">${enumOpts(ITEM_STATUSES, ITEM_LABEL, i.status)}</select><input data-f="doneOn" type="date" value="${esc(i.doneOn)}" style="margin-top:3px" aria-label="Hecho el"></td>
    <td style="min-width:170px"><input data-f="evidence" value="${esc(i.evidence)}" aria-label="Evidencia"></td>
    <td><button class="btn sm danger" data-del="${esc(i.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
}
function render(): void {
  const C = getCtx(), f = C.facts, root = $("mainArea"), flagged = new Set(closeoutFindings(data, f, todayLocalISO()).map((x) => x.itemId).filter((x): x is string => !!x)), cl = data.closure;
  root.innerHTML = `
    <div class="view-head"><h2>Cierre del proyecto o fase</h2>
      <p>Cerrar no es un botón: es comprobar que todo lo prometido está <b>hecho, aceptado, pagado, liberado y aprendido</b>, y dejar quién lo aprueba. Las comprobaciones de abajo se <b>leen de las demás herramientas</b>; la lista de verificación y la aprobación son de este módulo. Puedes declarar el cierre con pendientes, pero queda escrito como riesgo: un cierre con deuda.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="grid2">
      <div class="card fd"><h3>Qué se cierra</h3><label for="kind">Tipo de cierre</label><select id="kind" data-h="kind">${enumOpts(KINDS, { proyecto: "Proyecto completo", fase: "Una fase del proyecto" }, data.kind)}</select>
        <label for="phase" style="margin-top:6px">Fase (si se cierra una fase)</label><input id="phase" data-h="phase" value="${esc(data.phase)}"></div>
      <div class="card fd"><h3>Fecha de corte</h3><label for="asOf">Contra ella se juzgan los plazos (vacía = hoy)</label><input id="asOf" type="date" data-h="asOf" value="${esc(data.asOf)}"></div>
      <div class="card fd"><h3>Costo final</h3><label for="finalCost">Costo total ejecutado (se compara con el presupuesto vigente)</label><input id="finalCost" type="number" min="0" step="any" data-c="finalCost" value="${cl.finalCost === null ? "" : cl.finalCost}"></div>
    </div>
    <div class="card"><h3>Comprobaciones automáticas (lo que dicen las demás herramientas)</h3><div id="checks"></div></div>
    <div class="card"><h3>Lista de verificación del cierre (${data.items.length})</h3>
      ${data.items.length ? `<table class="an" id="tblItems"><thead><tr><th>Cód.</th><th>Área</th><th>Qué hay que cerrar</th><th>Responsable</th><th>Fecha límite</th><th>Estado</th><th>Evidencia</th><th></th></tr></thead><tbody>${data.items.map((i) => itemRow(i, flagged)).join("")}</tbody></table>
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>`
        : `<div class="empty-hint">Aún no hay ítems. Agrega el primero con <b>＋ Ítem de cierre</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
    </div>
    <div class="card"><h3>Aprobación del cierre</h3>
      <label class="rng-chk" style="display:flex;gap:8px;align-items:center;font-weight:700;margin-bottom:8px"><input type="checkbox" id="closed" data-c="closed"${cl.closed ? " checked" : ""} style="width:auto"> Se declara el cierre</label>
      <div class="grid2">
        <div class="fd"><label for="closedOn">Fecha del cierre</label><input id="closedOn" type="date" data-c="closedOn" value="${esc(cl.closedOn)}"></div>
        <div class="fd"><label for="approvedBy">Aprobado por</label><input id="approvedBy" list="rolesList" data-c="approvedBy" value="${esc(cl.approvedBy)}"></div>
        <div class="fd"><label for="outcome">Resultado frente a los objetivos y criterios de éxito del Acta</label><textarea id="outcome" data-c="outcome">${esc(cl.outcome)}</textarea></div>
      </div>
      <div class="fd" style="margin-top:8px"><label for="report">Informe final (resultados, costo final, entrega, pendientes aceptados)</label><textarea id="report" data-c="report">${esc(cl.report)}</textarea></div></div>
    <div class="card"><h3>Hallazgos</h3><div id="finds"></div></div>`;
  refreshMeta(); wireMain();
}
// KPIs, comprobaciones y hallazgos: se actualizan al editar sin volver a dibujar las tablas (no se pierde el foco).
function refreshMeta(): void {
  const C = getCtx(), f = C.facts, today = todayLocalISO(), fs = closeoutFindings(data, f, today), st = closeState(data, f, today), ck = autoChecks(data, f);
  const ok = ck.filter((c) => c.ok === true).length, pend = ck.filter((c) => c.ok === false).length, done = data.items.filter((i) => i.status !== "pendiente").length;
  $("kpis").innerHTML = `<div class="kpi"><b>${ok}/${ck.length}</b><span>Comprobaciones que cumplen</span></div>
    <div class="kpi"><b>${pend}</b><span>Frentes que impiden cerrar</span></div>
    <div class="kpi"><b>${done}/${data.items.length}</b><span>Ítems de la lista resueltos</span></div>
    <div class="kpi"><b>${data.closure.closed ? "Declarado" : "Abierto"}</b><span>${data.kind === "fase" ? "Cierre de fase" : "Cierre del proyecto"}</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado</span></div>`;
  $("checks").innerHTML = `<table class="an"><thead><tr><th>Comprobación</th><th>Resultado</th><th>Estado</th><th>Módulo</th></tr></thead><tbody>${ck.map((c) => `<tr><td>${esc(c.label)}</td><td class="small">${esc(c.detail)}</td><td>${c.ok === null ? '<span class="pill st-vacio">sin datos</span>' : c.ok ? '<span class="pill st-verde">cumple</span>' : '<span class="pill st-ambar">falta</span>'}</td><td>${c.file ? `<a href="${esc(c.file)}">Abrir</a>` : '<span class="muted">—</span>'}</td></tr>`).join("")}</tbody></table>`;
  const icon = { riesgo: "⛔", aviso: "⚠", info: "ℹ" } as const;
  $("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.items.length || data.closure.closed ? "Sin hallazgos." : "Sin nada que revisar todavía."}</p>`;
}
function wireMain(): void {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-h]").forEach((el) => {
    const h = el.getAttribute("data-h") as string, ev = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(ev, () => { if (h === "kind") data.kind = el.value === "fase" ? "fase" : "proyecto"; else if (h === "phase") data.phase = el.value; else data.asOf = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : ""; refreshMeta(); save(); });
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-c]").forEach((el) => {
    const k = el.getAttribute("data-c") as string;
    el.addEventListener(k === "closed" ? "change" : "input", () => {
      const c = data.closure as unknown as Record<string, unknown>;
      if (k === "closed") c.closed = (el as HTMLInputElement).checked; else if (k === "finalCost") c.finalCost = el.value === "" || !isFinite(Number(el.value)) ? null : Number(el.value); else c[k] = el.value;
      refreshMeta(); save();
    });
  });
  const t = document.getElementById("tblItems"); if (!t) return;
  const upd = (el: Element): void => {
    const tr = el.closest("tr"), i = tr && data.items.find((x) => x.id === tr.getAttribute("data-id")), fld = el.getAttribute("data-f"); if (!i || !fld) return;
    (i as unknown as Record<string, string>)[fld] = (el as HTMLInputElement).value; refreshMeta(); save();
  };
  t.addEventListener("input", (e) => { const x = e.target as Element; if (x.tagName !== "SELECT") upd(x); });
  t.addEventListener("change", (e) => upd(e.target as Element));
  t.querySelectorAll<HTMLElement>("[data-del]").forEach((b) => b.addEventListener("click", () => { data.items = data.items.filter((x) => x.id !== b.dataset.del); render(); save(); setStatus("Ítem eliminado."); }));
}

// ---------- acciones ----------
function addItem(): void {
  const id = newId(), i = normalizeItem({ id, code: nextCode(data.items), status: "pendiente" }, id); data.items.push(i); render(); save(); setStatus(i.code + " creado: di qué hay que cerrar, quién y para cuándo.");
  const el = document.querySelector(`tr[data-id="${id}"] textarea`) as HTMLElement | null; if (el) el.focus();
}
function exportCsv(): void {
  const q = (v: string): string => '"' + v.replace(/"/g, '""') + '"';
  const lines = [["Código", "Área", "Qué hay que cerrar", "Responsable", "Fecha límite", "Estado", "Hecho el", "Evidencia"].map(q).join(",")];
  data.items.forEach((i) => lines.push([i.code, i.area, i.what, i.owner, i.dueDate, ITEM_LABEL[i.status], i.doneOn, i.evidence].map(q).join(",")));
  const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "lista_de_cierre.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Lista de cierre exportada como CSV.");
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
  $("btnAdd").addEventListener("click", addItem); $("btnCsv").addEventListener("click", exportCsv);
  $("btnSample").addEventListener("click", () => {
    showConfirm("Esto reemplazará el cierre actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => { if (!ok) return; ctxDirty = true; data = buildSampleCloseout(); render(); save(); setStatus("Caso de ejemplo cargado: el cierre está preparado, no declarado."); });
  });
  $("btnClear").addEventListener("click", () => {
    showConfirm("Esto borrará la lista de verificación y la aprobación del cierre. ¿Continuar?", "Nuevo cierre").then((ok) => { if (ok) { data = blankCloseout(); render(); save(); setStatus("Cierre nuevo iniciado."); } });
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
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el cierre aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const payload = () => ({ kind: data.kind, phase: data.phase, items: data.items, closure: data.closure, asOf: data.asOf, idCounter: data.idCounter });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId(); session = window.GPI!.openSession("closeout"); ctxDirty = true;
    const mod = p.modules && (p.modules as Record<string, unknown>).closeout;
    if (mod && typeof mod === "object") { data = normalizeCloseout(mod); window.GPI!.rebaseSession(session, payload()); render(); setStatus("Datos cargados desde el Panel de Control."); }
    else { data = blankCloseout(); render(); setStatus("Proyecto sin cierre todavía. Agrega el primer ítem, o usa Cargar ejemplo para explorar el caso DISTRIB+."); }
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "closeout", "El cierre del proyecto", payload(), null, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  saveFn = () => { window.clearTimeout(timer); timer = window.setTimeout(push, 800); return true; };
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  // Todos los demás módulos alimentan las comprobaciones: se vuelve a leer al volver o cuando cambian.
  const reread = (): void => { ctxDirty = true; const a = document.activeElement; if (!(a && $("mainArea").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render(); else refreshMeta(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else reread(); });
  window.GPI.onChange(() => { if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; } reread(); });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
})();
function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  installGpiBadge({ name, onSync: pushFn, accent: "#00705f", hover: "#00967f" });
}

// ---------- init ----------
wireToolbar();
if (!(window.GPI && window.GPI.available() && window.GPI.active())) { data = buildSampleCloseout(); ctxDirty = true; render(); }   // independiente: el ejemplo
else render();
