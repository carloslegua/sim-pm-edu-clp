// Línea base del ALCANCE: enunciado + EDT + diccionario de la EDT, versionados JUNTOS — lógica PURA (sin DOM ni `localStorage`), inlineada en
// scope-statement.js, plan-direccion.js y gpi-core.js.
//
// Auditoría (media): la línea base solo congelaba el enunciado, los entregables, los supuestos, las restricciones y las exclusiones; la estructura de la
// EDT y su diccionario quedaban fuera, así que se podían modificar los paquetes mientras la línea base conservaba su versión. La definición del PMI integra
// enunciado del alcance, EDT y diccionario de la EDT en la referencia aprobada. Ahora la instantánea incluye la EDT (estructura) y su diccionario
// (descripción del trabajo, criterio de aceptación, esfuerzo continuo y el entregable al que responde cada elemento). NO incluye lo que pertenece a otras
// líneas base: costo, duración, fechas, avance y responsable (costos y cronograma tienen las suyas).
//
// Estado aprobado y trabajo en edición quedan SEPARADOS: la EDT sigue editándose en WBS Builder (trabajo en edición); la instantánea es lo aprobado;
// `scopeDriftOf` compara ambos y dice qué cambió sin aprobar. Solo una NUEVA versión (con fecha, aprobador y motivo) actualiza la referencia, y cada versión
// vigente se ARCHIVA completa antes de establecer la siguiente (mismo criterio que la línea base de requisitos).
import { stableStringify } from "./pm-plan";

export interface WbsScopeNode { name: string; children: string[]; delId: string; notes: string; acceptance: string; loe: boolean; }
export interface WbsScope { rootId: string; nodes: Record<string, WbsScopeNode>; }
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

// La parte de la EDT que pertenece al ALCANCE. null si no hay EDT.
export function wbsScopeOf(wbs: unknown): WbsScope | null {
  const w = rec(wbs), nodes = rec(w.nodes), rootId = str(w.rootId);
  if (!rootId || !nodes[rootId]) return null;
  const out: Record<string, WbsScopeNode> = {};
  Object.keys(nodes).forEach((id) => {
    const n = rec(nodes[id]);
    out[id] = { name: str(n.name), children: (Array.isArray(n.children) ? n.children : []).map(str), delId: str(n.delId), notes: str(n.notes), acceptance: str(n.acceptance), loe: !!n.loe };
  });
  return { rootId, nodes: out };
}
export function normalizeWbsScope(o: unknown): WbsScope | null { return wbsScopeOf(o); }   // la instantánea guarda el mismo formato: se relee con la misma tolerancia

// Código jerárquico de cada elemento (1, 1.1, 1.1.1…) por recorrido en profundidad, como los muestra WBS Builder.
export function wbsScopeCodes(s: WbsScope): Record<string, string> {
  const codes: Record<string, string> = {}, seen = new Set<string>();
  const walk = (id: string, prefix: string): void => { const n = s.nodes[id]; if (!n || seen.has(id)) return; seen.add(id); n.children.forEach((c, i) => { const code = (prefix ? prefix + "." : "") + (i + 1); if (s.nodes[c]) { codes[c] = code; walk(c, code); } }); };
  walk(s.rootId, ""); return codes;
}
export type WbsChangeKind = "agregado" | "eliminado" | "renombrado" | "movido" | "diccionario";
export interface WbsChange { id: string; code: string; name: string; kind: WbsChangeKind; detail: string; }
const parentMap = (s: WbsScope): Record<string, string> => { const p: Record<string, string> = {}; Object.keys(s.nodes).forEach((id) => s.nodes[id].children.forEach((c) => { p[c] = id; })); return p; };
// Qué difiere entre la EDT aprobada (instantánea) y la vigente. Vacío = coinciden.
export function wbsScopeDiff(frozen: WbsScope, live: WbsScope | null): WbsChange[] {
  const out: WbsChange[] = [], fc = wbsScopeCodes(frozen), lc = live ? wbsScopeCodes(live) : {}, fp = parentMap(frozen), lp = live ? parentMap(live) : {};
  Object.keys(frozen.nodes).forEach((id) => {
    if (id === frozen.rootId) return;
    const a = frozen.nodes[id], b = live ? live.nodes[id] : undefined;
    if (!b) { out.push({ id, code: fc[id] || "", name: a.name, kind: "eliminado", detail: "ya no está en la EDT vigente" }); return; }
    if (a.name !== b.name) out.push({ id, code: lc[id] || fc[id] || "", name: b.name, kind: "renombrado", detail: "«" + a.name + "» → «" + b.name + "»" });
    if ((fp[id] || "") !== (lp[id] || "")) out.push({ id, code: lc[id] || "", name: b.name, kind: "movido", detail: "cambió de padre en la estructura" + (fc[id] !== lc[id] ? " (" + (fc[id] || "—") + " → " + (lc[id] || "—") + ")" : "") });
    const fields: string[] = [];
    if (a.notes !== b.notes) fields.push("descripción del trabajo"); if (a.acceptance !== b.acceptance) fields.push("criterio de aceptación"); if (a.loe !== b.loe) fields.push("esfuerzo continuo (LOE)"); if (a.delId !== b.delId) fields.push("entregable al que responde");
    if (fields.length) out.push({ id, code: lc[id] || fc[id] || "", name: b.name, kind: "diccionario", detail: "cambió " + fields.join(", ") });
  });
  if (live) Object.keys(live.nodes).forEach((id) => { if (id !== live.rootId && !frozen.nodes[id]) out.push({ id, code: lc[id] || "", name: live.nodes[id].name, kind: "agregado", detail: "no estaba en la EDT aprobada" }); });
  return out;
}

// ---- la línea base versionada ----
export interface ScopeSnapshot { wbs?: WbsScope | null; [k: string]: unknown; }
export interface ScopeArchived { version: string; date: string; approver: string; reason: string; supersededOn: string; snapshot: ScopeSnapshot | null; }
export interface ScopeBaselineData { frozen: boolean; version: string; date: string; approver: string; reason: string; snapshot: ScopeSnapshot | null; history: ScopeArchived[]; }
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function snapOf(v: unknown): ScopeSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const s = { ...(v as Record<string, unknown>) } as ScopeSnapshot; if (s.wbs !== undefined) s.wbs = normalizeWbsScope(s.wbs); return s;   // una línea base antigua no trae `wbs`: queda sin definir
}
// Lectura tolerante: lo guardado antes no trae motivo, historial ni EDT.
export function normalizeScopeBaseline(o: unknown): ScopeBaselineData {
  const x = rec(o);
  return {
    frozen: !!x.frozen, version: str(x.version) || "1.0", date: str(x.date), approver: str(x.approver), reason: str(x.reason), snapshot: snapOf(x.snapshot),
    history: (Array.isArray(x.history) ? x.history : []).filter((h) => h && typeof h === "object").map((h) => { const q = rec(h); return { version: str(q.version), date: str(q.date), approver: str(q.approver), reason: str(q.reason), supersededOn: str(q.supersededOn), snapshot: snapOf(q.snapshot) }; })
  };
}
// La instantánea del alcance de HOY: enunciado, entregables, supuestos, restricciones, exclusiones + EDT y diccionario.
export function scopeSnapshotOf(state: { deliverables: unknown; assumptions: unknown; constraints: unknown; exclusions: unknown; productScope: unknown; projectScope: unknown }, wbs: unknown): ScopeSnapshot {
  return clone({ deliverables: state.deliverables, assumptions: state.assumptions, constraints: state.constraints, exclusions: state.exclusions, productScope: state.productScope, projectScope: state.projectScope, wbs: wbsScopeOf(wbs) });
}
export interface ScopeVersionInput { version: string; date: string; approver: string; reason: string; }
// Archiva la versión vigente COMPLETA y establece la siguiente con la instantánea de hoy. No modifica `b`.
export function advanceScopeBaseline(b: ScopeBaselineData, snapshot: ScopeSnapshot, i: ScopeVersionInput, today: string): ScopeBaselineData {
  const archived: ScopeArchived = { version: b.version, date: b.date, approver: b.approver, reason: b.reason, supersededOn: today, snapshot: b.snapshot ? clone(b.snapshot) : null };
  return { frozen: true, version: i.version.trim(), date: i.date, approver: i.approver.trim(), reason: i.reason.trim(), snapshot: clone(snapshot), history: clone(b.history).concat([archived]) };
}

// Qué cambió del trabajo en edición respecto de lo aprobado. `wbsInBaseline` = false: la línea base es anterior a incluir la EDT (no se puede comparar).
export interface ScopeDrift { frozen: boolean; version: string; wbsInBaseline: boolean; wbsChanges: WbsChange[]; enunciadoChanged: boolean; total: number; }
const ENUNCIADO = ["deliverables", "assumptions", "constraints", "exclusions", "productScope", "projectScope"];
export function scopeDriftOf(baseline: ScopeBaselineData, live: { deliverables: unknown; assumptions: unknown; constraints: unknown; exclusions: unknown; productScope: unknown; projectScope: unknown }, wbs: unknown): ScopeDrift {
  if (!baseline.frozen || !baseline.snapshot) return { frozen: false, version: baseline.version, wbsInBaseline: false, wbsChanges: [], enunciadoChanged: false, total: 0 };
  const snap = baseline.snapshot, lv = live as unknown as Record<string, unknown>;
  const enunciadoChanged = ENUNCIADO.some((k) => stableStringify(snap[k] === undefined ? null : snap[k]) !== stableStringify(lv[k] === undefined ? null : lv[k]));
  const frozenWbs = snap.wbs || null, wbsChanges = frozenWbs ? wbsScopeDiff(frozenWbs, wbsScopeOf(wbs)) : [];
  return { frozen: true, version: baseline.version, wbsInBaseline: !!frozenWbs, wbsChanges, enunciadoChanged, total: wbsChanges.length + (enunciadoChanged ? 1 : 0) };
}
