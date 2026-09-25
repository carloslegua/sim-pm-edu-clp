// Valor Ganado (EVM) -- lógica PURA compartida en tiempo de COMPILACIÓN (Vite la inlinea en evm.js).
//
// Base metodológica (PMI / PMBOK, Practice Standard for Earned Value Management; AACE):
//  · PV (valor planificado) = el trabajo presupuestado que debía estar hecho a la fecha de corte, según la LÍNEA BASE del
//    cronograma y del costo: el costo de cada paquete de trabajo se distribuye en el tiempo sobre las fechas de su línea base
//    (aquí, linealmente entre el inicio más temprano y el fin más tardío de sus actividades).
//  · EV (valor ganado) = el presupuesto del trabajo REALMENTE completado, con una TÉCNICA de medición por paquete: 0/100
//    (al completar), 50/50 (inicio/fin), % físico avanzado, o LOE (nivel de esfuerzo: se «gana» a medida que pasa el tiempo,
//    EV = PV). LOE distorsiona los índices: se avisa su peso.
//  · AC (costo real) = lo gastado por ese trabajo a la fecha de corte.
//  · CV = EV − AC · SV = EV − PV · CPI = EV / AC · SPI = EV / PV.
//  · Pronóstico: EAC según el supuesto -- (típico) BAC / CPI si la variación actual es representativa; (atípico) AC + (BAC − EV)
//    si fue un hecho aislado; (combinado) AC + (BAC − EV) / (CPI × SPI) si el costo y el plazo influyen en el remanente.
//    ETC = EAC − AC · VAC = BAC − EAC · TCPI = (BAC − EV) / (BAC − AC) [a BAC] o (BAC − EV) / (EAC − AC) [a EAC].
//  · CRONOGRAMA GANADO (Earned Schedule, Lipke): el SPI en dinero tiende a 1 al final aunque el proyecto termine tarde. ES es el
//    tiempo en que el PV era igual al EV de hoy; SPI(t) = ES / AT y SV(t) = ES − AT están en tiempo, y la duración pronosticada es
//    PD / SPI(t). Por eso se muestran junto al SPI y al SV en dinero.
//  · El BAC del EVM es el costo del TRABAJO distribuido (la línea base de desempeño); la contingencia y la reserva de gestión
//    no se distribuyen al trabajo: se comparan con el sobrecosto pronosticado (VAC), que es para lo que existen.

export type EvTechnique = "cero_cien" | "cincuenta" | "fisico" | "loe";
export const TECHNIQUE_LABEL: Record<EvTechnique, string> = {
  cero_cien: "0/100 (al completar)", cincuenta: "50/50 (inicio/fin)", fisico: "% físico avanzado", loe: "LOE (nivel de esfuerzo)"
};
export const TECHNIQUES: EvTechnique[] = ["cero_cien", "cincuenta", "fisico", "loe"];
// La técnica que declara el Plan de Gestión de Costos (texto libre de sus opciones) → técnica del módulo. «Hitos ponderados» y
// «Apportioned effort» necesitan datos que este módulo no captura (pesos por hito, trabajo de referencia): se aplican como % físico y se avisa.
export function techniqueFromPlan(label: unknown): { technique: EvTechnique; approximated: boolean } {
  const t = String(label || "").toLowerCase();
  if (/0\/100/.test(t)) return { technique: "cero_cien", approximated: false };
  if (/50\/50/.test(t)) return { technique: "cincuenta", approximated: false };
  if (/loe|nivel de esfuerzo/.test(t)) return { technique: "loe", approximated: false };
  if (/hitos|apportion/.test(t)) return { technique: "fisico", approximated: true };
  return { technique: "fisico", approximated: false };
}

export interface EvmPackage { id: string; code: string; name: string; bac: number; es: number | null; ef: number | null; }
export interface EvmInput {
  packages: EvmPackage[];
  percent: Record<string, number | null | undefined>;            // avance físico 0..100 por paquete
  ac: Record<string, number | null | undefined>;                 // costo real acumulado por paquete
  techniques: Record<string, EvTechnique | undefined>;          // técnica por paquete (por omisión, `defaultTechnique`)
  defaultTechnique: EvTechnique;
  statusOffset: number;                                          // días laborables transcurridos a la fecha de corte (AT)
  projectDuration: number;                                       // duración planificada (PD), días laborables
}

const num = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const div = (a: number, b: number): number | null => (b > 1e-9 || b < -1e-9 ? a / b : null);

// Fracción del paquete que debía estar hecha al día t (lineal sobre su intervalo [es, ef]; sin duración = escalón en es).
export function plannedFraction(p: { es: number | null; ef: number | null }, t: number): number {
  if (p.es === null || p.ef === null) return 0;
  if (p.ef - p.es <= 1e-9) return t >= p.es - 1e-9 ? 1 : 0;
  return clamp((t - p.es) / (p.ef - p.es), 0, 1);
}
export const pvAt = (pkgs: EvmPackage[], t: number): number => pkgs.reduce((s, p) => s + p.bac * plannedFraction(p, t), 0);
// PV acumulado al final de cada día laborable 0..D (índice = día): la curva S de la línea base.
export function pvCurve(pkgs: EvmPackage[], duration: number): number[] {
  const D = Math.max(1, Math.ceil(duration - 1e-9)), out: number[] = [];
  for (let t = 0; t <= D; t++) out.push(pvAt(pkgs, t));
  return out;
}
// Cronograma ganado: el tiempo en que el PV acumulado igualaba al EV de hoy (interpolación lineal sobre la curva).
export function earnedSchedule(curve: number[], ev: number): number {
  const D = curve.length - 1;
  if (!(ev > 1e-9)) return 0;
  if (ev >= curve[D] - 1e-9) return D;
  let c = 0; while (c < D && curve[c + 1] <= ev + 1e-12) c++;
  const d = curve[c + 1] - curve[c];
  return c + (d > 1e-12 ? (ev - curve[c]) / d : 0);
}

export function creditFor(technique: EvTechnique, percent: number, plannedFrac: number): number {
  const p = clamp(percent, 0, 100);
  if (technique === "cero_cien") return p >= 100 ? 1 : 0;
  if (technique === "cincuenta") return p >= 100 ? 1 : p > 0 ? 0.5 : 0;
  if (technique === "loe") return plannedFrac;
  return p / 100;
}

export interface EvmRow {
  id: string; code: string; name: string; bac: number; technique: EvTechnique;
  plannedPct: number; percent: number | null; pv: number; ev: number; ac: number;
  cv: number; sv: number; cpi: number | null; spi: number | null; reported: boolean;
}
export interface Forecast { typical: number | null; atypical: number; combined: number | null; }
export interface EvmResult {
  bac: number; pv: number; ev: number; ac: number;
  cv: number; sv: number; cpi: number | null; spi: number | null; svPct: number | null;
  eac: Forecast; etc: Forecast; vac: Forecast; tcpiBac: number | null; tcpiEac: number | null;
  percentPlanned: number; percentComplete: number; percentSpent: number;
  at: number; es: number; svT: number; spiT: number | null; ieacT: number | null;      // en tiempo (días laborables)
  loeShare: number;                                                                       // % del BAC medido por LOE (distorsiona los índices)
  rows: EvmRow[]; unscheduled: EvmPackage[]; unreported: number;
  curve: number[];
}

export function evmCompute(inp: EvmInput): EvmResult {
  const scheduled = inp.packages.filter((p) => p.es !== null && p.ef !== null && p.bac > 0), unscheduled = inp.packages.filter((p) => (p.es === null || p.ef === null) && p.bac > 0);
  const t = Math.max(0, inp.statusOffset);
  const rows: EvmRow[] = scheduled.map((p) => {
    const frac = plannedFraction(p, t), tech = inp.techniques[p.id] || inp.defaultTechnique;
    const pctRaw = inp.percent[p.id], reported = pctRaw !== null && pctRaw !== undefined && pctRaw !== ("" as unknown);
    const percent = reported ? clamp(num(pctRaw), 0, 100) : null, ac = Math.max(0, num(inp.ac[p.id]));
    const pv = p.bac * frac, ev = p.bac * creditFor(tech, percent === null ? 0 : percent, frac);
    return { id: p.id, code: p.code, name: p.name, bac: p.bac, technique: tech, plannedPct: frac * 100, percent, pv, ev, ac, cv: ev - ac, sv: ev - pv, cpi: div(ev, ac), spi: div(ev, pv), reported };
  });
  const bac = rows.reduce((s, r) => s + r.bac, 0), pv = rows.reduce((s, r) => s + r.pv, 0), ev = rows.reduce((s, r) => s + r.ev, 0), ac = rows.reduce((s, r) => s + r.ac, 0);
  const cpi = div(ev, ac), spi = div(ev, pv), cv = ev - ac, sv = ev - pv;
  // pronósticos
  const eacTyp = cpi !== null && cpi > 0 ? bac / cpi : null, eacAty = ac + (bac - ev);
  const both = cpi !== null && spi !== null && cpi * spi > 0 ? cpi * spi : null, eacCom = both !== null ? ac + (bac - ev) / both : null;
  const fc = (x: number | null): number | null => x;
  const eac: Forecast = { typical: fc(eacTyp), atypical: eacAty, combined: fc(eacCom) };
  const etc: Forecast = { typical: eacTyp === null ? null : eacTyp - ac, atypical: eacAty - ac, combined: eacCom === null ? null : eacCom - ac };
  const vac: Forecast = { typical: eacTyp === null ? null : bac - eacTyp, atypical: bac - eacAty, combined: eacCom === null ? null : bac - eacCom };
  const tcpiBac = div(bac - ev, bac - ac), tcpiEac = eacTyp === null ? null : div(bac - ev, eacTyp - ac);
  // cronograma ganado
  const curve = pvCurve(scheduled, Math.max(inp.projectDuration, ...scheduled.map((p) => p.ef as number), 1));
  const es = earnedSchedule(curve, ev), spiT = t > 1e-9 ? es / t : null;
  const ieacT = spiT !== null && spiT > 0 ? inp.projectDuration / spiT : null;
  const loeBac = rows.filter((r) => r.technique === "loe").reduce((s, r) => s + r.bac, 0);
  return {
    bac, pv, ev, ac, cv, sv, cpi, spi, svPct: div(sv, pv) === null ? null : (sv / pv) * 100,
    eac, etc, vac, tcpiBac, tcpiEac,
    percentPlanned: bac > 0 ? pv / bac * 100 : 0, percentComplete: bac > 0 ? ev / bac * 100 : 0, percentSpent: bac > 0 ? ac / bac * 100 : 0,
    at: t, es, svT: es - t, spiT, ieacT, loeShare: bac > 0 ? loeBac / bac * 100 : 0,
    rows, unscheduled, unreported: rows.filter((r) => !r.reported && r.ev === 0 && r.pv > 0).length, curve
  };
}

// ---- umbrales y semáforo ----
export type Level = "verde" | "ambar" | "rojo";
export interface EvmThresholds { cpiWarn: number; cpiEsc: number; cvWarn: number; cvEsc: number; spiGreen: number; spiRed: number; svGreenPct: number; svRedPct: number; }
export const DEFAULT_THRESHOLDS: EvmThresholds = { cpiWarn: 0.95, cpiEsc: 0.90, cvWarn: -50000, cvEsc: -100000, spiGreen: 0.95, spiRed: 0.90, svGreenPct: -5, svRedPct: -10 };
// Plan de Gestión de Costos: desfavorable POR DEBAJO; alerta si valor ≤ umbral de alerta, escalamiento si ≤ umbral de escalamiento.
export const costLevel = (v: number | null, warn: number, esc: number): Level | null => (v === null ? null : v <= esc ? "rojo" : v <= warn ? "ambar" : "verde");
// Plan de Gestión del Cronograma: verde si valor ≥ verde; rojo si valor < rojo; ámbar entre ambos.
export const scheduleLevel = (v: number | null, green: number, red: number): Level | null => (v === null ? null : v >= green ? "verde" : v < red ? "rojo" : "ambar");
const RANK: Record<Level, number> = { verde: 0, ambar: 1, rojo: 2 };
export const worst = (ls: Array<Level | null>): Level | null => ls.filter((x): x is Level => x !== null).reduce<Level | null>((a, b) => (a === null || RANK[b] > RANK[a] ? b : a), null);

export interface EvmStatus { cpi: Level | null; cv: Level | null; spi: Level | null; sv: Level | null; cost: Level | null; schedule: Level | null; }
export function evmStatus(r: EvmResult, t: EvmThresholds): EvmStatus {
  const cpi = costLevel(r.cpi, t.cpiWarn, t.cpiEsc), cv = r.ac > 0 ? costLevel(r.cv, t.cvWarn, t.cvEsc) : null;
  const spi = scheduleLevel(r.spi, t.spiGreen, t.spiRed), sv = scheduleLevel(r.svPct, t.svGreenPct, t.svRedPct);
  return { cpi, cv, spi, sv, cost: worst([cpi, cv]), schedule: worst([spi, sv]) };
}

// ---- calendario: fecha de corte → días laborables transcurridos ----
export interface EvmCalendar { workDayIdx: number[]; holidays: string[]; }
const isoOf = (d: Date): string => d.toISOString().slice(0, 10);
const parse = (s: string): Date | null => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null; };
// Días laborables transcurridos desde el inicio del proyecto HASTA el fin de la fecha de corte (inclusive). Coincide con la
// convención del CPM: el offset 0 es el primer día laborable ≥ inicio, y cada día laborable ocupa [n, n+1).
export function workingDaysThrough(startISO: string, dateISO: string, cal: EvmCalendar | null | undefined): number {
  const s = parse(startISO), e = parse(dateISO); if (!s || !e || e.getTime() < s.getTime()) return 0;
  const work: Record<number, boolean> = {}; ((cal && cal.workDayIdx && cal.workDayIdx.length) ? cal.workDayIdx : [1, 2, 3, 4, 5]).forEach((d) => { work[d] = true; });
  // Feriados como "YYYY-MM-DD" o como {date, name} (así los guarda el Plan del Cronograma).
  const hol: Record<string, boolean> = {}; ((cal && cal.holidays) || []).forEach((h: unknown) => { const d = (typeof h === "string" ? h : h && typeof h === "object" ? String((h as { date?: unknown }).date || "") : "").slice(0, 10); if (d) hol[d] = true; });
  let n = 0; const d = new Date(s.getTime()), guard = 20000;
  for (let i = 0; i < guard && d.getTime() <= e.getTime(); i++) { if (work[d.getUTCDay()] && !hol[isoOf(d)]) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}

// ---- historial de cortes ----
export interface EvmReport { date: string; offset: number; pv: number; ev: number; ac: number; cpi: number | null; spi: number | null; }
export function normalizeReports(v: unknown): EvmReport[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === "object").map((x) => {
    const q = x as Record<string, unknown>, o = (k: string): number | null => (q[k] === null || q[k] === undefined || q[k] === "" ? null : (isFinite(Number(q[k])) ? Number(q[k]) : null));
    return { date: String(q.date || ""), offset: num(q.offset), pv: num(q.pv), ev: num(q.ev), ac: num(q.ac), cpi: o("cpi"), spi: o("spi") };
  }).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
}
