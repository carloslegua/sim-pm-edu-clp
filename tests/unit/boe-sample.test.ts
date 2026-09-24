// Coherencia de la BOE del ejemplo con el resto del caso DISTRIB+ (regla #6 de CLAUDE.md): src/shared/boe-sample.ts.
import { describe, expect, it } from "vitest";
import { SECTIONS, boeFindings, completeness, serializeBoe } from "../../src/shared/boe";
import { SAMPLE_CAPEX, buildSampleBoe } from "../../src/shared/boe-sample";
import { SAMPLE_BASE_DATE } from "../../src/shared/escalation-sample";

const sinDatosDelProyecto = {};   // ningún hecho derivado: todo tiene que estar escrito en la BOE

describe("boe-sample: BOE del caso DISTRIB+", () => {
  it("cubre TODAS las secciones que se exigen, de la clase 5 a la 1, escritas en la propia BOE (sin apoyarse en datos del proyecto)", () => {
    const b = buildSampleBoe();
    [5, 4, 3, 2, 1].forEach((c) => { const r = completeness(b, { ...sinDatosDelProyecto, escalation: true }, c); expect(r.missing.map((s) => s.id), "clase " + c).toEqual([]); });
    expect(SECTIONS.length).toBeGreaterThan(20);
  });
  it("es coherente con el resto del caso: fecha base de precios de la escalación, CAPEX de USD 8,5 M, órdenes OC-001/003, riesgos R-01…R-10 y personas del OBS", () => {
    const b = buildSampleBoe(), t = Object.values(b.text).join(" | ");
    expect(b.text.date).toBe(SAMPLE_BASE_DATE); expect(SAMPLE_CAPEX).toBe(8500000);
    expect(t).toMatch(/8,5 M/); expect(t).toMatch(/OC-003/); expect(t).toMatch(/OC-001/); expect(t).toMatch(/R-02/); expect(t).toMatch(/R-01 a R-10/); expect(t).toMatch(/2026-07-01/);
    expect(b.team.map((m) => m.name)).toEqual(expect.arrayContaining(["Director de Proyecto (PM)", "Jefe de Ingeniería", "Jefe de Logística", "Residente de Obra"]));
    expect(b.text.boundary).toMatch(/Escalación.*Contingencia.*NO incluye escalación.*Tipo de cambio/s);   // la frontera que exige 58R-10
    expect(b.text.productivity).not.toMatch(/altitud 1[,.]15/);                                               // Lurín está a nivel del mar
  });
  it("está aprobada por el sponsor antes de iniciar y no genera hallazgos", () => {
    const b = buildSampleBoe();
    expect(b.status).toBe("aprobada"); expect(b.approvedBy).toMatch(/Sponsor/); expect(b.approvedOn < "2026-07-06").toBe(true);
    expect(boeFindings(b, { escalation: true }, { classNum: 3, escalation: 81463, baselineVersion: null, baselineDate: "", capex: SAMPLE_CAPEX, total: 8483582 }).map((f) => f.code)).toEqual([]);
  });
  it("el anexo A deja pendiente solo la conciliación con proyectos similares; se guarda con los campos de siempre", () => {
    const b = buildSampleBoe();
    expect(b.checklist.filter((c) => !c.done).map((c) => c.id)).toEqual(["reconc"]);
    expect(serializeBoe(b)).toMatchObject({ date: SAMPLE_BASE_DATE, assumptions: expect.stringContaining("Diseño al 30 %"), exclusions: expect.stringContaining("IGV"), productivity: expect.any(String) });
  });
});
