# CLAUDE.md

Guía operativa para trabajar en este repo (humano o IA). Es el resumen
accionable; los patrones y particularidades permanentes de cada módulo
(qué hace distinto y por qué) viven en [ARCHITECTURE.md](ARCHITECTURE.md);
la crónica histórica de cómo se migró de JS suelto a TypeScript, con
fecha y evidencia puntual de cada paso, vive en [MIGRATION.md](MIGRATION.md).

## Qué es esto

Suite educativa PMBOK de 21 módulos HTML (20 herramientas + el Panel) + un núcleo de datos
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
6. **Los "Cargar ejemplo" (16 herramientas; el Plan para la Dirección no tiene el suyo: solo consolida) son UN SOLO proyecto coherente** ("DISTRIB+
   S.A. — Almacén Lurín"): mismos códigos EDT, mismas personas del OBS,
   mismas fechas de hito, mismo presupuesto/moneda entre TODOS los
   módulos — ver el catálogo canónico en ARCHITECTURE.md ("Dataset de
   referencia (DISTRIB+)"). Al agregar un módulo o función nueva que
   necesite datos de ejemplo, **AMPLÍA ese mismo caso** (reutiliza sus
   códigos/personas/fechas ya existentes) en vez de inventar uno propio;
   si agregas un elemento genuinamente nuevo al caso (fase, cargo,
   interesado, hito), documéntalo también ahí para que la próxima
   ampliación lo encuentre coherente.
7. Sin frameworks de componentes (React/Vue/Svelte). Vanilla + TypeScript.
8. Cambios módulo por módulo: el repo queda desplegable y funcional
   después de cada commit.

## Comandos esenciales

```
npm install              # una vez
npm run dev              # servidor HTTP local (mismo origen -> localStorage compartido de verdad)
npm run build:<clave>    # recompila un módulo tras editar su main.ts
npm run build:all        # reconstruye TODO y falla si algo quedó desfasado
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint (falla en errores; @typescript-eslint/no-explicit-any queda en "warn")
npm run lint:fix         # ESLint con --fix para lo autocorregible
npm test                 # Vitest (unidad + humo sobre los HTML reales)
npm run test:coverage    # igual, + piso de cobertura sobre src/core/** (ver vitest.config.ts)
npm run test:e2e         # Playwright, navegador real (ver mas abajo)
npm run verify:deploy    # audita IIFE / rutas / gpi-core.js presente
```

`.github/workflows/ci.yml` corre typecheck + lint + test:coverage +
build:all + verify:deploy + test:e2e en cada push/PR a `master`.

**E2E en navegador real (Playwright, `tests/e2e/`):** Vitest + jsdom no
puede probar `localStorage` bajo `file://` (jsdom lo bloquea por
completo, ver "Trampas" más abajo) — así que la promesa central del
proyecto ("abrir con doble clic, los datos sobreviven") nunca se había
probado de forma automatizada, solo manualmente. `playwright.config.ts`
usa `channel:"chrome"` (el Chrome ya instalado en la máquina/runner) en
vez de que Playwright descargue su propio binario — evita una descarga
de ~150 MB que puede fallar en redes restringidas (pasó en este mismo
entorno de desarrollo). Dos specs:
- `file-protocol.spec.ts`: abre `Panel_Control.html` por `file://`,
  edita datos, **recarga la página de verdad** y confirma que
  sobrevivieron — la prueba que jsdom no puede hacer.
- `http-cross-module.spec.ts`: levanta `scripts/static-server.mjs` y
  confirma que dos documentos HTML distintos comparten `localStorage`
  bajo el mismo origen HTTP (el modo "confiable" que documenta
  README.md, a diferencia de `file://` entre pestañas distintas).

**Pre-commit hook (husky + lint-staged):** cada `git commit` corre
automáticamente `eslint --fix` sobre los `.ts`/`.mjs` en stage, luego
`npm run typecheck` y `npm run build:all` completos (no solo sobre lo
tocado — un cambio en un archivo puede romper el tipado de otro, y
`build:all` es precisamente el chequeo de "olvidé recompilar" de la
Regla #2). Si algo falla, el commit se aborta con el mismo mensaje que
verías en CI, pero antes de hacer push. Vive en `.husky/pre-commit`;
`npm install` lo reinstala solo (script `prepare`). Para saltarlo en un
caso excepcional: `git commit --no-verify` (evitar salvo que sepas
exactamente por qué).

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
src/shared/change-orders.ts      → (se inlinea en cost.js y gpi-core.js) órdenes de cambio de
                                    costos: naturaleza, financiación, aprobación, línea base
src/shared/cost-variance.ts      → (se inlinea en cost.js) clasificación de variaciones CPI/CV
                                    contra los umbrales del plan
src/shared/risk-analysis.ts      → (se inlinea en risks.js y gpi-core.js) registro de riesgos: escalas,
                                    puntaje, valor esperado (AACE), residual, hallazgos, matriz
src/shared/range-estimating.ts   → (se inlinea en cost.js) contingencia por rangos + Monte Carlo
                                    (AACE 41R-08), determinista (semilla fija); admite eventos de
                                    riesgo discretos (Bernoulli × triangular) del Registro
src/shared/risk-sample.ts        → (se inlinea en risks.js y cost.js) ÚNICA fuente del ejemplo
                                    DISTRIB+ de riesgos (plan, 10 riesgos, órdenes vinculadas)
src/shared/evm.ts                → (se inlinea en evm.js) Valor Ganado: PV sobre la línea base, EV por técnica,
                                    índices, EAC/ETC/TCPI, cronograma ganado (Earned Schedule), umbrales
src/shared/evm-sample.ts         → (se inlinea en evm.js) ejemplo DISTRIB+ del EVM (avance, costo real, cortes);
                                    prueba de oro en tests/unit/evm-sample.test.ts
src/shared/change-control.ts     → (se inlinea en changes.js) control integrado de cambios: evaluación en seis
                                    áreas, autoridad requerida, condiciones de aprobación/implementación, hallazgos
src/shared/change-sample.ts      → (se inlinea en changes.js) ejemplo DISTRIB+ de solicitudes de cambio (CR-001…003
                                    = OC-001…003 de Costos)
src/shared/case-distribplus.ts   → (solo lectura) puestos del OBS y 18 paquetes de la EDT del caso DISTRIB+ para el modo
                                    independiente de los módulos nuevos; prueba contra el caso en tests/unit
src/shared/evm-reference.ts      → (se inlinea en cronograma-cpm.js y evm.js) referencia de valor ganado que se congela con la línea base LB-n:
                                    presupuesto por paquete, fechas por paquete, calendario; y su diferencia con lo vigente
src/shared/requirements-baseline.ts → (se inlinea en requirements.js) versiones de la línea base de requisitos: archiva cada versión
                                    completa (aprobador, fecha, motivo, instantánea) antes de establecer la siguiente
src/shared/plan-facts.ts         → (se inlinea en comms/quality/procurement/pmplan) lectura ÚNICA del proyecto para los tres planes
                                    subsidiarios: lo que revisa cada módulo y lo que resume el Plan para la Dirección no diverge
src/shared/procurement-plan.ts   → (se inlinea en procurement.js) plan de adquisiciones: fecha límite de convocatoria, contrato, selección
                                    con criterios, valor contra la EDT, riesgos, hallazgos P1–P13
src/shared/procurement-sample.ts → (se inlinea en procurement.js) ejemplo DISTRIB+ de adquisiciones (PR-01…05; fechas = CPM real)
src/shared/quality-plan.ts       → (se inlinea en quality.js) plan de calidad: métricas, aseguramiento/control por paquete contra el
                                    criterio de aceptación del diccionario de la EDT, costo de la calidad, hallazgos Q1–Q11
src/shared/quality-sample.ts     → (se inlinea en quality.js) ejemplo DISTRIB+ de calidad (QC-01…17, QM-01…05, costo 350.000)
src/shared/comms-plan.ts         → (se inlinea en comms.js) matriz de comunicaciones: cobertura de interesados, hallazgos M1–M12
src/shared/comms-sample.ts       → (se inlinea en comms.js) ejemplo DISTRIB+ de comunicaciones (CM-01…11, interesados s1…s12)
src/shared/pm-plan.ts            → (se inlinea en plan-direccion.js) Plan para la Dirección: estado por área, hallazgos de
                                    integración entre líneas base, instantánea del plan aprobado y su desactualización
src/shared/pert-network.ts       → (se inlinea en pert.js y cronograma-cpm.js) PERT sobre la red completa: Monte Carlo
                                    Beta-PERT sobre el CPM del núcleo (ramas paralelas), criticidad por actividad
src/shared/escalation.ts         → (se inlinea en cost.js) escalación por índices por cuenta y en el tiempo (AACE 58R-10)
                                    + Monte Carlo con retraso del cronograma (68R-11); tipo de cambio aparte
src/shared/escalation-sample.ts  → (se inlinea en cost.js) ejemplo DISTRIB+ de la escalación (tasas ILUSTRATIVAS, mezcla
                                    por paquete, precios fijados); prueba de oro en tests/unit/escalation-sample.test.ts
src/shared/boe.ts                → (se inlinea en cost.js) Basis of Estimate (AACE 34R-05): 32 campos del índice de la
                                    práctica, completitud según la clase, estado de aprobación y hallazgos B1–B8
src/shared/boe-sample.ts         → (se inlinea en cost.js) BOE del ejemplo DISTRIB+ (clase 3, aprobada); SAMPLE_CAPEX
src/shared/wbs-quality.ts        → (se inlinea en wbs.js) calidad de la EDT: estructura, diccionario de los
                                    paquetes y tamaño, con umbrales didácticos declarados (LIMITS)
src/shared/wbs-sample.ts         → (se inlinea en wbs.js) diccionario de los 18 paquetes del ejemplo DISTRIB+
                                    (descripción, criterio de aceptación, LOE); coherencia en tests/unit/wbs-sample.test.ts
src/shared/estimate-class.ts     → (se inlinea en cost.js) madurez de la definición → clase del estimado sugerida,
                                    aviso contra la clase declarada, rango de exactitud aplicado
src/shared/reserve-policy.ts     → (se inlinea en risks.js, cost.js y gpi-core.js) política de reservas del plan de
                                    riesgos: niveles de autoridad por monto, alerta de agotamiento
src/shared/schedule-control.ts   → (se inlinea en cronograma-cpm.js y gpi-core.js) salud de la red (DCMA), línea
                                    base LB-n, variación y umbrales del Plan del Cronograma
src/shared/schedule-risk.ts      → (se inlinea en risks.js y cost.js) riesgo de plazo: motor sobre el CPM
                                    del núcleo, ubicación de un riesgo en actividades, efecto en el fin
src/shared/schedule-sample.ts    → (se inlinea en risks.js y cost.js) red DISTRIB+ completa (43 act.,
                                    3 hitos, 51 enlaces) para los modos independientes; prueba de oro
                                    en tests/unit/schedule-sample.test.ts (273 d, 34 críticos)
src/shared/stakeholder-engagement.ts → (se inlinea en stakeholder-studio.js) matriz de compromiso
                                    de interesados: brecha, prioridad, hallazgos
src/shared/write-session.ts      → (se inlinea en cada IIFE) guardado con sesión de
                                    edición + resultado común de escritura
configs/<clave>.vite.config.ts   → config de build de ese módulo
configs/lib.config.mjs           → factory compartida de vite.config
scripts/sync-artifact.mjs        → copia .build-tmp/<clave>/* a la raíz
scripts/sync-jszip.mjs           → vendoriza node_modules/jszip/dist/jszip.min.js
                                    (npm run build:jszip -- ver "Trampas")
scripts/build-all.mjs            → build:all (ver Regla #2)
scripts/verify-deploy.mjs        → verify:deploy
tests/unit/                      → GPI.util puro (cpm, pertProbability, audits…)
tests/smoke/<clave>.smoke.test.ts → cada HTML real, servido por HTTP local (jsdom)
tests/e2e/                       → mismo tipo de prueba, pero en Chrome real
scripts/static-server.mjs        → servidor HTTP mínimo, usado por tests/e2e
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
- **`build:all` compara contra el ÍNDICE de git, no contra `HEAD`, y
  es a propósito**: se cambió después de que el pre-commit hook
  bloqueaba en seco el primer commit que tocaba a la vez un
  `src/modules/*/main.ts` y su artefacto (el caso normal: editar un
  módulo y comitear fuente+build juntos). Comparar contra `HEAD` ahí
  SIEMPRE falla, porque el commit anterior nunca tuvo el contenido
  nuevo — para eso es el commit que se está creando. Comparar contra
  el índice (`git diff` sin argumento) solo falla cuando el rebuild no
  coincide con lo que ya se preparó para comitear, que es el bug real
  que el script busca atrapar. En CI no cambia nada (checkout limpio →
  índice == `HEAD`).
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
  los usan los 13 módulos de herramienta** (cada uno mantiene su propio
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
  `gpi-core.ts` directo), pero los smoke tests de los 16 módulos cargan el
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
- **La descarga del navegador de Playwright puede fallar en redes
  restringidas**: `npx playwright install chromium` descarga ~150 MB
  desde `cdn.playwright.dev`, y esa descarga dio timeout en este mismo
  entorno de desarrollo. `playwright.config.ts` evita el problema de
  raíz usando `channel:"chrome"` (el Chrome ya instalado en la máquina o
  en el runner de CI) en vez del binario propio de Playwright — no hace
  falta `playwright install` en absoluto con esta config.
- **`file://` no comparte `localStorage` de forma confiable entre
  documentos HTML distintos** (dos módulos abiertos como pestañas
  separadas por doble clic), aunque SÍ persiste de forma confiable
  dentro del MISMO documento a través de una recarga (ver
  `tests/e2e/file-protocol.spec.ts`, que prueba justamente eso). Esto
  **no es arreglable desde el código de la app**: qué almacenamiento
  comparten dos documentos es una decisión del origen que le asigna el
  navegador, y el origen que le corresponde a `file://` no está
  estandarizado de forma consistente entre navegadores (a diferencia de
  `http(s)://`, donde mismo host+puerto siempre es mismo origen). Ningún
  cambio en `gpi-core.ts` puede anular eso. El modo confiable para
  compartir datos entre módulos es servir los archivos por HTTP —
  `npm run dev` (`scripts/static-server.mjs`) para desarrollo local,
  GitHub Pages en producción — ya documentado en el README ("Nota")
  desde antes de la migración a TypeScript; `tests/e2e/http-cross-module.spec.ts`
  lo prueba de punta a punta en Chrome real.
- **`JSZip` nunca resuelve (ni rechaza) sus operaciones de CONTENIDO
  dentro de jsdom**: `generateAsync(...)` y `zip.file(name).async("string")`
  cuelgan indefinidamente en un `JSDOM` con `runScripts:"dangerously"`,
  verificado con diagnósticos aislados — pasa incluso sin compresión
  (método `STORE`), aunque `JSZip.loadAsync()` (que solo valida la
  ESTRUCTURA del zip) sí funciona y rechaza rápido ante datos inválidos.
  Es una limitación del entorno, no del código de la app: análoga al
  bloqueo de `localStorage` bajo `file://` de más abajo. Por eso el
  import de `.xlsx` real de `activities` (Activity_Definition.html) se
  prueba en `tests/e2e/activity-definition-import.spec.ts` (Chrome real
  vía Playwright) y NO en el smoke test jsdom — que solo cubre el caso
  rápido de "archivo inválido" (falla en `loadAsync`, antes de tocar la
  parte que cuelga). El fixture `.xlsx` de ese E2E se arma con el paquete
  `jszip` de npm en Node puro (no con `window.JSZip` del navegador), para
  no depender en absoluto de la ruta rota.
- **`JSZip` está vendorizado en el repo (`jszip.min.js`, raíz), no se
  carga desde un CDN**: cargaba antes desde `cdnjs.cloudflare.com` con
  hash SRI fijado. Bug real reportado por el usuario: con el CDN
  bloqueado (red del aula, sin conexión), la importación de un `.xlsx`
  real en `activities`/`cost-estimate`/`cronograma-cpm`/`wbs` fallaba
  con el mismo mensaje que un archivo corrupto ("no parece ser un .xlsx
  válido"), porque `window.JSZip` quedaba `undefined` y el `try/catch`
  genérico no distinguía las dos causas. `npm run build:jszip`
  (`scripts/sync-jszip.mjs` + `sync-artifact.mjs`) copia
  `node_modules/jszip/dist/jszip.min.js` — la MISMA versión que ya usan
  los fixtures de `tests/e2e/*-import.spec.ts` — a la raíz; los 5 HTML
  que lo usan (`Activity_Definition`, `Cronograma_CPM`, `Estimar_Costos`,
  `Panel_Control`, `WBS_Builder`) cargan `<script src="jszip.min.js">`
  en vez del CDN. `npm run build:all` incluye este paso y detecta si el
  vendorizado quedó desfasado de `node_modules/jszip`, igual que
  cualquier otro artefacto (ver Regla #2). Los 4 módulos que importan
  `.xlsx` además comprueban `window.JSZip` explícitamente ANTES de
  intentar parsear, para seguir distinguiendo "la librería no cargó" de
  "el archivo está mal" aunque `jszip.min.js` falle por cualquier otro
  motivo (caché corrupta, bloqueo del navegador).
- `eslint.config.mjs` usa extensión `.mjs`, no `.js`: `scripts/verify-deploy.mjs`
  trata cualquier `*.js` en la raíz del repo como un artefacto IIFE
  compilado, y un archivo de config con `import`/`export` a nivel
  superior lo haría fallar en falso.
- `eslint.config.mjs` relaja a propósito tres reglas del set
  "recommended" frente a convenciones ya establecidas del port, en vez
  de forzar un cambio de código en decenas de sitios:
  1. `no-unused-vars` con `caughtErrors: "none"` — `catch (e) { }` /
     `catch (err) { }` sin usar el error aparece en los 14 módulos para
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
