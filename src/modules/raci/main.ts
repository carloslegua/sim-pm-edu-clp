/* =========================================================
   Matriz RACI — intersección EDT (filas) × OBS (columnas)
   Port mecánico del <script> inline de RACI_Matrix.html (Fase 4 de
   MIGRATION.md): misma lógica, mismo comportamiento. Se agregan tipos y
   se compila a raci.js (IIFE) para que el HTML lo cargue como
   <script src="raci.js"> en vez de tenerlo inline.

   DELIBERADAMENTE NO se toca escapeHtml/escapeAttr para usar GPI.ui.esc
   (ver el mismo comentario en src/modules/obs/main.ts): el modo "sample"
   de este módulo debe seguir funcionando aunque gpi-core.js no cargue.
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import { installGpiBadge } from "../../shared/gpi-badge";
import type { EditSession, ObsModule, ProjectMeta, WbsModule } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { buildLiveRaci } from "../../shared/raci-sample";

type GpiApi = typeof GpiCore.GPI;
declare global {
  interface Window { GPI?: GpiApi; }
}

interface RaciDef { key: "R" | "A" | "C" | "I"; label: string; desc: string; color: string; hex: string; }

const RACI_DEFS: RaciDef[] = [
  { key: "R", label: "Responsable", desc: "Ejecuta el trabajo. Regla del curso: un solo R por paquete.", color: "var(--r-color)", hex: "#00b6ec" },
  { key: "A", label: "Aprueba (Accountable)", desc: "Rinde cuentas del resultado ante el proyecto. Debe haber exactamente uno.", color: "var(--a-color)", hex: "#2e4374" },
  { key: "C", label: "Consultado", desc: "Aporta información antes de decidir (comunicación en ambos sentidos).", color: "var(--c-color)", hex: "#6c5ce7" },
  { key: "I", label: "Informado", desc: "Se le comunica el resultado (comunicación en un solo sentido).", color: "var(--i-color)", hex: "#8992a3" }
];
const CYCLE = ["", "R", "A", "C", "I"];
const OBS_TYPE_HEX: Record<string, string> = { patrocinio: "#2e4374", direccion: "#00b6ec", core: "#6c5ce7", funcional: "#00c2a8", externo: "#ff9f1c", root: "#1a2027" };

interface RaciRow { id: string; code: string; name: string; notes: string; }
interface RaciCol { id: string; code: string; role: string; person: string; type: string; }
type Assignments = Record<string, Record<string, string>>;

// ---------- SAMPLE (caso DISTRIB+ S.A., independiente de WBS Builder/Equipo del Proyecto) ----------
const SAMPLE_LEAVES: RaciRow[] = [
  { id: "l1", code: "1.1", name: "Acta de constitución", notes: "" },
  { id: "l2", code: "1.2", name: "Plan de gestión del proyecto", notes: "" },
  { id: "l3", code: "1.3", name: "Informes de seguimiento y control", notes: "" },
  { id: "l4", code: "2.1", name: "Estudio de suelos", notes: "" },
  { id: "l5", code: "2.2", name: "Diseño estructural", notes: "" },
  { id: "l6", code: "2.3", name: "Diseño eléctrico y sanitario", notes: "" },
  { id: "l7", code: "2.4", name: "Permisos y licencias municipales", notes: "" },
  { id: "l8", code: "3.1", name: "Estructuras metálicas prefabricadas", notes: "" },
  { id: "l9", code: "3.2", name: "Materiales de construcción", notes: "" },
  { id: "l10", code: "3.3", name: "Equipos eléctricos e instalaciones", notes: "" },
  { id: "l11", code: "4.1", name: "Movimiento de tierras", notes: "División en dos frentes de trabajo simultáneos: Zona Norte y Zona Sur del terreno." },
  { id: "l12", code: "4.2", name: "Cimentaciones", notes: "" },
  { id: "l13", code: "4.3", name: "Estructura y cobertura", notes: "" },
  { id: "l14", code: "4.4", name: "Acabados y cerramientos", notes: "" },
  { id: "l15", code: "4.5", name: "Instalaciones MEP", notes: "" },
  { id: "l16", code: "5.1", name: "Pruebas de instalaciones", notes: "" },
  { id: "l17", code: "5.2", name: "Capacitación al cliente", notes: "" },
  { id: "l18", code: "5.3", name: "Acta de entrega y cierre", notes: "" }
];
const SAMPLE_COLS: RaciCol[] = [
  { id: "c1", code: "1", role: "Comité Directivo / Sponsor", person: "Gerencia General DISTRIB+", type: "patrocinio" },
  { id: "c2", code: "2", role: "Director de Proyecto", person: "PM", type: "direccion" },
  { id: "c3", code: "2.1", role: "Jefe de Ingeniería", person: "Ing. Civil", type: "core" },
  { id: "c4", code: "2.1.1", role: "Especialista en Geotecnia", person: "Geotecnia", type: "funcional" },
  { id: "c5", code: "2.1.2", role: "Ingeniero Estructural", person: "Ing. Estructural", type: "funcional" },
  { id: "c6", code: "2.1.3", role: "Ingeniero MEP", person: "Ing. MEP", type: "funcional" },
  { id: "c7", code: "2.2", role: "Jefe de Logística", person: "Logística", type: "core" },
  { id: "c8", code: "2.2.1", role: "Proveedor — Estructuras metálicas", person: "Proveedor A", type: "externo" },
  { id: "c9", code: "2.2.2", role: "Proveedor — Materiales de construcción", person: "Proveedor B", type: "externo" },
  { id: "c10", code: "2.2.3", role: "Proveedor — Equipos eléctricos", person: "Proveedor C", type: "externo" },
  { id: "c11", code: "2.3", role: "Residente de Obra", person: "Residente de Obra", type: "core" },
  { id: "c12", code: "2.3.1", role: "Cuadrilla A — Movimiento de tierras", person: "Cuadrilla A", type: "funcional" },
  { id: "c13", code: "2.3.2", role: "Cuadrilla B — Cimentaciones", person: "Cuadrilla B", type: "funcional" },
  { id: "c14", code: "2.3.3", role: "Cuadrilla C — Estructura y cobertura", person: "Cuadrilla C", type: "funcional" },
  { id: "c15", code: "2.3.4", role: "Cuadrilla D — Acabados", person: "Cuadrilla D", type: "funcional" },
  { id: "c16", code: "2.3.5", role: "Subcontrata MEP", person: "Subcontrata MEP", type: "externo" },
  { id: "c17", code: "2.4", role: "Control de Calidad", person: "QA/QC", type: "funcional" },
  { id: "c18", code: "3", role: "Asesoría Legal", person: "Legal", type: "externo" },
  { id: "c19", code: "4", role: "Coordinador HSE (Seguridad)", person: "HSE", type: "funcional" }
];
// Nota didáctica: este ejemplo trae errores DELIBERADOS para que el Velocímetro
// de Gobernanza tenga algo real que detectar apenas se carga — cada una de las
// 7 reglas Hard/Soft se dispara al menos una vez:
//   HR-01 l3 sin ninguna asignación · HR-02 l14 sin "A" · HR-03 l9 con dos "A"
//   HR-04 l3 sin "R" · SR-01 l17 con dos "R" sin justificar (l11 sí la justifica
//   en sus notas) · SR-02 l7 con 4 "C" · SR-03 "Coordinador HSE" (c19) sin usar.
const SAMPLE_ASSIGNMENTS: Assignments = {
  l1: { c2: "R", c1: "A" },
  l2: { c2: "R", c1: "A" },
  l4: { c4: "R", c3: "A", c2: "C" },
  l5: { c5: "R", c3: "A", c4: "C" },
  l6: { c6: "R", c3: "A" },
  l7: { c18: "R", c2: "A", c3: "C", c7: "C", c11: "C", c1: "C" },
  l8: { c8: "R", c7: "A", c5: "C" },
  l9: { c9: "R", c7: "A", c11: "A" },
  l10: { c10: "R", c7: "A", c6: "C" },
  l11: { c12: "R", c13: "R", c11: "A", c4: "C" },
  l12: { c13: "R", c11: "A", c5: "C" },
  l13: { c14: "R", c11: "A" },
  l14: { c15: "R" },
  l15: { c16: "R", c11: "A", c6: "C" },
  l16: { c17: "R", c11: "A", c6: "C" },
  l17: { c2: "R", c3: "R", c1: "A" },
  l18: { c2: "R", c1: "A", c3: "I", c7: "I", c11: "I" }
};

// ---------- STATE ----------
let mode: "live" | "sample" = "sample";
let rows: RaciRow[] = [];
let cols: RaciCol[] = [];
let assignments: Assignments = {};
// Id. del proyecto activo cuando tryLoadLive() cargó estos datos -- se
// compara contra GPI.activeId() antes de cada guardado (ver syncToGpi())
// para nunca escribir esta matriz (ni el WBS que también toca) sobre un
// proyecto distinto que se haya activado desde otra pestaña mientras
// esta seguía abierta (bug real reportado por el usuario, confirmado
// sistémico en los 13 módulos de herramienta).
let loadedProjectId: string | null = null;
let session: EditSession | null = null; // versión de la matriz que esta pestaña cargó (GPI.openSession)
let projectStale = false;

function loadSample(): void {
  mode = "sample";
  rows = SAMPLE_LEAVES.slice();
  cols = SAMPLE_COLS.slice();
  assignments = JSON.parse(JSON.stringify(SAMPLE_ASSIGNMENTS));
}

function tryLoadLive(): boolean {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return false;
  session = window.GPI.openSession("raci"); // versión de la matriz que esta pestaña carga
  const wbsMod = window.GPI.getModule("wbs");
  const obsMod = window.GPI.getModule("obs");
  const leaves = window.GPI.util.wbsLeaves(wbsMod || undefined);
  const obsCols = window.GPI.util.obsNodes(obsMod || undefined);
  if (!leaves.length || !obsCols.length) return false;
  mode = "live";
  loadedProjectId = window.GPI.activeId();
  rows = leaves.map((l) => ({ id: l.id, code: l.code, name: l.name, notes: l.notes || "" }));
  cols = obsCols.map((c) => ({ id: c.id, code: c.code, role: c.role, person: c.person, type: c.type }));
  const raciMod = window.GPI.getModule("raci");
  assignments = (raciMod && raciMod.assignments) ? JSON.parse(JSON.stringify(raciMod.assignments)) : {};
  return true;
}

function cellValue(rowId: string, colId: string): string { return (assignments[rowId] && assignments[rowId][colId]) || ""; }
function setCellValue(rowId: string, colId: string, val: string): void {
  if (!assignments[rowId]) assignments[rowId] = {};
  if (val) assignments[rowId][colId] = val; else delete assignments[rowId][colId];
}

// Persiste la matriz de inmediato en GPI (localStorage) y, en modo "live",
// reescribe el "Responsable" de cada paquete de trabajo en el WBS activo a
// partir de los "R" de esta matriz. Se llama en cada clic de celda — no solo
// al cerrar la pestaña — para que el WBS quede sincronizado al instante.
// En modo "sample" (ejemplo desconectado) NUNCA se escribe en GPI: sus ids
// no corresponden al WBS/OBS reales y sobrescribirían datos válidos del proyecto.
// Aviso visible, una sola vez, de que esta pestaña quedó desactualizada
// (otra pestaña activó un proyecto distinto) -- reusa renderBanner()/el
// mismo <div id="banner"> que ya existe para "modo ejemplo".
function markProjectStale(): void {
  if (projectStale) return;
  projectStale = true;
  setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
  const banner = document.getElementById("banner");
  if (banner) {
    banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar la matriz RACI aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
    banner.classList.add("show");
  }
}
function syncToGpi(opts?: { meta?: boolean }): void {
  if (mode !== "live") return;
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
  if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) { markProjectStale(); return; }
  // Guardado con sesión y resultado común (src/shared/write-session.ts).
  const courseEl = document.getElementById("courseTitle") as HTMLInputElement | null;
  const r = pushWithSession(window.GPI, "raci", "La matriz RACI", { assignments },
    opts && opts.meta && courseEl ? { course: courseEl.value } : null, session, { setStatus, onStale: markProjectStale });
  session = r.session;
  if (!r.ok) return; // conflicto o rechazo: tampoco se reescribe la EDT derivada
  const wbsMod = window.GPI.getModule("wbs") as WbsModule | null;
  const obsMod = window.GPI.getModule("obs") as ObsModule | null;
  if (wbsMod && obsMod) {
    const updated = window.GPI.util.applyRaciToWbs(wbsMod, { assignments }, obsMod);
    // Escritura DERIVADA: los Responsables de la EDT salen de esta matriz, no
    // son una edición de la EDT -- no sube su revisión, para no provocar un
    // falso conflicto en la pestaña de WBS Builder.
    window.GPI.writeModule("wbs", updated, { projectId: loadedProjectId, derived: true });
  }
}

// ---------- RENDER ----------
function render(): void {
  renderBanner();
  renderTable();
  renderGauge();
  renderHard();
  renderSoft();
  renderStats();
  renderWorkload();
  renderLegend();
  (document.getElementById("modeFlag") as HTMLElement).textContent = mode === "live" ? "🔗 Vinculado a WBS/OBS" : "🧪 Ejemplo independiente";
  (document.getElementById("modeFlag") as HTMLElement).className = "mode-flag " + mode;
}

function renderBanner(): void {
  const b = document.getElementById("banner") as HTMLElement;
  if (mode === "sample" && window.GPI && window.GPI.available && window.GPI.available() && window.GPI.active && window.GPI.active()) {
    b.className = "banner show";
    b.innerHTML = "<b>Estás viendo la matriz de ejemplo</b>, independiente del proyecto activo. El proyecto activo aún no tiene paquetes de trabajo (WBS) y roles (OBS) cargados, o no se pudieron leer. Completa esas dos herramientas y luego usa <b>↻ Actualizar filas/columnas</b> para vincular la matriz real.";
  } else {
    b.className = "banner";
  }
}

interface RowIssue { msg: string; multiR?: boolean; }

function renderTable(): void {
  const host = document.getElementById("tableHost") as HTMLElement;
  if (!rows.length || !cols.length) {
    host.innerHTML = '<div class="empty-hint" style="padding:30px; color:var(--ink-2); font-size:13px;">No hay paquetes de trabajo o roles para mostrar. Carga el ejemplo o completa WBS Builder y Equipo del Proyecto.</div>';
    return;
  }
  const rIssues = rowIssues();
  let html = '<table class="raci-table"><thead><tr><th class="corner">Paquete de trabajo (EDT)</th>';
  cols.forEach((c) => {
    const hex = OBS_TYPE_HEX[c.type] || "#8992a3";
    const label = (c.person && c.person.trim()) || c.role;
    html += `<th class="col-head" title="${escapeAttr(c.role)}${c.person ? ' — ' + escapeAttr(c.person) : ''}">
      <div class="cwrap"><span class="ctype-dot" style="background:${hex}"></span><span class="ccode">${escapeHtml(c.code)}</span> ${escapeHtml(label)}</div>
    </th>`;
  });
  html += "</tr></thead><tbody>";
  rows.forEach((r) => {
    const issue = rIssues[r.id];
    html += `<tr class="${issue ? 'row-warn' : ''}${issue && issue.multiR ? ' row-multi-r' : ''}" data-row="${r.id}">
      <td class="row-head"><span class="row-code">${escapeHtml(r.code)}</span><span class="row-name">${escapeHtml(r.name)}</span>${issue ? `<span class="row-warn-icon" title="${escapeAttr(issue.msg)}">⚠</span>` : ""}</td>`;
    cols.forEach((c) => {
      const v = cellValue(r.id, c.id);
      const def = RACI_DEFS.find((d) => d.key === v);
      html += `<td class="cell${v ? "" : " empty"}" data-row="${r.id}" data-col="${c.id}" title="${def ? escapeAttr(def.label) : "Sin asignar — clic para asignar"}">
        <span class="badge ${v}">${v}</span>
      </td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  host.innerHTML = html;

  host.querySelectorAll("td.cell").forEach((td) => {
    td.addEventListener("click", () => {
      const rowId = (td as HTMLElement).dataset.row as string, colId = (td as HTMLElement).dataset.col as string;
      const cur = cellValue(rowId, colId);
      let next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      let ruleNote = "";
      // Regla del curso: SOLO un Responsable (R) por paquete de trabajo.
      // Si la fila ya tiene una R en otra columna, el ciclo la omite y salta
      // al siguiente valor; las filas que llegan con varias R (ejemplo o
      // importación) se pintan en rojo tenue hasta que quede una sola.
      if (next === "R") {
        const cell = assignments[rowId] || {};
        const hasOtherR = Object.keys(cell).some((cid) => cid !== colId && cell[cid] === "R");
        if (hasOtherR) {
          next = CYCLE[(CYCLE.indexOf("R") + 1) % CYCLE.length];
          ruleNote = " · regla 1R: este paquete ya tiene un Responsable, la R se omitió";
        }
      }
      setCellValue(rowId, colId, next);
      syncToGpi();
      render();
      const syncNote = mode === "live" ? " · sincronizado con el WBS" : "";
      setStatus(`${rowLabel(rowId)} × ${colLabel(colId)} → ${next || "sin asignar"}${ruleNote}${syncNote}`);
    });
  });
}

function rowLabel(id: string): string { const r = rows.find((x) => x.id === id); return r ? `${r.code} ${r.name}` : id; }
function colLabel(id: string): string { const c = cols.find((x) => x.id === id); return c ? ((c.person && c.person.trim()) || c.role) : id; }

function rowIssues(): Record<string, RowIssue> {
  const out: Record<string, RowIssue> = {};
  rows.forEach((r) => {
    const cell = assignments[r.id] || {};
    let rCount = 0, aCount = 0;
    Object.keys(cell).forEach((cid) => { if (cell[cid] === "R") rCount++; if (cell[cid] === "A") aCount++; });
    if (rCount === 0 && aCount === 0) out[r.id] = { msg: "Sin ninguna asignación" };
    else if (rCount === 0) out[r.id] = { msg: "Sin Responsable (R)" };
    else if (rCount > 1) out[r.id] = { msg: "Más de un Responsable (R): la regla es un solo R por paquete de trabajo — deja solo uno", multiR: true };
    else if (aCount === 0) out[r.id] = { msg: "Sin Aprobador (A)" };
    else if (aCount > 1) out[r.id] = { msg: "Más de un Aprobador (A)" };
  });
  return out;
}

function renderStats(): void {
  const total = rows.length;
  const issues = rowIssues();
  const clean = total - Object.keys(issues).length;
  let totalCells = 0;
  rows.forEach((r) => { const cell = assignments[r.id] || {}; totalCells += Object.keys(cell).length; });
  (document.getElementById("statGrid") as HTMLElement).innerHTML = `
    <div class="stat"><div class="v">${total}</div><div class="l">Paquetes de trabajo</div></div>
    <div class="stat"><div class="v">${cols.length}</div><div class="l">Roles (columnas)</div></div>
    <div class="stat"><div class="v">${clean}/${total}</div><div class="l">Filas sin observaciones</div></div>
    <div class="stat"><div class="v">${totalCells}</div><div class="l">Celdas asignadas</div></div>
  `;
}

// GPI.util.raciAudit pide WbsLeafRow[]/ObsNodeRow[] completos (con
// "resource"/"email"); este módulo no los necesita para su propio render,
// así que se agregan vacíos solo en la frontera con esa función.
function currentAudit(): GpiCore.RaciAuditResult | null {
  if (typeof window.GPI === "undefined" || !window.GPI.util) return null;
  const leaves = rows.map((r) => ({ ...r, resource: "" }));
  const obsCols = cols.map((c) => ({ ...c, email: "" }));
  return window.GPI.util.raciAudit(leaves, obsCols, assignments);
}

const STATE_META: Record<string, { label: string; color: string; sub: string }> = {
  rojo: { label: "🔴 RECHAZADO", color: "#ff5470", sub: "Restricción crítica incumplida — matriz bloqueada." },
  ambar: { label: "🟡 OBSERVADO", color: "#b56b00", sub: "Aprobación condicionada — hay optimizaciones pendientes." },
  verde: { label: "🟢 CERTIFICADO", color: "#00967f", sub: "Línea base lista para distribuirse como estándar." },
  vacio: { label: "— Sin datos —", color: "#8992a3", sub: "Carga paquetes de trabajo y roles para evaluar." }
};

function renderGauge(): void {
  const box = document.getElementById("gaugeBox") as HTMLElement;
  const audit = currentAudit();
  if (!audit || audit.state === "vacio") {
    box.innerHTML = '<div class="empty-hint" style="font-size:12px; color:var(--ink-2); padding:6px 0 14px;">Carga el ejemplo o vincula el WBS/OBS del proyecto para evaluar la gobernanza de la matriz.</div>';
    return;
  }
  const score = audit.score as number;
  const meta = STATE_META[audit.state];
  const cx = 110, cy = 112, r = 92, sw = 16;
  function polar(radius: number, angleDeg: number): { x: number; y: number } { const rad = (angleDeg - 180) * Math.PI / 180; return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }; }
  function arc(radius: number, a0: number, a1: number): string { const s = polar(radius, a1), e = polar(radius, a0); const large = (a1 - a0) > 180 ? 1 : 0; return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 0 ${e.x} ${e.y}`; }
  const bands = [
    { a0: 0, a1: 0.84 * 180, color: "#ff5470" },
    { a0: 0.84 * 180, a1: 0.94 * 180, color: "#ff9f1c" },
    { a0: 0.94 * 180, a1: 180, color: "#00c2a8" }
  ];
  const bandPaths = bands.map((b) => `<path d="${arc(r, b.a0, b.a1)}" stroke="${b.color}" stroke-width="${sw}" fill="none" opacity="0.9"/>`).join("");
  const needleAngle = (score / 100) * 180;
  const tip = polar(r - sw / 2 - 8, needleAngle);
  const zeroPt = polar(r + 10, 0), hundredPt = polar(r + 10, 180);
  box.innerHTML = `
    <div class="gauge-wrap">
      <svg viewBox="0 0 220 128" width="100%" style="overflow:visible;">
        ${bandPaths}
        <text x="${zeroPt.x}" y="${zeroPt.y + 4}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink-2)">0</text>
        <text x="${hundredPt.x}" y="${hundredPt.y + 4}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink-2)">100</text>
        <line x1="${cx}" y1="${cy}" x2="${tip.x}" y2="${tip.y}" stroke="var(--ink-0)" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink-0)"/>
        <text x="${cx}" y="${cy - 16}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-weight="800" font-size="26" fill="${meta.color}">${score}%</text>
      </svg>
      <div class="gauge-state" style="color:${meta.color}">${meta.label}</div>
      <div class="gauge-sub">${meta.sub}</div>
    </div>`;
}

function renderHard(): void {
  const box = document.getElementById("hardBox") as HTMLElement;
  const audit = currentAudit();
  if (!audit || audit.state === "vacio") { box.innerHTML = ""; return; }
  const defs = [
    { k: "HR-01", label: "Actividades sin ninguna asignación", items: audit.hard.HR01 },
    { k: "HR-02", label: "Sin Aprobador (A = 0)", items: audit.hard.HR02 },
    { k: "HR-03", label: "Doble Aprobador (A > 1)", items: audit.hard.HR03 },
    { k: "HR-04", label: "Sin Responsable (R = 0)", items: audit.hard.HR04 }
  ];
  box.innerHTML = defs.map((d) => {
    const ok = d.items.length === 0;
    return `<div class="hr-item ${ok ? "ok" : "fail"}">
        <span class="hr-icon">${ok ? "✓" : "✕"}</span>
        <div class="hr-text"><b>${d.k}.</b> ${d.label}${ok ? "" : ` <span class="hr-count">(${d.items.length})</span>`}</div>
      </div>
      ${!ok ? `<ul class="hr-rows">${d.items.slice(0, 5).map((l) => `<li>${escapeHtml(l.code + " " + l.name)}</li>`).join("")}${d.items.length > 5 ? `<li class="muted">…y ${d.items.length - 5} más</li>` : ""}</ul>` : ""}`;
  }).join("");
}

// Empaqueta un ítem+formatter con su propio tipo T detrás de una interfaz
// homogénea (fmt: (x: unknown) => string) para poder guardar entradas de
// forma heterogénea (WbsLeafRow, ObsNodeRow) en un único arreglo `defs`.
function softDef<T>(k: string, label: string, items: T[], fmt: (x: T) => string): { k: string; label: string; items: T[]; fmt: (x: unknown) => string } {
  return { k, label, items, fmt: fmt as (x: unknown) => string };
}
function renderSoft(): void {
  const box = document.getElementById("softBox") as HTMLElement;
  const audit = currentAudit();
  if (!audit || audit.state === "vacio") { box.innerHTML = ""; return; }
  const defs = [
    softDef("SR-01", "Más de un Responsable sin justificar en las notas del WBS", audit.soft.SR01, (l) => l.code + " " + l.name),
    softDef("SR-02", "Más de 3 Consultados (posible cuello de botella)", audit.soft.SR02, (l) => l.code + " " + l.name),
    softDef("SR-03", "Rol sin ninguna R ni A en toda la matriz (rol fantasma)", audit.soft.SR03, (c) => (c.person && c.person.trim()) || c.role)
  ];
  box.innerHTML = defs.map((d) => {
    const ok = d.items.length === 0;
    return `<div class="hr-item ${ok ? "ok" : "warn"}">
        <span class="hr-icon">${ok ? "✓" : "!"}</span>
        <div class="hr-text"><b>${d.k}.</b> ${d.label}${ok ? "" : ` <span class="hr-count">(${d.items.length})</span>`}</div>
      </div>
      ${!ok ? `<ul class="hr-rows">${d.items.slice(0, 5).map((x) => `<li>${escapeHtml(d.fmt(x))}</li>`).join("")}${d.items.length > 5 ? `<li class="muted">…y ${d.items.length - 5} más</li>` : ""}</ul>` : ""}`;
  }).join("") + (audit.leavesTotal ? `<div class="empty-hint" style="font-size:11px; margin-top:6px;">Cumplimiento de optimización: <b>${audit.srCompliance}%</b> (umbral para Verde: 75%)</div>` : "");
}

function renderWorkload(): void {
  const counts: Record<string, Record<string, number>> = {};
  cols.forEach((c) => { counts[c.id] = { R: 0, A: 0, C: 0, I: 0 }; });
  rows.forEach((r) => {
    const cell = assignments[r.id] || {};
    Object.keys(cell).forEach((cid) => { if (counts[cid]) counts[cid][cell[cid]]++; });
  });
  const withLoad = cols.map((c) => ({ c, total: counts[c.id].R + counts[c.id].A + counts[c.id].C + counts[c.id].I, counts: counts[c.id] }))
    .filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  const box = document.getElementById("workloadBox") as HTMLElement;
  if (!withLoad.length) { box.innerHTML = '<div class="empty-hint" style="font-size:12px;color:var(--ink-2);">Aún no hay asignaciones.</div>'; return; }
  const max = Math.max(...withLoad.map((x) => x.total));
  box.innerHTML = withLoad.map((x) => {
    const label = (x.c.person && x.c.person.trim()) || x.c.role;
    const segs = RACI_DEFS.map((d) => x.counts[d.key] > 0 ? `<span class="bar-seg" style="background:${d.hex}; width:${(x.counts[d.key] / max * 100)}%"></span>` : "").join("");
    return `<div class="bar-row"><span class="nm" title="${escapeAttr(label)}">${escapeHtml(label)}</span><span class="bar-track">${segs}</span><span class="n">${x.total}</span></div>`;
  }).join("");
}

function renderLegend(): void {
  (document.getElementById("legendBox") as HTMLElement).innerHTML = RACI_DEFS.map((d) =>
    `<div class="legend-item"><span class="legend-badge" style="background:${d.hex}">${d.key}</span><span><b>${d.label}</b>${d.desc}</span></div>`
  ).join("")
    + '<div class="legend-item"><span class="legend-badge" style="background:var(--danger)">1R</span><span><b>Regla 1R</b> — al hacer clic, la matriz omite una segunda R en el mismo paquete; si una fila llega con varias R (ejemplo o archivo importado) se pinta en rojo tenue hasta dejar una sola.</span></div>';
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
function showConfirm(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Confirmar acción", message, confirmText: "Continuar", cancelText: "Cancelar", danger: true }); }
function showAlert(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Aviso", message, confirmText: "Entendido", cancelText: null, danger: false }); }

function exportCsv(): void {
  const header = ["Código", "Paquete de trabajo"].concat(cols.map((c) => (c.person && c.person.trim()) || c.role));
  const lines: string[][] = [header];
  rows.forEach((r) => {
    const line = [r.code, r.name].concat(cols.map((c) => cellValue(r.id, c.id)));
    lines.push(line);
  });
  const csv = lines.map((row) => row.map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "matriz_raci.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("Matriz RACI exportada como CSV.");
}

// ---------- INIT / EVENTS ----------
function init(): void {
  if (!tryLoadLive()) loadSample();
  render();

  document.getElementById("btnRefresh")!.addEventListener("click", () => {
    const ok = tryLoadLive();
    if (!ok) { showAlert("El proyecto activo aún no tiene paquetes de trabajo (WBS) y roles (OBS) suficientes para vincular la matriz. Complétalos primero en WBS Builder y Equipo del Proyecto."); return; }
    render();
    setStatus("Filas y columnas actualizadas desde el proyecto activo.");
  });
  document.getElementById("btnClear")!.addEventListener("click", async () => {
    const ok = await showConfirm("¿Borrar todas las asignaciones R/A/C/I de la matriz actual? La estructura de filas y columnas no se modifica.", "Limpiar asignaciones");
    if (ok) { assignments = {}; syncToGpi(); render(); setStatus("Asignaciones borradas."); }
  });
  document.getElementById("btnExportCsv")!.addEventListener("click", exportCsv);
  document.getElementById("btnPrint")!.addEventListener("click", () => window.print());
  document.getElementById("btnSample")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto reemplazará la matriz actual por el ejemplo DISTRIB+ S.A. (independiente del proyecto activo). El ejemplo trae errores deliberados para practicar con el Velocímetro de Gobernanza. ¿Continuar?", "Cargar ejemplo");
    if (ok) { loadSample(); render(); }
  });
  // «Cargar ejemplo en el proyecto» (auditoría, media): el ejemplo de arriba es INDEPENDIENTE y trae errores deliberados; con un proyecto conectado no había una matriz de
  // ejemplo bien armada que cargar. Esta escribe la del caso (shared/raci-sample.ts) sobre las filas y columnas REALES: paquetes por Código EDT y puestos por nombre.
  document.getElementById("btnLoadSampleLive")!.addEventListener("click", async () => {
    if (mode !== "live" && !tryLoadLive()) { await showAlert("El proyecto activo aún no tiene paquetes de trabajo (WBS) y puestos (OBS) suficientes. Carga primero el ejemplo en WBS Builder y en Equipo del Proyecto (OBS) y vuelve aquí.", "Cargar ejemplo en el proyecto"); return; }
    const built = buildLiveRaci(rows, cols);
    if (!Object.keys(built.assignments).length) { await showAlert("Ningún paquete ni puesto del proyecto coincide con los del ejemplo (Código EDT y nombre del puesto). Carga el mismo ejemplo en WBS Builder y en Equipo del Proyecto.", "Cargar ejemplo en el proyecto"); return; }
    const ok = await showConfirm("Se reemplazarán las asignaciones R/A/C/I del proyecto por el ejemplo DISTRIB+ bien armado (un R y un A por paquete)." + (built.unresolved.length ? " No se pudieron ubicar: " + built.unresolved.slice(0, 6).join(", ") + (built.unresolved.length > 6 ? "…" : "") + "." : "") + " ¿Continuar?", "Cargar ejemplo en el proyecto");
    if (ok) { assignments = built.assignments; syncToGpi(); render(); setStatus("Matriz de ejemplo DISTRIB+ cargada en el proyecto (" + Object.keys(built.assignments).length + " paquetes)."); }
  });
  document.getElementById("btnReset")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto borrará las asignaciones actuales y volverá a intentar vincular con el proyecto activo (o quedará vacía si no hay uno). ¿Continuar?", "Nueva matriz");
    if (ok) { assignments = {}; if (!tryLoadLive()) { rows = []; cols = []; mode = "sample"; } syncToGpi(); render(); }
  });
}
document.addEventListener("DOMContentLoaded", init);

// ===== Puente con el Panel de Control (GPI) =====
document.addEventListener("DOMContentLoaded", function gpiBridge() {
  if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
  const GPI = window.GPI;
  const titleEl = document.getElementById("projectTitle") as HTMLInputElement;
  const courseEl = document.getElementById("courseTitle") as HTMLInputElement;
  function pull(): void {
    const p = GPI.active(); if (!p) return;
    if (p.meta) { if (p.meta.name) titleEl.value = p.meta.name; if (p.meta.course) courseEl.value = p.meta.course; }
    if (tryLoadLive()) { render(); setStatus("Matriz vinculada al proyecto activo."); }
    else { render(); }
  }
  const proj = GPI.active();
  if (proj) pull();
  window.addEventListener("beforeunload", () => { syncToGpi({ meta: true }); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) syncToGpi({ meta: true }); });
  // Si el WBS o el OBS cambian en otra pestaña (p. ej. se agrega un puesto o
  // un paquete nuevo), refresca filas/columnas sin perder las asignaciones ya hechas.
  if (GPI.onChange) GPI.onChange(() => {
    if (mode === "live" && loadedProjectId != null && GPI.activeId() !== loadedProjectId) { markProjectStale(); return; }
    if (!document.hidden) { tryLoadLive(); render(); }
  });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", () => {
    if (mode !== "live") { showAlert('Estás en modo ejemplo (independiente). Usa "↻ Actualizar filas/columnas" para vincular la matriz al WBS y OBS reales del proyecto activo antes de sincronizar.'); return false; }
    syncToGpi({ meta: true });
    return true;
  });
});

function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  installGpiBadge({ name, restoreMs: 1800, onSync: () => (pushFn() === false ? null : "✓ Sincronizado — WBS actualizado") });
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
  const head = '<tr><th style="width:7%">Código</th><th>Paquete de trabajo</th>'
    + cols.map((c) => '<th class="num" style="text-align:center" title="' + escapeHtml(c.role) + '">' + escapeHtml(c.code || c.role) + '</th>').join("") + '</tr>';
  const bodyRows = rows.map((r) => {
    return '<tr><td class="num">' + escapeHtml(r.code || "—") + '</td><td>' + escapeHtml(r.name) + '</td>'
      + cols.map((c) => {
        const v = (assignments[r.id] || {})[c.id] || "";
        return '<td class="num" style="text-align:center;font-weight:700">' + escapeHtml(v) + '</td>';
      }).join("") + '</tr>';
  }).join("") || '<tr><td colspan="' + (cols.length + 2) + '" class="rep-note">— Sin paquetes de trabajo —</td></tr>';
  let body = (mode === "sample" ? '<p class="rep-note"><b>Modo ejemplo:</b> esta matriz usa los datos didácticos independientes, no la EDT/OBS del proyecto activo.</p>' : '')
    + '<h2>1. Matriz de asignación de responsabilidades (EDT × OBS)</h2>'
    + '<table>' + head + bodyRows + '</table>'
    + '<p class="rep-note"><b>Leyenda:</b> R = Responsable (ejecuta el trabajo) · A = Aprobador (rinde cuentas, uno por fila) · C = Consultado · I = Informado.<br><b>Roles:</b> '
    + (cols.map((c) => "<b>" + escapeHtml(c.code || "?") + "</b> " + escapeHtml(c.role) + (c.person ? " (" + escapeHtml(c.person) + ")" : "")).join(" · ") || "—") + '</p>';
  const a = currentAudit();
  if (a && a.state !== "vacio") {
    const stMap: Record<string, string> = { verde: "VERDE — matriz aprobada", ambar: "ÁMBAR — aprobada con observaciones", rojo: "ROJO — bloqueada por restricciones duras" };
    body += '<h2>2. Auditoría de gobernanza RACI</h2><table class="rep-kv">'
      + '<tr><td>Resultado</td><td><b>' + (a.score == null ? "—" : a.score + " / 100") + '</b> · ' + (stMap[a.state] || a.state) + '</td></tr>'
      + '<tr><td>Restricciones duras (HR)</td><td>HR-01 paquetes sin asignación: <b>' + a.hard.HR01.length + '</b> · HR-02 sin Aprobador: <b>' + a.hard.HR02.length + '</b> · HR-03 con más de un A: <b>' + a.hard.HR03.length + '</b> · HR-04 sin Responsable: <b>' + a.hard.HR04.length + '</b></td></tr>'
      + '<tr><td>Recomendaciones (SR)</td><td>SR-01 múltiples R sin justificación en la EDT: <b>' + a.soft.SR01.length + '</b> · SR-02 más de 3 Consultados: <b>' + a.soft.SR02.length + '</b> · SR-03 roles sin R/A en toda la matriz: <b>' + a.soft.SR03.length + '</b></td></tr>'
      + '<tr><td>Cumplimiento de recomendaciones</td><td>' + a.srCompliance + '%</td></tr></table>'
      + '<p class="rep-note">Modelo de bloqueo duro: una sola restricción dura (HR) deja la matriz en 0% / Rojo, sin promediar con el resto.</p>';
  } else if (!a) {
    body += '<p class="rep-note">Auditoría no disponible: este archivo se abrió sin gpi-core.js.</p>';
  }
  reportShell("Matriz RACI del Proyecto", "RACI Matrix · EDT × OBS", body);
}

(function () {
  const b = document.getElementById("btnReport");
  if (b) b.addEventListener("click", buildReport);
})();
