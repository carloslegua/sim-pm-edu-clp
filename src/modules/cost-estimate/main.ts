/* =========================================================
   Estimar los Costos — estimación de costo por ACTIVIDAD
   El paquete de trabajo NO tiene Unidad/Cantidad propias: esos datos
   viven en la ACTIVIDAD, el último nivel de planificación (EDT →
   paquete de trabajo → actividades), ya definidos en "Definir las
   Actividades" (Activity_Definition.html, módulo "activities"). Este
   módulo REUTILIZA esas actividades (mismo id/nombre/unidad/metrado) y
   solo agrega el Precio Unitario por actividad; el costo de un paquete
   es la SUMA de los subtotales de sus actividades -- igual que la
   duración de un paquete se deriva de sus actividades en PERT/CPM.

   Se exporta/importa un .xlsx (mismo mecanismo hand-rolled con JSZip
   que "Definir las Actividades") cuyas filas se reconcilian contra las
   actividades actuales por Código EDT Y por Nombre de la actividad. El
   mismo botón de exportación reproduce el archivo que se importó --
   sirve de plantilla en blanco cuando el proyecto no tiene precios
   aún, y de "foto" del estado actual para seguir editando afuera
   cuando ya los tiene. Subtotal (Cantidad × Precio unitario) NUNCA se
   persiste -- se recalcula siempre, mismo principio que la Duración en
   Actividades/PERT.

   Mismo patrón que OBS/WBS/Actividades: addEventListener exclusivamente,
   window.GPI explícito, IIFE propio. Depende además de window.JSZip
   (CDN, cargado antes en el HTML) para generar y leer el .xlsx.

   DELIBERADAMENTE NO se usa GPI.ui.esc (modo suelto sin gpi-core.js).
   DELIBERADAMENTE usa treeRows()/leafRows() locales en vez de
   GPI.util.wbsCodes/wbsLeaves (igual que Actividades/Cronograma-CPM):
   el módulo debe poder calcular los mismos códigos EDT aunque
   gpi-core.js no cargue (modo standalone). Por el mismo motivo lee
   `activities` en vivo en vez de asumir que siempre viene de gpi-core.
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { ActivitiesModule, ActivityItem, CostEstimateModule, EditSession, MilestoneItem, ProjectMeta, WbsModule } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";

type GpiApi = typeof GpiCore.GPI;
declare global {
  interface Window { GPI?: GpiApi; JSZip?: JSZipCtor; }
}

// Tipado mínimo de la API de JSZip que este módulo usa (librería externa
// vía CDN, ver el <script> en el HTML) -- tanto para ESCRIBIR (exportar
// el estado actual) como para LEER (importar el archivo completado).
interface JSZipFileEntry { async(type: "string"): Promise<string>; }
interface JSZipInstance {
  file(name: string, content: string): void;
  file(name: string): JSZipFileEntry | null;
  generateAsync(opts: { type: "blob"; mimeType: string }): Promise<Blob>;
}
interface JSZipCtor { new (): JSZipInstance; loadAsync(data: ArrayBuffer): Promise<JSZipInstance>; }

// ---------- estado ----------
// El precio se guarda POR ACTIVIDAD, referenciando su id -- ni la EDT ni
// las actividades se duplican aquí, se leen en vivo desde WBS Builder y
// Definir las Actividades a través de gpi-core (fuente única de verdad).
interface EstimateState { byActivity: Record<string, string | number>; }

let mode: "live" | "sample" = "live";
let stateLive: EstimateState = { byActivity: {} };
// Id. del proyecto activo cuando esta pestaña cargó sus datos -- se
// compara contra GPI.activeId() antes de cada guardado (ver gpiPush())
// para nunca escribir este estimado sobre un proyecto distinto que se
// haya activado desde otra pestaña mientras esta seguía abierta (bug
// real reportado por el usuario, confirmado sistémico en los 13 módulos
// de herramienta).
let loadedProjectId: string | null = null;
let session: EditSession | null = null; // versión del estimado que esta pestaña cargó (GPI.openSession)
let projectStale = false;
let stateSample: EstimateState | null = null;
let wbsLive: WbsModule | null = null;
let activitiesLive: ActivitiesModule | null = null;

function state(): EstimateState { return (mode === "sample" ? stateSample : stateLive) as EstimateState; }
function wbsData(): WbsModule | null { return mode === "sample" ? SAMPLE_WBS : wbsLive; }
function activitiesData(): ActivitiesModule | null { return mode === "sample" ? SAMPLE_ACTIVITIES : activitiesLive; }

// ---------- utilidades ----------
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function setStatus(m: string): void { (document.getElementById("statusLeft") as HTMLElement).textContent = m; }
function normalizeState(obj: any): EstimateState {
  obj = obj || {};
  const by: Record<string, string | number> = {}, src = obj.byActivity || {};
  Object.keys(src).forEach((k) => { if (src[k] != null && src[k] !== "") by[k] = src[k]; });
  return { byActivity: by };
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
function activitiesOf(leafId: string): ActivityItem[] {
  const acts = activitiesData();
  return (acts && acts.byLeaf && acts.byLeaf[leafId]) || [];
}
// Los hitos son de SOLO LECTURA aquí (vienen de "Definir las Actividades",
// nunca se les asigna precio): se listan para trazabilidad pero no
// participan de pkgSubtotal/pkgComplete/stats().totalCost.
function milestonesOf(leafId: string): MilestoneItem[] {
  const acts = activitiesData();
  return ((acts && acts.milestones) || []).filter((m) => m.leafId === leafId);
}
function allMilestones(): MilestoneItem[] {
  const acts = activitiesData();
  return (acts && acts.milestones) || [];
}
// Agrupa los hitos SUELTOS (sin paquete) según dónde deben insertarse en el
// listado -- NUNCA se agrupan en un capítulo aparte tipo "Hitos del
// proyecto": "start" = antes de la fase 1 (p. ej. un hito de inicio de
// proyecto), "afterLeaf[id]" = justo después del paquete `id` (p. ej. el id
// del último paquete produce un hito de fin de proyecto), "orphan" = su
// afterLeafId apuntaba a un paquete que ya no existe (se muestra al final,
// para no perder el dato). Mismo criterio que placeLooseMilestones en
// activities/main.ts (copia local deliberada, ver comentario de cabecera).
function placeLooseMilestones(milestones: MilestoneItem[], knownLeafIds: Record<string, boolean>): { start: MilestoneItem[]; afterLeaf: Record<string, MilestoneItem[]>; orphan: MilestoneItem[] } {
  const start: MilestoneItem[] = [], orphan: MilestoneItem[] = [];
  const afterLeaf: Record<string, MilestoneItem[]> = {};
  milestones.filter((m) => !m.leafId).forEach((m) => {
    if (!m.afterLeafId) start.push(m);
    else if (knownLeafIds[m.afterLeafId]) (afterLeaf[m.afterLeafId] ||= []).push(m);
    else orphan.push(m);
  });
  return { start, afterLeaf, orphan };
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
function numOrNull(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const p = parseExcelNum(v);
  return (p === null || p === "") ? null : Number(p);
}
// Subtotal de una actividad (campo DERIVADO — nunca se edita ni se guarda):
// Subtotal = Cantidad (metrado, de "activities") × Precio unitario (de este
// módulo). null si falta alguno de los dos.
function subtotalOf(a: ActivityItem): number | null {
  const qty = numOrNull(a.qty), price = numOrNull(state().byActivity[a.id]);
  return (qty != null && price != null) ? qty * price : null;
}
function fmtMoney(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
}
function fmtQty(v: unknown): string {
  const n = numOrNull(v);
  return n == null ? "—" : n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
}

interface Stats {
  totalCost: number; totalActivities: number; pricedActivities: number; pct: number;
  leavesWithActivities: number; completeLeaves: number; leavesWithoutActivities: TreeRow[];
}

// Estadísticas locales, mismo espíritu que GPI.util.costEstimateRows pero
// calculadas en copia local para que la herramienta funcione sin gpi-core.js.
function stats(): Stats {
  const leaves = leafRows();
  let totalCost = 0, totalActivities = 0, pricedActivities = 0, completeLeaves = 0, leavesWithActivities = 0;
  const leavesWithoutActivities: TreeRow[] = [];
  leaves.forEach((l) => {
    const list = activitiesOf(l.id);
    if (!list.length) { leavesWithoutActivities.push(l); return; }
    leavesWithActivities++;
    let allPriced = true;
    list.forEach((a) => {
      totalActivities++;
      const sub = subtotalOf(a);
      if (sub != null) { pricedActivities++; totalCost += sub; } else allPriced = false;
    });
    if (allPriced) completeLeaves++;
  });
  return {
    totalCost, totalActivities, pricedActivities,
    pct: totalActivities ? Math.round(pricedActivities / totalActivities * 100) : 0,
    leavesWithActivities, completeLeaves, leavesWithoutActivities
  };
}

interface FullRow {
  kind: "project" | "phase" | "package" | "activity" | "milestone";
  n: number; code: string; level: number; name: string;
  id?: string; activityId?: string; unit?: string; qty?: string | number; unitPrice?: string | number; subtotal?: number | null;
  activityCount?: number; pkgSubtotal?: number | null; pkgComplete?: boolean;
  // Solo en filas "milestone": id del paquete al que está ATADO el hito (no
  // el paquete después del cual va posicionado uno suelto) -- undefined =
  // hito suelto. Lo usa exportRowModel()/buildEstimateCsv() para decidir si
  // repetir el Código EDT/Paquete de trabajo del contexto o dejarlos en blanco.
  leafId?: string;
}

// Modelo de filas completo, estilo MS Project: fila 0 = proyecto (tarea
// resumen), Id CONSECUTIVO SIN SALTOS para todas las demás filas (fases,
// paquetes, actividades E HITOS). La tabla, el reporte y el archivo
// exportado comparten esta única fuente para no desalinearse nunca. Este
// Id debe coincidir fila por fila con el Task ID que asigna MS Project al
// mismo cronograma (ahí un hito también es una fila con su propio ID
// consecutivo, nunca un hueco) -- por eso NINGUNA fila, hitos incluidos,
// se salta el contador. Los hitos (de "Definir las Actividades") se listan
// después de las actividades de su paquete si están atados, o se
// intercalan en CUALQUIER posición del listado si van sueltos (ver
// placeLooseMilestones) -- nunca en un bloque aparte -- siempre de solo
// lectura, sin costo.
function fullRows(): FullRow[] {
  const w = wbsData(), out: FullRow[] = [];
  if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
  let n = 0;
  const rootName = ((w.nodes[w.rootId].name || "").trim()) || (document.getElementById("projectTitle") as HTMLInputElement).value || "Proyecto";
  out.push({ kind: "project", n: n++, code: "0", level: 1, name: rootName });
  const tree = treeRows();
  const knownLeafIds: Record<string, boolean> = {};
  tree.forEach((r) => { if (r.kind === "package") knownLeafIds[r.id] = true; });
  const loose = placeLooseMilestones(allMilestones(), knownLeafIds);
  loose.start.forEach((m) => { out.push({ kind: "milestone", n: n++, code: m.code, level: 2, name: m.name }); });
  tree.forEach((r) => {
    if (r.kind === "phase") {
      out.push({ kind: "phase", n: n++, code: r.code, level: r.depth + 1, name: r.name, id: r.id });
      return;
    }
    const list = activitiesOf(r.id);
    let pkgSubtotal = 0, pkgComplete = list.length > 0;
    list.forEach((a) => { const sub = subtotalOf(a); if (sub != null) pkgSubtotal += sub; else pkgComplete = false; });
    out.push({ kind: "package", n: n++, code: r.code, level: r.depth + 1, name: r.name, id: r.id, activityCount: list.length, pkgSubtotal: list.length ? pkgSubtotal : null, pkgComplete });
    list.forEach((a, i) => {
      out.push({ kind: "activity", n: n++, code: r.code + "." + (i + 1), level: r.depth + 2, name: a.name || "", activityId: a.id, unit: a.unit || "", qty: a.qty, unitPrice: state().byActivity[a.id], subtotal: subtotalOf(a) });
    });
    milestonesOf(r.id).forEach((m) => {
      out.push({ kind: "milestone", n: n++, code: m.code, level: r.depth + 2, name: m.name, leafId: r.id });
    });
    (loose.afterLeaf[r.id] || []).forEach((m) => {
      out.push({ kind: "milestone", n: n++, code: m.code, level: r.depth + 1, name: m.name });
    });
  });
  loose.orphan.forEach((m) => { out.push({ kind: "milestone", n: n++, code: m.code, level: 2, name: m.name }); });
  return out;
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

// Tabla de SOLO LECTURA: el precio se carga por import de Excel, no se
// edita celda a celda aquí. Unidad/Cantidad tampoco se editan: vienen de
// "Definir las Actividades".
function renderTable(): void {
  const tbody = document.getElementById("estBody") as HTMLElement;
  const empty = document.getElementById("emptyState") as HTMLElement;
  const rows = fullRows();

  if (!rows.length) {
    tbody.innerHTML = "";
    empty.style.display = "";
    empty.innerHTML = mode === "live"
      ? "<b>La EDT del proyecto activo está vacía.</b><br>Construye primero la estructura de desglose del trabajo en WBS Builder; este módulo estima el costo de las actividades de cada paquete.<br><a class=\"btn\" href=\"WBS_Builder.html\">▦ Abrir WBS Builder</a><button class=\"btn primary\" id=\"btnSampleInner\">Explorar con el modo ejemplo</button>"
      : "<b>Sin EDT de ejemplo.</b>";
    const bi = document.getElementById("btnSampleInner");
    if (bi) bi.addEventListener("click", enterSample);
    return;
  }
  empty.style.display = "none";

  let html = "", total = 0;
  rows.forEach((r) => {
    if (r.kind === "project") {
      html += '<tr class="proj-row">'
        + '<td class="n-cell">' + r.n + '</td>'
        + '<td class="code-cell" style="color:var(--ink-1)">0</td>'
        + '<td colspan="5">' + esc(r.name) + ' <span class="proj-hint">Fila 0</span></td>'
        + '</tr>';
    } else if (r.kind === "phase") {
      html += '<tr class="phase-row">'
        + '<td class="n-cell">' + r.n + '</td>'
        + '<td class="code-cell">' + esc(r.code) + '</td>'
        + '<td colspan="5" style="padding-left:' + (10 + Math.max(0, r.level - 2) * 16) + 'px">' + esc(r.name) + '</td>'
        + '</tr>';
    } else if (r.kind === "package") {
      if (r.pkgSubtotal != null) total += r.pkgSubtotal;
      const sub = !r.activityCount
        ? '<td class="sub-cell empty" title="Este paquete todavía no tiene actividades definidas en Definir las Actividades">sin actividades</td>'
        : (r.pkgComplete
          ? '<td class="sub-cell" title="Suma del Subtotal de sus actividades">' + fmtMoney(r.pkgSubtotal) + '</td>'
          : '<td class="sub-cell partial" title="Suma parcial: todavía faltan precios en alguna actividad de este paquete">' + fmtMoney(r.pkgSubtotal) + ' ⚠</td>');
      html += '<tr class="pkg-row">'
        + '<td class="n-cell">' + r.n + '</td>'
        + '<td class="pk-code">' + esc(r.code) + '</td>'
        + '<td colspan="4" style="padding-left:' + (8 + Math.max(0, r.level - 2) * 16) + 'px"><span class="pk-name">' + esc(r.name) + '</span>'
        + '<span class="pk-count' + (r.activityCount ? '' : ' zero') + '">' + (r.activityCount || 0) + ' act.</span></td>'
        + sub
        + '</tr>';
    } else if (r.kind === "milestone") {
      html += '<tr class="act-row milestone-row">'
        + '<td class="n-cell act-item">' + r.n + '</td>'
        + '<td class="act-code milestone-code">◆ ' + esc(r.code) + '</td>'
        + '<td>' + (r.name ? esc(r.name) : '<span class="rep-note">— sin nombre —</span>') + '<span class="milestone-tag">Hito</span></td>'
        + '<td>—</td><td class="num">—</td><td class="num">—</td>'
        + '<td class="sub-cell empty" title="Los hitos no tienen costo">—</td>'
        + '</tr>';
    } else {
      html += '<tr class="act-row">'
        + '<td class="n-cell act-item">' + r.n + '</td>'
        + '<td class="act-code">' + esc(r.code) + '</td>'
        + '<td>' + (r.name ? esc(r.name) : '<span class="rep-note">— sin nombre —</span>') + '</td>'
        + '<td>' + esc((r.unit as string) || "—") + '</td>'
        + '<td class="num">' + fmtQty(r.qty) + '</td>'
        + '<td class="num">' + fmtQty(r.unitPrice) + '</td>'
        + (r.subtotal == null
          ? '<td class="sub-cell empty" title="Falta el Precio unitario">—</td>'
          : '<td class="sub-cell" title="Subtotal = Cantidad × Precio unitario">' + fmtMoney(r.subtotal) + '</td>')
        + '</tr>';
    }
  });
  html += '<tr class="total-row"><td colspan="6" style="text-align:right">Total estimado</td><td class="sub-cell">' + fmtMoney(total) + '</td></tr>';
  tbody.innerHTML = html;
}

// Copia toda la tabla (con encabezados) como TSV — pegable directo en Excel
function copyWholeTable(): void {
  const rows = fullRows();
  if (!rows.length) { setStatus("No hay tabla que copiar."); return; }
  const lines = ["Id.\tCódigo EDT\tPaquete de trabajo / Actividad\tUnidad\tCantidad\tPrecio unitario\tSubtotal"];
  rows.forEach((r) => {
    const isAct = r.kind === "activity", isMs = r.kind === "milestone";
    lines.push([
      r.n, r.code, (r.name || "") + (isMs ? " (hito)" : ""),
      isAct ? ((r.unit as string) || "") : "",
      isAct ? (r.qty == null ? "" : r.qty) : "",
      isAct ? (r.unitPrice == null ? "" : r.unitPrice) : "",
      isAct && r.subtotal != null ? r.subtotal : (r.kind === "package" && r.pkgSubtotal != null ? r.pkgSubtotal : "")
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
  (document.getElementById("sbTotal") as HTMLElement).textContent = fmtMoney(s.totalCost);
  (document.getElementById("sbCov") as HTMLElement).textContent = s.pricedActivities + "/" + s.totalActivities + " actividades con precio";
  (document.getElementById("sbPct") as HTMLElement).textContent = s.pct + "%";
  const bar = document.getElementById("sbBar") as HTMLElement;
  bar.style.width = s.pct + "%";
  bar.style.background = s.pct >= 100 ? "var(--good)" : (s.pct >= 50 ? "var(--warn)" : "var(--act-a)");
  (document.getElementById("sbPkg") as HTMLElement).textContent = s.completeLeaves + "/" + s.leavesWithActivities + " paquetes con estimado completo";
  const host = document.getElementById("missList") as HTMLElement;
  if (!s.leavesWithActivities && !s.leavesWithoutActivities.length) {
    host.innerHTML = '<div style="font-size:11.5px;color:var(--ink-2)">Sin EDT cargada.</div>';
  } else if (!s.leavesWithoutActivities.length) {
    host.innerHTML = '<div class="miss-ok">✓ Todos los paquetes de trabajo tienen actividades definidas.</div>';
  } else {
    host.innerHTML = s.leavesWithoutActivities.map((l) => '<div class="miss-item"><span class="mc">' + esc(l.code) + '</span><span>' + esc(l.name) + '</span></div>').join("");
  }
}

function renderOrphans(): void {
  const st = state();
  const activityIds: Record<string, boolean> = {};
  leafRows().forEach((l) => { activitiesOf(l.id).forEach((a) => { activityIds[a.id] = true; }); });
  const orphanKeys = Object.keys(st.byActivity).filter((k) => !activityIds[k]);
  const bn = document.getElementById("orphanBanner") as HTMLElement;
  if (!orphanKeys.length) { bn.classList.remove("show"); bn.innerHTML = ""; return; }
  bn.classList.add("show");
  bn.innerHTML = "<b>⚠ " + orphanKeys.length + " precio(s) huérfano(s):</b> tienen un Precio Unitario guardado, pero esa actividad ya no existe en Definir las Actividades (se eliminó o cambió de paquete). No aparecen en la tabla ni en los conteos. "
    + '<button class="btn sm danger" id="btnOrphans">Eliminar huérfanos</button>';
  (document.getElementById("btnOrphans") as HTMLElement).addEventListener("click", async () => {
    const ok = await showConfirm("Se eliminarán definitivamente los " + orphanKeys.length + " precios huérfanos. Si en realidad las actividades cambiaron por error, corrígelas primero en Definir las Actividades y vuelve a recargar.", "Eliminar precios huérfanos");
    if (!ok) return;
    orphanKeys.forEach((k) => { delete st.byActivity[k]; });
    onDirty(true);
    setStatus("Precios huérfanos eliminados.");
  });
}

let dirtyTimer: ReturnType<typeof setTimeout> | undefined;
function onDirty(rerender: boolean): void {
  if (rerender) render(); else renderSidebar();
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(gpiPush, 800);
  setStatus("Cambios sin exportar — se sincronizan solos con el Panel.");
}

// ---------- EDT y actividades DE EJEMPLO (demo independiente) ----------
// Réplica EXACTA de la EDT y de las actividades de ejemplo de "Definir las
// Actividades" (mismos 18 paquetes DISTRIB+, TODOS con actividades
// definidas -- ver src/modules/activities/main.ts, SAMPLE_WBS y
// sampleActivities()). Se copian aquí en vez de importarse porque cada
// módulo debe poder mostrar su modo ejemplo sin gpi-core.js (mismo criterio
// de duplicación local que ya usan WBS/Actividades/PERT/Cronograma-CPM).
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

const SAMPLE_ACTIVITIES: ActivitiesModule = (function () {
  const I = SAMPLE_WBS.ids; const by: Record<string, ActivityItem[]> = {}; let n = 0;
  function A(name: string, unit: string, qty: number, perf?: number, teams?: number): ActivityItem {
    return { id: "a" + (++n), name, unit, qty, perf: (perf == null ? "" : perf), teams: (teams == null ? 1 : teams) };
  }
  by[I.p11] = [A("Elaboración y aprobación del acta de constitución", "doc", 1, 0.25)];
  by[I.p12] = [A("Plan para la dirección del proyecto (líneas base)", "doc", 1, 0.2), A("Planes subsidiarios de gestión", "doc", 6, 0.5)];
  by[I.p13] = [A("Elaboración de informes mensuales de avance", "doc", 4, 0.5), A("Reuniones de control y seguimiento del proyecto", "reunión", 16, 2)];
  by[I.p21] = [A("Calicatas exploratorias", "und", 8, 2), A("Ensayos de laboratorio de suelos", "glb", 1, 0.1), A("Informe geotécnico", "doc", 1, 0.25)];
  by[I.p22] = [A("Memoria de cálculo estructural", "doc", 1, 0.1), A("Planos estructurales", "lám", 24, 2)];
  by[I.p23] = [A("Memoria de cálculo eléctrico y sanitario", "doc", 1, 0.15), A("Planos eléctricos y sanitarios", "lám", 18, 2)];
  by[I.p24] = [A("Trámite de licencia de edificación municipal", "trámite", 1, 0.05), A("Trámite de certificado ITSE", "trámite", 1, 0.1)];
  by[I.p31] = [A("Fabricación de estructuras metálicas", "ton", 260, 15, 2), A("Transporte y entrega de estructuras a obra", "viaje", 12, 3)];
  by[I.p32] = [A("Adquisición y suministro de cemento y agregados", "ton", 800, 100), A("Adquisición y suministro de materiales varios de construcción", "glb", 1, 0.15)];
  by[I.p33] = [A("Adquisición de tableros y equipos eléctricos", "und", 15, 3), A("Adquisición de equipos de instalaciones sanitarias", "und", 10, 2)];
  by[I.p41] = [A("Corte y excavación masiva", "m³", 4800, 320, 2), A("Relleno y compactación con material propio", "m³", 2100, 250), A("Eliminación de material excedente", "m³", 2700, 300), A("Nivelación y perfilado de plataforma", "m²", 6500, 1200)];
  by[I.p42] = [A("Excavación de zanjas para zapatas", "m³", 620, 60, 2), A("Solado de concreto e=10 cm", "m²", 480, 120), A("Acero de refuerzo fy=4200 kg/cm²", "kg", 38500, 2500, 2), A("Concreto f'c=280 kg/cm² en zapatas", "m³", 410, 45, 2), A("Encofrado y desencofrado de cimentaciones", "m²", 950, 90, 2)];
  by[I.p43] = [A("Montaje de columnas metálicas", "und", 48, 6), A("Montaje de vigas y tijerales", "ton", 96, 8), A("Instalación de cobertura TR-4", "m²", 5200, 350, 2)];
  by[I.p44] = [A("Tarrajeo de muros y cielorrasos", "m²", 3200, 40, 2), A("Pintura general de interiores y exteriores", "m²", 3200, 80, 2), A("Cerramiento perimétrico", "m", 320, 20)];
  by[I.p45] = [A("Instalación de tableros y circuitos eléctricos", "pto", 980, 25, 2), A("Instalación de redes sanitarias", "m", 450, 30)];
  by[I.p51] = [A("Pruebas de tableros y circuitos eléctricos", "pto", 120, 30), A("Pruebas hidráulicas de redes sanitarias", "glb", 1, 0.5)];
  by[I.p52] = [A("Capacitación operativa al personal del cliente", "hora", 40, 5), A("Elaboración de manuales de operación y mantenimiento", "doc", 2, 0.5)];
  by[I.p53] = [A("Elaboración de dossier de calidad y planos as-built", "doc", 1, 0.1), A("Acta de entrega y cierre del proyecto", "doc", 1, 0.5)];
  // Mismos tres hitos ilustrativos que src/modules/activities/main.ts (uno
  // suelto al principio de todo, uno atado a un paquete, uno suelto al
  // final de todo) -- se muestran aquí de solo lectura, sin costo, para que
  // el modo ejemplo de Estimar los Costos también los liste en su posición.
  const milestones: MilestoneItem[] = [
    { id: "m1", code: "H1", name: "Inicio del Proyecto", leafId: null, afterLeafId: null },
    { id: "m2", code: "H2", name: "Fin de Cimentaciones", leafId: I.p42 },
    { id: "m3", code: "H3", name: "Cierre del Proyecto", leafId: null, afterLeafId: I.p53 }
  ];
  return { byLeaf: by, idCounter: n + 1, milestones };
})();

// Precio unitario de ejemplo por actividad (ids a1..a43, ver SAMPLE_ACTIVITIES
// arriba). No apunta a reproducir el costo total del WBS de ejemplo (son
// precios ilustrativos por unidad, no calibrados contra ese total) -- ver
// ARCHITECTURE.md para el total resultante. La actividad "Instalación de
// cobertura TR-4" (a20) se deja deliberadamente SIN precio: es el único
// paquete (4.3 Estructura y cobertura) que queda "parcial" en el ejemplo,
// para demostrar ese estado en la UI y en el bloqueo de Costo del WBS.
function sampleEstimate(): EstimateState {
  const byActivity: Record<string, number> = {
    a1: 12000,                          // Acta de constitución (doc x1)
    a2: 20000, a3: 3000,                // Plan de gestión (doc x1) + Planes subsidiarios (doc x6)
    a4: 4000, a5: 800,                  // Informes mensuales (doc x4) + Reuniones de control (reunión x16)
    a6: 800, a7: 15000, a8: 6600,       // Calicatas (und x8) + Ensayos (glb x1) + Informe geotécnico (doc x1)
    a9: 45000, a10: 5000,               // Memoria de cálculo estructural (doc x1) + Planos estructurales (lám x24)
    a11: 35000, a12: 4000,              // Memoria eléctrica/sanitaria (doc x1) + Planos eléctricos/sanitarios (lám x18)
    a13: 25000, a14: 15000,             // Licencia de edificación (trámite x1) + Certificado ITSE (trámite x1)
    a15: 6500, a16: 10000,              // Fabricación estructuras (ton x260) + Transporte a obra (viaje x12)
    a17: 850, a18: 35000,               // Cemento y agregados (ton x800) + Materiales varios (glb x1)
    a19: 12000, a20: 23500,             // Tableros y equipos eléctricos (und x15) + Equipos sanitarios (und x10)
    a21: 40, a22: 35, a23: 25, a24: 7,  // Movimiento de tierras (4 actividades, m³/m²)
    a25: 45, a26: 60, a27: 4.5, a28: 550, a29: 85, // Cimentaciones (5 actividades)
    a30: 3500, a31: 6500,               // Estructura y cobertura (2 de 3 -- a32 sin precio, a propósito)
    a33: 45, a34: 25, a35: 800,         // Acabados y cerramientos (3 actividades)
    a36: 350, a37: 320,                 // Instalaciones MEP (2 actividades)
    a38: 350, a39: 18000,               // Pruebas de instalaciones (2 actividades)
    a40: 300, a41: 8000,                // Capacitación al cliente (2 actividades)
    a42: 25000, a43: 15000              // Acta de entrega y cierre (2 actividades)
  };
  return { byActivity };
}

function enterSample(): void {
  mode = "sample";
  if (!stateSample) stateSample = sampleEstimate();
  render();
  setStatus("Modo ejemplo: EDT y actividades didácticas de DISTRIB+ (no toca los datos del proyecto).");
}
function enterLive(): void {
  mode = "live";
  render();
  setStatus("De vuelta a la EDT del proyecto activo.");
}

// Códigos EDT de un árbol WBS cualquiera (no depende de wbsData()/mode) --
// se usa para calcular los códigos del propio SAMPLE_WBS, clave para
// reconciliar el ejemplo contra la EDT/actividades REALES del proyecto activo.
function wbsCodesOf(wbs: WbsModule): Record<string, string> {
  const codes: Record<string, string> = {};
  (function walk(id: string, code: string): void {
    codes[id] = code;
    (wbs.nodes[id].children || []).forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1)));
  })(wbs.rootId, "");
  return codes;
}

// Precio de ejemplo por NOMBRE de actividad (no por id): permite reconciliar
// contra actividades reales cuyos ids sean distintos a los de SAMPLE_ACTIVITIES.
function samplePriceByName(): Record<string, number> {
  const est = sampleEstimate();
  const out: Record<string, number> = {};
  Object.keys(SAMPLE_ACTIVITIES.byLeaf).forEach((leafId) => {
    SAMPLE_ACTIVITIES.byLeaf[leafId].forEach((a) => {
      const p = est.byActivity[a.id];
      if (p != null && a.name) out[a.name] = Number(p);
    });
  });
  return out;
}

// Filas "virtuales" con los precios de ejemplo, en el mismo orden de columnas
// que reconcileImportRows espera de un archivo real (Código EDT, Paquete de
// trabajo [sin usar], Nombre de la actividad, Unidad, Cantidad, Precio
// unitario) -- así "Cargar ejemplo en el proyecto" reutiliza TAL CUAL la
// misma reconciliación por código EDT + nombre que ya usa el import de
// Excel, en vez de duplicar esa lógica. Las actividades de ejemplo sin
// precio (p. ej. la de "Instalación de cobertura TR-4", dejada a propósito
// sin precio) quedan con la columna de precio en blanco, igual que en la
// exportación real -- reconcileImportRows ya sabe omitirlas sin contarlas
// como huérfanas.
function sampleVirtualRows(): string[][] {
  const codes = wbsCodesOf(SAMPLE_WBS);
  const priceByName = samplePriceByName();
  const rows: string[][] = [];
  Object.keys(SAMPLE_ACTIVITIES.byLeaf).forEach((leafId) => {
    const code = codes[leafId];
    if (!code) return;
    SAMPLE_ACTIVITIES.byLeaf[leafId].forEach((a) => {
      const price = priceByName[a.name || ""];
      rows.push([code, "", a.name || "", a.unit || "", String(a.qty ?? ""), price != null ? String(price) : ""]);
    });
  });
  return rows;
}

// ---------- CARGAR EJEMPLO EN EL PROYECTO ----------
// A diferencia de "Modo ejemplo" (sandbox: nunca toca el proyecto activo),
// esta acción SÍ reemplaza el estimado del proyecto activo real -- mismo
// patrón que ya usa WBS Builder y, ahora, Definir las Actividades para su
// propio "Cargar ejemplo". Requiere que el proyecto activo ya tenga la EDT
// y las actividades de ejemplo cargadas ahí (en ese orden): sin actividades
// reales no hay nada que precificar.
async function loadSampleIntoProject(): Promise<void> {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) {
    await showAlert("Esto solo aplica con un proyecto activo conectado al Panel de Control. Usa \"Modo ejemplo\" para explorar el caso DISTRIB+ sin conexión.");
    return;
  }
  gpiPullWbs();
  const prevMode = mode;
  mode = "live"; // leafRows()/activitiesOf()/reconcileImportRows deben mirar el proyecto REAL
  const liveLeaves = leafRows();
  if (!liveLeaves.length) {
    mode = prevMode;
    await showAlert("La EDT del proyecto activo está vacía. Carga primero el ejemplo en WBS Builder (\"Cargar ejemplo\") y vuelve aquí.");
    return;
  }
  if (!liveLeaves.some((l) => activitiesOf(l.id).length > 0)) {
    mode = prevMode;
    await showAlert("El proyecto activo todavía no tiene actividades. Carga primero el ejemplo en Definir las Actividades (\"⇩ Cargar ejemplo en el proyecto\") y vuelve aquí.");
    return;
  }
  const colMap: ColumnMap = { code: 0, activityName: 2, unit: 3, qty: 4, unitPrice: 5 };
  const result = reconcileImportRows(sampleVirtualRows(), colMap);
  if (!result.matched) {
    mode = prevMode;
    await showAlert("Ninguna actividad de ejemplo coincide con las actividades reales del proyecto (Código EDT + nombre). Revisa que hayas cargado el mismo ejemplo en Definir las Actividades.");
    return;
  }
  let msg = "Se reemplazará el estimado del PROYECTO ACTIVO (no el modo ejemplo) con precios para " + result.matched + " actividad(es) que coinciden con sus actividades reales.";
  if (result.orphanCodes.length) {
    msg += " " + result.orphanCodes.length + " código(s) del ejemplo no se encontraron en la EDT actual: " + result.orphanCodes.slice(0, 8).join(", ") + (result.orphanCodes.length > 8 ? "…" : "") + ".";
  }
  if (result.unmatchedActivities.length) {
    const ex = result.unmatchedActivities.slice(0, 8).map((u) => u.code + " \"" + u.name + "\"").join(", ");
    msg += " " + result.unmatchedActivities.length + " actividad(es) de ejemplo no se encontraron bajo su paquete real: " + ex + (result.unmatchedActivities.length > 8 ? "…" : "") + ".";
  }
  if (result.missingActivities.length) {
    const ex = result.missingActivities.slice(0, 8).map((u) => u.code).join(", ");
    msg += " ⚠ " + result.missingActivities.length + " actividad(es) reales quedan sin precio: " + ex + (result.missingActivities.length > 8 ? "…" : "") + ".";
  }
  const ok = await showConfirm(msg, "Cargar ejemplo en el proyecto");
  if (!ok) { mode = prevMode; render(); return; }
  stateLive = { byActivity: result.byActivity };
  render();
  gpiPush();
  setStatus("Ejemplo DISTRIB+ cargado en el proyecto activo (" + result.matched + " actividad(es) con precio).");
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
function buildReport(): void {
  const s = stats();
  let body = (mode === "sample" ? '<p class="rep-note"><b>Modo ejemplo:</b> este listado usa la EDT y las actividades didácticas, no los datos del proyecto activo.</p>' : '')
    + '<h2>1. Resumen</h2><table class="rep-kv">'
    + '<tr><td>Costo total estimado</td><td><b>' + fmtMoney(s.totalCost) + '</b></td></tr>'
    + '<tr><td>Actividades con precio</td><td>' + s.pricedActivities + ' de ' + s.totalActivities + ' (<b>' + s.pct + '%</b>)</td></tr>'
    + '<tr><td>Paquetes con estimado completo</td><td>' + s.completeLeaves + ' de ' + s.leavesWithActivities + ' paquetes con actividades definidas</td></tr>'
    + (s.leavesWithoutActivities.length ? '<tr><td>Paquetes sin actividades definidas</td><td>⚠ ' + s.leavesWithoutActivities.length + ' (no se pueden costear hasta definirlas en Definir las Actividades)</td></tr>' : '')
    + '</table>'
    + '<h2>2. Estimación de costos por actividad</h2>'
    + '<p class="rep-note">Numeración estilo MS Project: la fila 0 es la tarea resumen del proyecto y el Id corre consecutivo, sin saltos, por todas las filas (incluidos los hitos) — igual que el Task ID de MS Project, para que esta tabla se pueda cotejar fila por fila contra un cronograma pegado o exportado ahí. Unidad y Cantidad vienen de Definir las Actividades; Subtotal = Cantidad × Precio unitario, valor calculado (nunca se ingresa directamente). El costo de un paquete es la suma del Subtotal de sus actividades.</p>'
    + '<table><tr><th style="width:6%">Id.</th><th style="width:9%">Código EDT</th><th>Paquete de trabajo / Actividad</th><th style="width:8%">Unidad</th><th style="width:10%">Cantidad</th><th style="width:11%">Precio unitario</th><th style="width:11%">Subtotal</th></tr>';
  const repRows = fullRows();
  let total = 0;
  if (!repRows.length) {
    body += '<tr><td colspan="7" class="rep-note">— Sin EDT cargada —</td></tr>';
  }
  repRows.forEach((r) => {
    if (r.kind === "project") {
      body += '<tr><td class="num rep-phase" style="text-align:center">0</td><td class="num rep-phase">0</td><td class="rep-phase" colspan="5">' + esc(r.name) + ' <span class="rep-note">(tarea resumen del proyecto)</span></td></tr>';
    } else if (r.kind === "phase") {
      body += '<tr><td class="num rep-phase" style="text-align:center">' + r.n + '</td><td class="num rep-phase">' + esc(r.code) + '</td><td class="rep-phase" colspan="5">' + esc(r.name) + '</td></tr>';
    } else if (r.kind === "package") {
      const pkgTxt = !r.activityCount ? '<span class="rep-note">sin actividades definidas</span>' : ('<b>' + fmtMoney(r.pkgSubtotal) + '</b>' + (r.pkgComplete ? '' : ' (parcial)'));
      body += '<tr><td class="num rep-pkg" style="text-align:center">' + r.n + '</td><td class="num rep-pkg">' + esc(r.code) + '</td><td class="rep-pkg">' + esc(r.name) + '</td><td class="rep-pkg" colspan="3">' + (r.activityCount || 0) + ' actividad(es)</td><td class="num rep-pkg" style="text-align:right">' + pkgTxt + '</td></tr>';
    } else if (r.kind === "milestone") {
      body += '<tr><td class="num" style="text-align:center">' + r.n + '</td>'
        + '<td class="num">◆ ' + esc(r.code) + '</td>'
        + '<td>' + esc(r.name) + ' <span class="rep-note">(hito)</span></td>'
        + '<td>—</td><td class="num" style="text-align:right">—</td><td class="num" style="text-align:right">—</td>'
        + '<td class="num" style="text-align:right">—</td></tr>';
    } else {
      if (r.subtotal != null) total += r.subtotal;
      body += '<tr><td class="num" style="text-align:center">' + r.n + '</td>'
        + '<td class="num">' + esc(r.code) + '</td>'
        + '<td>' + (r.name ? esc(r.name) : '<span class="rep-note">— sin nombre —</span>') + '</td>'
        + '<td>' + esc((r.unit as string) || "—") + '</td>'
        + '<td class="num" style="text-align:right">' + fmtQty(r.qty) + '</td>'
        + '<td class="num" style="text-align:right">' + fmtQty(r.unitPrice) + '</td>'
        + '<td class="num" style="text-align:right">' + fmtMoney(r.subtotal) + '</td></tr>';
    }
  });
  if (repRows.length) body += '<tr><td colspan="6" style="text-align:right"><b>Total estimado</b></td><td class="num" style="text-align:right"><b>' + fmtMoney(total) + '</b></td></tr>';
  body += '</table>';
  reportShell("Estimación de Costos por Actividad", "Estimar los Costos · Gestión de Costos", body);
}

// ---------- OOXML .xlsx a mano (mismo mecanismo que Definir las Actividades) ----------
function xmlEsc(s: unknown): string { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

interface XlCell { v: string | number; t: "s" | "n"; s?: number; }

const TEMPLATE_HEADERS = ["Id.", "Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"];
// Nombre EXACTO de la hoja de datos dentro del .xlsx (el mismo que escribe
// buildEstimateXlsxBlob() más abajo). Si el alumno junta varios módulos en
// un solo libro de Excel, esta es la única forma confiable de saber cuál
// hoja es la de Estimar los Costos -- nunca "la primera hoja del archivo".
const DATA_SHEET_NAME = "Estimado";

// Estilos: 0 normal · 1 encabezado · 2 centrado · 3 número · 4 nota/instrucciones · 25 título
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

// Modelo de filas del archivo exportado: SIEMPRE deriva de fullRows() (la
// MISMA fuente que la tabla en pantalla y el reporte impreso) y lista TODAS
// las filas que se ven ahí -- proyecto, fases, paquetes (con o sin
// actividades), actividades e hitos -- para que el archivo sea un fiel
// reflejo de la tabla, no solo un listado de actividades. Antes esta
// función omitía proyecto/fases por completo y solo emitía la fila propia
// de un paquete cuando NO tenía actividades (el paquete quedaba implícito,
// repetido en cada una de sus actividades) -- corregido a pedido explícito
// del usuario. Las filas de proyecto/fase/paquete son de solo referencia
// (columna "Tipo" = "Proyecto"/"Fase"/"Paquete") -- un paquete SÍ trae su
// Subtotal acumulado en la columna Subtotal cuando tiene actividades con
// precio, igual que en pantalla. "Nombre de la actividad" NUNCA queda en
// blanco: en una fila de proyecto/fase/paquete repite el nombre de esa
// fila (proyecto/fase/paquete) -- a pedido explícito del usuario, para que
// la columna sirva de "concepto" uniforme al usar el archivo como tabla
// dinámica en Excel (una columna vacía intercalada rompe el agrupado). La
// distinción entre una fila de referencia y una de actividad real para
// reconciliar al importar la da la columna "Tipo" (blanco = actividad),
// nunca si "Nombre de la actividad" tiene contenido o no -- ver
// reconcileImportRows(). Con datos, este archivo reproduce exactamente lo
// que se importaría de vuelta (round-trip); ver resolveLeaf() ahí, que
// acepta tanto el Código EDT del paquete como el de la actividad.
// Los hitos (de "Definir las Actividades") se agregan como filas de solo
// referencia -- columna "Tipo"="Hito" y precios siempre en blanco -- para
// que el archivo exportado los muestre junto a las actividades costeadas
// sin que se confundan con ellas al reimportar (reconcileImportRows las
// omite por completo al ver Tipo="Hito"). Nunca se agrupan en un bloque
// aparte: un hito suelto sale en la misma posición que le asignó
// placeLooseMilestones (antes del primer paquete, después de un paquete
// concreto, o al final si su ancla ya no existe); uno ATADO repite el
// Código EDT/Paquete de trabajo de su paquete (de referencia, nunca su
// propia numeración EDT), uno SUELTO los deja en blanco.
function exportRowModel(): Array<Array<XlCell | null>> {
  const head: XlCell[] = TEMPLATE_HEADERS.map((h) => ({ v: h, t: "s", s: 1 }));
  const out: Array<Array<XlCell | null>> = [head];
  let pkgCode = "", pkgName = "";
  fullRows().forEach((r) => {
    if (r.kind === "project") {
      out.push([{ v: r.n, t: "n" }, { v: r.code, t: "s", s: 2 }, { v: r.name || "", t: "s", s: 0 }, { v: r.name || "", t: "s", s: 0 }, { v: "Proyecto", t: "s", s: 0 }, null, null, null, null]);
      return;
    }
    if (r.kind === "phase") {
      out.push([{ v: r.n, t: "n" }, { v: r.code, t: "s", s: 2 }, { v: r.name || "", t: "s", s: 0 }, { v: r.name || "", t: "s", s: 0 }, { v: "Fase", t: "s", s: 0 }, null, null, null, null]);
      return;
    }
    if (r.kind === "package") {
      pkgCode = r.code; pkgName = r.name;
      out.push([
        { v: r.n, t: "n" }, { v: r.code, t: "s", s: 2 }, { v: r.name || "", t: "s", s: 0 }, { v: r.name || "", t: "s", s: 0 },
        { v: "Paquete", t: "s", s: 0 }, null, null, null,
        r.pkgSubtotal != null ? { v: r.pkgSubtotal, t: "n", s: 3 } : null
      ]);
      return;
    }
    if (r.kind === "milestone") {
      const tied = r.leafId != null;
      out.push([
        { v: r.n, t: "n" },
        tied ? { v: pkgCode, t: "s", s: 2 } : null,
        tied ? { v: pkgName, t: "s", s: 0 } : null,
        { v: r.code + " — " + r.name, t: "s", s: 0 },
        { v: "Hito", t: "s", s: 0 },
        null, null, null, null
      ]);
      return;
    }
    // activity
    const qty = numOrNull(r.qty), price = numOrNull(r.unitPrice), subtotal = r.subtotal ?? null;
    out.push([
      { v: r.n, t: "n" },
      { v: r.code, t: "s", s: 2 },
      { v: pkgName, t: "s", s: 0 },
      { v: r.name || "", t: "s", s: 0 },
      null,
      r.unit ? { v: r.unit, t: "s", s: 0 } : null,
      qty != null ? { v: qty, t: "n" } : null,
      price != null ? { v: price, t: "n", s: 3 } : null,
      subtotal != null ? { v: subtotal, t: "n", s: 3 } : null
    ]);
  });
  return out;
}

function templateInstructions(): Array<Array<XlCell | null>> {
  const L: Array<[string, number]> = [
    ["Cómo completar este archivo", 25],
    ["", 0],
    ["0. Si guardas todo el proyecto en un solo libro de Excel (varias hojas para varios módulos), esta hoja debe llamarse exactamente “" + DATA_SHEET_NAME + "” y sus encabezados deben coincidir EXACTAMENTE con los de esta plantilla (se puede reordenar columnas, pero no renombrarlas ni abreviarlas): al importar se verifican ambas cosas y se rechaza el archivo si no calzan, para no mezclar datos de otro módulo por error.", 4],
["1. Este archivo es un reflejo COMPLETO de la tabla: trae una fila por cada fila que ves en pantalla -- el proyecto (Tipo=“Proyecto”), cada fase (Tipo=“Fase”), cada paquete de trabajo (Tipo=“Paquete”, con su Subtotal acumulado si ya tiene precios) y, debajo de cada paquete, sus actividades. Solo las filas de ACTIVIDAD llevan precio: para completar el precio de una, ubícala por su “Código EDT” y “Nombre de la actividad” (ya vienen de “Definir las Actividades”, no las edites) -- si además cambias “Paquete de trabajo”, debe seguir siendo el nombre real de ese paquete: si no coincide, la fila se rechaza al importar (protección contra mezclar filas de otro proyecto).", 4],
    ["1b. Las filas de Proyecto/Fase/Paquete son de referencia -- repiten su propio nombre también en “Nombre de la actividad” (para que esa columna nunca quede vacía, útil si armas una tabla dinámica en Excel), pero se identifican y se ignoran solas al reimportar por su columna “Tipo”, no hace falta tocarlas ni borrarlas.", 4],
    ["1c. La columna “Id.” es el mismo correlativo consecutivo (sin saltos, como el Task ID de MS Project) que ves en pantalla y en Definir las Actividades -- Código EDT y Nombre de la actividad siguen siendo la clave para reconciliar el precio, pero si el Id. de una fila ya no corresponde, en el proyecto actual, al mismo Código EDT/Nombre que trae el archivo (por ejemplo, porque editaste la EDT o las actividades después de exportarlo), se avisa igual: revisa esas filas antes de confiar en el resultado.", 4],
    ["2. Completa “Precio unitario” para cada actividad.", 4],
    ["3. La columna “Subtotal” es de referencia (Cantidad × Precio unitario, o la suma de sus actividades en la fila de un paquete): se recalcula sola al importar, no hace falta completarla ni editarla a mano.", 4],
    ["4. Un paquete sin ninguna actividad debajo (fila “Paquete” seguida directo de la del siguiente paquete o fase) todavía no tiene actividades definidas -- complétalas primero en “Definir las Actividades”, no aquí.", 4],
    ["4b. Hitos: las filas con “Tipo”=“Hito” son las definidas en “Definir las Actividades” -- aparecen aquí solo como referencia (nunca tienen costo) y se ignoran por completo al reimportar el archivo, no hace falta tocarlas.", 4],
    ["5. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
    ["6. Guarda el archivo y vuelve a “Estimar los Costos” > botón “⇧ Importar desde Excel” para subirlo.", 4],
    ["", 0],
    ["7. Este mismo archivo se puede volver a generar en cualquier momento con “⇩ Exportar a Excel”: si el proyecto ya tiene precios cargados, el archivo sale completo (no en blanco) y, si se reimporta sin tocarlo, reproduce exactamente los mismos datos.", 4],
    ["", 0],
    ["Generado por el simulador GPI — módulo Estimar los Costos.", 4]
  ];
  return L.map((row) => [{ v: row[0], t: "s", s: row[1] === 25 ? 25 : 4 }]);
}

async function buildEstimateXlsxBlob(): Promise<Blob> {
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
    + '<sheets><sheet name="Estimado" sheetId="1" r:id="rId1"/><sheet name="Instrucciones" sheetId="2" r:id="rId2"/></sheets>'
    + '</workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  zip.file("xl/styles.xml", xlsxStylesXml());
  zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(exportRowModel(), [6, 10, 26, 34, 8, 10, 11, 14, 14], true));
  zip.file("xl/worksheets/sheet2.xml", xlsxSheetXml(templateInstructions(), [115], false));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// Mismo criterio que exportRowModel() (ver su comentario): deriva de
// fullRows() para que el Id., el Código EDT y todo lo demás sean idénticos
// a los del .xlsx y a los de la tabla en pantalla -- es el CSV de reserva
// cuando window.JSZip no está disponible.
function buildEstimateCsv(): string {
  function cell(v: unknown): string { const s = String(v == null ? "" : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const lines = [TEMPLATE_HEADERS.join(";")];
  let pkgCode = "", pkgName = "";
  fullRows().forEach((r) => {
    if (r.kind === "project") { lines.push([cell(r.n), cell(r.code), cell(r.name || ""), cell(r.name || ""), "Proyecto", "", "", "", ""].join(";")); return; }
    if (r.kind === "phase") { lines.push([cell(r.n), cell(r.code), cell(r.name || ""), cell(r.name || ""), "Fase", "", "", "", ""].join(";")); return; }
    if (r.kind === "package") {
      pkgCode = r.code; pkgName = r.name;
      lines.push([cell(r.n), cell(r.code), cell(r.name || ""), cell(r.name || ""), "Paquete", "", "", "", cell(r.pkgSubtotal ?? "")].join(";"));
      return;
    }
    if (r.kind === "milestone") {
      const tied = r.leafId != null;
      lines.push([cell(r.n), tied ? cell(pkgCode) : "", tied ? cell(pkgName) : "", cell(r.code + " — " + r.name), "Hito", "", "", "", ""].join(";"));
      return;
    }
    lines.push([cell(r.n), cell(r.code), cell(pkgName), cell(r.name || ""), "", cell(r.unit || ""), cell(numOrNull(r.qty) ?? ""), cell(numOrNull(r.unitPrice) ?? ""), cell(r.subtotal ?? "")].join(";"));
  });
  return lines.join("\r\n");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function downloadEstimate(): Promise<void> {
  if (!leafRows().length) {
    await showAlert("No hay EDT cargada: construye la estructura en WBS Builder (o entra al modo ejemplo) antes de exportar.");
    return;
  }
  const safe = ((document.getElementById("projectTitle") as HTMLInputElement).value || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  if (window.JSZip) {
    try {
      const blob = await buildEstimateXlsxBlob();
      downloadBlob(blob, "estimacion_costos_" + safe + ".xlsx");
      setStatus("Archivo exportado. Complétalo o revísalo en Excel/MS Project y vuelve a subirlo con «⇧ Importar desde Excel».");
      return;
    } catch (_) { /* si algo falla, cae al CSV */ }
  }
  downloadBlob(new Blob(["﻿" + buildEstimateCsv()], { type: "text/csv;charset=utf-8" }), "estimacion_costos_" + safe + ".csv");
  setStatus("No se pudo cargar la librería de Excel (¿sin conexión?): descargué un CSV equivalente.");
}

// ---------- IMPORTAR DESDE EXCEL (.xlsx real, no pegado de celdas) ----------
// Lee el .zip de un .xlsx con JSZip (también sabe LEER, no solo escribir) y
// parsea a mano las partes que hacen falta: no se asume que siempre sea
// "sheet1.xml" (un archivo re-guardado por Excel reescribe todo el paquete),
// y se soportan tanto cadenas compartidas (lo que genera Excel real) como
// cadenas inline (lo que genera nuestra propia exportación).
function colIndexFromRef(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

type SheetResolution = { kind: "found"; path: string } | { kind: "not-found"; sheetNames: string[] } | { kind: "invalid" };

// Busca, ENTRE TODAS las hojas del libro (no solo la primera), la que se
// llama exactamente DATA_SHEET_NAME (insensible a mayúsculas/acentos vía
// normalizeHeader). Antes se asumía que la hoja de datos siempre era
// getElementsByTagName("sheet")[0] -- eso rompe en cuanto el alumno junta
// en un solo .xlsx las hojas de varios módulos (EDT, Estimado, etc.): la
// primera hoja del libro ya no es necesariamente la de este módulo.
async function resolveDataSheetPath(zip: JSZipInstance, expectedName: string): Promise<SheetResolution> {
  const wbEntry = zip.file("xl/workbook.xml");
  if (!wbEntry) return { kind: "invalid" };
  const doc = new DOMParser().parseFromString(await wbEntry.async("string"), "application/xml");
  const sheets = Array.from(doc.getElementsByTagName("sheet"));
  const wanted = normalizeHeader(expectedName);
  const sheetEl = sheets.find((s) => normalizeHeader(s.getAttribute("name") || "") === wanted);
  if (!sheetEl) return { kind: "not-found", sheetNames: sheets.map((s) => s.getAttribute("name") || "").filter(Boolean) };
  const rId = sheetEl.getAttribute("r:id");
  const relsEntry = zip.file("xl/_rels/workbook.xml.rels");
  if (!rId || !relsEntry) return { kind: "invalid" };
  const relsDoc = new DOMParser().parseFromString(await relsEntry.async("string"), "application/xml");
  const rel = Array.from(relsDoc.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rId);
  const target = rel ? rel.getAttribute("Target") || "" : "";
  if (!target) return { kind: "invalid" };
  return { kind: "found", path: target.startsWith("/") ? target.slice(1) : "xl/" + target };
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

type ParsedXlsx = { kind: "ok"; headers: string[]; rows: string[][] } | { kind: "empty" } | { kind: "sheet-not-found"; sheetNames: string[] };

async function parseEstimateXlsx(file: File): Promise<ParsedXlsx> {
  const buf = await file.arrayBuffer();
  const zip = await (window.JSZip as JSZipCtor).loadAsync(buf);
  const resolution = await resolveDataSheetPath(zip, DATA_SHEET_NAME);
  if (resolution.kind === "invalid") return { kind: "empty" };
  if (resolution.kind === "not-found") return { kind: "sheet-not-found", sheetNames: resolution.sheetNames };
  const sheetEntry = zip.file(resolution.path);
  if (!sheetEntry) return { kind: "empty" };
  const [sheetXml, sharedStrings] = await Promise.all([sheetEntry.async("string"), loadSharedStrings(zip)]);
  const allRows = parseSheetRows(sheetXml, sharedStrings);
  if (!allRows.length) return { kind: "empty" };
  return { kind: "ok", headers: allRows[0], rows: allRows.slice(1) };
}

interface ColumnMap { code: number; activityName: number; unit?: number; qty?: number; unitPrice?: number; type?: number; pkgName?: number; id?: number; }
// Valores de "Tipo" que marcan una fila de solo referencia (nunca una
// actividad a precificar): hito, y las filas de proyecto/fase/paquete que
// exportRowModel()/buildEstimateCsv() agregan para que el archivo sea un
// fiel reflejo completo de la tabla (ver su comentario de cabecera).
const NON_ACTIVITY_TYPES = ["hito", "proyecto", "fase", "paquete"];
// Posición por posición con TEMPLATE_HEADERS: "Subtotal" (calculado) es
// null a propósito, nunca se lee para reconciliar.
const TEMPLATE_HEADER_FIELDS: (keyof ColumnMap | null)[] = ["id", "code", "pkgName", "activityName", "type", "unit", "qty", "unitPrice", null];
function normalizeHeader(s: string): string {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
const HEADER_FIELD_BY_TEXT: Record<string, keyof ColumnMap> = {};
TEMPLATE_HEADERS.forEach((h, i) => {
  const field = TEMPLATE_HEADER_FIELDS[i];
  if (field) HEADER_FIELD_BY_TEXT[normalizeHeader(h)] = field;
});
// Empareja columnas por el TEXTO EXACTO del encabezado contra
// TEMPLATE_HEADERS (normalizeHeader solo ignora mayúsculas/acentos/espacios
// sobrantes, no substrings ni sinónimos): así tolera que el alumno
// reordene columnas en Excel, pero rechaza una columna renombrada o
// abreviada ("EDT" en vez de "Código EDT", "Paquete" en vez de "Paquete de
// trabajo") en vez de adivinar por coincidencia parcial -- eso es lo que
// antes permitía, por ejemplo, que una columna ajena con "actividad" en el
// nombre se colara como si fuera "Nombre de la actividad". "Paquete de
// trabajo" SÍ se lee -- ver reconcileImportRows(): además de resolver el
// paquete por Código EDT, verifica que el NOMBRE del paquete en el archivo
// coincida con el nombre real de ese paquete en la EDT actual, para no
// reconciliar una fila contra el paquete equivocado si alguien edita el
// Código EDT a mano sin actualizar el nombre. "Id." también se lee -- ver
// reconcileImportRows(): verifica que, PARA ESE MISMO ID, el Código EDT y
// el Paquete de trabajo/Nombre de la actividad del archivo sigan
// correspondiendo a lo que hay ahora mismo en el proyecto (detecta un
// archivo desactualizado -- exportado antes de un cambio posterior en
// Definir las Actividades -- aunque el texto por sí solo siga siendo
// válido en otra fila).
function mapHeaderColumns(headerRow: string[]): ColumnMap | null {
  const map: Partial<ColumnMap> = {};
  headerRow.forEach((h, idx) => {
    const field = HEADER_FIELD_BY_TEXT[normalizeHeader(h)];
    if (field) map[field] = idx;
  });
  if (map.code == null || map.activityName == null) return null;
  return map as ColumnMap;
}

interface ReconcileResult {
  byActivity: Record<string, string | number>;
  matched: number;
  orphanCodes: string[];
  unmatchedActivities: { code: string; name: string }[];
  packageMismatches: { code: string; fileName: string; realName: string }[];
  idMismatches: { id: number; codeMismatch: boolean; nameMismatch: boolean }[];
  missingActivities: { code: string; name: string }[];
}
// El mismo texto que exportRowModel()/buildEstimateCsv() escriben en
// "Nombre de la actividad" para una fila de fullRows() -- proyecto/fase/
// paquete/actividad repiten su propio nombre, un hito repite "código —
// nombre". Se usa para el chequeo de Id. de más abajo: hay que comparar
// contra EXACTAMENTE lo que el archivo pudo haber escrito ahí, no contra
// `r.name` a secas (que para un hito no incluye su código).
function exportNameOf(r: FullRow): string { return r.kind === "milestone" ? (r.code + " — " + r.name) : (r.name || ""); }
// Reconcilia las filas del archivo contra la EDT y las ACTIVIDADES actuales
// (de WBS Builder y "Definir las Actividades") -- NUNCA contra lo que el
// archivo dice ser, siempre contra el proyecto activo real. Cada fila debe
// coincidir por Código EDT (contra un paquete REAL de la EDT actual) Y por
// Nombre de la actividad (contra una actividad REAL de ese paquete) -- si
// la columna "Paquete de trabajo" está presente, además se verifica que su
// texto coincida con el nombre REAL de ese paquete, para detectar una fila
// donde alguien cambió el Código EDT a mano sin actualizar el nombre (o
// pegó filas de otro proyecto con códigos que por coincidencia existen acá
// también). Ninguna de las tres validaciones es opcional: una fila que
// falle cualquiera de ellas queda fuera de `byActivity`, nunca se importa
// "a medias" ni se asume nada por defecto. Detecta además qué actividades
// reales quedan sin precio tras el import (verificación de cobertura, a
// pedido explícito): no importa si falta la fila entera o si la fila
// estaba pero sin precio completado, ambos casos son "faltante".
// El Código EDT de una fila puede venir en dos formas -- ambas válidas: el
// código del PAQUETE ("4.2", como en archivos exportados antes de que el
// export reprodujera el código propio de cada actividad) o el código de la
// ACTIVIDAD misma ("4.2.1", el que exportRowModel()/buildEstimateCsv()
// escriben hoy, igual que muestra la tabla en pantalla) -- resolveLeaf()
// acepta ambos: si el código exacto no es un paquete, prueba con el prefijo
// resultante de quitarle el último ".N".
// Además, si el archivo trae "Id.", cada fila se contrasta -- POR ESE
// MISMO ID -- contra lo que fullRows() calcula AHORA MISMO para esa
// posición: detecta un archivo desactualizado (exportado antes de un
// cambio posterior en Definir las Actividades que corrió la numeración)
// aunque el Código EDT/Nombre por sí solos sigan siendo válidos en otra
// fila del proyecto actual. Es un aviso (idMismatches), no bloquea el
// import de esa fila si el resto de las validaciones sí pasa.
function reconcileImportRows(rows: string[][], colMap: ColumnMap): ReconcileResult {
  const leaves = leafRows();
  const byCode: Record<string, TreeRow> = {}; leaves.forEach((l) => { byCode[l.code] = l; });
  function resolveLeaf(code: string): TreeRow | undefined {
    if (byCode[code]) return byCode[code];
    const idx = code.lastIndexOf(".");
    return idx > 0 ? byCode[code.slice(0, idx)] : undefined;
  }
  const currentById = new Map<number, { code: string; name: string }>();
  if (colMap.id != null) fullRows().forEach((r) => { currentById.set(r.n, { code: r.code, name: exportNameOf(r) }); });
  const byActivity: Record<string, string | number> = {};
  const orphanCodes: string[] = [];
  const unmatchedActivities: { code: string; name: string }[] = [];
  const packageMismatches: { code: string; fileName: string; realName: string }[] = [];
  const idMismatches: { id: number; codeMismatch: boolean; nameMismatch: boolean }[] = [];
  const pricedIds = new Set<string>();
  let matched = 0;
  rows.forEach((row) => {
    const type = colMap.type != null ? normalizeHeader(String(row[colMap.type] || "")) : "";
    const code = String(row[colMap.code] || "").trim();
    const activityName = String(row[colMap.activityName] || "").trim();
    if (colMap.id != null) {
      const idStr = String(row[colMap.id] || "").trim();
      const idNum = idStr === "" ? NaN : Number(idStr);
      if (!Number.isNaN(idNum)) {
        const current = currentById.get(idNum);
        if (current) {
          const codeMismatch = current.code !== code;
          const nameMismatch = normalizeHeader(current.name) !== normalizeHeader(activityName);
          if (codeMismatch || nameMismatch) idMismatches.push({ id: idNum, codeMismatch, nameMismatch });
        }
      }
    }
    // Una fila de referencia (hito, o proyecto/fase/paquete) se reconoce por
    // "Tipo", NUNCA porque "Nombre de la actividad" venga vacío -- esa
    // columna repite el nombre del proyecto/fase/paquete en esas filas (para
    // que el archivo sirva de tabla dinámica sin celdas vacías), así que ya
    // no es un indicador confiable de "esto no es una actividad".
    if (NON_ACTIVITY_TYPES.some((t) => type.indexOf(t) !== -1)) return;
    if (!code) return; // fila totalmente vacía: caso normal, se omite
    if (!activityName) return; // actividad sin nombre completado todavía: normal, se omite
    const leaf = resolveLeaf(code);
    if (!leaf) { orphanCodes.push(code); return; }
    if (colMap.pkgName != null) {
      const fileName = String(row[colMap.pkgName] || "").trim();
      if (fileName && normalizeHeader(fileName) !== normalizeHeader(leaf.name)) {
        packageMismatches.push({ code, fileName, realName: leaf.name });
        return;
      }
    }
    const candidates = activitiesOf(leaf.id).filter((a) => normalizeHeader(a.name || "") === normalizeHeader(activityName));
    if (!candidates.length) { unmatchedActivities.push({ code, name: activityName }); return; }
    const price = colMap.unitPrice != null ? (parseExcelNum(row[colMap.unitPrice]) || "") : "";
    if (!price) return; // actividad reconocida pero sin precio completado todavía: normal, se omite
    candidates.forEach((a) => { byActivity[a.id] = price; pricedIds.add(a.id); });
    matched += candidates.length;
  });
  const missingActivities: { code: string; name: string }[] = [];
  leaves.forEach((l) => {
    activitiesOf(l.id).forEach((a) => { if (!pricedIds.has(a.id)) missingActivities.push({ code: l.code, name: a.name || "" }); });
  });
  return { byActivity, matched, orphanCodes, unmatchedActivities, packageMismatches, idMismatches, missingActivities };
}

async function importEstimateExcel(file: File): Promise<void> {
  // Distinguir "la librería para leer .xlsx no cargó" de "el archivo está
  // mal" -- bug real reportado por el usuario: con JSZip vendorizado en el
  // repo (ver Estimar_Costos.html) esto ya no depende de Internet, pero
  // sigue siendo la comprobación correcta si el script no llegó a cargar por
  // cualquier otro motivo. Antes, sin esta comprobación, window.JSZip
  // undefined hacía fallar el try/catch de abajo con el mismo mensaje que un
  // archivo corrupto -- engañoso.
  if (!window.JSZip) {
    await showAlert("No se pudo cargar la librería para leer archivos .xlsx (JSZip). Recargá la página e intentá de nuevo; este archivo no llegó a leerse, no es que el .xlsx esté mal.");
    return;
  }
  let parsed: ParsedXlsx;
  try {
    parsed = await parseEstimateXlsx(file);
  } catch (_) {
    await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
    return;
  }
  if (parsed.kind === "sheet-not-found") {
    const otras = parsed.sheetNames.filter((n) => normalizeHeader(n) !== normalizeHeader(DATA_SHEET_NAME));
    await showAlert("No encontré una hoja llamada «" + DATA_SHEET_NAME + "» en este archivo" + (otras.length ? " (tiene: " + otras.join(", ") + ")" : "") + ". Si tu Excel junta varios módulos en un solo libro, la hoja con los datos a importar aquí debe llamarse exactamente «" + DATA_SHEET_NAME + "» (como la que genera «⇩ Exportar a Excel») para que el simulador sepa cuál copiar y no la confunda con la de otro módulo.", "Hoja no reconocida");
    return;
  }
  if (parsed.kind === "empty") { await showAlert("El archivo no contiene datos reconocibles."); return; }
  const colMap = mapHeaderColumns(parsed.headers);
  if (!colMap) {
    await showAlert("No reconocí las columnas del archivo: los encabezados deben coincidir EXACTAMENTE con los de la plantilla (¿renombraste o abreviaste alguna columna, p. ej. «EDT» en vez de «Código EDT», o «Paquete» en vez de «Paquete de trabajo»?). Se esperan al menos «Código EDT» y «Nombre de la actividad» escritas tal cual.");
    return;
  }
  const result = reconcileImportRows(parsed.rows, colMap);
  const totalIssues = result.orphanCodes.length + result.unmatchedActivities.length + result.packageMismatches.length;
  if (!result.matched && !totalIssues) {
    await showAlert("El archivo no tiene ninguna fila con datos: revisa que hayas completado el Precio unitario.");
    return;
  }
  // Nada del archivo corresponde a la EDT ni a las actividades REALES del
  // proyecto activo -- se rechaza por completo en vez de ofrecer
  // "reemplazar" el estimado actual por un resultado vacío: eso borraría
  // precios ya cargados sin haber verificado nada del archivo.
  if (!result.matched && totalIssues) {
    await showAlert("Ninguna fila del archivo coincide con la EDT ni con las actividades del proyecto activo (Código EDT" + (colMap.pkgName != null ? " + Paquete de trabajo" : "") + " + Nombre de la actividad). ¿Es el archivo correcto para este proyecto? No se modificó el estimado actual.", "Archivo no reconciliado");
    return;
  }
  let msg = "Se reemplazará el estimado actual por precios para " + result.matched + " actividad(es) del archivo" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT y las actividades no se tocan.";
  if (result.orphanCodes.length) {
    msg += " " + result.orphanCodes.length + " fila(s) no se importaron por no coincidir con ningún código EDT actual: " + result.orphanCodes.slice(0, 8).join(", ") + (result.orphanCodes.length > 8 ? "…" : "") + ".";
  }
  if (result.packageMismatches.length) {
    const ex = result.packageMismatches.slice(0, 8).map((u) => u.code + " (\"" + u.fileName + "\" ≠ \"" + u.realName + "\")").join(", ");
    msg += " " + result.packageMismatches.length + " fila(s) no se importaron porque el Paquete de trabajo del archivo no coincide con el nombre real de ese Código EDT: " + ex + (result.packageMismatches.length > 8 ? "…" : "") + ".";
  }
  if (result.unmatchedActivities.length) {
    const ex = result.unmatchedActivities.slice(0, 8).map((u) => u.code + " \"" + u.name + "\"").join(", ");
    msg += " " + result.unmatchedActivities.length + " fila(s) no se importaron porque no hay ninguna actividad con ese nombre bajo ese paquete (¿cambiaron en Definir las Actividades?): " + ex + (result.unmatchedActivities.length > 8 ? "…" : "") + ".";
  }
  if (result.idMismatches.length) {
    const anyCode = result.idMismatches.some((m) => m.codeMismatch);
    const anyName = result.idMismatches.some((m) => m.nameMismatch);
    const which = anyCode && anyName ? "la columna Código EDT y la columna Paquete de trabajo / Actividad" : anyCode ? "la columna Código EDT" : "la columna Paquete de trabajo / Actividad";
    msg += " ⚠ " + result.idMismatches.length + " fila(s) tienen un Id. que ya no coincide con lo cargado en Definir las Actividades para esa misma posición: " + which + " no coincide(n) exactamente (¿se editó la EDT o las actividades después de exportar este archivo?).";
  }
  if (result.missingActivities.length) {
    const ex = result.missingActivities.slice(0, 8).map((u) => u.code).join(", ");
    msg += " ⚠ " + result.missingActivities.length + " actividad(es) de la EDT actual quedan sin precio: " + ex + (result.missingActivities.length > 8 ? "…" : "") + ".";
  }
  const ok = await showConfirm(msg, "Importar estimado desde Excel");
  if (!ok) return;
  if (mode === "sample") stateSample = { byActivity: result.byActivity };
  else stateLive = { byActivity: result.byActivity };
  onDirty(true);
  const issues = totalIssues;
  setStatus(result.matched + " actividad(es) con precio importado" + (issues ? (" · " + issues + " fila(s) no reconciliada(s)") : "") + (result.idMismatches.length ? (" · " + result.idMismatches.length + " fila(s) con Id. desactualizado") : "") + (result.missingActivities.length ? (" · " + result.missingActivities.length + " actividad(es) sin precio") : "") + ".");
}

// ---------- toolbar ----------
function wireToolbar(): void {
  document.getElementById("btnReload")!.addEventListener("click", () => {
    gpiPullWbs(); render();
    setStatus("EDT y actividades recargadas desde el proyecto activo.");
  });
  document.getElementById("btnCopyTable")!.addEventListener("click", copyWholeTable);
  document.getElementById("btnExportExcel")!.addEventListener("click", downloadEstimate);
  document.getElementById("btnImportExcel")!.addEventListener("click", () => { (document.getElementById("xlsxFileInput") as HTMLInputElement).click(); });
  document.getElementById("xlsxFileInput")!.addEventListener("change", (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files[0]) importEstimateExcel(files[0]);
    (e.target as HTMLInputElement).value = "";
  });
  document.getElementById("btnReport")!.addEventListener("click", buildReport);
  document.getElementById("btnPrint")!.addEventListener("click", () => { window.print(); });
  document.getElementById("btnSample")!.addEventListener("click", enterSample);
  document.getElementById("btnLive")!.addEventListener("click", enterLive);
  document.getElementById("btnLoadSampleLive")!.addEventListener("click", loadSampleIntoProject);
  document.getElementById("btnClear")!.addEventListener("click", async () => {
    const s = stats();
    const ok = await showConfirm("Se eliminará el precio de las " + s.pricedActivities + " actividades ya con precio" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT y las actividades no se tocan. ¿Continuar?", "Limpiar estimado");
    if (!ok) return;
    if (mode === "sample") stateSample = { byActivity: {} };
    else stateLive = { byActivity: {} };
    onDirty(true);
    setStatus("Estimado de costos vacío.");
  });
}

// ===== Puente con el Panel de Control (GPI) =====
// La EDT y las actividades se LEEN de los módulos wbs/activities (nunca se
// duplican ni se editan aquí); el precio unitario se guarda en el módulo
// "costEstimate" del proyecto activo.
function gpiPullWbs(): void {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
  wbsLive = window.GPI.getModule("wbs") ?? null;
  activitiesLive = window.GPI.getModule("activities") ?? null;
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
    banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el estimado aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
    banner.classList.add("show");
  }
}
function gpiPush(): boolean {
  if (mode === "sample") return false; // el modo ejemplo jamás escribe sobre el proyecto
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return false;
  if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) { markProjectStale(); return false; }
  // Guardado con sesión y resultado común (src/shared/write-session.ts).
  const r = pushWithSession(window.GPI, "costEstimate", "El estimado de costos", stateLive as unknown as CostEstimateModule,
    { name: (document.getElementById("projectTitle") as HTMLInputElement).value, course: (document.getElementById("courseTitle") as HTMLInputElement).value },
    session, { setStatus, onStale: markProjectStale });
  session = r.session;
  return r.ok;
}

let initialized = false;
function init(): void {
  if (initialized) return; // guardia: un doble DOMContentLoaded no debe re-leer el estado
  initialized = true;
  wireToolbar();

  if (typeof window.GPI !== "undefined" && window.GPI.available()) {
    const proj = window.GPI.active();
    loadedProjectId = window.GPI.activeId();
    if (proj) {
      if (proj.meta) {
        if (proj.meta.name) (document.getElementById("projectTitle") as HTMLInputElement).value = proj.meta.name;
        if (proj.meta.course) (document.getElementById("courseTitle") as HTMLInputElement).value = proj.meta.course;
      }
      gpiPullWbs();
      session = window.GPI.openSession("costEstimate"); // versión que esta pestaña carga
      const mod = window.GPI.getModule("costEstimate");
      if (mod) { stateLive = normalizeState(mod); window.GPI.rebaseSession(session, stateLive); }
      setStatus("Proyecto cargado desde el Panel de Control.");
    }
    window.addEventListener("beforeunload", gpiPush);
    document.addEventListener("visibilitychange", () => { if (document.hidden) gpiPush(); });
    window.GPI.onChange(() => {
      if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; }
      // otra pestaña (p. ej. WBS Builder o Definir las Actividades) cambió el
      // proyecto: refrescar sin perder lo que se está escribiendo aquí
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

document.addEventListener("DOMContentLoaded", init);
