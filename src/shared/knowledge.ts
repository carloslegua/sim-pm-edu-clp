// Gestión del Conocimiento del proyecto (PMBOK: «Gestionar el conocimiento del proyecto») — lógica PURA (sin DOM ni `localStorage`), inlineada en knowledge.js. Las pruebas la importan directo.
//
// Qué es: el REGISTRO DE LECCIONES APRENDIDAS. Se captura DURANTE la ejecución (no al cierre, cuando ya nadie recuerda por qué pasó), se valida (alguien confirma que es cierta y útil) y se transfiere
// (llega a quien la necesita: el siguiente proyecto, la organización). Una lección solo sirve si dice qué pasó, qué se aprendió y QUÉ HACER distinto la próxima vez. No duplica: los riesgos que se
// MATERIALIZARON salen del Registro de Riesgos (cada uno debería dejar una lección), los paquetes son los de la EDT y los responsables, puestos del OBS.
// Umbral didáctico DECLARADO (no una norma): una lección capturada y sin validar se avisa a los 30 días de la fecha de corte.
export const LESSON_KINDS = ["buena_practica", "problema", "oportunidad"] as const;
export type LessonKind = typeof LESSON_KINDS[number];
export const KIND_LABEL: Record<LessonKind, string> = { buena_practica: "Buena práctica", problema: "Problema", oportunidad: "Oportunidad de mejora" };
export const CATEGORIES = ["Alcance", "Cronograma", "Costos", "Calidad", "Riesgos", "Adquisiciones", "Comunicaciones", "Interesados", "Recursos", "Seguridad", "Otro"] as const;
export const LESSON_STATUSES = ["capturada", "validada", "transferida"] as const;
export type LessonStatus = typeof LESSON_STATUSES[number];
export const STATUS_LABEL: Record<LessonStatus, string> = { capturada: "Capturada", validada: "Validada", transferida: "Transferida" };
export const UNVALIDATED_DAYS = 30;

export interface Lesson {
  id: string; code: string; date: string; kind: LessonKind; category: string; wbsId: string; riskCode: string;
  situation: string; lesson: string; recommendation: string; owner: string; audience: string; status: LessonStatus;
}
export interface KnowledgeData { lessons: Lesson[]; asOf: string; idCounter: number; }

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const rec = (o: unknown): Record<string, unknown> => (o && typeof o === "object" ? (o as Record<string, unknown>) : {});
const iso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
export function normalizeLesson(o: unknown, fb: string): Lesson {
  const x = rec(o), id = str(x.id) || fb;
  return { id, code: str(x.code) || id, date: str(x.date), kind: (LESSON_KINDS.indexOf(x.kind as LessonKind) >= 0 ? x.kind : "problema") as LessonKind, category: str(x.category), wbsId: str(x.wbsId), riskCode: str(x.riskCode),
    situation: str(x.situation), lesson: str(x.lesson), recommendation: str(x.recommendation), owner: str(x.owner), audience: str(x.audience), status: (LESSON_STATUSES.indexOf(x.status as LessonStatus) >= 0 ? x.status : "capturada") as LessonStatus };
}
export function normalizeKnowledge(raw: unknown): KnowledgeData {
  const x = rec(raw), lessons = (Array.isArray(x.lessons) ? x.lessons : []).map((o, i) => normalizeLesson(o, "ll" + (i + 1)));
  return { lessons, asOf: iso(str(x.asOf)) ? str(x.asOf) : "", idCounter: Number(x.idCounter) || lessons.length + 1 };
}
export const blankKnowledge = (): KnowledgeData => normalizeKnowledge(null);
export function nextCode(items: Array<{ code: string }>): string { let max = 0; items.forEach((c) => { const m = /(\d+)\s*$/.exec(c.code); if (m) max = Math.max(max, Number(m[1])); }); return "LL-" + String(max + 1).padStart(2, "0"); }
export const asOfOf = (d: KnowledgeData, today: string): string => (iso(d.asOf) ? d.asOf : today);
const gap = (a: string, b: string): number => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

// ---- lo que se lee del Registro de Riesgos, de la EDT y del OBS (solo lectura) ----
export interface KFacts { materialized: Array<{ code: string; title: string }>; riskCodes: string[]; leaves: Array<{ id: string; code: string; name: string }>; roles: string[]; }

export interface KFinding { code: string; severity: "riesgo" | "aviso" | "info"; lessonId: string | null; text: string; }
export function knowledgeFindings(d: KnowledgeData, f: KFacts, today0 = ""): KFinding[] {
  const today = asOfOf(d, today0), out: KFinding[] = [], F = (code: string, severity: KFinding["severity"], lessonId: string | null, text: string): void => { out.push({ code, severity, lessonId, text }); };
  const leafBy = new Set(f.leaves.map((l) => l.id)), roles = new Set(f.roles.map((r) => r.toLowerCase())), codes = new Set(f.riskCodes.map((c) => c.toLowerCase()));
  if (!d.lessons.length && !f.materialized.length) return out;
  d.lessons.forEach((l) => {
    const w = l.code + (l.lesson.trim() ? " «" + l.lesson.trim().slice(0, 60) + (l.lesson.trim().length > 60 ? "…" : "") + "»" : "");
    if (!l.situation.trim() || !l.lesson.trim()) F("K2", "aviso", l.id, l.code + ": falta qué pasó o qué se aprendió: sin contexto la lección no se entiende ni se puede reutilizar.");
    if (!l.recommendation.trim()) F("K1", "aviso", l.id, w + ": no dice QUÉ HACER distinto la próxima vez: una lección sin recomendación accionable es una anécdota.");
    if (l.status === "capturada" && iso(l.date) && iso(today) && gap(l.date, today) > UNVALIDATED_DAYS) F("K4", "info", l.id, w + ": capturada el " + l.date + " y sin validar hace " + gap(l.date, today) + " días: valídala o descártala mientras se recuerde el contexto.");
    if (l.status === "transferida" && !l.audience.trim()) F("K5", "aviso", l.id, w + ": figura transferida pero no dice a quién (siguiente proyecto, área, organización).");
    if (l.owner.trim() && roles.size && !roles.has(l.owner.trim().toLowerCase())) F("K6", "info", l.id, w + ": el responsable «" + l.owner + "» no figura entre los puestos del OBS.");
    if (l.wbsId && f.leaves.length && !leafBy.has(l.wbsId)) F("K7", "aviso", l.id, w + ": apunta a un paquete de la EDT que ya no existe.");
    if (l.riskCode.trim() && codes.size && !codes.has(l.riskCode.trim().toLowerCase())) F("K7", "aviso", l.id, w + ": cita el riesgo " + l.riskCode + " que no existe en el Registro de Riesgos.");
  });
  const cited = new Set(d.lessons.map((l) => l.riskCode.trim().toLowerCase()).filter(Boolean));
  f.materialized.filter((r) => !cited.has(r.code.toLowerCase())).forEach((r) => F("K3", "aviso", null, "El riesgo " + r.code + " «" + r.title + "» se MATERIALIZÓ y ninguna lección lo cita: lo que costó aprender no queda registrado."));
  return out;
}
export type KnowledgeState = "vacio" | "verde" | "ambar" | "rojo";
export function knowledgeState(d: KnowledgeData, f: KFacts, today = ""): KnowledgeState {
  if (!d.lessons.length) return "vacio";
  const fs = knowledgeFindings(d, f, today);
  return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
}
export interface KnowledgeSummary { total: number; byStatus: Record<LessonStatus, number>; byKind: Record<LessonKind, number>; }
export function summary(d: KnowledgeData): KnowledgeSummary {
  const byStatus: Record<LessonStatus, number> = { capturada: 0, validada: 0, transferida: 0 }, byKind: Record<LessonKind, number> = { buena_practica: 0, problema: 0, oportunidad: 0 };
  d.lessons.forEach((l) => { byStatus[l.status]++; byKind[l.kind]++; });
  return { total: d.lessons.length, byStatus, byKind };
}
