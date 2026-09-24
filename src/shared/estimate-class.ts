// Clase del estimado (AACE) inferida de la madurez de la definición del proyecto, y rango de exactitud aplicado al
// presupuesto -- lógica PURA compartida en tiempo de COMPILACIÓN (Vite la inlinea en cost.js).
//
// Auditoría metodológica: la clase se elegía a mano y su rango de exactitud no se aplicaba al presupuesto. En AACE la
// clase RESULTA de la madurez de la definición del proyecto (17R-97: el grado de definición es la característica
// «primaria»; la exactitud, el método y el uso son «secundarios»), y el rango de exactitud es un rango esperado del
// costo final que presupone contingencia aplicada al estimado (56R-08: depende del proyecto y del sector, y no es
// función solo de la madurez: el análisis de riesgo determina la exactitud real).
//
// Lo que se calcula AQUÍ es una estimación ORIENTATIVA de la madurez con lo que la suite conoce (acta, alcance, requisitos,
// EDT, actividades, precios unitarios y cronograma). La clase real depende de entregables de definición que la suite
// solo ve parcialmente (ingeniería, especificaciones, cotizaciones firmes): sirve para avisar cuando la clase declarada
// no se sostiene con los datos, no para decidirla. Los pesos son un criterio didáctico, documentado y editable aquí.
//
// Madurez por clase (17R-97, genérica): 0–2 / 1–15 / 10–40 / 30–75 / 65–100 %. Coinciden con las que la suite ya
// mostraba; los PDF de AACE son de pago y no se pudieron contrastar en línea: confirmarlos contra la RP vigente.

export type EstimateClass = 1 | 2 | 3 | 4 | 5;
export const CLASS_MATURITY: Record<EstimateClass, [number, number]> = { 5: [0, 2], 4: [1, 15], 3: [10, 40], 2: [30, 75], 1: [65, 100] };

export interface MaturityInput {
  charter: number;        // 0..1 completitud del Acta de Constitución
  scope: number;          // 0..1 entregables del alcance descompuestos en la EDT
  requirements: number;   // 0..1 requisitos trazados y con línea base
  wbs: number;            // 0..1 hay EDT con paquetes de trabajo
  activities: number;     // 0..1 paquetes con actividades definidas
  pricing: number;        // 0..1 actividades con precio unitario (estimado bottom-up)
  schedule: number;       // 0..1 actividades integradas en la red del cronograma (con enlaces)
}
export const MATURITY_ITEMS: Array<{ key: keyof MaturityInput; label: string; weight: number; hint: string }> = [
  { key: "charter", label: "Acta de constitución", weight: 15, hint: "objetivos, restricciones y criterios de éxito definidos" },
  { key: "scope", label: "Alcance descompuesto", weight: 15, hint: "los entregables del enunciado del alcance están en la EDT" },
  { key: "requirements", label: "Requisitos trazados y con línea base", weight: 10, hint: "cada requisito con origen, paquete y criterio de aceptación; línea base congelada" },
  { key: "wbs", label: "EDT con paquetes de trabajo", weight: 5, hint: "el alcance está estructurado hasta paquetes" },
  { key: "activities", label: "Actividades definidas", weight: 15, hint: "cada paquete descompuesto en actividades con metrado y rendimiento" },
  { key: "pricing", label: "Precios unitarios cargados", weight: 30, hint: "estimado por metrado × precio unitario (no un estimado global)" },
  { key: "schedule", label: "Cronograma integrado", weight: 10, hint: "las actividades están enlazadas en una red (base del cronograma del estimado)" }
];
const clamp01 = (v: number): number => (isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export interface MaturityResult { pct: number; items: Array<{ key: string; label: string; hint: string; weight: number; value: number; points: number }>; class: EstimateClass; }
export function definitionMaturity(inp: MaturityInput): MaturityResult {
  const items = MATURITY_ITEMS.map((m) => { const value = clamp01(inp[m.key]); return { key: m.key as string, label: m.label, hint: m.hint, weight: m.weight, value, points: value * m.weight }; });
  const pct = items.reduce((s, i) => s + i.points, 0);
  return { pct, items, class: classForMaturity(pct) };
}
// La clase MÁS madura cuyo mínimo de madurez alcanza el porcentaje (los rangos se solapan; se toma el piso de cada clase).
export function classForMaturity(pct: number): EstimateClass {
  return pct >= CLASS_MATURITY[1][0] ? 1 : pct >= CLASS_MATURITY[2][0] ? 2 : pct >= CLASS_MATURITY[3][0] ? 3 : pct >= CLASS_MATURITY[4][0] ? 4 : 5;
}

export interface ClassAdvisory { level: "ok" | "aviso" | "info"; text: string; }
// Contraste entre la clase DECLARADA y la que respaldan los datos.
export function classAdvisory(chosen: EstimateClass, pct: number): ClassAdvisory {
  const inferred = classForMaturity(pct), [lo, hi] = CLASS_MATURITY[chosen], p = Math.round(pct);
  if (chosen < inferred) return { level: "aviso", text: "La clase " + chosen + " supone una madurez de definición de " + lo + "–" + hi + " %; con los datos del proyecto se estima ≈ " + p + " %, que corresponde a la clase " + inferred + ". Declarar una clase más madura estrecha el rango de exactitud sin respaldo: completa la definición (actividades, precios, cronograma) o baja la clase." };
  if (chosen > inferred) return { level: "info", text: "Los datos del proyecto (≈ " + p + " % de madurez) permitirían la clase " + inferred + ": si el estimado ya tiene esa definición, puedes subirla; si no, la clase " + chosen + " es prudente." };
  return { level: "ok", text: "La clase " + chosen + " es coherente con la madurez estimada de la definición (≈ " + p + " %, rango de la clase " + lo + "–" + hi + " %)." };
}

// ---- Atribución del rango de exactitud (auditoría: no presentar como «típico de AACE» lo que es un parámetro didáctico) ----
// Tres orígenes distintos, que la interfaz y el documento nunca deben mezclar:
//   1. TABLA OFICIAL de la práctica sectorial (AACE 56R-08, edificación): solo se cargan las bandas que se pudieron
//      contrastar con una fuente pública. De la clase 3 se verificó la banda (extremo bajo −5…−15 %, alto +10…+20 %);
//      de las clases 1, 2, 4 y 5 NO se verificó la tabla completa (el PDF es de pago): quedan sin banda, no inventadas.
//   2. PARÁMETRO DIDÁCTICO del simulador (DIDACTIC_ACCURACY): valores de partida, redondos y genéricos, que NO son la
//      tabla de AACE ni de ningún sector. Son los que la suite siempre usó (compatibilidad con proyectos guardados).
//   3. AJUSTE DEL PROYECTO (AccuracyOverride): el alumno/equipo declara otros extremos con su justificación (AACE:
//      el rango depende del análisis de riesgo específico del proyecto, no de la clase sola; los de la tabla son un
//      «rango de rangos» indicativo, no metas ni métricas absolutas).
export const ACCURACY_SOURCE = {
  practice: "AACE International RP 56R-08",
  title: "Cost Estimate Classification System – As Applied in EPC for the Building and General Construction Industries",
  sector: "edificación y construcción general",
  revision: "publicada en 2008; el listado de AACE la fecha en la revisión del 7-ago-2020",
  generic: "AACE International RP 17R-97 (clasificación genérica, clases y madurez de la definición)"
};
export interface AccuracyBand { low: [number, number]; high: [number, number]; }   // rango típico de cada extremo, en %
export const PUBLISHED_BANDS: Partial<Record<EstimateClass, AccuracyBand>> = { 3: { low: [-15, -5], high: [10, 20] } };
export const DIDACTIC_ACCURACY: Record<EstimateClass, { lo: number; hi: number }> = {
  5: { lo: -30, hi: 50 }, 4: { lo: -20, hi: 40 }, 3: { lo: -15, hi: 30 }, 2: { lo: -10, hi: 20 }, 1: { lo: -5, hi: 15 }
};

export interface AccuracyOverride { lo: number; hi: number; why: string; }
export function normalizeAccuracyOverride(raw: unknown): AccuracyOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>, lo = Number(r.lo), hi = Number(r.hi);
  if (r.lo == null || r.hi == null || !isFinite(lo) || !isFinite(hi)) return null;
  return { lo, hi, why: typeof r.why === "string" ? r.why.trim() : "" };
}
// Motivo por el que un ajuste no se puede aplicar (null = válido). La justificación es obligatoria: sin ella el rango
// sigue siendo el didáctico en vez de aparentar un valor del proyecto.
export function overrideProblem(o: AccuracyOverride | null): string | null {
  if (!o) return null;
  if (o.lo > 0 || o.lo < -100) return "El extremo inferior debe estar entre −100 % y 0 %.";
  if (o.hi < 0) return "El extremo superior no puede ser negativo.";
  if (!o.why) return "Falta la justificación del rango del proyecto (qué análisis de riesgo o dato lo respalda).";
  return null;
}

export type AccuracyOrigin = "didactico" | "proyecto";
export interface AppliedAccuracy { lo: number; hi: number; origin: AccuracyOrigin; band: AccuracyBand | null; why: string; notes: string[]; }
export function appliedAccuracy(cls: EstimateClass, override: AccuracyOverride | null): AppliedAccuracy {
  const band = PUBLISHED_BANDS[cls] || null, notes: string[] = [], problem = overrideProblem(override);
  const usingProject = !!override && !problem;
  const lo = usingProject ? (override as AccuracyOverride).lo : DIDACTIC_ACCURACY[cls].lo, hi = usingProject ? (override as AccuracyOverride).hi : DIDACTIC_ACCURACY[cls].hi;
  if (override && problem) notes.push("El ajuste del proyecto no se aplica: " + problem.charAt(0).toLowerCase() + problem.slice(1));
  if (band) {
    if (lo < band.low[0] || lo > band.low[1]) notes.push("El extremo inferior " + pct(lo) + " queda fuera de la banda que 56R-08 publica para la clase " + cls + " en " + ACCURACY_SOURCE.sector + " (" + pct(band.low[0]) + " a " + pct(band.low[1]) + ").");
    if (hi < band.high[0] || hi > band.high[1]) notes.push("El extremo superior " + pct(hi) + " queda fuera de la banda que 56R-08 publica para la clase " + cls + " en " + ACCURACY_SOURCE.sector + " (" + pct(band.high[0]) + " a " + pct(band.high[1]) + ").");
  } else notes.push("Esta suite no tiene contrastada la tabla de 56R-08 para la clase " + cls + ": el valor no se puede comparar con la banda publicada.");
  return { lo, hi, origin: usingProject ? "proyecto" : "didactico", band, why: usingProject ? (override as AccuracyOverride).why : "", notes };
}
export function pct(n: number): string { return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n) + " %"; }
// Origen en una frase, para acompañar SIEMPRE al rango mostrado.
export function accuracyOriginText(a: AppliedAccuracy): string {
  return a.origin === "proyecto"
    ? "ajuste particular del proyecto (no es la tabla de AACE); justificación: " + a.why
    : "parámetro didáctico del simulador (no es la tabla de AACE " + "56R-08 ni de otro sector)";
}
export function publishedBandText(cls: EstimateClass): string {
  const b = PUBLISHED_BANDS[cls];
  return b ? "AACE 56R-08 (" + ACCURACY_SOURCE.sector + "), clase " + cls + ": extremo inferior " + pct(b.low[0]) + " a " + pct(b.low[1]) + "; superior " + pct(b.high[0]) + " a " + pct(b.high[1]) + " (típico, indicativo)"
    : "AACE 56R-08 (" + ACCURACY_SOURCE.sector + "): banda de la clase " + cls + " sin contrastar en esta suite; consúltala en la práctica vigente";
}

// Rango de exactitud aplicado al estimado CON contingencia (56R-08: los rangos publicados presuponen contingencia aplicada).
export function accuracyRange(estimate: number, lowPct: number, highPct: number): { min: number; max: number } {
  return { min: estimate * (1 + lowPct / 100), max: estimate * (1 + highPct / 100) };
}
