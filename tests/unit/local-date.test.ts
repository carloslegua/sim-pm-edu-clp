// «Hoy» en la hora LOCAL (auditoría, media): en Lima, desde las 19:00 el UTC ya es el día siguiente.
import { describe, expect, it } from "vitest";
import { todayLocalISO } from "../../src/shared/local-date";

describe("todayLocalISO", () => {
  it("REPRO: a las 21:30 en Lima (UTC−5) sigue siendo el mismo día; toISOString() daba el siguiente", () => {
    const antes = process.env.TZ;
    process.env.TZ = "America/Lima";
    try {
      const d = new Date("2026-09-25T02:30:00Z");                       // 21:30 del 24 de septiembre en Lima
      expect(d.toISOString().slice(0, 10)).toBe("2026-09-25");           // el defecto: el día de más
      expect(todayLocalISO(d)).toBe("2026-09-24");
      expect(todayLocalISO(new Date("2026-09-24T05:00:00Z"))).toBe("2026-09-24");   // medianoche local
    } finally { if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes; }
  });
  it("rellena mes y día de un dígito y usa el reloj local por omisión", () => {
    expect(todayLocalISO(new Date(2027, 0, 5, 12))).toBe("2027-01-05");
    expect(todayLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
