// Restricciones de los hitos del Plan del Cronograma contra las fechas del CPM — lógica PURA (sin DOM ni `localStorage`), inlineada en schedule-plan.js y
// plan-direccion.js.
//
// Auditoría (media): el Plan del Cronograma deja elegir para cada hito una restricción (FNLT, FNET, MSO, MFO…) y una fecha, pero nada la comparaba con lo que el CPM
// calcula: un hito «a más tardar el 30/09» podía convivir con un cronograma que termina el trabajo el 11/11 sin ningún aviso. Ahora cada hito puede
// vincularse a los elementos de la EDT que lo cierran (`wbsCode`, uno o varios códigos separados por coma; un código de fase = su fin más tardío) y se compara la fecha
// del hito con el fin que da el CPM (la EDT efectiva: fechas del cronograma real).
//   · FNLT (terminar a más tardar): incumple si el fin del CPM es POSTERIOR a la fecha; cumple con holgura si es anterior.
//   · FNET (terminar no antes de): el CPM terminaría ANTES → el trabajo tendría que esperar (aviso «espera»); no incumple.
//   · MSO/MFO (fecha obligatoria): solo cumplen si el fin coincide con la fecha.
//   · ASAP/ALAP: no fijan una fecha que comparar.
// Los días son CALENDARIO (no laborables): es la misma unidad que las fechas del hito.
export type MilestoneStatus = "cumple" | "incumple" | "espera" | "sin-vinculo" | "sin-cpm" | "no-aplica";
export interface MilestoneCheck { name: string; date: string; constraint: string; codes: string[]; cpmFinish: string; status: MilestoneStatus; days: number | null; text: string; }
export interface WbsEnds { rootId: string; nodes: Record<string, { children?: unknown; end?: unknown }>; }

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const iso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayDiff = (a: string, b: string): number => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);   // b − a
export const DATED_CONSTRAINTS = ["FNLT", "FNET", "MSO", "MFO"];

// Fin (el más tardío de sus hojas) de cada elemento de la EDT por su código jerárquico (1, 1.1, 1.1.2…).
export function endsByCode(wbs: WbsEnds | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!wbs || !wbs.nodes || !wbs.nodes[wbs.rootId]) return out;
  const seen = new Set<string>();
  const walk = (id: string, code: string): string => {
    const n = wbs.nodes[id]; if (!n || seen.has(id)) return ""; seen.add(id);
    const kids = Array.isArray(n.children) ? (n.children as unknown[]).map(str).filter((c) => !!wbs.nodes[c]) : [];
    let end = kids.length ? "" : (iso(str(n.end)) ? str(n.end) : "");
    kids.forEach((c, i) => { const e = walk(c, (code ? code + "." : "") + (i + 1)); if (e && (!end || e > end)) end = e; });
    if (code) out[code] = end;
    return end;
  };
  walk(wbs.rootId, "");
  return out;
}

const splitCodes = (s: string): string[] => str(s).split(/[,;\s]+/).map((c) => c.trim()).filter(Boolean);

export function checkMilestones(milestones: unknown, wbs: WbsEnds | null | undefined): MilestoneCheck[] {
  const ends = endsByCode(wbs), list = Array.isArray(milestones) ? milestones : [];
  return list.map((raw) => {
    const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, name = str(m.name).trim(), date = str(m.date), constraint = str(m.constraint).toUpperCase(), codes = splitCodes(str(m.wbsCode));
    const base = { name, date, constraint, codes, cpmFinish: "", days: null as number | null };
    if (DATED_CONSTRAINTS.indexOf(constraint) < 0) return { ...base, status: "no-aplica" as const, text: "La restricción " + (constraint || "—") + " no fija una fecha que comparar con el CPM." };
    if (!iso(date)) return { ...base, status: "no-aplica" as const, text: "El hito no tiene fecha." };
    if (!codes.length) return { ...base, status: "sin-vinculo" as const, text: "Tiene restricción " + constraint + " pero no indica qué elementos de la EDT lo cierran: no se puede compararla con el CPM." };
    const found = codes.map((c) => ends[c]).filter((e) => !!e);
    if (found.length !== codes.length) return { ...base, status: "sin-cpm" as const, text: "No hay fecha de fin para " + codes.filter((c) => !ends[c]).join(", ") + " (código inexistente en la EDT o sin fechas)." };
    const finish = found.reduce((a, b) => (b > a ? b : a)), diff = dayDiff(date, finish);   // > 0: el CPM termina después del hito
    const at = codes.join(" + ") + " termina el " + finish;
    if (constraint === "FNLT") return diff > 0 ? { ...base, cpmFinish: finish, days: diff, status: "incumple" as const, text: at + ", " + diff + " día(s) DESPUÉS de la fecha del hito (a más tardar el " + date + ")." } : { ...base, cpmFinish: finish, days: Math.abs(diff), status: "cumple" as const, text: at + (diff === 0 ? ": justo en la fecha límite (sin holgura)." : ", " + (-diff) + " día(s) antes de la fecha límite.") };
    if (constraint === "FNET") return diff < 0 ? { ...base, cpmFinish: finish, days: -diff, status: "espera" as const, text: at + ", " + (-diff) + " día(s) ANTES de la fecha mínima (" + date + "): el trabajo tendría que esperar." } : { ...base, cpmFinish: finish, days: diff, status: "cumple" as const, text: at + ": no antes del " + date + "." };
    return diff === 0 ? { ...base, cpmFinish: finish, days: 0, status: "cumple" as const, text: at + ": coincide con la fecha obligatoria." } : { ...base, cpmFinish: finish, days: Math.abs(diff), status: "incumple" as const, text: at + ", " + Math.abs(diff) + " día(s) " + (diff > 0 ? "después" : "antes") + " de la fecha obligatoria (" + date + ")." };
  });
}

export interface MilestoneSummary { checked: number; violated: number; waiting: number; unlinked: number; first: string; }
export function milestoneSummary(cs: MilestoneCheck[]): MilestoneSummary {
  const bad = cs.filter((c) => c.status === "incumple");
  return { checked: cs.filter((c) => c.status === "cumple" || c.status === "incumple" || c.status === "espera").length, violated: bad.length, waiting: cs.filter((c) => c.status === "espera").length, unlinked: cs.filter((c) => c.status === "sin-vinculo" || c.status === "sin-cpm").length, first: bad.length ? bad[0].name + ": " + bad[0].text : "" };
}
