// Ejemplo DISTRIB+ S.A. del seguimiento de Valor Ganado -- UNA sola fuente compartida (Valor_Ganado.html, modo independiente, y
// «Cargar ejemplo» del proyecto conectado). Amplía el MISMO caso (Regla #6 de CLAUDE.md): los costos por paquete son los de
// WBS Builder (18 paquetes, Σ = 7.100.000 = el costo base de Costos), el cronograma es la red DISTRIB+ completa de
// shared/schedule-sample.ts (273 días laborables desde 2026-07-06) y la historia cuadra con el registro de riesgos:
//   · 2.4 Permisos: la licencia municipal se retrasa (riesgo R-01): 90 % de gestión, pero con la técnica 0/100 no se gana hasta emitirse.
//   · 3.1 Estructuras metálicas: la fábrica acumula pedidos (R-08) y el acero sube (R-02): 90 % de avance y por encima de lo presupuestado.
//   · 1.3 Informes de seguimiento: nivel de esfuerzo (LOE): se gana a medida que pasa el tiempo.
// Corte 2026-10-30 (día laborable 85): PV 3.439.533 · EV 3.182.500 · AC 3.253.500 → SPI 0,925 (ámbar), CPI 0,978 (verde),
// CV −71.000 (ámbar: el peor de los indicadores manda). Los cortes anteriores fijan la curva S. Un test de oro
// (tests/unit/evm-sample.test.ts) verifica que estas cifras salen de la red y de los costos, no de una copia.
import type { EvTechnique } from "./evm";

export const EVM_SAMPLE_STATUS_DATE = "2026-10-30";
// Costo del TRABAJO por paquete (Código EDT → costo), el de WBS Builder.
export const EVM_SAMPLE_COSTS: Record<string, number> = {
  "1.1": 12000, "1.2": 38000, "1.3": 145000, "2.1": 28000, "2.2": 165000, "2.3": 98000, "2.4": 64000,
  "3.1": 1820000, "3.2": 715000, "3.3": 415000, "4.1": 380000, "4.2": 735000, "4.3": 1165000, "4.4": 550000, "4.5": 485000,
  "5.1": 145000, "5.2": 48000, "5.3": 92000
};
// Avance físico (%) y costo real acumulado al corte. Los paquetes que aún no empiezan no figuran.
export const EVM_SAMPLE_PERCENT: Record<string, number> = { "1.1": 100, "1.2": 100, "1.3": 100, "2.1": 100, "2.2": 100, "2.3": 100, "2.4": 90, "3.1": 90, "3.2": 90, "3.3": 100 };
export const EVM_SAMPLE_AC: Record<string, number> = { "1.1": 12000, "1.2": 38500, "1.3": 150000, "2.1": 30000, "2.2": 172000, "2.3": 101000, "2.4": 40000, "3.1": 1660000, "3.2": 640000, "3.3": 410000 };
export const EVM_SAMPLE_TECHNIQUES: Record<string, EvTechnique> = { "1.3": "loe", "2.4": "cero_cien" };
// Cortes anteriores (quincenales): PV, EV y AC acumulados a cada fecha.
export const EVM_SAMPLE_REPORTS = [
  { date: "2026-08-14", offset: 30, pv: 145563, ev: 141000, ac: 144000, cpi: 0.979, spi: 0.969 },
  { date: "2026-08-31", offset: 41, pv: 238000, ev: 231000, ac: 236500, cpi: 0.977, spi: 0.971 },
  { date: "2026-09-18", offset: 55, pv: 410375, ev: 398000, ac: 407000, cpi: 0.978, spi: 0.970 }
];
