// Clase del estimado inferida de la madurez de la definición, contraste con la clase declarada y rango de exactitud
// aplicado al presupuesto (AACE 17R-97 / 56R-08).
import { describe, expect, it } from "vitest";
import { CLASS_MATURITY, MATURITY_ITEMS, accuracyRange, classAdvisory, classForMaturity, definitionMaturity, type MaturityInput } from "../../src/shared/estimate-class";

const ALL = (v: number): MaturityInput => ({ charter: v, scope: v, requirements: v, wbs: v, activities: v, pricing: v, schedule: v });

describe("madurez de la definición", () => {
  it("los pesos suman 100: definición completa = 100 %, vacía = 0 %", () => {
    expect(MATURITY_ITEMS.reduce((s, m) => s + m.weight, 0)).toBe(100);
    expect(definitionMaturity(ALL(1)).pct).toBe(100);
    expect(definitionMaturity(ALL(0)).pct).toBe(0);
  });
  it("es la suma ponderada de lo que hay; valores fuera de 0..1 o basura se acotan", () => {
    const r = definitionMaturity({ ...ALL(0), activities: 1, pricing: 0.5 });          // 15 + 15
    expect(r.pct).toBeCloseTo(30, 9);
    expect(r.items.find((i) => i.key === "pricing")).toMatchObject({ weight: 30, value: 0.5, points: 15 });
    expect(definitionMaturity({ ...ALL(0), charter: 7, scope: -3, wbs: NaN as never }).pct).toBe(15);   // 7→1 (15 pts); −3→0; NaN→0
    // una red solo «de abajo hacia arriba» (EDT + actividades + precios + cronograma) NO llega a la clase 1 sin acta, alcance ni requisitos
    const abajoArriba = definitionMaturity({ charter: 0, scope: 0, requirements: 0, wbs: 1, activities: 1, pricing: 1, schedule: 1 });
    expect(abajoArriba.pct).toBe(60); expect(abajoArriba.class).toBe(2);
  });
  it("clase = la más madura cuyo piso de madurez se alcanza (0–2 / 1–15 / 10–40 / 30–75 / 65–100)", () => {
    expect([0, 0.9, 1, 9.9, 10, 29.9, 30, 64.9, 65, 100].map(classForMaturity)).toEqual([5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
    expect(CLASS_MATURITY[3]).toEqual([10, 40]);
  });
});

describe("contraste con la clase declarada", () => {
  it("una clase más madura que la que respaldan los datos AVISA (la exactitud declarada no tiene respaldo)", () => {
    const a = classAdvisory(2, 18);                                                     // clase 2 exige 30–75 %; hay ≈ 18 % (clase 3)
    expect(a.level).toBe("aviso");
    expect(a.text).toMatch(/clase 2 supone una madurez de definición de 30–75 %.*≈ 18 %.*clase 3/);
  });
  it("una clase menos madura que la posible es solo informativa; la coherente, ok", () => {
    expect(classAdvisory(5, 45).level).toBe("info");
    expect(classAdvisory(3, 18)).toMatchObject({ level: "ok" });
    expect(classAdvisory(3, 18).text).toMatch(/≈ 18 %.*10–40 %/);
  });
});

describe("rango de exactitud aplicado al presupuesto", () => {
  it("mínimo y máximo sobre el estimado con contingencia", () => {
    const r = accuracyRange(7000000, -15, 30);
    expect(r.min).toBeCloseTo(5950000, 6); expect(r.max).toBeCloseTo(9100000, 6);
    expect(accuracyRange(100, 0, 0)).toEqual({ min: 100, max: 100 });
  });
});
