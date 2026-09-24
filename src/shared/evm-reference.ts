// Referencia de valor ganado — lógica PURA (sin DOM ni `localStorage`), inlineada en cronograma-cpm.js (donde se CONGELA al fijar una línea base) y en
// evm.js (donde se USA; y, si la línea base es anterior a esta referencia, se calcula con datos vigentes y se avisa). Una sola función arma el
// presupuesto por paquete para las dos: lo congelado y lo vigente se comparan con la MISMA regla.
import type { EvmRefPackage, EvmReference } from "./schedule-control";

export interface RefInput {
  leaves: Array<{ id: string; code: string; name: string }>;
  estimateRows: Array<{ leafId: string; subtotal: number | null }>;   // Estimar los Costos: subtotal por actividad
  wbsCost: Record<string, number>;                                    // costo del paquete en la EDT (respaldo)
  activityNodes: Array<{ id: string; leafId: string | null; isMilestone: boolean }>;
  rows: Record<string, { es: number; ef: number }>;                   // inicio/fin más temprano en días laborables, por actividad
  calendar: { workDayIdx: number[]; holidays: string[] };
}

// BAC por paquete = costo del TRABAJO: Estimar los Costos; si el paquete no tiene estimado, el costo de la EDT.
export function packageBudgets(i: Pick<RefInput, "leaves" | "estimateRows" | "wbsCost">): Record<string, { bac: number; source: string }> {
  const out: Record<string, { bac: number; source: string }> = {};
  i.estimateRows.forEach((r) => { if (r.subtotal && r.subtotal > 0) { const k = out[r.leafId] || (out[r.leafId] = { bac: 0, source: "Estimar los Costos" }); k.bac += r.subtotal; } });
  i.leaves.forEach((l) => { if (!out[l.id]) { const w = i.wbsCost[l.id] || 0; if (w > 0) out[l.id] = { bac: w, source: "EDT (WBS Builder)" }; } });
  return out;
}
// Inicio más temprano y fin más tardío de las actividades de cada paquete (no cuentan los hitos).
export function packageSpans(i: Pick<RefInput, "activityNodes" | "rows">): Record<string, { es: number; ef: number }> {
  const spans: Record<string, { es: number; ef: number }> = {};
  i.activityNodes.filter((n) => !n.isMilestone && n.leafId).forEach((n) => {
    const r = i.rows[n.id]; if (!r) return;
    const s = spans[n.leafId as string] || (spans[n.leafId as string] = { es: r.es, ef: r.ef });
    s.es = Math.min(s.es, r.es); s.ef = Math.max(s.ef, r.ef);
  });
  return spans;
}
export function buildEvmReference(i: RefInput): EvmReference {
  const b = packageBudgets(i), sp = packageSpans(i);
  const packages: EvmRefPackage[] = i.leaves.filter((l) => b[l.id]).map((l) => ({ id: l.id, code: l.code, name: l.name, bac: b[l.id].bac, source: b[l.id].source, es: sp[l.id] ? sp[l.id].es : null, ef: sp[l.id] ? sp[l.id].ef : null }));
  return { calendar: { workDayIdx: i.calendar.workDayIdx.slice(), holidays: i.calendar.holidays.slice() }, packages, total: packages.reduce((s, p) => s + p.bac, 0) };
}

// ¿Difieren los datos VIGENTES de la referencia congelada? Devuelve qué cambió (vacío = coinciden). Solo informativo: EVM sigue usando lo congelado.
export function referenceDrift(frozen: EvmReference, frozenStart: string, liveStart: string, live: EvmReference): string[] {
  const out: string[] = [];
  const bacOf = (r: EvmReference): Record<string, number> => { const m: Record<string, number> = {}; r.packages.forEach((p) => { m[p.id] = p.bac; }); return m; };
  const f = bacOf(frozen), v = bacOf(live), ids = Array.from(new Set(Object.keys(f).concat(Object.keys(v))));
  const changed = ids.filter((id) => Math.abs((f[id] || 0) - (v[id] || 0)) > 0.5);
  if (changed.length) out.push("el presupuesto por paquete (" + changed.length + " paquete(s); total vigente " + Math.round(live.total).toLocaleString("es-PE") + " frente a " + Math.round(frozen.total).toLocaleString("es-PE") + " en la línea base)");
  if (liveStart && frozenStart && liveStart !== frozenStart) out.push("la fecha de inicio (" + liveStart + " frente a " + frozenStart + " en la línea base)");
  if (JSON.stringify(live.calendar) !== JSON.stringify(frozen.calendar)) out.push("el calendario laboral (días laborables o feriados)");
  return out;
}
