// Versiones de la línea base de requisitos — lógica PURA (sin DOM ni `localStorage`), inlineada en requirements.js.
//
// Auditoría (media): «Congelar nueva versión» prometía que la anterior quedaba como historial, pero reemplazaba su versión, fecha e instantánea: el
// requisito que solo existía en la línea base v1.0 desaparecía del módulo guardado, y el aprobador ni siquiera se actualizaba. Ahora cada versión
// se ARCHIVA completa (versión, fecha, aprobador, motivo e instantánea de los requisitos) ANTES de establecer la siguiente; la vigente lleva su
// propio motivo. Una línea base guardada antes de esto se lee sin historial (lo que ya se perdió no se puede reconstruir).
export interface RArchived<T> { version: string; date: string; approver: string; reason: string; supersededOn: string; snapshot: T[]; }
export interface RBaseline<T> { frozen: boolean; version: string; date: string; approver: string; reason: string; snapshot: T[]; history: Array<RArchived<T>>; }

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const iso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// Lectura tolerante de lo guardado (datos antiguos sin `reason` ni `history`, o basura).
export function normalizeRBaseline<T>(o: unknown): RBaseline<T> {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  return {
    frozen: !!x.frozen, version: str(x.version) || "1.0", date: str(x.date), approver: str(x.approver), reason: str(x.reason), snapshot: arr<T>(x.snapshot),
    history: arr<Record<string, unknown>>(x.history).filter((h) => h && typeof h === "object").map((h) => ({ version: str(h.version), date: str(h.date), approver: str(h.approver), reason: str(h.reason), supersededOn: str(h.supersededOn), snapshot: arr<T>(h.snapshot) }))
  };
}
// Lo mínimo que necesitan las utilidades de versión (sirve también para la línea base del alcance: shared/scope-baseline.ts).
export interface VerHolder { version: string; history: Array<{ version: string }>; }
// Versiones ya usadas (la vigente y las archivadas).
export const usedVersions = (b: VerHolder): string[] => [b.version].concat(b.history.map((h) => h.version));
// «1.0» → «2.0»; si ya existe, sigue subiendo hasta una libre.
export function suggestNextVersion(b: VerHolder): string {
  const m = /^(\d+)(?:\.(\d+))?/.exec(b.version || "1.0"), used = new Set(usedVersions(b)); let maj = (m ? Number(m[1]) : 1) + 1;
  while (used.has(maj + ".0")) maj++;
  return maj + ".0";
}
export interface NewVersionInput { version: string; date: string; approver: string; reason: string; }
// Qué falta para fijar la nueva versión: número no repetido, quién la aprueba, cuándo y POR QUÉ (el motivo del cambio).
export function newVersionProblems(b: VerHolder, i: NewVersionInput): string[] {
  const p: string[] = [];
  if (!i.version.trim()) p.push("indica la versión");
  else if (usedVersions(b).indexOf(i.version.trim()) >= 0) p.push("la versión " + i.version.trim() + " ya existe (vigente o archivada)");
  if (!iso(i.date)) p.push("indica la fecha de aprobación");
  if (!i.approver.trim()) p.push("registra quién aprueba la nueva línea base");
  if (!i.reason.trim()) p.push("documenta el motivo del cambio (p. ej. las modificaciones de alcance aprobadas que incorpora)");
  return p;
}
// Archiva la versión vigente COMPLETA y establece la siguiente con el estado actual de los requisitos. No modifica `b` (devuelve una copia).
export function advanceBaseline<T>(b: RBaseline<T>, items: T[], i: NewVersionInput, today: string): RBaseline<T> {
  const archived: RArchived<T> = { version: b.version, date: b.date, approver: b.approver, reason: b.reason, supersededOn: today, snapshot: clone(b.snapshot) };
  return { frozen: true, version: i.version.trim(), date: i.date, approver: i.approver.trim(), reason: i.reason.trim(), snapshot: clone(items), history: clone(b.history).concat([archived]) };
}
// Requisitos de una versión archivada que ya no están (o cambiaron) en la siguiente: para mostrar qué se perdía y ahora se conserva.
export function onlyInVersion<T extends { id: string }>(older: T[], newer: T[]): T[] { const ids = new Set(newer.map((r) => r.id)); return older.filter((r) => !ids.has(r.id)); }
