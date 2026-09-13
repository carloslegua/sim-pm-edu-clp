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

**Panel_Control.html (decimotercer y último módulo migrado — punto de entrada del ecosistema):**

- Regla no negociable aplicada al pie de la letra: `MODULES`, `GROUPS`,
  `MODULOS_ENTREGADOS`, `MODULOS_EXTRA` y `probeModules` se portaron sin
  cambiar ni un valor ni una línea de lógica, solo se les agregaron tipos
  (`ModuleDef[]`, `GroupDef[]`, `"*" | "auto" | string[]`). Es la única
  zona que el profesorado edita para entregar módulos; cualquier cambio
  de comportamiento ahí habría sido inaceptable en este port.
- Particularidad de tipado única en todo el ecosistema: el script
  original referencia `GPI` como identificador global bare **sin
  ninguna verificación de undefined en ningún punto real del código**
  (el único `if (window.GPI …)` que aparece es un STRING de
  documentación para autores de futuros módulos, no código ejecutable).
  A diferencia de Cost-management/Cronograma-CPM (que sí declaran
  `var GPI: GpiApi | undefined` y lo comprueban), aquí no hay ningún
  `typeof GPI` — el Panel depende incondicionalmente de `gpi-core.js`
  (es el único módulo del ecosistema sin modo "funciona sin el núcleo").
  Como TypeScript exige que todas las declaraciones `var` de un mismo
  global compartan el mismo tipo en todo el proyecto, y `cost/main.ts`
  ya lo declaró como `GpiApi | undefined`, no se pudo re-declarar aquí
  como no-opcional sin chocar; en su lugar se ligó una constante de
  módulo `const GPI: GpiApi = window.GPI as GpiApi;` una sola vez, en
  vez de sembrar `GPI!` en las ~90 llamadas del archivo.
- CSS del modal armonizada con `gpi-shared.css` (solo el ancho propio,
  400px, y el `.modal-card input{...}` propio del modal de "prompt" de
  nuevo/renombrar proyecto, que no existe en los demás módulos).
- Es el módulo con más **lecturas cruzadas de todo el ecosistema**: el
  tablero integrado (`renderDashboard`) combina en una sola vista
  `GPI.util.wbsRollup`, `requirementsAudit`, `scopeAudit`,
  `activitiesStats`, `pertStats`, `obsNodes`, `raciCoverage`,
  `charterAudit`, `schedulePlanAudit` y `scheduleStats` — los 10
  cálculos de auditoría/agregación del núcleo, todos ya cubiertos por
  Vitest desde la Fase 2. `statChips` repite un subconjunto de esas
  mismas llamadas por tarjeta de módulo en el launcher.
- Verificado de punta a punta (servido por HTTP local): con
  `localStorage` vacío, `ensureSeed()` crea el proyecto DISTRIB+ y el
  launcher pinta las 21 tarjetas de módulo (12 "activas" — todo lo
  construido, con `MODULOS_ENTREGADOS="*"` — y 9 "próximamente"); con un
  proyecto real con EDT + interesados + acta poblados, el tablero
  integrado muestra correctamente el conteo de interesados, el costo
  rollup de la EDT y el porcentaje de completitud del acta (78%,
  verificado contra el mismo `charterAudit` que ya tiene regresión en
  Vitest); "Vaciar" un módulo desde el launcher persiste `null`
  correctamente en `gpi_db.projects.<id>.modules.charter`.

**Project_Charter.html (duodécimo módulo migrado, el último de los 12 "de herramienta" — `Panel_Control.html` quedaba como único pendiente, el punto de entrada):**

- Mismo patrón que la mayoría del ecosistema: `addEventListener`
  exclusivamente, `window.GPI` explícito, IIFE propio, ES5 (`var`/
  `function`, a diferencia de Stakeholder Studio). CSS del modal
  armonizada con `gpi-shared.css` (solo override de ancho, 400px) — ya
  estaba en la lista de módulos verificados idénticos en la Fase 3.
- Único módulo del ecosistema con un **binding genérico por ruta de
  puntos**: los campos estáticos usan `data-bind="identification.
  sponsor"` resuelto en runtime vía `getPath`/`setPath` sobre el estado
  completo, en vez de un `data-field` plano por campo como en los demás
  módulos. Se preservó tal cual, tipando el cruce dinámico con `any`
  (mismo criterio ya aplicado en otros módulos: no forzar `strict` al
  100% en el borde con el DOM).
- Es el módulo con más **integraciones de solo lectura hacia otros
  módulos ya migrados**: "Importar hitos desde la EDT" lee
  `GPI.util.wbsPhases` (WBS Builder) y "Importar interesados clave" lee
  `GPI.getModule("stakeholders")` (Stakeholder Studio), filtrando por el
  cuadrante "gestionar de cerca" (poder e interés ≥ 50) o, si nadie
  califica, los 5 de mayor poder+interés — ambas verificadas de punta a
  punta contra datos reales de esos dos módulos.
- Relación bidireccional con los metadatos comunes del proyecto: el acta
  es la fuente formal de sponsor/director/cliente/CAPEX y los escribe en
  `GPI.patchMeta()` al guardar, pero si el acta está vacía (primera vez),
  se **precarga** desde esos mismos metadatos para no partir de cero —
  se verificó que un proyecto real con `meta.sponsor`/`meta.manager`/
  `meta.capex` ya establecidos (p. ej. por otro módulo) los precarga
  correctamente en los campos de identificación y presupuesto.
- Verificado de punta a punta (servido por HTTP local): sin proyecto
  activo arranca vacía (0% de completitud) y "Cargar ejemplo" lleva el
  checklist del caso DISTRIB+ a 100% (23 ítems, 4 RAN, 4 objetivos); con
  un proyecto real, precarga sponsor/director/CAPEX desde los metadatos,
  importa un hito de EDT y un interesado clave (filtrando correctamente
  al que sí califica en el cuadrante), y todo persiste en
  `gpi_db.projects.<id>.modules.charter`.

**Stakeholder_Studio.html (undécimo módulo migrado, primero del Nivel B — entregado hoy a alumnos):**

- Primer módulo del ecosistema escrito en JavaScript moderno (`const`/`let`,
  arrow functions, template literals, destructuring) en vez de ES5
  (`var`/`function`). El port es igualmente mecánico: solo se agregan
  tipos, sin tocar la sintaxis ni la lógica.
- Particularidad de cableado: el script original **no espera
  `DOMContentLoaded`** — se ejecuta de inmediato porque el `<script>`
  inline está colocado al final de `<body>` (el DOM ya existe en ese
  punto). Se preservó exactamente ese comportamiento: el `<script src=
  "stakeholder-studio.js">` queda en la misma posición y el módulo
  ejecuta `loadSample(); wireToolbar(); render();` a nivel de módulo, sin
  ningún listener. Es distinto del resto de los módulos ya migrados
  (todos con `document.addEventListener("DOMContentLoaded", init)`), y
  se documenta aquí para no "corregirlo" por error si se vuelve a tocar.
- Único módulo del ecosistema con dos indicadores 0–100 (**Poder** e
  **Interés**) que son **campos derivados** de 5 criterios ponderados
  cada uno (nunca editables directamente) — un patrón de cálculo
  multicriterio nuevo en la suite, distinto a los "campos derivados"
  simples de otros módulos (como la Dur de Definir Actividades). Se
  verificó con un caso puntual: bajar el criterio "Control de recursos"
  de 5 a 1 en un interesado con pesos iguales (20% cada uno) cambia el
  Poder mostrado de 95 a 75 exactamente, confirmando que la fórmula
  ponderada y su redondeo se portaron bit a bit.
- CSS del modal armonizada con `gpi-shared.css` (solo override de ancho,
  380px, igual que RACI_Matrix) — ya estaba en la lista de módulos
  verificados idénticos en la Fase 3. Nota de posición: en este archivo
  `gpi-core.js` se cargaba al final de `<body>` (no en `<head>` como los
  demás), inmediatamente antes del script inline; se preservó esa
  posición relativa sin moverlo a `<head>`, ya que cambiarla habría sido
  un ajuste cosmético fuera del alcance de "portar a TypeScript".
- Verificado de punta a punta (servido por HTTP local): sin proyecto
  activo arranca con el ejemplo DISTRIB+ (12 interesados) y las 3 vistas
  (Registro, Matriz Poder–Interés, Modelo de Prominencia) renderizan sin
  errores; con un proyecto real sin interesados aún, arranca en blanco
  (regla de oro, un único interesado placeholder de `blankAnalysis()`,
  no los 12 de DISTRIB+) y agregar un interesado persiste correctamente
  en `gpi_db.projects.<id>.modules.stakeholders`.

**Cronograma_CPM.html (décimo módulo migrado, el algorítmicamente más crítico):**

- Mismo patrón que los anteriores: `addEventListener` exclusivamente, IIFE
  propio. Particularidad única de este módulo: el original captura
  `var GPI = window.GPI;` como **variable de módulo** (no llama
  `window.GPI.xxx` en cada sitio, a diferencia de OBS/WBS/PERT/Schedule
  Plan) y la reasigna dentro de `init()`. Se preservó ese mismo patrón
  con una variable de módulo `let GPI: GpiApi | undefined`, en vez de
  normalizarlo al patrón `window.GPI` explícito de los demás — cambiarlo
  habría sido un refactor, no un port mecánico.
- A diferencia de los otros 12 módulos, este **sí depende duro de
  `gpi-core.js`** incluso para su lógica local, no solo para sincronizar
  con el Panel: el cálculo CPM vive únicamente en `GPI.util.cpm` (ya
  cubierto por Vitest desde la Fase 2 con el dataset dorado DISTRIB+), sin
  una copia local como el `esc()` de los demás módulos. Si `gpi-core.js`
  no carga, la herramienta queda inoperante más allá del cableado de
  botones — comportamiento preexistente, documentado en el propio banner
  de error del módulo, no introducido por este port.
- CSS del modal: `.modal-overlay`/`.modal-card` base idénticos a
  `gpi-shared.css`, pero con más variaciones locales que otros módulos:
  ancho 420px (más grande, para el pegado de Excel/MS Project),
  `max-height:90vh; overflow:auto` (modal más alto), una variante
  `.modal-card.wide{width:760px}` para el editor de enlaces y la
  previsualización del pegado, y `.modal-actions{margin-top:18px}`. El
  `.modal-card p{margin:0 0 16px}` (vs. 20px del shared, diferencia de
  4px) se armonizó igual que en Enunciado del Alcance/Schedule Plan
  (ruido visual ≤6px); el resto de los overrides SÍ se conservaron porque
  son adiciones reales (ancho, alto máximo, variante `.wide`, margen
  superior de acciones), no diferencias menores de un valor ya presente
  en el shared.
- Verificado de punta a punta (servido por HTTP local): el modo ejemplo
  DISTRIB+ reproduce **exactamente** el resultado dorado documentado en
  el README (53 días laborables, fin 2026-09-16, 9 actividades críticas)
  — el mismo dataset ya cubierto por el test de regresión de `cpm()` en
  Vitest, ahora verificado también a través de la UI completa (tabla,
  red AON en SVG, Gantt en SVG, sin errores al cambiar de pestaña). Con
  un proyecto real con dos actividades sin enlazar, la duración del
  proyecto es la de la actividad más larga (comportamiento correcto de
  un grafo sin aristas); al agregar un enlace manual FS entre ambas
  actividades, la duración se recalcula a la suma de ambas y el enlace
  persiste correctamente en `gpi_db.projects.<id>.modules.schedule`.

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
- **Fase 4** — Migración de los 13 módulos, en el orden de la tabla. ✅
  Completa: los 13 módulos migrados (`OBS_Builder.html`, `RACI_Matrix.html`,
  `Cost-management.html`, `Recopilar_Requisitos.html`, `Enunciado_del_Alcance.html`,
  `WBS_Builder.html`, `Activity_Definition.html`, `Pert_Analysis.html`,
  `Schedule_Management_Plan.html`, `Cronograma_CPM.html`, `Stakeholder_Studio.html`,
  `Project_Charter.html`, `Panel_Control.html`). Patrón establecido:
  `src/modules/<key>/main.ts` + `configs/<key>.vite.config.ts` (usa el
  helper `configs/lib.config.mjs`) + `npm run build:<key>` +
  `tests/smoke/<key>.smoke.test.ts`. 132 tests en verde, `tsc --noEmit`
  limpio en todo el proyecto.
- **Fase 5** — Verificación de despliegue (GitHub Pages y `file://`). ✅ Hecha.
  Ver "Resultados de la Fase 5" abajo.

## Resultados de la Fase 5 (verificación de despliegue)

### 1. Auditoría estática — `npm run verify:deploy`

`scripts/verify-deploy.mjs` queda en el repositorio como comprobación
permanente antes de publicar. Verifica, sobre los archivos tal como se
sirven:

- **14 artefactos** (`gpi-core.js` + 13 bundles) son IIFE clásicos: cero
  `import`/`export`/`import.meta` en el nivel superior. Es la regla que
  mantiene vivo el modo `file://` (doble clic), porque el navegador
  bloquea por CORS los `<script type="module">` en ese protocolo.
  Incluye además la comprobación específica del bug que apareció en el
  piloto de la Fase 4 (`exports` referenciado sin ser parámetro del IIFE).
- **13 HTML** sin `type="module"`, sin rutas absolutas, y con todos sus
  `<script src>`/`<link href>` locales efectivamente presentes en el
  repositorio — esto último atrapa el caso "olvidé commitear el `.js`
  compilado", que rompería GitHub Pages aunque los tests locales pasen.
- Los 13 siguen cargando `gpi-core.js` y ninguno conserva lógica inline.

### 2. Equivalencia A/B contra el baseline pre-migración

Se comparó el comportamiento real contra el tag `baseline-pre-migracion`
(código original, pre-TypeScript) montado en un *worktree* aparte:

1. **Fixture de referencia generado por el código ORIGINAL**: se recorrió
   el baseline cargando el ejemplo DISTRIB+ en cadena (Acta → Interesados
   → OBS → EDT → Enunciado del Alcance → Plan de Cronograma → Costos),
   arrastrando el `localStorage` de una página a la siguiente como haría
   un navegador. Resultado: un `gpi_db` real de ~35 kB con 7 rebanadas de
   módulo.
2. **Las 13 páginas se abrieron en ambas versiones con ese mismo
   `gpi_db`**, y de cada una se capturó (a) el texto renderizado del
   `<body>` —excluyendo `<script>`/`<style>`, porque en el baseline el
   código inline vive dentro del `<body>` y contaría como texto— y (b) el
   `gpi_db` resultante tras disparar el guardado (`beforeunload`).

**Resultado: las 13 páginas producen el mismo texto renderizado y el
mismo `gpi_db`**, normalizando únicamente las marcas de tiempo escritas
en el momento de la corrida (p. ej. el campo `updated` del BOE de
Costos, que las dos corridas escriben con segundos de diferencia).

Dos diferencias aparecieron en la primera pasada y ambas quedaron
explicadas, ninguna atribuible al port:

- **`Cost-management.html`**: solo el `updated` del BOE (ISO 8601) —
  ruido temporal, no de datos.
- **`Panel_Control.html`**: el baseline mostraba "🔒 Se habilita más
  adelante" en 10 de las 12 herramientas porque su
  `MODULOS_ENTREGADOS` era `["charter","stakeholders"]`. Al igualar esa
  configuración a `"*"` en el worktree del baseline, el texto pasó a ser
  **idéntico**. Confirma que el cambio de entrega solicitado a mitad de
  la migración es la única causa, y que el port del Panel no alteró nada.

### 3. Modo `file://` (doble clic)

Las 13 páginas se abrieron por `file://` en ambas versiones: **texto
renderizado idéntico y cero errores reales** en las dos. Es la prueba
directa de que los bundles IIFE cargan y ejecutan sin servidor, que era
el riesgo principal de introducir un empaquetador.

> Nota metodológica: jsdom trata `file://` como origen opaco y puede
> bloquear `localStorage`, cosa que los navegadores reales no hacen (así
> es como esta suite funciona hoy con doble clic). Ese ruido se filtra
> aparte de los errores reales; los smoke tests permanentes sirven el
> proyecto por HTTP justamente para evitar ese falso negativo.

### 4. Documentación alineada

`README.md` se actualizó donde la migración lo dejó obsoleto — en
particular la instrucción de configurar la entrega de módulos "en el
`<script>` de `Panel_Control.html`", que ya no existe: ahora es
`src/modules/panel-control/main.ts` + `npm run build:panel-control`. Se
añadió una sección **Desarrollo** con los comandos, el mapa
`src/ → artefacto` y las tres reglas que no se deben romper.

Ver el plan completo en el historial de la conversación / plan aprobado para
el detalle de cada fase.
