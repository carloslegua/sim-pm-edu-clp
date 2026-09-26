// Plan de gestión de las comunicaciones (PMBOK: «Planificar la gestión de las comunicaciones») — lógica PURA (sin DOM ni `localStorage`),
// inlineada en comms.js. Las pruebas la importan directo.
//
// Qué es: la MATRIZ de comunicaciones (qué información, para qué, a quién, quién la emite, con qué frecuencia y por qué medio, y dónde
// queda registrada) más las reglas del plan (escalamiento, restricciones y confidencialidad, actualización). El módulo NO duplica a los
// interesados: los destinatarios se ELIGEN de Stakeholder Studio (por id) y el plan se revisa contra ellos: cada interesado debe recibir
// lo que su estrategia exige, y a quien hay que «gestionar de cerca» o cuyo compromiso debe subir no le puede faltar una comunicación.
// Los criterios de cobertura son didácticos declarados (no una norma): PMBOK pide una comunicación planificada y eficaz, no un número.

export const FREQUENCIES = ["Única vez", "Diaria", "Semanal", "Quincenal", "Mensual", "Por hito", "Por evento"] as const;
export const METHODS = ["Reunión presencial", "Videollamada", "Informe escrito", "Correo electrónico", "Plataforma o tablero", "Comunicado o nota de prensa", "Presentación"] as const;
// Frecuencias «altas» (semanal o más): a un interesado de bajo poder e interés se le sobrecomunica.
const HIGH_FREQ = ["Diaria", "Semanal"];

export interface CommItem {
  id: string; code: string; info: string; purpose: string;
  stkIds: string[]; audience: string;               // destinatarios registrados (por id) y, aparte, texto libre (p. ej. «equipo de obra»)
  sender: string; frequency: string; method: string; channel: string; storage: string; notes: string;
}
export interface CommPlan { escalation: string; restrictions: string; review: string; }
// BITÁCORA de comunicaciones EMITIDAS (auditoría, media): el plan promete comunicaciones; en la ejecución se registra cada una que realmente se hizo (cuál del plan, cuándo, quién, qué se dijo y dónde queda la
// evidencia) y las que se reprogramaron u omitieron (con su motivo). `asOf` = fecha de corte del seguimiento (vacía = hoy): contra ella se juzga qué comunicación periódica quedó sin emitir.
export const LOG_STATUSES = ["emitida", "reprogramada", "omitida"] as const;
export type LogStatus = typeof LOG_STATUSES[number];
export const LOG_STATUS_LABEL: Record<LogStatus, string> = { emitida: "Emitida", reprogramada: "Reprogramada", omitida: "Omitida" };
export interface CommLog { id: string; code: string; itemId: string; date: string; status: LogStatus; by: string; summary: string; evidence: string; }
export interface CommData { items: CommItem[]; plan: CommPlan; idCounter: number; log: CommLog[]; asOf: string; }

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
export const blankPlan = (): CommPlan => ({ escalation: "", restrictions: "", review: "" });
export function normalizeItem(o: unknown, fallbackId: string): CommItem {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>, id = str(x.id) || fallbackId;
  return { id, code: str(x.code) || id, info: str(x.info), purpose: str(x.purpose), stkIds: strs(x.stkIds), audience: str(x.audience), sender: str(x.sender), frequency: str(x.frequency), method: str(x.method), channel: str(x.channel), storage: str(x.storage), notes: str(x.notes) };
}
export function normalizeLog(o: unknown, fallbackId: string): CommLog {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>, id = str(x.id) || fallbackId;
  return { id, code: str(x.code) || id, itemId: str(x.itemId), date: str(x.date), status: (LOG_STATUSES.indexOf(x.status as LogStatus) >= 0 ? x.status : "emitida") as LogStatus, by: str(x.by), summary: str(x.summary), evidence: str(x.evidence) };
}
export function normalizeComms(raw: unknown): CommData {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, p = (x.plan && typeof x.plan === "object" ? x.plan : {}) as Record<string, unknown>;
  const items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem(o, "cm" + (i + 1)));
  const log = (Array.isArray(x.log) ? x.log : []).map((o, i) => normalizeLog(o, "lg" + (i + 1)));
  return { items, plan: { escalation: str(p.escalation), restrictions: str(p.restrictions), review: str(p.review) }, idCounter: Number(x.idCounter) || items.length + log.length + 1, log, asOf: /^\d{4}-\d{2}-\d{2}$/.test(str(x.asOf)) ? str(x.asOf) : "" };
}
export const blankItem = (id: string, code: string): CommItem => normalizeItem({ id, code }, id);
export function nextLogCode(log: CommLog[]): string { let max = 0; log.forEach((c) => { const m = /(\d+)\s*$/.exec(c.code); if (m) max = Math.max(max, Number(m[1])); }); return "LG-" + String(max + 1).padStart(2, "0"); }
const isoOk = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const asOfOf = (d: CommData, today: string): string => (isoOk(d.asOf) ? d.asOf : today);
const dayGap = (a: string, b: string): number => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);   // b − a
// Umbrales didácticos DECLARADOS (no una norma): una comunicación periódica sin emitir en más de dos períodos se avisa; un interesado a gestionar de cerca sin ninguna emitida en 45 días, también.
export const PERIOD_DAYS: Record<string, number> = { Diaria: 1, Semanal: 7, Quincenal: 15, Mensual: 30 };
export const CLOSE_SILENCE_DAYS = 45;
export function nextCode(items: CommItem[]): string { let max = 0; items.forEach((c) => { const m = /(\d+)\s*$/.exec(c.code); if (m) max = Math.max(max, Number(m[1])); }); return "CM-" + String(max + 1).padStart(2, "0"); }
// Canales de comunicación potenciales entre n personas (PMBOK: n(n−1)/2): crece con el cuadrado, por eso se planifica.
export const channelsFor = (n: number): number => (n > 1 ? (n * (n - 1)) / 2 : 0);

// ---- lo que se lee de Stakeholder Studio y del OBS (solo lectura) ----
export type Quadrant = "cerca" | "satisfecho" | "informado" | "monitorear";
export interface CommStakeholder { id: string; name: string; quadrant: Quadrant | null; engCurrent: number | null; engDesired: number | null; }
export interface CommFacts { stakeholders: CommStakeholder[]; roles: string[]; }

export interface CoverageRow { stk: CommStakeholder; items: CommItem[]; gap: number | null; }
export function coverage(items: CommItem[], f: CommFacts): CoverageRow[] {
  return f.stakeholders.map((s) => ({
    stk: s, items: items.filter((c) => c.stkIds.indexOf(s.id) >= 0),
    gap: s.engCurrent !== null && s.engDesired !== null ? s.engDesired - s.engCurrent : null
  }));
}

export interface CFinding { code: string; severity: "riesgo" | "aviso" | "info"; itemId: string | null; text: string; }
export function commFindings(d: CommData, f: CommFacts, today0 = ""): CFinding[] {
  const today = asOfOf(d, today0), out: CFinding[] = [], F = (code: string, severity: CFinding["severity"], itemId: string | null, text: string): void => { out.push({ code, severity, itemId, text }); };
  const known = new Set(f.stakeholders.map((s) => s.id)), roles = new Set(f.roles.map((r) => r.toLowerCase()));
  d.items.forEach((c) => {
    const w = c.code + (c.info.trim() ? " «" + c.info.trim() + "»" : "");
    if (!c.info.trim() || !c.purpose.trim()) F("M4", "aviso", c.id, w + ": falta qué información se comunica o para qué (sin propósito no se puede juzgar si hace falta).");
    if (!c.stkIds.length && !c.audience.trim()) F("M5", "aviso", c.id, w + ": no tiene destinatarios (elige interesados o describe la audiencia).");
    if (c.stkIds.some((i) => !known.has(i)) && known.size) F("M6", "aviso", c.id, w + ": apunta a un interesado que ya no existe en Stakeholder Studio.");
    if (!c.sender.trim()) F("M7", "aviso", c.id, w + ": no dice quién la emite.");
    else if (roles.size && !roles.has(c.sender.trim().toLowerCase())) F("M7", "info", c.id, w + ": el emisor «" + c.sender + "» no figura entre los puestos del OBS.");
    if (!c.frequency || !c.method) F("M8", "aviso", c.id, w + ": falta la frecuencia o el medio.");
    if (!c.storage.trim()) F("M9", "info", c.id, w + ": no dice dónde queda el registro (acta, informe archivado): sin registro no hay evidencia de que se comunicó.");
  });
  coverage(d.items, f).forEach((r) => {
    const s = r.stk;
    if (!r.items.length) {
      if (s.quadrant === "cerca") F("M1", "riesgo", null, "«" + s.name + "» es un interesado a gestionar de cerca y no recibe ninguna comunicación planificada.");
      else if (r.gap !== null && r.gap > 0) F("M2", "aviso", null, "«" + s.name + "» debe pasar del compromiso " + s.engCurrent + " al " + s.engDesired + " y ninguna comunicación va dirigida a ellos.");
      else F("M3", "info", null, "«" + s.name + "» no figura como destinatario de ninguna comunicación.");
    } else if (r.gap !== null && r.gap >= 2 && r.items.every((c) => c.frequency === "Única vez" || c.frequency === "Por evento")) {
      F("M2", "aviso", null, "«" + s.name + "» tiene una brecha de compromiso de " + r.gap + " niveles y solo recibe comunicaciones puntuales: un cambio de actitud necesita contacto sostenido.");
    }
    if (s.quadrant === "monitorear" && r.items.some((c) => HIGH_FREQ.indexOf(c.frequency) >= 0)) F("M10", "info", null, "«" + s.name + "» es un interesado a solo monitorear y recibe comunicaciones diarias o semanales: se sobrecomunica.");
  });
  if (d.items.length && !d.plan.escalation.trim()) F("M11", "aviso", null, "El plan no define la ruta de escalamiento de los asuntos de comunicación (a quién y en cuánto tiempo).");
  if (d.items.length && !d.plan.review.trim()) F("M12", "info", null, "El plan no dice cómo ni cuándo se revisa y actualiza la matriz (p. ej. tras cada cambio de interesados).");
  // ---- ejecución: bitácora de comunicaciones emitidas ----
  const itemBy = new Map(d.items.map((c) => [c.id, c] as const)), emitted = d.log.filter((l) => l.status === "emitida" && isoOk(l.date));
  d.log.forEach((l) => {
    const w = l.code + (itemBy.has(l.itemId) ? " (" + (itemBy.get(l.itemId) as CommItem).code + ")" : "");
    if (!itemBy.has(l.itemId)) F("M13", "aviso", null, w + ": no corresponde a ninguna comunicación de la matriz" + (l.itemId ? " (ya no existe)" : "") + ": lo que se comunica sin estar planificado no tiene destinatarios ni propósito acordados.");
    if (l.status !== "emitida" && !l.summary.trim()) F("M14", "aviso", null, w + ": está " + LOG_STATUS_LABEL[l.status].toLowerCase() + " y no dice por qué: una comunicación que no se hizo necesita su motivo y, si se reprograma, su nueva fecha.");
    if (l.status === "emitida" && (!isoOk(l.date) || !l.evidence.trim())) F("M14", "info", null, w + ": emitida sin " + (!isoOk(l.date) ? "fecha" : "evidencia") + " registrada: sin evidencia no se puede demostrar que se comunicó.");
  });
  if (isoOk(today) && d.log.length) {
    d.items.filter((c) => PERIOD_DAYS[c.frequency] !== undefined).forEach((c) => {
      const mine = emitted.filter((l) => l.itemId === c.id).map((l) => l.date).sort(), last = mine.length ? mine[mine.length - 1] : "", limit = PERIOD_DAYS[c.frequency] * 2;
      if (!last || dayGap(last, today) > limit) F("M16", "aviso", c.id, c.code + " «" + c.info.trim().slice(0, 50) + "»: es " + c.frequency.toLowerCase() + " y " + (last ? "la última emitida fue el " + last + " (hace " + dayGap(last, today) + " días)" : "no hay ninguna emitida") + " a la fecha de corte " + today + ": el plan promete un ritmo que la ejecución no cumple.");
    });
    coverage(d.items, f).forEach((r) => {
      if (r.stk.quadrant !== "cerca") return;
      const ids = new Set(r.items.map((c) => c.id)), mine = emitted.filter((l) => ids.has(l.itemId)).map((l) => l.date).sort(), last = mine.length ? mine[mine.length - 1] : "";
      if (!last || dayGap(last, today) > CLOSE_SILENCE_DAYS) F("M15", "aviso", null, "«" + r.stk.name + "» es un interesado a gestionar de cerca y " + (last ? "su última comunicación emitida fue el " + last + " (hace " + dayGap(last, today) + " días)" : "no se le ha emitido ninguna comunicación") + ": supera los " + CLOSE_SILENCE_DAYS + " días de silencio.");
    });
  }
  return out;
}
export type CommState = "vacio" | "verde" | "ambar" | "rojo";
export function commState(d: CommData, f: CommFacts, today = ""): CommState {
  if (!d.items.length) return "vacio";
  const fs = commFindings(d, f, today);
  return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
}
