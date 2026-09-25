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

// BAC por paquete = costo del TRABAJO, con la MISMA regla con que WBS Builder fija el costo del paquete
// (applyCostEstimateToWbs del núcleo): Estimar los Costos solo si TODAS las actividades del paquete tienen
// precio; si no, el costo de la EDT. Antes un estimado parcial se tomaba como presupuesto (el paquete 4.3 del
// ejemplo valía 792.000 en Valor Ganado y 1.165.000 en la EDT). Sin costo en la EDT, el parcial es lo único que hay.
export function packageBudgets(i: Pick<RefInput, "leaves" | "estimateRows" | "wbsCost">): Record<string, { bac: number; source: string }> {
  const out: Record<string, { bac: number; source: string }> = {}, by: Record<string, { sum: number; complete: boolean }> = {};
  i.estimateRows.forEach((r) => { const k = by[r.leafId] || (by[r.leafId] = { sum: 0, complete: true }); if (r.subtotal && r.subtotal > 0) k.sum += r.subtotal; else k.complete = false; });
  i.leaves.forEach((l) => {
    const e = by[l.id], w = i.wbsCost[l.id] || 0;
    if (e && e.complete && e.sum > 0) out[l.id] = { bac: e.sum, source: "Estimar los Costos" };
    else if (w > 0) out[l.id] = { bac: w, source: "EDT (WBS Builder)" };
    else if (e && e.sum > 0) out[l.id] = { bac: e.sum, source: "Estimar los Costos (parcial)" };
  });
  return out;
}
// Órdenes de cambio de Costos que ya forman parte del presupuesto del TRABAJO (auditoría, alta). Una orden aprobada con cargo a la
// contingencia TRASLADA ese monto al paquete que la ejecuta (la contingencia es una reserva dentro de la línea base de costos: al
// usarla, pasa al trabajo); una con reserva de gestión o fondos adicionales lo hace cuando se INCORPORA a la línea base (LB-n). Sin
// esto, el gasto de la orden entraba al costo real como sobrecosto y el VAC se comparaba con una contingencia que ya la había
// descontado: la misma orden se contaba dos veces. El monto se suma al BAC del paquete y se distribuye en el tiempo como el resto.
// Una orden sin paquete (o con un paquete que ya no existe) no se puede asignar: se lista para que se corrija en Costos.
export interface BudgetTransfer { id: string; leafId: string | null; code: string; amount: number; fund: string; baselined: string | null; }
export function approvedTransfers(orders: unknown, leaves: Array<{ id: string; code: string }>): { byLeaf: Record<string, number>; applied: BudgetTransfer[]; unassigned: BudgetTransfer[] } {
  const byLeaf: Record<string, number> = {}, applied: BudgetTransfer[] = [], unassigned: BudgetTransfer[] = [];
  const byId: Record<string, string> = {}, byCode: Record<string, string> = {};
  leaves.forEach((l) => { byId[l.id] = l.id; byCode[l.code] = l.id; });
  (Array.isArray(orders) ? orders : []).forEach((o) => {
    if (!o || typeof o !== "object") return;
    const x = o as Record<string, unknown>, amount = Number(x.cost) || 0, fund = String(x.fund || ""), baselined = x.baselined ? String(x.baselined) : null;
    if (x.status !== "Aprobada" || !amount || !(fund === "Contingencia" || baselined)) return;
    const leafId: string | null = (x.wbsId ? byId[String(x.wbsId)] : undefined) || (x.wbsCode ? byCode[String(x.wbsCode)] : undefined) || null;
    const t: BudgetTransfer = { id: String(x.id || ""), leafId, code: String(x.wbsCode || ""), amount, fund, baselined };
    if (leafId) { byLeaf[leafId] = (byLeaf[leafId] || 0) + amount; applied.push(t); } else unassigned.push(t);
  });
  return { byLeaf, applied, unassigned };
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
