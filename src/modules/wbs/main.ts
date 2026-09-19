/* =========================================================
   WBS Builder — motor de datos, layout y render
   Port mecánico del <script> inline de WBS_Builder.html (Fase 4 de
   MIGRATION.md): misma lógica, mismo comportamiento. Se agregan tipos y
   se compila a wbs.js (IIFE) para que el HTML lo cargue como
   <script src="wbs.js"> en vez de tenerlo inline.

   Mismo patrón que OBS_Builder: addEventListener exclusivamente (sin
   atributos onclick inline), window.GPI explícito, envuelto en su
   propio IIFE -- no hace falta exponer nada en window.

   DELIBERADAMENTE NO se usa GPI.ui.esc (modo suelto sin gpi-core.js).
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type {
  ActivitiesModule, CostEstimateModule, ObsModule, PertModule, ProjectMeta, RaciModule,
  ScheduleModule, SchedulePlanModule, ScopeStatementModule, WbsModule, WbsNode
} from "../../core/types";

type GpiApi = typeof GpiCore.GPI;
declare global {
  interface Window { GPI?: GpiApi; JSZip?: JSZipCtor; }
}

// Tipado mínimo de la API de JSZip que este módulo usa (librería externa vía
// CDN, ver el <script> en el HTML) -- mismo patrón que Definir las
// Actividades/Estimar los Costos.
interface JSZipFileEntry { async(type: "string"): Promise<string>; }
interface JSZipInstance {
  file(name: string, content: string): void;
  file(name: string): JSZipFileEntry | null;
  generateAsync(opts: { type: "blob"; mimeType: string }): Promise<Blob>;
}
interface JSZipCtor { new (): JSZipInstance; loadAsync(data: ArrayBuffer): Promise<JSZipInstance>; }

// ---------- CONFIG ----------
const NODE_W = 180;
const NODE_H = 118;
const GAP_X = 28;
const GAP_Y = 64;
const LEVEL_COLORS = ["#00b6ec", "#6c5ce7", "#00c2a8", "#ff9f1c", "#ff6b8b", "#2e4374"];

// ---------- STATE ----------
interface WbsUiNode {
  id: string; parentId: string | null; name: string;
  duration: number; cost: number; resource: string; percent: number;
  start: string; end: string; notes: string; children: string[]; collapsed: boolean;
  orientation: "spread" | "stack"; delId?: string;
}

let nodes: Record<string, WbsUiNode> = {};
let gpiRaciModule: RaciModule | null = null;   // última matriz RACI conocida (vía Panel de Control)
let gpiObsModule: ObsModule | null = null;     // último OBS conocido (vía Panel de Control)
let gpiScopeModule: ScopeStatementModule | null = null; // último Enunciado del Alcance conocido
let gpiActivitiesModule: ActivitiesModule | null = null; // últimas actividades conocidas (para enganchar fechas del CPM)
let gpiPertModule: PertModule | null = null;
let gpiScheduleModule: ScheduleModule | null = null;
let gpiSchedulePlanModule: SchedulePlanModule | null = null;
let gpiCostEstimateModule: CostEstimateModule | null = null;
// Paquetes (hojas) cuya fecha inicio/fin quedó fijada por el Cronograma CPM en
// la última sincronización -- ver applyScheduleToWbs en gpi-core.ts.
let scheduleLockedLeafIds: Set<string> = new Set();
// Paquetes (hojas) cuyo Costo quedó fijado por Estimar los Costos en la
// última sincronización -- ver applyCostEstimateToWbs en gpi-core.ts.
let costEstimateLockedLeafIds: Set<string> = new Set();
let rootId = "root";
let selectedId: string | null = null;
let zoom = 1;
let draggedId: string | null = null;
let currentView: "tree" | "table" = "tree";
let idCounter = 1;

// ---------- SINCRONIZACIÓN CON EL PANEL (guardado con debounce) ----------
// A diferencia de los demás módulos (que sincronizan con GPI 800ms después
// de cada cambio, patrón "onDirty"), este módulo históricamente solo
// guardaba al ocultar la pestaña o al salir (ver gpiBridge() más abajo,
// beforeunload/visibilitychange). Eso deja una ventana real de datos
// desactualizados: si el alumno renombra una fase/paquete aquí y pasa a
// Definir las Actividades o Estimar los Costos sin que esta pestaña llegue
// a "esconderse", esos módulos pueden leer el nombre viejo un rato -- y la
// EDT es la capa que manda sobre las demás (a pedido explícito del
// usuario). requestGpiPush lo asigna gpiBridge() una vez que confirma que
// hay un proyecto activo; markDirty() lo dispara con el mismo debounce de
// 800ms que usan Definir las Actividades/Estimar los Costos, desde
// cualquier punto del archivo donde se edite nombre, valores, estructura
// (agregar/eliminar/reordenar nodos) o se importe un .xlsx -- nunca desde
// cambios puramente de vista (zoom, orientación, colapsar/expandir), que
// no son datos que otros módulos lean.
let requestGpiPush: (() => void) | null = null;
// Misma idea que requestGpiPush, pero para comprobar identidad ANTES de
// empezar una operación que lee datos de OTRO módulo del proyecto activo
// (p. ej. seedFromScope() trae entregables de "Enunciado del Alcance") --
// gpiBridge() la asigna una vez que confirma qué proyecto cargó esta
// pestaña. Sin esto, una operación así podía leer datos frescos de un
// proyecto B recién activado en otra pestaña y mezclarlos con la EDT
// vieja de A, todavía en memoria -- el guardado final (vía markDirty() /
// push()) ya lo bloquea, pero comprobarlo también ACÁ evita el mensaje de
// "listo" engañoso cuando en realidad no se guardó nada.
let ensureProjectFresh: (() => boolean) | null = null;
let dirtyTimer: ReturnType<typeof setTimeout> | undefined;
function markDirty(): void {
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(() => { if (requestGpiPush) requestGpiPush(); }, 800);
}

function uid(): string { return "n" + (idCounter++); }

function newNode(parentId: string | null, name?: string, overrides?: Partial<WbsUiNode>): string {
  const id = uid();
  nodes[id] = Object.assign<WbsUiNode, Partial<WbsUiNode>>(
    {
      id, parentId, name: name || "Nuevo paquete",
      duration: 0, cost: 0, resource: "", percent: 0,
      start: "", end: "", notes: "", children: [], collapsed: false,
      orientation: "spread" // 'spread' = hijos en fila (horizontal) · 'stack' = hijos en columna (vertical)
    },
    overrides || {}
  );
  if (parentId && nodes[parentId]) nodes[parentId].children.push(id);
  return id;
}

// ---------- FECHAS ----------
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Días de calendario entre dos fechas ISO ("YYYY-MM-DD"), ambos extremos incluidos.
// Devuelve null si falta alguna fecha o el rango es inválido (fin antes que inicio).
function daysBetween(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  if (!startIso || !endIso) return null;
  const s = new Date(startIso + "T00:00:00");
  const e = new Date(endIso + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : null;
}
function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
}
function formatDateRange(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso || !endIso) return "";
  return `${formatDateShort(startIso)} – ${formatDateShort(endIso)}`;
}

function blankProject(title?: string): void {
  nodes = {};
  idCounter = 1;
  rootId = newNode(null, title || "Proyecto sin título");
  selectedId = rootId;
}

// ---------- SAMPLE DATA: caso DISTRIB+ S.A. ----------
function loadSample(): void {
  blankProject("Proyecto DISTRIB+ S.A. — Almacén Lurín");
  const root = rootId;

  const dirProy = newNode(root, "Dirección de Proyecto", { resource: "PM" });
  newNode(dirProy, "Acta de constitución", { duration: 3, cost: 12000, percent: 100, resource: "PM", start: "2026-07-06", end: "2026-07-08" });
  newNode(dirProy, "Plan de gestión del proyecto", { duration: 8, cost: 38000, percent: 60, resource: "PM", start: "2026-07-09", end: "2026-07-20" });
  newNode(dirProy, "Informes de seguimiento y control", { duration: 60, cost: 145000, percent: 20, resource: "PM", start: "2026-07-21", end: "2026-10-23" });

  const ing = newNode(root, "Ingeniería y Diseño", { resource: "Ing. Civil" });
  newNode(ing, "Estudio de suelos", { duration: 10, cost: 28000, percent: 100, resource: "Geotecnia", start: "2026-07-06", end: "2026-07-17" });
  newNode(ing, "Diseño estructural", { duration: 20, cost: 165000, percent: 80, resource: "Ing. Estructural", start: "2026-07-20", end: "2026-08-14" });
  newNode(ing, "Diseño eléctrico y sanitario", { duration: 15, cost: 98000, percent: 50, resource: "Ing. MEP", start: "2026-07-27", end: "2026-08-14" });
  newNode(ing, "Permisos y licencias municipales", { duration: 25, cost: 64000, percent: 30, resource: "Legal", start: "2026-07-20", end: "2026-08-21" });

  const proc = newNode(root, "Procura", { resource: "Logística" });
  newNode(proc, "Estructuras metálicas prefabricadas", { duration: 18, cost: 1820000, percent: 10, resource: "Proveedor A", start: "2026-07-27", end: "2026-08-19" });
  newNode(proc, "Materiales de construcción", { duration: 12, cost: 715000, percent: 25, resource: "Proveedor B", start: "2026-08-03", end: "2026-08-17" });
  newNode(proc, "Equipos eléctricos e instalaciones", { duration: 14, cost: 415000, percent: 0, resource: "Proveedor C", start: "2026-08-10", end: "2026-08-26" });

  // Construcción: varios paquetes se ejecutan EN PARALELO (Estructura, Acabados e
  // Instalaciones MEP se solapan). La duración de la fase NO es la suma de los 5
  // paquetes (116 días); es el tramo desde el inicio más temprano (Movimiento de
  // tierras) hasta el fin más tardío (Instalaciones MEP): ~82 días.
  const constr = newNode(root, "Construcción", { resource: "Residente de Obra" });
  newNode(constr, "Movimiento de tierras", { duration: 10, cost: 380000, percent: 0, resource: "Cuadrilla A", start: "2026-08-03", end: "2026-08-14" });
  newNode(constr, "Cimentaciones", { duration: 15, cost: 735000, percent: 0, resource: "Cuadrilla B", start: "2026-08-17", end: "2026-09-04" });
  newNode(constr, "Estructura y cobertura", { duration: 25, cost: 1165000, percent: 0, resource: "Cuadrilla C", start: "2026-09-07", end: "2026-10-09" });
  newNode(constr, "Acabados y cerramientos", { duration: 18, cost: 550000, percent: 0, resource: "Cuadrilla D", start: "2026-09-21", end: "2026-10-16" });
  newNode(constr, "Instalaciones MEP", { duration: 20, cost: 485000, percent: 0, resource: "Subcontrata MEP", start: "2026-09-28", end: "2026-10-23" });
  nodes[constr].orientation = "stack"; // demo: esta rama se despliega en vertical por tener muchos paquetes

  const com = newNode(root, "Pruebas y Puesta en Marcha", { resource: "QA/QC" });
  newNode(com, "Pruebas de instalaciones", { duration: 6, cost: 145000, percent: 0, resource: "QA/QC", start: "2026-10-26", end: "2026-10-31" });
  newNode(com, "Capacitación al cliente", { duration: 3, cost: 48000, percent: 0, resource: "PM", start: "2026-11-02", end: "2026-11-04" });
  newNode(com, "Acta de entrega y cierre", { duration: 2, cost: 92000, percent: 0, resource: "PM", start: "2026-11-05", end: "2026-11-06" });

  selectedId = root;
}

// ---------- HIERARCHY HELPERS ----------
function visibleChildren(id: string): string[] {
  return nodes[id] && nodes[id].collapsed ? [] : (nodes[id] ? nodes[id].children : []);
}
function countDescendants(id: string): number {
  let count = 0;
  function walk(nid: string): void { nodes[nid].children.forEach((cid) => { count++; walk(cid); }); }
  walk(id);
  return count;
}
function isDescendant(ancestorId: string, candidateId: string): boolean {
  if (ancestorId === candidateId) return true;
  let n: WbsUiNode | undefined = nodes[candidateId];
  while (n && n.parentId) {
    if (n.parentId === ancestorId) return true;
    n = nodes[n.parentId];
  }
  return false;
}
function depthOf(id: string): number {
  let d = 0, n: WbsUiNode | undefined = nodes[id];
  while (n && n.parentId) { d++; n = nodes[n.parentId]; }
  return d;
}
function deleteSubtree(id: string): void {
  const node = nodes[id];
  if (!node) return;
  [...node.children].forEach(deleteSubtree);
  if (node.parentId && nodes[node.parentId]) {
    const arr = nodes[node.parentId].children;
    const idx = arr.indexOf(id);
    if (idx > -1) arr.splice(idx, 1);
  }
  if (draggedId === id) draggedId = null;
  delete nodes[id];
}

// ---------- WBS CODE NUMBERING ----------
function computeCodes(): Record<string, string> {
  const codes: Record<string, string> = {};
  function walk(id: string, prefix: string): void {
    codes[id] = prefix;
    const kids = nodes[id].children;
    kids.forEach((cid, i) => walk(cid, prefix ? `${prefix}.${i + 1}` : `${i + 1}`));
  }
  nodes[rootId].children.forEach((cid, i) => walk(cid, `${i + 1}`));
  codes[rootId] = "0";
  return codes;
}

// ---------- ROLLUP (costo, duración, % avance, fechas) ----------
// El costo se sigue sumando (estimación bottom-up), pero la DURACIÓN de un paquete
// que agrupa subtareas NO es la suma de estas: se calcula como el tramo entre el
// inicio más temprano y el fin más tardío de sus paquetes contenidos, ya que estos
// pueden ejecutarse en paralelo. Si no hay fechas cargadas, se usa como aproximación
// la duración máxima entre las subtareas (asumiendo que corren en paralelo desde el
// mismo punto de partida) en lugar de sumarlas.
interface RolledNode { cost: number; duration: number; start: string | null; end: string | null; percent: number; isLeaf: boolean; }

function computeRollup(): Record<string, RolledNode> {
  const rolled: Record<string, RolledNode> = {};
  function walk(id: string): RolledNode {
    const node = nodes[id];
    const kids = node.children;
    if (kids.length === 0) {
      const dateDuration = daysBetween(node.start, node.end);
      rolled[id] = {
        cost: node.cost || 0,
        duration: dateDuration != null ? dateDuration : (node.duration || 0),
        start: node.start || null,
        end: node.end || null,
        percent: node.percent || 0,
        isLeaf: true
      };
      return rolled[id];
    }
    let cost = 0, weightedPercent = 0, maxDuration = 0;
    let minStart: string | null = null, maxEnd: string | null = null;
    kids.forEach((cid) => {
      const r = walk(cid);
      cost += r.cost;
      weightedPercent += (r.cost > 0 ? r.percent * r.cost : r.percent);
      if (r.duration > maxDuration) maxDuration = r.duration;
      if (r.start && (!minStart || r.start < minStart)) minStart = r.start;
      if (r.end && (!maxEnd || r.end > maxEnd)) maxEnd = r.end;
    });
    const totalForWeight = kids.reduce((s, cid) => s + (rolled[cid].cost > 0 ? rolled[cid].cost : 1), 0);
    const spanDuration = daysBetween(minStart, maxEnd);
    rolled[id] = {
      cost,
      duration: spanDuration != null ? spanDuration : maxDuration,
      start: minStart,
      end: maxEnd,
      percent: totalForWeight > 0 ? Math.round(weightedPercent / totalForWeight) : 0,
      isLeaf: false
    };
    return rolled[id];
  }
  walk(rootId);
  return rolled;
}

// ---------- TREE LAYOUT (mixto: cada nodo decide cómo acomoda a SUS hijos) ----------
const SPREAD_SIBLING_GAP = GAP_X;   // separación horizontal entre hermanos en modo fila
const SPREAD_DEPTH_GAP = GAP_Y;     // separación vertical hacia la fila de hijos
const STACK_SIBLING_GAP = 30;       // separación vertical entre hermanas apiladas
const STACK_DEPTH_GAP = 34;         // separación vertical entre la madre y su primera subtarea
const STACK_INDENT = Math.round(NODE_W * 0.20); // sangría horizontal (20% del ancho) respecto a la madre

interface Size { w: number; h: number; childExtent?: { w: number; h: number }; }
interface Pos { x: number; y: number; }

function computeLayout(): Record<string, Pos> {
  const sizes: Record<string, Size> = {};
  const positions: Record<string, Pos> = {};

  function computeSize(id: string): Size {
    const node = nodes[id];
    const kids = visibleChildren(id);
    if (kids.length === 0) {
      sizes[id] = { w: NODE_W, h: NODE_H };
      return sizes[id];
    }
    kids.forEach(computeSize);
    const o = node.orientation || "spread";
    if (o === "stack") {
      // Las subtareas cuelgan DEBAJO de la madre, apiladas una tras otra,
      // con una ligera sangría hacia la derecha (organigrama tipo lista indentada).
      const childrenW = Math.max(...kids.map((cid) => sizes[cid].w));
      const childrenH = kids.reduce((s, cid) => s + sizes[cid].h, 0) + STACK_SIBLING_GAP * (kids.length - 1);
      sizes[id] = {
        w: Math.max(NODE_W, STACK_INDENT + childrenW),
        h: NODE_H + STACK_DEPTH_GAP + childrenH,
        childExtent: { w: childrenW, h: childrenH }
      };
    } else {
      const childrenW = kids.reduce((s, cid) => s + sizes[cid].w, 0) + SPREAD_SIBLING_GAP * (kids.length - 1);
      const childrenH = Math.max(...kids.map((cid) => sizes[cid].h));
      sizes[id] = {
        w: Math.max(NODE_W, childrenW),
        h: NODE_H + SPREAD_DEPTH_GAP + childrenH,
        childExtent: { w: childrenW, h: childrenH }
      };
    }
    return sizes[id];
  }

  function assignPos(id: string, originX: number, originY: number): void {
    const node = nodes[id];
    const kids = visibleChildren(id);
    const size = sizes[id];
    if (kids.length === 0) {
      positions[id] = { x: originX, y: originY };
      return;
    }
    const o = node.orientation || "spread";
    if (o === "stack") {
      // La madre queda arriba, alineada a la izquierda de su caja asignada;
      // las hijas se apilan debajo, desplazadas un 20% del ancho hacia la derecha.
      positions[id] = { x: originX, y: originY };
      const childX = originX + STACK_INDENT;
      let cy = originY + NODE_H + STACK_DEPTH_GAP;
      kids.forEach((cid) => { assignPos(cid, childX, cy); cy += sizes[cid].h + STACK_SIBLING_GAP; });
    } else {
      positions[id] = { x: originX + (size.w - NODE_W) / 2, y: originY };
      const childY = originY + NODE_H + SPREAD_DEPTH_GAP;
      let cx = originX + (size.w - (size.childExtent as { w: number; h: number }).w) / 2;
      kids.forEach((cid) => { assignPos(cid, cx, childY); cx += sizes[cid].w + SPREAD_SIBLING_GAP; });
    }
  }

  computeSize(rootId);
  assignPos(rootId, 0, 0);
  return positions;
}

// Aplica una orientación a un nodo y a toda su descendencia (la "rama" completa)
function setOrientationForBranch(targetId: string, o: "spread" | "stack"): void {
  function walk(id: string): void {
    nodes[id].orientation = o;
    nodes[id].children.forEach(walk);
  }
  walk(targetId);
  render();
  setTimeout(fitToScreen, 50);
}

// ---------- RENDER: TREE ----------
function fmtMoney(v: number | null | undefined): string { return "S/ " + (v || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 }); }

function render(): void {
  const rolled = computeRollup();
  const codes = computeCodes();
  if (currentView === "tree") renderTree(rolled, codes); else renderTable(rolled, codes);
  renderProps(rolled);
  renderStats(rolled);
  renderLegend();
  updateOrientationUI();
}

// Refresco liviano usado al editar campos (nombre/costo/duración/etc.):
// la estructura del árbol no cambia, así que basta con recalcular el rollup.
function refreshValues(): void {
  const rolled = computeRollup();
  const codes = computeCodes();
  renderStats(rolled);
  if (currentView === "tree") renderTree(rolled, codes); else renderTable(rolled, codes);
}

function renderTree(rolled: Record<string, RolledNode>, codes: Record<string, string>): void {
  const canvas = document.getElementById("canvas") as HTMLElement;
  const svg = document.getElementById("linksSvg") as unknown as SVGSVGElement;
  canvas.querySelectorAll(".node").forEach((n) => n.remove());

  const positions = computeLayout();

  let maxX = 0, maxY = 0;
  Object.entries(positions).forEach(([, pos]) => {
    maxX = Math.max(maxX, pos.x + NODE_W);
    maxY = Math.max(maxY, pos.y + NODE_H);
  });
  canvas.style.width = (maxX + 120) + "px";
  canvas.style.height = (maxY + 120) + "px";
  svg.setAttribute("width", String(maxX + 120));
  svg.setAttribute("height", String(maxY + 120));

  // links
  let linkPaths = "";
  Object.values(nodes).forEach((node) => {
    const o = node.orientation || "spread";
    const kids = visibleChildren(node.id);
    const p = positions[node.id];
    if (!p || kids.length === 0) return;

    if (o === "stack") {
      // Organigrama tipo lista indentada: un único tronco vertical baja desde
      // la madre y cada subtarea se conecta con un pequeño tramo horizontal.
      const trunkX = p.x + 14;
      const y1 = p.y + NODE_H;
      kids.forEach((cid) => {
        const c = positions[cid];
        if (!c) return;
        const childDepth = depthOf(cid);
        const color = LEVEL_COLORS[Math.min(childDepth - 1, LEVEL_COLORS.length - 1)];
        const y2 = c.y + NODE_H / 2;
        const x2 = c.x;
        const d = `M${trunkX},${y1} L${trunkX},${y2} L${x2},${y2}`;
        linkPaths += `<path class="link" stroke="${color}" d="${d}" />`;
      });
    } else {
      kids.forEach((cid) => {
        const c = positions[cid];
        if (!c) return;
        const childDepth = depthOf(cid);
        const color = LEVEL_COLORS[Math.min(childDepth - 1, LEVEL_COLORS.length - 1)];
        const x1 = p.x + NODE_W / 2, y1 = p.y + NODE_H;
        const x2 = c.x + NODE_W / 2, y2 = c.y;
        const midY = (y1 + y2) / 2;
        const d = `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`;
        linkPaths += `<path class="link" stroke="${color}" d="${d}" />`;
      });
    }
  });
  svg.innerHTML = linkPaths;

  // nodes
  const LEVEL_TYPE_LABEL: Record<number, string> = { 1: "Fase", 2: "Entregable" };
  Object.entries(positions).forEach(([id, pos]) => {
    const node = nodes[id];
    const depth = depthOf(id);
    const r = rolled[id];
    const isRoot = id === rootId;
    const color = isRoot ? "#00b6ec" : LEVEL_COLORS[Math.min(depth - 1, LEVEL_COLORS.length - 1)];
    const hasKids = node.children.length > 0;
    const isCollapsed = !!node.collapsed;
    const nodeOrient = node.orientation || "spread";
    const typeLabel = isRoot ? "Proyecto" : (LEVEL_TYPE_LABEL[depth] || "Paquete de trabajo");

    const el = document.createElement("div");
    el.className = "node" + (id === selectedId ? " selected" : "") + (isRoot ? " is-root" : "") + (nodeOrient === "stack" ? " orient-stack" : "");
    el.style.left = pos.x + "px";
    el.style.top = pos.y + "px";
    el.dataset.id = id;
    el.draggable = !isRoot;
    if (!isRoot) el.style.borderLeftColor = color;

    el.innerHTML = `
      <span class="code" style="background:${hexA(color, 0.18)};color:${color}">${codes[id]}</span>
      ${hasKids ? `<span class="orient-flag" title="Esta rama está en orientación ${nodeOrient === "stack" ? "vertical" : "horizontal"}">${nodeOrient === "stack" ? "↕" : "↔"}</span>` : ""}
      ${!r.isLeaf ? `<span class="rollup-flag" title="Valores acumulados de subniveles">Σ</span>` : ""}
      <span class="level-type">${typeLabel}</span>
      <div class="name">${escapeHtml(node.name)}</div>
      <div class="metrics">
        <span>${r.duration} d</span>
        <span><b>${fmtMoney(r.cost)}</b></span>
      </div>
      ${(r.start && r.end) ? `<div class="date-range">${formatDateRange(r.start, r.end)}</div>` : ""}
      <div class="bar-track"><div class="bar-fill" style="width:${r.percent}%; background:${r.percent >= 100 ? "var(--good)" : color}"></div></div>
      <div class="add-child-btn" title="Agregar subtarea">+</div>
      ${hasKids ? `<div class="collapse-btn${isCollapsed ? " is-collapsed" : ""}" title="${isCollapsed ? "Expandir rama (" + countDescendants(id) + " ocultos)" : "Colapsar rama"}">${isCollapsed ? "+" + countDescendants(id) : "−"}</div>` : ""}
    `;

    el.addEventListener("click", (e) => { e.stopPropagation(); selectNode(id); });
    el.addEventListener("dblclick", (e) => { e.stopPropagation(); selectNode(id); focusNameField(); });
    (el.querySelector(".add-child-btn") as HTMLElement).addEventListener("click", (e) => {
      e.stopPropagation();
      const newId = newNode(id, "Nueva subtarea");
      selectedId = newId;
      render();
      focusNameField();
    });
    const collapseBtn = el.querySelector(".collapse-btn");
    if (collapseBtn) {
      collapseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        node.collapsed = !node.collapsed;
        render();
      });
    }

    if (!isRoot) {
      el.addEventListener("dragstart", (e) => {
        draggedId = id;
        el.classList.add("dragging");
        (e as DragEvent).dataTransfer!.effectAllowed = "move";
        // Firefox exige datos reales en dataTransfer para permitir iniciar el arrastre.
        (e as DragEvent).dataTransfer!.setData("text/plain", id);
      });
      el.addEventListener("dragend", () => { el.classList.remove("dragging"); clearDropTargets(); draggedId = null; });
    }
    el.addEventListener("dragover", (e) => {
      if (!draggedId || !nodes[draggedId] || draggedId === id) return;
      if (isDescendant(draggedId, id)) return; // evita ciclos (soltar un nodo dentro de su propia rama)
      e.preventDefault();
      el.classList.add("drop-target");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drop-target");
      if (!draggedId || !nodes[draggedId] || draggedId === id || isDescendant(draggedId, id)) return;
      reparent(draggedId, id);
    });

    canvas.appendChild(el);
  });
}

function clearDropTargets(): void {
  document.querySelectorAll(".node.drop-target").forEach((n) => n.classList.remove("drop-target"));
}

function reparent(childId: string, newParentId: string): void {
  const child = nodes[childId];
  const newParent = nodes[newParentId];
  if (!child || !newParent) return;
  const oldParent = nodes[child.parentId as string];
  if (oldParent) {
    const idx = oldParent.children.indexOf(childId);
    if (idx > -1) oldParent.children.splice(idx, 1);
  }
  child.parentId = newParentId;
  newParent.children.push(childId);
  selectedId = childId;
  render();
  markDirty();
  setStatus(`"${child.name}" reasignado bajo "${newParent.name}"`);
}

// ---------- RENDER: TABLE (WBS Dictionary) ----------
function renderTable(rolled: Record<string, RolledNode>, codes: Record<string, string>): void {
  const wrap = document.getElementById("tableView") as HTMLElement;
  const rows: Array<{ id: string; depth: number }> = [];
  function walk(id: string, depth: number): void {
    if (id !== rootId) rows.push({ id, depth });
    nodes[id].children.forEach((cid) => walk(cid, depth + 1));
  }
  walk(rootId, 0);

  let html = `<table class="wbs-table">
    <thead><tr>
      <th style="width:80px;">Código EDT</th>
      <th>Paquete de trabajo</th>
      <th style="width:70px;">Nivel</th>
      <th style="width:90px;">Duración</th>
      <th style="width:90px;">Inicio</th>
      <th style="width:90px;">Fin</th>
      <th style="width:110px;">Costo</th>
      <th style="width:120px;">Responsable</th>
      <th style="width:120px;">Avance</th>
    </tr></thead><tbody>`;

  rows.forEach(({ id, depth }) => {
    const node = nodes[id];
    const r = rolled[id];
    const color = LEVEL_COLORS[Math.min(depth - 1, LEVEL_COLORS.length - 1)];
    html += `<tr>
      <td><span class="code-chip" style="background:${hexA(color, 0.18)};color:${color}">${codes[id]}</span></td>
      <td><div class="indent-name" style="padding-left:${(depth - 1) * 18}px;">${r.isLeaf ? "" : "📁"} ${escapeHtml(node.name)}</div></td>
      <td>${depth}</td>
      <td>${r.duration} d</td>
      <td>${formatDateShort(r.start) || "—"}</td>
      <td>${formatDateShort(r.end) || "—"}</td>
      <td>${fmtMoney(r.cost)}</td>
      <td>${escapeHtml(node.resource || "—")}</td>
      <td>${r.percent}%</td>
    </tr>`;
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

// ---------- PROPERTIES PANEL ----------
function renderProps(rolledAll: Record<string, RolledNode>): void {
  const panel = document.getElementById("propsPanel") as HTMLElement;
  if (!selectedId || !nodes[selectedId]) {
    panel.innerHTML = `<div class="empty-hint">Selecciona un nodo del diagrama para editar sus propiedades.</div>`;
    return;
  }
  const node = nodes[selectedId];
  const isRoot = selectedId === rootId;
  const rolled = rolledAll[selectedId];
  const isLeaf = rolled.isLeaf;
  const cpmLocked = cpmLocksDates(node);
  const costLocked = costEstimateLocksCost(node);
  const costEditable = isLeaf && !costLocked;
  // Si el paquete (hoja) tiene ambas fechas cargadas a mano, la duración se
  // calcula sola a partir de ellas y el campo numérico se bloquea para evitar
  // inconsistencias. Si además el Cronograma CPM ya fijó esas fechas (cpmLocked),
  // el bloqueo es más fuerte: ni fechas ni duración se editan aquí.
  const hasDates = isLeaf && !cpmLocked && daysBetween(node.start, node.end) != null;
  const durationEditable = isLeaf && !cpmLocked && !hasDates;
  const datesEditable = isLeaf && !cpmLocked;
  const obsOptions = (gpiObsModule && window.GPI && window.GPI.util) ? window.GPI.util.obsNodes(gpiObsModule) : [];

  panel.innerHTML = `
    <div class="field">
      <label>Nombre del paquete</label>
      <input id="f_name" value="${escapeAttr(node.name)}" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Fecha inicio</label>
        <input id="f_start" type="date" value="${(isLeaf ? node.start : rolled.start) || ""}" ${datesEditable ? "" : "disabled"} />
      </div>
      <div class="field">
        <label>Fecha fin</label>
        <input id="f_end" type="date" value="${(isLeaf ? node.end : rolled.end) || ""}" ${datesEditable ? "" : "disabled"} />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Duración (días)</label>
        <input id="f_duration" type="number" min="0" value="${rolled.duration}" ${durationEditable ? "" : "disabled"} />
      </div>
      <div class="field">
        <label>Costo (S/)</label>
        <input id="f_cost" type="number" min="0" value="${isLeaf ? node.cost : rolled.cost}" ${costEditable ? "" : "disabled"} />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>% Avance</label>
        <input id="f_percent" type="number" min="0" max="100" value="${isLeaf ? node.percent : rolled.percent}" ${isLeaf ? "" : "disabled"} />
      </div>
      <div class="field">
        <label>Responsable</label>
        ${raciLocksResource(node) ? `<input id="f_resource" value="${escapeAttr(node.resource)}" disabled title="Definido por la Matriz RACI" />` : resourceFieldHtml(node, obsOptions)}
      </div>
    </div>
    ${raciLocksResource(node)
      ? `<div class="empty-hint">🔗 <b>Definido en la Matriz RACI</b> a partir del "R" (Responsable) asignado a este paquete. Para cambiarlo, abre <a href="RACI_Matrix.html" style="color:var(--cyan-dark); font-weight:700;">Matriz RACI ▸</a></div>`
      : (!obsOptions.length
        ? `<div class="empty-hint">⚠ <b>Aún no existe la OBS de este proyecto.</b> Créala primero en <a href="OBS_Builder.html" style="color:var(--cyan-dark); font-weight:700;">OBS Builder ▸</a> para poder asignar responsables desde una lista.</div>`
        : (isLeaf ? `<div class="empty-hint">Sugerencia: define el responsable en la <a href="RACI_Matrix.html" style="color:var(--cyan-dark); font-weight:700;">Matriz RACI ▸</a> (rol "R") en vez de elegirlo aquí — así queda formalmente registrado en la RAM del proyecto.</div>` : ""))}
    <div class="field">
      <label>Notas / Descripción</label>
      <textarea id="f_notes">${escapeHtml(node.notes || "")}</textarea>
    </div>
    ${costLocked
      ? `<div class="empty-hint">🔗 <b>Tomado de Estimar los Costos</b> (suma del Subtotal de todas sus actividades). Para cambiarlo, abre <a href="Estimar_Costos.html" style="color:var(--cyan-dark); font-weight:700;">Estimar los Costos ▸</a></div>`
      : (isLeaf ? `<div class="empty-hint">📐 <b>Estimado.</b> Este costo se ingresa aquí (bottom-up) hasta que <a href="Estimar_Costos.html" style="color:var(--cyan-dark); font-weight:700;">Estimar los Costos ▸</a> calcule uno real para este paquete.</div>` : "")}
    ${cpmLocked
      ? `<div class="empty-hint">🔗 <b>Tomado del Cronograma (CPM)</b> a partir de las actividades y la ruta crítica calculadas para este paquete. Para cambiarlo, abre <a href="Cronograma_CPM.html" style="color:var(--cyan-dark); font-weight:700;">Cronograma CPM ▸</a></div>`
      : (hasDates
        ? `<div class="empty-hint">📐 <b>Estimado.</b> Duración calculada automáticamente a partir de las fechas (${rolled.duration} d). Borra alguna fecha para editarla manualmente.</div>`
        : (isLeaf ? `<div class="empty-hint">📐 <b>Estimado.</b> Cuando definas las actividades de este paquete y calcules la ruta crítica en <a href="Cronograma_CPM.html" style="color:var(--cyan-dark); font-weight:700;">Cronograma CPM ▸</a>, la fecha real se toma automáticamente de ahí.</div>` : ""))}
    ${!isLeaf ? `<div class="empty-hint">Este paquete agrupa subtareas: el costo se suma (estimación bottom-up), pero <b>la duración se calcula como el tramo entre el inicio más temprano y el fin más tardío</b> de sus subtareas — no la suma, porque pueden ejecutarse en paralelo.</div>` : ""}
    ${!isRoot ? `<div class="danger-zone"><button class="btn danger" id="f_delete" style="width:100%;">🗑 Eliminar este nodo y sus subtareas</button></div>` : ""}
  `;

  const bind = (id: string, key: keyof WbsUiNode, isNum: boolean): void => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return;
    el.addEventListener("input", () => {
      (node as unknown as Record<string, unknown>)[key] = isNum ? (parseFloat(el.value) || 0) : el.value;
      refreshValues();
      markDirty();
    });
  };
  bind("f_name", "name", false);
  if (costEditable) bind("f_cost", "cost", true);
  bind("f_percent", "percent", true);
  if (!raciLocksResource(node) && obsOptions.length) bind("f_resource", "resource", false);
  bind("f_notes", "notes", false);
  if (durationEditable) bind("f_duration", "duration", true);

  // Las fechas pueden cambiar si el campo de duración queda habilitado/deshabilitado,
  // así que disparan un render() completo en vez del refresco liviano.
  const bindDate = (id: string, key: "start" | "end"): void => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el || !datesEditable) return;
    el.addEventListener("change", () => { node[key] = el.value; render(); markDirty(); });
  };
  bindDate("f_start", "start");
  bindDate("f_end", "end");

  const delBtn = document.getElementById("f_delete");
  if (delBtn) delBtn.addEventListener("click", async () => {
    const ok = await showConfirm(`¿Eliminar "${node.name}" y todas sus subtareas?`);
    if (ok) {
      deleteSubtree(selectedId as string);
      selectedId = rootId;
      render();
      markDirty();
    }
  });
}

function focusNameField(): void {
  setTimeout(() => {
    const el = document.getElementById("f_name") as HTMLInputElement | null;
    if (el) { el.focus(); el.select(); }
  }, 30);
}

// ---------- STATS ----------
function renderStats(rolled: Record<string, RolledNode>): void {
  const total = rolled[rootId];
  let leafCount = 0, maxDepth = 0;
  Object.keys(nodes).forEach((id) => {
    if (id !== rootId) {
      if (nodes[id].children.length === 0) leafCount++;
      maxDepth = Math.max(maxDepth, depthOf(id));
    }
  });
  const grid = document.getElementById("statGrid") as HTMLElement;
  grid.innerHTML = `
    <div class="stat"><div class="v">${fmtMoney(total.cost)}</div><div class="l">Costo total</div></div>
    <div class="stat"><div class="v">${total.duration} d</div><div class="l">Duración total</div></div>
    <div class="stat"><div class="v">${leafCount}</div><div class="l">Paquetes de trabajo</div></div>
    <div class="stat"><div class="v">${total.percent}%</div><div class="l">Avance global</div></div>
  `;
}

function renderLegend(): void {
  const box = document.getElementById("legendBox") as HTMLElement;
  let maxDepth = 0;
  Object.keys(nodes).forEach((id) => { maxDepth = Math.max(maxDepth, depthOf(id)); });
  let html = `<div class="legend-item"><span class="legend-dot" style="background:#00b6ec"></span> Nivel 0 — Proyecto</div>`;
  for (let i = 1; i <= Math.max(maxDepth, 2); i++) {
    const c = LEVEL_COLORS[Math.min(i - 1, LEVEL_COLORS.length - 1)];
    html += `<div class="legend-item"><span class="legend-dot" style="background:${c}"></span> Nivel ${i}${i === 1 ? " — Fase" : i === 2 ? " — Entregable" : " — Paquete de trabajo"}</div>`;
  }
  box.innerHTML = html;
}

// Un paquete (hoja) queda "bloqueado" en el WBS cuando la Matriz RACI ya le
// asignó un Responsable ("R"): en ese caso el WBS deja de ser la fuente de la
// verdad para ese campo y solo refleja lo que dice la RACI.
function raciLocksResource(node: WbsUiNode | null | undefined): boolean {
  if (!node || node.children.length > 0) return false; // solo aplica a hojas (paquetes de trabajo)
  if (!gpiRaciModule || !window.GPI || !window.GPI.util) return false;
  return window.GPI.util.raciResponsibleIds(gpiRaciModule, node.id).length > 0;
}

// Un paquete (hoja) queda "bloqueado" en sus fechas cuando el Cronograma CPM ya
// pudo calcular una ruta crítica real para sus actividades (ver
// applyScheduleToWbs en gpi-core.ts, que ya dejó start/end fijados en el nodo
// al sincronizar) -- mismo patrón que raciLocksResource.
function cpmLocksDates(node: WbsUiNode | null | undefined): boolean {
  if (!node || node.children.length > 0) return false;
  return scheduleLockedLeafIds.has(node.id);
}

// Un paquete (hoja) queda "bloqueado" en su Costo cuando Estimar los Costos
// ya calculó un costo real (Cantidad × Precio unitario > 0) para él -- ver
// applyCostEstimateToWbs en gpi-core.ts, que ya dejó fijado node.cost al
// sincronizar. Mismo patrón que cpmLocksDates/raciLocksResource.
function costEstimateLocksCost(node: WbsUiNode | null | undefined): boolean {
  if (!node || node.children.length > 0) return false;
  return costEstimateLockedLeafIds.has(node.id);
}

// Etiqueta de una opción del OBS en la lista desplegable de Responsable:
// "Cargo — Persona" si hay persona asignada, o solo el Cargo si no.
function obsOptionLabel(o: GpiCore.ObsNodeRow): string {
  return o.person && o.person.trim() ? `${o.role} — ${o.person}` : (o.role || o.person || "");
}

// Campo Responsable cuando NO está bloqueado por RACI: una lista desplegable
// restringida a los cargos del OBS (nunca texto libre). Si el proyecto
// todavía no tiene OBS, se deja deshabilitado en vez de permitir escribir
// cualquier cosa -- fuerza a crear la OBS primero. Un valor previo que ya no
// coincide con ningún cargo actual del OBS (p. ej. se renombró el cargo) se
// conserva como opción marcada "(valor anterior)" en vez de perderse en silencio.
function resourceFieldHtml(node: WbsUiNode, options: GpiCore.ObsNodeRow[]): string {
  if (!options.length) {
    return `<input id="f_resource" value="${escapeAttr(node.resource)}" disabled title="Crea primero la OBS del proyecto" placeholder="— Crea la OBS primero —" />`;
  }
  const current = node.resource || "";
  const known = options.some((o) => obsOptionLabel(o) === current);
  let opts = `<option value="">— Selecciona del OBS —</option>`;
  if (current && !known) opts += `<option value="${escapeAttr(current)}" selected>⚠ (valor anterior) ${escapeHtml(current)}</option>`;
  opts += options.map((o) => {
    const label = obsOptionLabel(o);
    return `<option value="${escapeAttr(label)}"${label === current ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  return `<select id="f_resource">${opts}</select>`;
}

// ---------- UTIL ----------
// Deliberadamente autocontenido (NO usa GPI.ui.esc): ver el comentario de
// cabecera de este archivo y el de src/modules/obs/main.ts.
function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}
function escapeAttr(s: unknown): string { return escapeHtml(s); }
function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function setStatus(msg: string): void { (document.getElementById("statusLeft") as HTMLElement).textContent = msg; }

// ---------- MODAL (reemplaza confirm()/alert() nativos) ----------
// window.confirm()/alert() pueden quedar bloqueados o ser no-ops quiet cuando la
// página se visualiza dentro de un iframe sin "allow-modals" (p. ej. vistas previas
// embebidas), lo que hacía que "Eliminar" pareciera no responder. Este modal propio
// no depende de permisos del navegador y además respeta el estilo visual de la app.
interface ShowModalOpts { title?: string; message?: string; confirmText?: string; cancelText?: string | null; danger?: boolean; }

function showModal({ title, message, confirmText, cancelText, danger }: ShowModalOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modalOverlay") as HTMLElement;
    const confirmBtn = document.getElementById("modalConfirmBtn") as HTMLButtonElement;
    const cancelBtn = document.getElementById("modalCancelBtn") as HTMLButtonElement;
    (document.getElementById("modalTitle") as HTMLElement).textContent = title || "Confirmar";
    (document.getElementById("modalMessage") as HTMLElement).textContent = message || "";
    confirmBtn.textContent = confirmText || "Aceptar";
    confirmBtn.className = "btn" + (danger ? " danger" : " primary");
    cancelBtn.style.display = cancelText === null ? "none" : "";
    cancelBtn.textContent = cancelText || "Cancelar";

    const cleanup = (result: boolean) => {
      overlay.classList.remove("open");
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      overlay.onclick = null;
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { cleanup(false); return; }
      if (e.key === "Enter") { cleanup(true); return; }
      if (e.key !== "Tab") return;
      // Trap de foco: Tab no debe escapar del modal hacia el fondo de la página.
      const card = overlay.querySelector(".modal-card") as HTMLElement;
      const f = Array.from(card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    confirmBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    document.addEventListener("keydown", onKey);

    overlay.classList.add("open");
    confirmBtn.focus();
  });
}
function showConfirm(message: string, title?: string): Promise<boolean> {
  return showModal({ title: title || "Confirmar acción", message, confirmText: "Eliminar", cancelText: "Cancelar", danger: true });
}
function showAlert(message: string, title?: string): Promise<boolean> {
  return showModal({ title: title || "Aviso", message, confirmText: "Entendido", cancelText: null, danger: false });
}

// ---------- OOXML .xlsx a mano (mismo mecanismo que Definir las Actividades / Estimar los Costos) ----------
// Exporta/importa la EDT completa como tabla plana -- misma estructura que
// la vista "Tabla / Diccionario" en pantalla (renderTable()): Código EDT |
// Paquete de trabajo | Nivel | Duración | Inicio | Fin | Costo | Responsable
// | Avance. A diferencia de Definir las Actividades/Estimar los Costos (que
// importan filas SOBRE una EDT ya existente), este módulo ES la fuente de
// la EDT: el import REEMPLAZA la estructura completa, reconstruida
// únicamente a partir de la columna "Código EDT" (1, 1.1, 1.1.1…) -- no
// hace falta ninguna columna de "padre". Para no perder los enlaces de
// otros módulos (RACI, Definir las Actividades y en cascada Estimar los
// Costos/PERT/Cronograma, todos referencian el id de un paquete) ni las
// notas o el entregable enlazado de cada nodo, un nodo cuyo Código EDT
// coincide con uno que YA existía en el árbol antes de importar RECICLA su
// mismo id -- solo un Código EDT genuinamente nuevo recibe un id nuevo. Si
// el archivo mueve un nodo a otro Código EDT (restructura), ese nodo pierde
// el id anterior -- mismo efecto que borrarlo y crear uno nuevo a mano.
function xmlEsc(s: unknown): string { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

interface XlCell { v: string | number; t: "s" | "n"; s?: number; }

const TEMPLATE_HEADERS = ["Código EDT", "Paquete de trabajo", "Nivel", "Duración", "Inicio", "Fin", "Costo", "Responsable", "Avance"];
// Nombre EXACTO de la hoja de datos dentro del .xlsx -- distinto a propósito
// del de Definir las Actividades ("EDT") y Estimar los Costos ("Estimado"):
// si el alumno junta las tres hojas en un solo libro, cada módulo debe
// poder encontrar la suya sin ambigüedad.
const DATA_SHEET_NAME = "WBS";

// Estilos: 0 normal · 1 encabezado · 2 centrado (código) · 3 número (costo) · 4 nota/instrucciones · 25 título
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

// Mismo modelo que muestra renderTable(): un recorrido en profundidad de
// todo el árbol (sin la raíz), con los valores YA CONSOLIDADOS (rollup) de
// duración/fechas/costo/avance -- para una fase, esos valores son un
// resumen calculado de sus paquetes, no un dato propio (ver el comentario
// de computeRollup()).
function exportRowModel(): Array<Array<XlCell | null>> {
  const codes = computeCodes();
  const rolled = computeRollup();
  const head: XlCell[] = TEMPLATE_HEADERS.map((h) => ({ v: h, t: "s", s: 1 }));
  const out: Array<Array<XlCell | null>> = [head];
  const rows: Array<{ id: string; depth: number }> = [];
  function walk(id: string, depth: number): void {
    if (id !== rootId) rows.push({ id, depth });
    nodes[id].children.forEach((cid) => walk(cid, depth + 1));
  }
  walk(rootId, 0);
  rows.forEach(({ id, depth }) => {
    const node = nodes[id], r = rolled[id];
    out.push([
      { v: codes[id], t: "s", s: 2 },
      { v: node.name || "", t: "s", s: 0 },
      { v: depth, t: "n" },
      { v: r.duration, t: "n" },
      r.start ? { v: r.start, t: "s", s: 0 } : null,
      r.end ? { v: r.end, t: "s", s: 0 } : null,
      { v: r.cost, t: "n", s: 3 },
      node.resource ? { v: node.resource, t: "s", s: 0 } : null,
      { v: r.percent, t: "n" }
    ]);
  });
  return out;
}

function templateInstructions(): Array<Array<XlCell | null>> {
  const L: Array<[string, number]> = [
    ["Cómo completar este archivo", 25],
    ["", 0],
    ["0. Si guardas todo el proyecto en un solo libro de Excel (varias hojas para varios módulos), esta hoja debe llamarse exactamente “" + DATA_SHEET_NAME + "” y sus encabezados deben coincidir EXACTAMENTE con los de esta plantilla (se puede reordenar columnas, pero no renombrarlas ni abreviarlas): al importar se verifican ambas cosas y se rechaza el archivo si no calzan, para no mezclar datos de otro módulo por error.", 4],
    ["1. Cada fila es un nodo de la EDT (una fase o un paquete de trabajo). La jerarquía se reconstruye ÚNICAMENTE a partir de la columna “Código EDT” (1, 1.1, 1.1.1…) -- no hace falta ninguna columna de “padre”: quitando el último segmento del código de una fila debe quedar el código de OTRA fila del archivo (o nada, si es de primer nivel). Puedes reordenar las filas libremente: se reordenan solas por código al importar.", 4],
    ["2. La columna “Nivel” es de solo referencia (se recalcula del propio Código EDT): no hace falta completarla ni editarla.", 4],
    ["3. “Duración”, “Inicio”, “Fin”, “Costo” y “Avance” solo se aplican en las filas que son PAQUETES (las que no tienen ninguna fila hija debajo, con un código un nivel más profundo): en una FASE (con paquetes debajo), esas mismas columnas muestran un resumen calculado de sus paquetes -- se recalcula solo al importar, lo que hayas escrito ahí se ignora.", 4],
    ["3b. Si completas “Inicio” y “Fin” de un paquete, la Duración se calcula sola a partir de esas fechas (igual que en pantalla, formato AAAA-MM-DD); si dejas las fechas en blanco, se usa el número que pongas en “Duración”.", 4],
    ["4. Si el Cronograma CPM, la Matriz RACI o Estimar los Costos ya fijan la fecha, el responsable o el costo de un paquete, ese valor se sobrescribe de nuevo en la próxima sincronización con esos módulos -- lo que importes aquí no lo anula de forma permanente.", 4],
    ["5. Un Código EDT que ya existía en la EDT actual conserva su mismo identificador interno al importar (no pierde sus enlaces con RACI, Definir las Actividades, etc.); un Código EDT nuevo en el archivo crea un nodo nuevo; un Código EDT que YA NO aparece en el archivo se elimina -- igual que si lo borraras a mano.", 4],
    ["6. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
    ["7. Guarda el archivo y vuelve a “WBS Builder” > botón “⇧ Importar desde Excel” para subirlo.", 4],
    ["", 0],
    ["8. Este mismo archivo se puede volver a generar en cualquier momento con “⇩ Exportar a Excel”: reproduce exactamente la EDT actual, útil como plantilla y como respaldo.", 4],
    ["", 0],
    ["Generado por el simulador GPI — módulo WBS Builder.", 4]
  ];
  return L.map((row) => [{ v: row[0], t: "s", s: row[1] === 25 ? 25 : 4 }]);
}

async function buildWbsXlsxBlob(): Promise<Blob> {
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
    + '<sheets><sheet name="WBS" sheetId="1" r:id="rId1"/><sheet name="Instrucciones" sheetId="2" r:id="rId2"/></sheets>'
    + '</workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  zip.file("xl/styles.xml", xlsxStylesXml());
  zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(exportRowModel(), [12, 34, 8, 10, 11, 11, 12, 20, 10], true));
  zip.file("xl/worksheets/sheet2.xml", xlsxSheetXml(templateInstructions(), [115], false));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// CSV de reserva cuando window.JSZip no está disponible -- mismo modelo que exportRowModel().
function buildWbsCsv(): string {
  function cell(v: unknown): string { const s = String(v == null ? "" : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const codes = computeCodes(), rolled = computeRollup();
  const lines = [TEMPLATE_HEADERS.join(";")];
  const rows: Array<{ id: string; depth: number }> = [];
  function walk(id: string, depth: number): void {
    if (id !== rootId) rows.push({ id, depth });
    nodes[id].children.forEach((cid) => walk(cid, depth + 1));
  }
  walk(rootId, 0);
  rows.forEach(({ id, depth }) => {
    const node = nodes[id], r = rolled[id];
    lines.push([cell(codes[id]), cell(node.name || ""), cell(depth), cell(r.duration), cell(r.start || ""), cell(r.end || ""), cell(r.cost), cell(node.resource || ""), cell(r.percent)].join(";"));
  });
  return lines.join("\r\n");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function downloadWbsExcel(): Promise<void> {
  const safe = ((document.getElementById("projectTitle") as HTMLInputElement).value || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  if (window.JSZip) {
    try {
      const blob = await buildWbsXlsxBlob();
      downloadBlob(blob, "wbs_" + safe + ".xlsx");
      setStatus("Archivo exportado. Complétalo o revísalo en Excel/MS Project y vuelve a subirlo con «⇧ Importar desde Excel».");
      return;
    } catch (_) { /* si algo falla, cae al CSV */ }
  }
  downloadBlob(new Blob(["﻿" + buildWbsCsv()], { type: "text/csv;charset=utf-8" }), "wbs_" + safe + ".csv");
  setStatus("No se pudo cargar la librería de Excel (¿sin conexión?): descargué un CSV equivalente.");
}

// ---------- IMPORTAR DESDE EXCEL (.xlsx real, no pegado de celdas) ----------
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
// normalizeHeader) -- necesario si el alumno junta en un solo .xlsx las
// hojas de varios módulos.
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

async function parseWbsXlsx(file: File): Promise<ParsedXlsx> {
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

interface ColumnMap { code: number; name: number; level?: number; duration?: number; start?: number; end?: number; cost?: number; resource?: number; percent?: number; }
// Posición por posición con TEMPLATE_HEADERS: "Nivel" es null a propósito
// (se recalcula del propio Código EDT, nunca se lee al reconstruir el árbol).
const TEMPLATE_HEADER_FIELDS: (keyof ColumnMap | null)[] = ["code", "name", null, "duration", "start", "end", "cost", "resource", "percent"];
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
// sobrantes, no substrings ni sinónimos): tolera reordenar columnas en
// Excel, pero rechaza una columna renombrada o abreviada.
function mapHeaderColumns(headerRow: string[]): ColumnMap | null {
  const map: Partial<ColumnMap> = {};
  headerRow.forEach((h, idx) => {
    const field = HEADER_FIELD_BY_TEXT[normalizeHeader(h)];
    if (field) map[field] = idx;
  });
  if (map.code == null || map.name == null) return null;
  return map as ColumnMap;
}

function parseNumOrZero(s: string | undefined): number {
  const n = Number(String(s == null ? "" : s).trim().replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}

const WBS_CODE_RE = /^\d+(\.\d+)*$/;
interface ParsedWbsRow { code: string; segs: number[]; name: string; duration: string; start: string; end: string; cost: string; resource: string; percent: string; }
interface WbsAnalysis { placed: ParsedWbsRow[]; invalidCodes: string[]; duplicateCodes: string[]; blankNames: string[]; orphanCodes: string[]; }

// Valida y ORDENA las filas del archivo por Código EDT (independiente del
// orden en que vengan en el archivo) -- padre siempre antes que hijo, para
// poder reconstruir el árbol en una sola pasada. Un código con formato
// inválido, repetido, sin nombre, o cuyo código padre no aparece (o no se
// pudo ubicar) en el archivo se descarta y se reporta, sin bloquear el
// resto del import.
function analyzeWbsRows(rows: string[][], colMap: ColumnMap): WbsAnalysis {
  const seen: Record<string, boolean> = {};
  const invalidCodes: string[] = [];
  const duplicateCodes: string[] = [];
  const blankNames: string[] = [];
  const parsedAll: ParsedWbsRow[] = [];
  rows.forEach((row) => {
    const codeRaw = (row[colMap.code] || "").trim();
    const name = (row[colMap.name] || "").trim();
    if (!codeRaw && !name) return; // fila totalmente vacía, se ignora sin más
    if (!WBS_CODE_RE.test(codeRaw)) { invalidCodes.push(codeRaw || "(vacío)"); return; }
    if (seen[codeRaw]) { duplicateCodes.push(codeRaw); return; }
    seen[codeRaw] = true;
    if (!name) { blankNames.push(codeRaw); return; }
    parsedAll.push({
      code: codeRaw, segs: codeRaw.split(".").map(Number), name,
      duration: colMap.duration != null ? (row[colMap.duration] || "") : "",
      start: colMap.start != null ? (row[colMap.start] || "") : "",
      end: colMap.end != null ? (row[colMap.end] || "") : "",
      cost: colMap.cost != null ? (row[colMap.cost] || "") : "",
      resource: colMap.resource != null ? (row[colMap.resource] || "") : "",
      percent: colMap.percent != null ? (row[colMap.percent] || "") : ""
    });
  });
  parsedAll.sort((a, b) => {
    const n = Math.max(a.segs.length, b.segs.length);
    for (let i = 0; i < n; i++) { const d = (a.segs[i] || 0) - (b.segs[i] || 0); if (d) return d; }
    return 0;
  });
  const placedSet: Record<string, boolean> = {};
  const orphanCodes: string[] = [];
  const placed: ParsedWbsRow[] = [];
  parsedAll.forEach((p) => {
    const parentCode = p.segs.slice(0, -1).join(".");
    if (parentCode && !placedSet[parentCode]) { orphanCodes.push(p.code); return; }
    placedSet[p.code] = true;
    placed.push(p);
  });
  return { placed, invalidCodes, duplicateCodes, blankNames, orphanCodes };
}

// Reconstruye nodes/rootId/idCounter a partir de las filas ya validadas y
// ordenadas -- ver el comentario grande al inicio de esta sección sobre por
// qué recicla ids por Código EDT en vez de generar todo desde cero.
function applyWbsRows(placed: ParsedWbsRow[]): void {
  const placedCodes = placed.map((p) => p.code);
  function isLeaf(code: string): boolean { return !placedCodes.some((c) => c !== code && c.startsWith(code + ".")); }

  const oldCodeOf = computeCodes(); // id -> código, del árbol ANTES de reemplazar
  const oldIdByCode: Record<string, string> = {};
  Object.keys(oldCodeOf).forEach((id) => { oldIdByCode[oldCodeOf[id]] = id; });
  const oldNodes = nodes;
  const prevRoot = oldNodes[rootId];

  // uid() reutiliza el mismo idCounter compartido de toda la sesión -- así un
  // id nuevo asignado aquí nunca choca con uno que el alumno cree después a
  // mano, sin necesidad de recalcular el máximo id ya usado.
  nodes = {};
  const newRootId = oldIdByCode["0"] || uid();
  nodes[newRootId] = {
    id: newRootId, parentId: null, name: (prevRoot && prevRoot.name) || "Proyecto sin título",
    duration: 0, cost: 0, resource: (prevRoot && prevRoot.resource) || "", percent: 0, start: "", end: "",
    notes: (prevRoot && prevRoot.notes) || "", children: [], collapsed: false,
    orientation: (prevRoot && prevRoot.orientation) || "spread"
  };
  rootId = newRootId;

  const idByCode: Record<string, string> = { "0": newRootId };
  placed.forEach((p) => {
    const parentCode = p.segs.slice(0, -1).join(".") || "0";
    const parentId = idByCode[parentCode];
    if (!parentId) return; // no debería pasar: analyzeWbsRows() ya descartó los huérfanos
    const leaf = isLeaf(p.code);
    const reusedId = oldIdByCode[p.code];
    const id = reusedId || uid();
    const prev = reusedId ? oldNodes[reusedId] : null;
    nodes[id] = {
      id, parentId, name: p.name,
      duration: leaf ? parseNumOrZero(p.duration) : 0,
      cost: leaf ? parseNumOrZero(p.cost) : 0,
      resource: (p.resource || "").trim(),
      percent: leaf ? Math.max(0, Math.min(100, parseNumOrZero(p.percent))) : 0,
      start: leaf ? p.start.trim() : "",
      end: leaf ? p.end.trim() : "",
      notes: (prev && prev.notes) || "",
      children: [],
      collapsed: false,
      orientation: (prev && prev.orientation) || "spread",
      delId: prev ? prev.delId : undefined
    };
    nodes[parentId].children.push(id);
    idByCode[p.code] = id;
  });
  selectedId = rootId;
}

async function importWbsExcel(file: File): Promise<void> {
  // Distinguir "la librería para leer .xlsx no cargó" de "el archivo está
  // mal" -- bug real reportado por el usuario: con JSZip vendorizado en el
  // repo (ver WBS_Builder.html) esto ya no depende de Internet, pero sigue
  // siendo la comprobación correcta si el script no llegó a cargar por
  // cualquier otro motivo. Antes, sin esta comprobación, window.JSZip
  // undefined hacía fallar el try/catch de abajo con el mismo mensaje que un
  // archivo corrupto -- engañoso.
  if (!window.JSZip) {
    await showAlert("No se pudo cargar la librería para leer archivos .xlsx (JSZip). Recargá la página e intentá de nuevo; este archivo no llegó a leerse, no es que el .xlsx esté mal.");
    return;
  }
  let parsed: ParsedXlsx;
  try {
    parsed = await parseWbsXlsx(file);
  } catch (_) {
    await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
    return;
  }
  if (parsed.kind === "sheet-not-found") {
    const otras = parsed.sheetNames.filter((n) => normalizeHeader(n) !== normalizeHeader(DATA_SHEET_NAME));
    await showAlert("No encontré una hoja llamada «" + DATA_SHEET_NAME + "» en este archivo" + (otras.length ? " (tiene: " + otras.join(", ") + ")" : "") + ". Si tu Excel junta varios módulos en un solo libro, la hoja con la EDT debe llamarse exactamente «" + DATA_SHEET_NAME + "» (como la que genera «⇩ Exportar a Excel» aquí) para que el simulador sepa cuál copiar y no la confunda con la de otro módulo.", "Hoja no reconocida");
    return;
  }
  if (parsed.kind === "empty") { await showAlert("El archivo no contiene datos reconocibles."); return; }
  const colMap = mapHeaderColumns(parsed.headers);
  if (!colMap) {
    await showAlert("No reconocí las columnas del archivo: los encabezados deben coincidir EXACTAMENTE con los de la plantilla (¿renombraste o abreviaste alguna columna, p. ej. «EDT» en vez de «Código EDT»?). Se esperan al menos «Código EDT» y «Paquete de trabajo» escritas tal cual.");
    return;
  }
  const result = analyzeWbsRows(parsed.rows, colMap);
  if (!result.placed.length) {
    await showAlert("El archivo no tiene ninguna fila con un «Código EDT» válido y ubicable (formato esperado: números separados por puntos, p. ej. 1, 1.2, 1.2.3 -- y el código de un nivel menos debe ser también una fila del archivo). No se modificó la EDT actual.");
    return;
  }
  const currentCount = Object.keys(nodes).length - 1; // sin contar la raíz
  let msg = "Se reemplazará la EDT actual (" + currentCount + " nodo(s)) por " + result.placed.length + " nodo(s) importado(s) del archivo. Fases y paquetes se reconstruyen a partir del Código EDT; los que ya existían conservan sus enlaces con RACI/Actividades/Costos.";
  if (result.invalidCodes.length) msg += " " + result.invalidCodes.length + " fila(s) con Código EDT inválido se ignoraron: " + result.invalidCodes.slice(0, 8).join(", ") + (result.invalidCodes.length > 8 ? "…" : "") + ".";
  if (result.duplicateCodes.length) msg += " " + result.duplicateCodes.length + " fila(s) con Código EDT repetido se ignoraron (se usó la primera aparición): " + result.duplicateCodes.slice(0, 8).join(", ") + (result.duplicateCodes.length > 8 ? "…" : "") + ".";
  if (result.blankNames.length) msg += " " + result.blankNames.length + " fila(s) sin «Paquete de trabajo» se ignoraron: " + result.blankNames.slice(0, 8).join(", ") + (result.blankNames.length > 8 ? "…" : "") + ".";
  if (result.orphanCodes.length) msg += " " + result.orphanCodes.length + " fila(s) no se pudieron ubicar porque su código padre no aparece (o tampoco se pudo ubicar) en el archivo: " + result.orphanCodes.slice(0, 8).join(", ") + (result.orphanCodes.length > 8 ? "…" : "") + ".";
  const ok = await showConfirm(msg, "Importar EDT desde Excel");
  if (!ok) return;
  applyWbsRows(result.placed);
  render();
  setTimeout(fitToScreen, 50);
  markDirty();
  const issues = result.invalidCodes.length + result.duplicateCodes.length + result.blankNames.length + result.orphanCodes.length;
  setStatus(result.placed.length + " nodo(s) importado(s) desde Excel" + (issues ? (" · " + issues + " fila(s) no importada(s)") : "") + ".");
}

function selectNode(id: string): void { selectedId = id; render(); }

// ---------- ZOOM ----------
function applyZoom(): void {
  (document.getElementById("canvas") as HTMLElement).style.transform = `scale(${zoom})`;
  (document.getElementById("zoomReadout") as HTMLElement).textContent = Math.round(zoom * 100) + "%";
}
function fitToScreen(): void {
  const wrap = document.getElementById("canvasWrap") as HTMLElement;
  const canvas = document.getElementById("canvas") as HTMLElement;
  const cw = canvas.scrollWidth || 800, ch = canvas.scrollHeight || 600;
  const availW = wrap.clientWidth - 40, availH = wrap.clientHeight - 40;
  zoom = Math.min(availW / cw, availH / ch, 1.1);
  zoom = Math.max(zoom, 0.25);
  applyZoom();
}

// ---------- VIEW SWITCH ----------
function setView(v: "tree" | "table"): void {
  currentView = v;
  (document.getElementById("canvasWrap") as HTMLElement).style.display = v === "tree" ? "block" : "none";
  (document.getElementById("tableView") as HTMLElement).style.display = v === "tree" ? "none" : "block";
  document.getElementById("viewTreeBtn")!.classList.toggle("active", v === "tree");
  document.getElementById("viewTableBtn")!.classList.toggle("active", v === "tree" ? false : true);
  render();
}

function setOrientation(o: "spread" | "stack"): void {
  setOrientationForBranch(selectedId || rootId, o);
}

function updateOrientationUI(): void {
  const target = nodes[selectedId as string] || nodes[rootId];
  if (!target) return;
  const o = target.orientation || "spread";
  const spreadBtn = document.getElementById("orientSpreadBtn");
  const stackBtn = document.getElementById("orientStackBtn");
  if (spreadBtn) spreadBtn.classList.toggle("active", o === "spread");
  if (stackBtn) stackBtn.classList.toggle("active", o === "stack");
  const label = document.getElementById("orientTargetLabel");
  if (label) {
    label.textContent = (selectedId && selectedId !== rootId)
      ? `Rama: ${target.name}`
      : "Todo el proyecto";
  }
}

// ---------- SIEMBRA DESDE EL ENUNCIADO DEL ALCANCE ----------
// La EDT descompone ENTREGABLES, no requisitos. Este botón crea una rama de
// nivel 1 por cada entregable definido en el módulo "Enunciado del Alcance",
// etiquetándola con delId (traza única). No duplica: si ya existe una rama con
// ese delId la respeta, y si existe una rama con el MISMO NOMBRE pero sin
// delId, la enlaza en vez de crear otra. Luego el alumno descompone cada
// entregable en paquetes de trabajo.
async function seedFromScope(): Promise<void> {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) {
    await showAlert("La siembra de entregables necesita un proyecto activo. Abre la EDT desde el Panel de Control.", "Sembrar Entregables");
    return;
  }
  // Bug real reportado por el usuario: activar OTRO proyecto (B) en otra
  // pestaña mientras esta seguía sobre A y pulsar "Sembrar Entregables"
  // traía los entregables de B (lectura fresca) y los mezclaba con la EDT
  // de A (todavía en memoria aquí). Comprobar la identidad ANTES de leer
  // el Enunciado del Alcance evita el trabajo y el mensaje de "listo"
  // engañoso; markDirty() más abajo también la comprueba de nuevo justo
  // antes de guardar.
  if (ensureProjectFresh && !ensureProjectFresh()) return;
  const p = window.GPI.active();
  gpiScopeModule = (p && p.modules && p.modules.scopeStatement) || null;
  const dels = (gpiScopeModule && window.GPI.util) ? window.GPI.util.scopeDeliverables(gpiScopeModule) : [];
  if (!dels.length) {
    await showAlert("Aún no hay entregables en el Enunciado del Alcance. Ábrelo, define los entregables (idealmente sugiriéndolos desde el Acta) y vuelve a sembrar. Recuerda: la EDT descompone entregables, no requisitos.", "Sembrar Entregables");
    return;
  }
  const usedDel: Record<string, boolean> = {};
  Object.keys(nodes).forEach((id) => { if (nodes[id].delId) usedDel[nodes[id].delId as string] = true; });
  const byName: Record<string, string> = {};
  (nodes[rootId].children || []).forEach((cid) => {
    if (nodes[cid]) byName[(nodes[cid].name || "").toLowerCase().trim()] = cid;
  });
  let added = 0, linked = 0;
  dels.forEach((d) => {
    if (usedDel[d.id]) return; // ya descompuesto
    const nm = (d.name || "").toLowerCase().trim();
    const existing = byName[nm];
    if (existing && !nodes[existing].delId) { nodes[existing].delId = d.id; linked++; return; }
    if (existing && nodes[existing].delId) return; // ocupado por otro entregable con mismo nombre
    newNode(rootId, d.name || "Entregable", { delId: d.id });
    added++;
  });
  render(); setTimeout(fitToScreen, 50);
  // markDirty() (no un GPI.setModule(...) directo aquí) -- guardado
  // secundario reportado por el usuario: esta función leía
  // window.GPI.active() FRESCO en cada llamada (solo para saber si hay
  // ALGÚN proyecto activo), pero nunca comprobaba que siguiera siendo el
  // MISMO proyecto que esta pestaña cargó -- si otra pestaña activaba un
  // proyecto B mientras esta seguía en A, "Sembrar Entregables" mezclaba
  // los entregables de B (recién leídos) con la EDT de A (todavía en
  // memoria) y la escribía sobre B, sin pasar por el guard de
  // gpiBridge()/push(). markDirty() (ver su comentario al inicio del
  // archivo) dispara requestGpiPush -> push(), que SÍ verifica
  // GPI.activeId() === loadedProjectId antes de guardar -- mismo camino
  // que ya usan "+ Fase"/"+ Subtarea" para cualquier cambio estructural.
  markDirty();
  const msg = added
    ? ("Se sembraron " + added + " entregable(s) como ramas de la EDT" + (linked ? (" y se enlazaron " + linked + " existentes") : "") + ". Ahora descompón cada entregable en sus paquetes de trabajo.")
    : (linked ? ("Se enlazaron " + linked + " rama(s) existentes con sus entregables.")
      : "Todos los entregables del alcance ya están representados en la EDT.");
  setStatus(msg);
  await showAlert(msg, "Sembrar Entregables");
}

// ---------- INIT / EVENTS ----------
function init(): void {
  blankProject();
  render();
  setTimeout(fitToScreen, 50);

  document.getElementById("btnAddPhase")!.addEventListener("click", () => {
    const id = newNode(rootId, "Nueva fase");
    selectedId = id; render(); focusNameField(); markDirty();
  });
  document.getElementById("btnAddChild")!.addEventListener("click", () => {
    const parent = selectedId || rootId;
    const id = newNode(parent, "Nueva subtarea");
    selectedId = id; render(); focusNameField(); markDirty();
  });
  document.getElementById("btnSeedScope")!.addEventListener("click", seedFromScope);
  document.getElementById("btnDelete")!.addEventListener("click", async () => {
    if (!selectedId || selectedId === rootId) { await showAlert("Selecciona un nodo distinto del proyecto raíz."); return; }
    const ok = await showConfirm(`¿Eliminar "${nodes[selectedId].name}" y sus subtareas?`);
    if (ok) {
      deleteSubtree(selectedId);
      selectedId = rootId;
      render();
      markDirty();
    }
  });

  document.getElementById("zoomIn")!.addEventListener("click", () => { zoom = Math.min(zoom + 0.1, 2); applyZoom(); });
  document.getElementById("zoomOut")!.addEventListener("click", () => { zoom = Math.max(zoom - 0.1, 0.2); applyZoom(); });
  document.getElementById("zoomFit")!.addEventListener("click", fitToScreen);

  document.getElementById("viewTreeBtn")!.addEventListener("click", () => setView("tree"));
  document.getElementById("viewTableBtn")!.addEventListener("click", () => setView("table"));

  document.getElementById("orientSpreadBtn")!.addEventListener("click", () => setOrientation("spread"));
  document.getElementById("orientStackBtn")!.addEventListener("click", () => setOrientation("stack"));

  document.getElementById("btnCollapseAll")!.addEventListener("click", () => {
    Object.values(nodes).forEach((n) => { if (n.children.length > 0) n.collapsed = true; });
    render(); setTimeout(fitToScreen, 50);
  });
  document.getElementById("btnExpandAll")!.addEventListener("click", () => {
    Object.values(nodes).forEach((n) => { n.collapsed = false; });
    render(); setTimeout(fitToScreen, 50);
  });

  document.getElementById("btnExportExcel")!.addEventListener("click", downloadWbsExcel);
  document.getElementById("btnImportExcel")!.addEventListener("click", () => { (document.getElementById("xlsxFileInput") as HTMLInputElement).click(); });
  document.getElementById("xlsxFileInput")!.addEventListener("change", (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files[0]) importWbsExcel(files[0]);
    (e.target as HTMLInputElement).value = "";
  });

  document.getElementById("btnPrint")!.addEventListener("click", () => window.print());

  document.getElementById("btnSample")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto reemplazará el proyecto actual por el ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo");
    if (ok) { loadSample(); render(); setTimeout(fitToScreen, 50); markDirty(); }
  });
  document.getElementById("btnReset")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto borrará el proyecto actual. ¿Continuar?", "Nuevo proyecto");
    if (ok) { blankProject(); render(); setTimeout(fitToScreen, 50); markDirty(); }
  });

  document.getElementById("canvasWrap")!.addEventListener("click", () => { selectedId = rootId; render(); });

  window.addEventListener("keydown", async (e) => {
    const modalOpen = document.getElementById("modalOverlay")!.classList.contains("open");
    if (modalOpen) return; // el propio modal maneja Enter/Escape; evita confirmaciones anidadas
    if (e.key === "Delete" && selectedId && selectedId !== rootId && (document.activeElement as HTMLElement).tagName !== "INPUT" && (document.activeElement as HTMLElement).tagName !== "TEXTAREA") {
      const ok = await showConfirm(`¿Eliminar "${nodes[selectedId].name}"?`);
      if (ok) { deleteSubtree(selectedId); selectedId = rootId; render(); markDirty(); }
    }
  });
}

document.addEventListener("DOMContentLoaded", init);

// ===== Puente con el Panel de Control (GPI) =====
// Sincroniza el WBS con el proyecto activo. El "Responsable" de cada paquete
// (hoja) se sobrescribe a partir de la Matriz RACI si esta ya tiene un "R"
// asignado para ese paquete — la RACI es la fuente de responsabilidades del
// WBS, ya no la lista de interesados. El campo "Persona" del OBS alimenta el
// autocompletado para los paquetes que aún no tienen RACI asignada.
document.addEventListener("DOMContentLoaded", function gpiBridge() {
  if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
  const GPI = window.GPI;
  const proj = GPI.active();
  // Id. del proyecto activo cuando esta pestaña cargó sus datos -- se
  // compara contra GPI.activeId() antes de cada guardado (ver push())
  // para nunca escribir esta EDT sobre un proyecto distinto que se haya
  // activado desde otra pestaña mientras esta seguía abierta (bug real
  // reportado por el usuario, confirmado sistémico en los 13 módulos de
  // herramienta).
  const loadedProjectId: string | null = proj ? GPI.activeId() : null;
  let projectStale = false;
  function markProjectStale(): void {
    if (projectStale) return;
    projectStale = true;
    setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
    const banner = document.getElementById("banner");
    if (banner) {
      banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar la EDT aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
      banner.classList.add("show");
    }
  }
  const titleEl = document.getElementById("projectTitle") as HTMLInputElement;
  const courseEl = document.getElementById("courseTitle") as HTMLInputElement;
  function pull(): void {
    const p = GPI.active(); if (!p) return;
    if (p.meta) { if (p.meta.name) titleEl.value = p.meta.name; if (p.meta.course) courseEl.value = p.meta.course; }
    gpiRaciModule = (p.modules && p.modules.raci) || null;
    gpiObsModule = (p.modules && p.modules.obs) || null;
    gpiScopeModule = (p.modules && p.modules.scopeStatement) || null;
    gpiActivitiesModule = (p.modules && p.modules.activities) || null;
    gpiPertModule = (p.modules && p.modules.pert) || null;
    gpiScheduleModule = (p.modules && p.modules.schedule) || null;
    gpiSchedulePlanModule = (p.modules && p.modules.schedulePlan) || null;
    gpiCostEstimateModule = (p.modules && p.modules.costEstimate) || null;
    const mod = p.modules && p.modules.wbs;
    if (mod && mod.nodes && mod.rootId) {
      const synced = (gpiRaciModule && gpiObsModule && GPI.util) ? GPI.util.applyRaciToWbs(mod, gpiRaciModule, gpiObsModule) : mod;
      const modWbs = (synced as typeof mod) as WbsModule;
      const schedSync = (GPI.util && GPI.util.applyScheduleToWbs)
        ? GPI.util.applyScheduleToWbs(modWbs, gpiActivitiesModule, gpiPertModule, gpiScheduleModule, gpiSchedulePlanModule, p.meta)
        : { wbs: modWbs, lockedLeafIds: [] };
      const costSync = (GPI.util && GPI.util.applyCostEstimateToWbs)
        ? GPI.util.applyCostEstimateToWbs(schedSync.wbs, gpiCostEstimateModule, gpiActivitiesModule)
        : { wbs: schedSync.wbs, lockedLeafIds: [] };
      nodes = costSync.wbs.nodes as unknown as Record<string, WbsUiNode>; rootId = costSync.wbs.rootId; idCounter = costSync.wbs.idCounter || 1; selectedId = rootId;
      scheduleLockedLeafIds = new Set(schedSync.lockedLeafIds);
      costEstimateLockedLeafIds = new Set(costSync.lockedLeafIds);
      render(); setTimeout(fitToScreen, 50);
      setStatus("Proyecto cargado desde el Panel de Control.");
    } else {
      // Primera conexión sin EDT aún: arranca EN BLANCO con el nombre del
      // proyecto como raíz. El caso DISTRIB+ solo se carga con el botón
      // "Cargar ejemplo" (acción explícita y confirmada): así un proyecto
      // nuevo del alumno nunca se contamina con datos de ejemplo por el
      // guardado automático al salir.
      blankProject((p.meta && p.meta.name) || "Proyecto sin título");
      scheduleLockedLeafIds = new Set();
      costEstimateLockedLeafIds = new Set();
      render(); setTimeout(fitToScreen, 50);
      setStatus("Proyecto sin EDT todavía. Agrega fases y paquetes, o usa ⌘ Cargar ejemplo para explorar el caso DISTRIB+.");
    }
  }
  function push(): void {
    if (!GPI.active()) return;
    if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) { markProjectStale(); return; }
    GPI.setModule("wbs", { rootId, idCounter, nodes }, loadedProjectId);
    GPI.patchMeta({ name: titleEl.value, course: courseEl.value }, loadedProjectId);
  }
  // Deja push() disponible para markDirty() (ver su comentario al inicio del
  // archivo) -- así cualquier edición, en cualquier parte del módulo, llega
  // al Panel con el mismo debounce de 800ms que usan los demás módulos, sin
  // depender solo de ocultar la pestaña o cerrarla.
  requestGpiPush = push;
  ensureProjectFresh = () => {
    if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    return true;
  };
  // Sincronización ligera: si la Matriz RACI cambia en OTRA pestaña (p. ej. se
  // asigna un nuevo "R"), refresca solo los campos "Responsable" ya afectados —
  // sin tocar selección, zoom ni el resto de campos que el usuario esté editando.
  function refreshRaciSync(): void {
    const p = GPI.active(); if (!p) return;
    gpiRaciModule = (p.modules && p.modules.raci) || null;
    gpiObsModule = (p.modules && p.modules.obs) || null;
    gpiScopeModule = (p.modules && p.modules.scopeStatement) || null;
    if (!gpiRaciModule || !gpiObsModule || !GPI.util) return;
    let changed = false;
    Object.keys(nodes).forEach((id) => {
      const n = nodes[id];
      if (!n || n.children.length > 0) return; // solo paquetes (hojas)
      const ids = GPI.util.raciResponsibleIds(gpiRaciModule, id);
      if (!ids.length) return;
      const labels = ids.map((rid) => GPI.util.obsLabel((gpiObsModule as ObsModule).nodes[rid])).filter(Boolean);
      if (!labels.length) return;
      const joined = labels.join(", ");
      if (n.resource !== joined) { n.resource = joined; changed = true; }
    });
    if (changed) { render(); setStatus("Responsables actualizados desde la Matriz RACI."); }
  }
  // Sincronización ligera análoga, pero para fechas: si el Cronograma CPM cambia
  // en OTRA pestaña (nuevas actividades, enlaces o recálculo), refresca solo las
  // fechas de los paquetes cuya ruta crítica ya es calculable.
  function refreshScheduleSync(): void {
    const p = GPI.active(); if (!p) return;
    gpiActivitiesModule = (p.modules && p.modules.activities) || null;
    gpiPertModule = (p.modules && p.modules.pert) || null;
    gpiScheduleModule = (p.modules && p.modules.schedule) || null;
    gpiSchedulePlanModule = (p.modules && p.modules.schedulePlan) || null;
    if (!GPI.util || !GPI.util.applyScheduleToWbs) return;
    const snapshot: WbsModule = { rootId, idCounter, nodes: nodes as unknown as Record<string, WbsNode> };
    const schedSync = GPI.util.applyScheduleToWbs(snapshot, gpiActivitiesModule, gpiPertModule, gpiScheduleModule, gpiSchedulePlanModule, p.meta);
    scheduleLockedLeafIds = new Set(schedSync.lockedLeafIds);
    let changed = false;
    schedSync.lockedLeafIds.forEach((id) => {
      const n = nodes[id], sn = schedSync.wbs.nodes[id];
      if (!n || !sn) return;
      const s = sn.start || "", e = sn.end || "";
      if (n.start !== s || n.end !== e) { n.start = s; n.end = e; changed = true; }
    });
    if (changed) { render(); setStatus("Fechas actualizadas desde el Cronograma CPM."); }
  }
  // Sincronización ligera análoga, pero para Costo: si Estimar los Costos
  // cambia en OTRA pestaña, refresca solo el costo de los paquetes que ya
  // tienen Cantidad y Precio unitario válidos.
  function refreshCostEstimateSync(): void {
    const p = GPI.active(); if (!p) return;
    gpiCostEstimateModule = (p.modules && p.modules.costEstimate) || null;
    gpiActivitiesModule = (p.modules && p.modules.activities) || null;
    if (!GPI.util || !GPI.util.applyCostEstimateToWbs) return;
    const snapshot: WbsModule = { rootId, idCounter, nodes: nodes as unknown as Record<string, WbsNode> };
    const costSync = GPI.util.applyCostEstimateToWbs(snapshot, gpiCostEstimateModule, gpiActivitiesModule);
    costEstimateLockedLeafIds = new Set(costSync.lockedLeafIds);
    let changed = false;
    costSync.lockedLeafIds.forEach((id) => {
      const n = nodes[id], sn = costSync.wbs.nodes[id];
      if (!n || !sn) return;
      const c = Number(sn.cost) || 0;
      if (Number(n.cost) !== c) { n.cost = c; changed = true; }
    });
    if (changed) { render(); setStatus("Costo actualizado desde Estimar los Costos."); }
  }
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else if (loadedProjectId == null || GPI.activeId() === loadedProjectId) { refreshRaciSync(); refreshScheduleSync(); refreshCostEstimateSync(); } else { markProjectStale(); } });
  GPI.onChange(() => {
    if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) { markProjectStale(); return; }
    if (!document.hidden) { refreshRaciSync(); refreshScheduleSync(); refreshCostEstimateSync(); }
  });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
});

function gpiBadge(name: string | undefined, pushFn: () => void): void {
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div");
  bar.className = "gpi-badge";
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + String(name || "—").replace(/</g, "&lt;") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  (bar.querySelector("#gpiSyncBtn") as HTMLElement).addEventListener("click", () => {
    pushFn(); const b = bar.querySelector("#gpiSyncBtn") as HTMLElement, t = b.textContent; b.textContent = "✓ Sincronizado";
    setTimeout(() => { b.textContent = t; }, 1400);
  });
}

// ===== REPORTE IMPRIMIBLE (📄) =====
// Genera un documento formal dentro de #gpiReport y lo imprime en solitario:
// en @media print, body.report-mode oculta la aplicación y muestra solo el reporte.
function reportShell(docTitle: string, moduleName: string, bodyHtml: string): void {
  let el = document.getElementById("gpiReport");
  if (!el) { el = document.createElement("div"); el.id = "gpiReport"; document.body.appendChild(el); }
  let meta: Partial<ProjectMeta> = {};
  try { if (window.GPI && window.GPI.available() && window.GPI.meta()) meta = window.GPI.meta() as ProjectMeta; } catch (_) { /* noop */ }
  const tEl = document.getElementById("projectTitle") as HTMLInputElement | null, cEl = document.getElementById("courseTitle") as HTMLInputElement | null;
  const pName = (tEl && tEl.value) || meta.name || "Proyecto";
  const course = (cEl && cEl.value) || meta.course || "Gestión de Proyectos de Ingeniería";
  const today = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  el.innerHTML =
    '<div class="rep-head"><div><h1>' + escapeHtml(docTitle) + '</h1>'
    + '<div class="sub">' + escapeHtml(pName) + (meta.code ? ' · ' + escapeHtml(meta.code) : '') + '</div>'
    + '<div class="sub" style="font-weight:500">' + escapeHtml(course) + '</div></div>'
    + '<div class="rep-meta">' + escapeHtml(moduleName) + '<br>Emitido: ' + escapeHtml(today)
    + (meta.client ? '<br>Cliente: ' + escapeHtml(meta.client) : '')
    + (meta.location ? '<br>' + escapeHtml(meta.location) : '') + '</div></div>'
    + bodyHtml;
  document.body.classList.add("report-mode");
  function repDone() { document.body.classList.remove("report-mode"); window.removeEventListener("afterprint", repDone); }
  window.addEventListener("afterprint", repDone);
  // window.print() es bloqueante en la mayoría de navegadores; el timeout
  // posterior actúa de respaldo donde afterprint no dispara.
  setTimeout(() => { window.print(); setTimeout(repDone, 500); }, 60);
}
function repDate(s: string | null | undefined): string { if (!s) return "—"; const p = String(s).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s; }

interface AggResult { cost: number; start: string; end: string; leaves: number; }

function buildReport(): void {
  const CURW: Record<string, string> = { USD: "USD $", PEN: "S/", EUR: "€" };
  let curr = "USD";
  try { if (window.GPI && window.GPI.available() && window.GPI.meta()) curr = window.GPI.meta()!.currency || "USD"; } catch (_) { /* noop */ }
  function m(v: number | string | undefined): string { const n = Number(v) || 0; return (CURW[curr] || "$") + " " + n.toLocaleString("es-PE"); }
  // Rollup por subárbol: costo = suma de hojas; fechas = rango (inicio más
  // temprano → fin más tardío), coherente con la ejecución en paralelo.
  function agg(id: string): AggResult {
    const n = nodes[id];
    if (!n) return { cost: 0, start: "", end: "", leaves: 0 };
    if (!n.children.length) return { cost: Number(n.cost) || 0, start: n.start || "", end: n.end || "", leaves: 1 };
    const out: AggResult = { cost: 0, start: "", end: "", leaves: 0 };
    n.children.forEach((cid) => {
      const a = agg(cid);
      out.cost += a.cost; out.leaves += a.leaves;
      if (a.start && (!out.start || a.start < out.start)) out.start = a.start;
      if (a.end && (!out.end || a.end > out.end)) out.end = a.end;
    });
    return out;
  }
  let rowsHtml = "", dictHtml = "", leafCount = 0;
  (function walk(id: string, code: string, depth: number): void {
    const n = nodes[id]; if (!n) return;
    const isLeaf = !n.children.length;
    const a = agg(id);
    const pad = 'style="padding-left:' + (6 + depth * 14) + 'px"';
    rowsHtml += '<tr><td class="num">' + escapeHtml(code || "—") + '</td>'
      + '<td ' + pad + '>' + (isLeaf ? escapeHtml(n.name) : "<b>" + escapeHtml(n.name) + "</b>") + '</td>'
      + '<td>' + escapeHtml(n.resource || "—") + '</td>'
      + '<td class="num">' + repDate(a.start) + '</td><td class="num">' + repDate(a.end) + '</td>'
      + '<td class="num" style="text-align:right">' + m(a.cost) + '</td>'
      + '<td class="num" style="text-align:right">' + (Number(n.percent) || 0) + '%</td></tr>';
    if (isLeaf) {
      leafCount++;
      const fromCpm = scheduleLockedLeafIds.has(id);
      const fromEstimate = costEstimateLockedLeafIds.has(id);
      dictHtml += '<tr><td class="num">' + escapeHtml(code || "—") + '</td><td><b>' + escapeHtml(n.name) + '</b></td>'
        + '<td>' + escapeHtml(n.resource || "—") + '</td>'
        + '<td class="num" style="text-align:center">' + (Number(n.duration) || 0) + '</td>'
        + '<td class="num">' + repDate(n.start) + (fromCpm ? " ¹" : "") + '</td><td class="num">' + repDate(n.end) + (fromCpm ? " ¹" : "") + '</td>'
        + '<td class="num" style="text-align:right">' + m(n.cost) + (fromEstimate ? " ²" : "") + '</td>'
        + '<td>' + escapeHtml(n.notes || "—") + '</td></tr>';
    }
    n.children.forEach((cid, i) => { walk(cid, code ? code + "." + (i + 1) : String(i + 1), depth + 1); });
  })(rootId, "", 0);
  const total = agg(rootId);
  const body = '<h2>1. Estructura de Desglose del Trabajo (EDT)</h2>'
    + '<p class="rep-note">Los costos y fechas de fases y del proyecto son consolidados (rollup) de sus paquetes de trabajo; las fechas de los niveles superiores reflejan el rango inicio más temprano → fin más tardío (ejecución en paralelo incluida).</p>'
    + '<table><tr><th style="width:8%">Código EDT</th><th>Elemento</th><th style="width:15%">Responsable</th><th style="width:9%">Inicio</th><th style="width:9%">Fin</th><th style="width:12%">Costo</th><th style="width:8%">Avance</th></tr>'
    + rowsHtml
    + '<tr><td colspan="5" style="text-align:right"><b>Costo total del proyecto (rollup de ' + leafCount + ' paquetes)</b></td><td class="num" style="text-align:right"><b>' + m(total.cost) + '</b></td><td></td></tr></table>'
    + '<h2>2. Diccionario de la EDT — paquetes de trabajo</h2>'
    + '<table><tr><th style="width:8%">Código EDT</th><th style="width:17%">Paquete de trabajo</th><th style="width:12%">Responsable</th><th style="width:7%">Dur. (d)</th><th style="width:9%">Inicio</th><th style="width:9%">Fin</th><th style="width:11%">Costo</th><th>Descripción / notas</th></tr>'
    + (dictHtml || '<tr><td colspan="8" class="rep-note">— Sin paquetes de trabajo —</td></tr>') + '</table>'
    + '<p class="rep-note">El responsable de cada paquete proviene de la Matriz RACI (rol marcado con "R") o, si aún no la tiene, de una selección manual dentro del OBS del proyecto — nunca de texto libre. Las fechas marcadas con ¹ provienen del Cronograma CPM (ruta crítica ya calculable para ese paquete); los costos marcados con ² provienen de Estimar los Costos (Cantidad × Precio unitario ya calculados para ese paquete); el resto de fechas y costos son una estimación manual bottom-up ingresada en esta EDT, sujeta a cambiar una vez calculados los valores reales en esos módulos.</p>';
  reportShell("EDT y Diccionario del Proyecto", "WBS Builder · Gestión del Alcance", body);
}

(function () {
  const b = document.getElementById("btnReport");
  if (b) b.addEventListener("click", buildReport);
})();
