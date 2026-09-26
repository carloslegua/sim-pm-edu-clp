// E2E en navegador real (auditoría, media): simulación integrada de plazo en Costos. Con el caso DISTRIB+ y ternas PERT en las actividades, activar «Sortear también las
// duraciones PERT en la misma iteración» corre el CPM 10.000 veces con eventos de riesgo Y duraciones Beta-PERT a la vez: tarda lo razonable, el P80 del plazo sube
// (la variabilidad de las duraciones se suma a la de los eventos), se guarda y sobrevive a una recarga. Por omisión está apagado y el plazo es el de siempre.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};
const p80 = (t: string) => { const m = t.replace(/\s+/g, " ").match(/P80\s*(\d+(?:\.\d+)?) d\s*(\d+(?:\.\d+)?) d\s*(\d{4}-\d{2}-\d{2})/); return m ? Number(m[1]) : null; };

test("Costos: el sorteo integrado de duraciones PERT es opcional, sube el plazo P80, es rápido y se guarda", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Schedule_Management_Plan.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Risk_Register.html", "#btnSample", "#modalConfirmBtn");

  // ternas PERT (optimista 70 %, pesimista 160 % de la duración) en todas las actividades con duración: lo que Análisis PERT guardaría
  await page.goto("/Cost-management.html");
  const n = await page.evaluate(() => {
    const G = (window as any).GPI, net = G.util.activeScheduleNetwork(), byActivity: Record<string, any> = {};
    net.nodes.filter((x: any) => !x.isMilestone && x.dur > 0).forEach((x: any) => { byActivity[x.id] = { o: String(Math.max(1, Math.floor(x.dur * 0.7))), p: String(Math.ceil(x.dur * 1.6)), mAuto: true }; });
    G.setModule("pert", { inputMode: "dias", byActivity });
    return Object.keys(byActivity).length;
  });
  expect(n).toBeGreaterThan(30);
  await page.goto("/Cost-management.html");
  await page.locator('.tab[data-p="p3"]').click();
  await page.locator("#contMethod").selectOption("rangos_mc");
  await expect(page.locator("#rngEvents")).toContainText("Plazo con los riesgos");
  await expect(page.locator("#rngPertNote")).toContainText("actividad(es) con terna PERT válida");
  await expect(page.locator("#rngPert")).not.toBeChecked();
  const sin = p80(await page.locator("#rngEvents").innerText());
  expect(sin).not.toBeNull();

  const t0 = Date.now();
  await page.locator("#rngPert").check();
  await expect(page.locator("#rngEvents")).toContainText("en la misma iteración");
  const seg = (Date.now() - t0) / 1000;
  expect(seg).toBeLessThan(25);
  const con = p80(await page.locator("#rngEvents").innerText());
  expect(con!).toBeGreaterThan(sin!);

  // se guarda y sobrevive a la recarga
  await page.waitForTimeout(1500);
  await page.reload();
  await page.locator('.tab[data-p="p3"]').click();
  await expect(page.locator("#rngPert")).toBeChecked();
  await expect(page.locator("#rngEvents")).toContainText("en la misma iteración");
});
