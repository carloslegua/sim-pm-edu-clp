// Ejemplo DISTRIB+ del Plan de Calidad — UNA sola fuente. Amplía el MISMO caso (Regla #6 de CLAUDE.md): los paquetes son los 18 de la EDT
// (códigos 1.1 … 5.3, con el criterio de aceptación de SAMPLE_WBS_DICTIONARY, que es lo que cada control verifica), los responsables son
// puestos del OBS (nombre exacto) y los paquetes con riesgo alto (R-01, R-02, R-03…) son los del Registro de Riesgos del caso. Las normas y
// valores de las métricas son ILUSTRATIVOS (Reglamento Nacional de Edificaciones, ACI 318…): verificarlos contra la versión vigente antes de
// usarlos en un proyecto real. Los montos del costo de la calidad son ilustrativos y se suponen incluidos en las partidas del presupuesto.
// tests/unit/quality-sample.test.ts verifica la coherencia con el diccionario, el OBS y los riesgos.
import { SAMPLE_CASE_BASE_COST, SAMPLE_CASE_LEAVES, SAMPLE_OBS_ROLES } from "./case-distribplus";
import { normalizeCheck, normalizeCoq, normalizeInspection, normalizeMetric, normalizeNcr, type QualityData, type QualityFacts } from "./quality-plan";
import { SAMPLE_WBS_DICTIONARY } from "./wbs-sample";
import { SAMPLE_PLAN, buildSampleRisks } from "./risk-sample";
import { inherentScore, isOpen, levelOf } from "./risk-analysis";

export const sampleQualityFacts = (): QualityFacts => {
  const risks = buildSampleRisks((code) => "w-" + code), high = new Set<string>();
  risks.filter(isOpen).filter((r) => levelOf(inherentScore(r), SAMPLE_PLAN) === "alto").forEach((r) => r.wbsIds.forEach((w) => high.add(w)));
  return {
    leaves: SAMPLE_CASE_LEAVES.map((l) => ({ id: "w-" + l.code, code: l.code, name: l.name, acceptance: SAMPLE_WBS_DICTIONARY[l.code].acceptance, loe: !!SAMPLE_WBS_DICTIONARY[l.code].loe, cost: l.cost })),
    roles: SAMPLE_OBS_ROLES.slice(), highRiskLeafIds: Array.from(high), baseCost: SAMPLE_CASE_BASE_COST
  };
};

// Métricas: código · nombre · paquetes · definición · objetivo · tolerancia · método · frecuencia · responsable
type M = [string, string, string[], string, string, string, string, string, string];
const METRICS: M[] = [
  ["QM-01", "Resistencia a compresión del concreto", ["4.2", "4.3"], "Resistencia de probetas cilíndricas a 28 días respecto de la resistencia de diseño f'c", "Promedio de tres ensayos consecutivos ≥ f'c", "Ningún ensayo individual menor que f'c − 35 kg/cm²", "Ensayo de laboratorio", "Por vaciado", "Control de Calidad"],
  ["QM-02", "Compactación de la plataforma", ["4.1"], "Densidad de campo respecto de la máxima densidad seca del ensayo Proctor", "≥ 95 % de la máxima densidad seca", "Sin resultados por debajo del 92 %", "Ensayo de laboratorio", "Por capa compactada", "Control de Calidad"],
  ["QM-03", "Verticalidad del montaje metálico", ["4.3"], "Desviación de plomada de las columnas montadas", "Desviación ≤ 1/500 de la altura", "Ninguna columna fuera de 1/300", "Medición", "Por eje de columnas", "Control de Calidad"],
  ["QM-04", "Conformidad de las piezas recibidas", ["3.1"], "Piezas recibidas conformes a planos y con certificado de calidad del fabricante", "100 % de las piezas conformes", "Sin tolerancia: la pieza no conforme se rechaza", "Inspección visual", "Por entrega", "Control de Calidad"],
  ["QM-05", "Protocolos de prueba aprobados", ["4.5", "5.1"], "Circuitos, tableros y redes con su protocolo de prueba firmado", "100 % con protocolo aprobado", "Sin tolerancia", "Prueba funcional", "Por sistema", "Control de Calidad"]
];
// Actividades de control/aseguramiento: código · paquete · qué · tipo · método · frecuencia · responsable · registro · métrica
type C = [string, string, string, string, string, string, string, string, string];
const CHECKS: C[] = [
  ["QC-01", "1.1", "Revisión y firma del Acta de constitución", "Aseguramiento", "Revisión de documentos", "Por entregable", "Director de Proyecto", "Acta firmada", ""],
  ["QC-02", "1.2", "Revisión del plan para la dirección y de las líneas base antes de iniciar la construcción", "Aseguramiento", "Revisión de documentos", "Por entregable", "Comité Directivo / Sponsor", "Acta de aprobación del plan", ""],
  ["QC-03", "2.1", "Revisión del informe geotécnico por un especialista colegiado", "Aseguramiento", "Revisión de documentos", "Por entregable", "Jefe de Ingeniería", "Informe firmado y acta de revisión", ""],
  ["QC-04", "2.2", "Revisión independiente del expediente estructural", "Aseguramiento", "Revisión de documentos", "Por entrega de planos", "Jefe de Ingeniería", "Acta de revisión y planos aptos para construcción", ""],
  ["QC-05", "2.3", "Revisión de la memoria de cálculo eléctrica y sanitaria", "Aseguramiento", "Revisión de documentos", "Por entregable", "Jefe de Ingeniería", "Acta de revisión", ""],
  ["QC-06", "2.4", "Verificación de la licencia de edificación y del certificado ITSE", "Control", "Revisión de documentos", "Por entregable", "Asesoría Legal", "Licencia y certificado archivados", ""],
  ["QC-07", "3.1", "Inspección en fábrica y recepción en obra de las estructuras metálicas", "Control", "Inspección visual", "Por entrega", "Control de Calidad", "Acta de recepción con certificados del fabricante", "qm4"],
  ["QC-08", "3.2", "Recepción de materiales: guías, certificados y cantidades", "Control", "Inspección visual", "Por entrega", "Control de Calidad", "Guías de remisión y certificados", ""],
  ["QC-09", "3.3", "Verificación del protocolo de fábrica de los equipos", "Control", "Revisión de documentos", "Por entrega", "Control de Calidad", "Protocolo de fábrica archivado", ""],
  ["QC-10", "4.1", "Ensayo de densidad de campo de la plataforma", "Control", "Ensayo de laboratorio", "Por capa compactada", "Control de Calidad", "Informe de ensayo de densidad", "qm2"],
  ["QC-11", "4.2", "Ensayo de resistencia del concreto de las zapatas", "Control", "Ensayo de laboratorio", "Por vaciado", "Control de Calidad", "Informe de ensayo de probetas", "qm1"],
  ["QC-12", "4.3", "Verificación de verticalidad y de altura libre del montaje", "Control", "Medición", "Por eje de columnas", "Control de Calidad", "Registro topográfico de montaje", "qm3"],
  ["QC-13", "4.4", "Inspección de pisos, señalización y anchos de pasillo contra el layout", "Control", "Inspección visual", "Por zona terminada", "Control de Calidad", "Acta de inspección con fotografías", ""],
  ["QC-14", "4.5", "Inspección de la instalación de tableros, circuitos y redes", "Control", "Inspección visual", "Por sistema", "Control de Calidad", "Registro de inspección", "qm5"],
  ["QC-15", "5.1", "Pruebas funcionales de circuitos e hidráulicas de las redes", "Control", "Prueba funcional", "Por sistema", "Control de Calidad", "Protocolos de prueba firmados por QA/QC", "qm5"],
  ["QC-16", "5.2", "Verificación del registro de asistencia y de la entrega de manuales", "Control", "Revisión de documentos", "Por sesión", "Director de Proyecto", "Registro de asistencia y cargo de manuales", ""],
  ["QC-17", "5.3", "Auditoría del dossier de calidad antes de la entrega", "Aseguramiento", "Auditoría", "Por entregable", "Control de Calidad", "Informe de auditoría del dossier", ""]
];
const COQ: Array<[string, string, number]> = [
  ["prevencion", "Revisiones de diseño y planificación de la calidad", 60000], ["prevencion", "Inducción y capacitación en procedimientos constructivos", 30000],
  ["evaluacion", "Ensayos de laboratorio (concreto, suelos y densidad de campo)", 95000], ["evaluacion", "Inspecciones y pruebas de recepción", 55000],
  ["falla_interna", "Retrabajo previsto por observaciones de inspección", 70000], ["falla_externa", "Reserva para garantías y reparaciones después de la entrega", 40000]
];
// Inspecciones: código · control · fecha · resultado · inspector · notas · no conformidad (id)
type I = [string, string, string, string, string, string, string];
const INSPECTIONS: I[] = [
  ["IN-01", "QC-01", "2026-07-09", "conforme", "Director de Proyecto", "Acta firmada por el Sponsor.", ""],
  ["IN-02", "QC-02", "2026-08-05", "conforme", "Comité Directivo / Sponsor", "Plan y líneas base aprobados.", ""],
  ["IN-03", "QC-03", "2026-08-31", "conforme", "Jefe de Ingeniería", "Informe geotécnico firmado por especialista colegiado.", ""],
  ["IN-04", "QC-04", "2026-09-30", "observada", "Jefe de Ingeniería", "Observaciones de detalle en los cuadros de columnas: se corrigen y reemiten.", "nc2"],
  ["IN-05", "QC-05", "2026-09-29", "conforme", "Jefe de Ingeniería", "Memoria eléctrica y sanitaria sin observaciones.", ""],
  ["IN-06", "QC-09", "2026-10-13", "conforme", "Control de Calidad", "Protocolos de fábrica de tableros y equipos archivados.", ""],
  ["IN-07", "QC-07", "2026-10-20", "no_conforme", "Control de Calidad", "Lote 2: tres piezas con soldadura fuera de tolerancia y certificado de calidad incompleto.", "nc1"],
  ["IN-08", "QC-08", "2026-11-02", "conforme", "Control de Calidad", "Guías, certificados y cantidades de materiales conformes.", ""]
];
// No conformidades: código · paquete · descripción · gravedad · detectada · estado · acción correctiva · responsable · fecha límite · cerrada
type N = [string, string, string, string, string, string, string, string, string, string];
const NCRS: N[] = [
  ["NC-01", "3.1", "Lote 2 de estructuras: tres piezas con soldadura fuera de tolerancia y certificado de calidad incompleto", "mayor", "2026-10-20", "en_correccion", "Reproceso de soldadura en fábrica, nueva inspección de Control de Calidad y entrega del certificado del lote 2", "Proveedor — Estructuras metálicas", "2026-11-20", ""],
  ["NC-02", "2.2", "Observaciones de detalle en los cuadros de columnas de los planos estructurales", "menor", "2026-09-30", "cerrada", "Planos corregidos y reemitidos (revisión B) y revisados por el Jefe de Ingeniería", "Ingeniero Estructural", "2026-10-07", "2026-10-06"]
];
export function buildSampleQuality(): QualityData {
  const id = (code: string): string => "w-" + code, metrics = METRICS.map(([code, name, wbs, definition, target, tolerance, method, frequency, owner], i) => normalizeMetric({ id: "qm" + (i + 1), code, name, wbsIds: wbs.map(id), definition, target, tolerance, method, frequency, owner }, "qm" + (i + 1)));
  // el criterio de cada control es el criterio de aceptación del paquete en el Diccionario de la EDT (una sola fuente)
  const checks = CHECKS.map(([code, wbs, what, kind, method, frequency, owner, record, metricId], i) => normalizeCheck({ id: "qc" + (i + 1), code, wbsId: id(wbs), what, criterion: SAMPLE_WBS_DICTIONARY[wbs].acceptance, kind, method, frequency, owner, record, metricId }, "qc" + (i + 1)));
  const coq = COQ.map(([cat, description, amount], i) => normalizeCoq({ id: "cq" + (i + 1), cat, description, amount }, "cq" + (i + 1)));
  // Ejecución al corte del caso (2026-11-03, el de Valor Ganado): los controles de los paquetes ya terminados o avanzados dejan su inspección. Estructuras metálicas (3.1, 90 %) trae UNA
  // no conformidad mayor abierta (soldadura y certificado incompletos: el riesgo R-08 de la fábrica), con su acción, responsable y fecha límite futura; planos estructurales (2.2) tuvo una menor ya cerrada.
  const checkId = (code: string): string => "qc" + (CHECKS.findIndex((c) => c[0] === code) + 1);
  const inspections = INSPECTIONS.map(([code, qc, date, result, inspector, notes, ncr], i) => normalizeInspection({ id: "in" + (i + 1), code, checkId: checkId(qc), date, result, inspector, notes, ncrId: ncr }, "in" + (i + 1)));
  const ncrs = NCRS.map(([code, wbs, description, severity, detectedOn, status, action, owner, dueDate, closedOn], i) => normalizeNcr({ id: "nc" + (i + 1), code, wbsId: id(wbs), description, severity, detectedOn, status, action, owner, dueDate, closedOn }, "nc" + (i + 1)));
  return {
    policy: "DISTRIB+ entrega un almacén que cumple los planos aprobados y las normas aplicables, verificado con ensayos y pruebas documentados: la calidad se planifica y se previene antes de inspeccionarse, y ninguna entrega se acepta sin su registro de conformidad.",
    standards: "Reglamento Nacional de Edificaciones (RNE): E.050 Suelos y Cimentaciones, E.060 Concreto Armado, E.090 Estructuras Metálicas; Código Nacional de Electricidad — Utilización; planos y especificaciones técnicas aprobados. (Ilustrativo: verificar contra la versión vigente.)",
    metrics, checks, coq, inspections, ncrs, asOf: "2026-11-03", idCounter: metrics.length + checks.length + coq.length + inspections.length + ncrs.length + 1
  };
}
