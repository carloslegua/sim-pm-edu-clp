// Ejemplo DISTRIB+ S.A. del control integrado de cambios -- UNA sola fuente (Control_Cambios.html, modo independiente, y
// «Cargar ejemplo» del proyecto conectado). Amplía el MISMO caso (Regla #6 de CLAUDE.md): cada solicitud (SC) corresponde a una
// de las tres órdenes de cambio de Costos (OC-001…003, mismos montos, fondos y estados) y a un riesgo del registro (R-03):
//   · CR-001 (aprobada por el CCB): el refuerzo de cimentación por el suelo (R-03). Con contingencia, dentro de la línea base de
//     costos, pero mueve el fin del proyecto +8 d (cimentaciones está en la ruta crítica): su línea base de cronograma aún NO se
//     actualizó, así que no puede marcarse Implementada (el ejemplo muestra qué falta).
//   · CR-002 (pendiente): la ampliación de la sala eléctrica pedida por el cliente. Cambia el alcance y necesita fondos adicionales
//     (sponsor); el CPM dice que +10 d en 4.5 los absorbe la holgura; faltan por evaluar riesgo y calidad: no se puede decidir.
//   · CR-003 (pendiente): la demolición de losa no identificada. Dentro del alcance, con reserva de gestión (sponsor), +5 d en ruta
//     crítica; evaluada por completo, falta la decisión.
// Los paquetes se dan por Código EDT (`wbs`) y los riesgos y las órdenes por su código/id del ejemplo: cada módulo los resuelve
// contra su propia EDT. Un test de humo verifica que las órdenes coinciden con las de Costos.
import { normalizeCr, type AreaState, type ChangeRequest } from "./change-control";

export interface SampleCr extends Partial<ChangeRequest> { wbs: string[]; riskCodes: string[]; }
const im = (state: AreaState, note = ""): { state: AreaState; note: string } => ({ state, note });

// Las órdenes de cambio de Costos del ejemplo (las mismas de Cost-management: SAMPLE_CO).
export const SAMPLE_COST_ORDERS = [
  { id: "OC-001", cost: 180000, fund: "Contingencia", status: "Aprobada", baselined: null as string | null },
  { id: "OC-002", cost: 240000, fund: "Financiamiento adicional", status: "Pendiente", baselined: null as string | null },
  { id: "OC-003", cost: 90000, fund: "Reserva de gestión", status: "Pendiente", baselined: null as string | null }
];
export const SAMPLE_CRS: SampleCr[] = [
  { code: "CR-001", title: "Refuerzo de cimentación por hallazgo geotécnico", description: "El estudio de suelos ampliado detecta estratos de baja capacidad portante: se refuerza la cimentación (riesgo R-03 materializado).",
    requester: "Jefe de Ingeniería", requestedOn: "2026-08-01", origin: "Riesgo materializado", type: "Acción correctiva", wbs: ["4.2"], riskCodes: ["R-03"],
    impact: { scope: im("sin_impacto", "El refuerzo mantiene el entregable: la cimentación cumple lo especificado con otra solución."), schedule: im("con_impacto"), cost: im("con_impacto"),
      risk: im("con_impacto"), quality: im("con_impacto", "Ensayos adicionales de compactación y de resistencia del concreto."), resources: im("sin_impacto", "Misma cuadrilla; más horas.") } as ChangeRequest["impact"],
    daysDelta: 8, costDelta: 180000, fund: "Contingencia", orderIds: ["OC-001"],
    status: "Aprobada", decidedOn: "2026-08-03", approver: "CCB", authLevel: "ccb", rationale: "Riesgo identificado que ocurrió; se atiende con la contingencia (dentro de la línea base). Lo autoriza el CCB por su monto y porque mueve el fin del proyecto." },
  { code: "CR-002", title: "Ampliación de sala eléctrica solicitada por el cliente", description: "El cliente pide ampliar la sala eléctrica con dos tableros adicionales.",
    requester: "DISTRIB+ (cliente)", requestedOn: "2026-09-01", origin: "Solicitud del cliente", type: "Actualización de la línea base o del plan", wbs: ["4.5"], riskCodes: [],
    impact: { scope: im("con_impacto", "Amplía el alcance de Instalaciones MEP con dos tableros y su cableado."), schedule: im("con_impacto"), cost: im("con_impacto"),
      risk: im("sin_evaluar"), quality: im("sin_evaluar"), resources: im("con_impacto", "Una cuadrilla eléctrica adicional durante dos semanas.") } as ChangeRequest["impact"],
    daysDelta: 10, costDelta: 240000, fund: "Financiamiento adicional", orderIds: ["OC-002"], status: "Pendiente" },
  { code: "CR-003", title: "Demolición de losa existente no identificada en el levantamiento", description: "Aparece una losa antigua bajo la plataforma que no figuraba en el levantamiento: hay que demolerla antes de excavar.",
    requester: "Residente de Obra", requestedOn: "2026-09-08", origin: "Trabajo imprevisto dentro del alcance", type: "Acción correctiva", wbs: ["4.1"], riskCodes: [],
    impact: { scope: im("sin_impacto", "Pertenece al alcance ya aprobado (movimiento de tierras): no es un cambio de alcance."), schedule: im("con_impacto"), cost: im("con_impacto"),
      risk: im("sin_impacto", "No estaba identificado en el registro de riesgos."), quality: im("sin_impacto", "Sin efecto en la calidad."), resources: im("con_impacto", "Equipo de demolición por 4 días.") } as ChangeRequest["impact"],
    daysDelta: 5, costDelta: 90000, fund: "Reserva de gestión", orderIds: ["OC-003"], status: "Pendiente" }
];
// Las SC del ejemplo como objetos normalizados; `resolveWbs` convierte un Código EDT en el id del paquete de SU EDT ("" si no existe:
// se omite) y `resolveRisk` un código de riesgo en su id.
export function buildSampleCrs(resolveWbs: (code: string) => string, resolveRisk: (code: string) => string): ChangeRequest[] {
  return SAMPLE_CRS.map((s, i) => normalizeCr({ ...s, id: "cr" + (i + 1), wbsIds: s.wbs.map(resolveWbs).filter(Boolean), riskIds: s.riskCodes.map(resolveRisk).filter(Boolean) }, "cr" + (i + 1)));
}
