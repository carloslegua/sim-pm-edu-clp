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
  ActivitiesModule, ObsModule, PertModule, ProjectMeta, RaciModule,
  ScheduleModule, SchedulePlanModule, ScopeStatementModule, WbsModule, WbsNode
} from "../../core/types";

type GpiApi = typeof GpiCore.GPI;
declare global {
  interface Window { GPI?: GpiApi; }
}

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
// Paquetes (hojas) cuya fecha inicio/fin quedó fijada por el Cronograma CPM en
// la última sincronización -- ver applyScheduleToWbs en gpi-core.ts.
let scheduleLockedLeafIds: Set<string> = new Set();
let rootId = "root";
let selectedId: string | null = null;
let zoom = 1;
let draggedId: string | null = null;
let currentView: "tree" | "table" = "tree";
let idCounter = 1;

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
      <th style="width:80px;">Código</th>
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
        <input id="f_cost" type="number" min="0" value="${isLeaf ? node.cost : rolled.cost}" ${isLeaf ? "" : "disabled"} />
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
    ${isLeaf ? `<div class="empty-hint">📐 <b>Estimado.</b> Este costo se ingresa aquí (bottom-up); hoy ningún otro módulo del curso calcula un costo real por paquete.</div>` : ""}
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
    });
  };
  bind("f_name", "name", false);
  bind("f_cost", "cost", true);
  bind("f_percent", "percent", true);
  if (!raciLocksResource(node) && obsOptions.length) bind("f_resource", "resource", false);
  bind("f_notes", "notes", false);
  if (durationEditable) bind("f_duration", "duration", true);

  // Las fechas pueden cambiar si el campo de duración queda habilitado/deshabilitado,
  // así que disparan un render() completo en vez del refresco liviano.
  const bindDate = (id: string, key: "start" | "end"): void => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el || !datesEditable) return;
    el.addEventListener("change", () => { node[key] = el.value; render(); });
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

// ---------- SERIALIZATION ----------
function exportJson(): void {
  const data = {
    title: (document.getElementById("projectTitle") as HTMLInputElement).value,
    course: (document.getElementById("courseTitle") as HTMLInputElement).value,
    rootId, idCounter, nodes
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (data.title || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  a.href = url; a.download = `wbs_${safeName}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  setStatus("Proyecto exportado como JSON.");
}

function importJson(file: File): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse((e.target as FileReader).result as string);
      if (!data.nodes || !data.rootId) throw new Error("Formato inválido");
      nodes = data.nodes; rootId = data.rootId; idCounter = data.idCounter || 1;
      selectedId = rootId;
      (document.getElementById("projectTitle") as HTMLInputElement).value = data.title || "Proyecto sin título";
      (document.getElementById("courseTitle") as HTMLInputElement).value = data.course || "Gestión de Proyectos de Ingeniería";
      render();
      setTimeout(fitToScreen, 50);
      setStatus("Proyecto cargado correctamente.");
    } catch (err) {
      showAlert("No se pudo leer el archivo. Verifica que sea un JSON exportado por esta herramienta.");
    }
  };
  reader.readAsText(file);
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
  if (window.GPI.active()) window.GPI.setModule("wbs", { rootId, idCounter, nodes });
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
    selectedId = id; render(); focusNameField();
  });
  document.getElementById("btnAddChild")!.addEventListener("click", () => {
    const parent = selectedId || rootId;
    const id = newNode(parent, "Nueva subtarea");
    selectedId = id; render(); focusNameField();
  });
  document.getElementById("btnSeedScope")!.addEventListener("click", seedFromScope);
  document.getElementById("btnDelete")!.addEventListener("click", async () => {
    if (!selectedId || selectedId === rootId) { await showAlert("Selecciona un nodo distinto del proyecto raíz."); return; }
    const ok = await showConfirm(`¿Eliminar "${nodes[selectedId].name}" y sus subtareas?`);
    if (ok) {
      deleteSubtree(selectedId);
      selectedId = rootId;
      render();
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

  document.getElementById("btnExportJson")!.addEventListener("click", exportJson);
  document.getElementById("btnImportJson")!.addEventListener("click", () => (document.getElementById("fileInput") as HTMLInputElement).click());
  document.getElementById("fileInput")!.addEventListener("change", (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files[0]) importJson(files[0]);
    (e.target as HTMLInputElement).value = "";
  });
  document.getElementById("btnPrint")!.addEventListener("click", () => window.print());

  document.getElementById("btnSample")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto reemplazará el proyecto actual por el ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo");
    if (ok) { loadSample(); render(); setTimeout(fitToScreen, 50); }
  });
  document.getElementById("btnReset")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto borrará el proyecto actual. ¿Continuar?", "Nuevo proyecto");
    if (ok) { blankProject(); render(); setTimeout(fitToScreen, 50); }
  });

  document.getElementById("canvasWrap")!.addEventListener("click", () => { selectedId = rootId; render(); });

  window.addEventListener("keydown", async (e) => {
    const modalOpen = document.getElementById("modalOverlay")!.classList.contains("open");
    if (modalOpen) return; // el propio modal maneja Enter/Escape; evita confirmaciones anidadas
    if (e.key === "Delete" && selectedId && selectedId !== rootId && (document.activeElement as HTMLElement).tagName !== "INPUT" && (document.activeElement as HTMLElement).tagName !== "TEXTAREA") {
      const ok = await showConfirm(`¿Eliminar "${nodes[selectedId].name}"?`);
      if (ok) { deleteSubtree(selectedId); selectedId = rootId; render(); }
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
    const mod = p.modules && p.modules.wbs;
    if (mod && mod.nodes && mod.rootId) {
      const synced = (gpiRaciModule && gpiObsModule && GPI.util) ? GPI.util.applyRaciToWbs(mod, gpiRaciModule, gpiObsModule) : mod;
      const modWbs = (synced as typeof mod) as WbsModule;
      const schedSync = (GPI.util && GPI.util.applyScheduleToWbs)
        ? GPI.util.applyScheduleToWbs(modWbs, gpiActivitiesModule, gpiPertModule, gpiScheduleModule, gpiSchedulePlanModule, p.meta)
        : { wbs: modWbs, lockedLeafIds: [] };
      nodes = schedSync.wbs.nodes as unknown as Record<string, WbsUiNode>; rootId = schedSync.wbs.rootId; idCounter = schedSync.wbs.idCounter || 1; selectedId = rootId;
      scheduleLockedLeafIds = new Set(schedSync.lockedLeafIds);
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
      render(); setTimeout(fitToScreen, 50);
      setStatus("Proyecto sin EDT todavía. Agrega fases y paquetes, o usa ⌘ Cargar ejemplo para explorar el caso DISTRIB+.");
    }
  }
  function push(): void {
    if (!GPI.active()) return;
    GPI.setModule("wbs", { rootId, idCounter, nodes });
    GPI.patchMeta({ name: titleEl.value, course: courseEl.value });
  }
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
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else { refreshRaciSync(); refreshScheduleSync(); } });
  GPI.onChange(() => { if (!document.hidden) { refreshRaciSync(); refreshScheduleSync(); } });
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
      dictHtml += '<tr><td class="num">' + escapeHtml(code || "—") + '</td><td><b>' + escapeHtml(n.name) + '</b></td>'
        + '<td>' + escapeHtml(n.resource || "—") + '</td>'
        + '<td class="num" style="text-align:center">' + (Number(n.duration) || 0) + '</td>'
        + '<td class="num">' + repDate(n.start) + (fromCpm ? " ¹" : "") + '</td><td class="num">' + repDate(n.end) + (fromCpm ? " ¹" : "") + '</td>'
        + '<td class="num" style="text-align:right">' + m(n.cost) + '</td>'
        + '<td>' + escapeHtml(n.notes || "—") + '</td></tr>';
    }
    n.children.forEach((cid, i) => { walk(cid, code ? code + "." + (i + 1) : String(i + 1), depth + 1); });
  })(rootId, "", 0);
  const total = agg(rootId);
  const body = '<h2>1. Estructura de Desglose del Trabajo (EDT)</h2>'
    + '<p class="rep-note">Los costos y fechas de fases y del proyecto son consolidados (rollup) de sus paquetes de trabajo; las fechas de los niveles superiores reflejan el rango inicio más temprano → fin más tardío (ejecución en paralelo incluida).</p>'
    + '<table><tr><th style="width:8%">Código</th><th>Elemento</th><th style="width:15%">Responsable</th><th style="width:9%">Inicio</th><th style="width:9%">Fin</th><th style="width:12%">Costo</th><th style="width:8%">Avance</th></tr>'
    + rowsHtml
    + '<tr><td colspan="5" style="text-align:right"><b>Costo total del proyecto (rollup de ' + leafCount + ' paquetes)</b></td><td class="num" style="text-align:right"><b>' + m(total.cost) + '</b></td><td></td></tr></table>'
    + '<h2>2. Diccionario de la EDT — paquetes de trabajo</h2>'
    + '<table><tr><th style="width:8%">Código</th><th style="width:17%">Paquete de trabajo</th><th style="width:12%">Responsable</th><th style="width:7%">Dur. (d)</th><th style="width:9%">Inicio</th><th style="width:9%">Fin</th><th style="width:11%">Costo</th><th>Descripción / notas</th></tr>'
    + (dictHtml || '<tr><td colspan="8" class="rep-note">— Sin paquetes de trabajo —</td></tr>') + '</table>'
    + '<p class="rep-note">El responsable de cada paquete proviene de la Matriz RACI (rol marcado con "R") o, si aún no la tiene, de una selección manual dentro del OBS del proyecto — nunca de texto libre. El costo es siempre una estimación bottom-up ingresada en esta EDT. Las fechas marcadas con ¹ provienen del Cronograma CPM (ruta crítica ya calculable para ese paquete); el resto son una estimación manual, sujeta a cambiar una vez definido el cronograma real.</p>';
  reportShell("EDT y Diccionario del Proyecto", "WBS Builder · Gestión del Alcance", body);
}

(function () {
  const b = document.getElementById("btnReport");
  if (b) b.addEventListener("click", buildReport);
})();
