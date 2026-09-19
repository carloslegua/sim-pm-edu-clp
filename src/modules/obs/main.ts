/* =========================================================
   Equipo del Proyecto (OBS) — motor de datos, layout y render
   Port mecánico del <script> inline de OBS_Builder.html (Fase 4 de
   MIGRATION.md): misma lógica, mismo comportamiento. Se agregan tipos y
   se compila a obs.js (IIFE) para que el HTML lo cargue como
   <script src="obs.js"> en vez de tenerlo inline.

   DELIBERADAMENTE NO se toca escapeHtml/escapeAttr para usar
   GPI.ui.esc: este módulo debe seguir funcionando aunque gpi-core.js no
   cargue (ver README, "modo independiente"). Solo las funciones que ya
   dependían de GPI en el original (gpiBridge, push, pull, reportShell)
   lo siguen haciendo, siempre detrás de un chequeo defensivo.
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { ProjectMeta } from "../../core/types";

type GpiApi = typeof GpiCore.GPI;
declare global {
  interface Window { GPI?: GpiApi; }
}

// ---------- CONFIG ----------
const NODE_W = 190;
const NODE_H = 100;
const GAP_X = 26;
const GAP_Y = 60;

interface ObsTypeDef { key: string; label: string; color: string; hex: string; }

const OBS_TYPES: ObsTypeDef[] = [
  { key: "patrocinio", label: "Patrocinio / Gobernanza", color: "var(--t-patrocinio)", hex: "#2e4374" },
  { key: "direccion", label: "Dirección de Proyecto", color: "var(--t-direccion)", hex: "#00b6ec" },
  { key: "core", label: "Equipo Core", color: "var(--t-core)", hex: "#6c5ce7" },
  { key: "funcional", label: "Área Funcional", color: "var(--t-funcional)", hex: "#00c2a8" },
  { key: "externo", label: "Externo / Proveedor", color: "var(--t-externo)", hex: "#ff9f1c" }
];
function typeOf(key: string): ObsTypeDef { return OBS_TYPES.find((t) => t.key === key) || OBS_TYPES[2]; }

// ---------- STATE ----------
interface ObsUiNode {
  id: string;
  parentId: string | null;
  role: string;
  person: string;
  type: string;
  email: string;
  notes: string;
  children: string[];
  collapsed: boolean;
  orientation: "spread" | "stack";
}

let nodes: Record<string, ObsUiNode> = {};
let rootId = "root";
let selectedId: string | null = null;
let zoom = 1;
let draggedId: string | null = null;
let currentView: "tree" | "table" = "tree";
let idCounter = 1;

function uid(): string { return "o" + idCounter++; }

function newNode(parentId: string | null, role?: string, overrides?: Partial<ObsUiNode>): string {
  const id = uid();
  nodes[id] = Object.assign<ObsUiNode, Partial<ObsUiNode>>(
    {
      id, parentId, role: role || "Nuevo puesto", person: "", type: "funcional",
      email: "", notes: "", children: [], collapsed: false, orientation: "spread"
    },
    overrides || {}
  );
  if (parentId && nodes[parentId]) nodes[parentId].children.push(id);
  return id;
}

function blankProject(title?: string): void {
  nodes = {};
  idCounter = 1;
  rootId = newNode(null, title || "Organización del Proyecto", { type: "root" });
  selectedId = rootId;
}

// ---------- SAMPLE DATA: caso DISTRIB+ S.A. ----------
// Los nombres de "person" replican deliberadamente los mismos códigos usados
// como "Responsable" en el WBS de ejemplo (PM, Ing. Civil, Proveedor A, ...)
// para que la Matriz RACI de ejemplo pueda enlazar ambos de forma coherente.
function loadSample(): void {
  blankProject("Organización del Proyecto — DISTRIB+ S.A.");
  const root = rootId;

  newNode(root, "Comité Directivo / Sponsor", { person: "Gerencia General DISTRIB+", type: "patrocinio", email: "gerencia@distribmas.pe" });
  const pm = newNode(root, "Director de Proyecto", { person: "PM", type: "direccion", email: "pm@distribmas.pe" });

  const ing = newNode(pm, "Jefe de Ingeniería", { person: "Ing. Civil", type: "core" });
  newNode(ing, "Especialista en Geotecnia", { person: "Geotecnia", type: "funcional" });
  newNode(ing, "Ingeniero Estructural", { person: "Ing. Estructural", type: "funcional" });
  newNode(ing, "Ingeniero MEP", { person: "Ing. MEP", type: "funcional" });

  const log = newNode(pm, "Jefe de Logística", { person: "Logística", type: "core" });
  newNode(log, "Proveedor — Estructuras metálicas", { person: "Proveedor A", type: "externo" });
  newNode(log, "Proveedor — Materiales de construcción", { person: "Proveedor B", type: "externo" });
  newNode(log, "Proveedor — Equipos eléctricos", { person: "Proveedor C", type: "externo" });

  const obra = newNode(pm, "Residente de Obra", { person: "Residente de Obra", type: "core" });
  newNode(obra, "Cuadrilla A — Movimiento de tierras", { person: "Cuadrilla A", type: "funcional" });
  newNode(obra, "Cuadrilla B — Cimentaciones", { person: "Cuadrilla B", type: "funcional" });
  newNode(obra, "Cuadrilla C — Estructura y cobertura", { person: "Cuadrilla C", type: "funcional" });
  newNode(obra, "Cuadrilla D — Acabados y cerramientos", { person: "Cuadrilla D", type: "funcional" });
  newNode(obra, "Subcontrata MEP", { person: "Subcontrata MEP", type: "externo" });
  nodes[obra].orientation = "stack";

  newNode(pm, "Control de Calidad", { person: "QA/QC", type: "funcional" });
  newNode(root, "Asesoría Legal", { person: "Legal", type: "externo" });

  selectedId = root;
}

// ---------- HIERARCHY HELPERS ----------
function visibleChildren(id: string): string[] { return nodes[id] && nodes[id].collapsed ? [] : (nodes[id] ? nodes[id].children : []); }
function countDescendants(id: string): number {
  let count = 0;
  function walk(nid: string): void { nodes[nid].children.forEach((cid) => { count++; walk(cid); }); }
  walk(id);
  return count;
}
function isDescendant(ancestorId: string, candidateId: string): boolean {
  if (ancestorId === candidateId) return true;
  let n: ObsUiNode | undefined = nodes[candidateId];
  while (n && n.parentId) { if (n.parentId === ancestorId) return true; n = nodes[n.parentId]; }
  return false;
}
function depthOf(id: string): number { let d = 0, n: ObsUiNode | undefined = nodes[id]; while (n && n.parentId) { d++; n = nodes[n.parentId]; } return d; }
function deleteSubtree(id: string): void {
  const node = nodes[id]; if (!node) return;
  [...node.children].forEach(deleteSubtree);
  if (node.parentId && nodes[node.parentId]) {
    const arr = nodes[node.parentId].children;
    const idx = arr.indexOf(id);
    if (idx > -1) arr.splice(idx, 1);
  }
  if (draggedId === id) draggedId = null;
  delete nodes[id];
}

// ---------- CÓDIGO JERÁRQUICO ----------
function computeCodes(): Record<string, string> {
  const codes: Record<string, string> = {};
  function walk(id: string, prefix: string): void {
    codes[id] = prefix;
    nodes[id].children.forEach((cid, i) => walk(cid, prefix ? `${prefix}.${i + 1}` : `${i + 1}`));
  }
  nodes[rootId].children.forEach((cid, i) => walk(cid, `${i + 1}`));
  codes[rootId] = "0";
  return codes;
}

// ---------- TREE LAYOUT (idéntico al de WBS Builder) ----------
const SPREAD_SIBLING_GAP = GAP_X;
const SPREAD_DEPTH_GAP = GAP_Y;
const STACK_SIBLING_GAP = 26;
const STACK_DEPTH_GAP = 32;
const STACK_INDENT = Math.round(NODE_W * 0.20);

interface Size { w: number; h: number; childExtent?: { w: number; h: number }; }
interface Pos { x: number; y: number; }

function computeLayout(): Record<string, Pos> {
  const sizes: Record<string, Size> = {}, positions: Record<string, Pos> = {};
  function computeSize(id: string): Size {
    const node = nodes[id];
    const kids = visibleChildren(id);
    if (kids.length === 0) { sizes[id] = { w: NODE_W, h: NODE_H }; return sizes[id]; }
    kids.forEach(computeSize);
    const o = node.orientation || "spread";
    if (o === "stack") {
      const childrenW = Math.max(...kids.map((cid) => sizes[cid].w));
      const childrenH = kids.reduce((s, cid) => s + sizes[cid].h, 0) + STACK_SIBLING_GAP * (kids.length - 1);
      sizes[id] = { w: Math.max(NODE_W, STACK_INDENT + childrenW), h: NODE_H + STACK_DEPTH_GAP + childrenH, childExtent: { w: childrenW, h: childrenH } };
    } else {
      const childrenW = kids.reduce((s, cid) => s + sizes[cid].w, 0) + SPREAD_SIBLING_GAP * (kids.length - 1);
      const childrenH = Math.max(...kids.map((cid) => sizes[cid].h));
      sizes[id] = { w: Math.max(NODE_W, childrenW), h: NODE_H + SPREAD_DEPTH_GAP + childrenH, childExtent: { w: childrenW, h: childrenH } };
    }
    return sizes[id];
  }
  function assignPos(id: string, originX: number, originY: number): void {
    const node = nodes[id];
    const kids = visibleChildren(id);
    const size = sizes[id];
    if (kids.length === 0) { positions[id] = { x: originX, y: originY }; return; }
    const o = node.orientation || "spread";
    if (o === "stack") {
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

function setOrientationForBranch(targetId: string, o: "spread" | "stack"): void {
  function walk(id: string): void { nodes[id].orientation = o; nodes[id].children.forEach(walk); }
  walk(targetId);
  render();
  setTimeout(fitToScreen, 50);
}

// ---------- RENDER ----------
function render(): void {
  const codes = computeCodes();
  if (currentView === "tree") renderTree(codes); else renderTable(codes);
  renderProps();
  renderStats();
  renderLegend();
  updateOrientationUI();
}
function refreshValues(): void { renderStats(); const codes = computeCodes(); if (currentView === "tree") renderTree(codes); else renderTable(codes); }

function renderTree(codes: Record<string, string>): void {
  const canvas = document.getElementById("canvas") as HTMLElement;
  const svg = document.getElementById("linksSvg") as unknown as SVGSVGElement;
  canvas.querySelectorAll(".node").forEach((n) => n.remove());
  const positions = computeLayout();

  let maxX = 0, maxY = 0;
  Object.entries(positions).forEach(([, pos]) => { maxX = Math.max(maxX, pos.x + NODE_W); maxY = Math.max(maxY, pos.y + NODE_H); });
  canvas.style.width = (maxX + 120) + "px";
  canvas.style.height = (maxY + 120) + "px";
  svg.setAttribute("width", String(maxX + 120));
  svg.setAttribute("height", String(maxY + 120));

  let linkPaths = "";
  Object.values(nodes).forEach((node) => {
    const o = node.orientation || "spread";
    const kids = visibleChildren(node.id);
    const p = positions[node.id];
    if (!p || kids.length === 0) return;
    const color = node.id === rootId ? "#2e4374" : typeOf(node.type).hex;
    if (o === "stack") {
      const trunkX = p.x + 14, y1 = p.y + NODE_H;
      kids.forEach((cid) => {
        const c = positions[cid]; if (!c) return;
        const y2 = c.y + NODE_H / 2, x2 = c.x;
        linkPaths += `<path class="link" stroke="${color}" d="M${trunkX},${y1} L${trunkX},${y2} L${x2},${y2}" />`;
      });
    } else {
      kids.forEach((cid) => {
        const c = positions[cid]; if (!c) return;
        const x1 = p.x + NODE_W / 2, y1 = p.y + NODE_H, x2 = c.x + NODE_W / 2, y2 = c.y;
        const midY = (y1 + y2) / 2;
        linkPaths += `<path class="link" stroke="${color}" d="M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}" />`;
      });
    }
  });
  svg.innerHTML = linkPaths;

  Object.entries(positions).forEach(([id, pos]) => {
    const node = nodes[id];
    const isRoot = id === rootId;
    const t = typeOf(node.type);
    const color = isRoot ? "#2e4374" : t.hex;
    const hasKids = node.children.length > 0;
    const isCollapsed = !!node.collapsed;
    const nodeOrient = node.orientation || "spread";

    const el = document.createElement("div");
    el.className = "node" + (id === selectedId ? " selected" : "") + (isRoot ? " is-root" : "") + (nodeOrient === "stack" ? " orient-stack" : "");
    el.style.left = pos.x + "px"; el.style.top = pos.y + "px";
    el.dataset.id = id; el.draggable = !isRoot;
    if (!isRoot) el.style.borderLeftColor = color;

    const personHtml = isRoot ? "" : (node.person
      ? `<div class="person">👤 ${escapeHtml(node.person)}</div>`
      : `<div class="person empty">Sin persona asignada</div>`);

    el.innerHTML = `
      <span class="code" style="background:${hexA(color, 0.18)};color:${color}">${codes[id]}</span>
      ${hasKids ? `<span class="orient-flag" title="Esta rama está en orientación ${nodeOrient === "stack" ? "vertical" : "horizontal"}">${nodeOrient === "stack" ? "↕" : "↔"}</span>` : ""}
      <span class="type-label">${isRoot ? "Organización" : t.label}</span>
      <div class="role">${escapeHtml(node.role)}</div>
      ${personHtml}
      ${(!isRoot && node.email) ? `<div class="email">${escapeHtml(node.email)}</div>` : ""}
      <div class="add-child-btn" title="Agregar subordinado">+</div>
      ${hasKids ? `<div class="collapse-btn${isCollapsed ? " is-collapsed" : ""}" title="${isCollapsed ? "Expandir rama (" + countDescendants(id) + " ocultos)" : "Colapsar rama"}">${isCollapsed ? "+" + countDescendants(id) : "−"}</div>` : ""}
    `;

    el.addEventListener("click", (e) => { e.stopPropagation(); selectNode(id); });
    el.addEventListener("dblclick", (e) => { e.stopPropagation(); selectNode(id); focusRoleField(); });
    (el.querySelector(".add-child-btn") as HTMLElement).addEventListener("click", (e) => {
      e.stopPropagation();
      const newId = newNode(id, "Nuevo puesto");
      selectedId = newId; render(); focusRoleField();
    });
    const collapseBtn = el.querySelector(".collapse-btn");
    if (collapseBtn) collapseBtn.addEventListener("click", (e) => { e.stopPropagation(); node.collapsed = !node.collapsed; render(); });

    if (!isRoot) {
      el.addEventListener("dragstart", (e) => { draggedId = id; el.classList.add("dragging"); (e as DragEvent).dataTransfer!.effectAllowed = "move"; (e as DragEvent).dataTransfer!.setData("text/plain", id); });
      el.addEventListener("dragend", () => { el.classList.remove("dragging"); clearDropTargets(); draggedId = null; });
    }
    el.addEventListener("dragover", (e) => {
      if (!draggedId || !nodes[draggedId] || draggedId === id) return;
      if (isDescendant(draggedId, id)) return;
      e.preventDefault(); el.classList.add("drop-target");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
    el.addEventListener("drop", (e) => {
      e.preventDefault(); el.classList.remove("drop-target");
      if (!draggedId || !nodes[draggedId] || draggedId === id || isDescendant(draggedId, id)) return;
      reparent(draggedId, id);
    });

    canvas.appendChild(el);
  });
}

function clearDropTargets(): void { document.querySelectorAll(".node.drop-target").forEach((n) => n.classList.remove("drop-target")); }
function reparent(childId: string, newParentId: string): void {
  const child = nodes[childId], newParent = nodes[newParentId];
  if (!child || !newParent) return;
  const oldParent = nodes[child.parentId as string];
  if (oldParent) { const idx = oldParent.children.indexOf(childId); if (idx > -1) oldParent.children.splice(idx, 1); }
  child.parentId = newParentId; newParent.children.push(childId);
  selectedId = childId; render();
  setStatus(`"${child.role}" reasignado bajo "${newParent.role}"`);
}

// ---------- RENDER: TABLE (Directorio) ----------
function renderTable(codes: Record<string, string>): void {
  const wrap = document.getElementById("tableView") as HTMLElement;
  const rows: Array<{ id: string; depth: number }> = [];
  function walk(id: string, depth: number): void { if (id !== rootId) rows.push({ id, depth }); nodes[id].children.forEach((cid) => walk(cid, depth + 1)); }
  walk(rootId, 0);

  let html = `<table class="obs-table">
    <thead><tr>
      <th style="width:80px;">Código</th>
      <th>Rol / Puesto</th>
      <th style="width:170px;">Persona asignada</th>
      <th style="width:160px;">Tipo</th>
      <th style="width:170px;">Correo</th>
      <th style="width:170px;">Reporta a</th>
    </tr></thead><tbody>`;

  rows.forEach(({ id, depth }) => {
    const node = nodes[id];
    const t = typeOf(node.type);
    const parent = nodes[node.parentId as string];
    const reportsTo = parent ? escapeHtml(parent.role) : "—";
    html += `<tr>
      <td><span class="code-chip" style="background:${hexA(t.hex, 0.18)};color:${t.hex}">${codes[id]}</span></td>
      <td><div class="indent-name" style="padding-left:${(depth - 1) * 18}px;">${node.children.length ? "👥" : "●"} ${escapeHtml(node.role)}</div></td>
      <td>${node.person ? escapeHtml(node.person) : '<span class="muted">— sin asignar —</span>'}</td>
      <td><span class="type-chip" style="background:${hexA(t.hex, 0.16)};color:${t.hex}">${t.label}</span></td>
      <td class="muted">${node.email ? escapeHtml(node.email) : "—"}</td>
      <td class="muted">${reportsTo}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

// ---------- PROPERTIES PANEL ----------
function renderProps(): void {
  const panel = document.getElementById("propsPanel") as HTMLElement;
  if (!selectedId || !nodes[selectedId]) { panel.innerHTML = `<div class="empty-hint">Selecciona un puesto del organigrama para editarlo.</div>`; return; }
  const node = nodes[selectedId];
  const isRoot = selectedId === rootId;

  if (isRoot) {
    panel.innerHTML = `
      <div class="field"><label>Nombre de la organización / proyecto</label><input id="f_role" value="${escapeAttr(node.role)}" /></div>
      <div class="field"><label>Notas</label><textarea id="f_notes">${escapeHtml(node.notes || "")}</textarea></div>
      <div class="empty-hint">Este nodo raíz representa a toda la organización del proyecto. Cuelga de él los puestos de primer nivel (patrocinio, dirección, áreas).</div>
    `;
    bind("f_role", "role", false); bind("f_notes", "notes", false);
    return;
  }

  panel.innerHTML = `
    <div class="field"><label>Rol / Puesto</label><input id="f_role" value="${escapeAttr(node.role)}" /></div>
    <div class="field"><label>Persona asignada</label><input id="f_person" list="gpi-stakeholders" value="${escapeAttr(node.person)}" placeholder="Nombre de la persona" /></div>
    <div class="field-row">
      <div class="field">
        <label>Tipo de rol</label>
        <select id="f_type">${OBS_TYPES.map((t) => `<option value="${t.key}" ${t.key === node.type ? "selected" : ""}>${t.label}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Correo</label><input id="f_email" type="email" value="${escapeAttr(node.email)}" placeholder="opcional" /></div>
    </div>
    <div class="field"><label>Notas</label><textarea id="f_notes">${escapeHtml(node.notes || "")}</textarea></div>
    <div class="danger-zone"><button class="btn danger" id="f_delete" style="width:100%;">🗑 Eliminar este puesto y sus subordinados</button></div>
  `;
  bind("f_role", "role", false);
  bind("f_person", "person", false);
  bind("f_email", "email", false);
  bind("f_notes", "notes", false);
  const typeEl = document.getElementById("f_type") as HTMLSelectElement | null;
  if (typeEl) typeEl.addEventListener("change", () => { node.type = typeEl.value; render(); });

  const delBtn = document.getElementById("f_delete");
  if (delBtn) delBtn.addEventListener("click", async () => {
    const ok = await showConfirm(`¿Eliminar "${node.role}" y todos sus subordinados?`);
    if (ok) { deleteSubtree(selectedId as string); selectedId = rootId; render(); }
  });

  function bind(id: string, key: keyof ObsUiNode, isNum: boolean): void {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null; if (!el) return;
    el.addEventListener("input", () => { (node as unknown as Record<string, unknown>)[key] = isNum ? (parseFloat(el.value) || 0) : el.value; refreshValues(); });
  }
}

function focusRoleField(): void { setTimeout(() => { const el = document.getElementById("f_role") as HTMLInputElement | null; if (el) { el.focus(); el.select(); } }, 30); }

// ---------- STATS ----------
function renderStats(): void {
  let total = 0, withPerson = 0, withoutPerson = 0, maxDepth = 0;
  Object.keys(nodes).forEach((id) => {
    if (id !== rootId) {
      total++;
      if ((nodes[id].person || "").trim()) withPerson++; else withoutPerson++;
      maxDepth = Math.max(maxDepth, depthOf(id));
    }
  });
  (document.getElementById("statGrid") as HTMLElement).innerHTML = `
    <div class="stat"><div class="v">${total}</div><div class="l">Puestos totales</div></div>
    <div class="stat"><div class="v">${withPerson}</div><div class="l">Con persona asignada</div></div>
    <div class="stat"><div class="v">${maxDepth}</div><div class="l">Niveles jerárquicos</div></div>
    <div class="stat"><div class="v">${withoutPerson}</div><div class="l">Puestos sin cubrir</div></div>
  `;
}

function renderLegend(): void {
  const counts: Record<string, number> = {};
  OBS_TYPES.forEach((t) => { counts[t.key] = 0; });
  Object.keys(nodes).forEach((id) => { if (id !== rootId) { const k = nodes[id].type; if (counts[k] !== undefined) counts[k]++; } });
  (document.getElementById("legendBox") as HTMLElement).innerHTML = OBS_TYPES.map((t) =>
    `<div class="legend-item"><span class="lname"><span class="legend-dot" style="background:${t.hex}"></span>${t.label}</span><span class="lcount">${counts[t.key]}</span></div>`
  ).join("");
}

// ---------- UTIL -----------
// Deliberadamente autocontenido (NO usa GPI.ui.esc): este módulo debe
// poder renderizar aunque gpi-core.js no cargue. Ver el comentario de
// cabecera de este archivo.
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

// ---------- MODAL ----------
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
    const cleanup = (result: boolean) => { overlay.classList.remove("open"); confirmBtn.onclick = null; cancelBtn.onclick = null; overlay.onclick = null; document.removeEventListener("keydown", onKey); resolve(result); };
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
    overlay.classList.add("open"); confirmBtn.focus();
  });
}
function showConfirm(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Confirmar acción", message, confirmText: "Eliminar", cancelText: "Cancelar", danger: true }); }
function showAlert(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Aviso", message, confirmText: "Entendido", cancelText: null, danger: false }); }

function selectNode(id: string): void { selectedId = id; render(); }

// ---------- ZOOM ----------
function applyZoom(): void {
  (document.getElementById("canvas") as HTMLElement).style.transform = `scale(${zoom})`;
  (document.getElementById("zoomReadout") as HTMLElement).textContent = Math.round(zoom * 100) + "%";
}
function fitToScreen(): void {
  const wrap = document.getElementById("canvasWrap") as HTMLElement, canvas = document.getElementById("canvas") as HTMLElement;
  const cw = canvas.scrollWidth || 800, ch = canvas.scrollHeight || 600;
  const availW = wrap.clientWidth - 40, availH = wrap.clientHeight - 40;
  zoom = Math.min(availW / cw, availH / ch, 1.1);
  zoom = Math.max(zoom, 0.25);
  applyZoom();
}

function exportCsv(): void {
  const codes = computeCodes();
  const rows: string[][] = [["Código", "Rol/Puesto", "Persona", "Tipo", "Correo", "ReportaA"]];
  function walk(id: string): void {
    if (id !== rootId) {
      const n = nodes[id], parent = nodes[n.parentId as string];
      rows.push([codes[id], n.role, n.person, typeOf(n.type).label, n.email, parent ? parent.role : ""]);
    }
    nodes[id].children.forEach(walk);
  }
  walk(rootId);
  const csv = rows.map((r) => r.map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "obs_directorio.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("Directorio exportado como CSV.");
}

// ---------- VIEW SWITCH ----------
function setView(v: "tree" | "table"): void {
  currentView = v;
  (document.getElementById("canvasWrap") as HTMLElement).style.display = v === "tree" ? "block" : "none";
  (document.getElementById("tableView") as HTMLElement).style.display = v === "tree" ? "none" : "block";
  document.getElementById("viewTreeBtn")!.classList.toggle("active", v === "tree");
  document.getElementById("viewTableBtn")!.classList.toggle("active", v !== "tree");
  render();
}
function setOrientation(o: "spread" | "stack"): void { setOrientationForBranch(selectedId || rootId, o); }
function updateOrientationUI(): void {
  const target = nodes[selectedId as string] || nodes[rootId]; if (!target) return;
  const o = target.orientation || "spread";
  document.getElementById("orientSpreadBtn")!.classList.toggle("active", o === "spread");
  document.getElementById("orientStackBtn")!.classList.toggle("active", o === "stack");
  const label = document.getElementById("orientTargetLabel");
  if (label) label.textContent = (selectedId && selectedId !== rootId) ? `Rama: ${target.role}` : "Toda la organización";
}

// ---------- INIT / EVENTS ----------
function init(): void {
  blankProject();
  render();
  setTimeout(fitToScreen, 50);

  document.getElementById("btnAddTop")!.addEventListener("click", () => { const id = newNode(rootId, "Nuevo puesto"); selectedId = id; render(); focusRoleField(); });
  document.getElementById("btnAddChild")!.addEventListener("click", () => { const parent = selectedId || rootId; const id = newNode(parent, "Nuevo subordinado"); selectedId = id; render(); focusRoleField(); });
  document.getElementById("btnDelete")!.addEventListener("click", async () => {
    if (!selectedId || selectedId === rootId) { await showAlert("Selecciona un puesto distinto de la organización raíz."); return; }
    const ok = await showConfirm(`¿Eliminar "${nodes[selectedId].role}" y sus subordinados?`);
    if (ok) { deleteSubtree(selectedId); selectedId = rootId; render(); }
  });

  document.getElementById("zoomIn")!.addEventListener("click", () => { zoom = Math.min(zoom + 0.1, 2); applyZoom(); });
  document.getElementById("zoomOut")!.addEventListener("click", () => { zoom = Math.max(zoom - 0.1, 0.2); applyZoom(); });
  document.getElementById("zoomFit")!.addEventListener("click", fitToScreen);

  document.getElementById("viewTreeBtn")!.addEventListener("click", () => setView("tree"));
  document.getElementById("viewTableBtn")!.addEventListener("click", () => setView("table"));
  document.getElementById("orientSpreadBtn")!.addEventListener("click", () => setOrientation("spread"));
  document.getElementById("orientStackBtn")!.addEventListener("click", () => setOrientation("stack"));

  document.getElementById("btnCollapseAll")!.addEventListener("click", () => { Object.values(nodes).forEach((n) => { if (n.children.length > 0) n.collapsed = true; }); render(); setTimeout(fitToScreen, 50); });
  document.getElementById("btnExpandAll")!.addEventListener("click", () => { Object.values(nodes).forEach((n) => { n.collapsed = false; }); render(); setTimeout(fitToScreen, 50); });

  document.getElementById("btnExportCsv")!.addEventListener("click", exportCsv);
  document.getElementById("btnPrint")!.addEventListener("click", () => window.print());

  document.getElementById("btnSample")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto reemplazará la organización actual por el ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo");
    if (ok) { loadSample(); render(); setTimeout(fitToScreen, 50); }
  });
  document.getElementById("btnReset")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto borrará la organización actual. ¿Continuar?", "Nueva organización");
    if (ok) { blankProject(); render(); setTimeout(fitToScreen, 50); }
  });

  document.getElementById("canvasWrap")!.addEventListener("click", () => { selectedId = rootId; render(); });

  window.addEventListener("keydown", async (e) => {
    const modalOpen = document.getElementById("modalOverlay")!.classList.contains("open");
    if (modalOpen) return;
    if (e.key === "Delete" && selectedId && selectedId !== rootId && (document.activeElement as HTMLElement).tagName !== "INPUT" && (document.activeElement as HTMLElement).tagName !== "TEXTAREA") {
      const ok = await showConfirm(`¿Eliminar "${nodes[selectedId].role}"?`);
      if (ok) { deleteSubtree(selectedId); selectedId = rootId; render(); }
    }
  });
}

document.addEventListener("DOMContentLoaded", init);

// ===== Puente con el Panel de Control (GPI) =====
document.addEventListener("DOMContentLoaded", function gpiBridge() {
  if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
  const GPI = window.GPI;
  const proj = GPI.active();
  // Id. del proyecto activo cuando esta pestaña cargó sus datos -- se
  // compara contra GPI.activeId() antes de cada guardado (ver push())
  // para nunca escribir este organigrama sobre un proyecto distinto que
  // se haya activado desde otra pestaña mientras esta seguía abierta
  // (bug real reportado por el usuario, confirmado sistémico en los 13
  // módulos de herramienta).
  const loadedProjectId: string | null = proj ? GPI.activeId() : null;
  let projectStale = false;
  function markProjectStale(): void {
    if (projectStale) return;
    projectStale = true;
    setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
    const banner = document.getElementById("banner");
    if (banner) {
      banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el organigrama aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
      banner.classList.add("show");
    }
  }
  const titleEl = document.getElementById("projectTitle") as HTMLInputElement;
  const courseEl = document.getElementById("courseTitle") as HTMLInputElement;
  function refreshStakeholderList(): void {
    const mod = GPI.getModule ? GPI.getModule("stakeholders") : null;
    const names = ((mod && mod.stakeholders) || []).map((s) => s.name).filter(Boolean);
    let dl = document.getElementById("gpi-stakeholders") as HTMLDataListElement | null;
    if (!dl) { dl = document.createElement("datalist"); dl.id = "gpi-stakeholders"; document.body.appendChild(dl); }
    dl.innerHTML = names.map((n) => '<option value="' + String(n).replace(/"/g, "&quot;") + '">').join("");
  }
  function pull(): void {
    const p = GPI.active(); if (!p) return;
    if (p.meta) { if (p.meta.name) titleEl.value = "Organización del Proyecto — " + p.meta.name; if (p.meta.course) courseEl.value = p.meta.course; }
    const mod = p.modules && p.modules.obs;
    if (mod && mod.nodes && mod.rootId) {
      nodes = mod.nodes as unknown as Record<string, ObsUiNode>; rootId = mod.rootId; idCounter = mod.idCounter || 1; selectedId = rootId;
      render(); setTimeout(fitToScreen, 50);
      setStatus("Organigrama cargado desde el Panel de Control.");
    } else {
      // Primera conexión sin OBS aún: arranca EN BLANCO. El ejemplo DISTRIB+
      // solo se carga con el botón "Cargar ejemplo" (acción explícita), para
      // que el guardado automático no escriba datos de ejemplo en un
      // proyecto nuevo del alumno.
      blankProject((p.meta && p.meta.name) || "Proyecto sin título");
      render(); setTimeout(fitToScreen, 50);
      setStatus("Proyecto sin organigrama todavía. Agrega puestos, o usa ⌘ Cargar ejemplo para explorar el caso DISTRIB+.");
    }
    refreshStakeholderList();
  }
  function push(): void {
    if (!GPI.active()) return;
    if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) { markProjectStale(); return; }
    GPI.setModule("obs", { rootId, idCounter, nodes }, loadedProjectId);
    GPI.patchMeta({ course: courseEl.value }, loadedProjectId);
  }
  if (proj) pull(); else refreshStakeholderList();
  window.addEventListener("beforeunload", push);
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); });
  // Si Stakeholder Studio agrega interesados en otra pestaña, refresca el
  // autocompletado de "Persona" sin tocar el organigrama que se está editando.
  if (GPI.onChange) GPI.onChange(() => {
    if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) { markProjectStale(); return; }
    if (!document.hidden) refreshStakeholderList();
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
    pushFn();
    const b = bar.querySelector("#gpiSyncBtn") as HTMLElement, t = b.textContent;
    b.textContent = "✓ Sincronizado";
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

function buildReport(): void {
  let rowsHtml = "", total = 0, withPerson = 0;
  const counts: Record<string, number> = {};
  OBS_TYPES.forEach((t) => { counts[t.key] = 0; });
  (function walk(id: string, code: string, depth: number): void {
    const n = nodes[id]; if (!n) return;
    total++;
    if ((n.person || "").trim()) withPerson++;
    if (counts[n.type] != null) counts[n.type]++;
    const t = typeOf(n.type);
    const pad = 'style="padding-left:' + (6 + depth * 14) + 'px"';
    rowsHtml += '<tr><td class="num">' + escapeHtml(code || "—") + '</td>'
      + '<td ' + pad + '><b>' + escapeHtml(n.role) + '</b></td>'
      + '<td>' + escapeHtml(n.person || "—") + '</td>'
      + '<td>' + escapeHtml(t.label) + '</td>'
      + '<td>' + escapeHtml(n.email || "—") + '</td>'
      + '<td>' + escapeHtml(n.notes || "—") + '</td></tr>';
    n.children.forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1), depth + 1));
  })(rootId, "", 0);
  const body = '<h2>1. Resumen del equipo</h2><table class="rep-kv">'
    + '<tr><td>Puestos en la estructura</td><td><b>' + total + '</b> (' + withPerson + ' con persona asignada)</td></tr>'
    + '<tr><td>Por tipo de puesto</td><td>' + OBS_TYPES.map((t) => escapeHtml(t.label) + ": <b>" + counts[t.key] + "</b>").join(" · ") + '</td></tr></table>'
    + '<h2>2. Estructura de Desglose de la Organización (OBS)</h2>'
    + '<table><tr><th style="width:7%">Código</th><th style="width:22%">Rol / puesto</th><th style="width:16%">Persona asignada</th><th style="width:15%">Tipo</th><th style="width:16%">Contacto</th><th>Notas</th></tr>'
    + (rowsHtml || '<tr><td colspan="6" class="rep-note">— Estructura vacía —</td></tr>') + '</table>'
    + '<p class="rep-note">Las asignaciones de responsabilidad por paquete de trabajo (R/A/C/I) se documentan en la Matriz RACI, que cruza esta OBS con la EDT del proyecto.</p>';
  reportShell("Equipo del Proyecto (OBS)", "OBS Builder · Organización del Proyecto", body);
}

(function () {
  const b = document.getElementById("btnReport");
  if (b) b.addEventListener("click", buildReport);
})();
