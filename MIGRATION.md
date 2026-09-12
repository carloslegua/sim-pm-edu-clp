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
| — | Núcleo | `gpi-core.js` → `src/core/gpi-core.ts` | En progreso (Fase 1) |
| 1 | OBS | `OBS_Builder.html` | Pendiente |
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

## Fases

- **Fase 0** — Control de versiones. ✅ Hecho (`git init`, commit baseline,
  tag `baseline-pre-migracion`).
- **Fase 1** — Bootstrap de Vite + TypeScript, port de `gpi-core.ts`. En
  progreso.
- **Fase 2** — Vitest sobre `GPI.util`, priorizado por riesgo (`cpm`,
  `pertProbability`, parsers de predecesoras, audits, helpers de árbol,
  getters simples).
- **Fase 3** — Extraer duplicados (`GPI.ui.esc/kpi/modal`, `gpi-shared.css`).
- **Fase 4** — Migración de los 13 módulos, en el orden de la tabla.
- **Fase 5** — Verificación de despliegue (GitHub Pages y `file://`).

Ver el plan completo en el historial de la conversación / plan aprobado para
el detalle de cada fase.
