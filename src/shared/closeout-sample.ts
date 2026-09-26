// Ejemplo DISTRIB+ del Cierre del Proyecto — UNA sola fuente. Amplía el MISMO caso (Regla #6 de CLAUDE.md) y dice la verdad del corte del caso (2026-11-03, el de Valor Ganado): el proyecto NO está terminado
// (fin 2027-07-23), así que el cierre está PREPARADO, no declarado: la lista de verificación trae lo que habrá que hacer, con responsable (puestos del OBS) y fecha límite posterior al fin del cronograma, y las
// comprobaciones automáticas muestran lo que hoy impide cerrar (un entregable de seis aceptado, una no conformidad abierta, ninguna adquisición entregada, ninguna lección transferida, tres solicitudes de
// cambio abiertas y el costo final aún sin registrar). Cuando el proyecto real avance, esos números salen de las demás herramientas. tests/unit/closeout.test.ts lo verifica.
import { SAMPLE_OBS_ROLES } from "./case-distribplus";
import { emptyFacts, normalizeCloseout, normalizeItem, type CloseFacts, type CloseoutData } from "./closeout";

export const SAMPLE_CLOSEOUT_AS_OF = "2026-11-03";
// Hechos del caso al corte, para el modo independiente (con un proyecto conectado se leen de las demás herramientas).
export const sampleCloseFacts = (): CloseFacts => ({
  ...emptyFacts(), deliverables: { total: 6, accepted: 1 }, ncr: { open: 1, critical: 0 }, contracts: { total: 5, notDelivered: 5, claimsOpen: 0 }, lessons: { total: 8, transferred: 0 },
  changes: { open: 3 }, bac: 8081108, roles: SAMPLE_OBS_ROLES.slice()
});
// código · área · qué · responsable · fecha límite
const ROWS: Array<[string, string, string, string, string]> = [
  ["CI-01", "Alcance", "Obtener la aceptación formal de los seis entregables del Enunciado del Alcance (Validar el Alcance)", "Director de Proyecto", "2027-07-23"],
  ["CI-02", "Contratos", "Recibir conforme y liquidar los contratos de procura y del subcontrato MEP; cerrar los reclamos abiertos", "Jefe de Logística", "2027-07-30"],
  ["CI-03", "Recursos", "Liberar a la Subcontrata MEP y a las cuadrillas al terminar sus paquetes y devolver los equipos alquilados", "Residente de Obra", "2027-07-30"],
  ["CI-04", "Documentación", "Archivar el dossier de calidad, los planos as-built y los manuales de operación y mantenimiento", "Control de Calidad", "2027-07-30"],
  ["CI-05", "Lecciones", "Transferir las lecciones aprendidas a la oficina de proyectos y al siguiente proyecto de DISTRIB+", "Director de Proyecto", "2027-08-06"],
  ["CI-06", "Finanzas", "Registrar el costo final, conciliarlo con el presupuesto vigente y cerrar las órdenes de cambio", "Director de Proyecto", "2027-08-06"],
  ["CI-07", "Documentación", "Firmar el acta de entrega y cierre con la Gerencia de Operaciones (recepción de la obra y puesta en marcha)", "Comité Directivo / Sponsor", "2027-07-23"]
];
export function buildSampleCloseout(): CloseoutData {
  const items = ROWS.map(([code, area, what, owner, dueDate], i) => normalizeItem({ id: "ci" + (i + 1), code, area, what, owner, dueDate, status: "pendiente" }, "ci" + (i + 1)));
  return { ...normalizeCloseout(null), kind: "proyecto", items, asOf: SAMPLE_CLOSEOUT_AS_OF, idCounter: items.length + 1 };
}
