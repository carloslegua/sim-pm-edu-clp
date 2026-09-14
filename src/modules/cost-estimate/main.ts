/* =========================================================
   Estimar los Costos — estimación de costo por paquete de trabajo
   Mismo flujo que "Definir las Actividades" (Activity_Definition.html),
   construido primero en esta misma sesión: se exporta/importa un .xlsx
   cuyas filas se reconcilian contra la EDT por Código EDT Y por nombre
   (ambos deben coincidir). A diferencia de Actividades, aquí la
   granularidad es 1 fila = 1 paquete de trabajo (no N actividades por
   paquete), y el mismo botón de exportación reproduce el archivo que se
   importó -- sirve de plantilla en blanco cuando el proyecto no tiene
   estimado aún, y de "foto" del estado actual para seguir editando
   afuera cuando ya lo tiene. Subtotal (Cantidad × Precio unitario)
   NUNCA se persiste -- se recalcula siempre, mismo principio que la
   Duración en Actividades/PERT.

   Mismo patrón que OBS/WBS/Actividades: addEventListener exclusivamente,
   window.GPI explícito, IIFE propio. Depende además de window.JSZip
   (CDN, cargado antes en el HTML) para generar y leer el .xlsx.

   DELIBERADAMENTE NO se usa GPI.ui.esc (modo suelto sin gpi-core.js).
   DELIBERADAMENTE usa treeRows()/leafRows() locales en vez de
   GPI.util.wbsCodes/wbsLeaves: el módulo debe poder calcular los mismos
   códigos EDT aunque gpi-core.js no cargue (modo standalone).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { CostEstimateModule, ProjectMeta, WbsModule } from "../../core/types";

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
// El estimado se guarda POR PAQUETE de trabajo (hoja de la EDT), refe-
// renciando su id: la EDT nunca se duplica aquí, se lee en vivo desde el
// WBS Builder a través de gpi-core (principio de fuente única de verdad).
interface EstimateItem { unit: string; qty: string | number; unitPrice: string | number; }
interface EstimateState { byLeaf: Record<string, EstimateItem>; }

let mode: "live" | "sample" = "live";
let stateLive: EstimateState = { byLeaf: {} };
let stateSample: EstimateState | null = null;
let wbsLive: WbsModule | null = null;

function state(): EstimateState { return (mode === "sample" ? stateSample : stateLive) as EstimateState; }
function wbsData(): WbsModule | null { return mode === "sample" ? SAMPLE_WBS : wbsLive; }

// ---------- utilidades ----------
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function setStatus(m: string): void { (document.getElementById("statusLeft") as HTMLElement).textContent = m; }
function normalizeState(obj: any): EstimateState {
  obj = obj || {};
  const by: Record<string, EstimateItem> = {}, src = obj.byLeaf || {};
  Object.keys(src).forEach((k) => {
    const it = src[k] || {};
    by[k] = { unit: it.unit || "", qty: (it.qty == null ? "" : it.qty), unitPrice: (it.unitPrice == null ? "" : it.unitPrice) };
  });
  return { byLeaf: by };
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
// Subtotal de un ítem (campo DERIVADO — nunca se edita ni se guarda):
// Subtotal = Cantidad × Precio unitario. null si falta alguno de los dos.
function subtotalOf(item: EstimateItem | undefined): number | null {
  if (!item) return null;
  const qty = numOrNull(item.qty), price = numOrNull(item.unitPrice);
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

interface Stats { totalCost: number; leaves: number; covered: number; uncovered: TreeRow[]; pct: number; }

// Estadísticas locales (cobertura de la EDT), mismo espíritu que
// GPI.util.costEstimateRows pero calculadas en copia local para que la
// herramienta funcione sin gpi-core.js.
function stats(): Stats {
  const st = state(), leaves = leafRows();
  let totalCost = 0, covered = 0; const uncovered: TreeRow[] = [];
  leaves.forEach((l) => {
    const sub = subtotalOf(st.byLeaf[l.id]);
    if (sub != null) { covered++; totalCost += sub; } else uncovered.push(l);
  });
  return { totalCost, leaves: leaves.length, covered, uncovered, pct: leaves.length ? Math.round(covered / leaves.length * 100) : 0 };
}

interface FullRow {
  kind: "project" | "phase" | "package";
  n: number; code: string; level: number; name: string;
  id?: string; unit?: string; qty?: string | number; unitPrice?: string | number; subtotal?: number | null;
}

// Modelo de filas completo, estilo MS Project: fila 0 = proyecto (tarea
// resumen), N.º consecutivo para TODAS las filas. La tabla, el reporte y el
// archivo exportado comparten esta única fuente para no desalinearse nunca.
function fullRows(): FullRow[] {
  const w = wbsData(), st = state(), out: FullRow[] = [];
  if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
  let n = 0;
  const rootName = ((w.nodes[w.rootId].name || "").trim()) || (document.getElementById("projectTitle") as HTMLInputElement).value || "Proyecto";
  out.push({ kind: "project", n: n++, code: "0", level: 1, name: rootName });
  treeRows().forEach((r) => {
    if (r.kind === "phase") {
      out.push({ kind: "phase", n: n++, code: r.code, level: r.depth + 1, name: r.name, id: r.id });
    } else {
      const item = st.byLeaf[r.id];
      out.push({
        kind: "package", n: n++, code: r.code, level: r.depth + 1, name: r.name, id: r.id,
        unit: item ? item.unit : "", qty: item ? item.qty : "", unitPrice: item ? item.unitPrice : "",
        subtotal: subtotalOf(item)
      });
    }
  });
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

// Tabla de SOLO LECTURA: el estimado se carga por import de Excel, no se
// edita celda a celda aquí.
function renderTable(): void {
  const tbody = document.getElementById("estBody") as HTMLElement;
  const empty = document.getElementById("emptyState") as HTMLElement;
  const rows = fullRows();

  if (!rows.length) {
    tbody.innerHTML = "";
    empty.style.display = "";
    empty.innerHTML = mode === "live"
      ? "<b>La EDT del proyecto activo está vacía.</b><br>Construye primero la estructura de desglose del trabajo en WBS Builder; este módulo estima el costo de sus paquetes de trabajo.<br><a class=\"btn\" href=\"WBS_Builder.html\">▦ Abrir WBS Builder</a><button class=\"btn primary\" id=\"btnSampleInner\">Explorar con el modo ejemplo</button>"
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
    } else {
      if (r.subtotal != null) total += r.subtotal;
      html += '<tr class="pkg-row">'
        + '<td class="n-cell">' + r.n + '</td>'
        + '<td class="pk-code">' + esc(r.code) + '</td>'
        + '<td style="padding-left:' + (8 + Math.max(0, r.level - 2) * 16) + 'px"><span class="pk-name">' + esc(r.name) + '</span></td>'
        + '<td>' + esc((r.unit as string) || "—") + '</td>'
        + '<td class="num">' + fmtQty(r.qty) + '</td>'
        + '<td class="num">' + fmtQty(r.unitPrice) + '</td>'
        + (r.subtotal == null
          ? '<td class="sub-cell empty" title="Faltan Cantidad y/o Precio unitario">—</td>'
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
  const lines = ["N.º\tCódigo EDT\tPaquete de trabajo\tUnidad\tCantidad\tPrecio unitario\tSubtotal"];
  rows.forEach((r) => {
    const isPkg = r.kind === "package";
    lines.push([
      r.n, r.code, r.name || "",
      isPkg ? ((r.unit as string) || "") : "",
      isPkg ? (r.qty == null ? "" : r.qty) : "",
      isPkg ? (r.unitPrice == null ? "" : r.unitPrice) : "",
      isPkg && r.subtotal != null ? r.subtotal : ""
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
  (document.getElementById("sbCov") as HTMLElement).textContent = s.covered + "/" + s.leaves + " paquetes estimados";
  (document.getElementById("sbPct") as HTMLElement).textContent = s.pct + "%";
  const bar = document.getElementById("sbBar") as HTMLElement;
  bar.style.width = s.pct + "%";
  bar.style.background = s.pct >= 100 ? "var(--good)" : (s.pct >= 50 ? "var(--warn)" : "var(--act-a)");
  const host = document.getElementById("missList") as HTMLElement;
  if (!s.leaves) {
    host.innerHTML = '<div style="font-size:11.5px;color:var(--ink-2)">Sin EDT cargada.</div>';
  } else if (!s.uncovered.length) {
    host.innerHTML = '<div class="miss-ok">✓ Todos los paquetes de trabajo tienen un costo estimado.</div>';
  } else {
    host.innerHTML = s.uncovered.map((l) => '<div class="miss-item"><span class="mc">' + esc(l.code) + '</span><span>' + esc(l.name) + '</span></div>').join("");
  }
}

function renderOrphans(): void {
  const st = state(), leaves = leafRows();
  const leafIds: Record<string, boolean> = {}; leaves.forEach((l) => { leafIds[l.id] = true; });
  const orphanKeys = Object.keys(st.byLeaf).filter((k) => !leafIds[k]);
  const bn = document.getElementById("orphanBanner") as HTMLElement;
  if (!orphanKeys.length) { bn.classList.remove("show"); bn.innerHTML = ""; return; }
  bn.classList.add("show");
  bn.innerHTML = "<b>⚠ " + orphanKeys.length + " paquete(s) huérfano(s):</b> tienen un costo estimado guardado, pero su paquete de trabajo ya no existe en la EDT (o dejó de ser una hoja). No aparecen en la tabla ni en los conteos. "
    + '<button class="btn sm danger" id="btnOrphans">Eliminar huérfanos</button>';
  (document.getElementById("btnOrphans") as HTMLElement).addEventListener("click", async () => {
    const ok = await showConfirm("Se eliminarán definitivamente los " + orphanKeys.length + " estimados huérfanos. Si en realidad la EDT cambió por error, corrígela primero en WBS Builder y vuelve a recargar.", "Eliminar estimados huérfanos");
    if (!ok) return;
    orphanKeys.forEach((k) => { delete st.byLeaf[k]; });
    onDirty(true);
    setStatus("Estimados huérfanos eliminados.");
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
  const data = { kind: "gpi.costEstimate/v1", title: (document.getElementById("projectTitle") as HTMLInputElement).value, course: (document.getElementById("courseTitle") as HTMLInputElement).value, data: state() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  const safe = (data.title || "estimacion_costos").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  a.href = url; a.download = "estimacion_costos_" + safe + ".json";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("Estimado exportado como .json.");
}
function importJson(file: File): void {
  const r = new FileReader();
  r.onload = (e) => {
    let obj: any; try { obj = JSON.parse((e.target as FileReader).result as string); } catch (_) { showAlert("El archivo no es un .json válido."); return; }
    if (obj && obj.kind === "gpi.costEstimate/v1" && obj.data) {
      if (mode === "sample") { stateSample = normalizeState(obj.data); }
      else { stateLive = normalizeState(obj.data); }
      if (obj.title) (document.getElementById("projectTitle") as HTMLInputElement).value = obj.title;
      if (obj.course) (document.getElementById("courseTitle") as HTMLInputElement).value = obj.course;
      render(); gpiPush();
      setStatus("Estimado importado. Los costos se enlazan a la EDT por el id de cada paquete.");
    } else {
      showAlert("No reconocí el formato: se esperaba una exportación de esta herramienta (gpi.costEstimate/v1).");
    }
  };
  r.readAsText(file);
}

// ---------- EDT y estimado DE EJEMPLO (demo independiente) ----------
// Réplica de la EDT de ejemplo compartida ("DISTRIB+ S.A. — Almacén Lurín",
// ver ARCHITECTURE.md "Dataset de referencia (DISTRIB+)"): mismos 18
// paquetes y códigos que WBS Builder/Actividades/PERT/Cronograma-CPM/RACI.
// A diferencia de Actividades, aquí TODOS los paquetes llevan datos: el
// estimado de costos, a diferencia de las actividades, se espera completo
// para poder calcular el BAC del proyecto.
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

// Cantidad/Unidad/Precio unitario calibrados para que cada subtotal
// reproduzca EXACTO el costo ya documentado de ese paquete en el WBS de
// ejemplo (total: S/ 7.100.000 — ver ARCHITECTURE.md).
function sampleEstimate(): EstimateState {
  const I = SAMPLE_WBS.ids;
  function E(unit: string, qty: number, unitPrice: number): EstimateItem { return { unit, qty, unitPrice }; }
  const byLeaf: Record<string, EstimateItem> = {
    [I.p11]: E("glb", 1, 12000),
    [I.p12]: E("glb", 1, 38000),
    [I.p13]: E("glb", 1, 145000),
    [I.p21]: E("pto", 8, 3500),
    [I.p22]: E("m²", 3000, 55),
    [I.p23]: E("pto", 980, 100),
    [I.p24]: E("glb", 1, 64000),
    [I.p31]: E("ton", 260, 7000),
    [I.p32]: E("glb", 1, 715000),
    [I.p33]: E("glb", 1, 415000),
    [I.p41]: E("m³", 2000, 190),
    [I.p42]: E("m³", 1050, 700),
    [I.p43]: E("m²", 2330, 500),
    [I.p44]: E("m²", 2750, 200),
    [I.p45]: E("pto", 970, 500),
    [I.p51]: E("glb", 1, 145000),
    [I.p52]: E("hora", 96, 500),
    [I.p53]: E("glb", 1, 92000)
  };
  return { byLeaf };
}

function enterSample(): void {
  mode = "sample";
  if (!stateSample) stateSample = sampleEstimate();
  render();
  setStatus("Modo ejemplo: EDT y estimado de costos didácticos (no toca los datos del proyecto).");
}
function enterLive(): void {
  mode = "live";
  render();
  setStatus("De vuelta a la EDT del proyecto activo.");
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
  let body = (mode === "sample" ? '<p class="rep-note"><b>Modo ejemplo:</b> este listado usa la EDT y el estimado didácticos, no los datos del proyecto activo.</p>' : '')
    + '<h2>1. Resumen</h2><table class="rep-kv">'
    + '<tr><td>Costo total estimado</td><td><b>' + fmtMoney(s.totalCost) + '</b></td></tr>'
    + '<tr><td>Cobertura de paquetes de trabajo</td><td>' + s.covered + ' de ' + s.leaves + ' paquetes estimados (<b>' + s.pct + '%</b>)</td></tr>'
    + '</table>'
    + '<h2>2. Estimación de costos por paquete de trabajo</h2>'
    + '<p class="rep-note">Numeración estilo MS Project: la fila 0 es la tarea resumen del proyecto y el N.º corre consecutivo por todas las filas. Subtotal = Cantidad × Precio unitario, valor calculado (nunca se ingresa directamente).</p>'
    + '<table><tr><th style="width:6%">N.º</th><th style="width:9%">Código EDT</th><th>Paquete de trabajo</th><th style="width:9%">Unidad</th><th style="width:11%">Cantidad</th><th style="width:12%">Precio unitario</th><th style="width:12%">Subtotal</th></tr>';
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
    } else {
      if (r.subtotal != null) total += r.subtotal;
      body += '<tr><td class="num" style="text-align:center">' + r.n + '</td>'
        + '<td class="num">' + esc(r.code) + '</td>'
        + '<td>' + esc(r.name) + '</td>'
        + '<td>' + esc((r.unit as string) || "—") + '</td>'
        + '<td class="num" style="text-align:right">' + fmtQty(r.qty) + '</td>'
        + '<td class="num" style="text-align:right">' + fmtQty(r.unitPrice) + '</td>'
        + '<td class="num" style="text-align:right"><b>' + fmtMoney(r.subtotal) + '</b></td></tr>';
    }
  });
  if (repRows.length) body += '<tr><td colspan="6" style="text-align:right"><b>Total estimado</b></td><td class="num" style="text-align:right"><b>' + fmtMoney(total) + '</b></td></tr>';
  body += '</table>';
  reportShell("Estimación de Costos por Paquete de Trabajo", "Estimar los Costos · Gestión de Costos", body);
}

// ---------- OOXML .xlsx a mano (mismo mecanismo que Definir las Actividades) ----------
function xmlEsc(s: unknown): string { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

interface XlCell { v: string | number; t: "s" | "n"; s?: number; }

const TEMPLATE_HEADERS = ["Código EDT", "Nombre del paquete de trabajo/actividad", "Unidad de medida", "Cantidad", "Precio unitario", "Subtotal"];

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

// Modelo de filas del archivo exportado: SIEMPRE el estado actual completo
// (Código EDT + nombre de referencia, más Unidad/Cantidad/Precio unitario y
// el Subtotal calculado si ya existen). En un proyecto sin estimado, esto
// produce filas en blanco -- funciona como plantilla. Con datos, reproduce
// exactamente lo que se importaría de vuelta (round-trip).
function exportRowModel(): Array<Array<XlCell | null>> {
  const head: XlCell[] = TEMPLATE_HEADERS.map((h) => ({ v: h, t: "s", s: 1 }));
  const out: Array<Array<XlCell | null>> = [head];
  const st = state();
  leafRows().forEach((l) => {
    const item = st.byLeaf[l.id];
    const qty = item ? numOrNull(item.qty) : null;
    const unitPrice = item ? numOrNull(item.unitPrice) : null;
    const subtotal = (qty != null && unitPrice != null) ? Math.round(qty * unitPrice * 100) / 100 : null;
    out.push([
      { v: l.code, t: "s", s: 2 },
      { v: l.name || "", t: "s", s: 0 },
      (item && item.unit) ? { v: item.unit, t: "s", s: 0 } : null,
      qty != null ? { v: qty, t: "n" } : null,
      unitPrice != null ? { v: unitPrice, t: "n", s: 3 } : null,
      subtotal != null ? { v: subtotal, t: "n", s: 3 } : null
    ]);
  });
  return out;
}

function templateInstructions(): Array<Array<XlCell | null>> {
  const L: Array<[string, number]> = [
    ["Cómo completar este archivo", 25],
    ["", 0],
    ["1. Cada fila es un paquete de trabajo de la EDT. Las columnas “Código EDT” y “Nombre del paquete de trabajo/actividad” son de referencia — no las edites ni las borres: son la clave con la que este simulador reconoce a qué paquete pertenece cada fila al importar el archivo de vuelta (deben coincidir AMBAS con la EDT actual).", 4],
    ["2. Completa “Unidad de medida”, “Cantidad” y “Precio unitario” para cada paquete.", 4],
    ["3. La columna “Subtotal” es de referencia (Cantidad × Precio unitario): se recalcula sola al importar, no hace falta completarla ni editarla a mano.", 4],
    ["4. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
    ["5. Guarda el archivo y vuelve a “Estimar los Costos” > botón “⇧ Importar desde Excel” para subirlo.", 4],
    ["", 0],
    ["6. Este mismo archivo se puede volver a generar en cualquier momento con “⇩ Exportar a Excel”: si el proyecto ya tiene un estimado cargado, el archivo sale completo (no en blanco) y, si se reimporta sin tocarlo, reproduce exactamente los mismos datos.", 4],
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
  zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(exportRowModel(), [10, 34, 14, 12, 14, 14], true));
  zip.file("xl/worksheets/sheet2.xml", xlsxSheetXml(templateInstructions(), [115], false));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function buildEstimateCsv(): string {
  function cell(v: unknown): string { const s = String(v == null ? "" : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const lines = [TEMPLATE_HEADERS.join(";")];
  const st = state();
  leafRows().forEach((l) => {
    const item = st.byLeaf[l.id];
    const qty = item ? numOrNull(item.qty) : null;
    const unitPrice = item ? numOrNull(item.unitPrice) : null;
    const subtotal = (qty != null && unitPrice != null) ? Math.round(qty * unitPrice * 100) / 100 : null;
    lines.push([cell(l.code), cell(l.name || ""), cell(item ? item.unit : ""), cell(qty ?? ""), cell(unitPrice ?? ""), cell(subtotal ?? "")].join(";"));
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

async function parseEstimateXlsx(file: File): Promise<{ headers: string[]; rows: string[][] } | null> {
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

interface ColumnMap { code: number; name: number; unit?: number; qty?: number; unitPrice?: number; }
const HEADER_KEYWORDS: { field: keyof ColumnMap; keywords: string[] }[] = [
  { field: "code", keywords: ["codigo edt", "edt"] },
  { field: "name", keywords: ["nombre del paquete", "paquete de trabajo", "actividad"] },
  { field: "unit", keywords: ["unidad"] },
  { field: "qty", keywords: ["cantidad"] },
  { field: "unitPrice", keywords: ["precio unitario", "precio"] }
];
function normalizeHeader(s: string): string {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
// Empareja columnas por el TEXTO del encabezado (no por posición fija): así
// tolera que el usuario reordene columnas en Excel. "Subtotal" se reconoce
// implícitamente al no aparecer en HEADER_KEYWORDS: nunca se lee, se recalcula.
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
  byLeaf: Record<string, EstimateItem>;
  matched: number;
  orphanCodes: string[];
  mismatchCodes: string[];
  missingLeaves: TreeRow[];
}
// Reconcilia las filas del archivo contra la EDT actual, verificando TANTO
// el Código EDT como el nombre del paquete (a pedido explícito: ambos deben
// coincidir), y detecta qué paquetes de la EDT actual no tienen ninguna fila
// en el archivo (verificación de que el archivo cubre TODOS los paquetes).
function reconcileImportRows(rows: string[][], colMap: ColumnMap): ReconcileResult {
  const leaves = leafRows();
  const byCode: Record<string, TreeRow> = {}; leaves.forEach((l) => { byCode[l.code] = l; });
  const byLeaf: Record<string, EstimateItem> = {};
  const presentIds = new Set<string>();
  const orphanCodes: string[] = [], mismatchCodes: string[] = [];
  let matched = 0;
  rows.forEach((row) => {
    const code = String(row[colMap.code] || "").trim();
    if (!code) return; // fila totalmente vacía: caso normal, se omite
    const name = String(row[colMap.name] || "").trim();
    const leaf = byCode[code];
    if (!leaf) { orphanCodes.push(code); return; }
    if (name && normalizeHeader(name) !== normalizeHeader(leaf.name)) { mismatchCodes.push(code); return; }
    presentIds.add(leaf.id);
    const unit = colMap.unit != null ? String(row[colMap.unit] || "").trim() : "";
    const qty = colMap.qty != null ? (parseExcelNum(row[colMap.qty]) || "") : "";
    const unitPrice = colMap.unitPrice != null ? (parseExcelNum(row[colMap.unitPrice]) || "") : "";
    if (unit || qty || unitPrice) { byLeaf[leaf.id] = { unit, qty, unitPrice }; matched++; }
  });
  const missingLeaves = leaves.filter((l) => !presentIds.has(l.id));
  return { byLeaf, matched, orphanCodes, mismatchCodes, missingLeaves };
}

async function importEstimateExcel(file: File): Promise<void> {
  let parsed: { headers: string[]; rows: string[][] } | null;
  try {
    parsed = await parseEstimateXlsx(file);
  } catch (_) {
    await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
    return;
  }
  if (!parsed) { await showAlert("El archivo no contiene datos reconocibles."); return; }
  const colMap = mapHeaderColumns(parsed.headers);
  if (!colMap) {
    await showAlert("No reconocí las columnas del archivo. Se esperan al menos «Código EDT» y «" + TEMPLATE_HEADERS[1] + "» — no renombres esas columnas.");
    return;
  }
  const result = reconcileImportRows(parsed.rows, colMap);
  if (!result.matched && !result.orphanCodes.length && !result.mismatchCodes.length) {
    await showAlert("El archivo no tiene ninguna fila con datos: revisa que hayas completado Cantidad y Precio unitario.");
    return;
  }
  let msg = "Se reemplazará el estimado actual por " + result.matched + " paquete(s) con datos del archivo" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT no se toca.";
  if (result.orphanCodes.length) {
    msg += " " + result.orphanCodes.length + " fila(s) no se importaron por no coincidir con ningún código EDT actual: " + result.orphanCodes.slice(0, 8).join(", ") + (result.orphanCodes.length > 8 ? "…" : "") + ".";
  }
  if (result.mismatchCodes.length) {
    msg += " " + result.mismatchCodes.length + " fila(s) no se importaron porque el nombre no coincide con el paquete de ese código EDT (¿la EDT cambió después de exportar?): " + result.mismatchCodes.slice(0, 8).join(", ") + (result.mismatchCodes.length > 8 ? "…" : "") + ".";
  }
  if (result.missingLeaves.length) {
    msg += " ⚠ " + result.missingLeaves.length + " paquete(s) de la EDT actual no aparecen en el archivo: " + result.missingLeaves.slice(0, 8).map((l) => l.code).join(", ") + (result.missingLeaves.length > 8 ? "…" : "") + " — el estimado quedará incompleto para esos paquetes.";
  }
  const ok = await showConfirm(msg, "Importar estimado desde Excel");
  if (!ok) return;
  if (mode === "sample") stateSample = { byLeaf: result.byLeaf };
  else stateLive = { byLeaf: result.byLeaf };
  onDirty(true);
  const issues = result.orphanCodes.length + result.mismatchCodes.length;
  setStatus(result.matched + " paquete(s) importado(s) desde Excel" + (issues ? (" · " + issues + " fila(s) no reconciliada(s)") : "") + (result.missingLeaves.length ? (" · " + result.missingLeaves.length + " paquete(s) sin fila en el archivo") : "") + ".");
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
  document.getElementById("btnClear")!.addEventListener("click", async () => {
    const s = stats();
    const ok = await showConfirm("Se eliminará el estimado de los " + s.covered + " paquetes ya estimados" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT no se toca. ¿Continuar?", "Limpiar estimado");
    if (!ok) return;
    if (mode === "sample") stateSample = { byLeaf: {} };
    else stateLive = { byLeaf: {} };
    onDirty(true);
    setStatus("Estimado de costos vacío.");
  });
}

// ===== Puente con el Panel de Control (GPI) =====
// La EDT se LEE del módulo wbs (nunca se duplica ni se edita aquí); el
// estimado se guarda en el módulo "costEstimate" del proyecto activo.
function gpiPullWbs(): void {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
  wbsLive = window.GPI.getModule("wbs") ?? null;
}
function gpiPush(): void {
  if (mode === "sample") return; // el modo ejemplo jamás escribe sobre el proyecto
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
  window.GPI.setModule("costEstimate", stateLive as unknown as CostEstimateModule);
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
      const mod = window.GPI.getModule("costEstimate");
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
