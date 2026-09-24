// E2E en navegador real (auditoría, media): la línea base del alcance incluye la EDT y su diccionario. Se congela con la EDT real de WBS Builder, se
// modifica después un paquete en SU pantalla (trabajo en edición) y el Enunciado muestra la diferencia frente a lo aprobado sin tocar la instantánea;
// solo una nueva versión (con aprobador y motivo) actualiza la referencia y archiva la anterior.
import { test, expect } from "@playwright/test";

test("línea base del alcance con EDT y diccionario: editar un paquete después no cambia lo aprobado; nueva versión archiva la anterior", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#projSelect option")).toContainText("DISTRIB+ S.A.");
  await page.goto("/WBS_Builder.html"); await page.locator("#btnSample").click(); await page.locator("#modalConfirmBtn").click(); await page.waitForTimeout(1300);
  await page.goto("/Enunciado_del_Alcance.html"); await page.locator("#btnSample").click();
  await page.locator("#mOk").click(); await page.waitForTimeout(1300);

  await page.locator('.tab[data-tab="coh"]').click();
  // congelar: la instantánea trae la EDT con su diccionario (18 paquetes + fases), sin costos ni fechas
  await page.locator("#b_appr").fill("Sponsor (Gerencia General)");
  await page.locator("#btnFreeze").click();
  await expect(page.locator("#baselineState")).toContainText("Congelada v1.0");
  await expect(page.locator("#baselineHost")).toContainText("elemento(s) de la EDT con su diccionario");
  await expect(page.locator("#baselineHost")).toContainText("coinciden con lo aprobado en la v1.0");
  await page.waitForTimeout(1300);
  const snap = await page.evaluate(() => { const db = JSON.parse(localStorage.getItem("gpi_db") as string), b = db.projects[db.activeId].modules.scopeStatement.baseline; return { n: Object.keys(b.snapshot.wbs.nodes).length, txt: JSON.stringify(b.snapshot.wbs) }; });
  expect(snap.n).toBeGreaterThan(20); expect(snap.txt).toMatch(/Informe geotécnico firmado/); expect(snap.txt).not.toMatch(/"cost"|"start"|"percent"/);

  // el alumno modifica la EDT en SU módulo (trabajo en edición)
  await page.goto("/WBS_Builder.html");
  await page.locator(".node", { hasText: "Estudio de suelos" }).first().click();
  await page.locator("#f_name").fill("Estudio geotécnico ampliado");
  await page.waitForTimeout(1500);

  // el Enunciado lo muestra como cambio sin aprobar; lo aprobado sigue siendo la instantánea
  await page.goto("/Enunciado_del_Alcance.html"); await page.locator('.tab[data-tab="coh"]').click();
  await expect(page.locator("#baselineState")).toContainText("1 cambio(s) sin aprobar");
  await expect(page.locator("#baselineHost")).toContainText("Estudio geotécnico ampliado — renombrado");
  await expect(page.locator("#baselineHost")).toContainText("Lo aprobado sigue siendo la instantánea");
  const aprobado = await page.evaluate(() => { const db = JSON.parse(localStorage.getItem("gpi_db") as string); return JSON.stringify(db.projects[db.activeId].modules.scopeStatement.baseline.snapshot.wbs); });
  expect(aprobado).toContain("Estudio de suelos"); expect(aprobado).not.toContain("Estudio geotécnico ampliado");

  // nueva versión: exige aprobador y motivo; archiva la v1.0 con su EDT
  await page.locator("#btnNewVer").click();
  await expect(page.locator("#nv_msg")).toContainText("registra quién aprueba");
  await page.locator("#nv_appr").fill("CCB"); await page.locator("#nv_reason").fill("Incorpora el estudio ampliado");
  await page.locator("#btnNewVer").click();
  await expect(page.locator("#baselineState")).toContainText("Congelada v2.0");
  await expect(page.locator("#baselineHost")).toContainText("Historial de versiones (1)");
  await expect(page.locator("#baselineHost")).toContainText("coinciden con lo aprobado en la v2.0");
  await page.waitForTimeout(1300);
  await page.reload(); await page.locator('.tab[data-tab="coh"]').click();
  await expect(page.locator("#baselineHost")).toContainText("Historial de versiones (1)");
  await page.locator("details.lb-hist summary").click();
  await expect(page.locator("details.lb-hist")).toContainText("Estudio de suelos");                 // la v1.0 archivada conserva SU EDT
});
