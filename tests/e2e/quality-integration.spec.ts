// E2E en navegador real: el Plan de Calidad sobre el proyecto con la EDT (y su diccionario) y el OBS REALES, cargados con los botones de sus
// módulos, lee el criterio de aceptación de cada paquete, arranca en blanco, enlaza el ejemplo por código de paquete (17/17 verificados, sin
// hallazgos, responsables del OBS), guarda y sobrevive a una recarga; el Panel lo abre desde su tarjeta.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("Calidad sobre la EDT y el OBS reales: en blanco al inicio, ejemplo enlazado por código (17/17), persiste; el Panel lo abre", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/OBS_Builder.html", "#btnSample", "#modalConfirmBtn");

  // en blanco, pero ya ve los 18 paquetes y su criterio de aceptación (del diccionario de la EDT)
  await page.goto("/Plan_Calidad.html");
  await expect(page.locator("#mainArea")).toContainText("Sin actividades de control ni aseguramiento");
  await expect(page.locator("#cover tbody tr")).toHaveCount(18);
  await expect(page.locator("#cover")).toContainText("Cimentación conforme a planos y ensayos de resistencia del concreto aprobados");
  await expect(page.locator("#cover")).toContainText("esfuerzo continuo");                        // 1.3 (LOE) no exige control

  // «Cargar ejemplo»: los controles se enlazan por código con los paquetes reales y no quedan hallazgos
  await page.locator("#btnSample").click();
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("#tblChecks tbody tr")).toHaveCount(17);
  await expect(page.locator("#kpis")).toContainText("17/17");
  await expect(page.locator("#finds")).toContainText("Sin hallazgos");
  await expect(page.locator("#statusLeft")).not.toContainText("no encontraron su paquete");
  await page.waitForTimeout(1300);

  // recargar conserva lo guardado en el proyecto
  await page.reload();
  await expect(page.locator("#tblChecks tbody tr")).toHaveCount(17);
  await expect(page.locator("#kpis")).toContainText("17/17");

  // el Panel de Control abre el módulo desde su tarjeta
  await page.goto("/Panel_Control.html");
  await expect(page.locator('a.mod-card[href="Plan_Calidad.html"], .mod-card.active:has-text("Gestión de la Calidad")').first()).toBeVisible();
});
