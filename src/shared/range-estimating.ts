// Estimación por rangos con simulación Monte Carlo para determinar la contingencia
// (AACE International, RP 41R-08, titulada hasta 2021 "Risk Analysis and Contingency Determination
// Using Range Estimating" y hoy "Understanding Estimate Ranging"; ver también 40R-08 y 118R-21) -- lógica PURA compartida en tiempo de COMPILACIÓN (Vite la inlinea en cost.js).
//
// Auditoría metodológica: Costos ofrecía «Simulación Monte Carlo» como método de
// contingencia pero calculaba una tabla fija de % por clase y percentil, cuyos valores no
// provienen de AACE. La contingencia sale de un ANÁLISIS: cada partida del estimado
// tiene un rango (mínimo / más probable / máximo); se simula el costo total y la
// contingencia es el percentil de decisión de esa distribución MENOS el estimado base
// (la suma de los valores más probables):    contingencia = P(x) − Σ costo más probable.
//
// Decisiones del modelo (todas visibles en la pantalla):
//  · Distribución TRIANGULAR (mín, más probable, máx) por partida.
//  · CORRELACIÓN entre partidas con un modelo de un factor (cópula gaussiana): ρ = 0 trata
//    todas las partidas como independientes y SUBESTIMA la dispersión del total (los errores
//    de estimación suelen ir en la misma dirección); ρ = 1 las mueve juntas.
//  · Semilla fija: el mismo análisis da siempre el mismo resultado (reproducible y auditable).
//  · Cubre la incertidumbre de los RANGOS del estimado y, si se pasan `events`, también los
//    eventos de riesgo DISCRETOS del registro de riesgos (AACE 40R-08: la contingencia reúne
//    incertidumbre y riesgo). Cada evento es Bernoulli(prob) × triangular, independiente. Para
//    no contar dos veces, los rangos de las partidas NO deben incluir esos eventos.

export interface RangeLine { id: string; name: string; ml: number; lowPct: number; highPct: number; basis?: string; }
// Evento de riesgo DISCRETO (registro de riesgos): ocurre con probabilidad `prob` (0..1) y, si ocurre, su
// impacto en costo es triangular (low ≤ likely ≤ high, valores POSITIVOS). `sign` = +1 amenaza (suma al costo),
// −1 oportunidad (lo reduce). Se simula como Bernoulli × triangular, independiente de las partidas y entre sí.
// La estimación base NO incluye estos eventos: por eso no hay «costo más probable» que restar (AACE 40R-08).
//
// Análisis INTEGRADO de costo y cronograma (AACE 40R-08 / 65R-11): un evento puede traer además su impacto en PLAZO
// (`days`, triangular, en días laborables) y las actividades del cronograma que retrasa (`targets`). Cuando el evento
// ocurre, el MISMO sorteo produce su costo directo y su retraso; el efecto sobre el fin del proyecto lo da el CPM real
// (`schedule.duration`), y cada día de extensión cuesta `schedule.costPerDay` (gastos generales, dirección, alquileres).
// Un evento sin costo (solo plazo) se expresa con low = likely = high = 0.
export interface RiskEventInput {
  id: string; name: string; prob: number; low: number; likely: number; high: number; sign: 1 | -1;
  days?: { low: number; likely: number; high: number }; targets?: string[];
}
export interface ScheduleSim {
  base: number;                                                       // duración del proyecto sin retrasos (días laborables)
  costPerDay: number;                                                 // costo de cada día de extensión del plazo (≥ 0)
  duration: (delta: Record<string, number>) => number | null;         // duración con esos retrasos por actividad (CPM real)
}
export interface RangeOptions { iterations?: number; seed?: number; correlation?: number; events?: RiskEventInput[]; schedule?: ScheduleSim; outcomes?: EventOutcomes; }
export interface ScheduleResult {
  base: number; costPerDay: number;
  p: Record<number, number>;        // duración del proyecto en los percentiles de PERCENTILES (días laborables)
  mean: number;
  probDelay: number;                // fracción de iteraciones en que el proyecto termina después de lo previsto (0..1)
  timeCostMean: number;             // costo medio de la extensión del plazo (0 si costPerDay = 0)
  events: number;                   // eventos que retrasan actividades del cronograma
}
export interface RangeResult {
  n: number;                        // partidas válidas simuladas
  excluded: number;                 // partidas inválidas que quedaron fuera
  events: number;                   // eventos de riesgo simulados
  eventsEV: number;                 // valor esperado neto de los eventos (Σ signo × prob × media de la triangular)
  iterations: number; seed: number; correlation: number;
  ml: number;                       // Σ costo más probable = estimado base del análisis
  mean: number; sd: number; min: number; max: number;
  p: Record<number, number>;        // costo total en los percentiles de PERCENTILES
  curve: number[];                  // costo total en P1..P99 (índice 0 = P1) para la curva S
  schedule: ScheduleResult | null;  // resultado de plazo (solo si se pasó `schedule`)
}

export const PERCENTILES = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95];
export const DEFAULT_ITERATIONS = 10000;
export const DEFAULT_SEED = 20260713;
export const DEFAULT_CORRELATION = 0.3;

const num = (v: unknown): number => Number(v);
const finite = (v: unknown): boolean => typeof v === "number" ? isFinite(v) : (typeof v === "string" && v.trim() !== "" && isFinite(Number(v)));

// Generador pseudoaleatorio determinista (mulberry32): mismos números para la misma semilla.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Φ(x): función de distribución normal estándar (Abramowitz & Stegun 7.1.26, error < 1,5e-7).
export function normCdf(x: number): number {
  const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}
// Inversa de la distribución triangular (a = mín, m = más probable, b = máx).
export function triInv(u: number, a: number, m: number, b: number): number {
  if (b <= a) return m;
  const c = (m - a) / (b - a);
  return u < c ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m));
}

// Una partida es simulable si su costo más probable es > 0 y su rango es coherente
// (el mínimo no supera al más probable, ni este al máximo; el mínimo no baja de −100 %).
export function lineProblems(l: RangeLine): string[] {
  const p: string[] = [];
  if (!finite(l.ml) || num(l.ml) <= 0) p.push("el costo más probable debe ser mayor que cero");
  if (!finite(l.lowPct) || num(l.lowPct) > 0 || num(l.lowPct) < -100) p.push("el mínimo debe estar entre −100 % y 0 % del más probable");
  if (!finite(l.highPct) || num(l.highPct) < 0) p.push("el máximo debe ser 0 % o más sobre el más probable");
  return p;
}

// Cuantil con interpolación lineal sobre un arreglo ORDENADO (p en 0..100).
function quantile(sorted: Float64Array, p: number): number {
  const pos = (sorted.length - 1) * p / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const daysOk = (d: RiskEventInput["days"]): boolean => !!d && isFinite(d.low) && isFinite(d.likely) && isFinite(d.high) && d.low >= 0 && d.low <= d.likely && d.likely <= d.high;
// Eventos que se pueden simular: probabilidad en (0, 1], impactos en costo coherentes (≥ 0, mín ≤ más probable ≤ máx) y signo ±1.
export function validEvents(events?: RiskEventInput[] | null): RiskEventInput[] {
  return (events || []).filter((e) => e && isFinite(e.prob) && e.prob > 0 && e.prob <= 1 && isFinite(e.low) && isFinite(e.likely) && isFinite(e.high) && e.low >= 0 && e.low <= e.likely && e.likely <= e.high && (e.sign === 1 || e.sign === -1));
}
const normIterations = (v: unknown): number => Math.max(1000, Math.min(200000, Math.floor(Number(v) || DEFAULT_ITERATIONS)));
const normSeed = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_SEED);

// Resultado de simular SOLO los eventos: por iteración, su costo directo neto y cuánto extienden el plazo. No depende de
// las partidas, de la correlación ni del costo por día, así que se calcula UNA vez y se reutiliza (el CPM es lo caro).
export interface EventOutcomes {
  iterations: number; seed: number;
  n: number;                        // eventos válidos simulados
  direct: Float64Array;             // costo directo neto de los eventos en cada iteración
  ext: Float64Array | null;         // extensión del plazo en cada iteración (días laborables; < 0 si acelera); null si no se simuló el plazo
  base: number; delayers: number;   // duración base y eventos que retrasan actividades
}
// Los eventos tienen su PROPIO flujo aleatorio: sus ocurrencias no dependen de cuántas partidas haya ni de la
// correlación, así que el mismo registro de riesgos da exactamente los mismos plazos en Costos y en el Registro de
// riesgos, y agregar o quitar partidas no cambia qué eventos ocurren. Por evento SIEMPRE se consumen tres números
// (ocurrencia, impacto en costo, impacto en plazo) aunque no ocurra, para que la secuencia no dependa de cuáles ocurren.
export function simulateEvents(events: RiskEventInput[] | null | undefined, schedule?: Pick<ScheduleSim, "base" | "duration"> | null, iterations?: number, seed?: number): EventOutcomes {
  const evs = validEvents(events), N = normIterations(iterations), S = normSeed(seed);
  const sim = schedule && isFinite(schedule.base) ? schedule : null;
  const direct = new Float64Array(N), ext = sim ? new Float64Array(N) : null, randE = mulberry32((S ^ 0x5bd1e995) >>> 0);
  for (let i = 0; i < N; i++) {
    let t = 0, delta: Record<string, number> | null = null;
    for (let j = 0; j < evs.length; j++) {
      const e = evs[j], occurs = randE() < e.prob, u = randE(), uT = randE();
      if (!occurs) continue;
      t += e.sign * triInv(u, e.low, e.likely, e.high);
      if (sim && daysOk(e.days) && e.targets && e.targets.length) {
        const d = e.sign * triInv(uT, (e.days as { low: number }).low, (e.days as { likely: number }).likely, (e.days as { high: number }).high);
        delta = delta || {};
        for (const id of e.targets) delta[id] = (delta[id] || 0) + d;
      }
    }
    direct[i] = t;
    if (sim && ext) { let dur = sim.base; if (delta) { const r = sim.duration(delta); if (r !== null) dur = r; } ext[i] = dur - sim.base; }
  }
  return { iterations: N, seed: S, n: evs.length, direct, ext, base: sim ? sim.base : 0, delayers: sim ? evs.filter((e) => daysOk(e.days) && e.targets && e.targets.length).length : 0 };
}

export function simulateRange(lines: RangeLine[] | null | undefined, opts?: RangeOptions): RangeResult | null {
  const o = opts || {};
  const iterations = normIterations(o.iterations), seed = normSeed(o.seed);
  const rho = Math.max(0, Math.min(1, o.correlation === undefined || !isFinite(o.correlation) ? DEFAULT_CORRELATION : o.correlation));
  const valid = (lines || []).filter((l) => l && lineProblems(l).length === 0);
  const evs = validEvents(o.events);
  if (!valid.length && !evs.length) return null;
  const sim = o.schedule && isFinite(o.schedule.base) ? o.schedule : null;
  const costPerDay = sim ? Math.max(0, Number(sim.costPerDay) || 0) : 0;
  // Los eventos se simulan aparte y una sola vez: si quien llama ya tiene sus resultados (mismos eventos, iteraciones y
  // semilla) los pasa en `outcomes` y no se vuelve a correr el CPM.
  const oc = o.outcomes, reuse = !!oc && oc.iterations === iterations && oc.seed === seed && oc.n === evs.length && (!sim || !!oc.ext);
  const eo: EventOutcomes | null = evs.length ? (reuse ? (oc as EventOutcomes) : simulateEvents(evs, sim, iterations, seed)) : null;
  const dir = eo ? eo.direct : null, ext = sim && eo ? eo.ext : null;
  const a = valid.map((l) => num(l.ml) * (1 + num(l.lowPct) / 100));
  const m = valid.map((l) => num(l.ml));
  const b = valid.map((l) => num(l.ml) * (1 + num(l.highPct) / 100));
  const ml = m.reduce((s, x) => s + x, 0);
  const rand = mulberry32(seed);
  // Normales estándar por Box–Muller (se usan las dos de cada par).
  let spare: number | null = null;
  const normal = (): number => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = rand();
    const v = rand(), r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
    spare = r * Math.sin(th); return r * Math.cos(th);
  };
  const sr = Math.sqrt(rho), se = Math.sqrt(1 - rho);
  const totals = new Float64Array(iterations), durs = sim ? new Float64Array(iterations) : null;
  let sum = 0, sumSq = 0, sumDur = 0, nDelayed = 0, timeCostSum = 0;
  for (let i = 0; i < iterations; i++) {
    const zc = normal();
    let t = 0;
    for (let j = 0; j < valid.length; j++) {
      if (b[j] <= a[j]) { t += m[j]; continue; }                       // sin incertidumbre: constante
      t += triInv(normCdf(sr * zc + se * normal()), a[j], m[j], b[j]);
    }
    if (dir) t += dir[i];
    if (sim && durs) {
      const x = ext ? ext[i] : 0, dur = sim.base + x;
      durs[i] = dur; sumDur += dur;
      if (x > 1e-9) nDelayed++;
      const cost = x * costPerDay; t += cost; timeCostSum += cost;
    }
    totals[i] = t; sum += t; sumSq += t * t;
  }
  const mean = sum / iterations, sd = Math.sqrt(Math.max(0, sumSq / iterations - mean * mean));
  const sorted = Float64Array.from(totals).sort();
  const p: Record<number, number> = {};
  PERCENTILES.forEach((q) => { p[q] = quantile(sorted, q); });
  const curve: number[] = [];
  for (let q = 1; q <= 99; q++) curve.push(quantile(sorted, q));
  const eventsEV = evs.reduce((s, e) => s + e.sign * e.prob * (e.low + e.likely + e.high) / 3, 0);
  let schedule: ScheduleResult | null = null;
  if (sim && durs) {
    const sd2 = Float64Array.from(durs).sort(), pd: Record<number, number> = {};
    PERCENTILES.forEach((q) => { pd[q] = quantile(sd2, q); });
    schedule = { base: sim.base, costPerDay, p: pd, mean: sumDur / iterations, probDelay: nDelayed / iterations, timeCostMean: timeCostSum / iterations, events: eo ? eo.delayers : 0 };
  }
  return { n: valid.length, excluded: (lines || []).length - valid.length, events: evs.length, eventsEV, iterations, seed, correlation: rho, ml, mean, sd, min: sorted[0], max: sorted[iterations - 1], p, curve, schedule };
}

// Contingencia = percentil de decisión − estimado base (Σ más probable). Nunca negativa: si el
// estimado base ya supera ese percentil no hace falta reserva, y se avisa con `covered`.
export function contingencyAt(res: RangeResult, percentile: number): { amount: number; raw: number; covered: boolean } {
  const pv = res.p[percentile] !== undefined ? res.p[percentile] : NaN;
  const raw = pv - res.ml;
  return { amount: Math.max(0, raw), raw, covered: raw < 0 };
}

// Avisos que orientan la revisión del análisis (no lo bloquean).
export function rangeAdvisories(
  lines: RangeLine[] | null | undefined, res: RangeResult | null, baseCost: number, classRange?: { lo: number; hi: number } | null
): string[] {
  const out: string[] = [], ls = lines || [];
  if (!ls.length) { out.push("Define las partidas del análisis para calcular la contingencia."); return out; }
  const bad = ls.filter((l) => lineProblems(l).length);
  if (bad.length) out.push(bad.length + " partida(s) con datos inválidos quedan fuera de la simulación: " + bad.slice(0, 3).map((l) => l.name || l.id).join(", ") + (bad.length > 3 ? "…" : "") + ".");
  if (!res) return out;
  if (baseCost > 0 && Math.abs(res.ml - baseCost) / baseCost > 0.01) out.push("Las partidas suman " + Math.round(res.ml).toLocaleString("es-PE") + " (" + (res.ml / baseCost * 100).toFixed(1) + " % del costo base " + Math.round(baseCost).toLocaleString("es-PE") + "): la contingencia solo cubre lo que las partidas cubren.");
  const noBasis = ls.filter((l) => !String(l.basis || "").trim()).length;
  if (noBasis) out.push(noBasis + " de " + ls.length + " partida(s) sin fundamento del rango: cada rango debe justificarse en el Basis of Estimate.");
  const flat = ls.filter((l) => !lineProblems(l).length && num(l.lowPct) === 0 && num(l.highPct) === 0).length;
  if (flat === res.n && res.events === 0) out.push("Ninguna partida tiene incertidumbre (mín = más probable = máx): la contingencia resulta 0.");
  else if (flat) out.push(flat + " partida(s) sin incertidumbre (rango 0 %): se tratan como costo fijo.");
  if (res.correlation === 0) out.push("Correlación 0 %: las partidas se tratan como independientes y la dispersión del total se SUBESTIMA (los errores de estimación suelen ir en la misma dirección).");
  // La exactitud de una clase describe TODA la incertidumbre del estimado (partidas + riesgos): se compara contra el total
  // simulado. Sin los eventos de riesgo el rango puede quedar estrecho simplemente porque falta esa parte.
  if (classRange && res.ml > 0) {
    const simHi = (res.p[90] - res.ml) / res.ml * 100;
    if (classRange.hi > 0 && simHi < classRange.hi * 0.4) out.push("El P90 queda a +" + simHi.toFixed(1) + " % del estimado base, mucho más estrecho que el rango típico de la clase (+" + classRange.hi + " %): revisa si los rangos por partida o la correlación son demasiado optimistas.");
  }
  return out;
}
