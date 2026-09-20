// Matriz de evaluación del compromiso de los interesados (PMI, Stakeholder Engagement
// Assessment Matrix) -- lógica PURA compartida en tiempo de COMPILACIÓN (Vite la
// inlinea en stakeholder-studio.js).
//
// Auditoría metodológica: el Panel anunciaba una "matriz de compromiso" que no existía.
// PMI compara, por interesado, el nivel de compromiso ACTUAL (C) con el DESEADO (D); la
// brecha D − C justifica las acciones del plan de involucramiento de los interesados.
// Poder/interés (Mendelow) y prominencia (Mitchell) dicen A QUIÉN atender; el compromiso
// dice EN QUÉ POSTURA está y cuál hace falta -- son ejes distintos y complementarios.
//
// Los niveles son un dato del ALUMNO: nunca se infieren ni se inicializan ("sin evaluar").

export type EngLevel = 1 | 2 | 3 | 4 | 5;
export interface EngLevelInfo { v: EngLevel; t: string; d: string; }
export const ENG_LEVELS: EngLevelInfo[] = [
  { v: 1, t: "Desconocedor", d: "No conoce el proyecto ni sus posibles impactos." },
  { v: 2, t: "Reticente", d: "Conoce el proyecto y sus impactos, pero se resiste al cambio." },
  { v: 3, t: "Neutral", d: "Conoce el proyecto, pero ni lo apoya ni se resiste." },
  { v: 4, t: "Partidario", d: "Conoce el proyecto y sus impactos, y lo apoya." },
  { v: 5, t: "Líder", d: "Conoce el proyecto y se involucra activamente para asegurar su éxito." }
];

export interface EngStakeholder {
  name?: string; power: number; interest: number;
  engCurrent?: number | null; engDesired?: number | null;
  engStrategy?: string; engOwner?: string; engAssessedOn?: string;
}

const isNum = (v: unknown): v is number => typeof v === "number" && isFinite(v);
// Solo 1..5 enteros son niveles válidos; cualquier otra cosa (vacío, 0, NaN, texto) = sin evaluar.
export function asLevel(v: unknown): EngLevel | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return isNum(n) && Number.isInteger(n) && n >= 1 && n <= 5 ? (n as EngLevel) : null;
}
export function levelName(v: unknown): string { const l = asLevel(v); return l ? ENG_LEVELS[l - 1].t : "Sin evaluar"; }

export type Quadrant = "cerca" | "satisfecho" | "informado" | "monitorear";
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  cerca: "Gestionar de cerca", satisfecho: "Mantener satisfecho", informado: "Mantener informado", monitorear: "Monitorear"
};
// Mismo umbral (50) que la matriz poder–interés del módulo.
export function quadrantOf(power: number, interest: number, threshold = 50): Quadrant {
  const P = power >= threshold, I = interest >= threshold;
  return P && I ? "cerca" : P ? "satisfecho" : I ? "informado" : "monitorear";
}

// Brecha = deseado − actual. null si falta cualquiera de los dos niveles.
export function engagementGap(s: EngStakeholder): number | null {
  const c = asLevel(s.engCurrent), d = asLevel(s.engDesired);
  return c && d ? d - c : null;
}

export type Priority = "alta" | "media" | "baja";
// Prioridad para CERRAR la brecha = brecha × poder/100: una brecha de 3 en alguien sin poder
// pesa menos que una de 2 en quien puede frenar el proyecto. Solo hay prioridad si hay brecha positiva.
export function engagementPriority(s: EngStakeholder): { score: number; level: Priority } | null {
  const g = engagementGap(s);
  if (g === null || g <= 0) return null;
  const score = Math.round(g * (Math.max(0, Math.min(100, Number(s.power) || 0)) / 100) * 100) / 100;
  return { score, level: score >= 1.5 ? "alta" : score >= 0.75 ? "media" : "baja" };
}

export type Severity = "riesgo" | "aviso" | "info";
export interface Finding { code: string; severity: Severity; text: string; }

// Diferencia en días entre dos fechas ISO (YYYY-MM-DD); null si alguna no es válida.
function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso + "T12:00:00Z"), b = Date.parse(toIso + "T12:00:00Z");
  return isFinite(a) && isFinite(b) ? Math.round((b - a) / 86400000) : null;
}

// Hallazgos de coherencia de UN interesado. Orientan la revisión: no impiden guardar nada.
export function engagementFindings(s: EngStakeholder, today?: string, staleDays = 90): Finding[] {
  const out: Finding[] = [];
  const c = asLevel(s.engCurrent), d = asLevel(s.engDesired), q = quadrantOf(Number(s.power) || 0, Number(s.interest) || 0);
  const key = q === "cerca" || q === "satisfecho"; // con poder alto
  if (!c || !d) {
    out.push({ code: "E1", severity: key ? "aviso" : "info", text: "Sin evaluar" + (!c && !d ? "" : !c ? " el compromiso actual" : " el compromiso deseado") + (key ? " (interesado con poder alto: evaluarlo primero)" : "") });
    return out;
  }
  const g = d - c;
  if (g < 0) out.push({ code: "E2", severity: "info", text: "El nivel deseado es menor que el actual: confirmar que es intencional (¿sobre-involucramiento?)." });
  if (g >= 1 && !String(s.engStrategy || "").trim()) out.push({ code: "E3", severity: g >= 2 ? "riesgo" : "aviso", text: "Hay una brecha de " + g + " nivel(es) y no hay estrategia para cerrarla." });
  if (g >= 1 && !String(s.engOwner || "").trim()) out.push({ code: "E4", severity: "aviso", text: "La brecha no tiene un responsable asignado." });
  if (q === "cerca" && d < 4) out.push({ code: "E5", severity: "aviso", text: "Un interesado a gestionar de cerca normalmente requiere al menos «Partidario» como nivel deseado." });
  if ((Number(s.power) || 0) >= 50 && c <= 2) out.push({ code: "E6", severity: "riesgo", text: "Poder alto con postura «" + levelName(c) + "»: riesgo de resistencia o de desconocimiento de quien puede frenar el proyecto." });
  if (today && s.engAssessedOn) { const n = daysBetween(s.engAssessedOn, today); if (n !== null && n > staleDays) out.push({ code: "E7", severity: "info", text: "Evaluado hace " + n + " días: reevaluar (el compromiso cambia durante el proyecto)." }); }
  return out;
}

export interface EngSummary {
  total: number; assessed: number; coveragePct: number;
  withGap: number; withGapNoStrategy: number; highPowerResistant: number;
  byCurrent: number[]; byDesired: number[];   // conteos por nivel 1..5 (índice 0 = nivel 1)
}
export function engagementSummary(list: EngStakeholder[]): EngSummary {
  const sum: EngSummary = { total: list.length, assessed: 0, coveragePct: 0, withGap: 0, withGapNoStrategy: 0, highPowerResistant: 0, byCurrent: [0, 0, 0, 0, 0], byDesired: [0, 0, 0, 0, 0] };
  list.forEach((s) => {
    const c = asLevel(s.engCurrent), d = asLevel(s.engDesired);
    if (c) sum.byCurrent[c - 1]++;
    if (d) sum.byDesired[d - 1]++;
    if (!c || !d) return;
    sum.assessed++;
    if (d - c >= 1) { sum.withGap++; if (!String(s.engStrategy || "").trim()) sum.withGapNoStrategy++; }
    if ((Number(s.power) || 0) >= 50 && c <= 2) sum.highPowerResistant++;
  });
  sum.coveragePct = sum.total ? Math.round(sum.assessed / sum.total * 100) : 0;
  return sum;
}

// Interesados con brecha positiva, del más al menos prioritario (a igual puntaje, la brecha mayor primero).
export function rankByPriority<T extends EngStakeholder>(list: T[]): Array<{ s: T; score: number; level: Priority; gap: number }> {
  const r: Array<{ s: T; score: number; level: Priority; gap: number }> = [];
  list.forEach((s) => { const p = engagementPriority(s); if (p) r.push({ s, score: p.score, level: p.level, gap: engagementGap(s) as number }); });
  return r.sort((a, b) => b.score - a.score || b.gap - a.gap);
}

// Orientación (no una regla) para cerrar la brecha según la postura actual y el cuadrante de poder–interés.
export function approachHint(current: unknown, desired: unknown, q: Quadrant): string {
  const c = asLevel(current), d = asLevel(desired);
  if (!c || !d) return "Evalúa primero el compromiso actual y el deseado.";
  if (d <= c) return "Mantener el nivel actual: seguimiento periódico y reevaluación.";
  const how = c === 1 ? "Informar: dar a conocer el proyecto y sus impactos con un mensaje adaptado."
    : c === 2 ? "Escuchar sus objeciones y atenderlas: reuniones directas, acuerdos y seguimiento de compromisos."
      : c === 3 ? "Involucrar: mostrar el beneficio para su agenda y darle un rol concreto." : "Empoderar: delegarle una responsabilidad visible en el éxito del proyecto.";
  const who = q === "cerca" ? "Es un interesado a gestionar de cerca: contacto directo y frecuente del director del proyecto."
    : q === "satisfecho" ? "Tiene poder pero poco interés: consultarlo en decisiones clave sin saturarlo."
      : q === "informado" ? "Tiene interés pero poco poder: comunicación frecuente y canal de retroalimentación." : "Bajo poder e interés: esfuerzo mínimo, vigilar cambios.";
  return how + " " + who;
}
