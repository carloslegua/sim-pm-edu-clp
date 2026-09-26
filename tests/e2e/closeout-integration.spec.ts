// E2E en navegador real: Validar el Alcance, Gestión del Conocimiento y Cierre del Proyecto sobre el proyecto DISTRIB+ armado con los botones reales. Cada módulo lee el
// resto del proyecto (Enunciado del Alcance, EDT, Plan de Calidad, Registro de Riesgos, Adquisiciones, Control de Cambios, Costos) y el Cierre las junta: con el caso al corte
// (2026-11-03) el cierre está PREPARADO pero hoy no se puede cerrar, y las cifras coinciden con los demás ejemplos.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  if (confirmar) await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("cierre del proyecto: las comprobaciones leen Alcance, Calidad, Adquisiciones, Conocimiento, Cambios y Costos del caso", async ({ page }) => {
  test.setTimeout(240000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/Enunciado_del_Alcance.html", "#btnSample", "#mOk");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/OBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Risk_Register.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Plan_Calidad.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Plan_Adquisiciones.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Control_Cambios.html", "#btnSample", "#modalConfirmBtn");

  // Validar el Alcance: los seis entregables del Enunciado, uno aceptado con observaciones, sin hallazgos
  await cargar(page, "/Validar_Alcance.html", "#btnSample", "#modalConfirmBtn");
  await expect(page.locator("#tblVal tbody tr")).toHaveCount(6);
  await expect(page.locator("#kpis")).toContainText("1/6");
  await expect(page.locator("#finds")).toContainText("Sin hallazgos");
  await expect(page.locator("#statusLeft")).not.toContainText("no encontraron su entregable");

  // Gestión del Conocimiento: ocho lecciones; R-03 (materializado) tiene la suya
  await cargar(page, "/Gestion_Conocimiento.html", "#btnSample", "#modalConfirmBtn");
  await expect(page.locator("#tblLessons tbody tr")).toHaveCount(8);
  await expect(page.locator("#finds")).toContainText("Sin hallazgos");

  // Cierre: preparado, no declarado; lo que impide cerrar sale de las demás herramientas
  await cargar(page, "/Cierre_Proyecto.html", "#btnSample", "#modalConfirmBtn");
  await expect(page.locator("#tblItems tbody tr")).toHaveCount(7);
  const c = page.locator("#checks");
  await expect(c).toContainText("1 de 6 entregables aceptados");
  await expect(c).toContainText("1 abierta(s)");                                   // NC-01 de las estructuras metálicas (Calidad)
  await expect(c).toContainText("5 adquisición(es) sin entregar");
  await expect(c).toContainText("0 de 8 transferidas");
  await expect(c).toContainText("3 pendiente(s) o aprobada(s) sin implementar");   // CR-001…003
  await expect(page.locator("#finds")).toContainText("C7");

  // declarar el cierre con todo eso pendiente es un riesgo
  await page.locator("#closed").check();
  await expect(page.locator("#finds")).toContainText("Se declaró el cierre con");
  await expect(page.locator("#kpis")).toContainText("Con riesgos");
});
