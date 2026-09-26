// E2E en navegador real (auditoría, media): las restricciones de los hitos del Plan del Cronograma se comparan con las fechas del CPM del proyecto.
// Con el caso DISTRIB+ armado con los botones reales los 6 hitos del ejemplo cumplen; si el alumno adelanta la fecha límite de un hito por debajo
// del fin real del paquete que lo cierra, el panel lo marca como incumplido y el Plan para la Dirección lo recoge como P25.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("hitos: con el caso completo todos cumplen su restricción contra el CPM; una fecha imposible se marca y llega al Plan para la Dirección", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Schedule_Management_Plan.html", "#btnSample", "#modalConfirmBtn");

  await page.goto("/Schedule_Management_Plan.html");
  await expect(page.locator("#mil-check")).toContainText("6 comparado(s)");
  await expect(page.locator("#mil-check")).toContainText("ninguno incumplido");
  await expect(page.locator("#mil-check")).not.toContainText("sin vínculo");

  // el hito «Fin de Ingeniería y Diseño» (2.2, 2.3 → 2026-09-30) a más tardar el 2026-09-15: imposible con el CPM
  const fila = page.locator("#mil-table tbody tr", { hasText: "" }).nth(1);
  await fila.locator('input[data-key="date"]').fill("2026-09-15");
  await expect(page.locator("#mil-check")).toContainText("1 incumplido(s)");
  await expect(page.locator("#mil-check")).toContainText("15 día(s) DESPUÉS");
  await page.waitForTimeout(1300);

  await page.goto("/Plan_Direccion.html");
  await expect(page.locator("#stateView")).toContainText("P25");
  await expect(page.locator("#stateView")).toContainText("incumplen su restricción contra el CPM");
});
