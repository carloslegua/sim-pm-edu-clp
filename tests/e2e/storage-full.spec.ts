// E2E en navegador real: con el almacenamiento LLENO (toda escritura falla, la lectura funciona) el módulo sigue mostrando el proyecto REAL, el aviso
// persistente es visible arriba y ofrece exportar desde el Panel, y desaparece solo cuando vuelve a haber espacio.
import { test, expect } from "@playwright/test";

const semilla = { version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto real S/ 1.000", course: "GPI", currency: "PEN", createdAt: 1, updatedAt: 1 }, modules: { cost: { budget: { baseCost: 1000, computed: { base: 1000 } }, changeOrders: [] } } } } };

test("almacenamiento lleno: proyecto real visible, aviso persistente arriba y se retira al liberar espacio", async ({ page }) => {
  await page.addInitScript((db) => {
    // solo la primera carga siembra el proyecto; después toda escritura falla mientras window.__lleno sea verdadero
    if (!localStorage.getItem("gpi_db")) localStorage.setItem("gpi_db", JSON.stringify(db));
    const real = Storage.prototype.setItem; (window as any).__lleno = true;
    Storage.prototype.setItem = function (k: string, v: string) { if ((window as any).__lleno) throw new DOMException("Quota exceeded", "QuotaExceededError"); return real.call(this, k, v); };
  }, semilla);

  await page.goto("/Valor_Ganado.html");
  const aviso = page.locator("#gpi-storage-notice");
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("los cambios no se están guardando");
  await expect(aviso.locator('a[href="Panel_Control.html"]')).toBeVisible();
  const y = await aviso.evaluate((e) => e.getBoundingClientRect().top); expect(y).toBeLessThan(5);           // pegado arriba, sin tapar el contenido
  await expect(page.locator("body")).toContainText("Proyecto sin seguimiento todavía");                      // el proyecto real, no el ejemplo
  await expect(page.locator("body")).not.toContainText("7.100.000");

  // el Panel también avisa, sin remitirse a sí mismo
  await page.goto("/Panel_Control.html");
  await expect(page.locator("#gpi-storage-notice")).toBeVisible();
  await expect(page.locator("#gpi-storage-notice a")).toHaveCount(0);
  await expect(page.locator("#projSelect option")).toContainText("Proyecto real S/ 1.000");

  // el alumno libera espacio: el aviso se retira solo en la siguiente revisión
  await page.evaluate(() => { (window as any).__lleno = false; (window as any).GPI.checkStorageNotice(); });
  await expect(page.locator("#gpi-storage-notice")).toHaveCount(0);
});
