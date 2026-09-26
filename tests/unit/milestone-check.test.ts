// Restricciones de los hitos contra el CPM (auditoría, media): FNLT/FNET/MSO/MFO se comparan con el fin de los elementos de la EDT que cierran cada hito.
import { describe, expect, it } from "vitest";
import { checkMilestones, endsByCode, milestoneSummary } from "../../src/shared/milestone-check";

const wbs = { rootId: "r", nodes: {
  r: { children: ["a", "b"] }, a: { children: ["a1", "a2"] }, a1: { end: "2026-09-30" }, a2: { end: "2026-11-11" }, b: { children: ["b1"] }, b1: { end: "2027-07-23" }
} };

describe("endsByCode", () => {
  it("cada elemento termina cuando termina su hoja más tardía", () => {
    expect(endsByCode(wbs)).toEqual({ "1": "2026-11-11", "1.1": "2026-09-30", "1.2": "2026-11-11", "2": "2027-07-23", "2.1": "2027-07-23" });
    expect(endsByCode(null)).toEqual({});
  });
});

describe("checkMilestones", () => {
  const one = (m: Record<string, unknown>) => checkMilestones([m], wbs)[0];
  it("REPRO: «fin de Ingeniería a más tardar el 30/09» con la fase terminando el 11/11 INCUMPLE por 42 días", () => {
    const c = one({ name: "Fin de Ingeniería", date: "2026-09-30", constraint: "FNLT", wbsCode: "1" });
    expect(c.status).toBe("incumple"); expect(c.days).toBe(42); expect(c.cpmFinish).toBe("2026-11-11"); expect(c.text).toMatch(/42 día\(s\) DESPUÉS/);
  });
  it("FNLT: cumple con holgura o justo en la fecha; varios códigos toman el fin más tardío", () => {
    expect(one({ name: "x", date: "2026-10-10", constraint: "FNLT", wbsCode: "1.1" })).toMatchObject({ status: "cumple", days: 10 });
    expect(one({ name: "x", date: "2026-09-30", constraint: "FNLT", wbsCode: "1.1" })).toMatchObject({ status: "cumple", days: 0 });
    expect(one({ name: "x", date: "2026-09-30", constraint: "FNLT", wbsCode: "1.1, 1.2" }).status).toBe("incumple");
  });
  it("FNET: el CPM termina antes → espera (no incumple); en o después → cumple", () => {
    expect(one({ name: "x", date: "2026-11-20", constraint: "FNET", wbsCode: "1.2" })).toMatchObject({ status: "espera", days: 9 });
    expect(one({ name: "x", date: "2026-11-11", constraint: "FNET", wbsCode: "1.2" }).status).toBe("cumple");
  });
  it("MSO/MFO: solo cumplen si coinciden", () => {
    expect(one({ name: "x", date: "2027-07-23", constraint: "MFO", wbsCode: "2" }).status).toBe("cumple");
    expect(one({ name: "x", date: "2027-07-20", constraint: "MSO", wbsCode: "2" })).toMatchObject({ status: "incumple", days: 3 });
  });
  it("sin vínculo, con código inexistente, ASAP/ALAP o sin fecha: no se compara y se explica por qué", () => {
    expect(one({ name: "x", date: "2026-09-30", constraint: "FNLT" }).status).toBe("sin-vinculo");
    expect(one({ name: "x", date: "2026-09-30", constraint: "FNLT", wbsCode: "9.9" }).status).toBe("sin-cpm");
    expect(one({ name: "x", date: "2026-09-30", constraint: "ASAP", wbsCode: "1" }).status).toBe("no-aplica");
    expect(one({ name: "x", date: "", constraint: "FNLT", wbsCode: "1" }).status).toBe("no-aplica");
    expect(checkMilestones("basura", wbs)).toEqual([]);
  });
  it("resumen: cuenta lo comparado, lo incumplido, lo que espera y lo sin vínculo, y cita el primer incumplimiento", () => {
    const s = milestoneSummary(checkMilestones([
      { name: "A", date: "2026-09-30", constraint: "FNLT", wbsCode: "1" }, { name: "B", date: "2026-12-31", constraint: "FNLT", wbsCode: "1" },
      { name: "C", date: "2026-11-20", constraint: "FNET", wbsCode: "1.2" }, { name: "D", date: "2026-09-30", constraint: "FNLT" }
    ], wbs));
    expect(s).toMatchObject({ checked: 3, violated: 1, waiting: 1, unlinked: 1 }); expect(s.first).toMatch(/^A: 1 termina el 2026-11-11/);
  });
});
