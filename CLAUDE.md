# CLAUDE.md

Guía operativa para trabajar en este repo (humano o IA). Es el resumen
accionable; los patrones y particularidades permanentes de cada módulo
(qué hace distinto y por qué) viven en [ARCHITECTURE.md](ARCHITECTURE.md);
la crónica histórica de cómo se migró de JS suelto a TypeScript, con
fecha y evidencia puntual de cada paso, vive en [MIGRATION.md](MIGRATION.md).

## Qué es esto

Suite educativa PMBOK 8 de 13 módulos HTML + un núcleo de datos
compartido (`gpi-core.js`) sobre `localStorage`. Sitio 100% estático: sin
backend, sin servidor de build en producción. Se despliega copiando
archivos a GitHub Pages o abriendo cualquier módulo con doble clic
(`file://`) — ambos casos de uso son reales y están probados.

La lógica vive en TypeScript bajo `src/` y se compila a los `.js`/`.css`
de la raíz con Vite (modo librería, formato IIFE). **Los artefactos de la
raíz son generados y commiteados — nunca se editan a mano.**

## Reglas que no se pueden romper

1. **Todo build es IIFE** (`formats:["iife"]`), nunca módulo ES. `file://`
   bloquea `<script type="module">` por CORS.
2. **Los artefactos compilados se commitean** junto a su fuente. Después
   de editar un `.ts`, corre `npm run build:<clave>` — o mejor,
   `npm run build:all` antes de comitear (falla si algo quedó desfasado).
3. **El esquema de `localStorage["gpi_db"]` y sus ramas de compatibilidad
   con versiones antiguas no se tocan** sin necesidad real: hay `.json`
   exportados por alumnos reales que deben seguir abriendo.
4. En `src/modules/panel-control/main.ts`: `MODULES`, `GROUPS`,
   `MODULOS_ENTREGADOS`, `MODULOS_EXTRA` y `probeModules` son la única
   zona que edita el profesorado para entregar módulos. No se
   refactorizan ni se les cambia forma.
5. **Regla de oro de datos de ejemplo:** ningún módulo escribe el caso
   DISTRIB+ sobre el proyecto activo sin una acción explícita del alumno
   (botón "Cargar ejemplo"). Un módulo sin datos arranca **en blanco**,
   nunca con el ejemplo precargado.
6. Sin frameworks de componentes (React/Vue/Svelte). Vanilla + TypeScript.
7. Cambios módulo por módulo: el repo queda desplegable y funcional
   después de cada commit.

## Comandos esenciales

```
npm install              # una vez
npm run build:<clave>    # recompila un módulo tras editar su main.ts
npm run build:all        # reconstruye TODO y falla si algo quedó desfasado
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint (falla en errores; @typescript-eslint/no-explicit-any queda en "warn")
npm run lint:fix         # ESLint con --fix para lo autocorregible
npm test                 # Vitest (unidad + humo sobre los HTML reales)
npm run test:coverage    # igual, + piso de cobertura sobre src/core/** (ver vitest.config.ts)
npm run verify:deploy    # audita IIFE / rutas / gpi-core.js presente
```

`.github/workflows/ci.yml` corre typecheck + lint + test + build:all +
verify:deploy en cada push/PR a `master`.

`npm run format` / `npm run format:check` (Prettier) también existen,
pero **no están wireados a CI ni se corrieron sobre el código existente**:
el estilo actual —funciones y `if`/`try` condensados en una sola línea—
es deliberado (facilita comparar línea por línea contra el baseline
pre-migración y refleja el JS original). Un `prettier --write .` de
prueba sobre un solo archivo (`gpi-core.ts`) reescribía ~2000 de sus
~1650 líneas; se decidió con el usuario dejar Prettier disponible para
código nuevo, sin reformatear en bloque lo existente. Si en el futuro se
decide reformatear todo, es una decisión aparte (y grande) a confirmar
explícitamente, no algo a hacer de pasada.

## Mapa: dónde vive cada cosa

```
src/core/gpi-core.ts             → gpi-core.js           (capa de datos)
src/core/types.ts                → (solo tipos, no compila a artefacto)
src/modules/<clave>/main.ts      → <clave>.js            (un módulo HTML)
src/shared/styles/shared.css     → gpi-shared.css        (CSS común)
configs/<clave>.vite.config.ts   → config de build de ese módulo
configs/lib.config.mjs           → factory compartida de vite.config
scripts/sync-artifact.mjs        → copia .build-tmp/<clave>/* a la raíz
scripts/build-all.mjs            → build:all (ver Regla #2)
scripts/verify-deploy.mjs        → verify:deploy
tests/unit/                      → GPI.util puro (cpm, pertProbability, audits…)
tests/smoke/<clave>.smoke.test.ts → cada HTML real, servido por HTTP local
```

## Cómo agregar un módulo nuevo (p. ej. Valor Ganado / EVM)

1. `src/modules/<clave>/main.ts` — copia el patrón de un módulo existente
   parecido (`src/modules/cost/main.ts` si depende del BAC,
   `cronograma-cpm` si depende de la ruta crítica).
2. `configs/<clave>.vite.config.ts` copiando cualquier otro (solo cambia
   `key`/`entry`/`fileName`/`globalName`).
3. Un script `build:<clave>` en `package.json`.
4. `<Clave>.html` con `<script src="gpi-core.js">` + (si usa el modal
   común) `<link rel="stylesheet" href="gpi-shared.css">` +
   `<script src="<clave>.js">`.
5. `tests/smoke/<clave>.smoke.test.ts` — copia la forma de cualquier otro.
6. Agregar la tarjeta a `MODULES` en `src/modules/panel-control/main.ts`
   (`file: "<Clave>.html"`) y su clave a `MODULOS_ENTREGADOS` cuando esté
   lista para alumnos; luego `npm run build:panel-control`.
7. `npm run build:all && npm test && npm run verify:deploy` antes de
   comitear.

## Trampas ya encontradas (para no redescubrirlas)

- **jsdom + `file://` bloquea `localStorage`** (lo trata como origen
  opaco), a diferencia de los navegadores reales. Todo smoke test sirve
  el HTML por HTTP local efímero en vez de abrir el archivo directo — ver
  cualquier `tests/smoke/*.smoke.test.ts` como plantilla.
- **`git status --porcelain` da falso positivo en Windows** con
  `core.autocrlf=true`: un artefacto recién compilado (LF puro) puede
  aparecer "modificado" sin que el contenido real haya cambiado. Usa
  `git diff` (aplica el filtro "clean"), no `git status`, para comparar
  contenido de artefactos — así lo hace `scripts/build-all.mjs`.
- **`rollupOptions.output.exports:"named"` rompe los módulos de página**:
  solo `gpi-core.ts` tiene named exports reales (~40). Forzar esa opción
  en un módulo sin exports produce `ReferenceError: exports is not
  defined` en el navegador. `configs/lib.config.mjs` (compartido) NO la
  usa; solo `configs/core.vite.config.ts` la agrega aparte.
- **esbuild descarta comentarios al transpilar TS→JS**: un cambio que sea
  solo un comentario no aparece en el artefacto compilado. No es un fallo
  de `build:all` si no detecta "cambios" en ese caso.
- Cada módulo referencia el núcleo de una de **tres** formas — no las
  mezcles sin revisar cuál usa cada archivo:
  1. `window.GPI` explícito en cada llamada, con
     `interface Window { GPI?: GpiApi }` — la mayoría de los módulos.
  2. `GPI` como identificador global *ambiental* bare, vía
     `declare global { var GPI: GpiApi | undefined }` — `cost` y
     `requirements` (el original ya lo escribía así, sin `window.`).
  3. `GPI` como **constante/variable de módulo local** que hace *shadow*
     del global, capturada una vez de `window.GPI` (`const GPI: GpiApi =
     window.GPI as GpiApi` o, si se reasigna dentro de `init()`, `let`) —
     `cronograma-cpm` y `panel-control`. Ver el comentario al inicio de
     cada archivo para el porqué puntual de cada patrón.
- `GPI.ui.esc`/`GPI.ui.kpi` existen en el núcleo pero **deliberadamente no
  los usan los 12 módulos de herramienta** (cada uno mantiene su propio
  `esc()` local): así siguen funcionando aunque `gpi-core.js` no cargue.
  No es una inconsistencia a "corregir" — es la decisión documentada en
  `MIGRATION.md` (Fase 3).
- **typescript-eslint rechaza correr sobre TypeScript ≥7** (`throw`
  incondicional en su propio código, no un simple warning de
  peerDependency). Por eso `package.json` fija `typescript` en `^6.0.3`
  en vez de la serie 7 nativa que trajo el bootstrap inicial del repo —
  no es un downgrade accidental, es lo que exige el linter hoy. Si
  typescript-eslint libera soporte para TS 7 (rastrear
  https://github.com/typescript-eslint/typescript-eslint/issues/10940),
  vale la pena reevaluar volver a la serie 7 nativa.
- **La cobertura de tests solo mide `src/core/**`, a propósito**: Vitest
  instrumenta el código que importa como módulo TS (`tests/unit/*` importa
  `gpi-core.ts` directo), pero los smoke tests de los 13 módulos cargan el
  `.js` YA COMPILADO dentro de un jsdom (`runScripts:"dangerously"`, igual
  que un `<script>` clásico) — ese bundle no tiene sourcemap hacia el `.ts`
  fuente, así que la cobertura v8 no puede atribuirle líneas y mostraría
  "0%" de forma engañosa. Ver el comentario en `vitest.config.ts`.
- **`@vitest/coverage-v8` + jsdom con una URL `file://` inventada rompe en
  Windows**: `takeCoverage()` intenta convertir la URL de CADA script
  ejecutado en el proceso (incluidos los que corre un test dentro de un
  jsdom sandbox) a una ruta de archivo con `fileURLToPath`, que en Windows
  exige una letra de unidad. Una URL de prueba como `file:///fake/x.html`
  (válida en POSIX) tira `ERR_INVALID_FILE_URL_PATH` ahí. Fix: usar
  `file:///C:/fake/x.html` en cualquier jsdom de prueba que necesite un
  origen `file:` inventado (ver `tests/smoke/gpi-core.artifact.smoke.test.ts`).
- `eslint.config.mjs` usa extensión `.mjs`, no `.js`: `scripts/verify-deploy.mjs`
  trata cualquier `*.js` en la raíz del repo como un artefacto IIFE
  compilado, y un archivo de config con `import`/`export` a nivel
  superior lo haría fallar en falso.
- `eslint.config.mjs` relaja a propósito tres reglas del set
  "recommended" frente a convenciones ya establecidas del port, en vez
  de forzar un cambio de código en decenas de sitios:
  1. `no-unused-vars` con `caughtErrors: "none"` — `catch (e) { }` /
     `catch (err) { }` sin usar el error aparece en los 13 módulos para
     descartar fallos silenciosos de APIs (localStorage en iframes,
     clipboard, FileReader).
  2. `no-unused-expressions` con `allowShortCircuit: true` — el idioma
     `condicion() || fallback();` como sentencia suelta (mover foco a la
     siguiente celda o hacer `blur()` si `moveTo()` falla) aparece en
     varios módulos.
  3. `no-irregular-whitespace` con `skipRegExps: true` — los parsers
     "a la Excel" (`cost`, `activities`, `pert`, `cronograma-cpm`) usan
     `/[\s ]/` a propósito: el espacio literal dentro de la clase de
     caracteres es un NBSP real (separador de miles que a veces pega
     Excel), no un error de tipeo.

## Filosofía al tocar un módulo existente

**"Port mecánico, no refactor"**: si vas a modificar un módulo ya
migrado, preserva su comportamiento exacto salvo que el usuario pida
explícitamente lo contrario. No unifiques patrones "por prolijidad" entre
módulos sin confirmar antes — varias diferencias que parecen
inconsistencias (nombres de función, `window.GPI` vs. `GPI` bare, si
tienen CSS de modal compartido) son decisiones deliberadas documentadas
en `MIGRATION.md`, no descuidos.
