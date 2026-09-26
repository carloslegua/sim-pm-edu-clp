// Aprobación y versiones del ACTA DE CONSTITUCIÓN — lógica PURA (sin DOM ni `localStorage`), inlineada en project-charter.js.
//
// Auditoría (media): el Acta solo tenía dos campos de firma (nombre y fecha); no había «aprobada» ni versiones, y cualquier edición posterior
// (presupuesto, patrocinador…) se copiaba de inmediato a los metadatos del proyecto, de modo que un cambio sin autorizar movía el CAPEX que leen los
// demás módulos. Ahora el Acta se APRUEBA (versión, fecha, quién y por qué) y guarda una instantánea de su contenido; lo editado después es TRABAJO EN
// EDICIÓN que se compara con lo aprobado (`charterDrift`), y mientras difiera no se propaga a los metadatos (patrocinador, director, cliente, CAPEX y
// moneda). Solo una NUEVA versión aprobada actualiza la referencia; la anterior se archiva completa. Mismo criterio que la línea base de requisitos y la
// del alcance: se reutiliza su motor de versiones.
import { advanceBaseline, newVersionProblems, normalizeRBaseline, suggestNextVersion, type NewVersionInput, type RBaseline } from "./requirements-baseline";
import { stableStringify } from "./pm-plan";

export type CharterContent = Record<string, unknown>;
export type CharterBaseline = RBaseline<CharterContent>;

// Qué NO es contenido del acta: las firmas (se registran al aprobar) y la propia línea base.
const EXCLUDED = ["approval", "baseline"];
const SECTION_LABELS: Record<string, string> = {
  identification: "Identificación y autoridad", purpose: "Propósito", businessCase: "Caso de negocio", description: "Descripción", boundaries: "Límites",
  objectives: "Objetivos", requirements: "Requisitos de alto nivel", deliverables: "Entregables", milestones: "Hitos", budget: "Presupuesto",
  preAssignedResources: "Recursos preasignados", risks: "Riesgos", assumptions: "Supuestos", constraints: "Restricciones", exclusions: "Exclusiones",
  stakeholders: "Interesados", approvalRequirements: "Requisitos de aprobación", exitCriteria: "Criterios de salida", sponsors: "Patrocinadores"
};

export function charterContent(state: unknown): CharterContent {
  const s = (state && typeof state === "object" ? state : {}) as Record<string, unknown>, out: CharterContent = {};
  Object.keys(s).filter((k) => EXCLUDED.indexOf(k) < 0).forEach((k) => { out[k] = JSON.parse(JSON.stringify(s[k] === undefined ? null : s[k])); });
  return out;
}

export function normalizeCharterBaseline(o: unknown): CharterBaseline | null {
  if (!o || typeof o !== "object") return null;
  const b = normalizeRBaseline<CharterContent>(o);
  return b.frozen && b.snapshot.length ? b : null;
}

export interface CharterDrift { approved: boolean; drifted: boolean; sections: string[]; }
// ¿El acta en edición difiere de la aprobada? y, si sí, qué secciones.
export function charterDrift(state: unknown, baseline: CharterBaseline | null | undefined): CharterDrift {
  if (!baseline || !baseline.frozen || !baseline.snapshot.length) return { approved: false, drifted: false, sections: [] };
  const now = charterContent(state), then = baseline.snapshot[0], keys = Array.from(new Set(Object.keys(now).concat(Object.keys(then))));
  const sections = keys.filter((k) => stableStringify(now[k] === undefined ? null : now[k]) !== stableStringify(then[k] === undefined ? null : then[k])).map((k) => SECTION_LABELS[k] || k);
  return { approved: true, drifted: sections.length > 0, sections };
}

// Qué falta para aprobar: la primera vez se reutiliza el motivo «Aprobación inicial»; desde la segunda hay que documentar el cambio.
export function approvalProblems(baseline: CharterBaseline | null | undefined, i: NewVersionInput): string[] {
  return newVersionProblems(baseline || { version: "", history: [] }, i);
}
export function suggestCharterVersion(baseline: CharterBaseline | null | undefined): string { return baseline ? suggestNextVersion(baseline) : "1.0"; }

// Aprueba el acta: la primera vez fija la versión inicial; después archiva la vigente COMPLETA y establece la siguiente. No modifica los argumentos.
export function approveCharter(state: unknown, baseline: CharterBaseline | null | undefined, i: NewVersionInput, today: string): CharterBaseline {
  const content = charterContent(state);
  if (!baseline) return { frozen: true, version: i.version.trim(), date: i.date, approver: i.approver.trim(), reason: i.reason.trim(), snapshot: [content], history: [] };
  return advanceBaseline(baseline, [content], i, today);
}
