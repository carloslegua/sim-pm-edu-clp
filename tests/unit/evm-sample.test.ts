// Prueba de oro del ejemplo de Valor Ganado: las cifras que documentan el caso DISTRIB+ salen de la red y de los costos
// reales (no de una copia), y los cortes anteriores son coherentes con la línea base.
import { describe, expect, it } from "vitest";
import { cpm, scheduleNetwork } from "../../src/core/gpi-core";
import { EVM_SAMPLE_AC, EVM_SAMPLE_COSTS, EVM_SAMPLE_PERCENT, EVM_SAMPLE_REPORTS, EVM_SAMPLE_STATUS_DATE, EVM_SAMPLE_TECHNIQUES } from "../../src/shared/evm-sample";
import { evmCompute, evmStatus, pvAt, workingDaysThrough, DEFAULT_THRESHOLDS, type EvmPackage } from "../../src/shared/evm";
import { SAMPLE_START_DATE, sampleScheduleModules } from "../../src/shared/schedule-sample";

const build = () => {
  const m = sampleScheduleModules(), n = scheduleNetwork(m.wbs, m.activities, null, m.schedule, null, SAMPLE_START_DATE);
  const r = cpm(n.nodes.map((x) => ({ id: x.id, dur: x.dur })), n.links as never, n.calendar, {});
  if (!r.ok) throw new Error("ciclo");
  const spans: Record<string, { es: number; ef: number }> = {};
  n.nodes.filter((x) => !x.isMilestone && x.leafId).forEach((x) => {
    const code = (x.leafId as string).replace("w-", ""), row = r.rows[x.id], s = spans[code] || (spans[code] = { es: row.es, ef: row.ef });
    s.es = Math.min(s.es, row.es); s.ef = Math.max(s.ef, row.ef);
  });
  const pkgs: EvmPackage[] = Object.keys(EVM_SAMPLE_COSTS).map((c) => ({ id: c, code: c, name: c, bac: EVM_SAMPLE_COSTS[c], es: spans[c].es, ef: spans[c].ef }));
  return { pkgs, cal: n.calendar as never, duration: r.projectDuration };
};

describe("ejemplo de Valor Ganado (DISTRIB+)", () => {
  it("los 18 paquetes suman el costo base de Costos (7.100.000) y todos tienen actividades en la red", () => {
    expect(Object.keys(EVM_SAMPLE_COSTS)).toHaveLength(18);
    expect(Object.values(EVM_SAMPLE_COSTS).reduce((s, v) => s + v, 0)).toBe(7100000);
    const { pkgs } = build(); expect(pkgs.every((p) => p.es !== null && p.ef !== null)).toBe(true);
  });
  it("al corte 2026-10-30 (día 85): PV 3.439.533 · EV 3.182.500 · AC 3.253.500 → SPI ámbar, CPI verde, CV ámbar", () => {
    const { pkgs, cal, duration } = build(), t = workingDaysThrough(SAMPLE_START_DATE, EVM_SAMPLE_STATUS_DATE, cal);
    expect(t).toBe(85); expect(duration).toBe(273);
    const r = evmCompute({ packages: pkgs, percent: EVM_SAMPLE_PERCENT, ac: EVM_SAMPLE_AC, techniques: EVM_SAMPLE_TECHNIQUES, defaultTechnique: "fisico", statusOffset: t, projectDuration: duration });
    expect(Math.round(r.pv)).toBe(3439533); expect(Math.round(r.ev)).toBe(3182500); expect(Math.round(r.ac)).toBe(3253500);
    expect(r.bac).toBe(7100000);
    expect(r.spi).toBeCloseTo(0.9253, 3); expect(r.cpi).toBeCloseTo(0.9782, 3); expect(Math.round(r.cv)).toBe(-71000);
    expect(r.rows.find((x) => x.id === "2.4")).toMatchObject({ technique: "cero_cien", ev: 0 });                 // la licencia no está emitida: no se gana
    expect(r.rows.find((x) => x.id === "1.3")).toMatchObject({ technique: "loe" });
    const s = evmStatus(r, DEFAULT_THRESHOLDS);
    expect(s).toMatchObject({ spi: "ambar", sv: "ambar", cpi: "verde", cv: "ambar", cost: "ambar", schedule: "ambar" });   // el peor de los indicadores manda
    expect(r.spiT).toBeLessThan(1); expect(r.ieacT).toBeGreaterThan(273);                                          // el cronograma ganado pronostica un fin posterior al plan
    expect(r.eac.typical).toBeGreaterThan(7100000); expect(r.vac.typical).toBeLessThan(0);
  });
  it("los cortes anteriores: PV = el de la línea base a esa fecha (±1) y los índices guardados salen de sus cifras", () => {
    const { pkgs, cal } = build();
    EVM_SAMPLE_REPORTS.forEach((rp) => {
      const t = workingDaysThrough(SAMPLE_START_DATE, rp.date, cal);
      expect(t).toBe(rp.offset); expect(Math.abs(pvAt(pkgs, t) - rp.pv)).toBeLessThanOrEqual(1);
      expect(rp.cpi).toBeCloseTo(rp.ev / rp.ac, 3); expect(rp.spi).toBeCloseTo(rp.ev / rp.pv, 3);
    });
    expect(EVM_SAMPLE_REPORTS.map((r) => r.date)).toEqual([...EVM_SAMPLE_REPORTS.map((r) => r.date)].sort());
  });
});
