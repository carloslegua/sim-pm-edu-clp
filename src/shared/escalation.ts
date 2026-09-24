// Escalación de costos por índices y simulación Monte Carlo — lógica PURA (sin DOM ni `localStorage`), inlineada en cost.js.
//
// Auditoría metodológica (AACE International):
//   · RP 58R-10  Escalation Estimating Principles and Methods Using Indices
//   · RP 68R-11  Escalation Estimating Using Indices and Monte Carlo Simulation
//   · RP 34R-05  Basis of Estimate (la BOE documenta qué es escalación y qué no: ver boe.ts)
// Costos calculaba la escalación como base × ((1 + i)ⁿ − 1): UNA tasa, UN punto de gasto, sin distinguir cuentas de costo, sin
// mirar cuándo se gasta cada paquete y con el tipo de cambio mezclado en la misma línea.
//
// Lo que sigue de las prácticas (verificado en las páginas públicas de muestra de AACE; los textos completos son de pago):
//  · Relación básica (58R-10): $Escalación = $Estimado base · [ Índice(fecha objetivo) / Índice(fecha base del estimado) − 1 ].
//  · La escalación INCLUYE la inflación y EXCLUYE la contingencia y el tipo de cambio: se estiman y gestionan por separado (el tipo
//    de cambio se calcula aparte, `fxExposure`, y la BOE documenta qué cubre cada cuenta).
//  · Índices apropiados a CADA cuenta de costo (mano de obra, materiales, equipos, subcontratos), con su propia tendencia; el
//    índice de un paquete es la mezcla ponderada de sus cuentas («Matching Indices to Cost Accounts / Composite Indices»).
//  · El costo se reparte en el TIEMPO («Addressing Costs Over Time»): cada paquete se gasta a lo largo de sus fechas del
//    cronograma y cada período se escala desde la fecha base hasta SU fecha de gasto (método período a período, mensual).
//  · Las compras con PRECIO FIJADO por contrato dejan de escalar desde esa fecha (`lock`): la exposición termina cuando el precio se cierra.
//  · «Escalation on Contingency»: la contingencia también se gasta en el futuro; por omisión se escala junto con el costo base
//    (opción `onContingency`). El tratamiento exacto de 58R-10 no se pudo verificar: la opción es visible y se documenta.
//  · 68R-11: la incertidumbre se cuantifica con distribuciones (aquí, P50/P70/P80/P90) para que la dirección financie la cuenta según
//    su política. Variables del modelo: los ÍNDICES (tasa por cuenta, con correlación entre cuentas) y el CRONOGRAMA (el retraso
//    del análisis integrado de riesgo desplaza el gasto: más retraso, más escalación). Sin extrapolar tendencias pasadas: el
//    pronóstico de cada cuenta es un DATO que aporta quien sabe de economía (58R-10 lo recomienda expresamente).
//
// Decisiones y límites DECLARADOS (no proviene de la norma; ver ARCHITECTURE.md):
//  · Tasa anual por año calendario y por cuenta; dentro de un año el índice crece de forma compuesta continua: (1 + r)^(días/365).
//    Más allá del último año pronosticado se mantiene la última tasa (y se avisa).
//  · Incertidumbre del índice: un DESPLAZAMIENTO en puntos porcentuales de todas las tasas de la cuenta, triangular (mín, 0, máx),
//    correlacionado entre cuentas con un factor común (cópula gaussiana, igual que la contingencia por rangos). Es una elección de
//    este modelo: 68R-11 no publica distribuciones fijas en sus páginas de muestra.
//  · Retraso: el análisis integrado entrega días laborables de extensión por iteración; se convierten a calendario (× 7/5) y el gasto
//    se desplaza de forma PROGRESIVA (el retraso se acumula linealmente a lo largo del gasto: lo que ocurre al final se corre más).
//  · No se simulan la incertidumbre del costo (ya está en la contingencia, que se escala) ni la forma de la curva de gasto (lineal
//    por paquete, igual que el valor planificado del EVM).
import { DEFAULT_ITERATIONS, DEFAULT_SEED, PERCENTILES, mulberry32, normCdf, triInv } from "./range-estimating";

export const ACCOUNT_IDS = ["labor", "material", "equipment", "subcontract"] as const;
export const ACCOUNT_LABEL: Record<string, string> = { labor: "Mano de obra", material: "Materiales", equipment: "Equipos", subcontract: "Subcontratos" };
export type Provision = "central" | "p50" | "p70" | "p80" | "p90";
export const PROVISIONS: Provision[] = ["central", "p50", "p70", "p80", "p90"];
export const PROVISION_LABEL: Record<Provision, string> = {
  central: "Pronóstico central (determinístico)", p50: "P50 de la simulación", p70: "P70 de la simulación", p80: "P80 de la simulación", p90: "P90 de la simulación"
};
export const DEFAULT_MIX: Record<string, number> = { labor: 35, material: 35, equipment: 15, subcontract: 15 };
export const WORK_TO_CALENDAR = 7 / 5;

export interface EscAccount { id: string; rates: Record<string, number>; source: string; low: number; high: number; }
export interface EscPkgOverride { mix?: Record<string, number>; lock?: string; }
export interface EscPlan {
  method: "simple" | "indices"; baseDate: string; accounts: EscAccount[]; defaultMix: Record<string, number>;
  packages: Record<string, EscPkgOverride>; onContingency: boolean; provision: Provision; correlation: number;
}
export interface EscPackage { id: string; code: string; name: string; cost: number; start: string | null; end: string | null; }

// ---------- normalización ----------
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numOr = (v: unknown, d: number): number => { if (v === null || v === undefined || v === "" || typeof v === "boolean") return d; const n = Number(v); return isFinite(n) ? n : d; };
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY = 86400000;
// Día absoluto (días desde 1970) de una fecha ISO; null si no es una fecha válida.
export function dayNum(iso: unknown): number | null {
  const m = ISO.exec(String(iso || "")); if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return isFinite(t) && new Date(t).getUTCMonth() === +m[2] - 1 ? Math.round(t / DAY) : null;
}
export const isoOfDay = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);
const cleanMix = (v: unknown): Record<string, number> | undefined => {
  if (!isObj(v)) return undefined;
  const out: Record<string, number> = {}; let any = false;
  ACCOUNT_IDS.forEach((id) => { const n = numOr(v[id], 0); if (n > 0) { out[id] = n; any = true; } });
  return any ? out : undefined;
};

export function blankEscPlan(): EscPlan {
  return {
    method: "indices", baseDate: "", accounts: ACCOUNT_IDS.map((id) => ({ id, rates: {}, source: "", low: 0, high: 0 })),
    defaultMix: { ...DEFAULT_MIX }, packages: {}, onContingency: true, provision: "central", correlation: 0.5
  };
}
// Lee lo guardado. Un proyecto anterior (sin `method`) se lee como «simple»: sus cifras no cambian.
export function normalizeEscPlan(raw: unknown, baseDate = ""): EscPlan {
  const p = blankEscPlan(); p.baseDate = baseDate;
  if (!isObj(raw)) return p;
  p.method = raw.method === "indices" ? "indices" : "simple";
  const accs = Array.isArray(raw.accounts) ? raw.accounts.filter(isObj) : [];
  p.accounts = ACCOUNT_IDS.map((id) => {
    const a = accs.find((x) => x.id === id) || {}, rates: Record<string, number> = {};
    if (isObj(a.rates)) Object.keys(a.rates).forEach((y) => { const n = numOr(a.rates && (a.rates as Record<string, unknown>)[y], NaN); if (/^\d{4}$/.test(y) && isFinite(n) && (a.rates as Record<string, unknown>)[y] !== "") rates[y] = n; });
    const low = Math.min(0, numOr(a.low, 0)), high = Math.max(0, numOr(a.high, 0));
    return { id, rates, source: String(a.source == null ? "" : a.source), low, high };
  });
  const dm = cleanMix(raw.defaultMix); if (dm) p.defaultMix = dm;
  if (isObj(raw.packages)) Object.keys(raw.packages).forEach((k) => {
    const o = raw.packages && (raw.packages as Record<string, unknown>)[k]; if (!isObj(o)) return;
    const ov: EscPkgOverride = {}, mix = cleanMix(o.mix); if (mix) ov.mix = mix;
    if (typeof o.lock === "string" && dayNum(o.lock) !== null) ov.lock = o.lock;
    if (ov.mix || ov.lock) p.packages[k] = ov;
  });
  p.onContingency = raw.onContingency !== false;
  p.provision = PROVISIONS.indexOf(raw.provision as Provision) >= 0 ? raw.provision as Provision : "central";
  p.correlation = Math.max(0, Math.min(1, numOr(raw.correlation, 0.5)));
  return p;
}

// ---------- método elemental y tipo de cambio ----------
// Escalación elemental: UNA tasa compuesta y UN punto de gasto (n años). Solo sirve para un pago único: 58R-10 pide cuentas,
// tiempo y pronósticos de índices cuando el proyecto es largo o su definición ya es madura.
export const simpleEscalation = (base: number, ratePct: number, years: number): number => base * (Math.pow(1 + ratePct / 100, years) - 1);
// Exposición cambiaria (aparte de la escalación: 58R-10 recomienda segregarlos): solo con régimen flotante.
export const fxExposure = (base: number, sharePct: number, bandPct: number, floating: boolean): number => (floating ? base * (sharePct / 100) * (bandPct / 100) : 0);

// ---------- índices ----------
interface YearSeg { y: number; start: number; end: number; days: number; }   // desplazamientos en días desde la fecha base
function yearSegs(baseDay: number, lastDay: number): YearSeg[] {
  const out: YearSeg[] = [], y0 = new Date(baseDay * DAY).getUTCFullYear(), y1 = new Date(lastDay * DAY).getUTCFullYear();
  for (let y = y0; y <= y1; y++) { const s = Date.UTC(y, 0, 1) / DAY, e = Date.UTC(y + 1, 0, 1) / DAY; out.push({ y, start: Math.max(0, s - baseDay), end: e - baseDay, days: e - s }); }
  return out;
}
// Tasa (%) de la cuenta para el año y: la definida; si no, la última definida antes; si no hay ninguna anterior, la primera definida.
export function rateFor(rates: Record<string, number>, y: number): number | null {
  const ys = Object.keys(rates).map(Number).sort((a, b) => a - b);
  if (!ys.length) return null;
  if (rates[String(y)] !== undefined) return rates[String(y)];
  let prev: number | null = null; ys.forEach((k) => { if (k < y) prev = k; });
  return rates[String(prev === null ? ys[0] : prev)];
}
const lnGrowth = (ratePct: number, delta: number): number => Math.log(Math.max(0.01, 1 + (ratePct + delta) / 100));
// ln del índice en el desplazamiento x (días desde la fecha base; índice = 1 en la fecha base) con crecimiento compuesto continuo por año.
function lnIndex(g: number[], segs: YearSeg[], x: number): number {
  let s = 0;
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i]; if (x <= sg.start) break;
    s += g[i] * (Math.min(x, sg.end) - sg.start) / sg.days;
  }
  return s;
}
// Índice de la cuenta en una fecha (base = 1,00): para mostrar la tabla de índices y para las pruebas.
export function indexAt(rates: Record<string, number>, baseDate: string, date: string, deltaPP = 0): number | null {
  const b = dayNum(baseDate), d = dayNum(date);
  if (b === null || d === null || !Object.keys(rates).length) return null;
  const segs = yearSegs(b, Math.max(b, d) + 1), g = segs.map((s) => lnGrowth(rateFor(rates, s.y) as number, deltaPP));
  return Math.exp(lnIndex(g, segs, Math.max(0, d - b)));
}

// ---------- núcleo de cálculo (el mismo para el pronóstico central y para cada iteración de la simulación) ----------
interface Bucket { p: number; x: number; w: number; lock: number; }        // p = paquete; x = fecha media del período (días desde la base); w = parte del costo del paquete
interface Kernel {
  baseDay: number; segs: YearSeg[]; accs: EscAccount[]; buckets: Bucket[]; cost: number[]; mix: number[][];
  x0: number; x1: number; total: number; pkgs: EscPackage[]; undated: string[]; baseYear: number;
}
export interface Advisory { code: string; severity: "riesgo" | "aviso" | "info"; text: string; }
interface KernelResult { k: Kernel | null; adv: Advisory[]; }

const monthEnd = (day: number): number => { const d = new Date(day * DAY); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY; };
// Reparte el costo de cada paquete en períodos MENSUALES a lo largo de sus fechas (lineal, como el valor planificado) y ubica cada
// período en el punto medio de su tramo. Un paquete sin fechas no se puede ubicar en el tiempo: se coloca en la fecha media del gasto.
function buildKernel(plan: EscPlan, pkgsIn: EscPackage[], maxShiftDays: number): KernelResult {
  const adv: Advisory[] = [], pkgs = pkgsIn.filter((p) => isFinite(p.cost) && p.cost > 0);
  const baseDay = dayNum(plan.baseDate);
  if (baseDay === null) { adv.push({ code: "X1", severity: "riesgo", text: "Falta la fecha base de precios (pestaña 02, Basis of Estimate): sin ella no se puede calcular la escalación por índices, que mide el cambio de precio DESDE esa fecha." }); return { k: null, adv }; }
  const accs = plan.accounts.filter((a) => Object.keys(a.rates).length > 0);
  if (!accs.length) { adv.push({ code: "X2", severity: "riesgo", text: "Ninguna cuenta de costo tiene pronóstico de índice: la escalación por índices necesita la tasa anual esperada de cada cuenta (dato de un economista o de una fuente reconocida, no una extrapolación)." }); return { k: null, adv }; }
  if (!pkgs.length) { adv.push({ code: "X7", severity: "riesgo", text: "No hay paquetes con costo y fechas del cronograma: la escalación por índices reparte el costo en el tiempo y necesita saber cuándo se gasta." }); return { k: null, adv }; }
  const datedIdx: number[] = [], span = pkgs.map((p) => { const s = dayNum(p.start), e = dayNum(p.end); return s !== null && e !== null && e >= s ? { s, e } : null; });
  span.forEach((s, i) => { if (s) datedIdx.push(i); });
  if (!datedIdx.length) { adv.push({ code: "X7", severity: "riesgo", text: "Ningún paquete tiene fechas en el cronograma: define las actividades y sus enlaces (Cronograma/CPM) para repartir el costo en el tiempo." }); return { k: null, adv }; }
  const totDated = datedIdx.reduce((s, i) => s + pkgs[i].cost, 0);
  const mid = datedIdx.reduce((s, i) => s + pkgs[i].cost * ((span[i] as { s: number; e: number }).s + (span[i] as { s: number; e: number }).e) / 2, 0) / totDated;
  const undated = pkgs.filter((_, i) => !span[i]).map((p) => p.code || p.name);
  const buckets: Bucket[] = [];
  const lockOf = (p: EscPackage): number => { const o = plan.packages[p.id], d = o && o.lock ? dayNum(o.lock) : null; return d === null ? Infinity : d - baseDay; };
  pkgs.forEach((p, i) => {
    const lock = lockOf(p), sp = span[i];
    if (!sp) { buckets.push({ p: i, x: mid - baseDay, w: 1, lock }); return; }
    const len = sp.e - sp.s + 1;
    for (let d0 = sp.s; d0 <= sp.e;) {
      const d1 = Math.min(sp.e + 1, monthEnd(d0));                      // tramo [d0, d1) dentro del mes
      buckets.push({ p: i, x: (d0 + d1) / 2 - baseDay - 0.5, w: (d1 - d0) / len, lock });
      d0 = d1;
    }
  });
  const xs = buckets.map((b) => b.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const segs = yearSegs(baseDay, baseDay + Math.max(0, x1) + Math.max(0, maxShiftDays) + 366);
  const mix = pkgs.map((p) => {
    const o = plan.packages[p.id], m = (o && o.mix) || plan.defaultMix, tot = ACCOUNT_IDS.reduce((s, id) => s + Math.max(0, m[id] || 0), 0);
    return accs.map((a) => (tot > 0 ? Math.max(0, m[a.id] || 0) / tot : 1 / ACCOUNT_IDS.length));
  });
  const k: Kernel = { baseDay, segs, accs, buckets, cost: pkgs.map((p) => p.cost), mix, x0, x1, total: pkgs.reduce((s, p) => s + p.cost, 0), pkgs, undated, baseYear: new Date(baseDay * DAY).getUTCFullYear() };
  return { k, adv };
}

interface KernelEval { total: number; byAcc: number[]; byPkg: number[]; byYear: Record<number, { base: number; esc: number }>; midX: number; }
function evalKernel(k: Kernel, delta: number[] | null, delayCal: number, detail: boolean): KernelEval {
  const A = k.accs.length, g: number[][] = k.accs.map((a, ai) => k.segs.map((s) => lnGrowth(rateFor(a.rates, s.y) as number, delta ? delta[ai] : 0)));
  const byAcc = new Array<number>(A).fill(0), byPkg = detail ? new Array<number>(k.pkgs.length).fill(0) : [], byYear: Record<number, { base: number; esc: number }> = {};
  let total = 0, mw = 0, mc = 0;
  const span = k.x1 - k.x0;
  for (let b = 0; b < k.buckets.length; b++) {
    const bk = k.buckets[b], c = k.cost[bk.p] * bk.w;
    let xe = bk.x;
    if (delayCal !== 0) xe += delayCal * (span > 0 ? Math.min(1, Math.max(0, (bk.x - k.x0) / span)) : 1);
    if (xe > bk.lock) xe = bk.lock;                                  // precio fijado: el índice deja de correr
    if (xe < 0) xe = 0;                                              // gasto anterior a la fecha base: sin escalación
    let e = 0;
    for (let a = 0; a < A; a++) { const w = k.mix[bk.p][a]; if (w > 0) { const v = c * w * (Math.exp(lnIndex(g[a], k.segs, xe)) - 1); byAcc[a] += v; e += v; } }
    total += e;
    if (detail) {
      byPkg[bk.p] += e;
      const yr = new Date((k.baseDay + bk.x) * DAY).getUTCFullYear(), y = byYear[yr] || (byYear[yr] = { base: 0, esc: 0 });
      y.base += c; y.esc += e; mw += c * bk.x; mc += c;
    }
  }
  return { total, byAcc, byPkg, byYear, midX: mc > 0 ? mw / mc : 0 };
}

export interface EscResult {
  ok: boolean; base: number; esc: number; factor: number; advisories: Advisory[];
  byAccount: Array<{ id: string; label: string; base: number; esc: number; pct: number }>;
  byPackage: Array<{ id: string; code: string; name: string; cost: number; esc: number; pct: number; from: string | null; to: string | null; lock: string | null; locked: boolean; undated: boolean }>;
  byYear: Array<{ year: number; base: number; esc: number }>;
  midDate: string | null; horizonYears: number[]; undated: string[];
}
const emptyResult = (adv: Advisory[], base: number): EscResult => ({ ok: false, base, esc: 0, factor: 0, advisories: adv, byAccount: [], byPackage: [], byYear: [], midDate: null, horizonYears: [], undated: [] });

// Años que cubre el gasto (desde el de la fecha base): las columnas de la tabla de pronósticos.
export function horizonYears(baseDate: string, pkgs: EscPackage[]): number[] {
  const b = dayNum(baseDate); if (b === null) return [];
  const y0 = new Date(b * DAY).getUTCFullYear();
  let y1 = y0 + 1;
  pkgs.forEach((p) => { const e = dayNum(p.end); if (e !== null) y1 = Math.max(y1, new Date(e * DAY).getUTCFullYear()); });
  const out: number[] = []; for (let y = y0; y <= y1 + 1; y++) out.push(y);
  return out;
}

// Escalación del pronóstico CENTRAL (sin incertidumbre): $Escalación = Σ costo del período × [Índice(fecha de gasto) / Índice(fecha base) − 1],
// con el índice de cada paquete = mezcla ponderada de sus cuentas.
export function escalate(plan: EscPlan, pkgs: EscPackage[]): EscResult {
  const base = pkgs.reduce((s, p) => s + (isFinite(p.cost) && p.cost > 0 ? p.cost : 0), 0);
  const { k, adv } = buildKernel(plan, pkgs, 0);
  if (!k) return emptyResult(adv, base);
  const r = evalKernel(k, null, 0, true), advisories = adv.slice();
  const totalDated = k.total;
  const accBase = k.accs.map((_, ai) => k.pkgs.reduce((s, p, pi) => s + p.cost * k.mix[pi][ai], 0));
  const lockDay = (p: EscPackage): number | null => { const o = plan.packages[p.id]; return o && o.lock ? dayNum(o.lock) : null; };
  const byPackage = k.pkgs.map((p, i) => {
    const l = lockDay(p), e = dayNum(p.end);
    return { id: p.id, code: p.code, name: p.name, cost: p.cost, esc: r.byPkg[i], pct: p.cost > 0 ? r.byPkg[i] / p.cost * 100 : 0, from: p.start, to: p.end, lock: l !== null ? isoOfDay(l) : null, locked: l !== null && (e === null || l < e), undated: k.undated.indexOf(p.code || p.name) >= 0 };
  });
  if (k.undated.length) advisories.push({ code: "X6", severity: "aviso", text: k.undated.length + " paquete(s) sin fechas en el cronograma (" + k.undated.slice(0, 4).join(", ") + (k.undated.length > 4 ? "…" : "") + "): se ubican en la fecha media del gasto del proyecto." });
  // Cuentas con peso en la composición de algún paquete pero sin pronóstico: esa parte del costo no se puede escalar.
  const weight = (p: EscPackage, id: string): number => { const o = plan.packages[p.id], m = (o && o.mix) || plan.defaultMix; return m[id] || 0; };
  const noRates = plan.accounts.filter((a) => !Object.keys(a.rates).length && k.pkgs.some((p) => weight(p, a.id) > 0));
  if (noRates.length) advisories.push({ code: "X3", severity: "aviso", text: "Con peso en la composición pero sin pronóstico de índice: " + noRates.map((a) => ACCOUNT_LABEL[a.id]).join(", ") + ". Esa parte del costo NO se escala: completa el pronóstico o ajusta la composición." });
  const noSrc = k.accs.filter((a) => !a.source.trim());
  if (noSrc.length) advisories.push({ code: "X5", severity: "aviso", text: "Sin fuente del pronóstico: " + noSrc.map((a) => ACCOUNT_LABEL[a.id]).join(", ") + ". 58R-10 recomienda que los índices provengan de un economista o de una fuente reconocida y que se documenten; no extrapoles tendencias pasadas." });
  const lastSpendYear = new Date((k.baseDay + k.x1) * DAY).getUTCFullYear();
  const short = k.accs.filter((a) => Math.max(...Object.keys(a.rates).map(Number)) < lastSpendYear);
  if (short.length) advisories.push({ code: "X4", severity: "aviso", text: "El pronóstico de " + short.map((a) => ACCOUNT_LABEL[a.id]).join(", ") + " no llega al último año de gasto (" + lastSpendYear + "): se mantiene su última tasa." });
  if (k.x0 < 0) advisories.push({ code: "X11", severity: "aviso", text: "Hay gasto anterior a la fecha base de precios: ese tramo no se escala. La fecha base debe ser la de los precios del estimado y no posterior al primer gasto." });
  const lockedEarly = byPackage.filter((p) => p.lock && dayNum(p.lock) !== null && (dayNum(p.lock) as number) < k.baseDay);
  if (lockedEarly.length) advisories.push({ code: "X15", severity: "info", text: "Precio fijado antes de la fecha base en " + lockedEarly.map((p) => p.code).join(", ") + ": no tienen escalación." });
  return {
    ok: true, base: totalDated, esc: r.total, factor: totalDated > 0 ? r.total / totalDated : 0, advisories,
    byAccount: k.accs.map((a, ai) => ({ id: a.id, label: ACCOUNT_LABEL[a.id], base: accBase[ai], esc: r.byAcc[ai], pct: accBase[ai] > 0 ? r.byAcc[ai] / accBase[ai] * 100 : 0 })),
    byPackage,
    byYear: Object.keys(r.byYear).map(Number).sort((a, b) => a - b).map((y) => ({ year: y, base: r.byYear[y].base, esc: r.byYear[y].esc })),
    midDate: isoOfDay(Math.round(k.baseDay + r.midX)), horizonYears: horizonYears(plan.baseDate, pkgs), undated: k.undated
  };
}

// ---------- Monte Carlo (68R-11) ----------
export interface EscSimOptions { iterations?: number; seed?: number; delaysWork?: Float64Array | null; workToCalendar?: number; }
export interface EscSim {
  iterations: number; seed: number; correlation: number;
  mean: number; sd: number; min: number; max: number;
  p: Record<number, number>;               // factor de escalación (fracción del costo) en los percentiles de PERCENTILES
  curve: number[];                         // P1..P99
  det: number;                             // factor del pronóstico central
  probAtOrBelowDet: number;                // fracción de iteraciones con factor ≤ el central
  withDelay: boolean; delayMeanCal: number; delayP80Cal: number;
  uncertainAccounts: number;               // cuentas con rango de incertidumbre (mín ≠ máx)
}
function quantile(sorted: Float64Array, p: number): number {
  const pos = (sorted.length - 1) * p / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function simulateEscalation(plan: EscPlan, pkgs: EscPackage[], o: EscSimOptions = {}): EscSim | null {
  const N = Math.max(1000, Math.min(200000, Math.floor(Number(o.iterations) || DEFAULT_ITERATIONS))), seed = typeof o.seed === "number" && isFinite(o.seed) ? o.seed : DEFAULT_SEED;
  const w2c = o.workToCalendar && o.workToCalendar > 0 ? o.workToCalendar : WORK_TO_CALENDAR;
  const dl = o.delaysWork && o.delaysWork.length === N ? o.delaysWork : null;
  let maxDelay = 0; if (dl) for (let i = 0; i < N; i++) if (dl[i] * w2c > maxDelay) maxDelay = dl[i] * w2c;
  const { k } = buildKernel(plan, pkgs, maxDelay);
  if (!k) return null;
  const det = evalKernel(k, null, 0, false).total / k.total;
  const rho = plan.correlation, sr = Math.sqrt(rho), se = Math.sqrt(1 - rho), A = k.accs.length;
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  let spare: number | null = null;
  const normal = (): number => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = rand();
    const v = rand(), r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
    spare = r * Math.sin(th); return r * Math.cos(th);
  };
  const out = new Float64Array(N), delta = new Array<number>(A).fill(0), delays = dl ? new Float64Array(N) : null;
  let sum = 0, below = 0;
  for (let i = 0; i < N; i++) {
    const zc = normal();
    for (let a = 0; a < A; a++) {
      const z = normal(), acc = k.accs[a];                            // siempre se consume una normal por cuenta: la secuencia no depende de cuáles tienen rango
      const lo = Math.min(0, acc.low), hi = Math.max(0, acc.high);
      delta[a] = hi > lo ? triInv(normCdf(sr * zc + se * z), lo, 0, hi) : 0;
    }
    const d = dl ? dl[i] * w2c : 0;
    if (delays) delays[i] = d;
    const f = evalKernel(k, delta, d, false).total / k.total;
    out[i] = f; sum += f; if (f <= det + 1e-12) below++;
  }
  const mean = sum / N;
  let ss = 0; for (let i = 0; i < N; i++) ss += (out[i] - mean) * (out[i] - mean);   // dos pasadas: sin la cancelación de E[x²] − E[x]²
  const sd = Math.sqrt(ss / N);
  const sorted = Float64Array.from(out).sort();
  const p: Record<number, number> = {}; PERCENTILES.forEach((q) => { p[q] = quantile(sorted, q); });
  const curve: number[] = []; for (let q = 1; q <= 99; q++) curve.push(quantile(sorted, q));
  let dMean = 0, dP80 = 0;
  if (delays) { dMean = delays.reduce((s, x) => s + x, 0) / N; dP80 = quantile(Float64Array.from(delays).sort(), 80); }
  return { iterations: N, seed, correlation: rho, mean, sd, min: sorted[0], max: sorted[N - 1], p, curve, det, probAtOrBelowDet: below / N, withDelay: !!dl, delayMeanCal: dMean, delayP80Cal: dP80, uncertainAccounts: k.accs.filter((a) => Math.max(0, a.high) > Math.min(0, a.low)).length };
}

// Factor de escalación que se financia: el central o un percentil de la simulación.
export function provisionFactor(plan: EscPlan, res: EscResult, sim: EscSim | null): { factor: number; label: string } {
  if (plan.provision === "central" || !sim) return { factor: res.factor, label: plan.provision === "central" ? "pronóstico central" : "pronóstico central (sin simulación)" };
  const q = Number(plan.provision.slice(1));
  return { factor: sim.p[q], label: "P" + q + " de la simulación" };
}

// Avisos que orientan la revisión (no bloquean el cálculo). `ctx.classNum`: clase AACE del estimado (1 = más definido).
export function escalationAdvisories(plan: EscPlan, res: EscResult, sim: EscSim | null, ctx: { classNum?: number; riskTitles?: string[]; hasSchedule?: boolean } = {}): Advisory[] {
  const out = res.advisories.slice();
  if (sim) {
    if (!sim.uncertainAccounts) out.push({ code: "X9", severity: "info", text: "Sin incertidumbre definida en los índices (mín = máx = 0): la simulación solo refleja el retraso del cronograma. 68R-11 pide que el estimador cuantifique la incertidumbre de la escalación (una distribución o un rango P10/P90)." });
    if (!sim.withDelay) out.push({ code: "X10", severity: "info", text: "La simulación no incluye el retraso del cronograma (no hay eventos de riesgo con impacto en plazo ubicados en actividades): la escalación crece con el atraso, y esa variable queda fuera." });
  }
  if (!plan.onContingency) out.push({ code: "X12", severity: "info", text: "La contingencia no se escala. 58R-10 trata «Escalation on Contingency» como un tema propio: la contingencia también se gasta en el futuro." });
  const rk = (ctx.riskTitles || []).filter((t) => /precio|inflaci|escalaci|costo de (los )?materiales|acero|combustible/i.test(t));
  if (rk.length) out.push({ code: "X14", severity: "info", text: "Riesgo(s) del registro que podrían solaparse con la escalación (" + rk.slice(0, 2).join("; ") + "): la contingencia excluye la escalación (58R-10). Define en la BOE qué cubre cada cuenta: la tendencia general de precios va aquí; el evento específico (p. ej. un choque de suministro) solo por lo que exceda esa tendencia." });
  return out;
}
export function simpleMethodAdvisory(classNum: number | undefined): Advisory | null {
  return classNum !== undefined && classNum <= 3
    ? { code: "X13", severity: "aviso", text: "El método simple usa UNA tasa y UN punto de gasto: solo es razonable en estimados de orden de magnitud (clases 4–5). Con un estimado de clase " + classNum + " usa la escalación por índices (58R-10)." }
    : null;
}
