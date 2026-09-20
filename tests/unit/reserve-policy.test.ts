// Política de reservas del plan de riesgos (PMBOK: contingencia dentro de la línea base, reserva de gestión fuera de ella;
// niveles de autoridad para liberarlas y monitoreo de su agotamiento). Fija la lógica pura y su efecto sobre la
// aprobación de las órdenes de cambio.
import { describe, expect, it } from "vitest";
import {
  authLevelOf, contingencyAlert, levelCovers, normalizeReserves, requiredLevel, tiersText, validateReserves, type ReservePolicy
} from "../../src/shared/reserve-policy";
import { requiredAuthority, validateApproval } from "../../src/shared/change-orders";
import { normalizePlan, validatePlan } from "../../src/shared/risk-analysis";

const POL: ReservePolicy = { pmLimit: 50000, ccbLimit: 250000, contAlertPct: 25 };
const fmt = (n: number) => String(n);

describe("normalización y validación de la política", () => {
  it("valores tolerantes; sin datos = sin política; el plan la trae por omisión y los planes viejos se leen sin ella", () => {
    expect(normalizeReserves(null)).toEqual({ pmLimit: null, ccbLimit: null, contAlertPct: null });
    expect(normalizeReserves({ pmLimit: "50 000", ccbLimit: "x", contAlertPct: 25 })).toEqual({ pmLimit: 50000, ccbLimit: null, contAlertPct: 25 });
    expect(normalizePlan({}).reserves).toEqual({ pmLimit: null, ccbLimit: null, contAlertPct: null });   // plan guardado antes de este campo
    expect(normalizePlan({ reserves: POL }).reserves).toEqual(POL);
  });
  it("coherencia: límites no negativos y crecientes, umbral de alerta entre 0 y 100 %; el plan la revisa", () => {
    expect(validateReserves(POL)).toEqual([]);
    expect(validateReserves({ pmLimit: 300000, ccbLimit: 250000, contAlertPct: null })[0]).toMatch(/Director de Proyecto no puede superar el del CCB/);
    expect(validateReserves({ pmLimit: -1, ccbLimit: null, contAlertPct: null })[0]).toMatch(/no pueden ser negativos/);
    expect(validateReserves({ pmLimit: null, ccbLimit: null, contAlertPct: 0 })[0]).toMatch(/entre 0 y 100/);
    expect(validateReserves({ pmLimit: null, ccbLimit: null, contAlertPct: 120 })[0]).toMatch(/entre 0 y 100/);
    expect(validatePlan(normalizePlan({ reserves: { pmLimit: 9, ccbLimit: 1 } })).some((m) => /Director de Proyecto no puede superar/.test(m))).toBe(true);
  });
});

describe("nivel de autoridad requerido", () => {
  it("contingencia: por tramos de monto (Director de Proyecto → CCB → Sponsor), con los límites incluidos en su tramo", () => {
    expect(requiredLevel(POL, "cont", 1)).toBe("pm");
    expect(requiredLevel(POL, "cont", 50000)).toBe("pm");
    expect(requiredLevel(POL, "cont", 50001)).toBe("ccb");
    expect(requiredLevel(POL, "cont", 250000)).toBe("ccb");
    expect(requiredLevel(POL, "cont", 250001)).toBe("sponsor");
  });
  it("un límite vacío = ese nivel no tiene autoridad propia: se pasa al siguiente", () => {
    expect(requiredLevel({ pmLimit: null, ccbLimit: 100000, contAlertPct: null }, "cont", 10)).toBe("ccb");        // el PM no libera nada solo
    expect(requiredLevel({ pmLimit: null, ccbLimit: 100000, contAlertPct: null }, "cont", 100001)).toBe("sponsor");
    expect(requiredLevel({ pmLimit: 5000, ccbLimit: null, contAlertPct: null }, "cont", 5001)).toBe("ccb");        // sin tope del CCB: todo lo demás es del CCB
    expect(requiredLevel({ pmLimit: 5000, ccbLimit: null, contAlertPct: null }, "cont", 9e9)).toBe("ccb");
  });
  it("sin límites no hay política por montos (null); reserva de gestión y fondos adicionales SIEMPRE el sponsor", () => {
    expect(requiredLevel(null, "cont", 999999)).toBeNull();
    expect(requiredLevel({ pmLimit: null, ccbLimit: null, contAlertPct: 30 }, "cont", 999999)).toBeNull();
    expect(requiredLevel(null, "mgmt", 1)).toBe("sponsor");
    expect(requiredLevel(POL, "extra", 1)).toBe("sponsor");
  });
  it("nivel con que se aprobó: explícito; en órdenes anteriores se deduce de la autorización del sponsor o del texto del aprobador", () => {
    expect(authLevelOf({ authLevel: "pm", approver: "Sponsor" })).toBe("pm");                    // lo explícito manda
    expect(authLevelOf({ sponsorAuth: true })).toBe("sponsor");
    expect(authLevelOf({ approver: "CCB" })).toBe("ccb");
    expect(authLevelOf({ approver: "Comité de cambios" })).toBe("ccb");
    expect(authLevelOf({ approver: "Sponsor (Gerencia General)" })).toBe("sponsor");
    expect(authLevelOf({ approver: "Director de Proyecto" })).toBe("pm");
    expect(authLevelOf({ approver: "Juan" })).toBeNull();
    expect(authLevelOf({})).toBeNull();
  });
  it("un nivel mayor cubre al menor, nunca al revés; sin requisito siempre cubre", () => {
    expect(levelCovers("sponsor", "ccb")).toBe(true); expect(levelCovers("ccb", "ccb")).toBe(true);
    expect(levelCovers("pm", "ccb")).toBe(false); expect(levelCovers(null, "pm")).toBe(false);
    expect(levelCovers(null, null)).toBe(true);
  });
  it("texto de tramos", () => {
    expect(tiersText(POL, fmt)).toBe("hasta 50000: Director de Proyecto · hasta 250000: CCB · por encima: Sponsor");
    expect(tiersText({ pmLimit: 10, ccbLimit: null, contAlertPct: null }, fmt)).toBe("hasta 10: Director de Proyecto · por encima: CCB");
  });
});

describe("alerta de agotamiento de la contingencia", () => {
  it("alerta cuando lo disponible baja del umbral (% de la inicial); el umbral exacto no alerta", () => {
    expect(contingencyAlert(200000, 1000000, POL)).toMatchObject({ alert: true, pct: 20, threshold: 25 });
    expect(contingencyAlert(250000, 1000000, POL)!.alert).toBe(false);
    expect(contingencyAlert(900000, 1000000, POL)!.alert).toBe(false);
    expect(contingencyAlert(-10000, 1000000, POL)!.alert).toBe(true);                      // sobregirada
  });
  it("sin umbral, sin política o sin contingencia inicial: no hay alerta que dar", () => {
    expect(contingencyAlert(1, 1000000, { pmLimit: null, ccbLimit: null, contAlertPct: null })).toBeNull();
    expect(contingencyAlert(1, 1000000, null)).toBeNull();
    expect(contingencyAlert(0, 0, POL)).toBeNull();
  });
});

describe("la política gobierna la aprobación de las órdenes de cambio", () => {
  const budget = { cont: 852000, mgmt: 400000, bac: 7900000 };
  const cont = (o: Record<string, unknown> = {}) => ({ id: "OC-9", kind: "imprevisto", fund: "Contingencia", status: "Pendiente", cost: 180000, approver: "CCB", ...o });
  const prob = (o: Record<string, unknown>, policy: ReservePolicy | null = POL) => validateApproval(o, [o], budget, undefined, policy);
  it("dentro de la autoridad del nivel que aprueba: se puede aprobar", () => {
    expect(prob(cont())).toEqual([]);                                                       // 180.000 ≤ 250.000: CCB
    expect(prob(cont({ cost: 30000, approver: "Director de Proyecto" }))).toEqual([]);      // ≤ 50.000: el PM
    expect(prob(cont({ cost: 400000, approver: "x", authLevel: "sponsor" }))).toEqual(expect.not.arrayContaining([expect.stringMatching(/política de reservas/)]));
  });
  it("por encima de su autoridad: NO se aprueba y dice quién debe autorizar y con qué tramos", () => {
    const p = prob(cont({ cost: 180000, approver: "Director de Proyecto" }));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/una orden de 180000 con cargo a contingencia la autoriza el CCB/);
    expect(p[0]).toMatch(/hasta 50000: Director de Proyecto · hasta 250000: CCB · por encima: Sponsor/);
    expect(p[0]).toMatch(/la aprobación registrada es del Director de Proyecto/);
    expect(prob(cont({ cost: 300000, approver: "CCB" }))[0]).toMatch(/la autoriza el Sponsor/);
  });
  it("aprobador sin nivel reconocible: pide indicarlo; el nivel explícito manda sobre el texto", () => {
    expect(prob(cont({ approver: "Juan" }))[0]).toMatch(/indica el nivel de autoridad/);
    expect(prob(cont({ approver: "Juan", authLevel: "ccb" }))).toEqual([]);
    expect(prob(cont({ approver: "CCB", authLevel: "pm" }))[0]).toMatch(/la aprobación registrada es del Director de Proyecto/);
  });
  it("sin política por montos (o sin política) el comportamiento es el de antes", () => {
    expect(prob(cont({ cost: 300000, approver: "Juan" }), null)).toEqual([]);
    expect(prob(cont({ cost: 300000, approver: "Juan" }), { pmLimit: null, ccbLimit: null, contAlertPct: 20 })).toEqual([]);
    expect(validateApproval(cont({ cost: 300000, approver: "Juan" }), [], budget)).toEqual([]);
  });
  it("la reserva de gestión sigue exigiendo al sponsor (no depende de los montos de la contingencia)", () => {
    expect(prob(cont({ fund: "Reserva de gestión", cost: 10 }))[0]).toMatch(/autorización expresa del sponsor/);
    expect(prob(cont({ fund: "Reserva de gestión", cost: 10, sponsorAuth: true }))).toEqual([]);
  });
  it("requiredAuthority: el nivel que la política exige a una orden (para mostrarlo antes de aprobar)", () => {
    expect(requiredAuthority(cont({ cost: 180000 }), POL)).toBe("ccb");
    expect(requiredAuthority(cont({ cost: 180000 }), null)).toBeNull();
    expect(requiredAuthority(cont({ fund: "Financiamiento adicional" }), null)).toBe("sponsor");
  });
});
