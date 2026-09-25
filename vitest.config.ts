import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    // Los smoke cargan un módulo real en jsdom (Costos simula Monte Carlo al abrir) con varios workers en paralelo: los 5 s
    // por defecto se agotaban bajo carga aunque la prueba fuera correcta. Es un TOPE, no una espera: las pruebas siguen
    // terminando en cuanto se cumple lo que observan.
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["tests/setup/jsdom-lifecycle.ts"],   // espera la carga real de cada documento y los cierra al terminar la prueba
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Solo src/core/**: es el único código que Vitest importa y
      // transforma directamente (tests/unit/*.test.ts lo importa como
      // módulo TS). Los 13 src/modules/<clave>/main.ts SÍ tienen prueba
      // real (tests/smoke/*.smoke.test.ts), pero la ejercen cargando el
      // .js YA COMPILADO dentro de un jsdom vía `runScripts:"dangerously"`
      // (igual que un <script> clásico) — ese bundle no tiene sourcemap
      // hacia el .ts fuente, así que la cobertura v8 no puede atribuirle
      // líneas. Incluirlos aquí mostraría "0%" de forma engañosa para
      // código que sí está probado, solo que no por este mecanismo.
      include: ["src/core/**/*.ts"],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 80,
        lines: 75
      }
    }
  }
});
