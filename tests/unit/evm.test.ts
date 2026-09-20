// Valor Ganado (EVM): PV sobre la línea base del cronograma, EV con técnicas por paquete, índices, pronósticos (EAC/ETC/TCPI)
// y cronograma ganado (Earned Schedule). Resultados verificados a mano contra casos de libro.
import { describe, expect, it } from "vitest";
import {
  creditFor, costLevel, earnedSchedule, evmCompute, evmStatus, normalizeReports, plannedFraction, pvCurve, scheduleLevel, techniqueFromPlan,
  workingDaysThrough, DEFAULT_THRESHOLDS, type EvmInput, type EvmPackage
} from "../../src/shared/evm";

const A: EvmPackage = { id: "A", code: "1", name: "Paquete A", bac: 1000, es: 0, ef: 10 };
const B: EvmPackage = { id: "B", code: "2", name: "Paquete B", bac: 2000, es: 10, ef: 20 };
const base = (o: Partial<EvmInput> = {}): EvmInput => ({ packages: [A, B], percent: {}, ac: {}, techniques: {}, defaultTechnique: "fisico", statusOffset: 10, projectDuration: 20, ...o });

describe("valor planificado (PV) sobre la línea base", () => {
  it("cada paquete se distribuye linealmente sobre su intervalo; sin duración es un escalón; sin actividades no se distribuye", () => {
    expect([0, 5, 10, 15].map((t) => plannedFraction(A, t))).toEqual([0, 0.5, 1, 1]);
    expect(plannedFraction({ es: 4, ef: 4 }, 3.9)).toBe(0); expect(plannedFraction({ es: 4, ef: 4 }, 4)).toBe(1);
    expect(plannedFraction({ es: null, ef: null }, 99)).toBe(0);
  });
  it("curva S acumulada: 0 → BAC, monótona", () => {
    const c = pvCurve([A, B], 20);
    expect(c).toHaveLength(21); expect(c[0]).toBe(0); expect(c[10]).toBe(1000); expect(c[15]).toBe(2000); expect(c[20]).toBe(3000);
    expect(c.every((v, i) => i === 0 || v >= c[i - 1])).toBe(true);
  });
});

describe("técnicas de valor ganado por paquete", () => {
  it("0/100 gana al completar; 50/50 la mitad al iniciar; % físico proporcional; LOE = lo planificado", () => {
    expect(creditFor("cero_cien", 99, 0.5)).toBe(0); expect(creditFor("cero_cien", 100, 0.5)).toBe(1);
    expect(creditFor("cincuenta", 0, 0.5)).toBe(0); expect(creditFor("cincuenta", 1, 0.5)).toBe(0.5); expect(creditFor("cincuenta", 100, 0.5)).toBe(1);
    expect(creditFor("fisico", 40, 0.5)).toBe(0.4); expect(creditFor("fisico", 140, 0.5)).toBe(1);        // se acota a 100 %
    expect(creditFor("loe", 0, 0.5)).toBe(0.5);                                                            // no depende del avance reportado
  });
  it("la técnica del plan de costos se traduce; hitos ponderados y apportioned effort se aplican como % físico y se avisa", () => {
    expect(techniqueFromPlan("0/100 (al completar)")).toEqual({ technique: "cero_cien", approximated: false });
    expect(techniqueFromPlan("50/50 (inicio/fin)").technique).toBe("cincuenta");
    expect(techniqueFromPlan("% físico avanzado").technique).toBe("fisico");
    expect(techniqueFromPlan("LOE (nivel de esfuerzo)").technique).toBe("loe");
    expect(techniqueFromPlan("Hitos ponderados")).toEqual({ technique: "fisico", approximated: true });
    expect(techniqueFromPlan("Apportioned effort").approximated).toBe(true);
    expect(techniqueFromPlan(undefined)).toEqual({ technique: "fisico", approximated: false });
  });
});

describe("índices y variaciones", () => {
  it("al día 10 con A completo y B sin empezar, gastando 1.100: SV 0, CV −100, CPI 0,909, SPI 1", () => {
    const r = evmCompute(base({ percent: { A: 100, B: 0 }, ac: { A: 1100 } }));
    expect(r).toMatchObject({ bac: 3000, pv: 1000, ev: 1000, ac: 1100, cv: -100, sv: 0 });
    expect(r.cpi).toBeCloseTo(0.90909, 4); expect(r.spi).toBe(1);
    expect(r.percentPlanned).toBeCloseTo(33.33, 1); expect(r.percentComplete).toBeCloseTo(33.33, 1); expect(r.percentSpent).toBeCloseTo(36.67, 1);
    expect(r.rows[0]).toMatchObject({ id: "A", pv: 1000, ev: 1000, cv: -100, plannedPct: 100 });
  });
  it("sin costo real registrado no hay CPI (no se inventa): los índices quedan en null en vez de infinito", () => {
    const r = evmCompute(base({ percent: { A: 50 } }));
    expect(r.ac).toBe(0); expect(r.cpi).toBeNull(); expect(r.eac.typical).toBeNull(); expect(r.tcpiEac).toBeNull();
    expect(r.spi).toBe(0.5);                                                    // EV 500 / PV 1000
  });
  it("paquetes sin actividades no se distribuyen en el tiempo: quedan fuera de los totales y se listan", () => {
    const r = evmCompute(base({ packages: [A, B, { id: "C", code: "3", name: "Sin actividades", bac: 500, es: null, ef: null }], percent: { A: 100 } }));
    expect(r.bac).toBe(3000); expect(r.unscheduled.map((p) => p.id)).toEqual(["C"]);
  });
  it("el avance no reportado se cuenta (avisa que falta reportar lo que ya debía estar en marcha)", () => {
    expect(evmCompute(base({ percent: { A: 100 } })).unreported).toBe(0);         // A reportado; B aún no debía empezar (pv 0)
    expect(evmCompute(base({ statusOffset: 15, percent: { A: 100 } })).unreported).toBe(1);   // B ya debía ir a la mitad y no se reportó
  });
  it("las técnicas por paquete cambian el EV: A con 0/100 al 90 % no gana nada; con LOE gana lo planificado", () => {
    const r0 = evmCompute(base({ statusOffset: 5, percent: { A: 90 }, techniques: { A: "cero_cien" } }));
    expect(r0.rows[0].ev).toBe(0);
    const rl = evmCompute(base({ statusOffset: 5, percent: { A: 0 }, techniques: { A: "loe" } }));
    expect(rl.rows[0].ev).toBe(500); expect(rl.rows[0].sv).toBe(0);
    expect(rl.loeShare).toBeCloseTo(33.33, 1);                                    // LOE distorsiona los índices: se dice su peso
  });
});

describe("pronósticos", () => {
  const r = evmCompute(base({ percent: { A: 100, B: 0 }, ac: { A: 1100 } }));       // BAC 3000, EV 1000, AC 1100, CPI 0,909, SPI 1
  it("EAC típico BAC/CPI, atípico AC + (BAC − EV), combinado AC + (BAC − EV)/(CPI×SPI)", () => {
    expect(r.eac.typical).toBeCloseTo(3300, 6); expect(r.eac.atypical).toBe(3100); expect(r.eac.combined).toBeCloseTo(3300, 6);
    expect(r.etc.typical).toBeCloseTo(2200, 6); expect(r.etc.atypical).toBe(2000);
    expect(r.vac.typical).toBeCloseTo(-300, 6); expect(r.vac.atypical).toBe(-100);
  });
  it("TCPI: el desempeño que se exige al remanente para cerrar en el BAC o en el EAC", () => {
    expect(r.tcpiBac).toBeCloseTo(2000 / 1900, 9);                                 // (BAC − EV) / (BAC − AC)
    expect(r.tcpiEac).toBeCloseTo(0.90909, 4);                                     // (BAC − EV) / (EAC − AC): igual al CPI actual
  });
});

describe("cronograma ganado (Earned Schedule)", () => {
  it("interpola el tiempo en que el PV igualaba al EV de hoy", () => {
    const c = pvCurve([A, B], 20);
    expect(earnedSchedule(c, 500)).toBeCloseTo(5, 9); expect(earnedSchedule(c, 1000)).toBe(10); expect(earnedSchedule(c, 1600)).toBeCloseTo(13, 9);
    expect(earnedSchedule(c, 0)).toBe(0); expect(earnedSchedule(c, 3000)).toBe(20); expect(earnedSchedule(c, 9999)).toBe(20);
  });
  it("A a la mitad al día 10: SPI $ = 0,5 y SPI(t) = ES/AT = 0,5; ES 5 d, atraso de 5 d, duración pronosticada 40 d", () => {
    const r = evmCompute(base({ percent: { A: 50 }, ac: { A: 500 } }));
    expect(r.spi).toBe(0.5); expect(r.es).toBeCloseTo(5, 9); expect(r.spiT).toBeCloseTo(0.5, 9);
    expect(r.svT).toBeCloseTo(-5, 9); expect(r.ieacT).toBeCloseTo(40, 9);
  });
  it("el SPI en dinero engaña al final: con todo el trabajo hecho a los 25 d de 20 planificados, SPI $ = 1 pero SPI(t) = 0,8 (25 d)", () => {
    const r = evmCompute(base({ statusOffset: 25, percent: { A: 100, B: 100 }, ac: { A: 1000, B: 2000 } }));
    expect(r.spi).toBe(1);                                                          // el PV acumulado ya es el BAC: no muestra el atraso
    expect(r.es).toBe(20); expect(r.spiT).toBeCloseTo(0.8, 9); expect(r.svT).toBe(-5); expect(r.ieacT).toBeCloseTo(25, 9);
  });
  it("con el proyecto adelantado el cronograma ganado da SV(t) positivo", () => {
    const r = evmCompute(base({ statusOffset: 5, percent: { A: 100 }, ac: { A: 900 } }));   // A entero al día 5 (planificado al 10)
    expect(r.es).toBe(10); expect(r.svT).toBe(5); expect(r.spiT).toBeCloseTo(2, 9);
  });
});

describe("umbrales de los planes y semáforo", () => {
  it("costos: desfavorable por debajo; alerta si ≤ alerta, escalamiento si ≤ escalamiento (incluye el valor límite)", () => {
    expect([costLevel(1, 0.95, 0.9), costLevel(0.95, 0.95, 0.9), costLevel(0.93, 0.95, 0.9), costLevel(0.9, 0.95, 0.9), costLevel(null, 0.95, 0.9)]).toEqual(["verde", "ambar", "ambar", "rojo", null]);
  });
  it("cronograma: verde si ≥ verde; rojo si < rojo (el valor límite del rojo aún es ámbar, criterio del Plan del Cronograma)", () => {
    expect([scheduleLevel(0.95, 0.95, 0.9), scheduleLevel(0.9, 0.95, 0.9), scheduleLevel(0.899, 0.95, 0.9), scheduleLevel(-6, -5, -10), scheduleLevel(-11, -5, -10)]).toEqual(["verde", "ambar", "rojo", "ambar", "rojo"]);
  });
  it("estado del proyecto: el peor de CPI/CV para costo y de SPI/SV% para cronograma", () => {
    const r = evmCompute(base({ percent: { A: 80 }, ac: { A: 1000 } }));            // EV 800, PV 1000, AC 1000: CPI 0,8; SPI 0,8; CV −200; SV% −20
    const s = evmStatus(r, { ...DEFAULT_THRESHOLDS, cvWarn: -100, cvEsc: -150 });        // los umbrales de CV son montos: aquí, a escala del ejemplo
    expect(s).toMatchObject({ cpi: "rojo", cv: "rojo", cost: "rojo", spi: "rojo", sv: "rojo", schedule: "rojo" });
    expect(evmStatus(r, DEFAULT_THRESHOLDS).cv).toBe("verde");                            // −200 frente a −50.000: dentro del umbral en monto
    const ok = evmStatus(evmCompute(base({ percent: { A: 100 }, ac: { A: 1000 } })), DEFAULT_THRESHOLDS);
    expect(ok).toMatchObject({ cost: "verde", schedule: "verde" });
    expect(evmStatus(evmCompute(base({ percent: { A: 100 } })), DEFAULT_THRESHOLDS).cv).toBeNull();     // sin costo real no se evalúa CV
  });
});

describe("calendario e historial", () => {
  it("días laborables transcurridos hasta la fecha de corte (inclusive), sin fines de semana ni feriados", () => {
    expect(workingDaysThrough("2026-07-06", "2026-07-10", null)).toBe(5);              // lun–vie
    expect(workingDaysThrough("2026-07-06", "2026-07-13", null)).toBe(6);              // + lunes siguiente
    expect(workingDaysThrough("2026-07-06", "2026-07-12", null)).toBe(5);              // el fin de semana no cuenta
    expect(workingDaysThrough("2026-07-06", "2026-07-10", { workDayIdx: [1, 2, 3, 4, 5], holidays: ["2026-07-08"] })).toBe(4);
    expect(workingDaysThrough("2026-07-06", "2026-07-01", null)).toBe(0);              // corte anterior al inicio
    expect(workingDaysThrough("", "2026-07-10", null)).toBe(0);
  });
  it("historial de cortes: ordenado por fecha, tolerante con datos incompletos", () => {
    const r = normalizeReports([{ date: "2026-08-15", offset: "27", pv: 10, ev: 9, ac: 12, cpi: 0.75, spi: 0.9 }, { date: "2026-07-31", offset: 20, pv: "x" }, { nada: 1 }, null]);
    expect(r.map((x) => x.date)).toEqual(["2026-07-31", "2026-08-15"]);
    expect(r[1]).toMatchObject({ offset: 27, cpi: 0.75 }); expect(r[0]).toMatchObject({ pv: 0, cpi: null });
    expect(normalizeReports("basura")).toEqual([]);
  });
});
