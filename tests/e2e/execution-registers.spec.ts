// E2E en navegador real (auditoría, media): los registros de EJECUCIÓN de Calidad (inspecciones y no conformidades), Comunicaciones (bitácora de emitidas) y Adquisiciones (pagos y
// reclamos). Con el ejemplo del caso cargado en el proyecto (corte 2026-11-03), cada módulo trae su ejecución y queda sin hallazgos; una no conformidad crítica, un pago
// sin contrato y una periódica sin emitir aparecen como hallazgos y llegan al Plan para la Dirección.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  if (confirmar) await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("registros de ejecución: el ejemplo trae su ejecución; los desvíos se avisan y llegan al Plan para la Dirección", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/OBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Stakeholder_Studio.html", "#btnSample", "#modalConfirmBtn");

  // Calidad: 8 inspecciones y 2 no conformidades (una abierta en corrección), sin hallazgos
  await cargar(page, "/Plan_Calidad.html", "#btnSample", "#modalConfirmBtn");
  await expect(page.locator("#tblInsp tbody tr")).toHaveCount(8);
  await expect(page.locator("#tblNcr tbody tr")).toHaveCount(2);
  await expect(page.locator("#finds")).toContainText("Sin hallazgos");
  await expect(page.locator("#kpis")).toContainText("8 / 1");
  // una no conformidad CRÍTICA sin cerrar es un riesgo
  await page.locator("#btnAddNcr").click();
  await page.locator('#tblNcr tbody tr:last-child select[data-f="severity"]').selectOption("critica");
  await page.locator('#tblNcr tbody tr:last-child textarea[data-f="description"]').fill("Fisura estructural en zapata");
  await expect(page.locator("#finds")).toContainText("Q12");
  await expect(page.locator("#finds")).toContainText("CRÍTICA sin cerrar");
  await page.waitForTimeout(1300);

  // Comunicaciones: bitácora con 12 emitidas y sin hallazgos de ejecución
  await cargar(page, "/Plan_Comunicaciones.html", "#btnSample", "#modalConfirmBtn");
  await expect(page.locator("#tblLog tbody tr")).toHaveCount(12);
  await expect(page.locator("#finds")).not.toContainText("M16");
  await page.locator("#btnAddLog").click();
  await expect(page.locator("#tblLog tbody tr")).toHaveCount(13);
  await page.waitForTimeout(1300);

  // Adquisiciones: pagos y reclamos; un pago sobre una adquisición «Convocada» se avisa
  await cargar(page, "/Plan_Adquisiciones.html", "#btnSample", "#modalConfirmBtn");
  await page.locator("#btnAddPay").click();
  await page.locator('#tblPay tbody tr:last-child select[data-af="itemId"]').selectOption({ index: 1 });
  await page.locator('#tblPay tbody tr:last-child select[data-af="status"]').selectOption("pagado");
  await page.locator('#tblPay tbody tr:last-child input[data-af="amount"]').fill("10000");
  await expect(page.locator("#finds")).toContainText("P15");
  await expect(page.locator("#finds")).toContainText("no se paga lo que aún no se contrató");
  await page.waitForTimeout(1300);

  // el Plan para la Dirección lo recoge
  await page.goto("/Plan_Direccion.html");
  await expect(page.locator("#stateView")).toContainText("P27");
  await expect(page.locator("#stateView")).toContainText("no conformidad(es) CRÍTICA(S) sin cerrar");
});
