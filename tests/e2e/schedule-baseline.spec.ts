// E2E en navegador real: salud de la red y línea base del cronograma sobre el proyecto DISTRIB+ COMPLETO (armado con los
// botones reales de WBS Builder, Definir las Actividades y Cronograma/CPM): la salud lee la red real, la línea base se
// fija con motivo y aprobador, se guarda versionada y el indicador del Panel de Control la refleja.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("Salud de la red y línea base sobre el proyecto real: se evalúa, se fija, se guarda y el Panel la muestra", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");

  await page.goto("/Cronograma_CPM.html");
  await page.locator('[data-view="control"]').click();
  const ctl = page.locator("#ctlWrap");
  await expect(ctl).toContainText("Salud de la red");
  // la red real: 47 de 51 enlaces son FS, 4 desfases SS, ningún adelanto, holguras enormes en Procura e informes
  await expect(ctl).toContainText("47 / 51");
  await expect(ctl.locator("tr", { hasText: "Adelantos (desfase negativo)" })).toContainText("✓ cumple");
  await expect(ctl.locator("tr", { hasText: "Holgura alta" })).toContainText("✗ no cumple");
  await expect(ctl).toContainText("Todavía no hay una línea base");

  await page.locator("#btnBaseline").click();
  await page.locator("#blApprover").fill("Sponsor (Gerencia General)");
  await page.locator("#blOk").click();
  await expect(ctl).toContainText("Línea base del cronograma · LB-1");
  await expect(ctl).toContainText("273 → 273 d");
  await expect(ctl).toContainText("Ninguna actividad cambió");
  await page.locator('[data-view="gantt"]').click();
  await expect(page.locator("#ganttWrap")).toContainText("línea base LB-1");
  await page.waitForTimeout(1300);

  // el Panel de Control la refleja junto a la duración del proyecto
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#dashGrid")).toContainText("Línea base LB-1: sin desviación");
  await expect(page.locator("#dashGrid")).toContainText("273");
});
