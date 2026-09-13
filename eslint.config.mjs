// Config plana de ESLint (formato único soportado desde ESLint 9+).
//
// Extensión .mjs a propósito, no .js: `scripts/verify-deploy.mjs`
// (Regla #2 de CLAUDE.md) trata cualquier `*.js` en la raíz del repo
// como un artefacto IIFE compilado y lo audita como tal — un archivo de
// configuración con `import`/`export` a nivel superior lo haría fallar
// en falso. El resto de la config de herramientas del repo ya sigue
// esta misma convención (scripts/*.mjs, configs/*.mjs).
//
// NOTA sobre la versión de TypeScript: typescript-eslint rechaza en
// tiempo de ejecución correr sobre TypeScript >=7 (throw incondicional,
// no solo un warning de peerDependency — ver CLAUDE.md, "Trampas ya
// encontradas"). Por eso `typescript` está fijado en 6.x en
// package.json en vez de la serie 7 nativa. El parseo type-aware
// (`recommendedTypeChecked`) tampoco se activa todavía: agrega bastante
// tiempo de lint (requiere el type-checker completo) y este repo no
// tiene hoy ninguna regla que dependa de tipos (no-floating-promises,
// no-unsafe-*) que justifique el costo; queda como mejora futura.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".build-tmp/**",
      ".vite/**",
      // Artefactos compilados (IIFE) en la raíz: generados por
      // `npm run build:<clave>`, nunca se editan a mano (ver
      // CLAUDE.md, regla #2). Lintear el .ts fuente ya cubre esto.
      "*.js",
      "*.css",
      "*.html",
    ],
  },

  // ---- Fuente TypeScript: src/, configs/, tests/ (igual que tsconfig.json) ----
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "configs/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // La auditoría de "any" (ver CLAUDE.md) dejó ~25 usos legítimos como
      // límites de datos externos (localStorage legacy, JSON.parse,
      // import/export entre herramientas) documentados caso por caso en
      // los mensajes de commit. "warn" en vez de "error" para no romper
      // el build por esos usos ya revisados, pero sí marcar cualquier
      // `any` nuevo que se agregue sin pasar por el mismo criterio.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // `catch (e) { /* swallow */ }` / `catch (err) { ... }` sin usar
          // el error aparece decenas de veces en los 13 módulos + tests,
          // para descartar fallos de APIs que pueden fallar silenciosamente
          // (localStorage en iframes, clipboard, FileReader, etc.). Es una
          // convención del port original, no algo a renombrar a `_` en
          // cada sitio solo para complacer al linter ("port mecánico, no
          // refactor" — ver CLAUDE.md).
          caughtErrors: "none",
        },
      ],
      // El idioma `condicion() || fallback();` como sentencia suelta
      // (en vez de `if (!condicion()) fallback();`) aparece en varios
      // módulos (p. ej. mover el foco a la siguiente celda o hacer
      // `blur()` si `moveTo()` devuelve falsy). Es intencional, no un
      // error de tipeo con una asignación faltante.
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      // Los parsers tolerantes de fechas/números "a la Excel" (cost,
      // activities, pert, cronograma-cpm) usan `/[\s ]/` a propósito:
      // el espacio literal dentro de la clase de caracteres es un NBSP
      // (separador de miles que a veces pega Excel), no un error de
      // tipeo. Sin esta opción, ESLint lo marca como "irregular
      // whitespace" en cualquier regex que lo mencione literalmente.
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
      // Los 13 módulos existen porque `file://` no admite <script
      // type="module">: todo el intercambio de datos entre módulos pasa
      // por window.GPI/localStorage, no por imports. `require` no se usa
      // en ningún .ts real, pero esta regla del set "recommended" no
      // aplica a este proyecto (es de estilo CommonJS-vs-ESM).
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // ---- Scripts Node sueltos (scripts/, configs/*.mjs): sin tipos ----
  {
    files: ["scripts/**/*.mjs", "configs/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
      sourceType: "module",
    },
    rules: {
      // Mismo criterio que en el bloque de TypeScript de arriba: un
      // catch que descarta el error a propósito (p. ej. un 404 al
      // servir un archivo) no es un error de "variable sin usar".
      // tseslint.configs.recommended ya activa la versión
      // @typescript-eslint/* (no la base no-unused-vars) incluso en
      // archivos .mjs sin tipos, así que hay que sobreescribir esa.
      "@typescript-eslint/no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },

  // Prettier siempre al final: apaga las reglas de estilo de ESLint que
  // chocarían con el formateo de Prettier (no reemplaza `npm run format`).
  prettier
);
