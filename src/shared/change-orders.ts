// Órdenes de cambio de costos: clasificación, financiación, aprobación y efecto
// presupuestario -- lógica PURA compartida en tiempo de COMPILACIÓN (Vite la inlinea
// en cost.js y en gpi-core.js; sin scripts extra, mismo criterio que write-session.ts).
//
// Hallazgo "alta" de revisión externa (PMI: reservas y alcance / presupuesto y línea
// base): los textos de Costos enseñaban que "un cambio de alcance requiere reserva de
// gestión", y "Aprobada" solo sumaba totales. Una orden se evalúa en tres ejes que NO
// se deducen unos de otros:
//   · NATURALEZA: riesgo materializado (un riesgo ya identificado que ocurrió) / trabajo
//     imprevisto DENTRO del alcance (necesario y no identificado, pero del alcance ya
//     aprobado) / cambio de alcance (trabajo nuevo o distinto: modifica el alcance).
//   · FINANCIACIÓN: contingencia (dentro de la línea base) / reserva de gestión (fuera de
//     la línea base; la autoriza el sponsor) / financiamiento adicional (fondos nuevos).
//   · APROBACIÓN y EFECTO: quién autoriza y qué cambia en el presupuesto.
// Aprobar RESERVA fondos, pero la línea base (BAC) solo cambia cuando la orden se
// INCORPORA a ella de forma explícita, dejando una versión (LB-n) con BAC anterior y nuevo.

export type CoKind = "riesgo" | "imprevisto" | "alcance";
export const FUND_CONT = "Contingencia";
export const FUND_MGMT = "Reserva de gestión";
export const FUND_EXTRA = "Financiamiento adicional";

export const CO_KIND_LABEL: Record<CoKind, string> = {
  riesgo: "Riesgo materializado",
  imprevisto: "Trabajo imprevisto dentro del alcance",
  alcance: "Cambio de alcance"
};

// Guía por naturaleza: orienta, no decide -- la fuente de fondos sale de evaluar el cambio.
export const CO_KIND_HINT: Record<CoKind, string> = {
  riesgo: "Un riesgo ya identificado en el registro de riesgos que ocurrió. Se atiende con la contingencia (dentro de la línea base); si no alcanza, otra fuente requiere autorización del sponsor.",
  imprevisto: "Trabajo necesario que no estaba identificado ni como actividad ni como riesgo, pero pertenece al alcance ya aprobado: NO es un cambio de alcance. Contingencia si estaba cubierto; si no, reserva de gestión con autorización del sponsor.",
  alcance: "Trabajo nuevo o distinto del alcance aprobado (p. ej. una ampliación pedida por el cliente): modifica el alcance y la línea base. No se financia con contingencia; la fuente sale de evaluar el cambio: reserva de gestión (si el sponsor la autoriza) o financiamiento adicional."
};

import type { RiskRef } from "./risk-analysis";
import { AUTH_LABEL, authLevelOf, hasTiers, levelCovers, requiredLevel, tiersText, type ReservePolicy } from "./reserve-policy";

export interface CoOrder {
  id?: string; kind?: string; fund?: string; status?: string; cost?: number | string;
  approver?: string; sponsorAuth?: boolean; approvedOn?: string; baselined?: string | null;
  // Nivel de autoridad con que se autoriza (Director de Proyecto / CCB / Sponsor). Opcional: las órdenes anteriores no lo
  // traen y se deduce de `sponsorAuth` o del texto del aprobador (ver authLevelOf en reserve-policy.ts).
  authLevel?: string;
  // Vínculo con el Registro de Riesgos (solo tiene sentido si kind = "riesgo"): id del riesgo y su código (foto,
  // para mostrarlo aunque el registro no esté a mano).
  riskId?: string; riskCode?: string;
  // Paquete de la EDT que ejecuta el cambio (opcional): Valor Ganado suma ahí el monto de la orden aprobada (ver evm-reference.ts).
  wbsId?: string; wbsCode?: string;
  [key: string]: unknown;
}
export interface CoBudget { cont: number; mgmt: number; bac: number; }
export interface CoBaselineEntry {
  version: string; date: string; orderIds: string[]; bacBefore: number; bacAfter: number; approver: string;
}
export interface CoAnalysis {
  approved: number; fromContingency: number; fromMgmt: number; fromExtra: number; pending: number;
  bacInitial: number; bacCurrent: number;
  pendingBaseline: number;        // aprobado con reserva/fondos adicionales, aún NO incorporado a la línea base
  contingencyAvailable: number; mgmtAvailable: number;
  totalBudget: number;            // BAC vigente + pendiente de incorporar + reserva de gestión disponible
}
export interface CoEffect { dBac: number; dContingency: number; dMgmt: number; dTotal: number; }

const num = (v: unknown): number => Number(v) || 0;
// Un valor de fondeo desconocido cuenta como reserva de gestión: es lo que hacía el
// código anterior (todo lo que no era "Contingencia") con los .json ya exportados.
export function fundOf(o: CoOrder): "cont" | "mgmt" | "extra" {
  return o.fund === FUND_CONT ? "cont" : o.fund === FUND_EXTRA ? "extra" : "mgmt";
}

export function analyzeChangeOrders(orders: CoOrder[] | null | undefined, budget?: Partial<CoBudget> | null): CoAnalysis {
  const b = budget || {};
  let approved = 0, fromCont = 0, fromMgmt = 0, fromExtra = 0, pending = 0, incorporated = 0, pendingBase = 0;
  (orders || []).forEach((o) => {
    if (!o) return;
    if (o.status === "Pendiente") pending++;
    if (o.status !== "Aprobada") return;
    const a = num(o.cost), f = fundOf(o);
    approved += a;
    if (f === "cont") fromCont += a;
    else {
      if (f === "extra") fromExtra += a; else fromMgmt += a;
      if (o.baselined) incorporated += a; else pendingBase += a;
    }
  });
  const bacInitial = num(b.bac), bacCurrent = bacInitial + incorporated, mgmtAvailable = num(b.mgmt) - fromMgmt;
  return {
    approved, fromContingency: fromCont, fromMgmt, fromExtra, pending,
    bacInitial, bacCurrent, pendingBaseline: pendingBase,
    contingencyAvailable: num(b.cont) - fromCont, mgmtAvailable,
    totalBudget: bacCurrent + pendingBase + mgmtAvailable
  };
}

// Qué cambia en el presupuesto si esta orden se aprueba (y, para reserva/fondos, se incorpora).
export function orderEffect(o: CoOrder): CoEffect {
  const a = num(o.cost), f = fundOf(o);
  if (f === "cont") return { dBac: 0, dContingency: -a, dMgmt: 0, dTotal: 0 };       // se redistribuye DENTRO de la línea base
  if (f === "extra") return { dBac: a, dContingency: 0, dMgmt: 0, dTotal: a };        // fondos nuevos: sube la línea base y el total
  return { dBac: a, dContingency: 0, dMgmt: -a, dTotal: 0 };                          // transferencia de reserva de gestión a la línea base
}

// Un «riesgo materializado» solo lo es si el evento ESTABA en el registro de riesgos y ocurrió: el registro es la
// prueba. Si no lo estaba, era trabajo imprevisto. Devuelve los problemas del vínculo (vacío = válido).
export function riskLinkProblems(o: CoOrder, risks: RiskRef[]): string[] {
  const nada = "si el evento no estaba en el Registro de Riesgos no es un riesgo materializado: clasifícalo como trabajo imprevisto dentro del alcance";
  if (!o.riskId) return ["vincula la orden con el riesgo del Registro de Riesgos que se materializó (" + nada + ")"];
  const r = risks.find((x) => x.id === o.riskId);
  if (!r) return ["el riesgo vinculado" + (o.riskCode ? " (" + o.riskCode + ")" : "") + " no existe en el Registro de Riesgos (" + nada + ")"];
  if (r.type !== "amenaza") return [r.code + " es una oportunidad: no genera una orden por riesgo materializado"];
  if (r.status !== "materializado") return ["el riesgo " + r.code + " figura como «" + r.status.replace("_", " ") + "» en el Registro de Riesgos: márcalo como Materializado (con su fecha e impacto real) antes de aprobar la orden"];
  return [];
}

// Nivel de autoridad que exige la política de reservas del plan de riesgos a esta orden (null = la política no exige uno).
export function requiredAuthority(o: CoOrder, policy?: ReservePolicy | null): ReturnType<typeof requiredLevel> {
  const f = fundOf(o);
  return f === "cont" && !hasTiers(policy) ? null : requiredLevel(policy, f, num(o.cost));
}
// Problemas que impiden APROBAR la orden (lista vacía = puede aprobarse). `risks` = referencias del Registro de
// Riesgos; si no se pasa (undefined) no se comprueba el vínculo (compatibilidad con quien no lo tiene a mano). `policy` =
// política de reservas del plan de riesgos; si no se pasa (o no define límites) no se comprueban los niveles por monto.
export function validateApproval(o: CoOrder, orders: CoOrder[], budget?: Partial<CoBudget> | null, risks?: RiskRef[] | null, policy?: ReservePolicy | null): string[] {
  const p: string[] = [], f = fundOf(o), a = num(o.cost);
  if (o.kind === "riesgo" && Array.isArray(risks)) riskLinkProblems(o, risks).forEach((x) => p.push(x));
  const an = analyzeChangeOrders((orders || []).filter((x) => x !== o), budget); // saldos SIN esta orden
  if (o.kind !== "riesgo" && o.kind !== "imprevisto" && o.kind !== "alcance") p.push("clasifica la orden: riesgo materializado, trabajo imprevisto dentro del alcance o cambio de alcance");
  if (!a) p.push("el Δ costo debe ser distinto de cero");
  if (!String(o.approver || "").trim()) p.push("registra quién aprueba (CCB, sponsor…)");
  if (o.kind === "alcance" && f === "cont") p.push("un cambio de alcance no se financia con contingencia (la contingencia cubre riesgos identificados dentro del alcance de la línea base)");
  if ((f === "mgmt" || f === "extra") && !o.sponsorAuth) p.push("usar la reserva de gestión o fondos adicionales requiere la autorización expresa del sponsor");
  if (f === "cont" && hasTiers(policy)) {   // política de reservas: quién puede liberar esta contingencia según el monto
    const need = requiredAuthority(o, policy), have = authLevelOf(o);
    if (!levelCovers(have, need))
      p.push("según la política de reservas del plan de riesgos, una orden de " + Math.round(a) + " con cargo a contingencia la autoriza el " + AUTH_LABEL[need as "pm"] + " (" + tiersText(policy as ReservePolicy, (n) => String(Math.round(n))) + ")"
        + (have ? "; la aprobación registrada es del " + AUTH_LABEL[have] : "; indica el nivel de autoridad con que se aprueba"));
  }
  if (f === "cont" && a > an.contingencyAvailable + 1e-9) p.push("excede la contingencia disponible (" + Math.round(an.contingencyAvailable) + ")");
  if (f === "mgmt" && a > an.mgmtAvailable + 1e-9) p.push("excede la reserva de gestión disponible (" + Math.round(an.mgmtAvailable) + ")");
  return p;
}

// Consumo por riesgo: qué se aprobó (y qué está pendiente) en órdenes vinculadas a cada riesgo del registro, y si eso
// supera el impacto máximo que el análisis del riesgo había previsto. Es la traza «contingencia → riesgo».
export interface RiskDrawdown {
  riskId: string; code: string; title: string; orphan: boolean;
  contingency: number; other: number; pending: number; orderIds: string[];
  plannedMax: number | null; over: boolean;
}
export function contingencyByRisk(orders: CoOrder[] | null | undefined, risks?: Array<RiskRef & { plannedMax?: number | null }> | null): RiskDrawdown[] {
  const by: Record<string, RiskDrawdown> = {};
  (orders || []).forEach((o) => {
    if (!o || !o.riskId) return;
    const ref = (risks || []).find((r) => r.id === o.riskId);
    const d = by[o.riskId] = by[o.riskId] || { riskId: o.riskId, code: ref ? ref.code : (o.riskCode || "?"), title: ref ? ref.title : "(riesgo eliminado del registro)", orphan: !ref, contingency: 0, other: 0, pending: 0, orderIds: [], plannedMax: ref && ref.plannedMax != null ? ref.plannedMax : null, over: false };
    d.orderIds.push(String(o.id || ""));
    const a = num(o.cost);
    if (o.status === "Aprobada") { if (fundOf(o) === "cont") d.contingency += a; else d.other += a; }
    else if (o.status === "Pendiente") d.pending += a;
  });
  return Object.keys(by).map((k) => { const d = by[k]; d.over = d.plannedMax !== null && d.contingency + d.other > d.plannedMax + 1e-9; return d; }).sort((a, b) => a.code.localeCompare(b.code));
}

// Incorporar a la línea base: solo órdenes APROBADAS que usan reserva de gestión o fondos
// adicionales (la contingencia ya está dentro de la línea base: su BAC no cambia).
// Devuelve la versión nueva (o el problema); no muta nada: quien llama la registra.
export function planBaselining(
  o: CoOrder, orders: CoOrder[], budget: Partial<CoBudget> | null | undefined, log: CoBaselineEntry[] | null | undefined, date: string
): { ok: true; entry: CoBaselineEntry } | { ok: false; problem: string } {
  if (o.status !== "Aprobada") return { ok: false, problem: "solo se incorpora a la línea base una orden Aprobada" };
  if (fundOf(o) === "cont") return { ok: false, problem: "una orden financiada con contingencia no cambia la línea base: la contingencia ya está dentro de ella" };
  if (o.baselined) return { ok: false, problem: "ya está incorporada a la línea base " + o.baselined };
  const a = num(o.cost); if (a <= 0) return { ok: false, problem: "el Δ costo debe ser mayor que cero para incorporarse a la línea base" };
  const before = analyzeChangeOrders(orders, budget).bacCurrent;
  return { ok: true, entry: { version: "LB-" + (((log || []).length) + 1), date, orderIds: [String(o.id || "")], bacBefore: before, bacAfter: before + a, approver: String(o.approver || "") } };
}
