import { defineConfig } from "@playwright/test";

// E2E en navegador REAL (a diferencia de tests/unit y tests/smoke, que
// corren en jsdom vía Vitest). Existe para cerrar la brecha concreta
// entre "jsdom simula el DOM" y "un navegador real bajo file://" que
// ningún test anterior cubría: jsdom bloquea localStorage por completo
// bajo file:// (ver CLAUDE.md), así que nunca pudo probar la promesa
// central del proyecto -- abrir un módulo con doble clic y que los
// datos sobrevivan una recarga real. Ver ARCHITECTURE.md.
//
// `channel: "chrome"` usa el Chrome ya instalado en la máquina/runner en
// vez de que Playwright descargue su propio binario (~150 MB desde
// cdn.playwright.dev): evita una descarga de red frágil tanto en
// desarrollo local como en CI (los runners de GitHub Actions traen
// Chrome preinstalado). Si `channel: "chrome"` no encuentra un Chrome
// instalado, hay que instalar uno o correr
// `npx playwright install chromium` y quitar esta línea.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    channel: "chrome",
    baseURL: "http://127.0.0.1:4173"
  },
  webServer: {
    command: "node scripts/static-server.mjs",
    url: "http://127.0.0.1:4173/Panel_Control.html",
    reuseExistingServer: !process.env.CI
  }
});
