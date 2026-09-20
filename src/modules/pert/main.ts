/* =========================================================
   Análisis PERT — estimación probabilística de duraciones
   Port mecánico del <script> inline de Pert_Analysis.html (Fase 4 de
   MIGRATION.md): misma lógica, mismo comportamiento. Se agregan tipos y
   se compila a pert.js (IIFE) para que el HTML lo cargue como
   <script src="pert.js"> en vez de tenerlo inline.

   Mismo patrón que OBS/WBS/Activity_Definition: addEventListener
   exclusivamente, window.GPI explícito, IIFE propio -- no hace falta
   exponer nada en window.

   DELIBERADAMENTE NO se usa GPI.ui.esc (modo suelto sin gpi-core.js).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { ActivitiesModule, ActivityItem, EditSession, PertEntry, PertModule, ProjectMeta, ScheduleLink, WbsModule } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- estado ----------
// Las ternas se guardan POR ACTIVIDAD (id del módulo Definir las Actividades):
// { o, m, mAuto, p }. Con mAuto=true, M SIGUE en vivo a la duración base
// Dur = Met/(#Eq×R) — si cambian metrados o rendimientos, M se actualiza sola.
// inputMode: "dias" (O/P en días) o "pct" (O/P como % de M).
let mode: "live" | "sample" = "live";
let stateLive: PertModule = { byActivity: {}, inputMode: "dias" };
// Id. del proyecto activo cuando esta pestaña cargó sus datos -- se
// compara contra GPI.activeId() antes de cada guardado (ver gpiPush())
// para nunca escribir este análisis sobre un proyecto distinto que se
// haya activado desde otra pestaña mientras esta seguía abierta (bug
// real reportado por el usuario, confirmado sistémico en los 13 módulos
// de herramienta).
let loadedProjectId: string | null = null;
let session: EditSession | null = null; // versión del análisis PERT que esta pestaña cargó (GPI.openSession)
let projectStale = false;
let stateSample: PertModule | null = null;
let wbsLive: WbsModule | null = null, actsLive: ActivitiesModule | null = null;

function state(): PertModule { return (mode === "sample" ? stateSample : stateLive) as PertModule; }
function wbsData(): WbsModule | null { return mode === "sample" ? SAMPLE_WBS : wbsLive; }
function actsData(): ActivitiesModule | null { return mode === "sample" ? SAMPLE_ACTS : actsLive; }
function pe(actId: string): PertEntry {
  const st = state();
  if (!st.byActivity[actId]) st.byActivity[actId] = { o: "", m: "", mAuto: true, p: "" };
  return st.byActivity[actId];
}

// ---------- utilidades ----------
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function setStatus(m: string): void { (document.getElementById("statusLeft") as HTMLElement).textContent = m; }
function normalizeState(obj: any): PertModule {
  obj = obj || {};
  const by: Record<string, PertEntry> = {}, src = obj.byActivity || {};
  Object.keys(src).forEach((k) => {
    const e = src[k] || {};
    by[k] = { o: e.o == null ? "" : e.o, m: e.m == null ? "" : e.m, mAuto: e.mAuto !== false, p: e.p == null ? "" : e.p };
  });
  return { byActivity: by, inputMode: obj.inputMode === "pct" ? "pct" : "dias" };
}
function fmt(v: number | null | undefined, dec: number): string { return v == null || !isFinite(v) ? "—" : Number(v).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: dec }); }
function round2(v: number): number { return Math.round(v * 100) / 100; }

// parser numérico tolerante (coma decimal y miles, como Excel)
function parseExcelNum(s: unknown): string | null {
  let str = String(s == null ? "" : s).trim().replace(/[\s ]/g, "");
  if (!str) return "";
  const hasDot = str.indexOf(".") !== -1, hasComma = str.indexOf(",") !== -1;
  if (hasDot && hasComma) {
    if (str.lastIndexOf(".") > str.lastIndexOf(",")) str = str.replace(/,/g, "");
    else str = str.replace(/\./g, "").replace(/,/g, ".");
  } else if (hasComma) {
    const parts = str.split(",");
    const allThousands = parts.length >= 2 && parts.slice(1).every((p) => p.length === 3 && /^\d+$/.test(p));
    str = allThousands ? parts.join("") : parts.join(".");
  }
  const n = Number(str);
  return isFinite(n) ? String(n) : null;
}
function numVal(v: unknown): number {
  if (v === "" || v == null) return NaN;
  const p = parseExcelNum(v);
  return (p === null || p === "") ? NaN : Number(p);
}

// Duración base: misma fórmula que Definir las Actividades (fuente única)
function durActivity(a: ActivityItem): number | null {
  const met = numVal(a.qty), r = numVal(a.perf);
  let eq = numVal(a.teams);
  if (!isFinite(met) || met <= 0 || !isFinite(r) || r <= 0) return null;
  if (!isFinite(eq) || eq < 1) eq = 1;
  return Math.ceil(met / (eq * r));
}

// ---------- modal ----------
interface ShowModalOpts { title?: string; message?: string; confirmText?: string; cancelText?: string | null; danger?: boolean; }
function showModal(opts: ShowModalOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = document.getElementById("modalOverlay") as HTMLElement;
    (document.getElementById("modalTitle") as HTMLElement).textContent = opts.title || "";
    (document.getElementById("modalMsg") as HTMLElement).textContent = opts.message || "";
    const ok = document.getElementById("modalOk") as HTMLButtonElement, cancel = document.getElementById("modalCancel") as HTMLButtonElement;
    ok.textContent = opts.confirmText || "Aceptar";
    ok.className = "btn " + (opts.danger ? "danger" : "primary");
    cancel.style.display = opts.cancelText === null ? "none" : "";
    cancel.textContent = opts.cancelText || "Cancelar";
    function done(v: boolean) { ov.classList.remove("open"); ok.onclick = cancel.onclick = null; ov.onclick = null; document.removeEventListener("keydown", key); resolve(v); }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { done(false); return; }
      if (e.key === "Enter") { done(true); return; }
      if (e.key !== "Tab") return;
      // Trap de foco: Tab no debe escapar del modal hacia el fondo de la página.
      const card = ov.querySelector(".modal-card") as HTMLElement;
      const f = Array.from(card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    ok.onclick = () => { done(true); };
    cancel.onclick = () => { done(false); };
    ov.onclick = (e) => { if (e.target === ov) done(false); };
    document.addEventListener("keydown", key);
    ov.classList.add("open"); ok.focus();
  });
}
function showConfirm(m: string, t?: string): Promise<boolean> { return showModal({ title: t || "Confirmar acción", message: m, confirmText: "Continuar", cancelText: "Cancelar" }); }
function showAlert(m: string, t?: string): Promise<boolean> { return showModal({ title: t || "Aviso", message: m, confirmText: "Entendido", cancelText: null }); }

// ---------- modelo de filas (numeración consecutiva estilo MS Project) ----------
interface TreeRow { kind: "phase" | "package"; id: string; code: string; name: string; depth: number; }
function treeRows(): TreeRow[] {
  const w = wbsData(), out: TreeRow[] = [];
  if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
  (function walk(id: string, code: string, depth: number): void {
    const n = w.nodes[id]; if (!n) return;
    const kids = n.children || [];
    if (id !== w.rootId) out.push({ kind: kids.length ? "phase" : "package", id, code, name: n.name || "", depth });
    kids.forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1), depth + 1));
  })(w.rootId, "", 0);
  return out;
}

interface CalcResult {
  entry: PertEntry; dur: number | null; m: number | null; mAuto: boolean;
  oDays: number | null; pDays: number | null; te: number | null; sd: number | null; va: number | null;
  complete: boolean; valid: boolean;
}

// Cálculo por actividad: M efectiva (auto = Dur base), O/P en días según el
// modo de ingreso, TE/σ/σ² y validez (O ≤ M ≤ P).
function calc(a: ActivityItem): CalcResult {
  const e: PertEntry = state().byActivity[a.id] || { o: "", m: "", mAuto: true, p: "" };
  const dur = durActivity(a);
  const m = (e.mAuto !== false && dur != null) ? dur : (isFinite(numVal(e.m)) ? numVal(e.m) : null);
  const mAuto = e.mAuto !== false;
  const oRaw = numVal(e.o), pRaw = numVal(e.p);
  const pct = state().inputMode === "pct";
  const o = isFinite(oRaw) ? (pct ? (m != null ? oRaw / 100 * m : null) : oRaw) : null;
  const p = isFinite(pRaw) ? (pct ? (m != null ? pRaw / 100 * m : null) : pRaw) : null;
  const complete = o != null && m != null && p != null && o > 0;
  const valid = complete && (o as number) <= (m as number) && (m as number) <= (p as number);
  let te: number | null = null, sd: number | null = null, va: number | null = null;
  if (complete) { te = ((o as number) + 4 * (m as number) + (p as number)) / 6; sd = ((p as number) - (o as number)) / 6; va = sd * sd; }
  return { entry: e, dur, m, mAuto, oDays: o, pDays: p, te, sd, va, complete, valid };
}

interface FullRow {
  kind: "project" | "phase" | "package" | "activity";
  n: number; code: string; name?: string; depth?: number; count?: number;
  a?: ActivityItem; c?: CalcResult;
}

function fullRows(): FullRow[] {
  const acts = actsData(), out: FullRow[] = [];
  const w = wbsData();
  if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
  const byLeaf = (acts && acts.byLeaf) || {};
  let n = 0;
  const rootName = ((w.nodes[w.rootId].name || "").trim()) || (document.getElementById("projectTitle") as HTMLInputElement).value || "Proyecto";
  out.push({ kind: "project", n: n++, code: "0", name: rootName });
  treeRows().forEach((r) => {
    if (r.kind === "phase") { out.push({ kind: "phase", n: n++, code: r.code, name: r.name, depth: r.depth }); return; }
    const list = byLeaf[r.id] || [];
    out.push({ kind: "package", n: n++, code: r.code, name: r.name, depth: r.depth, count: list.length });
    list.forEach((a, i) => { out.push({ kind: "activity", n: n++, code: r.code + "." + (i + 1), a, c: calc(a) }); });
  });
  return out;
}

// ---------- render ----------
let actsCache: FullRow[] = [];
interface CellCoord { r: number; f: number; }
let selAnchor: CellCoord | null = null, selEnd: CellCoord | null = null;
const PASTE_FIELDS = ["o", "m", "p"] as const;
type PasteField = typeof PASTE_FIELDS[number];

function render(): void {
  const chip = document.getElementById("modeChip") as HTMLElement;
  chip.textContent = mode === "sample" ? "MODO EJEMPLO" : "Actividades del proyecto";
  chip.className = "mode-chip " + (mode === "sample" ? "sample" : "live");
  (document.getElementById("btnSample") as HTMLElement).style.display = mode === "sample" ? "none" : "";
  (document.getElementById("btnLive") as HTMLElement).style.display = mode === "sample" ? "" : "none";
  (document.getElementById("btnReload") as HTMLButtonElement).disabled = mode === "sample";
  (document.getElementById("inputModeSel") as HTMLSelectElement).value = state().inputMode;
  const pctMode = state().inputMode === "pct";
  (document.getElementById("thO") as HTMLElement).textContent = pctMode ? "O (% M)" : "O (días)";
  (document.getElementById("thP") as HTMLElement).textContent = pctMode ? "P (% M)" : "P (días)";
  (document.getElementById("thO") as HTMLElement).title = pctMode ? "Optimista como porcentaje de M (85 = 85% de M)" : "Duración optimista, en días";
  (document.getElementById("thP") as HTMLElement).title = pctMode ? "Pesimista como porcentaje de M (140 = 140% de M)" : "Duración pesimista, en días";
  renderTable();
  renderSidebar();
  renderProbability();
  renderOrphans();
}

function renderTable(): void {
  const tbody = document.getElementById("actsBody") as HTMLElement;
  const empty = document.getElementById("emptyState") as HTMLElement;
  const rows = fullRows();
  actsCache = rows.filter((r) => r.kind === "activity");
  selAnchor = null; selEnd = null;

  const hasActs = actsCache.length > 0;
  if (!rows.length || !hasActs) {
    tbody.innerHTML = "";
    empty.style.display = "";
    empty.innerHTML = mode === "live"
      ? "<b>El proyecto aún no tiene actividades.</b><br>El análisis PERT trabaja sobre las actividades definidas (con sus metrados y rendimientos) en Definir las Actividades.<br><a class=\"btn\" href=\"Activity_Definition.html\">☰ Abrir Definir las Actividades</a><button class=\"btn primary\" id=\"btnSampleInner\">Explorar con el modo ejemplo</button>"
      : "<b>Sin actividades de ejemplo.</b>";
    const bi = document.getElementById("btnSampleInner");
    if (bi) bi.addEventListener("click", enterSample);
    return;
  }
  empty.style.display = "none";

  const pct = state().inputMode === "pct";
  let html = "";
  rows.forEach((r) => {
    if (r.kind === "project") {
      html += '<tr class="proj-row"><td class="n-cell">0</td><td class="code-cell" style="color:var(--ink-1)">0</td><td colspan="7">' + esc(r.name) + '</td><td style="text-align:center"><span class="proj-hint">Fila 0</span></td></tr>';
    } else if (r.kind === "phase") {
      html += '<tr class="phase-row"><td class="n-cell">' + r.n + '</td><td class="code-cell">' + esc(r.code) + '</td><td colspan="8" style="padding-left:' + (10 + Math.max(0, (r.depth as number) - 1) * 16) + 'px">' + esc(r.name) + '</td></tr>';
    } else if (r.kind === "package") {
      html += '<tr class="pkg-row"><td class="n-cell">' + r.n + '</td><td class="pk-code">' + esc(r.code) + '</td>'
        + '<td colspan="8" style="padding-left:' + (8 + Math.max(0, (r.depth as number) - 1) * 16) + 'px"><span class="pk-name">' + esc(r.name) + '</span><span class="pk-count">' + r.count + ' act.</span></td></tr>';
    } else {
      const a = r.a as ActivityItem, c = r.c as CalcResult, e = c.entry;
      const mShown = c.mAuto ? (c.dur == null ? "" : c.dur) : e.m;
      html += '<tr class="act-row' + (c.complete && !c.valid ? ' row-invalid" title="Terna inválida: debe cumplirse O ≤ M ≤ P (en días). Corrige los valores."' : '"') + ' data-act="' + esc(a.id) + '">'
        + '<td class="n-cell">' + r.n + '</td>'
        + '<td class="act-code">' + esc(r.code) + '</td>'
        + '<td><span class="act-name">' + esc(a.name || "— sin nombre —") + '</span><span class="act-unit">' + esc(a.unit || "") + (a.qty ? " · " + esc(a.qty) : "") + '</span></td>'
        + '<td class="durbase" title="Met ÷ (#Eq × R) del módulo Definir las Actividades">' + (c.dur == null ? "—" : c.dur) + '</td>'
        + '<td class="in-cell"><input data-act="' + esc(a.id) + '" data-f="o" value="' + esc(e.o) + '" inputmode="decimal" placeholder="' + (pct ? "% M" : "días") + '"></td>'
        + '<td class="in-cell"><input data-act="' + esc(a.id) + '" data-f="m" class="' + (c.mAuto ? "m-auto" : "") + '" value="' + esc(mShown) + '" inputmode="decimal" title="' + (c.mAuto ? "M automática: sigue a la Dur base. Escribe para fijarla; bórrala para volver al automático." : "M fijada a mano. Borra el valor para que vuelva a seguir a la Dur base.") + '"></td>'
        + '<td class="in-cell"><input data-act="' + esc(a.id) + '" data-f="p" value="' + esc(e.p) + '" inputmode="decimal" placeholder="' + (pct ? "% M" : "días") + '"></td>'
        + '<td class="der-cell' + (c.te == null ? ' empty' : '') + '" data-der="te">' + fmt(c.te, 1) + '</td>'
        + '<td class="der-cell' + (c.sd == null ? ' empty' : '') + '" data-der="sd">' + fmt(c.sd, 2) + '</td>'
        + '<td class="der-cell' + (c.va == null ? ' empty' : '') + '" data-der="va">' + fmt(c.va, 2) + '</td>'
        + '</tr>';
    }
  });
  tbody.innerHTML = html;
}

// refresco EN VIVO de una fila (sin re-render: no perder el foco)
function refreshRow(actId: string): void {
  const row = document.querySelector('#actsBody tr[data-act="' + actId + '"]');
  if (!row) return;
  let a: ActivityItem | null = null;
  for (let i = 0; i < actsCache.length; i++) if ((actsCache[i].a as ActivityItem).id === actId) { a = actsCache[i].a as ActivityItem; actsCache[i].c = calc(a); break; }
  if (!a) return;
  const c = calc(a);
  const set = (key: string, val: number | null, dec: number) => {
    const td = row.querySelector('[data-der="' + key + '"]');
    if (td) { td.textContent = fmt(val, dec); td.className = "der-cell" + (val == null ? " empty" : ""); }
  };
  set("te", c.te, 1); set("sd", c.sd, 2); set("va", c.va, 2);
  row.classList.toggle("row-invalid", !!(c.complete && !c.valid));
  (row as HTMLElement).title = c.complete && !c.valid ? "Terna inválida: debe cumplirse O ≤ M ≤ P (en días). Corrige los valores." : "";
  const mInp = row.querySelector('input[data-f="m"]') as HTMLInputElement | null;
  if (mInp) {
    mInp.classList.toggle("m-auto", c.mAuto);
    if (c.mAuto && document.activeElement !== mInp) mInp.value = c.dur == null ? "" : String(c.dur);
  }
}

interface Stats { total: number; complete: number; invalid: number; sumTe: number; sumVar: number; sumDur: number; }
function stats(): Stats {
  let complete = 0, invalid = 0, sumTe = 0, sumVar = 0, sumDur = 0;
  actsCache.forEach((r) => {
    const c = calc(r.a as ActivityItem);
    if (c.dur != null) sumDur += c.dur;
    if (c.complete) { complete++; if (!c.valid) invalid++; else { sumTe += c.te as number; sumVar += c.va as number; } }
  });
  return { total: actsCache.length, complete, invalid, sumTe, sumVar, sumDur };
}

function renderSidebar(): void {
  const s = stats();
  (document.getElementById("sbTotal") as HTMLElement).textContent = String(s.complete);
  (document.getElementById("sbCov") as HTMLElement).textContent = s.complete + "/" + s.total + " actividades";
  const pctv = s.total ? Math.round(s.complete / s.total * 100) : 0;
  (document.getElementById("sbPct") as HTMLElement).textContent = pctv + "%";
  const bar = document.getElementById("sbBar") as HTMLElement;
  bar.style.width = pctv + "%";
  bar.style.background = s.invalid ? "var(--danger)" : (pctv >= 100 ? "var(--good)" : (pctv >= 50 ? "var(--warn)" : "var(--pe-a)"));
  const inv = document.getElementById("sbInvalid") as HTMLElement;
  if (s.invalid) { inv.style.display = ""; inv.textContent = "⚠ " + s.invalid + " terna(s) inválida(s): revisa que O ≤ M ≤ P (filas en rojo)."; }
  else inv.style.display = "none";
  (document.getElementById("sbSumDur") as HTMLElement).textContent = s.sumDur ? fmt(s.sumDur, 0) + " d" : "—";
  (document.getElementById("sbSumTe") as HTMLElement).textContent = s.complete - s.invalid > 0 ? fmt(s.sumTe, 1) + " d" : "—";
  (document.getElementById("sbSumVar") as HTMLElement).textContent = s.complete - s.invalid > 0 ? fmt(s.sumVar, 2) : "—";
}

// ---------- PROBABILIDAD PERT SOBRE LA RUTA CRÍTICA ----------
// Metodológicamente la probabilidad NO se calcula con la suma de todas las
// actividades, sino con la media y la varianza de la RUTA CRÍTICA.
// Aquí la ruta crítica se recalcula con las duraciones ESPERADAS (TE), no
// con las determinísticas: es el CPM probabilístico clásico del método PERT.
// Solo vale si las actividades críticas forman UNA cadena (GPI.util.
// pertCriticalChain): antes se sumaban todas las críticas aunque estuvieran en
// ramas paralelas (dos de 10 d hacia un hito daban 20 d de media y ~0 % de
// terminar en 10 d) y se omitían los desfases. Con ramas paralelas o
// convergentes no se inventa un número: se explica por qué no aplica.
function scheduleLinks(): ScheduleLink[] {
  if (mode === "sample") return SAMPLE_LINKS;
  try {
    const sc = (window.GPI && window.GPI.getModule) ? window.GPI.getModule("schedule") : null;
    return (sc && Array.isArray(sc.links)) ? sc.links : [];
  } catch (e) { return []; }
}

type CriticalPathStats =
  | null
  | { reason: "no-links" | "no-te" | "cycle" | "no-path" | "inconsistent" | "elapsed" }
  | { reason: "parallel"; count: number }
  | { ids: string[]; names: string[]; te: number; va: number; duration: number; anyInvalid: number; missing: number; cpNoTe: number; elapsedApprox: boolean };

function criticalPathStats(): CriticalPathStats {
  if (!window.GPI || !window.GPI.util || !window.GPI.util.cpm) return null;
  const links = scheduleLinks();
  if (!links.length) return { reason: "no-links" };
  // Toda actividad entra a la red para no romper la cadena de precedencias.
  // Si su terna es inválida o está incompleta se usa la duración base
  // determinística y su varianza cuenta como 0: se avisa al alumno, pero la
  // ruta crítica sigue siendo la del cronograma real.
  const byId: Record<string, { te: number; va: number; est: boolean }> = {};
  const nodes: { id: string; dur: number }[] = [];
  let anyInvalid = 0, missing = 0, teCount = 0;
  actsCache.forEach((r) => {
    const c = r.c as CalcResult, useTe = c.complete && c.valid;
    if (c.complete && !c.valid) anyInvalid++;
    if (!c.complete) missing++;
    const d = useTe ? (c.te as number) : (c.dur != null ? c.dur : (c.m != null ? c.m : 0));
    byId[(r.a as ActivityItem).id] = { te: d, va: useTe ? (c.va as number) : 0, est: useTe };
    if (useTe) teCount++;
    nodes.push({ id: (r.a as ActivityItem).id, dur: d });
  });
  if (!teCount) return { reason: "no-te" };
  let cal = null;
  try { cal = window.GPI.util.projectCalendar(); } catch (e) { /* noop */ }
  // Los desfases en días transcurridos solo se pueden calcular sobre fechas
  // reales si hay fecha de inicio: la del proyecto (el modo ejemplo no tiene).
  let startDate = "";
  if (mode !== "sample") { try { const m = window.GPI.meta(); startDate = (m && m.startDate) || ""; } catch (e) { /* noop */ } }
  const res = window.GPI.util.cpm(nodes, links, cal, { startDate });
  if (!res || !res.ok) return { reason: "cycle" };
  if (!(res.criticalIds || []).length) return { reason: "no-path" };
  const vars: Record<string, number> = {}; Object.keys(byId).forEach((id) => { vars[id] = byId[id].va; });
  const ch = window.GPI.util.pertCriticalChain(res, links, cal, vars);
  if (!ch.ok) return ch.reason === "parallel" ? { reason: "parallel", count: res.criticalIds.length } : ch.reason === "empty" ? { reason: "no-path" } : ch.reason === "elapsed" ? { reason: "elapsed" } : { reason: "inconsistent" };
  // Media = duración del proyecto con TE (incluye desfases); varianza = la de las
  // actividades que de verdad deciden el fin (ver pertCriticalChain).
  const ids = ch.ids, te = ch.mean, va = ch.variance;
  let cpNoTe = 0; const names: string[] = [];
  ids.forEach((id) => {
    const c = byId[id]; if (!c) return;
    if (!c.est && ch.weights[id]) cpNoTe++;
    const row = actsCache.filter((r) => (r.a as ActivityItem).id === id)[0];
    names.push((row ? (row.a as ActivityItem).name || id : id) + (c.est ? "" : " *"));
  });
  return { ids, names, te, va, duration: res.projectDuration, anyInvalid, missing, cpNoTe, elapsedApprox: res.elapsedApprox };
}

let targetTouched = false;
function renderProbability(): void {
  const elTe = document.getElementById("sbCpTe"), elSd = document.getElementById("sbCpSd"),
    elZ = document.getElementById("sbCpZ"), elP = document.getElementById("sbCpProb"),
    elPath = document.getElementById("sbCpPath"), elT = document.getElementById("sbTarget") as HTMLInputElement;
  if (!elTe) return;
  function clear(msg: string): void {
    elTe!.textContent = elSd!.textContent = elZ!.textContent = elP!.textContent = "—";
    elPath!.innerHTML = msg;
  }
  const cp = criticalPathStats();
  if (!cp) { clear("Requiere <code>gpi-core.js</code>."); return; }
  if ("reason" in cp) {
    if (cp.reason === "no-links") { clear("Sin red de precedencias. Abre <b>Cronograma / CPM</b> y define las relaciones entre actividades para obtener la ruta crítica."); return; }
    if (cp.reason === "no-te") { clear("Ninguna actividad tiene una terna O–M–P válida todavía."); return; }
    if (cp.reason === "cycle") { clear("La red tiene un <b>ciclo</b>: el CPM no puede resolverse. Corrígelo en Cronograma / CPM."); return; }
    if (cp.reason === "elapsed") { clear("<b>No aplicable:</b> la ruta crítica tiene desfases en <b>días transcurridos</b>, que se calculan sobre fechas reales (fines de semana y feriados) y no son un tiempo fijo que sumar a la media PERT. Exprésalos en días laborables para obtener la probabilidad."); return; }
    if (cp.reason === "no-path" || cp.reason === "inconsistent") { clear("No se pudo determinar una ruta crítica única."); return; }
    if (cp.reason === "parallel") { clear("<b>No aplicable:</b> hay " + cp.count + " actividades críticas en ramas <b>paralelas o convergentes</b>. La probabilidad PERT de una sola ruta no vale ahí (subestima el riesgo: el fin depende de que <b>todas</b> las ramas terminen a tiempo); haría falta simular la red completa."); return; }
    return;
  }
  if (!targetTouched && (!elT.value || +elT.value <= 0)) elT.value = String(Math.ceil(cp.te) + 3);
  const target = +elT.value || Math.ceil(cp.te);
  const r = window.GPI!.util.pertProbability(cp.te, cp.va, target);
  elTe!.textContent = fmt(cp.te, 1) + " d";
  if (!r) {
    elSd!.textContent = "0.0 d"; elZ!.textContent = "—"; elP!.textContent = "—";
  } else {
    elSd!.textContent = fmt(r.sigma, 2) + " d";
    elZ!.textContent = fmt(r.z, 2);
    const pc = r.prob * 100;
    (elP as HTMLElement).textContent = pc.toFixed(1) + "%";
    (elP as HTMLElement).style.color = pc >= 80 ? "var(--good)" : (pc >= 50 ? "var(--warn)" : "var(--danger)");
  }
  let warn = "";
  if (cp.anyInvalid) warn += "<br>⚠ " + cp.anyInvalid + " terna(s) inválida(s) (debe cumplirse O ≤ M ≤ P).";
  if (cp.missing) warn += "<br>⚠ " + cp.missing + " actividad(es) sin terna completa.";
  if (cp.elapsedApprox) warn += "<br>⚠ Hay desfases en días transcurridos y el proyecto no tiene fecha de inicio: se aproximan con una proporción semanal. Define la fecha de inicio en el Panel para calcularlos sobre fechas reales.";
  if (cp.cpNoTe) warn += "<br>⚠ " + cp.cpNoTe + " actividad(es) de la ruta crítica (marcadas con *) entraron con su duración base y aportan σ² = 0: la probabilidad está <b>sobrestimada</b> hasta que completes su terna.";
  elPath!.innerHTML = "<b>Ruta crítica (" + cp.ids.length + " act.):</b> " + cp.names.map(esc).join(" → ") + warn;
}

function renderOrphans(): void {
  const st = state(), ids: Record<string, boolean> = {};
  actsCache.forEach((r) => { ids[(r.a as ActivityItem).id] = true; });
  const orphan = Object.keys(st.byActivity).filter((k) => {
    const e = st.byActivity[k];
    const hasData = (e.o !== "" || e.p !== "" || e.mAuto === false);
    return hasData && !ids[k];
  });
  const bn = document.getElementById("orphanBanner") as HTMLElement;
  if (!orphan.length) { bn.classList.remove("show"); bn.innerHTML = ""; return; }
  bn.classList.add("show");
  bn.innerHTML = "<b>⚠ " + orphan.length + " terna(s) huérfana(s):</b> su actividad ya no existe en Definir las Actividades. "
    + '<button class="btn sm danger" id="btnOrphans">Eliminar huérfanas</button>';
  (document.getElementById("btnOrphans") as HTMLElement).addEventListener("click", async () => {
    const ok = await showConfirm("Se eliminarán las " + orphan.length + " ternas huérfanas.", "Eliminar ternas huérfanas");
    if (!ok) return;
    orphan.forEach((k) => { delete st.byActivity[k]; });
    onDirty(true);
  });
}

let dirtyTimer: ReturnType<typeof setTimeout> | undefined;
function onDirty(rerender: boolean): void {
  if (rerender) render(); else renderSidebar();
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(gpiPush, 800);
  setStatus("Cambios sin exportar — se sincronizan solos con el Panel.");
}

// ---------- cambio de modo de ingreso (días ↔ % de M) ----------
async function switchInputMode(newMode: "dias" | "pct"): Promise<void> {
  const st = state();
  if (newMode === st.inputMode) return;
  const label = newMode === "pct" ? "porcentaje de M" : "días";
  const ok = await showConfirm("Los valores de O y P ya ingresados se CONVERTIRÁN a " + label + " usando la M de cada actividad, de modo que el análisis no cambia. En modo % de M, O y P escalan solos cuando la M automática cambia con los metrados. ¿Continuar?", "Cambiar el modo de ingreso");
  if (!ok) { (document.getElementById("inputModeSel") as HTMLSelectElement).value = st.inputMode; return; }
  actsCache.forEach((r) => {
    const e = st.byActivity[(r.a as ActivityItem).id];
    if (!e) return;
    const c = calc(r.a as ActivityItem);
    if (c.m == null || c.m <= 0) return;
    (["o", "p"] as const).forEach((f) => {
      const v = numVal(e[f]);
      if (!isFinite(v)) return;
      e[f] = String(newMode === "pct" ? round2(v / (c.m as number) * 100) : round2(v * (c.m as number) / 100));
    });
  });
  st.inputMode = newMode;
  onDirty(true);
  setStatus("Modo de ingreso: " + (newMode === "pct" ? "O y P como % de M (escalan con la M automática)." : "O y P en días."));
}

// ---------- grilla: navegación, selección, copiado ----------
function cellCoord(el: HTMLInputElement): CellCoord | null {
  const f = PASTE_FIELDS.indexOf(el.dataset.f as PasteField);
  if (f === -1) return null;
  for (let r = 0; r < actsCache.length; r++) if ((actsCache[r].a as ActivityItem).id === el.dataset.act) return { r, f };
  return null;
}
function cellInput(r: number, f: number): HTMLInputElement | null {
  const it = actsCache[r];
  if (!it || !PASTE_FIELDS[f]) return null;
  return document.querySelector('input[data-act="' + (it.a as ActivityItem).id + '"][data-f="' + PASTE_FIELDS[f] + '"]');
}
function clearSelection(): void { selEnd = null; paintSelection(); }
function paintSelection(): void {
  document.querySelectorAll("#actsBody td.sel").forEach((td) => td.classList.remove("sel"));
  if (!selAnchor || !selEnd) return;
  const r1 = Math.min(selAnchor.r, selEnd.r), r2 = Math.max(selAnchor.r, selEnd.r);
  const f1 = Math.min(selAnchor.f, selEnd.f), f2 = Math.max(selAnchor.f, selEnd.f);
  for (let r = r1; r <= r2; r++) for (let f = f1; f <= f2; f++) {
    const inp = cellInput(r, f);
    if (inp) (inp.closest("td") as HTMLElement).classList.add("sel");
  }
}
function selectionTsv(): string | null {
  if (!selAnchor || !selEnd) return null;
  const r1 = Math.min(selAnchor.r, selEnd.r), r2 = Math.max(selAnchor.r, selEnd.r);
  const f1 = Math.min(selAnchor.f, selEnd.f), f2 = Math.max(selAnchor.f, selEnd.f);
  const lines: string[] = [];
  for (let r = r1; r <= r2; r++) {
    const it = actsCache[r], c = calc(it.a as ActivityItem), e = state().byActivity[(it.a as ActivityItem).id] || { o: "", m: "", p: "", mAuto: true };
    const cells: string[] = [];
    for (let f = f1; f <= f2; f++) {
      const fd = PASTE_FIELDS[f];
      const v = fd === "m" ? (c.mAuto ? (c.dur == null ? "" : c.dur) : e.m) : e[fd];
      cells.push(v == null ? "" : String(v));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}
function moveTo(r: number, f: number): boolean {
  const inp = cellInput(r, f);
  if (!inp) return false;
  inp.focus();
  try { inp.select(); } catch (_) { /* noop */ }
  return true;
}
function caretAtStart(el: HTMLInputElement): boolean { try { return el.selectionStart === 0 && el.selectionEnd === 0; } catch (_) { return false; } }
function caretAtEnd(el: HTMLInputElement): boolean { try { return el.selectionStart === el.value.length && el.selectionEnd === el.value.length; } catch (_) { return false; } }

function setField(actId: string, f: PasteField, rawVal: string): void {
  const e = pe(actId);
  if (f === "m") {
    if (String(rawVal).trim() === "") { e.m = ""; e.mAuto = true; }
    else { e.m = rawVal; e.mAuto = false; }
  } else {
    e[f] = rawVal;
  }
}

function wireGrid(): void {
  const tbody = document.getElementById("actsBody") as HTMLElement;

  tbody.addEventListener("input", (ev) => {
    const el = (ev.target as HTMLElement).closest ? (ev.target as HTMLElement).closest("input[data-act]") as HTMLInputElement | null : null;
    if (!el) return;
    setField(el.dataset.act as string, el.dataset.f as PasteField, el.value);
    refreshRow(el.dataset.act as string);
    onDirty(false);
  });

  tbody.addEventListener("keydown", (ev) => {
    const el = (ev.target as HTMLElement).closest ? (ev.target as HTMLElement).closest("input[data-act]") as HTMLInputElement | null : null;
    if (!el) return;
    const c = cellCoord(el);
    if (!c) return;
    const e = ev as KeyboardEvent;
    if (e.key === "Enter") { e.preventDefault(); moveTo(c.r + 1, c.f) || el.blur(); return; }
    if (e.key === "ArrowDown" && !e.shiftKey) { e.preventDefault(); moveTo(c.r + 1, c.f); return; }
    if (e.key === "ArrowUp" && !e.shiftKey) { e.preventDefault(); moveTo(c.r - 1, c.f); return; }
    if (e.key === "ArrowRight" && !e.shiftKey && caretAtEnd(el)) { if (moveTo(c.r, c.f + 1)) e.preventDefault(); return; }
    if (e.key === "ArrowLeft" && !e.shiftKey && caretAtStart(el)) { if (moveTo(c.r, c.f - 1)) e.preventDefault(); return; }
    if (e.key === "Escape") { clearSelection(); return; }
  });

  tbody.addEventListener("mousedown", (ev) => {
    const el = (ev.target as HTMLElement).closest ? (ev.target as HTMLElement).closest("input[data-act]") as HTMLInputElement | null : null;
    if (!el) return;
    if ((ev as MouseEvent).shiftKey && selAnchor) {
      ev.preventDefault();
      const c = cellCoord(el);
      if (c) { selEnd = c; paintSelection(); }
    }
  });
  tbody.addEventListener("focusin", (ev) => {
    const el = (ev.target as HTMLElement).closest ? (ev.target as HTMLElement).closest("input[data-act]") as HTMLInputElement | null : null;
    if (!el) return;
    const c = cellCoord(el);
    if (c) { selAnchor = c; clearSelection(); }
  });
  tbody.addEventListener("copy", (ev) => {
    const tsv = selectionTsv();
    if (tsv == null || !(ev as ClipboardEvent).clipboardData) return;
    (ev as ClipboardEvent).clipboardData!.setData("text/plain", tsv);
    ev.preventDefault();
    setStatus("Rango copiado — pégalo en Excel o en otra parte de la tabla.");
  });
  tbody.addEventListener("paste", (ev) => {
    const el = (ev.target as HTMLElement).closest ? (ev.target as HTMLElement).closest("input[data-act]") as HTMLInputElement | null : null;
    if (!el || !(ev as ClipboardEvent).clipboardData) return;
    const text = (ev as ClipboardEvent).clipboardData!.getData("text/plain") || "";
    if (text.indexOf("\t") === -1 && !/\r?\n./.test(text)) return;
    ev.preventDefault();
    applyGrid(text, el);
  });
  tbody.addEventListener("contextmenu", onContextMenu as EventListener);
}

// Distribuye un bloque TSV (de Excel) desde la celda ancla hacia abajo y
// hacia la derecha (O → M → P). Celdas vacías o no numéricas no pisan datos.
function applyGrid(text: string, anchorEl: HTMLInputElement): void {
  const grid = text.replace(/\r/g, "").split("\n");
  while (grid.length && grid[grid.length - 1] === "") grid.pop();
  if (!grid.length) return;
  const start = cellCoord(anchorEl);
  if (!start) return;
  let applied = 0, skipped = 0;
  grid.forEach((line, ri) => {
    const target = actsCache[start.r + ri];
    if (!target) { skipped++; return; }
    line.split("\t").forEach((raw, ci) => {
      const f = PASTE_FIELDS[start.f + ci];
      if (!f) return;
      const val = parseExcelNum(raw);
      if (val === null) { if (String(raw).trim()) skipped++; return; }
      if (val === "") return;
      setField((target.a as ActivityItem).id, f, val);
      applied++;
    });
  });
  onDirty(true);
  setStatus("Pegado desde Excel: " + applied + " valor(es)" + (skipped ? " · " + skipped + " celda(s) omitida(s)" : "") + ".");
}

// ---------- MENÚ CONTEXTUAL (clic derecho sobre una celda O/M/P) ----------
function onContextMenu(ev: MouseEvent): void {
  const el = (ev.target as HTMLElement).closest ? (ev.target as HTMLElement).closest("input[data-act]") as HTMLInputElement | null : null;
  if (!el) return;
  ev.preventDefault();
  el.focus();
  const actId = el.dataset.act as string;
  const e = state().byActivity[actId];
  const menu = document.getElementById("ctxMenu") as HTMLElement;
  const canRead = !!(navigator.clipboard && navigator.clipboard.readText);
  const hasRange = !!(selAnchor && selEnd);
  menu.innerHTML =
    '<div class="ctx-item' + (canRead ? '' : ' disabled') + '" data-cmd="paste">📋 Pegar desde Excel aquí' + (canRead ? '' : ' <span style="font-weight:500">(usa Ctrl+V)</span>') + '</div>'
    + '<div class="ctx-item' + (hasRange ? '' : ' disabled') + '" data-cmd="copyRange">⧉ Copiar rango seleccionado</div>'
    + '<div class="ctx-item" data-cmd="copyTable">⧉ Copiar toda la tabla</div>'
    + '<div class="ctx-sep"></div>'
    + '<div class="ctx-item' + (e && e.mAuto === false ? '' : ' disabled') + '" data-cmd="mAuto">↺ M automática (volver a seguir la Dur)</div>'
    + '<div class="ctx-item" data-cmd="clearRow">✕ Limpiar O/M/P de esta actividad</div>';
  menu.classList.add("open");
  const x = Math.min(ev.clientX, window.innerWidth - menu.offsetWidth - 8);
  const y = Math.min(ev.clientY, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = x + "px"; menu.style.top = y + "px";

  menu.onclick = async (me) => {
    const item = (me.target as HTMLElement).closest(".ctx-item") as HTMLElement | null;
    if (!item || item.classList.contains("disabled")) return;
    hideCtx();
    const cmd = item.dataset.cmd;
    if (cmd === "paste") {
      try {
        const text = await navigator.clipboard.readText();
        if (!text || (text.indexOf("\t") === -1 && !/\r?\n./.test(text))) {
          const v = parseExcelNum(text);
          if (v !== null && v !== "") { setField(actId, el.dataset.f as PasteField, v); onDirty(true); setStatus("Valor pegado."); }
          else await showAlert("El portapapeles no contiene datos de celdas. Copia un bloque en Excel y vuelve a intentar (o usa Ctrl+V).");
          return;
        }
        applyGrid(text, el);
      } catch (_) {
        await showAlert("El navegador no permitió leer el portapapeles desde el menú. Usa Ctrl+V directamente sobre la celda: funciona igual.");
      }
    } else if (cmd === "copyRange") {
      copyText(selectionTsv(), "Rango copiado al portapapeles.");
    } else if (cmd === "copyTable") {
      copyWholeTable();
    } else if (cmd === "mAuto") {
      setField(actId, "m", "");
      onDirty(true);
      setStatus("M vuelve al modo automático: seguirá a la Dur base cuando cambien metrados o rendimientos.");
    } else if (cmd === "clearRow") {
      delete state().byActivity[actId];
      onDirty(true);
      setStatus("Terna O/M/P limpiada — M queda en automático.");
    }
  };
}
function hideCtx(): void { const m = document.getElementById("ctxMenu") as HTMLElement; m.classList.remove("open"); m.onclick = null; }
document.addEventListener("click", (e) => { if (!(e.target as HTMLElement).closest || !(e.target as HTMLElement).closest("#ctxMenu")) hideCtx(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCtx(); });
window.addEventListener("scroll", hideCtx, true);

function copyText(text: string | null, okMsg: string): void {
  if (text == null) return;
  function done() { setStatus(okMsg); }
  function legacy() {
    const ta = document.createElement("textarea");
    ta.value = text as string; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (_) { setStatus("No se pudo copiar al portapapeles."); }
    ta.remove();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, legacy);
  else legacy();
}
function copyWholeTable(): void {
  const rows = fullRows();
  if (!rows.length) { setStatus("No hay tabla que copiar."); return; }
  const pct = state().inputMode === "pct";
  const lines = ["Id.\tEDT\tActividad\tDur base\tO" + (pct ? " (%M)" : " (días)") + "\tM (días)\tP" + (pct ? " (%M)" : " (días)") + "\tTE\tσ\tσ²"];
  rows.forEach((r) => {
    if (r.kind === "activity") {
      const c = r.c as CalcResult, e = c.entry;
      lines.push([r.n, r.code, (r.a as ActivityItem).name || "", c.dur == null ? "" : c.dur,
        e.o, c.mAuto ? (c.dur == null ? "" : c.dur) : e.m, e.p,
        c.te == null ? "" : round2(c.te), c.sd == null ? "" : round2(c.sd), c.va == null ? "" : round2(c.va)].join("\t"));
    } else {
      lines.push([r.n, r.code, r.name, "", "", "", "", "", "", ""].join("\t"));
    }
  });
  copyText(lines.join("\n"), "Tabla copiada al portapapeles (" + rows.length + " filas + encabezado): pégala en Excel con Ctrl+V.");
}

// ---------- REPORTE ----------
function reportShell(docTitle: string, moduleName: string, bodyHtml: string): void {
  const el = document.getElementById("gpiReport") as HTMLElement;
  let meta: Partial<ProjectMeta> = {};
  try { const m = window.GPI && window.GPI.available() ? window.GPI.meta() : null; if (m) meta = m; } catch (_) { /* noop */ }
  const pName = (document.getElementById("projectTitle") as HTMLInputElement).value || meta.name || "Proyecto";
  const course = (document.getElementById("courseTitle") as HTMLInputElement).value || meta.course || "Gestión de Proyectos de Ingeniería";
  const today = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  el.innerHTML =
    '<div class="rep-head"><div><h1>' + esc(docTitle) + '</h1>'
    + '<div class="sub">' + esc(pName) + (meta.code ? ' · ' + esc(meta.code) : '') + '</div>'
    + '<div class="sub" style="font-weight:500">' + esc(course) + '</div></div>'
    + '<div class="rep-meta">' + esc(moduleName) + '<br>Emitido: ' + esc(today)
    + (meta.client ? '<br>Cliente: ' + esc(meta.client) : '')
    + (meta.location ? '<br>' + esc(meta.location) : '') + '</div></div>'
    + bodyHtml;
  document.body.classList.add("report-mode");
  function repDone() { document.body.classList.remove("report-mode"); window.removeEventListener("afterprint", repDone); }
  window.addEventListener("afterprint", repDone);
  setTimeout(() => { window.print(); setTimeout(repDone, 500); }, 60);
}
function buildReport(): void {
  const s = stats();
  const pct = state().inputMode === "pct";
  let body = (mode === "sample" ? '<p class="rep-note"><b>Modo ejemplo:</b> este análisis usa las actividades didácticas, no los datos del proyecto activo.</p>' : '')
    + '<h2>1. Resumen del análisis</h2><table class="rep-kv">'
    + '<tr><td>Actividades con terna O–M–P</td><td><b>' + s.complete + '</b> de ' + s.total + (s.invalid ? ' · <b style="color:#c0273f">' + s.invalid + ' inválida(s) (O ≤ M ≤ P roto)</b>' : '') + '</td></tr>'
    + '<tr><td>Modo de ingreso de O y P</td><td>' + (pct ? "Porcentaje de M (escalan con la M automática)" : "Días") + '</td></tr>'
    + '<tr><td>Σ Dur base (determinística)</td><td>' + fmt(s.sumDur, 0) + ' días</td></tr>'
    + '<tr><td>Σ TE (esperada PERT)</td><td><b>' + fmt(s.sumTe, 1) + ' días</b> — suma simple de todas las actividades válidas</td></tr>'
    + '<tr><td>Σ σ² (varianza)</td><td>' + fmt(s.sumVar, 2) + '</td></tr>'
    + '<tr><td>Probabilidad de cumplimiento</td><td>Pendiente de la ruta crítica: se activa con el módulo Cronograma/CPM (Z = (plazo − ΣTE) / √Σσ² sobre la ruta).</td></tr>'
    + '</table>'
    + '<h2>2. Análisis por actividad</h2>'
    + '<p class="rep-note">TE = (O + 4M + P) / 6 · σ = (P − O) / 6 · σ² = σ². La M automática sigue a la duración determinística Dur = Met ÷ (#Eq × R) del módulo Definir las Actividades; las M fijadas a mano se marcan con *. Valores de O/M/P mostrados en días. El Id de cada fila coincide con el de Cronograma/CPM siempre, y con el de Definir las Actividades/Estimar los Costos hasta el primer hito del proyecto (este análisis no incluye hitos).</p>'
    + '<table><tr><th style="width:5%">Id.</th><th style="width:9%">EDT</th><th>Actividad</th><th style="width:7%">Dur</th><th style="width:7%">O</th><th style="width:7%">M</th><th style="width:7%">P</th><th style="width:7%">TE</th><th style="width:7%">σ</th><th style="width:7%">σ²</th></tr>';
  fullRows().forEach((r) => {
    if (r.kind === "project") {
      body += '<tr><td class="num rep-phase" style="text-align:center">0</td><td class="num rep-phase">0</td><td class="rep-phase" colspan="8">' + esc(r.name) + '</td></tr>';
    } else if (r.kind === "phase") {
      body += '<tr><td class="num rep-phase" style="text-align:center">' + r.n + '</td><td class="num rep-phase">' + esc(r.code) + '</td><td class="rep-phase" colspan="8">' + esc(r.name) + '</td></tr>';
    } else if (r.kind === "package") {
      body += '<tr><td class="num rep-pkg" style="text-align:center">' + r.n + '</td><td class="num rep-pkg">' + esc(r.code) + '</td><td class="rep-pkg" colspan="8">' + esc(r.name) + '</td></tr>';
    } else {
      const c = r.c as CalcResult, a = r.a as ActivityItem;
      const bad = c.complete && !c.valid;
      const cls = bad ? ' class="rep-bad"' : '';
      body += '<tr><td' + cls + ' style="text-align:center" class="num' + (bad ? ' rep-bad' : '') + '">' + r.n + '</td>'
        + '<td class="num' + (bad ? ' rep-bad' : '') + '">' + esc(r.code) + '</td>'
        + '<td' + cls + '>' + esc(a.name || "—") + (bad ? ' <b>⚠ O ≤ M ≤ P</b>' : '') + '</td>'
        + '<td class="num' + (bad ? ' rep-bad' : '') + '" style="text-align:center">' + (c.dur == null ? "—" : c.dur) + '</td>'
        + '<td class="num' + (bad ? ' rep-bad' : '') + '" style="text-align:center">' + fmt(c.oDays, 1) + '</td>'
        + '<td class="num' + (bad ? ' rep-bad' : '') + '" style="text-align:center">' + fmt(c.m, 1) + (c.mAuto ? "" : "*") + '</td>'
        + '<td class="num' + (bad ? ' rep-bad' : '') + '" style="text-align:center">' + fmt(c.pDays, 1) + '</td>'
        + '<td class="num' + (bad ? ' rep-bad' : '') + '" style="text-align:center"><b>' + fmt(c.te, 1) + '</b></td>'
        + '<td class="num' + (bad ? ' rep-bad' : '') + '" style="text-align:center">' + fmt(c.sd, 2) + '</td>'
        + '<td class="num' + (bad ? ' rep-bad' : '') + '" style="text-align:center">' + fmt(c.va, 2) + '</td></tr>';
    }
  });
  body += '</table>';
  reportShell("Análisis PERT de Duraciones", "PERT · Gestión del Cronograma", body);
}

// ---------- EJEMPLO (autocontenido, nunca toca el proyecto) ----------
const SAMPLE_WBS: WbsModule & { ids: Record<string, string> } = (function () {
  const nodes: WbsModule["nodes"] = {}; let k = 0;
  function N(parentId: string | null, name: string): string {
    const id = "w" + (++k);
    nodes[id] = { id, parentId: parentId ?? undefined, name, children: [] };
    if (parentId) (nodes[parentId].children as string[]).push(id);
    return id;
  }
  const root = N(null, "Proyecto DISTRIB+ S.A. — Almacén Lurín");
  const f2 = N(root, "Ingeniería y Diseño");
  const p21 = N(f2, "Estudio de suelos"), p22 = N(f2, "Diseño estructural");
  const f4 = N(root, "Construcción");
  const p41 = N(f4, "Movimiento de tierras"), p42 = N(f4, "Cimentaciones"), p43 = N(f4, "Estructura y cobertura");
  return { rootId: root, idCounter: k + 1, nodes, ids: { p21, p22, p41, p42, p43 } };
})();
const SAMPLE_ACTS: ActivitiesModule = (function () {
  const I = SAMPLE_WBS.ids; const by: Record<string, ActivityItem[]> = {}; let n = 0;
  function A(name: string, unit: string, qty: number, perf?: number, teams?: number): ActivityItem { return { id: "a" + (++n), name, unit, qty, perf: (perf == null ? "" : perf), teams: (teams == null ? 1 : teams) }; }
  by[I.p21] = [A("Calicatas exploratorias", "und", 8, 2), A("Informe geotécnico", "doc", 1, 0.25)];
  by[I.p22] = [A("Memoria de cálculo estructural", "doc", 1, 0.1), A("Planos estructurales", "lám", 24, 2)];
  by[I.p41] = [A("Corte y excavación masiva", "m³", 4800, 320, 2), A("Relleno y compactación", "m³", 2100, 250), A("Eliminación de excedentes", "m³", 2700, 300)];
  by[I.p42] = [A("Excavación de zanjas", "m³", 620, 60, 2), A("Acero de refuerzo", "kg", 38500, 2500, 2), A("Concreto f'c=280 en zapatas", "m³", 410, 45, 2)];
  by[I.p43] = [A("Montaje de columnas metálicas", "und", 48, 6), A("Instalación de cobertura TR-4", "m²", 5200, 350, 2)];
  return { byLeaf: by, idCounter: n + 1 };
})();
// Misma red de precedencias que el ejemplo del módulo Cronograma/CPM:
// permite calcular la RUTA CRÍTICA (y por tanto la probabilidad PERT)
// también en modo ejemplo, sin depender del proyecto activo.
const SAMPLE_LINKS: ScheduleLink[] = [
  { id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d", source: "paste" },
  { id: "L2", from: "a2", to: "a3", type: "FS", lag: 0, lagUnit: "d", source: "paste" },
  { id: "L3", from: "a3", to: "a4", type: "SS", lag: 4, lagUnit: "d", source: "paste" },
  { id: "L4", from: "a2", to: "a5", type: "FS", lag: 0, lagUnit: "d", source: "paste" },
  { id: "L5", from: "a5", to: "a6", type: "SS", lag: 3, lagUnit: "d", source: "paste" },
  { id: "L6", from: "a5", to: "a7", type: "SS", lag: 2, lagUnit: "d", source: "paste" },
  { id: "L7", from: "a6", to: "a8", type: "FS", lag: 0, lagUnit: "d", source: "paste" },
  { id: "L8", from: "a7", to: "a8", type: "FS", lag: 0, lagUnit: "d", source: "paste" },
  { id: "L9", from: "a4", to: "a8", type: "FS", lag: 0, lagUnit: "d", source: "paste" },
  { id: "L10", from: "a8", to: "a9", type: "FS", lag: 0, lagUnit: "d", source: "paste" },
  { id: "L11", from: "a9", to: "a10", type: "SS", lag: 2, lagUnit: "d", source: "paste" },
  { id: "L12", from: "a10", to: "a11", type: "FS", lag: 3, lagUnit: "d", source: "paste" },
  { id: "L13", from: "a11", to: "a12", type: "SS", lag: 5, lagUnit: "d", source: "paste" }
];

function samplePert(): PertModule {
  // Durs base: a1=4 a2=4 a3=10 a4=12 a5=8 a6=9 a7=9 a8=6 a9=8 a10=5 a11=8 a12=8
  return {
    inputMode: "dias",
    byActivity: {
      a1: { o: "3", m: "", mAuto: true, p: "7" },
      a2: { o: "3", m: "", mAuto: true, p: "6" },
      a3: { o: "8", m: "", mAuto: true, p: "18" },
      a4: { o: "10", m: "", mAuto: true, p: "20" },
      a5: { o: "6", m: "", mAuto: true, p: "14" },  // asimetría típica: TE > Dur
      a6: { o: "8", m: "10", mAuto: false, p: "13" },  // M fijada a mano
      a7: { o: "7", m: "", mAuto: true, p: "14" },
      a8: { o: "9", m: "", mAuto: true, p: "5" },   // TERNA INVÁLIDA deliberada: O > M > P
      a9: { o: "6", m: "", mAuto: true, p: "12" },
      a10: { o: "4", m: "", mAuto: true, p: "9" },
      a11: { o: "6", m: "", mAuto: true, p: "11" },
      a12: { o: "7", m: "", mAuto: true, p: "13" }
    }
  };
}
function enterSample(): void {
  mode = "sample";
  if (!stateSample) stateSample = samplePert();
  render();
  setStatus("Modo ejemplo: actividades y ternas didácticas (hay una terna inválida a propósito — encuéntrala).");
}
function enterLive(): void { mode = "live"; render(); setStatus("De vuelta a las actividades del proyecto."); }

// ---------- toolbar ----------
function wireToolbar(): void {
  document.getElementById("inputModeSel")!.addEventListener("change", (e) => { switchInputMode((e.target as HTMLSelectElement).value as "dias" | "pct"); });
  document.getElementById("btnCopyTable")!.addEventListener("click", copyWholeTable);
  document.getElementById("btnReport")!.addEventListener("click", buildReport);
  document.getElementById("btnPrint")!.addEventListener("click", () => { window.print(); });
  document.getElementById("btnReload")!.addEventListener("click", () => { gpiPull(); render(); setStatus("Actividades recargadas desde el proyecto."); });
  document.getElementById("btnSample")!.addEventListener("click", enterSample);
  document.getElementById("btnLive")!.addEventListener("click", enterLive);
  document.getElementById("btnClear")!.addEventListener("click", async () => {
    const ok = await showConfirm("Se eliminarán todas las ternas O/M/P del análisis actual" + (mode === "sample" ? " (modo ejemplo)" : "") + ". Las actividades no se tocan. ¿Continuar?", "Limpiar análisis");
    if (!ok) return;
    if (mode === "sample") stateSample = { byActivity: {}, inputMode: state().inputMode };
    else stateLive = { byActivity: {}, inputMode: state().inputMode };
    onDirty(true);
    setStatus("Análisis PERT vacío — todas las M vuelven al modo automático.");
  });
}

// ===== Puente GPI =====
function gpiPull(): void {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
  wbsLive = window.GPI.getModule("wbs") ?? null;
  actsLive = window.GPI.getModule("activities") ?? null;
}
// Aviso visible, una sola vez, de que esta pestaña quedó desactualizada
// (otra pestaña activó un proyecto distinto) -- reusa el mismo <div id="banner">
// que ya existe para "gpi-core.js no cargó".
function markProjectStale(): void {
  if (projectStale) return;
  projectStale = true;
  setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
  const banner = document.getElementById("banner");
  if (banner) {
    banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el análisis PERT aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
    banner.classList.add("show");
  }
}
function gpiPush(): boolean {
  if (mode === "sample") return false;
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return false;
  if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) { markProjectStale(); return false; }
  // Guardado con sesión y resultado común (src/shared/write-session.ts).
  const r = pushWithSession(window.GPI, "pert", "El análisis PERT", stateLive,
    { name: (document.getElementById("projectTitle") as HTMLInputElement).value, course: (document.getElementById("courseTitle") as HTMLInputElement).value },
    session, { setStatus, onStale: markProjectStale });
  session = r.session;
  return r.ok;
}

let initialized = false;
function init(): void {
  if (initialized) return;
  initialized = true;
  wireToolbar();
  wireGrid();

  if (typeof window.GPI !== "undefined" && window.GPI.available()) {
    const proj = window.GPI.active();
    loadedProjectId = window.GPI.activeId();
    if (proj) {
      if (proj.meta) {
        if (proj.meta.name) (document.getElementById("projectTitle") as HTMLInputElement).value = proj.meta.name;
        if (proj.meta.course) (document.getElementById("courseTitle") as HTMLInputElement).value = proj.meta.course;
      }
      gpiPull();
      session = window.GPI.openSession("pert"); // versión que esta pestaña carga
      const modData = window.GPI.getModule("pert");
      if (modData) { stateLive = normalizeState(modData); window.GPI.rebaseSession(session, stateLive); }
      setStatus("Proyecto cargado desde el Panel de Control.");
    }
    window.addEventListener("beforeunload", gpiPush);
    document.addEventListener("visibilitychange", () => { if (document.hidden) gpiPush(); });
    window.GPI.onChange(() => {
      if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; }
      // otra pestaña cambió metrados/rendimientos: la M automática debe seguir
      if (mode === "live") { gpiPull(); render(); }
    });
    gpiBadge(proj ? (proj.meta && proj.meta.name) : "", gpiPush);
  } else {
    const bn = document.getElementById("banner") as HTMLElement;
    bn.classList.add("show");
    bn.innerHTML = "<b>Vista previa sin almacenamiento persistente.</b> Abre este archivo junto a <code>gpi-core.js</code> y los demás módulos para analizar las actividades reales del proyecto. Mientras tanto trabajas con el modo ejemplo.";
    enterSample();
    return;
  }
  render();
}

function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div");
  bar.className = "gpi-badge";
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + String(name || "—").replace(/</g, "&lt;") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  const sb = bar.querySelector("#gpiSyncBtn");
  if (sb) sb.addEventListener("click", () => {
    const ok = pushFn(); const t = sb.textContent; sb.textContent = ok ? "✓ Sincronizado" : "⚠ Sin sincronizar";
    setTimeout(() => { sb.textContent = t; }, 1400);
  });
}

document.addEventListener("input", (e) => {
  if (e.target && (e.target as HTMLElement).id === "sbTarget") { targetTouched = true; renderProbability(); }
});
document.addEventListener("DOMContentLoaded", init);
