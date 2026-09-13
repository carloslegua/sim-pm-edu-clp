// E2E en navegador real: verifica el trap de foco y los atributos ARIA
// de los modales personalizados (.modal-overlay/.modal-card), agregados
// tras la auditoría de accesibilidad (ver CHANGELOG.md). jsdom no sirve
// para esto: Tab no dispara el recorrido de foco real del navegador.
import { test, expect } from "@playwright/test";

test("Panel_Control — el modal tiene role=dialog/aria-modal y Tab no escapa hacia el fondo", async ({ page }) => {
  await page.goto("/Panel_Control.html");

  await page.locator("#btnNew").click();
  const card = page.locator("#modalOverlay .modal-card");
  await expect(card).toHaveAttribute("role", "dialog");
  await expect(card).toHaveAttribute("aria-modal", "true");
  await expect(card).toHaveAttribute("aria-labelledby", "modalTitle");

  // El modal de "Nuevo proyecto" es un prompt: input + Cancelar + Guardar.
  const input = page.locator("#modalInput");
  await expect(input).toBeFocused();

  // Shift+Tab desde el primer elemento debe ciclar al ÚLTIMO, no escapar
  // hacia atrás del modal (p. ej. al selector de proyecto del fondo).
  await page.keyboard.press("Shift+Tab");
  const lastFocused = await page.evaluate(() => document.activeElement?.id);
  expect(lastFocused).toBe("modalOk");

  // Tab desde el último debe volver al PRIMERO.
  await page.keyboard.press("Tab");
  const firstFocused = await page.evaluate(() => document.activeElement?.id);
  expect(firstFocused).toBe("modalInput");

  await page.keyboard.press("Escape");
  await expect(page.locator("#modalOverlay")).not.toHaveClass(/open/);
});
