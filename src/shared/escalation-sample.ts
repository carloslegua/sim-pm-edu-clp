// Ejemplo DISTRIB+ S.A. de la ESCALACIÓN por índices (AACE 58R-10 / 68R-11) — UNA sola fuente (Cost-management.html, modo
// independiente). Amplía el MISMO caso (Regla #6 de CLAUDE.md): los mismos 18 paquetes de la EDT (códigos 1.1 … 5.3), sus costos
// (EVM_SAMPLE_COSTS, Σ 7.100.000) y las fechas de la red de 273 d que inicia el 2026-07-06.
//
// OJO: las TASAS de los índices son ILUSTRATIVAS. No son un pronóstico real: 58R-10 pide que el pronóstico de cada cuenta lo aporte un
// economista o una fuente reconocida (no extrapolar tendencias). Así lo dice la «fuente del pronóstico» de cada cuenta en pantalla.
import { ACCOUNT_IDS, normalizeEscPlan, type EscPlan } from "./escalation";

// Fecha base de precios del estimado (Basis of Estimate): la de las cotizaciones y precios unitarios del caso; anterior al inicio del proyecto.
export const SAMPLE_BASE_DATE = "2026-07-01";
export const SAMPLE_ESC_SOURCE = "Ejemplo DISTRIB+ — valores ILUSTRATIVOS (reemplazar por el pronóstico de un economista o de una fuente reconocida de índices de construcción).";

// Tasa anual esperada (%) por cuenta y año calendario, y rango de incertidumbre de la tasa (puntos porcentuales sobre el pronóstico,
// mín / máx): el riesgo es asimétrico hacia arriba, sobre todo en materiales (acero, cemento).
export const SAMPLE_ESC_ACCOUNTS: Record<string, { rates: Record<string, number>; low: number; high: number }> = {
  labor:       { rates: { "2026": 4.0, "2027": 4.5, "2028": 4.0 }, low: -1.0, high: 2.0 },
  material:    { rates: { "2026": 3.0, "2027": 3.5, "2028": 3.0 }, low: -1.5, high: 3.5 },
  equipment:   { rates: { "2026": 2.5, "2027": 3.0, "2028": 3.0 }, low: -1.0, high: 2.0 },
  subcontract: { rates: { "2026": 3.5, "2027": 4.0, "2028": 3.5 }, low: -1.0, high: 2.5 }
};
// Composición del costo de cada paquete por cuenta (%), por Código EDT. Lo que no figura usa la composición por omisión del plan.
export const SAMPLE_ESC_DEFAULT_MIX: Record<string, number> = { labor: 35, material: 35, equipment: 15, subcontract: 15 };
export const SAMPLE_ESC_MIX: Record<string, Record<string, number>> = {
  "1.1": { labor: 100 }, "1.2": { labor: 100 }, "1.3": { labor: 100 },                                        // Dirección de Proyecto: personal propio
  "2.1": { labor: 100 }, "2.2": { labor: 100 }, "2.3": { labor: 100 }, "2.4": { labor: 100 },                // Ingeniería y permisos: servicios profesionales
  "3.1": { material: 80, labor: 20 }, "3.2": { material: 100 }, "3.3": { equipment: 100 },                   // Procura
  "4.1": { labor: 35, equipment: 45, subcontract: 20 }, "4.2": { material: 45, labor: 35, equipment: 10, subcontract: 10 },
  "4.3": { labor: 30, equipment: 15, subcontract: 55 }, "4.4": { material: 40, labor: 40, subcontract: 20 }, "4.5": { subcontract: 100 },   // Construcción
  "5.1": { labor: 100 }, "5.2": { labor: 100 }, "5.3": { labor: 100 }                                          // Pruebas, capacitación y cierre
};
// Precio FIJADO por contrato: el índice deja de correr desde esa fecha. Estructuras metálicas (Proveedor A): contrato de suministro a precio
// fijo firmado el 2026-09-15, antes de la fabricación (inicia el 2026-09-29); equipos eléctricos (Proveedor C): al iniciar su compra.
export const SAMPLE_ESC_LOCKS: Record<string, string> = { "3.1": "2026-09-15", "3.3": "2026-09-28" };

// El plan del ejemplo; `resolve` convierte un Código EDT en el id del paquete de la EDT de quien lo use ("" si no existe: se omite).
export function buildSampleEscPlan(resolve: (code: string) => string): EscPlan {
  const packages: Record<string, { mix?: Record<string, number>; lock?: string }> = {};
  Object.keys(SAMPLE_ESC_MIX).forEach((code) => { const id = resolve(code); if (id) packages[id] = { mix: SAMPLE_ESC_MIX[code] }; });
  Object.keys(SAMPLE_ESC_LOCKS).forEach((code) => { const id = resolve(code); if (id) packages[id] = { ...(packages[id] || {}), lock: SAMPLE_ESC_LOCKS[code] }; });
  return normalizeEscPlan({
    method: "indices",
    accounts: ACCOUNT_IDS.map((id) => ({ id, rates: SAMPLE_ESC_ACCOUNTS[id].rates, source: SAMPLE_ESC_SOURCE, low: SAMPLE_ESC_ACCOUNTS[id].low, high: SAMPLE_ESC_ACCOUNTS[id].high })),
    defaultMix: SAMPLE_ESC_DEFAULT_MIX, packages, onContingency: true, provision: "p70", correlation: 0.5
  }, SAMPLE_BASE_DATE);
}
