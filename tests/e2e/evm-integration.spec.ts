// E2E en navegador real: el Valor Ganado sobre el proyecto DISTRIB+ COMPLETO (EDT, actividades, cronograma y línea base armados con los
// botones reales de los otros módulos) da EXACTAMENTE las mismas cifras que el ejemplo independiente: la misma red, los mismos costos por
// paquete y la línea base del cronograma como fuente del PV. Y el Panel de Control lo abre desde su tarjeta.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};
const cifras = async (page: Page) => {
  const t = (await page.locator("#evTop").innerText()).replace(/\s+/g, " ");   // innerText aplica el text-transform de las etiquetas (mayúsculas)
  const g = (re: RegExp) => { const m = t.match(re); return m ? m[1] : "—"; };            // en blanco no hay CPI ni SPI
  return { bac: g(/BAC del trabajo\s*[^\d]*([\d,]+)/i), pv: g(/PV — planificado\s*[^\d]*([\d,]+)/i), ev: g(/EV — ganado\s*[^\d]*([\d,]+)/i), ac: g(/AC — costo real\s*[^\d]*([\d,]+)/i), cpi: g(/CPI\s*([\d.]+)/i), spi: g(/SPI\s*([\d.]+)/i) };
};

test("Valor Ganado sobre el proyecto real (con línea base) = ejemplo independiente; el Panel abre el módulo", async ({ page, browser }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Schedule_Management_Plan.html", "#btnSample", "#modalConfirmBtn");   // el calendario del caso: el corte 2026-11-03 es el día 85

  // línea base del cronograma (LB-1): de ella sale el PV
  await page.goto("/Cronograma_CPM.html");
  await page.locator('[data-view="control"]').click();
  await page.locator("#btnBaseline").click();
  await page.locator("#blApprover").fill("Sponsor (Gerencia General)");
  await page.locator("#blOk").click();
  await expect(page.locator("#ctlWrap")).toContainText("Línea base del cronograma · LB-1");
  await page.waitForTimeout(1300);

  // EVM del proyecto: en blanco, con la línea base, y BAC = el costo de los paquetes de la EDT
  await page.goto("/Valor_Ganado.html");
  await expect(page.locator("tr.evrow")).toHaveCount(18);
  await expect(page.locator("#evTop")).toContainText("línea base LB-1");
  expect((await cifras(page)).bac).toBe("7,100,000");
  expect((await cifras(page)).ev).toBe("0");                                        // nada reportado: el proyecto arranca en blanco
  await page.locator("#btnSample").click();
  await page.locator("#modalConfirmBtn").click();
  const real = await cifras(page);
  expect(real).toMatchObject({ bac: "7,100,000", pv: "3,439,533", ev: "3,182,500", ac: "3,253,500", cpi: "0.98", spi: "0.93" });
  await page.waitForTimeout(1300);

  // LA REFERENCIA ESTÁ CONGELADA (auditoría, alta): duplicar el costo de los paquetes o mover la fecha de inicio NO cambia el BAC, el PV ni el CPI
  // mientras no exista otra versión de la línea base; el módulo avisa que lo editable ya difiere de lo aprobado.
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("gpi_db") as string), p = db.projects[db.activeId], nodes = p.modules.wbs.nodes;
    Object.keys(nodes).forEach((k) => { if (nodes[k].cost) nodes[k].cost = Number(nodes[k].cost) * 2; });
    p.meta.startDate = "2027-01-04";
    localStorage.setItem("gpi_db", JSON.stringify(db));
  });
  await page.goto("/Valor_Ganado.html");
  expect(await cifras(page)).toEqual(real);                                          // mismo BAC, PV, EV, AC y CPI que antes de editar
  await expect(page.locator("#evTop")).toContainText("línea base LB-1 congelada");
  await expect(page.locator("#evTop")).toContainText(/Después de fijar la línea base LB-1 cambió\(aron\): el presupuesto por paquete/);
  await expect(page.locator("#evTop")).toContainText("la fecha de inicio (2027-01-04 frente a 2026-07-06 en la línea base)");
  // solo una NUEVA versión aprobada actualiza la referencia
  await page.goto("/Cronograma_CPM.html");
  await page.locator('[data-view="control"]').click();
  await page.locator("#btnBaseline").click();
  await page.locator("#blReason").fill("Orden de cambio aprobada: reestimación del presupuesto");
  await page.locator("#blApprover").fill("Sponsor (Gerencia General)");
  await page.locator("#blOk").click();
  await expect(page.locator("#ctlWrap")).toContainText("Línea base del cronograma · LB-2");
  await page.waitForTimeout(1300);
  await page.goto("/Valor_Ganado.html");
  expect((await cifras(page)).bac).toBe("14,200,000");                               // ahora sí: el presupuesto aprobado en LB-2
  await expect(page.locator("#evTop")).not.toContainText("Después de fijar la línea base");
  await page.evaluate(() => {                                                          // se restauran los datos para lo que sigue
    const db = JSON.parse(localStorage.getItem("gpi_db") as string), p = db.projects[db.activeId], nodes = p.modules.wbs.nodes;
    Object.keys(nodes).forEach((k) => { if (nodes[k].cost) nodes[k].cost = Number(nodes[k].cost) / 2; });
    p.meta.startDate = "2026-07-06"; p.modules.schedule.baseline = null; localStorage.setItem("gpi_db", JSON.stringify(db));
  });

  // el ejemplo independiente (sin proyecto) da lo mismo
  const limpio = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  const solo = await limpio.newPage();
  await solo.goto("/Valor_Ganado.html");
  expect(await cifras(solo)).toEqual(real);
  await limpio.close();

  // el Panel de Control abre el módulo desde su tarjeta
  await page.goto("/Panel_Control.html");
  await expect(page.locator('a.mod-card[href="Valor_Ganado.html"], .mod-card.active:has-text("Valor Ganado")').first()).toBeVisible();
});
