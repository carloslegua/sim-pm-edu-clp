// Datos base compartidos del caso DISTRIB+ (modo independiente de Comunicaciones, Calidad y Adquisiciones).
import { describe, expect, it } from "vitest";
import { SAMPLE_CASE_BASE_COST, SAMPLE_CASE_LEAVES, SAMPLE_OBS_ROLES } from "../../src/shared/case-distribplus";
import { SAMPLE_WBS_DICTIONARY } from "../../src/shared/wbs-sample";

describe("caso DISTRIB+ compartido", () => {
  it("18 paquetes con los mismos códigos que el diccionario de la EDT y el costo total del caso (7.100.000)", () => {
    expect(SAMPLE_CASE_LEAVES).toHaveLength(18);
    expect(SAMPLE_CASE_LEAVES.map((l) => l.code).sort()).toEqual(Object.keys(SAMPLE_WBS_DICTIONARY).sort());
    expect(SAMPLE_CASE_LEAVES.reduce((s, l) => s + l.cost, 0)).toBe(SAMPLE_CASE_BASE_COST);
  });
  it("los puestos del OBS son los que trae OBS_Builder.html (sin duplicados)", () => {
    expect(new Set(SAMPLE_OBS_ROLES).size).toBe(SAMPLE_OBS_ROLES.length);
    ["Comité Directivo / Sponsor", "Director de Proyecto", "Jefe de Ingeniería", "Jefe de Logística", "Residente de Obra", "Control de Calidad", "Asesoría Legal"].forEach((r) => expect(SAMPLE_OBS_ROLES).toContain(r));
  });
});
