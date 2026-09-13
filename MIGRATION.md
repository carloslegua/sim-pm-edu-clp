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
| 2 | RACI | `RACI_Matrix.html` | ✅ Migrado |
| 3 | Costos | `Cost-management.html` | ✅ Migrado |
| 4 | Requisitos | `Recopilar_Requisitos.html` | ✅ Migrado |
| 5 | Enunciado del Alcance | `Enunciado_del_Alcance.html` | ✅ Migrado |
| 6 | EDT | `WBS_Builder.html` | ✅ Migrado |
| 7 | Definir Actividades | `Activity_Definition.html` | ✅ Migrado |
| 8 | PERT | `Pert_Analysis.html` | ✅ Migrado |
| 9 | Plan de Cronograma | `Schedule_Management_Plan.html` | ✅ Migrado |
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

**Schedule_Management_Plan.html (noveno módulo migrado, el HTML más grande hasta ahora):**

- Mismo patrón que los anteriores: `addEventListener` exclusivamente
  (incluidas las tablas editables genéricas `renderEditableTable`/
  `renderSimpleList`, componentes reutilizados internamente por 4 tablas
  distintas del documento), `window.GPI` explícito, IIFE propio. CSS del
  modal idéntica byte a byte a `gpi-shared.css` — solo override de ancho
  (400px).
- A diferencia de los módulos de cálculo (OBS, WBS, PERT...), este es un
  **documento vivo** de 15 secciones (checklist AACE RP 38R-06 + salidas
  de PMBOK "Plan Schedule Management"): no tiene "modo ejemplo" separado
  de los datos reales. En su lugar, `init()` carga el ejemplo DISTRIB+
  incondicionalmente al arrancar, y el puente con el Panel (`gpiBridge`,
  un SEGUNDO listener de `DOMContentLoaded` independiente del de `init()`,
  ambos preservados tal cual) lo **sobrescribe con un estado en blanco**
  si hay un proyecto activo sin plan guardado — es la "regla de oro" de
  este módulo: nunca graba el ejemplo DISTRIB+ encima de un proyecto real
  por accidente al salir de la página.
- El esquema del plan (`ScheduleState`, con 15 sub-objetos: intro,
  methodology, calendar con horario tipo "Cambiar calendario laboral" de
  MS Project, umbrales de control con banda ámbar derivada, hitos, roles,
  etc.) se tipó **localmente en el módulo**, no en
  `SchedulePlanModule` de `core/types.ts` (que es deliberadamente laxo —
  varios campos `Record<string, unknown>` — porque `gpi-core.ts` solo
  necesita leer un puñado de sub-campos para `schedulePlanAudit`). Este
  módulo es el dueño real del esquema completo; `GPI.setModule`/
  `getModule` aceptan el tipo local sin fricción porque sus firmas son
  estructuralmente compatibles (`unknown` de entrada, tipos laxos de
  salida).
- Primer módulo migrado que consume `GPI.util.wbsRollup`, `wbsPhases` y
  `raciCoverage` simultáneamente (para los 3 paneles informativos de
  vínculo cruzado: datos comunes del proyecto, estado de la EDT vinculada,
  cómputo automático de días de reserva, y cobertura RACI) — los tres ya
  cubiertos por Vitest desde la Fase 2.
- Verificado de punta a punta (servido por HTTP local): sin proyecto
  activo, arranca con el ejemplo DISTRIB+ y el checklist de completitud
  marca 100% (18 ítems); con un proyecto real con EDT+OBS+RACI, arranca
  en blanco, el panel de EDT vinculada muestra correctamente "1 fase(s),
  1 paquete(s) de trabajo" con su costo, el panel de cobertura RACI
  reporta "1/1 con Responsable asignado", y "Importar hitos desde la EDT"
  agrega correctamente un hito "Fin de Fase 1" que persiste en
  `gpi_db.projects.<id>.modules.schedulePlan`.

**Pert_Analysis.html (octavo módulo migrado):**

- Mismo patrón que los anteriores: `addEventListener` exclusivamente
  (`wireToolbar`, `wireGrid`, menú contextual por clic derecho),
  `window.GPI` explícito, IIFE propio. CSS del modal idéntica byte a byte
  a `gpi-shared.css` (incluido el `.modal-card h3` sin `color` explícito:
  hereda `color:var(--ink-0)` del `body`, visualmente idéntico al de
  `gpi-shared.css` que sí lo declara) — se dejó solo el override de ancho
  (400px) y se adoptó el `<link>`.
  Primer módulo migrado que consume `GPI.util.cpm`, `GPI.util
  .pertProbability` y `GPI.util.projectCalendar` directamente (los tres ya
  cubiertos por Vitest desde la Fase 2) para calcular la ruta crítica
  **probabilística**: a diferencia de Cronograma/CPM (que usa duraciones
  determinísticas), aquí el CPM se recalcula con las duraciones esperadas
  (TE) de cada actividad — es el "CPM sobre TE" clásico del método PERT,
  con las actividades sin terna completa entrando con su duración base y
  varianza 0 (marcadas con `*`, con aviso de que la probabilidad está
  sobrestimada hasta completarlas).
  La M (más probable) tiene un modo "automático" que sigue en vivo a la
  duración determinística `Dur = Met/(#Eq×R)` del módulo Definir las
  Actividades — escribir un valor la fija manualmente; borrarlo la
  regresa al automático. Se preservó íntegra la grilla estilo Excel
  (pegado TSV, navegación de teclado, selección de rango, menú
  contextual) y el modo de ingreso de O/P alternable entre días y % de M.
- Verificado de punta a punta (servido por HTTP local): sin proyecto
  activo arranca en blanco (mismo patrón que WBS/Activity_Definition); en
  modo ejemplo (dataset DISTRIB+, compartido con Cronograma/CPM) detecta
  correctamente la terna inválida deliberada de `a8` (fila en rojo,
  aviso lateral) y calcula una ruta crítica de 9 actividades con
  ΣTE≈69.2 d y probabilidad ≈89.2% de cumplir el plazo por defecto; con un
  proyecto real, la M automática sigue la Dur base (100/25=4), y al
  ingresar O=2/P=8 la TE calculada es exactamente (2+4×4+8)/6=4.33,
  persistida en `gpi_db.projects.<id>.modules.pert`.

**Activity_Definition.html (séptimo módulo migrado):**

- Mismo patrón que OBS/RACI/Enunciado del Alcance/WBS: `addEventListener`
  exclusivamente (`wireToolbar`, `wireTableDelegation`, `wireGridSelection`),
  `window.GPI` explícito, IIFE propio — sin necesidad de `Object.assign(window,
  {...})`. CSS del modal idéntica byte a byte a la de los otros 11 módulos
  salvo el ancho (`width:400px`); se armonizó igual que WBS/OBS/RACI/Enunciado,
  dejando solo el override de ancho y adoptando `gpi-shared.css`.
- Único módulo hasta ahora que depende de una librería externa vía CDN
  (`window.JSZip`, cargado desde cdnjs, para generar el `.xlsx` de
  exportación a MS Project) además de `gpi-core.js`. Se tipó con una interfaz
  mínima local (`JSZipLike`) en vez de instalar `@types/jszip`, ya que el
  port es mecánico y solo usa `file()`/`generateAsync()`; si `JSZip` no
  carga (offline), la propia lógica original ya cae a un CSV equivalente
  (`buildCsv()`), comportamiento preservado sin cambios.
- La EDT se **lee** en vivo desde `GPI.getModule("wbs")` (nunca se duplica):
  las actividades se guardan en un módulo nuevo, `GPI.getModule("activities")`,
  indexado por el id de cada paquete de trabajo (hoja de la EDT). La
  numeración de filas replica el modelo de MS Project (`fullRows()`): fila 0
  es siempre el proyecto, con un contador `n` consecutivo cruzando fases,
  paquetes y actividades — se preservó igual, junto con el pegado tipo Excel
  (TSV), la navegación de grilla con teclado y el cálculo de duración
  derivado `Dur = Met / (#Eq × R)` redondeado con `Math.ceil`.
- Verificado de punta a punta (servido por HTTP local): sin proyecto activo
  (localStorage vacío vía HTTP) arranca en blanco, igual que WBS Builder —
  no entra en modo ejemplo automáticamente porque `GPI.available()` es
  verdadero aunque no haya proyecto activo (el "modo ejemplo" es una acción
  explícita del botón, no un fallback). Con un proyecto real con EDT propia,
  agregar una actividad con Metrado=100 y Rendimiento=25 calculó la
  duración derivada en 4 días y persistió correctamente en
  `gpi_db.projects.<id>.modules.activities`.

**WBS_Builder.html (sexto módulo migrado, el de mayor fan-out):**

- Mismo patrón que OBS/Enunciado del Alcance: `addEventListener`
  exclusivamente, `window.GPI` explícito, IIFE propio, CSS del modal
  idéntico byte a byte al de OBS (mismo `width:360px`, mismos márgenes)
  — se armonizó sin ningún ajuste especial.
- El módulo con más integraciones cruzadas de todo el ecosistema: lee
  `raci` (bloquea el campo "Responsable" de un paquete si la RACI ya
  le asignó un "R" — `raciLocksResource`), `obs` (autocompletado de
  responsables) y `scopeStatement` (siembra de entregables como ramas
  de nivel 1 vía `seedFromScope`). Los tres se mantuvieron sin tocar la
  lógica, solo tipados.
- Verificado de punta a punta (servido por HTTP local): el ejemplo
  DISTRIB+ calcula el costo total exacto documentado en el README
  (S/ 7,100,000, el "Estimado base (EDT)" de la cadena Acta→EDT→Costos);
  y con una Matriz RACI real donde un paquete tiene "R" asignado, el
  campo Responsable del panel de propiedades aparece bloqueado y
  prellenado con el nombre correcto desde el OBS.

**Enunciado_del_Alcance.html (quinto módulo migrado):**

- Vuelve al patrón `addEventListener`/`.onclick=` (como OBS/RACI, no
  atributos inline), usa `window.GPI` explícito, y está envuelto en un
  IIFE propio — sin necesidad de exponer nada en `window`.
- Primer caso real de conflicto de márgenes con `gpi-shared.css`: el
  `.modal-card h3` de este módulo tenía `margin:0 0 14px` (vs. 10px del
  shared) y `.modal-actions` traía un `margin-top:6px` extra. Se armonizó
  a favor del valor compartido (diferencia ≤6px, tratada como ruido
  visual, no como decisión de diseño a preservar) — ver el comentario que
  quedó en el CSS del módulo explicando la regla.
- Es el módulo de solo-lectura más complejo del ecosistema: su pestaña
  "Consistencia" consume `GPI.util.traceMatrix` (RAN→REQ→DEL→WP), la
  función de integración vertical más elaborada del núcleo.
- Verificado de punta a punta (servido por HTTP local): con un proyecto
  activo con Acta/Requisitos/EDT reales pero sin `modules.scopeStatement`,
  arranca en blanco (regla de oro); "↧ Sugerir desde el Acta" trae
  correctamente el entregable declarado en `charter.deliverables` y lo
  persiste en `GPI.getModule("scopeStatement")`.

**Recopilar_Requisitos.html (cuarto módulo migrado):**

- El más grande hasta ahora (~800 líneas de lógica). Mismo patrón que
  Cost-management: atributos `onclick`/`onchange` inline (13 funciones,
  varias generadas dinámicamente en filas de la matriz, tarjetas de
  modificación y celdas de tabla), `GPI` referenciado como global bare, y
  `Object.assign(window, {...})` al final para exponerlas.
- Usa **su propio modal** con clases `.ov`/`.modal` (no `.modal-overlay`/
  `.modal-card` como los demás) — otra confirmación de que no hay un
  único sistema de modales en el ecosistema. No se agregó `gpi-shared.css`
  porque no habría ninguna clase que aprovechar.
- Es el módulo con más lecturas cruzadas del ecosistema: lee `charter`
  (RAN), `stakeholders` (origen del requisito) y `wbs` (trazabilidad hacia
  la EDT) simultáneamente, con datos de demostración propios (`DEMO`) que
  imitan esas tres estructuras para el modo suelto.
- Verificado de punta a punta (servido por HTTP local): con un proyecto
  activo con Acta/Interesados/EDT reales pero sin `modules.requirements`
  aún, el módulo arranca **en blanco** (regla de oro, no carga DISTRIB+
  encima); al abrir el editor de un requisito nuevo, los "picklists" de
  RAN y de paquetes de la EDT muestran los datos reales del proyecto
  (no la demo); y al guardar, el requisito queda enlazado correctamente
  al RAN y al paquete de la EDT reales en `GPI.getModule("requirements")`.

**Cost-management.html (tercer módulo migrado):**

- **Diferencia estructural importante**: a diferencia de OBS/RACI (que usan
  `addEventListener` exclusivamente), el HTML de este módulo usa atributos
  `onclick`/`onchange`/`oninput` **inline** (`onclick="exportJSON()"`, etc.)
  para ~10 funciones, dos de ellas generadas dinámicamente en filas de
  tabla (`coStatus(this)`, `delCO(i)`). Vite compila cada módulo en su
  propio closure aislado: esas funciones dejan de ser accesibles por
  nombre desde el HTML a menos que se expongan explícitamente. Solución:
  `Object.assign(window, { exportJSON, importJSON, save, recalcCont,
  onBaseInput, pullFromWBS, addCO, coStatus, delCO, buildDoc })` al final
  de `main.ts`. El HTML **no** se reescribió a `addEventListener` — hubiera
  sido un cambio de alcance mayor a "portar a TypeScript". Los próximos
  módulos deben revisarse por este mismo patrón antes de asumir que
  `addEventListener` es universal en el ecosistema.
- Este módulo referencia `GPI` como identificador **global bare** (sin
  `window.` prefijo) en todo el archivo, a diferencia de OBS/RACI que sí
  usan `window.GPI`. Se declaró `declare global { var GPI: GpiApi |
  undefined }` en vez de `interface Window { GPI }`, para tipar fielmente
  el patrón real del archivo.
- No usa modales (`.modal-overlay`/`.modal-card`): usa un toast propio. No
  se agregó `<link rel="stylesheet" href="gpi-shared.css">` porque no
  habría ninguna regla que aprovechar — no todos los módulos necesitan el
  CSS compartido.
- Verificado de punta a punta (servido por HTTP local): el ejemplo por
  defecto calcula el BAC documentado en el README (base 7.100.000 → BAC
  8.075.181, Clase 3/P70) exacto; el botón "+ Agregar" (onclick inline)
  funciona a través del bundle; y la "regla de oro" de `Cost-management`
  (no crear `modules.cost` hasta la primera edición real del alumno) se
  comporta igual que antes: `save()` sin editar nada no persiste nada,
  `pullFromWBS()` (una edición real) sí.

**RACI_Matrix.html (segundo módulo migrado):**

- Este módulo SÍ depende de `window.GPI.util` para su propia lógica (no
  solo para sincronizar con el Panel): `wbsLeaves`, `obsNodes`, `raciAudit`,
  `applyRaciToWbs` en modo "live". El modo "sample" (ejemplo DISTRIB+
  desconectado) sigue funcionando sin GPI, igual que OBS.
- `GPI.util.raciAudit` espera `WbsLeafRow[]`/`ObsNodeRow[]` completos (con
  `resource`/`email`); el estado local de este módulo no los necesita para
  su propio render. Se adaptan solo en la frontera de esa llamada
  (`rows.map(r => ({...r, resource: ""}))`) en vez de cargar esos campos
  sin uso en todo el módulo.
- Verificado con datos reales de principio a fin: al hacer clic en una
  celda para asignar "R", `GPI.util.applyRaciToWbs` reescribe
  `wbs.nodes.<leafId>.resource` correctamente y `GPI.setModule("raci", …)`
  persiste la asignación — probado en `tests/smoke/raci-matrix.smoke.test.ts`.
- El ejemplo DISTRIB+ (modo "sample") trae 7 errores deliberados a propósito
  (documentados en el propio código): el test de humo verifica que el
  Velocímetro de Gobernanza siga marcando "🔴 RECHAZADO", no "🟢 CERTIFICADO"
  — si algún día cambia, es señal de que algo en `raciAudit` o en el dataset
  de ejemplo se rompió.

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
  progreso: 9/13 (`OBS_Builder.html`, `RACI_Matrix.html`, `Cost-management.html`,
  `Recopilar_Requisitos.html`, `Enunciado_del_Alcance.html`, `WBS_Builder.html`,
  `Activity_Definition.html`, `Pert_Analysis.html`, `Schedule_Management_Plan.html`).
  Patrón establecido: `src/modules/<key>/main.ts`
  + `configs/<key>.vite.config.ts` (usa el helper `configs/lib.config.mjs`)
  + `npm run build:<key>` + `tests/smoke/<key>.smoke.test.ts`.
- **Fase 5** — Verificación de despliegue (GitHub Pages y `file://`).

Ver el plan completo en el historial de la conversación / plan aprobado para
el detalle de cada fase.
