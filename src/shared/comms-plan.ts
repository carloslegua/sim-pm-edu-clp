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
export interface CommData { items: CommItem[]; plan: CommPlan; idCounter: number; }

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
export const blankPlan = (): CommPlan => ({ escalation: "", restrictions: "", review: "" });
export function normalizeItem(o: unknown, fallbackId: string): CommItem {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>, id = str(x.id) || fallbackId;
  return { id, code: str(x.code) || id, info: str(x.info), purpose: str(x.purpose), stkIds: strs(x.stkIds), audience: str(x.audience), sender: str(x.sender), frequency: str(x.frequency), method: str(x.method), channel: str(x.channel), storage: str(x.storage), notes: str(x.notes) };
}
export function normalizeComms(raw: unknown): CommData {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, p = (x.plan && typeof x.plan === "object" ? x.plan : {}) as Record<string, unknown>;
  const items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem(o, "cm" + (i + 1)));
  return { items, plan: { escalation: str(p.escalation), restrictions: str(p.restrictions), review: str(p.review) }, idCounter: Number(x.idCounter) || items.length + 1 };
}
export const blankItem = (id: string, code: string): CommItem => normalizeItem({ id, code }, id);
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
export function commFindings(d: CommData, f: CommFacts): CFinding[] {
  const out: CFinding[] = [], F = (code: string, severity: CFinding["severity"], itemId: string | null, text: string): void => { out.push({ code, severity, itemId, text }); };
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
  return out;
}
export type CommState = "vacio" | "verde" | "ambar" | "rojo";
export function commState(d: CommData, f: CommFacts): CommState {
  if (!d.items.length) return "vacio";
  const fs = commFindings(d, f);
  return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
}
