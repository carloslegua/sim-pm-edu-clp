// E2E en navegador real: el Plan de Comunicaciones sobre el proyecto con los interesados y el OBS REALES (cargados con los botones de sus
// módulos) enlaza por id con Stakeholder Studio (12/12 cubiertos, sin hallazgos), arranca en blanco, guarda y sobrevive a una recarga, y el
// Panel lo abre desde su tarjeta.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("Comunicaciones sobre los interesados reales: 12/12 cubiertos, en blanco al inicio, persiste; el Panel lo abre", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/Stakeholder_Studio.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/OBS_Builder.html", "#btnSample", "#modalConfirmBtn");

  // en blanco: el proyecto real no trae comunicaciones de ejemplo, y ya ve a los interesados reales
  await page.goto("/Plan_Comunicaciones.html");
  await expect(page.locator("#mainArea")).toContainText("Aún no hay comunicaciones");
  await expect(page.locator("#cover tbody tr")).toHaveCount(12);
  await expect(page.locator("#finds")).toContainText("no recibe ninguna comunicación");           // los que hay que gestionar de cerca, sin nada aún

  // «Cargar ejemplo» enlaza por id con esos interesados: todos cubiertos y sin hallazgos
  await page.locator("#btnSample").click();
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("#matrix tbody tr")).toHaveCount(11);
  await expect(page.locator("#kpis")).toContainText("12/12");
  await expect(page.locator("#finds")).toContainText("Sin hallazgos");
  await expect(page.locator("#cover")).toContainText("Gestionar de cerca");                      // el cuadrante sale de Stakeholder Studio
  await page.waitForTimeout(1300);

  // recargar conserva lo guardado en el proyecto
  await page.reload();
  await expect(page.locator("#matrix tbody tr")).toHaveCount(11);
  await expect(page.locator("#kpis")).toContainText("12/12");

  // el Panel de Control abre el módulo desde su tarjeta
  await page.goto("/Panel_Control.html");
  await expect(page.locator('a.mod-card[href="Plan_Comunicaciones.html"], .mod-card.active:has-text("Gestión de las Comunicaciones")').first()).toBeVisible();
});
