// E2E en navegador real (auditoría, media): «Cargar ejemplo en el proyecto» de Análisis PERT, Matriz RACI y Costos. Sobre el proyecto DISTRIB+ armado con los botones reales,
// cada uno escribe el ejemplo del caso atado a los paquetes, actividades y puestos REALES (por Código EDT y nombre), y lo cargado es coherente con el resto del caso.
import { test, expect, type Page } from "@playwright/test";

const cargar = async (page: Page, url: string, boton: string, confirmar: string) => {
  await page.goto(url);
  await page.locator(boton).click();
  if (confirmar) await page.locator(confirmar).click();
  await page.waitForTimeout(1300);
};

test("PERT, RACI y Costos: el ejemplo del caso se carga en el proyecto y es coherente", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await cargar(page, "/WBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/OBS_Builder.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Activity_Definition.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Cronograma_CPM.html", "#btnLoadSampleLive", "#modalOk");
  await cargar(page, "/Schedule_Management_Plan.html", "#btnSample", "#modalConfirmBtn");
  await cargar(page, "/Risk_Register.html", "#btnSample", "#modalConfirmBtn");

  // PERT: 43 ternas válidas, M automática
  await cargar(page, "/Pert_Analysis.html", "#btnLoadSampleLive", "#modalOk");
  const pert = await page.evaluate(() => { const G = (window as any).GPI, s = G.util.pertStats(G.getModule("pert"), G.getModule("activities"), G.getModule("wbs")); return { total: s.total, complete: s.complete, invalid: s.invalid }; });
  expect(pert).toEqual({ total: 43, complete: 43, invalid: 0 });

  // RACI: 18 paquetes con R y A; el «Responsable» de la EDT sale de la matriz
  await cargar(page, "/RACI_Matrix.html", "#btnLoadSampleLive", "#modalConfirmBtn");
  const raci = await page.evaluate(() => {
    const G = (window as any).GPI, cov = G.util.raciCoverage(G.getModule("raci"), G.getModule("wbs")), wbs = G.util.effectiveWbs();
    const leaf = G.util.wbsLeaves(wbs).find((l: any) => l.code === "4.1");
    return { total: cov.total, withR: cov.withR, sinA: cov.withoutA.length, resp41: wbs.nodes[leaf.id].resource };
  });
  expect(raci).toMatchObject({ total: 18, withR: 18, sinA: 0 });
  expect(raci.resp41).toContain("Cuadrilla A");

  // Costos: órdenes de cambio atadas a los paquetes reales, rangos, escalación y BOE
  await page.goto("/Cost-management.html");
  await page.locator("#btnLoadSampleCost").click();
  await page.waitForTimeout(1500);
  const cost = await page.evaluate(() => {
    const G = (window as any).GPI, c = G.getModule("cost"), s = G.util.costSummary(c), leaves = G.util.wbsLeaves(G.util.effectiveWbs());
    const idOf = (code: string) => leaves.find((l: any) => l.code === code)!.id;
    return {
      ordenes: c.changeOrders.length, atadas: c.changeOrders.map((o: any) => o.wbsId === idOf(o.wbsCode)), vinculada: c.changeOrders[0].riskId || "", rangos: c.budget.rangeAnalysis.lines.length,
      boe: c.estimate.boe.status, esc: c.budget.escalation.method, base: s.baseCost, bac: Math.round(s.bac), total: Math.round(s.total)
    };
  });
  // las cifras del caso (ARCHITECTURE.md, «Dataset de referencia»): BAC 8.081.108 y total 8.485.163, las mismas que el ejemplo independiente
  expect({ bac: cost.bac, total: cost.total }).toEqual({ bac: 8081108, total: 8485163 });
  expect(cost.ordenes).toBe(3); expect(cost.atadas).toEqual([true, true, true]); expect(cost.vinculada).not.toBe("");   // OC-001 quedó vinculada al riesgo R-03 del Registro
  expect(cost.rangos).toBe(5); expect(cost.boe).toBe("aprobada"); expect(cost.esc).toBe("indices"); expect(cost.base).toBe(7100000);
});
