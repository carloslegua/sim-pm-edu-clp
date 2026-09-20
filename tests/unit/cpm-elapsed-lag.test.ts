// Desfases en DÍAS TRANSCURRIDOS ("ed") del motor CPM (hallazgo "alta" de revisión
// externa): cpm() los convertía a días laborables con una proporción constante,
// lag × (días laborables / 7), sin mirar en qué fecha caen. Un hito el viernes
// 10/07/2026 con un desfase de 3 días transcurridos corresponde al lunes 13/07
// (sábado, domingo, lunes), pero el simulador fechaba la sucesora el martes 14/07
// (3 × 5/7 = 2,14 -> 2 días laborables). La proporción semanal no representa los
// fines de semana ni los feriados: un desfase transcurrido es tiempo de RELOJ, así
// que se aplica sobre fechas reales y después se busca el siguiente instante
// laborable del calendario.
import { describe, expect, it } from "vitest";
import { cpm } from "../../src/core/gpi-core";
import type { ScheduleLink } from "../../src/core/types";

const CAL = { workDayIdx: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] as string[], provisional: false };
const ed = (from: string, to: string, lag: number, type: ScheduleLink["type"] = "FS"): ScheduleLink => ({ from, to, type, lag, lagUnit: "ed" });

describe("cpm — desfase en días transcurridos sobre fechas reales", () => {
  it("REPRO DEL REPORTE: hito el viernes 10/07/2026 + 3 días transcurridos -> lunes 13/07 (antes: martes 14/07)", () => {
    const r = cpm([{ id: "H", dur: 0 }, { id: "S", dur: 2 }], [ed("H", "S", 3)], CAL, { startDate: "2026-07-10" });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rows.H.startDate).toBe("2026-07-10");
    expect(r.rows.S.startDate).toBe("2026-07-13");
    expect(r.rows.S.es).toBe(1);
  });

  it("una actividad que termina el viernes + 3 días transcurridos: sábado, domingo y lunes pasan -> arranca el martes", () => {
    const r = cpm([{ id: "A", dur: 5 }, { id: "B", dur: 1 }], [ed("A", "B", 3)], CAL, { startDate: "2026-07-06" }); // A: lun 6 - vie 10
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rows.A.finishDate).toBe("2026-07-10");
    expect(r.rows.B.startDate).toBe("2026-07-14");
  });

  it("con lag 0 equivale a un FS normal (el día laborable siguiente)", () => {
    const r = cpm([{ id: "A", dur: 5 }, { id: "B", dur: 1 }], [ed("A", "B", 0)], CAL, { startDate: "2026-07-06" });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rows.B.startDate).toBe("2026-07-13");
    expect(r.rows.B.es).toBe(5);
  });

  it("entre semana cuenta días de reloj: mié 8 termina la actividad + 1 día transcurrido -> jue 9 (dentro de la semana, sin saltos)", () => {
    const r = cpm([{ id: "A", dur: 3 }, { id: "B", dur: 1 }], [ed("A", "B", 1)], CAL, { startDate: "2026-07-06" }); // A: lun 6 - mié 8
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rows.B.startDate).toBe("2026-07-10"); // fin mié + 1 día = jue (día completo) -> arranca vie
  });

  it("un feriado en el destino se salta: viernes + 3 días transcurridos cae en lunes 13/07 feriado -> martes 14/07", () => {
    const r = cpm([{ id: "H", dur: 0 }, { id: "S", dur: 2 }], [ed("H", "S", 3)],
      { ...CAL, holidays: ["2026-07-13"] }, { startDate: "2026-07-10" });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rows.S.startDate).toBe("2026-07-14");
  });

  it("SS: A empieza el jueves 9 + 2 días transcurridos = sábado -> B arranca el lunes 13", () => {
    const r = cpm([{ id: "A", dur: 3 }, { id: "B", dur: 1 }], [ed("A", "B", 2, "SS")], CAL, { startDate: "2026-07-09" });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rows.A.startDate).toBe("2026-07-09");
    expect(r.rows.B.startDate).toBe("2026-07-13");
  });

  it("FF: el fin de B queda al menos 3 días transcurridos después del fin de A (fin viernes 10 + 3 días = fin del lunes 13)", () => {
    const r = cpm([{ id: "A", dur: 5 }, { id: "B", dur: 1 }], [ed("A", "B", 3, "FF")], CAL, { startDate: "2026-07-06" });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rows.B.finishDate).toBe("2026-07-13");
  });

  it("la pasada hacia atrás es coherente: la cadena hito -> sucesora es crítica y la holgura de cada una es 0", () => {
    const r = cpm([{ id: "H", dur: 0 }, { id: "S", dur: 2 }], [ed("H", "S", 3)], CAL, { startDate: "2026-07-10" });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(Math.abs(r.rows.H.tf)).toBe(0);
    expect(Math.abs(r.rows.S.tf)).toBe(0);
    expect(r.criticalIds.sort()).toEqual(["H", "S"]);
  });

  it("un fin de semana de por medio da holgura real: A termina el jueves + 2 días transcurridos = domingo -> B arranca el lunes 13, y A todavía podría terminar el viernes", () => {
    const r = cpm([{ id: "A", dur: 4 }, { id: "B", dur: 3 }], [ed("A", "B", 2)], CAL, { startDate: "2026-07-06" }); // A: lun 6 - jue 9
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rows.B.startDate).toBe("2026-07-13");
    expect(r.rows.A.tf).toBe(1); // A puede acabar el viernes y B seguiría el lunes
    expect(r.rows.B.tf).toBe(0);
    expect(r.criticalIds).toEqual(["B"]);
  });

  it("los desfases en días laborables (d), horas (h) y semanas (w) no cambian", () => {
    const base = (lag: number, lagUnit: ScheduleLink["lagUnit"]) => cpm([{ id: "A", dur: 1 }, { id: "B", dur: 1 }], [{ from: "A", to: "B", type: "FS", lag, lagUnit }], CAL, { startDate: "2026-07-06" });
    const d = base(3, "d"), h = base(16, "h"), w = base(1, "w");
    expect(d.ok && d.rows.B.es).toBe(4);
    expect(h.ok && h.rows.B.es).toBe(3);
    expect(w.ok && w.rows.B.es).toBe(6);
  });
});

describe("cpm — invariantes con desfases transcurridos (redes aleatorias, 4 tipos de enlace, feriados)", () => {
  // Generador determinista (mulberry32): mismas redes en cada corrida.
  function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // (No se exige "hay alguna actividad crítica": con enlaces SF cuyo nodo final tiene
  // sucesoras, el motor deja redes sin críticas también con desfases en días
  // laborables normales -- limitación previa e independiente de los "ed".)
  it("300 redes: holgura total ≥ 0, ES ≤ LS, EF ≤ LF y el fin del proyecto es el mayor EF", () => {
    const rand = rng(20260710);
    const types: ScheduleLink["type"][] = ["FS", "SS", "FF", "SF"];
    for (let k = 0; k < 300; k++) {
      const n = 3 + Math.floor(rand() * 5);
      const nodes = Array.from({ length: n }, (_, i) => ({ id: "n" + i, dur: Math.floor(rand() * 6) + (rand() < 0.2 ? 0 : 1) }));
      const links: ScheduleLink[] = [];
      for (let j = 1; j < n; j++) for (let i = 0; i < j; i++) if (rand() < 0.45) {
        const unit = rand() < 0.6 ? "ed" : "d";
        links.push({ from: "n" + i, to: "n" + j, type: types[Math.floor(rand() * 4)], lag: Math.floor(rand() * 9) - 2, lagUnit: unit as ScheduleLink["lagUnit"] });
      }
      const cal = { ...CAL, holidays: rand() < 0.5 ? ["2026-07-15", "2026-07-16"] : [] };
      const r = cpm(nodes, links, cal, { startDate: ["2026-07-06", "2026-07-10", "2026-07-11"][Math.floor(rand() * 3)] });
      expect(r.ok).toBe(true); if (!r.ok) continue;
      let maxEf = 0;
      nodes.forEach((nd) => {
        const row = r.rows[nd.id];
        expect(row.tf).toBeGreaterThanOrEqual(-1e-6);
        expect(row.ls).toBeGreaterThanOrEqual(row.es - 1e-6);
        expect(row.lf).toBeGreaterThanOrEqual(row.ef - 1e-6);
        expect(row.ff).toBeGreaterThanOrEqual(-1e-6);
        if (row.ef > maxEf) maxEf = row.ef;
      });
      expect(r.projectDuration).toBeCloseTo(maxEf, 9);
    }
  });
});

describe("cpm — desfase transcurrido SIN fecha de inicio", () => {
  it("no hay fechas reales que usar: se conserva la aproximación proporcional y se AVISA en el resultado", () => {
    const r = cpm([{ id: "A", dur: 5 }, { id: "B", dur: 1 }], [ed("A", "B", 7)], CAL, {});
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rows.B.es).toBe(10);          // 5 + 7 × 5/7
    expect(r.elapsedApprox).toBe(true);
  });
  it("con fecha de inicio o sin desfases transcurridos no hay aviso", () => {
    const a = cpm([{ id: "A", dur: 5 }, { id: "B", dur: 1 }], [ed("A", "B", 7)], CAL, { startDate: "2026-07-06" });
    const b = cpm([{ id: "A", dur: 5 }, { id: "B", dur: 1 }], [{ from: "A", to: "B", type: "FS", lag: 2, lagUnit: "d" }], CAL, {});
    expect(a.ok && a.elapsedApprox).toBe(false);
    expect(b.ok && b.elapsedApprox).toBe(false);
  });
});
