// E2E en navegador real: el riesgo de PLAZO usa la red REAL del proyecto (la que arman los módulos de EDT, Actividades
// y Cronograma/CPM), no una copia. Lo que ningún smoke jsdom puede probar de punta a punta:
//  1. El proyecto DISTRIB+ se arma con los botones reales «Cargar ejemplo» de WBS Builder, Definir las Actividades y
//     Cronograma/CPM; la red que GPI.util.activeScheduleNetwork() lee de ese proyecto da lo mismo que Cronograma
//     (273 días laborables, 34 nodos críticos, fin 2027-07-23).
//  2. Esa red es idéntica a la del ejemplo COMPARTIDO de los modos independientes (shared/schedule-sample.ts): el Registro de
//     Riesgos da el mismo P80 con el proyecto real que en modo independiente (mismos eventos, misma red, misma semilla).
//  3. Costos, sobre el mismo proyecto, muestra ese mismo plazo (misma simulación).
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);                       // guardado con debounce / al salir de la página
};
const p80 = (t: string) => { const m = t.replace(/\s+/g, " ").match(/P80\s*(\d+(?:\.\d+)?) d\s*(\d+(?:\.\d+)?) d\s*(\d{4}-\d{2}-\d{2})/); return m ? { dur: Number(m[1]), reserva: Number(m[2]), fin: m[3] } : null; };

test("Riesgos y Costos usan la red REAL del proyecto: coincide con Cronograma/CPM y con el ejemplo independiente", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/Panel_Control.html");                                        // crea y activa el proyecto DISTRIB+
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");

  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");            // EDT: 18 paquetes
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");    // 43 actividades y 3 hitos
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");         // los enlaces
  await cargar(page, "/Schedule_Management_Plan.html", "#btnSample", "#modalConfirmBtn");   // el calendario del caso (el mismo del modo independiente)

  // 1) la red del proyecto, leída por el núcleo, es la de Cronograma/CPM
  await page.goto("/Risk_Register.html");
  const red = await page.evaluate(() => {
    const G = (window as any).GPI, net = G.util.activeScheduleNetwork();
    const r = G.util.cpm(net.nodes.map((n: any) => ({ id: n.id, dur: n.dur })), net.links, net.calendar, { startDate: net.startDate });
    const st = G.util.scheduleStats();
    return { nodos: net.nodes.length, enlaces: net.links.length, sinDur: net.nodes.filter((n: any) => !n.hasDur).length, dur: r.projectDuration, criticos: r.criticalIds.length, fin: r.projectFinishDate, panelDur: st.projectDuration, panelCriticas: st.criticalCount, panelFin: st.finishDate };
  });
  expect(red).toEqual({ nodos: 46, enlaces: 51, sinDur: 0, dur: 273, criticos: 34, fin: "2027-07-23",
    // el indicador del Panel (scheduleStats) lee la MISMA red: antes ignoraba los hitos y daba 195 d / 22 críticas / 2027-04-02
    panelDur: 273, panelCriticas: 34, panelFin: "2027-07-23" });

  // 2) el Registro de Riesgos del proyecto REAL (ejemplo cargado con su botón) y el modo independiente dan el mismo plazo
  await page.locator("#btnSample").click(); await page.locator("#modalConfirmBtn").click();
  await page.locator('[data-view="registro"]').click();
  await page.locator("tr.rk-row", { hasText: "R-01" }).click();
  await expect(page.locator(".calc").first()).toContainText("2.4.1");                      // el trámite de licencia, actividad crítica del proyecto real
  await expect(page.locator(".calc").first()).toContainText("crítica");
  await page.locator('[data-view="analisis"]').click();
  await expect(page.locator("#mainArea")).toContainText("base 273 d, fin 2027-07-23");
  const real = p80(await page.locator("#mainArea").innerText());
  expect(real).not.toBeNull();
  expect(real!.dur).toBeGreaterThan(273);
  await page.waitForTimeout(1300);

  const limpio = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });          // sin proyecto: modo independiente
  const solo = await limpio.newPage();
  await solo.goto("/Risk_Register.html");
  await solo.locator('[data-view="analisis"]').click();
  await expect(solo.locator("#mainArea")).toContainText("base 273 d, fin 2027-07-23");
  expect(p80(await solo.locator("#mainArea").innerText())).toEqual(real);                  // idéntico: misma red, mismos eventos, misma semilla
  await limpio.close();

  // 3) Costos, sobre el mismo proyecto, muestra el mismo plazo
  await page.goto("/Cost-management.html");
  await page.locator('.tab[data-p="p3"]').click();                                          // «Presupuesto»: ahí está el método de contingencia
  await page.locator("#contMethod").selectOption("rangos_mc");
  await expect(page.locator("#rngEvents")).toContainText("Plazo con los riesgos");
  const enCostos = p80(await page.locator("#rngEvents").innerText());
  expect(enCostos).toEqual(real);
});
