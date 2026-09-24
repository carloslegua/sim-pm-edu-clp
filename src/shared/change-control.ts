// Control integrado de cambios -- lógica PURA compartida en tiempo de COMPILACIÓN (Vite la inlinea en changes.js).
//
// Auditoría metodológica (PMI): el registro de cambios vivía solo en Costos y solo medía Δ costo. PMBOK (Realizar el control
// integrado de cambios) pide EVALUAR A LA VEZ el impacto de cada solicitud en alcance, cronograma, costo, riesgo, calidad y
// recursos; decidirla en el CCB con la autoridad que corresponde; y, si se aprueba, ACTUALIZAR las líneas base afectadas y los
// documentos, dejando trazabilidad. Aquí la solicitud de cambio (SC) es el paraguas y ENLAZA, no duplica:
//   · alcance   → las modificaciones de alcance (MOD) de Recopilar Requisitos;
//   · costo     → las órdenes de cambio (OC) de Costos (financiación, reservas, línea base de costos LB-n);
//   · cronograma→ el efecto REAL en el fin del proyecto (CPM recalculado, ver schedule-risk.ts) y la versión LB-n de la línea
//                 base del cronograma (schedule-control.ts) que la incorporó;
//   · riesgo    → los riesgos del Registro afectados.
// Una SC solo se APRUEBA con la evaluación completa de las seis áreas y con el nivel de autoridad que exige (cualquier cambio de
// línea base: CCB; reserva de gestión o fondos adicionales: sponsor; contingencia: los tramos de la política de reservas), y solo
// se marca IMPLEMENTADA cuando cada línea base que debía cambiar está realmente actualizada (se comprueba contra los otros módulos).

import { AUTH_LABEL, authLevelOf, levelCovers, requiredLevel, type AuthLevel, type ReservePolicy } from "./reserve-policy";

export type Area = "scope" | "schedule" | "cost" | "risk" | "quality" | "resources";
export const AREAS: Area[] = ["scope", "schedule", "cost", "risk", "quality", "resources"];
export const AREA_LABEL: Record<Area, string> = { scope: "Alcance", schedule: "Cronograma", cost: "Costo", risk: "Riesgo", quality: "Calidad", resources: "Recursos" };
export type AreaState = "sin_evaluar" | "sin_impacto" | "con_impacto";
export const AREA_STATE_LABEL: Record<AreaState, string> = { sin_evaluar: "Sin evaluar", sin_impacto: "Sin impacto", con_impacto: "Con impacto" };
export interface AreaAssessment { state: AreaState; note: string; }
export type CrStatus = "Pendiente" | "Aprobada" | "Rechazada" | "Diferida" | "Implementada";
export const CR_STATUSES: CrStatus[] = ["Pendiente", "Aprobada", "Rechazada", "Diferida", "Implementada"];
export const ORIGINS = ["Solicitud del cliente", "Riesgo materializado", "Variación de desempeño (EVM)", "Requisito nuevo o modificado", "Trabajo imprevisto dentro del alcance", "Defecto o no conformidad", "Normativa o regulación", "Otro"];
export const CR_TYPES = ["Acción correctiva", "Acción preventiva", "Reparación de defecto", "Actualización de la línea base o del plan"];
export const FUNDS = ["Contingencia", "Reserva de gestión", "Financiamiento adicional"];

export interface ChangeRequest {
  id: string; code: string; title: string; description: string; requester: string; requestedOn: string; origin: string; type: string;
  impact: Record<Area, AreaAssessment>;
  wbsIds: string[]; actIds: string[]; daysDelta: number | null;      // cronograma: qué actividades y cuántos días (puede ser negativo)
  costDelta: number | null; fund: string;                            // costo: monto y fuente de fondos
  orderIds: string[]; modIds: string[]; riskIds: string[];            // enlaces a Costos (OC), Requisitos (MOD) y Riesgos
  scheduleBaseline: string;                                          // LB-n del cronograma que la incorporó
  status: CrStatus; decidedOn: string; approver: string; authLevel: string; sponsorAuth: boolean; rationale: string;
  implementedOn: string; notes: string;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return isFinite(n) ? n : null; };
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
export function normalizeCr(o: unknown, fallbackId: string): ChangeRequest {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>, im = (x.impact && typeof x.impact === "object" ? x.impact : {}) as Record<string, unknown>;
  const impact = {} as Record<Area, AreaAssessment>;
  AREAS.forEach((a) => { const q = (im[a] && typeof im[a] === "object" ? im[a] : {}) as Record<string, unknown>; impact[a] = { state: (["sin_impacto", "con_impacto"].indexOf(str(q.state)) >= 0 ? q.state : "sin_evaluar") as AreaState, note: str(q.note) }; });
  const id = str(x.id) || fallbackId;
  return {
    id, code: str(x.code) || id, title: str(x.title), description: str(x.description), requester: str(x.requester), requestedOn: str(x.requestedOn), origin: str(x.origin), type: str(x.type),
    impact, wbsIds: strs(x.wbsIds), actIds: strs(x.actIds), daysDelta: numOrNull(x.daysDelta), costDelta: numOrNull(x.costDelta), fund: str(x.fund),
    orderIds: strs(x.orderIds), modIds: strs(x.modIds), riskIds: strs(x.riskIds), scheduleBaseline: str(x.scheduleBaseline),
    status: (CR_STATUSES.indexOf(x.status as CrStatus) >= 0 ? x.status : "Pendiente") as CrStatus, decidedOn: str(x.decidedOn), approver: str(x.approver), authLevel: str(x.authLevel),
    sponsorAuth: !!x.sponsorAuth, rationale: str(x.rationale), implementedOn: str(x.implementedOn), notes: str(x.notes)
  };
}
export const blankCr = (id: string, code: string): ChangeRequest => normalizeCr({ id, code }, id);
export function nextCode(crs: ChangeRequest[]): string { let max = 0; crs.forEach((c) => { const m = /(\d+)\s*$/.exec(c.code); if (m) max = Math.max(max, Number(m[1])); }); return "CR-" + String(max + 1).padStart(3, "0"); }

// ---- lo que se lee de los otros módulos (solo lectura) ----
// Evidencia de que una modificación de alcance (MOD) quedó INCORPORADA al alcance vigente (auditoría: «la existencia de un registro no demuestra
// implementación»): sus requisitos (los que llevan su id en `changeId`) deben estar, tal cual están hoy, en la línea base de requisitos vigente.
export interface ModEvidence { baselineFrozen: boolean; baselineVersion: string; baselineDate: string; affected: number; incorporated: number; }
export interface ModFact {
  id: string; code: string; title: string;
  status: string;                 // propuesto | enEvaluacion | aprobado | rechazado | implementado (el vocabulario de Recopilar Requisitos)
  approver: string; ccrRef: string;   // quién la aprobó y a qué solicitud de cambio responde (campo CCR de la MOD)
  evidence: ModEvidence;
}
export const MOD_STATUS_LABEL: Record<string, string> = { propuesto: "Propuesta", enEvaluacion: "En evaluación", aprobado: "Aprobada", rechazado: "Rechazada", implementado: "Implementada" };
const sigOf = (o: Record<string, unknown>): string => JSON.stringify([o.text, o.type, o.priority, o.status, o.acceptanceCriteria, o.verificationMethod, o.normativeBasis, Array.isArray(o.wbsNodeIds) ? (o.wbsNodeIds as unknown[]).map(String).sort() : [], Array.isArray(o.sourceRanIds) ? (o.sourceRanIds as unknown[]).map(String).sort() : []]);
// Lee (solo lectura) la rama `requirements` y arma la evidencia de cada MOD. Un requisito «incorporado» está en la instantánea de la línea base con el mismo
// contenido; si se editó después de congelarla, ya no lo está (la línea base no lo refleja).
export function modFacts(req: unknown): ModFact[] {
  const r = (req && typeof req === "object" ? req : {}) as Record<string, unknown>, items = (Array.isArray(r.items) ? r.items : []).filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;
  const bl = (r.baseline && typeof r.baseline === "object" ? r.baseline : {}) as Record<string, unknown>, snap = new Map<string, string>();
  (Array.isArray(bl.snapshot) ? bl.snapshot : []).forEach((s) => { if (s && typeof s === "object") { const o = s as Record<string, unknown>; snap.set(String(o.id), sigOf(o)); } });
  return (Array.isArray(r.changes) ? r.changes : []).filter((x) => x && typeof x === "object").map((x) => {
    const m = x as Record<string, unknown>, id = String(m.id || ""), aff = items.filter((it) => String(it.changeId || "") === id);
    return {
      id, code: String(m.code || m.id || ""), title: String(m.summary || m.title || ""), status: String(m.status || "propuesto"), approver: String(m.approver || ""), ccrRef: String(m.ccrRef || ""),
      evidence: { baselineFrozen: !!bl.frozen, baselineVersion: String(bl.version || ""), baselineDate: String(bl.date || ""), affected: aff.length, incorporated: aff.filter((it) => snap.get(String(it.id)) === sigOf(it)).length }
    };
  });
}
export interface ChangeFacts {
  orders: Array<{ id: string; cost: number; fund: string; status: string; baselined: string | null }>;   // órdenes de cambio de Costos
  mods: ModFact[];                                                                                      // modificaciones de alcance de Requisitos, con su estado y su evidencia
  risks: Array<{ id: string; code: string; title: string }>;
  scheduleLog: Array<{ version: string; date: string }>;                                                // versiones de la línea base del cronograma
  policy: ReservePolicy | null;
  // Retraso (+) o adelanto (−) del FIN DEL PROYECTO si se aplica la SC (CPM recalculado); null = no calculable.
  projectDelay: ((cr: ChangeRequest) => number | null) | null;
}

const isCont = (fund: string): boolean => fund === "Contingencia";
const EPS = 1e-6;
// ---- efecto y líneas base que deben cambiar ----
export interface BaselineNeed { scope: boolean; schedule: boolean; cost: boolean; }
export interface ImpactSummary { projectDelay: number | null; baselines: BaselineNeed; reasons: string[]; }
export function summarize(cr: ChangeRequest, f: ChangeFacts): ImpactSummary {
  const delay = f.projectDelay ? f.projectDelay(cr) : null, reasons: string[] = [];
  const scope = cr.impact.scope.state === "con_impacto";
  const schedule = delay !== null && Math.abs(delay) > 0.05;
  const cost = cr.impact.cost.state === "con_impacto" && !!cr.costDelta && Math.abs(cr.costDelta) > EPS && !isCont(cr.fund);
  if (scope) reasons.push("cambia el alcance: se registra como modificación de alcance (MOD) en Recopilar Requisitos");
  if (schedule) reasons.push("mueve el fin del proyecto " + (delay as number > 0 ? "+" : "") + (Math.round((delay as number) * 10) / 10) + " d: exige una nueva versión de la línea base del cronograma");
  if (cost) reasons.push("se financia con " + cr.fund.toLowerCase() + ": la orden debe incorporarse a la línea base de costos");
  else if (cr.impact.cost.state === "con_impacto" && cr.costDelta && isCont(cr.fund)) reasons.push("se financia con contingencia: dentro de la línea base de costos, sin cambiarla (pero sí consume contingencia)");
  return { projectDelay: delay, baselines: { scope, schedule, cost }, reasons };
}

// ---- evaluación integrada ----
export function assessmentGaps(cr: ChangeRequest): string[] {
  const out: string[] = [];
  AREAS.forEach((a) => {
    const im = cr.impact[a];
    if (im.state === "sin_evaluar") out.push("falta evaluar el impacto en " + AREA_LABEL[a].toLowerCase());
    else if (im.state === "con_impacto" && !im.note.trim() && a !== "cost" && a !== "schedule" && a !== "risk") out.push("describe el impacto en " + AREA_LABEL[a].toLowerCase());
  });
  if (cr.impact.cost.state === "con_impacto" && (!cr.costDelta || Math.abs(cr.costDelta) < EPS)) out.push("cuantifica el Δ costo (monto distinto de cero)");
  if (cr.impact.cost.state === "con_impacto" && cr.costDelta && !cr.fund) out.push("indica la fuente de fondos del Δ costo");
  if (cr.impact.schedule.state === "con_impacto" && (cr.daysDelta === null || (!cr.wbsIds.length && !cr.actIds.length))) out.push("cuantifica el efecto en el plazo: paquetes o actividades afectadas y los días");
  if (cr.impact.risk.state === "con_impacto" && !cr.riskIds.length && !cr.impact.risk.note.trim()) out.push("indica los riesgos afectados o los nuevos riesgos");
  return out;
}

// ---- autoridad requerida ----
export function requiredAuthorityOf(cr: ChangeRequest, f: ChangeFacts): { level: AuthLevel; why: string } {
  const s = summarize(cr, f);
  let level: AuthLevel = "pm", why = "sin cambio de línea base ni de costo";
  const up = (l: AuthLevel, w: string): void => { const rank: Record<AuthLevel, number> = { pm: 1, ccb: 2, sponsor: 3 }; if (rank[l] > rank[level]) { level = l; why = w; } };
  if (s.baselines.scope || s.baselines.schedule || s.baselines.cost) up("ccb", "cambia una línea base (la aprueba el CCB)");
  if (cr.impact.cost.state === "con_impacto" && cr.costDelta) {
    const fundKind = cr.fund === "Contingencia" ? "cont" : cr.fund === "Financiamiento adicional" ? "extra" : "mgmt";
    const need = requiredLevel(f.policy, fundKind, Math.abs(cr.costDelta));
    if (need) up(need, fundKind === "cont" ? "monto con cargo a contingencia según la política de reservas" : "reserva de gestión o fondos adicionales: los autoriza el sponsor");
  }
  return { level, why };
}

// ---- decisión ----
export function approvalProblems(cr: ChangeRequest, f: ChangeFacts): string[] {
  const p: string[] = [];
  if (!cr.title.trim()) p.push("falta el título de la solicitud");
  if (!cr.requester.trim()) p.push("indica quién solicita el cambio");
  if (!cr.origin) p.push("indica el origen del cambio");
  assessmentGaps(cr).forEach((g) => p.push(g));
  if (!cr.approver.trim()) p.push("registra quién decide (CCB, sponsor…)");
  if (!cr.rationale.trim()) p.push("documenta el fundamento de la decisión");
  const req = requiredAuthorityOf(cr, f), have = authLevelOf({ authLevel: cr.authLevel, sponsorAuth: cr.sponsorAuth, approver: cr.approver });
  if (!levelCovers(have, req.level)) p.push("esta solicitud la autoriza el " + AUTH_LABEL[req.level] + " (" + req.why + ")" + (have ? "; la decisión registrada es del " + AUTH_LABEL[have] : "; indica el nivel de autoridad con que se decide"));
  return p;
}
// Una SC aprobada solo pasa a Implementada cuando cada línea base que debía cambiar está actualizada (se comprueba en los otros módulos).
export function implementationProblems(cr: ChangeRequest, f: ChangeFacts): string[] {
  const p: string[] = [], s = summarize(cr, f);
  if (s.baselines.scope) {
    // La existencia de un registro no demuestra implementación: cada MOD vinculada debe estar APROBADA (no rechazada ni en trámite), con quien la aprobó,
    // responder A ESTA solicitud (campo CCR = su código) y estar INCORPORADA a la línea base de requisitos vigente, fijada después de la decisión.
    const linked = cr.modIds.map((id) => f.mods.find((m) => m.id === id)).filter((m): m is ModFact => !!m);
    if (cr.modIds.length > linked.length) p.push("vincula una modificación de alcance que ya no existe en Recopilar Requisitos");
    if (!linked.length) { if (!cr.modIds.length) p.push("registra la modificación de alcance en Recopilar Requisitos y vincúlala (MOD)"); }
    linked.forEach((m) => {
      const st = MOD_STATUS_LABEL[m.status] || m.status;
      if (m.status === "rechazado") p.push("la modificación " + m.code + " está «Rechazada»: no puede respaldar un cambio de alcance aprobado (corrige el vínculo o el estado de la MOD)");
      else if (m.status !== "aprobado" && m.status !== "implementado") p.push("la modificación " + m.code + " está «" + st + "»: apruébala en Recopilar Requisitos antes de implementar el cambio");
      else if (!m.approver.trim()) p.push("la modificación " + m.code + " no registra quién la aprobó");
      const ccr = m.ccrRef.trim().toLowerCase();
      if (!ccr) p.push("la modificación " + m.code + " no cita esta solicitud: escribe «" + cr.code + "» en su campo de solicitud de cambio (CCR) en Recopilar Requisitos");
      else if (ccr !== cr.code.trim().toLowerCase()) p.push("la modificación " + m.code + " responde a la solicitud «" + m.ccrRef.trim() + "», no a " + cr.code + ": no corresponde a este cambio");
      const e = m.evidence;
      if (!e.baselineFrozen) p.push("la línea base de requisitos no está congelada: el cambio de alcance no tiene una línea base a la que incorporarse");
      else if (!e.affected) p.push("la modificación " + m.code + " no afecta ningún requisito: no hay evidencia de que el alcance cambió (actívala y edita la matriz de requisitos)");
      else if (e.incorporated < e.affected) p.push("solo " + e.incorporated + " de " + e.affected + " requisito(s) de " + m.code + " están tal cual en la línea base de requisitos v" + e.baselineVersion + ": congela una nueva versión de la línea base que incorpore la modificación");
      else if (cr.decidedOn && e.baselineDate && e.baselineDate < cr.decidedOn) p.push("la línea base de requisitos v" + e.baselineVersion + " (" + e.baselineDate + ") es anterior a la decisión (" + cr.decidedOn + "): no puede incorporar este cambio");
    });
  }
  if (cr.impact.cost.state === "con_impacto" && cr.costDelta) {
    const os = cr.orderIds.map((id) => f.orders.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o);
    if (!os.length) p.push("registra la orden de cambio en Costos y vincúlala (OC)");
    else {
      const total = os.reduce((sum, o) => sum + o.cost, 0);
      if (Math.abs(total - (cr.costDelta as number)) > 0.5) p.push("las órdenes vinculadas suman " + Math.round(total) + " y el Δ costo de la solicitud es " + Math.round(cr.costDelta as number));
      os.forEach((o) => { if (o.status !== "Aprobada") p.push("la orden " + o.id + " está «" + o.status + "»: aprueba la orden en Costos"); else if (!isCont(o.fund) && !o.baselined) p.push("la orden " + o.id + " usa " + o.fund.toLowerCase() + " y aún no está incorporada a la línea base de costos"); });
    }
  }
  if (s.baselines.schedule) {
    if (!cr.scheduleBaseline) p.push("fija en Cronograma/CPM la nueva versión de la línea base e indica cuál (LB-n)");
    else if (!f.scheduleLog.some((l) => l.version === cr.scheduleBaseline)) p.push("la versión " + cr.scheduleBaseline + " no existe en la línea base del cronograma del proyecto");
    else { const v = f.scheduleLog.find((l) => l.version === cr.scheduleBaseline) as { date: string }; if (cr.decidedOn && v.date && v.date < cr.decidedOn) p.push("la versión " + cr.scheduleBaseline + " (" + v.date + ") es anterior a la decisión (" + cr.decidedOn + "): no puede incorporar este cambio"); }
  }
  return p;
}

// ---- hallazgos de seguimiento ----
export interface CrFinding { code: string; severity: "riesgo" | "aviso" | "info"; text: string; }
const daysBetween = (a: string, b: string): number | null => { const x = Date.parse(a + "T12:00:00Z"), y = Date.parse(b + "T12:00:00Z"); return isFinite(x) && isFinite(y) ? Math.round((y - x) / 86400000) : null; };
export function crFindings(cr: ChangeRequest, f: ChangeFacts, today: string): CrFinding[] {
  const out: CrFinding[] = [], F = (code: string, severity: CrFinding["severity"], text: string): void => { out.push({ code, severity, text }); };
  if (cr.status === "Pendiente") {
    const age = cr.requestedOn ? daysBetween(cr.requestedOn, today) : null;
    if (age !== null && age > 14) F("C1", "aviso", "Lleva " + age + " días sin decisión del CCB: un cambio pendiente deja el proyecto con un plan que quizá ya no es el vigente.");
    const gaps = assessmentGaps(cr);
    if (gaps.length) F("C2", "info", "Evaluación incompleta: " + gaps.slice(0, 3).join("; ") + (gaps.length > 3 ? "…" : "") + ".");
  }
  if (cr.status === "Aprobada") {
    const ip = implementationProblems(cr, f), age = cr.decidedOn ? daysBetween(cr.decidedOn, today) : null;
    if (ip.length) F("C3", age !== null && age > 14 ? "aviso" : "info", "Aprobada pero aún no implementada" + (age !== null ? " (hace " + age + " d)" : "") + ": " + ip[0] + (ip.length > 1 ? " (+" + (ip.length - 1) + " más)" : "") + ".");
  }
  if ((cr.status === "Aprobada" || cr.status === "Implementada") && cr.orderIds.length) {
    const os = cr.orderIds.map((id) => f.orders.find((o) => o.id === id));
    if (os.some((o) => !o)) F("C4", "aviso", "Vincula una orden de cambio que ya no existe en Costos.");
  }
  if (cr.origin === "Riesgo materializado" && !cr.riskIds.length) F("C5", "aviso", "El origen es un riesgo materializado pero no indica cuál: vincula el riesgo del registro.");
  if (cr.impact.schedule.state === "sin_impacto" && f.projectDelay) { const d = f.projectDelay(cr); if (d !== null && Math.abs(d) > 0.05) F("C6", "aviso", "Declara «sin impacto» en el plazo pero el CPM mueve el fin del proyecto " + (Math.round(d * 10) / 10) + " d."); }
  return out;
}

// ---- cartera ----
export interface CrPortfolio { total: number; byStatus: Record<CrStatus, number>; approvedCost: number; approvedDays: number; pendingBaseline: number; oldestPendingDays: number | null; }
export function portfolio(crs: ChangeRequest[], f: ChangeFacts, today: string): CrPortfolio {
  const byStatus: Record<CrStatus, number> = { Pendiente: 0, Aprobada: 0, Rechazada: 0, Diferida: 0, Implementada: 0 };
  let approvedCost = 0, approvedDays = 0, pendingBaseline = 0, oldest: number | null = null;
  crs.forEach((c) => {
    byStatus[c.status]++;
    if (c.status === "Aprobada" || c.status === "Implementada") { approvedCost += c.impact.cost.state === "con_impacto" ? (c.costDelta || 0) : 0; const d = f.projectDelay ? f.projectDelay(c) : null; approvedDays += d || 0; }
    if (c.status === "Aprobada" && implementationProblems(c, f).length) pendingBaseline++;
    if (c.status === "Pendiente" && c.requestedOn) { const a = daysBetween(c.requestedOn, today); if (a !== null && (oldest === null || a > oldest)) oldest = a; }
  });
  return { total: crs.length, byStatus, approvedCost, approvedDays, pendingBaseline, oldestPendingDays: oldest };
}
