// Lectura (solo lectura) de lo que necesitan los planes de Comunicaciones, Calidad y Adquisiciones desde el proyecto activo — UNA sola
// fuente para los tres módulos y para el Plan para la Dirección (que los consolida): así lo que un módulo revisa y lo que el plan integrador
// resume no puede divergir. Se inlinea en cada IIFE; `GpiApi` es solo el tipo del núcleo (no se importa código de gpi-core, regla de la suite).
import type * as GpiCore from "../core/gpi-core";
import { inherentScore, isOpen, levelOf, normalizePlan as normalizeRiskPlan, normalizeRisk } from "./risk-analysis";
import { quadrantOf } from "./stakeholder-engagement";
import type { CommFacts } from "./comms-plan";
import type { ProcFacts } from "./procurement-plan";
import type { QualityFacts } from "./quality-plan";

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
