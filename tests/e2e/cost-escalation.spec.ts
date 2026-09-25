// E2E en navegador real: la escalación por índices (AACE 58R-10 / 68R-11) sobre el proyecto DISTRIB+ armado con los botones reales de EDT,
// Actividades y Cronograma/CPM. Lo que ningún smoke jsdom prueba de punta a punta:
//  1. Con un proyecto en blanco Costos arranca por índices SIN datos de ejemplo y dice qué falta (fecha base, pronósticos).
//  2. El costo y las fechas REALES del proyecto dan la misma distribución del gasto en el tiempo que el ejemplo independiente: la fecha media
//     ponderada del gasto (2026-12-21) y el costo base por año (3.955.385 en 2026 · 3.144.615 en 2027) son una huella de los 18 paquetes
//     con el calendario del caso (el del Plan del Cronograma, que se carga también).
//  3. Lo que el alumno ingresa (fecha base, pronósticos, composición, fijación de precio) se guarda y sobrevive a una recarga REAL.
//  4. La simulación usa el retraso del análisis integrado de riesgo cuando el proyecto tiene Registro de Riesgos.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};
const txt = async (page: Page, sel: string) => (await page.locator(sel).innerText()).replace(/\s+/g, " ").trim();
const rate = (page: Page, acc: string, y: string) => page.locator(`[data-e="rate"][data-acc="${acc}"][data-year="${y}"]`);
const escribir = async (page: Page, sel: string, v: string) => { const l = page.locator(sel); await l.fill(v); await l.blur(); };

test("escalación por índices sobre el proyecto real: mismo gasto en el tiempo que el ejemplo, se guarda y usa el retraso del riesgo", async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Schedule_Management_Plan.html", "#btnSample", "#modalConfirmBtn");   // el calendario del caso (lunes a viernes, feriados)

  // 1) Costos del proyecto: en blanco, por índices, sin nada del ejemplo
  await page.goto("/Cost-management.html");
  await expect(page.locator("#escMethod")).toHaveValue("indices");
  await expect(page.locator("#kEsc")).toHaveText("$ 0");
  await page.locator('.tab[data-p="p3"]').click();
  await expect(page.locator("#escSummary")).toContainText("Sin escalación todavía");
  await expect(page.locator("#escInputs")).not.toContainText("ILUSTRATIV");
  await page.locator("#pullWbs3").click();                                   // ↧ Traer de la EDT: costo base 7.100.000
  await expect(page.locator("#baseCost")).toHaveValue("7100000");

  // 2) fecha base de precios (Basis of Estimate) y pronóstico por cuenta
  await page.locator('.tab[data-p="p2"]').click();
  await page.locator("#boeOpenAll").click();                                 // los grupos de la BOE parten plegados: la fecha base está en 3.5
  await page.locator("#boeDate").fill("2026-07-01"); await page.locator("#boeDate").blur();
  await page.locator('.tab[data-p="p3"]').click();
  await expect(page.locator("#escInputs")).toContainText("Fecha base de precios: 2026-07-01");
  await expect(page.locator("#escInputs")).toContainText("18 paquete(s)");
  for (const [acc, r26, r27] of [["labor", "4", "4.5"], ["material", "3", "3.5"], ["equipment", "2.5", "3"], ["subcontract", "3.5", "4"]]) {
    await escribir(page, `[data-e="rate"][data-acc="${acc}"][data-year="2026"]`, r26);
    await escribir(page, `[data-e="rate"][data-acc="${acc}"][data-year="2027"]`, r27);
    await escribir(page, `[data-e="src"][data-acc="${acc}"]`, "Pronóstico de prueba (economista)");
  }
  await page.locator('[data-e="prov"]').selectOption("central");
  const kEsc = await txt(page, "#kEsc");
  expect(Number(kEsc.replace(/[^0-9]/g, ""))).toBeGreaterThan(80000);
  expect(Number(kEsc.replace(/[^0-9]/g, ""))).toBeLessThan(200000);           // ≈ 1,5–2 % de 7,1 M con mezcla 35/35/15/15

  // el gasto en el tiempo es EL MISMO que el del ejemplo independiente (huella: fecha media y costo base por año)
  const res = await txt(page, "#escResults");
  expect(res).toContain("fecha media del gasto 2026-12-21");
  expect(res).toMatch(/2026\s*\$ 3,955,385/); expect(res).toMatch(/2027\s*\$ 3,144,615/);
  const limpio = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  const solo = await limpio.newPage();
  await solo.goto("/Cost-management.html");
  await solo.locator('.tab[data-p="p3"]').click();
  const resSolo = await txt(solo, "#escResults");
  expect(resSolo).toContain("fecha media del gasto 2026-12-21");
  expect(resSolo).toMatch(/2026\s*\$ 3,955,385/); expect(resSolo).toMatch(/2027\s*\$ 3,144,615/);
  await expect(solo.locator("#kEsc")).toHaveText("$ 129,108");                // el ejemplo: P70 con el retraso del cronograma
  await limpio.close();

  // sin Registro de Riesgos no hay retraso que simular; se dice
  expect(res).toContain("La simulación no incluye el retraso del cronograma");

  // 3) se guarda y sobrevive a una recarga real
  await page.waitForTimeout(1300);
  await page.reload();
  await page.locator('.tab[data-p="p3"]').click();
  await expect(page.locator("#kEsc")).toHaveText(kEsc);
  await expect(rate(page, "material", "2027")).toHaveValue("3.5");
  await expect(page.locator('[data-e="src"][data-acc="labor"]')).toHaveValue("Pronóstico de prueba (economista)");

  // fijar el precio de un paquete recorta su escalación (y se guarda con el proyecto)
  await page.locator("#escInputs details.esc-det summary").click();
  const filas = page.locator('#escInputs details.esc-det tbody tr');
  await expect(filas).toHaveCount(18);
  await filas.filter({ hasText: "Estructuras metálicas" }).locator('[data-e="lock"]').fill("2026-07-15");
  await filas.filter({ hasText: "Estructuras metálicas" }).locator('[data-e="lock"]').blur();
  const conLock = Number((await txt(page, "#kEsc")).replace(/[^0-9]/g, ""));
  expect(conLock).toBeLessThan(Number(kEsc.replace(/[^0-9]/g, "")));

  // 4) con el Registro de Riesgos del proyecto (ejemplo cargado con su botón) la simulación usa el retraso del análisis integrado
  await page.waitForTimeout(1300);
  await cargar(page, "/Risk_Register.html", "#btnSample", "#modalConfirmBtn");
  await page.goto("/Cost-management.html");
  await page.locator('.tab[data-p="p3"]').click();
  await expect(page.locator("#escResults")).toContainText("con el retraso del cronograma del análisis integrado de riesgo");
  await expect(page.locator("#escResults")).toContainText("Alza del precio del acero");      // X14: el riesgo de precio del registro podría solaparse

  // el documento de la BOE recoge la base de la escalación
  await page.locator('.tab[data-p="p5"]').click();
  await expect(page.locator("#doc")).toContainText("Base de la escalación — por índices (AACE RP 58R-10 y 68R-11)");
  await expect(page.locator("#doc")).toContainText("Precio fijado");
});
