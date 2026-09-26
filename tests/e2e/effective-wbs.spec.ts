// E2E en navegador real (auditoría, alta): con el caso DISTRIB+ armado con los botones reales, la EDT que ven WBS Builder, el Panel y el Acta es la
// EFECTIVA -- fechas del CPM con el calendario del caso (fin 2027-07-23) y costos de Estimar los Costos calibrados contra la EDT (7.100.000).
// Antes: WBS Builder fechaba la EDT con una red sin hitos (fin 2027-04-06), el Panel y el Acta leían las fechas manuales guardadas (2026-11-06)
// y el ejemplo de costos bajaba el costo base a 6.160.500.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("la EDT efectiva: WBS Builder, el Panel y el Acta ven el fin del CPM (2027-07-23) y el costo del caso (7.100.000)", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Schedule_Management_Plan.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Estimar_Costos.html", "#btnLoadSampleLive", "#modalOk");

  // el núcleo: el ejemplo manual de la EDT ya coincide con los tramos del CPM (misma fecha de fin); lo efectivo sale del CPM y del estimado
  const r = await page.evaluate(() => {
    const G = (window as any).GPI, ef = G.util.wbsRollup(G.util.effectiveWbs()), st = G.util.wbsRollup(G.getModule("wbs"));
    return { efEnd: ef.maxEnd, efCost: ef.cost, storedEnd: st.maxEnd, calendario: G.util.projectCalendar().holidays };
  });
  expect(r).toEqual({ efEnd: "2027-07-23", efCost: 7100000, storedEnd: "2027-07-23", calendario: ["2026-07-28", "2026-07-29", "2026-08-30"] });

  // WBS Builder: el paquete de cierre termina con el proyecto y su costo no cambió al cargar el estimado
  await page.goto("/WBS_Builder.html");
  await page.locator(".node", { hasText: "Acta de entrega y cierre" }).first().click();
  await expect(page.locator("#f_end")).toHaveValue("2027-07-23");
  await expect(page.locator("#f_cost")).toHaveValue("92000");

  // el Panel resume la misma EDT: costo de las hojas 7.100.000
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#dashGrid")).toContainText("7,100,000");

  // el Acta importa los hitos de fin de fase con las fechas del CPM, no las manuales
  await page.goto("/Project_Charter.html");
  await page.locator("#btnImportMilestones").click();
  await page.locator("#modalOk").click();
  const hitos = await page.locator("#tblMilestones tbody input[type=date]").evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value));
  expect(hitos).toContain("2027-07-23");
});
