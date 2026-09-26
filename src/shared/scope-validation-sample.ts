// Ejemplo DISTRIB+ de Validar el Alcance — UNA sola fuente. Amplía el MISMO caso (Regla #6 de CLAUDE.md): los seis entregables son los del Enunciado del Alcance del caso (por nombre exacto), los paquetes
// son los de la EDT (códigos 1.1 … 5.3), quien acepta es un puesto del OBS, y la historia cuadra con el corte del caso (2026-11-03, el de Valor Ganado): el expediente técnico (paquetes 2.1–2.3, terminados) se
// aceptó con observaciones —la no conformidad NC-02 de los planos estructurales, ya cerrada—; los demás entregables siguen pendientes (la licencia 2.4 está en trámite y la obra recién empieza). La no
// conformidad NC-01 (estructuras metálicas, 3.1) está abierta, pero el entregable «Obra civil y estructura» todavía no se acepta: no hay contradicción. tests/unit/scope-validation.test.ts lo verifica.
import { SAMPLE_OBS_ROLES } from "./case-distribplus";
import { normalizeAcceptance, type Acceptance, type ScopeValidationData, type SvFacts } from "./scope-validation";
import { SAMPLE_CASE_LEAVES } from "./case-distribplus";
import { SAMPLE_WBS_DICTIONARY } from "./wbs-sample";

export const SAMPLE_VALIDATION_AS_OF = "2026-11-03";
// nombre del entregable (del Enunciado) · criterio de aceptación · paquetes
export const SAMPLE_DELIVERABLES: Array<[string, string, string[]]> = [
  ["Expediente técnico de ingeniería", "Expediente revisado y aprobado por la supervisión; planos aptos para construcción.", ["2.1", "2.2", "2.3"]],
  ["Permisos y licencias municipales de construcción", "Licencias emitidas por la Municipalidad de Lurín y certificado de seguridad aprobado.", ["2.4"]],
  ["Obra civil y estructura del almacén", "Altura libre, disposición de racks y acabados conformes a los planos aprobados.", ["3.1", "4.1", "4.2", "4.3", "4.4"]],
  ["Instalaciones MEP operativas y probadas", "Cargas eléctricas y caudales sanitarios probados y conformes a memoria de cálculo.", ["3.3", "4.5", "5.1"]],
  ["Patio de maniobras y obras exteriores", "Radios de giro y áreas de maniobra verificados con vehículo de diseño (tráiler).", []],
  ["Dossier de calidad y acta de entrega final", "Dossier de calidad completo y acta de entrega y cierre firmada por el cliente.", ["5.3"]]
];
// Hechos para el modo independiente: los seis entregables (id «d1»…«d6»), las 18 hojas y la no conformidad abierta del ejemplo de Calidad (NC-01, mayor, paquete 3.1).
export const sampleValidationFacts = (): SvFacts => ({
  deliverables: SAMPLE_DELIVERABLES.map(([name, criteria], i) => ({ id: "d" + (i + 1), code: "DEL." + String(i + 1).padStart(2, "0"), name, criteria })),
  leaves: SAMPLE_CASE_LEAVES.map((l) => ({ id: "w-" + l.code, code: l.code, name: l.name, acceptance: SAMPLE_WBS_DICTIONARY[l.code].acceptance })),
  roles: SAMPLE_OBS_ROLES.slice(), openNcr: { "w-3.1": { count: 1, critical: 0 } },
  leavesOf: Object.fromEntries(SAMPLE_DELIVERABLES.map(([, , wbs], i) => ["d" + (i + 1), wbs.map((c) => "w-" + c)]))
});
export function buildSampleValidation(resolveDel: (name: string) => string = (n) => "d" + (SAMPLE_DELIVERABLES.findIndex((x) => x[0] === n) + 1), resolveLeaf: (code: string) => string = (c) => "w-" + c): ScopeValidationData {
  const records: Acceptance[] = SAMPLE_DELIVERABLES.map(([name, criteria, wbs], i) => {
    const first = i === 0;
    return normalizeAcceptance({
      id: "va" + (i + 1), code: "VA-" + String(i + 1).padStart(2, "0"), delivId: resolveDel(name), wbsIds: wbs.map(resolveLeaf).filter(Boolean), criteria,
      presentedOn: first ? "2026-10-02" : "", presentedBy: first ? "Jefe de Ingeniería" : "", reviewer: first ? "Comité Directivo / Sponsor" : "Comité Directivo / Sponsor", evidence: first ? "Acta de aceptación del expediente técnico" : "",
      decision: first ? "aceptado_con_observaciones" : "pendiente", decidedOn: first ? "2026-10-09" : "",
      observations: first ? "Cuadros de columnas de los planos estructurales (NC-02): corregidos y reemitidos en la revisión B; sin más observaciones."
        : i === 1 ? "Licencia en trámite (observaciones de la municipalidad subsanadas el 2/11): se presenta al recibirla."
        : i === 2 ? "Se valida por etapas al terminar la estructura y cobertura (paquete 4.3); aún no se presenta."
        : i === 3 ? "Se presenta con los protocolos de prueba de tableros y redes (paquete 5.1)."
        : i === 4 ? "Aún sin paquetes propios en la EDT: se define con el Residente de Obra." : "Se presenta al final, con el dossier de calidad auditado (QC-17)."
    }, "va" + (i + 1));
  });
  return { records, asOf: SAMPLE_VALIDATION_AS_OF, idCounter: records.length + 1 };
}
