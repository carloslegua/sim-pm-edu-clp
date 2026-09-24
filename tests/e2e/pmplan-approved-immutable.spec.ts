// E2E en navegador real (auditoría, alta): el documento del plan aprobado NO cambia sin una nueva aprobación. Se aprueba desde la interfaz, se modifica
// después la política de calidad (otro módulo, con su propia pantalla) y al volver al plan el documento sigue siendo el aprobado, con aviso; el borrador
// vigente se ve solo a pedido; y una nueva versión conserva el documento anterior.
import { test, expect } from "@playwright/test";

const semilla = {
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1, startDate: "2026-07-06", capex: "5000" }, modules: {
    wbs: { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1", "w2"] }, w1: { id: "w1", name: "Excavación", children: [], cost: 700 }, w2: { id: "w2", name: "Relleno", children: [], cost: 300 } } },
    activities: { idCounter: 3, byLeaf: { w1: [{ id: "a1", name: "Excavar", unit: "m", qty: 10, perf: 1, teams: 1 }], w2: [{ id: "a2", name: "Rellenar", unit: "m", qty: 5, perf: 1, teams: 1 }] } },
    schedule: { linkCounter: 2, import: null, links: [{ id: "L1", from: "a1", to: "a2", type: "FS", lag: 0, lagUnit: "d" }], baseline: { frozen: true, version: "LB-1", date: "2026-07-12", snapshot: { projectDuration: 15, startDate: "2026-07-06", finishDate: "2026-07-24", nearCriticalDays: 5, rows: [{ id: "a1", code: "1.1.1", name: "Excavar", isMilestone: false, dur: 10, es: 0, ef: 10, tf: 0, critical: true }] }, log: [{ version: "LB-1", date: "2026-07-12", reason: "Inicial", approver: "Sponsor", sponsorAuth: true, projectDuration: 15, finishDate: "2026-07-24", deviationPct: null }] } },
    scopeStatement: { productScope: "Terreno nivelado", deliverables: [{ id: "d1", code: "E1", name: "Terreno nivelado", acceptanceCriteria: "Cotas ±2 cm" }], baseline: { frozen: true, version: "1.0", date: "2026-07-10", approver: "Sponsor" }, idCounter: 1, delCounter: 2 },
    cost: { budget: { baseCost: 1000, computed: { base: 1000, cont: 100, bac: 1100, total: 1200 } }, changeOrders: [], estimate: { class: 3 } },
    quality: { idCounter: 2, policy: "Política aprobada por el sponsor", standards: "RNE", metrics: [], checks: [], coq: [{ id: "cq1", cat: "prevencion", description: "Revisiones", amount: 100 }] }
  } } }
};

test("plan aprobado: modificar después la política de calidad no cambia el documento aprobado; nueva versión conserva el anterior", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript((db) => { if (!localStorage.getItem("gpi_db")) localStorage.setItem("gpi_db", JSON.stringify(db)); }, semilla);

  // 1) aprobar desde la interfaz
  await page.goto("/Plan_Direccion.html");
  await page.locator("#pfApprover").fill("Rosa Paredes, Sponsor");
  await page.locator("#btnApprove").click();
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("#stateView")).toContainText("Plan aprobado v1.0 por Rosa Paredes, Sponsor");
  await page.waitForTimeout(1300);

  // 2) el alumno modifica la política de calidad en SU módulo (pantalla real) y lo guarda
  await page.goto("/Plan_Calidad.html");
  await page.locator("#policy").fill("Política MODIFICADA después de aprobar");
  await page.waitForTimeout(1300);

  // 3) de vuelta en el plan: lo aprobado, intacto y con aviso; el vigente es un borrador
  await page.goto("/Plan_Direccion.html");
  await expect(page.locator("#stateView")).toContainText("CAMBIOS SIN APROBAR");
  await expect(page.locator("#stateView")).toContainText("Plan de Calidad (aprobado → modificado)");
  await page.locator('#tabs .tab[data-view="doc"]').click();
  await expect(page.locator("#docBar")).toContainText("Documento APROBADO v1.0");
  await expect(page.locator("#docView")).toContainText("Política aprobada por el sponsor");
  await expect(page.locator("#docView")).not.toContainText("MODIFICADA");
  await page.locator("#docCurrent").click();
  await expect(page.locator("#docBar")).toContainText("BORRADOR con los datos actuales");
  await expect(page.locator("#docView")).toContainText("Política MODIFICADA después de aprobar");
  await expect(page.locator("#docView .cover")).toContainText("Borrador con cambios sin aprobar");
  // la barra de aviso no se imprime; el documento sí
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#docBar")).toBeHidden(); await expect(page.locator("#docView .paper")).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  // 4) nueva versión: conserva el documento aprobado v1.0 en el historial
  await page.locator('#tabs .tab[data-view="state"]').click();
  await page.locator("#btnNewVersion").click();
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("#stateView")).toContainText("Versiones anteriores: v1.0");
  await page.locator("[data-histdoc]").first().click();
  await expect(page.locator("#docBar")).toContainText("Versión anterior v1.0");
  await expect(page.locator("#docView")).toContainText("Política aprobada por el sponsor");
  await expect(page.locator("#docView")).not.toContainText("MODIFICADA");
});
