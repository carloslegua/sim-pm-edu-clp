// E2E en navegador real (auditoría, media): Control de Cambios no deja marcar como implementado un cambio de alcance respaldado por una modificación
// RECHAZADA; y cuando el alumno corrige la MOD en Recopilar Requisitos (estado y campo de solicitud), el cambio pasa a implementado.
import { test, expect } from "@playwright/test";

const REQ = { id: "r1", code: "REQ.07", text: "Cámara de frío para lácteos", type: "funcional", priority: "must", status: "aprobado", acceptanceCriteria: "Mantiene 4 °C", verificationMethod: "prueba", wbsNodeIds: [], sourceRanIds: [], normativeBasis: "", origin: "change", changeId: "m1" };
const SC = { id: "cr1", code: "CR-001", title: "Agregar cámara de frío", requester: "Cliente", origin: "Solicitud del cliente", type: "Actualización de la línea base o del plan",
  impact: { scope: { state: "con_impacto", note: "Nueva cámara de frío" }, schedule: { state: "sin_impacto", note: "" }, cost: { state: "sin_impacto", note: "" }, risk: { state: "sin_impacto", note: "" }, quality: { state: "sin_impacto", note: "" }, resources: { state: "sin_impacto", note: "" } },
  modIds: ["m1"], status: "Aprobada", decidedOn: "2026-08-10", approver: "CCB", authLevel: "ccb", rationale: "Aprobado por el CCB" };
const semilla = {
  version: 1, activeId: "p1",
  projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1, startDate: "2026-07-06" }, modules: {
    wbs: { rootId: "r", idCounter: 9, nodes: { r: { id: "r", name: "P", children: ["f1"] }, f1: { id: "f1", name: "Fase", children: ["w1"] }, w1: { id: "w1", name: "Obra", children: [] } } },
    changes: { idCounter: 2, requests: [SC] },
    requirements: { items: [REQ], baseline: { frozen: true, version: "2.0", date: "2026-09-30", approver: "CCB", snapshot: [REQ] }, changeCounter: 2, idCounter: 8,
      changes: [{ id: "m1", code: "MOD.01", date: "2026-08-12", summary: "Cámara de frío", status: "rechazado", approver: "CCB", ccrRef: "", impact: { scope: "", schedule: "", cost: "", wbs: "" }, justification: "" }] }
  } } }
};

test("un cambio de alcance con la MOD rechazada no puede implementarse; corregida la MOD en Requisitos, sí", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript((db) => { if (!localStorage.getItem("gpi_db")) localStorage.setItem("gpi_db", JSON.stringify(db)); }, semilla);

  // 1) la solicitud aprobada, con la MOD rechazada y sin citar la solicitud: no se puede implementar
  await page.goto("/Control_Cambios.html");
  await page.locator('tr.cr-row:has-text("CR-001")').click();
  await expect(page.locator("#mainArea")).toContainText("MOD.01 está «Rechazada»");
  await page.locator('[data-f="status"]').selectOption("Implementada");
  await expect(page.locator('[data-f="status"]')).toHaveValue("Aprobada");                       // el cambio de estado se rechaza
  await expect(page.locator("#mainArea")).toContainText("No se puede pasar a «Implementada»");
  await expect(page.locator("#mainArea")).toContainText("no puede respaldar un cambio de alcance aprobado");

  // 2) el alumno corrige la MOD en SU módulo: la aprueba y cita esta solicitud
  await page.goto("/Recopilar_Requisitos.html");
  await page.locator('.tab[data-p="p4"]').click();
  await page.locator('select[onchange*="setModStatus"]').selectOption("aprobado");
  await page.locator('input[onchange*="updateCcr"]').fill("CR-001");
  await page.locator('input[onchange*="updateCcr"]').blur();
  await page.waitForTimeout(1300);

  // 3) ahora cumple (aprobada, corresponde a la solicitud e incorporada a la línea base v2.0 posterior a la decisión): se puede implementar
  await page.goto("/Control_Cambios.html");
  await page.locator('tr.cr-row:has-text("CR-001")').click();
  await expect(page.locator("#mainArea")).not.toContainText("Para implementarla falta");
  await page.locator('[data-f="status"]').selectOption("Implementada");
  await expect(page.locator('[data-f="status"]')).toHaveValue("Implementada");
});
