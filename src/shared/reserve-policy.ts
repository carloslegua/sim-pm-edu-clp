// Política de reservas del plan de gestión de riesgos -- lógica PURA compartida en tiempo de COMPILACIÓN (Vite la
// inlinea en risks.js, cost.js y gpi-core.js).
//
// Base metodológica (PMI / PMBOK, Gestión de los riesgos y del costo):
//  · La CONTINGENCIA es una reserva DENTRO de la línea base para riesgos identificados; la RESERVA DE GESTIÓN está FUERA de
//    la línea base (riesgos desconocidos) y la autoriza la dirección (sponsor). El plan de gestión de riesgos define
//    QUIÉN puede liberar cada reserva y hasta qué monto (niveles de autoridad), y cuándo se escala.
//  · El uso de la reserva se MONITOREA: cuando la contingencia disponible baja de un umbral, se escala (AACE 40R-08: la
//    contingencia es un fondo que se gasta contra riesgos; su agotamiento anticipa que el estimado o el registro se quedaron cortos).
//
// Niveles de autoridad (de menor a mayor): Director de Proyecto < CCB < Sponsor.
//  · Contingencia: hasta `pmLimit` la libera el Director de Proyecto; hasta `ccbLimit`, el CCB; por encima, el sponsor.
//    Un límite vacío significa que ese nivel no tiene autoridad propia (se pasa al siguiente). Sin ningún límite no hay
//    política por montos.
//  · Reserva de gestión y financiamiento adicional: SIEMPRE el sponsor (no depende de los montos).
// Los montos son POR ORDEN, en la moneda del proyecto.

export type AuthLevel = "pm" | "ccb" | "sponsor";
export const AUTH_LEVELS: AuthLevel[] = ["pm", "ccb", "sponsor"];
export const AUTH_LABEL: Record<AuthLevel, string> = { pm: "Director de Proyecto", ccb: "CCB", sponsor: "Sponsor" };
const RANK: Record<AuthLevel, number> = { pm: 1, ccb: 2, sponsor: 3 };

export interface ReservePolicy {
  pmLimit: number | null;        // contingencia: monto máximo por orden que libera el Director de Proyecto
  ccbLimit: number | null;       // contingencia: monto máximo por orden que libera el CCB (por encima, el sponsor)
  contAlertPct: number | null;   // escalar cuando la contingencia disponible baja de este % de la inicial
}
export const DEFAULT_RESERVES: ReservePolicy = { pmLimit: null, ccbLimit: null, contAlertPct: null };

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
  return typeof n === "number" && isFinite(n) ? n : null;
};
export function normalizeReserves(o: unknown): ReservePolicy {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  return { pmLimit: numOrNull(x.pmLimit), ccbLimit: numOrNull(x.ccbLimit), contAlertPct: numOrNull(x.contAlertPct) };
}
export function validateReserves(r: ReservePolicy): string[] {
  const out: string[] = [];
  if ((r.pmLimit !== null && !(r.pmLimit >= 0)) || (r.ccbLimit !== null && !(r.ccbLimit >= 0))) out.push("los límites de autoridad para liberar contingencia no pueden ser negativos");
  else if (r.pmLimit !== null && r.ccbLimit !== null && r.pmLimit > r.ccbLimit) out.push("el límite del Director de Proyecto no puede superar el del CCB");
  if (r.contAlertPct !== null && !(r.contAlertPct > 0 && r.contAlertPct <= 100)) out.push("el umbral de alerta de contingencia debe estar entre 0 y 100 % de la contingencia inicial");
  return out;
}
export const hasTiers = (r: ReservePolicy | null | undefined): boolean => !!r && (r.pmLimit !== null || r.ccbLimit !== null);

export type FundKind = "cont" | "mgmt" | "extra";
// Nivel MÍNIMO que debe autorizar una orden de `amount` con cargo a `fund`; null = la política no exige un nivel.
export function requiredLevel(policy: ReservePolicy | null | undefined, fund: FundKind, amount: number): AuthLevel | null {
  if (fund !== "cont") return "sponsor";                    // fuera de la línea base: siempre la dirección
  if (!hasTiers(policy)) return null;
  const p = policy as ReservePolicy, a = Math.abs(amount) || 0;
  if (p.pmLimit !== null && a <= p.pmLimit + 1e-9) return "pm";
  if (p.ccbLimit === null || a <= p.ccbLimit + 1e-9) return "ccb";
  return "sponsor";
}
// Nivel con el que quedó autorizada una orden. Explícito (`authLevel`) o, en órdenes anteriores a este campo, deducido de la
// autorización del sponsor o del texto del aprobador (compatibilidad con los .json ya exportados).
export function authLevelOf(o: { authLevel?: unknown; sponsorAuth?: unknown; approver?: unknown }): AuthLevel | null {
  if (o.authLevel === "pm" || o.authLevel === "ccb" || o.authLevel === "sponsor") return o.authLevel;
  if (o.sponsorAuth) return "sponsor";
  const t = String(o.approver || "").toLowerCase();
  if (/sponsor|patrocin/.test(t)) return "sponsor";
  if (/\bccb\b|comit/.test(t)) return "ccb";
  if (/director|gerente de proyecto|jefe de proyecto|project manager|\bpm\b/.test(t)) return "pm";
  return null;
}
export const levelCovers = (have: AuthLevel | null, need: AuthLevel | null): boolean => need === null || (have !== null && RANK[have] >= RANK[need]);

// Explica los tramos de la política para un monto: «hasta 50.000: Director de Proyecto · hasta 250.000: CCB · más: Sponsor».
export function tiersText(p: ReservePolicy, fmt: (n: number) => string): string {
  const parts: string[] = [];
  if (p.pmLimit !== null) parts.push("hasta " + fmt(p.pmLimit) + ": " + AUTH_LABEL.pm);
  if (p.ccbLimit !== null) parts.push("hasta " + fmt(p.ccbLimit) + ": " + AUTH_LABEL.ccb);
  else if (p.pmLimit !== null) parts.push("por encima: " + AUTH_LABEL.ccb);
  if (p.ccbLimit !== null) parts.push("por encima: " + AUTH_LABEL.sponsor);
  return parts.join(" · ");
}

// Alerta de agotamiento: la contingencia disponible bajó del umbral (% de la inicial). null = sin umbral o sin contingencia inicial.
export function contingencyAlert(available: number, initial: number, policy: ReservePolicy | null | undefined): { alert: boolean; pct: number; threshold: number } | null {
  if (!policy || policy.contAlertPct === null || !(initial > 0)) return null;
  const pct = available / initial * 100;
  return { alert: pct < policy.contAlertPct - 1e-9, pct, threshold: policy.contAlertPct };
}
