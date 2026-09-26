/* =========================================================
   Gestión del Conocimiento — PMBOK (Gestionar el conocimiento del proyecto)
   Módulo NUEVO (no es un port): patrón de Calidad / Comunicaciones — addEventListener, window.GPI explícito, sin frameworks — compilado a
   knowledge.js (IIFE).

   El REGISTRO DE LECCIONES APRENDIDAS: se captura DURANTE la ejecución, se valida y se transfiere. Una lección solo sirve si dice qué pasó, qué se
   aprendió y QUÉ HACER distinto la próxima vez. No duplica: los riesgos que se MATERIALIZARON salen del Registro de Riesgos (cada uno debería dejar
   una lección), los paquetes son los de la EDT y los responsables, puestos del OBS. Lógica PURA en src/shared/knowledge.ts (con sus pruebas); este
   archivo es la interfaz.

   Regla de oro: con un proyecto activo arranca EN BLANCO; el ejemplo DISTRIB+ solo se carga con «Cargar ejemplo» (en modo independiente, sin
   proyecto, se muestra el ejemplo).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import { esc } from "../../shared/html";
import { installGpiBadge } from "../../shared/gpi-badge";
import { todayLocalISO } from "../../shared/local-date";
import type { EditSession } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { gatherKnowledgeFacts } from "../../shared/plan-facts";
import {
  CATEGORIES, KIND_LABEL, LESSON_KINDS, LESSON_STATUSES, STATUS_LABEL, blankKnowledge, knowledgeFindings, knowledgeState, nextCode, normalizeKnowledge, normalizeLesson, summary,
  type KFacts, type KnowledgeData, type KnowledgeState, type Lesson
} from "../../shared/knowledge";
import { buildSampleKnowledge, sampleKnowledgeFacts } from "../../shared/knowledge-sample";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }
const STATE_LABEL: Record<KnowledgeState, string> = { vacio: "Sin datos", verde: "En orden", ambar: "Con avisos", rojo: "Con riesgos" };

// ---------- contexto: Registro de Riesgos, EDT y OBS (solo lectura) ----------
let ctx: { connected: boolean; facts: KFacts } | null = null, ctxDirty = true;
function getCtx(): { connected: boolean; facts: KFacts } {
  if (ctxDirty || !ctx) {
    const G = window.GPI, connected = !!(G && G.available() && G.active());
    let facts: KFacts = { materialized: [], riskCodes: [], leaves: [], roles: [] };
    if (!connected) facts = sampleKnowledgeFacts();
    else if (G && G.util) { try { facts = gatherKnowledgeFacts(G); } catch (e) { /* noop */ } }
    ctx = { connected, facts }; ctxDirty = false;
  }
  return ctx;
}

// ---------- estado ----------
let data: KnowledgeData = blankKnowledge();
const newId = (): string => "ll" + data.idCounter++;

// ---------- render ----------
const enumOpts = (list: readonly string[], labels: Record<string, string>, cur: string): string => list.map((o) => `<option value="${o}"${o === cur ? " selected" : ""}>${esc(labels[o])}</option>`).join("");
const catOpts = (cur: string): string => `<option value=""></option>` + CATEGORIES.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && (CATEGORIES as readonly string[]).indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
function lessonRow(l: Lesson, f: KFacts, flagged: Set<string>): string {
  const leafOpts = `<option value=""></option>` + f.leaves.map((x) => `<option value="${esc(x.id)}"${x.id === l.wbsId ? " selected" : ""}>${esc(x.code)} ${esc(x.name)}</option>`).join("") + (l.wbsId && !f.leaves.some((x) => x.id === l.wbsId) ? `<option value="${esc(l.wbsId)}" selected>(ya no existe)</option>` : "");
  return `<tr data-id="${esc(l.id)}"${flagged.has(l.id) ? ' class="hasf"' : ""}>
    <td style="width:70px"><input data-f="code" value="${esc(l.code)}" aria-label="Código"></td>
    <td style="width:130px"><input data-f="date" type="date" value="${esc(l.date)}" aria-label="Fecha"></td>
    <td style="width:150px"><select data-f="kind" aria-label="Tipo">${enumOpts(LESSON_KINDS, KIND_LABEL, l.kind)}</select><select data-f="category" style="margin-top:3px" aria-label="Categoría">${catOpts(l.category)}</select></td>
    <td style="min-width:150px"><select data-f="wbsId" aria-label="Paquete">${leafOpts}</select><input data-f="riskCode" list="risksList" value="${esc(l.riskCode)}" placeholder="Riesgo (R-03)" style="margin-top:3px" aria-label="Riesgo relacionado"></td>
    <td style="min-width:200px"><textarea data-f="situation" aria-label="Qué pasó">${esc(l.situation)}</textarea></td>
    <td style="min-width:200px"><textarea data-f="lesson" aria-label="Qué se aprendió">${esc(l.lesson)}</textarea></td>
    <td style="min-width:200px"><textarea data-f="recommendation" aria-label="Qué hacer distinto">${esc(l.recommendation)}</textarea></td>
    <td style="min-width:140px"><input data-f="owner" list="rolesList" value="${esc(l.owner)}" aria-label="Responsable"><input data-f="audience" value="${esc(l.audience)}" placeholder="A quién se transfiere" style="margin-top:3px" aria-label="Destinatarios"></td>
    <td style="width:130px"><select data-f="status" aria-label="Estado">${enumOpts(LESSON_STATUSES, STATUS_LABEL, l.status)}</select></td>
    <td><button class="btn sm danger" data-del="${esc(l.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
}
function render(): void {
  const C = getCtx(), f = C.facts, root = $("mainArea"), flagged = new Set(knowledgeFindings(data, f, todayLocalISO()).map((x) => x.lessonId).filter((x): x is string => !!x));
  root.innerHTML = `
    <div class="view-head"><h2>Lecciones aprendidas</h2>
      <p>Cada lección responde: <b>qué pasó</b>, <b>qué se aprendió</b> y <b>qué hacer distinto</b> la próxima vez. Se captura <b>durante</b> la ejecución (no al cierre, cuando ya nadie recuerda por qué pasó), se <b>valida</b> y se <b>transfiere</b> a quien la necesita. Cada riesgo que se materializó debería dejar su lección.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="card"><h3>Registro de lecciones (${data.lessons.length})</h3>
      <div class="fd" style="max-width:260px;margin-bottom:8px"><label for="asOf">Fecha de corte del seguimiento (vacía = hoy)</label><input id="asOf" type="date" value="${esc(data.asOf)}"></div>
      ${data.lessons.length ? `<table class="an" id="tblLessons"><thead><tr><th>Cód.</th><th>Fecha</th><th>Tipo y categoría</th><th>Paquete y riesgo</th><th>Qué pasó</th><th>Qué se aprendió</th><th>Qué hacer distinto</th><th>Responsable y destinatarios</th><th>Estado</th><th></th></tr></thead><tbody>${data.lessons.map((l) => lessonRow(l, f, flagged)).join("")}</tbody></table>
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist><datalist id="risksList">${f.riskCodes.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>`
        : `<div class="empty-hint">Aún no hay lecciones. Agrega la primera con <b>＋ Lección</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
    </div>
    <div class="card"><h3>Riesgos materializados</h3><div id="cover"></div></div>
    <div class="card"><h3>Hallazgos</h3><div id="finds"></div></div>`;
  refreshMeta(); wireMain();
}
// KPIs, riesgos materializados y hallazgos: se actualizan al editar sin volver a dibujar la tabla (no se pierde el foco).
function refreshMeta(): void {
  const C = getCtx(), f = C.facts, today = todayLocalISO(), fs = knowledgeFindings(data, f, today), st = knowledgeState(data, f, today), s = summary(data);
  const cited = new Set(data.lessons.map((l) => l.riskCode.trim().toLowerCase()).filter(Boolean)), sinLeccion = f.materialized.filter((r) => !cited.has(r.code.toLowerCase())).length;
  $("kpis").innerHTML = `<div class="kpi"><b>${s.total}</b><span>Lecciones registradas</span></div>
    <div class="kpi"><b>${s.byStatus.validada + s.byStatus.transferida}/${s.total}</b><span>Validadas o transferidas</span></div>
    <div class="kpi"><b>${s.byStatus.transferida}</b><span>Transferidas</span></div>
    <div class="kpi"><b>${sinLeccion}/${f.materialized.length}</b><span>Riesgos materializados sin lección</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado</span></div>`;
  $("cover").innerHTML = f.materialized.length ? `<table class="an"><thead><tr><th>Riesgo materializado (Registro de Riesgos)</th><th>Lecciones</th></tr></thead><tbody>${f.materialized.map((r) => { const ls = data.lessons.filter((l) => l.riskCode.trim().toLowerCase() === r.code.toLowerCase()); return `<tr><td>${esc(r.code)} ${esc(r.title)}</td><td>${ls.length ? ls.map((l) => esc(l.code)).join(", ") : '<span class="pill st-ambar">ninguna</span>'}</td></tr>`; }).join("")}</tbody></table>`
    : `<p class="muted small">Ningún riesgo del Registro se ha materializado (o no hay Registro de Riesgos).</p>`;
  const icon = { riesgo: "⛔", aviso: "⚠", info: "ℹ" } as const;
  $("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.lessons.length ? "Sin hallazgos." : "Sin lecciones que revisar."}</p>`;
}
function wireMain(): void {
  const asOf = document.getElementById("asOf") as HTMLInputElement | null;
  if (asOf) asOf.addEventListener("change", () => { data.asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOf.value) ? asOf.value : ""; refreshMeta(); save(); });
  const t = document.getElementById("tblLessons"); if (!t) return;
  const upd = (el: Element): void => {
    const tr = el.closest("tr"), l = tr && data.lessons.find((x) => x.id === tr.getAttribute("data-id")), fld = el.getAttribute("data-f"); if (!l || !fld) return;
    (l as unknown as Record<string, string>)[fld] = (el as HTMLInputElement).value; refreshMeta(); save();
  };
  t.addEventListener("input", (e) => { const x = e.target as Element; if (x.tagName !== "SELECT") upd(x); });
  t.addEventListener("change", (e) => upd(e.target as Element));
  t.querySelectorAll<HTMLElement>("[data-del]").forEach((b) => b.addEventListener("click", () => { data.lessons = data.lessons.filter((x) => x.id !== b.dataset.del); render(); save(); setStatus("Lección eliminada."); }));
}

// ---------- acciones ----------
function addLesson(): void {
  const id = newId(), l = normalizeLesson({ id, code: nextCode(data.lessons), date: todayLocalISO() }, id); data.lessons.push(l); render(); save(); setStatus(l.code + " creada: cuenta qué pasó, qué se aprendió y qué hacer distinto.");
  const el = document.querySelector(`tr[data-id="${id}"] textarea`) as HTMLElement | null; if (el) el.focus();
}
function exportCsv(): void {
  const f = getCtx().facts, leaf = (id: string): string => { const l = f.leaves.find((x) => x.id === id); return l ? l.code + " " + l.name : ""; }, q = (v: string): string => '"' + v.replace(/"/g, '""') + '"';
  const lines = [["Código", "Fecha", "Tipo", "Categoría", "Paquete", "Riesgo", "Qué pasó", "Qué se aprendió", "Qué hacer distinto", "Responsable", "Destinatarios", "Estado"].map(q).join(",")];
  data.lessons.forEach((l) => lines.push([l.code, l.date, KIND_LABEL[l.kind], l.category, leaf(l.wbsId), l.riskCode, l.situation, l.lesson, l.recommendation, l.owner, l.audience, STATUS_LABEL[l.status]].map(q).join(",")));
  const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "lecciones_aprendidas.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Lecciones exportadas como CSV.");
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
// Con un proyecto conectado el ejemplo se enlaza por código EDT (1.1…5.3): lo que no existe queda sin paquete. Los riesgos se citan por su código (R-03…).
function sampleForProject(): KnowledgeData {
  const C = getCtx(); if (!C.connected) return buildSampleKnowledge();
  const leaf = new Map(C.facts.leaves.map((l) => [l.code, l.id] as const));
  return buildSampleKnowledge((c) => leaf.get(c) || "");
}
function wireToolbar(): void {
  $("btnAdd").addEventListener("click", addLesson); $("btnCsv").addEventListener("click", exportCsv);
  $("btnSample").addEventListener("click", () => {
    showConfirm("Esto reemplazará el registro actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
      if (!ok) return;
      ctxDirty = true; data = sampleForProject(); render(); save();
      const C = getCtx(), miss = C.connected ? data.lessons.filter((l) => l.riskCode && !C.facts.riskCodes.some((c) => c.toLowerCase() === l.riskCode.toLowerCase())).length : 0;
      setStatus("Caso de ejemplo cargado." + (miss ? " " + miss + " lección(es) citan riesgos (R-01…R-09) que no están en el Registro de Riesgos del proyecto: carga el ejemplo en Gestión de Riesgos para que coincidan." : ""));
    });
  });
  $("btnClear").addEventListener("click", () => {
    showConfirm("Esto borrará todas las lecciones. ¿Continuar?", "Nuevo registro").then((ok) => { if (ok) { data = blankKnowledge(); render(); save(); setStatus("Registro nuevo iniciado."); } });
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
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar las lecciones aprendidas aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const payload = () => ({ lessons: data.lessons, asOf: data.asOf, idCounter: data.idCounter });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId(); session = window.GPI!.openSession("knowledge"); ctxDirty = true;
    const mod = p.modules && (p.modules as Record<string, unknown>).knowledge;
    if (mod && typeof mod === "object") { data = normalizeKnowledge(mod); window.GPI!.rebaseSession(session, payload()); render(); setStatus("Datos cargados desde el Panel de Control."); }
    else { data = blankKnowledge(); render(); setStatus("Proyecto sin lecciones todavía. Agrega la primera, o usa Cargar ejemplo para explorar el caso DISTRIB+."); }
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "knowledge", "Las lecciones aprendidas", payload(), null, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  saveFn = () => { window.clearTimeout(timer); timer = window.setTimeout(push, 800); return true; };
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  // El Registro de Riesgos, la EDT y el OBS los editan otros módulos: se vuelve a leer al volver o cuando cambian.
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
if (!(window.GPI && window.GPI.available() && window.GPI.active())) { data = buildSampleKnowledge(); ctxDirty = true; render(); }   // independiente: el ejemplo
else render();
