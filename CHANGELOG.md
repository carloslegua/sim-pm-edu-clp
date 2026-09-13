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
