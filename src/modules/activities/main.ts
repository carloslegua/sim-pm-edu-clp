/* =========================================================
   Definir las Actividades — descomposición de la EDT en actividades
   Port mecánico original (Fase 4 de MIGRATION.md) + rediseño posterior
   (a pedido del usuario): el cronograma real del curso se trabaja en
   MS Project, así que este módulo dejó de ser una grilla interactiva
   para pasar a un flujo de exportar plantilla → completar afuera
   (Excel o MS Project) → importar el archivo terminado. Ver
   ARCHITECTURE.md y el historial de commits de este archivo para el
   detalle de qué cambió y por qué.

   Mismo patrón que OBS/WBS: addEventListener exclusivamente, window.GPI
   explícito, IIFE propio -- no hace falta exponer nada en window.
   Depende además de window.JSZip (CDN, cargado antes en el HTML) para
   generar y leer el .xlsx; si no está disponible, cae a CSV para
   exportar y simplemente informa que no puede leer .xlsx para importar
   (comportamiento ya existente para la exportación, extendido a la
   importación con el mismo criterio de degradación).

   DELIBERADAMENTE NO se usa GPI.ui.esc (modo suelto sin gpi-core.js).
   DELIBERADAMENTE usa treeRows()/leafRows() locales en vez de
   GPI.util.wbsCodes/wbsLeaves: el módulo debe poder calcular los mismos
   códigos EDT aunque gpi-core.js no cargue (modo standalone).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { ActivitiesModule, ProjectMeta, WbsModule } from "../../core/types";

type GpiApi = typeof GpiCore.GPI;
declare global {
  interface Window { GPI?: GpiApi; JSZip?: JSZipCtor; }
}

// Tipado mínimo de la API de JSZip que este módulo usa (librería externa
// vía CDN, ver el <script> en el HTML) -- tanto para ESCRIBIR (exportar
// la plantilla) como para LEER (importar el archivo completado).
interface JSZipFileEntry { async(type: "string"): Promise<string>; }
interface JSZipInstance {
  file(name: string, content: string): void;
  file(name: string): JSZipFileEntry | null;
  generateAsync(opts: { type: "blob"; mimeType: string }): Promise<Blob>;
}
interface JSZipCtor { new (): JSZipInstance; loadAsync(data: ArrayBuffer): Promise<JSZipInstance>; }

// ---------- estado ----------
// Las actividades se guardan POR PAQUETE de trabajo (hoja de la EDT), refe-
// renciando su id: la EDT nunca se duplica aquí, se lee en vivo desde el
// WBS Builder a través de gpi-core (principio de fuente única de verdad).
interface ActivityRow { id: string; name: string; unit: string; qty: string | number; perf: string | number; teams: string | number; }
// Hito: duración cero por definición, código propio asignado por el alumno
// (convención "H1", "H2"... no se valida el prefijo) -- puede colgar de un
// paquete de trabajo (leafId) o ir suelto (leafId null = hito del proyecto).
// Un hito suelto NUNCA se agrupa en un capítulo aparte: afterLeafId dice
// después de qué paquete se posiciona en el listado (null = al principio de
// todo, p. ej. un hito de inicio de proyecto) -- nunca cuenta para la EDT.
interface MilestoneRow { id: string; code: string; name: string; leafId?: string | null; afterLeafId?: string | null; }
interface ActivitiesState { byLeaf: Record<string, ActivityRow[]>; idCounter: number; milestones: MilestoneRow[]; }

let mode: "live" | "sample" = "live";
let stateLive: ActivitiesState = { byLeaf: {}, idCounter: 1, milestones: [] };
let stateSample: ActivitiesState | null = null;
let wbsLive: WbsModule | null = null;

function state(): ActivitiesState { return (mode === "sample" ? stateSample : stateLive) as ActivitiesState; }
function wbsData(): WbsModule | null { return mode === "sample" ? SAMPLE_WBS : wbsLive; }

// ---------- utilidades ----------
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function setStatus(m: string): void { (document.getElementById("statusLeft") as HTMLElement).textContent = m; }
function normalizeState(obj: any): ActivitiesState {
  obj = obj || {};
  const by: Record<string, ActivityRow[]> = {}, src = obj.byLeaf || {};
  Object.keys(src).forEach((k) => {
    by[k] = (Array.isArray(src[k]) ? src[k] : []).map((a: any) => ({
      id: a.id || ("a" + Math.random().toString(36).slice(2, 8)),
      name: a.name || "", unit: a.unit || "",
      qty: (a.qty == null ? "" : a.qty),
      perf: (a.perf == null ? "" : a.perf),                      // rendimiento por equipo (manual)
      teams: (a.teams == null || a.teams === "" ? 1 : a.teams)   // n.º de equipos (manual, default 1)
    }));
  });
  const milestones: MilestoneRow[] = (Array.isArray(obj.milestones) ? obj.milestones : []).map((m: any) => ({
    id: m.id || ("m" + Math.random().toString(36).slice(2, 8)),
    code: m.code || "", name: m.name || "",
    leafId: m.leafId || null,
    afterLeafId: m.afterLeafId || null
  }));
  return { byLeaf: by, idCounter: Number(obj.idCounter) || 1, milestones };
}

// ---------- modal (los diálogos nativos se bloquean en iframes) ----------
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
function showConfirm(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Confirmar acción", message, confirmText: "Continuar", cancelText: "Cancelar" }); }
function showAlert(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Aviso", message, confirmText: "Entendido", cancelText: null }); }

// ---------- EDT: modelo de filas en orden jerárquico ----------
interface TreeRow { kind: "phase" | "package"; id: string; code: string; name: string; depth: number; }

// Devuelve [{kind:"phase"|"package", id, code, name, depth}] recorriendo la
// EDT con la misma numeración jerárquica que expone WBS Builder (1, 1.1, …).
function treeRows(): TreeRow[] {
  const w = wbsData();
  const out: TreeRow[] = [];
  if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
  (function walk(id: string, code: string, depth: number): void {
    const n = w.nodes[id]; if (!n) return;
    const kids = n.children || [];
    if (id !== w.rootId) {
      out.push({ kind: kids.length ? "phase" : "package", id, code, name: n.name || "", depth });
    }
    kids.forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1), depth + 1));
  })(w.rootId, "", 0);
  return out;
}
function leafRows(): TreeRow[] { return treeRows().filter((r) => r.kind === "package"); }

interface Stats { total: number; leaves: number; covered: number; uncovered: TreeRow[]; orphans: number; pct: number; }

// Estadísticas locales (mismo algoritmo que GPI.util.activitiesStats, en
// copia local para que la herramienta funcione sin gpi-core.js).
function stats(): Stats {
  const st = state(), leaves = leafRows();
  const leafIds: Record<string, boolean> = {}; leaves.forEach((l) => { leafIds[l.id] = true; });
  let total = 0, orphans = 0, covered = 0; const uncovered: TreeRow[] = [];
  Object.keys(st.byLeaf).forEach((k) => {
    const n = (st.byLeaf[k] || []).length;
    if (leafIds[k]) total += n; else orphans += n;
  });
  leaves.forEach((l) => { if ((st.byLeaf[l.id] || []).length) covered++; else uncovered.push(l); });
  return { total, leaves: leaves.length, covered, uncovered, orphans, pct: leaves.length ? Math.round(covered / leaves.length * 100) : 0 };
}

// ---------- render ----------
function render(): void {
  const chip = document.getElementById("modeChip") as HTMLElement;
  chip.textContent = mode === "sample" ? "MODO EJEMPLO" : "EDT del proyecto";
  chip.className = "mode-chip " + (mode === "sample" ? "sample" : "live");
  (document.getElementById("btnSample") as HTMLElement).style.display = mode === "sample" ? "none" : "";
  (document.getElementById("btnLive") as HTMLElement).style.display = mode === "sample" ? "" : "none";
  (document.getElementById("btnReload") as HTMLButtonElement).disabled = mode === "sample";

  renderTable();
  renderSidebar();
  renderOrphans();
}

// Duración de una actividad (campo DERIVADO — nunca se edita ni se guarda):
//   Dur = Met / (#Eq × R), redondeada al ENTERO SUPERIOR (Math.ceil).
// Devuelve null si falta el metrado o el rendimiento (se muestra "—").
// Si #Eq viene vacío o menor que 1, el cálculo asume 1 equipo.
// Valor numérico tolerante: acepta coma decimal y separadores de miles,
// igual que Excel ("12,5" · "4,800.50" · "4 800"). NaN si no es número.
function numVal(v: unknown): number {
  if (v === "" || v == null) return NaN;
  const p = parseExcelNum(v);
  return (p === null || p === "") ? NaN : Number(p);
}

function durActivity(a: ActivityRow): number | null {
  const met = numVal(a.qty), r = numVal(a.perf);
  let eq = numVal(a.teams);
  if (!isFinite(met) || met <= 0 || !isFinite(r) || r <= 0) return null;
  if (!isFinite(eq) || eq < 1) eq = 1;
  return Math.ceil(met / (eq * r));
}

interface FullRow {
  kind: "project" | "phase" | "package" | "activity" | "milestone";
  n: number; code: string; level: number; name: string;
  id?: string; count?: number;
  unit?: string; qty?: string | number; perf?: string | number; teams?: string | number; dur?: number | null;
  leafId?: string; actIndex?: number;
}

// Agrupa los hitos SUELTOS (sin paquete) según dónde deben insertarse en el
// listado: "start" = antes de la fase 1 (p. ej. un hito de inicio de
// proyecto), "afterLeaf[id]" = justo después del paquete `id` (p. ej. el id
// del último paquete produce un hito de fin de proyecto), "orphan" = su
// afterLeafId apuntaba a un paquete que ya no existe (se muestra al final,
// para no perder el dato, en vez de desaparecer en silencio). Un hito NUNCA
// se agrupa en un capítulo aparte de tipo "Hitos del proyecto": cada uno
// aparece exactamente donde el alumno lo posicionó.
function placeLooseMilestones(milestones: MilestoneRow[], knownLeafIds: Record<string, boolean>): { start: MilestoneRow[]; afterLeaf: Record<string, MilestoneRow[]>; orphan: MilestoneRow[] } {
  const start: MilestoneRow[] = [], orphan: MilestoneRow[] = [];
  const afterLeaf: Record<string, MilestoneRow[]> = {};
  milestones.filter((m) => !m.leafId).forEach((m) => {
    if (!m.afterLeafId) start.push(m);
    else if (knownLeafIds[m.afterLeafId]) (afterLeaf[m.afterLeafId] ||= []).push(m);
    else orphan.push(m);
  });
  return { start, afterLeaf, orphan };
}

// Modelo de filas completo, estilo MS Project: fila 0 = proyecto (tarea
// resumen), e Id consecutivo para las filas de fase/paquete/actividad. Es
// la única fuente de numeración: la tabla, el reporte y la plantilla
// exportada lo comparten para que nunca se desalineen. Este Id es también
// la clave que un alumno usa para verificar que un mismo paquete/actividad
// es el mismo en Definir las Actividades, Estimar los Costos, Análisis
// PERT y Cronograma/CPM -- los cuatro recorren la MISMA EDT y las MISMAS
// actividades en el MISMO orden, así que el Id de cada uno debe coincidir
// exactamente. Por eso los HITOS -- que solo existen aquí y en Estimar los
// Costos, PERT/Cronograma-CPM no los ven -- NUNCA consumen un número de
// este contador: se muestran con su propio código (H1, H2…) y un guion en
// la columna Id, para no correr el conteo de los demás. level = nivel de
// esquema de MS Project (proyecto=1, sus fases=2, …). Los hitos atados a un
// paquete se listan después de sus actividades; los sueltos se intercalan
// en CUALQUIER posición del listado (ver placeLooseMilestones) -- nunca en
// un bloque aparte ni con numeración EDT propia.
function fullRows(): FullRow[] {
  const w = wbsData(), st = state(), out: FullRow[] = [];
  if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
  let n = 0;
  const rootName = ((w.nodes[w.rootId].name || "").trim()) || (document.getElementById("projectTitle") as HTMLInputElement).value || "Proyecto";
  out.push({ kind: "project", n: n++, code: "0", level: 1, name: rootName });
  const milestones = st.milestones || [];
  const tree = treeRows();
  const knownLeafIds: Record<string, boolean> = {};
  tree.forEach((r) => { if (r.kind === "package") knownLeafIds[r.id] = true; });
  const loose = placeLooseMilestones(milestones, knownLeafIds);
  loose.start.forEach((m) => { out.push({ kind: "milestone", n: -1, code: m.code, level: 2, name: m.name, dur: 0 }); });
  tree.forEach((r) => {
    if (r.kind === "phase") {
      out.push({ kind: "phase", n: n++, code: r.code, level: r.depth + 1, name: r.name, id: r.id });
    } else {
      out.push({ kind: "package", n: n++, code: r.code, level: r.depth + 1, name: r.name, id: r.id, count: (st.byLeaf[r.id] || []).length });
      (st.byLeaf[r.id] || []).forEach((a, i) => {
        out.push({ kind: "activity", n: n++, code: r.code + "." + (i + 1), level: r.depth + 2, name: a.name, unit: a.unit, qty: a.qty, perf: a.perf, teams: a.teams, dur: durActivity(a), leafId: r.id, actIndex: i });
      });
      milestones.filter((m) => m.leafId === r.id).forEach((m) => {
        out.push({ kind: "milestone", n: -1, code: m.code, level: r.depth + 2, name: m.name, dur: 0, leafId: r.id });
      });
      (loose.afterLeaf[r.id] || []).forEach((m) => {
        out.push({ kind: "milestone", n: -1, code: m.code, level: r.depth + 1, name: m.name, dur: 0 });
      });
    }
  });
  loose.orphan.forEach((m) => { out.push({ kind: "milestone", n: -1, code: m.code, level: 2, name: m.name, dur: 0 }); });
  return out;
}

// Tabla de SOLO LECTURA: las actividades se cargan por import de Excel, no se
// editan celda a celda aquí (ver "IMPORTAR DESDE EXCEL" más abajo).
function renderTable(): void {
  const tbody = document.getElementById("actsBody") as HTMLElement;
  const empty = document.getElementById("emptyState") as HTMLElement;
  const rows = fullRows();

  if (!rows.length) {
    tbody.innerHTML = "";
    empty.style.display = "";
    empty.innerHTML = mode === "live"
      ? "<b>La EDT del proyecto activo está vacía.</b><br>Construye primero la estructura de desglose del trabajo en WBS Builder; este módulo descompone sus paquetes de trabajo en actividades.<br><a class=\"btn\" href=\"WBS_Builder.html\">▦ Abrir WBS Builder</a><button class=\"btn primary\" id=\"btnSampleInner\">Explorar con el modo ejemplo</button>"
      : "<b>Sin EDT de ejemplo.</b>";
    const bi = document.getElementById("btnSampleInner");
    if (bi) bi.addEventListener("click", enterSample);
    return;
  }
  empty.style.display = "none";

  let html = "";
  rows.forEach((r) => {
    if (r.kind === "project") {
      html += '<tr class="proj-row">'
        + '<td class="n-cell">' + r.n + '</td>'
        + '<td class="code-cell" style="color:var(--ink-1)">0</td>'
        + '<td colspan="6">' + esc(r.name) + ' <span class="proj-hint">Fila 0</span></td>'
        + '</tr>';
    } else if (r.kind === "phase") {
      html += '<tr class="phase-row">'
        + '<td class="n-cell">' + r.n + '</td>'
        + '<td class="code-cell">' + esc(r.code) + '</td>'
        + '<td colspan="6" style="padding-left:' + (10 + Math.max(0, r.level - 2) * 16) + 'px">' + esc(r.name) + '</td>'
        + '</tr>';
    } else if (r.kind === "package") {
      html += '<tr class="pkg-row" id="pkg-' + esc(r.id) + '">'
        + '<td class="n-cell">' + r.n + '</td>'
        + '<td class="pk-code">' + esc(r.code) + '</td>'
        + '<td colspan="6" style="padding-left:' + (8 + Math.max(0, r.level - 2) * 16) + 'px"><span class="pk-name">' + esc(r.name) + '</span><span class="pk-count' + (r.count ? '' : ' zero') + '">' + r.count + ' act.</span></td>'
        + '</tr>';
    } else if (r.kind === "milestone") {
      html += '<tr class="act-row milestone-row">'
        + '<td class="n-cell act-item" title="Los hitos no consumen Id: no cuentan para la EDT ni para el correlativo que comparten las demás tablas">—</td>'
        + '<td class="act-code milestone-code">◆ ' + esc(r.code) + '</td>'
        + '<td>' + (r.name ? esc(r.name) : '<span class="rep-note">— sin nombre —</span>') + '<span class="milestone-tag">Hito</span></td>'
        + '<td>—</td><td class="num">—</td><td class="num">—</td><td class="num" style="text-align:center">—</td>'
        + '<td class="dur-cell" title="Los hitos tienen duración cero por definición">0</td>'
        + '</tr>';
    } else {
      html += '<tr class="act-row">'
        + '<td class="n-cell act-item">' + r.n + '</td>'
        + '<td class="act-code">' + esc(r.code) + '</td>'
        + '<td>' + (r.name ? esc(r.name) : '<span class="rep-note">— sin nombre —</span>') + '</td>'
        + '<td>' + esc(r.unit || "—") + '</td>'
        + '<td class="num">' + fmtQty(r.qty) + '</td>'
        + '<td class="num">' + fmtQty(r.perf) + '</td>'
        + '<td class="num" style="text-align:center">' + esc(String(Math.max(1, numVal(r.teams) || 1))) + '</td>'
        + (r.dur == null
          ? '<td class="dur-cell empty" title="Falta el metrado o el rendimiento para calcular la duración">—</td>'
          : '<td class="dur-cell" title="Dur = ' + esc(r.qty) + ' ÷ (' + esc(String(Math.max(1, numVal(r.teams) || 1))) + ' × ' + esc(r.perf) + '), redondeada al entero superior">' + r.dur + '</td>')
        + '</tr>';
    }
  });
  tbody.innerHTML = html;
}

// Limpia formatos numéricos de Excel: "4,800.50", "4.800,50", "12,5", "4 800".
// Regla: si hay punto y coma, el ÚLTIMO es el decimal; una coma seguida de
// exactamente 3 dígitos se trata como separador de miles.
function parseExcelNum(s: unknown): string | null {
  let str = String(s == null ? "" : s).trim().replace(/[\s ]/g, "");
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
  return isFinite(n) ? String(n) : null; // null = no numérico (se omite, no se pisa)
}

// Copia toda la tabla (con encabezados) como TSV — pegable directo en Excel
function copyWholeTable(): void {
  const rows = fullRows();
  if (!rows.length) { setStatus("No hay tabla que copiar."); return; }
  const lines = ["Id.\tEDT\tPaquete de trabajo / Actividad\tUnidad\tMetrado\tRend. (R)\t#Eq\tDur. (d)"];
  rows.forEach((r) => {
    const isAct = r.kind === "activity", isMs = r.kind === "milestone";
    lines.push([
      isMs ? "—" : r.n, r.code, (r.name || "") + (isMs ? " (hito)" : ""),
      isAct ? (r.unit || "") : "",
      isAct ? (r.qty == null ? "" : r.qty) : "",
      isAct ? (r.perf == null ? "" : r.perf) : "",
      isAct ? Math.max(1, numVal(r.teams) || 1) : "",
      isAct && r.dur != null ? r.dur : (isMs ? 0 : "")
    ].join("\t"));
  });
  const text = lines.join("\n");
  function done() { setStatus("Tabla copiada al portapapeles (" + rows.length + " filas + encabezado): pégala en Excel con Ctrl+V."); }
  function legacy() {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (_) { setStatus("No se pudo copiar al portapapeles."); }
    ta.remove();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, legacy);
  else legacy();
}

function renderSidebar(): void {
  const s = stats();
  (document.getElementById("sbTotal") as HTMLElement).textContent = String(s.total);
  (document.getElementById("sbCov") as HTMLElement).textContent = s.covered + "/" + s.leaves + " paquetes con actividades";
  (document.getElementById("sbPct") as HTMLElement).textContent = s.pct + "%";
  const bar = document.getElementById("sbBar") as HTMLElement;
  bar.style.width = s.pct + "%";
  bar.style.background = s.pct >= 100 ? "var(--good)" : (s.pct >= 50 ? "var(--warn)" : "var(--act-a)");
  const host = document.getElementById("missList") as HTMLElement;
  if (!s.leaves) {
    host.innerHTML = '<div style="font-size:11.5px;color:var(--ink-2)">Sin EDT cargada.</div>';
  } else if (!s.uncovered.length) {
    host.innerHTML = '<div class="miss-ok">✓ Todos los paquetes de trabajo tienen al menos una actividad.</div>';
  } else {
    host.innerHTML = s.uncovered.map((l) => '<div class="miss-item" data-goto="' + esc(l.id) + '"><span class="mc">' + esc(l.code) + '</span><span>' + esc(l.name) + '</span></div>').join("");
    host.querySelectorAll("[data-goto]").forEach((el) => {
      el.addEventListener("click", () => {
        const row = document.getElementById("pkg-" + (el as HTMLElement).dataset.goto);
        if (row) { row.scrollIntoView({ behavior: "smooth", block: "center" }); }
      });
    });
  }
}

function renderOrphans(): void {
  const st = state(), leaves = leafRows();
  const leafIds: Record<string, boolean> = {}; leaves.forEach((l) => { leafIds[l.id] = true; });
  const orphanKeys = Object.keys(st.byLeaf).filter((k) => !leafIds[k] && (st.byLeaf[k] || []).length);
  const n = orphanKeys.reduce((acc, k) => acc + st.byLeaf[k].length, 0);
  const bn = document.getElementById("orphanBanner") as HTMLElement;
  if (!n) { bn.classList.remove("show"); bn.innerHTML = ""; return; }
  bn.classList.add("show");
  bn.innerHTML = "<b>⚠ " + n + " actividad(es) huérfana(s):</b> su paquete de trabajo ya no existe en la EDT o dejó de ser una hoja (se le agregaron sub-paquetes). No aparecen en la tabla ni en los conteos. "
    + '<button class="btn sm danger" id="btnOrphans">Eliminar huérfanas</button>';
  (document.getElementById("btnOrphans") as HTMLElement).addEventListener("click", async () => {
    const ok = await showConfirm("Se eliminarán definitivamente las " + n + " actividades huérfanas. Si en realidad la EDT cambió por error, corrígela primero en WBS Builder y vuelve a recargar.", "Eliminar actividades huérfanas");
    if (!ok) return;
    orphanKeys.forEach((k) => { delete st.byLeaf[k]; });
    onDirty(true);
    setStatus("Actividades huérfanas eliminadas.");
  });
}

let dirtyTimer: ReturnType<typeof setTimeout> | undefined;
function onDirty(rerender: boolean): void {
  if (rerender) render(); else renderSidebar();
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(gpiPush, 800);
  setStatus("Cambios sin exportar — se sincronizan solos con el Panel.");
}

// ---------- export / import (.json — respaldo íntegro del módulo) ----------
function exportJson(): void {
  const data = { kind: "gpi.activities/v1", title: (document.getElementById("projectTitle") as HTMLInputElement).value, course: (document.getElementById("courseTitle") as HTMLInputElement).value, data: state() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  const safe = (data.title || "actividades").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  a.href = url; a.download = "actividades_" + safe + ".json";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("Lista de actividades exportada como .json.");
}
function importJson(file: File): void {
  const r = new FileReader();
  r.onload = (e) => {
    let obj: any; try { obj = JSON.parse((e.target as FileReader).result as string); } catch (_) { showAlert("El archivo no es un .json válido."); return; }
    if (obj && obj.kind === "gpi.activities/v1" && obj.data) {
      if (mode === "sample") { stateSample = normalizeState(obj.data); }
      else { stateLive = normalizeState(obj.data); }
      if (obj.title) (document.getElementById("projectTitle") as HTMLInputElement).value = obj.title;
      if (obj.course) (document.getElementById("courseTitle") as HTMLInputElement).value = obj.course;
      render(); gpiPush();
      setStatus("Lista de actividades importada. Las actividades se enlazan a la EDT por el id de cada paquete.");
    } else {
      showAlert("No reconocí el formato: se esperaba una exportación de esta herramienta (gpi.activities/v1).");
    }
  };
  r.readAsText(file);
}

// ---------- EDT y actividades DE EJEMPLO (demo independiente) ----------
// Réplica compacta de la EDT de ejemplo de WBS Builder. El modo ejemplo es
// autocontenido: nunca escribe sobre los datos reales del proyecto activo.
const SAMPLE_WBS: WbsModule & { ids: Record<string, string> } = (function () {
  const nodes: WbsModule["nodes"] = {}; let k = 0;
  function N(parentId: string | null, name: string): string {
    const id = "w" + (++k);
    nodes[id] = { id, parentId: parentId ?? undefined, name, children: [] };
    if (parentId) (nodes[parentId].children as string[]).push(id);
    return id;
  }
  const root = N(null, "Proyecto DISTRIB+ S.A. — Almacén Lurín");
  const f1 = N(root, "Dirección de Proyecto");
  const p11 = N(f1, "Acta de constitución"), p12 = N(f1, "Plan de gestión del proyecto"), p13 = N(f1, "Informes de seguimiento y control");
  const f2 = N(root, "Ingeniería y Diseño");
  const p21 = N(f2, "Estudio de suelos"), p22 = N(f2, "Diseño estructural"), p23 = N(f2, "Diseño eléctrico y sanitario"), p24 = N(f2, "Permisos y licencias municipales");
  const f3 = N(root, "Procura");
  const p31 = N(f3, "Estructuras metálicas prefabricadas"), p32 = N(f3, "Materiales de construcción"), p33 = N(f3, "Equipos eléctricos e instalaciones");
  const f4 = N(root, "Construcción");
  const p41 = N(f4, "Movimiento de tierras"), p42 = N(f4, "Cimentaciones"), p43 = N(f4, "Estructura y cobertura"), p44 = N(f4, "Acabados y cerramientos"), p45 = N(f4, "Instalaciones MEP");
  const f5 = N(root, "Pruebas y Puesta en Marcha");
  const p51 = N(f5, "Pruebas de instalaciones"), p52 = N(f5, "Capacitación al cliente"), p53 = N(f5, "Acta de entrega y cierre");
  return { rootId: root, idCounter: k + 1, nodes, ids: { p11, p12, p13, p21, p22, p23, p24, p31, p32, p33, p41, p42, p43, p44, p45, p51, p52, p53 } };
})();

// Los 18 paquetes de trabajo quedan con una o más actividades reales que lo
// descomponen (ningún paquete se deja "tal cual" copiando el WBS sin
// desagregar) -- ver ARCHITECTURE.md, "Dataset de referencia (DISTRIB+)".
function sampleActivities(): ActivitiesState {
  const I = SAMPLE_WBS.ids; const by: Record<string, ActivityRow[]> = {}; let n = 0;
  // A(nombre, unidad, metrado, rendimiento por equipo, n.º de equipos)
  // Dur = Met / (#Eq × R), redondeada al entero superior.
  function A(name: string, unit: string, qty: number, perf?: number, teams?: number): ActivityRow {
    return { id: "a" + (++n), name, unit, qty, perf: (perf == null ? "" : perf), teams: (teams == null ? 1 : teams) };
  }
  by[I.p11] = [A("Elaboración y aprobación del acta de constitución", "doc", 1, 0.25)];                        // ceil(1/0.25)=4 d
  by[I.p12] = [A("Plan para la dirección del proyecto (líneas base)", "doc", 1, 0.2), A("Planes subsidiarios de gestión", "doc", 6, 0.5)]; // 5 d · 12 d
  by[I.p13] = [A("Elaboración de informes mensuales de avance", "doc", 4, 0.5), A("Reuniones de control y seguimiento del proyecto", "reunión", 16, 2)]; // 8 d · 8 d
  by[I.p21] = [A("Calicatas exploratorias", "und", 8, 2), A("Ensayos de laboratorio de suelos", "glb", 1, 0.1), A("Informe geotécnico", "doc", 1, 0.25)]; // 4 · 10 · 4
  by[I.p22] = [A("Memoria de cálculo estructural", "doc", 1, 0.1), A("Planos estructurales", "lám", 24, 2)];   // 10 d · 12 d
  by[I.p23] = [A("Memoria de cálculo eléctrico y sanitario", "doc", 1, 0.15), A("Planos eléctricos y sanitarios", "lám", 18, 2)]; // 7 d · 9 d
  by[I.p24] = [A("Trámite de licencia de edificación municipal", "trámite", 1, 0.05), A("Trámite de certificado ITSE", "trámite", 1, 0.1)]; // 20 d · 10 d
  by[I.p31] = [A("Fabricación de estructuras metálicas", "ton", 260, 15, 2), A("Transporte y entrega de estructuras a obra", "viaje", 12, 3)]; // 9 d · 4 d
  by[I.p32] = [A("Adquisición y suministro de cemento y agregados", "ton", 800, 100), A("Adquisición y suministro de materiales varios de construcción", "glb", 1, 0.15)]; // 8 d · 7 d
  by[I.p33] = [A("Adquisición de tableros y equipos eléctricos", "und", 15, 3), A("Adquisición de equipos de instalaciones sanitarias", "und", 10, 2)]; // 5 d · 5 d
  by[I.p41] = [A("Corte y excavación masiva", "m³", 4800, 320, 2), A("Relleno y compactación con material propio", "m³", 2100, 250), A("Eliminación de material excedente", "m³", 2700, 300), A("Nivelación y perfilado de plataforma", "m²", 6500, 1200)]; // 8 · 9 · 9 · 6
  by[I.p42] = [A("Excavación de zanjas para zapatas", "m³", 620, 60, 2), A("Solado de concreto e=10 cm", "m²", 480, 120), A("Acero de refuerzo fy=4200 kg/cm²", "kg", 38500, 2500, 2), A("Concreto f'c=280 kg/cm² en zapatas", "m³", 410, 45, 2), A("Encofrado y desencofrado de cimentaciones", "m²", 950, 90, 2)]; // 6 · 4 · 8 · 5 · 6
  by[I.p43] = [A("Montaje de columnas metálicas", "und", 48, 6), A("Montaje de vigas y tijerales", "ton", 96, 8), A("Instalación de cobertura TR-4", "m²", 5200, 350, 2)]; // 8 · 12 · 8
  by[I.p44] = [A("Tarrajeo de muros y cielorrasos", "m²", 3200, 40, 2), A("Pintura general de interiores y exteriores", "m²", 3200, 80, 2), A("Cerramiento perimétrico", "m", 320, 20)]; // 40 · 20 · 16
  by[I.p45] = [A("Instalación de tableros y circuitos eléctricos", "pto", 980, 25, 2), A("Instalación de redes sanitarias", "m", 450, 30)]; // 20 · 15
  by[I.p51] = [A("Pruebas de tableros y circuitos eléctricos", "pto", 120, 30), A("Pruebas hidráulicas de redes sanitarias", "glb", 1, 0.5)]; // 4 · 2
  by[I.p52] = [A("Capacitación operativa al personal del cliente", "hora", 40, 5), A("Elaboración de manuales de operación y mantenimiento", "doc", 2, 0.5)]; // 8 · 4
  by[I.p53] = [A("Elaboración de dossier de calidad y planos as-built", "doc", 1, 0.1), A("Acta de entrega y cierre del proyecto", "doc", 1, 0.5)]; // 10 · 2
  // Tres hitos ilustrativos que cubren los casos que soporta el modelo:
  // "H1" suelto AL PRINCIPIO de todo (afterLeafId null -- hito de inicio de
  // proyecto), "H2" atado a un paquete (entregable intermedio con fecha
  // objetivo), y "H3" suelto DESPUÉS del último paquete (afterLeafId =
  // I.p53 -- hito de fin de proyecto). Ninguno forma parte de la EDT ni de
  // su numeración; cada uno aparece exactamente donde está posicionado, no
  // agrupados en un capítulo aparte.
  const milestones: MilestoneRow[] = [
    { id: "m1", code: "H1", name: "Inicio del Proyecto", leafId: null, afterLeafId: null },
    { id: "m2", code: "H2", name: "Fin de Cimentaciones", leafId: I.p42 },
    { id: "m3", code: "H3", name: "Cierre del Proyecto", leafId: null, afterLeafId: I.p53 }
  ];
  return { byLeaf: by, idCounter: n + 1, milestones };
}

function enterSample(): void {
  mode = "sample";
  if (!stateSample) stateSample = sampleActivities();
  render();
  setStatus("Modo ejemplo: EDT y actividades didácticas (no toca los datos del proyecto).");
}
function enterLive(): void {
  mode = "live";
  render();
  setStatus("De vuelta a la EDT del proyecto activo.");
}

// Códigos EDT de un árbol WBS cualquiera (no depende de wbsData()/mode) --
// se usa para calcular los códigos del propio SAMPLE_WBS, que sirven de
// clave para reconciliar el ejemplo contra la EDT REAL del proyecto activo.
function wbsCodesOf(wbs: WbsModule): Record<string, string> {
  const codes: Record<string, string> = {};
  (function walk(id: string, code: string): void {
    codes[id] = code;
    (wbs.nodes[id].children || []).forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1)));
  })(wbs.rootId, "");
  return codes;
}

// Filas "virtuales" con las actividades e hitos de ejemplo, en el mismo
// orden de columnas que reconcileImportRows espera de un archivo real
// (Código EDT, Paquete de trabajo [sin usar], Nombre de la actividad, Tipo,
// Código de hito, Unidad, Metrado, Rendimiento, N.º de equipos) -- así
// "Cargar ejemplo en el proyecto" puede reutilizar TAL CUAL la misma
// reconciliación por código EDT que ya usa el import de Excel, en vez de
// duplicar esa lógica (incluidos los hitos, atados o sueltos). El ORDEN de
// las filas importa: reconcileImportRows deriva la posición de un hito
// suelto del lugar donde aparece su fila respecto de las filas de paquete,
// así que aquí se emite en el mismo orden que produciría placeLooseMilestones
// (que ya usa fullRows()) para que el resultado sea idéntico.
function sampleVirtualRows(): string[][] {
  const codes = wbsCodesOf(SAMPLE_WBS);
  const sample = sampleActivities();
  const rows: string[][] = [];
  const packageIds = Object.keys(sample.byLeaf); // orden real de la EDT (depth-first)
  const knownLeafIds: Record<string, boolean> = {}; packageIds.forEach((id) => { knownLeafIds[id] = true; });
  const loose = placeLooseMilestones(sample.milestones, knownLeafIds);
  loose.start.forEach((m) => { rows.push(["", "", m.name, "Hito", m.code, "", "", "", ""]); });
  packageIds.forEach((leafId) => {
    const code = codes[leafId];
    if (!code) return;
    sample.byLeaf[leafId].forEach((a) => {
      rows.push([code, "", a.name, "", "", a.unit, String(a.qty), String(a.perf ?? ""), String(a.teams ?? "")]);
    });
    sample.milestones.filter((m) => m.leafId === leafId).forEach((m) => {
      rows.push([code, "", m.name, "Hito", m.code, "", "", "", ""]);
    });
    (loose.afterLeaf[leafId] || []).forEach((m) => { rows.push(["", "", m.name, "Hito", m.code, "", "", "", ""]); });
  });
  loose.orphan.forEach((m) => { rows.push(["", "", m.name, "Hito", m.code, "", "", "", ""]); });
  return rows;
}

// ---------- CARGAR EJEMPLO EN EL PROYECTO (reemplaza el WBS Builder's
// "Cargar ejemplo") ----------
// A diferencia de "Modo ejemplo" (sandbox: nunca toca el proyecto activo,
// pensado para explorar el caso DISTRIB+ sin riesgo), esta acción SÍ
// reemplaza las actividades del proyecto activo real -- mismo patrón que ya
// usa WBS Builder para su propio "Cargar ejemplo" (confirmación explícita
// antes de reemplazar). Existe porque, si el alumno ya cargó el ejemplo en
// WBS Builder (EDT real poblada con DISTRIB+), "Modo ejemplo" por sí solo
// nunca deja esa MISMA EDT real con actividades: quedan aisladas en el
// sandbox y los módulos que dependen de las actividades del proyecto real
// (PERT, Cronograma CPM, Estimar los Costos) la seguirían viendo vacía.
async function loadSampleIntoProject(): Promise<void> {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) {
    await showAlert("Esto solo aplica con un proyecto activo conectado al Panel de Control. Usa \"Modo ejemplo\" para explorar el caso DISTRIB+ sin conexión.");
    return;
  }
  gpiPullWbs();
  const prevMode = mode;
  mode = "live"; // leafRows()/reconcileImportRows deben mirar la EDT REAL, no la de ejemplo
  const liveLeaves = leafRows();
  if (!liveLeaves.length) {
    mode = prevMode;
    await showAlert("La EDT del proyecto activo está vacía. Carga primero el ejemplo en WBS Builder (\"Cargar ejemplo\") y vuelve aquí.");
    return;
  }
  const colMap: ColumnMap = { code: 0, name: 2, type: 3, milestoneCode: 4, unit: 5, qty: 6, perf: 7, teams: 8 };
  const result = reconcileImportRows(sampleVirtualRows(), colMap);
  if (!result.matched && !result.matchedMilestones) {
    mode = prevMode;
    await showAlert("Ningún código EDT del ejemplo coincide con la EDT actual del proyecto. Carga primero el caso DISTRIB+ en WBS Builder (\"Cargar ejemplo\").");
    return;
  }
  let msg = "Se reemplazarán las actividades del PROYECTO ACTIVO (no el modo ejemplo) por las " + result.matched + " actividad(es)" + (result.matchedMilestones ? " y " + result.matchedMilestones + " hito(s)" : "") + " de ejemplo de DISTRIB+ que coinciden con su EDT actual.";
  if (result.unmatchedCodes.length) {
    msg += " " + result.unmatchedCodes.length + " código(s) del ejemplo no se encontraron en la EDT actual (¿la cargaste igual que en WBS Builder?): " + result.unmatchedCodes.slice(0, 8).join(", ") + (result.unmatchedCodes.length > 8 ? "…" : "") + ".";
  }
  const ok = await showConfirm(msg, "Cargar ejemplo en el proyecto");
  if (!ok) { mode = prevMode; render(); return; }
  stateLive = { byLeaf: result.byLeaf, idCounter: result.idCounter, milestones: result.milestones };
  render();
  gpiPush();
  setStatus("Ejemplo DISTRIB+ cargado en el proyecto activo (" + result.matched + " actividad(es)" + (result.matchedMilestones ? ", " + result.matchedMilestones + " hito(s)" : "") + ").");
}

// ---------- REPORTE IMPRIMIBLE ----------
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
function fmtQty(v: unknown): string {
  const n = numVal(v);
  if (!isFinite(n) || v === "" || v == null) return "—";
  return n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
}
function buildReport(): void {
  const s = stats();
  let body = (mode === "sample" ? '<p class="rep-note"><b>Modo ejemplo:</b> este listado usa la EDT y las actividades didácticas, no los datos del proyecto activo.</p>' : '')
    + '<h2>1. Resumen</h2><table class="rep-kv">'
    + '<tr><td>Actividades definidas</td><td><b>' + s.total + '</b></td></tr>'
    + '<tr><td>Cobertura de paquetes de trabajo</td><td>' + s.covered + ' de ' + s.leaves + ' paquetes con actividades (<b>' + s.pct + '%</b>)</td></tr>'
    + (s.orphans ? '<tr><td>Actividades huérfanas</td><td>⚠ ' + s.orphans + ' (su paquete ya no existe en la EDT)</td></tr>' : '')
    + '</table>'
    + '<h2>2. Listado de actividades y metrados</h2>'
    + '<p class="rep-note">Numeración estilo MS Project: la fila 0 es la tarea resumen del proyecto y el Id corre consecutivo por todas las filas — el mismo Id identifica el mismo paquete/actividad en Estimar los Costos, Análisis PERT y Cronograma/CPM. Cada actividad hereda el código EDT de su paquete más un correlativo. La duración es un valor calculado: Dur = Met ÷ (#Eq × R), donde R es el rendimiento diario de un equipo y #Eq el número de equipos en paralelo, redondeada al entero superior. Los hitos no tienen Id (no cuentan para ese correlativo compartido).</p>'
    + '<table><tr><th style="width:6%">Id.</th><th style="width:9%">Código EDT</th><th>Paquete de trabajo / Actividad</th><th style="width:7%">Unidad</th><th style="width:9%">Metrado</th><th style="width:9%">Rend. (R)</th><th style="width:6%">#Eq</th><th style="width:8%">Dur. (d)</th></tr>';
  const repRows = fullRows();
  if (!repRows.length) {
    body += '<tr><td colspan="8" class="rep-note">— Sin EDT cargada —</td></tr>';
  }
  repRows.forEach((r) => {
    if (r.kind === "project") {
      body += '<tr><td class="num rep-phase" style="text-align:center">0</td><td class="num rep-phase">0</td><td class="rep-phase" colspan="6">' + esc(r.name) + ' <span class="rep-note">(tarea resumen del proyecto)</span></td></tr>';
    } else if (r.kind === "phase") {
      body += '<tr><td class="num rep-phase" style="text-align:center">' + r.n + '</td><td class="num rep-phase">' + esc(r.code) + '</td><td class="rep-phase" colspan="6">' + esc(r.name) + '</td></tr>';
    } else if (r.kind === "package") {
      body += '<tr><td class="num rep-pkg" style="text-align:center">' + r.n + '</td><td class="num rep-pkg">' + esc(r.code) + '</td><td class="rep-pkg">' + esc(r.name) + '</td><td class="rep-pkg" colspan="5">' + (r.count ? r.count + ' actividad(es)' : '<span class="rep-note">sin actividades</span>') + '</td></tr>';
    } else if (r.kind === "milestone") {
      body += '<tr><td class="num" style="text-align:center">—</td>'
        + '<td class="num">◆ ' + esc(r.code) + '</td>'
        + '<td>' + esc(r.name) + ' <span class="rep-note">(hito)</span></td>'
        + '<td>—</td><td class="num" style="text-align:right">—</td><td class="num" style="text-align:right">—</td><td class="num" style="text-align:center">—</td>'
        + '<td class="num" style="text-align:center"><b>0</b></td></tr>';
    } else {
      body += '<tr><td class="num" style="text-align:center">' + r.n + '</td>'
        + '<td class="num">' + esc(r.code) + '</td>'
        + '<td>' + (r.name ? esc(r.name) : '<span class="rep-note">— sin nombre —</span>') + '</td>'
        + '<td>' + esc(r.unit || "—") + '</td>'
        + '<td class="num" style="text-align:right">' + fmtQty(r.qty) + '</td>'
        + '<td class="num" style="text-align:right">' + fmtQty(r.perf) + '</td>'
        + '<td class="num" style="text-align:center">' + esc(String(Math.max(1, numVal(r.teams) || 1))) + '</td>'
        + '<td class="num" style="text-align:center"><b>' + (r.dur == null ? "—" : r.dur) + '</b></td></tr>';
    }
  });
  body += '</table>';
  reportShell("Listado de Actividades y Metrados", "Definir las Actividades · Gestión del Cronograma", body);
}

// ---------- PLANTILLA .xlsx (exportar en blanco) ----------
// Genera un libro con una fila por paquete de trabajo de la EDT (Código EDT +
// nombre, de referencia) y las columnas de actividad en blanco. Se completa
// afuera (Excel o MS Project, ambos abren .xlsx nativamente) y se vuelve a
// subir con "Importar actividades desde Excel" más abajo.
function xmlEsc(s: unknown): string { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

interface XlCell { v: string | number; t: "s" | "n"; s?: number; }

const TEMPLATE_HEADERS = ["Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Código de hito", "Unidad", "Metrado", "Rendimiento (R)", "N.º de equipos"];

// Estilos: 0 normal · 1 encabezado · 2 centrado · 4 nota/instrucciones · 25 título
function xlsxStylesXml(): string {
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment horizontal="center"/></xf>',
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>',
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
  ];
  for (let i = 0; i < 10; i++) xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment horizontal="left" indent="' + i + '"/></xf>');
  for (let i = 0; i < 10; i++) xfs.push('<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" indent="' + i + '"/></xf>');
  xfs.push('<xf numFmtId="0" fontId="2" fillId="3" borderId="0" applyFont="1" applyFill="1"/>');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
    + '<fonts count="4">'
    + '<font><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="12"/><name val="Calibri"/></font>'
    + '<font><i/><sz val="10"/><color rgb="FF4D5768"/><name val="Calibri"/></font>'
    + '</fonts>'
    + '<fills count="4">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F6FC"/><bgColor indexed="64"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="FFB9C6D2"/></left><right style="thin"><color rgb="FFB9C6D2"/></right><top style="thin"><color rgb="FFB9C6D2"/></top><bottom style="thin"><color rgb="FFB9C6D2"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="' + xfs.length + '">' + xfs.join("") + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
}

// rows: [[{v, t:"s"|"n", s}]], widths: [n], freezeTop: bool
function xlsxSheetXml(rows: Array<Array<XlCell | null>>, widths: number[], freezeTop: boolean): string {
  const COLS = "ABCDEFGHIJ";
  const cols = widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("");
  const body = rows.map((cells, ri) => {
    const cs = cells.map((c, ci) => {
      if (c == null || c.v === "" || c.v == null) return "";
      const ref = COLS[ci] + (ri + 1), st = c.s ? ' s="' + c.s + '"' : "";
      if (c.t === "n") return '<c r="' + ref + '"' + st + '><v>' + c.v + '</v></c>';
      return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(c.v) + '</t></is></c>';
    }).join("");
    return '<row r="' + (ri + 1) + '">' + cs + '</row>';
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + (freezeTop ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '')
    + '<cols>' + cols + '</cols>'
    + '<sheetData>' + body + '</sheetData>'
    + '</worksheet>';
}

function templateRowModel(): Array<Array<XlCell | null>> {
  const head: XlCell[] = TEMPLATE_HEADERS.map((h) => ({ v: h, t: "s", s: 1 }));
  const out: Array<Array<XlCell | null>> = [head];
  leafRows().forEach((l) => {
    out.push([
      { v: l.code, t: "s", s: 2 },
      { v: l.name || "", t: "s", s: 0 },
      null, null, null, null, null, null, null
    ]);
  });
  return out;
}

function templateInstructions(): Array<Array<XlCell | null>> {
  const L: Array<[string, number]> = [
    ["Cómo completar esta plantilla", 25],
    ["", 0],
    ["1. Cada fila es un paquete de trabajo de la EDT. Las columnas “Código EDT” y “Paquete de trabajo” son de referencia — no las edites ni las borres: son la clave con la que este simulador reconoce a qué paquete pertenece cada actividad al importar el archivo de vuelta.", 4],
    ["2. Completa “Nombre de la actividad”, “Unidad”, “Metrado”, “Rendimiento (R)” y “N.º de equipos” para cada actividad del paquete.", 4],
    ["3. ¿Más de una actividad por el mismo paquete? Copia la fila completa (Ctrl+D en Excel) y repite el mismo “Código EDT” en la copia, cambiando el nombre de la actividad.", 4],
    ["4. Hitos: para marcar una fila como hito (duración cero) en vez de una actividad normal, escribe “Hito” en la columna “Tipo” y asígnale un código propio en “Código de hito” (por ejemplo “H1”, “H2”… la numeración la decides tú) — deja en blanco Unidad/Metrado/Rendimiento/N.º de equipos, no aplican a un hito. Si el hito pertenece a un paquete de trabajo, completa su “Código EDT”; si es un hito del proyecto en general (no depende de un paquete puntual), deja “Código EDT” en blanco.", 4],
    ["4b. Un hito NUNCA forma parte de la EDT ni de su numeración: su posición en el listado es dónde insertes su fila en este archivo, respecto de las filas de paquete. Una fila de hito insertada ANTES de la primera fila de paquete aparece al principio de todo (p. ej. un hito de inicio de proyecto); insertada DESPUÉS de la última fila de paquete aparece al final de todo (p. ej. un hito de fin de proyecto); insertada entre dos paquetes cualesquiera, aparece justo ahí — no se agrupan todos juntos en un bloque aparte.", 4],
    ["5. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
    ["6. Guarda el archivo y vuelve a “Definir las Actividades” > botón “⇧ Importar actividades desde Excel” para subirlo.", 4],
    ["", 0],
    ["La duración de cada actividad (Metrado ÷ (N.º de equipos × Rendimiento), redondeada al entero superior) se calcula sola al importar — no hace falta traerla en este archivo. Los hitos tienen duración cero por definición.", 4],
    ["", 0],
    ["Generado por el simulador GPI — módulo Definir las Actividades.", 4]
  ];
  return L.map((row) => [{ v: row[0], t: "s", s: row[1] === 25 ? 25 : (row[1] === 15 ? 16 : 4) }]);
}

async function buildTemplateXlsxBlob(): Promise<Blob> {
  const zip = new (window.JSZip as JSZipCtor)();
  zip.file("[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>');
  zip.file("_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>');
  zip.file("xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="EDT" sheetId="1" r:id="rId1"/><sheet name="Instrucciones" sheetId="2" r:id="rId2"/></sheets>'
    + '</workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  zip.file("xl/styles.xml", xlsxStylesXml());
  zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(templateRowModel(), [10, 30, 30, 8, 12, 10, 11, 14, 12], true));
  zip.file("xl/worksheets/sheet2.xml", xlsxSheetXml(templateInstructions(), [115], false));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function buildTemplateCsv(): string {
  function cell(v: unknown): string { const s = String(v == null ? "" : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const lines = [TEMPLATE_HEADERS.join(";")];
  leafRows().forEach((l) => { lines.push([cell(l.code), cell(l.name || ""), "", "", "", "", "", "", ""].join(";")); });
  return lines.join("\r\n");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function downloadTemplate(): Promise<void> {
  if (!leafRows().length) {
    await showAlert("No hay EDT cargada: construye la estructura en WBS Builder (o entra al modo ejemplo) antes de descargar la plantilla.");
    return;
  }
  const safe = ((document.getElementById("projectTitle") as HTMLInputElement).value || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  if (window.JSZip) {
    try {
      const blob = await buildTemplateXlsxBlob();
      downloadBlob(blob, "plantilla_actividades_" + safe + ".xlsx");
      setStatus("Plantilla descargada. Complétala en Excel o MS Project y vuelve a subirla con «⇧ Importar actividades».");
      return;
    } catch (_) { /* si algo falla, cae al CSV */ }
  }
  downloadBlob(new Blob(["﻿" + buildTemplateCsv()], { type: "text/csv;charset=utf-8" }), "plantilla_actividades_" + safe + ".csv");
  setStatus("No se pudo cargar la librería de Excel (¿sin conexión?): descargué un CSV equivalente.");
}

// ---------- IMPORTAR DESDE EXCEL (.xlsx real, no pegado de celdas) ----------
// Lee el .zip de un .xlsx con JSZip (también sabe LEER, no solo escribir) y
// parsea a mano las partes que hacen falta: no se asume que siempre sea
// "sheet1.xml" (un archivo re-guardado por Excel reescribe todo el paquete),
// y se soportan tanto cadenas compartidas (lo que genera Excel real) como
// cadenas inline (lo que genera nuestra propia plantilla).
function colIndexFromRef(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function resolveFirstSheetPath(zip: JSZipInstance): Promise<string | null> {
  const wbEntry = zip.file("xl/workbook.xml");
  if (!wbEntry) return null;
  const doc = new DOMParser().parseFromString(await wbEntry.async("string"), "application/xml");
  const sheetEl = doc.getElementsByTagName("sheet")[0];
  const rId = sheetEl ? sheetEl.getAttribute("r:id") : null;
  const relsEntry = zip.file("xl/_rels/workbook.xml.rels");
  if (!rId || !relsEntry) return null;
  const relsDoc = new DOMParser().parseFromString(await relsEntry.async("string"), "application/xml");
  const rel = Array.from(relsDoc.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rId);
  const target = rel ? rel.getAttribute("Target") || "" : "";
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1) : "xl/" + target;
}

async function loadSharedStrings(zip: JSZipInstance): Promise<string[]> {
  const entry = zip.file("xl/sharedStrings.xml");
  if (!entry) return [];
  const doc = new DOMParser().parseFromString(await entry.async("string"), "application/xml");
  return Array.from(doc.getElementsByTagName("si")).map((si) =>
    Array.from(si.getElementsByTagName("t")).map((t) => t.textContent || "").join("")
  );
}

function parseSheetRows(xmlText: string, sharedStrings: string[]): string[][] {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  return Array.from(doc.getElementsByTagName("row")).map((rowEl) => {
    const row: string[] = [];
    Array.from(rowEl.getElementsByTagName("c")).forEach((c) => {
      const idx = colIndexFromRef(c.getAttribute("r") || "");
      const t = c.getAttribute("t");
      let val: string;
      if (t === "inlineStr") {
        const isEl = c.getElementsByTagName("is")[0];
        const tEl = isEl ? isEl.getElementsByTagName("t")[0] : null;
        val = tEl ? (tEl.textContent || "") : "";
      } else {
        const vEl = c.getElementsByTagName("v")[0];
        const raw = vEl ? (vEl.textContent || "") : "";
        val = t === "s" ? (sharedStrings[Number(raw)] || "") : raw;
      }
      row[idx] = val;
    });
    for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = "";
    return row;
  });
}

async function parseActivitiesXlsx(file: File): Promise<{ headers: string[]; rows: string[][] } | null> {
  const buf = await file.arrayBuffer();
  const zip = await (window.JSZip as JSZipCtor).loadAsync(buf);
  const sheetPath = await resolveFirstSheetPath(zip);
  if (!sheetPath) return null;
  const sheetEntry = zip.file(sheetPath);
  if (!sheetEntry) return null;
  const [sheetXml, sharedStrings] = await Promise.all([sheetEntry.async("string"), loadSharedStrings(zip)]);
  const allRows = parseSheetRows(sheetXml, sharedStrings);
  if (!allRows.length) return null;
  return { headers: allRows[0], rows: allRows.slice(1) };
}

interface ColumnMap { code: number; name: number; unit?: number; qty?: number; perf?: number; teams?: number; type?: number; milestoneCode?: number; }
const HEADER_KEYWORDS: { field: keyof ColumnMap; keywords: string[] }[] = [
  { field: "code", keywords: ["codigo edt", "edt"] },
  { field: "name", keywords: ["nombre de la actividad", "actividad"] },
  { field: "milestoneCode", keywords: ["codigo de hito"] },
  { field: "type", keywords: ["tipo"] },
  { field: "unit", keywords: ["unidad"] },
  { field: "qty", keywords: ["metrado"] },
  { field: "perf", keywords: ["rendimiento"] },
  { field: "teams", keywords: ["equipos"] }
];
function normalizeHeader(s: string): string {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
// Empareja columnas por el TEXTO del encabezado (no por posición fija): así
// tolera que el usuario reordene columnas en Excel al completar el archivo.
function mapHeaderColumns(headerRow: string[]): ColumnMap | null {
  const norm = headerRow.map(normalizeHeader);
  const map: Partial<ColumnMap> = {};
  HEADER_KEYWORDS.forEach(({ field, keywords }) => {
    const idx = norm.findIndex((h) => keywords.some((kw) => h.indexOf(kw) !== -1));
    if (idx !== -1) map[field] = idx;
  });
  if (map.code == null || map.name == null) return null;
  return map as ColumnMap;
}

interface ReconcileResult {
  byLeaf: Record<string, ActivityRow[]>; idCounter: number; matched: number; unmatchedCodes: string[];
  milestones: MilestoneRow[]; matchedMilestones: number; milestoneIssues: string[];
}
// Agrupa las filas del archivo por el id real del paquete de trabajo
// (emparejado por código EDT, calculado localmente con leafRows() -- nunca
// contra GPI.util.wbsLeaves, para que el import funcione sin gpi-core.js).
// Una fila es un HITO si su columna "Tipo" contiene "hito" o si trae un
// "Código de hito" no vacío (tolerante a que el alumno solo complete uno de
// los dos) -- en ese caso Unidad/Metrado/Rendimiento/N.º de equipos se
// ignoran y el Código EDT es opcional (vacío = hito suelto del proyecto).
// Un hito suelto NUNCA se agrupa en un capítulo aparte: su posición en el
// listado la determina dónde el alumno insertó su fila en el archivo --
// `lastLeafId` rastrea el último paquete reconocido en el orden en que
// aparecen las filas, así que un hito suelto insertado ANTES de la primera
// fila de paquete queda "al principio de todo" (afterLeafId null, p. ej. un
// hito de inicio de proyecto) y uno insertado DESPUÉS de la última fila de
// paquete queda "al final de todo" (afterLeafId = ese último paquete, p. ej.
// un hito de fin de proyecto).
function reconcileImportRows(rows: string[][], colMap: ColumnMap): ReconcileResult {
  const codeToId: Record<string, string> = {};
  leafRows().forEach((l) => { codeToId[l.code] = l.id; });
  const byLeaf: Record<string, ActivityRow[]> = {};
  const milestones: MilestoneRow[] = [];
  let n = 0, matched = 0, mn = 0, matchedMilestones = 0;
  let lastLeafId: string | null = null;
  const unmatched = new Set<string>();
  const milestoneIssues: string[] = [];
  rows.forEach((row) => {
    const code = String(row[colMap.code] || "").trim();
    const name = String(row[colMap.name] || "").trim();
    const type = colMap.type != null ? normalizeHeader(String(row[colMap.type] || "")) : "";
    const milestoneCode = colMap.milestoneCode != null ? String(row[colMap.milestoneCode] || "").trim() : "";
    const isMilestone = type.indexOf("hito") !== -1 || !!milestoneCode;
    if (isMilestone) {
      if (!name) return; // fila de hito sin nombre: caso normal (plantilla sin completar), se omite
      if (!milestoneCode) { milestoneIssues.push('Hito "' + name + '" sin "Código de hito": no se importó.'); return; }
      let leafId: string | null = null;
      if (code) {
        leafId = codeToId[code] || null;
        if (!leafId) { milestoneIssues.push('Hito "' + milestoneCode + ' — ' + name + '": el Código EDT "' + code + '" no coincide con ningún paquete de la EDT actual, no se importó.'); return; }
      }
      milestones.push({ id: "m" + (++mn), code: milestoneCode, name, leafId, afterLeafId: leafId ? null : lastLeafId });
      matchedMilestones++;
      return;
    }
    if (!code || !name) return; // fila de la plantilla sin completar: caso normal, se omite
    const leafId = codeToId[code];
    if (!leafId) { unmatched.add(code); return; }
    lastLeafId = leafId; // ancla para el próximo hito suelto que aparezca después en el archivo
    const unit = colMap.unit != null ? String(row[colMap.unit] || "").trim() : "";
    const qty = colMap.qty != null ? (parseExcelNum(row[colMap.qty]) || "") : "";
    const perf = colMap.perf != null ? (parseExcelNum(row[colMap.perf]) || "") : "";
    const teams = colMap.teams != null ? (parseExcelNum(row[colMap.teams]) || "") : "";
    if (!byLeaf[leafId]) byLeaf[leafId] = [];
    byLeaf[leafId].push({ id: "a" + (++n), name, unit, qty, perf, teams: teams || 1 });
    matched++;
  });
  return { byLeaf, idCounter: n + 1, matched, unmatchedCodes: Array.from(unmatched), milestones, matchedMilestones, milestoneIssues };
}

async function importActivitiesExcel(file: File): Promise<void> {
  let parsed: { headers: string[]; rows: string[][] } | null;
  try {
    parsed = await parseActivitiesXlsx(file);
  } catch (_) {
    await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
    return;
  }
  if (!parsed) { await showAlert("El archivo no contiene datos reconocibles."); return; }
  const colMap = mapHeaderColumns(parsed.headers);
  if (!colMap) {
    await showAlert("No reconocí las columnas del archivo. Se esperan al menos «Código EDT» y «Nombre de la actividad» — no renombres esas columnas de la plantilla.");
    return;
  }
  const result = reconcileImportRows(parsed.rows, colMap);
  if (!result.matched && !result.matchedMilestones) {
    await showAlert("No se encontró ninguna fila válida para importar: revisa que los códigos EDT del archivo coincidan con la EDT actual y que la columna de nombre de actividad esté completa.");
    return;
  }
  const s = stats();
  let msg = "Se reemplazarán las " + (s.total + s.orphans) + " actividades de la lista actual por " + result.matched + " actividad(es)" + (result.matchedMilestones ? " y " + result.matchedMilestones + " hito(s)" : "") + " importado(s) del archivo" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT no se toca.";
  if (result.unmatchedCodes.length) {
    msg += " " + result.unmatchedCodes.length + " fila(s) no se importaron por no coincidir con ningún código EDT actual: " + result.unmatchedCodes.slice(0, 8).join(", ") + (result.unmatchedCodes.length > 8 ? "…" : "") + ".";
  }
  if (result.milestoneIssues.length) {
    msg += " " + result.milestoneIssues.length + " hito(s) con problemas: " + result.milestoneIssues.slice(0, 5).join(" ") + (result.milestoneIssues.length > 5 ? "…" : "");
  }
  const ok = await showConfirm(msg, "Importar actividades desde Excel");
  if (!ok) return;
  if (mode === "sample") stateSample = { byLeaf: result.byLeaf, idCounter: result.idCounter, milestones: result.milestones };
  else stateLive = { byLeaf: result.byLeaf, idCounter: result.idCounter, milestones: result.milestones };
  onDirty(true);
  const issues = result.unmatchedCodes.length + result.milestoneIssues.length;
  setStatus(result.matched + " actividad(es)" + (result.matchedMilestones ? " y " + result.matchedMilestones + " hito(s)" : "") + " importado(s) desde Excel" + (issues ? (" · " + issues + " fila(s) no reconciliada(s)") : "") + ".");
}

// ---------- toolbar ----------
function wireToolbar(): void {
  document.getElementById("btnExportJson")!.addEventListener("click", exportJson);
  document.getElementById("btnImportJson")!.addEventListener("click", () => { (document.getElementById("fileInput") as HTMLInputElement).click(); });
  document.getElementById("fileInput")!.addEventListener("change", (e) => { const files = (e.target as HTMLInputElement).files; if (files && files[0]) importJson(files[0]); (e.target as HTMLInputElement).value = ""; });
  document.getElementById("btnReload")!.addEventListener("click", () => {
    gpiPullWbs(); render();
    setStatus("EDT recargada desde el proyecto activo.");
  });
  document.getElementById("btnCopyTable")!.addEventListener("click", copyWholeTable);
  document.getElementById("btnDownloadTemplate")!.addEventListener("click", downloadTemplate);
  document.getElementById("btnImportExcel")!.addEventListener("click", () => { (document.getElementById("xlsxFileInput") as HTMLInputElement).click(); });
  document.getElementById("xlsxFileInput")!.addEventListener("change", (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files[0]) importActivitiesExcel(files[0]);
    (e.target as HTMLInputElement).value = "";
  });
  document.getElementById("btnReport")!.addEventListener("click", buildReport);
  document.getElementById("btnPrint")!.addEventListener("click", () => { window.print(); });
  document.getElementById("btnSample")!.addEventListener("click", enterSample);
  document.getElementById("btnLive")!.addEventListener("click", enterLive);
  document.getElementById("btnLoadSampleLive")!.addEventListener("click", loadSampleIntoProject);
  document.getElementById("btnClear")!.addEventListener("click", async () => {
    const s = stats();
    const ok = await showConfirm("Se eliminarán las " + (s.total + s.orphans) + " actividades de la lista actual" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT no se toca. ¿Continuar?", "Limpiar actividades");
    if (!ok) return;
    if (mode === "sample") stateSample = { byLeaf: {}, idCounter: 1, milestones: [] };
    else stateLive = { byLeaf: {}, idCounter: 1, milestones: [] };
    onDirty(true);
    setStatus("Lista de actividades vacía.");
  });
}

// ===== Puente con el Panel de Control (GPI) =====
// La EDT se LEE del módulo wbs (nunca se duplica ni se edita aquí); las
// actividades se guardan en el módulo "activities" del proyecto activo.
function gpiPullWbs(): void {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
  wbsLive = window.GPI.getModule("wbs") ?? null;
}
function gpiPush(): void {
  if (mode === "sample") return; // el modo ejemplo jamás escribe sobre el proyecto
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
  window.GPI.setModule("activities", stateLive as unknown as ActivitiesModule);
  window.GPI.patchMeta({ name: (document.getElementById("projectTitle") as HTMLInputElement).value, course: (document.getElementById("courseTitle") as HTMLInputElement).value });
}

let initialized = false;
function init(): void {
  if (initialized) return; // guardia: un doble DOMContentLoaded no debe re-leer el estado
  initialized = true;
  wireToolbar();

  if (typeof window.GPI !== "undefined" && window.GPI.available()) {
    const proj = window.GPI.active();
    if (proj) {
      if (proj.meta) {
        if (proj.meta.name) (document.getElementById("projectTitle") as HTMLInputElement).value = proj.meta.name;
        if (proj.meta.course) (document.getElementById("courseTitle") as HTMLInputElement).value = proj.meta.course;
      }
      gpiPullWbs();
      const mod = window.GPI.getModule("activities");
      if (mod) stateLive = normalizeState(mod);
      setStatus("Proyecto cargado desde el Panel de Control.");
    }
    window.addEventListener("beforeunload", gpiPush);
    document.addEventListener("visibilitychange", () => { if (document.hidden) gpiPush(); });
    window.GPI.onChange(() => {
      // otra pestaña (p. ej. WBS Builder) cambió el proyecto: refrescar la
      // EDT sin perder lo que se está escribiendo aquí
      if (mode === "live") { gpiPullWbs(); render(); }
    });
    gpiBadge(proj ? (proj.meta && proj.meta.name) : "", gpiPush);
  } else {
    const bn = document.getElementById("banner") as HTMLElement;
    bn.classList.add("show");
    bn.innerHTML = "<b>Vista previa sin almacenamiento persistente.</b> Abre este archivo junto a <code>gpi-core.js</code> y los demás módulos desde un servidor local o GitHub Pages para leer la EDT real del proyecto. Mientras tanto trabajas con el modo ejemplo.";
    enterSample();
    return;
  }
  render();
}

function gpiBadge(name: string | undefined, pushFn: () => void): void {
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div");
  bar.className = "gpi-badge";
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + String(name || "—").replace(/</g, "&lt;") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  const sb = bar.querySelector("#gpiSyncBtn");
  if (sb) sb.addEventListener("click", () => {
    pushFn(); const t = sb.textContent; sb.textContent = "✓ Sincronizado";
    setTimeout(() => { sb.textContent = t; }, 1400);
  });
}

document.addEventListener("DOMContentLoaded", init);
