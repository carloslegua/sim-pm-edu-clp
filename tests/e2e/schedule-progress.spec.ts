// E2E en navegador real (auditoría, media): avance real y pronóstico del cronograma. Con el caso DISTRIB+ armado con los botones reales, «Cargar el avance del
// ejemplo» (el mismo corte 2026-11-03 de Valor Ganado) da el fin pronosticado del CPM recalculado sobre lo que falta (2027-07-19, 4 d lab. antes del plan);
// se guarda y sobrevive a una recarga; y un corte más tardío con el mismo avance corre el fin y el Plan para la Dirección lo recoge (P26).
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("avance real: el pronóstico sale del CPM sobre lo que falta, se guarda y un corte tardío atrasa el fin y llega al Plan para la Dirección", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Schedule_Management_Plan.html", "#btnSample", "#modalConfirmBtn");   // el calendario del caso (feriados): fin del plan 2027-07-23

  await page.goto("/Cronograma_CPM.html");
  await page.locator('.vtab[data-view="control"]').click();
  await expect(page.locator("#progKpis")).toContainText("Falta la fecha de corte");
  await page.locator("#btnProgSample").click();
  await expect(page.locator("#progDate")).toHaveValue("2026-11-03");
  await expect(page.locator("#progKpis")).toContainText("2027-07-23 → 2027-07-19");
  await expect(page.locator("#progKpis")).toContainText("3.1.2");                                   // la única actividad que se corre
  await expect(page.locator('[data-prog]').first()).toHaveValue("100");                              // 1.1.1 terminada
  await page.waitForTimeout(1300);

  await page.reload();
  await page.locator('.vtab[data-view="control"]').click();
  await expect(page.locator("#progDate")).toHaveValue("2026-11-03");
  await expect(page.locator("#progKpis")).toContainText("2027-07-19");

  // el mismo avance pero informado al 2027-02-01: lo pendiente no puede empezar antes → el fin se corre
  await page.locator("#progDate").fill("2027-02-01");
  await expect(page.locator("#progKpis")).not.toContainText("→ 2027-07-19");
  await expect(page.locator("#progKpis")).toContainText("+");
  await page.waitForTimeout(1300);

  await page.goto("/Plan_Direccion.html");
  await expect(page.locator("#stateView")).toContainText("P26");
  await expect(page.locator("#stateView")).toContainText("Con el avance real al 2027-02-01");
});
