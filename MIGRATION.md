# Migración a TypeScript + Vite — bitácora histórica

**Migración completa: 13/13 módulos + Fase 5 de verificación.** Este
documento es la crónica de cómo se hizo, con fecha y evidencia puntual
de cada paso — ya no se actualiza salvo que se reabra una fase futura.

- Para la referencia arquitectónica permanente que dejó esta migración
  (qué patrón usa cada módulo, por qué difiere del común, cómo
  verificar equivalencia de comportamiento): [ARCHITECTURE.md](ARCHITECTURE.md).
- Para las reglas operativas vigentes (comandos, qué no tocar, cómo
  agregar un módulo nuevo): [CLAUDE.md](CLAUDE.md).
- Para documentación funcional de cara al alumno: [README.md](README.md).

## Estado final: 13/13 módulos migrados

| Orden | Módulo | Archivo | Estado |
|---|---|---|---|
| — | Núcleo | `gpi-core.js` → `src/core/gpi-core.ts` | ✅ Migrado (Fase 1) |
| 1 | OBS | `OBS_Builder.html` | ✅ Migrado |
| 2 | RACI | `RACI_Matrix.html` | ✅ Migrado |
| 3 | Costos | `Cost-management.html` | ✅ Migrado |
| 4 | Requisitos | `Recopilar_Requisitos.html` | ✅ Migrado |
| 5 | Enunciado del Alcance | `Enunciado_del_Alcance.html` | ✅ Migrado |
| 6 | EDT | `WBS_Builder.html` | ✅ Migrado |
| 7 | Definir Actividades | `Activity_Definition.html` | ✅ Migrado |
| 8 | PERT | `Pert_Analysis.html` | ✅ Migrado |
| 9 | Plan de Cronograma | `Schedule_Management_Plan.html` | ✅ Migrado |
| 10 | Cronograma / CPM | `Cronograma_CPM.html` | ✅ Migrado |
| 11 | Interesados | `Stakeholder_Studio.html` | ✅ Migrado |
| 12 | Acta de Constitución | `Project_Charter.html` | ✅ Migrado |
| 13 | Panel de Control | `Panel_Control.html` | ✅ Migrado |

## Hallazgos de la Fase 3 (ajustan el alcance original)

Antes de extraer nada se comparó el contenido real de los 13 módulos, no
solo los nombres de función. Dos supuestos del plan original no se
sostuvieron y se corrigieron:

- **`kpi()` NO se unifica.** Solo `Panel_Control.html` tiene una función
  `kpi()` (fila valor+unidad+etiqueta). `Cost-management.html` y
  `Recopilar_Requisitos.html` usan la clase CSS `.kpi` para una **tarjeta**
  visualmente distinta. Es una colisión de nombre entre dos componentes
  distintos, no una duplicación real — unificarlos habría sido inventar
  un diseño nuevo, no extraer código repetido.
- **La lógica JS de los modales NO se unifica.** Aunque el CSS es casi
  idéntico en 11 archivos, el *comportamiento* JS tiene al menos 5
  firmas de función distintas entre los 13 módulos. Unificarlas es un
  rediseño de 13 módulos, no una extracción de duplicados — contradice
  el principio "port mecánico, no refactor". Solo se extrajo la CSS del
  contenedor a `gpi-shared.css`.
- **Hallazgo colateral:** `scripts/check-shared-snippets.mjs` detectó
  que `Cost-management.html` y `Recopilar_Requisitos.html` cargan una
  URL de Google Fonts *distinta* a los otros 11 módulos. Preexistente a
  esta migración, no algo que haya cambiado.

Los patrones y particularidades permanentes que dejó cada módulo migrado
en la Fase 4 (a qué otros módulos lee, qué excepción de cableado usa,
etc.) se movieron a [ARCHITECTURE.md](ARCHITECTURE.md) — no se repiten
aquí. Lo que sigue es la evidencia puntual de verificación de cada uno
al momento de migrarlo.

### Evidencia de verificación por módulo (Fase 4)

- **Panel_Control.html**: con `localStorage` vacío, `ensureSeed()` crea
  el proyecto DISTRIB+ y el launcher pinta las 21 tarjetas de módulo
  (12 "activas" con `MODULOS_ENTREGADOS="*"`, 9 "próximamente"); con un
  proyecto real con EDT + interesados + acta poblados, el tablero
  integrado muestra correctamente el conteo de interesados, el costo
  rollup de la EDT y el porcentaje de completitud del acta (78%,
  verificado contra el mismo `charterAudit` que ya tiene regresión en
  Vitest); "Vaciar" un módulo persiste `null` correctamente.
- **Project_Charter.html**: sin proyecto activo arranca vacía (0% de
  completitud) y "Cargar ejemplo" lleva el checklist DISTRIB+ a 100%
  (23 ítems, 4 RAN, 4 objetivos); con un proyecto real, precarga
  sponsor/director/CAPEX desde los metadatos, importa un hito de EDT y
  un interesado clave, y todo persiste en `modules.charter`.
- **Stakeholder_Studio.html**: sin proyecto activo arranca con el
  ejemplo DISTRIB+ (12 interesados) y las 3 vistas renderizan sin
  errores; con un proyecto real sin interesados aún, arranca en blanco
  (un único interesado placeholder, no los 12 de DISTRIB+); se verificó
  puntualmente que bajar el criterio "Control de recursos" de 5 a 1 en
  un interesado con pesos iguales cambia el Poder mostrado de 95 a 75
  exactamente, confirmando que la fórmula ponderada se portó bit a bit.
- **Cronograma_CPM.html**: el modo ejemplo DISTRIB+ reproduce
  exactamente el resultado dorado (53 días laborables, fin 2026-09-16,
  9 actividades críticas — ver el dataset de referencia en
  ARCHITECTURE.md); con un proyecto real con dos actividades sin
  enlazar, la duración es la de la actividad más larga; al agregar un
  enlace manual FS, la duración se recalcula a la suma de ambas.
- **Schedule_Management_Plan.html**: sin proyecto activo arranca con el
  ejemplo DISTRIB+ y el checklist marca 100% (18 ítems); con un
  proyecto real con EDT+OBS+RACI, arranca en blanco, los paneles de
  vínculo cruzado (EDT, reserva, cobertura RACI) calculan correctamente,
  e "Importar hitos desde la EDT" persiste en `modules.schedulePlan`.
- **Pert_Analysis.html**: sin proyecto activo arranca en blanco; en modo
  ejemplo detecta la terna inválida deliberada de `a8` y calcula una
  ruta crítica de 9 actividades con ΣTE≈69.2 d y probabilidad ≈89.2%;
  con un proyecto real, la M automática sigue la Dur base (100/25=4), y
  O=2/P=8 da TE=(2+4×4+8)/6=4.33 exacto, persistido en `modules.pert`.
- **Activity_Definition.html**: sin proyecto activo arranca en blanco;
  con un proyecto real con EDT propia, Metrado=100/Rendimiento=25
  calcula Dur=4 y persiste en `modules.activities`.
- **WBS_Builder.html**: el ejemplo DISTRIB+ calcula el costo total
  exacto documentado en el README (S/ 7,100,000); con una Matriz RACI
  real, el campo Responsable aparece bloqueado y prellenado desde el OBS.
- **Enunciado_del_Alcance.html**: con Acta/Requisitos/EDT reales pero
  sin `modules.scopeStatement`, arranca en blanco; "↧ Sugerir desde el
  Acta" trae el entregable declarado y lo persiste.
- **Recopilar_Requisitos.html**: con Acta/Interesados/EDT reales pero
  sin `modules.requirements`, arranca en blanco; los picklists de RAN y
  de la EDT muestran datos reales del proyecto (no la demo); al
  guardar, el requisito queda enlazado correctamente.
- **Cost-management.html**: el ejemplo por defecto calcula el BAC
  documentado en el README (base 7.100.000 → BAC 8.075.181, Clase
  3/P70) exacto; `save()` sin editar nada no persiste nada,
  `pullFromWBS()` (una edición real) sí.
- **RACI_Matrix.html**: al asignar "R" en una celda, `applyRaciToWbs`
  reescribe `wbs.nodes.<leafId>.resource` correctamente y
  `setModule("raci", …)` persiste — cubierto en
  `tests/smoke/raci-matrix.smoke.test.ts`.
- **OBS_Builder.html** (piloto): validó de punta a punta el patrón base
  y descubrió dos problemas de tooling ya resueltos permanentemente —
  ver "Trampas ya encontradas" en CLAUDE.md (el bug de
  `exports:"named"` en Rollup y el bloqueo de `localStorage` de jsdom
  bajo `file://`).

## Fases

- **Fase 0** — Control de versiones. ✅ Hecho (`git init`, commit
  baseline, tag `baseline-pre-migracion`).
- **Fase 1** — Bootstrap de Vite + TypeScript, port de `gpi-core.ts`. ✅
  Hecho. `npm run build:core` compila `src/core/gpi-core.ts` →
  `gpi-core.js` (IIFE, se commitea). Ver el commit `core: port
  gpi-core.js a TypeScript (Fase 1)`.
- **Fase 2** — Vitest sobre `GPI.util`, priorizado por riesgo. ✅ Hecho.
  94 tests en 8 archivos (`tests/unit/`), incluyendo la regresión dorada
  DISTRIB+ contra `cpm` (ver el dataset de referencia en
  ARCHITECTURE.md). Cobertura: `cpm` (tipos de relación, lags, ciclos),
  `pertProbability` (simetría, monotonicidad, valores de referencia),
  parsers de predecesoras, los 5 audits + `traceMatrix` (incluido el
  "cruce fino" DEL↔WP que el README documenta como el bug más sutil),
  helpers de árbol WBS/OBS, y los getters simples.
- **Fase 3** — Extraer duplicados. ✅ Hecho, con alcance ajustado (ver
  "Hallazgos" arriba): `GPI.ui.esc/kpi` en `gpi-core.ts`, y
  `gpi-shared.css` (generado con `npm run build:shared` desde
  `src/shared/styles/shared.css`) con la CSS común del modal.
- **Fase 4** — Migración de los 13 módulos, en el orden de la tabla. ✅
  Completa. Patrón establecido: `src/modules/<key>/main.ts` +
  `configs/<key>.vite.config.ts` (usa el helper
  `configs/lib.config.mjs`) + `npm run build:<key>` +
  `tests/smoke/<key>.smoke.test.ts`. 132 tests en verde, `tsc --noEmit`
  limpio en todo el proyecto.
- **Fase 5** — Verificación de despliegue (GitHub Pages y `file://`). ✅
  Hecha. Ver "Resultados de la Fase 5" abajo.

## Resultados de la Fase 5 (verificación de despliegue)

La metodología reusable (cómo se genera el fixture, cómo se compara,
qué se normaliza) vive en [ARCHITECTURE.md](ARCHITECTURE.md), sección
"Cómo verificar equivalencia de comportamiento". Lo que sigue es el
resultado concreto de la última corrida completa, contra el tag
`baseline-pre-migracion`.

### 1. Auditoría estática — `npm run verify:deploy`

`scripts/verify-deploy.mjs` queda en el repositorio como comprobación
permanente antes de publicar (ver CLAUDE.md). En esta corrida: los 14
artefactos fueron IIFE clásicos válidos, los 13 HTML sin
`type="module"` ni rutas absolutas y con todos sus `<script src>`/
`<link href>` presentes, y los 13 seguían cargando `gpi-core.js` sin
lógica inline residual.

### 2. Equivalencia A/B contra el baseline pre-migración

**Resultado: las 13 páginas produjeron el mismo texto renderizado y el
mismo `gpi_db`**, normalizando únicamente las marcas de tiempo escritas
en el momento de la corrida (p. ej. el campo `updated` del BOE de
Costos). Dos diferencias aparecieron en la primera pasada y ambas
quedaron explicadas, ninguna atribuible al port:

- **`Cost-management.html`**: solo el `updated` del BOE (ISO 8601) —
  ruido temporal, no de datos.
- **`Panel_Control.html`**: el baseline mostraba "🔒 Se habilita más
  adelante" en 10 de las 12 herramientas porque su
  `MODULOS_ENTREGADOS` era `["charter","stakeholders"]`. Al igualar esa
  configuración a `"*"` en el worktree del baseline, el texto pasó a
  ser **idéntico**. Confirma que el cambio de entrega solicitado a
  mitad de la migración es la única causa, y que el port del Panel no
  alteró nada.

### 3. Modo `file://` (doble clic)

Las 13 páginas se abrieron por `file://` en ambas versiones: **texto
renderizado idéntico y cero errores reales** en las dos. Es la prueba
directa de que los bundles IIFE cargan y ejecutan sin servidor, que era
el riesgo principal de introducir un empaquetador.

### 4. Documentación alineada

`README.md` se actualizó donde la migración lo dejó obsoleto — en
particular la instrucción de configurar la entrega de módulos "en el
`<script>` de `Panel_Control.html`", que ya no existe: ahora es
`src/modules/panel-control/main.ts` + `npm run build:panel-control`. Se
añadió una sección **Desarrollo** con los comandos y el mapa
`src/ → artefacto`.

## Trabajo posterior a la migración (fuera de las 5 fases originales)

Registrado aquí por continuidad histórica; el detalle de cada punto
vive en CLAUDE.md/ARCHITECTURE.md, que sí se mantienen actualizados:

- **CI** (`ci.yml`): typecheck + lint + test + build:all + verify:deploy
  en cada push/PR a `master`.
- **Auditoría de `any`**: reducción de ~110 usos a ~25, todos límites
  documentados de datos externos — ver CLAUDE.md.
- **ESLint + Prettier**: bloqueo real de compatibilidad encontrado y
  resuelto (typescript-eslint no soporta TypeScript ≥7; se bajó a 6.x)
  — ver CLAUDE.md, "Trampas ya encontradas".
- **LICENSE (MIT) y Dependabot**: gobernanza básica del repositorio.
