// Auditoría metodológica (PMI): el flujo de Costos enseñaba "rojo = orden de cambio
// obligatoria". Una variación fuera de umbral dispara análisis, pronóstico y una decisión
// de respuesta; una solicitud de cambio solo si la respuesta modifica la línea base o
// compromete la reserva de gestión.
import { describe, expect, it } from "vitest";
import { classifyVariance, validateThresholds, type CostThresholds } from "../../src/shared/cost-variance";

const T: CostThresholds = { cpiWarn: 0.95, cpiEsc: 0.90, cvWarn: -50000, cvEsc: -100000 };

describe("classifyVariance -- umbrales desfavorables por debajo", () => {
  it("dentro de tolerancia: verde, sin acciones ni cambio", () => {
    const r = classifyVariance(1.02, 12000, T);
    expect(r).toMatchObject({ evaluated: true, level: "green", cpi: "green", cv: "green" });
    expect(r.response.join(" ")).toMatch(/No hay acción ni cambio/);
  });
  it("alerta: ámbar en el umbral exacto (≤) y por debajo; la línea base no cambia", () => {
    expect(classifyVariance(0.95, null, T).level).toBe("amber");
    expect(classifyVariance(0.92, null, T).level).toBe("amber");
    expect(classifyVariance(0.92, null, T).response.join(" ")).toMatch(/línea base no cambia/);
  });
  it("escalamiento: rojo en el umbral exacto y por debajo", () => {
    expect(classifyVariance(0.90, null, T).level).toBe("red");
    expect(classifyVariance(null, -100000, T).level).toBe("red");
  });
  it("el nivel global es el PEOR de los indicadores (CPI verde + CV rojo = rojo)", () => {
    const r = classifyVariance(1.0, -120000, T);
    expect(r).toMatchObject({ level: "red", cpi: "green", cv: "red" });
  });
  it("sin datos no se evalúa", () => {
    expect(classifyVariance(null, undefined, T)).toMatchObject({ evaluated: false, level: null });
    expect(classifyVariance(NaN, Infinity, T).evaluated).toBe(false);
  });
  it("REGLA CENTRAL: ni siquiera en rojo la variación exige una orden de cambio -- se decide una respuesta", () => {
    const r = classifyVariance(0.5, -900000, T);
    expect(r.level).toBe("red");
    expect(r.changeRequestNeeded).toBe(false);
    const txt = r.response.join(" ");
    expect(txt).not.toMatch(/orden de cambio obligatoria/i);
    expect(txt).toMatch(/no obliga por sí sola a registrar una orden de cambio/);
    expect(txt).toMatch(/pronóstico \(EAC\/ETC\)/);
    expect(txt).toMatch(/SOLO si la respuesta exige modificar la línea base o comprometer la reserva de gestión/);
  });
});

describe("validateThresholds -- coherencia", () => {
  it("los umbrales por defecto son coherentes", () => expect(validateThresholds(T)).toEqual([]));
  it("escalar no puede ser MENOS grave que alertar (CPI y CV)", () => {
    const p = validateThresholds({ cpiWarn: 0.90, cpiEsc: 0.95, cvWarn: -100000, cvEsc: -50000 });
    expect(p.join("|")).toMatch(/CPI: el umbral de escalamiento \(0\.95\) debe ser menor o igual que el de alerta \(0\.90\)/);
    expect(p.join("|")).toMatch(/CV: el umbral de escalamiento/);
  });
  it("una alerta por encima del costo previsto (CPI > 1, CV > 0) se dispararía con el proyecto bien", () => {
    const p = validateThresholds({ cpiWarn: 1.05, cpiEsc: 0.9, cvWarn: 1000, cvEsc: -100 });
    expect(p.join("|")).toMatch(/CPI: una alerta por encima de 1,00/);
    expect(p.join("|")).toMatch(/CV: una alerta por encima de 0/);
  });
  it("valores no numéricos", () => expect(validateThresholds({ ...T, cpiWarn: NaN })).toEqual(["todos los umbrales deben ser números"]));
});
