// Helper compartido para los vite.config de cada módulo (Fase 4).
// Mismo patrón que configs/core.vite.config.ts: build en modo LIBRERÍA
// (IIFE), salida a .build-tmp/<key>/ (nunca directo a la raíz), y
// scripts/sync-artifact.mjs copia el resultado a la raíz después.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function moduleLibConfig({ key, entry, fileName, globalName }) {
  return {
    root,
    build: {
      outDir: resolve(root, `.build-tmp/${key}`),
      emptyOutDir: true,
      lib: {
        entry: resolve(root, entry),
        name: globalName || key,
        formats: ["iife"],
        fileName: () => fileName
      },
      // Sin rollupOptions.output.exports aquí a propósito: a diferencia de
      // gpi-core.js (una librería con ~40 named exports), estos módulos de
      // página no exportan nada -- son scripts de comportamiento que solo
      // se ejecutan por su efecto secundario (event listeners, render()).
      // Forzar exports:"named" con cero exports reales produce un IIFE
      // roto: Rollup deja "Object.defineProperty(exports, ...)" en el
      // cuerpo pero sin el parámetro "exports" en la función envolvente,
      // y el script revienta con "ReferenceError: exports is not defined"
      // apenas se carga en el navegador.
      minify: false
    }
  };
}
