// Plan para la Dirección del Proyecto (PMBOK: «Desarrollar el plan para la dirección del proyecto») — lógica PURA (sin DOM ni `localStorage`),
// inlineada en plan-direccion.js.
//
// Qué es este módulo: el INTEGRADOR. No captura datos propios (salvo el registro de aprobación del plan): consolida los planes subsidiarios y
// las líneas base de alcance, cronograma y costo que ya viven en las demás herramientas, las cruza entre sí y dice si el plan está listo.
// PMBOK: el plan integra las líneas base y los planes subsidiarios, se aprueba como un conjunto y, una vez aprobado, solo cambia por control
// integrado de cambios. Aquí eso es: (1) estado por área con las auditorías que ya existen; (2) hallazgos de INTEGRACIÓN (líneas base que
// no calzan entre sí, plazo contra la fecha del Acta, presupuesto contra el CAPEX, cambios aprobados sin implementar…); (3) al aprobar el plan
// se guarda una INSTANTÁNEA de las líneas base y, si después cambian, se avisa que el plan aprobado quedó desactualizado (nueva versión).
// Los planes de calidad, comunicaciones y adquisiciones aún no tienen módulo en la suite: se muestran como «no disponibles», no se inventan.

export type AreaState = "vacio" | "verde" | "ambar" | "rojo";
export interface BaselineFact { has: boolean; version: string; date: string; approver: string; }
export interface PlanSnapshot {
  scopeVersion: string; scopeDate: string; requirementsVersion: string; scheduleVersion: string; scheduleDate: string; scheduleFinish: string;
  bacCurrent: number; costBaseline: string; boeStatus: string;
}
export interface PlanFacts {
  charter: { has: boolean; pct: number; end: string };
  scope: { has: boolean; state: AreaState; base: BaselineFact; notDecomposed: number };
  requirements: { has: boolean; state: AreaState; base: BaselineFact; total: number };
  wbs: { leaves: number; state: AreaState; dictPct: number; riesgo: number; aviso: number };
  schedule: { has: boolean; ok: boolean; activities: number; duration: number | null; start: string; finish: string; critical: number; base: BaselineFact; deviationPct: number | null };
  cost: { has: boolean; bac: number; bacCurrent: number; total: number; pendingBaseline: number; capex: number | null; boeStatus: string; boeApprovedOn: string; baselineVersion: string; baselineDate: string };
  risks: { total: number; open: number; high: number };
  stakeholders: { count: number; close: number };
  resources: { roles: number; withPerson: number; leaves: number; withR: number; withoutA: number };
  changes: { total: number; pending: number; approvedOpen: number; oldestPending: number | null };
  evm: { reports: number; lastCut: string };
  projectEnd: string; contractualEnd: string; today: string;
  plan: { status: "borrador" | "aprobado"; version: string; approvedBy: string; approvedOn: string; snapshot: PlanSnapshot | null };
}
export interface PFinding { code: string; severity: "riesgo" | "aviso" | "info"; area: string; text: string; }
export interface AreaRow { key: string; label: string; file: string | null; state: AreaState; metric: string; note: string; unavailable?: boolean; }

export const emptyBase = (): BaselineFact => ({ has: false, version: "", date: "", approver: "" });
export function emptyFacts(today = ""): PlanFacts {
  return {
    charter: { has: false, pct: 0, end: "" }, scope: { has: false, state: "vacio", base: emptyBase(), notDecomposed: 0 }, requirements: { has: false, state: "vacio", base: emptyBase(), total: 0 },
    wbs: { leaves: 0, state: "vacio", dictPct: 0, riesgo: 0, aviso: 0 },
    schedule: { has: false, ok: true, activities: 0, duration: null, start: "", finish: "", critical: 0, base: emptyBase(), deviationPct: null },
    cost: { has: false, bac: 0, bacCurrent: 0, total: 0, pendingBaseline: 0, capex: null, boeStatus: "", boeApprovedOn: "", baselineVersion: "", baselineDate: "" },
    risks: { total: 0, open: 0, high: 0 }, stakeholders: { count: 0, close: 0 }, resources: { roles: 0, withPerson: 0, leaves: 0, withR: 0, withoutA: 0 },
    changes: { total: 0, pending: 0, approvedOpen: 0, oldestPending: null }, evm: { reports: 0, lastCut: "" },
    projectEnd: "", contractualEnd: "", today, plan: { status: "borrador", version: "1.0", approvedBy: "", approvedOn: "", snapshot: null }
  };
}
const RANK: Record<AreaState, number> = { vacio: 0, verde: 1, ambar: 2, rojo: 3 };
export const worstState = (ss: AreaState[]): AreaState => ss.reduce<AreaState>((a, s) => (RANK[s] > RANK[a] ? s : a), "vacio");
export const STATE_LABEL: Record<AreaState, string> = { vacio: "Sin datos", verde: "En orden", ambar: "Con avisos", rojo: "Con riesgos" };
const pctState = (has: boolean, pct: number): AreaState => (!has ? "vacio" : pct >= 100 ? "verde" : pct >= 50 ? "ambar" : "rojo");
const iso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
const days = (a: string, b: string): number | null => { if (!iso(a) || !iso(b)) return null; return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); };
const money = (n: number): string => Math.round(n).toLocaleString("es-PE");

// ---------- estado por área ----------
export function areaRows(f: PlanFacts): AreaRow[] {
  const c = f.changes, s = f.schedule, k = f.cost;
  const schedState: AreaState = !s.has ? "vacio" : !s.ok ? "rojo" : !s.base.has || (s.deviationPct !== null && s.deviationPct > 10) ? "ambar" : "verde";
  const costState: AreaState = !k.has ? "vacio" : (k.capex !== null && k.total > k.capex + 0.5) ? "rojo" : k.boeStatus !== "aprobada" || k.pendingBaseline > 0 ? "ambar" : "verde";
  const riskState: AreaState = f.risks.total === 0 ? "vacio" : f.risks.high > 0 ? "ambar" : "verde";
  const resState: AreaState = f.resources.roles === 0 ? "vacio" : f.resources.withoutA > 0 || (f.resources.leaves > 0 && f.resources.withR < f.resources.leaves) ? "ambar" : "verde";
  const chState: AreaState = c.total === 0 ? "vacio" : c.approvedOpen > 0 ? "ambar" : "verde";
  const rows: AreaRow[] = [
    { key: "charter", label: "Acta de Constitución", file: "Project_Charter.html", state: pctState(f.charter.has, f.charter.pct), metric: f.charter.has ? f.charter.pct + " % completa" : "—", note: "" },
    { key: "requirements", label: "Requisitos", file: "Recopilar_Requisitos.html", state: f.requirements.state, metric: f.requirements.has ? f.requirements.total + " requisito(s) · " + (f.requirements.base.has ? "línea base " + f.requirements.base.version : "sin línea base") : "—", note: "" },
    { key: "scope", label: "Enunciado del Alcance", file: "Enunciado_del_Alcance.html", state: f.scope.state, metric: f.scope.has ? (f.scope.base.has ? "línea base v" + f.scope.base.version : "sin línea base") + (f.scope.notDecomposed ? " · " + f.scope.notDecomposed + " entregable(s) sin descomponer" : "") : "—", note: "" },
    { key: "wbs", label: "EDT y diccionario", file: "WBS_Builder.html", state: f.wbs.state, metric: f.wbs.leaves ? f.wbs.leaves + " paquetes · diccionario " + f.wbs.dictPct + " %" : "—", note: "" },
    { key: "schedule", label: "Cronograma", file: "Cronograma_CPM.html", state: schedState, metric: s.has ? (s.duration !== null ? s.duration + " d laborables" : "—") + (s.finish ? " · fin " + s.finish : "") + (s.base.has ? " · " + s.base.version : " · sin línea base") : "—", note: "" },
    { key: "cost", label: "Costos y BOE", file: "Cost-management.html", state: costState, metric: k.has ? "BAC " + money(k.bacCurrent || k.bac) + " · BOE " + (k.boeStatus || "sin datos") : "—", note: "" },
    { key: "risks", label: "Riesgos", file: "Risk_Register.html", state: riskState, metric: f.risks.total ? f.risks.open + " abiertos · " + f.risks.high + " de nivel alto" : "—", note: "" },
    { key: "stakeholders", label: "Interesados", file: "Stakeholder_Studio.html", state: f.stakeholders.count ? "verde" : "vacio", metric: f.stakeholders.count ? f.stakeholders.count + " interesado(s) · " + f.stakeholders.close + " a gestionar de cerca" : "—", note: "" },
    { key: "resources", label: "Equipo y responsabilidades", file: "RACI_Matrix.html", state: resState, metric: f.resources.roles ? f.resources.roles + " puestos · " + f.resources.withR + "/" + f.resources.leaves + " paquetes con responsable" : "—", note: "" },
    { key: "changes", label: "Control integrado de cambios", file: "Control_Cambios.html", state: chState, metric: c.total ? c.pending + " pendiente(s) · " + c.approvedOpen + " aprobada(s) sin implementar" : "—", note: "" },
    { key: "evm", label: "Valor ganado", file: "Valor_Ganado.html", state: f.evm.reports ? "verde" : "vacio", metric: f.evm.reports ? f.evm.reports + " corte(s) · último " + f.evm.lastCut : "—", note: "" },
    { key: "quality", label: "Plan de Calidad", file: null, state: "vacio", metric: "sin módulo en la suite", note: "Aún no hay módulo: no se inventa su contenido.", unavailable: true },
    { key: "comms", label: "Plan de Comunicaciones", file: null, state: "vacio", metric: "sin módulo en la suite", note: "Aún no hay módulo: no se inventa su contenido.", unavailable: true },
    { key: "procurement", label: "Plan de Adquisiciones", file: null, state: "vacio", metric: "sin módulo en la suite", note: "Aún no hay módulo: no se inventa su contenido.", unavailable: true }
  ];
  return rows;
}

// ---------- instantánea del plan aprobado ----------
export function snapshotOf(f: PlanFacts): PlanSnapshot {
  return {
    scopeVersion: f.scope.base.has ? f.scope.base.version : "", scopeDate: f.scope.base.date, requirementsVersion: f.requirements.base.has ? f.requirements.base.version : "",
    scheduleVersion: f.schedule.base.has ? f.schedule.base.version : "", scheduleDate: f.schedule.base.date, scheduleFinish: f.schedule.finish,
    bacCurrent: Math.round((f.cost.bacCurrent || f.cost.bac) * 100) / 100, costBaseline: f.cost.baselineVersion, boeStatus: f.cost.boeStatus
  };
}
export function snapshotDiff(a: PlanSnapshot, b: PlanSnapshot): Array<{ label: string; from: string; to: string }> {
  const out: Array<{ label: string; from: string; to: string }> = [], d = (label: string, x: string | number, y: string | number): void => { if (String(x) !== String(y)) out.push({ label, from: String(x || "—"), to: String(y || "—") }); };
  d("Línea base del alcance", a.scopeVersion, b.scopeVersion); d("Línea base de requisitos", a.requirementsVersion, b.requirementsVersion);
  d("Línea base del cronograma", a.scheduleVersion, b.scheduleVersion); d("Fin del cronograma", a.scheduleFinish, b.scheduleFinish);
  d("BAC vigente", money(a.bacCurrent), money(b.bacCurrent)); d("Línea base de costos", a.costBaseline, b.costBaseline); d("Estado de la BOE", a.boeStatus, b.boeStatus);
  return out;
}

// ---------- hallazgos de integración ----------
export function integrationFindings(f: PlanFacts): PFinding[] {
  const out: PFinding[] = [], F = (code: string, severity: PFinding["severity"], area: string, text: string): void => { out.push({ code, severity, area, text }); };
  const s = f.schedule, k = f.cost, anyData = f.scope.has || s.has || k.has || f.wbs.leaves > 0;
  if (!f.charter.has && anyData) F("P1", "aviso", "Acta", "El proyecto tiene planes y líneas base pero no un Acta de Constitución que los autorice y fije sus objetivos y restricciones.");
  if (f.scope.has && !f.scope.base.has) F("P2", "aviso", "Alcance", "El Enunciado del Alcance no tiene línea base: el alcance del plan no está congelado y no hay contra qué controlar los cambios de alcance.");
  if (f.requirements.has && !f.requirements.base.has) F("P2", "aviso", "Requisitos", "La matriz de requisitos no tiene línea base: los cambios a los requisitos no se distinguen de la definición inicial.");
  if (s.has && s.ok && !s.base.has) F("P3", "aviso", "Cronograma", "El cronograma no tiene línea base (LB-n): no se puede medir el avance ni la variación del plazo.");
  if (k.has && k.boeStatus !== "aprobada") F("P4", "aviso", "Costos", "La Basis of Estimate no está aprobada" + (k.boeStatus ? " (" + k.boeStatus + ")" : "") + ": la línea base de costos no tiene su documento de sustento aprobado.");
  const sd = f.scope.base.date, td = s.base.date;
  if (sd && td && sd > td) F("P5", "aviso", "Integración", "La línea base del alcance (v" + f.scope.base.version + ", " + sd + ") es posterior a la del cronograma (" + s.base.version + ", " + td + "): el cronograma no refleja el alcance vigente.");
  if (sd && f.cost.boeApprovedOn && sd > f.cost.boeApprovedOn) F("P5", "aviso", "Integración", "La línea base del alcance (" + sd + ") es posterior a la aprobación de la BOE (" + f.cost.boeApprovedOn + "): el presupuesto no refleja el alcance vigente.");
  if (f.changes.approvedOpen > 0) F("P6", "aviso", "Cambios", f.changes.approvedOpen + " solicitud(es) de cambio aprobada(s) aún sin implementar: sus líneas base (alcance, cronograma o costo) no están actualizadas.");
  const end = f.contractualEnd || f.projectEnd, over = s.finish && end ? days(end, s.finish) : null;
  if (over !== null && over > 0) F("P7", "aviso", "Cronograma", "El cronograma termina el " + s.finish + ", " + over + " día(s) después de la fecha de fin del proyecto (" + end + "): el plazo comprometido no es alcanzable con el plan actual.");
  if (k.capex !== null && k.total > k.capex + 0.5) F("P8", "aviso", "Costos", "El presupuesto total (" + money(k.total) + ") supera el CAPEX autorizado (" + money(k.capex) + "): requiere reconciliación o una autorización adicional.");
  if (f.changes.oldestPending !== null && f.changes.oldestPending > 14) F("P9", "info", "Cambios", "Hay solicitudes de cambio pendientes hace más de 14 días (la más antigua, " + f.changes.oldestPending + "): el plan puede estar desactualizado respecto de la realidad.");
  if (f.risks.total === 0 && (s.has || k.has)) F("P10", "aviso", "Riesgos", "El plan no tiene Registro de Riesgos: la contingencia y el plazo no tienen sustento en riesgos identificados.");
  if (s.base.has && s.deviationPct !== null && s.deviationPct > 10) F("P11", "aviso", "Cronograma", "El pronóstico del cronograma se desvía " + Math.round(s.deviationPct * 10) / 10 + " % de su línea base: evalúa un cambio (o una nueva línea base) antes de aprobar el plan.");
  if (f.plan.status === "aprobado") {
    if (!f.plan.approvedBy.trim() || !f.plan.approvedOn) F("P14", "riesgo", "Plan", "El plan figura «aprobado» sin registrar quién lo aprueba y en qué fecha.");
    if (f.plan.snapshot) {
      const diff = snapshotDiff(f.plan.snapshot, snapshotOf(f));
      if (diff.length) F("P12", "aviso", "Plan", "Las líneas base cambiaron desde la aprobación del plan (v" + f.plan.version + (f.plan.approvedOn ? ", " + f.plan.approvedOn : "") + "): " + diff.map((x) => x.label + " " + x.from + " → " + x.to).join("; ") + ". El plan aprobado quedó desactualizado: crea una nueva versión.");
    }
  } else if (s.base.has && f.scope.base.has && k.boeStatus === "aprobada") F("P13", "info", "Plan", "Las líneas base de alcance, cronograma y costo existen y la BOE está aprobada: el plan puede aprobarse como un conjunto.");
  return out;
}

// ¿Se puede aprobar? No con hallazgos de riesgo ni sin las tres líneas base (lo que se aprueba es el conjunto).
export function approvalBlockers(f: PlanFacts): string[] {
  const b: string[] = [];
  if (!f.scope.base.has) b.push("falta la línea base del alcance");
  if (!f.schedule.base.has) b.push("falta la línea base del cronograma");
  if (!f.cost.has) b.push("falta el presupuesto (línea base de costos)");
  return b;
}
