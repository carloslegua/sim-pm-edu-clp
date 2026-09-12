import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build en modo LIBRERÍA (IIFE), no modo app: los 13 módulos HTML cargan
// gpi-core.js como <script> clásico, incluso abiertos con doble clic
// (file://), donde <script type="module"> se bloquea por CORS. Ver
// MIGRATION.md: "todo build de Vite es formats:['iife'], nunca type=module".
//
// La salida va a una carpeta de build temporal (.build-tmp), NUNCA
// directo a la raíz del repo: emptyOutDir de Vite podría borrar archivos
// hermanos (los 13 HTML). El script scripts/sync-artifact.mjs copia el
// resultado a la raíz después del build.
export default defineConfig({
  root: resolve(__dirname, ".."),
  build: {
    outDir: resolve(__dirname, "../.build-tmp/core"),
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "../src/core/gpi-core.ts"),
      name: "GPI",
      formats: ["iife"],
      fileName: () => "gpi-core.js"
    },
    rollupOptions: {
      // "named": todos los exports quedan como propiedades planas de window.GPI
      // (getModule, util, schema, ...). Sin esto Rollup podría anidar el
      // objeto agregado bajo GPI.default en vez de exponerlo todo plano.
      output: { exports: "named" }
    },
    minify: false
  }
});
