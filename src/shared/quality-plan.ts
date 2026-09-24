// Plan de gestión de la calidad (PMBOK: «Planificar la gestión de la calidad») — lógica PURA (sin DOM ni `localStorage`), inlineada en
// quality.js. Las pruebas la importan directo.
//
// Qué es: (1) la política y las normas aplicables, (2) las MÉTRICAS de calidad (qué se mide, objetivo y tolerancia), (3) el plan de
// ASEGURAMIENTO (prevenir: revisiones de diseño, auditorías de proceso) y de CONTROL (detectar: inspecciones, ensayos, pruebas) por paquete
// de trabajo, y (4) el COSTO DE LA CALIDAD (conformidad: prevención + evaluación; no conformidad: fallas internas + externas). No duplica el
// criterio de aceptación de cada paquete: lo LEE del Diccionario de la EDT y comprueba que exista cómo verificarlo (cada paquete con criterio
// de aceptación necesita una actividad de control), con más urgencia si el paquete tiene un riesgo alto abierto. Los umbrales de los hallazgos
// son criterio didáctico declarado (no una norma); las normas y valores del ejemplo son ilustrativos y deben verificarse contra la vigente.

export const CHECK_KINDS = ["Aseguramiento", "Control"] as const;
export const QUALITY_METHODS = ["Revisión de documentos", "Inspección visual", "Medición", "Ensayo de laboratorio", "Prueba funcional", "Auditoría"] as const;
export type CoqCat = "prevencion" | "evaluacion" | "falla_interna" | "falla_externa";
export const COQ_CATS: CoqCat[] = ["prevencion", "evaluacion", "falla_interna", "falla_externa"];
export const COQ_LABEL: Record<CoqCat, string> = { prevencion: "Prevención", evaluacion: "Evaluación", falla_interna: "Fallas internas", falla_externa: "Fallas externas" };
export const COQ_GROUP: Record<CoqCat, "conformidad" | "no_conformidad"> = { prevencion: "conformidad", evaluacion: "conformidad", falla_interna: "no_conformidad", falla_externa: "no_conformidad" };

export interface QMetric { id: string; code: string; name: string; wbsIds: string[]; definition: string; target: string; tolerance: string; method: string; frequency: string; owner: string; }
export interface QCheck { id: string; code: string; wbsId: string; what: string; criterion: string; kind: string; method: string; frequency: string; owner: string; record: string; metricId: string; }
export interface CoqItem { id: string; cat: CoqCat; description: string; amount: number | null; }
export interface QualityData { policy: string; standards: string; metrics: QMetric[]; checks: QCheck[]; coq: CoqItem[]; idCounter: number; }

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return isFinite(n) ? n : null; };
const rec = (o: unknown): Record<string, unknown> => (o && typeof o === "object" ? (o as Record<string, unknown>) : {});
export function normalizeMetric(o: unknown, fb: string): QMetric { const x = rec(o), id = str(x.id) || fb; return { id, code: str(x.code) || id, name: str(x.name), wbsIds: strs(x.wbsIds), definition: str(x.definition), target: str(x.target), tolerance: str(x.tolerance), method: str(x.method), frequency: str(x.frequency), owner: str(x.owner) }; }
export function normalizeCheck(o: unknown, fb: string): QCheck { const x = rec(o), id = str(x.id) || fb; return { id, code: str(x.code) || id, wbsId: str(x.wbsId), what: str(x.what), criterion: str(x.criterion), kind: str(x.kind), method: str(x.method), frequency: str(x.frequency), owner: str(x.owner), record: str(x.record), metricId: str(x.metricId) }; }
export function normalizeCoq(o: unknown, fb: string): CoqItem { const x = rec(o); return { id: str(x.id) || fb, cat: (COQ_CATS.indexOf(x.cat as CoqCat) >= 0 ? x.cat : "prevencion") as CoqCat, description: str(x.description), amount: numOrNull(x.amount) }; }
export function normalizeQuality(raw: unknown): QualityData {
  const x = rec(raw), metrics = (Array.isArray(x.metrics) ? x.metrics : []).map((o, i) => normalizeMetric(o, "qm" + (i + 1))), checks = (Array.isArray(x.checks) ? x.checks : []).map((o, i) => normalizeCheck(o, "qc" + (i + 1)));
  const coq = (Array.isArray(x.coq) ? x.coq : []).map((o, i) => normalizeCoq(o, "cq" + (i + 1)));
  return { policy: str(x.policy), standards: str(x.standards), metrics, checks, coq, idCounter: Number(x.idCounter) || metrics.length + checks.length + coq.length + 1 };
}
export const blankQuality = (): QualityData => normalizeQuality(null);
function nextOf(items: Array<{ code: string }>, prefix: string): string { let max = 0; items.forEach((c) => { const m = /(\d+)\s*$/.exec(c.code); if (m) max = Math.max(max, Number(m[1])); }); return prefix + String(max + 1).padStart(2, "0"); }
export const nextMetricCode = (m: QMetric[]): string => nextOf(m, "QM-");
export const nextCheckCode = (c: QCheck[]): string => nextOf(c, "QC-");

// ---- lo que se lee de la EDT, del OBS, de Riesgos y de Costos (solo lectura) ----
export interface QLeaf { id: string; code: string; name: string; acceptance: string; loe: boolean; cost: number; }
export interface QualityFacts { leaves: QLeaf[]; roles: string[]; highRiskLeafIds: string[]; baseCost: number | null; }

// ---- costo de la calidad ----
export interface CoqSummary { byCat: Record<CoqCat, number>; conformity: number; nonConformity: number; total: number; pctOfBase: number | null; failureShare: number | null; }
export function coqSummary(coq: CoqItem[], baseCost: number | null): CoqSummary {
  const byCat: Record<CoqCat, number> = { prevencion: 0, evaluacion: 0, falla_interna: 0, falla_externa: 0 };
  coq.forEach((c) => { byCat[c.cat] += c.amount || 0; });
  const conformity = byCat.prevencion + byCat.evaluacion, nonConformity = byCat.falla_interna + byCat.falla_externa, total = conformity + nonConformity;
  return { byCat, conformity, nonConformity, total, pctOfBase: baseCost && baseCost > 0 ? total / baseCost * 100 : null, failureShare: total > 0 ? nonConformity / total * 100 : null };
}

// ---- cobertura: cada paquete con criterio de aceptación necesita cómo verificarlo ----
export interface CoverageRow { leaf: QLeaf; checks: QCheck[]; needs: boolean; highRisk: boolean; }
export function coverage(d: QualityData, f: QualityFacts): CoverageRow[] {
  const hr = new Set(f.highRiskLeafIds);
  return f.leaves.map((l) => ({ leaf: l, checks: d.checks.filter((c) => c.wbsId === l.id), needs: !l.loe && !!l.acceptance.trim(), highRisk: hr.has(l.id) }));
}

export interface QFinding { code: string; severity: "riesgo" | "aviso" | "info"; text: string; }
export function qualityFindings(d: QualityData, f: QualityFacts): QFinding[] {
  const out: QFinding[] = [], F = (code: string, severity: QFinding["severity"], text: string): void => { out.push({ code, severity, text }); };
  const leafBy = new Map(f.leaves.map((l) => [l.id, l] as const)), roles = new Set(f.roles.map((r) => r.toLowerCase())), anything = d.checks.length || d.metrics.length || d.coq.length;
  if (!anything) return out;
  const cov = coverage(d, f), needing = cov.filter((r) => r.needs);
  needing.filter((r) => !r.checks.length).forEach((r) => {
    if (r.highRisk) F("Q2", "riesgo", "El paquete " + r.leaf.code + " «" + r.leaf.name + "» tiene un riesgo alto abierto y ninguna actividad de control o aseguramiento: nada verifica su criterio de aceptación.");
    else F("Q1", "aviso", "El paquete " + r.leaf.code + " «" + r.leaf.name + "» tiene criterio de aceptación («" + r.leaf.acceptance.trim().slice(0, 70) + (r.leaf.acceptance.trim().length > 70 ? "…" : "") + "») pero ninguna actividad que lo verifique.");
  });
  d.checks.forEach((c) => {
    const w = c.code + (c.what.trim() ? " «" + c.what.trim() + "»" : "");
    if (!c.wbsId || !leafBy.has(c.wbsId)) F("Q8", "aviso", w + ": no apunta a un paquete de trabajo de la EDT" + (c.wbsId ? " (el paquete ya no existe)" : "") + ".");
    if (!c.what.trim() || !c.criterion.trim() || !c.method || !c.frequency.trim() || !c.owner.trim()) F("Q4", "aviso", w + ": incompleta (falta qué se verifica, el criterio, el método, la frecuencia o el responsable).");
    else if (roles.size && !roles.has(c.owner.trim().toLowerCase())) F("Q6", "info", w + ": el responsable «" + c.owner + "» no figura entre los puestos del OBS.");
    if (!c.record.trim()) F("Q5", "info", w + ": no dice qué registro deja (informe de ensayo, protocolo, acta): sin registro no hay evidencia de conformidad.");
    if (c.metricId && !d.metrics.some((m) => m.id === c.metricId)) F("Q8", "aviso", w + ": apunta a una métrica que ya no existe.");
  });
  d.metrics.forEach((m) => {
    const w = m.code + (m.name.trim() ? " «" + m.name.trim() + "»" : "");
    if (!m.name.trim() || !m.target.trim() || !m.method) F("Q7", "aviso", w + ": una métrica necesita nombre, objetivo medible y método de medición.");
    if (!d.checks.some((c) => c.metricId === m.id)) F("Q7", "info", w + ": ninguna actividad de control la usa: no se está midiendo.");
  });
  if (d.checks.length && !d.checks.some((c) => c.kind === "Aseguramiento")) F("Q9", "info", "Todo el plan es control (detectar defectos): falta aseguramiento de la calidad (prevenir: revisiones de diseño, auditorías del proceso).");
  if (d.checks.length && !d.policy.trim()) F("Q11", "info", "El plan no declara la política de calidad del proyecto.");
  if (d.checks.length && !d.standards.trim()) F("Q11", "info", "El plan no lista las normas y especificaciones que definen la conformidad.");
  const s = coqSummary(d.coq, f.baseCost);
  if (d.checks.length && !d.coq.length) F("Q10", "aviso", "El plan de control y aseguramiento no tiene costo de la calidad: no se sabe cuánto cuesta prevenir y evaluar ni cuánto se reserva por fallas.");
  if (d.coq.length && s.byCat.prevencion <= 0) F("Q10", "aviso", "El costo de la calidad no invierte nada en prevención: es lo que más barato evita fallas (evaluar solo detecta el defecto ya hecho).");
  if (d.coq.length && s.failureShare !== null && s.failureShare > 50) F("Q10", "aviso", "Más de la mitad del costo de la calidad (" + Math.round(s.failureShare) + " %) es por fallas: el plan gasta más en corregir que en prevenir y evaluar.");
  if (d.coq.some((c) => c.amount === null)) F("Q10", "info", "Hay partidas del costo de la calidad sin monto.");
  return out;
}
export type QualityState = "vacio" | "verde" | "ambar" | "rojo";
export function qualityState(d: QualityData, f: QualityFacts): QualityState {
  if (!(d.checks.length || d.metrics.length || d.coq.length)) return "vacio";
  const fs = qualityFindings(d, f);
  return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
}
