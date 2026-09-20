/* =========================================================
   Registro de Riesgos — PMBOK (Gestión de los riesgos) + AACE (valor esperado)
   Módulo NUEVO (no es un port): sigue el patrón de Stakeholder Studio —
   addEventListener exclusivamente, window.GPI explícito, sin frameworks — y
   se compila a risks.js (IIFE).

   Base metodológica (detalle en src/shared/risk-analysis.ts):
     · PMI: enunciado causa–evento–efecto, RBS, matriz probabilidad×impacto con
       umbrales del PLAN, estrategias distintas para amenazas y oportunidades,
       respuesta contingente con disparador, riesgo residual, monitoreo.
     · AACE: valor esperado con rango de tres puntos (RP 44R-08) y exposición
       residual como base de la contingencia.
   Toda la lógica de cálculo y de coherencia es PURA y vive en
   src/shared/risk-analysis.ts (con sus pruebas); este archivo es la interfaz.

   Regla de oro: con un proyecto activo sin riesgos, arranca EN BLANCO; el
   ejemplo DISTRIB+ solo se carga con «Cargar ejemplo».
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { EditSession, ProjectMeta } from "../../core/types";
import { pushWithSession } from "../../shared/write-session";
import { SAMPLE_LINKED_ORDERS, SAMPLE_PLAN, buildSampleRisks } from "../../shared/risk-sample";
import {
  IMPACT_LABELS, PROB_LABELS, PROXIMITY, PROXIMITY_LABEL, RISK_STATUSES, STATUS_LABEL, STRATEGY_HINT,
  blankRisk, buildMatrix, costLevel, inherentEV, inherentScore, isOpen, levelOf, maxImpact, nextCode,
  normalizePlan, normalizeRisk, portfolio, probEffective, rankRisks, residualOf, riskFindings, strategiesFor, timeLevel,
  toLevel, toNum, validatePlan,
  type Finding, type Risk, type RiskLevel, type RiskPlan, type RiskType
} from "../../shared/risk-analysis";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- utilidades ----------
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
const todayISO = (): string => new Date().toISOString().slice(0, 10);
function setStatus(msg: string): void { $("statusLeft").textContent = msg; }

// ---------- contexto (proyecto conectado o ejemplo independiente) ----------
interface Leaf { id: string; code: string; name: string; }
const CUR: Record<string, string> = { USD: "$", PEN: "S/", EUR: "€" };
let connected = false, currency = "USD", costBase = 0;
let leaves: Leaf[] = [], roles: string[] = [];
const sym = (): string => CUR[currency] || "$";
const money = (n: number | null | undefined): string => (n == null || !isFinite(n) ? "—" : sym() + " " + Math.round(n).toLocaleString("es-PE"));

// Caso DISTRIB+ S.A. (mismo proyecto que los demás módulos): EDT de 18 paquetes, roles del OBS y costo base de Costos.
const SAMPLE_LEAVES: Leaf[] = [
  ["1.1", "Acta de constitución"], ["1.2", "Plan de gestión del proyecto"], ["1.3", "Informes de seguimiento y control"],
  ["2.1", "Estudio de suelos"], ["2.2", "Diseño estructural"], ["2.3", "Diseño eléctrico y sanitario"], ["2.4", "Permisos y licencias municipales"],
  ["3.1", "Estructuras metálicas prefabricadas"], ["3.2", "Materiales de construcción"], ["3.3", "Equipos eléctricos e instalaciones"],
  ["4.1", "Movimiento de tierras"], ["4.2", "Cimentaciones"], ["4.3", "Estructura y cobertura"], ["4.4", "Acabados y cerramientos"], ["4.5", "Instalaciones MEP"],
  ["5.1", "Pruebas de instalaciones"], ["5.2", "Capacitación al cliente"], ["5.3", "Acta de entrega y cierre"]
].map(([code, name]) => ({ id: "w-" + code, code, name }));
const SAMPLE_ROLES = ["Sponsor (Gerencia General)", "Director de Proyecto", "Jefe de Ingeniería", "Jefe de Logística", "Residente de Obra", "Control de Calidad / QA-QC", "Asesoría Legal"];
const SAMPLE_COST_BASE = 7100000;

function refreshContext(): void {
  const G = window.GPI;
  connected = !!(G && G.available() && G.active());
  if (connected && G) {
    try {
      const wbs = G.getModule("wbs");
      leaves = G.util.wbsLeaves(wbs).map((l) => ({ id: l.id, code: l.code, name: l.name }));
      const obs = G.getModule("obs");
      roles = Array.from(new Set(G.util.obsNodes(obs).map((n) => (n.role || G.util.obsLabel(n) || "").trim()).filter(Boolean)));
      const cost = G.getModule("cost");
      costBase = Number(cost && cost.budget && (cost.budget.baseCost || (cost.budget.computed && cost.budget.computed.base))) || 0;
      const m = G.meta(); currency = (m && m.currency) || "USD";
    } catch (e) { /* noop */ }
  } else { leaves = SAMPLE_LEAVES; roles = SAMPLE_ROLES; costBase = SAMPLE_COST_BASE; currency = "USD"; }
}

// ---------- estado ----------
let plan: RiskPlan = normalizePlan(null);
let risks: Risk[] = [];
let idCounter = 1;
let selectedId: string | null = null;
let view: "registro" | "matriz" | "analisis" | "plan" = "registro";
let matrixWhich: "inherent" | "residual" = "inherent";
let sortByScore = false;
let expanded = new Set<string>();
const newId = (): string => "rk" + idCounter++;
const byId = (id: string | undefined): Risk | undefined => risks.find((r) => r.id === id);
const leafCode = (id: string): string => { const l = leaves.find((x) => x.id === id); return l ? l.code : id; };

// Los datos del ejemplo viven en shared/risk-sample.ts (los comparte Costos). Conectado: se empareja por Código EDT
// con la EDT real (lo que no existe se omite); independiente: ids de muestra.
function sampleRisks(): Risk[] { return buildSampleRisks((c) => { const l = leaves.find((x) => x.code === c); return l ? l.id : ""; }); }
function loadSample(): void {
  plan = SAMPLE_PLAN; risks = sampleRisks(); idCounter = risks.length + 1;
  selectedId = risks[0] ? risks[0].id : null; expanded = new Set();
}
function blankAnalysis(): void { plan = normalizePlan(null); risks = []; idCounter = 1; selectedId = null; expanded = new Set(); }

// ---------- presentación de valores ----------
const LV: Record<RiskLevel, string> = { alto: "ALTO", medio: "MEDIO", bajo: "BAJO" };
function levelPill(score: number | null, opp = false): string {
  const lv = levelOf(score, plan);
  return lv ? `<span class="lv lv-${lv}${opp ? " opp" : ""}" title="Puntaje ${score}">${LV[lv]} · ${score}</span>` : `<span class="lv lv-none">Sin analizar</span>`;
}
const sevText: Record<string, string> = { riesgo: "RIESGO", aviso: "AVISO", info: "NOTA" };
function findingsHtml(fs: Finding[]): string {
  return fs.length ? `<ul class="rk-finds">${fs.map((f) => `<li><span class="sv ${f.severity}">${sevText[f.severity]}</span>${esc(f.text)}</li>`).join("")}</ul>` : `<div class="muted small">Sin hallazgos de coherencia.</div>`;
}
// Órdenes de cambio de Costos vinculadas a un riesgo (solo lectura). Conectado: las del proyecto; independiente: las del ejemplo.
interface LinkedOrder { id: string; cost: number; status: string; fund: string; }
function linkedOrders(r: Risk): LinkedOrder[] {
  let all: Array<Record<string, unknown>> = [];
  if (connected && window.GPI) { try { const c = window.GPI.getModule("cost"); all = (c && Array.isArray(c.changeOrders) ? c.changeOrders : []) as Array<Record<string, unknown>>; } catch (e) { /* noop */ } }
  else all = SAMPLE_LINKED_ORDERS as unknown as Array<Record<string, unknown>>;
  return all.filter((o) => o && o.riskId === r.id).map((o) => ({ id: String(o.id || ""), cost: Number(o.cost) || 0, status: String(o.status || ""), fund: String(o.fund || "") }));
}
const linkedSummary = (r: Risk): { approved: number; count: number } => { const l = linkedOrders(r); return { approved: l.filter((o) => o.status === "Aprobada").reduce((s, o) => s + o.cost, 0), count: l.length }; };
const findingsOf = (r: Risk): Finding[] => riskFindings(r, plan, { today: todayISO(), costBase, leafIds: leaves.map((l) => l.id), linked: r.status === "materializado" ? linkedSummary(r) : undefined });
const statement = (r: Risk): string => (r.cause.trim() || r.event.trim() || r.effect.trim())
  ? "Debido a " + (r.cause.trim() || "…") + ", puede ocurrir que " + (r.event.trim() || "…") + ", lo que " + (r.type === "amenaza" ? "causaría " : "generaría ") + (r.effect.trim() || "…") + "." : "";

// ---------- render principal ----------
function render(): void {
  document.querySelectorAll<HTMLElement>("#viewGroup .btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const main = $("mainArea"), prev = main.scrollTop;
  main.innerHTML = view === "registro" ? renderRegister() : view === "matriz" ? renderMatrix() : view === "analisis" ? renderAnalysis() : renderPlan();
  wireMain();
  renderSidebar();
  main.scrollTop = prev;
  ($("btnDelete") as HTMLButtonElement).disabled = !selectedId;
}

// ---------- vista 1: registro ----------
function rowHtml(r: Risk): string {
  const sc = inherentScore(r), res = residualOf(r, plan), open = isOpen(r), fs = findingsOf(r);
  const worst = fs.some((f) => f.severity === "riesgo") ? "riesgo" : fs.some((f) => f.severity === "aviso") ? "aviso" : "";
  const imp = maxImpact(r.impCost, r.impTime, r.impScope);
  const resTxt = res.assessed && res.score !== null && r.strategy !== "aceptar" ? levelPill(res.score, r.type === "oportunidad") : `<span class="muted small">${r.strategy === "aceptar" ? "= inherente" : "—"}</span>`;
  return `<td class="mono">${esc(r.code)}</td>
    <td><div class="rk-title">${esc(r.title || "(sin título)")}</div>
      <div class="rk-sub"><span class="typ typ-${r.type}">${r.type === "amenaza" ? "AMENAZA" : "OPORTUNIDAD"}</span> ${esc(r.category || "sin categoría")}${r.wbsIds.length ? " · EDT " + esc(r.wbsIds.map(leafCode).join(", ")) : ""}</div></td>
    <td>${esc(r.owner || "—")}</td>
    <td class="c">${r.prob === null ? "—" : r.prob}</td><td class="c">${imp === null ? "—" : imp}</td>
    <td>${open || r.status === "materializado" ? levelPill(sc, r.type === "oportunidad") : `<span class="muted small">—</span>`}</td>
    <td>${resTxt}</td>
    <td>${esc(r.strategy || "—")}</td>
    <td><span class="st st-${r.status}">${esc(STATUS_LABEL[r.status])}</span></td>
    <td class="c">${worst ? `<span class="fbadge ${worst}" title="${fs.length} hallazgo(s)">${fs.length}</span>` : ""}</td>`;
}
function renderRegister(): string {
  const head = `<div class="view-head"><h2>Registro de riesgos</h2>
    <p>La base del proceso: cada riesgo se describe como <b>causa → evento → efecto</b>, se ubica en la <b>RBS</b>, se analiza (probabilidad e impacto en costo, plazo y alcance/calidad), se cuantifica cuando pesa, recibe una <b>estrategia</b> y un <b>propietario</b>, y se revisa periódicamente. Los <b>eventos discretos</b> se gestionan aquí; la <b>incertidumbre del estimado</b> se trata con el análisis de rangos de Costos. <b>Haz clic en un riesgo</b> para editarlo.</p></div>`;
  if (!risks.length) return head + `<div class="empty-hint">Aún no hay riesgos. Usa <b>+ Amenaza</b> o <b>+ Oportunidad</b> para empezar, o <b>Cargar ejemplo</b> para ver el caso DISTRIB+ S.A.</div>`;
  const list = sortByScore ? risks.slice().sort((a, b) => (inherentScore(b) ?? -1) - (inherentScore(a) ?? -1) || a.code.localeCompare(b.code)) : risks;
  const rows = list.map((r) => {
    const open = expanded.has(r.id);
    return `<tr class="rk-row${open ? " open" : ""}${r.id === selectedId ? " sel" : ""}" data-id="${esc(r.id)}" tabindex="0" role="button" aria-expanded="${open}">${rowHtml(r)}</tr>
      <tr class="rk-det" data-id="${esc(r.id)}" style="display:${open ? "table-row" : "none"}"><td colspan="10"><div class="det-box" id="det-${esc(r.id)}">${open ? detailHtml(r) : ""}</div></td></tr>`;
  }).join("");
  return head + `<div class="reg-toolbar"><button class="btn" id="btnSort">${sortByScore ? "☰ Orden del registro" : "⇅ Ordenar por puntaje"}</button>
      <button class="btn" id="btnExpandAll">⊞ Expandir todo</button><button class="btn" id="btnCollapseAll">⊟ Colapsar todo</button></div>
    <div class="rk-wrap"><table class="rk"><thead><tr><th>Código</th><th class="l">Riesgo</th><th class="l">Propietario</th><th>P</th><th>I máx.</th><th class="l">Puntaje</th><th class="l">Residual</th><th class="l">Estrategia</th><th class="l">Estado</th><th>Hallazgos</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
// ---- editor de detalle ----
function fld(label: string, control: string, wide = false, hint = ""): string { return `<div class="fd${wide ? " wide" : ""}"><label>${label}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`; }
function inp(r: Risk, f: string, v: unknown, type = "text", extra = "", k = "", t = ""): string {
  return `<input ${type === "number" ? 'type="number" step="any"' : type === "date" ? 'type="date"' : 'type="text"'} class="ri" data-id="${esc(r.id)}" data-f="${f}"${k ? ` data-k="${k}"` : ""}${t ? ` data-t="${t}"` : ""} value="${esc(v === null || v === undefined ? "" : v)}" ${extra}>`;
}
function txt(r: Risk, f: string, v: string, rows = 2, ph = ""): string { return `<textarea class="ri" rows="${rows}" data-id="${esc(r.id)}" data-f="${f}" placeholder="${esc(ph)}">${esc(v)}</textarea>`; }
function sel(r: Risk, f: string, opts: Array<[string, string]>, cur: string | number | null, t = ""): string {
  return `<select class="ri" data-id="${esc(r.id)}" data-f="${f}"${t ? ` data-t="${t}"` : ""}>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur === null ? "" : cur) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
}
const levelOpts = (labels: string[], desc?: string[]): Array<[string, string]> => [["", "Sin evaluar"], ...labels.map((l, i): [string, string] => [String(i + 1), (i + 1) + " · " + l + (desc ? " — " + desc[i] : "")])];
function detailHtml(r: Risk): string {
  const opp = r.type === "oportunidad";
  const probOpts = levelOpts(PROB_LABELS, plan.probPct.map((p) => "≈ " + p + " %"));
  const impC = levelOpts(IMPACT_LABELS, plan.costBandsPct.map((b, i) => (i === 0 ? "≤ " : "hasta ") + b + " % del costo base").concat(["más del " + plan.costBandsPct[3] + " %"]));
  const impT = levelOpts(IMPACT_LABELS, plan.timeBandsDays.map((b, i) => (i === 0 ? "≤ " : "hasta ") + b + " d").concat(["más de " + plan.timeBandsDays[3] + " d"]));
  const impS = levelOpts(IMPACT_LABELS, plan.scopeDescriptors);
  const strat = strategiesFor(r.type), leafSel = `<select class="ri" multiple size="6" data-id="${esc(r.id)}" data-f="wbsIds">${leaves.map((l) => `<option value="${esc(l.id)}" ${r.wbsIds.indexOf(l.id) >= 0 ? "selected" : ""}>${esc(l.code + " " + l.name)}</option>`).join("")}</select>`;
  const range3 = (f: string, unit: string, label: string): string => fld(label + " (" + unit + ")", `<div class="r3">${(["low", "likely", "high"] as const).map((k) => `<label><span>${k === "low" ? "Mín" : k === "likely" ? "Más prob." : "Máx"}</span>${inp(r, f, (r as unknown as Record<string, Record<string, number | null>>)[f][k], "number", 'min="0"', k, "num")}</label>`).join("")}</div>`, true);
  return `<div class="det-grid">
    <div class="sec">1 · Identificación</div>
    ${fld("Código", `<input class="ri" data-id="${esc(r.id)}" data-f="code" value="${esc(r.code)}">`)}
    ${fld("Título", inp(r, "title", r.title), true)}
    ${fld("Tipo", sel(r, "type", [["amenaza", "Amenaza (efecto negativo)"], ["oportunidad", "Oportunidad (efecto positivo)"]], r.type))}
    ${fld("Categoría (RBS)", sel(r, "category", [["", "Sin categoría"], ...plan.categories.map((c): [string, string] => [c, c]), ...(r.category && plan.categories.indexOf(r.category) < 0 ? [[r.category, r.category + " (ya no está en el plan)"] as [string, string]] : [])], r.category))}
    ${fld("Propietario del riesgo", `<input class="ri" list="dlRoles" data-id="${esc(r.id)}" data-f="owner" value="${esc(r.owner)}" placeholder="Rol o persona">`)}
    ${fld("Estado", sel(r, "status", RISK_STATUSES.map((s): [string, string] => [s, STATUS_LABEL[s]]), r.status))}
    ${fld("Proximidad", sel(r, "proximity", [["", "Sin definir"], ...PROXIMITY.map((p): [string, string] => [p, PROXIMITY_LABEL[p]])], r.proximity), false, "Qué tan pronto podría ocurrir: ordena la atención a igual puntaje.")}
    ${fld("Identificado el", inp(r, "identifiedOn", r.identifiedOn, "date"))}
    ${fld("Última revisión", `<div class="rv">${inp(r, "reviewedOn", r.reviewedOn, "date")}<button class="btn sm" data-act="reviewed" data-id="${esc(r.id)}" type="button">Revisado hoy</button></div>`, false, "El plan pide revisar cada " + plan.reviewDays + " días.")}
    ${fld("Paquetes de la EDT afectados", leafSel, true, leaves.length ? "Ctrl/⌘ + clic para elegir varios." : "Crea la EDT en WBS Builder para vincular paquetes.")}
    ${fld("Causa", txt(r, "cause", r.cause, 2, "¿Qué condición o hecho origina el riesgo?"))}
    ${fld("Evento", txt(r, "event", r.event, 2, "¿Qué podría ocurrir?"))}
    ${fld("Efecto", txt(r, "effect", r.effect, 2, "¿Qué consecuencia tendría en los objetivos?"))}
    <div class="fd wide"><div class="stmt" id="stmt-${esc(r.id)}">${esc(statement(r)) || '<span class="muted">Completa causa, evento y efecto para ver el enunciado del riesgo.</span>'}</div></div>

    <div class="sec">2 · Análisis cualitativo (antes de la respuesta)</div>
    ${fld("Probabilidad", sel(r, "prob", probOpts, r.prob, "level"))}
    ${fld("Impacto en costo", sel(r, "impCost", impC, r.impCost, "level"))}
    ${fld("Impacto en plazo", sel(r, "impTime", impT, r.impTime, "level"))}
    ${fld("Impacto en alcance / calidad", sel(r, "impScope", impS, r.impScope, "level"))}

    <div class="sec">3 · Análisis cuantitativo — valor esperado (AACE 44R-08)</div>
    ${fld("Probabilidad cuantificada (%)", inp(r, "probPct", r.probPct, "number", 'min="0" max="100"', "", "num"), false, "Opcional: si se deja vacía se usa la del nivel del plan.")}
    <div class="fd"></div>
    ${range3("costImpact", sym(), opp ? "Ahorro si ocurre" : "Sobrecosto si ocurre")}
    ${range3("timeImpact", "días laborables", opp ? "Adelanto si ocurre" : "Retraso si ocurre")}

    <div class="sec">4 · Respuesta</div>
    ${fld("Estrategia", sel(r, "strategy", [["", "Sin estrategia"], ...strat.map((s): [string, string] => [s, s.charAt(0).toUpperCase() + s.slice(1)])], r.strategy), false, esc(STRATEGY_HINT[r.strategy] || "Elige una estrategia propia de " + (opp ? "las oportunidades" : "las amenazas") + "."))}
    ${fld("Responsable de la respuesta", `<input class="ri" list="dlRoles" data-id="${esc(r.id)}" data-f="responseOwner" value="${esc(r.responseOwner)}">`)}
    ${fld("Acciones de respuesta", txt(r, "response", r.response, 2, "¿Qué se hará y cuándo?"), true)}
    ${fld("Disparador (respuesta contingente)", inp(r, "trigger", r.trigger), false, "La señal que activa el plan si el riesgo se acerca.")}
    ${fld("Costo de la respuesta (" + sym() + ")", inp(r, "responseCost", r.responseCost, "number", 'min="0"', "", "num"), false, "Se planifica dentro de la línea base, no en la contingencia.")}
    ${fld("Riesgos secundarios", inp(r, "secondary", r.secondary), true, "Los que surgen como consecuencia de aplicar la respuesta.")}

    ${r.strategy && r.strategy !== "aceptar" ? `<div class="sec">5 · Riesgo residual (después de la respuesta)</div>
    ${fld("Probabilidad residual", sel(r, "resProb", probOpts, r.resProb, "level"))}
    ${fld("Impacto residual en costo", sel(r, "resImpCost", impC, r.resImpCost, "level"))}
    ${fld("Impacto residual en plazo", sel(r, "resImpTime", impT, r.resImpTime, "level"))}
    ${fld("Impacto residual en alcance / calidad", sel(r, "resImpScope", impS, r.resImpScope, "level"))}
    ${fld("Probabilidad residual cuantificada (%)", inp(r, "resProbPct", r.resProbPct, "number", 'min="0" max="100"', "", "num"))}
    <div class="fd"></div>
    ${range3("resCostImpact", sym(), "Impacto residual en costo")}
    ${range3("resTimeImpact", "días laborables", "Impacto residual en plazo")}` : `<div class="sec">5 · Riesgo residual</div><div class="fd wide muted">${r.strategy === "aceptar" ? "Con la estrategia <b>aceptar</b> no hay una respuesta que reduzca el riesgo: el residual es el inherente." : "Elige una estrategia para evaluar el riesgo residual."}</div>`}

    ${r.status === "materializado" ? `<div class="sec">6 · Materialización</div>
    ${fld("Ocurrió el", inp(r, "materializedOn", r.materializedOn, "date"))}
    ${fld("Costo real (" + sym() + ")", inp(r, "actualCost", r.actualCost, "number", 'min="0"', "", "num"))}
    ${fld("Retraso real (días)", inp(r, "actualDelay", r.actualDelay, "number", 'min="0"', "", "num"))}` : ""}

    <div class="sec">Notas</div>
    ${fld("Notas", txt(r, "notes", r.notes, 2), true)}
    <div class="fd wide"><div class="calc" id="calc-${esc(r.id)}">${calcHtml(r)}</div></div>
  </div>`;
}
// Panel calculado (se refresca al editar, sin reconstruir el formulario).
function calcHtml(r: Risk): string {
  const sc = inherentScore(r), ev = inherentEV(r, plan), res = residualOf(r, plan), pr = probEffective(r.probPct, r.prob, plan);
  const sg = r.type === "oportunidad" ? "ahorro" : "sobrecosto";
  const implC = r.costImpact.likely !== null ? costLevel(r.costImpact.likely, costBase, plan) : null, implT = r.timeImpact.likely !== null ? timeLevel(r.timeImpact.likely, plan) : null;
  return `<div class="calc-grid">
    <div><div class="cl">Puntaje inherente</div><div class="cv">${levelPill(sc, r.type === "oportunidad")}</div><div class="muted small">P${r.prob ?? "—"} × impacto ${maxImpact(r.impCost, r.impTime, r.impScope) ?? "—"}${pr !== null ? " · prob. efectiva " + Math.round(pr * 100) + " %" : ""}</div></div>
    <div><div class="cl">Valor esperado (${sg})</div><div class="cv mono">${money(ev.cost)}</div><div class="muted small">${ev.time !== null ? "≈ " + (Math.round(ev.time * 10) / 10) + " días · " : ""}P × media de la triangular (mín + más prob. + máx) / 3</div></div>
    <div><div class="cl">Riesgo residual</div><div class="cv">${res.assessed && res.score !== null ? levelPill(res.score, r.type === "oportunidad") : `<span class="muted small">${r.strategy ? "Sin evaluar" : "—"}</span>`}</div><div class="muted small">${res.assessed && res.ev.cost !== null ? "EV residual " + money(res.ev.cost) : res.derived ? "= inherente (aceptar)" : ""}</div></div>
    <div><div class="cl">Niveles según valores cuantificados</div><div class="cv small">${implC !== null ? "Costo: nivel " + implC : "Costo: —"} · ${implT !== null ? "Plazo: nivel " + implT : "Plazo: —"}</div><div class="muted small">Contraste con lo declarado en el análisis cualitativo</div></div>
  </div>${r.status === "materializado" ? linkedBlock(r) : ""}<div class="cl" style="margin-top:8px">Hallazgos de coherencia</div>${findingsHtml(findingsOf(r))}`;
}
// Lo que Costos tiene aprobado por este riesgo materializado: la traza riesgo → contingencia/reserva.
function linkedBlock(r: Risk): string {
  const l = linkedOrders(r);
  const rows = l.length ? l.map((o) => `<tr><td class="mono">${esc(o.id)}</td><td>${esc(o.status)}</td><td>${esc(o.fund)}</td><td class="num">${money(o.cost)}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">Sin órdenes de cambio vinculadas en Costos.</td></tr>`;
  return `<div class="cl" style="margin-top:10px">Órdenes de cambio vinculadas (Costos)</div><table class="an"><thead><tr><th class="l">Orden</th><th class="l">Estado</th><th class="l">Fondeo</th><th>Monto</th></tr></thead><tbody>${rows}</tbody></table>`;
}
// Una fila por su id SIN armar un selector con él: un id importado con comillas rompería el selector.
const rowEl = (id: string): HTMLElement | null => Array.from(document.querySelectorAll<HTMLElement>("tr.rk-row")).find((el) => el.dataset.id === id) || null;
function refreshRisk(r: Risk): void {
  const tr = rowEl(r.id); if (tr) tr.innerHTML = rowHtml(r);
  const calc = document.getElementById("calc-" + r.id); if (calc) calc.innerHTML = calcHtml(r);
  const st = document.getElementById("stmt-" + r.id); if (st) st.innerHTML = esc(statement(r)) || '<span class="muted">Completa causa, evento y efecto para ver el enunciado del riesgo.</span>';
  renderSidebar();
}
function redrawDetail(r: Risk): void { const box = document.getElementById("det-" + r.id); if (box) { box.innerHTML = detailHtml(r); bindDetail(box); } refreshRisk(r); }
// Campos numéricos/texto/selección del detalle. Los que cambian la ESTRUCTURA del formulario (tipo, estado, estrategia) lo reconstruyen.
function onField(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const r = byId(el.dataset.id); if (!r) return;
  const f = el.dataset.f as string, k = el.dataset.k, t = el.dataset.t;
  const rec = r as unknown as Record<string, unknown>;
  let v: unknown = el.value;
  if (t === "num") v = toNum(el.value); else if (t === "level") v = toLevel(el.value);
  if (f === "wbsIds") v = Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.value);
  if (k) (rec[f] as Record<string, unknown>)[k] = v; else rec[f] = v;
  if (f === "type") { if (strategiesFor(r.type).indexOf(r.strategy) < 0) r.strategy = ""; redrawDetail(r); return; }
  if (f === "status") { if (v === "materializado" && !r.materializedOn) r.materializedOn = todayISO(); redrawDetail(r); return; }
  if (f === "strategy") { redrawDetail(r); return; }
  refreshRisk(r);
}
function bindDetail(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(".ri").forEach((el) => {
    el.addEventListener(el.tagName === "SELECT" || (el as HTMLInputElement).type === "date" ? "change" : "input", () => onField(el));
  });
  root.querySelectorAll<HTMLElement>('[data-act="reviewed"]').forEach((b) => b.addEventListener("click", () => { const r = byId(b.dataset.id); if (r) { r.reviewedOn = todayISO(); redrawDetail(r); } }));
}

// ---------- vista 2: matriz probabilidad × impacto ----------
function matrixHtml(type: RiskType): string {
  const g = buildMatrix(risks, type, matrixWhich, plan), opp = type === "oportunidad";
  const head = `<tr><th class="corner">Probabilidad ↓ · Impacto →</th>${IMPACT_LABELS.map((l, i) => `<th scope="col">${i + 1} · ${l}</th>`).join("")}</tr>`;
  const rows = g.map((row, i) => `<tr><th scope="row">${5 - i} · ${PROB_LABELS[4 - i]}<span>≈ ${plan.probPct[4 - i]} %</span></th>${row.map((c) => `<td class="mx-c lv-${c.level}${opp ? " opp" : ""}"><span class="mx-s">${c.score}</span>${c.ids.map((id) => { const r = byId(id) as Risk; return `<button class="mx-chip" data-id="${esc(id)}" title="${esc(r.code + " — " + r.title)}">${esc(r.code)}</button>`; }).join("")}</td>`).join("")}</tr>`).join("");
  return `<table class="mx"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}
function renderMatrix(): string {
  const open = risks.filter(isOpen), miss = open.filter((r) => matrixWhich === "inherent" ? inherentScore(r) === null : !residualOf(r, plan).assessed).length;
  return `<div class="view-head"><h2>Matriz probabilidad × impacto</h2>
    <p>Cada riesgo <b>abierto</b> se ubica por su probabilidad y por su <b>mayor impacto</b> entre costo, plazo y alcance/calidad. El color depende de los <b>umbrales del plan</b> (medio desde ${plan.thresholdMedium}, alto desde ${plan.thresholdHigh}); el puntaje de cada celda es probabilidad × impacto. Las amenazas y las oportunidades tienen matrices separadas. Haz clic en un código para abrir el riesgo.</p></div>
    <div class="mx-toggle"><div class="toggle-group" id="mxGroup"><button class="btn${matrixWhich === "inherent" ? " active" : ""}" data-w="inherent">Antes de la respuesta</button><button class="btn${matrixWhich === "residual" ? " active" : ""}" data-w="residual">Después de la respuesta (residual)</button></div>
      <span class="muted small">${miss ? miss + " riesgo(s) abierto(s) sin " + (matrixWhich === "inherent" ? "analizar" : "residual evaluado") + " no aparecen." : "Todos los riesgos abiertos están ubicados."}</span></div>
    <div class="mx-pair"><div><h3 class="mxh">Amenazas</h3>${matrixHtml("amenaza")}</div><div><h3 class="mxh">Oportunidades</h3>${matrixHtml("oportunidad")}</div></div>
    <div class="mx-legend"><span class="lv lv-alto">ALTO ≥ ${plan.thresholdHigh}</span><span class="lv lv-medio">MEDIO ≥ ${plan.thresholdMedium}</span><span class="lv lv-bajo">BAJO &lt; ${plan.thresholdMedium}</span><span class="muted small">Materializados y cerrados no aparecen: dejaron de ser incertidumbre.</span></div>`;
}

// ---------- vista 3: análisis ----------
function renderAnalysis(): string {
  const pf = portfolio(risks, plan), rk = rankRisks(risks, plan).slice(0, 8);
  const all: Array<{ r: Risk; f: Finding }> = [];
  risks.forEach((r) => findingsOf(r).forEach((f) => all.push({ r, f })));
  const order = { riesgo: 0, aviso: 1, info: 2 } as Record<string, number>;
  all.sort((a, b) => order[a.f.severity] - order[b.f.severity] || a.r.code.localeCompare(b.r.code));
  const cov = (n: number, d: number): string => (d ? Math.round(n / d * 100) + " % (" + n + "/" + d + ")" : "—");
  const lvCard = (lv: RiskLevel | "sin", label: string, n: number, res: number): string => `<div class="kp ${lv}"><div class="kv">${n}</div><div class="kl">${label}</div><div class="ks">residual: ${res}</div></div>`;
  const top = rk.length ? rk.map((r, i) => { const ev = inherentEV(r, plan); return `<tr><td class="c">${i + 1}</td><td class="mono">${esc(r.code)}</td><td>${esc(r.title)}</td><td>${levelPill(inherentScore(r), r.type === "oportunidad")}</td><td>${esc(r.proximity ? PROXIMITY_LABEL[r.proximity] : "—")}</td><td>${esc(r.strategy || "—")}</td><td class="num">${money(ev.cost)}</td></tr>`; }).join("") : `<tr><td colspan="7" class="muted">Aún no hay riesgos analizados.</td></tr>`;
  const cats = pf.byCategory.length ? pf.byCategory.map((c) => `<tr><td>${esc(c.category)}</td><td class="c">${c.count}</td><td class="num">${money(c.evCost)}</td></tr>`).join("") : `<tr><td colspan="3" class="muted">—</td></tr>`;
  const fl = all.slice(0, 40).map(({ r, f }) => `<li><span class="sv ${f.severity}">${sevText[f.severity]}</span><button class="lk" data-id="${esc(r.id)}">${esc(r.code)}</button> ${esc(f.text)}</li>`).join("");
  return `<div class="view-head"><h2>Análisis de la cartera de riesgos</h2>
    <p>Lectura de conjunto para decidir dónde poner la atención. Los <b>valores esperados</b> siguen el método de la RP 44R-08 de AACE: probabilidad × impacto esperado, con el impacto dado por un rango de tres puntos. La exposición que interesa para la contingencia es la que <b>queda tras la respuesta</b> (residual).</p></div>
    <div class="kp-row">${lvCard("alto", "Riesgos altos", pf.byLevel.alto, pf.residualByLevel.alto)}${lvCard("medio", "Riesgos medios", pf.byLevel.medio, pf.residualByLevel.medio)}${lvCard("bajo", "Riesgos bajos", pf.byLevel.bajo, pf.residualByLevel.bajo)}${lvCard("sin", "Sin analizar", pf.byLevel.sin, pf.residualByLevel.sin)}</div>
    <div class="an-grid">
      <div class="card"><h3 class="mxh">Prioridad de atención</h3><table class="an"><thead><tr><th>#</th><th>Cód.</th><th class="l">Riesgo</th><th class="l">Puntaje</th><th class="l">Proximidad</th><th class="l">Estrategia</th><th>EV costo</th></tr></thead><tbody>${top}</tbody></table>
        <div class="muted small" style="margin-top:6px">Orden: mayor puntaje primero y, a igual puntaje, la proximidad más cercana. Solo riesgos abiertos y analizados.</div></div>
      <div class="card"><h3 class="mxh">Exposición esperada en costo (abiertos)</h3>
        <table class="an"><tbody>
          <tr><td>Amenazas — valor esperado</td><td class="num">${money(pf.evThreatCost)}</td></tr>
          <tr><td>Oportunidades — valor esperado</td><td class="num">−${money(pf.evOpportunityCost)}</td></tr>
          <tr class="tot"><td>Exposición neta (antes de la respuesta)</td><td class="num">${money(pf.netEvCost)}</td></tr>
          <tr><td>Amenazas residuales (después de la respuesta)</td><td class="num">${money(pf.resEvThreatCost)}</td></tr>
          <tr><td>Oportunidades residuales</td><td class="num">−${money(pf.resEvOpportunityCost)}</td></tr>
          <tr class="tot"><td>Exposición neta residual</td><td class="num">${money(pf.netResEvCost)}</td></tr>
          <tr><td>Retraso esperado por amenazas</td><td class="num">≈ ${Math.round(pf.evThreatDays * 10) / 10} d</td></tr>
          <tr><td>Impacto real de riesgos materializados</td><td class="num">${money(pf.actualCost)}</td></tr>
        </tbody></table>
        <div class="note-box"><b>Cómo leerlo (AACE).</b> Un valor esperado es una <b>media</b> (≈ P50): no es una contingencia por sí sola. La contingencia se determina sobre la exposición residual y a un nivel de confianza (percentil) elegido, y se suma a la incertidumbre del estimado. Esa integración con Costos está prevista; hoy este valor es una <b>referencia</b> para dimensionarla. Los riesgos sin cuantificar no suman: cuantifica primero los de impacto en costo ≥ 3.</div></div>
      <div class="card"><h3 class="mxh">Por categoría (RBS)</h3><table class="an"><thead><tr><th class="l">Categoría</th><th>Riesgos abiertos</th><th>EV neto</th></tr></thead><tbody>${cats}</tbody></table></div>
      <div class="card"><h3 class="mxh">Cobertura del registro (abiertos)</h3><table class="an"><tbody>
        <tr><td>Analizados (probabilidad e impacto)</td><td class="num">${cov(pf.coverage.analyzed, pf.coverage.openCount)}</td></tr>
        <tr><td>Con propietario</td><td class="num">${cov(pf.coverage.withOwner, pf.coverage.openCount)}</td></tr>
        <tr><td>Con estrategia de respuesta</td><td class="num">${cov(pf.coverage.withResponse, pf.coverage.openCount)}</td></tr>
        <tr><td>Con paquetes de la EDT</td><td class="num">${cov(pf.coverage.withWbs, pf.coverage.openCount)}</td></tr>
        <tr><td>Cuantificados en costo</td><td class="num">${cov(pf.coverage.quantified, pf.coverage.openCount)}</td></tr></tbody></table></div>
    </div>
    <div class="card" style="margin-top:14px"><h3 class="mxh">Hallazgos de coherencia (${all.length})</h3>${all.length ? `<ul class="rk-finds all">${fl}</ul>${all.length > 40 ? `<div class="muted small">… y ${all.length - 40} más.</div>` : ""}` : `<div class="muted small">El registro no tiene hallazgos.</div>`}</div>`;
}

// ---------- vista 4: plan de gestión de riesgos ----------
function planBandsHtml(): string {
  const cost = plan.costBandsPct.concat([NaN]).map((b, i) => {
    const lo = i === 0 ? 0 : plan.costBandsPct[i - 1];
    return `<tr><td>${i + 1} · ${IMPACT_LABELS[i]}</td><td>${i === 4 ? "más de " + plan.costBandsPct[3] + " %" : (i === 0 ? "hasta " : lo + " % a ") + b + " %"}</td><td class="num">${costBase > 0 ? (i === 4 ? "más de " + money(costBase * plan.costBandsPct[3] / 100) : (i === 0 ? "hasta " : money(costBase * lo / 100) + " a ") + money(costBase * b / 100)) : "—"}</td></tr>`;
  }).join("");
  return `<table class="an"><thead><tr><th class="l">Nivel</th><th class="l">% del costo base</th><th>En ${esc(currency)}${costBase > 0 ? " (base " + money(costBase) + ")" : ""}</th></tr></thead><tbody>${cost}</tbody></table>`;
}
function renderPlan(): string {
  const pi = (name: string, i: number, v: number, extra = ""): string => `<input class="pi" type="number" step="any" data-p="${name}" data-i="${i}" value="${esc(v)}" ${extra}>`;
  const probRows = PROB_LABELS.map((l, i) => `<tr><td>${i + 1} · ${l}</td><td>${pi("probPct", i, plan.probPct[i], 'min="0" max="100"')} %</td></tr>`).join("");
  const timeRows = IMPACT_LABELS.map((l, i) => `<tr><td>${i + 1} · ${l}</td><td>${i < 4 ? "hasta " + pi("timeBandsDays", i, plan.timeBandsDays[i], 'min="0"') + " días" : "más de " + plan.timeBandsDays[3] + " días"}</td></tr>`).join("");
  const costRows = IMPACT_LABELS.map((l, i) => `<tr><td>${i + 1} · ${l}</td><td>${i < 4 ? "hasta " + pi("costBandsPct", i, plan.costBandsPct[i], 'min="0"') + " % del costo base" : "más de " + plan.costBandsPct[3] + " %"}</td></tr>`).join("");
  const scopeRows = IMPACT_LABELS.map((l, i) => `<tr><td>${i + 1} · ${l}</td><td><input class="pi wide" type="text" data-p="scopeDescriptors" data-i="${i}" value="${esc(plan.scopeDescriptors[i])}"></td></tr>`).join("");
  const problems = validatePlan(plan);
  return `<div class="view-head"><h2>Plan de gestión de los riesgos</h2>
    <p>Define <b>cómo</b> se gestionan los riesgos de este proyecto: las escalas de probabilidad e impacto, los umbrales que separan riesgos bajos, medios y altos, la RBS, la frecuencia de revisión y la política de reservas. Estas definiciones <b>son del proyecto</b> (no hay una escala universal) y gobiernan toda la matriz y el registro.</p></div>
    <div class="msg" id="planMsg" style="display:${problems.length ? "block" : "none"}">${problems.length ? "<b>⚠ El plan tiene problemas:</b> " + problems.map(esc).join(" · ") : ""}</div>
    <div class="an-grid">
      <div class="card"><h3 class="mxh">Escala de probabilidad</h3><table class="an"><tbody>${probRows}</tbody></table></div>
      <div class="card"><h3 class="mxh">Escala de impacto en costo</h3><table class="an"><tbody>${costRows}</tbody></table><div id="planBands" style="margin-top:8px">${planBandsHtml()}</div></div>
      <div class="card"><h3 class="mxh">Escala de impacto en plazo</h3><table class="an"><tbody>${timeRows}</tbody></table></div>
      <div class="card"><h3 class="mxh">Impacto en alcance / calidad</h3><table class="an"><tbody>${scopeRows}</tbody></table></div>
      <div class="card"><h3 class="mxh">Umbrales (apetito de riesgo)</h3>
        <div class="fd"><label>Puntaje desde el que un riesgo es MEDIO</label>${pi("thresholdMedium", -1, plan.thresholdMedium, 'min="1" max="24"')}</div>
        <div class="fd"><label>Puntaje desde el que un riesgo es ALTO</label>${pi("thresholdHigh", -1, plan.thresholdHigh, 'min="2" max="25"')}</div>
        <div class="fd"><label>Revisión de cada riesgo abierto (días)</label>${pi("reviewDays", -1, plan.reviewDays, 'min="1"')}</div>
        <div class="muted small">El puntaje es probabilidad (1–5) × impacto (1–5): va de 1 a 25.</div></div>
      <div class="card"><h3 class="mxh">Categorías de la RBS</h3><textarea class="pi wide" rows="6" data-p="categories" data-i="-1" aria-label="Categorías, una por línea">${esc(plan.categories.join("\n"))}</textarea><div class="muted small">Una por línea. Los riesgos ya registrados conservan su categoría aunque se quite del plan.</div></div>
    </div>
    <div class="an-grid" style="margin-top:14px">
      <div class="card"><h3 class="mxh">Metodología</h3><textarea class="pi wide" rows="5" data-p="methodology" data-i="-1" placeholder="Cómo se identifican, analizan y responden los riesgos; herramientas y fuentes de información.">${esc(plan.methodology)}</textarea></div>
      <div class="card"><h3 class="mxh">Roles y responsabilidades</h3><textarea class="pi wide" rows="5" data-p="roles" data-i="-1" placeholder="Quién es dueño del proceso, de cada riesgo, quién autoriza reservas…">${esc(plan.roles)}</textarea></div>
      <div class="card"><h3 class="mxh">Política de reservas</h3><textarea class="pi wide" rows="5" data-p="reservePolicy" data-i="-1" placeholder="Qué cubre la contingencia y qué la reserva de gestión; quién autoriza su uso.">${esc(plan.reservePolicy)}</textarea></div>
    </div>`;
}
function onPlanField(el: HTMLInputElement | HTMLTextAreaElement): void {
  const key = el.dataset.p as string, i = Number(el.dataset.i);
  const rec = plan as unknown as Record<string, unknown>;
  if (key === "categories") plan.categories = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
  else if (key === "scopeDescriptors") plan.scopeDescriptors[i] = el.value;
  else if (["probPct", "costBandsPct", "timeBandsDays"].indexOf(key) >= 0) { const v = toNum(el.value); (rec[key] as number[])[i] = v === null ? NaN : v; }
  else if (["thresholdMedium", "thresholdHigh", "reviewDays"].indexOf(key) >= 0) { const v = toNum(el.value); rec[key] = v === null ? NaN : v; }
  else rec[key] = el.value;
  const problems = validatePlan(plan), box = $("planMsg");
  box.style.display = problems.length ? "block" : "none";
  box.innerHTML = problems.length ? "<b>⚠ El plan tiene problemas:</b> " + problems.map(esc).join(" · ") : "";
  const b = document.getElementById("planBands"); if (b) b.innerHTML = planBandsHtml();
  renderSidebar();
}

// ---------- sidebar ----------
function statsBlock(): string {
  const open = risks.filter(isOpen), high = open.filter((r) => levelOf(inherentScore(r), plan) === "alto").length;
  const withF = risks.filter((r) => findingsOf(r).some((f) => f.severity !== "info")).length;
  return `<h3>Resumen</h3><div class="stat-grid"><div class="stat"><div class="v">${open.length}</div><div class="l">Abiertos</div></div><div class="stat"><div class="v">${high}</div><div class="l">Altos</div></div><div class="stat"><div class="v">${withF}</div><div class="l">Con hallazgos</div></div><div class="stat"><div class="v">${risks.length}</div><div class="l">Total</div></div></div>`;
}
function guideBlock(): string {
  if (view === "matriz") return `<div class="tip-box"><b>Umbrales del plan:</b> medio desde ${plan.thresholdMedium}, alto desde ${plan.thresholdHigh}. Cambiarlos en la vista <b>Plan</b> recolorea la matriz.</div><div class="tip-box"><b>Antes / después:</b> comparar ambas matrices muestra cuánto reducen las respuestas la exposición.</div>`;
  if (view === "analisis") return `<div class="tip-box"><b>Incertidumbre vs. riesgo (AACE):</b> la variabilidad del estimado se trata con el análisis de <b>rangos</b> de Costos; aquí se gestionan los <b>eventos discretos</b>. La contingencia reúne ambos.</div>`;
  if (view === "plan") return `<div class="tip-box"><b>Sin escala universal:</b> el plan fija qué significa «impacto alto» para <i>este</i> proyecto. Ajusta las cotas al tamaño del presupuesto y del cronograma.</div>`;
  const s = (t: RiskType) => strategiesFor(t).map((k) => `<div class="strat-box"><div class="st">${k.charAt(0).toUpperCase() + k.slice(1)}</div>${esc(STRATEGY_HINT[k])}</div>`).join("");
  return `<div class="tip-box"><b>Enunciado (PMBOK):</b> «Debido a <i>causa</i>, puede ocurrir <i>evento</i>, lo que causaría <i>efecto</i>».</div><h3 class="mt">Estrategias — amenazas</h3>${s("amenaza")}<h3 class="mt">Estrategias — oportunidades</h3>${s("oportunidad")}`;
}
function renderSidebar(): void { $("sidebar").innerHTML = statsBlock() + guideBlock(); }

// ---------- interacciones ----------
function openRisk(id: string): void { selectedId = id; expanded.add(id); view = "registro"; render(); const row = rowEl(id); if (row) row.scrollIntoView({ block: "center" }); }
function wireMain(): void {
  document.querySelectorAll<HTMLElement>("tr.rk-row").forEach((tr) => {
    const toggle = () => { const id = tr.dataset.id as string; if (expanded.has(id)) expanded.delete(id); else { expanded.add(id); selectedId = id; } render(); };
    tr.addEventListener("click", toggle);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
  document.querySelectorAll<HTMLElement>(".det-box").forEach((box) => { if (box.innerHTML.trim()) bindDetail(box); });
  const on = (id: string, fn: () => void) => { const b = document.getElementById(id); if (b) b.addEventListener("click", fn); };
  on("btnSort", () => { sortByScore = !sortByScore; render(); });
  on("btnExpandAll", () => { risks.forEach((r) => expanded.add(r.id)); render(); });
  on("btnCollapseAll", () => { expanded.clear(); render(); });
  document.querySelectorAll<HTMLElement>("#mxGroup .btn").forEach((b) => b.addEventListener("click", () => { matrixWhich = b.dataset.w as typeof matrixWhich; render(); }));
  document.querySelectorAll<HTMLElement>(".mx-chip, .lk").forEach((b) => b.addEventListener("click", () => openRisk(b.dataset.id as string)));
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(".pi").forEach((el) => el.addEventListener("input", () => onPlanField(el)));
}
function addRisk(type: RiskType): void {
  const r = blankRisk(newId(), nextCode(risks), type); r.identifiedOn = todayISO();
  risks.push(r); selectedId = r.id; expanded.add(r.id); view = "registro"; render();
  const row = rowEl(r.id); if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  setStatus((type === "amenaza" ? "Amenaza" : "Oportunidad") + " " + r.code + " agregada: completa su enunciado causa → evento → efecto.");
}
function deleteSelected(): void {
  const r = byId(selectedId || undefined); if (!r) return;
  showConfirm(`¿Eliminar el riesgo ${r.code} «${r.title || "sin título"}»? Esta acción no se puede deshacer.`).then((ok) => {
    if (!ok) return;
    const idx = risks.findIndex((x) => x.id === r.id); if (idx > -1) { expanded.delete(r.id); risks.splice(idx, 1); }
    selectedId = risks.length ? risks[Math.max(0, idx - 1)].id : null; render(); setStatus("Riesgo eliminado.");
  });
}

// ---------- modal ----------
interface ShowModalOpts { title?: string; message?: string; confirmText?: string; cancelText?: string | null; danger?: boolean; }
function showModal({ title, message, confirmText, cancelText, danger }: ShowModalOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = $("modalOverlay"), confirmBtn = $("modalConfirmBtn") as HTMLButtonElement, cancelBtn = $("modalCancelBtn") as HTMLButtonElement;
    $("modalTitle").textContent = title || "Confirmar"; $("modalMessage").textContent = message || "";
    confirmBtn.textContent = confirmText || "Aceptar"; confirmBtn.className = "btn" + (danger ? " danger" : " primary");
    cancelBtn.style.display = cancelText === null ? "none" : ""; cancelBtn.textContent = cancelText || "Cancelar";
    const cleanup = (r: boolean) => { overlay.classList.remove("open"); confirmBtn.onclick = null; cancelBtn.onclick = null; overlay.onclick = null; document.removeEventListener("keydown", onKey); resolve(r); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { cleanup(false); return; }
      if (e.key === "Enter") { cleanup(true); return; }
      if (e.key !== "Tab") return;
      const f = Array.from(overlay.querySelectorAll<HTMLElement>("button")).filter((el) => el.offsetParent !== null); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    confirmBtn.onclick = () => cleanup(true); cancelBtn.onclick = () => cleanup(false); overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    document.addEventListener("keydown", onKey); overlay.classList.add("open"); confirmBtn.focus();
  });
}
function showConfirm(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Confirmar acción", message, confirmText: "Eliminar", cancelText: "Cancelar", danger: true }); }

// ---------- exportación ----------
function exportCsv(): void {
  const head = ["Codigo", "Titulo", "Tipo", "Categoria", "Propietario", "Estado", "Proximidad", "Probabilidad", "Impacto_Costo", "Impacto_Plazo", "Impacto_Alcance", "Puntaje", "Nivel",
    "Prob_efectiva_pct", "EV_Costo", "EV_Dias", "Estrategia", "Respuesta", "Disparador", "Resp_Respuesta", "Puntaje_Residual", "Nivel_Residual", "EV_Costo_Residual", "Paquetes_EDT", "Causa", "Evento", "Efecto", "Costo_Real", "Retraso_Real_Dias"];
  const q = (v: unknown) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [head.join(",")];
  risks.forEach((r) => {
    const sc = inherentScore(r), ev = inherentEV(r, plan), res = residualOf(r, plan), pr = probEffective(r.probPct, r.prob, plan);
    lines.push([r.code, r.title, r.type, r.category, r.owner, STATUS_LABEL[r.status], r.proximity, r.prob, r.impCost, r.impTime, r.impScope, sc, levelOf(sc, plan),
      pr === null ? "" : Math.round(pr * 100), ev.cost === null ? "" : Math.round(ev.cost), ev.time === null ? "" : Math.round(ev.time * 10) / 10, r.strategy, r.response, r.trigger, r.responseOwner,
      res.assessed ? res.score : "", res.assessed ? levelOf(res.score, plan) : "", res.assessed && res.ev.cost !== null ? Math.round(res.ev.cost) : "", r.wbsIds.map(leafCode).join(" "), r.cause, r.event, r.effect, r.actualCost, r.actualDelay].map(q).join(","));
  });
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "registro_de_riesgos.csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setStatus("Registro exportado como CSV.");
}
function reportShell(docTitle: string, bodyHtml: string): void {
  let el = document.getElementById("gpiReport");
  if (!el) { el = document.createElement("div"); el.id = "gpiReport"; document.body.appendChild(el); }
  let meta: Partial<ProjectMeta> = {};
  try { const m = window.GPI && window.GPI.available() ? window.GPI.meta() : null; if (m) meta = m; } catch (_) { /* noop */ }
  const tEl = document.getElementById("projectTitle") as HTMLInputElement | null, cEl = document.getElementById("courseTitle") as HTMLInputElement | null;
  const pName = (tEl && tEl.value) || meta.name || "Proyecto", course = (cEl && cEl.value) || meta.course || "Gestión de Proyectos de Ingeniería";
  const today = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  el.innerHTML = '<div class="rep-head"><div><h1>' + esc(docTitle) + '</h1><div class="sub">' + esc(pName) + (meta.code ? " · " + esc(meta.code) : "") + '</div><div class="sub" style="font-weight:500">' + esc(course) + "</div></div>"
    + '<div class="rep-meta">Registro de Riesgos<br>Emitido: ' + esc(today) + "</div></div>" + bodyHtml;
  document.body.classList.add("report-mode");
  function repDone() { document.body.classList.remove("report-mode"); window.removeEventListener("afterprint", repDone); }
  window.addEventListener("afterprint", repDone);
  setTimeout(() => { window.print(); setTimeout(repDone, 500); }, 60);
}
function buildReport(): void {
  const pf = portfolio(risks, plan), rk = rankRisks(risks, plan);
  const body = '<h2>1. Resumen</h2><table class="rep-kv">'
    + "<tr><td>Riesgos registrados</td><td><b>" + pf.total + "</b> (" + pf.threats + " amenazas · " + pf.opportunities + " oportunidades)</td></tr>"
    + "<tr><td>Abiertos por nivel</td><td>Altos <b>" + pf.byLevel.alto + "</b> · Medios <b>" + pf.byLevel.medio + "</b> · Bajos <b>" + pf.byLevel.bajo + "</b> · Sin analizar <b>" + pf.byLevel.sin + "</b></td></tr>"
    + "<tr><td>Exposición esperada en costo (VE, AACE 44R-08)</td><td>Amenazas " + money(pf.evThreatCost) + " · oportunidades −" + money(pf.evOpportunityCost) + " · <b>neta " + money(pf.netEvCost) + "</b> · residual <b>" + money(pf.netResEvCost) + "</b></td></tr>"
    + "<tr><td>Materializados</td><td><b>" + pf.materialized + "</b> · impacto real " + money(pf.actualCost) + "</td></tr></table>"
    + '<h2>2. Registro de riesgos</h2><p class="rep-note">Umbrales del plan: medio desde ' + plan.thresholdMedium + " · alto desde " + plan.thresholdHigh + ". Puntaje = probabilidad × mayor impacto (1–5).</p>"
    + '<table><tr><th style="width:6%">Cód.</th><th>Riesgo (causa → evento → efecto)</th><th style="width:9%">Tipo</th><th style="width:11%">Propietario</th><th style="width:8%">Puntaje</th><th style="width:10%">Estado</th></tr>'
    + (risks.map((r) => { const sc = inherentScore(r), lv = levelOf(sc, plan); return "<tr><td>" + esc(r.code) + "</td><td><b>" + esc(r.title) + "</b><br>" + esc(statement(r)) + "</td><td>" + (r.type === "amenaza" ? "Amenaza" : "Oportunidad") + "</td><td>" + esc(r.owner || "—") + "</td><td>" + (lv ? LV[lv] + " · " + sc : "—") + "</td><td>" + esc(STATUS_LABEL[r.status]) + "</td></tr>"; }).join("") || '<tr><td colspan="6" class="rep-note">— Sin riesgos registrados —</td></tr>')
    + "</table>"
    + '<h2>3. Respuestas</h2><table><tr><th style="width:6%">Cód.</th><th style="width:11%">Estrategia</th><th>Acciones</th><th style="width:20%">Disparador</th><th style="width:12%">Responsable</th><th style="width:9%">Residual</th></tr>'
    + (risks.filter((r) => r.strategy).map((r) => { const s = residualOf(r, plan); return "<tr><td>" + esc(r.code) + "</td><td>" + esc(r.strategy) + "</td><td>" + esc(r.response || "—") + "</td><td>" + esc(r.trigger || "—") + "</td><td>" + esc(r.responseOwner || r.owner || "—") + "</td><td>" + (s.assessed && s.score !== null ? (levelOf(s.score, plan) ? LV[levelOf(s.score, plan) as RiskLevel] : "") + " · " + s.score : "—") + "</td></tr>"; }).join("") || '<tr><td colspan="6" class="rep-note">— Sin respuestas definidas —</td></tr>')
    + "</table>"
    + '<h2>4. Prioridad de atención</h2><table><tr><th style="width:5%">#</th><th style="width:7%">Cód.</th><th>Riesgo</th><th style="width:12%">Puntaje</th><th style="width:18%">Proximidad</th></tr>'
    + (rk.slice(0, 10).map((r, i) => "<tr><td>" + (i + 1) + "</td><td>" + esc(r.code) + "</td><td>" + esc(r.title) + "</td><td>" + (inherentScore(r) as number) + "</td><td>" + esc(r.proximity ? PROXIMITY_LABEL[r.proximity] : "—") + "</td></tr>").join("") || '<tr><td colspan="5" class="rep-note">— Sin riesgos analizados —</td></tr>')
    + "</table>";
  reportShell("Registro de Riesgos", body);
}

// ---------- toolbar ----------
function wireToolbar(): void {
  $("btnAddThreat").addEventListener("click", () => addRisk("amenaza"));
  $("btnAddOpp").addEventListener("click", () => addRisk("oportunidad"));
  $("btnDelete").addEventListener("click", deleteSelected);
  document.querySelectorAll<HTMLElement>("#viewGroup .btn").forEach((b) => b.addEventListener("click", () => { view = b.dataset.view as typeof view; render(); $("mainArea").scrollTop = 0; }));
  $("btnExportCsv").addEventListener("click", exportCsv);
  $("btnReport").addEventListener("click", buildReport);
  $("btnPrint").addEventListener("click", () => window.print());
  $("btnSample").addEventListener("click", () => {
    showConfirm("Esto reemplazará el registro actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
      if (!ok) return; refreshContext(); loadSample(); render(); setStatus("Caso de ejemplo cargado.");
    });
  });
  $("btnReset").addEventListener("click", () => {
    showConfirm("Esto borrará todos los riesgos y el plan, y empezará un registro nuevo. ¿Continuar?", "Nuevo registro").then((ok) => { if (ok) { blankAnalysis(); view = "registro"; render(); setStatus("Registro nuevo iniciado."); } });
  });
}
function refreshRoles(): void {
  const dl = $("dlRoles"); dl.innerHTML = roles.map((r) => `<option value="${esc(r)}"></option>`).join("");
}

// ---------- init ----------
refreshContext(); loadSample(); wireToolbar(); refreshRoles(); render();

// ===== Puente con el Panel de Control (GPI) =====
(function gpiBridge() {
  if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
  const proj = window.GPI.active();
  const titleEl = $("projectTitle") as HTMLInputElement, courseEl = $("courseTitle") as HTMLInputElement;
  let loadedProjectId: string | null = null, session: EditSession | null = null, projectStale = false;
  function markProjectStale(): void {
    if (projectStale) return; projectStale = true;
    setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
    const b = document.getElementById("banner");
    if (b) { b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar los riesgos aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control."; b.classList.add("show"); }
  }
  const data = () => ({ plan, risks, idCounter });
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    loadedProjectId = window.GPI!.activeId();
    session = window.GPI!.openSession("risks");
    if (p.meta) { if (p.meta.name) titleEl.value = p.meta.name; if (p.meta.course) courseEl.value = p.meta.course; }
    refreshContext(); refreshRoles();
    const mod = p.modules && (p.modules as Record<string, unknown>).risks as { plan?: unknown; risks?: unknown[]; idCounter?: number } | undefined;
    if (mod && (Array.isArray(mod.risks) && mod.risks.length || mod.plan)) {
      plan = normalizePlan(mod.plan);
      risks = (Array.isArray(mod.risks) ? mod.risks : []).map((o, i) => normalizeRisk(o, "rk" + (i + 1)));
      idCounter = Number(mod.idCounter) || risks.length + 1;
      selectedId = risks.length ? risks[0].id : null; expanded = new Set();
      window.GPI!.rebaseSession(session, data());       // el dato ya normalizado
      render(); setStatus("Datos cargados desde el Panel de Control.");
    } else {
      // Primera conexión: EN BLANCO (no el ejemplo que init() carga en modo independiente). El ejemplo queda en «Cargar ejemplo».
      blankAnalysis(); render(); setStatus("Proyecto sin riesgos todavía. Regístralos aquí, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
    }
  }
  function push(): boolean {
    if (!window.GPI!.active()) return false;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { markProjectStale(); return false; }
    const r = pushWithSession(window.GPI!, "risks", "El registro de riesgos", data(), { name: titleEl.value, course: courseEl.value }, session, { setStatus, onStale: markProjectStale });
    session = r.session; return r.ok;
  }
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); });
  window.GPI.onChange(() => {
    const p = window.GPI!.active(); if (!p || !p.meta) return;
    if (loadedProjectId != null && window.GPI!.activeId() !== loadedProjectId) { if (document.hidden) { pull(); return; } markProjectStale(); return; }
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
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + String(name || "—").replace(/</g, "&lt;") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  (bar.querySelector("#gpiSyncBtn") as HTMLElement).addEventListener("click", () => {
    const ok = pushFn(), b = bar.querySelector("#gpiSyncBtn") as HTMLElement, t = b.textContent; b.textContent = ok ? "✓ Sincronizado" : "⚠ Sin sincronizar";
    setTimeout(() => { b.textContent = t; }, 1400);
  });
}
