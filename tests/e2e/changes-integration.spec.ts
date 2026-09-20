// E2E en navegador real: el Control Integrado de Cambios sobre el proyecto DISTRIB+ COMPLETO (EDT, actividades y cronograma armados
// con los botones reales de los otros módulos) calcula el efecto de cada solicitud en el fin del proyecto con la MISMA red que el ejemplo
// independiente (el CPM se vuelve a correr con la duración afectada); arranca en blanco; y el Panel de Control lo abre desde su tarjeta.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};
// «Fin del proyecto» por solicitud (columna 5 de la tabla): +8 d, +10 d absorbidos, +5 d…
const efectos = async (page: Page) => {
  const filas = page.locator("tr.cr-row");
  const n = await filas.count(), out: Record<string, string> = {};
  for (let i = 0; i < n; i++) { const tds = filas.nth(i).locator("td"); out[(await tds.nth(0).innerText()).trim()] = (await tds.nth(4).innerText()).replace(/\s+/g, " ").trim(); }
  return out;
};

test("Control de Cambios sobre el proyecto real = ejemplo independiente; arranca en blanco; el Panel lo abre", async ({ page, browser }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");

  // en blanco: el proyecto real no trae solicitudes de ejemplo
  await page.goto("/Control_Cambios.html");
  await expect(page.locator("tr.cr-row")).toHaveCount(0);
  await expect(page.locator("#mainArea")).toContainText("Aún no hay solicitudes");

  // «Cargar ejemplo» las resuelve contra la EDT y la red REALES del proyecto
  await page.locator("#btnSample").click();
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("tr.cr-row")).toHaveCount(3);
  await expect(page.locator("#statusLeft")).toContainText("aún no tiene las órdenes OC-001, OC-002, OC-003");   // Costos del proyecto no las tiene
  const real = await efectos(page);
  expect(real["CR-001"]).toMatch(/\+8 d/);                                    // cimentaciones (4.2) está en la ruta crítica: +8 d al fin
  expect(real["CR-003"]).toMatch(/\+5 d/);
  expect(real["CR-002"]).not.toMatch(/\+/);                                    // 4.5 tiene holgura: +10 d no mueve el fin
  await page.locator('tr.cr-row:has-text("CR-002")').click();
  await expect(page.locator("#mainArea")).toContainText("la holgura lo absorbe");
  await page.waitForTimeout(1300);

  // recargar conserva lo guardado en el proyecto
  await page.reload();
  await expect(page.locator("tr.cr-row")).toHaveCount(3);

  // el ejemplo independiente (sin proyecto) da los mismos efectos
  const limpio = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  const solo = await limpio.newPage();
  await solo.goto("/Control_Cambios.html");
  await expect(solo.locator("tr.cr-row")).toHaveCount(3);
  expect(await efectos(solo)).toEqual(real);
  // las órdenes del ejemplo sí existen en modo independiente: sin avisos de vínculos rotos en CR-001
  await solo.locator('tr.cr-row:has-text("CR-001")').click();
  await expect(solo.locator("#mainArea")).toContainText("Para implementarla falta");
  await limpio.close();

  // el Panel de Control abre el módulo desde su tarjeta
  await page.goto("/Panel_Control.html");
  await expect(page.locator('a.mod-card[href="Control_Cambios.html"], .mod-card.active:has-text("Control Integrado de Cambios")').first()).toBeVisible();
});
