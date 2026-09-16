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
import type { CpmNode, CpmResult, PertProbabilityResult, ProjectCalendar, ScheduleValidateResult } from "../../core/gpi-core";
import type { ActivitiesModule, PertModule, SchedulePlanModule, ScheduleLagUnit, ScheduleLinkType, WbsModule } from "../../core/types";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ============================ ESTADO ============================
// El módulo LEE actividades (module "activities"), EDT (module "wbs") y
// PERT (module "pert") en vivo desde gpi-core, y GUARDA solo su rebanada
// "schedule" (enlaces + auditoría). Nada derivado (ES/EF/…) se persiste.
interface Link { id: string; from: string; to: string; type: ScheduleLinkType; lag: number; lagUnit: ScheduleLagUnit; source: "manual" | "paste"; }
interface ImportInfo { at: number; tool: string; rowMap: Record<number, string>; dates: Record<string, { start: string; finish: string }>; }
interface ScheduleState { links: Link[]; linkCounter: number; import: ImportInfo | null; baseline: unknown | null; }

let mode: "live" | "sample" = "live";
let stateLive: ScheduleState = { links: [], linkCounter: 1, import: null, baseline: null };
let stateSample: ScheduleState | null = null;
let wbsLive: WbsModule | null = null, actsLive: ActivitiesModule | null = null, pertLive: PertModule | null = null, spLive: SchedulePlanModule | null = null;
let durMode: "det" | "pert" = "det";

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

interface PertIdxEntry { dur: number | null; te: number | null; variance: number | null; valid: boolean; }
// Índice PERT por actividad: {dur (determinística), te, variance}
function pertIndex(): Record<string, PertIdxEntry> {
  const idx: Record<string, PertIdxEntry> = {};
  try {
    const st = GPI!.util.pertStats(pertData(), actsData(), wbsData());
    (st.rows || []).forEach((r) => { idx[r.id] = { dur: r.dur, te: r.te, variance: r.variance, valid: r.valid }; });
  } catch (_) { /* noop */ }
  return idx;
}

interface Row {
  netId: number; kind: "project" | "summary" | "activity"; subkind?: "phase" | "package";
  code: string; name: string; depth?: number; activityId: string | null; leafId?: string;
  det?: number | null; te?: number | null; variance?: number | null; pertValid?: boolean;
}

// Snapshot de filas estilo MS Project (0=proyecto, luego fases/paquetes/
// actividades) — la instantánea que consume GPI.util.buildScheduleLinks y
// la fuente del Id. (netId), consecutivo SIN SALTOS igual que el Task ID de
// MS Project. Este Id. coincide con el de Análisis PERT siempre (tampoco
// procesa hitos) y con el de Definir las Actividades/Estimar los Costos
// hasta el primer hito del proyecto -- ahí esos dos SÍ le asignan un número
// real (nunca un hueco, para no romper su propia correlación 1:1 con MS
// Project), así que sus filas posteriores a un hito quedan corridas
// respecto de este módulo y de PERT, que no ven hitos en absoluto.
function fullRowsSnapshot(): Row[] {
  const w = wbsData(), act = actsData(), idx = pertIndex(), out: Row[] = [];
  if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
  let n = 0; const rootName = ((w.nodes[w.rootId].name || "").trim()) || metaName() || "Proyecto";
  out.push({ netId: n++, kind: "project", code: "0", name: rootName, activityId: null });
  treeRows().forEach((r) => {
    if (r.kind === "phase") { out.push({ netId: n++, kind: "summary", subkind: "phase", code: r.code, name: r.name, depth: r.depth, activityId: null }); } else {
      out.push({ netId: n++, kind: "summary", subkind: "package", code: r.code, name: r.name, depth: r.depth, activityId: null });
      ((act.byLeaf || {})[r.id] || []).forEach((a, i) => {
        const info = idx[a.id] || ({} as Partial<PertIdxEntry>);
        out.push({ netId: n++, kind: "activity", code: r.code + "." + (i + 1), name: a.name || "", activityId: a.id, leafId: r.id, det: info.dur, te: info.te, variance: info.variance, pertValid: info.valid });
      });
    }
  });
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
      html += "<tr class='act-row" + (crit ? " crit" : "") + "'>" +
        "<td class='n-cell'>" + r.netId + "</td>" +
        "<td class='code-cell'>" + esc(r.code) + "</td>" +
        "<td class='act-name'>" + esc(r.name) + (crit ? " <span class='crit-badge'>CRÍTICA</span>" : "") + (node.hasDur ? "" : " <span style='color:var(--warn);font-size:10px' title='La actividad no tiene metrado/rendimiento ni PERT: dur=0'>⚠ sin duración</span>") + "</td>" +
        "<td class='num'>" + (dur != null ? fmt(dur) : "—") + "</td>" +
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
  if (!hasLinks) out.push({ c: "warn", ic: "▤", t: "Aún no hay enlaces. Usa <b>📋 Pegar cronograma</b> o <b>＋ Enlace manual</b> para construir la red." });
  else if (R.cpm.ok && !R.val.dangling.length && !R.val.selfLoops.length) out.push({ c: "ok", ic: "✓", t: "Red válida y acíclica — CPM calculado." });
  box.innerHTML = out.map((i) => "<div class='issue " + i.c + "'><span class='ic'>" + i.ic + "</span><span>" + i.t + "</span></div>").join("");
}

interface CriticalPertSums { sumTe: number; sumVar: number; allValid: boolean; count: number; }
function criticalPertSums(R: RunCpmResult): CriticalPertSums {
  const idx: Record<string, Row> = {}; R.snap.forEach((r) => { if (r.kind === "activity") idx[r.activityId as string] = r; });
  let sumTe = 0, sumVar = 0, allValid = true, count = 0;
  (R.cpm.ok ? R.cpm.criticalIds : []).forEach((id) => {
    const r = idx[id]; count++;
    if (r && r.te != null && r.variance != null && r.pertValid !== false) { sumTe += r.te; sumVar += r.variance; } else allValid = false;
  });
  return { sumTe, sumVar, allValid: allValid && count > 0, count };
}

function renderProbability(R: RunCpmResult): void {
  const out = document.getElementById("probOut") as HTMLElement;
  const t = parseFloat((document.getElementById("probTarget") as HTMLInputElement).value);
  if (!R.cpm.ok) { out.innerHTML = "<div class='p'>—</div><div class='z'>red con ciclo</div>"; return; }
  const s = criticalPertSums(R);
  if (!s.allValid) { out.innerHTML = "<div class='p'>—</div><div class='z'>completa O/M/P en PERT para la ruta crítica</div>"; return; }
  if (!isFinite(t) || t <= 0) { out.innerHTML = "<div class='p'>—</div><div class='z'>ΣTE=" + fmt(s.sumTe) + " d · ingresa un plazo objetivo</div>"; return; }
  const pr = GPI!.util.pertProbability(s.sumTe, s.sumVar, t) as PertProbabilityResult;
  const pct = Math.round(pr.prob * 1000) / 10;
  out.innerHTML = "<div class='p'>" + pct + "%</div><div class='z'>P(fin ≤ " + fmt(t) + " d) · Z=" + fmt(pr.z) + " · ΣTE=" + fmt(s.sumTe) + " σ=" + fmt(pr.sigma) + "</div>";
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
  (["tabla", "red", "gantt"] as const).forEach((k) => {
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
  const cmap = codeOf(R.snap), nmap = nameOf(R.snap);
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
    const nm = nmap[id] || "", nmS = nm.length > 24 ? nm.slice(0, 23) + "…" : nm;
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
    svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 50) + "' font-size='9' fill='#6c5ce7' text-anchor='middle'>EDT " + esc(cmap[id] || "") + "</text>";
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
  const D = Math.max(1, Math.ceil(R.cpm.projectDuration));
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
    let nm = (codeOf(R.snap)[r.activityId as string] || "") + " " + (r.name || "");
    if (nm.length > 30) nm = nm.slice(0, 29) + "…";
    svg += "<text x='10' y='" + (y + RH / 2 + 3) + "' font-size='10.5' fill='#1a2027' style='font-family:var(--display);font-weight:600'>" + esc(nm) + "</text>";
    const bx = LW + row.es * dayW, bw = Math.max(4, (row.ef - row.es) * dayW);
    svg += "<rect x='" + bx + "' y='" + (y + 4) + "' width='" + bw + "' height='" + (RH - 10) + "' rx='4' fill='" + col + "' opacity='" + (crit ? 1 : 0.85) + "'/>";
    // holgura total (barra tenue tras el bar hasta LF)
    if (row.tf > 1e-6) { const sx = LW + row.ef * dayW, sw = row.tf * dayW; svg += "<rect x='" + sx + "' y='" + (y + RH / 2 - 1.5) + "' width='" + sw + "' height='3' fill='#c7d3de'/>"; }
    svg += "<text x='" + (bx + bw + 5) + "' y='" + (y + RH / 2 + 3) + "' font-size='9' fill='#6b7684'>" + fmt(row.ef - row.es) + "d</text>";
  });
  svg += "</svg>";
  wrap.innerHTML = svg;
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
function gpiPush(): void {
  if (mode === "sample") return;
  if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
  window.GPI.setModule("schedule", stateLive);
  window.GPI.patchMeta({ name: (document.getElementById("projectTitle") as HTMLInputElement).value, course: (document.getElementById("courseTitle") as HTMLInputElement).value });
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
  function optsHTML(): string { return acts.map((a) => "<option value='" + a.activityId + "'>" + esc(a.netId + " · EDT " + a.code + " · " + a.name) + "</option>").join(""); }
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

// ============================ PEGADO (Excel / MS Project) ============================
function pad2(n: number): string { return (n < 10 ? "0" : "") + n; }
function parseDateCell(s: unknown): string {
  const str = String(s || "").trim(); if (!str) return "";
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str); if (m) return m[1] + "-" + pad2(+m[2]) + "-" + pad2(+m[3]);
  m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(str);
  if (m) { const d = +m[1], mo = +m[2]; let y = +m[3]; if (y < 100) y += 2000; return y + "-" + pad2(mo) + "-" + pad2(d); }
  return "";
}
interface PastedRowLocal { netId: number; name: string; start: string; finish: string; predCell: string; }
function analyzePaste(text: string) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  const pasted: PastedRowLocal[] = [];
  lines.forEach((ln) => {
    const c = ln.split("\t");
    const netStr = (c[0] || "").trim();
    if (!/^\d+$/.test(netStr)) return; // salta encabezados o filas sin Id. numérico
    const cols = c.length;
    let name = (c[1] || "").trim();
    const start = parseDateCell(cols >= 5 ? c[3] : "");
    const finish = parseDateCell(cols >= 5 ? c[4] : "");
    const predCell = cols >= 6 ? c[5] : (cols === 2 ? c[1] : (c[cols - 1] || ""));
    if (cols === 2) name = "";
    pasted.push({ netId: parseInt(netStr, 10), name, start, finish, predCell });
  });
  const snap = fullRowsSnapshot();
  const res = GPI!.util.buildScheduleLinks(pasted, snap as unknown as Parameters<GpiApi["util"]["buildScheduleLinks"]>[1]) as ReturnType<GpiApi["util"]["buildScheduleLinks"]> & { snap?: Row[]; pastedCount?: number; canApply?: boolean };
  res.snap = snap; res.pastedCount = pasted.length;
  res.canApply = res.links.length > 0 || Object.keys(res.dates).length > 0;
  return res;
}
type AnalyzeResult = ReturnType<typeof analyzePaste>;
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
  let html = "<p style='margin-bottom:10px'>Se interpretaron <b>" + a.pastedCount + "</b> fila(s). Nada se guarda hasta que confirmes.</p>";
  html += sec("✔ Enlaces a crear", a.links.length, "cnt-ok", okList);
  if (a.rejected.length) html += sec("✖ Enlaces rechazados", a.rejected.length, "cnt-bad", errList(a.rejected));
  if (a.rowErrors.length) html += sec("⚠ Filas con problema", a.rowErrors.length, "cnt-warn", errList(a.rowErrors));
  if (a.parseErrors.length) html += sec("⚠ Predecesoras no interpretables", a.parseErrors.length, "cnt-warn", a.parseErrors.map((e) => "<div class='row'><span>Id. " + e.netId + " · «" + esc(e.raw) + "»</span><span class='reason warn'>" + esc(REASON[e.reason] || e.reason) + "</span></div>").join(""));
  if (a.duplicates.length) html += sec("● Duplicados (colapsados)", a.duplicates.length, "cnt-warn", "");
  html += sec("📅 Fechas para auditoría", datesN, "cnt-ok", "");
  if (a.canApply) {
    html += "<div class='radio-row'><label><input type='radio' name='mergeMode' value='merge' checked> Fusionar con lo existente</label><label><input type='radio' name='mergeMode' value='replace'> Reemplazar todo</label></div>";
  } else {
    html += "<div class='issue warn' style='margin-top:8px'><span class='ic'>⚠</span><span>No hay nada aplicable. Revisa que pegaste la columna <b>Predecesoras</b> con los Id. de esta plantilla.</span></div>";
  }
  return html;
}
function applyPaste(a: AnalyzeResult, mergeMode: string): void {
  const st = state();
  const newLinks: Link[] = a.links.map((l) => ({ ...l, id: newLinkId(), source: "paste" as const }));
  if (mergeMode === "replace") { st.links = newLinks; } else {
    const seen: Record<string, boolean> = {}; (st.links || []).forEach((l) => { seen[l.from + "|" + l.to + "|" + l.type] = true; });
    newLinks.forEach((l) => { const k = l.from + "|" + l.to + "|" + l.type; if (!seen[k]) { st.links.push(l); seen[k] = true; } });
  }
  const rowMap: Record<number, string> = {}; (a.snap as Row[]).forEach((r) => { if (r.kind === "activity") rowMap[r.netId] = r.activityId as string; });
  const dates: Record<string, { start: string; finish: string }> = {};
  if (mergeMode !== "replace" && st.import && st.import.dates) Object.assign(dates, st.import.dates);
  Object.assign(dates, a.dates);
  st.import = { at: Date.now(), tool: "msproject-paste", rowMap, dates };
  commit("Cronograma pegado y aplicado (" + newLinks.length + " enlace[s]). Las fechas quedan como auditoría.");
}
function openPaste(): void {
  const html =
    "<p>Pega desde Excel o MS Project las columnas de tu cronograma. La <b>llave de unión es el Id.</b> (0 = proyecto), tal como aparece en la plantilla (botón «⧉ Copiar plantilla»). Orden esperado:</p>" +
    "<div style='font-family:var(--mono);font-size:11px;background:var(--bg-2);border:1px solid var(--panel-border);border-radius:8px;padding:8px 10px;margin-bottom:10px'>Id. &nbsp;·&nbsp; Nombre &nbsp;·&nbsp; Dur &nbsp;·&nbsp; Comienzo &nbsp;·&nbsp; Fin &nbsp;·&nbsp; Predecesoras</div>" +
    "<textarea class='paste-zone' id='pasteTA' placeholder='Pega aquí (Ctrl+V)…'></textarea>" +
    "<div style='font-size:11px;color:#8992a3;margin-top:8px'>Sintaxis de predecesoras: <b>3</b>, <b>3FS+2d</b>, <b>7CC</b> (SS), <b>9FC-1d</b> (lead). Separadores <b>;</b> o <b>,</b>. Se pega la <b>topología</b>; el simulador recalcula las fechas — las fechas pegadas son solo auditoría.</div>";
  showModalHTML({
    wide: true, title: "Pegar cronograma (Excel / MS Project)", html, confirmText: "Analizar ▸", cancelText: "Cancelar",
    afterOpen: (card) => { (card.querySelector("#pasteTA") as HTMLElement).focus(); },
    collect: () => ({ text: (document.getElementById("pasteTA") as HTMLTextAreaElement).value })
  }).then((r) => {
    if (!r || r.text == null) return;
    const a = analyzePaste(r.text);
    showModalHTML({
      wide: true, title: "Previsualización — antes de guardar", html: previewHTML(a),
      confirmText: a.canApply ? "Confirmar ▾" : null, cancelText: "Cancelar",
      collect: a.canApply ? () => { const m = document.querySelector("input[name=mergeMode]:checked") as HTMLInputElement | null; return { mode: m ? m.value : "merge" }; } : undefined
    }).then((c) => { if (c && c.mode) applyPaste(a, c.mode); });
  });
}

// ============================ PLANTILLA / EXPORT / IMPORT ============================
function copyTemplate(): void {
  const snap = fullRowsSnapshot(), nn = netMap(snap);
  const rows = [["Id.", "Nombre", "Dur (d)", "Comienzo", "Fin", "Predecesoras"].join("\t")];
  snap.forEach((r) => {
    let dur: string | number = "", preds = "";
    if (r.kind === "activity") {
      dur = (r.det != null ? r.det : "");
      preds = incoming(r.activityId as string).map((l) => linkToken(l, nn)).filter(Boolean).join("; ");
    }
    rows.push([r.netId, r.name, dur, "", "", preds].join("\t"));
  });
  const tsv = rows.join("\n");
  function ok() { setStatus("Plantilla copiada al portapapeles — pégala en Excel o MS Project."); showAlert("Plantilla copiada. Pégala en Excel o MS Project, completa Comienzo/Fin y Predecesoras usando los Id., y vuelve a pegarla aquí con «📋 Pegar cronograma».", "Plantilla copiada"); }
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(tsv).then(ok, () => { fallbackCopy(tsv); ok(); }); } else { fallbackCopy(tsv); ok(); }
}
function fallbackCopy(t: string): void { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (_) { /* noop */ } ta.remove(); }

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
  const cmap = codeOf(snap), nmap = nameOf(snap), nn = netMap(snap);
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
    const path = cpm.criticalIds.map((id) => (cmap[id] || "") + " " + (nmap[id] || ""));
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
    h += "<tr><td class='num'>" + r.netId + "</td><td class='num'>" + esc(r.code) + "</td><td>" + esc(r.name) + "</td><td class='num'>" + fmt(dur) + "</td>" +
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
  h += "<p class='rep-note'>Auditoría: compara la fecha que calculó el simulador contra la fecha de MS Project que hayas pegado con «📋 Pegar cronograma» — ✓ coinciden, ✗ difieren (revisa calendario o enlaces). Si todavía no pegaste un cronograma real de MS Project, queda en “—”: no hay nada que auditar por ahora.</p>";
  if (s.allValid) h += "<p class='rep-note'>Ruta crítica: ΣTE = " + fmt(s.sumTe) + " d, Σσ² = " + fmt(s.sumVar) + " (base para la probabilidad de plazo PERT).</p>";
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
  document.getElementById("btnTemplate")!.addEventListener("click", copyTemplate);
  document.getElementById("btnPaste")!.addEventListener("click", openPaste);
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
  const pkg = treeRows().filter((r) => r.kind === "package" && r.code === code)[0];
  if (!pkg) return null;
  const acts = (actsData().byLeaf || {})[pkg.id] || [];
  const target = normName(name);
  const hit = acts.filter((a) => normName(a.name || "") === target)[0];
  return hit ? hit.id : null;
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
  st.links = resolved.map((r, i) => ({ id: "L" + (i + 1), from: r.from, to: r.to, type: r.type, lag: r.lag, lagUnit: r.lagUnit, source: "paste" as const }));
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
    if (proj && proj.meta) {
      if (proj.meta.name) (document.getElementById("projectTitle") as HTMLInputElement).value = proj.meta.name;
      if (proj.meta.course) (document.getElementById("courseTitle") as HTMLInputElement).value = proj.meta.course;
    }
    gpiPullAll();
    const mod = window.GPI.getModule("schedule");
    if (mod) stateLive = normSchedule(mod);
    if (!wbsLive || !wbsLive.nodes || !actsLive || !Object.keys((actsLive.byLeaf || {})).length) {
      const bn = document.getElementById("banner") as HTMLElement; bn.classList.add("show");
      bn.innerHTML = "<b>Aún no hay actividades para programar.</b> Define la EDT y descompón sus paquetes en actividades (módulos de Alcance y «Definir las Actividades»). Mientras tanto puedes explorar el <b>Modo ejemplo</b>.";
    }
    window.addEventListener("beforeunload", gpiPush);
    document.addEventListener("visibilitychange", () => { if (document.hidden) gpiPush(); });
    window.GPI.onChange(() => { if (mode === "live") { gpiPullAll(); render(); } });
    gpiBadge(proj ? (proj.meta && proj.meta.name) : "", gpiPush);
    setStatus("Proyecto cargado desde el Panel de Control.");
    render();
  } else {
    const bn2 = document.getElementById("banner") as HTMLElement; bn2.classList.add("show");
    bn2.innerHTML = "<b>Sin proyecto activo.</b> Abre el <a href='Panel_Control.html'>Panel de Control</a> para crear o seleccionar uno. Mientras tanto trabajas con el <b>Modo ejemplo</b>.";
    enterSample();
  }
}

function gpiBadge(name: string | undefined, pushFn: () => void): void {
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.className = "gpi-badge";
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + String(name || "—").replace(/</g, "&lt;") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  const sb = bar.querySelector("#gpiSyncBtn");
  if (sb) sb.addEventListener("click", () => { pushFn(); const t = sb.textContent; sb.textContent = "✓ Sincronizado"; setTimeout(() => { sb.textContent = t; }, 1400); });
}

// ============================ PLAN DE ENLACES DEL EJEMPLO (proyecto real) ============================
// Red de precedencias para las 43 actividades / 18 paquetes del catálogo
// canónico DISTRIB+ (ver sampleActivities() en src/modules/activities/main.ts
// y ARCHITECTURE.md, "Dataset de referencia (DISTRIB+)"). Cada entrada se
// identifica por (Código EDT, nombre exacto de la actividad) en vez de un
// id, porque los ids reales los asigna reconcileImportRows() al sembrar el
// proyecto -- ver loadSampleIntoProject() más abajo. Diseño: cadena FS
// dentro de cada paquete (mismo orden que sampleActivities()) + conectores
// entre paquetes que siguen la secuencia real de un proyecto de
// construcción (con algo de paralelismo -- SS+lag -- para que el CPM
// resultante tenga ruta crítica y holgura, no una sola cadena lineal).
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
  { fc: "4.2", fn: "Encofrado y desencofrado de cimentaciones", tc: "4.3", tn: "Montaje de columnas metálicas", type: "FS" },
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
