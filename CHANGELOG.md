# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/). Este archivo empieza a
mantenerse a partir de esta entrada — no es una reconstrucción día por día de
cada commit, sino un resumen agrupado de lo entregado hasta ahora. De aquí en
adelante, cada cambio notable se agrega bajo `[Unreleased]` a medida que
ocurre, moviéndose a una entrada con fecha cuando se corte una versión.

## [Unreleased]

### Added

- Tests E2E en navegador real (Playwright, `tests/e2e/`): cierran la
  brecha de que Vitest+jsdom no puede probar `localStorage` bajo
  `file://`. Un spec prueba que un cambio sobrevive una recarga real de
  la página abierta por `file://`; otro prueba que dos módulos HTML
  distintos comparten datos bajo el mismo origen HTTP.
- `scripts/static-server.mjs`: servidor HTTP mínimo reutilizado por los
  tests E2E.
- `npm run dev`: expone ese mismo servidor para desarrollo/uso local —
  soluciona que `file://` no comparta `localStorage` de forma confiable
  entre módulos abiertos como documentos distintos (limitación real del
  navegador, no de la app; ver CLAUDE.md).

### Accessibility

Auditoría de accesibilidad completa (dos tandas):

- Contraste de texto: `--ink-2` (etiquetas de campo, pistas, texto de
  ayuda — el tono gris-azulado más reutilizado del design system) pasa
  de `#8992a3` (~3.1:1 contra blanco, bajo el mínimo WCAG AA de 4.5:1)
  a `#5b6472` (~6:1) en los 11 HTML que lo declaran. Incluye dos usos
  adicionales del mismo color encontrados al verificar (el texto de la
  casilla de firma del reporte imprimible en 6 módulos, y `--i-color`
  del badge "I" de RACI_Matrix.html, que tenía texto blanco encima con
  el mismo problema de contraste).
- `aria-label` en 21 botones que solo mostraban un emoji (🗑 ✎ ✕) sin
  texto visible, en 7 módulos — antes, un lector de pantalla anunciaba
  el glifo Unicode en vez de la acción ("Eliminar fila", "Editar
  objetivo", etc.).
- `aria-label` en los 22 inputs de cabecera (`#projectTitle`,
  `#courseTitle`) de los 11 módulos que los tienen sin `<label>` — antes
  un lector de pantalla los anunciaba como campo de texto sin nombre.
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` y un trap de
  foco real (Tab/Shift+Tab ya no escapan hacia el fondo de la página) en
  las 12 implementaciones de modal del ecosistema (no están unificadas
  a propósito — ver ARCHITECTURE.md — así que se tocó cada una por
  separado). Verificado en Chrome real con un test E2E nuevo
  (`tests/e2e/modal-a11y.spec.ts`), no solo por lectura del código.
- El modelo de prominencia de `Stakeholder_Studio.html` (burbujas SVG
  con selección por clic) ahora es navegable por teclado:
  `role="button"`, `tabindex="0"`, `aria-label` con el nombre del
  interesado, y Enter/Espacio para seleccionar — mismo patrón ya usado
  en el acordeón del registro del propio archivo.

### Security

- SRI (`integrity`/`crossorigin`) en el `<script>` de JSZip cargado por
  CDN en `Activity_Definition.html` — única dependencia externa de todo
  el ecosistema.

## [1.0.0] - 2026-09-13

### Added

- Migración completa de los 13 módulos HTML + el núcleo compartido
  (`gpi-core.js`) a TypeScript, compilado con Vite en modo librería
  (formato IIFE), preservando `file://` y GitHub Pages sin paso de build.
  Ver [MIGRATION.md](MIGRATION.md) para la bitácora completa y
  [ARCHITECTURE.md](ARCHITECTURE.md) para la referencia permanente.
- Suite de Vitest: 132 tests (unitarios sobre `GPI.util` — `cpm`,
  `pertProbability`, los 5 audits, helpers de árbol — y smoke tests que
  sirven cada HTML real por HTTP local).
- Medición de cobertura de tests (`@vitest/coverage-v8`), con piso
  aplicado sobre `src/core/**`.
- GitHub Actions CI (`.github/workflows/ci.yml`): typecheck + lint +
  test:coverage + build:all + verify:deploy en cada push/PR a `master`.
- Pre-commit hook local (husky + lint-staged): `eslint --fix` sobre lo
  tocado, más typecheck y build:all completos, antes de cada commit.
- ESLint (`eslint.config.mjs`, flat config) y Prettier configurados
  (Prettier no se aplicó retroactivamente al código existente — ver la
  nota en README.md/CLAUDE.md).
- `scripts/build-all.mjs` (detecta artefactos compilados desactualizados
  respecto de su fuente) y `scripts/verify-deploy.mjs` (audita IIFE, rutas
  relativas, ausencia de `type="module"`) como gates de despliegue.
- `CLAUDE.md` (guía operativa), `ARCHITECTURE.md` (referencia técnica
  permanente, con diagrama Mermaid del sistema) y `MIGRATION.md`
  (bitácora histórica de la migración), como tres documentos con
  responsabilidades separadas.
- `LICENSE` (MIT) y `.github/dependabot.yml` (actualizaciones semanales
  de npm y GitHub Actions).
- Dos tags de git de hito: `migracion-completa` y `auditoria-any-completa`
  (además de `baseline-pre-migracion`, ya existente).

### Changed

- `typescript` bajado de la serie 7 (nativa) a `^6.0.3`: typescript-eslint
  rechaza en tiempo de ejecución correr sobre TypeScript ≥7 (ver
  CLAUDE.md, "Trampas ya encontradas").
- Auditoría de usos de `any` en todo `src/`: de ~110 ocurrencias a ~25,
  las restantes documentadas caso por caso como límites legítimos de
  datos externos (localStorage de esquemas antiguos, `JSON.parse`,
  import/export entre herramientas).

### Fixed

- Bug de `rollupOptions.output.exports:"named"` heredado por los módulos
  de página sin exports reales, que producía `ReferenceError: exports is
  not defined` en el navegador (encontrado en el piloto de la migración,
  OBS_Builder).
- Falso positivo de `git status --porcelain` en Windows con
  `core.autocrlf=true` al comparar artefactos recién compilados.
- Bloqueo de `localStorage` por jsdom bajo `file://` (tratado como origen
  opaco): los smoke tests sirven el proyecto por HTTP local en vez de
  abrir el archivo directo.
- `ERR_INVALID_FILE_URL_PATH` de `@vitest/coverage-v8` en Windows al
  recolectar cobertura sobre un test que usaba una URL `file://`
  sintética sin letra de unidad.
