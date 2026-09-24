// Diccionario de la EDT del ejemplo DISTRIB+ S.A. — UNA sola fuente (WBS Builder, «Cargar ejemplo»). Amplía el MISMO caso (Regla #6 de
// CLAUDE.md): los códigos EDT son los de siempre (1.1 … 5.3) y el texto reutiliza lo ya dicho en los otros ejemplos (los riesgos R-01
// licencia, R-02 acero, R-03 suelo, R-08 fabricación; los criterios del Enunciado del Alcance y de Recopilar Requisitos).
// Cada entrada: descripción del trabajo (campo «notas» del nodo), criterio de aceptación y, si es esfuerzo continuo (gestión,
// seguimiento), la marca LOE. tests/unit/wbs-sample.test.ts verifica que cubre exactamente los 18 paquetes de la EDT de ejemplo.
export interface SampleDictEntry { notes: string; acceptance: string; loe?: boolean; }

export const SAMPLE_WBS_DICTIONARY: Record<string, SampleDictEntry> = {
  "1.1": { notes: "Documento que autoriza formalmente el proyecto, nombra al director y fija los requisitos de alto nivel (RAN.01 a RAN.04).",
    acceptance: "Acta firmada por la Gerencia General de DISTRIB+." },
  "1.2": { notes: "Plan para la dirección del proyecto con las líneas base de alcance, cronograma y costo, y los planes subsidiarios de gestión.",
    acceptance: "Plan y líneas base aprobados por el sponsor antes de iniciar la construcción." },
  "1.3": { notes: "Informes mensuales de avance, reuniones de control y seguimiento de las líneas base durante todo el proyecto.",
    acceptance: "Informe mensual entregado y aceptado por el sponsor en cada corte.", loe: true },
  "2.1": { notes: "Calicatas y ensayos de laboratorio que determinan la capacidad portante del terreno; su informe alimenta el diseño de la cimentación (riesgo R-03).",
    acceptance: "Informe geotécnico firmado por especialista colegiado y aprobado por la supervisión." },
  "2.2": { notes: "Memoria de cálculo y planos estructurales de la nave, con la cobertura y la disposición de racks.",
    acceptance: "Expediente estructural revisado y aprobado por la supervisión; planos aptos para construcción." },
  "2.3": { notes: "Memoria y planos de las instalaciones eléctricas y sanitarias, dimensionadas para la operación logística proyectada.",
    acceptance: "Cargas eléctricas y caudales sanitarios conformes a la memoria de cálculo aprobada." },
  "2.4": { notes: "Licencia de edificación de la Municipalidad de Lurín y certificado ITSE de seguridad (riesgo R-01).",
    acceptance: "Licencia y certificado ITSE emitidos por la municipalidad y vigentes." },
  "3.1": { notes: "Fabricación y transporte a obra de las estructuras metálicas prefabricadas (riesgos R-02, alza del acero, y R-08, fabricación).",
    acceptance: "Piezas recibidas en obra conforme a planos, con los certificados de calidad del fabricante." },
  "3.2": { notes: "Suministro de cemento, agregados y materiales varios para la obra civil.",
    acceptance: "Materiales recibidos con guías y certificados; cantidades conformes al metrado." },
  "3.3": { notes: "Adquisición de tableros, equipos eléctricos y equipos sanitarios para las instalaciones MEP.",
    acceptance: "Equipos entregados según la especificación técnica y con su protocolo de fábrica." },
  "4.1": { notes: "Corte, relleno, eliminación de excedentes y nivelación de la plataforma del almacén.",
    acceptance: "Plataforma nivelada y compactada según planos, con los ensayos de densidad aprobados." },
  "4.2": { notes: "Zapatas y cimentación de la nave según el estudio de suelos, incluido el refuerzo por el hallazgo geotécnico (R-03).",
    acceptance: "Cimentación conforme a planos y ensayos de resistencia del concreto aprobados." },
  "4.3": { notes: "Montaje de columnas, vigas, tijerales y cobertura TR-4 de la nave.",
    acceptance: "Altura libre y disposición de racks verificadas contra los planos aprobados." },
  "4.4": { notes: "Tarrajeo, pintura y cerramiento perimétrico de la edificación.",
    acceptance: "Pisos, señalización y anchos de pasillo aptos para montacargas según el layout operativo." },
  "4.5": { notes: "Instalación de tableros, circuitos eléctricos y redes sanitarias.",
    acceptance: "Instalaciones ejecutadas y en funcionamiento, conformes a la memoria de cálculo." },
  "5.1": { notes: "Pruebas de tableros y circuitos eléctricos y pruebas hidráulicas de las redes sanitarias.",
    acceptance: "Protocolos de prueba firmados por QA/QC y aceptados por el cliente." },
  "5.2": { notes: "Capacitación operativa al personal del cliente y entrega de los manuales de operación y mantenimiento.",
    acceptance: "Personal capacitado (registro de asistencia) y manuales entregados." },
  "5.3": { notes: "Dossier de calidad, planos as-built y acta de entrega y cierre del proyecto.",
    acceptance: "Dossier completo y acta de entrega y cierre firmada por el cliente." }
};
