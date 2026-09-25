// Precios unitarios del ejemplo DISTRIB+ de «Estimar los Costos» -- UNA sola fuente (se inlinea en cost-estimate.js; la prueba de oro
// tests/unit/cost-estimate-sample.test.ts la importa).
//
// Precio por ACTIVIDAD (ids a1..a43 del ejemplo de Estimar los Costos, que replica las actividades de «Definir las Actividades»),
// CALIBRADO contra el costo de cada paquete de la EDT del caso (auditoría, alta): cada paquete con estimado completo suma
// EXACTAMENTE su costo en WBS Builder, así que cargar este ejemplo no cambia el costo de ningún paquete, el costo base de Costos
// (7.100.000) ni el valor ganado. Antes sumaban 6.160.500 (10 de 18 paquetes distintos de la EDT). La actividad «Instalación de
// cobertura TR-4» (a32) se deja deliberadamente SIN precio: 4.3 Estructura y cobertura queda «parcial» (sus otras dos actividades
// suman 792.000; a TR-4 le corresponden los 373.000 restantes de su costo en la EDT) para demostrar ese estado en la UI y en el
// bloqueo de Costo del WBS: mientras sea parcial, el paquete conserva su costo de la EDT.
export const SAMPLE_UNIT_PRICES: Record<string, number> = {
  a1: 12000,                            // 1.1 Acta de constitución (doc x1) = 12.000
  a2: 20000, a3: 3000,                  // 1.2 Plan (doc x1) + Planes subsidiarios (doc x6) = 38.000
  a4: 16250, a5: 5000,                  // 1.3 Informes mensuales (doc x4) + Reuniones de control (reunión x16) = 145.000
  a6: 800, a7: 15000, a8: 6600,         // 2.1 Calicatas (und x8) + Ensayos (glb x1) + Informe geotécnico (doc x1) = 28.000
  a9: 45000, a10: 5000,                 // 2.2 Memoria estructural (doc x1) + Planos (lám x24) = 165.000
  a11: 35000, a12: 3500,                // 2.3 Memoria eléctrica/sanitaria (doc x1) + Planos (lám x18) = 98.000
  a13: 40000, a14: 24000,               // 2.4 Licencia de edificación + Certificado ITSE (trámite x1 c/u) = 64.000
  a15: 6550, a16: 9750,                 // 3.1 Fabricación (ton x260) + Transporte a obra (viaje x12) = 1.820.000
  a17: 850, a18: 35000,                 // 3.2 Cemento y agregados (ton x800) + Materiales varios (glb x1) = 715.000
  a19: 12000, a20: 23500,               // 3.3 Tableros y equipos eléctricos (und x15) + Equipos sanitarios (und x10) = 415.000
  a21: 40, a22: 37, a23: 24, a24: 7,    // 4.1 Movimiento de tierras (4 actividades, m³/m²) = 380.000
  a25: 65, a26: 60, a27: 5, a28: 865, a29: 125, // 4.2 Cimentaciones (5 actividades) = 735.000
  a30: 3500, a31: 6500,                 // 4.3 Estructura y cobertura: 2 de 3 = 792.000 (a32 sin precio, a propósito)
  a33: 45, a34: 25, a35: 1018.75,       // 4.4 Acabados y cerramientos (3 actividades) = 550.000
  a36: 325, a37: 370,                   // 4.5 Instalaciones MEP (2 actividades) = 485.000
  a38: 1000, a39: 25000,                // 5.1 Pruebas de instalaciones (2 actividades) = 145.000
  a40: 600, a41: 12000,                 // 5.2 Capacitación al cliente (2 actividades) = 48.000
  a42: 62000, a43: 30000                // 5.3 Acta de entrega y cierre (2 actividades) = 92.000
};
