# Migración a TypeScript + Vite — bitácora y reglas

Este documento acompaña la migración incremental descrita en el plan aprobado
con el usuario. No reemplaza a `README.md` (documentación funcional de cara
al alumno): aquí vive el estado de la migración y las reglas técnicas no
negociables mientras dure.

## Reglas no negociables

1. **Todo build de Vite es `formats:['iife']`, nunca `type=module`.** El modo
   `file://` (doble clic) bloquea por CORS la carga de módulos ES; romperlo
   rompe el uso independiente por herramienta que el README documenta.
2. **Los artefactos compilados se commitean al repo.** GitHub Pages sigue
   sirviendo la raíz sin ningún workflow de build; `gpi-core.js` (y luego
   `gpi-shared.css`, y el bundle de cada módulo) se generan localmente y se
   versionan como archivos estáticos de nombre fijo.
3. **Ningún módulo pierde su `<script src="gpi-core.js">` cargable de forma
   independiente.** El esquema de `localStorage["gpi_db"]` y sus ramas de
   compatibilidad con versiones antiguas no se tocan como parte del port.
4. **`MODULES` / `MODULOS_ENTREGADOS` / `MODULOS_EXTRA` / `probeModules` en
   `Panel_Control.html` no se tocan** en esta migración.
5. Migración módulo por módulo: el proyecto queda desplegable y funcional
   después de cada commit. Nunca un "big bang".
6. Sin frameworks de componentes (React/Vue/Svelte). Vanilla + TypeScript.

## Estado de la migración por módulo

| Orden | Módulo | Archivo | Estado |
|---|---|---|---|
| — | Núcleo | `gpi-core.js` → `src/core/gpi-core.ts` | ✅ Migrado (Fase 1) |
| 1 | OBS | `OBS_Builder.html` | ✅ Migrado |
| 2 | RACI | `RACI_Matrix.html` | Pendiente |
| 3 | Costos | `Cost-management.html` | Pendiente |
| 4 | Requisitos | `Recopilar_Requisitos.html` | Pendiente |
| 5 | Enunciado del Alcance | `Enunciado_del_Alcance.html` | Pendiente |
| 6 | EDT | `WBS_Builder.html` | Pendiente |
| 7 | Definir Actividades | `Activity_Definition.html` | Pendiente |
| 8 | PERT | `Pert_Analysis.html` | Pendiente |
| 9 | Plan de Cronograma | `Schedule_Management_Plan.html` | Pendiente |
| 10 | Cronograma / CPM | `Cronograma_CPM.html` | Pendiente |
| 11 | Interesados | `Stakeholder_Studio.html` | Pendiente (entregado a alumnos — al final) |
| 12 | Acta de Constitución | `Project_Charter.html` | Pendiente (entregado a alumnos — al final) |
| 13 | Panel de Control | `Panel_Control.html` | Pendiente (punto de entrada — absolutamente al final) |

## Hallazgos de la Fase 3 (ajustan el alcance original)

Antes de extraer nada se comparó el contenido real de los 13 módulos, no
solo los nombres de función. Dos supuestos del plan original no se
sostuvieron y se corrigieron:

- **`kpi()` NO se unifica.** Solo `Panel_Control.html` tiene una función
  `kpi()` (fila valor+unidad+etiqueta). `Cost-management.html` y
  `Recopilar_Requisitos.html` usan la clase CSS `.kpi` para una **tarjeta**
  visualmente distinta (borde+fondo+`.lab`/`.val`). Es una colisión de
  nombre entre dos componentes distintos, no una duplicación real —
  unificarlos habría sido inventar un diseño nuevo, no extraer código
  repetido. `GPI.ui.kpi()` replica fielmente la única implementación real
  (la de Panel_Control); los otros dos módulos eligen su propio nombre de
  clase al migrarse en la Fase 4 para no chocar.
- **La lógica JS de los modales NO se unifica.** Aunque el CSS
  (`.modal-overlay`/`.modal-card`) es casi idéntico en 11 archivos, el
  *comportamiento* JS tiene al menos 5 firmas de función distintas entre
  los 13 módulos: `showModal(opts)`, `showModal({title,message,
  confirmText,cancelText,danger})`, `baseModal/confirmModal/promptModal`
  (Panel_Control), `openFormModal` (Recopilar_Requisitos), `confirmModal`
  posicional (Enunciado del Alcance), `showModalHTML` (Cronograma_CPM).
  Unificar esas firmas es un rediseño de 13 módulos, no una extracción de
  duplicados — contradice el principio "port mecánico, no refactor" de la
  Fase 1. Solo se extrajo la CSS del contenedor a `gpi-shared.css`.
- **Hallazgo colateral:** `scripts/check-shared-snippets.mjs` detectó que
  `Cost-management.html` y `Recopilar_Requisitos.html` cargan una URL de
  Google Fonts *distinta* a los otros 11 módulos (les falta la familia
  "Inter" y difieren los pesos tipográficos). Es preexistente a esta
  migración, no algo que haya cambiado. Queda pendiente para cuando esos
  dos módulos se migren en la Fase 4 (o antes, si se quiere corregir por
  separado).

## Hallazgos de la Fase 4 (por módulo migrado)

**OBS_Builder.html (piloto, primer módulo migrado):**

- **No se tocó `escapeHtml`/`escapeAttr`** en el módulo: sigue 100% autocontenido,
  sin depender de `GPI.ui.esc`. Las 12 herramientas (todas menos
  `Panel_Control.html`) están diseñadas para seguir funcionando aunque
  `gpi-core.js` no cargue ("modo independiente" del README); si el `esc()`
  local dependiera de `window.GPI.ui`, un fallo de carga del núcleo
  rompería el renderizado COMPLETO del módulo, no solo la sincronización
  con el Panel. Decisión validada con el usuario: se deja el `esc()` local
  tal cual en los 12 módulos, en todos los que sigan.
- **Sí se adoptó `gpi-shared.css`** para el modal: si ese `<link>` fallara
  al cargar, el modal se ve sin estilo pero sigue funcionando (degradación
  visual, no funcional) — riesgo muy distinto al de una dependencia JS dura.
- **Bug de build descubierto y corregido**: `configs/lib.config.mjs`
  heredaba `rollupOptions.output.exports:"named"` de la config de
  `gpi-core` (que sí tiene ~40 named exports). Los módulos de página no
  exportan nada; con `exports:"named"` forzado y cero exports reales,
  Rollup generaba un IIFE roto (`Object.defineProperty(exports, ...)` sin
  el parámetro `exports` en la función envolvente) que tiraba
  `ReferenceError: exports is not defined` apenas cargaba en el navegador.
  Se corrigió quitando esa opción del helper compartido de módulos de
  página (`gpi-core.js` conserva su propia config con named exports).
- **Limitación de jsdom descubierta**: jsdom trata `file://` como origen
  OPACO y bloquea `localStorage` por completo (`SecurityError`), a
  diferencia de los navegadores reales (Chrome/Firefox sí permiten
  localStorage en `file://` — así es como esta app funciona hoy). Bajo
  `file://` en jsdom, `GPI.available()` da `false` y el puente con el
  Panel no hace nada — no es un bug de la app, es una limitación del
  entorno de prueba. Los smoke tests de módulos (`tests/smoke/*.smoke.test.ts`)
  sirven el proyecto por HTTP local (servidor efímero en el propio test)
  en vez de abrir el archivo directo, para evitar este falso negativo.

## Fases

- **Fase 0** — Control de versiones. ✅ Hecho (`git init`, commit baseline,
  tag `baseline-pre-migracion`).
- **Fase 1** — Bootstrap de Vite + TypeScript, port de `gpi-core.ts`. ✅ Hecho.
  `npm run build:core` compila `src/core/gpi-core.ts` → `gpi-core.js` (IIFE,
  se commitea). `npm run typecheck` corre `tsc --noEmit`. `npm test` corre
  Vitest (11 tests: fuente TS + artefacto compilado en jsdom). Ver el
  commit `core: port gpi-core.js a TypeScript (Fase 1)`.
- **Fase 2** — Vitest sobre `GPI.util`, priorizado por riesgo. ✅ Hecho.
  94 tests en 8 archivos (`tests/unit/`), incluyendo la regresión dorada
  DISTRIB+ contra `cpm` (dataset real tomado de `Cronograma_CPM.html`:
  53 días, fin 2026-09-16, ruta crítica `a1-a2-a3-a4-a8-a9-a10-a11-a12`,
  verificado exacto contra el README). Cobertura: `cpm` (tipos de relación,
  lags, ciclos), `pertProbability` (simetría, monotonicidad, valores de
  referencia), parsers de predecesoras (`parsePredecessorCell`,
  `buildScheduleLinks`, `scheduleValidate`), los 5 audits + `traceMatrix`
  (incluido el "cruce fino" DEL↔WP que el README documenta como el bug más
  sutil), helpers de árbol WBS/OBS, y los getters simples (con
  compatibilidad de esquema antiguo en `charterRans`).
- **Fase 3** — Extraer duplicados. ✅ Hecho, con alcance ajustado (ver
  "Hallazgos" arriba): `GPI.ui.esc/kpi` en `gpi-core.ts`, y
  `gpi-shared.css` (generado con `npm run build:shared` desde
  `src/shared/styles/shared.css`) con la CSS común del modal. La lógica
  JS de los modales y la clase `.kpi` de Cost-management/Recopilar
  Requisitos NO se tocan. `npm run check:snippets` audita que el `<link>`
  de Google Fonts siga igual entre módulos (ya encontró una divergencia
  preexistente, ver arriba).
- **Fase 4** — Migración de los 13 módulos, en el orden de la tabla. En
  progreso: 1/13 (`OBS_Builder.html`). Patrón establecido: `src/modules/<key>/main.ts`
  + `configs/<key>.vite.config.ts` (usa el helper `configs/lib.config.mjs`)
  + `npm run build:<key>` + `tests/smoke/<key>.smoke.test.ts`.
- **Fase 5** — Verificación de despliegue (GitHub Pages y `file://`).

Ver el plan completo en el historial de la conversación / plan aprobado para
el detalle de cada fase.
