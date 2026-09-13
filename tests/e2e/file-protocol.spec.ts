// E2E en navegador real, abriendo el HTML directo por file:// (doble
// clic) -- el caso de uso que jsdom no puede probar porque bloquea
// localStorage por completo bajo ese origen (ver CLAUDE.md, "Limitación
// de jsdom descubierta"). Confirma la promesa central del proyecto:
// abrir Panel_Control.html con doble clic, editar datos, y que
// sobrevivan una recarga real de la página.
import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const panelUrl = pathToFileURL(resolve(process.cwd(), "Panel_Control.html")).href;

test("file:// — el proyecto DISTRIB+ se siembra y un renombre sobrevive una recarga real de la página", async ({ page }) => {
  await page.goto(panelUrl);

  const projSelect = page.locator("#projSelect");
  await expect(projSelect.locator("option")).toHaveCount(1);
  await expect(projSelect.locator("option")).toContainText("DISTRIB+ S.A.");

  await page.locator("#btnRename").click();
  await page.locator("#modalInput").fill("Proyecto E2E file://");
  await page.locator("#modalOk").click();
  await expect(projSelect.locator("option")).toContainText("Proyecto E2E file://");

  // La prueba real: recargar la página (navegación completa, no una
  // simple re-lectura en memoria) y confirmar que localStorage
  // sobrevivió bajo el origen file://, tal como lo haría un navegador
  // real con un alumno que cierra y vuelve a abrir el archivo.
  await page.reload();
  await expect(page.locator("#projSelect option")).toContainText("Proyecto E2E file://");
});
