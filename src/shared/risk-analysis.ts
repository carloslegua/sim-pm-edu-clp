// Registro de riesgos: escalas, puntaje, valor esperado, riesgo residual, hallazgos de
// coherencia y matriz probabilidad × impacto -- lógica PURA compartida en tiempo de
// COMPILACIÓN (Vite la inlinea en risks.js).
//
// Base metodológica:
//  · PMI / PMBOK -- Gestión de los riesgos: enunciado causa–evento–efecto; RBS (categorías);
//    matriz probabilidad–impacto con umbrales del PLAN; puntaje = probabilidad × impacto (se
//    toma el mayor impacto entre los objetivos); urgencia/proximidad; propietario del riesgo;
//    estrategias distintas para AMENAZAS (escalar, evitar, transferir, mitigar, aceptar) y
//    OPORTUNIDADES (escalar, explotar, compartir, mejorar, aceptar); disparador de la
//    respuesta contingente; riesgo RESIDUAL y secundario; monitoreo periódico.
//  · AACE International -- terminología de la RP 10S-90 (riesgo = eventos discretos;
//    incertidumbre = variabilidad del estimado, que ya cubre el análisis de rangos de Costos)
//    y método del VALOR ESPERADO de la RP 44R-08: EV = probabilidad × impacto esperado, con el
//    impacto dado por un RANGO de tres puntos (mínimo / más probable / máximo; media de la
//    triangular). La contingencia se determina sobre la exposición que QUEDA tras la respuesta.
// (Los números de RP se citan de memoria: confirmarlos contra la lista vigente de AACE.)

export type RiskType = "amenaza" | "oportunidad";
export type RiskStatus = "identificado" | "analizado" | "con_respuesta" | "monitoreo" | "materializado" | "cerrado";
export const RISK_STATUSES: RiskStatus[] = ["identificado", "analizado", "con_respuesta", "monitoreo", "materializado", "cerrado"];
export const STATUS_LABEL: Record<RiskStatus, string> = {
  identificado: "Identificado", analizado: "Analizado", con_respuesta: "Con respuesta", monitoreo: "En monitoreo", materializado: "Materializado", cerrado: "Cerrado"
};
export const THREAT_STRATEGIES = ["escalar", "evitar", "transferir", "mitigar", "aceptar"];
export const OPPORTUNITY_STRATEGIES = ["escalar", "explotar", "compartir", "mejorar", "aceptar"];
export const STRATEGY_HINT: Record<string, string> = {
  escalar: "Fuera de la autoridad del proyecto: se lleva al nivel que corresponde (sponsor, programa, organización).",
  evitar: "Eliminar la amenaza o su causa (cambiar el plan, el alcance o la secuencia).",
  transferir: "Trasladar el impacto a un tercero (seguro, garantía, contrato a precio fijo); no elimina el riesgo.",
  mitigar: "Reducir la probabilidad o el impacto antes de que ocurra.",
  aceptar: "No se actúa de forma proactiva; la aceptación ACTIVA prevé contingencia y un plan si ocurre.",
  explotar: "Asegurar que la oportunidad ocurra (probabilidad 100 %).",
  compartir: "Asociarse con un tercero mejor situado para capturarla.",
  mejorar: "Aumentar la probabilidad o el impacto positivo."
};
export const PROXIMITY = ["inmediata", "corta", "media", "larga"];
export const PROXIMITY_LABEL: Record<string, string> = { inmediata: "Inmediata (< 1 mes)", corta: "Corta (1–3 meses)", media: "Media (3–6 meses)", larga: "Larga (> 6 meses)" };
export const PROB_LABELS = ["Muy baja", "Baja", "Media", "Alta", "Muy alta"];
export const IMPACT_LABELS = ["Muy bajo", "Bajo", "Medio", "Alto", "Muy alto"];

export interface Range3 { low: number | null; likely: number | null; high: number | null; }
export interface Risk {
  id: string; code: string; title: string;
  cause: string; event: string; effect: string;             // enunciado causa–evento–efecto
  type: RiskType; category: string; wbsIds: string[]; owner: string;
  proximity: string; identifiedOn: string; reviewedOn: string; status: RiskStatus;
  // análisis ANTES de la respuesta
  prob: number | null; impCost: number | null; impTime: number | null; impScope: number | null;
  probPct: number | null; costImpact: Range3; timeImpact: Range3;
  // respuesta
  strategy: string; response: string; trigger: string; responseOwner: string; responseCost: number | null; secondary: string;
  // riesgo RESIDUAL (después de la respuesta)
  resProb: number | null; resImpCost: number | null; resImpTime: number | null; resImpScope: number | null;
  resProbPct: number | null; resCostImpact: Range3; resTimeImpact: Range3;
  // materialización
  materializedOn: string; actualCost: number | null; actualDelay: number | null;
  notes: string;
}

export interface RiskPlan {
  probPct: number[];            // probabilidad representativa (%) de cada nivel 1..5, creciente
  costBandsPct: number[];       // cotas superiores (% del costo base) de los niveles 1..4; por encima = 5
  timeBandsDays: number[];      // cotas superiores (días laborables) de los niveles 1..4
  scopeDescriptors: string[];   // descripción de los 5 niveles de impacto en alcance / calidad
  thresholdMedium: number; thresholdHigh: number;   // puntaje P×I desde el que el riesgo es medio / alto
  reviewDays: number;           // cada cuántos días se revisa un riesgo abierto
  categories: string[];         // RBS de primer nivel
  methodology: string; reservePolicy: string; roles: string;
}
export const DEFAULT_PLAN: RiskPlan = {
  probPct: [10, 30, 50, 70, 90],
  costBandsPct: [1, 3, 5, 10],
  timeBandsDays: [5, 15, 30, 60],
  scopeDescriptors: [
    "Cambio apenas perceptible", "Áreas menores del alcance afectadas", "Áreas importantes del alcance afectadas",
    "Reducción inaceptable para el patrocinador", "El entregable final es inservible"
  ],
  thresholdMedium: 6, thresholdHigh: 15, reviewDays: 30,
  categories: ["Técnico", "Externo", "Organizacional", "Gestión del proyecto"],
  methodology: "", reservePolicy: "", roles: ""
};

const isNum = (v: unknown): v is number => typeof v === "number" && isFinite(v);
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
  return isNum(n) ? n : null;
}
export function toLevel(v: unknown): number | null { const n = toNum(v); return n !== null && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; }
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const arrNum = (v: unknown, def: number[]): number[] => (Array.isArray(v) && v.length === def.length && v.every((x) => toNum(x) !== null) ? v.map((x) => toNum(x) as number) : def.slice());

export function normalizePlan(p: unknown): RiskPlan {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  const cats = Array.isArray(o.categories) ? o.categories.map(str).map((s) => s.trim()).filter(Boolean) : [];
  return {
    probPct: arrNum(o.probPct, DEFAULT_PLAN.probPct), costBandsPct: arrNum(o.costBandsPct, DEFAULT_PLAN.costBandsPct), timeBandsDays: arrNum(o.timeBandsDays, DEFAULT_PLAN.timeBandsDays),
    scopeDescriptors: Array.isArray(o.scopeDescriptors) && o.scopeDescriptors.length === 5 ? o.scopeDescriptors.map(str) : DEFAULT_PLAN.scopeDescriptors.slice(),
    thresholdMedium: toNum(o.thresholdMedium) ?? DEFAULT_PLAN.thresholdMedium, thresholdHigh: toNum(o.thresholdHigh) ?? DEFAULT_PLAN.thresholdHigh,
    reviewDays: toNum(o.reviewDays) ?? DEFAULT_PLAN.reviewDays, categories: cats.length ? cats : DEFAULT_PLAN.categories.slice(),
    methodology: str(o.methodology), reservePolicy: str(o.reservePolicy), roles: str(o.roles)
  };
}
// El plan solo tiene sentido si sus escalas son crecientes y sus umbrales coherentes.
export function validatePlan(p: RiskPlan): string[] {
  const out: string[] = [];
  const inc = (a: number[], strict = true): boolean => a.every((x, i) => i === 0 || (strict ? x > a[i - 1] : x >= a[i - 1]));
  if (!p.probPct.every((x) => x >= 0 && x <= 100) || !inc(p.probPct)) out.push("las probabilidades por nivel deben estar entre 0 y 100 y crecer de un nivel al siguiente");
  if (!p.costBandsPct.every((x) => x > 0) || !inc(p.costBandsPct)) out.push("las cotas de impacto en costo (% del costo base) deben ser positivas y crecientes");
  if (!p.timeBandsDays.every((x) => x > 0) || !inc(p.timeBandsDays)) out.push("las cotas de impacto en plazo (días) deben ser positivas y crecientes");
  if (!(p.thresholdMedium >= 1) || !(p.thresholdHigh <= 25) || !(p.thresholdMedium < p.thresholdHigh)) out.push("los umbrales de puntaje deben cumplir 1 ≤ medio < alto ≤ 25");
  if (!(p.reviewDays >= 1)) out.push("la frecuencia de revisión debe ser de al menos 1 día");
  if (new Set(p.categories.map((c) => c.toLowerCase())).size !== p.categories.length) out.push("las categorías de la RBS no pueden repetirse");
  return out;
}

// ---- niveles a partir de valores cuantificados (contraste cualitativo ↔ cuantitativo) ----
function bandLevel(v: number, bands: number[]): number { let l = 1; for (const b of bands) { if (v > b) l++; else break; } return l; }
export function costLevel(amount: number | null, costBase: number, p: RiskPlan): number | null {
  if (amount === null || !(costBase > 0)) return null;
  return bandLevel(Math.abs(amount) / costBase * 100, p.costBandsPct);
}
export function timeLevel(days: number | null, p: RiskPlan): number | null { return days === null ? null : bandLevel(Math.abs(days), p.timeBandsDays); }

// ---- puntaje y nivel ----
export function maxImpact(c: number | null, t: number | null, s: number | null): number | null {
  const v = [c, t, s].filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
}
export function riskScore(prob: number | null, c: number | null, t: number | null, s: number | null): number | null {
  const i = maxImpact(c, t, s);
  return prob !== null && i !== null ? prob * i : null;
}
export type RiskLevel = "alto" | "medio" | "bajo";
export function levelOf(score: number | null, p: RiskPlan): RiskLevel | null {
  if (score === null) return null;
  return score >= p.thresholdHigh ? "alto" : score >= p.thresholdMedium ? "medio" : "bajo";
}
export const inherentScore = (r: Risk): number | null => riskScore(r.prob, r.impCost, r.impTime, r.impScope);

// ---- valor esperado (AACE 44R-08) ----
export function rangeProblems(rg: Range3, label: string): string[] {
  const out: string[] = [];
  const v = [rg.low, rg.likely, rg.high];
  if (v.some((x) => x !== null && x < 0)) out.push(label + ": los valores no pueden ser negativos (se registra la magnitud)");
  if (rg.low !== null && rg.likely !== null && rg.low > rg.likely) out.push(label + ": el mínimo supera al más probable");
  if (rg.likely !== null && rg.high !== null && rg.likely > rg.high) out.push(label + ": el más probable supera al máximo");
  if (rg.low !== null && rg.high !== null && rg.low > rg.high) out.push(label + ": el mínimo supera al máximo");
  return out;
}
// Impacto esperado: media de la triangular con los tres puntos; con solo el más probable, ese valor.
export function impactMean(rg: Range3): number | null {
  if (rangeProblems(rg, "").length) return null;
  if (rg.low !== null && rg.likely !== null && rg.high !== null) return (rg.low + rg.likely + rg.high) / 3;
  return rg.likely;
}
// Probabilidad efectiva (0..1): la cuantificada si existe, si no la del nivel del plan.
export function probEffective(pct: number | null, level: number | null, p: RiskPlan): number | null {
  if (pct !== null && pct >= 0 && pct <= 100) return pct / 100;
  return level !== null ? p.probPct[level - 1] / 100 : null;
}
export interface EV { cost: number | null; time: number | null; }
function ev(pct: number | null, level: number | null, cost: Range3, time: Range3, p: RiskPlan): EV {
  const pr = probEffective(pct, level, p), c = impactMean(cost), t = impactMean(time);
  return { cost: pr !== null && c !== null ? pr * c : null, time: pr !== null && t !== null ? pr * t : null };
}
export const inherentEV = (r: Risk, p: RiskPlan): EV => ev(r.probPct, r.prob, r.costImpact, r.timeImpact, p);

// Riesgo RESIDUAL: lo que queda después de la respuesta. Aceptar = no hay respuesta que lo reduzca, así que
// el residual ES el inherente. Sin estrategia, o con una respuesta aún sin evaluar su residual, no está evaluado.
export interface Residual { assessed: boolean; derived: boolean; prob: number | null; impCost: number | null; impTime: number | null; impScope: number | null; ev: EV; score: number | null; }
export function residualOf(r: Risk, p: RiskPlan): Residual {
  if (r.strategy === "aceptar") {
    return { assessed: r.prob !== null, derived: true, prob: r.prob, impCost: r.impCost, impTime: r.impTime, impScope: r.impScope, ev: inherentEV(r, p), score: inherentScore(r) };
  }
  const has = r.resProb !== null || r.resImpCost !== null || r.resImpTime !== null || r.resImpScope !== null;
  const prob = r.resProb;
  return {
    assessed: has && prob !== null, derived: false, prob, impCost: r.resImpCost, impTime: r.resImpTime, impScope: r.resImpScope,
    ev: ev(r.resProbPct, r.resProb, r.resCostImpact, r.resTimeImpact, p), score: riskScore(prob, r.resImpCost, r.resImpTime, r.resImpScope)
  };
}

// ---- normalización (datos importados / guardados antes) ----
function range(o: unknown): Range3 {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  return { low: toNum(x.low), likely: toNum(x.likely), high: toNum(x.high) };
}
export function normalizeRisk(o: unknown, fallbackId: string): Risk {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  const type: RiskType = x.type === "oportunidad" ? "oportunidad" : "amenaza";
  const status = RISK_STATUSES.indexOf(x.status as RiskStatus) >= 0 ? (x.status as RiskStatus) : "identificado";
  const id = str(x.id) || fallbackId;
  return {
    id, code: str(x.code) || id, title: str(x.title), cause: str(x.cause), event: str(x.event), effect: str(x.effect),
    type, category: str(x.category), wbsIds: Array.isArray(x.wbsIds) ? x.wbsIds.map(str).filter(Boolean) : [], owner: str(x.owner),
    proximity: PROXIMITY.indexOf(str(x.proximity)) >= 0 ? str(x.proximity) : "", identifiedOn: str(x.identifiedOn), reviewedOn: str(x.reviewedOn), status,
    prob: toLevel(x.prob), impCost: toLevel(x.impCost), impTime: toLevel(x.impTime), impScope: toLevel(x.impScope),
    probPct: toNum(x.probPct), costImpact: range(x.costImpact), timeImpact: range(x.timeImpact),
    strategy: str(x.strategy), response: str(x.response), trigger: str(x.trigger), responseOwner: str(x.responseOwner), responseCost: toNum(x.responseCost), secondary: str(x.secondary),
    resProb: toLevel(x.resProb), resImpCost: toLevel(x.resImpCost), resImpTime: toLevel(x.resImpTime), resImpScope: toLevel(x.resImpScope),
    resProbPct: toNum(x.resProbPct), resCostImpact: range(x.resCostImpact), resTimeImpact: range(x.resTimeImpact),
    materializedOn: str(x.materializedOn), actualCost: toNum(x.actualCost), actualDelay: toNum(x.actualDelay), notes: str(x.notes)
  };
}
export function blankRisk(id: string, code: string, type: RiskType = "amenaza"): Risk {
  return normalizeRisk({ id, code, type }, id);
}
export const strategiesFor = (t: RiskType): string[] => (t === "oportunidad" ? OPPORTUNITY_STRATEGIES : THREAT_STRATEGIES);
export const isOpen = (r: Risk): boolean => r.status !== "materializado" && r.status !== "cerrado";

// ---- hallazgos de coherencia (orientan la revisión; no impiden guardar) ----
export type Severity = "riesgo" | "aviso" | "info";
export interface Finding { code: string; severity: Severity; text: string; }
export interface FindingOpts { today?: string; costBase?: number; leafIds?: string[]; }
function daysBetween(a: string, b: string): number | null {
  const x = Date.parse(a + "T12:00:00Z"), y = Date.parse(b + "T12:00:00Z");
  return isFinite(x) && isFinite(y) ? Math.round((y - x) / 86400000) : null;
}
export function riskFindings(r: Risk, p: RiskPlan, o?: FindingOpts): Finding[] {
  const out: Finding[] = [], opts = o || {}, F = (code: string, severity: Severity, text: string) => out.push({ code, severity, text });
  const sc = inherentScore(r), lv = levelOf(sc, p), open = isOpen(r);
  if (!r.title.trim()) F("R0", "aviso", "Falta un título corto que identifique el riesgo.");
  if (!r.cause.trim() || !r.event.trim() || !r.effect.trim()) F("R1", "aviso", "El enunciado está incompleto: un riesgo se describe como causa → evento → efecto (Debido a…, puede ocurrir…, lo que causaría…).");
  if (!r.owner.trim()) F("R2", lv === "alto" ? "riesgo" : "aviso", "No tiene propietario del riesgo asignado.");
  if (RISK_STATUSES.indexOf(r.status) < 0) return out;
  if (r.strategy && strategiesFor(r.type).indexOf(r.strategy) < 0) F("R6", "riesgo", "La estrategia «" + r.strategy + "» no corresponde a " + (r.type === "amenaza" ? "una amenaza" : "una oportunidad") + ".");
  if (sc === null) { if (open) F("R3", "info", "Sin analizar: falta la probabilidad o el impacto."); }
  else {
    if (open && (lv === "alto" || lv === "medio") && !r.strategy) F("R4", lv === "alto" ? "riesgo" : "aviso", "Riesgo " + lv + " sin estrategia de respuesta.");
    if (open && r.type === "amenaza" && lv === "alto" && r.strategy === "aceptar") F("R5", "aviso", "Aceptar una amenaza alta requiere aceptación ACTIVA: justificarla, prever contingencia y un plan si ocurre.");
    if (open && r.strategy && r.strategy !== "aceptar") {
      const res = residualOf(r, p);
      if (!res.assessed) F("R8", "info", "Hay una respuesta pero no se evaluó el riesgo residual (cuánto queda después de aplicarla).");
      else if (r.type === "amenaza" && res.score !== null && res.score > sc) F("R7", "aviso", "El riesgo residual (" + res.score + ") supera al inherente (" + sc + "): una respuesta no debería empeorarlo (¿riesgo secundario?).");
      if (!r.responseOwner.trim() && lv !== "bajo") F("R14", "aviso", "La respuesta no tiene un responsable de ejecutarla.");
    }
    if (open && r.impCost !== null && r.impCost >= 3 && impactMean(r.costImpact) === null) F("R10", "aviso", "Impacto en costo " + r.impCost + " sin cuantificar: sin un rango de costo no hay valor esperado ni base para la contingencia.");
    if (r.impCost !== null && opts.costBase && impactMean(r.costImpact) !== null) {
      const impl = costLevel(r.costImpact.likely, opts.costBase, p);
      if (impl !== null && Math.abs(impl - r.impCost) >= 2) F("R11", "aviso", "El nivel de impacto en costo (" + r.impCost + ") no concuerda con el valor cuantificado, que según las escalas del plan equivale al nivel " + impl + ".");
    }
    if (r.impTime !== null && impactMean(r.timeImpact) !== null) {
      const impl = timeLevel(r.timeImpact.likely, p);
      if (impl !== null && Math.abs(impl - r.impTime) >= 2) F("R11", "aviso", "El nivel de impacto en plazo (" + r.impTime + ") no concuerda con el valor cuantificado, que según las escalas del plan equivale al nivel " + impl + ".");
    }
    if (r.probPct !== null && r.prob !== null) {
      const rep = p.probPct[r.prob - 1], half = (p.probPct[Math.min(4, r.prob)] - p.probPct[Math.max(0, r.prob - 2)]) / 2 || 20;
      if (Math.abs(r.probPct - rep) > half + 1e-9) F("R16", "aviso", "La probabilidad cuantificada (" + r.probPct + " %) no corresponde al nivel " + r.prob + " del plan (≈ " + rep + " %).");
    }
  }
  rangeProblems(r.costImpact, "Impacto en costo").concat(rangeProblems(r.timeImpact, "Impacto en plazo")).concat(rangeProblems(r.resCostImpact, "Costo residual")).concat(rangeProblems(r.resTimeImpact, "Plazo residual")).forEach((t) => F("R15", "riesgo", t));
  if (open && !r.wbsIds.length) F("R9", "info", "No indica los paquetes de la EDT que afectaría.");
  if (opts.leafIds && r.wbsIds.some((id) => opts.leafIds!.indexOf(id) < 0)) F("R9", "info", "Referencia paquetes que ya no existen en la EDT.");
  if (open && opts.today && r.reviewedOn) { const n = daysBetween(r.reviewedOn, opts.today); if (n !== null && n > p.reviewDays) F("R12", "info", "Sin revisar hace " + n + " días (el plan pide revisarlo cada " + p.reviewDays + ")."); }
  if (r.status === "materializado" && r.actualCost === null && r.actualDelay === null) F("R13", "aviso", "Materializado sin registrar su impacto real (costo o plazo): es lo que alimenta el consumo de contingencia y las lecciones aprendidas.");
  return out;
}

// ---- matriz probabilidad × impacto ----
export interface MatrixCell { prob: number; imp: number; score: number; level: RiskLevel; ids: string[]; }
// 5×5: filas de probabilidad 5 (arriba) a 1, columnas de impacto 1 a 5. `which` elige el análisis antes o después de la respuesta.
export function buildMatrix(risks: Risk[], type: RiskType, which: "inherent" | "residual", p: RiskPlan): MatrixCell[][] {
  const grid: MatrixCell[][] = [];
  for (let pr = 5; pr >= 1; pr--) { const row: MatrixCell[] = []; for (let im = 1; im <= 5; im++) { const s = pr * im; row.push({ prob: pr, imp: im, score: s, level: levelOf(s, p) as RiskLevel, ids: [] }); } grid.push(row); }
  risks.filter((r) => r.type === type && isOpen(r)).forEach((r) => {
    let prob: number | null, imp: number | null;
    if (which === "inherent") { prob = r.prob; imp = maxImpact(r.impCost, r.impTime, r.impScope); }
    else { const s = residualOf(r, p); if (!s.assessed) return; prob = s.prob; imp = maxImpact(s.impCost, s.impTime, s.impScope); }
    if (prob === null || imp === null) return;
    grid[5 - prob][imp - 1].ids.push(r.id);
  });
  return grid;
}

// ---- cartera de riesgos ----
export interface Portfolio {
  total: number; open: number; threats: number; opportunities: number; materialized: number; closed: number;
  byLevel: Record<RiskLevel | "sin", number>; residualByLevel: Record<RiskLevel | "sin", number>;
  byCategory: Array<{ category: string; count: number; evCost: number }>;
  evThreatCost: number; evOpportunityCost: number; netEvCost: number;
  resEvThreatCost: number; resEvOpportunityCost: number; netResEvCost: number;
  evThreatDays: number; actualCost: number;
  coverage: { withOwner: number; withResponse: number; withWbs: number; analyzed: number; quantified: number; openCount: number };
}
export function portfolio(risks: Risk[], p: RiskPlan): Portfolio {
  const pf: Portfolio = {
    total: risks.length, open: 0, threats: 0, opportunities: 0, materialized: 0, closed: 0,
    byLevel: { alto: 0, medio: 0, bajo: 0, sin: 0 }, residualByLevel: { alto: 0, medio: 0, bajo: 0, sin: 0 }, byCategory: [],
    evThreatCost: 0, evOpportunityCost: 0, netEvCost: 0, resEvThreatCost: 0, resEvOpportunityCost: 0, netResEvCost: 0, evThreatDays: 0, actualCost: 0,
    coverage: { withOwner: 0, withResponse: 0, withWbs: 0, analyzed: 0, quantified: 0, openCount: 0 }
  };
  const cat: Record<string, { count: number; evCost: number }> = {};
  risks.forEach((r) => {
    if (r.status === "materializado") { pf.materialized++; pf.actualCost += r.actualCost || 0; }
    if (r.status === "cerrado") pf.closed++;
    if (r.type === "amenaza") pf.threats++; else pf.opportunities++;
    if (!isOpen(r)) return;
    pf.open++; pf.coverage.openCount++;
    const lv = levelOf(inherentScore(r), p);
    pf.byLevel[lv || "sin"]++;
    const res = residualOf(r, p);
    pf.residualByLevel[res.assessed ? (levelOf(res.score, p) || "sin") : "sin"]++;
    if (r.owner.trim()) pf.coverage.withOwner++;
    if (r.strategy) pf.coverage.withResponse++;
    if (r.wbsIds.length) pf.coverage.withWbs++;
    if (lv) pf.coverage.analyzed++;
    const e = inherentEV(r, p);
    if (e.cost !== null) pf.coverage.quantified++;
    const k = r.category.trim() || "Sin categoría";
    cat[k] = cat[k] || { count: 0, evCost: 0 }; cat[k].count++;
    if (e.cost !== null) { cat[k].evCost += r.type === "amenaza" ? e.cost : -e.cost; }
    if (r.type === "amenaza") { pf.evThreatCost += e.cost || 0; pf.evThreatDays += e.time || 0; pf.resEvThreatCost += res.assessed ? (res.ev.cost || 0) : 0; }
    else { pf.evOpportunityCost += e.cost || 0; pf.resEvOpportunityCost += res.assessed ? (res.ev.cost || 0) : 0; }
  });
  pf.netEvCost = pf.evThreatCost - pf.evOpportunityCost;
  pf.netResEvCost = pf.resEvThreatCost - pf.resEvOpportunityCost;
  pf.byCategory = Object.keys(cat).map((k) => ({ category: k, count: cat[k].count, evCost: cat[k].evCost })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return pf;
}
// Orden de atención: mayor puntaje primero; a igual puntaje, la proximidad más cercana.
export function rankRisks(risks: Risk[], _plan: RiskPlan): Risk[] { // el plan no interviene en el orden (los puntajes ya son 1–25); se conserva en la firma por simetría
  const prox = (r: Risk): number => { const i = PROXIMITY.indexOf(r.proximity); return i < 0 ? 9 : i; };
  return risks.filter(isOpen).filter((r) => inherentScore(r) !== null).sort((a, b) => (inherentScore(b) as number) - (inherentScore(a) as number) || prox(a) - prox(b) || a.code.localeCompare(b.code));
}
export function nextCode(risks: Risk[]): string {
  let max = 0; risks.forEach((r) => { const m = /(\d+)\s*$/.exec(r.code); if (m) max = Math.max(max, Number(m[1])); });
  return "R-" + String(max + 1).padStart(2, "0");
}
