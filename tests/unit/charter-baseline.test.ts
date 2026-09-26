// Aprobación y versiones del Acta (auditoría, media): aprobar fija una instantánea; lo editado después es trabajo en edición que se compara con lo
// aprobado; una nueva versión archiva la anterior completa. Las firmas y la propia línea base no cuentan como contenido.
import { describe, expect, it } from "vitest";
import { approvalProblems, approveCharter, charterContent, charterDrift, normalizeCharterBaseline, suggestCharterVersion } from "../../src/shared/charter-baseline";

const acta = () => ({ identification: { sponsor: "Gerencia General", manager: "DP" }, budget: { amount: 8500000, currency: "USD" }, purpose: "Almacén", approval: { sponsorName: "GG", sponsorDate: "2026-07-08" }, baseline: null });
const v1 = { version: "1.0", date: "2026-07-08", approver: "Gerencia General", reason: "Aprobación inicial del acta" };

describe("charter-baseline", () => {
  it("sin aprobar: no hay deriva ni versión sugerida distinta de 1.0", () => {
    expect(charterDrift(acta(), null)).toEqual({ approved: false, drifted: false, sections: [] });
    expect(suggestCharterVersion(null)).toBe("1.0");
  });
  it("las firmas y la línea base no son contenido", () => {
    expect(Object.keys(charterContent(acta())).sort()).toEqual(["budget", "identification", "purpose"]);
  });
  it("REPRO: tras aprobar, cambiar el presupuesto es deriva y nombra la sección; volver al valor aprobado la quita", () => {
    const s = acta(), b = approveCharter(s, null, v1, "2026-07-08");
    expect(b.frozen).toBe(true); expect(b.version).toBe("1.0"); expect(b.history).toEqual([]);
    expect(charterDrift(s, b).drifted).toBe(false);
    s.budget.amount = 9000000;
    expect(charterDrift(s, b)).toEqual({ approved: true, drifted: true, sections: ["Presupuesto"] });
    s.budget.amount = 8500000;
    expect(charterDrift(s, b).drifted).toBe(false);
    s.approval.sponsorDate = "2026-08-01";   // las firmas no cuentan
    expect(charterDrift(s, b).drifted).toBe(false);
  });
  it("una nueva versión archiva la vigente completa y actualiza la referencia", () => {
    const s = acta(), b1 = approveCharter(s, null, v1, "2026-07-08");
    s.budget.amount = 9000000;
    const v2 = { version: "2.0", date: "2026-09-01", approver: "Comité", reason: "CAPEX aumentado por orden de cambio OC-001" };
    expect(suggestCharterVersion(b1)).toBe("2.0");
    const b2 = approveCharter(s, b1, v2, "2026-09-01");
    expect(b2.version).toBe("2.0"); expect(b2.history).toHaveLength(1);
    expect(b2.history[0]).toMatchObject({ version: "1.0", approver: "Gerencia General", supersededOn: "2026-09-01" });
    expect((b2.history[0].snapshot[0].budget as { amount: number }).amount).toBe(8500000);   // la versión anterior conserva SU contenido
    expect(charterDrift(s, b2).drifted).toBe(false);
    expect(b1.version).toBe("1.0");   // no muta la entrada
  });
  it("qué falta para aprobar: versión no repetida, fecha, quién y motivo", () => {
    const b1 = approveCharter(acta(), null, v1, "2026-07-08");
    expect(approvalProblems(null, v1)).toEqual([]);
    expect(approvalProblems(b1, { version: "1.0", date: "", approver: " ", reason: "" })).toHaveLength(4);
  });
  it("lectura tolerante: basura o sin instantánea = sin aprobar", () => {
    expect(normalizeCharterBaseline(null)).toBeNull(); expect(normalizeCharterBaseline("x")).toBeNull(); expect(normalizeCharterBaseline({ frozen: true })).toBeNull();
    const b = approveCharter(acta(), null, v1, "2026-07-08");
    expect(normalizeCharterBaseline(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });
});
