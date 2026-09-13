/* ============================================================
   Enunciado del Alcance — Definir el Alcance (PMBOK 8)
   Port mecánico del <script> inline de Enunciado_del_Alcance.html (Fase 4
   de MIGRATION.md): misma lógica, mismo comportamiento. Se agregan tipos
   y se compila a scope-statement.js (IIFE) para que el HTML lo cargue
   como <script src="scope-statement.js"> en vez de tenerlo inline.

   A diferencia de Cost-management/Recopilar_Requisitos: este módulo usa
   addEventListener/.onclick= exclusivamente (sin atributos onclick
   inline en el HTML), igual que OBS/RACI -- no hace falta exponer nada
   en window. Usa window.GPI explícito (no GPI bare).

   DELIBERADAMENTE NO se usa GPI.ui.esc (modo suelto sin gpi-core.js).
   ============================================================ */
import type * as GpiCore from "../../core/gpi-core";
import type { GpiProject, ProjectMeta, ProjectModules, RequirementItem, ScopeStatementModule } from "../../core/types";

type ModuleKey = keyof ProjectModules;

type GpiApi = typeof GpiCore.GPI;
declare global {
  interface Window { GPI?: GpiApi; }
}

/* ---------- estado ---------- */
interface DeliverableUi { id: string; code: string; name: string; description: string; acceptanceCriteria: string; ranIds: string[]; reqIds: string[]; }
interface SreItem { id: string; text: string; }
type SreKey = "assumptions" | "constraints" | "exclusions";
interface ScopeBaseline { frozen: boolean; version: string; date: string; approver: string; snapshot: Record<string, unknown> | null; }
interface ScopeState {
  productScope: string; projectScope: string; deliverables: DeliverableUi[];
  assumptions: SreItem[]; constraints: SreItem[]; exclusions: SreItem[];
  baseline: ScopeBaseline; idCounter: number; delCounter: number;
}

let state: ScopeState;

function blank(): ScopeState {
  return {
    productScope: "", projectScope: "", deliverables: [],
    assumptions: [], constraints: [], exclusions: [],
    baseline: { frozen: false, version: "1.0", date: "", approver: "", snapshot: null },
    idCounter: 1, delCounter: 1
  };
}
function uid(): string { return "s" + (state.idCounter++); }
function pad2(n: number): string { n = Number(n) || 0; return (n < 10 ? "0" : "") + n; }
function delCode(i: number): string { return "DEL." + pad2(i + 1); }

// Normaliza datos entrantes (retrocompatibilidad + tolerancia de esquema).
function normalize(d: any): ScopeState {
  d = d || {};
  const s = blank();
  s.productScope = d.productScope || d.productScopeDescription || "";
  s.projectScope = d.projectScope || "";
  s.idCounter = d.idCounter || 1;
  s.delCounter = d.delCounter || 1;
  (d.deliverables || []).forEach((x0: any, i: number) => {
    const x = typeof x0 === "string" ? { name: x0 } : x0;
    s.deliverables.push({
      id: x.id || ("del" + (i + 1)),
      code: x.code || delCode(i),
      name: x.name || "",
      description: x.description || "",
      acceptanceCriteria: x.acceptanceCriteria || "",
      ranIds: Array.isArray(x.ranIds) ? x.ranIds.slice() : [],
      reqIds: Array.isArray(x.reqIds) ? x.reqIds.slice() : []
    });
  });
  (["assumptions", "constraints", "exclusions"] as const).forEach((k) => {
    (d[k] || []).forEach((x: any) => {
      if (typeof x === "string") s[k].push({ id: uid(), text: x });
      else s[k].push({ id: x.id || uid(), text: x.text || "" });
    });
  });
  if (d.baseline) s.baseline = {
    frozen: !!d.baseline.frozen, version: d.baseline.version || "1.0",
    date: d.baseline.date || "", approver: d.baseline.approver || "", snapshot: d.baseline.snapshot || null
  };
  reCode(s);
  return s;
}
function reCode(s: ScopeState): void { s.deliverables.forEach((d, i) => { d.code = delCode(i); }); }

/* ---------- puente GPI (lectura de otros módulos) ---------- */
function gpiOn(): boolean { return typeof window.GPI !== "undefined"; }
function activeProject(): GpiProject | null { try { return gpiOn() && window.GPI!.available() ? window.GPI!.active() : null; } catch (_) { return null; } }
function mod<K extends ModuleKey>(name: K): ProjectModules[K] | null { try { return gpiOn() ? (window.GPI as GpiApi).getModule(name) : null; } catch (_) { return null; } }
function rans(): GpiCore.CharterRan[] { try { return gpiOn() && window.GPI!.util ? window.GPI!.util.charterRans(mod("charter")) : []; } catch (_) { return []; } }
function reqItems(): RequirementItem[] { const r = mod("requirements"); return (r && r.items) || []; }

/* ---------- helpers ---------- */
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function escAttr(s: unknown): string { return esc(s); }
function setStatus(m: string): void { const el = document.getElementById("statusLeft"); if (el) el.textContent = m; }
function toast(m: string): void { const t = document.getElementById("toast") as HTMLElement & { _t?: ReturnType<typeof setTimeout> }; t.textContent = m; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => { t.classList.remove("show"); }, 1900); }
function $(id: string): HTMLElement { return document.getElementById(id) as HTMLElement; }

/* ---------- modal (Promise-based, sin confirm/alert nativos) ---------- */
function confirmModal(title: string, msg: string, okText?: string, danger?: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = $("modalOverlay"), card = $("modalCard");
    card.className = "modal-card confirm-card";
    card.innerHTML = '<h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p>'
      + '<div class="modal-actions"><button class="btn" id="mCancel">Cancelar</button>'
      + '<button class="btn ' + (danger ? "danger" : "primary") + '" id="mOk">' + esc(okText || "Confirmar") + '</button></div>';
    function done(v: boolean) { ov.classList.remove("open"); document.removeEventListener("keydown", key); resolve(v); }
    function key(e: KeyboardEvent) { if (e.key === "Escape") done(false); }
    ($("mOk") as HTMLElement).onclick = () => { done(true); };
    ($("mCancel") as HTMLElement).onclick = () => { done(false); };
    ov.onclick = (e) => { if (e.target === ov) done(false); };
    document.addEventListener("keydown", key);
    ov.classList.add("open");
  });
}

/* ---------- render maestro ---------- */
function render(): void {
  renderScope();
  renderDeliverables();
  renderSre();
  renderCoherence();
  renderTrace();
}

/* ===== TAB ALCANCE ===== */
function renderScope(): void {
  ($("productScope") as HTMLTextAreaElement).value = state.productScope || "";
  ($("projectScope") as HTMLTextAreaElement).value = state.projectScope || "";
}

/* ===== TAB ENTREGABLES ===== */
function renderDeliverables(): void {
  const host = $("delsHost");
  const ranById: Record<string, GpiCore.CharterRan> = {}; rans().forEach((r) => { ranById[r.id] = r; });
  const reqById: Record<string, RequirementItem> = {}; reqItems().forEach((it) => { reqById[it.id] = it; });
  const decomposed: Record<string, boolean> = (gpiOn() && window.GPI!.util) ? window.GPI!.util.wbsDelIds(mod("wbs") || undefined) : {};

  if (!state.deliverables.length) {
    host.innerHTML = '<div class="empty-note">Aún no hay entregables. Usa <b>«+ Entregable»</b> para agregarlos, o <b>«↧ Sugerir desde el Acta»</b> si ya registraste los entregables clave en el Acta de Constitución.</div>';
    return;
  }
  const rows = state.deliverables.map((d, i) => {
    const ranChips = d.ranIds.filter((id) => ranById[id]).map((id) => '<span class="chip ran">' + esc(ranById[id].code) + '</span>').join("");
    let reqChips = d.reqIds.filter((id) => reqById[id]).map((id) => '<span class="chip req">' + esc(reqById[id].code) + '</span>').join("");
    const brokenReq = d.reqIds.filter((id) => !reqById[id]).length;
    if (!ranChips && !reqChips) reqChips = '<span class="chip none">sin trazar</span>';
    const dec = decomposed[d.id];
    return '<tr>'
      + '<td><span class="code-badge">' + esc(d.code) + '</span></td>'
      + '<td><div class="del-name">' + esc(d.name || "(sin nombre)") + '</div>'
      + (d.description ? '<div class="del-desc">' + esc(d.description) + '</div>' : '')
      + (d.acceptanceCriteria ? '<div class="del-desc"><b>Aceptación:</b> ' + esc(d.acceptanceCriteria) + '</div>' : '<div class="del-desc" style="color:var(--warn)">Sin criterio de aceptación</div>') + '</td>'
      + '<td>' + ranChips + reqChips + (brokenReq ? ' <span class="chip req" style="background:rgba(255,84,112,.15);color:#c0304a">' + brokenReq + ' rota(s)</span>' : '') + '</td>'
      + '<td>' + (dec ? '<span class="flag ok">✓ en la EDT</span>' : '<span class="flag no">pendiente EDT</span>') + '</td>'
      + '<td><div class="row-actions"><button class="btn sm" data-edit="' + i + '" title="Editar" aria-label="Editar entregable">✎</button>'
      + '<button class="btn sm danger" data-del="' + i + '" title="Eliminar" aria-label="Eliminar entregable">🗑</button></div></td>'
      + '</tr>';
  }).join("");
  host.innerHTML = '<table class="del"><thead><tr><th>Código</th><th>Entregable · criterio de aceptación</th><th>Trazabilidad (RAN · REQ)</th><th>EDT</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';

  host.querySelectorAll("[data-edit]").forEach((b) => { (b as HTMLElement).onclick = () => { editDeliverable(Number((b as HTMLElement).dataset.edit)); }; });
  host.querySelectorAll("[data-del]").forEach((b) => {
    (b as HTMLElement).onclick = () => {
      const idx = Number((b as HTMLElement).dataset.del);
      confirmModal("Eliminar entregable", "¿Eliminar «" + (state.deliverables[idx].name || "entregable") + "»?", "Eliminar", true).then((ok) => {
        if (ok) { state.deliverables.splice(idx, 1); reCode(state); persist(); render(); toast("Entregable eliminado"); }
      });
    };
  });
}

function editDeliverable(i: number | null): void {
  const isNew = (i == null);
  const d: DeliverableUi = isNew
    ? { id: "del" + (state.delCounter++), code: "", name: "", description: "", acceptanceCriteria: "", ranIds: [], reqIds: [] }
    : JSON.parse(JSON.stringify(state.deliverables[i as number]));
  const ov = $("modalOverlay"), card = $("modalCard");
  const ranList = rans(), reqList = reqItems();
  const ranSet: Record<string, boolean> = {}; d.ranIds.forEach((x) => { ranSet[x] = true; });
  const reqSet: Record<string, boolean> = {}; d.reqIds.forEach((x) => { reqSet[x] = true; });

  function pickerHtml(list: Array<{ id: string; code?: string; text?: string }>, kind: string, chosen: Record<string, boolean>): string {
    if (!list.length) return '<div class="empty-note">No hay ' + (kind === "ran" ? "requisitos de alto nivel en el Acta" : "requisitos (REQ) en Recopilar Requisitos") + '. ' + (activeProject() ? "Regístralos y vuelve aquí." : "Conecta el Panel de Control para trazar.") + '</div>';
    return list.map((x) => {
      const code = x.code, id = x.id, txt = x.text || "";
      return '<label class="pick-item"><input type="checkbox" data-pick="' + kind + '" value="' + escAttr(id) + '" ' + (chosen[id] ? "checked" : "") + '>'
        + '<span class="c ' + kind + '">' + esc(code) + '</span><span>' + esc(txt) + '</span></label>';
    }).join("");
  }

  card.className = "modal-card";
  card.innerHTML = '<h3>' + (isNew ? "Nuevo entregable" : "Editar " + esc(state.deliverables[i as number].code)) + '</h3>'
    + '<div class="fld"><label class="fl">Nombre del entregable</label><input class="txt" id="d_name" value="' + escAttr(d.name) + '" placeholder="p. ej. Obra civil y estructura del almacén"></div>'
    + '<div class="fld"><label class="fl">Descripción</label><textarea id="d_desc" placeholder="Alcance del entregable…">' + esc(d.description) + '</textarea></div>'
    + '<div class="fld"><label class="fl">Criterio de aceptación</label><textarea id="d_acc" placeholder="Cómo se verifica que el entregable es aceptable…">' + esc(d.acceptanceCriteria) + '</textarea></div>'
    + '<div class="fld"><label class="fl">Requisitos de alto nivel del Acta (RAN) que satisface</label><div class="picker">' + pickerHtml(ranList, "ran", ranSet) + '</div></div>'
    + '<div class="fld"><label class="fl">Requisitos (REQ) que lo justifican</label><div class="picker">' + pickerHtml(reqList as unknown as Array<{ id: string; code?: string; text?: string }>, "req", reqSet) + '</div></div>'
    + '<div class="modal-actions"><button class="btn" id="d_cancel">Cancelar</button><button class="btn primary" id="d_save">Guardar</button></div>';

  function close() { ov.classList.remove("open"); }
  ($("d_cancel") as HTMLElement).onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };
  ($("d_save") as HTMLElement).onclick = () => {
    d.name = ($("d_name") as HTMLInputElement).value.trim();
    d.description = ($("d_desc") as HTMLTextAreaElement).value.trim();
    d.acceptanceCriteria = ($("d_acc") as HTMLTextAreaElement).value.trim();
    d.ranIds = []; d.reqIds = [];
    card.querySelectorAll('[data-pick="ran"]:checked').forEach((c) => { d.ranIds.push((c as HTMLInputElement).value); });
    card.querySelectorAll('[data-pick="req"]:checked').forEach((c) => { d.reqIds.push((c as HTMLInputElement).value); });
    if (isNew) state.deliverables.push(d); else state.deliverables[i as number] = d;
    reCode(state); persist(); close(); render(); toast(isNew ? "Entregable agregado" : "Entregable actualizado");
  };
  ov.classList.add("open");
  setTimeout(() => { ($("d_name") as HTMLElement).focus(); }, 30);
}

function suggestFromCharter(): void {
  const ch = mod("charter");
  const dels = (ch && ch.deliverables) || [];
  if (!dels.length) { toast("El Acta no tiene entregables clave registrados"); return; }
  const existing: Record<string, boolean> = {}; state.deliverables.forEach((d) => { existing[(d.name || "").toLowerCase().trim()] = true; });
  let added = 0;
  dels.forEach((txt) => {
    const name = String(txt || "").trim(); if (!name) return;
    const short = name.length > 70 ? name.slice(0, 68) + "…" : name;
    if (existing[short.toLowerCase()] || existing[name.toLowerCase()]) return;
    state.deliverables.push({ id: "del" + (state.delCounter++), code: "", name: short, description: (short !== name ? name : ""), acceptanceCriteria: "", ranIds: [], reqIds: [] });
    added++;
  });
  reCode(state); persist(); render(); toast(added ? ("Se agregaron " + added + " entregable(s) desde el Acta") : "Los entregables del Acta ya estaban en la lista");
}

/* ===== TAB SRE ===== */
function renderSre(): void {
  (["assumptions", "constraints", "exclusions"] as const).forEach((k) => {
    const host = $(k + "Host"), arr = state[k];
    if (!arr.length) { host.innerHTML = '<div class="empty-note">Sin elementos.</div>'; } else host.innerHTML = arr.map((it, i) => {
      return '<div class="list-item"><textarea data-k="' + k + '" data-i="' + i + '">' + esc(it.text) + '</textarea>'
        + '<button class="btn sm danger del-x" data-rm="' + k + '" data-ri="' + i + '" title="Eliminar elemento" aria-label="Eliminar elemento">🗑</button></div>';
    }).join("");
  });
  document.querySelectorAll('#view-sre textarea[data-k]').forEach((t) => {
    t.addEventListener("input", () => { const el = t as HTMLTextAreaElement; state[el.dataset.k as SreKey][Number(el.dataset.i)].text = el.value; persistDebounced(); });
  });
  document.querySelectorAll('#view-sre [data-rm]').forEach((b) => {
    (b as HTMLElement).onclick = () => { const el = b as HTMLElement; state[el.dataset.rm as SreKey].splice(Number(el.dataset.ri), 1); persist(); renderSre(); renderCoherence(); };
  });
}

function pullSreFromCharter(): void {
  const ch = mod("charter"); if (!ch) { toast("Conecta el Panel para traer datos del Acta"); return; }
  const map: Record<string, "assumptions" | "constraints" | "exclusions"> = { assumptions: "assumptions", constraints: "constraints", exclusions: "exclusions" };
  let added = 0;
  Object.keys(map).forEach((k0) => {
    const k = map[k0];
    const src = ch[k] || [];
    const existing: Record<string, boolean> = {}; state[k].forEach((x) => { existing[x.text.toLowerCase().trim()] = true; });
    src.forEach((txt: unknown) => {
      const t = String(txt || "").trim(); if (!t || existing[t.toLowerCase()]) return;
      state[k].push({ id: uid(), text: t }); added++;
    });
  });
  persist(); renderSre(); renderCoherence();
  toast(added ? ("Se importaron " + added + " elemento(s) del Acta") : "El Acta no aportó elementos nuevos");
}

/* ===== TAB COHERENCIA ===== */
function audit(): GpiCore.ScopeAuditResult {
  if (gpiOn() && window.GPI!.util) return window.GPI!.util.scopeAudit(state as unknown as ScopeStatementModule, mod("requirements"), mod("charter"), mod("wbs"));
  // Respaldo mínimo si no está el núcleo (no debería ocurrir: gpi-core.js va junto)
  return {
    total: state.deliverables.length, deliverables: state.deliverables as unknown as Required<GpiCore.ScopeAuditResult["deliverables"][number]>[],
    delsWithoutReq: [], delsWithoutAccept: [], delsNotDecomposed: [], delsBrokenReq: 0,
    decomposedCount: 0, decompPct: 0, reqsWithoutDel: [], reqCovPct: 0, reqTotal: 0,
    ransWithoutDel: [], ranTotal: 0, assumptions: 0, constraints: 0, exclusions: 0,
    baselineFrozen: false, baselineVersion: null, state: "vacio"
  };
}

function renderCoherence(): void {
  const a = audit();
  const host = $("cohHost");
  const colMap: Record<string, string> = { verde: "var(--good)", ambar: "var(--warn)", rojo: "var(--danger)", vacio: "var(--ink-2)" };
  const labMap: Record<string, string> = { verde: "Coherente", ambar: "En progreso", rojo: "Con huecos", vacio: "Sin datos" };
  const col = colMap[a.state], lab = labMap[a.state];

  let html = '<div class="card-head"><h3>Estado de coherencia Requisitos ↔ Entregables ↔ EDT</h3>'
    + '<span class="state-pill" style="background:' + col + '22;color:' + col + '">' + esc(lab) + '</span></div>';

  html += '<div class="kpi-row">'
    + '<div class="kpi-box"><div class="v" style="color:var(--violet)">' + a.total + '</div><div class="l">entregables (DEL)</div></div>'
    + '<div class="kpi-box"><div class="v" style="color:' + col + '">' + a.reqCovPct + '%</div><div class="l">de los ' + a.reqTotal + ' REQ tienen entregable</div></div>'
    + '<div class="kpi-box"><div class="v" style="color:' + col + '">' + a.decompPct + '%</div><div class="l">entregables descompuestos en la EDT</div></div>'
    + '</div>';

  html += '<div class="bar-track"><div class="bar-fill" style="width:' + a.reqCovPct + '%;background:' + col + '"></div></div>';

  const warns: Array<[string, string]> = [];
  if (a.delsWithoutReq.length) warns.push(["a", a.delsWithoutReq.length + " entregable(s) sin ningún REQ que los justifique (posible sobre-alcance): " + a.delsWithoutReq.map((d) => d.code).slice(0, 6).join(", ")]);
  if (a.reqsWithoutDel.length) warns.push(["r", a.reqsWithoutDel.length + " requisito(s) sin entregable que los acoja (alcance faltante): " + a.reqsWithoutDel.map((x) => x.code).slice(0, 6).join(", ")]);
  if (a.delsNotDecomposed.length) warns.push(["a", a.delsNotDecomposed.length + " entregable(s) aún sin descomponer en la EDT: " + a.delsNotDecomposed.map((d) => d.code).slice(0, 6).join(", ") + " — usa «↧ Sembrar Entregables» en WBS Builder"]);
  if (a.delsWithoutAccept.length) warns.push(["a", a.delsWithoutAccept.length + " entregable(s) sin criterio de aceptación"]);
  if (a.delsBrokenReq) warns.push(["r", a.delsBrokenReq + " entregable(s) con enlace a un REQ eliminado"]);
  if (a.ransWithoutDel.length) warns.push(["a", a.ransWithoutDel.length + " RAN del Acta sin ningún entregable que lo materialice"]);

  if (!a.total && !a.reqTotal) {
    html += '<div class="empty-note">Empieza registrando los <b>entregables</b> (idealmente sugiriéndolos desde el Acta y enlazándolos a los REQ de Recopilar Requisitos). La coherencia se evalúa cuando existan requisitos y entregables.</div>';
  } else if (warns.length) {
    html += '<ul class="warn-list">' + warns.map((w) => '<li><span class="tag ' + w[0] + '">' + (w[0] === "r" ? "crítico" : "revisar") + '</span>' + esc(w[1]) + '</li>').join("") + '</ul>';
  } else {
    html += '<div class="ok-note">✓ Todo REQ tiene entregable, todo entregable tiene REQ y criterio de aceptación, y todos están descompuestos en la EDT.</div>';
  }

  if (!activeProject()) {
    html += '<div class="empty-note" style="margin-top:10px">ⓘ Sin proyecto activo del Panel, la trazabilidad RAN/REQ y la descomposición en la EDT no pueden cruzarse. Abre esta herramienta desde el <b>Panel de Control</b> para la coherencia completa.</div>';
  }
  host.innerHTML = html;
  renderBaseline(a);
}

function renderBaseline(a: GpiCore.ScopeAuditResult): void {
  const b = state.baseline, host = $("baselineHost"), st = $("baselineState");
  if (b.frozen) {
    st.innerHTML = '<span class="state-pill" style="background:rgba(0,194,168,.16);color:#00967f">🔒 Congelada v' + esc(b.version) + '</span>';
    host.innerHTML = '<div class="muted">Línea base <b>v' + esc(b.version) + '</b> congelada el <b>' + esc(b.date || "—") + '</b> por <b>' + esc(b.approver || "—") + '</b>. '
      + 'Contiene ' + (((b.snapshot?.deliverables as unknown[]) || []).length) + ' entregable(s). '
      + 'Los cambios posteriores deberían gestionarse por Control Integrado de Cambios.</div>'
      + '<div style="margin-top:10px"><button class="btn sm danger" id="btnUnfreeze">Descongelar (volver a editar la línea base)</button></div>';
    ($("btnUnfreeze") as HTMLElement).onclick = () => {
      confirmModal("Descongelar línea base", "¿Reabrir la línea base del alcance para editarla? Deberías dejar constancia del cambio.", "Descongelar", true).then((ok) => {
        if (ok) { b.frozen = false; persist(); renderCoherence(); toast("Línea base reabierta"); }
      });
    };
  } else {
    const canFreeze = a.total > 0;
    host.innerHTML = '<div class="muted" style="margin-bottom:10px">Cuando el alcance esté acordado, <b>congela la línea base</b>: guarda una copia inmutable de los entregables y del marco de supuestos/restricciones/exclusiones. Sirve de referencia para medir el <i>scope creep</i>.</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:10px">'
      + '<div><label class="fl">Versión</label><input class="txt" id="b_ver" value="' + escAttr(b.version || "1.0") + '"></div>'
      + '<div><label class="fl">Fecha</label><input class="txt" id="b_date" type="date" value="' + escAttr(b.date || "") + '"></div>'
      + '<div><label class="fl">Aprobador</label><input class="txt" id="b_appr" value="' + escAttr(b.approver || "") + '" placeholder="Patrocinador / PM"></div>'
      + '</div>'
      + '<button class="btn primary sm" id="btnFreeze" ' + (canFreeze ? "" : "disabled") + '>🔒 Congelar línea base</button>'
      + (canFreeze ? "" : '<div class="empty-note" style="margin-top:8px">Registra al menos un entregable antes de congelar.</div>');
    const f = document.getElementById("btnFreeze");
    if (f) (f as HTMLElement).onclick = () => {
      b.version = ($("b_ver") as HTMLInputElement).value.trim() || "1.0";
      b.date = ($("b_date") as HTMLInputElement).value || new Date().toISOString().slice(0, 10);
      b.approver = ($("b_appr") as HTMLInputElement).value.trim();
      b.snapshot = JSON.parse(JSON.stringify({ deliverables: state.deliverables, assumptions: state.assumptions, constraints: state.constraints, exclusions: state.exclusions, productScope: state.productScope, projectScope: state.projectScope }));
      b.frozen = true; persist(); renderCoherence(); toast("Línea base v" + b.version + " congelada");
    };
  }
}

/* ===== TAB CONSISTENCIA (solo lectura) ===== */
function renderTrace(): void {
  const host = $("traceHost"); if (!host) return;
  if (!(gpiOn() && window.GPI!.util)) { host.innerHTML = '<div class="empty-note">La matriz de consistencia requiere el núcleo del ecosistema (gpi-core.js).</div>'; return; }
  if (!activeProject()) {
    host.innerHTML = '<div class="empty-note">La integración vertical <b>RAN → REQ → DEL → WP</b> cruza cuatro módulos (Acta, Requisitos, este documento y la EDT). Abre esta herramienta desde el <b>Panel de Control</b> con un proyecto activo para verla completa.</div>';
    return;
  }
  const m = window.GPI!.util.traceMatrix(mod("requirements"), mod("charter"), state as unknown as ScopeStatementModule, mod("wbs"));
  if (!m.rows.length) {
    host.innerHTML = '<div class="empty-note">Aún no hay requisitos (REQ) que trazar. Registra requisitos en <b>Recopilar Requisitos</b>, enlázalos a entregables en la pestaña <b>Entregables</b>, y descompón los entregables en la EDT.</div>';
    return;
  }
  const colMap: Record<string, string> = { verde: "var(--good)", ambar: "var(--warn)", rojo: "var(--danger)", vacio: "var(--ink-2)" };
  const labMap: Record<string, string> = { verde: "Consistente", ambar: "Con avisos", rojo: "Con rupturas", vacio: "Sin datos" };
  const col = colMap[m.state], lab = labMap[m.state];

  let html = '<div class="card-head"><h3>Cadena de trazabilidad por requisito</h3>'
    + '<span class="state-pill" style="background:' + col + '22;color:' + col + '">' + esc(lab) + '</span></div>';

  html += '<div class="kpi-row">'
    + '<div class="kpi-box"><div class="v" style="color:' + col + '">' + m.kpi.fullChainPct + '%</div><div class="l">de los ' + m.kpi.reqTotal + ' REQ con cadena completa y coherente</div></div>'
    + '<div class="kpi-box"><div class="v" style="color:var(--danger)">' + (m.kpi.noDel + m.kpi.noWp) + '</div><div class="l">rupturas: ' + m.kpi.noDel + ' sin entregable · ' + m.kpi.noWp + ' sin paquete</div></div>'
    + '<div class="kpi-box"><div class="v" style="color:var(--warn)">' + (m.kpi.emergent + m.kpi.delWpMismatch + m.kpi.wpNoDel) + '</div><div class="l">avisos: ' + m.kpi.emergent + ' emergentes · ' + m.kpi.delWpMismatch + ' DEL↔WP · ' + m.kpi.wpNoDel + ' EDT sin entregable</div></div>'
    + '</div>';

  function chips(arr: Array<{ code?: string; name?: string }>, cls: string): string { return arr.map((x) => '<span class="chip ' + cls + '">' + esc(x.code || x.name) + '</span>').join(""); }
  const rowsHtml = m.rows.map((r) => {
    const scolMap: Record<string, string> = { verde: "var(--good)", ambar: "var(--warn)", rojo: "var(--danger)" };
    const scol = scolMap[r.state];
    const ranCell = r.rans.length ? chips(r.rans, "ran") : (r.flags.emergent ? '<span class="chip none warn">emergente</span>' : '<span class="chip none">—</span>');
    const delCell = r.dels.length ? chips(r.dels, "del") : '<span class="chip none bad">sin entregable</span>';
    const wpCell = r.wps.length ? r.wps.map((w) => '<span class="chip wp" title="' + escAttr(w.name) + '">' + esc(w.code || w.name) + '</span>').join("") : '<span class="chip none bad">sin paquete</span>';
    let cross: string;
    if (r.flags.noDel || r.flags.noWp) cross = '<span class="chip none">—</span>';
    else if (r.coherent) cross = '<span class="flag ok">✓ coherente</span>';
    else if (r.flags.delWpMismatch) cross = '<span class="flag no">✕ discrepan</span>';
    else if (r.flags.wpNoDel) cross = '<span class="flag no">EDT sin entregable</span>';
    else cross = '<span class="flag ok">✓</span>';
    const estLabel = r.flags.noDel ? "Sin entregable" : r.flags.noWp ? "Sin paquete"
      : r.flags.delWpMismatch ? "DEL↔WP discrepan" : r.flags.wpNoDel ? "EDT no por entregables"
        : r.flags.emergent ? "Emergente (revisar)" : "Completa";
    return '<tr data-st="' + r.state + '">'
      + '<td><span class="code-badge" style="background:var(--violet)">' + esc(r.req.code) + '</span>'
      + (r.req.text ? '<div class="del-desc" style="margin-top:4px">' + esc(r.req.text.length > 80 ? r.req.text.slice(0, 78) + "…" : r.req.text) + '</div>' : '') + '</td>'
      + '<td class="chain">' + ranCell + '</td>'
      + '<td class="chain">' + delCell + '</td>'
      + '<td class="chain">' + wpCell + '</td>'
      + '<td>' + cross + '</td>'
      + '<td><span class="est" style="color:' + scol + '"><span class="st-dot" style="background:' + scol + '"></span>' + esc(estLabel) + '</span></td>'
      + '</tr>';
  }).join("");
  html += '<div class="trace-scroll"><table class="trace"><thead><tr>'
    + '<th>REQ</th><th>RAN <span class="arw">→ origen</span></th><th>DEL <span class="arw">→ acoge</span></th><th>WP <span class="arw">→ produce</span></th><th>DEL↔WP</th><th>Estado</th>'
    + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';

  html += '<div class="legend">'
    + '<span><span class="st-dot" style="background:var(--good)"></span>Verde: cadena completa y coherente</span>'
    + '<span><span class="st-dot" style="background:var(--warn)"></span>Ámbar: emergente · EDT no organizada por entregables · DEL↔WP discrepan</span>'
    + '<span><span class="st-dot" style="background:var(--danger)"></span>Rojo: requisito sin entregable o sin paquete</span>'
    + '</div>';

  const o = m.orphans;
  function ob<T>(title: string, items: T[], mapper: (x: T) => string, kind: string): string {
    const n = items.length;
    const ncol = n ? (kind === "bad" ? "var(--danger)" : "var(--warn)") : "var(--good)";
    const bodyH = n ? '<ul>' + items.slice(0, 8).map(mapper).join("") + (items.length > 8 ? '<li>… (+' + (items.length - 8) + ' más)</li>' : '') + '</ul>' : '<div class="clean">✓ ninguno</div>';
    return '<div class="orphan-box"><h4>' + esc(title) + ' <span class="n" style="background:' + ncol + '22;color:' + ncol + '">' + n + '</span></h4>' + bodyH + '</div>';
  }
  html += '<h3 style="font-family:var(--display);font-size:13px;margin:20px 0 4px">Huérfanos y sobre-alcance <span style="font-weight:500;font-size:11.5px;color:var(--ink-2)">— lo que la espina por requisito no revela por sí sola</span></h3>';
  html += '<div class="orphan-grid">'
    + ob("Entregables sin ningún REQ (gold-plating)", o.delsWithoutReq, (d) => '<li>' + esc(d.code) + ' · ' + esc(d.name || "") + '</li>', "warn")
    + ob("Paquetes sin REQ ni entregable", o.wpsOrphan, (w) => '<li>' + esc((w.code ? w.code + " · " : "") + (w.name || "")) + '</li>', "bad")
    + ob("Paquetes bajo entregable pero sin REQ", o.wpsNoReq, (w) => '<li>' + esc((w.code ? w.code + " · " : "") + (w.name || "")) + '</li>', "warn")
    + ob("RAN sin ningún REQ que lo desarrolle", o.ransWithoutReq, (r) => '<li>' + esc(r.code) + '</li>', "warn")
    + ob("REQ emergentes (sin RAN)", o.emergentReqs, (r) => '<li>' + esc(r.code) + '</li>', "warn")
    + '</div>';

  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;align-items:center">'
    + '<a class="btn sm" href="Recopilar_Requisitos.html">→ abrir Requisitos</a>'
    + '<a class="btn sm" href="WBS_Builder.html">→ abrir la EDT</a>'
    + '<span class="empty-note">Vista de solo lectura: corrige en el módulo correspondiente y la matriz se actualiza al volver.</span>'
    + '</div>';

  host.innerHTML = html;
}

/* ---------- persistencia ---------- */
let pd: ReturnType<typeof setTimeout> | undefined;
function persistDebounced(): void { clearTimeout(pd); pd = setTimeout(persist, 400); }
function persist(): void {
  if (gpiOn() && window.GPI!.available() && window.GPI!.active()) {
    window.GPI!.setModule("scopeStatement", serialize());
    window.GPI!.patchMeta({ name: ($("projectTitle") as HTMLInputElement).value, course: ($("courseTitle") as HTMLInputElement).value });
  }
  setStatus("Cambios guardados.");
}
function serialize(): ScopeStatementModule {
  return {
    productScope: state.productScope, projectScope: state.projectScope,
    deliverables: state.deliverables, assumptions: state.assumptions,
    constraints: state.constraints, exclusions: state.exclusions,
    baseline: state.baseline, idCounter: state.idCounter, delCounter: state.delCounter
  } as unknown as ScopeStatementModule;
}

/* ---------- datos de ejemplo (DISTRIB+) ----------
   Texto compartido; los ids RAN/REQ solo se enlazan cuando hay proyecto
   activo (donde existen los módulos charter/requirements de ejemplo). */
interface SampleDel { name: string; description: string; acc: string; ran: string[]; req: string[]; }
const SAMPLE_DELS: SampleDel[] = [
  { name: "Expediente técnico de ingeniería", description: "Estudio de suelos, diseño estructural y diseño MEP aprobados para construcción.", acc: "Expediente revisado y aprobado por la supervisión; planos aptos para construcción.", ran: ["ran1", "ran3"], req: ["q5"] },
  { name: "Permisos y licencias municipales de construcción", description: "Licencias de edificación y conformidades municipales obtenidas.", acc: "Licencias emitidas por la Municipalidad de Lurín y certificado de seguridad aprobado.", ran: ["ran2"], req: ["q3"] },
  { name: "Obra civil y estructura del almacén", description: "Nave, cobertura y acabados de la edificación concluidos.", acc: "Altura libre, disposición de racks y acabados conformes a los planos aprobados.", ran: ["ran1"], req: ["q1", "q2", "q6"] },
  { name: "Instalaciones MEP operativas y probadas", description: "Instalaciones eléctricas y sanitarias ejecutadas y en funcionamiento.", acc: "Cargas eléctricas y caudales sanitarios probados y conformes a memoria de cálculo.", ran: ["ran3"], req: ["q5"] },
  { name: "Patio de maniobras y obras exteriores", description: "Patio y áreas de maniobra para vehículos de carga pesada.", acc: "Radios de giro y áreas de maniobra verificados con vehículo de diseño (tráiler).", ran: ["ran4"], req: ["q4"] },
  { name: "Dossier de calidad y acta de entrega final", description: "Documentación de calidad, pruebas y acta de entrega firmada.", acc: "Dossier de calidad completo y acta de entrega y cierre firmada por el cliente.", ran: [], req: ["q6"] }
];
const SAMPLE_ASSUM: string[] = [
  "El terreno de Lurín está saneado legalmente y disponible desde el inicio del proyecto.",
  "La disponibilidad de cuadrillas y subcontratistas se mantiene según el plan de recursos.",
  "El tipo de cambio y el precio del acero se mantienen dentro del rango presupuestado."
];
const SAMPLE_CONS: string[] = [
  "El presupuesto (CAPEX) del proyecto no debe exceder USD 8.5 millones.",
  "El plazo de ejecución va del 6 de julio al 6 de noviembre de 2026.",
  "El diseño y la construcción deben cumplir el RNE, INDECI y la normativa de SST (Ley 29783)."
];
const SAMPLE_EXCL: string[] = [
  "Operación y mantenimiento del almacén posteriores a la entrega.",
  "Equipamiento logístico interno (racks, montacargas, sistemas de gestión de almacén).",
  "Obras fuera del lindero del terreno y ampliaciones futuras de la nave."
];

function buildSample(linked: boolean): void {
  state = blank();
  state.productScope = "Almacén logístico para DISTRIB+ S.A. en Lurín (Lima): nave industrial con cobertura metálica, instalaciones eléctricas y sanitarias dimensionadas para operación logística, y patio de maniobras para vehículos de carga pesada. CAPEX de referencia: USD 8.5 M.";
  state.projectScope = "Comprende ingeniería de detalle, gestión de permisos, procura de estructuras y materiales, construcción de obra civil y MEP, y pruebas/puesta en marcha hasta la entrega formal.";
  SAMPLE_DELS.forEach((s) => {
    state.deliverables.push({
      id: "del" + (state.delCounter++), code: "", name: s.name, description: s.description,
      acceptanceCriteria: s.acc, ranIds: linked ? s.ran.slice() : [], reqIds: linked ? s.req.slice() : []
    });
  });
  SAMPLE_ASSUM.forEach((t) => { state.assumptions.push({ id: uid(), text: t }); });
  SAMPLE_CONS.forEach((t) => { state.constraints.push({ id: uid(), text: t }); });
  SAMPLE_EXCL.forEach((t) => { state.exclusions.push({ id: uid(), text: t }); });
  reCode(state);
}

/* ---------- reporte imprimible ---------- */
function buildReport(): void {
  let meta: Partial<ProjectMeta> = {}; try { const m = gpiOn() && window.GPI!.available() ? window.GPI!.meta() : null; if (m) meta = m; } catch (_) { /* noop */ }
  const a = audit();
  const ranById: Record<string, GpiCore.CharterRan> = {}; rans().forEach((r) => { ranById[r.id] = r; });
  const reqById: Record<string, RequirementItem> = {}; reqItems().forEach((it) => { reqById[it.id] = it; });
  let body = "";
  body += '<h2>1. Descripción del alcance</h2>'
    + '<table class="rep-kv"><tr><th style="width:26%">Alcance del producto</th><td>' + esc(state.productScope || "—") + '</td></tr>'
    + '<tr><th>Alcance del trabajo</th><td>' + esc(state.projectScope || "—") + '</td></tr></table>';
  body += '<h2>2. Entregables del proyecto</h2><table><tr><th>Código</th><th>Entregable</th><th>Criterio de aceptación</th><th>RAN · REQ</th></tr>'
    + state.deliverables.map((d) => {
      const tr = d.ranIds.filter((x) => ranById[x]).map((x) => ranById[x].code)
        .concat(d.reqIds.filter((x) => reqById[x]).map((x) => reqById[x].code as string)).join(", ");
      return '<tr><td>' + esc(d.code) + '</td><td><b>' + esc(d.name) + '</b>' + (d.description ? '<br>' + esc(d.description) : '') + '</td><td>' + esc(d.acceptanceCriteria || "—") + '</td><td>' + esc(tr || "—") + '</td></tr>';
    }).join("") + '</table>';
  function lst(arr: SreItem[]): string { return arr.length ? '<ul>' + arr.map((x) => '<li>' + esc(x.text) + '</li>').join("") + '</ul>' : '<p class="rep-note">—</p>'; }
  body += '<h2>3. Supuestos</h2>' + lst(state.assumptions);
  body += '<h2>4. Restricciones</h2>' + lst(state.constraints);
  body += '<h2>5. Exclusiones (fuera del alcance)</h2>' + lst(state.exclusions);
  body += '<h2>6. Coherencia</h2><table class="rep-kv">'
    + '<tr><th style="width:40%">Entregables</th><td>' + a.total + '</td></tr>'
    + '<tr><th>REQ con entregable</th><td>' + a.reqCovPct + '% (' + (a.reqTotal - a.reqsWithoutDel.length) + '/' + a.reqTotal + ')</td></tr>'
    + '<tr><th>Entregables descompuestos en la EDT</th><td>' + a.decompPct + '% (' + a.decomposedCount + '/' + a.total + ')</td></tr>'
    + '<tr><th>Línea base</th><td>' + (a.baselineFrozen ? ('Congelada v' + esc(a.baselineVersion || "1.0")) : 'No congelada') + '</td></tr></table>';

  const el = $("gpiReport");
  const today = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  const pName = ($("projectTitle") as HTMLInputElement).value || meta.name || "Proyecto";
  const course = ($("courseTitle") as HTMLInputElement).value || meta.course || "Gestión de Proyectos de Ingeniería";
  el.innerHTML = '<div class="rep-head"><div><h1>Enunciado del Alcance del Proyecto</h1>'
    + '<div class="sub">' + esc(pName) + (meta.code ? ' · ' + esc(meta.code) : '') + '</div>'
    + '<div class="sub" style="font-weight:500">' + esc(course) + '</div></div>'
    + '<div class="rep-meta">Definir el Alcance · PMBOK 8<br>Emitido: ' + esc(today)
    + (meta.client ? '<br>Cliente: ' + esc(meta.client) : '') + (meta.location ? '<br>' + esc(meta.location) : '') + '</div></div>' + body;
  document.body.classList.add("report-mode");
  function done() { document.body.classList.remove("report-mode"); window.removeEventListener("afterprint", done); }
  window.addEventListener("afterprint", done);
  setTimeout(() => { window.print(); setTimeout(done, 500); }, 60);
}

/* ---------- export / import archivo ---------- */
function exportJson(): void {
  const data = { kind: "gpi.scopeStatement/v1", title: ($("projectTitle") as HTMLInputElement).value, course: ($("courseTitle") as HTMLInputElement).value, data: serialize() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  const safe = (data.title || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  a.href = url; a.download = "alcance_" + safe + ".json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("Enunciado del alcance exportado.");
}
function importJson(file: File): void {
  const r = new FileReader();
  r.onload = (e) => {
    let obj: any; try { obj = JSON.parse((e.target as FileReader).result as string); } catch (_) { toast("Archivo no válido"); return; }
    const payload = (obj && obj.kind === "gpi.scopeStatement/v1" && obj.data) ? obj.data : obj;
    state = normalize(payload);
    if (obj.title) ($("projectTitle") as HTMLInputElement).value = obj.title;
    if (obj.course) ($("courseTitle") as HTMLInputElement).value = obj.course;
    persist(); render(); toast("Enunciado del alcance cargado");
  };
  r.readAsText(file);
}

/* ---------- tabs ---------- */
function setTab(t: string): void {
  document.querySelectorAll("#tabs .tab").forEach((b) => { b.classList.toggle("active", (b as HTMLElement).dataset.tab === t); });
  document.querySelectorAll(".view").forEach((v) => { v.classList.toggle("active", v.id === "view-" + t); });
  if (t === "coh") renderCoherence();
  if (t === "trace") renderTrace();
}

/* ---------- init / eventos ---------- */
function wire(): void {
  document.querySelectorAll("#tabs .tab").forEach((b) => { (b as HTMLElement).onclick = () => { setTab((b as HTMLElement).dataset.tab as string); }; });
  $("productScope").addEventListener("input", function () { state.productScope = (this as HTMLTextAreaElement).value; persistDebounced(); });
  $("projectScope").addEventListener("input", function () { state.projectScope = (this as HTMLTextAreaElement).value; persistDebounced(); });
  ($("btnPullDesc") as HTMLElement).onclick = () => {
    const ch = mod("charter"); if (!ch) { toast("Conecta el Panel para traer la descripción del Acta"); return; }
    if (ch.description) { state.productScope = ch.description; renderScope(); persist(); toast("Descripción traída del Acta"); }
    else toast("El Acta no tiene descripción de alto nivel");
  };
  ($("btnAddDel") as HTMLElement).onclick = () => { editDeliverable(null); };
  ($("btnSuggestDels") as HTMLElement).onclick = suggestFromCharter;
  ($("btnPullSre") as HTMLElement).onclick = pullSreFromCharter;
  document.querySelectorAll("[data-add-sre]").forEach((b) => {
    (b as HTMLElement).onclick = () => {
      const k = (b as HTMLElement).dataset.addSre as "assumptions" | "constraints" | "exclusions";
      state[k].push({ id: uid(), text: "" }); persist(); renderSre();
      setTimeout(() => { const ta = document.querySelector('#' + k + 'Host textarea[data-i="' + (state[k].length - 1) + '"]') as HTMLElement | null; if (ta) ta.focus(); }, 30);
    };
  });
  ($("btnExport") as HTMLElement).onclick = exportJson;
  ($("btnImport") as HTMLElement).onclick = () => { ($("fileInput") as HTMLInputElement).click(); };
  $("fileInput").addEventListener("change", (e) => { const files = (e.target as HTMLInputElement).files; if (files && files[0]) importJson(files[0]); (e.target as HTMLInputElement).value = ""; });
  ($("btnReport") as HTMLElement).onclick = buildReport;
  ($("btnSample") as HTMLElement).onclick = () => {
    confirmModal("Cargar ejemplo", "Esto reemplazará el contenido actual por el caso DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo", true).then((ok) => {
      if (ok) { buildSample(!!activeProject()); persist(); render(); toast("Ejemplo DISTRIB+ cargado"); }
    });
  };
  ($("btnReset") as HTMLElement).onclick = () => {
    confirmModal("Nuevo enunciado", "Esto borrará el contenido actual del Enunciado del Alcance. ¿Continuar?", "Borrar", true).then((ok) => {
      if (ok) { state = blank(); persist(); render(); toast("Enunciado del alcance reiniciado"); }
    });
  };
  $("projectTitle").addEventListener("input", persistDebounced);
  $("courseTitle").addEventListener("input", persistDebounced);
}

/* ---------- arranque + puente GPI ---------- */
let booted = false;
function boot(): void {
  if (booted) return; booted = true; // idempotente: evita dobles listeners/badges
  wire();
  const proj = activeProject();
  if (proj) {
    // Regla de oro del ecosistema: con proyecto activo, hidrata desde el módulo;
    // si no hay datos aún, arranca EN BLANCO (con guía), sin datos de ejemplo.
    const d = mod("scopeStatement");
    if (d) { state = normalize(d); setStatus("Cargado desde el Panel de Control."); }
    else { state = blank(); setStatus("Proyecto sin Enunciado del Alcance todavía. Agrega entregables o usa «Cargar ejemplo»."); }
    if (proj.meta) { if (proj.meta.name) ($("projectTitle") as HTMLInputElement).value = proj.meta.name; if (proj.meta.course) ($("courseTitle") as HTMLInputElement).value = proj.meta.course; }
    $("banner").classList.remove("show");
    // guardado en cambios de foco/salida y refresco reactivo entre pestañas
    window.addEventListener("beforeunload", persist);
    document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); else refreshFromGpi(); });
    // El original chequeaba "if (GPI.onChange)" defensivamente; el tipo ya
    // garantiza que existe, así que la llamada directa es equivalente.
    window.GPI!.onChange(() => { if (!document.hidden) refreshFromGpi(); });
    gpiBadge(proj.meta ? proj.meta.name : "");
  } else {
    // Modo independiente / vista previa: demo autocontenida (sin enlaces RAN/REQ).
    buildSample(false);
    $("banner").classList.add("show");
    $("banner").innerHTML = "<b>Modo independiente (sin proyecto activo del Panel).</b> Estás viendo una demostración del caso DISTRIB+. Para trazar RAN/REQ y verificar la descomposición en la EDT, abre esta herramienta desde el <b>Panel de Control</b>.";
  }
  render();
}

// Refresco ligero: si cambian requirements/charter/wbs en otra pestaña, solo
// re-renderiza (no pisa el texto que el usuario esté editando aquí).
function refreshFromGpi(): void {
  if (!activeProject()) return;
  renderDeliverables(); renderCoherence(); renderTrace();
}

function gpiBadge(name: string | undefined): void {
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#6c5ce7;box-shadow:0 0 0 3px rgba(108,92,231,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#5646c9;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#6c5ce7;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.className = "gpi-badge";
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + String(name || "—").replace(/</g, "&lt;") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  const sb = bar.querySelector("#gpiSyncBtn");
  if (sb) (sb as HTMLElement).onclick = () => { persist(); const t = sb.textContent; sb.textContent = "✓ Sincronizado"; setTimeout(() => { sb.textContent = t; }, 1400); };
}

document.addEventListener("DOMContentLoaded", boot);
