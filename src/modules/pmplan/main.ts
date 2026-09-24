/* =========================================================
   Plan para la Dirección del Proyecto — PMBOK (Desarrollar el plan para la dirección del proyecto)
   Módulo NUEVO (no es un port): patrón de Control de Cambios — addEventListener, window.GPI explícito, sin frameworks —
   compilado a plan-direccion.js (IIFE).

   Es el INTEGRADOR: no captura datos propios (salvo el registro de aprobación del plan). Consolida los planes subsidiarios y las
   líneas base de alcance, cronograma y costo de las demás herramientas, las cruza entre sí y arma el documento del plan (Acta,
   alcance con matriz de trazabilidad, EDT, cronograma, costos, riesgos, interesados, equipo, cambios, valor ganado). Al aprobarlo
   guarda una instantánea de las líneas base: si cambian después, avisa que el plan aprobado quedó desactualizado. Lógica PURA en
   src/shared/pm-plan.ts (con sus pruebas); este archivo es la interfaz.

   Regla de oro: no escribe el ejemplo DISTRIB+ (no tiene "Cargar ejemplo" propio): sin proyecto activo muestra un aviso, y con
   proyecto refleja lo que ya cargaron las demás herramientas.
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { EditSession } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { normalizeBaseline } from "../../shared/schedule-control";
import { analyzeWbs } from "../../shared/wbs-quality";
import { normalizeBoe, STATUS_LABEL as BOE_STATUS_LABEL } from "../../shared/boe";
import { modFacts, normalizeCr, portfolio as crPortfolio, type ChangeFacts, type ChangeRequest } from "../../shared/change-control";
import { inherentScore, levelOf, normalizePlan as normalizeRiskPlan, normalizeRisk, portfolio as riskPortfolio, rankRisks } from "../../shared/risk-analysis";
import { QUADRANT_LABEL, levelName, quadrantOf } from "../../shared/stakeholder-engagement";
import { gatherCommFacts, gatherProcurementFacts, gatherQualityFacts } from "../../shared/plan-facts";
import { normalizeScopeBaseline, scopeDriftOf } from "../../shared/scope-baseline";
import { commState, coverage as commCoverage, normalizeComms, type CommData } from "../../shared/comms-plan";
import { COQ_CATS, COQ_LABEL, coqSummary, coverage as qualityCoverage, normalizeQuality, qualityState, type QualityData } from "../../shared/quality-plan";
import { launchBy, normalizeProcurement, procurementState, summary as procSummary, type ProcData } from "../../shared/procurement-plan";
import {
  PLAN_COMPONENTS, STATE_LABEL, approvalBlockers, areaRows, digestOf, emptyBase, emptyFacts, integrationFindings, snapshotDiff, snapshotOf,
  type AreaState, type BaselineFact, type PlanFacts, type PlanSnapshot
} from "../../shared/pm-plan";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
const todayISO = (): string => new Date().toISOString().slice(0, 10);
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.map(rec) : []);
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };
const money = (n: number): string => Math.round(n).toLocaleString("es-PE");
const nl = (s: unknown): string => esc(s).replace(/\n/g, "<br>");

// ---------- registro de aprobación (lo único que este módulo guarda) ----------
// Lo aprobado se CONSERVA (auditoría, alta): `approvedDoc` es el documento tal como se aprobó (HTML inmutable) y `snapshot.digests` la huella de cada
// componente del plan en ese momento. El documento vigente se reconstruye con datos actuales, pero NUNCA reemplaza al aprobado: si algo cambia
// después, el aprobado sigue intacto y lo vigente es un borrador que necesita una nueva versión aprobada. Cada versión anterior conserva el suyo.
interface HistoryEntry { version: string; approvedBy: string; approvedOn: string; snapshot: PlanSnapshot | null; doc: string; }
interface PlanRecord { version: string; status: "borrador" | "aprobado"; preparedBy: string; approvedBy: string; approvedOn: string; notes: string; snapshot: PlanSnapshot | null; approvedDoc: string; history: HistoryEntry[]; }
const blankPlan = (): PlanRecord => ({ version: "1.0", status: "borrador", preparedBy: "", approvedBy: "", approvedOn: "", notes: "", snapshot: null, approvedDoc: "", history: [] });
function normSnapshot(o: unknown): PlanSnapshot | null {
  if (!o || typeof o !== "object") return null;
  const x = rec(o), s: PlanSnapshot = { scopeVersion: str(x.scopeVersion), scopeDate: str(x.scopeDate), requirementsVersion: str(x.requirementsVersion), scheduleVersion: str(x.scheduleVersion), scheduleDate: str(x.scheduleDate), scheduleFinish: str(x.scheduleFinish), bacCurrent: num(x.bacCurrent), costBaseline: str(x.costBaseline), boeStatus: str(x.boeStatus) };
  if (x.digests && typeof x.digests === "object") { const d: Record<string, string> = {}; Object.keys(rec(x.digests)).forEach((k) => { d[k] = str(rec(x.digests)[k]); }); s.digests = d; }   // sin huellas = aprobado antes de conservarlas
  return s;
}
function normPlan(o: unknown): PlanRecord {
  const x = rec(o), p = blankPlan();
  p.version = str(x.version) || "1.0"; p.status = x.status === "aprobado" ? "aprobado" : "borrador"; p.preparedBy = str(x.preparedBy); p.approvedBy = str(x.approvedBy); p.approvedOn = str(x.approvedOn); p.notes = str(x.notes);
  p.snapshot = normSnapshot(x.snapshot); p.approvedDoc = str(x.approvedDoc);
  p.history = arr(x.history).map((h) => ({ version: str(h.version), approvedBy: str(h.approvedBy), approvedOn: str(h.approvedOn), snapshot: normSnapshot(h.snapshot), doc: str(h.doc) }));
  return p;
}
let plan: PlanRecord = blankPlan();

// ---------- lo que se lee de los demás módulos (solo lectura) ----------
interface Ctx { connected: boolean; name: string; meta: Record<string, unknown>; mods: Record<string, unknown>; facts: PlanFacts; }
let ctx: Ctx | null = null, ctxDirty = true;
function getCtx(): Ctx { if (ctxDirty || !ctx) { ctx = buildCtx(); ctxDirty = false; } return ctx; }
const baseOf = (b: Record<string, unknown> | null | undefined): BaselineFact => {
  const x = rec(b); const has = !!x.frozen && !!str(x.version);
  return has ? { has: true, version: str(x.version), date: str(x.date), approver: str(x.approver) } : emptyBase();
};
function buildCtx(): Ctx {
  const G = window.GPI, connected = !!(G && G.available() && G.active());
  const empty: Ctx = { connected, name: "", meta: {}, mods: {}, facts: emptyFacts(todayISO()) };
  if (!G || !G.util || !connected) return empty;
  const f = emptyFacts(todayISO());
  const m = G.active() as { meta?: unknown; modules?: unknown } | null, meta = rec(m && m.meta), mods = rec(m && m.modules);
  try {
    const charter = G.getModule("charter"), wbs = G.getModule("wbs"), req = G.getModule("requirements"), scope = G.getModule("scopeStatement");
    const sched = G.getModule("schedule"), sp = G.getModule("schedulePlan"), cost = G.getModule("cost"), rk = G.getModule("risks");
    // Acta
    const ca = G.util.charterAudit(charter), ends = arr(charter && charter.milestones).map((x) => str(x.date)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    f.charter = { has: !!charter && ca.okCount > 0, pct: ca.pct, end: ends.length ? ends[ends.length - 1] : "" };
    // Requisitos y alcance
    const ra = G.util.requirementsAudit(req, charter, wbs), sa = G.util.scopeAudit(scope, req, charter, wbs);
    f.requirements = { has: ra.total > 0, state: ra.state as AreaState, base: baseOf(req && req.baseline as Record<string, unknown>), total: ra.total };
    // El trabajo en edición (EDT, diccionario y enunciado vigentes) frente a lo aprobado en la línea base del alcance (que incluye la EDT y su diccionario)
    const sbl = normalizeScopeBaseline(scope && scope.baseline), sc = rec(scope), sd = scopeDriftOf(sbl, { deliverables: sc.deliverables, assumptions: sc.assumptions, constraints: sc.constraints, exclusions: sc.exclusions, productScope: sc.productScope, projectScope: sc.projectScope }, wbs);
    f.scope = { has: sa.total > 0 || !!str(scope && scope.productScope).trim(), state: sa.state as AreaState, base: baseOf(scope && scope.baseline as Record<string, unknown>), notDecomposed: sa.delsNotDecomposed.length, drift: sd.frozen ? { wbsInBaseline: sd.wbsInBaseline, wbsChanges: sd.wbsChanges.length, enunciadoChanged: sd.enunciadoChanged } : undefined };
    // EDT
    const wq = analyzeWbs(wbs as never);
    f.wbs = { leaves: wq.leaves, state: wq.state as AreaState, dictPct: wq.dictionary.pct, riesgo: wq.counts.riesgo, aviso: wq.counts.aviso };
    // Cronograma
    const ss = G.util.scheduleStats(), bl = normalizeBaseline(sched ? sched.baseline : null), net = G.util.activeScheduleNetwork();
    const last = bl && bl.log.length ? bl.log[bl.log.length - 1] : null;
    f.schedule = {
      has: ss.activities > 0, ok: ss.ok, activities: ss.activities, duration: ss.projectDuration, start: net ? net.startDate : "", finish: ss.finishDate, critical: ss.criticalCount,
      base: bl ? { has: true, version: bl.version, date: bl.date, approver: last ? last.approver : "" } : emptyBase(), deviationPct: ss.baselineDeviationPct
    };
    // Costos y BOE
    const cs = G.util.costSummary(cost), boe = normalizeBoe(cost && cost.estimate && (cost.estimate as Record<string, unknown>).boe);
    const blog = cost && Array.isArray(cost.baselineLog) ? cost.baselineLog : [], lastLb = blog.length ? blog[blog.length - 1] : null;
    const capexN = Number(str(meta.capex).replace(/[^\d.-]/g, ""));
    f.cost = {
      has: cs.hasData, bac: cs.bac, bacCurrent: cs.bacCurrent, total: cs.total, pendingBaseline: cs.pendingBaseline, capex: isFinite(capexN) && capexN > 0 ? capexN : null,
      boeStatus: cs.hasData ? boe.status : "", boeApprovedOn: boe.approvedOn, baselineVersion: lastLb ? lastLb.version : "", baselineDate: lastLb ? lastLb.date : ""
    };
    // Riesgos
    const rplan = normalizeRiskPlan(rk && rk.plan), risks = (rk && Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1))), rp = riskPortfolio(risks, rplan);
    f.risks = { total: rp.total, open: rp.open, high: rp.byLevel.alto };
    // Interesados
    const sk = arr(rec(G.getModule("stakeholders")).stakeholders);
    f.stakeholders = { count: sk.length, close: sk.filter((s) => quadrantOf(num(s.power), num(s.interest)) === "cerca").length };
    // Equipo y responsabilidades
    const obs = G.util.obsNodes(G.getModule("obs")), rc = G.util.raciCoverage(G.getModule("raci"), wbs);
    f.resources = { roles: obs.length, withPerson: obs.filter((o) => o.person.trim()).length, leaves: rc.total, withR: rc.withR, withoutA: rc.withoutA.length };
    // Cambios
    const crs = arr(rec(G.getModule("changes")).requests).map((o, i) => normalizeCr(o, "cr" + (i + 1)));
    const cf: ChangeFacts = {
      orders: arr(cost && cost.changeOrders).map((o) => ({ id: str(o.id), cost: num(o.cost), fund: str(o.fund), status: str(o.status), baselined: o.baselined ? str(o.baselined) : null })),
      mods: modFacts(req),
      risks: risks.map((r) => ({ id: r.id, code: r.code, title: r.title })), scheduleLog: bl ? bl.log.map((e) => ({ version: e.version, date: e.date })) : [], policy: rplan.reserves, projectDelay: null
    };
    const cp = crPortfolio(crs, cf, todayISO());
    f.changes = { total: cp.total, pending: cp.byStatus.Pendiente, approvedOpen: cp.pendingBaseline, oldestPending: cp.oldestPendingDays };
    // Planes de calidad, comunicaciones y adquisiciones (la misma lectura que usa cada módulo)
    const qd = normalizeQuality(G.getModule("quality")), qf = gatherQualityFacts(G), qcov = qualityCoverage(qd, qf).filter((r) => r.needs);
    f.quality = { has: qd.checks.length + qd.metrics.length + qd.coq.length > 0, state: qualityState(qd, qf) as AreaState, needing: qcov.length, verified: qcov.filter((r) => r.checks.length).length, checks: qd.checks.length, coqTotal: coqSummary(qd.coq, qf.baseCost).total };
    const cd = normalizeComms(G.getModule("comms")), cf2 = gatherCommFacts(G), ccov = commCoverage(cd.items, cf2);
    f.comms = { has: cd.items.length > 0, state: commState(cd, cf2) as AreaState, items: cd.items.length, covered: ccov.filter((r) => r.items.length).length, stakeholders: cf2.stakeholders.length, closeUncovered: ccov.filter((r) => r.stk.quadrant === "cerca" && !r.items.length).length };
    const pd = normalizeProcurement(G.getModule("procurement"), todayISO()), pf = gatherProcurementFacts(G), ps = procSummary(pd, pf);
    f.procurement = { has: pd.items.length > 0, state: procurementState(pd, pf) as AreaState, items: pd.items.length, total: ps.total, late: ps.late, soon: ps.soon, asOf: pd.asOf };
    // Valor ganado
    const reps = arr(rec(G.getModule("evm")).reports);
    f.evm = { reports: reps.length, lastCut: reps.length ? str(reps[reps.length - 1].date) : "" };
    // Fechas del proyecto: fin del Acta / de la ficha y último hito contractual del Plan del Cronograma
    f.projectEnd = str(meta.endDate) || f.charter.end;
    const contr = arr(sp && sp.milestones).filter((x) => /contractual/i.test(str(x.type))).map((x) => str(x.date)).filter(Boolean).sort();
    f.contractualEnd = contr.length ? contr[contr.length - 1] : "";
    // Huella de cada componente del plan (contenido, no solo versiones): la ficha del proyecto, el plan de riesgos (no cada riesgo: es un registro vivo)
    // y el resto de los módulos que componen el plan. Ver PLAN_COMPONENTS en shared/pm-plan.ts.
    const METAKEYS = ["name", "code", "client", "location", "sponsor", "manager", "startDate", "endDate", "currency", "capex", "description"], mm: Record<string, unknown> = {};
    METAKEYS.forEach((k) => { mm[k] = meta[k]; });
    PLAN_COMPONENTS.forEach((c) => { f.digests[c.key] = digestOf(c.key === "meta" ? mm : c.key === "riskPlan" ? rec(G.getModule("risks")).plan : G.getModule(c.key as never)); });
    f.plan = { status: plan.status, version: plan.version, approvedBy: plan.approvedBy, approvedOn: plan.approvedOn, snapshot: plan.snapshot, docPreserved: !!plan.approvedDoc };
  } catch (e) { /* noop: cada tarjeta del plan queda "sin datos" */ }
  return { connected, name: str(meta.name), meta, mods, facts: f };
}
const factsNow = (): PlanFacts => { const c = getCtx(); c.facts.plan = { status: plan.status, version: plan.version, approvedBy: plan.approvedBy, approvedOn: plan.approvedOn, snapshot: plan.snapshot, docPreserved: !!plan.approvedDoc }; return c.facts; };
// ¿El proyecto cambió desde la aprobación? (versiones/importes de las líneas base y contenido de cada componente del plan)
const changesSinceApproval = (): Array<{ label: string; from: string; to: string }> => (plan.status === "aprobado" && plan.snapshot ? snapshotDiff(plan.snapshot, snapshotOf(factsNow())) : []);

// ---------- vista «Estado del plan» ----------
const pill = (s: AreaState): string => `<span class="pill st-${s}">${STATE_LABEL[s]}</span>`;
const fd = (id: string, label: string, val: string, type = "text", dis = false): string => `<div class="fd"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val)}"${dis ? " disabled" : ""}></div>`;
function renderState(): void {
  const C = getCtx(), f = factsNow(), root = $("stateView");
  if (!C.connected) {
    root.innerHTML = `<div class="view-head"><h2>Plan para la Dirección del Proyecto</h2></div><div class="empty-hint"><b>Sin proyecto activo.</b> Este módulo no tiene un ejemplo propio: consolida lo que ya cargaron las demás herramientas. Abre o crea un proyecto desde el <a href="Panel_Control.html">Panel de Control</a>, completa el Acta, el alcance, el cronograma y el presupuesto (o usa «Cargar ejemplo» en cada uno) y vuelve aquí para ver el plan integrado.</div>`;
    return;
  }
  const rows = areaRows(f), finds = integrationFindings(f), blockers = approvalBlockers(f), approved = plan.status === "aprobado";
  const changed = changesSinceApproval(), stale = changed.length > 0;
  const bl: Array<[string, BaselineFact, string]> = [
    ["Requisitos", f.requirements.base, f.requirements.base.has ? "v" + f.requirements.base.version : ""], ["Alcance", f.scope.base, f.scope.base.has ? "v" + f.scope.base.version : ""],
    ["Cronograma", f.schedule.base, f.schedule.base.has ? f.schedule.base.version : ""],
    ["Costos (BOE)", { has: f.cost.has && !!f.cost.boeStatus, version: f.cost.boeStatus ? BOE_STATUS_LABEL[f.cost.boeStatus as keyof typeof BOE_STATUS_LABEL] || f.cost.boeStatus : "", date: f.cost.boeApprovedOn, approver: "" }, f.cost.boeStatus ? BOE_STATUS_LABEL[f.cost.boeStatus as keyof typeof BOE_STATUS_LABEL] || f.cost.boeStatus : ""]
  ];
  const sevIcon = { riesgo: "⛔", aviso: "⚠", info: "ℹ" } as const;
  root.innerHTML = `
    <div class="view-head"><h2>Estado del plan — ${esc(C.name || "proyecto activo")}</h2>
      <p>El plan para la dirección integra los planes subsidiarios y las líneas base de alcance, cronograma y costo, y se aprueba como un conjunto. Aquí ves el estado de cada área, si las líneas base calzan entre sí, y registras la aprobación. Al aprobarlo se guarda una instantánea de las líneas base: si cambian después, el plan queda desactualizado y toca una nueva versión (por control integrado de cambios).</p></div>
    <div class="grid2">
      <div class="card"><h3>Líneas base</h3>
        <table class="an"><thead><tr><th>Línea base</th><th>Versión / estado</th><th>Fecha</th></tr></thead><tbody>
        ${bl.map(([n, b, v]) => `<tr><td>${n}</td><td>${v ? esc(v) : '<span class="muted">sin línea base</span>'}</td><td class="mono">${esc(b.date || "—")}</td></tr>`).join("")}
        <tr><td>BAC vigente</td><td class="mono">${f.cost.has ? money(f.cost.bacCurrent || f.cost.bac) : "—"}</td><td class="mono">${esc(f.cost.baselineDate || "—")}</td></tr>
        </tbody></table></div>
      <div class="card"><h3>Aprobación del plan</h3>
        ${fd("pfVersion", "Versión del plan", plan.version, "text", approved)}
        ${fd("pfPrepared", "Preparó", plan.preparedBy)}
        ${fd("pfApprover", "Aprueba (nombre y cargo)", plan.approvedBy, "text", approved)}
        ${fd("pfDate", "Fecha de aprobación", plan.approvedOn || todayISO(), "date", approved)}
        <div class="fd"><label for="pfNotes">Notas</label><textarea id="pfNotes" rows="2">${esc(plan.notes)}</textarea></div>
        ${approved
          ? `<p class="small">${stale ? "⚠ <b>Plan aprobado con CAMBIOS SIN APROBAR</b> desde el " + esc(plan.approvedOn) + ": " + esc(changed.map((d) => d.label + " (" + d.from + " → " + d.to + ")").join("; ")) + ". El documento aprobado se conserva tal como se aprobó; lo vigente es un <b>borrador</b>. Crea una nueva versión para aprobar los cambios." : "✔ <b>Plan aprobado</b> v" + esc(plan.version) + " por " + esc(plan.approvedBy) + " el " + esc(plan.approvedOn) + " (sin cambios desde la aprobación)."}</p><button class="btn${stale ? " primary" : ""}" id="btnNewVersion">＋ Nueva versión del plan${stale ? " con los cambios" : ""}</button>`
          : `${blockers.length ? `<p class="small" style="color:#a05a00">No se puede aprobar todavía: ${esc(blockers.join("; "))}.</p>` : ""}<button class="btn primary" id="btnApprove"${blockers.length ? " disabled" : ""}>✔ Aprobar el plan</button>`}
        ${plan.history.length ? `<p class="small muted" style="margin-top:8px">Versiones anteriores: ${plan.history.map((h, i) => "v" + esc(h.version) + " (" + esc(h.approvedOn || "—") + ")" + (h.doc ? ` <button class="btn sm" data-histdoc="${i}">Ver documento</button>` : " <span title=\"aprobada antes de conservar su contenido\">sin contenido conservado</span>")).join(" · ")}</p>` : ""}
      </div>
    </div>
    <div class="card"><h3>Áreas del plan</h3>
      <table class="an"><thead><tr><th>Área</th><th>Estado</th><th>Resumen</th><th>Módulo</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${pill(r.state)}</td><td>${esc(r.metric)}${r.note ? ` <span class="muted small">${esc(r.note)}</span>` : ""}</td><td>${r.file ? `<a href="${esc(r.file)}">Abrir</a>` : '<span class="muted">—</span>'}</td></tr>`).join("")}
      </tbody></table></div>
    <div class="card"><h3>Integración entre líneas base y planes (${finds.length})</h3>
      ${finds.length ? `<ul class="finds">${finds.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${sevIcon[x.severity]}</b><b>${esc(x.area)}:</b> ${esc(x.text)}</li>`).join("")}</ul>` : '<p class="muted small">Sin hallazgos: las líneas base calzan entre sí.</p>'}
    </div>`;
  wireState();
}
function wireState(): void {
  const bind = (id: string, key: "version" | "preparedBy" | "approvedBy" | "approvedOn" | "notes"): void => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.addEventListener("input", () => { plan[key] = el.value; save(); }); };
  bind("pfVersion", "version"); bind("pfPrepared", "preparedBy"); bind("pfApprover", "approvedBy"); bind("pfDate", "approvedOn"); bind("pfNotes", "notes");
  const ap = document.getElementById("btnApprove"); if (ap) ap.addEventListener("click", approve);
  const nv = document.getElementById("btnNewVersion"); if (nv) nv.addEventListener("click", newVersion);
  document.querySelectorAll<HTMLElement>("[data-histdoc]").forEach((b) => b.addEventListener("click", () => { docMode = Number(b.dataset.histdoc); setView("doc"); }));
}
function approve(): void {
  const f = factsNow(), b = approvalBlockers(f);
  if (b.length) { setStatus("No se puede aprobar: " + b.join("; ") + "."); return; }
  if (!plan.approvedBy.trim()) { setStatus("Indica quién aprueba el plan (nombre y cargo)."); ($("pfApprover") as HTMLInputElement).focus(); return; }
  if (!plan.approvedOn) plan.approvedOn = ($("pfDate") as HTMLInputElement).value || todayISO();
  const finds = integrationFindings(f).filter((x) => x.severity === "aviso" || x.severity === "riesgo");
  showConfirm("Se aprobará el plan v" + plan.version + " con las líneas base actuales" + (finds.length ? " (quedan " + finds.length + " aviso(s) de integración sin resolver)" : "") + ". Si luego cambian, quedará desactualizado. ¿Continuar?", "Aprobar el plan", "Aprobar").then((ok) => {
    if (!ok) return;
    // Se conserva lo aprobado: la huella de cada componente y el DOCUMENTO tal como queda aprobado (con el aprobador y la fecha ya registrados).
    plan.status = "aprobado"; ctxDirty = true; const f2 = factsNow(); plan.snapshot = snapshotOf(f2); docMode = "auto"; plan.approvedDoc = liveDocHtml();
    save(); renderState(); renderDoc(); setStatus("Plan v" + plan.version + " aprobado: el documento aprobado queda conservado (" + Math.round(plan.approvedDoc.length / 1024) + " KB).");
  });
}
function newVersion(): void {
  showConfirm("Se conserva la versión aprobada (con su documento) en el historial y se abre un borrador nuevo con lo vigente. ¿Continuar?", "Nueva versión del plan", "Crear versión").then((ok) => {
    if (!ok) return;
    plan.history.push({ version: plan.version, approvedBy: plan.approvedBy, approvedOn: plan.approvedOn, snapshot: plan.snapshot, doc: plan.approvedDoc });
    const major = Number(String(plan.version).split(".")[0]);
    plan.version = isFinite(major) && major > 0 ? String(major + 1) + ".0" : plan.version + "b";
    plan.status = "borrador"; plan.approvedBy = ""; plan.approvedOn = ""; plan.snapshot = null; plan.approvedDoc = ""; docMode = "auto"; ctxDirty = true; save(); renderState(); renderDoc(); setStatus("Nueva versión v" + plan.version + " en borrador.");
  });
}

// ---------- vista «Documento» ----------
interface Sect { id: string; title: string; subs: Array<{ id: string; title: string }>; html: string; }
const tbl = (heads: string[], rows: string[][], cls = ""): string => rows.length
  ? `<table${cls ? ` class="${cls}"` : ""}><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => "<tr>" + r.map((c) => `<td>${c}</td>`).join("") + "</tr>").join("")}</tbody></table>`
  : "";
const kv = (rows: Array<[string, string]>): string => `<table class="kv"><tbody>${rows.filter(([, v]) => v.trim()).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join("")}</tbody></table>`;
const nodata = (t: string): string => `<p class="nodata">${esc(t)}</p>`;
const list = (items: string[]): string => (items.length ? "<ul>" + items.map((i) => `<li>${esc(i)}</li>`).join("") + "</ul>" : "");

function buildSections(): Sect[] {
  const C = getCtx(), f = factsNow(), G = window.GPI as GpiApi, out: Sect[] = [];
  const meta = C.meta;
  const charter = G.getModule("charter"), wbs = G.getModule("wbs"), req = G.getModule("requirements"), scope = G.getModule("scopeStatement");
  const cost = G.getModule("cost"), sp = G.getModule("schedulePlan"), sched = G.getModule("schedule"), sym = ({ USD: "$", PEN: "S/", EUR: "€" } as Record<string, string>)[str(meta.currency)] || "";
  const m = (n: number): string => (sym ? sym + " " : "") + money(n);

  // 1. Descripción del proyecto (Acta)
  {
    const ch = rec(charter), ident = rec(ch.identification), obj = arr(ch.objectives), mil = arr(ch.milestones);
    let h = kv([["Proyecto", esc(meta.name)], ["Código", esc(meta.code)], ["Cliente", esc(meta.client)], ["Ubicación", esc(meta.location)], ["Patrocinador", esc(meta.sponsor)], ["Director del proyecto", esc(meta.manager)], ["Inicio", esc(meta.startDate)], ["Fin", esc(meta.endDate)], ["CAPEX autorizado", f.cost.capex !== null ? m(f.cost.capex) : ""]]);
    h += `<h3 class="d2" id="s1-prop">Propósito y descripción</h3>` + (str(ch.purpose).trim() || str(ch.description).trim() ? `<p>${nl(ch.purpose)}</p><p>${nl(ch.description)}</p>` : nodata("El Acta no registra propósito ni descripción."));
    h += `<h3 class="d2" id="s1-obj">Objetivos del proyecto</h3>` + (obj.length ? tbl(["Dimensión", "Objetivo", "Criterio de éxito"], obj.map((o) => [esc(o.dim), esc(o.objective), esc(o.criteria)])) : nodata("Sin objetivos en el Acta."));
    h += `<h3 class="d2" id="s1-mil">Hitos principales</h3>` + (mil.length ? tbl(["Hito", "Fecha"], mil.map((x) => [esc(x.name), esc(x.date)])) : nodata("Sin hitos en el Acta."));
    if (Object.keys(ident).length === 0 && !charter) h = nodata("El Acta de Constitución aún no tiene datos.") + h;
    out.push({ id: "s1", title: "1. Descripción del proyecto", subs: [{ id: "s1-prop", title: "Propósito y descripción" }, { id: "s1-obj", title: "Objetivos" }, { id: "s1-mil", title: "Hitos principales" }], html: h });
  }

  // 2. Plan de gestión del alcance
  {
    const sc = rec(scope), rq = rec(req);
    const tm = G.util.traceMatrix(req, charter, scope, wbs), items = new Map(arr(rq.items).map((x) => [str(x.id), x] as const));
    const ranText = new Map(G.util.charterRans(charter).map((r) => [r.id, r] as const));
    let h = `<h3 class="d2" id="s2-tr">Matriz de trazabilidad de requisitos</h3>`;
    h += tm.rows.length ? tbl(["Identificación", "Requisito", "Fuente", "Prioridad", "Categoría", "Objetivo de negocio", "Entregable", "Verificación", "Validación"], tm.rows.map((r) => {
      const it = items.get(r.req.id) || {};
      return [esc(r.req.code || r.req.id), esc(r.req.text), esc(r.rans.map((x) => x.code).join(", ")), esc(it.priority), esc(it.type),
        esc(r.rans.map((x) => { const t = ranText.get(x.id); return t ? t.code + " " + str((t as unknown as Record<string, unknown>).text) : x.code; }).join("; ")),
        esc(r.dels.map((d) => d.code + " " + d.name).join("; ")), esc(it.verificationMethod), esc(it.acceptanceCriteria)];
    })) : nodata("Sin requisitos registrados.");
    h += `<p class="note">Matriz derivada de Requisitos, Acta, Enunciado del Alcance y EDT: ${tm.kpi.fullChainPct} % de los requisitos con cadena completa requisito → entregable → paquete de trabajo.</p>`;
    // Enunciado
    h += `<h3 class="d2" id="s2-en">Enunciado del alcance</h3>`;
    h += kv([["Alcance del producto", nl(sc.productScope)], ["Alcance del proyecto", nl(sc.projectScope)]]);
    // Entregables con responsables (RACI de los paquetes de la EDT que los componen)
    const w = rec(wbs), nodes = rec(w.nodes), rootId = str(w.rootId), codes = G.util.wbsCodes(wbs), obs = G.util.obsNodes(G.getModule("obs"));
    const obsBy = new Map(obs.map((o) => [o.id, o] as const)), asg = rec(rec(G.getModule("raci")).assignments);
    const parent = new Map<string, string>();
    Object.keys(nodes).forEach((id) => { const k = rec(nodes[id]).children; if (Array.isArray(k)) (k as string[]).forEach((c) => parent.set(c, id)); });
    const leavesUnder = (id: string): string[] => { const k = rec(nodes[id]).children; return Array.isArray(k) && k.length ? (k as string[]).flatMap(leavesUnder) : [id]; };
    const phaseOf = (id: string): string => { let cur = id, guard = 0; while (parent.get(cur) && parent.get(cur) !== rootId && guard++ < 50) cur = parent.get(cur) as string; return str(rec(nodes[cur]).name); };
    const who = (delId: string, letter: string): string => {
      const s = new Set<string>();
      Object.keys(nodes).filter((id) => str(rec(nodes[id]).delId) === delId).forEach((nid) => leavesUnder(nid).forEach((lid) => { const cell = rec(asg[lid]); Object.keys(cell).forEach((oid) => { if (str(cell[oid]).split(/[\s,/]+/).includes(letter) || str(cell[oid]) === letter) { const o = obsBy.get(oid); if (o) s.add(o.person.trim() || o.role); } }); }));
      return Array.from(s).join(", ");
    };
    const dels = arr(sc.deliverables);
    h += dels.length ? tbl(["N°", "Fase", "Entregable", "Descripción", "Resp. elaboración (R)", "Resp. aceptación (A)", "Criterio de aceptación"], dels.map((d, i) => {
      const nid = Object.keys(nodes).find((id) => str(rec(nodes[id]).delId) === str(d.id));
      return [esc(str(d.code) || String(i + 1)), esc(nid ? phaseOf(nid) : ""), esc(d.name), nl(d.description), esc(who(str(d.id), "R")), esc(who(str(d.id), "A")), nl(d.acceptanceCriteria)];
    })) : nodata("El Enunciado del Alcance no tiene entregables.");
    const idl = (v: unknown): string[] => arr(v).map((x) => str(x.text)).filter(Boolean);
    h += `<h4 class="d3">Restricciones</h4>${list(idl(sc.constraints)) || nodata("Sin restricciones.")}<h4 class="d3">Supuestos</h4>${list(idl(sc.assumptions)) || nodata("Sin supuestos.")}<h4 class="d3">Exclusiones</h4>${list(idl(sc.exclusions)) || nodata("Sin exclusiones.")}`;
    // EDT
    h += `<h3 class="d2" id="s2-edt">Estructura de desglose del trabajo y diccionario</h3>`;
    const rowsE: string[][] = [], walk = (id: string, depth: number): void => {
      const n = rec(nodes[id]); if (!n || !Object.keys(n).length) return;
      if (id !== rootId) { const leaf = !(Array.isArray(n.children) && n.children.length); rowsE.push([esc(codes[id] || ""), `<span style="padding-left:${(depth - 1) * 12}px">${esc(n.name)}</span>`, esc(n.resource), leaf && num(n.cost) ? m(num(n.cost)) : "", esc(str(n.start) && str(n.end) ? n.start + " → " + n.end : ""), nl(n.notes), nl(n.acceptance)]); }
      if (Array.isArray(n.children)) (n.children as string[]).forEach((c) => walk(c, depth + 1));
    };
    if (rootId) walk(rootId, 0);
    h += rowsE.length ? tbl(["Código", "Elemento", "Responsable", "Costo", "Fechas", "Descripción del trabajo", "Criterio de aceptación"], rowsE) : nodata("La EDT aún no tiene elementos.");
    // Línea base
    h += `<h3 class="d2" id="s2-lb">Línea base del alcance</h3>` + kv([["Enunciado del Alcance", f.scope.base.has ? `v${esc(f.scope.base.version)} · ${esc(f.scope.base.date)} · ${esc(f.scope.base.approver)}` : "sin línea base"], ["Requisitos", f.requirements.base.has ? `v${esc(f.requirements.base.version)} · ${esc(f.requirements.base.date)} · ${esc(f.requirements.base.approver)}` : "sin línea base"]]);
    out.push({ id: "s2", title: "2. Plan de gestión del alcance", subs: [{ id: "s2-tr", title: "Matriz de trazabilidad" }, { id: "s2-en", title: "Enunciado del alcance" }, { id: "s2-edt", title: "EDT y diccionario" }, { id: "s2-lb", title: "Línea base del alcance" }], html: h });
  }

  // 3. Cronograma
  {
    const s = f.schedule, spr = rec(sp), bl = normalizeBaseline(rec(sched).baseline), mil = arr(spr.milestones), th = arr(spr.controlThresholds);
    let h = s.has ? kv([["Actividades", String(s.activities)], ["Duración (días laborables)", s.duration !== null ? String(s.duration) : ""], ["Inicio", esc(s.start)], ["Fin", esc(s.finish)], ["Actividades críticas", String(s.critical)], ["Línea base vigente", s.base.has ? esc(s.base.version + " · " + s.base.date) : "sin línea base"], ["Desviación del pronóstico", s.deviationPct !== null ? (Math.round(s.deviationPct * 10) / 10) + " %" : ""]]) : nodata("El cronograma aún no tiene actividades enlazadas.");
    h += `<h3 class="d2" id="s3-mil">Hitos del plan del cronograma</h3>` + (mil.length ? tbl(["Hito", "Fecha", "Tipo", "Restricción"], mil.map((x) => [esc(x.name), esc(x.date), esc(x.type), esc(x.constraint)])) : nodata("Sin hitos en el Plan del Cronograma."));
    h += `<h3 class="d2" id="s3-lb">Versiones de la línea base</h3>` + (bl && bl.log.length ? tbl(["Versión", "Fecha", "Motivo", "Aprobó", "Duración (d)", "Fin"], bl.log.map((e) => [esc(e.version), esc(e.date), esc(e.reason), esc(e.approver), String(e.projectDuration), esc(e.finishDate)])) : nodata("Sin versiones de línea base."));
    h += `<h3 class="d2" id="s3-um">Umbrales de control</h3>` + (th.length ? tbl(["Indicador", "Verde", "Rojo", "Acción"], th.map((x) => [esc(x.metric), esc(x.greenValue), esc(x.redValue), esc(x.action)])) : nodata("Sin umbrales definidos."));
    out.push({ id: "s3", title: "3. Plan de gestión del cronograma", subs: [{ id: "s3-mil", title: "Hitos" }, { id: "s3-lb", title: "Línea base" }, { id: "s3-um", title: "Umbrales" }], html: h });
  }

  // 4. Costos
  {
    const cs = G.util.costSummary(cost), boe = normalizeBoe(rec(rec(cost).estimate).boe), log = arr(rec(cost).baselineLog);
    let h = cs.hasData ? kv([["Clase del estimado", esc(cs.estimateClass)], ["Costo base", m(cs.baseCost)], ["BAC inicial", m(cs.bac)], ["BAC vigente", m(cs.bacCurrent)], ["Presupuesto total (con reserva de gestión)", m(cs.total)], ["Contingencia disponible", m(cs.contingencyAvailable)], ["Reserva de gestión disponible", m(cs.mgmtAvailable)], ["Órdenes de cambio", `${cs.changeOrders} (${cs.pending} pendientes)`]]) : nodata("El presupuesto aún no tiene datos.");
    h += `<h3 class="d2" id="s4-boe">Basis of Estimate (BOE)</h3>` + kv([["Versión", esc(boe.version)], ["Estado", esc(BOE_STATUS_LABEL[boe.status])], ["Preparó", esc(boe.preparedBy)], ["Revisó", esc(boe.reviewedBy)], ["Aprobó", esc(boe.approvedBy)], ["Fecha de aprobación", esc(boe.approvedOn)], ["Propósito", nl(boe.text.purpose)], ["Objetivos", nl(boe.text.objectives)]]);
    h += `<h3 class="d2" id="s4-lb">Versiones de la línea base de costos</h3>` + (log.length ? tbl(["Versión", "Fecha", "Órdenes", "BAC anterior", "BAC nuevo", "Aprobó"], log.map((e) => [esc(e.version), esc(e.date), esc(Array.isArray(e.orderIds) ? (e.orderIds as unknown[]).join(", ") : ""), m(num(e.bacBefore)), m(num(e.bacAfter)), esc(e.approver)])) : nodata("Aún no se incorporó ninguna orden de cambio a la línea base."));
    out.push({ id: "s4", title: "4. Plan de gestión de costos", subs: [{ id: "s4-boe", title: "Basis of Estimate" }, { id: "s4-lb", title: "Línea base de costos" }], html: h });
  }

  // 5. Riesgos
  {
    const rk = rec(G.getModule("risks")), rplan = normalizeRiskPlan(rk.plan), risks = (Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1))), top = rankRisks(risks, rplan).slice(0, 10);
    const h = top.length ? tbl(["Código", "Riesgo", "Tipo", "Puntaje", "Nivel", "Estrategia", "Responsable"], top.map((r) => [esc(r.code), esc(r.title), esc(r.type), String(inherentScore(r) ?? ""), esc(levelOf(inherentScore(r), rplan) || ""), esc(r.strategy), esc(r.owner)])) + `<p class="note">Los 10 riesgos abiertos de mayor puntaje; ${f.risks.total} en el registro (${f.risks.open} abiertos).</p>` : nodata("El Registro de Riesgos está vacío.");
    out.push({ id: "s5", title: "5. Plan de gestión de riesgos", subs: [], html: h });
  }

  // 6. Interesados
  {
    const sk = arr(rec(G.getModule("stakeholders")).stakeholders);
    const h = sk.length ? tbl(["Interesado", "Organización", "Rol", "Estrategia (poder–interés)", "Compromiso actual", "Compromiso deseado"], sk.map((s) => [esc(s.name), esc(s.org), esc(s.role), esc(QUADRANT_LABEL[quadrantOf(num(s.power), num(s.interest))]), esc(levelName(s.engCurrent)), esc(levelName(s.engDesired))])) : nodata("Sin interesados registrados.");
    out.push({ id: "s6", title: "6. Plan de involucramiento de los interesados", subs: [], html: h });
  }

  // 7. Equipo
  {
    const obs = G.util.obsNodes(G.getModule("obs"));
    const h = obs.length ? tbl(["Código", "Puesto", "Persona", "Tipo"], obs.map((o) => [esc(o.code), esc(o.role), esc(o.person), esc(o.type)])) + `<p class="note">${f.resources.withR}/${f.resources.leaves} paquetes de trabajo con responsable (R) en la Matriz RACI.</p>` : nodata("Sin estructura de la organización (OBS).");
    out.push({ id: "s7", title: "7. Plan de gestión de recursos (equipo y responsabilidades)", subs: [], html: h });
  }

  // 8. Cambios
  {
    const crs: ChangeRequest[] = arr(rec(G.getModule("changes")).requests).map((o, i) => normalizeCr(o, "cr" + (i + 1)));
    const h = crs.length ? tbl(["Código", "Solicitud", "Estado", "Decidida", "Aprobó", "Δ costo", "Δ días"], crs.map((c) => [esc(c.code), esc(c.title), esc(c.status), esc(c.decidedOn), esc(c.approver), c.costDelta === null ? "" : m(c.costDelta), c.daysDelta === null ? "" : String(c.daysDelta)])) : nodata("Sin solicitudes de cambio: el plan no ha tenido cambios registrados.");
    out.push({ id: "s8", title: "8. Control integrado de cambios", subs: [], html: h });
  }

  // 9. Valor ganado
  {
    const reps = arr(rec(G.getModule("evm")).reports);
    const h = reps.length ? tbl(["Corte", "PV", "EV", "AC", "CPI", "SPI"], reps.map((r) => [esc(r.date), m(num(r.pv)), m(num(r.ev)), m(num(r.ac)), r.cpi === null || r.cpi === undefined ? "" : num(r.cpi).toFixed(2), r.spi === null || r.spi === undefined ? "" : num(r.spi).toFixed(2)])) : nodata("Aún no hay cortes de valor ganado: el seguimiento comienza con la ejecución.");
    out.push({ id: "s9", title: "9. Medición del desempeño (valor ganado)", subs: [], html: h });
  }

  // Calidad, comunicaciones y adquisiciones: cada planes subsidiario se lee con la MISMA lectura que usa su módulo (shared/plan-facts.ts)
  {
    const qd: QualityData = normalizeQuality(G.getModule("quality")), qf = gatherQualityFacts(G), s = coqSummary(qd.coq, qf.baseCost), cov = qualityCoverage(qd, qf).filter((r) => r.needs), leaf = new Map(qf.leaves.map((l) => [l.id, l.code + " " + l.name] as const));
    const has = qd.checks.length + qd.metrics.length + qd.coq.length > 0;
    let h = has ? kv([["Política de calidad", nl(qd.policy)], ["Normas y especificaciones", nl(qd.standards)], ["Paquetes con criterio de aceptación verificados", cov.filter((r) => r.checks.length).length + " de " + cov.length]]) : nodata("El plan de calidad aún no tiene datos.");
    h += `<h3 class="d2" id="sq-m">Métricas de calidad</h3>` + (qd.metrics.length ? tbl(["Código", "Métrica", "Objetivo", "Tolerancia", "Método", "Frecuencia", "Responsable"], qd.metrics.map((x) => [esc(x.code), esc(x.name), nl(x.target), nl(x.tolerance), esc(x.method), esc(x.frequency), esc(x.owner)])) : nodata("Sin métricas definidas."));
    h += `<h3 class="d2" id="sq-c">Aseguramiento y control por paquete</h3>` + (qd.checks.length ? tbl(["Código", "Paquete", "Qué se verifica", "Criterio de aceptación", "Tipo", "Método", "Frecuencia", "Responsable", "Registro"], qd.checks.map((x) => [esc(x.code), esc(leaf.get(x.wbsId) || ""), nl(x.what), nl(x.criterion), esc(x.kind), esc(x.method), esc(x.frequency), esc(x.owner), esc(x.record)])) : nodata("Sin actividades de control ni aseguramiento."));
    h += `<h3 class="d2" id="sq-k">Costo de la calidad</h3>` + (s.total > 0 ? tbl(["Categoría", "Monto", "Parte"], COQ_CATS.map((k) => [esc(COQ_LABEL[k]), m(s.byCat[k]), Math.round(s.byCat[k] / s.total * 100) + " %"]).concat([["Total", m(s.total), s.pctOfBase !== null ? s.pctOfBase.toFixed(1) + " % del costo base" : ""]])) : nodata("Sin costo de la calidad definido."));
    out.push({ id: "sq", title: "Plan de gestión de la calidad", subs: [{ id: "sq-m", title: "Métricas" }, { id: "sq-c", title: "Aseguramiento y control" }, { id: "sq-k", title: "Costo de la calidad" }], html: h });
  }
  {
    const cd: CommData = normalizeComms(G.getModule("comms")), cf = gatherCommFacts(G), who = (ids: string[], aud: string): string => ids.map((i) => (cf.stakeholders.find((x) => x.id === i) || { name: i }).name).concat(aud.trim() ? [aud.trim()] : []).join("; ");
    let h = cd.items.length ? tbl(["Código", "Información", "Propósito", "Destinatarios", "Emisor", "Frecuencia", "Medio", "Registro"], cd.items.map((x) => [esc(x.code), nl(x.info), nl(x.purpose), esc(who(x.stkIds, x.audience)), esc(x.sender), esc(x.frequency), esc(x.method), esc(x.storage)])) : nodata("La matriz de comunicaciones aún no tiene datos.");
    if (cd.items.length) h += `<p class="note">${commCoverage(cd.items, cf).filter((r) => r.items.length).length} de ${cf.stakeholders.length} interesados reciben al menos una comunicación planificada.</p>` + kv([["Escalamiento", nl(cd.plan.escalation)], ["Restricciones y confidencialidad", nl(cd.plan.restrictions)], ["Actualización del plan", nl(cd.plan.review)]]);
    out.push({ id: "sc", title: "Plan de gestión de las comunicaciones", subs: [], html: h });
  }
  {
    const pd: ProcData = normalizeProcurement(G.getModule("procurement"), todayISO()), pf = gatherProcurementFacts(G), code = (ids: string[]): string => ids.map((i) => (pf.leaves.find((l) => l.id === i) || { code: "" }).code).filter(Boolean).join(", ");
    let h = pd.items.length ? kv([["Fecha de corte del plan", esc(pd.asOf)], ["Estrategia de adquisiciones", nl(pd.strategy)], ["Desempeño de proveedores", nl(pd.performance)], ["Autorizaciones", nl(pd.approvals)]]) : nodata("El plan de adquisiciones aún no tiene datos.");
    if (pd.items.length) h += tbl(["Código", "Adquisición", "Paquetes EDT", "Decisión", "Contrato", "Selección", "Valor", "Fecha requerida", "Convocar antes del", "Proveedor", "Estado", "Responsable"], pd.items.map((x) => [esc(x.code), esc(x.name), esc(code(x.wbsIds)), esc(x.decision), esc(x.contractType), esc(x.selection) + (x.criteria.length ? "<br><span class=\"note\">" + esc(x.criteria.map((c) => c.name + " " + (c.weight ?? "?") + " %").join("; ")) + "</span>" : ""), x.value === null ? "" : m(x.value), esc(x.needDate), esc(launchBy(x) || ""), esc(x.supplier), esc(x.status), esc(x.owner)]));
    out.push({ id: "sp", title: "Plan de gestión de las adquisiciones", subs: [], html: h });
  }

  // 10. Líneas base y aprobación
  {
    const diff = changesSinceApproval();
    let h = tbl(["Línea base", "Versión", "Fecha"], [["Requisitos", f.requirements.base.has ? "v" + esc(f.requirements.base.version) : "—", esc(f.requirements.base.date)], ["Alcance", f.scope.base.has ? "v" + esc(f.scope.base.version) : "—", esc(f.scope.base.date)], ["Cronograma", f.schedule.base.has ? esc(f.schedule.base.version) : "—", esc(f.schedule.base.date)], ["Costos (BAC vigente " + m(f.cost.bacCurrent || f.cost.bac) + ")", esc(f.cost.baselineVersion || "inicial"), esc(f.cost.baselineDate)]]);
    h += `<h3 class="d2" id="s10-ap">Aprobación del plan</h3>` + kv([["Versión", esc(plan.version)], ["Estado", esc(coverStatus())], ["Preparó", esc(plan.preparedBy)], ["Aprobó", esc(plan.approvedBy)], ["Fecha de aprobación", esc(plan.approvedOn)], ["Notas", nl(plan.notes)]]);
    if (diff.length) h += `<p class="note"><b>Borrador con cambios sin aprobar:</b> desde la aprobación de la v${esc(plan.version)} cambió ${esc(diff.map((d) => d.label + " " + d.from + " → " + d.to).join("; "))}. Este documento NO es el aprobado.</p>`;
    if (plan.history.length) h += `<h4 class="d3">Versiones anteriores</h4>` + tbl(["Versión", "Aprobó", "Fecha"], plan.history.map((x) => [esc(x.version), esc(x.approvedBy), esc(x.approvedOn)]));
    h += `<h3 class="d2">Firmas</h3><table><tbody><tr><td style="height:60px;width:50%">Preparó:<br>${esc(plan.preparedBy)}</td><td>Aprobó:<br>${esc(plan.approvedBy)}</td></tr></tbody></table>`;
    out.push({ id: "s10", title: "10. Líneas base y aprobación del plan", subs: [{ id: "s10-ap", title: "Aprobación del plan" }], html: h });
  }
  return out;
}
// Orden del documento (áreas de conocimiento): alcance, cronograma, costos, calidad, recursos, comunicaciones, riesgos, adquisiciones, interesados;
// luego cambios, valor ganado y líneas base. La numeración se asigna aquí, en ese orden.
const SECTION_ORDER = ["s1", "s2", "s3", "s4", "sq", "s7", "sc", "s5", "sp", "s6", "s8", "s9", "s10"];
// Estado que declara la portada: «Aprobado» solo si NADA cambió desde la aprobación; con cambios, «Borrador» (no se hace pasar por el aprobado).
function coverStatus(): string { return plan.status !== "aprobado" ? "Borrador" : changesSinceApproval().length ? "Borrador con cambios sin aprobar (sobre la v" + plan.version + " aprobada)" : "Aprobado"; }
// Documento reconstruido con los datos VIGENTES (nunca sustituye al aprobado: ver `shownDoc`).
function liveDocHtml(): string {
  const C = getCtx(), secs = buildSections().sort((a, b) => SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id));
  secs.forEach((s, i) => { s.title = (i + 1) + ". " + s.title.replace(/^\d+\.\s*/, ""); });
  const toc = secs.map((s) => `<div class="l1"><a href="#${s.id}">${esc(s.title)}</a></div>` + s.subs.map((x) => `<div class="l2"><a href="#${x.id}">${esc(x.title)}</a></div>`).join("")).join("");
  return `<div class="paper">
    <div class="cover"><div class="ttl"><h1>Plan para la dirección del proyecto</h1><div class="pn">${esc(C.name || "Proyecto")}</div></div>
      <div class="ft"><div class="dt">${esc(todayISO())}</div><div>Versión ${esc(plan.version)} · ${esc(coverStatus())}${plan.preparedBy ? " · Preparó: " + esc(plan.preparedBy) : ""}</div></div></div>
    <div class="toc"><h2 class="d1">Contenido</h2>${toc}</div>
    ${secs.map((s) => `<section class="sec" id="${s.id}"><h2 class="d1">${esc(s.title)}</h2>${s.html}</section>`).join("")}
  </div>`;
}
// Qué documento se muestra (y exporta): por omisión, el APROBADO conservado si el plan está aprobado; el borrador vigente solo a pedido (o si no hay aprobado);
// una versión anterior del historial a pedido. Con cambios sin aprobar el aprobado sigue intacto y se avisa qué cambió.
let docMode: "auto" | "current" | number = "auto";
interface Shown { html: string; bar: string; label: string; }
function shownDoc(): Shown {
  const changed = changesSinceApproval();
  if (typeof docMode === "number") {
    const h = plan.history[docMode];
    if (h && h.doc) return { html: h.doc, bar: `<b>Versión anterior v${esc(h.version)}</b> (aprobada el ${esc(h.approvedOn || "—")} por ${esc(h.approvedBy || "—")}): documento tal como se aprobó. <button class="btn sm" id="docBack">Volver</button>`, label: "v" + h.version + "_aprobada" };
    docMode = "auto";
  }
  if (plan.status === "aprobado" && plan.approvedDoc && docMode !== "current")
    return { html: plan.approvedDoc, label: "v" + plan.version + "_aprobada", bar: changed.length
      ? `⚠ <b>Documento APROBADO v${esc(plan.version)}</b> (${esc(plan.approvedOn)}, ${esc(plan.approvedBy)}). El proyecto tiene <b>cambios sin aprobar</b>: ${esc(changed.map((d) => d.label).join(", "))}. Lo que ves es lo aprobado, sin esos cambios. <button class="btn sm" id="docCurrent">Ver borrador con los datos actuales</button>`
      : `✔ <b>Documento aprobado v${esc(plan.version)}</b> (${esc(plan.approvedOn)}, ${esc(plan.approvedBy)}): sin cambios desde la aprobación. <button class="btn sm" id="docCurrent">Ver con los datos actuales</button>` };
  const legacy = plan.status === "aprobado" && !plan.approvedDoc;
  return { html: liveDocHtml(), label: plan.status === "aprobado" ? "v" + plan.version + "_borrador" : "borrador", bar: legacy
    ? "⚠ Este plan se aprobó antes de conservar su contenido: <b>no se puede demostrar que este documento sea el aprobado</b>. Crea una nueva versión y apruébala para conservar su contenido."
    : plan.status === "aprobado" ? `📝 <b>BORRADOR con los datos actuales</b>, no es el documento aprobado v${esc(plan.version)}. <button class="btn sm" id="docBack">Volver al documento aprobado</button>` : "" };
}
function renderDoc(): void {
  const C = getCtx(), el = $("docView");
  if (!C.connected) { el.innerHTML = '<div class="empty-hint">Sin proyecto activo: no hay nada que documentar.</div>'; return; }
  const s = shownDoc();
  el.innerHTML = (s.bar ? `<div class="docbar" id="docBar">${s.bar}</div>` : "") + s.html;
  const cur = document.getElementById("docCurrent"), back = document.getElementById("docBack");
  if (cur) cur.addEventListener("click", () => { docMode = "current"; renderDoc(); });
  if (back) back.addEventListener("click", () => { docMode = "auto"; renderDoc(); });
}

// ---------- exportación ----------
const WORD_CSS = "body{font-family:Calibri,Arial,sans-serif;font-size:11pt} h1{font-size:26pt;color:#5b9bd5;font-weight:normal} h2.d1{font-size:20pt;font-weight:normal;border-bottom:2px solid #2f5496;margin-top:24pt} h3.d2{font-size:14pt;color:#2e74b5;font-weight:normal} h4.d3{font-size:12pt;color:#2e74b5;font-weight:normal} table{border-collapse:collapse;width:100%;margin:6pt 0} th{background:#f2f2f2;border:1px solid #000;padding:3pt 5pt;text-align:left;font-size:9.5pt} td{border:1px solid #000;padding:3pt 5pt;vertical-align:top;font-size:9.5pt} .cover{text-align:center;page-break-after:always} .sec{page-break-before:always} .note,.nodata{color:#595959;font-style:italic;font-size:9pt}";
function exportWord(): void {
  const C = getCtx(); if (!C.connected) { setStatus("No hay un proyecto activo que exportar."); return; }
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Plan para la dirección del proyecto</title><style>${WORD_CSS}</style></head><body>${shownDoc().html}</body></html>`;   // exporta lo que se muestra: el aprobado (nunca uno reconstruido que se haga pasar por él)
  const blob = new Blob(["﻿", html], { type: "application/msword" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "plan_para_la_direccion_" + shownDoc().label + ".doc"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Plan exportado a Word (.doc).");
}
function printDoc(): void { renderDoc(); setStatus("Abriendo el diálogo de impresión: elige «Guardar como PDF»."); window.print(); }

// ---------- modal ----------
function showConfirm(message: string, title: string, okText = "Aceptar"): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = $("modalOverlay"), ok = $("modalConfirmBtn") as HTMLButtonElement, cancel = $("modalCancelBtn") as HTMLButtonElement;
    $("modalTitle").textContent = title; $("modalMessage").textContent = message; ok.textContent = okText;
    const done = (r: boolean): void => { overlay.classList.remove("open"); ok.onclick = null; cancel.onclick = null; overlay.onclick = null; document.removeEventListener("keydown", key); resolve(r); };
    const key = (e: KeyboardEvent): void => { if (e.key === "Escape") done(false); else if (e.key === "Enter") done(true); };
    ok.onclick = () => done(true); cancel.onclick = () => done(false); overlay.onclick = (e) => { if (e.target === overlay) done(false); };
    document.addEventListener("keydown", key); overlay.classList.add("open"); ok.focus();
  });
}

// ---------- pestañas ----------
let view: "state" | "doc" = "state";
function setView(v: "state" | "doc"): void {
  view = v; $("stateView").style.display = v === "state" ? "" : "none"; $("docView").style.display = v === "doc" ? "block" : "none";
  document.querySelectorAll<HTMLElement>("#tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
  if (v === "doc") renderDoc(); else renderState();
}
function refresh(): void { ctxDirty = true; if (view === "state") { const a = document.activeElement; if (!(a && $("stateView").contains(a) && /INPUT|TEXTAREA/.test(a.tagName))) renderState(); } else renderDoc(); }

// ---------- persistencia (proyecto conectado) ----------
let saveFn: () => boolean = () => false;
function save(): void { saveFn(); }
(function gpiBridge() {
  if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
  const proj = window.GPI.active();
  let loadedProjectId: string | null = null, session: EditSession | null = null, projectStale = false, timer: number | undefined;
  function markProjectStale(): void {
    if (projectStale) return; projectStale = true;
    setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
    const b = document.getElementById("banner");
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar la aprobación del plan aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const payload = () => ({ version: plan.version, status: plan.status, preparedBy: plan.preparedBy, approvedBy: plan.approvedBy, approvedOn: plan.approvedOn, notes: plan.notes, snapshot: plan.snapshot, approvedDoc: plan.approvedDoc, history: plan.history });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId(); session = window.GPI!.openSession("pmplan"); ctxDirty = true;
    const mod = p.modules && (p.modules as Record<string, unknown>).pmplan;
    if (mod && typeof mod === "object") { plan = normPlan(mod); window.GPI!.rebaseSession(session, payload()); }
    else plan = blankPlan();
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "pmplan", "El plan para la dirección", payload(), null, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  saveFn = () => { window.clearTimeout(timer); timer = window.setTimeout(push, 800); return true; };
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else refresh(); });
  window.GPI.onChange(() => {
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; }
    refresh();
  });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
})();
function gpiBadge(name: string | undefined, pushFn: () => boolean): void {
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.className = "gpi-badge";
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + esc(name || "—") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  (bar.querySelector("#gpiSyncBtn") as HTMLElement).addEventListener("click", () => {
    const ok = pushFn(), b = bar.querySelector("#gpiSyncBtn") as HTMLElement, t = b.textContent; b.textContent = ok ? "✓ Sincronizado" : "⚠ Sin sincronizar";
    setTimeout(() => { b.textContent = t; }, 1400);
  });
}

// ---------- init ----------
document.querySelectorAll<HTMLElement>("#tabs .tab").forEach((t) => t.addEventListener("click", () => setView(t.dataset.view === "doc" ? "doc" : "state")));
$("btnRefresh").addEventListener("click", () => { ctxDirty = true; setView(view); setStatus("Plan actualizado con lo que hay hoy en las demás herramientas."); });
$("btnWord").addEventListener("click", exportWord);
$("btnPrint").addEventListener("click", printDoc);
setView("state");
