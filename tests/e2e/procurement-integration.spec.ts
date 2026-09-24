// E2E en navegador real: el Plan de Adquisiciones sobre el proyecto con la EDT, el OBS y el Registro de Riesgos REALES (cargados con los botones de
// sus módulos) arranca en blanco, enlaza el ejemplo por código EDT y por código de riesgo (5 adquisiciones, valor = costo de la EDT, riesgos altos
// citados, sin hallazgos), avisa cuando la fecha de corte deja vencida una convocatoria, guarda y sobrevive a una recarga; el Panel lo abre.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("Adquisiciones sobre la EDT, el OBS y los riesgos reales: en blanco, ejemplo enlazado sin hallazgos, fecha de corte, persiste; el Panel lo abre", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/OBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Risk_Register.html", "#btnSample", "#modalConfirmBtn");

  // en blanco
  await page.goto("/Plan_Adquisiciones.html");
  await expect(page.locator("#mainArea")).toContainText("Aún no hay adquisiciones");
  await expect(page.locator("details.pr")).toHaveCount(0);

  // «Cargar ejemplo»: se enlaza por código con los paquetes y los riesgos reales; el valor coincide con la EDT y no quedan hallazgos
  await page.locator("#btnSample").click();
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("details.pr")).toHaveCount(5);
  await expect(page.locator("#kpis")).toContainText("5");
  await expect(page.locator("#finds")).toContainText("Sin hallazgos");
  await expect(page.locator("#statusLeft")).not.toContainText("no encontraron sus paquetes");
  await page.waitForTimeout(1300);

  // la fecha de corte manda: pasada la fecha límite de PR-02 sin convocarla, es un riesgo
  await page.locator("#asOf").fill("2026-10-01");
  await expect(page.locator("#finds")).toContainText("PR-02");
  await expect(page.locator("#finds")).toContainText("debió lanzarse el 2026-09-13");
  await expect(page.locator("#kpis")).toContainText("Con riesgos");
  await page.waitForTimeout(1300);

  // recargar conserva lo guardado en el proyecto, incluida la fecha de corte
  await page.reload();
  await expect(page.locator("details.pr")).toHaveCount(5);
  await expect(page.locator("#asOf")).toHaveValue("2026-10-01");

  // el Panel de Control abre el módulo desde su tarjeta
  await page.goto("/Panel_Control.html");
  await expect(page.locator('a.mod-card[href="Plan_Adquisiciones.html"], .mod-card.active:has-text("Gestión de las Adquisiciones")').first()).toBeVisible();
});
