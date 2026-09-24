/* =========================================================
   Plan de Gestión de las Adquisiciones — PMBOK (Planificar la gestión de las adquisiciones)
   Módulo NUEVO (no es un port): patrón de Control de Cambios / Comunicaciones / Calidad — addEventListener, window.GPI explícito, sin
   frameworks — compilado a procurement.js (IIFE).

   La ESTRATEGIA (cómo se contrata y cómo se mide al proveedor) y una ficha por PAQUETE DE ADQUISICIÓN: paquetes de la EDT que cubre, hacer o
   comprar, tipo de contrato, método de selección con criterios ponderados, valor, fecha requerida, plazos, proveedor, estado y riesgos que el
   contrato trata. Calcula la FECHA LÍMITE DE CONVOCATORIA (necesidad − plazo del proveedor − tiempo de selección) y la contrasta con la fecha
   de corte del plan. No duplica: los paquetes y su costo salen de la EDT, los riesgos del Registro, los responsables del OBS y la clase del
   estimado de Costos. Lógica PURA en src/shared/procurement-plan.ts (con sus pruebas); este archivo es la interfaz.

   Regla de oro: con un proyecto activo arranca EN BLANCO; el ejemplo DISTRIB+ solo se carga con «Cargar ejemplo» (en modo
   independiente, sin proyecto, se muestra el ejemplo).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { EditSession } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { gatherProcurementFacts } from "../../shared/plan-facts";
import {
  CONTRACT_TYPES, DECISIONS, SELECTION_METHODS, STATUSES, WARN_DAYS, blankProcurement, criteriaSum, daysBetween, isBuy, launchBy, nextCode, normalizeItem, normalizeProcurement, procurementFindings, procurementState, summary,
  type ProcData, type ProcFacts, type ProcItem, type ProcState
} from "../../shared/procurement-plan";
import { buildSampleProcurement, sampleProcurementFacts } from "../../shared/procurement-sample";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }
const todayISO = (): string => new Date().toISOString().slice(0, 10);
const CUR: Record<string, string> = { USD: "$", PEN: "S/", EUR: "€" };
const STATE_LABEL: Record<ProcState, string> = { vacio: "Sin datos", verde: "En orden", ambar: "Con avisos", rojo: "Con riesgos" };

// ---------- contexto: EDT, OBS, riesgos y costos (solo lectura) ----------
let ctx: { connected: boolean; facts: ProcFacts; sym: string } | null = null, ctxDirty = true;
function getCtx(): { connected: boolean; facts: ProcFacts; sym: string } {
  if (ctxDirty || !ctx) {
    const G = window.GPI, connected = !!(G && G.available() && G.active());
    let facts: ProcFacts = { leaves: [], roles: [], risks: [], suppliers: [], estimateClass: null, baseCost: null }, sym = "$";
    if (!connected) facts = sampleProcurementFacts();
    else if (G && G.util) {
      try { const m = G.meta(); sym = CUR[(m && m.currency) || ""] || "$"; facts = gatherProcurementFacts(G); } catch (e) { /* noop */ }
    }
    ctx = { connected, facts, sym }; ctxDirty = false;
  }
  return ctx;
}
const money = (n: number | null | undefined): string => (n == null || !isFinite(n) ? "—" : getCtx().sym + " " + Math.round(n).toLocaleString("es-PE"));

// ---------- estado ----------
let data: ProcData = blankProcurement(todayISO());
const openSet = new Set<string>();
const newId = (): string => "pr" + data.idCounter++;
const byId = (id: string | null): ProcItem | undefined => data.items.find((x) => x.id === id);

// ---------- render ----------
const opts = (list: readonly string[], cur: string): string => `<option value=""></option>` + list.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && list.indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
const fld = (label: string, inner: string, cls = ""): string => `<div class="fd ${cls}"><label>${label}</label>${inner}</div>`;
function summaryHtml(it: ProcItem): string {
  const lb = launchBy(it), left = lb ? daysBetween(data.asOf, lb) : null, buy = isBuy(it);
  const pill = !buy ? '<span class="pill st-vacio">hacer</span>' : lb === null ? '<span class="pill st-ambar">sin fecha límite</span>'
    : it.status !== "Planificada" ? '<span class="pill st-vacio">en curso</span>'
      : left !== null && left < 0 ? `<span class="pill st-rojo">convocar YA · venció ${esc(lb)}</span>` : left !== null && left <= WARN_DAYS ? `<span class="pill st-ambar">convocar antes del ${esc(lb)}</span>` : `<span class="pill st-verde">convocar antes del ${esc(lb)}</span>`;
  return `<b class="mono">${esc(it.code)}</b><span>${esc(it.name) || '<span class="muted">(sin nombre)</span>'}</span><span class="muted small">${esc(it.contractType)}</span><span class="pill st-vacio">${esc(it.status)}</span>${pill}<span class="mono">${it.value === null ? "—" : money(it.value)}</span>`;
}
function itemHtml(it: ProcItem, f: ProcFacts, flagged: Set<string>): string {
  const buy = isBuy(it), sum = criteriaSum(it);
  const leafOpts = f.leaves.map((l) => `<option value="${esc(l.id)}"${it.wbsIds.indexOf(l.id) >= 0 ? " selected" : ""}>${esc(l.code)} ${esc(l.name)} (${money(l.cost)})</option>`).join("");
  const riskOpts = f.risks.map((r) => `<option value="${esc(r.id)}"${it.riskIds.indexOf(r.id) >= 0 ? " selected" : ""}>${esc(r.code)} ${esc(r.title)}${r.high ? " ⚠" : ""}</option>`).join("");
  return `<details class="pr${flagged.has(it.id) ? " hasf" : ""}" data-id="${esc(it.id)}"${openSet.has(it.id) ? " open" : ""}><summary>${summaryHtml(it)}</summary><div class="body">
    <div class="form">
      ${fld("Código", `<input data-f="code" value="${esc(it.code)}">`)}${fld("Adquisición", `<input data-f="name" value="${esc(it.name)}">`, "w2")}${fld("Decisión", `<select data-f="decision">${opts(DECISIONS, it.decision)}</select>`)}
      ${fld("Paquetes de la EDT que cubre", `<select data-f="wbsIds" multiple>${leafOpts}</select>`, "w2")}
      ${fld("Cobertura", `<label style="font-weight:600;display:flex;gap:6px;align-items:center"><input type="checkbox" data-f="full"${it.full ? " checked" : ""} style="width:auto"> Cubre todo el costo de esos paquetes</label>`)}
      ${fld("Responsable", `<input data-f="owner" list="rolesList" value="${esc(it.owner)}">`)}
      ${buy ? `${fld("Tipo de contrato", `<select data-f="contractType">${opts(CONTRACT_TYPES, it.contractType)}</select>`, "w2")}${fld("Método de selección", `<select data-f="selection">${opts(SELECTION_METHODS, it.selection)}</select>`, "w2")}
      ${fld("Valor estimado", `<input data-f="value" type="number" min="0" step="any" value="${it.value === null ? "" : it.value}">`)}
      ${fld("Fecha requerida (en obra)", `<input data-f="needDate" type="date" value="${esc(it.needDate)}">`)}
      ${fld("Plazo del proveedor (días)", `<input data-f="leadDays" type="number" min="0" step="1" value="${it.leadDays === null ? "" : it.leadDays}">`)}
      ${fld("Tiempo de selección (días)", `<input data-f="selectionDays" type="number" min="0" step="1" value="${it.selectionDays === null ? "" : it.selectionDays}">`)}
      ${fld("Estado", `<select data-f="status">${STATUSES.map((s) => `<option${s === it.status ? " selected" : ""}>${s}</option>`).join("")}</select>`)}
      ${fld("Proveedor", `<input data-f="supplier" list="suppliersList" value="${esc(it.supplier)}">`)}
      ${fld("Fecha de adjudicación", `<input data-f="awardDate" type="date" value="${esc(it.awardDate)}">`)}
      ${fld("Riesgos que el contrato trata (⚠ = alto)", `<select data-f="riskIds" multiple>${riskOpts}</select>`)}
      <div class="fd w4"><label>Criterios de selección (deben sumar 100) — <span class="mono" data-sum="${esc(it.id)}">${Math.round(sum * 100) / 100}</span></label>
        ${it.criteria.map((c, i) => `<div class="crit"><input data-c="${i}" data-cf="name" value="${esc(c.name)}" placeholder="Criterio" aria-label="Criterio"><input data-c="${i}" data-cf="weight" type="number" min="0" max="100" step="any" value="${c.weight === null ? "" : c.weight}" placeholder="Peso" aria-label="Peso"><button class="btn sm danger" data-delcrit="${i}" aria-label="Quitar criterio">✕</button></div>`).join("")}
        <div><button class="btn sm" data-addcrit="1">＋ Criterio</button></div></div>` : ""}
      ${fld("Notas (justificación, condiciones especiales)", `<textarea data-f="notes">${esc(it.notes)}</textarea>`, "w4")}
    </div>
    <div style="margin-top:10px"><button class="btn sm danger" data-del="${esc(it.id)}">Eliminar esta adquisición</button></div></div></details>`;
}
function render(): void {
  const C = getCtx(), f = C.facts, root = $("mainArea"), fs = procurementFindings(data, f), flagged = new Set(fs.map((x) => x.itemId).filter((x): x is string => !!x));
  ($("asOf") as HTMLInputElement).value = data.asOf;
  root.innerHTML = `
    <div class="view-head"><h2>Plan de adquisiciones</h2>
      <p>Cada ficha responde: <b>qué</b> se compra (paquetes de la EDT), <b>hacer o comprar</b>, con <b>qué contrato</b> y <b>cómo se elige</b> al proveedor, y <b>cuándo hay que convocar</b>: fecha requerida − plazo del proveedor − tiempo de selección. Si esa fecha ya pasó respecto de la fecha de corte y la adquisición sigue «Planificada», el cronograma no se sostiene.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="grid3">
      <div class="card fd"><h3>Estrategia de adquisiciones</h3><label for="strategy">Qué se compra, qué se hace y cómo se contrata</label><textarea id="strategy" data-p="strategy">${esc(data.strategy)}</textarea></div>
      <div class="card fd"><h3>Desempeño de proveedores</h3><label for="performance">Cómo se mide y se gestiona</label><textarea id="performance" data-p="performance">${esc(data.performance)}</textarea></div>
      <div class="card fd"><h3>Autorizaciones</h3><label for="approvals">Quién autoriza contratar y hasta qué monto</label><textarea id="approvals" data-p="approvals">${esc(data.approvals)}</textarea></div>
    </div>
    <div id="items">${data.items.length ? data.items.map((it) => itemHtml(it, f, flagged)).join("") : `<div class="empty-hint">Aún no hay adquisiciones. Agrega la primera con <b>＋ Nueva adquisición</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}</div>
    <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist><datalist id="suppliersList">${f.suppliers.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>
    <div class="card"><h3>Hallazgos del plan</h3><div id="finds"></div></div>`;
  refreshMeta(); wireMain();
}
// KPIs, resúmenes de las fichas y hallazgos: se actualizan al editar sin volver a dibujar las fichas (no se pierde el foco).
function refreshMeta(): void {
  const C = getCtx(), f = C.facts, s = summary(data, f), fs = procurementFindings(data, f), st = procurementState(data, f);
  $("kpis").innerHTML = `<div class="kpi"><b>${s.count}</b><span>Adquisiciones planificadas</span></div>
    <div class="kpi"><b>${money(s.total)}</b><span>Valor estimado${s.pctOfBase !== null ? " · " + s.pctOfBase.toFixed(0) + " % del costo base" : ""}</span></div>
    <div class="kpi"><b>${s.late} / ${s.soon}</b><span>Convocatorias vencidas / próximas (≤ ${WARN_DAYS} d)</span></div>
    <div class="kpi"><b>${s.byStatus.Contratada + s.byStatus.Entregada}/${s.count}</b><span>Contratadas o entregadas</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado del plan</span></div>`;
  data.items.forEach((it) => {
    const d = document.querySelector(`details.pr[data-id="${it.id}"]`); if (!d) return;
    const sm = d.querySelector("summary"); if (sm) sm.innerHTML = summaryHtml(it);
    d.classList.toggle("hasf", fs.some((x) => x.itemId === it.id));
    const sum = d.querySelector(`[data-sum="${it.id}"]`); if (sum) sum.textContent = String(Math.round(criteriaSum(it) * 100) / 100);
  });
  const icon = { riesgo: "⛔", aviso: "⚠", info: "ℹ" } as const;
  $("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.items.length ? "Sin hallazgos." : "Sin adquisiciones que revisar."}</p>`;
}
function wireMain(): void {
  const items = document.getElementById("items"); if (!items) return;
  document.querySelectorAll<HTMLDetailsElement>("details.pr").forEach((d) => d.addEventListener("toggle", () => { const id = d.dataset.id as string; if (d.open) openSet.add(id); else openSet.delete(id); }));
  const upd = (el: Element): void => {
    const d = el.closest("details.pr"), it = d && byId(d.getAttribute("data-id")); if (!it) return;
    const f = el.getAttribute("data-f"), ci = el.getAttribute("data-c");
    if (ci !== null) { const c = it.criteria[Number(ci)]; if (!c) return; const v = (el as HTMLInputElement).value; if (el.getAttribute("data-cf") === "name") c.name = v; else c.weight = v === "" || !isFinite(Number(v)) ? null : Number(v); }
    else if (f === "wbsIds" || f === "riskIds") (it as unknown as Record<string, string[]>)[f] = Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.value);
    else if (f === "full") it.full = (el as HTMLInputElement).checked;
    else if (f === "value" || f === "leadDays" || f === "selectionDays") { const v = (el as HTMLInputElement).value; (it as unknown as Record<string, number | null>)[f] = v === "" || !isFinite(Number(v)) ? null : Number(v); }
    else if (f) (it as unknown as Record<string, string>)[f] = (el as HTMLInputElement).value;
    else return;
    if (f === "decision") { render(); } else refreshMeta();
    save();
  };
  items.addEventListener("input", (e) => { const t = e.target as Element; if (t.tagName !== "SELECT" && (t as HTMLInputElement).type !== "checkbox") upd(t); });
  items.addEventListener("change", (e) => upd(e.target as Element));
  items.querySelectorAll<HTMLElement>("[data-del]").forEach((b) => b.addEventListener("click", () => { data.items = data.items.filter((x) => x.id !== b.dataset.del); render(); save(); setStatus("Adquisición eliminada."); }));
  items.querySelectorAll<HTMLElement>("[data-addcrit]").forEach((b) => b.addEventListener("click", () => { const it = byId((b.closest("details.pr") as HTMLElement).dataset.id || null); if (!it) return; it.criteria.push({ name: "", weight: null }); render(); save(); }));
  items.querySelectorAll<HTMLElement>("[data-delcrit]").forEach((b) => b.addEventListener("click", () => { const it = byId((b.closest("details.pr") as HTMLElement).dataset.id || null); if (!it) return; it.criteria.splice(Number(b.dataset.delcrit), 1); render(); save(); }));
  document.querySelectorAll<HTMLTextAreaElement>("[data-p]").forEach((t) => t.addEventListener("input", () => { (data as unknown as Record<string, string>)[t.dataset.p as string] = t.value; refreshMeta(); save(); }));
}

// ---------- acciones ----------
function addItem(): void {
  const id = newId(), it = normalizeItem({ id, code: nextCode(data.items), decision: "Comprar", status: "Planificada" }, id); data.items.push(it); openSet.add(id); render(); save(); setStatus(it.code + " creada: completa qué cubre, el contrato y las fechas.");
  const el = document.querySelector(`details.pr[data-id="${id}"] [data-f="name"]`) as HTMLElement | null; if (el) el.focus();
}
function exportCsv(): void {
  const f = getCtx().facts, leaf = (id: string): string => { const l = f.leaves.find((x) => x.id === id); return l ? l.code : ""; }, q = (v: string): string => '"' + v.replace(/"/g, '""') + '"';
  const lines = [["Código", "Adquisición", "Paquetes EDT", "Decisión", "Contrato", "Selección", "Valor", "Fecha requerida", "Plazo proveedor (d)", "Selección (d)", "Convocar antes del", "Proveedor", "Estado", "Responsable"].map(q).join(",")];
  data.items.forEach((it) => lines.push([it.code, it.name, it.wbsIds.map(leaf).join("; "), it.decision, it.contractType, it.selection, it.value === null ? "" : String(it.value), it.needDate, it.leadDays === null ? "" : String(it.leadDays), it.selectionDays === null ? "" : String(it.selectionDays), launchBy(it) || "", it.supplier, it.status, it.owner].map(q).join(",")));
  const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "plan_de_adquisiciones.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Plan exportado como CSV.");
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
// Con un proyecto conectado el ejemplo se enlaza por código EDT (1.1…5.3) y por código de riesgo (R-02…): lo que no existe queda sin enlazar.
function sampleForProject(): ProcData {
  const C = getCtx(); if (!C.connected) return buildSampleProcurement();
  const leaf = new Map(C.facts.leaves.map((l) => [l.code, l.id] as const)), risk = new Map(C.facts.risks.map((r) => [r.code, r.id] as const));
  return buildSampleProcurement((c) => leaf.get(c) || "", (c) => risk.get(c) || "");
}
function wireToolbar(): void {
  $("btnAdd").addEventListener("click", addItem); $("btnCsv").addEventListener("click", exportCsv);
  ($("asOf") as HTMLInputElement).addEventListener("change", (e) => { const v = (e.target as HTMLInputElement).value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { data.asOf = v; refreshMeta(); save(); } });
  $("btnSample").addEventListener("click", () => {
    showConfirm("Esto reemplazará el plan actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
      if (!ok) return;
      ctxDirty = true; openSet.clear(); data = sampleForProject(); render(); save();
      const C = getCtx(), sin = C.connected ? data.items.filter((it) => !it.wbsIds.length).length : 0;
      setStatus("Caso de ejemplo cargado." + (sin ? " " + sin + " adquisición(es) no encontraron sus paquetes en la EDT del proyecto: carga el ejemplo en WBS Builder (o elige tus paquetes) para enlazarlas." : ""));
    });
  });
  $("btnClear").addEventListener("click", () => {
    showConfirm("Esto borrará la estrategia y todas las adquisiciones. ¿Continuar?", "Nuevo plan").then((ok) => { if (ok) { openSet.clear(); data = blankProcurement(todayISO()); render(); save(); setStatus("Plan nuevo iniciado."); } });
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
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el plan de adquisiciones aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const payload = () => ({ strategy: data.strategy, performance: data.performance, approvals: data.approvals, asOf: data.asOf, items: data.items, idCounter: data.idCounter });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId(); session = window.GPI!.openSession("procurement"); ctxDirty = true;
    const mod = p.modules && (p.modules as Record<string, unknown>).procurement;
    if (mod && typeof mod === "object") { data = normalizeProcurement(mod, todayISO()); window.GPI!.rebaseSession(session, payload()); render(); setStatus("Datos cargados desde el Panel de Control."); }
    else { data = blankProcurement(todayISO()); render(); setStatus("Proyecto sin plan de adquisiciones todavía. Agrega la primera adquisición, o usa Cargar ejemplo para explorar el caso DISTRIB+."); }
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "procurement", "El plan de adquisiciones", payload(), null, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  saveFn = () => { window.clearTimeout(timer); timer = window.setTimeout(push, 800); return true; };
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  // La EDT, el OBS, los riesgos y los costos los editan otros módulos: se vuelve a leer al volver o cuando cambian.
  const reread = (): void => { ctxDirty = true; const a = document.activeElement; if (!(a && $("mainArea").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render(); else refreshMeta(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else reread(); });
  window.GPI.onChange(() => { if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; } reread(); });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
})();
function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#6d1fa6;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#8f2fd0;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.className = "gpi-badge";
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + esc(name || "—") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  (bar.querySelector("#gpiSyncBtn") as HTMLElement).addEventListener("click", () => {
    const ok = pushFn(), b = bar.querySelector("#gpiSyncBtn") as HTMLElement, t = b.textContent; b.textContent = ok ? "✓ Sincronizado" : "⚠ Sin sincronizar";
    setTimeout(() => { b.textContent = t; }, 1400);
  });
}

// ---------- init ----------
wireToolbar();
if (!(window.GPI && window.GPI.available() && window.GPI.active())) { data = buildSampleProcurement(); ctxDirty = true; render(); }   // independiente: el ejemplo
else render();
