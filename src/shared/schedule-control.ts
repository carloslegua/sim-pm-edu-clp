// Control del cronograma: salud de la red, línea base y su comparación con el pronóstico -- lógica PURA compartida en
// tiempo de COMPILACIÓN (Vite la inlinea en cronograma-cpm.js).
//
// Auditoría metodológica (PMI / AACE): el CPM «sirve para planificar, no para controlar». Faltaba (1) evaluar la CALIDAD
// de la red antes de fiarse de la ruta crítica, (2) una LÍNEA BASE de cronograma (alcance, requisitos y costos ya la
// tenían) contra la cual medir la variación, y (3) que los umbrales que el Plan de Gestión del Cronograma pide
// (ruta casi crítica, reserva de cronograma, umbral de rebaselinado, consumo de holgura) los CONSUMIERA alguien.
//
// Base metodológica:
//  · Salud de la red: verificaciones del DCMA 14-Point Assessment (sept. 2026, confirmadas): lógica faltante ≤ 5 % de las
//    actividades, adelantos (leads) 0, desfases (lags) ≤ 5 % de los enlaces, relaciones FS ≥ 90 %, holgura alta (> 44 días
//    laborables) ≤ 5 %, holgura negativa 0, duración alta (> 44 d) ≤ 5 %. Son valores de REFERENCIA de la industria, no
//    una norma: orientan, no bloquean. (Las restricciones duras, los recursos y el avance real no los modela la suite.)
//  · Línea base (PMBOK: Schedule Baseline; AACE 29R-03 análisis de cronograma): una versión aprobada del cronograma que solo
//    cambia por control integrado de cambios. Cada versión (LB-n) conserva fecha, motivo y quién la aprobó; si el cambio
//    en la duración supera el umbral de rebaselinado del plan, la autoriza el sponsor.
//  · Variación: contra la línea base se mide el desplazamiento del fin, cuánto se consumió de la reserva de cronograma y el
//    consumo de holgura de la ruta casi crítica (umbral verde/rojo del plan). El SV/SPI requieren avance real (EVM).

export interface CtlNode { id: string; code: string; name: string; isMilestone: boolean; hasDur: boolean; dur: number; }
export interface CtlLink { from: string; to: string; type: string; lag?: number; lagUnit?: string; }
export interface CtlRow { es: number; ef: number; tf: number; critical: boolean; }

// ---- umbrales del Plan de Gestión del Cronograma (con valores por omisión cuando el plan no los define) ----
export interface CtlPlan {
  nearCriticalDays: number; nearCriticalDefined: boolean;   // «casi crítica»: holgura total ≤ N días laborables
  reservePct: number;                                        // reserva de cronograma (% de la duración)
  rebaselinePct: number;                                     // desviación de la duración que exige al sponsor para rebaselinar (0 = sin umbral)
  floatGreen: number; floatRed: number;                      // consumo de holgura de la ruta casi crítica (%): verde ≤ …, rojo ≥ …
}
export const DEFAULT_NEAR_CRITICAL_DAYS = 10;
export function planOf(sp: unknown): CtlPlan {
  const p = (sp && typeof sp === "object" ? sp : {}) as Record<string, Record<string, unknown> | unknown[] | undefined>;
  const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const n = (v: unknown): number => { const x = Number(v); return isFinite(x) ? x : 0; };
  const near = n(rec(p.criticalPath).nearCriticalThresholdDays);
  const th = (Array.isArray(p.controlThresholds) ? p.controlThresholds : []).map(rec).filter((t) => t.key === "HOLGURA")[0];
  const g = th ? n(th.greenValue) : 0, r = th ? n(th.redValue) : 0;
  return {
    nearCriticalDays: near > 0 ? near : DEFAULT_NEAR_CRITICAL_DAYS, nearCriticalDefined: near > 0,
    reservePct: Math.max(0, n(rec(p.scheduleReserve).pct)), rebaselinePct: Math.max(0, n(rec(p.changeControl).baselineChangeThresholdPct)),
    floatGreen: g > 0 ? g : 40, floatRed: r > g && r > 0 ? r : 70
  };
}

// ---- salud de la red ----
export interface HealthCheck {
  key: string; label: string; count: number; total: number; pct: number;
  limit: string;                 // el umbral de referencia, en palabras
  pass: boolean | null;          // null = informativa (no aprueba ni reprueba)
  detail: string;                // qué es lo que contó
  items: string[];               // ejemplos (códigos y nombres)
}
export interface HealthReport { checks: HealthCheck[]; evaluated: number; passed: number; nearCritical: number; activities: number; }
export const HIGH_FLOAT_DAYS = 44, HIGH_DURATION_DAYS = 44;

const lagOf = (l: CtlLink): number => Number(l.lag) || 0;
const pct = (a: number, b: number): number => (b > 0 ? a / b * 100 : 0);
const names = (ns: CtlNode[], k = 4): string[] => ns.slice(0, k).map((n) => n.code + " " + n.name).concat(ns.length > k ? ["… y " + (ns.length - k) + " más"] : []);

export function scheduleHealth(nodes: CtlNode[], links: CtlLink[], rows: Record<string, CtlRow>, plan: CtlPlan): HealthReport {
  const acts = nodes.filter((n) => !n.isMilestone), by: Record<string, CtlNode> = {}; nodes.forEach((n) => { by[n.id] = n; });
  const valid = links.filter((l) => by[l.from] && by[l.to] && l.from !== l.to);
  const hasPred: Record<string, boolean> = {}, hasSucc: Record<string, boolean> = {};
  valid.forEach((l) => { hasSucc[l.from] = true; hasPred[l.to] = true; });
  const checks: HealthCheck[] = [], add = (c: HealthCheck): void => { checks.push(c); };

  // 1) Lógica faltante: sin predecesora o sin sucesora. Se admite UN inicio y UN fin del proyecto (de preferencia hitos).
  const pickFree = (list: CtlNode[], prefer: (a: CtlNode, b: CtlNode) => number): CtlNode | null => (list.length ? list.slice().sort(prefer)[0] : null);
  const noPred = nodes.filter((n) => !hasPred[n.id]), noSucc = nodes.filter((n) => !hasSucc[n.id]);
  const rowEs = (n: CtlNode): number => (rows[n.id] ? rows[n.id].es : 0), rowEf = (n: CtlNode): number => (rows[n.id] ? rows[n.id].ef : 0);
  const freeStart = pickFree(noPred, (a, b) => Number(b.isMilestone) - Number(a.isMilestone) || rowEs(a) - rowEs(b));
  const freeEnd = pickFree(noSucc, (a, b) => Number(b.isMilestone) - Number(a.isMilestone) || rowEf(b) - rowEf(a));
  const missing = nodes.filter((n) => (!hasPred[n.id] && n !== freeStart) || (!hasSucc[n.id] && n !== freeEnd));
  add({ key: "logic", label: "Lógica faltante (sin predecesora o sin sucesora)", count: missing.length, total: nodes.length, pct: pct(missing.length, nodes.length), limit: "≤ 5 % de las actividades", pass: pct(missing.length, nodes.length) <= 5,
    detail: "Actividades e hitos sin predecesora o sin sucesora, salvo el inicio y el fin del proyecto (los extremos abiertos hacen la holgura poco confiable).", items: names(missing) });

  // 2) Adelantos (desfase negativo) y 3) desfases positivos
  const leads = valid.filter((l) => lagOf(l) < 0), lags = valid.filter((l) => lagOf(l) > 0);
  const linkTxt = (l: CtlLink): string => (by[l.from].code + " → " + by[l.to].code + " " + l.type + (lagOf(l) > 0 ? "+" : "") + lagOf(l) + (l.lagUnit || "d"));
  add({ key: "leads", label: "Adelantos (desfase negativo)", count: leads.length, total: valid.length, pct: pct(leads.length, valid.length), limit: "0", pass: leads.length === 0,
    detail: "Un adelanto superpone actividades y distorsiona la holgura y la ruta crítica; se evita (mejor dividir la actividad).", items: leads.slice(0, 4).map(linkTxt) });
  add({ key: "lags", label: "Desfases positivos", count: lags.length, total: valid.length, pct: pct(lags.length, valid.length), limit: "≤ 5 % de los enlaces", pass: pct(lags.length, valid.length) <= 5,
    detail: "Un desfase oculta trabajo o espera que debería ser una actividad propia (con nombre, duración y responsable).", items: lags.slice(0, 4).map(linkTxt) });

  // 4) Relaciones FS
  const fs = valid.filter((l) => l.type === "FS");
  add({ key: "fs", label: "Relaciones fin-a-inicio (FS)", count: fs.length, total: valid.length, pct: pct(fs.length, valid.length), limit: "≥ 90 % de los enlaces", pass: valid.length === 0 ? null : pct(fs.length, valid.length) >= 90,
    detail: "Las relaciones SS, FF y SF hacen la red más difícil de leer y de mantener; FS debe ser la norma.", items: [] });

  // 5) Holgura alta, 6) holgura negativa, 7) duración alta, 8) sin duración
  const withRow = acts.filter((n) => rows[n.id]);
  const hiFloat = withRow.filter((n) => rows[n.id].tf > HIGH_FLOAT_DAYS + 1e-9), negFloat = withRow.filter((n) => rows[n.id].tf < -1e-9);
  add({ key: "highFloat", label: "Holgura alta (> " + HIGH_FLOAT_DAYS + " días)", count: hiFloat.length, total: withRow.length, pct: pct(hiFloat.length, withRow.length), limit: "≤ 5 % de las actividades", pass: pct(hiFloat.length, withRow.length) <= 5,
    detail: "Una holgura enorme suele indicar un enlace faltante a una sucesora: la actividad «flota» y nadie la controla.", items: names(hiFloat) });
  add({ key: "negFloat", label: "Holgura negativa", count: negFloat.length, total: withRow.length, pct: pct(negFloat.length, withRow.length), limit: "0", pass: negFloat.length === 0,
    detail: "Holgura negativa = el plan no cumple una fecha impuesta.", items: names(negFloat) });
  const hiDur = acts.filter((n) => n.dur > HIGH_DURATION_DAYS + 1e-9);
  add({ key: "highDur", label: "Duración alta (> " + HIGH_DURATION_DAYS + " días)", count: hiDur.length, total: acts.length, pct: pct(hiDur.length, acts.length), limit: "≤ 5 % de las actividades", pass: pct(hiDur.length, acts.length) <= 5,
    detail: "Las actividades muy largas se controlan mal: conviene descomponerlas para poder medir el avance.", items: names(hiDur) });
  const noDur = acts.filter((n) => !n.hasDur);
  add({ key: "noDur", label: "Actividades sin duración", count: noDur.length, total: acts.length, pct: pct(noDur.length, acts.length), limit: "0", pass: noDur.length === 0,
    detail: "Sin metrado y rendimiento (o PERT) la actividad cuenta como 0 días y no aporta a la ruta crítica.", items: names(noDur) });

  // Informativas: ruta casi crítica y peso de la ruta crítica
  const near = withRow.filter((n) => rows[n.id].tf > 1e-9 && rows[n.id].tf <= plan.nearCriticalDays + 1e-9);
  add({ key: "near", label: "Ruta casi crítica (holgura ≤ " + plan.nearCriticalDays + " d)", count: near.length, total: withRow.length, pct: pct(near.length, withRow.length), limit: plan.nearCriticalDefined ? "umbral del Plan del Cronograma" : "umbral por omisión: el Plan no lo define", pass: null,
    detail: "Actividades con holgura pequeña: un retraso leve las vuelve críticas. Se vigilan igual que la ruta crítica.", items: names(near) });
  const crit = withRow.filter((n) => rows[n.id].critical || rows[n.id].tf <= 1e-9);
  add({ key: "critShare", label: "Peso de la ruta crítica", count: crit.length, total: withRow.length, pct: pct(crit.length, withRow.length), limit: "referencia (sin umbral)", pass: null,
    detail: "Si casi todo es crítico, la red no tiene holgura para absorber imprevistos: cualquier retraso mueve el fin.", items: [] });

  const graded = checks.filter((c) => c.pass !== null);
  return { checks, evaluated: graded.length, passed: graded.filter((c) => c.pass).length, nearCritical: near.length, activities: acts.length };
}

// ---- línea base ----
export interface BaselineRow { id: string; code: string; name: string; isMilestone: boolean; dur: number; es: number; ef: number; tf: number; critical: boolean; }
export interface BaselineSnapshot { projectDuration: number; startDate: string; finishDate: string; nearCriticalDays: number; rows: BaselineRow[]; }
export interface BaselineLogEntry { version: string; date: string; reason: string; approver: string; sponsorAuth: boolean; projectDuration: number; finishDate: string; deviationPct: number | null; }
export interface ScheduleBaselineData { frozen: boolean; version: string; date: string; snapshot: BaselineSnapshot; log: BaselineLogEntry[]; }

export function makeSnapshot(nodes: CtlNode[], rows: Record<string, CtlRow>, projectDuration: number, startDate: string, finishDate: string, nearCriticalDays: number): BaselineSnapshot {
  return {
    projectDuration, startDate, finishDate, nearCriticalDays,
    rows: nodes.filter((n) => rows[n.id]).map((n) => ({ id: n.id, code: n.code, name: n.name, isMilestone: n.isMilestone, dur: n.dur, es: rows[n.id].es, ef: rows[n.id].ef, tf: rows[n.id].tf, critical: rows[n.id].critical }))
  };
}
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const fin = (v: unknown, d = 0): number => { const x = Number(v); return isFinite(x) ? x : d; };
// Tolerante: datos guardados antes (`baseline: null` o `{frozen, version, date, snapshot}` de otro esquema) se leen como «sin línea base».
export function normalizeBaseline(o: unknown): ScheduleBaselineData | null {
  if (!o || typeof o !== "object") return null;
  const x = o as Record<string, unknown>, s = x.snapshot as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object" || !Array.isArray(s.rows) || !isFinite(Number(s.projectDuration))) return null;
  const rows: BaselineRow[] = (s.rows as unknown[]).filter((r) => r && typeof r === "object").map((r) => {
    const q = r as Record<string, unknown>;
    return { id: str(q.id), code: str(q.code), name: str(q.name), isMilestone: !!q.isMilestone, dur: fin(q.dur), es: fin(q.es), ef: fin(q.ef), tf: fin(q.tf), critical: !!q.critical };
  }).filter((r) => r.id);
  const log: BaselineLogEntry[] = (Array.isArray(x.log) ? x.log : []).filter((e) => e && typeof e === "object").map((e) => {
    const q = e as Record<string, unknown>;
    return { version: str(q.version), date: str(q.date), reason: str(q.reason), approver: str(q.approver), sponsorAuth: !!q.sponsorAuth, projectDuration: fin(q.projectDuration), finishDate: str(q.finishDate), deviationPct: q.deviationPct === null || q.deviationPct === undefined ? null : fin(q.deviationPct) };
  });
  return { frozen: x.frozen !== false, version: str(x.version) || "LB-1", date: str(x.date), snapshot: { projectDuration: fin(s.projectDuration), startDate: str(s.startDate), finishDate: str(s.finishDate), nearCriticalDays: fin(s.nearCriticalDays, DEFAULT_NEAR_CRITICAL_DAYS), rows }, log };
}
export const nextVersion = (b: ScheduleBaselineData | null): string => "LB-" + (((b && b.log.length) || 0) + 1);

// Desviación de la duración del pronóstico contra la línea base (%), con signo.
export function deviationPct(base: BaselineSnapshot, projectDuration: number): number | null { return base.projectDuration > 0 ? (projectDuration - base.projectDuration) / base.projectDuration * 100 : null; }
// ¿Rebaselinar exige la autorización del sponsor? Si la desviación de la duración supera el umbral de rebaselinado del plan.
export function needsSponsor(base: BaselineSnapshot | null, projectDuration: number, plan: CtlPlan): boolean {
  if (!base || !(plan.rebaselinePct > 0)) return false;
  const d = deviationPct(base, projectDuration);
  return d !== null && Math.abs(d) > plan.rebaselinePct + 1e-9;
}

export interface FloatItem { id: string; code: string; name: string; tfBase: number; tfNow: number; consumedPct: number; }
export interface BaselineComparison {
  durationDelta: number; durationDeltaPct: number | null;        // días laborables de diferencia del fin del proyecto (+ = más tarde)
  reserveDays: number; reserveConsumedPct: number | null;        // reserva de cronograma del plan (días) y % consumido por el desplazamiento
  changed: Array<{ id: string; code: string; name: string; efDelta: number; durDelta: number; tfBase: number; tfNow: number }>;
  added: string[]; removed: string[];
  near: { items: FloatItem[]; meanPct: number; maxPct: number; level: "verde" | "ambar" | "rojo" | null; newCritical: string[] };
}
export function compareBaseline(base: BaselineSnapshot, nodes: CtlNode[], rows: Record<string, CtlRow>, projectDuration: number, plan: CtlPlan): BaselineComparison {
  const bmap: Record<string, BaselineRow> = {}; base.rows.forEach((r) => { bmap[r.id] = r; });
  const cur: Record<string, CtlNode> = {}; nodes.forEach((n) => { cur[n.id] = n; });
  const durationDelta = projectDuration - base.projectDuration, reserveDays = base.projectDuration * plan.reservePct / 100;
  const changed: BaselineComparison["changed"] = [];
  nodes.forEach((n) => {
    const b = bmap[n.id], r = rows[n.id]; if (!b || !r) return;
    const efDelta = r.ef - b.ef, durDelta = n.dur - b.dur;
    if (Math.abs(efDelta) > 1e-6 || Math.abs(durDelta) > 1e-6) changed.push({ id: n.id, code: n.code, name: n.name, efDelta, durDelta, tfBase: b.tf, tfNow: r.tf });
  });
  changed.sort((a, b) => Math.abs(b.efDelta) - Math.abs(a.efDelta) || a.code.localeCompare(b.code));
  const items: FloatItem[] = [], newCritical: string[] = [];
  base.rows.forEach((b) => {
    const r = rows[b.id], n = cur[b.id]; if (!r || !n || b.isMilestone) return;
    if (b.tf > 1e-9 && b.tf <= base.nearCriticalDays + 1e-9) {
      items.push({ id: b.id, code: b.code, name: b.name, tfBase: b.tf, tfNow: r.tf, consumedPct: Math.max(0, (b.tf - r.tf) / b.tf * 100) });
      if (r.tf <= 1e-9) newCritical.push(b.code + " " + b.name);
    }
  });
  const meanPct = items.length ? items.reduce((s, i) => s + i.consumedPct, 0) / items.length : 0, maxPct = items.reduce((m, i) => Math.max(m, i.consumedPct), 0);
  const level = !items.length ? null : meanPct >= plan.floatRed - 1e-9 ? "rojo" : meanPct <= plan.floatGreen + 1e-9 ? "verde" : "ambar";
  return {
    durationDelta, durationDeltaPct: deviationPct(base, projectDuration),
    reserveDays, reserveConsumedPct: reserveDays > 0 ? Math.max(0, durationDelta) / reserveDays * 100 : null,
    changed, added: nodes.filter((n) => !bmap[n.id]).map((n) => n.code + " " + n.name), removed: base.rows.filter((r) => !cur[r.id]).map((r) => r.code + " " + r.name),
    near: { items: items.sort((a, b) => b.consumedPct - a.consumedPct), meanPct, maxPct, level, newCritical }
  };
}
