// Validar el Alcance (PMBOK: «Validar el alcance») — lógica PURA (sin DOM ni `localStorage`), inlineada en scope-validation.js. Las pruebas la importan directo.
//
// Qué es: la ACEPTACIÓN FORMAL de los entregables terminados por quien los recibe (cliente, patrocinador, gerencia de operaciones). Se distingue de «Controlar la calidad»: la calidad verifica que el
// entregable es CORRECTO (Plan de Calidad); la validación lo hace ACEPTAR. Cada entregable del Enunciado del Alcance necesita su aceptación, contra el criterio con el que se definió, con evidencia
// (acta o protocolo) y con quien la firma. No duplica: los entregables y sus criterios se LEEN del Enunciado del Alcance, los paquetes que los componen se eligen de la EDT (con su diccionario) y las no
// conformidades abiertas salen del Plan de Calidad: aceptar un entregable con defectos abiertos es lo que este módulo señala.
// Umbrales didácticos DECLARADOS (no una norma): una validación presentada y sin decisión se avisa a los 15 días de la fecha de corte.
export const DECISIONS = ["pendiente", "aceptado", "aceptado_con_observaciones", "rechazado"] as const;
export type Decision = typeof DECISIONS[number];
export const DECISION_LABEL: Record<Decision, string> = { pendiente: "Pendiente", aceptado: "Aceptado", aceptado_con_observaciones: "Aceptado con observaciones", rechazado: "Rechazado" };
export const UNDECIDED_DAYS = 15;

export interface Acceptance {
  id: string; code: string; delivId: string; wbsIds: string[]; presentedOn: string; presentedBy: string; reviewer: string;
  criteria: string; evidence: string; decision: Decision; decidedOn: string; observations: string;
}
export interface ScopeValidationData { records: Acceptance[]; asOf: string; idCounter: number; }   // asOf = fecha de corte del seguimiento (vacía = hoy)

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const rec = (o: unknown): Record<string, unknown> => (o && typeof o === "object" ? (o as Record<string, unknown>) : {});
export const iso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
export function normalizeAcceptance(o: unknown, fb: string): Acceptance {
  const x = rec(o), id = str(x.id) || fb;
  return { id, code: str(x.code) || id, delivId: str(x.delivId), wbsIds: strs(x.wbsIds), presentedOn: str(x.presentedOn), presentedBy: str(x.presentedBy), reviewer: str(x.reviewer), criteria: str(x.criteria), evidence: str(x.evidence),
    decision: (DECISIONS.indexOf(x.decision as Decision) >= 0 ? x.decision : "pendiente") as Decision, decidedOn: str(x.decidedOn), observations: str(x.observations) };
}
export function normalizeValidation(raw: unknown): ScopeValidationData {
  const x = rec(raw), records = (Array.isArray(x.records) ? x.records : []).map((o, i) => normalizeAcceptance(o, "va" + (i + 1)));
  return { records, asOf: iso(str(x.asOf)) ? str(x.asOf) : "", idCounter: Number(x.idCounter) || records.length + 1 };
}
export const blankValidation = (): ScopeValidationData => normalizeValidation(null);
export function nextCode(items: Array<{ code: string }>): string { let max = 0; items.forEach((c) => { const m = /(\d+)\s*$/.exec(c.code); if (m) max = Math.max(max, Number(m[1])); }); return "VA-" + String(max + 1).padStart(2, "0"); }
export const asOfOf = (d: ScopeValidationData, today: string): string => (iso(d.asOf) ? d.asOf : today);
const gap = (a: string, b: string): number => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);   // b − a

// ---- lo que se lee del Enunciado del Alcance, de la EDT, del Plan de Calidad y del OBS (solo lectura) ----
export interface SvDeliverable { id: string; code: string; name: string; criteria: string; }
export interface SvLeaf { id: string; code: string; name: string; acceptance: string; }
// openNcr: no conformidades abiertas por id de paquete; leavesOf: paquetes de la EDT que responden a cada entregable (por id de entregable), para «↧ Paquetes del entregable».
export interface SvFacts { deliverables: SvDeliverable[]; leaves: SvLeaf[]; roles: string[]; openNcr: Record<string, { count: number; critical: number }>; leavesOf?: Record<string, string[]>; }

// ---- cobertura: cada entregable del Enunciado necesita su aceptación ----
export type CoverageState = "sin_validacion" | "pendiente" | "aceptado" | "rechazado";
export interface CoverageRow { deliverable: SvDeliverable; records: Acceptance[]; state: CoverageState; }
export function coverage(d: ScopeValidationData, f: SvFacts): CoverageRow[] {
  return f.deliverables.map((dv) => {
    const rs = d.records.filter((r) => r.delivId === dv.id), state: CoverageState = !rs.length ? "sin_validacion" : rs.some((r) => r.decision === "aceptado" || r.decision === "aceptado_con_observaciones") ? "aceptado" : rs.some((r) => r.decision === "rechazado") ? "rechazado" : "pendiente";
    return { deliverable: dv, records: rs, state };
  });
}
export interface ValidationSummary { deliverables: number; accepted: number; pending: number; rejected: number; uncovered: number; }
export function summary(d: ScopeValidationData, f: SvFacts): ValidationSummary {
  const c = coverage(d, f);
  return { deliverables: f.deliverables.length, accepted: c.filter((r) => r.state === "aceptado").length, pending: c.filter((r) => r.state === "pendiente").length, rejected: c.filter((r) => r.state === "rechazado").length, uncovered: c.filter((r) => r.state === "sin_validacion").length };
}

export interface VFinding { code: string; severity: "riesgo" | "aviso" | "info"; recordId: string | null; text: string; }
export function validationFindings(d: ScopeValidationData, f: SvFacts, today0 = ""): VFinding[] {
  const today = asOfOf(d, today0), out: VFinding[] = [], F = (code: string, severity: VFinding["severity"], recordId: string | null, text: string): void => { out.push({ code, severity, recordId, text }); };
  if (!d.records.length) return out;
  const delBy = new Map(f.deliverables.map((x) => [x.id, x] as const)), leafBy = new Map(f.leaves.map((l) => [l.id, l] as const)), roles = new Set(f.roles.map((r) => r.toLowerCase()));
  d.records.forEach((r) => {
    const dv = delBy.get(r.delivId), w = r.code + (dv ? " «" + dv.name + "»" : ""), accepted = r.decision === "aceptado" || r.decision === "aceptado_con_observaciones";
    if (!dv) F("V6", "aviso", r.id, r.code + ": no corresponde a ningún entregable del Enunciado del Alcance" + (r.delivId ? " (el entregable ya no existe)" : "") + ": no hay contra qué criterio aceptarlo.");
    if (accepted) {
      if (!r.evidence.trim() || !r.reviewer.trim() || !iso(r.decidedOn)) F("V2", "aviso", r.id, w + ": está aceptado sin " + [!r.reviewer.trim() ? "quién lo acepta" : "", !iso(r.decidedOn) ? "fecha de la decisión" : "", !r.evidence.trim() ? "evidencia (acta o protocolo firmado)" : ""].filter(Boolean).join(", ") + ": una aceptación sin firma ni fecha no es formal.");
      const ncr = r.wbsIds.reduce((s, id) => ({ count: s.count + ((f.openNcr[id] || { count: 0 }).count), critical: s.critical + ((f.openNcr[id] || { critical: 0 }).critical) }), { count: 0, critical: 0 });
      if (ncr.count > 0) F("V1", ncr.critical > 0 ? "riesgo" : "aviso", r.id, w + ": se aceptó con " + ncr.count + " no conformidad(es) ABIERTA(S) en sus paquetes" + (ncr.critical ? " (" + ncr.critical + " crítica(s))" : "") + ": aceptar un entregable con defectos sin cerrar traslada el problema al cliente o a la garantía.");
    }
    if ((r.decision === "rechazado" || r.decision === "aceptado_con_observaciones") && !r.observations.trim()) F("V3", "aviso", r.id, w + ": está «" + DECISION_LABEL[r.decision].toLowerCase() + "» y no dice por qué: las observaciones son lo que el equipo debe corregir.");
    if (dv && dv.criteria.trim() && r.criteria.trim() && r.criteria.trim() !== dv.criteria.trim()) F("V4", "aviso", r.id, w + ": el criterio con que se validó difiere del criterio vigente del Enunciado del Alcance: se acepta contra otra vara.");
    else if (dv && dv.criteria.trim() && !r.criteria.trim() && (accepted || r.decision === "rechazado")) F("V4", "info", r.id, w + ": no copia el criterio de aceptación del Enunciado (puedes traerlo con «↧ Tomar del Enunciado»).");
    if (r.decision === "pendiente" && iso(r.presentedOn) && iso(today) && gap(r.presentedOn, today) > UNDECIDED_DAYS) F("V8", "aviso", r.id, w + ": presentado el " + r.presentedOn + " y sin decisión hace " + gap(r.presentedOn, today) + " días (más de " + UNDECIDED_DAYS + " a la fecha de corte " + today + "): una validación que no se decide retrasa la aceptación del proyecto.");
    if (r.wbsIds.some((id) => !leafBy.has(id)) && f.leaves.length) F("V6", "aviso", r.id, w + ": apunta a un paquete de la EDT que ya no existe.");
    if (accepted && !r.wbsIds.length) F("V5", "info", r.id, w + ": no dice qué paquetes de la EDT cubre: no se puede comprobar que estén cerrados.");
    if (accepted && r.reviewer.trim() && roles.size && !roles.has(r.reviewer.trim().toLowerCase())) F("V7", "info", r.id, w + ": quien lo acepta («" + r.reviewer + "») no figura entre los puestos del OBS.");
  });
  const unc = coverage(d, f).filter((r) => r.state === "sin_validacion");
  if (unc.length) F("V5", "info", null, unc.length + " entregable(s) del Enunciado sin ninguna validación registrada: " + unc.slice(0, 4).map((r) => r.deliverable.name).join("; ") + (unc.length > 4 ? "…" : "") + ".");
  return out;
}
export type ValidationState = "vacio" | "verde" | "ambar" | "rojo";
export function validationState(d: ScopeValidationData, f: SvFacts, today = ""): ValidationState {
  if (!d.records.length) return "vacio";
  const fs = validationFindings(d, f, today);
  return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
}
