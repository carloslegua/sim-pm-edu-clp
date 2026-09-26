// Avance real del cronograma y pronóstico — lógica PURA (sin DOM ni `localStorage`), inlineada en cronograma-cpm.js y gpi-core.js.
//
// Auditoría (media): la suite modelaba el cronograma PLANIFICADO (CPM, línea base) pero no el avance real: no había fecha de corte ni % de avance por actividad, así que
// la salud de la red decía «no se evalúa el avance real» y el fin pronosticado no cambiaba por más que el proyecto avanzara o se atrasara. Ahora se registra la
// fecha de corte y el % completado de cada actividad, y el pronóstico se recalcula con el MISMO CPM del núcleo sobre lo que FALTA por hacer:
//   · actividad terminada (100 %): ya no ocupa tiempo (duración 0);
//   · en curso (0 < % < 100): le queda la duración restante (duración × (1 − %), redondeada hacia arriba) y no puede empezar antes del corte;
//   · sin empezar: conserva su duración y no puede empezar antes del corte;
//   · los hitos (duración 0) no se fijan al corte: los mueven sus predecesoras.
// El avance se informa AL INICIO de la fecha de corte. El pronóstico supone que lo que falta se hace en su duración planificada (no proyecta el rendimiento
// observado): es la fecha que resulta de cumplir el plan restante, no una predicción estadística.
// Las medidas de progreso son por DURACIÓN (Σ duración × %), no por costo: el valor ganado (costo) tiene su propio módulo.
import type { NetLink } from "./schedule-risk";

export interface ProgressState { statusDate: string; pct: Record<string, number>; }
export const emptyProgress = (): ProgressState => ({ statusDate: "", pct: {} });
const iso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// Lectura tolerante de lo guardado (nada, basura o porcentajes fuera de rango).
export function normalizeProgress(o: unknown): ProgressState {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>, raw = (x.pct && typeof x.pct === "object" && !Array.isArray(x.pct) ? x.pct : {}) as Record<string, unknown>, pct: Record<string, number> = {};
  Object.keys(raw).forEach((id) => { const v = Number(raw[id]); if (isFinite(v) && String(raw[id]).trim() !== "") pct[id] = clamp(Math.round(v * 10) / 10, 0, 100); });
  return { statusDate: iso(String(x.statusDate || "")) ? String(x.statusDate) : "", pct };
}

export interface CalLike { workDayIdx?: number[]; holidays?: string[]; }
// Días laborables entre el primer día laborable del proyecto (índice 0) y la fecha indicada, SIN contarla: es el «offset» que usa el CPM. Antes del inicio, 0.
export function workOffset(startISO: string, dateISO: string, cal: CalLike | null | undefined): number | null {
  if (!iso(startISO) || !iso(dateISO)) return null;
  const work: Record<number, boolean> = {}; ((cal && cal.workDayIdx && cal.workDayIdx.length) ? cal.workDayIdx : [1, 2, 3, 4, 5]).forEach((d) => { work[d] = true; });
  const hol: Record<string, boolean> = {}; ((cal && cal.holidays) || []).forEach((h) => { hol[String(h).slice(0, 10)] = true; });
  const isWork = (d: Date): boolean => !!work[d.getUTCDay()] && !hol[d.toISOString().slice(0, 10)];
  const d = new Date(startISO + "T12:00:00Z"), end = Date.parse(dateISO + "T12:00:00Z");
  while (!isWork(d)) d.setUTCDate(d.getUTCDate() + 1);      // primer día laborable ≥ inicio
  let n = 0;
  while (d.getTime() < end) { if (isWork(d)) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}

export interface CpmRowP { es: number; ef: number; startDate?: string; finishDate?: string; }
export type CpmResultP = { ok: false; cycles: string[] } | { ok: true; rows: Record<string, CpmRowP>; projectDuration: number; projectFinishDate: string };
export type CpmFnP = (nodes: Array<{ id: string; dur: number; minStart?: number }>, links: NetLink[], calendar: never, opts?: { startDate?: string }) => CpmResultP;
export interface PNode { id: string; dur: number; isMilestone: boolean; code?: string; name?: string; }

export interface LateActivity { id: string; code: string; name: string; slipDays: number; forecastFinish: string; }
export interface Forecast {
  ok: boolean; reason: string;
  statusDate: string; statusOffset: number;
  planFinish: string; planDuration: number;              // CPM sin avance real
  forecastFinish: string; forecastDuration: number;      // CPM sobre lo que falta
  delayDays: number;                                     // días laborables: pronóstico − plan (+ = se atrasa)
  baselineFinish: string; vsBaselineDays: number | null; // pronóstico contra la línea base (días laborables), si hay línea base
  pctActual: number; pctPlanned: number; spiT: number | null;   // por duración, en %, y su cociente
  done: number; inProgress: number; notStarted: number;
  late: LateActivity[];                                  // actividades sin terminar cuyo fin pronosticado se corre respecto del plan (mayor primero)
  byId: Record<string, { finish: string; slipDays: number }>;   // fin pronosticado de cada actividad sin terminar y su corrimiento contra el plan
}
const NONE: Forecast = { ok: false, reason: "", statusDate: "", statusOffset: 0, planFinish: "", planDuration: 0, forecastFinish: "", forecastDuration: 0, delayDays: 0, baselineFinish: "", vsBaselineDays: null, pctActual: 0, pctPlanned: 0, spiT: null, done: 0, inProgress: 0, notStarted: 0, late: [], byId: {} };

export interface ForecastInput {
  nodes: PNode[]; links: NetLink[]; calendar: CalLike; startDate: string; progress: ProgressState | null | undefined; cpm: CpmFnP;
  baselineDuration?: number | null; baselineFinish?: string;
}
export function computeForecast(i: ForecastInput): Forecast {
  const p = normalizeProgress(i.progress);
  if (!p.statusDate) return { ...NONE, reason: "Falta la fecha de corte del avance." };
  if (!iso(i.startDate)) return { ...NONE, statusDate: p.statusDate, reason: "El proyecto no tiene fecha de inicio: sin ella no se puede ubicar la fecha de corte en el cronograma." };
  const so = workOffset(i.startDate, p.statusDate, i.calendar) as number;
  const cal = i.calendar as never;
  const plan = i.cpm(i.nodes.map((n) => ({ id: n.id, dur: n.dur })), i.links, cal, { startDate: i.startDate });
  if (!plan.ok) return { ...NONE, statusDate: p.statusDate, reason: "La red tiene un ciclo: no se puede calcular el pronóstico." };
  const acts = i.nodes.filter((n) => !n.isMilestone && n.dur > 0), pctOf = (id: string): number => clamp(p.pct[id] || 0, 0, 100);
  const fnodes = i.nodes.map((n) => {
    if (n.isMilestone || n.dur <= 0) return { id: n.id, dur: 0, minStart: 0 };
    const pc = pctOf(n.id);
    if (pc >= 100) return { id: n.id, dur: 0, minStart: 0 };
    if (pc > 0) return { id: n.id, dur: Math.ceil(n.dur * (1 - pc / 100) - 1e-9), minStart: so };
    return { id: n.id, dur: n.dur, minStart: so };
  });
  const fc = i.cpm(fnodes, i.links, cal, { startDate: i.startDate });
  if (!fc.ok) return { ...NONE, statusDate: p.statusDate, reason: "La red tiene un ciclo: no se puede calcular el pronóstico." };
  const totalDur = acts.reduce((s, n) => s + n.dur, 0);
  const pctActual = totalDur ? acts.reduce((s, n) => s + n.dur * pctOf(n.id) / 100, 0) / totalDur * 100 : 0;
  const pctPlanned = totalDur ? acts.reduce((s, n) => s + n.dur * clamp((so - plan.rows[n.id].es) / n.dur, 0, 1), 0) / totalDur * 100 : 0;
  const late: LateActivity[] = acts.filter((n) => pctOf(n.id) < 100).map((n) => ({ id: n.id, code: n.code || "", name: n.name || "", slipDays: Math.round((fc.rows[n.id].ef - plan.rows[n.id].ef) * 10) / 10, forecastFinish: fc.rows[n.id].finishDate || "" }))
    .filter((a) => a.slipDays > 0).sort((a, b) => b.slipDays - a.slipDays);
  const byId: Record<string, { finish: string; slipDays: number }> = {};
  acts.filter((n) => pctOf(n.id) < 100).forEach((n) => { byId[n.id] = { finish: fc.rows[n.id].finishDate || "", slipDays: Math.round((fc.rows[n.id].ef - plan.rows[n.id].ef) * 10) / 10 }; });
  const bd = i.baselineDuration;
  return {
    ok: true, reason: "", statusDate: p.statusDate, statusOffset: so,
    planFinish: plan.projectFinishDate, planDuration: plan.projectDuration, forecastFinish: fc.projectFinishDate, forecastDuration: fc.projectDuration,
    delayDays: Math.round((fc.projectDuration - plan.projectDuration) * 10) / 10,
    baselineFinish: i.baselineFinish || "", vsBaselineDays: bd === null || bd === undefined ? null : Math.round((fc.projectDuration - bd) * 10) / 10,
    pctActual: Math.round(pctActual * 10) / 10, pctPlanned: Math.round(pctPlanned * 10) / 10, spiT: pctPlanned > 0 ? Math.round(pctActual / pctPlanned * 1000) / 1000 : null,
    done: acts.filter((n) => pctOf(n.id) >= 100).length, inProgress: acts.filter((n) => pctOf(n.id) > 0 && pctOf(n.id) < 100).length, notStarted: acts.filter((n) => pctOf(n.id) <= 0).length,
    late, byId
  };
}

// Reparte el avance de cada PAQUETE (Código EDT → %) entre sus actividades en el orden en que se ejecutan: las primeras se completan y la última queda parcial.
// Es la traducción del avance del ejemplo de Valor Ganado (una sola fuente) a % por actividad. El código de la actividad es «<paquete>.<n>».
export function spreadPackagePct(acts: Array<{ id: string; code: string; dur: number; isMilestone?: boolean }>, pkgPct: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}, byPkg: Record<string, Array<{ id: string; dur: number }>> = {};
  acts.filter((a) => !a.isMilestone && a.dur > 0).forEach((a) => { const k = a.code.replace(/\.\d+$/, ""); (byPkg[k] = byPkg[k] || []).push({ id: a.id, dur: a.dur }); });
  Object.keys(byPkg).forEach((k) => {
    const pc = pkgPct[k]; if (pc === undefined) return;
    const list = byPkg[k], total = list.reduce((s, a) => s + a.dur, 0); let left = total * clamp(pc, 0, 100) / 100;
    list.forEach((a) => { const take = Math.min(a.dur, Math.max(0, left)); out[a.id] = Math.round(take / a.dur * 1000) / 10; left -= take; });
  });
  return out;
}
