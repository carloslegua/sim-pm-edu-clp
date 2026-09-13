// E2E en navegador real, servido por HTTP local (playwright.config.ts
// levanta scripts/static-server.mjs) -- el modo "mismo origen" que
// README.md documenta como el confiable para compartir datos entre
// módulos (a diferencia de file://, donde el propio README avisa que
// "el almacenamiento no siempre se comparte entre pestañas"). Prueba
// de punta a punta, en un navegador real, que dos documentos HTML
// distintos SÍ comparten `localStorage["gpi_db"]` bajo HTTP: hasta
// ahora esto solo se había verificado con jsdom (que no es un
// navegador real) o manualmente (ver MIGRATION.md).
import { test, expect } from "@playwright/test";

test("HTTP mismo origen — un cambio hecho en el Panel se ve reflejado al abrir otro módulo", async ({ page }) => {
  await page.goto("/Panel_Control.html");

  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");

  await page.locator("#btnRename").click();
  await page.locator("#modalInput").fill("Proyecto E2E cross-module");
  await page.locator("#modalOk").click();
  await expect(page.locator("#projSelect option")).toContainText("Proyecto E2E cross-module");

  // Navegar a OTRO documento HTML del mismo origen (no una recarga del
  // mismo Panel): WBS_Builder.html precarga #projectTitle desde
  // GPI.active().meta.name al montar (ver src/modules/wbs/main.ts).
  await page.goto("/WBS_Builder.html");
  await expect(page.locator("#projectTitle")).toHaveValue("Proyecto E2E cross-module");
});
