// PERT sobre la RED COMPLETA (auditoría metodológica: ramas paralelas) — lógica PURA (sin DOM ni `localStorage`), inlineada en pert.js.
//
// Problema: la probabilidad PERT clásica (Z = (T − ΣTE)/√Σσ²) supone UNA sola ruta crítica. Con ramas paralelas o convergentes el fin del
// proyecto es el MÁXIMO de las rutas, no una suma: estimarlo con una sola rama sobrestima la probabilidad (dos ramas de 10 d, cada una con
// 50 % de terminar en 10 d, dan 25 % —no 50 %— de terminar en 10 d: «sesgo de convergencia», merge bias). El módulo no daba número en ese
// caso ("haría falta simular la red completa"); esto es esa simulación.
//
// Método (Monte Carlo sobre el CPM del núcleo): en cada iteración cada actividad con terna O–M–P válida toma una duración de la distribución
// **Beta-PERT** (la que respalda TE = (O+4M+P)/6 y σ = (P−O)/6: forma α = 1 + 4(M−O)/(P−O), β = 1 + 4(P−M)/(P−O), escalada a [O, P]); las
// demás quedan en su duración fija. Se vuelve a correr el CPM (con los mismos enlaces, desfases y calendario) y se guarda el fin. Con eso:
// media y σ del fin, percentiles, P(fin ≤ plazo) y el ÍNDICE DE CRITICIDAD de cada actividad (fracción de iteraciones en que estuvo en la
// ruta crítica; puede haber varias rutas casi críticas que la determinística no ve). Supuestos declarados: duraciones INDEPENDIENTES entre
// actividades (sin correlación), distribución Beta-PERT, semilla fija (mismo resultado para los mismos datos). Es una simulación, no una
// probabilidad exacta: con 2 000 iteraciones el error típico de una probabilidad es ≈ ±1 punto.
import { mulberry32 } from "./range-estimating";
import type { CpmFn, NetLink } from "./schedule-risk";

export const PERT_SIM_ITERATIONS = 2000;
export const PERT_SIM_SEED = 20260713;
export const PERT_SIM_PERCENTILES = [10, 50, 80, 90];

export interface SimAct { id: string; dur: number; o?: number | null; m?: number | null; p?: number | null; }
export interface PertSimResult {
  iterations: number; base: number; mean: number; sd: number; min: number; max: number;
  percentiles: Record<number, number>; criticality: Record<string, number>; sorted: number[]; stochastic: number;
}

const normal = (rnd: () => number): number => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
// Gamma(k, 1) con k ≥ 1 (Marsaglia–Tsang).
function gamma(k: number, rnd: () => number): number {
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rnd), t = 1 + c * x; if (t <= 0) continue;
    const v = t * t * t, u = rnd();
    if (Math.log(Math.max(u, 1e-300)) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}
// Una duración Beta-PERT en [o, p] con moda m. Terna degenerada (p ≤ o): la duración más probable.
export function samplePert(o: number, m: number, p: number, rnd: () => number): number {
  if (!(p > o)) return m;
  const a = 1 + 4 * (m - o) / (p - o), b = 1 + 4 * (p - m) / (p - o), ga = gamma(a, rnd), gb = gamma(b, rnd);
  return o + (ga / (ga + gb)) * (p - o);
}
export const isTriple = (a: SimAct): boolean => a.o != null && a.m != null && a.p != null && isFinite(a.o) && isFinite(a.m) && isFinite(a.p) && a.o > 0 && a.o <= a.m && a.m <= a.p && a.p > a.o;

export function simulatePertNetwork(
  acts: SimAct[], links: NetLink[], calendar: unknown, cpm: CpmFn, opts: { iterations?: number; seed?: number; startDate?: string } = {}
): PertSimResult | null {
  const n = Math.max(200, Math.round(opts.iterations || PERT_SIM_ITERATIONS)), rnd = mulberry32(opts.seed || PERT_SIM_SEED), startDate = opts.startDate || "";
  const run = (durs: Array<{ id: string; dur: number }>) => cpm(durs, links, calendar as never, { startDate });
  const base = run(acts.map((a) => ({ id: a.id, dur: a.dur })));
  if (!base.ok) return null;
  const stoch = acts.filter(isTriple);
  if (!stoch.length) return null;
  const hits: Record<string, number> = {}, fins: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = run(acts.map((a) => ({ id: a.id, dur: isTriple(a) ? samplePert(a.o as number, a.m as number, a.p as number, rnd) : a.dur })));
    if (!r.ok) return null;
    fins.push(r.projectDuration); r.criticalIds.forEach((id) => { hits[id] = (hits[id] || 0) + 1; });
  }
  fins.sort((x, y) => x - y);
  const mean = fins.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(fins.reduce((s, x) => s + (x - mean) * (x - mean), 0) / n);
  const percentiles: Record<number, number> = {}; PERT_SIM_PERCENTILES.forEach((q) => { percentiles[q] = fins[Math.min(n - 1, Math.floor(q / 100 * n))]; });
  const criticality: Record<string, number> = {}; Object.keys(hits).forEach((id) => { criticality[id] = hits[id] / n; });
  return { iterations: n, base: base.projectDuration, mean, sd, min: fins[0], max: fins[n - 1], percentiles, criticality, sorted: fins, stochastic: stoch.length };
}
// P(fin ≤ plazo): fracción de iteraciones que terminan a tiempo (por búsqueda binaria sobre las muestras ordenadas).
export function probWithin(res: PertSimResult, target: number): number {
  let lo = 0, hi = res.sorted.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (res.sorted[mid] <= target + 1e-9) lo = mid + 1; else hi = mid; }
  return lo / res.sorted.length;
}
