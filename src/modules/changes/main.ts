/* =========================================================
   Control Integrado de Cambios — PMBOK (Realizar el control integrado de cambios)
   Módulo NUEVO (no es un port): patrón del Registro de Riesgos — addEventListener, window.GPI explícito, sin
   frameworks — compilado a changes.js (IIFE).

   Auditoría metodológica: el registro de cambios vivía solo en Costos y solo medía Δ costo. Aquí una solicitud de cambio
   (SC) evalúa A LA VEZ alcance, cronograma, costo, riesgo, calidad y recursos; el CCB la decide con la autoridad que exige
   (cambio de línea base → CCB; reserva de gestión o fondos adicionales → sponsor; contingencia → política de reservas); y se
   marca IMPLEMENTADA solo cuando cada línea base afectada está realmente actualizada. ENLAZA (no duplica) las órdenes de
   cambio de Costos, las modificaciones de alcance de Requisitos y la línea base del cronograma. Lógica PURA en
   src/shared/change-control.ts (con sus pruebas); este archivo es la interfaz.

   Regla de oro: con un proyecto activo arranca EN BLANCO; el ejemplo DISTRIB+ solo se carga con «Cargar ejemplo».
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { EditSession, ProjectMeta } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { normalizeBaseline } from "../../shared/schedule-control";
import { SAMPLE_START_DATE, sampleScheduleModules, sampleSchedulePlan } from "../../shared/schedule-sample";
import { SAMPLE_PLAN, buildSampleRisks } from "../../shared/risk-sample";
import { SAMPLE_COST_ORDERS, buildSampleCrs } from "../../shared/change-sample";
import { fmtDays, makeEngine, resolveTargets, type Engine } from "../../shared/schedule-risk";
import { normalizePlan as normalizeRiskPlan, normalizeRisk } from "../../shared/risk-analysis";
import { AUTH_LABEL, AUTH_LEVELS, tiersText, type ReservePolicy } from "../../shared/reserve-policy";
import {
  AREAS, AREA_LABEL, AREA_STATE_LABEL, CR_STATUSES, CR_TYPES, FUNDS, ORIGINS, approvalProblems, blankCr, crFindings, implementationProblems, nextCode,
  modFacts, normalizeCr, portfolio, requiredAuthorityOf, summarize,
  type Area, type AreaState, type ChangeFacts, type ChangeRequest, type CrStatus
} from "../../shared/change-control";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
const todayISO = (): string => new Date().toISOString().slice(0, 10);
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const CUR: Record<string, string> = { USD: "$", PEN: "S/", EUR: "€" };

// ---------- contexto: lo que se lee de los otros módulos (solo lectura) ----------
interface Leaf { id: string; code: string; name: string; }
interface ActNode { id: string; code: string; name: string; leafId: string | null; }
interface Ctx {
  connected: boolean; sym: string; leaves: Leaf[]; acts: ActNode[]; eng: Engine | null;
  orders: ChangeFacts["orders"]; mods: ChangeFacts["mods"]; risks: ChangeFacts["risks"]; scheduleLog: ChangeFacts["scheduleLog"]; policy: ReservePolicy | null;
}
let ctx: Ctx | null = null, ctxDirty = true;
function getCtx(): Ctx { if (ctxDirty || !ctx) { ctx = buildCtx(); ctxDirty = false; } return ctx; }
function buildCtx(): Ctx {
  const G = window.GPI, connected = !!(G && G.available() && G.active());
  const c: Ctx = { connected, sym: "$", leaves: [], acts: [], eng: null, orders: [], mods: [], risks: [], scheduleLog: [], policy: null };
  if (!G || !G.util) return c;
  try {
    const m = connected ? null : sampleScheduleModules();
    const wbs = connected ? G.getModule("wbs") : (m as NonNullable<typeof m>).wbs;
    c.leaves = G.util.wbsLeaves(wbs).map((l) => ({ id: l.id, code: l.code, name: l.name }));
    const net = connected ? G.util.activeScheduleNetwork() : G.util.scheduleNetwork(wbs, (m as NonNullable<typeof m>).activities, null, (m as NonNullable<typeof m>).schedule, sampleSchedulePlan(), SAMPLE_START_DATE);
    if (net) { c.acts = net.nodes.filter((n) => !n.isMilestone).map((n) => ({ id: n.id, code: n.code, name: n.name, leafId: n.leafId })); c.eng = makeEngine(net, G.util.cpm); }
    if (connected) {
      const meta = G.meta(); c.sym = CUR[(meta && meta.currency) || ""] || "$";
      const cost = rec(G.getModule("cost")), oc = Array.isArray(cost.changeOrders) ? cost.changeOrders.map(rec) : [];
      c.orders = oc.map((o) => ({ id: String(o.id || ""), cost: Number(o.cost) || 0, fund: String(o.fund || ""), status: String(o.status || ""), baselined: o.baselined ? String(o.baselined) : null }));
      c.mods = modFacts(G.getModule("requirements"));       // con su estado, aprobador, solicitud (CCR) y evidencia de incorporación a la línea base de requisitos
      const rk = G.getModule("risks");
      c.risks = (rk && Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1))).map((r) => ({ id: r.id, code: r.code, title: r.title }));
      c.policy = normalizeRiskPlan(rk && rk.plan).reserves;
      const sched = G.getModule("schedule"), bl = normalizeBaseline(sched ? sched.baseline : null);
      c.scheduleLog = bl ? bl.log.map((e) => ({ version: e.version, date: e.date })) : [];
    } else {
      c.orders = SAMPLE_COST_ORDERS.map((o) => ({ ...o }));
      c.risks = buildSampleRisks((code) => "w-" + code).map((r) => ({ id: r.id, code: r.code, title: r.title }));
      c.policy = SAMPLE_PLAN.reserves;
    }
  } catch (e) { /* noop */ }
  return c;
}
// Efecto de una SC sobre el fin del proyecto: el CPM se vuelve a correr con la duración afectada.
function delayOf(cr: ChangeRequest): number | null {
  const C = getCtx();
  if (!C.eng || cr.daysDelta === null || (!cr.wbsIds.length && !cr.actIds.length)) return null;
  const t = resolveTargets(cr, C.eng); if (!t.targets.length) return null;
  const d: Record<string, number> = {}; t.targets.forEach((x) => { d[x.id] = cr.daysDelta as number; });
  const dur = C.eng.duration(d);
  return dur === null ? null : dur - C.eng.base;
}
function factsOf(): ChangeFacts { const C = getCtx(); return { orders: C.orders, mods: C.mods, risks: C.risks, scheduleLog: C.scheduleLog, policy: C.policy, projectDelay: delayOf }; }
const money = (n: number | null | undefined): string => (n == null || !isFinite(n) ? "—" : (n < 0 ? "−" : "") + getCtx().sym + " " + Math.abs(Math.round(n)).toLocaleString("es-PE"));

// ---------- estado ----------
let requests: ChangeRequest[] = [];
let idCounter = 1, selectedId: string | null = null, expanded = new Set<string>();
const byId = (id: string | undefined): ChangeRequest | undefined => requests.find((r) => r.id === id);
const newId = (): string => "cr" + idCounter++;
function loadSample(): void {
  const C = getCtx();
  requests = buildSampleCrs((code) => { const l = C.leaves.find((x) => x.code === code); return l ? l.id : ""; }, (code) => { const r = C.risks.find((x) => x.code === code); return r ? r.id : ""; });
  idCounter = requests.length + 1; selectedId = requests[0] ? requests[0].id : null; expanded = new Set();
}
// Con un proyecto conectado, las órdenes del ejemplo (OC-001…003) existen solo si el alumno las registró en Costos: se avisa cuáles faltan.
function missingSampleOrders(): string[] {
  const C = getCtx(); if (!C.connected) return [];
  const have = new Set(C.orders.map((o) => o.id));
  return SAMPLE_COST_ORDERS.map((o) => o.id).filter((id) => !have.has(id));
}

// ---------- render ----------
const STATUS_CLASS = (s: CrStatus): string => "pill st-" + s;
function areaChips(cr: ChangeRequest): string { return AREAS.map((a) => `<span class="ar ${cr.impact[a].state}" title="${esc(AREA_LABEL[a] + ": " + AREA_STATE_LABEL[cr.impact[a].state])}">${esc(AREA_LABEL[a].slice(0, 3).toUpperCase())}</span>`).join(""); }
function rowHtml(cr: ChangeRequest): string {
  const f = factsOf(), s = summarize(cr, f), fs = crFindings(cr, f, todayISO()), worst = fs.some((x) => x.severity === "aviso") ? "aviso" : "";
  return `<td class="mono">${esc(cr.code)}</td><td><b>${esc(cr.title || "(sin título)")}</b><div class="muted small">${esc(cr.origin || "sin origen")} · ${esc(cr.requester || "sin solicitante")}${cr.requestedOn ? " · " + esc(cr.requestedOn) : ""}</div></td>
    <td>${areaChips(cr)}</td><td class="num">${cr.impact.cost.state === "con_impacto" && cr.costDelta ? money(cr.costDelta) : "—"}</td>
    <td class="num">${s.projectDelay === null ? "—" : (s.projectDelay > 0 ? "+" : "") + fmtDays(Math.round(s.projectDelay * 10) / 10)}</td>
    <td><span class="${STATUS_CLASS(cr.status)}">${esc(cr.status)}</span></td><td class="c">${worst ? `<span class="sv aviso" title="${fs.length} hallazgo(s)">${fs.length}</span>` : (fs.length ? `<span class="sv info">${fs.length}</span>` : "")}</td>`;
}
function head(): string {
  return `<div class="view-head"><h2>Solicitudes de cambio</h2>
    <p>Todo cambio a las líneas base o al plan pasa por aquí. Cada solicitud se <b>evalúa a la vez</b> en alcance, cronograma, costo, riesgo, calidad y recursos; se <b>decide</b> con la autoridad que corresponde (CCB, sponsor o la política de reservas); y solo se marca <b>implementada</b> cuando cada línea base afectada está actualizada: la modificación de alcance en Recopilar Requisitos, la orden de cambio en Costos y la nueva versión LB-n del cronograma. <b>Haz clic en una solicitud</b> para evaluarla.</p></div>`;
}
function kpisHtml(): string {
  const p = portfolio(requests, factsOf(), todayISO()), k = (l: string, v: string, s: string, c = ""): string => `<div class="kpi ${c}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  return `<div class="kpis">${k("Pendientes", String(p.byStatus.Pendiente), p.oldestPendingDays !== null ? "la más antigua: " + p.oldestPendingDays + " d" : "esperan decisión del CCB", p.byStatus.Pendiente ? "warn" : "")}
    ${k("Aprobadas sin implementar", String(p.pendingBaseline), "líneas base por actualizar", p.pendingBaseline ? "bad" : "ok")}
    ${k("Implementadas", String(p.byStatus.Implementada), "líneas base al día", "ok")}
    ${k("Rechazadas / diferidas", p.byStatus.Rechazada + " / " + p.byStatus.Diferida, "documentadas")}
    ${k("Δ costo aprobado", money(p.approvedCost), "aprobadas e implementadas")}
    ${k("Efecto aprobado en el plazo", (p.approvedDays > 0 ? "+" : "") + fmtDays(Math.round(p.approvedDays * 10) / 10), "sobre el fin del proyecto (CPM)")}</div>`;
}
function render(): void {
  const main = $("mainArea");
  if (!requests.length) { main.innerHTML = head() + `<div class="empty-hint">Aún no hay solicitudes de cambio. Usa <b>+ Solicitud de cambio</b> para registrar la primera, o <b>Cargar ejemplo</b> para ver el caso DISTRIB+ S.A.</div>`; ($("btnDelete") as HTMLButtonElement).disabled = true; return; }
  const rows = requests.map((r) => {
    const open = expanded.has(r.id);
    return `<tr class="cr-row${r.id === selectedId ? " sel" : ""}" data-id="${esc(r.id)}" tabindex="0" role="button" aria-expanded="${open}">${rowHtml(r)}</tr>
      <tr class="cr-det" data-id="${esc(r.id)}" style="display:${open ? "table-row" : "none"}"><td colspan="7"><div id="det-${esc(r.id)}">${open ? detailHtml(r) : ""}</div></td></tr>`;
  }).join("");
  main.innerHTML = head() + `<div id="kpiBox">${kpisHtml()}</div><div class="card"><table class="an"><thead><tr><th>Código</th><th>Solicitud</th><th>Áreas evaluadas</th><th class="num">Δ costo</th><th class="num">Fin del proyecto</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  wireMain();
  ($("btnDelete") as HTMLButtonElement).disabled = !selectedId;
}
// ---- editor de detalle ----
const fld = (label: string, control: string, cls = "", hint = ""): string => `<div class="fd ${cls}"><label>${label}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
const inp = (c: ChangeRequest, f: string, v: unknown, type = "text", extra = ""): string => `<input class="ri" ${type === "number" ? 'type="number" step="any"' : type === "date" ? 'type="date"' : 'type="text"'} data-id="${esc(c.id)}" data-f="${f}" value="${esc(v === null || v === undefined ? "" : v)}" ${extra}>`;
const txt = (c: ChangeRequest, f: string, v: string, rows = 2, ph = ""): string => `<textarea class="ri" rows="${rows}" data-id="${esc(c.id)}" data-f="${f}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
const sel = (c: ChangeRequest, f: string, opts: Array<[string, string]>, cur: string): string => `<select class="ri" data-id="${esc(c.id)}" data-f="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const msel = (c: ChangeRequest, f: string, opts: Array<[string, string]>, cur: string[], size = 5): string => `<select class="ri" multiple size="${size}" data-id="${esc(c.id)}" data-f="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur.indexOf(v) >= 0 ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
function areaRow(cr: ChangeRequest, a: Area, extra: string): string {
  const im = cr.impact[a];
  return `<div class="area"><div class="an-h">${esc(AREA_LABEL[a])}</div><div style="display:grid;grid-template-columns:180px 1fr;gap:8px">
    <select class="ri" data-id="${esc(cr.id)}" data-f="impact" data-a="${a}" data-k="state" aria-label="Impacto en ${esc(AREA_LABEL[a].toLowerCase())}">${(["sin_evaluar", "sin_impacto", "con_impacto"] as AreaState[]).map((s) => `<option value="${s}" ${im.state === s ? "selected" : ""}>${AREA_STATE_LABEL[s]}</option>`).join("")}</select>
    <input class="ri" type="text" data-id="${esc(cr.id)}" data-f="impact" data-a="${a}" data-k="note" value="${esc(im.note)}" placeholder="${a === "cost" || a === "schedule" ? "Nota (opcional; se cuantifica abajo)" : "Describe el impacto o por qué no lo hay"}"></div>${extra ? `<div class="extra">${extra}</div>` : ""}</div>`;
}
function detailHtml(cr: ChangeRequest): string {
  const C = getCtx(), f = factsOf();
  const leafOpts = C.leaves.map((l): [string, string] => [l.id, l.code + " " + l.name]);
  const actOpts = C.acts.filter((n) => !cr.wbsIds.length || (n.leafId !== null && cr.wbsIds.indexOf(n.leafId) >= 0)).map((n): [string, string] => { const row = C.eng ? C.eng.rows[n.id] : null; return [n.id, n.code + " " + n.name + (row ? (row.tf <= 1e-6 ? " · crítica" : " · holgura " + fmtDays(row.tf)) : "")]; });
  const ordOpts = C.orders.map((o): [string, string] => [o.id, o.id + " · " + money(o.cost) + " · " + o.fund + " · " + o.status]);
  const modOpts = C.mods.map((m): [string, string] => [m.id, m.code + " " + m.title]);
  const rkOpts = C.risks.map((r): [string, string] => [r.id, r.code + " " + r.title]);
  const sched = areaRow(cr, "schedule", `${fld("Paquetes afectados", msel(cr, "wbsIds", leafOpts, cr.wbsIds))}${fld("Actividades (opcional)", msel(cr, "actIds", actOpts, cr.actIds), "", "Sin elegir: se aplica una vez a la de menor holgura del paquete.")}${fld("Días que suma (o resta) a esas actividades", inp(cr, "daysDelta", cr.daysDelta, "number"))}<div class="fd"><label>Efecto en el fin del proyecto</label><div id="eff-${esc(cr.id)}" class="hint">${effectHtml(cr)}</div></div>`);
  const cost = areaRow(cr, "cost", `${fld("Δ costo (" + esc(C.sym) + ")", inp(cr, "costDelta", cr.costDelta, "number"))}${fld("Fuente de fondos", sel(cr, "fund", [["", "— Elige —"], ...FUNDS.map((x): [string, string] => [x, x])], cr.fund))}${fld("Órdenes de cambio de Costos", msel(cr, "orderIds", ordOpts, cr.orderIds, 4), "wide", C.orders.length ? "Vincula la orden que financia este cambio (se comprueba su monto, su aprobación y su línea base)." : "Este proyecto aún no tiene órdenes de cambio en Costos.")}`);
  const scope = areaRow(cr, "scope", `${fld("Modificaciones de alcance (Recopilar Requisitos)", msel(cr, "modIds", modOpts, cr.modIds, 3), "wide", C.mods.length ? "" : "Aún no hay modificaciones de alcance registradas en Recopilar Requisitos.")}`);
  const risk = areaRow(cr, "risk", `${fld("Riesgos afectados o que origina", msel(cr, "riskIds", rkOpts, cr.riskIds, 4), "wide")}`);
  const req = requiredAuthorityOf(cr, f);
  const lbOpts: Array<[string, string]> = [["", "— ninguna todavía —"], ...C.scheduleLog.map((l): [string, string] => [l.version, l.version + " (" + l.date + ")"])];
  return `<div class="det-grid">
    <div class="sec">1 · Identificación</div>
    ${fld("Código", inp(cr, "code", cr.code))}${fld("Título", inp(cr, "title", cr.title), "two")}
    ${fld("Descripción del cambio", txt(cr, "description", cr.description, 2, "¿Qué se pide cambiar y por qué?"), "wide")}
    ${fld("Solicitante", inp(cr, "requester", cr.requester))}${fld("Fecha de solicitud", inp(cr, "requestedOn", cr.requestedOn, "date"))}
    ${fld("Origen", sel(cr, "origin", [["", "— Elige —"], ...ORIGINS.map((x): [string, string] => [x, x])], cr.origin))}${fld("Tipo de solicitud", sel(cr, "type", [["", "— Elige —"], ...CR_TYPES.map((x): [string, string] => [x, x])], cr.type))}
    <div class="sec">2 · Evaluación integrada del impacto (las seis áreas)</div>
    ${scope}${sched}${cost}${risk}${areaRow(cr, "quality", "")}${areaRow(cr, "resources", "")}
    <div class="sec">3 · Decisión del CCB</div>
    <div class="fd wide"><div id="calc-${esc(cr.id)}">${calcHtml(cr)}</div></div>
    ${fld("Estado", sel(cr, "status", CR_STATUSES.map((s): [string, string] => [s, s]), cr.status), "", "Aprobar exige la evaluación completa y la autoridad requerida; Implementada, las líneas base actualizadas.")}
    ${fld("Fecha de la decisión", inp(cr, "decidedOn", cr.decidedOn, "date"))}${fld("Quién decide (CCB, sponsor…)", inp(cr, "approver", cr.approver))}
    ${fld("Nivel de autoridad", sel(cr, "authLevel", [["", "— Elige —"], ...AUTH_LEVELS.map((l): [string, string] => [l, AUTH_LABEL[l]])], cr.authLevel), "", "Exigido: <b>" + esc(AUTH_LABEL[req.level]) + "</b> (" + esc(req.why) + ").")}
    ${fld("Fundamento de la decisión", txt(cr, "rationale", cr.rationale, 2, "¿Por qué se aprueba, rechaza o difiere?"), "two")}
    <div class="sec">4 · Actualización de las líneas base y trazabilidad</div>
    ${fld("Versión de la línea base del cronograma que la incorporó", sel(cr, "scheduleBaseline", lbOpts, cr.scheduleBaseline), "", C.scheduleLog.length ? "" : "Aún no hay línea base del cronograma: fíjala en Cronograma/CPM → Salud y línea base.")}
    ${fld("Notas", txt(cr, "notes", cr.notes, 2), "two")}
  </div>`;
}
function effectHtml(cr: ChangeRequest): string {
  const C = getCtx(); if (!C.eng) return "El proyecto no tiene una red de actividades: no se puede calcular el efecto en el plazo.";
  if (cr.daysDelta === null || (!cr.wbsIds.length && !cr.actIds.length)) return "Elige los paquetes o actividades afectados y los días.";
  const t = resolveTargets(cr, C.eng), d = delayOf(cr); if (!t.targets.length || d === null) return "Las actividades elegidas no existen en el cronograma.";
  const tg = t.targets.map((x) => esc(x.code) + (x.tf <= 1e-6 ? " (crítica)" : " (holgura " + fmtDays(x.tf) + ")")).join(", ");
  return "Sobre " + tg + ": <b>" + (Math.abs(d) < 0.05 ? "la holgura lo absorbe: el fin del proyecto no se mueve" : (d > 0 ? "+" : "") + fmtDays(Math.round(d * 10) / 10) + " el fin del proyecto") + "</b>.";
}
function calcHtml(cr: ChangeRequest): string {
  const f = factsOf(), s = summarize(cr, f), req = requiredAuthorityOf(cr, f), fs = crFindings(cr, f, todayISO());
  const list = (t: string, xs: string[]): string => (xs.length ? `<div class="${t === "bad" ? "msg" : "warn-box"}" style="margin:8px 0"><b>${t === "bad" ? "No se puede aprobar todavía:" : "Para implementarla falta:"}</b><ul style="margin:4px 0 0 18px">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "");
  const pol = f.policy && (f.policy.pmLimit !== null || f.policy.ccbLimit !== null) ? `Política de reservas: ${esc(tiersText(f.policy, (n) => money(n)))}.` : "";
  const bl = [s.baselines.scope ? "alcance (MOD)" : "", s.baselines.schedule ? "cronograma (LB-n)" : "", s.baselines.cost ? "costos (LB-n)" : ""].filter(Boolean);
  return `<div class="note-box" style="margin:0 0 8px"><b>Líneas base que deben cambiar:</b> ${bl.length ? esc(bl.join(" · ")) : "ninguna"}. ${s.reasons.length ? "<br>" + s.reasons.map((r) => esc(r.charAt(0).toUpperCase() + r.slice(1))).join("<br>") : ""}<br><b>Autoridad requerida:</b> ${esc(AUTH_LABEL[req.level])} (${esc(req.why)}). ${pol}</div>
    ${cr.status === "Pendiente" ? list("bad", approvalProblems(cr, f)) : ""}${cr.status === "Aprobada" ? list("warn", implementationProblems(cr, f)) : ""}
    ${fs.length ? `<ul class="finds">${fs.map((x) => `<li><span class="sv ${x.severity}">${esc(x.code)}</span>${esc(x.text)}</li>`).join("")}</ul>` : ""}`;
}
const rowEl = (id: string): HTMLElement | null => Array.from(document.querySelectorAll<HTMLElement>("tr.cr-row")).find((e) => e.dataset.id === id) || null;
function refreshCr(cr: ChangeRequest): void {
  const tr = rowEl(cr.id); if (tr) tr.innerHTML = rowHtml(cr);
  const calc = document.getElementById("calc-" + cr.id); if (calc) calc.innerHTML = calcHtml(cr);
  const eff = document.getElementById("eff-" + cr.id); if (eff) eff.innerHTML = effectHtml(cr);
  const k = document.getElementById("kpiBox"); if (k) k.innerHTML = kpisHtml();
}
function redrawDetail(cr: ChangeRequest): void { const box = document.getElementById("det-" + cr.id); if (box) { box.innerHTML = detailHtml(cr); bindDetail(box); } refreshCr(cr); }

// ---------- edición ----------
function onField(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const cr = byId(el.dataset.id); if (!cr) return;
  const f = el.dataset.f as string, rc = cr as unknown as Record<string, unknown>;
  if (f === "impact") { const a = el.dataset.a as Area, k = el.dataset.k as "state" | "note"; (cr.impact[a] as unknown as Record<string, string>)[k] = el.value; if (k === "state") { redrawDetail(cr); save(); return; } }
  else if (f === "wbsIds" || f === "actIds" || f === "orderIds" || f === "modIds" || f === "riskIds") {
    rc[f] = Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.value);
    if (f === "wbsIds" && cr.wbsIds.length) cr.actIds = cr.actIds.filter((id) => { const n = getCtx().acts.find((x) => x.id === id); return !n || (n.leafId !== null && cr.wbsIds.indexOf(n.leafId) >= 0); });
    if (f === "wbsIds") { redrawDetail(cr); save(); return; }
  }
  else if (f === "daysDelta" || f === "costDelta") { const raw = (el as HTMLInputElement).value.trim(), n = raw === "" ? null : Number(raw); rc[f] = n !== null && isFinite(n) ? n : null; }
  else if (f === "status") { changeStatus(cr, el.value as CrStatus); return; }
  else rc[f] = el.value;
  refreshCr(cr); save();
}
// Cambiar el estado aplica las reglas: aprobar exige evaluación completa y autoridad; implementar, líneas base al día.
function changeStatus(cr: ChangeRequest, to: CrStatus): void {
  const f = factsOf(); let problems: string[] = [];
  if (to === "Aprobada") problems = approvalProblems(cr, f);
  else if (to === "Implementada") { problems = cr.status !== "Aprobada" ? ["primero debe estar Aprobada"] : implementationProblems(cr, f); }
  else if (to === "Rechazada" || to === "Diferida") { if (!cr.approver.trim()) problems.push("registra quién decide"); if (!cr.rationale.trim()) problems.push("documenta el motivo en el fundamento de la decisión"); }
  if (problems.length) { setStatus("No se puede pasar " + cr.code + " a «" + to + "»: " + problems.join("; ") + "."); redrawDetail(cr); showProblems(cr, "No se puede pasar a «" + to + "»", problems); return; }
  cr.status = to;
  if (to === "Aprobada" || to === "Rechazada" || to === "Diferida") { if (!cr.decidedOn) cr.decidedOn = todayISO(); }
  if (to === "Implementada") cr.implementedOn = todayISO(); else if (to !== "Aprobada") cr.implementedOn = "";
  redrawDetail(cr); save(); setStatus(cr.code + " → " + to + ".");
}
function showProblems(cr: ChangeRequest, title: string, problems: string[]): void {
  const calc = document.getElementById("calc-" + cr.id); if (!calc) return;
  calc.insertAdjacentHTML("afterbegin", `<div class="msg"><b>${esc(title)}:</b><ul style="margin:4px 0 0 18px">${problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`);
}
function bindDetail(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(".ri").forEach((el) => el.addEventListener(el.tagName === "SELECT" || (el as HTMLInputElement).type === "date" ? "change" : "input", () => onField(el)));
}
function wireMain(): void {
  document.querySelectorAll<HTMLElement>("tr.cr-row").forEach((tr) => {
    const toggle = (): void => { const id = tr.dataset.id as string; if (expanded.has(id)) expanded.delete(id); else { expanded.add(id); } selectedId = id; render(); };
    tr.addEventListener("click", toggle);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
  document.querySelectorAll<HTMLElement>("[id^='det-']").forEach((box) => { if (box.innerHTML.trim()) bindDetail(box); });
}
function addRequest(): void {
  const c = blankCr(newId(), nextCode(requests)); c.requestedOn = todayISO();
  requests.push(c); selectedId = c.id; expanded.add(c.id); render(); save();
  const row = rowEl(c.id); if (row) row.scrollIntoView({ block: "center" });
  setStatus(c.code + " creada: evalúa su impacto en las seis áreas.");
}
function deleteSelected(): void {
  const c = byId(selectedId || undefined); if (!c) return;
  showConfirm("¿Eliminar la solicitud " + c.code + " «" + (c.title || "sin título") + "»? Esta acción no se puede deshacer.", "Confirmar acción", "Eliminar").then((ok) => {
    if (!ok) return; const i = requests.findIndex((x) => x.id === c.id); if (i > -1) { expanded.delete(c.id); requests.splice(i, 1); }
    selectedId = requests.length ? requests[Math.max(0, i - 1)].id : null; render(); save(); setStatus("Solicitud eliminada.");
  });
}
function exportCsv(): void {
  const f = factsOf(), q = (v: unknown): string => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [["Codigo", "Titulo", "Origen", "Tipo", "Solicitante", "Fecha", "Estado", "Decision", "Decide", "Nivel", "Delta_Costo", "Fondo", "Ordenes", "Dias", "Efecto_Fin_Dias", "MOD", "Riesgos", "LB_Cronograma", ...AREAS.map((a) => "Impacto_" + a)].join(",")];
  requests.forEach((c) => { const d = delayOf(c); lines.push([c.code, c.title, c.origin, c.type, c.requester, c.requestedOn, c.status, c.decidedOn, c.approver, c.authLevel, c.costDelta ?? "", c.fund, c.orderIds.join(" "), c.daysDelta ?? "", d === null ? "" : Math.round(d * 10) / 10, c.modIds.join(" "), c.riskIds.join(" "), c.scheduleBaseline, ...AREAS.map((a) => c.impact[a].state)].map(q).join(",")); });
  void f;
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "solicitudes_de_cambio.csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Solicitudes exportadas como CSV.");
}

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
function wireToolbar(): void {
  $("btnAdd").addEventListener("click", addRequest);
  $("btnDelete").addEventListener("click", deleteSelected);
  $("btnExportCsv").addEventListener("click", exportCsv);
  $("btnPrint").addEventListener("click", () => window.print());
  $("btnSample").addEventListener("click", () => {
    showConfirm("Esto reemplazará las solicitudes actuales con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => { if (ok) { ctxDirty = true; loadSample(); render(); save(); const falta = missingSampleOrders(); setStatus("Caso de ejemplo cargado." + (falta.length ? " Costos de este proyecto aún no tiene las órdenes " + falta.join(", ") + ": las solicitudes las referencian; regístralas en Estimar/Gestionar Costos para que se verifiquen." : "")); } });
  });
  $("btnReset").addEventListener("click", () => {
    showConfirm("Esto borrará todas las solicitudes de cambio. ¿Continuar?", "Nuevo registro").then((ok) => { if (ok) { requests = []; idCounter = 1; selectedId = null; expanded = new Set(); render(); save(); setStatus("Registro nuevo iniciado."); } });
  });
}

// ---------- persistencia (proyecto conectado) ----------
let saveFn: () => boolean = () => false;
function save(): void { saveFn(); }
(function gpiBridge() {
  if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
  const proj = window.GPI.active();
  const titleEl = $("projectTitle") as HTMLInputElement, courseEl = $("courseTitle") as HTMLInputElement;
  let loadedProjectId: string | null = null, session: EditSession | null = null, projectStale = false, timer: number | undefined;
  function markProjectStale(): void {
    if (projectStale) return; projectStale = true;
    setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
    const b = document.getElementById("banner");
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar las solicitudes de cambio aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const payload = () => ({ requests, idCounter });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId(); session = window.GPI!.openSession("changes");
    if (p.meta) { if (p.meta.name) titleEl.value = p.meta.name; if (p.meta.course) courseEl.value = p.meta.course; }
    ctxDirty = true;
    const mod = p.modules && (p.modules as Record<string, unknown>).changes as { requests?: unknown[]; idCounter?: number } | undefined;
    if (mod && Array.isArray(mod.requests)) {
      requests = mod.requests.map((o, i) => normalizeCr(o, "cr" + (i + 1))); idCounter = Number(mod.idCounter) || requests.length + 1;
      selectedId = requests.length ? requests[0].id : null; expanded = new Set();
      window.GPI!.rebaseSession(session, payload()); render(); setStatus("Datos cargados desde el Panel de Control.");
    } else { requests = []; idCounter = 1; selectedId = null; expanded = new Set(); render(); setStatus("Proyecto sin solicitudes de cambio todavía. Registra la primera, o usa Cargar ejemplo para explorar el caso DISTRIB+."); }
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "changes", "El control de cambios", payload(), { name: titleEl.value, course: courseEl.value } as Partial<ProjectMeta>, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  saveFn = () => { window.clearTimeout(timer); timer = window.setTimeout(push, 800); return true; };
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  // Costos, Requisitos, Riesgos y Cronograma los editan otros módulos: se vuelve a leer al volver a esta pestaña.
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); else { ctxDirty = true; render(); } });
  window.GPI.onChange(() => {
    ctxDirty = true;
    const p = window.GPI!.active(); if (!p || !p.meta) return;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return; }
    if (p.meta.name && document.activeElement !== titleEl) titleEl.value = p.meta.name;
    if (p.meta.course && document.activeElement !== courseEl) courseEl.value = p.meta.course;
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
wireToolbar();
if (!(window.GPI && window.GPI.available() && window.GPI.active())) { ctxDirty = true; loadSample(); render(); }   // independiente: el ejemplo
else render();
