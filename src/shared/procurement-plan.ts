// Plan de gestión de las adquisiciones (PMBOK: «Planificar la gestión de las adquisiciones») — lógica PURA (sin DOM ni `localStorage`),
// inlineada en procurement.js. Las pruebas la importan directo.
//
// Qué es: la ESTRATEGIA (cómo se contrata y cómo se mide al proveedor) y una fila por PAQUETE DE ADQUISICIÓN: qué paquetes de la EDT cubre,
// la decisión hacer o comprar, el tipo de contrato, cómo se selecciona (con criterios ponderados), el valor estimado, cuándo se necesita, el
// plazo del proveedor, quién lo gestiona y en qué estado va. La fecha que importa es la FECHA LÍMITE DE CONVOCATORIA:
//   fecha límite = fecha requerida − plazo del proveedor − tiempo de selección (convocar, evaluar y adjudicar)
// si esa fecha ya pasó y la adquisición sigue «Planificada», el cronograma no se sostiene. El módulo no duplica: los paquetes y su costo salen
// de la EDT, los riesgos de Riesgos (un contrato es una respuesta al riesgo: transferirlo o mitigarlo), los responsables del OBS y la clase del
// estimado de Costos (un precio fijo exige alcance bien definido). Los umbrales (10 % de diferencia con la EDT, 30 días de aviso) son criterio
// didáctico declarado, no una norma.

export const DECISIONS = ["Comprar", "Hacer (recursos propios)", "Alquilar o arrendar"] as const;
export const CONTRACT_TYPES = ["Precio fijo (FFP)", "Precio fijo con ajuste económico (FPEPA)", "Precio unitario", "Tiempo y materiales (T&M)", "Costo reembolsable (CPFF)", "Costo reembolsable con incentivos (CPIF)"] as const;
export const SELECTION_METHODS = ["Licitación abierta", "Invitación restringida", "Concurso de precios", "Concurso por calidad y costo", "Adjudicación directa"] as const;
export const STATUSES = ["Planificada", "Convocada", "Adjudicada", "Contratada", "Entregada"] as const;
const STATUS_RANK: Record<string, number> = { Planificada: 0, Convocada: 1, Adjudicada: 2, Contratada: 3, Entregada: 4 };
export const FIXED_PRICE = ["Precio fijo (FFP)", "Precio fijo con ajuste económico (FPEPA)"];
export const WARN_DAYS = 30, EDT_TOLERANCE_PCT = 10;

export interface Criterion { name: string; weight: number | null; }
export interface ProcItem {
  id: string; code: string; name: string; wbsIds: string[]; full: boolean;   // full: el contrato cubre TODO el costo de esos paquetes
  decision: string; contractType: string; selection: string; criteria: Criterion[];
  value: number | null; needDate: string; leadDays: number | null; selectionDays: number | null;
  supplier: string; status: string; owner: string; awardDate: string; riskIds: string[]; notes: string;
}
export interface ProcData { strategy: string; performance: string; approvals: string; asOf: string; items: ProcItem[]; idCounter: number; }

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return isFinite(n) ? n : null; };
const rec = (o: unknown): Record<string, unknown> => (o && typeof o === "object" ? (o as Record<string, unknown>) : {});
const iso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
export function normalizeItem(o: unknown, fb: string): ProcItem {
  const x = rec(o), id = str(x.id) || fb;
  return {
    id, code: str(x.code) || id, name: str(x.name), wbsIds: strs(x.wbsIds), full: x.full === false ? false : true,
    decision: str(x.decision), contractType: str(x.contractType), selection: str(x.selection),
    criteria: (Array.isArray(x.criteria) ? x.criteria : []).map((c) => { const q = rec(c); return { name: str(q.name), weight: numOrNull(q.weight) }; }),
    value: numOrNull(x.value), needDate: str(x.needDate), leadDays: numOrNull(x.leadDays), selectionDays: numOrNull(x.selectionDays),
    supplier: str(x.supplier), status: STATUS_RANK[str(x.status)] !== undefined ? str(x.status) : "Planificada", owner: str(x.owner), awardDate: str(x.awardDate), riskIds: strs(x.riskIds), notes: str(x.notes)
  };
}
export function normalizeProcurement(raw: unknown, today = ""): ProcData {
  const x = rec(raw), items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem(o, "pr" + (i + 1)));
  return { strategy: str(x.strategy), performance: str(x.performance), approvals: str(x.approvals), asOf: iso(str(x.asOf)) ? str(x.asOf) : today, items, idCounter: Number(x.idCounter) || items.length + 1 };
}
export const blankProcurement = (today = ""): ProcData => normalizeProcurement(null, today);
export function nextCode(items: ProcItem[]): string { let max = 0; items.forEach((c) => { const m = /(\d+)\s*$/.exec(c.code); if (m) max = Math.max(max, Number(m[1])); }); return "PR-" + String(max + 1).padStart(2, "0"); }

// ---- fechas ----
const day = (s: string): number => Date.parse(s + "T12:00:00Z");
export const addDays = (s: string, n: number): string => new Date(day(s) + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string): number | null => (iso(a) && iso(b) ? Math.round((day(b) - day(a)) / 86400000) : null);
// Fecha límite para lanzar la convocatoria; null si falta la fecha requerida o algún plazo.
export function launchBy(it: ProcItem): string | null {
  if (!iso(it.needDate) || it.leadDays === null || it.selectionDays === null) return null;
  return addDays(it.needDate, -(it.leadDays + it.selectionDays));
}
export const isBuy = (it: ProcItem): boolean => it.decision !== "Hacer (recursos propios)";

// ---- lo que se lee de la EDT, del OBS, de Riesgos y de Costos (solo lectura) ----
export interface ProcLeaf { id: string; code: string; name: string; cost: number; }
// Riesgos ABIERTOS del Registro: `high` = nivel alto y `threat` = amenaza (solo esos obligan a citarse; una oportunidad o un riesgo menor puede citarse).
export interface ProcRisk { id: string; code: string; title: string; wbsIds: string[]; high: boolean; threat: boolean; }
export interface ProcFacts { leaves: ProcLeaf[]; roles: string[]; risks: ProcRisk[]; suppliers: string[]; estimateClass: number | null; baseCost: number | null; }

export const criteriaSum = (it: ProcItem): number => it.criteria.reduce((s, c) => s + (c.weight || 0), 0);
export interface ProcSummary { total: number; count: number; byStatus: Record<string, number>; pctOfBase: number | null; late: number; soon: number; }
export function summary(d: ProcData, f: ProcFacts): ProcSummary {
  const byStatus: Record<string, number> = {}; STATUSES.forEach((s) => { byStatus[s] = 0; });
  let total = 0, late = 0, soon = 0;
  d.items.forEach((it) => {
    byStatus[it.status]++; total += it.value || 0;
    const lb = launchBy(it), left = lb ? daysBetween(d.asOf, lb) : null;
    if (it.status === "Planificada" && left !== null) { if (left < 0) late++; else if (left <= WARN_DAYS) soon++; }
  });
  return { total, count: d.items.length, byStatus, pctOfBase: f.baseCost && f.baseCost > 0 ? total / f.baseCost * 100 : null, late, soon };
}

export interface PFinding { code: string; severity: "riesgo" | "aviso" | "info"; itemId: string | null; text: string; }
export function procurementFindings(d: ProcData, f: ProcFacts): PFinding[] {
  const out: PFinding[] = [], F = (code: string, severity: PFinding["severity"], itemId: string | null, text: string): void => { out.push({ code, severity, itemId, text }); };
  const roles = new Set(f.roles.map((r) => r.toLowerCase())), leafBy = new Map(f.leaves.map((l) => [l.id, l] as const)), sup = new Set(f.suppliers.map((s) => s.toLowerCase()));
  d.items.forEach((it) => {
    const w = it.code + (it.name.trim() ? " «" + it.name.trim() + "»" : ""), buy = isBuy(it), rank = STATUS_RANK[it.status];
    if (!it.name.trim() || !it.decision) F("P2", "aviso", it.id, w + ": falta el nombre o la decisión hacer o comprar.");
    if (it.wbsIds.some((i) => !leafBy.has(i)) && f.leaves.length) F("P2", "aviso", it.id, w + ": apunta a un paquete de la EDT que ya no existe.");
    if (!it.wbsIds.length) F("P2", "info", it.id, w + ": no dice qué paquetes de la EDT cubre.");
    if (!it.owner.trim()) F("P10", "aviso", it.id, w + ": no tiene responsable de la adquisición.");
    else if (roles.size && !roles.has(it.owner.trim().toLowerCase())) F("P10", "info", it.id, w + ": el responsable «" + it.owner + "» no figura entre los puestos del OBS.");
    if (!buy) return;                                   // hacer con recursos propios: no hay contrato, selección ni proveedor
    // fecha límite de convocatoria
    const lb = launchBy(it);
    if (lb === null) F("P3", "aviso", it.id, w + ": sin fecha requerida o sin plazos (del proveedor y de selección) no se puede calcular cuándo convocar.");
    else if (it.status === "Planificada") {
      const left = daysBetween(d.asOf, lb) as number;
      if (left < 0) F("P1", "riesgo", it.id, w + ": la convocatoria debió lanzarse el " + lb + " (hace " + (-left) + " días respecto de la fecha de corte " + d.asOf + ") para tener el suministro el " + it.needDate + " y sigue «Planificada»: la fecha de necesidad ya no se sostiene.");
      else if (left <= WARN_DAYS) F("P1", "info", it.id, w + ": la convocatoria debe lanzarse antes del " + lb + " (" + left + " días desde la fecha de corte).");
    }
    // contrato y selección
    if (!it.contractType) F("P4", "aviso", it.id, w + ": falta el tipo de contrato.");
    else if (FIXED_PRICE.indexOf(it.contractType) >= 0 && f.estimateClass !== null && f.estimateClass >= 4) F("P4", "aviso", it.id, w + ": un contrato de precio fijo traslada el riesgo de costo al proveedor y exige un alcance bien definido; el estimado del proyecto es de clase " + f.estimateClass + " (definición insuficiente): el proveedor lo cotizará con un sobreprecio o reclamará después.");
    if (!it.selection) F("P5", "aviso", it.id, w + ": falta el método de selección del proveedor.");
    else if (it.selection === "Adjudicación directa") F("P5", "info", it.id, w + ": adjudicación directa: deja escrita la justificación (proveedor único, urgencia, monto menor) en las notas.");
    else {
      const sum = criteriaSum(it);
      if (!it.criteria.length) F("P5", "aviso", it.id, w + ": no define los criterios de selección con su peso.");
      else if (Math.abs(sum - 100) > 0.001 || it.criteria.some((c) => !c.name.trim() || c.weight === null)) F("P5", "aviso", it.id, w + ": los criterios de selección deben tener nombre y peso, y sumar 100 (suman " + Math.round(sum * 100) / 100 + ").");
      else if (it.criteria.length < 3) F("P5", "info", it.id, w + ": solo " + it.criteria.length + " criterio(s): la selección se apoya en algo más que el precio (capacidad técnica, plazo, experiencia).");
    }
    // valor contra la EDT
    const leaves = it.wbsIds.map((i) => leafBy.get(i)).filter((l): l is ProcLeaf => !!l), edt = leaves.reduce((s, l) => s + l.cost, 0);
    if (it.value === null) F("P6", "aviso", it.id, w + ": falta el valor estimado.");
    else if (it.full && edt > 0 && Math.abs(it.value - edt) / edt * 100 > EDT_TOLERANCE_PCT) F("P6", "aviso", it.id, w + ": el valor estimado (" + Math.round(it.value).toLocaleString("es-PE") + ") difiere más de " + EDT_TOLERANCE_PCT + " % del costo de los paquetes que cubre en la EDT (" + Math.round(edt).toLocaleString("es-PE") + "): concilia el presupuesto con el contrato.");
    // estado
    if (rank >= STATUS_RANK.Adjudicada && (!it.supplier.trim() || !iso(it.awardDate))) F("P7", "aviso", it.id, w + ": está «" + it.status + "» pero no registra el proveedor o la fecha de adjudicación.");
    else if (it.supplier.trim() && sup.size && !sup.has(it.supplier.trim().toLowerCase())) F("P12", "info", it.id, w + ": el proveedor «" + it.supplier + "» no figura en el OBS ni entre los interesados: regístralo para gestionar su compromiso.");
    // riesgos: un contrato es una respuesta al riesgo
    const cited = new Set(it.riskIds);
    f.risks.filter((r) => r.high && r.threat && r.wbsIds.some((i) => it.wbsIds.indexOf(i) >= 0) && !cited.has(r.id)).forEach((r) => F("P8", "info", it.id, w + ": el riesgo alto " + r.code + " «" + r.title + "» afecta sus paquetes y no lo cita: define si el contrato lo transfiere, lo mitiga o lo acepta."));
    if (it.riskIds.some((i) => !f.risks.some((r) => r.id === i)) && f.risks.length) F("P8", "info", it.id, w + ": cita un riesgo que ya no está abierto en el Registro de Riesgos.");
  });
  if (d.items.length && !d.strategy.trim()) F("P13", "info", null, "El plan no declara la estrategia de adquisiciones (qué se compra, qué se hace, cómo se contrata en general).");
  if (d.items.length && !d.performance.trim()) F("P13", "info", null, "El plan no dice cómo se mide y se gestiona el desempeño de los proveedores (entregas, calidad, plazos).");
  if (d.items.length && !d.approvals.trim()) F("P13", "info", null, "El plan no dice quién autoriza contratar y hasta qué monto.");
  return out;
}
export type ProcState = "vacio" | "verde" | "ambar" | "rojo";
export function procurementState(d: ProcData, f: ProcFacts): ProcState {
  if (!d.items.length) return "vacio";
  const fs = procurementFindings(d, f);
  return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
}
