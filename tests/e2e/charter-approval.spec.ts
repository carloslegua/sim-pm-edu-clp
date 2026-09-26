// E2E en navegador real (auditoría, media): el Acta se APRUEBA y versiona. Con el acta aprobada, editar el presupuesto es trabajo en edición: NO
// se copia al CAPEX del proyecto (que leen los demás módulos) hasta aprobar una nueva versión, que archiva la anterior.
import { test, expect } from "@playwright/test";

test("Acta: lo editado tras la aprobación no mueve el CAPEX del proyecto hasta aprobar la nueva versión", async ({ page }) => {
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await page.goto("/Project_Charter.html");
  await page.locator("#btnSample").click();
  await page.locator("#modalOk").click();
  await page.waitForTimeout(1200);
  const capex = () => page.evaluate(() => Number((window as any).GPI.meta().capex));
  const inicial = await capex();
  expect(inicial).toBeGreaterThan(0);
  await expect(page.locator("#blStatus")).toContainText("Versión aprobada: v1.0");
  await expect(page.locator("#blStatus")).toContainText("coincide con lo aprobado");

  // edición posterior: deriva, y el CAPEX del proyecto NO cambia
  await page.locator('[data-bind="budget.amount"]').fill(String(inicial + 500000));
  await page.waitForTimeout(1500);
  await expect(page.locator("#blStatus")).toContainText("difiere de lo aprobado");
  await expect(page.locator("#blStatus")).toContainText("Presupuesto");
  expect(await capex()).toBe(inicial);

  // aprobar la nueva versión exige motivo; con motivo, se propaga y se archiva la anterior
  await page.locator("#btnApproveCharter").click();
  await expect(page.locator("#modalMsg")).toContainText("motivo");
  await page.locator("#modalOk").click();
  await page.locator("#blReason").fill("Ampliación de capacidad aprobada por el Comité");
  await page.locator("#btnApproveCharter").click();
  await page.waitForTimeout(600);
  expect(await capex()).toBe(inicial + 500000);
  await expect(page.locator("#blStatus")).toContainText("Versión aprobada: v2.0");
  await expect(page.locator("#blHistory")).toContainText("v1.0");

  // la versión y su historial sobreviven a la recarga
  await page.reload();
  await expect(page.locator("#blStatus")).toContainText("v2.0");
  await expect(page.locator("#blHistory")).toContainText("Aprobación inicial del acta");
});
