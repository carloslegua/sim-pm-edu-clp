// E2E en navegador real: la calidad de la EDT sobre el proyecto DISTRIB+ armado con los botones reales de EDT, Actividades y Cronograma.
// Lo que ningún smoke jsdom prueba de punta a punta:
//  1. El diccionario (descripción, criterio de aceptación, LOE) sobrevive a una recarga REAL y a las sincronizaciones con el Cronograma CPM y
//     Estimar los Costos (que reescriben la EDT del proyecto sin perder los campos nuevos).
//  2. El ejemplo tiene dos avisos legítimos: «Acabados y cerramientos» (4.4) dura 106 días porque sus tres actividades van en serie (S1) y
//     Estructuras metálicas concentra el costo (S2). Las fechas manuales del ejemplo independiente ya son las del CPM (auditoría M3), así que
//     los dos aparecen también sin cronograma.
//  3. Editar el diccionario y marcar LOE en el navegador se guarda en el proyecto y se lee de vuelta tras recargar.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};
// EDT guardada en el proyecto activo, leída directo de localStorage (lo que de verdad quedó en disco)
const edtGuardada = (page: Page) => page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem("gpi_db") as string), nodes = db.projects[db.activeId].modules.wbs.nodes as Record<string, any>;
  const by = (name: string) => Object.values(nodes).find((n: any) => n.name === name) as any;
  return { acabados: by("Acabados y cerramientos"), informes: by("Informes de seguimiento y control"), cimentaciones: by("Cimentaciones") };
});

test("calidad de la EDT sobre el proyecto real: el diccionario sobrevive a las sincronizaciones y se edita y guarda", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");

  // 1) EDT del ejemplo: diccionario completo y los dos avisos reales (S1 y S2); sobrevive a una recarga real
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await page.reload();
  await expect(page.locator("#qualityBox")).toContainText("Con avisos");
  await expect(page.locator("#qualityBox")).toContainText("18/18 paquetes");
  await expect(page.locator(".q-group")).toHaveCount(2);
  await expect(page.locator('.q-group[data-code="S2"]')).toContainText("Estructuras metálicas prefabricadas");
  await expect(page.locator('.q-group[data-code="S1"]')).toContainText("«Acabados y cerramientos» dura 106 d");
  await expect(page.locator("#canvas .node .q-flag")).toHaveCount(2);
  const sano = await edtGuardada(page);
  expect(sano.informes.loe).toBe(true);
  expect(sano.cimentaciones.acceptance).toMatch(/Cimentación conforme a planos/);

  // 2) actividades + cronograma: las fechas pasan a ser las del CPM y la EDT se reescribe; el diccionario sigue ahí
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");
  await page.goto("/WBS_Builder.html");
  await expect(page.locator("#qualityBox")).toContainText("18/18 paquetes");
  await expect(page.locator("#qualityBox")).toContainText("2 avisos");
  await expect(page.locator('.q-group[data-code="S1"]')).toContainText("«Acabados y cerramientos» dura 106 d");
  await expect(page.locator('.q-group[data-code="S1"] .q-item')).toHaveCount(1);                  // 1.3 (LOE) no aparece aunque dure lo que el proyecto
  await expect(page.locator("#canvas .node .q-flag")).toHaveCount(2);
  expect((await edtGuardada(page)).informes.loe).toBe(true);

  // 3) desde el hallazgo se llega al elemento; se completa su diccionario y se declara LOE: se guarda y sobrevive a otra recarga
  await page.locator('.q-group[data-code="S1"]').evaluate((e) => { (e as HTMLDetailsElement).open = true; });
  await page.locator('.q-group[data-code="S1"] .q-item').click();
  await expect(page.locator("#f_name")).toHaveValue("Acabados y cerramientos");
  await page.locator("#f_accept").fill("Acabados recibidos por el cliente sin observaciones.");
  await page.locator("#f_loe").check();
  await expect(page.locator(".q-group")).toHaveCount(1);                                          // S1 desaparece en vivo
  await expect(page.locator("#qualityBox")).toContainText("1 aviso");
  await page.waitForTimeout(1300);                                                                // guardado con debounce
  await page.reload();
  await expect(page.locator("#qualityBox")).toContainText("1 aviso");
  const guardada = await edtGuardada(page);
  expect(guardada.acabados.loe).toBe(true);
  expect(guardada.acabados.acceptance).toBe("Acabados recibidos por el cliente sin observaciones.");

  // vista de tabla = diccionario del proyecto
  await page.locator("#viewTableBtn").click();
  await expect(page.locator("#tableView")).toContainText("Criterio de aceptación");
  await expect(page.locator("#tableView .loe-tag")).toHaveCount(2);                              // 1.3 y ahora 4.4
});
