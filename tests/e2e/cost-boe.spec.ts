// E2E en navegador real: la Basis of Estimate (AACE RP 34R-05) de Costos sobre el proyecto DISTRIB+ armado con los botones reales de los otros módulos.
// Lo que ningún smoke jsdom prueba de punta a punta:
//  1. La BOE cita lo que viene DEL PROYECTO: el alcance del Enunciado del Alcance, el CAPEX del Acta de Constitución, el cronograma y la EDT.
//  2. Un proyecto nuevo arranca con la BOE en blanco (regla de oro) y lo que se escribe, junto con el estado de aprobación, sobrevive a una recarga REAL.
//  3. La conciliación con el CAPEX del Acta detecta un presupuesto que lo supera (B6) y se corrige al ajustar la reserva de gestión.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};
const campo = async (page: Page, sel: string, v: string) => { const l = page.locator(sel); await l.fill(v); await l.blur(); };

test("BOE (34R-05) sobre el proyecto real: cita el Acta, el Enunciado y el cronograma; arranca en blanco; se guarda y concilia con el CAPEX", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/Project_Charter.html", "#btnSample", "#modalOk");                         // el Acta escribe el CAPEX (USD 8,5 M) en los datos del proyecto
  await cargar(page, "/Enunciado_del_Alcance.html", "#btnSample", "#mOk");                       // el Enunciado escribe el alcance del producto y del trabajo
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");

  // 1) Costos del proyecto: BOE en blanco, con lo del proyecto citado
  await page.goto("/Cost-management.html");
  await page.locator('.tab[data-p="p2"]').click();
  await expect(page.locator("#boeForm .boe-sec")).toHaveCount(32);
  await expect(page.locator("#boeStatusSel")).toHaveValue("borrador");
  for (const id of ["#boeDate", "#boeAssum", "#boeExcl", "#boeProd", "#boe_purpose"]) await expect(page.locator(id)).toHaveValue("");   // nada del ejemplo precargado
  await expect(page.locator("#auto-3\\.1\\.3")).toContainText("Almacén logístico para DISTRIB+");         // alcance: del Enunciado del Alcance
  await expect(page.locator("#auto-3\\.6")).toContainText("273 d");                                        // planificación: del cronograma real
  await expect(page.locator("#auto-3\\.6")).toContainText("inicio 2026-07-06");
  await expect(page.locator("#auto-3\\.18")).toContainText("CAPEX de referencia: $ 8,500,000");           // conciliación: CAPEX del Acta
  await expect(page.locator("#auto-3\\.2\\.2")).toContainText("18 paquete(s) de trabajo con costo");      // codificación: la EDT real
  await expect(page.locator("#boeStatus")).toContainText("Estimado de clase 3");
  await expect(page.locator('#boeStatus [data-goto="3.1.1"]')).toBeVisible();                            // propósito: falta
  await expect(page.locator('#boeStatus [data-goto="3.1.3"]')).toHaveCount(0);                            // alcance: respaldado por el Enunciado

  // 2) se escribe la BOE y el estado de aprobación; sobrevive a una recarga real
  await page.locator("#boeOpenAll").click();                                                            // los grupos parten plegados: se abren todos
  await campo(page, "#boe_purpose", "Sustentar el presupuesto de autorización del Almacén Lurín.");
  await campo(page, "#boeDate", "2026-07-01");
  await campo(page, "#boeSource", "Cotizaciones vigentes de los Proveedores A, B y C.");
  await campo(page, "#boeAssum", "Diseño al 30 % de madurez. Terreno saneado y disponible.");
  await campo(page, "#boeExcl", "IGV, costos financieros y equipamiento logístico interno.");
  await page.locator("#boeStatusSel").selectOption("revision");
  await campo(page, "#boeReviewed", "Jefe de Ingeniería");
  await page.locator('#boeList-team button[onclick*="boeListAdd"]').click();
  await page.locator('#boeList-team input[data-f="name"]').fill("Director de Proyecto (PM)");
  await page.locator('#boeList-team input[data-f="name"]').blur();
  await expect(page.locator('#boeStatus [data-goto="3.1.1"]')).toHaveCount(0);
  await expect(page.locator('#boeStatus [data-goto="3.21"]')).toHaveCount(0);
  await page.waitForTimeout(1300);
  await page.reload();
  await page.locator('.tab[data-p="p2"]').click();
  await expect(page.locator("#boe_purpose")).toHaveValue("Sustentar el presupuesto de autorización del Almacén Lurín.");
  await expect(page.locator("#boeDate")).toHaveValue("2026-07-01");
  await expect(page.locator("#boeStatusSel")).toHaveValue("revision");
  await expect(page.locator("#boeReviewed")).toHaveValue("Jefe de Ingeniería");
  await expect(page.locator('#boeList-team input[data-f="name"]')).toHaveValue("Director de Proyecto (PM)");
  const estado = await page.evaluate(() => { const db = JSON.parse(localStorage.getItem("gpi_db") as string), b = db.projects[db.activeId].modules.cost.estimate.boe; return { date: b.date, source: b.source, assumptions: b.assumptions, status: b.status, purpose: b.purpose }; });
  expect(estado).toMatchObject({ date: "2026-07-01", status: "revision" }); expect(estado.assumptions).toContain("Diseño al 30 %");

  // 3) conciliación con el CAPEX del Acta: con una reserva de gestión del 20 % el total supera USD 8,5 M (B6); con 5 % queda dentro
  await page.locator('.tab[data-p="p3"]').click();
  await page.locator("#pullWbs3").click();
  await expect(page.locator("#baseCost")).toHaveValue("7100000");
  await campo(page, "#mgmtPct", "20");
  await page.locator('.tab[data-p="p2"]').click();
  await expect(page.locator("#boeStatus")).toContainText("supera el CAPEX del Acta");
  await page.locator('.tab[data-p="p3"]').click();
  await campo(page, "#mgmtPct", "5");
  await page.locator('.tab[data-p="p2"]').click();
  await expect(page.locator("#boeStatus")).not.toContainText("supera el CAPEX del Acta");

  // aprobar con secciones exigidas sin completar es un riesgo (B1); el documento recoge la BOE en el orden de 34R-05
  await page.locator("#boeStatusSel").selectOption("aprobada");
  await expect(page.locator("#boeStatus")).toContainText("«Aprobada» pero le faltan");
  await page.locator('.tab[data-p="p5"]').click();
  await expect(page.locator("#doc")).toContainText("Basis of Estimate (AACE RP 34R-05)");
  await expect(page.locator("#doc")).toContainText("3.1.1 Propósito");
  await expect(page.locator("#doc")).toContainText("Sustentar el presupuesto de autorización");
});
