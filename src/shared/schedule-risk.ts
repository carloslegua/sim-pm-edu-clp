// Riesgo de plazo: cuánto retrasa cada riesgo el FIN DEL PROYECTO -- lógica PURA compartida en tiempo de COMPILACIÓN
// (Vite la inlinea en risks.js y cost.js). No calcula un CPM propio: recibe el CPM del núcleo (`GPI.util.cpm`) y la red
// de actividades (`GPI.util.scheduleNetwork`), así que el resultado coincide con lo que muestra Cronograma/CPM.
//
// Base metodológica:
//  · AACE RP 40R-08: la contingencia reúne incertidumbre y riesgos, y debe incluir el efecto del riesgo de CRONOGRAMA
//    sobre el costo (un retraso cuesta: costos indirectos, dirección, alquileres). RP 57R-09 (simulación Monte Carlo sobre un
//    cronograma CPM) y 118R-21: análisis integrado de costo y cronograma -- el mismo evento de riesgo produce su impacto en costo Y en plazo dentro de la
//    misma iteración de la simulación.
//  · PMI / PMBOK (Gestión del cronograma y de los riesgos): un retraso en una actividad solo mueve la fecha de fin si
//    consume más que su HOLGURA; una actividad de la ruta crítica traslada el retraso íntegro. Por eso el efecto de un
//    riesgo sobre el proyecto NO es «los días del riesgo»: se calcula volviendo a correr el CPM con la duración
//    afectada (exacto con cualquier tipo de enlace y desfase, sin aproximar por la holgura total).
//
// Cómo se ubica un riesgo en el cronograma (documentado también en pantalla):
//  · Con ACTIVIDADES elegidas (`actIds`): el retraso se aplica a CADA una de ellas (mismo criterio que los
//    simuladores de riesgo de cronograma cuando un riesgo se mapea a varias tareas).
//  · Solo con PAQUETES de la EDT: el retraso se aplica UNA vez, a la actividad del paquete con MENOS holgura -- la que
//    manda sobre el fin del paquete (criterio conservador: es el máximo efecto que un solo retraso puede tener allí).
//  · Sin ninguno de los dos, o sin actividades en esos paquetes, no se puede ubicar: se dice, no se inventa un efecto.

import type { Range3 } from "./risk-analysis";
import { triInv } from "./range-estimating";

// ---- red y CPM (estructurales: coinciden con lo que devuelve el núcleo, sin importarlo en tiempo de ejecución) ----
export interface NetNode { id: string; code: string; name: string; leafId: string | null; dur: number; hasDur: boolean; isMilestone: boolean; }
export interface NetLink { from: string; to: string; type: "FS" | "SS" | "FF" | "SF"; lag?: number; lagUnit?: "d" | "ed" | "h" | "w"; }
export interface Network { nodes: NetNode[]; links: NetLink[]; calendar: unknown; startDate: string; hasElapsedLags: boolean; }
export interface CpmRowLike { es: number; ef: number; tf: number; critical: boolean; }
export type CpmLike = { ok: false; cycles: string[] } | { ok: true; rows: Record<string, CpmRowLike>; projectDuration: number; criticalIds: string[] };
export type CpmFn = (nodes: Array<{ id: string; dur: number }>, links: NetLink[], calendar: never, opts?: { startDate?: string }) => CpmLike;

export interface Engine {
  net: Network;
  base: number;                                   // duración del proyecto sin retrasos (días laborables)
  rows: Record<string, CpmRowLike>;               // ES/EF/holgura/crítica de cada nodo en la red base
  byId: Record<string, NetNode>;
  // Duración del proyecto si a cada actividad de `delta` se le suma su valor (puede ser negativo: una oportunidad
  // que acelera). null si la red no se puede calcular (ciclo).
  duration(delta: Record<string, number>): number | null;
}

// Motor sobre una red: la base y un `duration(delta)` que vuelve a correr el CPM. null si no hay red, no tiene
// actividades o tiene un ciclo (no hay ruta crítica que calcular).
export function makeEngine(net: Network | null | undefined, cpm: CpmFn): Engine | null {
  if (!net || !net.nodes.some((n) => !n.isMilestone)) return null;
  const nodes = net.nodes.map((n) => ({ id: n.id, dur: n.dur })), idx: Record<string, number> = {};
  net.nodes.forEach((n, i) => { idx[n.id] = i; });
  // Sin fecha de inicio a propósito: con fecha el CPM calcula fechas de calendario de cada fila en cada corrida (caro
  // para miles de iteraciones) y la duración en días laborables no las necesita. `net.hasElapsedLags` avisa el caso
  // en que los desfases en días transcurridos se aproximan sin fecha.
  const run = (): CpmLike => cpm(nodes, net.links, net.calendar as never, {});
  const r0 = run();
  if (!r0.ok) return null;
  const byId: Record<string, NetNode> = {}; net.nodes.forEach((n) => { byId[n.id] = n; });
  const cache = new Map<string, number | null>();
  return {
    net, base: r0.projectDuration, rows: r0.rows, byId,
    duration(delta) {
      const ids = Object.keys(delta).filter((id) => idx[id] !== undefined && delta[id] !== 0);
      if (!ids.length) return r0.projectDuration;
      const key = ids.sort().map((id) => id + ":" + Math.round(delta[id] * 1000)).join("|");
      if (cache.has(key)) return cache.get(key) as number | null;
      ids.forEach((id) => { nodes[idx[id]].dur = Math.max(0, net.nodes[idx[id]].dur + delta[id]); });
      const r = run();
      ids.forEach((id) => { nodes[idx[id]].dur = net.nodes[idx[id]].dur; });
      const out = r.ok ? r.projectDuration : null;
      if (cache.size < 5000) cache.set(key, out);
      return out;
    }
  };
}

// ---- a qué actividades afecta un riesgo ----
export interface RiskTarget { id: string; code: string; name: string; tf: number; critical: boolean; }
export interface TargetResolution {
  mode: "actividades" | "paquete" | "ninguno";
  targets: RiskTarget[];
  missing: string[];             // actividades elegidas que ya no existen en el cronograma
  reason: string;                // por qué no se pudo ubicar (mode "ninguno")
}
const TF_EPS = 1e-6;
export function resolveTargets(r: { wbsIds: string[]; actIds: string[] }, eng: Engine): TargetResolution {
  const mk = (n: NetNode): RiskTarget => { const row = eng.rows[n.id]; return { id: n.id, code: n.code, name: n.name, tf: row ? row.tf : 0, critical: !!row && row.tf <= TF_EPS }; };
  const acts = eng.net.nodes.filter((n) => !n.isMilestone);
  if (r.actIds.length) {
    const chosen = acts.filter((n) => r.actIds.indexOf(n.id) >= 0), have = new Set(chosen.map((n) => n.id));
    const missing = r.actIds.filter((id) => !have.has(id));
    if (chosen.length) return { mode: "actividades", targets: chosen.map(mk), missing, reason: "" };
    // las actividades elegidas ya no existen: se intenta con los paquetes, como si no hubiera actividades
    const p = fromPackages(r, acts, eng, mk);
    return { ...p, missing };
  }
  return fromPackages(r, acts, eng, mk);
}
function fromPackages(r: { wbsIds: string[] }, acts: NetNode[], eng: Engine, mk: (n: NetNode) => RiskTarget): TargetResolution {
  if (!r.wbsIds.length) return { mode: "ninguno", targets: [], missing: [], reason: "no indica paquetes de la EDT ni actividades" };
  const cand = acts.filter((n) => n.leafId !== null && r.wbsIds.indexOf(n.leafId) >= 0);
  if (!cand.length) return { mode: "ninguno", targets: [], missing: [], reason: "sus paquetes de la EDT no tienen actividades en el cronograma" };
  let best = cand[0]; cand.forEach((n) => { if ((eng.rows[n.id] ? eng.rows[n.id].tf : 0) < (eng.rows[best.id] ? eng.rows[best.id].tf : 0) - TF_EPS) best = n; });
  return { mode: "paquete", targets: [mk(best)], missing: [], reason: "" };
}

// ---- efecto de un riesgo sobre el fin del proyecto ----
export interface ScheduleImpact {
  mode: TargetResolution["mode"]; targets: RiskTarget[]; missing: string[]; reason: string;
  mapped: boolean;
  base: number;
  // Retraso del FIN DEL PROYECTO (días laborables) si el riesgo ocurre con cada punto del rango (con el signo del tipo).
  delay: { low: number | null; likely: number | null; high: number | null };
  minFloat: number | null;        // menor holgura entre las actividades afectadas
  evDays: number | null;          // valor esperado en días del proyecto = probabilidad × E[retraso del fin] (triangular)
}
const QUANTILES = 15;
export function scheduleImpactOf(eng: Engine, res: TargetResolution, range: Range3, prob: number | null, sign: 1 | -1): ScheduleImpact {
  const out: ScheduleImpact = { mode: res.mode, targets: res.targets, missing: res.missing, reason: res.reason, mapped: res.targets.length > 0, base: eng.base, delay: { low: null, likely: null, high: null }, minFloat: null, evDays: null };
  if (!res.targets.length) return out;
  out.minFloat = Math.min(...res.targets.map((t) => t.tf));
  const delayFor = (days: number): number | null => {
    const d: Record<string, number> = {}; res.targets.forEach((t) => { d[t.id] = sign * days; });
    const dur = eng.duration(d);
    return dur === null ? null : dur - eng.base;
  };
  const pt = (v: number | null): number | null => (v === null ? null : delayFor(v));
  out.delay = { low: pt(range.low), likely: pt(range.likely), high: pt(range.high) };
  if (prob !== null && range.likely !== null) {
    const lo = range.low === null ? range.likely : range.low, hi = range.high === null ? range.likely : range.high;
    let s = 0, n = 0;
    for (let i = 0; i < QUANTILES; i++) { const v = delayFor(triInv((i + 0.5) / QUANTILES, lo, range.likely, hi)); if (v !== null) { s += v; n++; } }
    if (n) out.evDays = prob * (s / n);
  }
  return out;
}

// Frase corta del efecto más probable, para pantalla y hallazgos.
export function delayPhrase(im: ScheduleImpact): string {
  const d = im.delay.likely;
  if (!im.mapped) return "no se puede ubicar en el cronograma (" + im.reason + ")";
  if (d === null) return "sin impacto en plazo cuantificado";
  const days = Math.round(Math.abs(d) * 10) / 10;
  if (Math.abs(d) < 1e-6) return "la holgura de las actividades afectadas (" + fmtDays(im.minFloat) + ") absorbe el impacto más probable";
  return (d > 0 ? "retrasa el fin del proyecto " : "adelanta el fin del proyecto ") + days + " d" + (im.targets.some((t) => t.critical) ? " (actividad crítica)" : "");
}
export const fmtDays = (v: number | null): string => (v === null ? "—" : (Math.round(v * 10) / 10) + " d");
