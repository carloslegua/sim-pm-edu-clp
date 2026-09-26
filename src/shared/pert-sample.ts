// Ejemplo DISTRIB+ S.A. del ANÁLISIS PERT de las 43 actividades del caso — UNA sola fuente (`Cargar ejemplo en el proyecto` de Análisis PERT). Amplía el MISMO caso
// (Regla #6 de CLAUDE.md): son las actividades de la red completa de shared/schedule-sample.ts (Código EDT + nombre) y M sigue a la duración determinística
// (Metrado/Rendimiento), como en el módulo: solo se declaran el optimista (O) y el pesimista (P), en días.
//   · O = 80 % de la duración; P = 135 % de la duración (asimetría típica: lo que se atrasa se atrasa más de lo que se adelanta).
//   · Los paquetes con riesgo del Registro tienen una cola pesimista mayor: licencia municipal 2.4 (R-01) 200 %, estructuras metálicas 3.1 (R-02, R-08) 180 %,
//     movimiento de tierras 4.1 (R-03) 170 %, cimentaciones 4.2 160 %, estructura y cobertura 4.3 150 %.
// La terna de cada actividad es válida (O ≤ M ≤ P, P > O): el ejemplo NO trae ternas inválidas (el modo ejemplo didáctico independiente sí trae una a propósito).
export const SAMPLE_PERT_PLAN: Array<[string, string, number, number]> = [   // [Código de la actividad, nombre, O, P]
  ["1.1.1", "Elaboración y aprobación del acta de constitución", 3, 6],   // dur 4
  ["1.2.1", "Plan para la dirección del proyecto (líneas base)", 4, 7],   // dur 5
  ["1.2.2", "Planes subsidiarios de gestión", 9, 17],   // dur 12
  ["1.3.1", "Elaboración de informes mensuales de avance", 6, 11],   // dur 8
  ["1.3.2", "Reuniones de control y seguimiento del proyecto", 6, 11],   // dur 8
  ["2.1.1", "Calicatas exploratorias", 3, 6],   // dur 4
  ["2.1.2", "Ensayos de laboratorio de suelos", 8, 14],   // dur 10
  ["2.1.3", "Informe geotécnico", 3, 6],   // dur 4
  ["2.2.1", "Memoria de cálculo estructural", 8, 14],   // dur 10
  ["2.2.2", "Planos estructurales", 9, 17],   // dur 12
  ["2.3.1", "Memoria de cálculo eléctrico y sanitario", 5, 10],   // dur 7
  ["2.3.2", "Planos eléctricos y sanitarios", 7, 13],   // dur 9
  ["2.4.1", "Trámite de licencia de edificación municipal", 16, 40],   // dur 20
  ["2.4.2", "Trámite de certificado ITSE", 8, 20],   // dur 10
  ["3.1.1", "Fabricación de estructuras metálicas", 7, 17],   // dur 9
  ["3.1.2", "Transporte y entrega de estructuras a obra", 3, 8],   // dur 4
  ["3.2.1", "Adquisición y suministro de cemento y agregados", 6, 11],   // dur 8
  ["3.2.2", "Adquisición y suministro de materiales varios de construcción", 5, 10],   // dur 7
  ["3.3.1", "Adquisición de tableros y equipos eléctricos", 4, 7],   // dur 5
  ["3.3.2", "Adquisición de equipos de instalaciones sanitarias", 4, 7],   // dur 5
  ["4.1.1", "Corte y excavación masiva", 6, 14],   // dur 8
  ["4.1.2", "Relleno y compactación con material propio", 7, 16],   // dur 9
  ["4.1.3", "Eliminación de material excedente", 7, 16],   // dur 9
  ["4.1.4", "Nivelación y perfilado de plataforma", 4, 11],   // dur 6
  ["4.2.1", "Excavación de zanjas para zapatas", 4, 10],   // dur 6
  ["4.2.2", "Solado de concreto e=10 cm", 3, 7],   // dur 4
  ["4.2.3", "Acero de refuerzo fy=4200 kg/cm²", 6, 13],   // dur 8
  ["4.2.4", "Concreto f'c=280 kg/cm² en zapatas", 4, 8],   // dur 5
  ["4.2.5", "Encofrado y desencofrado de cimentaciones", 4, 10],   // dur 6
  ["4.3.1", "Montaje de columnas metálicas", 6, 12],   // dur 8
  ["4.3.2", "Montaje de vigas y tijerales", 9, 18],   // dur 12
  ["4.3.3", "Instalación de cobertura TR-4", 6, 12],   // dur 8
  ["4.4.1", "Tarrajeo de muros y cielorrasos", 32, 54],   // dur 40
  ["4.4.2", "Pintura general de interiores y exteriores", 16, 27],   // dur 20
  ["4.4.3", "Cerramiento perimétrico", 12, 22],   // dur 16
  ["4.5.1", "Instalación de tableros y circuitos eléctricos", 16, 27],   // dur 20
  ["4.5.2", "Instalación de redes sanitarias", 12, 21],   // dur 15
  ["5.1.1", "Pruebas de tableros y circuitos eléctricos", 3, 6],   // dur 4
  ["5.1.2", "Pruebas hidráulicas de redes sanitarias", 1, 3],   // dur 2
  ["5.2.1", "Capacitación operativa al personal del cliente", 6, 11],   // dur 8
  ["5.2.2", "Elaboración de manuales de operación y mantenimiento", 3, 6],   // dur 4
  ["5.3.1", "Elaboración de dossier de calidad y planos as-built", 8, 14],   // dur 10
  ["5.3.2", "Acta de entrega y cierre del proyecto", 1, 3],   // dur 2
];
