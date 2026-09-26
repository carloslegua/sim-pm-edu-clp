// Cierre del Proyecto o Fase (PMBOK: «Cerrar el proyecto o fase») — lógica PURA (sin DOM ni `localStorage`), inlineada en closeout.js. Las pruebas la importan directo.
//
// Qué es: la puerta de SALIDA. Cerrar no es un botón: es comprobar que todo lo que el proyecto prometió está hecho, aceptado, pagado, liberado y aprendido, y dejar quién lo aprueba. Este módulo NO captura de
// nuevo lo que ya viven en otras herramientas: LEE el estado de cada frente y dice si se puede cerrar —entregables aceptados (Validar el Alcance), no conformidades abiertas (Calidad), contratos entregados y
// reclamos abiertos (Adquisiciones), lecciones transferidas (Gestión del Conocimiento), cambios sin cerrar (Control de Cambios) y costo final contra el presupuesto (Costos)— y suma una lista de
// verificación propia (liberar recursos, archivar el dossier, cerrar contratos…) y el registro de la aprobación del cierre.
// Regla del módulo: se puede DECLARAR el cierre con pendientes, pero queda escrito como riesgo (un cierre con deuda). Cerrar una FASE exige nombrar la fase.
export const KINDS = ["proyecto", "fase"] as const;
export type CloseKind = typeof KINDS[number];
export const AREAS = ["Alcance", "Contratos", "Recursos", "Lecciones", "Finanzas", "Documentación", "Otro"] as const;
export const ITEM_STATUSES = ["pendiente", "hecho", "no_aplica"] as const;
export type ItemStatus = typeof ITEM_STATUSES[number];
export const ITEM_LABEL: Record<ItemStatus, string> = { pendiente: "Pendiente", hecho: "Hecho", no_aplica: "No aplica" };

export interface CloseItem { id: string; code: string; area: string; what: string; owner: string; dueDate: string; status: ItemStatus; doneOn: string; evidence: string; }
export interface Closure { closed: boolean; closedOn: string; approvedBy: string; report: string; finalCost: number | null; outcome: string; }
export interface CloseoutData { kind: CloseKind; phase: string; items: CloseItem[]; closure: Closure; asOf: string; idCounter: number; }

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const rec = (o: unknown): Record<string, unknown> => (o && typeof o === "object" ? (o as Record<string, unknown>) : {});
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return isFinite(n) ? n : null; };
export const iso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
export function normalizeItem(o: unknown, fb: string): CloseItem {
  const x = rec(o), id = str(x.id) || fb;
  return { id, code: str(x.code) || id, area: str(x.area), what: str(x.what), owner: str(x.owner), dueDate: str(x.dueDate), status: (ITEM_STATUSES.indexOf(x.status as ItemStatus) >= 0 ? x.status : "pendiente") as ItemStatus, doneOn: str(x.doneOn), evidence: str(x.evidence) };
}
export function normalizeCloseout(raw: unknown): CloseoutData {
  const x = rec(raw), c = rec(x.closure), items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem(o, "ci" + (i + 1)));
  return { kind: (KINDS.indexOf(x.kind as CloseKind) >= 0 ? x.kind : "proyecto") as CloseKind, phase: str(x.phase), items,
    closure: { closed: c.closed === true, closedOn: str(c.closedOn), approvedBy: str(c.approvedBy), report: str(c.report), finalCost: numOrNull(c.finalCost), outcome: str(c.outcome) },
    asOf: iso(str(x.asOf)) ? str(x.asOf) : "", idCounter: Number(x.idCounter) || items.length + 1 };
}
export const blankCloseout = (): CloseoutData => normalizeCloseout(null);
export function nextCode(items: Array<{ code: string }>): string { let max = 0; items.forEach((c) => { const m = /(\d+)\s*$/.exec(c.code); if (m) max = Math.max(max, Number(m[1])); }); return "CI-" + String(max + 1).padStart(2, "0"); }
export const asOfOf = (d: CloseoutData, today: string): string => (iso(d.asOf) ? d.asOf : today);

// ---- lo que se lee de las demás herramientas (solo lectura) ----
export interface CloseFacts {
  deliverables: { total: number; accepted: number };
  ncr: { open: number; critical: number };
  contracts: { total: number; notDelivered: number; claimsOpen: number };
  lessons: { total: number; transferred: number };
  changes: { open: number };
  bac: number | null;                 // presupuesto vigente contra el que se compara el costo final
  roles: string[];
}
export const emptyFacts = (): CloseFacts => ({ deliverables: { total: 0, accepted: 0 }, ncr: { open: 0, critical: 0 }, contracts: { total: 0, notDelivered: 0, claimsOpen: 0 }, lessons: { total: 0, transferred: 0 }, changes: { open: 0 }, bac: null, roles: [] });

// Comprobaciones automáticas: ok = true (cumple), false (falta) o null (no hay datos para juzgar).
export interface AutoCheck { key: string; label: string; ok: boolean | null; detail: string; file: string; }
export function autoChecks(d: CloseoutData, f: CloseFacts): AutoCheck[] {
  const dl = f.deliverables, fc = d.closure.finalCost;
  return [
    { key: "entregables", label: "Entregables aceptados por el cliente", ok: dl.total ? dl.accepted === dl.total : null, detail: dl.total ? dl.accepted + " de " + dl.total + " entregables aceptados" : "sin entregables o sin validaciones registradas", file: "Validar_Alcance.html" },
    { key: "calidad", label: "Sin no conformidades abiertas", ok: f.ncr.open === 0, detail: f.ncr.open ? f.ncr.open + " abierta(s)" + (f.ncr.critical ? " (" + f.ncr.critical + " crítica(s))" : "") : "ninguna abierta", file: "Plan_Calidad.html" },
    { key: "contratos", label: "Contratos entregados y sin reclamos abiertos", ok: f.contracts.total ? f.contracts.notDelivered === 0 && f.contracts.claimsOpen === 0 : null, detail: f.contracts.total ? f.contracts.notDelivered + " adquisición(es) sin entregar · " + f.contracts.claimsOpen + " reclamo(s) abierto(s)" : "sin adquisiciones", file: "Plan_Adquisiciones.html" },
    { key: "lecciones", label: "Lecciones aprendidas transferidas", ok: f.lessons.total ? f.lessons.transferred === f.lessons.total : null, detail: f.lessons.total ? f.lessons.transferred + " de " + f.lessons.total + " transferidas" : "sin lecciones registradas", file: "Gestion_Conocimiento.html" },
    { key: "cambios", label: "Solicitudes de cambio cerradas", ok: f.changes.open === 0, detail: f.changes.open ? f.changes.open + " pendiente(s) o aprobada(s) sin implementar" : "ninguna abierta", file: "Control_Cambios.html" },
    { key: "costo", label: "Costo final registrado y dentro del presupuesto", ok: fc === null ? false : f.bac !== null && f.bac > 0 ? fc <= f.bac + 0.5 : null, detail: fc === null ? "falta registrar el costo final" : f.bac !== null && f.bac > 0 ? "costo final " + Math.round(fc).toLocaleString("es-PE") + " frente al presupuesto vigente " + Math.round(f.bac).toLocaleString("es-PE") : "sin presupuesto contra el cual comparar", file: "Cost-management.html" },
    { key: "lista", label: "Lista de verificación del cierre completa", ok: d.items.length ? d.items.every((i) => i.status !== "pendiente") : null, detail: d.items.length ? d.items.filter((i) => i.status === "pendiente").length + " ítem(s) pendiente(s) de " + d.items.length : "sin ítems", file: "" }
  ];
}
export function pendingChecks(d: CloseoutData, f: CloseFacts): AutoCheck[] { return autoChecks(d, f).filter((c) => c.ok === false); }

export interface CFinding { code: string; severity: "riesgo" | "aviso" | "info"; itemId: string | null; text: string; }
export function closeoutFindings(d: CloseoutData, f: CloseFacts, today0 = ""): CFinding[] {
  const today = asOfOf(d, today0), out: CFinding[] = [], F = (code: string, severity: CFinding["severity"], itemId: string | null, text: string): void => { out.push({ code, severity, itemId, text }); };
  const cl = d.closure, roles = new Set(f.roles.map((r) => r.toLowerCase())), pend = pendingChecks(d, f);
  d.items.forEach((i) => {
    const w = i.code + (i.what.trim() ? " «" + i.what.trim().slice(0, 50) + "»" : "");
    if (i.status === "pendiente") {
      if (!i.owner.trim() || !iso(i.dueDate)) F("C3", "aviso", i.id, w + ": pendiente sin " + [!i.owner.trim() ? "responsable" : "", !iso(i.dueDate) ? "fecha límite" : ""].filter(Boolean).join(" ni ") + ": nadie sabe quién lo cierra ni para cuándo.");
      else if (iso(today) && i.dueDate < today) F("C3", "aviso", i.id, w + ": venció el " + i.dueDate + " y sigue pendiente.");
    }
    if (i.status === "hecho" && (!iso(i.doneOn) || !i.evidence.trim())) F("C5", "info", i.id, w + ": marcado hecho sin " + (!iso(i.doneOn) ? "fecha" : "evidencia") + ": el cierre necesita dejar constancia.");
    if (i.owner.trim() && roles.size && !roles.has(i.owner.trim().toLowerCase())) F("C6", "info", i.id, w + ": el responsable «" + i.owner + "» no figura entre los puestos del OBS.");
  });
  if (d.kind === "fase" && !d.phase.trim()) F("C4", "aviso", null, "Se cierra una FASE y no se indica cuál: el cierre de una fase necesita nombrarla.");
  if (cl.closed) {
    if (pend.length) F("C1", "riesgo", null, "Se declaró el cierre con " + pend.length + " frente(s) sin resolver — " + pend.map((p) => p.label.toLowerCase() + " (" + p.detail + ")").join("; ") + ": un cierre con deuda traslada al cliente y a la organización lo que el proyecto no terminó.");
    if (!cl.approvedBy.trim() || !iso(cl.closedOn)) F("C2", "aviso", null, "El cierre está declarado sin " + [!cl.approvedBy.trim() ? "quién lo aprueba" : "", !iso(cl.closedOn) ? "fecha" : ""].filter(Boolean).join(" ni ") + ".");
    if (!cl.report.trim()) F("C2", "aviso", null, "El cierre está declarado sin informe final (resultados contra los objetivos del Acta, costo final, lecciones y entrega).");
    if (!cl.outcome.trim()) F("C5", "info", null, "El cierre no evalúa el resultado contra los objetivos y criterios de éxito del Acta de Constitución.");
  } else if (d.items.length || cl.finalCost !== null) {
    if (pend.length && iso(today) && d.items.length) F("C7", "info", null, "Para poder cerrar faltan " + pend.length + " frente(s): " + pend.map((p) => p.label.toLowerCase()).join("; ") + ".");
  }
  if (cl.finalCost !== null && f.bac !== null && f.bac > 0 && cl.finalCost > f.bac + 0.5) F("C8", "aviso", null, "El costo final (" + Math.round(cl.finalCost).toLocaleString("es-PE") + ") supera el presupuesto vigente (" + Math.round(f.bac).toLocaleString("es-PE") + ") en " + Math.round((cl.finalCost / f.bac - 1) * 1000) / 10 + " %: documenta la causa en el informe final.");
  return out;
}
export type CloseState = "vacio" | "verde" | "ambar" | "rojo";
export function closeState(d: CloseoutData, f: CloseFacts, today = ""): CloseState {
  if (!d.items.length && !d.closure.closed && d.closure.finalCost === null) return "vacio";
  const fs = closeoutFindings(d, f, today);
  return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
}
