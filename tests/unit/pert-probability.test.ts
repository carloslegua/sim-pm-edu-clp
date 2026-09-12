// Prioridad 2 de Fase 2: pertProbability ya tuvo un bug conceptual real
// documentado en el README (se sumaba la varianza de TODA la red en vez de
// solo la de la ruta crítica). La función en sí es pequeña pero el signo de
// Z y la integral de Φ son fáciles de invertir en silencio sin que ningún
// test lo note.
import { describe, expect, it } from "vitest";
import { pertProbability } from "../../src/core/gpi-core";

describe("pertProbability", () => {
  it("da 50% cuando el plazo objetivo coincide exactamente con la duración esperada (Z=0)", () => {
    const r = pertProbability(30, 9, 30);
    expect(r).not.toBeNull();
    expect(r!.z).toBeCloseTo(0, 9);
    expect(r!.prob).toBeCloseTo(0.5, 4);
  });

  it("es simétrica: P(objetivo) + P(2·TE − objetivo) = 1", () => {
    const te = 40, va = 16;
    const target = 45;
    const mirrored = 2 * te - target;
    const p1 = pertProbability(te, va, target)!.prob;
    const p2 = pertProbability(te, va, mirrored)!.prob;
    expect(p1 + p2).toBeCloseTo(1, 4);
  });

  it("crece monótonamente con el plazo objetivo (más plazo, más probabilidad de cumplir)", () => {
    const te = 50, va = 25;
    const probs = [40, 45, 50, 55, 60].map((t) => pertProbability(te, va, t)!.prob);
    for (let i = 1; i < probs.length; i++) expect(probs[i]).toBeGreaterThan(probs[i - 1]);
  });

  it("valores de referencia conocidos de la normal estándar (Z≈1.96 -> ~97.5%)", () => {
    const sigma = 4;
    const te = 30;
    const target = te + 1.96 * sigma; // Z = 1.96
    const r = pertProbability(te, sigma * sigma, target)!;
    expect(r.z).toBeCloseTo(1.96, 2);
    expect(r.prob).toBeCloseTo(0.975, 3);
  });

  it("devuelve null con varianza cero o negativa (no hay incertidumbre que integrar)", () => {
    expect(pertProbability(30, 0, 35)).toBeNull();
    expect(pertProbability(30, -1, 35)).toBeNull();
  });

  it("devuelve null con entradas no numéricas o infinitas", () => {
    expect(pertProbability(NaN, 4, 30)).toBeNull();
    expect(pertProbability(30, 4, Infinity)).toBeNull();
  });
});
