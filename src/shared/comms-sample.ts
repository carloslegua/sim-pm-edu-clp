// Ejemplo DISTRIB+ del Plan de Comunicaciones — UNA sola fuente. Amplía el MISMO caso (Regla #6 de CLAUDE.md): los destinatarios son los
// 12 interesados de Stakeholder Studio (s1…s12, en su orden), los emisores son puestos del OBS y los contenidos reutilizan lo que ya dicen
// sus estrategias de compromiso (reunión quincenal con el sponsor, informe mensual al banco, mesas con los vecinos, acuerdo con el
// sindicato…) y los paquetes de la EDT (2.4 licencia, 3.1 fabricación, 5.x capacitación). tests/unit/comms-sample.test.ts lo verifica.
import { blankPlan, normalizeItem, normalizeLog, type CommData, type CommFacts, type CommItem } from "./comms-plan";
import { SAMPLE_OBS_ROLES } from "./case-distribplus";

// Los 12 interesados del ejemplo (nombre, compromiso actual → deseado: los mismos de Stakeholder Studio). El cuadrante depende de los pesos
// que aplique ese módulo: en modo independiente no se repite aquí (null) y las reglas M1/M10 solo corren con el proyecto conectado.
const STK: Array<[string, number, number]> = [
  ["Gerencia General DISTRIB+", 4, 5], ["Banco financista", 3, 4], ["Constructora principal", 4, 4], ["Municipalidad de Lurín", 3, 4], ["OEFA / Autoridad ambiental", 3, 3], ["SUNAFIL", 3, 3],
  ["Junta de vecinos de Lurín", 2, 4], ["Sindicato de construcción civil", 2, 4], ["Futuros operarios del almacén", 1, 4], ["Clientes / distribuidores", 3, 4], ["Proveedor de estructuras", 3, 4], ["Prensa / medios locales", 1, 3]
];
export const SAMPLE_COMM_STAKEHOLDERS = STK.map(([name, c, d], i) => ({ id: "s" + (i + 1), name, quadrant: null, engCurrent: c, engDesired: d }));
export const SAMPLE_COMM_ROLES = SAMPLE_OBS_ROLES;
export const sampleCommFacts = (): CommFacts => ({ stakeholders: SAMPLE_COMM_STAKEHOLDERS.map((s) => ({ ...s })), roles: SAMPLE_COMM_ROLES.slice() });

type Row = [string, string, string, string[], string, string, string, string, string];
// código · información · propósito · destinatarios (ids) · emisor · frecuencia · medio · canal/formato · registro
const ROWS: Row[] = [
  ["CM-01", "Avance del proyecto y decisiones pendientes", "Mantener alineado al sponsor y obtener las decisiones de reserva de gestión y de líneas base", ["s1"], "Director de Proyecto", "Quincenal", "Reunión presencial", "Reunión de avance con agenda fija", "Acta de reunión archivada en la carpeta del proyecto"],
  ["CM-02", "Informe de avance físico-financiero (valor ganado)", "Sustentar cada desembolso con el avance real y el pronóstico de costo", ["s2", "s1"], "Director de Proyecto", "Mensual", "Informe escrito", "Informe mensual del paquete 1.3", "Informe firmado y enviado antes del desembolso"],
  ["CM-03", "Estado del trámite de la licencia de edificación (paquete 2.4)", "Anticipar observaciones y evitar el retraso del inicio de obra (riesgo R-01)", ["s4"], "Asesoría Legal", "Semanal", "Reunión presencial", "Reunión técnica y seguimiento del expediente", "Cargo de ingreso y acta de cada reunión"],
  ["CM-04", "Plan de manejo de tráfico y ruido; canal de reclamos", "Reducir la oposición vecinal y atender los reclamos a tiempo (riesgo R-07)", ["s7"], "Residente de Obra", "Mensual", "Reunión presencial", "Mesa de diálogo con la comunidad", "Acta de la mesa y libro de reclamos"],
  ["CM-05", "Cumplimiento del acuerdo laboral, jornadas y seguridad", "Prevenir paros y acordar la contratación local (riesgo R-05)", ["s8"], "Asesoría Legal", "Quincenal", "Reunión presencial", "Reunión de seguimiento con el sindicato", "Acta firmada por ambas partes"],
  ["CM-06", "Avance de fabricación y fechas de entrega de las estructuras (paquete 3.1)", "Detectar a tiempo un retraso de fabricación (riesgo R-08)", ["s11"], "Jefe de Logística", "Semanal", "Videollamada", "Seguimiento semanal con el proveedor", "Reporte de fabricación semanal"],
  ["CM-07", "Talleres de capacitación y visitas guiadas a obra", "Preparar a los futuros operarios y subir su compromiso durante la puesta en marcha (paquetes 5.x)", ["s9"], "Director de Proyecto", "Por hito", "Reunión presencial", "Talleres y visitas guiadas", "Registro de asistencia"],
  ["CM-08", "Comunicado de hitos del proyecto y encuesta de necesidades logísticas", "Mantener informados a los clientes y recoger sus necesidades del nuevo almacén", ["s10"], "Director de Proyecto", "Por hito", "Correo electrónico", "Comunicado por hito", "Copia del comunicado y de las respuestas"],
  ["CM-09", "Notas de prensa de inicio y cierre", "Dar cobertura al proyecto y evitar versiones no oficiales", ["s12"], "Director de Proyecto", "Por hito", "Comunicado o nota de prensa", "Nota de prensa al inicio y al cierre", "Nota publicada archivada"],
  ["CM-10", "Reunión semanal de obra: avance, interferencias y pendientes", "Coordinar la ejecución con la constructora y cerrar los pendientes", ["s3"], "Residente de Obra", "Semanal", "Reunión presencial", "Reunión de coordinación en obra", "Acta semanal de obra"],
  ["CM-11", "Cumplimiento ambiental y de seguridad y salud en el trabajo", "Evidenciar el cumplimiento ante los fiscalizadores y prevenir sanciones", ["s5", "s6"], "Control de Calidad", "Mensual", "Informe escrito", "Informe mensual de cumplimiento", "Informe con cargo de recepción"]
];
// Bitácora al corte del caso (2026-11-03, el de Valor Ganado): cada comunicación periódica tiene su última emisión reciente y una fue reprogramada con su motivo.
// código · comunicación · fecha · estado · emitió · qué se comunicó / motivo · evidencia
type L = [string, string, string, string, string, string, string];
const LOG: L[] = [
  ["LG-01", "CM-01", "2026-10-16", "emitida", "Director de Proyecto", "Avance: hitos de ingeniería cerrados; pedido al sponsor de la decisión sobre la reserva de gestión.", "Acta de reunión del 16/10"],
  ["LG-02", "CM-01", "2026-10-30", "emitida", "Director de Proyecto", "Avance de Procura y estado de la licencia; se aprueba mantener la línea base LB-1.", "Acta de reunión del 30/10"],
  ["LG-03", "CM-02", "2026-10-30", "emitida", "Director de Proyecto", "Informe de valor ganado al 30/10: SPI 0,93 y CPI 0,98; sustenta el desembolso de octubre.", "Informe firmado y cargo del banco"],
  ["LG-04", "CM-03", "2026-10-27", "emitida", "Asesoría Legal", "Observaciones de la municipalidad al expediente de la licencia; plazo de subsanación de 10 días.", "Cargo de ingreso y acta de reunión técnica"],
  ["LG-05", "CM-03", "2026-11-02", "emitida", "Asesoría Legal", "Subsanación presentada; se espera la resolución.", "Cargo de ingreso 2026-11-02"],
  ["LG-06", "CM-04", "2026-10-15", "emitida", "Residente de Obra", "Mesa de diálogo: plan de tráfico y ruido para el inicio del movimiento de tierras.", "Acta de la mesa y libro de reclamos"],
  ["LG-07", "CM-05", "2026-10-22", "emitida", "Asesoría Legal", "Seguimiento del acuerdo laboral y cupo de contratación local.", "Acta firmada por ambas partes"],
  ["LG-08", "CM-05", "2026-11-05", "reprogramada", "Asesoría Legal", "La reunión del 5/11 se pasa al 9/11 por la agenda del sindicato.", ""],
  ["LG-09", "CM-06", "2026-10-30", "emitida", "Jefe de Logística", "Lote 2 de estructuras con soldadura fuera de tolerancia: reproceso en fábrica y nueva fecha de entrega (NC-01).", "Reporte de fabricación semanal"],
  ["LG-10", "CM-10", "2026-10-29", "emitida", "Residente de Obra", "Coordinación con la constructora del inicio de movimiento de tierras y pendientes de Procura.", "Acta semanal de obra"],
  ["LG-11", "CM-11", "2026-10-28", "emitida", "Control de Calidad", "Informe mensual de cumplimiento ambiental y de seguridad: sin observaciones.", "Informe con cargo de recepción"],
  ["LG-12", "CM-08", "2026-08-06", "emitida", "Director de Proyecto", "Comunicado del hito «Aprobación del Plan de Gestión»: línea base inicial aprobada.", "Copia del comunicado"]
];
export function buildSampleComms(): CommData {
  const items: CommItem[] = ROWS.map(([code, info, purpose, stkIds, sender, frequency, method, channel, storage], i) => normalizeItem({ id: "cm" + (i + 1), code, info, purpose, stkIds, audience: "", sender, frequency, method, channel, storage }, "cm" + (i + 1)));
  const plan = { ...blankPlan(),
    escalation: "Un asunto sin respuesta en 48 horas pasa del responsable de la comunicación al Director de Proyecto; si afecta una línea base, a la Gerencia General (sponsor) en la siguiente reunión quincenal o antes si es urgente.",
    restrictions: "Las cifras de costo y las negociaciones con el sindicato y la municipalidad son de circulación restringida (solo sponsor, Director de Proyecto y Asesoría Legal). Toda comunicación a la prensa y a la comunidad la emite únicamente el Director de Proyecto. Idioma: español.",
    review: "La matriz se revisa cada mes con el informe de avance y siempre que cambie el registro de interesados o se apruebe un cambio que afecte a un interesado." };
  const itemId = (code: string): string => "cm" + (ROWS.findIndex((r) => r[0] === code) + 1);
  const log = LOG.map(([code, cm, date, status, by, summary, evidence], i) => normalizeLog({ id: "lg" + (i + 1), code, itemId: itemId(cm), date, status, by, summary, evidence }, "lg" + (i + 1)));
  return { items, plan, log, asOf: "2026-11-03", idCounter: items.length + log.length + 1 };
}
