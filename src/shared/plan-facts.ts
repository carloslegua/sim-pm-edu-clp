// Lectura (solo lectura) de lo que necesitan los planes de Comunicaciones, Calidad y Adquisiciones desde el proyecto activo — UNA sola
// fuente para los tres módulos y para el Plan para la Dirección (que los consolida): así lo que un módulo revisa y lo que el plan integrador
// resume no puede divergir. Se inlinea en cada IIFE; `GpiApi` es solo el tipo del núcleo (no se importa código de gpi-core, regla de la suite).
import type * as GpiCore from "../core/gpi-core";
import { inherentScore, isOpen, levelOf, normalizePlan as normalizeRiskPlan, normalizeRisk } from "./risk-analysis";
import { quadrantOf } from "./stakeholder-engagement";
import type { CommFacts } from "./comms-plan";
import { isBuy, normalizeProcurement, type ProcFacts } from "./procurement-plan";
import { normalizeQuality, type QualityFacts } from "./quality-plan";
import { coverage as validationCoverage, normalizeValidation, type SvFacts } from "./scope-validation";
import { normalizeKnowledge, type KFacts } from "./knowledge";
import { normalizeCr } from "./change-control";
import type { CloseFacts } from "./closeout";

type GpiApi = typeof GpiCore.GPI;
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };

export function gatherCommFacts(G: GpiApi): CommFacts {
  const sk = Array.isArray(rec(G.getModule("stakeholders")).stakeholders) ? (rec(G.getModule("stakeholders")).stakeholders as unknown[]).map(rec) : [];
  return {
    stakeholders: sk.map((s) => ({
      id: String(s.id), name: String(s.name || s.id), quadrant: quadrantOf(num(s.power), num(s.interest)),
      engCurrent: s.engCurrent === null || s.engCurrent === undefined ? null : num(s.engCurrent), engDesired: s.engDesired === null || s.engDesired === undefined ? null : num(s.engDesired)
    })),
    roles: Array.from(new Set(G.util.obsNodes(G.getModule("obs")).map((n) => (n.role || "").trim()).filter(Boolean)))
  };
}

// Riesgos ABIERTOS del Registro con su nivel inherente y tipo (los usan Calidad y Adquisiciones).
function openRisks(G: GpiApi): Array<{ id: string; code: string; title: string; wbsIds: string[]; high: boolean; threat: boolean }> {
  const rk = G.getModule("risks"), plan = normalizeRiskPlan(rk && rk.plan);
  return (rk && Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1))).filter(isOpen)
    .map((r) => ({ id: r.id, code: r.code, title: r.title, wbsIds: r.wbsIds, high: levelOf(inherentScore(r), plan) === "alto", threat: r.type === "amenaza" }));
}
function baseCostOf(G: GpiApi): number | null {
  const cost = G.getModule("cost"), b = cost && cost.budget, base = Number(b && (b.baseCost || (b.computed && b.computed.base))) || 0;
  return base > 0 ? base : null;
}
const rolesOf = (G: GpiApi): string[] => Array.from(new Set(G.util.obsNodes(G.getModule("obs")).map((n) => (n.role || "").trim()).filter(Boolean)));

export function gatherQualityFacts(G: GpiApi): QualityFacts {
  const wbs = G.util.effectiveWbs(), nodes = rec(wbs && wbs.nodes);
  return {
    leaves: G.util.wbsLeaves(wbs).map((l) => { const n = rec(nodes[l.id]); return { id: l.id, code: l.code, name: l.name, acceptance: String(n.acceptance || ""), loe: !!n.loe, cost: Number(n.cost) || 0 }; }),
    roles: rolesOf(G), highRiskLeafIds: Array.from(new Set(openRisks(G).filter((r) => r.high).flatMap((r) => r.wbsIds))), baseCost: baseCostOf(G)
  };
}

// No conformidades ABIERTAS del Plan de Calidad, por id de paquete (las usan Validar el Alcance y el Cierre).
function openNcrByLeaf(G: GpiApi): Record<string, { count: number; critical: number }> {
  const out: Record<string, { count: number; critical: number }> = {};
  normalizeQuality(G.getModule("quality")).ncrs.filter((n) => n.status !== "cerrada" && n.wbsId).forEach((n) => { const o = out[n.wbsId] || (out[n.wbsId] = { count: 0, critical: 0 }); o.count++; if (n.severity === "critica") o.critical++; });
  return out;
}
const deliverablesOf = (G: GpiApi): Array<{ id: string; code: string; name: string; criteria: string }> =>
  (Array.isArray(rec(G.getModule("scopeStatement")).deliverables) ? (rec(G.getModule("scopeStatement")).deliverables as unknown[]).map(rec) : []).map((d) => ({ id: String(d.id), code: String(d.code || ""), name: String(d.name || d.id), criteria: String(d.acceptanceCriteria || "") }));

export function gatherValidationFacts(G: GpiApi): SvFacts {
  const wbs = G.util.effectiveWbs(), nodes = rec(wbs && wbs.nodes), leavesOf: Record<string, string[]> = {};
  // paquetes (hojas) que cuelgan de cada elemento de la EDT vinculado a un entregable (delId)
  const leaves = (id: string): string[] => { const k = rec(nodes[id]).children; return Array.isArray(k) && k.length ? (k as string[]).flatMap(leaves) : [id]; };
  Object.keys(nodes).forEach((id) => { const d = String(rec(nodes[id]).delId || ""); if (d) leavesOf[d] = Array.from(new Set((leavesOf[d] || []).concat(leaves(id)))); });
  return { deliverables: deliverablesOf(G), leaves: G.util.wbsLeaves(wbs).map((l) => ({ id: l.id, code: l.code, name: l.name, acceptance: String(rec(nodes[l.id]).acceptance || "") })), roles: rolesOf(G), openNcr: openNcrByLeaf(G), leavesOf };
}
export function gatherKnowledgeFacts(G: GpiApi): KFacts {
  const rk = G.getModule("risks"), risks = (rk && Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1)));
  return { materialized: risks.filter((r) => r.status === "materializado").map((r) => ({ code: r.code, title: r.title })), riskCodes: risks.map((r) => r.code), leaves: G.util.wbsLeaves(G.util.effectiveWbs()).map((l) => ({ id: l.id, code: l.code, name: l.name })), roles: rolesOf(G) };
}
export function gatherCloseFacts(G: GpiApi): CloseFacts {
  const dels = deliverablesOf(G), val = normalizeValidation(G.getModule("scopeValidation")), cov = validationCoverage(val, { deliverables: dels, leaves: [], roles: [], openNcr: {} });
  const ncr = normalizeQuality(G.getModule("quality")).ncrs.filter((n) => n.status !== "cerrada"), proc = normalizeProcurement(G.getModule("procurement")), buys = proc.items.filter(isBuy);
  const lessons = normalizeKnowledge(G.getModule("knowledge")).lessons, crs = (Array.isArray(rec(G.getModule("changes")).requests) ? (rec(G.getModule("changes")).requests as unknown[]) : []).map((o, i) => normalizeCr(o, "cr" + (i + 1)));
  const cs = G.util.costSummary(G.getModule("cost"));
  return {
    deliverables: { total: dels.length, accepted: cov.filter((r) => r.state === "aceptado").length }, ncr: { open: ncr.length, critical: ncr.filter((n) => n.severity === "critica").length },
    contracts: { total: buys.length, notDelivered: buys.filter((i) => i.status !== "Entregada").length, claimsOpen: proc.admin.claims.filter((c) => c.status === "abierto").length },
    lessons: { total: lessons.length, transferred: lessons.filter((l) => l.status === "transferida").length }, changes: { open: crs.filter((c) => c.status === "Pendiente" || c.status === "Aprobada").length },
    bac: cs.hasData ? (cs.bacCurrent || cs.bac || null) : null, roles: rolesOf(G)
  };
}

export function gatherProcurementFacts(G: GpiApi): ProcFacts {
  const wbs = G.util.effectiveWbs(), nodes = rec(wbs && wbs.nodes), obs = G.util.obsNodes(G.getModule("obs")), sk = rec(G.getModule("stakeholders")).stakeholders;
  const cost = G.getModule("cost"), cl = Number(String(cost && cost.estimate && cost.estimate.class).replace(/\D/g, ""));
  return {
    leaves: G.util.wbsLeaves(wbs).map((l) => ({ id: l.id, code: l.code, name: l.name, cost: Number(rec(nodes[l.id]).cost) || 0 })),
    roles: rolesOf(G), risks: openRisks(G),
    suppliers: Array.from(new Set(obs.map((n) => (n.person || "").trim()).concat((Array.isArray(sk) ? sk : []).map((s) => String(rec(s).org || "").trim())).filter(Boolean))),
    estimateClass: cl >= 1 && cl <= 5 ? cl : null, baseCost: baseCostOf(G)
  };
}
