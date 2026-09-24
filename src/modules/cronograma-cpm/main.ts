/* =========================================================
   Cronograma / CPM — Red del proyecto y Ruta Crítica
   Port mecánico del <script> inline de Cronograma_CPM.html (Fase 4 de
   MIGRATION.md): misma lógica, mismo comportamiento. Se agregan tipos y
   se compila a cronograma-cpm.js (IIFE) para que el HTML lo cargue como
   <script src="cronograma-cpm.js"> en vez de tenerlo inline.

   Mismo patrón que los módulos anteriores: addEventListener
   exclusivamente, IIFE propio -- no hace falta exponer nada en window.
   Particularidad: el original captura `var GPI = window.GPI;` como
   variable de módulo (no usa `window.GPI` en cada llamada, a diferencia
   de OBS/WBS/PERT) y la reasigna dentro de init(). Se preserva ese mismo
   patrón aquí con una variable de módulo `GPI`.

   A diferencia de los otros 12 módulos, este SÍ depende duro de
   gpi-core.js incluso para su lógica local (no solo para sincronizar con
   el Panel): el cálculo CPM vive únicamente en GPI.util.cpm, sin una
   copia local. Si gpi-core.js no carga, la herramienta queda inoperante
   más allá del cableado de botones — comportamiento preexistente, no
   introducido por este port.
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { CpmNode, CpmResult, ProjectCalendar, ScheduleValidateResult } from "../../core/gpi-core";
import type { ActivitiesModule, EditSession, MilestoneItem, PertModule, SchedulePlanModule, ScheduleLagUnit, ScheduleLinkType, WbsModule } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { probWithin, simulatePertNetwork, type PertSimResult, type SimAct } from "../../shared/pert-network";
import { buildEvmReference } from "../../shared/evm-reference";
import type { EvmReference } from "../../shared/schedule-control";
import type { CpmFn, NetLink } from "../../shared/schedule-risk";
import {
  compareBaseline, deviationPct, makeSnapshot, needsSponsor, nextVersion, normalizeBaseline, planOf, scheduleHealth,
  type CtlLink, type CtlNode, type CtlPlan, type ScheduleBaselineData
} from "../../shared/schedule-control";

type GpiApi = typeof GpiCore.GPI;
// Tipado mínimo de la API de JSZip que este módulo usa (librería externa
// vía CDN, ver el <script> en el HTML) -- tanto para ESCRIBIR (exportar)
// como para LEER (importar el archivo completado). Copia literal de la
// misma interfaz que ya usan activities/cost-estimate/wbs/panel-control:
// declare global fusiona la propiedad Window.JSZip de los cuatro archivos
// en una sola pasada de tsc, así que una interfaz distinta en cualquiera
// de ellos (por chica que sea la diferencia) rompe la fusión con un error
// de tipos -- ver ARCHITECTURE.md.
interface JSZipFileEntry { async(type: "string"): Promise<string>; }
interface JSZipInstance {
  file(name: string, content: string): void;
  file(name: string): JSZipFileEntry | null;
  generateAsync(opts: { type: "blob"; mimeType: string }): Promise<Blob>;
}
interface JSZipCtor { new (): JSZipInstance; loadAsync(data: ArrayBuffer): Promise<JSZipInstance>; }
declare global { interface Window { GPI?: GpiApi; JSZip?: JSZipCtor; } }

// ============================ ESTADO ============================
// El módulo LEE actividades (module "activities"), EDT (module "wbs") y
// PERT (module "pert") en vivo desde gpi-core, y GUARDA solo su rebanada
// "schedule" (enlaces + auditoría). Nada derivado (ES/EF/…) se persiste.
interface Link { id: string; from: string; to: string; type: ScheduleLinkType; lag: number; lagUnit: ScheduleLagUnit; source: "manual" | "import"; }
interface ImportInfo { at: number; tool: string; rowMap: Record<number, string>; dates: Record<string, { start: string; finish: string }>; }
interface ScheduleState { links: Link[]; linkCounter: number; import: ImportInfo | null; baseline: unknown | null; }

let mode: "live" | "sample" = "live";
let stateLive: ScheduleState = { links: [], linkCounter: 1, import: null, baseline: null };
let stateSample: ScheduleState | null = null;
let wbsLive: WbsModule | null = null, actsLive: ActivitiesModule | null = null, pertLive: PertModule | null = null, spLive: SchedulePlanModule | null = null;
let durMode: "det" | "pert" = "det";
// Id. del proyecto activo cuando esta pestaña cargó sus datos -- se
// compara contra GPI.activeId() antes de cada guardado (ver gpiPush())
// para nunca escribir el cronograma de este proyecto sobre uno distinto
// que se haya activado desde otra pestaña mientras esta seguía abierta
// (bug real reportado por el usuario, confirmado sistémico en los 13
// módulos de herramienta -- este es el de mayor exposición: commit()
// llama gpiPush() en cada edición, no solo al salir).
let loadedProjectId: string | null = null;
let session: EditSession | null = null; // versión del cronograma que esta pestaña cargó (GPI.openSession)
let projectStale = false;

function state(): ScheduleState { return (mode === "sample" ? stateSample : stateLive) as ScheduleState; }
function wbsData(): WbsModule | null { return mode === "sample" ? SAMPLE.wbs : wbsLive; }
function actsData(): ActivitiesModule { return mode === "sample" ? SAMPLE.acts : (actsLive || { byLeaf: {}, idCounter: 1 }); }
function pertData(): PertModule | null { return mode === "sample" ? SAMPLE.pert : pertLive; }
function calData(): ProjectCalendar { return mode === "sample" ? SAMPLE.cal : GPI!.util.projectCalendar(spLive); }
function metaStart(): string {
  if (mode === "sample") return SAMPLE.startDate;
  try { const m = window.GPI && window.GPI.meta && window.GPI.meta(); return (m && m.startDate) || ""; } catch (_) { return ""; }
}
function metaName(): string {
  try { const m = window.GPI && window.GPI.meta && window.GPI.meta(); if (m && m.name) return m.name; } catch (_) { /* noop */ }
  return (document.getElementById("projectTitle") as HTMLInputElement).value || "Proyecto";
}

let GPI: GpiApi | undefined = window.GPI; // puede ser undefined en file:// sin core; se re-chequea en init

// ============================ HELPERS ============================
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function setStatus(m: string): void { (document.getElementById("statusLeft") as HTMLElement).textContent = m; }
function nz(x: unknown): boolean { return x != null && String(x).trim() !== ""; }
function fmt(n: number | null | undefined): string { if (n == null || (n as unknown) === "") return "—"; const r = Math.round(n * 100) / 100; return (Math.abs(r - Math.round(r)) < 1e-9) ? String(Math.round(r)) : String(r); }

// ---------- modal (los diálogos nativos se bloquean en iframes) ----------
interface ShowModalOpts {
  title?: string; message?: string; html?: string; confirmText?: string | null; cancelText?: string | null; danger?: boolean;
  wide?: boolean; afterOpen?: (card: HTMLElement) => void; collect?: () => unknown;
}
function showModalHTML(opts: ShowModalOpts): Promise<any> {
  return new Promise((resolve) => {
    const ov = document.getElementById("modalOverlay") as HTMLElement;
    const card = ov.querySelector(".modal-card") as HTMLElement;
    card.className = "modal-card" + (opts.wide ? " wide" : "");
    (document.getElementById("modalTitle") as HTMLElement).textContent = opts.title || "";
    const msg = document.getElementById("modalMsg") as HTMLElement;
    if (opts.html !== undefined) { msg.innerHTML = opts.html; } else { msg.textContent = opts.message || ""; }
    const ok = document.getElementById("modalOk") as HTMLButtonElement, cancel = document.getElementById("modalCancel") as HTMLButtonElement;
    ok.textContent = opts.confirmText || "Aceptar";
    ok.className = "btn " + (opts.danger ? "danger" : "primary");
    ok.style.display = opts.confirmText === null ? "none" : "";
    cancel.style.display = opts.cancelText === null ? "none" : "";
    cancel.textContent = opts.cancelText || "Cancelar";
    function done(v: unknown) { ov.classList.remove("open"); ok.onclick = cancel.onclick = null; ov.onclick = null; document.removeEventListener("keydown", key); resolve(v); }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { done(false); return; }
      if (e.key !== "Tab") return;
      // Trap de foco: Tab no debe escapar del modal hacia el fondo de la página.
      const f = Array.from(card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    ok.onclick = () => { if (opts.collect) resolve(opts.collect()); else done(true); if (opts.collect) { ov.classList.remove("open"); document.removeEventListener("keydown", key); } };
    cancel.onclick = () => { done(false); };
    ov.onclick = (e) => { if (e.target === ov) done(false); };
    document.addEventListener("keydown", key);
    ov.classList.add("open");
    if (opts.afterOpen) opts.afterOpen(card);
    else ok.focus();
  });
}
function showConfirm(message: string, title?: string): Promise<boolean> { return showModalHTML({ title: title || "Confirmar acción", message, confirmText: "Continuar", cancelText: "Cancelar" }); }
function showAlert(message: string, title?: string): Promise<boolean> { return showModalHTML({ title: title || "Aviso", message, confirmText: "Entendido", cancelText: null }); }

// ---------- EDT en orden jerárquico (igual que WBS Builder / Actividades) ----------
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

interface PertIdxEntry { dur: number | null; te: number | null; variance: number | null; valid: boolean; o: number | null; m: number | null; p: number | null; }
// Índice PERT por actividad: {dur (determinística), te, variance}
function pertIndex(): Record<string, PertIdxEntry> {
  const idx: Record<string, PertIdxEntry> = {};
  try {
    const st = GPI!.util.pertStats(pertData(), actsData(), wbsData());
    (st.rows || []).forEach((r) => { idx[r.id] = { dur: r.dur, te: r.te, variance: r.variance, valid: r.valid, o: r.o, m: r.m, p: r.p }; });
  } catch (_) { /* noop */ }
  return idx;
}

interface Row {
  netId: number; kind: "project" | "summary" | "activity"; subkind?: "phase" | "package";
  code: string; name: string; depth?: number; activityId: string | null; leafId?: string;
  det?: number | null; te?: number | null; variance?: number | null; pertValid?: boolean;
  po?: number | null; pm?: number | null; pp?: number | null;   // terna O–M–P en días (para simular la red completa)
  isMilestone?: boolean;
}

// Mismo criterio que placeLooseMilestones() en activities/main.ts y
// cost-estimate/main.ts (copia local deliberada, no compartida -- cada
// módulo funciona sin depender de otro): un hito atado a un paquete
// (leafId) se resuelve directo en fullRowsSnapshot(); uno suelto se
// posiciona vía afterLeafId (null/vacío = al principio de todo, el id de
// un paquete existente = justo después de ese paquete, colgante = al
// final como huérfano en vez de perderse).
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

// Snapshot de filas estilo MS Project (0=proyecto, luego fases/paquetes/
// actividades E HITOS) — la instantánea que consume GPI.util.buildScheduleLinks
// y la fuente del Id. (netId), consecutivo SIN SALTOS igual que el Task ID
// de MS Project (ver ARCHITECTURE.md, "El 'Id.' de Definir las
// Actividades..."). Este Id. coincide con el de Definir las Actividades y
// Estimar los Costos SIEMPRE, hitos incluidos -- los tres módulos leen la
// misma EDT/actividades/hitos y arman la numeración con el mismo criterio.
// Un hito entra como una fila MÁS con kind:"activity" (activityId = su
// propio id, det:0) -- así atraviesa gratis todo el camino que ya existe
// para actividades reales (CPM, Red, Gantt, plantilla, pegado, enlace
// manual): GPI.util.cpm() ya calcula ES=EF/LS=LF correctamente para
// dur=0 sin ningún caso especial. Solo Análisis PERT sigue sin ver
// hitos (fuera de alcance de este cambio).
function fullRowsSnapshot(): Row[] {
  const w = wbsData(), act = actsData(), idx = pertIndex(), out: Row[] = [];
  if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
  let n = 0; const rootName = ((w.nodes[w.rootId].name || "").trim()) || metaName() || "Proyecto";
  out.push({ netId: n++, kind: "project", code: "0", name: rootName, activityId: null });
  const tree = treeRows();
  const milestones = act.milestones || [];
  const knownLeafIds: Record<string, boolean> = {};
  tree.forEach((r) => { if (r.kind === "package") knownLeafIds[r.id] = true; });
  const loose = placeLooseMilestones(milestones, knownLeafIds);
  function pushMilestone(m: MilestoneItem, leafId?: string): void {
    out.push({ netId: n++, kind: "activity", code: m.code, name: m.name, activityId: m.id, leafId, det: 0, te: null, variance: null, pertValid: undefined, isMilestone: true });
  }
  loose.start.forEach((m) => pushMilestone(m));
  tree.forEach((r) => {
    if (r.kind === "phase") { out.push({ netId: n++, kind: "summary", subkind: "phase", code: r.code, name: r.name, depth: r.depth, activityId: null }); } else {
      out.push({ netId: n++, kind: "summary", subkind: "package", code: r.code, name: r.name, depth: r.depth, activityId: null });
      ((act.byLeaf || {})[r.id] || []).forEach((a, i) => {
        const info = idx[a.id] || ({} as Partial<PertIdxEntry>);
        out.push({ netId: n++, kind: "activity", code: r.code + "." + (i + 1), name: a.name || "", activityId: a.id, leafId: r.id, det: info.dur, te: info.te, variance: info.variance, pertValid: info.valid, po: info.o, pm: info.m, pp: info.p });
      });
      milestones.filter((m) => m.leafId === r.id).forEach((m) => pushMilestone(m, r.id));
      (loose.afterLeaf[r.id] || []).forEach((m) => pushMilestone(m));
    }
  });
  loose.orphan.forEach((m) => pushMilestone(m));
  return out;
}

interface ScheduleNode { id: string; dur: number; det?: number | null; te?: number | null; hasDur: boolean; }
// Nodos schedulables (solo actividades) con la duración según durMode.
function scheduleNodes(snapshot: Row[]): ScheduleNode[] {
  return snapshot.filter((r) => r.kind === "activity").map((r) => {
    const d = (durMode === "pert" && r.te != null) ? r.te : (r.det != null ? r.det : 0);
    return { id: r.activityId as string, dur: d, det: r.det, te: r.te, hasDur: (r.det != null || r.te != null) };
  });
}

// ============================ CPM + RENDER ============================
function netMap(snap: Row[]): Record<string, number> { const m: Record<string, number> = {}; snap.forEach((r) => { if (r.activityId) m[r.activityId] = r.netId; }); return m; }
function nameOf(snap: Row[]): Record<string, string> { const m: Record<string, string> = {}; snap.forEach((r) => { if (r.activityId) m[r.activityId] = r.name; }); return m; }
function codeOf(snap: Row[]): Record<string, string> { const m: Record<string, string> = {}; snap.forEach((r) => { if (r.activityId) m[r.activityId] = r.code; }); return m; }
function isMilestoneOf(snap: Row[]): Record<string, boolean> { const m: Record<string, boolean> = {}; snap.forEach((r) => { if (r.activityId && r.isMilestone) m[r.activityId] = true; }); return m; }

function unitTag(u: string): string { return u === "d" ? "d" : u === "ed" ? "ed" : u === "h" ? "h" : u === "w" ? "sem" : "d"; }
function linkToken(l: Link, nmap: Record<string, number>): string | null {
  const net = nmap[l.from]; if (net == null) return null;
  const t = l.type || "FS", lag = Number(l.lag) || 0; let s = String(net);
  if (t !== "FS" || lag !== 0) s += t;
  if (lag !== 0) s += (lag > 0 ? "+" : "-") + Math.abs(lag) + unitTag(l.lagUnit || "d");
  return s;
}
function incoming(id: string): Link[] { return (state().links || []).filter((l) => l.to === id); }

interface RunCpmResult { snap: Row[]; nodes: ScheduleNode[]; ids: string[]; links: Link[]; val: ScheduleValidateResult; cpm: CpmResult; noDur: ScheduleNode[]; }

// Ejecuta el cálculo: snapshot → nodos → validación → CPM.
function runCpm(): RunCpmResult {
  const snap = fullRowsSnapshot();
  const nodes = scheduleNodes(snap);
  const ids = nodes.map((n) => n.id);
  const links = (state().links || []).slice();
  const val = GPI!.util.scheduleValidate(ids, links);
  const validLinks = links.filter((l) => ids.indexOf(l.from) >= 0 && ids.indexOf(l.to) >= 0 && l.from !== l.to);
  const cpm = GPI!.util.cpm(nodes as CpmNode[], validLinks, calData(), { startDate: metaStart() });
  return { snap, nodes, ids, links, val, cpm, noDur: nodes.filter((n) => !n.hasDur) };
}

function render(): void {
  const chip = document.getElementById("modeChip") as HTMLElement;
  chip.textContent = mode === "sample" ? "MODO EJEMPLO" : "Proyecto";
  chip.className = "mode-chip " + (mode === "sample" ? "sample" : "live");
  (document.getElementById("btnSample") as HTMLElement).style.display = mode === "sample" ? "none" : "";
  (document.getElementById("btnLive") as HTMLElement).style.display = mode === "sample" ? "" : "none";
  (document.getElementById("btnReload") as HTMLButtonElement).disabled = mode === "sample";

  const R = runCpm();
  renderCycleBanner(R);
  renderTable(R);
  renderSidebar(R);
  renderValidation(R);
  renderCalNote();
  renderProbability(R);
  renderNet(R);
  renderGantt(R);
  renderControl(R);
  // botones de fuente de duración
  const dd = document.getElementById("durDet"), dp = document.getElementById("durPert");
  if (dd && dp) { dd.className = "dur-src" + (durMode === "det" ? " pert" : ""); dp.className = "dur-src" + (durMode === "pert" ? " pert" : ""); }
}

function renderCycleBanner(R: RunCpmResult): void {
  const b = document.getElementById("cycleBanner") as HTMLElement;
  if (!R.cpm.ok) {
    const codes = R.cpm.cycles.map((id) => codeOf(R.snap)[id] || id);
    b.innerHTML = "<b>La red tiene un ciclo</b> (dependencia circular) y no puede calcularse la ruta crítica. Actividades implicadas: " + esc(codes.join(", ")) + ". Revisa los enlaces con «＋ Enlace manual» o vuelve a pegar el cronograma.";
    b.classList.add("show");
  } else b.classList.remove("show");
}

function renderTable(R: RunCpmResult): void {
  const body = document.getElementById("cpmBody") as HTMLElement, empty = document.getElementById("emptyState") as HTMLElement;
  const snap = R.snap, cpm = R.cpm, nmap = netMap(snap);
  if (!snap.length || (!wbsData() || !wbsData()!.nodes)) {
    body.innerHTML = ""; empty.style.display = "block";
    empty.innerHTML = "<b>No hay una EDT con actividades para programar.</b><br>Crea la EDT y define actividades en los módulos de Alcance y Cronograma, o entra al <b>Modo ejemplo</b> para explorar el CPM con el caso DISTRIB+.<br><button class='btn violet' onclick=\"document.getElementById('btnSample').click()\">Ver modo ejemplo</button>";
    return;
  }
  empty.style.display = "none";
  const dates = (state().import && state().import!.dates) || {};
  let html = "";
  snap.forEach((r) => {
    if (r.kind === "project") {
      html += "<tr class='proj-row'><td class='n-cell'>0</td><td class='code-cell'>0</td><td colspan='10'>" + esc(r.name) + " · <span style='font-family:var(--mono);font-size:10px;color:var(--ink-2)'>PROYECTO (tarea resumen)</span></td></tr>";
    } else if (r.subkind === "phase") {
      html += "<tr class='phase-row'><td class='n-cell'>" + r.netId + "</td><td colspan='11'><span class='ph-code'>" + esc(r.code) + "</span>" + esc(r.name) + "</td></tr>";
    } else if (r.subkind === "package") {
      html += "<tr class='pkg-row'><td class='n-cell'>" + r.netId + "</td><td class='code-cell'>" + esc(r.code) + "</td><td colspan='10'><span class='pk-code'>■</span> <span class='pk-name'>" + esc(r.name) + "</span></td></tr>";
    } else {
      const row = cpm.ok ? cpm.rows[r.activityId as string] : null;
      const node = R.nodes.filter((n) => n.id === r.activityId)[0] || ({} as Partial<ScheduleNode>);
      const dur = (durMode === "pert" && r.te != null) ? r.te : r.det;
      const crit = !!(row && row.critical);
      const preds = incoming(r.activityId as string).map((l) => linkToken(l, nmap)).filter(Boolean).join("; ");
      // auditoría
      let au = "<span class='audit-na'>—</span>";
      const pd = dates[r.activityId as string];
      if (pd && row && (nz(pd.start) || nz(pd.finish))) {
        const okS = !nz(pd.start) || pd.start === row.startDate;
        const okF = !nz(pd.finish) || pd.finish === row.finishDate;
        au = (okS && okF) ? "<span class='audit-ok' title='Coincide con MS Project'>✓</span>"
          : "<span class='audit-bad' title='Calc: " + esc((row.startDate || "?") + " → " + (row.finishDate || "?")) + " · Pegado: " + esc((pd.start || "?") + " → " + (pd.finish || "?")) + " (revisa calendario o enlaces)'>✗</span>";
      }
      html += "<tr class='act-row" + (crit ? " crit" : "") + (r.isMilestone ? " milestone-row" : "") + "'>" +
        "<td class='n-cell'>" + r.netId + "</td>" +
        "<td class='code-cell" + (r.isMilestone ? " milestone-code" : "") + "'>" + (r.isMilestone ? "◆ " : "") + esc(r.code) + "</td>" +
        "<td class='act-name'>" + esc(r.name) + (crit ? " <span class='crit-badge'>CRÍTICA</span>" : "") + (r.isMilestone ? " <span class='milestone-tag'>Hito</span>" : (node.hasDur ? "" : " <span style='color:var(--warn);font-size:10px' title='La actividad no tiene metrado/rendimiento ni PERT: dur=0'>⚠ sin duración</span>")) + "</td>" +
        "<td class='num'" + (r.isMilestone ? " title='Los hitos tienen duración cero por definición'" : "") + ">" + (dur != null ? fmt(dur) : "—") + "</td>" +
        "<td class='num'>" + (row ? fmt(row.es) : "—") + "</td>" +
        "<td class='num'>" + (row ? fmt(row.ef) : "—") + "</td>" +
        "<td class='num'>" + (row ? fmt(row.ls) : "—") + "</td>" +
        "<td class='num'>" + (row ? fmt(row.lf) : "—") + "</td>" +
        "<td class='num" + (crit ? " tf-crit" : "") + "'>" + (row ? fmt(row.tf) : "—") + "</td>" +
        "<td class='num'>" + (row ? fmt(row.ff) : "—") + "</td>" +
        "<td class='l num' style='font-size:11px'>" + esc(preds || "—") + "</td>" +
        "<td>" + au + "</td>" +
        "</tr>";
    }
  });
  body.innerHTML = html;
}

// ============================ SIDEBAR ============================
function renderSidebar(R: RunCpmResult): void {
  const cpm = R.cpm;
  (document.getElementById("kpiDur") as HTMLElement).textContent = cpm.ok ? fmt(cpm.projectDuration) : "—";
  (document.getElementById("kpiCrit") as HTMLElement).textContent = cpm.ok ? String(cpm.criticalIds.length) : "—";
  (document.getElementById("kpiLinks") as HTMLElement).textContent = String((state().links || []).length);
  (document.getElementById("kpiFinish") as HTMLElement).textContent = (cpm.ok && cpm.projectFinishDate) ? cpm.projectFinishDate : "—";
}

function renderValidation(R: RunCpmResult): void {
  const box = document.getElementById("issues") as HTMLElement;
  const out: { c: string; ic: string; t: string }[] = [];
  const links = state().links || [], hasLinks = links.length > 0;
  if (!R.cpm.ok) out.push({ c: "err", ic: "✖", t: "<b>Ciclo en la red</b>: hay dependencias circulares. No se puede calcular el CPM." });
  if (R.val.dangling && R.val.dangling.length) out.push({ c: "warn", ic: "⚠", t: R.val.dangling.length + " enlace(s) apuntan a actividades inexistentes (ignorados en el cálculo)." });
  if (R.val.selfLoops && R.val.selfLoops.length) out.push({ c: "warn", ic: "⚠", t: R.val.selfLoops.length + " auto-enlace(s) (una actividad dependiendo de sí misma) — ignorados." });
  if (R.noDur.length) out.push({ c: "warn", ic: "⚠", t: R.noDur.length + " actividad(es) sin duración (metrado/rendimiento o PERT); se toman como 0 días." });
  if (hasLinks && R.cpm.ok) {
    const os = (R.val.openStart || []).length, oe = (R.val.openEnd || []).length;
    if (os > 1) out.push({ c: "warn", ic: "◁", t: os + " actividades sin predecesora (cuelgan del inicio). Verifica si falta algún enlace." });
    if (oe > 1) out.push({ c: "warn", ic: "▷", t: oe + " actividades sin sucesora (no llegan al fin). Verifica si falta algún enlace." });
  }
  if (R.cpm.ok && R.cpm.elapsedApprox) out.push({ c: "warn", ic: "⚠", t: "Hay desfases en <b>días transcurridos</b> y el proyecto no tiene fecha de inicio: se convierten con una proporción semanal <b>aproximada</b>. Define la fecha de inicio en el Panel para calcularlos sobre fechas reales (fines de semana y feriados)." });
  if (!hasLinks) out.push({ c: "warn", ic: "▤", t: "Aún no hay enlaces. Usa <b>⇧ Importar desde Excel</b> o <b>＋ Enlace manual</b> para construir la red." });
  else if (R.cpm.ok && !R.val.dangling.length && !R.val.selfLoops.length) out.push({ c: "ok", ic: "✓", t: "Red válida y acíclica — CPM calculado." });
  box.innerHTML = out.map((i) => "<div class='issue " + i.c + "'><span class='ic'>" + i.ic + "</span><span>" + i.t + "</span></div>").join("");
}

// Media y varianza de la RUTA crítica para la probabilidad de plazo PERT.
// Antes se sumaban TODAS las actividades críticas (aunque estuvieran en ramas
// paralelas) y se omitían los desfases: dos actividades paralelas de 10 d hacia
// un hito daban 20 d de media y ~0 % de terminar en 10 d. Ahora el CPM se
// recalcula con las duraciones ESPERADAS (TE) -- el modo "Duración" de la
// pantalla no cambia el resultado -- y solo se calcula si las críticas forman
// UNA cadena (GPI.util.pertCriticalChain); si no, `reason` dice por qué.
interface CriticalPertSums { mean: number; sumVar: number; allValid: boolean; count: number; reason?: "empty" | "parallel" | "inconsistent" | "elapsed"; sim?: PertSimResult | null; }
// Simulación Monte Carlo de la RED COMPLETA (shared/pert-network.ts) para las ramas paralelas/convergentes y como contraste de las casi
// críticas. Se guarda por huella de los datos: cambiar solo el plazo objetivo no la vuelve a correr.
let simKey = "", simVal: PertSimResult | null = null;
function simFor(acts: SimAct[], links: Link[], cal: unknown): PertSimResult | null {
  const key = JSON.stringify([acts, links.map((l) => [l.from, l.to, l.type, l.lag, l.lagUnit])]);
  if (key !== simKey) { simKey = key; try { simVal = simulatePertNetwork(acts, links as unknown as NetLink[], cal, GPI!.util.cpm as unknown as CpmFn); } catch (_) { simVal = null; } }
  return simVal;
}
function criticalPertSums(R: RunCpmResult): CriticalPertSums {
  if (!R.cpm.ok) return { mean: 0, sumVar: 0, allValid: false, count: 0, reason: "empty" };
  const idx: Record<string, Row> = {}; R.snap.forEach((r) => { if (r.kind === "activity") idx[r.activityId as string] = r; });
  const usable = (r: Row | undefined): boolean => !!r && r.te != null && r.variance != null && r.pertValid !== false;
  const ids = R.nodes.map((n) => n.id), seen: Record<string, boolean> = {}; ids.forEach((i) => { seen[i] = true; });
  const nodes = R.nodes.map((n) => ({ id: n.id, dur: usable(idx[n.id]) ? (idx[n.id].te as number) : (n.det != null ? n.det : 0) }));
  const links = R.links.filter((l) => seen[l.from] && seen[l.to] && l.from !== l.to);
  const res = GPI!.util.cpm(nodes as CpmNode[], links, calData(), {});
  const vars: Record<string, number> = {}; ids.forEach((i) => { if (usable(idx[i])) vars[i] = idx[i].variance as number; });
  const ch = GPI!.util.pertCriticalChain(res, links, calData(), vars);
  const simActs: SimAct[] = R.nodes.map((n) => { const r = idx[n.id], u = usable(r); return { id: n.id, dur: (nodes.find((q) => q.id === n.id) as { dur: number }).dur, o: u ? r.po : null, m: u ? r.pm : null, p: u ? r.pp : null }; });
  const sim = ch.ok || ch.reason === "parallel" ? simFor(simActs, links, calData()) : null;
  if (!ch.ok) return { mean: 0, sumVar: 0, allValid: false, count: res.ok ? res.criticalIds.length : 0, reason: ch.reason, sim };
  // Un hito nunca tiene terna O/M/P -- duración cero por definición, no dato
  // faltante -- así que no invalida la probabilidad solo porque cayó en la
  // ruta; y una actividad que no decide el fin (peso 0, p. ej. la predecesora
  // de un SS) tampoco necesita terna.
  const allValid = Object.keys(ch.weights).every((id) => { const r = idx[id]; return !!r && (r.isMilestone || usable(r)); });
  return { mean: ch.mean, sumVar: ch.variance, allValid, count: ch.ids.length, sim };
}
const simLine = (sm: PertSimResult): string => "P10 " + fmt(sm.percentiles[10]) + " · P50 " + fmt(sm.percentiles[50]) + " · P80 " + fmt(sm.percentiles[80]) + " · P90 " + fmt(sm.percentiles[90]) + " d" + (sm.elapsedApprox ? " (⚠ desfases en días transcurridos aproximados)" : "");

function renderProbability(R: RunCpmResult): void {
  const out = document.getElementById("probOut") as HTMLElement;
  const t = parseFloat((document.getElementById("probTarget") as HTMLInputElement).value);
  if (!R.cpm.ok) { out.innerHTML = "<div class='p'>—</div><div class='z'>red con ciclo</div>"; return; }
  const s = criticalPertSums(R);
  if (s.reason === "parallel") {
    const sm = s.sim, why = "hay <b>" + s.count + "</b> actividades críticas en ramas paralelas o convergentes: PERT de una sola ruta no vale ahí (sobrestima: el fin depende de que TODAS las ramas terminen a tiempo)";
    if (!sm) { out.innerHTML = "<div class='p'>—</div><div class='z'>no aplicable: " + why + ". Completa las ternas O/M/P en PERT para simular la red completa</div>"; return; }
    if (!isFinite(t) || t <= 0) { out.innerHTML = "<div class='p'>—</div><div class='z'>" + why + "; se simula la red completa (E[T]=" + fmt(sm.mean) + " d, " + simLine(sm) + "). Ingresa un plazo objetivo</div>"; return; }
    const pc = Math.round(probWithin(sm, t) * 1000) / 10;
    out.innerHTML = "<div class='p'>" + pc + "%</div><div class='z'>P(fin ≤ " + fmt(t) + " d) por <b>simulación de la red completa</b> (" + sm.iterations.toLocaleString("es-PE") + " iter., Beta-PERT) · E[T]=" + fmt(sm.mean) + " σ=" + fmt(sm.sd) + " · " + simLine(sm) + "<br>Motivo: " + why + "</div>"; return;
  }
  if (s.reason === "elapsed") { out.innerHTML = "<div class='p'>—</div><div class='z'>no aplicable: la ruta crítica tiene desfases en <b>días transcurridos</b>, que se calculan sobre fechas reales (fines de semana y feriados) y no son un tiempo fijo que sumar a la media PERT. Exprésalos en días laborables para obtener la probabilidad</div>"; return; }
  if (s.reason) { out.innerHTML = "<div class='p'>—</div><div class='z'>no aplicable: no se pudo aislar una ruta crítica única</div>"; return; }
  if (!s.allValid) { out.innerHTML = "<div class='p'>—</div><div class='z'>completa O/M/P en PERT para la ruta crítica</div>"; return; }
  if (!isFinite(t) || t <= 0) { out.innerHTML = "<div class='p'>—</div><div class='z'>E[T]=" + fmt(s.mean) + " d · ingresa un plazo objetivo</div>"; return; }
  const pr = GPI!.util.pertProbability(s.mean, s.sumVar, t);
  if (!pr) { out.innerHTML = "<div class='p'>—</div><div class='z'>E[T]=" + fmt(s.mean) + " d · sin varianza en la ruta crítica (σ=0): no hay incertidumbre que evaluar</div>"; return; }
  const pct = Math.round(pr.prob * 1000) / 10;
  const cross = s.sim ? Math.round(probWithin(s.sim, t) * 1000) / 10 : null;
  out.innerHTML = "<div class='p'>" + pct + "%</div><div class='z'>P(fin ≤ " + fmt(t) + " d) · Z=" + fmt(pr.z) + " · E[T]=" + fmt(s.mean) + " σ=" + fmt(pr.sigma) + "</div>"
    + (cross !== null ? "<div class='z'>Red completa (simulación): <b>" + cross + "%</b>" + (Math.abs(cross - pct) >= 3 ? " — " + (pct > cross ? "la ruta única <b>sobrestima</b>: hay rutas casi críticas" : "difiere de la ruta única") : " — coincide con la ruta única") + "</div>" : "");
}

function renderCalNote(): void {
  const el = document.getElementById("calNote") as HTMLElement, cal = calData(), start = metaStart();
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const wd = (cal.workDayIdx || []).map((i) => days[i]).join(", ");
  const startTxt = start ? ("Inicio: <b>" + esc(start) + "</b>. ") : "<b style='color:#8a5300'>Sin fecha de inicio</b> (defínela en el Panel para fechar el cronograma). ";
  if (cal.provisional) {
    el.className = "cal-note prov";
    el.innerHTML = startTxt + "Calendario <b>provisional</b> (Lun–Vie, 8 h): no hay Plan de Gestión del Cronograma. Complétalo para usar tu calendario real (días laborables y feriados).";
  } else {
    el.className = "cal-note";
    el.innerHTML = startTxt + "Días laborables: <b>" + esc(wd) + "</b> · " + fmt(cal.hoursPerDay) + " h/día · " + (cal.holidays || []).length + " feriado(s). <span style='color:var(--ink-2)'>Fuente: Plan de Gestión del Cronograma.</span>";
  }
}

// ============================ VISTAS ============================
function switchView(v: string): void {
  (["tabla", "red", "gantt", "control"] as const).forEach((k) => {
    (document.getElementById("view-" + k) as HTMLElement).classList.toggle("active", k === v);
  });
  document.querySelectorAll(".vtab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-view") === v);
  });
}

// ============================ RED AON (SVG) ============================
function renderNet(R: RunCpmResult): void {
  const wrap = document.getElementById("netWrap") as HTMLElement;
  if (!R.cpm.ok) { wrap.innerHTML = "<div class='empty-state'>La red tiene un ciclo; corrige las dependencias para ver el diagrama.</div>"; return; }
  const acts = R.snap.filter((r) => r.kind === "activity");
  if (!acts.length) { wrap.innerHTML = "<div class='empty-state'>Sin actividades para diagramar.</div>"; return; }
  const ids = R.nodes.map((n) => n.id), idset: Record<string, number> = {}; ids.forEach((i) => { idset[i] = 1; });
  const vlinks = R.links.filter((l) => idset[l.from] && idset[l.to] && l.from !== l.to);
  const inc: Record<string, string[]> = {}; ids.forEach((i) => { inc[i] = []; }); vlinks.forEach((l) => { inc[l.to].push(l.from); });
  const rank: Record<string, number> = {};
  R.cpm.order.forEach((id) => { let mr = 0; inc[id].forEach((f) => { if ((rank[f] || 0) + 1 > mr) mr = (rank[f] || 0) + 1; }); rank[id] = mr; });
  const cmap = codeOf(R.snap), nmap = nameOf(R.snap), msmap = isMilestoneOf(R.snap);
  const NW = 168, NH = 78, GX = 58, GY = 26, MX = 22, MY = 22;
  const cols: Record<number, string[]> = {}; ids.forEach((id) => { const k = rank[id] || 0; (cols[k] = cols[k] || []).push(id); });
  const pos: Record<string, { x: number; y: number }> = {}; let maxRank = 0, maxRows = 0;
  Object.keys(cols).forEach((ks) => { const k = +ks; if (k > maxRank) maxRank = k; if (cols[k].length > maxRows) maxRows = cols[k].length; cols[k].forEach((id, i) => { pos[id] = { x: MX + k * (NW + GX), y: MY + i * (NH + GY) }; }); });
  const W = MX * 2 + (maxRank + 1) * NW + maxRank * GX, H = MY * 2 + maxRows * (NH + GY);
  let svg = "<svg width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "' xmlns='http://www.w3.org/2000/svg' style='font-family:var(--mono)'>";
  svg += "<defs><marker id='arr' markerWidth='9' markerHeight='9' refX='8' refY='3' orient='auto'><path d='M0,0 L8,3 L0,6 Z' fill='#9aa7b5'/></marker>";
  svg += "<marker id='arrC' markerWidth='9' markerHeight='9' refX='8' refY='3' orient='auto'><path d='M0,0 L8,3 L0,6 Z' fill='#ff5470'/></marker></defs>";
  // aristas
  vlinks.forEach((l) => {
    const a = pos[l.from], b = pos[l.to]; if (!a || !b) return;
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
    const rf = R.cpm.ok ? R.cpm.rows[l.from] : undefined, rt = R.cpm.ok ? R.cpm.rows[l.to] : undefined;
    const crit = !!(rf && rt && rf.critical && rt.critical && Math.abs(rt.es - (rf.ef + (Number(l.lag) || 0))) < 1e-6 && (l.type || "FS") === "FS");
    const dx = Math.max(26, Math.min(46, (x2 - x1) / 2));
    const col = crit ? "#ff5470" : "#9aa7b5", wdt = crit ? 2.2 : 1.4;
    let lbl = (l.type && l.type !== "FS") ? l.type : "";
    if (Number(l.lag)) lbl += (l.lag > 0 ? "+" : "") + l.lag + unitTag(l.lagUnit);
    svg += "<path d='M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + (x2 - 9) + "," + y2 + "' fill='none' stroke='" + col + "' stroke-width='" + wdt + "' marker-end='url(#" + (crit ? "arrC" : "arr") + ")'/>";
    if (lbl) svg += "<text x='" + ((x1 + x2) / 2) + "' y='" + ((y1 + y2) / 2 - 4) + "' font-size='9' fill='#6b7684' text-anchor='middle'>" + esc(lbl) + "</text>";
  });
  // nodos
  ids.forEach((id) => {
    const p = pos[id], row = R.cpm.ok ? R.cpm.rows[id] : undefined; if (!row) return;
    const crit = row.critical;
    const stroke = crit ? "#ff5470" : "#00b6ec", fill = crit ? "rgba(255,84,112,.06)" : "#ffffff", band = crit ? "#ff5470" : "#00b6ec";
    const nm = (msmap[id] ? "◆ " : "") + (nmap[id] || ""), nmS = nm.length > 24 ? nm.slice(0, 23) + "…" : nm;
    const dur = row.ef - row.es;
    svg += "<g>";
    svg += "<rect x='" + p.x + "' y='" + p.y + "' width='" + NW + "' height='" + NH + "' rx='9' fill='" + fill + "' stroke='" + stroke + "' stroke-width='" + (crit ? 2 : 1.3) + "'/>";
    // banda superior ES | Dur | EF
    svg += "<rect x='" + p.x + "' y='" + p.y + "' width='" + NW + "' height='19' rx='9' fill='" + band + "'/><rect x='" + p.x + "' y='" + (p.y + 10) + "' width='" + NW + "' height='9' fill='" + band + "'/>";
    svg += "<text x='" + (p.x + 14) + "' y='" + (p.y + 13.5) + "' font-size='10.5' font-weight='700' fill='#fff'>" + fmt(row.es) + "</text>";
    svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 13.5) + "' font-size='10.5' font-weight='800' fill='#fff' text-anchor='middle'>" + fmt(dur) + "d</text>";
    svg += "<text x='" + (p.x + NW - 14) + "' y='" + (p.y + 13.5) + "' font-size='10.5' font-weight='700' fill='#fff' text-anchor='end'>" + fmt(row.ef) + "</text>";
    // nombre + código
    svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 37) + "' font-size='11' font-weight='700' fill='#1a2027' text-anchor='middle' style='font-family:var(--display)'>" + esc(nmS) + "</text>";
    svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 50) + "' font-size='9' fill='#6c5ce7' text-anchor='middle'>" + (msmap[id] ? "Hito " : "EDT ") + esc(cmap[id] || "") + "</text>";
    // banda inferior LS | H.T. | LF
    svg += "<line x1='" + p.x + "' y1='" + (p.y + NH - 22) + "' x2='" + (p.x + NW) + "' y2='" + (p.y + NH - 22) + "' stroke='#e4eaf1'/>";
    svg += "<text x='" + (p.x + 14) + "' y='" + (p.y + NH - 8) + "' font-size='10' font-weight='700' fill='#4d5768'>" + fmt(row.ls) + "</text>";
    svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + NH - 8) + "' font-size='10' font-weight='800' fill='" + (crit ? "#ff5470" : "#4d5768") + "' text-anchor='middle'>H" + fmt(row.tf) + "</text>";
    svg += "<text x='" + (p.x + NW - 14) + "' y='" + (p.y + NH - 8) + "' font-size='10' font-weight='700' fill='#4d5768' text-anchor='end'>" + fmt(row.lf) + "</text>";
    svg += "</g>";
  });
  svg += "</svg>";
  wrap.innerHTML = svg;
}

// ============================ GANTT (SVG) ============================
function renderGantt(R: RunCpmResult): void {
  const wrap = document.getElementById("ganttWrap") as HTMLElement;
  if (!R.cpm.ok) { wrap.innerHTML = "<div class='empty-state'>La red tiene un ciclo; corrige las dependencias para ver el Gantt.</div>"; return; }
  const acts = R.snap.filter((r) => r.kind === "activity");
  if (!acts.length) { wrap.innerHTML = "<div class='empty-state'>Sin actividades para el Gantt.</div>"; return; }
  const baseSnap = normalizeBaseline(state().baseline), bmap: Record<string, { es: number; ef: number }> = {};
  if (baseSnap) baseSnap.snapshot.rows.forEach((r) => { bmap[r.id] = r; });
  const D = Math.max(1, Math.ceil(Math.max(R.cpm.projectDuration, baseSnap ? baseSnap.snapshot.projectDuration : 0)));
  const LW = 214, RH = 24, HH = 30, MB = 12;
  const dayW = Math.max(9, Math.min(34, Math.floor(760 / D)));
  const plot = D * dayW, W = LW + plot + 20, H = HH + acts.length * RH + MB;
  let svg = "<svg width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "' xmlns='http://www.w3.org/2000/svg' style='font-family:var(--mono)'>";
  // rejilla + eje (cada ~5 días o cada día si caben)
  const step = D <= 20 ? 1 : D <= 45 ? 5 : 10;
  for (let d = 0; d <= D; d += step) {
    const x = LW + d * dayW;
    svg += "<line x1='" + x + "' y1='" + HH + "' x2='" + x + "' y2='" + (H - MB) + "' stroke='#eef2f7'/>";
    svg += "<text x='" + x + "' y='" + (HH - 8) + "' font-size='9' fill='#8992a3' text-anchor='middle'>" + d + "</text>";
  }
  svg += "<text x='" + LW + "' y='14' font-size='10' font-weight='700' fill='#4d5768'>día laborable →</text>";
  acts.forEach((r, i) => {
    const row = R.cpm.ok ? R.cpm.rows[r.activityId as string] : undefined; if (!row) return;
    const y = HH + i * RH;
    const crit = row.critical, col = crit ? "#ff5470" : "#00b6ec";
    let nm = (r.isMilestone ? "◆ " : "") + (codeOf(R.snap)[r.activityId as string] || "") + " " + (r.name || "");
    if (nm.length > 30) nm = nm.slice(0, 29) + "…";
    svg += "<text x='10' y='" + (y + RH / 2 + 3) + "' font-size='10.5' fill='#1a2027' style='font-family:var(--display);font-weight:600'>" + esc(nm) + "</text>";
    const bx = LW + row.es * dayW, bw = Math.max(4, (row.ef - row.es) * dayW);
    svg += "<rect x='" + bx + "' y='" + (y + 4) + "' width='" + bw + "' height='" + (RH - 10) + "' rx='4' fill='" + col + "' opacity='" + (crit ? 1 : 0.85) + "'/>";
    // holgura total (barra tenue tras el bar hasta LF)
    if (row.tf > 1e-6) { const sx = LW + row.ef * dayW, sw = row.tf * dayW; svg += "<rect x='" + sx + "' y='" + (y + RH / 2 - 1.5) + "' width='" + sw + "' height='3' fill='#c7d3de'/>"; }
    svg += "<text x='" + (bx + bw + 5) + "' y='" + (y + RH / 2 + 3) + "' font-size='9' fill='#6b7684'>" + fmt(row.ef - row.es) + "d</text>";
    // marca de la línea base (gris, bajo la barra): la variación se ve de un vistazo
    const bb = bmap[r.activityId as string];
    if (bb) svg += "<rect x='" + (LW + bb.es * dayW) + "' y='" + (y + RH - 6) + "' width='" + Math.max(3, (bb.ef - bb.es) * dayW) + "' height='3' rx='1.5' fill='#5b6472'><title>Línea base " + esc(baseSnap!.version) + "</title></rect>";
  });
  if (baseSnap) svg += "<text x='" + (W - 8) + "' y='14' font-size='10' font-weight='700' fill='#5b6472' text-anchor='end'>▬ línea base " + esc(baseSnap.version) + "</text>";
  svg += "</svg>";
  wrap.innerHTML = svg;
}

// ============================ SALUD DE LA RED Y LÍNEA BASE ============================
// Auditoría metodológica: el CPM servía para planificar, no para controlar. Aquí se evalúa la CALIDAD de la red
// (verificaciones tipo DCMA), se fija la LÍNEA BASE del cronograma (versionada LB-n, como la de costos) y se mide el
// pronóstico contra ella usando los umbrales del Plan de Gestión del Cronograma (ruta casi crítica, reserva de
// cronograma, umbral de rebaselinado, consumo de holgura). Toda la lógica es pura: shared/schedule-control.ts.
function controlNodes(R: RunCpmResult): CtlNode[] {
  const cm = codeOf(R.snap), nm = nameOf(R.snap), ms = isMilestoneOf(R.snap);
  return R.nodes.map((n) => ({ id: n.id, code: cm[n.id] || n.id, name: nm[n.id] || "", isMilestone: !!ms[n.id], hasDur: n.hasDur, dur: n.dur }));
}
function controlPlan(): CtlPlan { return planOf(mode === "sample" ? null : spLive); }
const d1 = (v: number): string => String(Math.round(v * 10) / 10);
const sg = (v: number): string => (v > 0 ? "+" : v < 0 ? "−" : "") + d1(Math.abs(v));
function renderControl(R: RunCpmResult): void {
  const box = document.getElementById("ctlWrap") as HTMLElement;
  if (!R.cpm.ok) { box.innerHTML = "<div class='empty-state'>La red tiene un ciclo: corrígela para evaluar su salud y fijar una línea base.</div>"; return; }
  if (!R.nodes.length) { box.innerHTML = "<div class='empty-state'>Aún no hay actividades en la red.</div>"; return; }
  const nodes = controlNodes(R), plan = controlPlan(), rows = R.cpm.rows;
  const health = scheduleHealth(nodes, R.links as CtlLink[], rows, plan);
  const base = normalizeBaseline(state().baseline);
  // --- salud ---
  const pill = (p: boolean | null): string => (p === null ? "<span class='ctl-pill info'>info</span>" : p ? "<span class='ctl-pill ok'>✓ cumple</span>" : "<span class='ctl-pill bad'>✗ no cumple</span>");
  const hrows = health.checks.map((c) => "<tr><td><b>" + esc(c.label) + "</b><div class='ctl-items'>" + esc(c.detail) + (c.items.length ? "<br>" + c.items.map(esc).join(" · ") : "") + "</div></td><td class='num'>" + c.count + " / " + c.total + " (" + d1(c.pct) + " %)</td><td>" + esc(c.limit) + "</td><td>" + pill(c.pass) + "</td></tr>").join("");
  const healthHtml = "<div class='ctl-card'><h3>Salud de la red</h3><p class='sub'>Antes de fiarte de la ruta crítica, revisa la calidad de la red. Verificaciones tipo <b>DCMA 14-Point Assessment</b> (valores de <b>referencia</b> de la industria: orientan, no bloquean). <b>" + health.passed + " de " + health.evaluated + "</b> verificaciones cumplen.</p>"
    + "<table class='ctl'><thead><tr><th>Verificación</th><th class='num'>Resultado</th><th>Umbral de referencia</th><th>Estado</th></tr></thead><tbody>" + hrows + "</tbody></table>"
    + "<div class='ctl-note'>No se evalúan las restricciones duras de fecha, los recursos ni el avance real: la suite no los modela. La ruta casi crítica usa el umbral del Plan de Gestión del Cronograma (" + plan.nearCriticalDays + " d" + (plan.nearCriticalDefined ? "" : ", valor por omisión: el plan no lo define") + ").</div></div>";
  // --- línea base ---
  let baseHtml: string;
  if (!base) {
    baseHtml = "<div class='ctl-card'><h3>Línea base del cronograma</h3><p class='sub'>Todavía no hay una línea base. Es la <b>versión aprobada</b> del cronograma contra la que se mide la variación: sin ella el pronóstico solo se compara consigo mismo. Fíjala cuando el cronograma esté aprobado; después solo cambia por control de cambios (nueva versión LB-n, con motivo y aprobador).</p>"
      + "<button class='btn violet' id='btnBaseline'>✚ Fijar la línea base (LB-1)</button></div>";
  } else {
    const cmp = compareBaseline(base.snapshot, nodes, rows, R.cpm.projectDuration, plan), bs = base.snapshot;
    const lvl = cmp.near.level ? "<span class='ctl-pill " + cmp.near.level + "'>" + cmp.near.level.toUpperCase() + "</span>" : "<span class='ctl-pill info'>sin ruta casi crítica</span>";
    const kp = (v: string, k: string): string => "<div class='ctl-kpi'><div class='v'>" + v + "</div><div class='k'>" + k + "</div></div>";
    const kpis = "<div class='ctl-kpis'>"
      + kp(d1(bs.projectDuration) + " → " + d1(R.cpm.projectDuration) + " d", "duración: línea base → pronóstico")
      + kp(sg(cmp.durationDelta) + " d" + (cmp.durationDeltaPct !== null ? " (" + sg(cmp.durationDeltaPct) + " %)" : ""), "desplazamiento del fin del proyecto")
      + kp(cmp.reserveConsumedPct === null ? "—" : d1(cmp.reserveConsumedPct) + " %", plan.reservePct > 0 ? "reserva de cronograma consumida (" + d1(cmp.reserveDays) + " d = " + plan.reservePct + " %)" : "reserva de cronograma: el plan no la define")
      + kp(cmp.near.items.length ? d1(cmp.near.meanPct) + " %" : "—", "consumo medio de holgura, ruta casi crítica")
      + "</div>";
    const nearRows = cmp.near.items.slice(0, 8).map((i) => "<tr><td class='mono'>" + esc(i.code) + "</td><td>" + esc(i.name) + "</td><td class='num'>" + d1(i.tfBase) + " → " + d1(i.tfNow) + " d</td><td class='num'>" + d1(i.consumedPct) + " %</td></tr>").join("");
    const chRows = cmp.changed.slice(0, 12).map((c) => "<tr><td class='mono'>" + esc(c.code) + "</td><td>" + esc(c.name) + "</td><td class='num'>" + sg(c.durDelta) + " d</td><td class='num'>" + sg(c.efDelta) + " d</td><td class='num'>" + d1(c.tfBase) + " → " + d1(c.tfNow) + "</td></tr>").join("");
    const logRows = base.log.slice().reverse().map((e) => "<tr><td class='mono'>" + esc(e.version) + "</td><td>" + esc(e.date) + "</td><td>" + esc(e.reason) + "</td><td>" + esc(e.approver) + (e.sponsorAuth ? " (sponsor autorizó)" : "") + "</td><td class='num'>" + d1(e.projectDuration) + " d</td><td class='num'>" + (e.deviationPct === null ? "—" : sg(e.deviationPct) + " %") + "</td></tr>").join("");
    baseHtml = "<div class='ctl-card'><h3>Línea base del cronograma · " + esc(base.version) + "</h3><p class='sub'>Fijada el <b>" + esc(base.date) + "</b> · fin " + esc(bs.finishDate || "—") + ". El pronóstico es el CPM actual (con los cambios de duración y de enlaces desde entonces). El Gantt muestra la línea base como una marca gris bajo cada barra.</p>"
      + kpis
      + "<div class='ctl-note' style='margin:0 0 12px'><b>Consumo de holgura de la ruta casi crítica: " + lvl + "</b> — umbral del plan: verde ≤ " + plan.floatGreen + " %, rojo ≥ " + plan.floatRed + " %. " + (cmp.near.newCritical.length ? "Pasaron a ser críticas: " + esc(cmp.near.newCritical.slice(0, 4).join(", ")) + ". " : "") + (cmp.added.length || cmp.removed.length ? "Actividades nuevas: " + cmp.added.length + " · quitadas: " + cmp.removed.length + " desde la línea base." : "") + "</div>"
      + (nearRows ? "<h4 style='font-size:12px;margin:8px 0 4px'>Ruta casi crítica (holgura ≤ " + bs.nearCriticalDays + " d en la línea base)</h4><table class='ctl'><thead><tr><th>Cód.</th><th>Actividad</th><th class='num'>Holgura</th><th class='num'>Consumida</th></tr></thead><tbody>" + nearRows + "</tbody></table>" : "")
      + (chRows ? "<h4 style='font-size:12px;margin:12px 0 4px'>Actividades que cambiaron (mayor desplazamiento primero)</h4><table class='ctl'><thead><tr><th>Cód.</th><th>Actividad</th><th class='num'>Δ duración</th><th class='num'>Δ fin</th><th class='num'>Holgura</th></tr></thead><tbody>" + chRows + "</tbody></table>" + (cmp.changed.length > 12 ? "<div class='ctl-items'>… y " + (cmp.changed.length - 12) + " más.</div>" : "") : "<div class='ctl-items' style='margin-top:8px'>Ninguna actividad cambió de duración ni de fin desde la línea base.</div>")
      + "<h4 style='font-size:12px;margin:12px 0 4px'>Versiones de la línea base</h4><table class='ctl'><thead><tr><th>Versión</th><th>Fecha</th><th>Motivo</th><th>Aprobó</th><th class='num'>Duración</th><th class='num'>Desviación</th></tr></thead><tbody>" + logRows + "</tbody></table>"
      + "<div style='margin-top:12px'><button class='btn violet' id='btnBaseline'>✚ Nueva versión de la línea base (" + esc(nextVersion(base)) + ")…</button></div></div>";
  }
  const planHtml = "<div class='ctl-card'><h3>Umbrales del Plan de Gestión del Cronograma que se aplican aquí</h3><table class='ctl'><tbody>"
    + "<tr><td>Ruta casi crítica (holgura ≤)</td><td class='num'>" + plan.nearCriticalDays + " d</td><td>" + (plan.nearCriticalDefined ? "del plan" : "por omisión (el plan no lo define)") + "</td></tr>"
    + "<tr><td>Reserva de cronograma</td><td class='num'>" + plan.reservePct + " %</td><td>" + (plan.reservePct > 0 ? "del plan" : "el plan no la define") + "</td></tr>"
    + "<tr><td>Umbral de rebaselinado (desviación de la duración)</td><td class='num'>" + plan.rebaselinePct + " %</td><td>" + (plan.rebaselinePct > 0 ? "del plan: por encima, autoriza el sponsor" : "el plan no lo define: no se exige al sponsor") + "</td></tr>"
    + "<tr><td>Consumo de holgura de la ruta casi crítica</td><td class='num'>verde ≤ " + plan.floatGreen + " % · rojo ≥ " + plan.floatRed + " %</td><td>del plan (o 40 / 70 por omisión)</td></tr></tbody></table>"
    + (mode === "sample" ? "<div class='ctl-note'>Modo ejemplo: sin proyecto, se usan los valores por omisión.</div>" : "") + "</div>";
  box.innerHTML = baseHtml + healthHtml + planHtml;
  const b = document.getElementById("btnBaseline"); if (b) b.addEventListener("click", () => openBaselineDialog(runCpm()));
}
// Referencia de VALOR GANADO que se congela con la línea base (shared/evm-reference.ts): el presupuesto por paquete (Estimar los Costos o EDT), el
// calendario y el inicio/fin de cada paquete. Sin paquetes con costo no hay referencia (null): EVM lo avisa. Solo con un proyecto conectado.
function evmReferenceNow(R: RunCpmResult): EvmReference | null {
  try {
    if (!R.cpm.ok || !GPI!.active()) return null;
    const wbs = wbsData(), act = actsData(), cal = calData();
    const leaves = GPI!.util.wbsLeaves(wbs).map((l) => ({ id: l.id, code: l.code, name: l.name })), wbsCost: Record<string, number> = {};
    leaves.forEach((l) => { const n = wbs && wbs.nodes ? wbs.nodes[l.id] : null; wbsCost[l.id] = n ? Number(n.cost) || 0 : 0; });
    const ref = buildEvmReference({
      leaves, wbsCost, estimateRows: GPI!.util.costEstimateRows(GPI!.getModule("costEstimate"), act, wbs).map((r) => ({ leafId: r.leafId, subtotal: r.subtotal })),
      activityNodes: R.snap.filter((r) => r.kind === "activity").map((r) => ({ id: r.activityId as string, leafId: r.leafId || null, isMilestone: !!r.isMilestone })),
      rows: R.cpm.rows, calendar: { workDayIdx: cal.workDayIdx, holidays: cal.holidays }
    });
    return ref.packages.length ? ref : null;
  } catch (_) { return null; }
}
// Fijar la línea base (LB-1) o una nueva versión: exige motivo y aprobador; si la desviación de la duración supera el
// umbral de rebaselinado del plan, exige además la autorización del sponsor. La versión queda en el historial.
function openBaselineDialog(R: RunCpmResult): void {
  if (!R.cpm.ok) { showAlert("La red tiene un ciclo: corrígela antes de fijar la línea base."); return; }
  const plan = controlPlan(), base = normalizeBaseline(state().baseline), version = nextVersion(base), first = !base;
  const dev = base ? deviationPct(base.snapshot, R.cpm.projectDuration) : null, sponsor = needsSponsor(base ? base.snapshot : null, R.cpm.projectDuration, plan);
  const html = "<div class='ctl-form'><p style='font-size:12.5px;margin:0'>" + (first
    ? "Se guarda una <b>instantánea</b> del cronograma actual (" + d1(R.cpm.projectDuration) + " d laborables" + (R.cpm.projectFinishDate ? ", fin " + esc(R.cpm.projectFinishDate) : "") + ") como la versión aprobada contra la que se medirá la variación."
    : "Se reemplaza la línea base " + esc((base as ScheduleBaselineData).version) + " (" + d1((base as ScheduleBaselineData).snapshot.projectDuration) + " d) por el cronograma actual (" + d1(R.cpm.projectDuration) + " d): desviación " + (dev === null ? "—" : sg(dev) + " %") + ". El historial conserva la versión anterior.") + "</p>"
    + "<label>Motivo</label><input type='text' id='blReason' value='" + (first ? "Línea base inicial aprobada" : "") + "' placeholder='" + (first ? "" : "Ej. Orden de cambio OC-002: ampliación de sala eléctrica") + "'>"
    + "<label>Quién aprueba (Sponsor, CCB…)</label><input type='text' id='blApprover' placeholder='Sponsor / CCB'>"
    + (sponsor ? "<label style='display:flex;gap:8px;align-items:flex-start;font-weight:600'><input type='checkbox' id='blSponsor' style='margin-top:2px'><span>El <b>sponsor autorizó</b> esta nueva versión: la desviación de la duración (" + sg(dev as number) + " %) supera el umbral de rebaselinado del plan (" + plan.rebaselinePct + " %).</span></label>" : "")
    + "<div class='msg' id='blMsg'></div><div style='text-align:right;margin-top:10px'><button class='btn violet' id='blOk'>" + (first ? "Fijar la línea base" : "Fijar " + esc(version)) + "</button></div></div>";
  showModalHTML({
    title: first ? "Fijar la línea base del cronograma" : "Nueva versión de la línea base (" + version + ")", html, confirmText: null, cancelText: "Cancelar",
    afterOpen: (card) => {
      const g = (id: string): HTMLInputElement => card.querySelector("#" + id) as HTMLInputElement;
      g("blOk").onclick = () => {
        const reason = g("blReason").value.trim(), approver = g("blApprover").value.trim(), sp = sponsor ? g("blSponsor").checked : false;
        const msg = !reason ? "Indica el motivo." : !approver ? "Registra quién aprueba la línea base." : sponsor && !sp ? "Esta desviación supera el umbral del plan: confirma la autorización del sponsor." : "";
        if (msg) { (card.querySelector("#blMsg") as HTMLElement).textContent = msg; return; }
        const nodes = controlNodes(R), today = new Date().toISOString().slice(0, 10);
        const snapshot = makeSnapshot(nodes, R.cpm.ok ? R.cpm.rows : {}, R.cpm.ok ? R.cpm.projectDuration : 0, R.cpm.ok ? R.cpm.projectStart : "", R.cpm.ok ? R.cpm.projectFinishDate : "", plan.nearCriticalDays);
        snapshot.evm = evmReferenceNow(R);                    // presupuesto por paquete, calendario y estructura: se congelan JUNTO con las fechas
        const entry = { version, date: today, reason, approver, sponsorAuth: sp, projectDuration: snapshot.projectDuration, finishDate: snapshot.finishDate, deviationPct: dev };
        state().baseline = { frozen: true, version, date: today, snapshot, log: (base ? base.log : []).concat([entry]) } as ScheduleBaselineData;
        (document.getElementById("modalCancel") as HTMLButtonElement).click();
        commit("Línea base " + version + " fijada (" + d1(snapshot.projectDuration) + " d).");
      };
    }
  });
}

// ============================ PERSISTENCIA ============================
function normSchedule(o: any): ScheduleState {
  o = o || {};
  return {
    links: (Array.isArray(o.links) ? o.links : []).map((l: any, i: number) => ({
      id: l.id || ("L" + (i + 1)), from: l.from, to: l.to,
      type: (["FS", "SS", "FF", "SF"].indexOf(l.type) >= 0 ? l.type : "FS") as ScheduleLinkType,
      lag: Number(l.lag) || 0,
      lagUnit: (["d", "ed", "h", "w"].indexOf(l.lagUnit) >= 0 ? l.lagUnit : "d") as ScheduleLagUnit,
      source: (l.source || "manual") as "manual" | "paste"
    })),
    linkCounter: Number(o.linkCounter) || ((Array.isArray(o.links) ? o.links.length : 0) + 1),
    import: o.import || null,
    baseline: o.baseline || null
  };
}
// Aviso visible, una sola vez, de que esta pestaña quedó desactualizada
// (otra pestaña activó un proyecto distinto) -- reusa el mismo <div id="banner">
// que ya existe para "sin actividades"/"gpi-core.js no cargó".
function markProjectStale(): void {
  if (projectStale) return;
  projectStale = true;
  setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
  const banner = document.getElementById("banner");
  if (banner) {
    banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el cronograma aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
    banner.classList.add("show");
  }
}
function gpiPush(): boolean {
  if (mode === "sample") return false;
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return false;
  if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) { markProjectStale(); return false; }
  // Guardado con sesión y resultado común (src/shared/write-session.ts).
  const r = pushWithSession(window.GPI, "schedule", "El cronograma", stateLive,
    { name: (document.getElementById("projectTitle") as HTMLInputElement).value, course: (document.getElementById("courseTitle") as HTMLInputElement).value },
    session, { setStatus, onStale: markProjectStale });
  session = r.session;
  return r.ok;
}
function commit(statusMsg?: string): void { if (statusMsg) setStatus(statusMsg); gpiPush(); render(); }
function newLinkId(): string { const st = state(); return "L" + (st.linkCounter++); }

// ============================ ENLACES MANUALES ============================
interface CandidateLink { from: string; to: string; type?: ScheduleLinkType; lag?: number; lagUnit?: ScheduleLagUnit; }
function wouldCycle(candidate: Link): boolean {
  const links = (state().links || []).concat([candidate]);
  const ids = fullRowsSnapshot().filter((r) => r.kind === "activity").map((r) => r.activityId as string);
  return !GPI!.util.scheduleValidate(ids, links).ok && GPI!.util.scheduleValidate(ids, links).cycles.length > 0;
}
function addManualLink(r: CandidateLink): boolean {
  if (!r || !r.from || !r.to) return false;
  if (r.from === r.to) { showAlert("Una actividad no puede depender de sí misma."); return false; }
  const exists = (state().links || []).some((l) => l.from === r.from && l.to === r.to && l.type === r.type);
  if (exists) { showAlert("Ese enlace ya existe."); return false; }
  const cand: Link = { id: newLinkId(), from: r.from, to: r.to, type: r.type || "FS", lag: Number(r.lag) || 0, lagUnit: r.lagUnit || "d", source: "manual" };
  if (wouldCycle(cand)) { state().linkCounter--; showAlert("Ese enlace crearía un ciclo (dependencia circular) en la red. No se agregó."); return false; }
  state().links.push(cand);
  commit("Enlace agregado.");
  return true;
}
function removeManualLink(id: string): void {
  const st = state(); st.links = (st.links || []).filter((l) => l.id !== id);
  commit("Enlace eliminado.");
}

function openAddLink(): void {
  const snap = fullRowsSnapshot(), acts = snap.filter((r) => r.kind === "activity");
  if (acts.length < 2) { showAlert("Necesitas al menos 2 actividades definidas (módulo Definir las Actividades) para crear enlaces."); return; }
  const nm = nameOf(snap), nn = netMap(snap);
  function optsHTML(): string { return acts.map((a) => "<option value='" + a.activityId + "'>" + esc(a.netId + " · " + (a.isMilestone ? "Hito " : "EDT ") + a.code + " · " + a.name) + "</option>").join(""); }
  function listHTML(): string {
    const ls = state().links || [];
    if (!ls.length) return "<div style='color:#8992a3;font-size:12px;padding:8px'>Sin enlaces todavía.</div>";
    return ls.map((l) => {
      const lg = Number(l.lag) ? (l.lag > 0 ? "+" : "") + l.lag + unitTag(l.lagUnit) : "";
      return "<div class='row'><span>" + esc((nn[l.from] != null ? nn[l.from] : "?") + " " + (nm[l.from] || "?") + "  →  " + (nn[l.to] != null ? nn[l.to] : "?") + " " + (nm[l.to] || "?")) + " <b style='color:#6c5ce7'>[" + (l.type || "FS") + lg + "]</b></span><button class='btn sm danger rm-lk' data-id='" + l.id + "' title='Eliminar enlace' aria-label='Eliminar enlace'>✕</button></div>";
    }).join("");
  }
  const html =
    "<div class='lk-form'>" +
    "<div><label style='font-size:11px;font-weight:700;color:#4d5768'>Predecesora (desde)</label><select id='lkFrom' class='field' style='width:100%'>" + optsHTML() + "</select></div>" +
    "<div><label style='font-size:11px;font-weight:700;color:#4d5768'>Sucesora (hacia)</label><select id='lkTo' style='width:100%'>" + optsHTML() + "</select></div>" +
    "<div><label style='font-size:11px;font-weight:700;color:#4d5768'>Tipo</label><select id='lkType' style='width:100%'><option value='FS'>FS · Fin→Comienzo</option><option value='SS'>SS · Comienzo→Comienzo</option><option value='FF'>FF · Fin→Fin</option><option value='SF'>SF · Comienzo→Fin</option></select></div>" +
    "<div style='display:grid;grid-template-columns:1fr 1fr;gap:6px'><div><label style='font-size:11px;font-weight:700;color:#4d5768'>Desfase</label><input id='lkLag' type='number' step='0.5' value='0' style='width:100%'></div><div><label style='font-size:11px;font-weight:700;color:#4d5768'>Unidad</label><select id='lkUnit' style='width:100%'><option value='d'>días</option><option value='ed'>días transc.</option><option value='h'>horas</option><option value='w'>semanas</option></select></div></div>" +
    "<div class='full' style='text-align:right'><button class='btn violet' id='lkAdd'>＋ Agregar enlace</button></div>" +
    "</div>" +
    "<h4 style='font-family:var(--display);font-size:12px;margin:14px 0 6px'>Enlaces actuales</h4>" +
    "<div class='prev-list' id='lkList'>" + listHTML() + "</div>";
  showModalHTML({
    wide: true, title: "Enlaces (precedencias) manuales", html, confirmText: null, cancelText: "Cerrar",
    afterOpen: (card) => {
      function refresh() { (card.querySelector("#lkList") as HTMLElement).innerHTML = listHTML(); wireRm(); }
      function wireRm() { card.querySelectorAll<HTMLButtonElement>(".rm-lk").forEach((b) => { b.onclick = () => { removeManualLink(b.getAttribute("data-id") as string); refresh(); }; }); }
      (card.querySelector("#lkAdd") as HTMLButtonElement).onclick = () => {
        const r: CandidateLink = {
          from: (card.querySelector("#lkFrom") as HTMLSelectElement).value,
          to: (card.querySelector("#lkTo") as HTMLSelectElement).value,
          type: (card.querySelector("#lkType") as HTMLSelectElement).value as ScheduleLinkType,
          lag: parseFloat((card.querySelector("#lkLag") as HTMLInputElement).value) || 0,
          lagUnit: (card.querySelector("#lkUnit") as HTMLSelectElement).value as ScheduleLagUnit
        };
        if (addManualLink(r)) refresh();
      };
      wireRm();
    }
  });
}

// ============================ FECHAS (auditoría Comienzo/Fin) ============================
function pad2(n: number): string { return (n < 10 ? "0" : "") + n; }
function parseDateCell(s: unknown): string {
  const str = String(s || "").trim(); if (!str) return "";
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str); if (m) return m[1] + "-" + pad2(+m[2]) + "-" + pad2(+m[3]);
  m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(str);
  if (m) { const d = +m[1], mo = +m[2]; let y = +m[3]; if (y < 100) y += 2000; return y + "-" + pad2(mo) + "-" + pad2(d); }
  return "";
}
// Si Excel autoformateó la celda como Fecha, el .xlsx guarda un número de
// serie (no el texto "2026-01-05") -- época 1899-12-30 (con el bug de año
// bisiesto de Excel/Lotus 1-2-3 ya incorporado en esa fecha de referencia).
// Ningún otro módulo tenía columnas de fecha en su plantilla, así que este
// caso nunca había aparecido antes.
function excelSerialToISODate(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function cellToDate(raw: unknown): string {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); if (n > 0 && n < 60000) return excelSerialToISODate(n); }
  return parseDateCell(s);
}
interface PastedRowLocal { netId: number; name: string; start: string; finish: string; predCell: string; }
// Arma el mismo PastedRowLocal[] que ya consume GPI.util.buildScheduleLinks
// -- esa función (validación de ciclos, cruce por nombre, sintaxis de
// predecesoras) no sabe ni le importa si las filas vinieron de un .xlsx o
// de un pegado; no se toca gpi-core.ts en absoluto.
function buildImportResult(pasted: PastedRowLocal[]) {
  const snap = fullRowsSnapshot();
  const res = GPI!.util.buildScheduleLinks(pasted, snap as unknown as Parameters<GpiApi["util"]["buildScheduleLinks"]>[1]) as ReturnType<GpiApi["util"]["buildScheduleLinks"]> & { snap?: Row[]; pastedCount?: number; canApply?: boolean };
  res.snap = snap; res.pastedCount = pasted.length;
  res.canApply = res.links.length > 0 || Object.keys(res.dates).length > 0;
  return res;
}
type AnalyzeResult = ReturnType<typeof buildImportResult>;
const REASON: Record<string, string> = {
  "enlace-a-resumen": "Enlace a una tarea resumen (fase/paquete): enlaza las actividades detalle.",
  "enlace-a-proyecto": "Enlace al proyecto (fila 0): no admitido.",
  "colgante": "Referencia a un Id. que no existe entre las actividades.",
  "auto-enlace": "La actividad dependería de sí misma.",
  "fila-sin-correspondencia": "Id. sin correspondencia con una actividad (re-exporta la plantilla).",
  "nombre-no-coincide": "El nombre no coincide con la actividad de ese Id. — ¿editaste la EDT? Re-exporta la plantilla.",
  "predecesoras-en-resumen": "Predecesoras escritas en una fila resumen (ignoradas).",
  "predecesoras-en-proyecto": "Predecesoras escritas en la fila del proyecto (ignoradas).",
  "sin-id": "No se pudo leer el Id. de la predecesora.",
  "sintaxis": "Sintaxis de predecesora no reconocida.",
  "desfase": "Desfase (lag) sin número válido."
};
function previewHTML(a: AnalyzeResult): string {
  function sec(title: string, count: number, cls: string, listHtml: string): string {
    return "<div class='prev-sec'><h4>" + title + " <span class='prev-count " + cls + "'>" + count + "</span></h4>" + (count ? "<div class='prev-list'>" + listHtml + "</div>" : "") + "</div>";
  }
  const nm = nameOf(a.snap as Row[]), nn = netMap(a.snap as Row[]);
  const okList = a.links.map((l) => { const lg = Number(l.lag) ? (l.lag > 0 ? "+" : "") + l.lag + unitTag(l.lagUnit) : ""; return "<div class='row'><span>" + esc((nn[l.from] != null ? nn[l.from] : "?") + " " + (nm[l.from] || "") + " → " + (nn[l.to] != null ? nn[l.to] : "?") + " " + (nm[l.to] || "")) + " <b style='color:#6c5ce7'>[" + l.type + lg + "]</b></span></div>"; }).join("");
  function errList(arr: Array<{ toName?: string; name?: string; fromNet?: number; reason: string }>): string { return arr.map((e) => { const who = (e.toName || e.name || (e.fromNet != null ? "Id. " + e.fromNet : "")); return "<div class='row'><span>" + esc(who) + "</span><span class='reason'>" + esc(REASON[e.reason] || e.reason) + "</span></div>"; }).join(""); }
  const datesN = Object.keys(a.dates).length;
  let html = "<p style='margin-bottom:10px'>Se interpretaron <b>" + a.pastedCount + "</b> fila(s) del archivo. Nada se guarda hasta que confirmes.</p>";
  html += sec("✔ Enlaces a crear", a.links.length, "cnt-ok", okList);
  if (a.rejected.length) html += sec("✖ Enlaces rechazados", a.rejected.length, "cnt-bad", errList(a.rejected));
  if (a.rowErrors.length) html += sec("⚠ Filas con problema", a.rowErrors.length, "cnt-warn", errList(a.rowErrors));
  if (a.parseErrors.length) html += sec("⚠ Predecesoras no interpretables", a.parseErrors.length, "cnt-warn", a.parseErrors.map((e) => "<div class='row'><span>Id. " + e.netId + " · «" + esc(e.raw) + "»</span><span class='reason warn'>" + esc(REASON[e.reason] || e.reason) + "</span></div>").join(""));
  if (a.duplicates.length) html += sec("● Duplicados (colapsados)", a.duplicates.length, "cnt-warn", "");
  html += sec("📅 Fechas para auditoría", datesN, "cnt-ok", "");
  if (a.canApply) {
    html += "<div class='radio-row'><label><input type='radio' name='mergeMode' value='merge' checked> Fusionar con lo existente</label><label><input type='radio' name='mergeMode' value='replace'> Reemplazar todo</label></div>";
  } else {
    html += "<div class='issue warn' style='margin-top:8px'><span class='ic'>⚠</span><span>No hay nada aplicable. Revisa que completaste la columna <b>Predecesoras</b> con los Id. de esta plantilla.</span></div>";
  }
  return html;
}
function applyImport(a: AnalyzeResult, mergeMode: string): void {
  const st = state();
  const newLinks: Link[] = a.links.map((l) => ({ ...l, id: newLinkId(), source: "import" as const }));
  if (mergeMode === "replace") { st.links = newLinks; } else {
    const seen: Record<string, boolean> = {}; (st.links || []).forEach((l) => { seen[l.from + "|" + l.to + "|" + l.type] = true; });
    newLinks.forEach((l) => { const k = l.from + "|" + l.to + "|" + l.type; if (!seen[k]) { st.links.push(l); seen[k] = true; } });
  }
  const rowMap: Record<number, string> = {}; (a.snap as Row[]).forEach((r) => { if (r.kind === "activity") rowMap[r.netId] = r.activityId as string; });
  const dates: Record<string, { start: string; finish: string }> = {};
  if (mergeMode !== "replace" && st.import && st.import.dates) Object.assign(dates, st.import.dates);
  Object.assign(dates, a.dates);
  st.import = { at: Date.now(), tool: "xlsx-import", rowMap, dates };
  commit("Cronograma importado y aplicado (" + newLinks.length + " enlace[s]). Las fechas quedan como auditoría.");
}

// ============================ PLANTILLA / EXPORT / IMPORT (.xlsx) ============================
// Mismo patrón que activities/cost-estimate/wbs (el pegado quedó
// reemplazado por completo, a pedido explícito del usuario, "uniforme
// como el resto de los módulos"): exportar/importar un .xlsx con nombre
// de hoja y encabezados EXACTOS -- nunca la posición de la columna. La
// reconciliación en sí (buildImportResult() arriba) es la MISMA que ya
// usaba el pegado; lo único nuevo es CÓMO llegan las filas hasta ahí.
function xmlEsc(s: unknown): string { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
interface XlCell { v: string | number; t: "s" | "n"; s?: number; }

// Nombre EXACTO de la hoja de datos dentro del .xlsx -- la única forma
// confiable de saber cuál hoja es la de Cronograma/CPM si el alumno junta
// varios módulos en un solo libro (ver resolveDataSheetPath() más abajo).
const DATA_SHEET_NAME = "Cronograma";
const TEMPLATE_HEADERS = ["Id.", "Nombre", "Duración (d)", "Comienzo", "Fin", "Predecesoras"];

// Estilos: 0 normal · 1 encabezado · 2 centrado · 4 nota/instrucciones · 25 título
// (mismos índices que activities/cost-estimate/wbs -- copia literal de xlsxStylesXml()).
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
// rows: [[{v, t:"s"|"n", s}]], widths: [n]. Copia literal de xlsxSheetXml().
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

// Id./Nombre son de referencia (la instantánea actual de fullRowsSnapshot(),
// mismo criterio de "no editar la clave de unión" que activities/cost-estimate);
// Duración también es de referencia (nunca se relee al importar, se recalcula
// siempre en pantalla). Comienzo/Fin/Predecesoras son las columnas que el
// alumno completa.
function templateRowModel(): Array<Array<XlCell | null>> {
  const head: XlCell[] = TEMPLATE_HEADERS.map((h) => ({ v: h, t: "s", s: 1 }));
  const out: Array<Array<XlCell | null>> = [head];
  const snap = fullRowsSnapshot(), nn = netMap(snap);
  snap.forEach((r) => {
    const isAct = r.kind === "activity";
    const dur: XlCell | null = isAct && r.det != null ? { v: r.det, t: "n" } : null;
    const preds = isAct ? incoming(r.activityId as string).map((l) => linkToken(l, nn)).filter(Boolean).join("; ") : "";
    out.push([
      { v: r.netId, t: "n", s: 2 },
      { v: r.name || "", t: "s", s: 0 },
      dur,
      null,
      null,
      preds ? { v: preds, t: "s", s: 0 } : null
    ]);
  });
  return out;
}

function templateInstructions(): Array<Array<XlCell | null>> {
  const L: Array<[string, number]> = [
    ["Cómo completar esta plantilla", 25],
    ["", 0],
    ["0. Si guardas todo el proyecto en un solo libro de Excel (varias hojas para varios módulos), esta hoja debe llamarse exactamente “" + DATA_SHEET_NAME + "” y sus encabezados deben coincidir EXACTAMENTE con los de esta plantilla (se puede reordenar columnas, pero no renombrarlas ni abreviarlas): al importar se verifican ambas cosas y se rechaza el archivo si no calzan.", 4],
    ["1. Las columnas “Id.” y “Nombre” son de referencia — no las edites ni las borres: son la clave con la que este simulador reconoce cada fila al importar el archivo de vuelta (el mismo Id. correlativo que ya se ve en pantalla, y en Definir las Actividades/Estimar los Costos). Si el nombre de esa fila ya no coincide, en el proyecto actual, con lo que había cuando exportaste este archivo (por ejemplo, se editaron las actividades después), esa fila se rechaza al importar — vuelve a exportar la plantilla actualizada.", 4],
    ["2. “Duración” es de referencia — se recalcula sola en pantalla a partir del metrado/rendimiento de cada actividad, no hace falta completarla ni se relee al importar.", 4],
    ["3. “Comienzo” y “Fin” son OPCIONALES: solo sirven para auditoría, si ya tienes un cronograma real calculado en MS Project y quieres comparar sus fechas contra las que calcula este simulador (columna “Auditoría” en pantalla) — el simulador siempre recalcula las fechas solo a partir de “Predecesoras”, nunca a partir de estas dos columnas.", 4],
    ["4. “Predecesoras”: escribe el/los Id. de las filas de las que depende cada actividad u hito. Sintaxis: “3” (depende del fin de la fila 3, fin-a-inicio), “3FS+2d” (fin-a-inicio con 2 días de adelanto), “7CC” (comienzo-a-comienzo), “9FC-1d” (fin-a-comienzo con 1 día de atraso). Varias predecesoras se separan con “;” o “,”.", 4],
    ["5. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
    ["6. Guarda el archivo y vuelve a “Cronograma / CPM” > botón “⇧ Importar desde Excel” para subirlo.", 4],
    ["", 0],
    ["Generado por el simulador GPI — módulo Cronograma / CPM.", 4]
  ];
  return L.map((row) => [{ v: row[0], t: "s", s: row[1] === 25 ? 25 : 4 } as XlCell]);
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
    + '<sheets><sheet name="' + xmlEsc(DATA_SHEET_NAME) + '" sheetId="1" r:id="rId1"/><sheet name="Instrucciones" sheetId="2" r:id="rId2"/></sheets>'
    + '</workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  zip.file("xl/styles.xml", xlsxStylesXml());
  zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(templateRowModel(), [6, 30, 12, 11, 11, 22], true));
  zip.file("xl/worksheets/sheet2.xml", xlsxSheetXml(templateInstructions(), [115], false));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function buildTemplateCsv(): string {
  function cell(v: unknown): string { const s = String(v == null ? "" : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const lines = [TEMPLATE_HEADERS.join(";")];
  const snap = fullRowsSnapshot(), nn = netMap(snap);
  snap.forEach((r) => {
    const isAct = r.kind === "activity";
    const dur = isAct && r.det != null ? r.det : "";
    const preds = isAct ? incoming(r.activityId as string).map((l) => linkToken(l, nn)).filter(Boolean).join("; ") : "";
    lines.push([cell(r.netId), cell(r.name || ""), cell(dur), "", "", cell(preds)].join(";"));
  });
  return lines.join("\r\n");
}
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function downloadTemplate(): Promise<void> {
  const safe = ((document.getElementById("projectTitle") as HTMLInputElement).value || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  if (window.JSZip) {
    try {
      const blob = await buildTemplateXlsxBlob();
      downloadBlob(blob, "plantilla_cronograma_" + safe + ".xlsx");
      setStatus("Plantilla descargada. Completa Predecesoras (y Comienzo/Fin si quieres auditar) y vuelve a subirla con «⇧ Importar desde Excel».");
      return;
    } catch (_) { /* si algo falla, cae al CSV */ }
  }
  downloadBlob(new Blob(["﻿" + buildTemplateCsv()], { type: "text/csv;charset=utf-8" }), "plantilla_cronograma_" + safe + ".csv");
  setStatus("No se pudo cargar la librería de Excel (¿sin conexión?): descargué un CSV equivalente.");
}

// ---------- import: lee el .xlsx completado ----------
function colIndexFromRef(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
type SheetResolution = { kind: "found"; path: string } | { kind: "not-found"; sheetNames: string[] } | { kind: "invalid" };
// Busca, ENTRE TODAS las hojas del libro (no solo la primera), la que se
// llama exactamente expectedName -- necesario para que el alumno pueda
// juntar en un solo .xlsx las hojas de varios módulos. Copia literal de
// resolveDataSheetPath() de activities/cost-estimate/wbs.
async function resolveDataSheetPath(zip: JSZipInstance, expectedName: string): Promise<SheetResolution> {
  const wbEntry = zip.file("xl/workbook.xml");
  if (!wbEntry) return { kind: "invalid" };
  const doc = new DOMParser().parseFromString(await wbEntry.async("string"), "application/xml");
  const sheets = Array.from(doc.getElementsByTagName("sheet"));
  const wanted = normName(expectedName);
  const sheetEl = sheets.find((s) => normName(s.getAttribute("name") || "") === wanted);
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
async function parseScheduleXlsx(file: File): Promise<ParsedXlsx> {
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

interface ColumnMap { id: number; name?: number; start?: number; finish?: number; predecessors?: number; }
const TEMPLATE_HEADER_FIELDS: (keyof ColumnMap | null)[] = ["id", "name", null, "start", "finish", "predecessors"];
const HEADER_FIELD_BY_TEXT: Record<string, keyof ColumnMap> = {};
TEMPLATE_HEADERS.forEach((h, i) => { const field = TEMPLATE_HEADER_FIELDS[i]; if (field) HEADER_FIELD_BY_TEXT[normName(h)] = field; });
// Empareja columnas por el TEXTO EXACTO del encabezado (tolera reordenar
// columnas en Excel, rechaza renombrarlas/abreviarlas) -- solo "Id." es
// obligatoria: ya el pegado toleraba un archivo de solo Id.+Predecesoras.
function mapHeaderColumns(headerRow: string[]): ColumnMap | null {
  const map: Partial<ColumnMap> = {};
  headerRow.forEach((h, idx) => { const field = HEADER_FIELD_BY_TEXT[normName(h)]; if (field) map[field] = idx; });
  if (map.id == null) return null;
  return map as ColumnMap;
}
function rowsToPasted(rows: string[][], colMap: ColumnMap): PastedRowLocal[] {
  const out: PastedRowLocal[] = [];
  rows.forEach((row) => {
    const idStr = String(row[colMap.id] || "").trim();
    if (!/^\d+$/.test(idStr)) return; // fila sin Id. numérico: plantilla sin completar u otra fila suelta, se omite
    const name = colMap.name != null ? String(row[colMap.name] || "").trim() : "";
    const start = colMap.start != null ? cellToDate(row[colMap.start]) : "";
    const finish = colMap.finish != null ? cellToDate(row[colMap.finish]) : "";
    const predCell = colMap.predecessors != null ? String(row[colMap.predecessors] || "") : "";
    out.push({ netId: parseInt(idStr, 10), name, start, finish, predCell });
  });
  return out;
}
async function importScheduleExcel(file: File): Promise<void> {
  // Distinguir "la librería para leer .xlsx no cargó" de "el archivo está
  // mal" -- bug real reportado por el usuario: con JSZip vendorizado en el
  // repo (ver Cronograma_CPM.html) esto ya no depende de Internet, pero
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
    parsed = await parseScheduleXlsx(file);
  } catch (_) {
    await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
    return;
  }
  if (parsed.kind === "sheet-not-found") {
    const otras = parsed.sheetNames.filter((n) => normName(n) !== normName(DATA_SHEET_NAME));
    await showAlert("No encontré una hoja llamada «" + DATA_SHEET_NAME + "» en este archivo" + (otras.length ? " (tiene: " + otras.join(", ") + ")" : "") + ". Si tu Excel junta varios módulos en un solo libro, la hoja con los datos a importar aquí debe llamarse exactamente «" + DATA_SHEET_NAME + "» (como la que genera «⇩ Exportar a Excel») para que el simulador sepa cuál copiar y no la confunda con la de otro módulo.", "Hoja no reconocida");
    return;
  }
  if (parsed.kind === "empty") { await showAlert("El archivo no contiene datos reconocibles."); return; }
  const colMap = mapHeaderColumns(parsed.headers);
  if (!colMap) {
    await showAlert("No reconocí las columnas del archivo: los encabezados deben coincidir EXACTAMENTE con los de la plantilla (¿renombraste o abreviaste alguna, p. ej. «Id» en vez de «Id.»?). Se espera al menos la columna «Id.» escrita tal cual.");
    return;
  }
  const pasted = rowsToPasted(parsed.rows, colMap);
  const a = buildImportResult(pasted);
  showModalHTML({
    wide: true, title: "Previsualización — antes de guardar", html: previewHTML(a),
    confirmText: a.canApply ? "Confirmar ▾" : null, cancelText: "Cancelar",
    collect: a.canApply ? () => { const m = document.querySelector("input[name=mergeMode]:checked") as HTMLInputElement | null; return { mode: m ? m.value : "merge" }; } : undefined
  }).then((c) => { if (c && c.mode) applyImport(a, c.mode); });
}

function clearLinks(): void {
  showConfirm("Se eliminarán todos los enlaces y las fechas de auditoría de este cronograma. Las actividades y la EDT no se tocan. ¿Continuar?", "Limpiar cronograma").then((ok) => {
    if (!ok) return;
    const st = state(); st.links = []; st.linkCounter = 1; st.import = null;
    commit("Cronograma limpiado.");
  });
}

// ============================ REPORTE ============================
function buildReport(): void {
  const R = runCpm(), snap = R.snap, cpm = R.cpm, rep = document.getElementById("gpiReport") as HTMLElement;
  const cmap = codeOf(snap), nmap = nameOf(snap), nn = netMap(snap), msmap = isMilestoneOf(snap);
  const dates = (state().import && state().import!.dates) || {};
  const now = new Date().toLocaleDateString("es-PE");
  const s = criticalPertSums(R);
  let h = "<div class='rep-head'><div><h1>Cronograma / Ruta Crítica</h1><div class='sub'>" + esc((document.getElementById("projectTitle") as HTMLInputElement).value) + "</div></div>" +
    "<div class='rep-meta'>" + esc((document.getElementById("courseTitle") as HTMLInputElement).value) + "<br>" + now + "<br>PMBOK · CPM</div></div>";
  h += "<table class='rep-kv'><tr><td>Duración del proyecto</td><td class='num'>" + (cpm.ok ? fmt(cpm.projectDuration) + " días laborables" : "—") + "</td></tr>" +
    "<tr><td>Fecha de fin</td><td class='num'>" + (cpm.ok ? (cpm.projectFinishDate || "—") : "—") + "</td></tr>" +
    "<tr><td>Actividades críticas</td><td class='num'>" + (cpm.ok ? cpm.criticalIds.length : "—") + "</td></tr>" +
    "<tr><td>Enlaces</td><td class='num'>" + (state().links || []).length + "</td></tr></table>";
  if (cpm.ok) {
    const path = cpm.criticalIds.map((id) => (msmap[id] ? "◆ " : "") + (cmap[id] || "") + " " + (nmap[id] || ""));
    h += "<h2>Ruta crítica</h2><p class='num'>" + esc(path.join("  →  ")) + "</p>";
  }
  h += "<h2>Actividades (CPM)</h2><table><tr><th>Id.</th><th>Código EDT</th><th>Actividad</th><th>Duración</th><th>ES</th><th>EF</th><th>LS</th><th>LF</th><th>Holgura Total</th><th>Predecesoras</th><th>Auditoría</th><th>Crítica</th></tr>";
  snap.filter((r) => r.kind === "activity").forEach((r) => {
    const row = cpm.ok ? cpm.rows[r.activityId as string] : null;
    const dur = (durMode === "pert" && r.te != null) ? r.te : r.det;
    const preds = incoming(r.activityId as string).map((l) => linkToken(l, nn)).filter(Boolean).join("; ");
    let au = "—";
    const pd = dates[r.activityId as string];
    if (pd && row && (nz(pd.start) || nz(pd.finish))) {
      const okS = !nz(pd.start) || pd.start === row.startDate;
      const okF = !nz(pd.finish) || pd.finish === row.finishDate;
      au = (okS && okF) ? "✓" : "✗";
    }
    h += "<tr><td class='num'>" + r.netId + "</td><td class='num'>" + esc(r.code) + "</td><td>" + (r.isMilestone ? "◆ " : "") + esc(r.name) + "</td><td class='num'>" + fmt(dur) + "</td>" +
      "<td class='num'>" + (row ? fmt(row.es) : "—") + "</td><td class='num'>" + (row ? fmt(row.ef) : "—") + "</td>" +
      "<td class='num'>" + (row ? fmt(row.ls) : "—") + "</td><td class='num'>" + (row ? fmt(row.lf) : "—") + "</td>" +
      "<td class='num'>" + (row ? fmt(row.tf) : "—") + "</td>" +
      "<td>" + esc(preds || "—") + "</td>" +
      "<td class='num'>" + au + "</td>" +
      "<td>" + (row && row.critical ? "●" : "") + "</td></tr>";
  });
  h += "</table>";
  h += "<p class='rep-note'>ES = Inicio Temprano (Early Start) · EF = Fin Temprano (Early Finish) · LS = Inicio Tardío (Late Start) · LF = Fin Tardío (Late Finish). Holgura Total = LS − ES; 0 = actividad crítica.</p>";
  h += "<p class='rep-note'>Predecesoras: Id. de red de la actividad de la que depende, con el tipo de relación si no es FS (fin-a-inicio) y el adelanto/atraso en días si lo hay — p. ej. “3SS+2d” significa “depende del inicio de la actividad Id. 3, con 2 días de adelanto”.</p>";
  h += "<p class='rep-note'>Auditoría: compara la fecha que calculó el simulador contra la fecha de MS Project que hayas importado con «⇧ Importar desde Excel» (columnas Comienzo/Fin, opcionales) — ✓ coinciden, ✗ difieren (revisa calendario o enlaces). Si todavía no importaste esas fechas, queda en “—”: no hay nada que auditar por ahora.</p>";
  if (s.reason === "parallel") h += "<p class='rep-note'>Probabilidad de plazo PERT: no aplicable — la ruta crítica tiene ramas paralelas o convergentes (PERT de una sola ruta subestimaría el riesgo; haría falta simular la red completa).</p>";
  else if (s.allValid) h += "<p class='rep-note'>Ruta crítica: duración esperada = " + fmt(s.mean) + " d (incluye desfases), σ² = " + fmt(s.sumVar) + " (base para la probabilidad de plazo PERT).</p>";
  rep.innerHTML = h;
}
function printReport(): void { buildReport(); document.body.classList.add("report-mode"); window.print(); setTimeout(() => { document.body.classList.remove("report-mode"); }, 400); }

// ============================ CABLEADO ============================
function buildDurToggle(): void {
  const tabs = document.getElementById("viewTabs") as HTMLElement;
  const dt = document.createElement("span");
  dt.style.cssText = "display:inline-flex;gap:8px;align-items:center;margin-left:14px;font-size:12px;color:var(--ink-1)";
  dt.innerHTML = "<span style='font-weight:700'>Duración:</span><button class='dur-src pert' id='durDet' title='Dur = Met ÷ (#Eq × R)'>Determinística</button><button class='dur-src' id='durPert' title='Usa el Tiempo Esperado TE de PERT'>PERT (TE)</button>";
  (tabs.parentNode as Node).insertBefore(dt, tabs.nextSibling);
  document.getElementById("durDet")!.addEventListener("click", () => { durMode = "det"; render(); });
  document.getElementById("durPert")!.addEventListener("click", () => { durMode = "pert"; render(); });
}
function wireTabs(): void {
  document.getElementById("viewTabs")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest(".vtab"); if (b) switchView(b.getAttribute("data-view") as string);
  });
}
function wireToolbar(): void {
  document.getElementById("btnExportExcel")!.addEventListener("click", downloadTemplate);
  document.getElementById("btnImportExcel")!.addEventListener("click", () => { (document.getElementById("xlsxFileInput") as HTMLInputElement).click(); });
  document.getElementById("xlsxFileInput")!.addEventListener("change", (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files[0]) importScheduleExcel(files[0]);
    (e.target as HTMLInputElement).value = "";
  });
  document.getElementById("btnAddLink")!.addEventListener("click", openAddLink);
  document.getElementById("btnRecalc")!.addEventListener("click", () => { render(); setStatus("Recalculado."); });
  document.getElementById("btnReload")!.addEventListener("click", () => { gpiPullAll(); render(); setStatus("Actividades y EDT recargadas del proyecto."); });
  document.getElementById("btnReport")!.addEventListener("click", printReport);
  document.getElementById("btnPrint")!.addEventListener("click", printReport);
  document.getElementById("btnSample")!.addEventListener("click", enterSample);
  document.getElementById("btnLive")!.addEventListener("click", enterLive);
  document.getElementById("btnLoadSampleLive")!.addEventListener("click", loadSampleIntoProject);
  document.getElementById("btnClear")!.addEventListener("click", clearLinks);
  document.getElementById("probTarget")!.addEventListener("input", () => { renderProbability(runCpm()); });
  document.getElementById("projectTitle")!.addEventListener("change", gpiPush);
  document.getElementById("courseTitle")!.addEventListener("change", gpiPush);
}

// ============================ MODO EJEMPLO / VIVO ============================
function enterSample(): void {
  mode = "sample";
  if (!stateSample) stateSample = normSchedule(SAMPLE.schedule);
  render(); setStatus("Modo ejemplo (DISTRIB+): red de demostración; no escribe sobre tu proyecto.");
}
function enterLive(): void { mode = "live"; render(); setStatus("Usando las actividades y la EDT del proyecto activo."); }

// ============================ PUENTE CON EL PANEL (GPI) ============================
function gpiPullAll(): void {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
  wbsLive = window.GPI.getModule("wbs") ?? null;
  actsLive = window.GPI.getModule("activities") ?? null;
  pertLive = window.GPI.getModule("pert") ?? null;
  spLive = window.GPI.getModule("schedulePlan") ?? null;
}

// ============================ CARGAR EJEMPLO EN EL PROYECTO ============================
// A diferencia de "Modo ejemplo" (sandbox: nunca toca el proyecto activo,
// dataset chico y congelado de regresión CPM), esta acción SÍ agrega
// enlaces al proyecto activo real -- mismo patrón que ya usan
// "activities" y "cost-estimate" para su propio "⇩ Cargar ejemplo en el
// proyecto". Existe porque, si el alumno ya cargó el ejemplo DISTRIB+ en
// WBS Builder + Definir las Actividades (18 paquetes, 43 actividades
// reales), este módulo seguía viendo esas actividades SIN enlaces: la
// tabla y la Red/Gantt aparecían vacías de predecesoras.
//
// reconcileImportRows() de "activities"/"cost-estimate" asigna ids NUEVOS
// a cada actividad al sembrar el proyecto real (no hay passthrough del id
// "a1".."a43" del sandbox), así que SAMPLE_LINK_PLAN no puede usar ids
// fijos: cada enlace se define por (Código EDT, nombre exacto de la
// actividad) en ambos extremos y se resuelve contra el proyecto real
// recién antes de aplicar -- mismo criterio de emparejamiento por nombre
// que ya usa cost-estimate/main.ts en su reconcileImportRows().
function normName(s: string): string { return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function findRealActivityId(code: string, name: string): string | null {
  const target = normName(name);
  const pkg = treeRows().filter((r) => r.kind === "package" && r.code === code)[0];
  if (pkg) {
    const acts = (actsData().byLeaf || {})[pkg.id] || [];
    const hit = acts.filter((a) => normName(a.name || "") === target)[0];
    if (hit) return hit.id;
  }
  // No es (o no coincidió) un paquete -- puede ser un hito (código propio
  // "H1"/"H2"..., no un Código EDT). Mismo criterio de emparejamiento por
  // nombre normalizado que para actividades.
  const ms = (actsData().milestones || []).filter((m) => m.code === code && normName(m.name) === target)[0];
  return ms ? ms.id : null;
}
async function loadSampleIntoProject(): Promise<void> {
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) {
    await showAlert("Esto solo aplica con un proyecto activo conectado al Panel de Control. Usa \"Modo ejemplo\" para explorar el caso DISTRIB+ sin conexión.");
    return;
  }
  gpiPullAll();
  const prevMode = mode;
  mode = "live"; // treeRows()/actsData() deben mirar el proyecto REAL, no el sandbox
  const pkgs = treeRows().filter((r) => r.kind === "package");
  if (!pkgs.length) {
    mode = prevMode;
    await showAlert("La EDT del proyecto activo está vacía. Carga primero el ejemplo en WBS Builder (\"Cargar ejemplo\") y vuelve aquí.");
    return;
  }
  const hasActs = pkgs.some((p) => ((actsData().byLeaf || {})[p.id] || []).length > 0);
  if (!hasActs) {
    mode = prevMode;
    await showAlert("El proyecto activo todavía no tiene actividades. Carga primero el ejemplo en Definir las Actividades (\"⇩ Cargar ejemplo en el proyecto\") y vuelve aquí.");
    return;
  }
  const resolved: { from: string; to: string; type: ScheduleLinkType; lag: number; lagUnit: ScheduleLagUnit }[] = [];
  const unresolved: string[] = [];
  SAMPLE_LINK_PLAN.forEach((e) => {
    const from = findRealActivityId(e.fc, e.fn), to = findRealActivityId(e.tc, e.tn);
    if (from && to && from !== to) resolved.push({ from, to, type: e.type, lag: e.lag || 0, lagUnit: e.lagUnit || "d" });
    else unresolved.push(e.fc + " \"" + e.fn + "\" → " + e.tc + " \"" + e.tn + "\"");
  });
  if (!resolved.length) {
    mode = prevMode;
    await showAlert("Ningún enlace del ejemplo coincide con las actividades reales del proyecto (Código EDT + nombre). Revisa que hayas cargado el mismo ejemplo en Definir las Actividades.");
    return;
  }
  let msg = "Se reemplazarán los enlaces del PROYECTO ACTIVO (no el modo ejemplo) por los " + resolved.length + " enlace(s) del ejemplo DISTRIB+ que coinciden con sus actividades reales.";
  if (unresolved.length) {
    msg += " " + unresolved.length + " enlace(s) del ejemplo no se pudieron ubicar (¿cargaste el mismo ejemplo en Definir las Actividades?): " + unresolved.slice(0, 8).join("; ") + (unresolved.length > 8 ? "…" : "") + ".";
  }
  const ok = await showConfirm(msg, "Cargar ejemplo en el proyecto");
  if (!ok) { mode = prevMode; render(); return; }
  const st = state();
  st.links = resolved.map((r, i) => ({ id: "L" + (i + 1), from: r.from, to: r.to, type: r.type, lag: r.lag, lagUnit: r.lagUnit, source: "import" as const }));
  st.linkCounter = st.links.length + 1;
  st.import = null;
  st.baseline = null;
  commit("Ejemplo DISTRIB+ cargado en el proyecto activo (" + resolved.length + " enlace(s)).");
}

let initialized = false;
function init(): void {
  if (initialized) return; initialized = true;
  wireToolbar(); wireTabs(); buildDurToggle();

  if (typeof window.GPI === "undefined") {
    const bn0 = document.getElementById("banner") as HTMLElement; bn0.classList.add("show");
    bn0.innerHTML = "<b>No se pudo cargar <code>gpi-core.js</code>.</b> Abre este archivo junto al núcleo y los demás módulos desde un servidor local o GitHub Pages para calcular el cronograma.";
    return;
  }
  GPI = window.GPI;

  if (window.GPI.available() && window.GPI.active()) {
    const proj = window.GPI.active();
    loadedProjectId = window.GPI.activeId();
    if (proj && proj.meta) {
      if (proj.meta.name) (document.getElementById("projectTitle") as HTMLInputElement).value = proj.meta.name;
      if (proj.meta.course) (document.getElementById("courseTitle") as HTMLInputElement).value = proj.meta.course;
    }
    gpiPullAll();
    session = window.GPI.openSession("schedule"); // versión que esta pestaña carga
    const mod = window.GPI.getModule("schedule");
    if (mod) { stateLive = normSchedule(mod); window.GPI.rebaseSession(session, stateLive); }
    if (!wbsLive || !wbsLive.nodes || !actsLive || !Object.keys((actsLive.byLeaf || {})).length) {
      const bn = document.getElementById("banner") as HTMLElement; bn.classList.add("show");
      bn.innerHTML = "<b>Aún no hay actividades para programar.</b> Define la EDT y descompón sus paquetes en actividades (módulos de Alcance y «Definir las Actividades»). Mientras tanto puedes explorar el <b>Modo ejemplo</b>.";
    }
    window.addEventListener("beforeunload", gpiPush);
    document.addEventListener("visibilitychange", () => { if (document.hidden) gpiPush(); });
    window.GPI.onChange(() => {
      if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; }
      if (mode === "live") { gpiPullAll(); render(); }
    });
    gpiBadge(proj ? (proj.meta && proj.meta.name) : "", gpiPush);
    setStatus("Proyecto cargado desde el Panel de Control.");
    render();
  } else {
    const bn2 = document.getElementById("banner") as HTMLElement; bn2.classList.add("show");
    bn2.innerHTML = "<b>Sin proyecto activo.</b> Abre el <a href='Panel_Control.html'>Panel de Control</a> para crear o seleccionar uno. Mientras tanto trabajas con el <b>Modo ejemplo</b>.";
    enterSample();
  }
}

function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.className = "gpi-badge";
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + String(name || "—").replace(/</g, "&lt;") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  const sb = bar.querySelector("#gpiSyncBtn");
  if (sb) sb.addEventListener("click", () => { const ok = pushFn(); const t = sb.textContent; sb.textContent = ok ? "✓ Sincronizado" : "⚠ Sin sincronizar"; setTimeout(() => { sb.textContent = t; }, 1400); });
}

// ============================ PLAN DE ENLACES DEL EJEMPLO (proyecto real) ============================
// Red de precedencias para las 43 actividades / 18 paquetes / 3 hitos
// (H1/H2/H3) del catálogo canónico DISTRIB+ (ver sampleActivities() en
// src/modules/activities/main.ts y ARCHITECTURE.md, "Dataset de
// referencia (DISTRIB+)"). Cada entrada se identifica por (Código EDT o
// código de hito, nombre exacto) en vez de un id, porque los ids reales
// los asigna reconcileImportRows() al sembrar el proyecto -- ver
// loadSampleIntoProject() más abajo (findRealActivityId() resuelve
// ambos casos: paquete+actividad o hito). Diseño: cadena FS dentro de
// cada paquete (mismo orden que sampleActivities()) + conectores entre
// paquetes que siguen la secuencia real de un proyecto de construcción
// (con algo de paralelismo -- SS+lag -- para que el CPM resultante tenga
// ruta crítica y holgura, no una sola cadena lineal); los 3 hitos quedan
// agendados como nodos reales (duración 0): H1 antes de la primera
// actividad, H2 entre Cimentaciones y Estructura, H3 después de la
// última actividad.
interface SampleLinkPlanEntry { fc: string; fn: string; tc: string; tn: string; type: ScheduleLinkType; lag?: number; lagUnit?: ScheduleLagUnit; }
const SAMPLE_LINK_PLAN: SampleLinkPlanEntry[] = [
  // ---- cadenas dentro de cada paquete ----
  { fc: "1.2", fn: "Plan para la dirección del proyecto (líneas base)", tc: "1.2", tn: "Planes subsidiarios de gestión", type: "FS" },
  { fc: "1.3", fn: "Elaboración de informes mensuales de avance", tc: "1.3", tn: "Reuniones de control y seguimiento del proyecto", type: "FS" },
  { fc: "2.1", fn: "Calicatas exploratorias", tc: "2.1", tn: "Ensayos de laboratorio de suelos", type: "FS" },
  { fc: "2.1", fn: "Ensayos de laboratorio de suelos", tc: "2.1", tn: "Informe geotécnico", type: "FS" },
  { fc: "2.2", fn: "Memoria de cálculo estructural", tc: "2.2", tn: "Planos estructurales", type: "FS" },
  { fc: "2.3", fn: "Memoria de cálculo eléctrico y sanitario", tc: "2.3", tn: "Planos eléctricos y sanitarios", type: "FS" },
  { fc: "2.4", fn: "Trámite de licencia de edificación municipal", tc: "2.4", tn: "Trámite de certificado ITSE", type: "FS" },
  { fc: "3.1", fn: "Fabricación de estructuras metálicas", tc: "3.1", tn: "Transporte y entrega de estructuras a obra", type: "FS" },
  { fc: "3.2", fn: "Adquisición y suministro de cemento y agregados", tc: "3.2", tn: "Adquisición y suministro de materiales varios de construcción", type: "FS" },
  { fc: "3.3", fn: "Adquisición de tableros y equipos eléctricos", tc: "3.3", tn: "Adquisición de equipos de instalaciones sanitarias", type: "FS" },
  { fc: "4.1", fn: "Corte y excavación masiva", tc: "4.1", tn: "Relleno y compactación con material propio", type: "FS" },
  { fc: "4.1", fn: "Relleno y compactación con material propio", tc: "4.1", tn: "Eliminación de material excedente", type: "FS" },
  { fc: "4.1", fn: "Eliminación de material excedente", tc: "4.1", tn: "Nivelación y perfilado de plataforma", type: "FS" },
  { fc: "4.2", fn: "Excavación de zanjas para zapatas", tc: "4.2", tn: "Solado de concreto e=10 cm", type: "FS" },
  { fc: "4.2", fn: "Solado de concreto e=10 cm", tc: "4.2", tn: "Acero de refuerzo fy=4200 kg/cm²", type: "FS" },
  { fc: "4.2", fn: "Acero de refuerzo fy=4200 kg/cm²", tc: "4.2", tn: "Concreto f'c=280 kg/cm² en zapatas", type: "FS" },
  { fc: "4.2", fn: "Concreto f'c=280 kg/cm² en zapatas", tc: "4.2", tn: "Encofrado y desencofrado de cimentaciones", type: "FS" },
  { fc: "4.3", fn: "Montaje de columnas metálicas", tc: "4.3", tn: "Montaje de vigas y tijerales", type: "FS" },
  { fc: "4.3", fn: "Montaje de vigas y tijerales", tc: "4.3", tn: "Instalación de cobertura TR-4", type: "FS" },
  { fc: "4.4", fn: "Tarrajeo de muros y cielorrasos", tc: "4.4", tn: "Pintura general de interiores y exteriores", type: "FS" },
  { fc: "4.4", fn: "Pintura general de interiores y exteriores", tc: "4.4", tn: "Cerramiento perimétrico", type: "FS" },
  { fc: "4.5", fn: "Instalación de tableros y circuitos eléctricos", tc: "4.5", tn: "Instalación de redes sanitarias", type: "FS" },
  { fc: "5.1", fn: "Pruebas de tableros y circuitos eléctricos", tc: "5.1", tn: "Pruebas hidráulicas de redes sanitarias", type: "FS" },
  { fc: "5.2", fn: "Capacitación operativa al personal del cliente", tc: "5.2", tn: "Elaboración de manuales de operación y mantenimiento", type: "FS" },
  { fc: "5.3", fn: "Elaboración de dossier de calidad y planos as-built", tc: "5.3", tn: "Acta de entrega y cierre del proyecto", type: "FS" },
  // ---- Hitos: inicio y cierre del proyecto (H2 -- Fin de Cimentaciones --
  // se enlaza más abajo, entre 4.2 y 4.3, donde corresponde) ----
  { fc: "H1", fn: "Inicio del Proyecto", tc: "1.1", tn: "Elaboración y aprobación del acta de constitución", type: "FS" },
  { fc: "5.3", fn: "Acta de entrega y cierre del proyecto", tc: "H3", tn: "Cierre del Proyecto", type: "FS" },
  // ---- Dirección de Proyecto → arranque de Ingeniería ----
  { fc: "1.1", fn: "Elaboración y aprobación del acta de constitución", tc: "1.2", tn: "Plan para la dirección del proyecto (líneas base)", type: "FS" },
  { fc: "1.2", fn: "Planes subsidiarios de gestión", tc: "1.3", tn: "Elaboración de informes mensuales de avance", type: "FS" },
  { fc: "1.2", fn: "Planes subsidiarios de gestión", tc: "2.1", tn: "Calicatas exploratorias", type: "FS" },
  // ---- Ingeniería: suelos → estructural → (eléctrico en paralelo) → permisos ----
  { fc: "2.1", fn: "Informe geotécnico", tc: "2.2", tn: "Memoria de cálculo estructural", type: "FS" },
  { fc: "2.2", fn: "Memoria de cálculo estructural", tc: "2.3", tn: "Memoria de cálculo eléctrico y sanitario", type: "SS", lag: 5, lagUnit: "d" },
  { fc: "2.2", fn: "Planos estructurales", tc: "2.4", tn: "Trámite de licencia de edificación municipal", type: "FS" },
  { fc: "2.3", fn: "Planos eléctricos y sanitarios", tc: "2.4", tn: "Trámite de licencia de edificación municipal", type: "FS" },
  // ---- Procura en paralelo (arranca con diseño/permisos, no espera todo) ----
  { fc: "2.2", fn: "Planos estructurales", tc: "3.1", tn: "Fabricación de estructuras metálicas", type: "FS" },
  { fc: "2.4", fn: "Trámite de licencia de edificación municipal", tc: "3.2", tn: "Adquisición y suministro de cemento y agregados", type: "SS", lag: 10, lagUnit: "d" },
  { fc: "2.3", fn: "Planos eléctricos y sanitarios", tc: "3.3", tn: "Adquisición de tableros y equipos eléctricos", type: "FS" },
  // ---- Construcción: permisos habilitan movimiento de tierras ----
  { fc: "2.4", fn: "Trámite de certificado ITSE", tc: "4.1", tn: "Corte y excavación masiva", type: "FS" },
  { fc: "4.1", fn: "Nivelación y perfilado de plataforma", tc: "4.2", tn: "Excavación de zanjas para zapatas", type: "FS" },
  { fc: "3.2", fn: "Adquisición y suministro de materiales varios de construcción", tc: "4.2", tn: "Acero de refuerzo fy=4200 kg/cm²", type: "FS" },
  { fc: "4.2", fn: "Encofrado y desencofrado de cimentaciones", tc: "H2", tn: "Fin de Cimentaciones", type: "FS" },
  { fc: "H2", fn: "Fin de Cimentaciones", tc: "4.3", tn: "Montaje de columnas metálicas", type: "FS" },
  { fc: "3.1", fn: "Transporte y entrega de estructuras a obra", tc: "4.3", tn: "Montaje de columnas metálicas", type: "FS" },
  { fc: "4.3", fn: "Instalación de cobertura TR-4", tc: "4.4", tn: "Tarrajeo de muros y cielorrasos", type: "FS" },
  { fc: "4.3", fn: "Montaje de vigas y tijerales", tc: "4.5", tn: "Instalación de tableros y circuitos eléctricos", type: "SS", lag: 8, lagUnit: "d" },
  { fc: "3.3", fn: "Adquisición de equipos de instalaciones sanitarias", tc: "4.5", tn: "Instalación de redes sanitarias", type: "FS" },
  // ---- Pruebas, capacitación y cierre ----
  { fc: "4.4", fn: "Cerramiento perimétrico", tc: "5.1", tn: "Pruebas de tableros y circuitos eléctricos", type: "SS", lag: 3, lagUnit: "d" },
  { fc: "4.5", fn: "Instalación de redes sanitarias", tc: "5.1", tn: "Pruebas hidráulicas de redes sanitarias", type: "FS" },
  { fc: "5.1", fn: "Pruebas hidráulicas de redes sanitarias", tc: "5.2", tn: "Capacitación operativa al personal del cliente", type: "FS" },
  { fc: "5.1", fn: "Pruebas hidráulicas de redes sanitarias", tc: "5.3", tn: "Elaboración de dossier de calidad y planos as-built", type: "FS" },
  { fc: "5.2", fn: "Elaboración de manuales de operación y mantenimiento", tc: "5.3", tn: "Elaboración de dossier de calidad y planos as-built", type: "FS" }
];

// ============================ DATOS DE EJEMPLO (DISTRIB+) ============================
const SAMPLE: { wbs: WbsModule; acts: ActivitiesModule; pert: PertModule; schedule: ScheduleState; cal: ProjectCalendar; startDate: string } = (function () {
  // Mismo caso DISTRIB+ que "Definir las Actividades" y "Análisis PERT":
  // así el alumno recorre EDT → actividades → PERT → CPM sin cambiar de universo.
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

  let n = 0;
  function A(name: string, unit: string, qty: number, perf?: number, teams?: number) {
    return { id: "a" + (++n), name, unit, qty, perf: perf == null ? "" : perf, teams: teams == null ? 1 : teams };
  }
  const by: Record<string, ReturnType<typeof A>[]> = {};
  by[p21] = [A("Calicatas exploratorias", "und", 8, 2), A("Informe geotécnico", "doc", 1, 0.25)];
  by[p22] = [A("Memoria de cálculo estructural", "doc", 1, 0.1), A("Planos estructurales", "lám", 24, 2)];
  by[p41] = [A("Corte y excavación masiva", "m³", 4800, 320, 2), A("Relleno y compactación", "m³", 2100, 250), A("Eliminación de excedentes", "m³", 2700, 300)];
  by[p42] = [A("Excavación de zanjas", "m³", 620, 60, 2), A("Acero de refuerzo", "kg", 38500, 2500, 2), A("Concreto f'c=280 en zapatas", "m³", 410, 45, 2)];
  by[p43] = [A("Montaje de columnas metálicas", "und", 48, 6), A("Instalación de cobertura TR-4", "m²", 5200, 350, 2)];
  // Duraciones base Met/(#Eq×R): a1=4 a2=4 a3=10 a4=12 a5=8 a6=9 a7=9 a8=6 a9=8 a10=5 a11=8 a12=8
  const pert: PertModule = {
    inputMode: "dias", byActivity: {
      a1: { o: "3", m: "", mAuto: true, p: "7" },
      a2: { o: "3", m: "", mAuto: true, p: "6" },
      a3: { o: "8", m: "", mAuto: true, p: "18" },
      a4: { o: "10", m: "", mAuto: true, p: "20" },
      a5: { o: "6", m: "", mAuto: true, p: "14" },
      a6: { o: "8", m: "10", mAuto: false, p: "13" },
      a7: { o: "7", m: "", mAuto: true, p: "14" },
      a8: { o: "5", m: "", mAuto: true, p: "10" },
      a9: { o: "6", m: "", mAuto: true, p: "12" },
      a10: { o: "4", m: "", mAuto: true, p: "9" },
      a11: { o: "6", m: "", mAuto: true, p: "11" },
      a12: { o: "7", m: "", mAuto: true, p: "13" }
    }
  };
  const schedule: ScheduleState = {
    linkCounter: 14, import: null, baseline: null, links: [
      { id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d", source: "import" },
      { id: "L2", from: "a2", to: "a3", type: "FS", lag: 0, lagUnit: "d", source: "import" },
      { id: "L3", from: "a3", to: "a4", type: "SS", lag: 4, lagUnit: "d", source: "import" },
      { id: "L4", from: "a2", to: "a5", type: "FS", lag: 0, lagUnit: "d", source: "import" },
      { id: "L5", from: "a5", to: "a6", type: "SS", lag: 3, lagUnit: "d", source: "import" },
      { id: "L6", from: "a5", to: "a7", type: "SS", lag: 2, lagUnit: "d", source: "import" },
      { id: "L7", from: "a6", to: "a8", type: "FS", lag: 0, lagUnit: "d", source: "import" },
      { id: "L8", from: "a7", to: "a8", type: "FS", lag: 0, lagUnit: "d", source: "import" },
      { id: "L9", from: "a4", to: "a8", type: "FS", lag: 0, lagUnit: "d", source: "import" },
      { id: "L10", from: "a8", to: "a9", type: "FS", lag: 0, lagUnit: "d", source: "import" },
      { id: "L11", from: "a9", to: "a10", type: "SS", lag: 2, lagUnit: "d", source: "import" },
      { id: "L12", from: "a10", to: "a11", type: "FS", lag: 3, lagUnit: "d", source: "import" },
      { id: "L13", from: "a11", to: "a12", type: "SS", lag: 5, lagUnit: "d", source: "import" }
    ]
  };
  return {
    wbs: { rootId: root, idCounter: k + 1, nodes },
    acts: { idCounter: n + 1, byLeaf: by }, pert, schedule,
    cal: { workDayIdx: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [], provisional: false },
    startDate: "2026-07-06"
  };
})();

document.addEventListener("DOMContentLoaded", init);
