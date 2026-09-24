// E2E en navegador real: el Plan para la Dirección sobre el proyecto DISTRIB+ armado con los botones reales de los otros módulos
// lee la MISMA red que Cronograma/CPM (273 d, fin 2027-07-21), arma el documento con la EDT completa, avisa que faltan las líneas base
// y bloquea la aprobación; el aviso de «sin proyecto» no inventa el caso; y el Panel de Control lo abre desde su tarjeta.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("Plan para la Dirección sobre el proyecto real: cronograma 273 d, documento con la EDT, aprobación bloqueada; el Panel lo abre", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");

  await page.goto("/Plan_Direccion.html");
  const estado = page.locator("#stateView");
  await expect(estado).toContainText("Estado del plan");
  await expect(estado).toContainText(/273 d laborables\s*·\s*fin 2027-07-21\s*·\s*sin línea base/);         // la misma red que Cronograma/CPM
  await expect(estado).toContainText(/Plan de Calidad/); await expect(estado).toContainText("sin módulo en la suite");
  await expect(estado).toContainText(/No se puede aprobar todavía: falta la línea base del alcance/);
  await expect(page.locator("#btnApprove")).toBeDisabled();

  // el documento sale con la EDT y el cronograma reales del proyecto
  await page.locator('#tabs .tab[data-view="doc"]').click();
  const doc = page.locator("#docView");
  await expect(doc).toContainText("Plan para la dirección del proyecto");
  await expect(doc).toContainText("3. Plan de gestión del cronograma");
  await expect(doc.locator("h3#s2-edt ~ table").first().locator("tbody tr")).not.toHaveCount(0);
  await expect(doc).toContainText(/Duración \(días laborables\)\s*273/);
  expect(await doc.locator(".toc a").count()).toBeGreaterThan(10);

  // el PDF/impresión muestra solo el documento (no las pestañas ni el estado)
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#tabs")).toBeHidden(); await expect(page.locator("#stateView")).toBeHidden(); await expect(doc).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  // el Panel de Control abre el módulo desde su tarjeta
  await page.goto("/Panel_Control.html");
  await expect(page.locator('a.mod-card[href="Plan_Direccion.html"], .mod-card.active:has-text("Plan para la Dirección")').first()).toBeVisible();
});

test("sin proyecto activo (contexto limpio) no inventa el caso DISTRIB+ ni un documento", async ({ browser }) => {
  const limpio = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  const solo = await limpio.newPage();
  await solo.goto("/Plan_Direccion.html");
  await expect(solo.locator("#stateView")).toContainText("Sin proyecto activo");
  await expect(solo.locator("#stateView")).not.toContainText("DISTRIB");
  await limpio.close();
});
