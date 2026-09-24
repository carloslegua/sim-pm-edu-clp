# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/). Este archivo empieza a
mantenerse a partir de esta entrada — no es una reconstrucción día por día de
cada commit, sino un resumen agrupado de lo entregado hasta ahora. De aquí en
adelante, cada cambio notable se agrega bajo `[Unreleased]` a medida que
ocurre, moviéndose a una entrada con fecha cuando se corte una versión.

## [Unreleased]

### Added

- **Costos — Basis of Estimate conforme a AACE RP 34R-05** — la BOE tenía cinco campos; 34R-05 la
  define como el entregable que define el alcance del estimado y es la base del control de
  cambios. Ahora sigue el índice de la práctica en **32 campos y 8 grupos** (propósito, objetivos,
  alcance, plan de ejecución, clasificación, herramientas, codificación, unidades, moneda y tipo de
  cambio, cantidades, costos, planificación, mano de obra, asignaciones, supuestos, exclusiones,
  excepciones, riesgos, contingencias, reserva de gestión, conciliación, benchmarking, calidad,
  equipo y anexos), **cita del proyecto** el alcance del Enunciado, el cronograma, la EDT, los
  riesgos, las reservas, la escalación y el CAPEX del Acta, y trae el proceso de la práctica
  (versión, borrador → revisión → aprobación) con **hallazgos B1–B8**: aprobada incompleta, sin
  quién ni cuándo, **BOE aprobada antes de la última línea base de costos**, escalación sin definir
  su frontera con la contingencia y el tipo de cambio (58R-10), presupuesto que **supera el CAPEX
  del Acta**. Qué secciones se exigen según la clase del estimado es criterio didáctico declarado
  (34R-05 §4 no fija una lista); la sección 3.15 del índice público no se pudo verificar y se omite.
  Un proyecto nuevo arranca con la BOE **en blanco** (se quitaron los textos por omisión) y uno
  guardado antes conserva sus cinco campos. Nuevos `src/shared/boe.ts` y `src/shared/boe-sample.ts`.
  Pruebas: `boe.test.ts` (17), `boe-sample.test.ts` (4), smoke (11) y e2e en Chrome real. Ver
  ARCHITECTURE.md.
- **Costos — escalación por índices y simulación (auditoría metodológica AACE RP 58R-10 y
  68R-11)** — la escalación era `base × ((1 + i)ⁿ − 1)`: una tasa, un punto de gasto y el tipo de
  cambio mezclado en la misma línea. Ahora, por índices: una **tasa anual por cuenta de costo**
  (mano de obra, materiales, equipos, subcontratos) y año, la **composición** de cada paquete, el
  gasto repartido **en el tiempo** según las fechas reales del cronograma (mensual), la fecha base
  de precios de la BOE, el **precio fijado por contrato** (deja de escalar) y la escalación de la
  contingencia («Escalation on Contingency»). Una **simulación Monte Carlo** mide la incertidumbre
  de las tasas (rango por cuenta, correlacionadas) y el **retraso del cronograma** del análisis
  integrado de riesgo; el presupuesto financia el pronóstico central o un percentil. El **tipo de
  cambio** pasa a su propia línea (AACE recomienda segregarlo). Avisos X1–X15, incluido el
  solapamiento con riesgos de precio del registro. Los proyectos guardados antes se leen como
  método «simple» y **no cambian de cifras**; un proyecto nuevo arranca por índices en blanco. Las
  tasas del ejemplo DISTRIB+ son **ilustrativas** y están calibradas para que el presupuesto total
  siga dentro del CAPEX de USD 8,5 M del caso (el BAC del ejemplo pasa de 8.075.181 a 8.079.601).
  Nuevos `src/shared/escalation.ts` y `src/shared/escalation-sample.ts`. Pruebas:
  `escalation.test.ts` (28), `escalation-sample.test.ts` (6), smoke (10) y e2e en Chrome real. Ver
  ARCHITECTURE.md (con lo que se verificó de las prácticas y lo que no).
- **WBS Builder — calidad de la EDT y Diccionario (auditoría metodológica PMBOK, ítem D)** —
  la EDT solo se validaba al importar un `.xlsx`. Ahora una sección «Calidad de la EDT» revisa,
  al editar, la **estructura** (un solo hijo, nombres repetidos, nombres vacíos o de plantilla,
  nombres que parecen actividades, fases sin descomponer, profundidad y número de hijos), el
  **diccionario** de cada paquete (descripción del trabajo, **criterio de aceptación**,
  responsable, costo, duración y fechas coherentes) y el **tamaño** (paquetes de más de 60 d o que
  concentran más del 20 % del costo; el esfuerzo continuo, LOE, queda exento). Marca cada nodo
  con su conteo de hallazgos, agrupa por regla con su explicación, lleva desde cada hallazgo al
  elemento, muestra el avance del diccionario (18/18) y suma criterio de aceptación y calidad a la
  vista «Tabla / Diccionario» y al reporte. Campos nuevos y opcionales del nodo: `acceptance`,
  `loe` (proyectos guardados antes abren igual). Ejemplo DISTRIB+ ampliado con el diccionario
  de sus 18 paquetes. Nuevos `src/shared/wbs-quality.ts` y `src/shared/wbs-sample.ts`. Pruebas:
  `wbs-quality.test.ts` (15), `wbs-sample.test.ts` (2), smoke (10) y e2e en Chrome real.
  Ver ARCHITECTURE.md.
- **Nuevo módulo «Control Integrado de Cambios» (`Control_Cambios.html`, auditoría
  metodológica PMBOK B4)** — el registro de cambios vivía solo en Costos y solo medía Δ costo.
  Cada solicitud de cambio evalúa **a la vez** alcance, cronograma, costo, riesgo, calidad y
  recursos (el efecto en el plazo sale de volver a correr el CPM real); el CCB la decide con la
  **autoridad que exige** (cambio de línea base → CCB; reserva de gestión o fondos adicionales →
  sponsor; contingencia → política de reservas); y solo se marca **Implementada** cuando cada
  línea base afectada está de verdad actualizada: la modificación de alcance (Requisitos), la
  orden de cambio (Costos) y la versión LB-n del cronograma. Enlaza sin duplicar, con hallazgos
  de seguimiento (C1–C6) y KPIs de cartera; CSV e impresión. Ejemplo DISTRIB+ ampliado (CR-001…003 = OC-001…003).
  Nuevos `src/shared/change-control.ts`, `src/shared/change-sample.ts`, módulo `changes` (opcional)
  y tarjeta del Panel activada. Pruebas: `change-control.test.ts` (19), `change-sample.test.ts` (2),
  smoke (12) y e2e en Chrome real. Ver ARCHITECTURE.md.
- **Nuevo módulo «Valor Ganado (EVM)» (`Valor_Ganado.html`, auditoría metodológica PMI /
  AACE)** — cierra el ciclo planificar → controlar. Cruza el costo del trabajo por paquete
  (**BAC**) con la **línea base del cronograma** (PV, distribuido en el tiempo), lo que el
  equipo reporta en cada corte (avance físico y costo real) y la **técnica de valor
  ganado por paquete** (0/100, 50/50, % físico, LOE; por omisión la del Plan de Costos) para
  obtener EV, CV, SV, CPI, SPI, los pronósticos **EAC** (típico, atípico y combinado), ETC,
  VAC y TCPI, y el **cronograma ganado (Earned Schedule)**, que a diferencia del SPI en dinero no
  tiende a 1 cuando el proyecto termina tarde (con fecha de fin pronosticada). Consume los
  umbrales CPI/CV del Plan de Costos y SPI/SV del Plan del Cronograma, compara el sobrecosto
  pronosticado con la contingencia disponible, guarda el historial de cortes y dibuja la curva S.
  Ejemplo DISTRIB+ ampliado (corte 2026-10-30: SPI 0,925 ámbar, CPI 0,978 verde, CV −71.000 ámbar,
  coherente con los riesgos R-01/R-02/R-08). Nuevos `src/shared/evm.ts`, `src/shared/evm-sample.ts`,
  módulo `evm` (opcional) y tarjeta del Panel activada. Pruebas: `evm.test.ts` (20),
  `evm-sample.test.ts` (3, oro), smoke (12) y e2e en Chrome real (proyecto real = ejemplo
  independiente). Ver ARCHITECTURE.md.
- **Costos — la clase del estimado se contrasta con la madurez de la definición y su
  rango de exactitud se aplica al presupuesto (auditoría metodológica AACE 17R-97 /
  56R-08)** — la clase se elegía a mano y su rango era solo un texto. Con un proyecto
  conectado se estima (de forma orientativa) la **madurez de la definición** con los datos de la
  suite (acta, alcance, requisitos, EDT, actividades, precios unitarios, cronograma) y se avisa
  cuando la clase declarada es más madura que la que los datos respaldan. El **rango de exactitud
  típico se aplica al estimado con contingencia** (mínimo y máximo, junto al P10–P90 simulado)
  y aparece en el BOE. Nuevo `src/shared/estimate-class.ts`; `estimate-class.test.ts` (6) y 3 smoke.
  Pendiente de confirmar contra las RP de AACE (de pago): los porcentajes de madurez por clase.
- **Cronograma/CPM — salud de la red y línea base del cronograma (auditoría
  metodológica PMI / AACE)** — el CPM servía para planificar, no para controlar.
  Nueva pestaña «Salud y línea base»: (1) **salud de la red** con verificaciones tipo
  DCMA 14-Point (lógica faltante, adelantos, desfases, relaciones FS, holgura alta y
  negativa, duración alta, sin duración, ruta casi crítica; umbrales de referencia
  confirmados, orientan y no bloquean); (2) **línea base versionada** (LB-n con
  instantánea, motivo y aprobador) que antes nada creaba, y (3) **variación**: desplazamiento
  del fin, reserva de cronograma consumida y consumo de holgura de la ruta casi crítica, todo
  con los umbrales del **Plan de Gestión del Cronograma** que hasta ahora nadie consumía
  (ruta casi crítica, reserva, umbral de rebaselinado —por encima exige al sponsor— y umbral
  verde/rojo de holgura). El Gantt marca la línea base y el Panel muestra «Línea base LB-n: ±X d».
  Nuevo `src/shared/schedule-control.ts`; `schedule.baseline.log` opcional (lo guardado antes
  abre sin línea base). Pruebas: `schedule-control.test.ts` (14), smoke de Cronograma (16) y e2e en
  Chrome real. Ver ARCHITECTURE.md.
- **Política de reservas estructurada (PMBOK) que gobierna la aprobación de las
  órdenes de cambio** — la política del plan de riesgos era solo texto. Ahora define
  **quién libera la contingencia según el monto** (Director de Proyecto → CCB →
  sponsor; límites por orden) y un **umbral de alerta de agotamiento**; la reserva de
  gestión y los fondos adicionales siguen siendo siempre del sponsor. Se edita en el
  Plan del Registro de Riesgos y **la aplica Costos**: una orden a contingencia no se
  aprueba si el nivel de autoridad con que se aprueba (nuevo `authLevel` por orden,
  deducido en las anteriores) no cubre el que exige su monto; al registrar una orden se
  muestra qué instancia la autoriza; si la contingencia disponible baja del umbral se
  alerta; el BOE incluye la política. Campos nuevos opcionales (`plan.reserves`,
  `changeOrders[].authLevel`): los `.json` viejos abren sin límites, como antes. Nuevo
  `src/shared/reserve-policy.ts`. Pruebas: `reserve-policy.test.ts` (16) y smoke de Costos
  y Riesgos. Ver ARCHITECTURE.md.
- **Registro de riesgos ↔ Cronograma (tercera entrega, AACE 40R-08 / 65R-11 +
  PMBOK)** — el impacto en plazo de un riesgo ya se traduce al **fin del
  proyecto**: se vuelve a correr el CPM con la duración afectada (una actividad
  crítica traslada el retraso íntegro, una con holgura lo absorbe). Cada riesgo
  se ubica por paquetes de la EDT y, opcionalmente, por actividades (`actIds`,
  campo nuevo opcional); sin ubicar se dice. Hallazgos R19–R21 (sin ubicar, absorbido
  por la holgura, nivel de plazo que no concuerda con el efecto real). El Registro
  muestra por riesgo su efecto en el fin y, en Análisis, la **simulación de
  plazo** (P50–P90, reserva de plazo, fechas de fin). **Costos** integra el
  mismo sorteo: el retraso se costea con un nuevo «costo por día de extensión del
  plazo» (`rangeAnalysis.timeCostPerDay`), con tabla de plazo y aviso de doble
  conteo (los rangos de costo de los riesgos deben ser directos). Los eventos
  tienen flujo aleatorio propio y se simulan una vez (Costos y Riesgos dan el
  mismo plazo). Nuevo: `GPI.util.scheduleNetwork/activeScheduleNetwork`,
  `src/shared/schedule-risk.ts`, `src/shared/schedule-sample.ts` (red DISTRIB+
  completa con prueba de oro 273 d / 34 críticos). Pruebas: unitarias (motor,
  ubicación, efecto, simulación integrada contra valores analíticos), smoke de Riesgos
  (24) y Costos (38), y e2e en Chrome real. Ver ARCHITECTURE.md.
- **Registro de riesgos ↔ Costos (segunda entrega, AACE 40R-08 + PMBOK)** —
  (1) Los riesgos abiertos del Registro entran a la simulación de contingencia
  de Costos como **eventos discretos** (probabilidad × impacto triangular;
  oportunidades restan; exposición residual), con paneles de incluidos /
  excluidos (sin impacto en costo cuantificado) / valor esperado neto y aviso
  de doble conteo con los rangos de partida. (2) Cada **orden de cambio** puede
  vincularse al riesgo que la originó (`riskId/riskCode`, opcionales) y una
  tabla muestra el **consumo de contingencia por riesgo**; en el Registro, un
  riesgo materializado lista sus órdenes vinculadas y avisa (R17/R18) si su
  costo real no coincide con lo aprobado. (3) La naturaleza «Riesgo
  materializado» **exige un riesgo del registro en estado Materializado**; si
  no estaba registrado se clasifica como trabajo imprevisto. Las órdenes ya
  aprobadas siguen aprobadas (marcadas «sin riesgo vinculado»). Nuevo
  `src/shared/risk-sample.ts` como única fuente del ejemplo compartido.
  Pruebas: unitarias de rangos con eventos, `riskEventsOf`, `contingencyByRisk`
  y validación de vínculo; smoke de Costos (32) y Riesgos (17), incluida la
  coherencia del ejemplo compartido. Ver ARCHITECTURE.md.
- **Cronograma/CPM — nuevo botón "⇩ Cargar ejemplo en el proyecto"** — el
  usuario reportó que, tras cargar el ejemplo DISTRIB+ real en WBS
  Builder + Definir las Actividades (18 paquetes, 43 actividades), la
  tabla de Cronograma/CPM y sus vistas Red/Gantt aparecían sin
  predecesoras. Diagnóstico: no era un bug de "Modo ejemplo" (ese sandbox
  aislado sí tenía enlaces completos desde antes) sino que Cronograma/CPM
  era el único módulo dependiente de `activities` sin su propio "⇩ Cargar
  ejemplo en el proyecto" — a diferencia de Definir las Actividades y
  Estimar los Costos, nunca sembraba `schedule.links` sobre el proyecto
  real. Se agregó el mismo patrón: `SAMPLE_LINK_PLAN` (48 enlaces,
  identificados por Código EDT + nombre de actividad, nunca por id — los
  ids reales los asigna la reconciliación de `activities` al sembrar el
  proyecto) resuelto contra las actividades reales vía
  `findRealActivityId()`, con confirmación explícita antes de reemplazar
  los enlaces del proyecto activo. Probado end-to-end en Chrome real: con
  el ejemplo completo, los 48 enlaces resuelven al 100% (273 días
  laborables, 31 actividades críticas, fin 2027-07-21 desde 2026-07-06).
  Nunca toca "Modo ejemplo" ni el proyecto activo sin este botón
  explícito. Cubierto en `tests/smoke/cronograma-cpm.smoke.test.ts`
  (caso de éxito por Código EDT + nombre, y los dos avisos de guarda: EDT
  vacía / sin actividades). Ver ARCHITECTURE.md, sección
  `Cronograma_CPM.html` y "Dataset de referencia (DISTRIB+)".

### Changed

- **Cronograma/CPM — "📋 Pegar cronograma" reemplazado por "⇩ Exportar a
  Excel" / "⇧ Importar desde Excel", uniforme con el resto de la suite**
  — el usuario señaló que el pegado no seguía la misma lógica que WBS
  Builder/Definir las Actividades/Estimar los Costos (archivo `.xlsx`
  con nombre de hoja y encabezados EXACTOS, emparejados por texto) y
  pidió unificarlo, además de sumar la hoja correspondiente a la "⇩
  Plantilla combinada" del Panel de Control. Confirmado con el usuario:
  se reemplaza el pegado por completo, no queda como alternativa.
  `Cronograma_CPM.html` gana su propio `<script>` de JSZip (antes no lo
  necesitaba). La reconciliación en sí no cambió: `GPI.util.buildScheduleLinks()`
  (ciclos, cruce de nombre por Id., sintaxis de predecesoras) es la
  MISMA función que ya usaba el pegado — solo cambió cómo llegan las
  filas hasta ahí. Caso nuevo que ningún otro módulo había tenido: una
  celda de fecha autoformateada por Excel guarda un número de serie, no
  texto — `excelSerialToISODate()` la convierte antes de caer al parser
  de texto existente. `Link.source` pasa de `"paste"` a `"import"`
  (`ScheduleLink.source` en `core/types.ts` se amplía, nunca se angosta:
  `.json` viejos con `source:"paste"` siguen cargando). La hoja
  "Cronograma" (Id./Nombre/Duración/Comienzo/Fin/Predecesoras) se agregó
  a la plantilla combinada de Panel de Control, con su propio bloque de
  ejemplo e instrucciones. Probado en `tests/e2e/cronograma-cpm-import.spec.ts`
  (export, import con columnas reordenadas, encabezado renombrado
  rechazado, hoja con nombre distinto rechazada, celda de fecha nativa
  de Excel, Id. desactualizado), un round-trip nuevo en
  `tests/e2e/panel-control-template.spec.ts`, y un caso nuevo en
  `tests/unit/cpm.test.ts`. Ver ARCHITECTURE.md, secciones
  `Cronograma_CPM.html` y "Plantilla combinada" de `Panel_Control.html`.

### Added

- **Registro de Riesgos (`Risk_Register.html`), basado en PMBOK y AACE —
  primera entrega** — módulo nuevo (no es un port) con cuatro vistas:
  **Registro** (enunciado causa → evento → efecto, RBS, propietario,
  proximidad, paquetes de la EDT, análisis cualitativo con probabilidad e
  impacto en costo/plazo/alcance-calidad, análisis cuantitativo con rango de
  tres puntos, estrategia distinta para amenazas y oportunidades, disparador,
  riesgo residual y materialización), **Matriz probabilidad × impacto**
  (amenazas y oportunidades por separado, antes y después de la respuesta),
  **Análisis** (prioridad de atención, valor esperado AACE 44R-08 con la media
  de la triangular antes y después de la respuesta, por categoría, cobertura y
  hallazgos) y **Plan de gestión de los riesgos** (escalas de probabilidad e
  impacto —el de costo traducido a moneda con el costo base de Costos—,
  umbrales de apetito, RBS, metodología, roles y política de reservas; validado
  para que las escalas crezcan). 16 guardas de coherencia (R0–R16), entre ellas
  la discrepancia entre el nivel declarado y el valor cuantificado, aceptar una
  amenaza alta sin aceptación activa, estrategias que no corresponden al tipo y
  residual peor que el inherente. CSV, reporte imprimible, tarjeta en el Panel
  con su indicador y ejemplo DISTRIB+ ampliado (10 riesgos; **R-03 «Suelo»**
  materializado con el costo real de la orden OC-001 de Costos). Lógica pura en
  `src/shared/risk-analysis.ts`; pruebas: `risk-analysis.test.ts` (34) y 14
  smoke (incluido XSS y «Cargar ejemplo» sobre una EDT real). Pendiente (segunda
  entrega): sumar la exposición residual al análisis de contingencia de Costos y
  enlazar las órdenes de cambio con el riesgo que las causó.

- **Costos: contingencia por estimación de rangos + simulación Monte Carlo
  (auditoría metodológica AACE, RP 41R-08)** — el módulo ofrecía
  «Simulación Monte Carlo», «Análisis paramétrico», «Rangos por porcentaje»
  y «Árbol de decisión», pero los cuatro calculaban una tabla fija de % por
  clase y percentil cuyos valores no provienen de AACE (citando además la
  18R-97, que es una clasificación de estimados y no una metodología de
  contingencia). Ahora hay tres métodos honestos: **rangos + Monte Carlo**
  (partidas con costo más probable, mínimo, máximo y fundamento; triangular;
  correlación entre partidas editable; 10.000 iteraciones con semilla fija;
  contingencia = P(x) − Σ más probable; tabla de percentiles, curva S con
  hover, sensibilidad a la correlación y avisos), **referencia por clase y
  percentil** (la tabla anterior, rotulada «didáctica, no normativa» y
  todavía por defecto para no alterar el BAC de referencia) y **porcentaje
  manual** con fundamento. Las partidas se traen por paquete de trabajo de
  Estimar los Costos o de la EDT, conservando lo ya trabajado. Los proyectos
  antiguos abren con los mismos montos y un aviso. Declara sus límites: no
  incluye eventos de riesgo discretos ni es integrada con el cronograma. El
  ejemplo DISTRIB+ suma 5 partidas (las 5 fases, S/ 7.100.000). Lógica pura
  en `src/shared/range-estimating.ts`, verificada contra resultados
  analíticos; pruebas: `range-estimating.test.ts` (15) y 11 smoke nuevos.

- **Stakeholder Studio: matriz de evaluación del compromiso (auditoría
  metodológica PMI)** — el Panel anunciaba una «matriz de compromiso» que
  no existía. Nueva vista «🤝 Compromiso»: por interesado, nivel **actual
  (C)** frente al **deseado (D)** en los 5 niveles de PMI (Desconocedor,
  Reticente, Neutral, Partidario, Líder), **brecha**, **prioridad**
  (brecha × poder / 100), estrategia y responsable, con hallazgos de
  coherencia (brecha sin estrategia o sin responsable, poder alto con
  postura reticente, «gestionar de cerca» con deseado inferior a
  Partidario, evaluación vieja). Los niveles los evalúa el alumno: nunca se
  inicializan ni se infieren, y los proyectos guardados antes de esta vista
  abren igual como «Sin evaluar» (campos opcionales). CSV y reporte
  imprimible incluyen la evaluación; el ejemplo DISTRIB+ amplía sus 12
  interesados con compromiso, estrategia y responsable. Lógica pura en
  `src/shared/stakeholder-engagement.ts`; pruebas:
  `stakeholder-engagement.test.ts` (17) y 6 smoke nuevos (incluido XSS).

### Fixed

- **Panel de Control: el indicador «Cronograma / CPM» daba una duración
  equivocada con hitos** — `GPI.util.scheduleStats()` armaba la red solo con las
  actividades: los enlaces hacia/desde un hito se perdían. Con el ejemplo
  DISTRIB+ completo el Panel mostraba **195 d / 22 críticas / fin 2027-04-02**
  mientras Cronograma/CPM da **273 d / 34 / 2027-07-21** (hallado al contrastar
  la red nueva en Chrome real). Ahora usa la misma red (`scheduleNetwork`); fijado
  en el e2e `risk-schedule-integration.spec.ts`.
- **Costos: una variación fuera de umbral ya no se equipara con una orden
  de cambio (auditoría metodológica PMI)** — el flujo enseñaba «rojo =
  orden de cambio obligatoria» y los umbrales de CPI/CV se rotulaban
  «Escalamiento · orden de cambio». Una variación dispara el análisis de
  la causa, la actualización del pronóstico (ETC/EAC) y una decisión de
  respuesta: acción correctiva o preventiva dentro del plan, uso de la
  contingencia, o solicitud de cambio solo si la respuesta modifica la
  línea base o compromete la reserva de gestión. El flujo de la pestaña 04
  pasa a 7 pasos con «Decidir la respuesta» antes de registrar cualquier
  orden; los umbrales pasan a «Escalamiento · decisión del sponsor / CCB»;
  el documento BOE recoge la misma regla. Nuevo: tarjeta «Evaluar una
  variación» (clasifica CPI/CV en verde/ámbar/rojo y explica qué
  corresponde hacer) y aviso de umbrales incoherentes (escalar menos grave
  que alertar). Lógica pura en `src/shared/cost-variance.ts`; pruebas:
  `cost-variance.test.ts` (10) y 3 smoke nuevos.

- **Costos: el cambio de alcance ya no se equipara con la reserva de
  gestión, y aprobar una orden ya no se confunde con cambiar la línea base
  (revisión externa, alta; PMI: reservas y alcance / presupuesto y línea
  base)** — los textos de Costos enseñaban que un cambio de alcance
  «requiere reserva de gestión» y que la orden aprobada «actualiza la
  línea base»; en el código, «Aprobada» solo sumaba totales del registro,
  sin transferencia presupuestaria ni línea base nueva. Ahora cada orden se
  evalúa en tres ejes independientes: **naturaleza** (riesgo materializado
  / trabajo imprevisto dentro del alcance / cambio de alcance, obligatoria),
  **fondeo** (contingencia / reserva de gestión / financiamiento adicional
  nuevo) y **aprobación** (quién aprueba, autorización expresa del sponsor
  si usa reserva o fondos adicionales, y saldos disponibles: no se puede
  comprometer más de lo que hay; un cambio de alcance no se financia con
  contingencia). Cada orden muestra su **efecto presupuestario**. Aprobar
  compromete los fondos pero **no cambia el BAC**: la línea base solo se
  modifica con «Incorporar a la línea base», que deja una versión LB-n
  (fecha, órdenes, BAC anterior → nuevo, aprobador) y bloquea la orden. Los
  indicadores muestran BAC vigente, pendiente de incorporar y reservas
  disponibles; el Panel muestra el BAC vigente. Los `.json` antiguos abren
  igual (campos nuevos opcionales; las pendientes deben clasificarse antes
  de aprobarse). Lógica pura en `src/shared/change-orders.ts`; pruebas:
  `change-orders.test.ts` (23) y 5 smoke nuevos de Costos.

- **Los desfases en días transcurridos se calculan sobre fechas reales,
  no con una proporción semanal (revisión externa, alta)** — `cpm()`
  convertía un desfase `ed` con `lag × (días laborables / 7)`. Un hito el
  viernes 10/07/2026 con 3 días transcurridos corresponde al lunes 13/07,
  pero la sucesora se fechaba el martes 14/07 (con un feriado el lunes,
  el miércoles). Ahora, con fecha de inicio, el desfase se suma sobre el
  instante real del predecesor y se vuelve al primer tiempo laborable del
  calendario de la sucesora (fines de semana y feriados incluidos); la
  pasada hacia atrás y la holgura libre son coherentes (`makeRealTimeAxis`,
  ver ARCHITECTURE.md). Los desfases en días laborables, horas y semanas
  no cambian. Sin fecha de inicio se conserva la aproximación proporcional
  y ahora se avisa (Cronograma/CPM en Validación, PERT en la ruta
  crítica); PERT pasa a `cpm()` la fecha de inicio del proyecto. La
  probabilidad de plazo PERT declara «no aplicable» si la ruta crítica
  tiene un desfase transcurrido. Pruebas: `cpm-elapsed-lag.test.ts` (la
  repro exacta, feriado, SS, FF, holgura de fin de semana y 300 redes
  aleatorias) y smoke de Cronograma/CPM verificado contra el código
  anterior.

- **La probabilidad de plazo PERT ya no suma ramas paralelas ni omite
  desfases (revisión externa, alta)** — `criticalPertSums()` (Cronograma/
  CPM) y `criticalPathStats()` (PERT) sumaban ΣTE y Σσ² de todas las
  actividades con holgura cero. Reproducción: dos actividades paralelas de
  10 d (σ² = 1) hacia un hito; el CPM daba 10 d, pero la media usada era
  20 d y se informaba ≈ 0 % de terminar en 10 d (bajo dos duraciones
  normales independientes serían 25 %); además los desfases no entraban en
  la media y, en Cronograma/CPM, se sumaban TE sobre la ruta de las
  duraciones determinísticas aunque el CPM fuese otro. Nueva
  `GPI.util.pertCriticalChain()`: solo calcula si las críticas forman una
  cadena única (media = duración del proyecto con TE, desfases incluidos;
  varianza = la de las actividades que de verdad deciden el fin, con SS/FF
  bien tratados); con ramas paralelas o convergentes la pantalla dice «no
  aplicable» y por qué, en vez de inventar un número. El selector
  Determinística/PERT ya no altera la probabilidad. Pruebas nuevas
  (`pert-critical-chain.test.ts` y smoke de ambos módulos), las de módulo
  verificadas contra el código anterior. Ver ARCHITECTURE.md,
  "Probabilidad de plazo PERT: solo sobre una ruta crítica única".

- **Un almacenamiento completamente lleno ya no produce un falso
  «guardado» (cuarta revisión externa, P1)** — reproducido en Chrome
  simulando errores de cuota: la primera escritura devolvía `pending`;
  al fallar también la comprobación de disponibilidad, el reintento
  devolvía `saved` sin persistir (`save()` lo tomaba por "sin
  localStorage" y usaba memoria); al recuperarse el almacenamiento, otro
  reintento daba `unchanged` con el disco en el dato antiguo y
  `hasUnsavedChanges()` en `true`, de modo que el alumno podía cerrar la
  página creyendo que había guardado. Además, con el almacenamiento lleno
  desde el inicio, `db()` servía una base vacía a las lecturas. Ahora el
  modo memoria solo aplica cuando `localStorage` ni siquiera se puede
  leer y no hay nada pendiente; con el almacenamiento lleno se intenta la
  escritura real y, si falla, queda `pending`. Pruebas nuevas en
  `write-contract.test.ts` (secuencia completa del reporte y "lleno desde
  el inicio"), verificadas contra el código anterior. Ver
  ARCHITECTURE.md, "Almacenamiento lleno ≠ sin almacenamiento".

- **Recuperar un guardado pendiente ya no borra cambios de otra pestaña
  (tercera revisión externa, P1)** — reproducido con almacenamiento
  simulado y en Chrome con dos pestañas: A intenta guardar el Acta y
  queda pendiente por un fallo de almacenamiento; B sube Costos de 100 a
  200; se recupera el almacenamiento y A guarda otra edición del Acta. La
  operación devolvía `saved` pero Costos volvía a 100, porque
  `commitState()` leía la base de datos antes de recuperar lo pendiente:
  la recuperación escribía la copia conciliada con B, y la escritura
  posterior reutilizaba la copia anterior y la pisaba. Ahora se recupera
  primero, se vuelve a leer la base y se revalida el proyecto (existencia
  y activo) antes de validar conflictos y aplicar la edición. Pruebas
  nuevas en `write-contract.test.ts` (un módulo ajeno y un campo de meta
  ajeno en el mismo reintento), verificadas contra el orden anterior. Ver
  ARCHITECTURE.md, "Orden dentro de `commitState()`".

- **Un reintento tras cuota agotada ya no dice «Sincronizado» sin
  guardar, y un conflicto del módulo ya no deja pasar sus metadatos
  (segunda revisión externa, hallazgos alta y media)** — reproducido en
  Chrome con el Acta: (alta) tras un fallo de cuota el botón decía «Sin
  sincronizar», pero al restablecer el almacenamiento y reintentar decía
  «✓ Sincronizado» con `hasUnsavedChanges()` aún en `true` y la
  descripción anterior en disco, porque la sesión adoptaba lo pendiente
  como confirmado y el reintento resultaba `unchanged`; (media) con un
  conflicto en el Acta, el módulo no se sobrescribía pero sus metadatos
  sí (patrocinador S0 en el Acta, S1 en el proyecto). `EditSession` ahora
  separa lo confirmado de lo pendiente y el reintento intenta persistir
  lo pendiente; el módulo y sus metadatos se guardan con la nueva
  `GPI.saveState()` como una sola operación atómica (un conflicto en
  cualquiera no escribe nada; los campos de meta en conflicto se listan
  como `meta.<campo>`). Pruebas: seis nuevas en `write-contract.test.ts`
  y las dos repros del Acta en `project-charter.smoke.test.ts`, todas
  verificadas contra el código anterior. Ver ARCHITECTURE.md, "Segunda
  revisión: lo pendiente no es lo confirmado…".

- **Los 13 módulos usan el contrato de escritura: sesión de edición y
  estado según el resultado real (revisión externa, hallazgos alta y
  media; parte de los módulos)** — reproducido en Chrome: abrir el Acta,
  actualizarla desde otra pestaña y ejecutar el guardado de salida de la
  primera dejaba la descripción vieja (vacía) sobre la nueva; y en
  Costos, con un error de cuota forzado, el núcleo conservaba los
  cambios pendientes pero la pantalla decía "Sincronizado con el Panel"
  porque el módulo ignoraba el resultado de `setModule()`. Cada módulo
  abre una `EditSession` al leer sus datos y guarda con
  `pushWithSession()` (nuevo `src/shared/write-session.ts`, inlineado en
  cada IIFE): un guardado sin ediciones propias es `unchanged`, un
  cambio ajeno posterior es `conflict` (no se sobrescribe, se avisa en
  estado y banner), y `pending`/`rejected` también se informan. El botón
  "☁ Sincronizar" y el "Cambios guardados." de Enunciado del Alcance
  solo confirman si se guardó de verdad; Costos y Requisitos ya no dicen
  "Sincronizado" ni caen a su respaldo propio con cuota agotada. La
  escritura de RACI hacia la EDT es derivada (no sube la revisión, sin
  falsos conflictos) y "Promover a RAN" sube la del Acta. Pruebas:
  repro exacta del Acta (`project-charter.smoke`), Costos con cuota
  forzada (`cost-management.smoke`, verificada contra el módulo
  anterior), EDT con escritura derivada vs. edición ajena
  (`wbs-builder.smoke`). Ver ARCHITECTURE.md, "Cómo lo usan los 13
  módulos".

- **Núcleo — contrato de escritura: versión del mismo proyecto,
  reconciliación con eliminaciones/metadatos por campo y resultado
  común (revisión externa, hallazgos alta/alta/media; parte del
  núcleo)** — (1) la guarda por `projectId` no detectaba que los datos
  del MISMO proyecto cambiaron tras abrir la pestaña (abrir el Acta,
  actualizarla desde otra pestaña y ejecutar el guardado de salida de la
  primera dejaba la versión vieja vacía). Ahora cada proyecto lleva una
  revisión por módulo (`revs`, opcional) y cada pestaña una
  `EditSession` (`GPI.openSession`): `GPI.saveModule` devuelve
  `unchanged` si la pestaña no modificó lo que cargó, `conflict` (sin
  sobrescribir) si otra pestaña cambió el módulo desde entonces, y
  `saved`/`pending`/`rejected`; `GPI.saveMeta` escribe solo los campos
  que la pestaña cambió (renombrar desde el Panel ya no se revierte con
  un guardado de salida). (2) La reconciliación tras cuota agotada
  ahora trabaja con operaciones explícitas contra la base (crear /
  modificar / eliminar) y metadatos por campo: un proyecto eliminado en
  otra pestaña ya no reaparece, una eliminación propia ya no se
  revierte, y un cambio de `client` ajeno sobrevive cuando la copia
  pendiente guarda `location`; conflictos reales con política explícita
  y aviso (`GPI.lastReconcile()`). (3) `WriteResult` +
  `GPI.describeWrite()` como resultado común. `setModule`/`patchMeta`
  se conservan como envoltorios. Pruebas nuevas en
  `tests/unit/write-contract.test.ts` y `tests/unit/quota-recovery.test.ts`
  (verificadas contra el código anterior). La migración de los 13
  módulos a este contrato va en el commit siguiente. Ver
  ARCHITECTURE.md, "Contrato de escritura: sesiones de edición,
  revisiones y resultado común".

- **La importación JSON de actividades descartaba los hitos** — el
  usuario reportó: un archivo del formato reconocido
  `gpi.activities/v1` con `milestones` se importa con éxito, pero
  conserva solamente `byLeaf` e `idCounter`; los hitos desaparecen.
  Aclaró que el hallazgo corresponde a la importación de herramienta
  (`detectTool()`/`ingestToolExport()`), no a la exportación del
  proyecto completo. Diagnóstico: `ActivitiesModule.milestones` es un
  campo de primera clase, pero la rama de `detectTool()` que arma el
  módulo solo copiaba dos de las tres propiedades. Ningún módulo genera
  hoy ese formato (los botones "Guardar .json" propios se retiraron),
  pero se sigue aceptando por compatibilidad con archivos ya guardados,
  y "reconocido" no puede significar "truncado en silencio". Corrección:
  se conserva `milestones` cuando es un arreglo y se trata como `[]`
  si viene con otro tipo (mismo criterio que `links` de
  `gpi.schedule/v1`); sin hitos (formato anterior) queda `[]`. Tres
  casos nuevos en `tests/unit/tool-export-import.test.ts`: ida y vuelta
  con un hito suelto y uno colgado de un paquete, formato viejo sin
  hitos, y `milestones` de tipo inválido; verificado que fallan sin el
  fix. Ver ARCHITECTURE.md, "Un cuarto hueco: `gpi.activities/v1`
  reconocía el formato pero descartaba los hitos".

- **Media — `modules: []` se aceptaba y provocaba pérdida silenciosa de
  escrituras** — el usuario reportó: "la validación acepta cualquier
  objeto, incluidos arreglos. Reproduje una importación con `modules:
  []`: guardar un Acta devolvió `true`, pero leerla inmediatamente
  devolvió `null`, porque la serialización del arreglo descarta esa
  propiedad." Diagnóstico: en JavaScript `typeof [] === "object"`, así
  que el chequeo original de `normalizeToProject()` (`!proj.modules ||
  typeof proj.modules !== "object"`) aceptaba un arreglo vacío tal cual
  — es objeto Y es *truthy*. `setModule()` le asigna una propiedad de
  texto (`p.modules.charter = datos`) sin lanzar (un array sigue siendo
  un objeto JS), pero `JSON.stringify()` de un `Array` SOLO serializa
  sus elementos indexados: la propiedad se descartaba en silencio al
  guardar — `setModule()` devolvía `true`, `getModule()` inmediatamente
  después devolvía `null`. El mismo patrón de chequeo `truthy` (sin
  excluir arrays) se repetía en `setModule()`, `ingestToolExport()`, y
  en `sanitizeTree()` para `nodes`. Corrección, exactamente la
  recomendada: `isPlainObject()` (nueva, compartida) reemplaza los
  cuatro chequeos sueltos y agrega `!Array.isArray(v)`; `detectTool()`
  y `normalizeToProject()` además coaccionan `nodes` a `{}` antes de
  sanear si no es un objeto plano. Tres casos nuevos en
  `tests/unit/import-validation.test.ts`: `modules: []` vía
  `importProject()` seguido de un `setModule()` real que ahora sí
  persiste; un proyecto ya guardado con `modules: []` en disco (dato
  corrupto de antes de este fix) también se corrige; y `nodes: []` se
  trata como un WBS vacío en vez de perder lo que se le cuelgue.
  Verificado que los tres detectan el bug real: revertido el fix
  temporalmente, fallan exactamente como se esperaba. Ver
  ARCHITECTURE.md, sección "Un tercer hueco: `typeof [] ===
  \"object\"` dejaba colar `modules: []`/`nodes: []`".

- **Media — la validación de árboles WBS/OBS no eliminaba ciclos en
  `parentId`** — el usuario reportó: "la poda de `children` funciona,
  pero deja intactos los enlaces hacia el padre. Importé un OBS con un
  nodo cuyo `parentId` apunta a sí mismo: la importación devolvió éxito
  y el recorrido quedó bloqueado; detuve la ejecución con un límite de
  tiempo." Diagnóstico: `sanitizeTree()` (agregada en un fix anterior
  para podar ciclos en WBS/OBS) solo reescribía `children` — el sentido
  descendente del árbol —, dejando intacto `parentId` — el sentido
  ascendente, que usan `obsNodes()`/`code()` en el núcleo y
  `isDescendant()`/la función de profundidad en
  `src/modules/wbs/main.ts` y `src/modules/obs/main.ts`, los cuatro con
  un `while (n && n.parentId)` sin control de visitados. Un `parentId`
  cíclico (a sí mismo, o entre varios nodos) pasaba intacto: la
  importación devolvía éxito, y el primer recorrido ascendente quedaba
  en loop infinito — no es recursión, así que ni siquiera un límite de
  profundidad del navegador lo cortaba. Corrección, exactamente la
  recomendada: (1) `sanitizeTree()` ahora TAMBIÉN reescribe `parentId`
  de cada nodo alcanzado, usando la misma recorrida (ya acíclica) que
  arma `children` — cada nodo recibe como padre exactamente aquel en
  cuyo `children` quedó, nunca el valor suelto que traía el `.json`;
  (2) defensa en profundidad — `obsNodes()`/`code()` (núcleo) e
  `isDescendant()`/la función de profundidad en `wbs/main.ts` y
  `obs/main.ts` ganan un `Set` de visitados en su recorrido ascendente,
  por si un `parentId` cíclico llegara por cualquier otra vía. Nuevo
  caso en `tests/unit/import-validation.test.ts`: un OBS con
  `children` ya limpio pero `parentId` de un nodo apuntando a sí mismo
  — confirma que `obsNodes()` termina y que `parentId` quedó
  reconstruido coherente. Verificado que el test detecta el bug real:
  revertido el fix temporalmente, la llamada cuelga de verdad (no
  lanza ni hace timeout de Vitest — hubo que terminar el proceso a
  mano, igual que describió el usuario). Dos pruebas preexistentes en
  `tests/unit/tool-export-import.test.ts` se actualizaron para
  reflejar que la raíz ahora siempre trae `parentId: null`. Ver
  ARCHITECTURE.md, sección "El hueco que dejó esa primera pasada:
  `parentId` no se saneaba, solo `children`".

- **La recuperación de cuota podía sobrescribir cambios de otra pestaña
  (regresión del fix anterior de cuota agotada)** — el usuario reportó,
  simulando dos contextos compartiendo `localStorage`: A conservó un
  cambio pendiente por fallo de cuota; B guardó una actualización de
  costos; A recuperó la capacidad de guardar y escribió su copia
  completa anterior — la actualización de costos desapareció. Además,
  el Panel abierto en otra pestaña exporta la versión antigua, porque
  `pendingUnsaved` solo existe en la pestaña que falló; y si también
  falla la sonda de disponibilidad (`avail()`), la lectura devolvía el
  respaldo vacío ANTES de consultar los cambios pendientes. Diagnóstico:
  el fix anterior (`pendingUnsaved`, ver la entrada de más abajo)
  resolvía correctamente "no perder el cambio de ESTA pestaña", pero
  tenía dos huecos al compartir `localStorage` con otras pestañas: (1)
  `db()` comprobaba `avail()` antes que `pendingUnsaved`, así que una
  cuota que empeora hasta tumbar la sonda de 1 byte de `avail()` hacía
  que la lectura devolviera `fresh()` (vacío) en vez del cambio
  pendiente; (2) al recuperar la capacidad de guardar, `save()`
  escribía `pendingUnsaved` TAL CUAL — un clon completo de toda la base
  tomado ANTES del fallo — pisando por completo cualquier cosa que otra
  pestaña hubiera guardado mientras esta seguía atascada. Corrección:
  `db()` ahora comprueba `pendingUnsaved` ANTES que `avail()`. Al
  recuperar la capacidad de guardar, `save()` ya no escribe
  `pendingUnsaved` sin más — dos funciones nuevas,
  `mergeWithDisk()`/`mergeProjectModules()`, reconcilian a tres bandas
  (base/`ours`/`theirs`) contra `pendingBase` (una foto de disco
  capturada en la primera falla de cada racha de cuota agotada): por
  proyecto, y dentro de cada proyecto por MÓDULO — un módulo que cambió
  de un solo lado respecto de la base se conserva del lado que cambió;
  si ambos lo cambiaron (conflicto real, poco común), gana la pestaña
  que está guardando en ese momento, en vez de descartar su trabajo en
  silencio. `activeId` se toma de disco cuando existe, por ser un
  puntero global que otra pestaña pudo haber cambiado mientras tanto.
  La limitación de que el Panel en otra pestaña exporte una versión
  desactualizada MIENTRAS la pestaña atascada sigue sin recuperarse es
  inherente a que `pendingUnsaved` es memoria por pestaña sin ningún
  canal entre pestañas más allá de `localStorage` mismo — no se intentó
  resolver con un mecanismo nuevo tipo `BroadcastChannel` (desproporcionado
  frente al reporte); lo que sí se garantiza ahora es que, en cuanto la
  pestaña atascada logra guardar, ya no destruye lo que las demás
  lograron guardar en el ínterin. Dos casos nuevos en
  `tests/unit/quota-recovery.test.ts`: uno simula dos pestañas reales
  compartiendo `localStorage` (dos instancias de módulo independientes
  vía `vi.resetModules()` + reimport dinámico) y confirma que ni el
  cambio de A ni el de B se pierden; el otro confirma que, si también
  falla `avail()`, la lectura sigue sirviendo el cambio pendiente.
  Verificado que ambos detectan los bugs reales: revertido el fix
  temporalmente, el primero efectivamente pierde la actualización de
  costos de B y el segundo devuelve un valor nulo en vez del cambio
  pendiente. Ver ARCHITECTURE.md, sección "Esquema de
  `localStorage["gpi_db"]`" → "Cuota llena".

- **Algunos guardados secundarios omitían la protección de identidad del
  proyecto agregada en un fix anterior** — el usuario reportó, con
  evidencia puntual, dos caminos: abrir WBS en A, activar B y pulsar
  "Sembrar Entregables" — B recibía la EDT de A mezclada con sus
  entregables; e iniciar "Promover a RAN" en Requisitos de A, cambiar a
  B y confirmar — el requisito de A se agregaba al Acta de B. "El
  guardado principal está protegido, pero estas operaciones llaman
  directamente al núcleo sin pasar el identificador esperado."
  Diagnóstico: la corrección anterior ("Ningún módulo guarda sin
  verificar que el proyecto activo sigue siendo el que cargó") solo
  auditó la función PRINCIPAL de guardado de cada módulo (`push()`/
  `save()`); no buscó sistemáticamente otras llamadas directas a
  `GPI.setModule()`/`GPI.patchMeta()` fuera de ella. Una auditoría
  posterior (grep exhaustivo de `.setModule(`/`.patchMeta(` en los 13
  módulos + lectura manual del contexto de cada una) confirmó que había
  exactamente dos guardados secundarios así: `seedFromScope()` en
  `src/modules/wbs/main.ts` (botón "Sembrar Entregables", sin diálogo de
  confirmación pero con la misma falta de chequeo) y `promoteToRan()` en
  `src/modules/requirements/main.ts` (botón "Promover a RAN", dentro del
  callback `.then()` de un diálogo de confirmación — la ventana de
  tiempo entre iniciar la acción y confirmarla es exactamente donde otra
  pestaña puede cambiar el proyecto activo). Los otros 11 módulos no
  tienen ninguna llamada al núcleo fuera de su función principal ya
  protegida. Corrección, con un patrón distinto en cada archivo: en
  `wbs.ts`, `seedFromScope()` ahora llama a `markDirty()` (el mecanismo
  ya existente para avisar cualquier cambio estructural, que dispara el
  `push()` real y ya protegido) en vez de escribir directo, y gana
  además su propia comprobación de identidad ANTES de leer los
  entregables (variable módulo-nivel nueva `ensureProjectFresh`,
  asignada por `gpiBridge()` igual que `requestGpiPush`), para evitar el
  mensaje de "listo" engañoso cuando el proyecto ya cambió; en
  `requirements.ts`, `promoteToRan()` gana el mismo chequeo inline que
  ya usa `save()`, justo al entrar al callback `.then()` del diálogo —
  se comprueba la identidad al EJECUTAR la operación, no al iniciarla —
  y pasa `loadedProjectId` a `setModule("charter", ch, loadedProjectId)`.
  Nuevos casos en `tests/smoke/wbs-builder.smoke.test.ts` y
  `tests/smoke/recopilar-requisitos.smoke.test.ts` que reproducen cada
  repro exacta. Verificado que ambos detectan el bug real: revertido
  cada fix por separado, "Sembrar Entregables" efectivamente mezcla la
  EDT de A con el entregable de B, y "Promover a RAN" efectivamente
  agrega el RAN de A al Acta de B (2 requisitos en vez de 1). Ver
  ARCHITECTURE.md, sección "El hueco que dejó la primera pasada:
  guardados SECUNDARIOS que llaman al núcleo directo".

- **Recopilar Requisitos — un id importado se insertaba sin escapar en
  manejadores onclick inline (XSS, extensión del arreglo de Stakeholder
  Studio)** — el usuario reportó, con evidencia puntual
  (`src/modules/requirements/main.ts:420`), que un identificador de
  requisito importado se insertaba directamente en botones HTML, y
  confirmó en Chrome que importar un `.json` de requisitos y abrir el
  módulo ejecutaba un marcador JavaScript inocuo **sin pulsar el
  botón**. Diagnóstico: a diferencia de casi todos los demás módulos
  (que usan `data-*` + `addEventListener`), Recopilar Requisitos usa
  `onclick`/`onchange` inline, así que el `id` no vive en un atributo
  plano sino DENTRO de un literal de cadena JS que a su vez vive dentro
  del atributo HTML — el arreglo de Stakeholder Studio (escapar solo
  para HTML) no alcanza aquí: con una comilla doble sin escapar (el bug
  real) ni hacía falta el clic, rompía el atributo `onclick="..."`
  mismo e inyectaba marcado que se ejecuta al renderizar; y aun
  escapando solo para HTML, una comilla simple seguiría pudiendo cerrar
  el literal de cadena JS y ejecutar código al hacer clic, porque el
  navegador decodifica las entidades del atributo ANTES de compilar el
  manejador como JS. Corrección en dos capas, preservando el patrón
  `onclick` inline existente (no se reescribió la arquitectura de
  eventos del módulo): (1) `isSafeId()` — todo `id` que entra por
  `normalizeItem()`/`normalizeMod()` se valida contra un patrón seguro
  (`/^[A-Za-z0-9_-]{1,64}$/`) y se regenera si no lo cumple, así un
  `id` malicioso nunca llega a guardarse ni a renderizarse; (2)
  `escJsAttr()` — los 8 sitios que interpolan un `id` dentro de un
  `onclick`/`onchange` inline lo escapan primero para el literal de
  cadena JS y recién después para HTML, defensa en profundidad. Se
  auditaron los 13 módulos buscando el mismo patrón: ningún otro
  interpola un identificador crudo dentro de un manejador inline
  (`cost.ts`, la otra excepción con `onclick` inline, solo usa un
  índice de arreglo interno, nunca atacante-controlable). Nuevo caso en
  `tests/smoke/recopilar-requisitos.smoke.test.ts`: importa un `id` con
  un payload de ruptura de atributo para un requisito y una
  modificación, confirma que no se ejecuta ningún marcador ni se inyecta
  ningún elemento, y que los botones siguen funcionando con un `id`
  regenerado y seguro. Verificado que el test detecta el bug real:
  revertido el fix temporalmente, el mismo payload crea 7 elementos
  `<img onerror>` en el DOM. Ver ARCHITECTURE.md, sección
  `Recopilar_Requisitos.html`.

- **JSZip dependía de un CDN externo y el mensaje de error resultaba
  engañoso cuando faltaba** — el usuario reportó: con la CDN bloqueada,
  un archivo `.xlsx` válido produjo el mensaje "no parece ser un .xlsx
  válido" al importarlo; con acceso autorizado, las pruebas pasaron. La
  exportación ofrece CSV de reserva, pero eso no resuelve la
  importación de `.xlsx` sin conexión. Diagnóstico:
  `Activity_Definition.html`, `Cronograma_CPM.html`, `Estimar_Costos.html`,
  `Panel_Control.html` y `WBS_Builder.html` cargaban JSZip desde
  `cdnjs.cloudflare.com`; con el CDN inalcanzable, `window.JSZip`
  quedaba `undefined`, `(window.JSZip as JSZipCtor).loadAsync(buf)`
  lanzaba un `TypeError` inmediato, y el `try/catch` genérico alrededor
  del parseo de `activities`/`cost-estimate`/`cronograma-cpm`/`wbs` no
  distinguía "la librería no cargó" de "el archivo está mal". Corrección
  en dos partes, exactamente la recomendada: (1) JSZip se vendoriza en
  el repo — `npm run build:jszip` (`scripts/sync-jszip.mjs` nuevo, más
  `sync-artifact.mjs`) copia `node_modules/jszip/dist/jszip.min.js`
  (bundle UMD, sin ESM, la misma versión que ya usan los fixtures de
  `tests/e2e/*-import.spec.ts`) a la raíz como `jszip.min.js`, y los 5
  HTML cargan ese archivo local en vez de la URL del CDN — elimina la
  dependencia de Internet para el uso normal (`file://`, GitHub Pages,
  `npm run dev`); `npm run build:all` reconstruye y verifica su frescura
  igual que a cualquier otro artefacto. (2) Los 4 módulos que importan
  `.xlsx` comprueban `!window.JSZip` como primer paso, antes de intentar
  parsear, y muestran un aviso distinto si la librería no está —
  defensa en profundidad por si `jszip.min.js` falla por cualquier otro
  motivo (caché corrupta, bloqueo del navegador), ya no solo por
  Internet. Nuevo caso en `tests/smoke/activity-definition.smoke.test.ts`
  (representativo de los 4 módulos, mismo parche mecánico): borra
  `window.JSZip` tras cargar la página y confirma que el aviso
  distingue "librería ausente" de "archivo inválido". Verificado que el
  test detecta el bug real: revertidos temporalmente el HTML y el
  `.ts` de `activities`, el mismo intento de import reproduce el
  mensaje engañoso que reportó el usuario. Efecto colateral positivo:
  los propios smoke tests dependían silenciosamente de que el CDN fuera
  alcanzable desde el entorno de test; con el vendorizado local esa
  dependencia de red desaparece también de la suite. Ver
  ARCHITECTURE.md, sección "JSZip vendorizado en el repo, no cargado
  desde un CDN".

- **`scripts/static-server.mjs` — el servidor local permitía leer
  archivos fuera del repositorio (path traversal)** — el usuario
  reportó: una ruta con segmentos `..` codificados recibió HTTP 200 y
  permitió leer un archivo inocuo del SDK fuera del proyecto; el
  servidor escucha únicamente en `127.0.0.1`, lo que limita la
  exposición, y el problema corresponde al servidor local (`npm run
  dev` / `tests/e2e` vía `playwright.config.ts`), no a GitHub Pages.
  Diagnóstico: la ruta pedida se resolvía con `path.join(ROOT,
  urlPath)`, que normaliza segmentos `..` pero no impide que
  suficientes `../` (o su versión codificada, `%2e%2e`) terminen
  apuntando fuera de `ROOT` — cualquier archivo del disco legible por el
  proceso quedaba expuesto, con los permisos del usuario, a otro
  proceso local o a otra pestaña del mismo navegador mientras el
  servidor sigue corriendo. Corrección: la ruta se resuelve con
  `path.resolve(ROOT, "." + urlPath)` (el `"."` inicial evita que
  `resolve` descarte a `ROOT` si `urlPath` se interpretara como
  absoluto) y se rechaza con 403 toda ruta resuelta que no quede dentro
  de `ROOT` (comparando contra el prefijo `ROOT + path.sep`, no un
  `startsWith(ROOT)` a secas, para que un directorio hermano con el
  mismo prefijo de nombre no cuele). Nuevo
  `tests/unit/static-server-traversal.test.ts`: arranca el script real
  como subproceso y confirma en HTTP real, contra un archivo "canario"
  propio en el directorio temporal del sistema, que una ruta con `..`
  —literal o codificada— nunca devuelve su contenido, sin dejar de
  servir archivos normales del repo. Verificado que el test detecta el
  bug real: revertido el fix temporalmente, la petición con `..`
  codificados efectivamente devolvía 200 y el contenido del canario.
  Deliberadamente sin tocar: el mismo patrón `createServer`/`join(ROOT,
  ...)` duplicado en el `beforeAll` de los 14 `tests/smoke/*.smoke.test.ts`
  — son servidores efímeros internos al proceso de Vitest, sin ningún
  actor externo que pueda mandarles una ruta arbitraria, a diferencia de
  `static-server.mjs`. Ver ARCHITECTURE.md, sección
  "`scripts/static-server.mjs` — la ruta pedida se resuelve DENTRO de la
  raíz del repo".

- **Núcleo — las importaciones .json carecían de validación estructural
  suficiente: `modules` ausente y EDT/OBS con ciclos** — el usuario
  reportó dos fallas: un proyecto con `schema` reconocido y metadatos,
  pero sin `modules`, se aceptaba y después provocaba errores de
  lectura; y una EDT con referencias circulares causaba desbordamiento
  de pila. Diagnóstico: `normalizeToProject()` devolvía el objeto
  importado tal cual en cuanto veía `schema`/`meta` válidos, sin
  garantizar `modules` — y `getModule()` (~60 llamadas en los 13
  módulos y en Panel de Control) leía `p.modules[name]` sin comprobar
  que `p.modules` existiera, así que el primer acceso reventaba con
  `TypeError`. Por separado, `detectTool()` (import de un solo módulo)
  y `normalizeToProject()` (import de proyecto completo) aceptaban la
  forma `{rootId, nodes}` de WBS/OBS sin validar que `children` formara
  un árbol real: un ciclo (A hijo de B, B hijo de A) hacía que cualquiera
  de los seis recorridos recursivos del núcleo sobre esos datos
  (`wbsCodes`, `wbsLeaves`, `obsNodes`, `wbsPhases`, `activitiesStats`,
  `pertStats` — ninguno lleva control de visitados) entrara en
  recursión infinita apenas se abría un módulo o el Panel con ese
  proyecto activo. Corrección, preservando los formatos antiguos
  compatibles (nada se rechaza, se sanea en silencio, igual que el
  resto de las ramas de compatibilidad del archivo): `normalizeToProject()`
  garantiza `modules` como objeto cuando falta; `getModule()` gana una
  segunda capa de defensa (`p && p.modules`) para proyectos ya guardados
  sin `modules` por otra vía; y una función nueva, `sanitizeTree()`,
  compartida por `detectTool()` y `normalizeToProject()`, recorre el
  árbol desde `rootId` y descarta cualquier referencia en `children` que
  forme un ciclo, apunte a un id inexistente o le dé un segundo padre a
  un nodo ya visitado. No se tocaron los seis recorridos recursivos en
  sí (WBS Builder ya impide crear un ciclo desde la UI vía
  `isDescendant()`; la única vía real de entrada es un `.json`
  importado, que es exactamente donde se corta ahora). Nuevo
  `tests/unit/import-validation.test.ts` (6 casos): `modules` ausente
  por las dos rutas de import, un ciclo WBS de dos pasos vía
  `importProject()` y vía `ingestToolExport()`, un ciclo OBS, y una
  referencia colgante a un id inexistente. Verificado que los tests
  detectan los bugs reales: revertido el fix temporalmente, fallan con
  el mismo `TypeError`/`RangeError: Maximum call stack size exceeded`
  que reportó el usuario. Ver ARCHITECTURE.md, sección "Validación de
  estructura al importar: `modules` ausente y ciclos en WBS/OBS".

- **Núcleo — el respaldo recomendado tras un fallo de almacenamiento
  podía omitir los últimos cambios** — el usuario simuló un error de
  cuota (`localStorage.setItem` lanzando `QuotaExceededError`) y
  reportó: `setModule()` devolvió `true`, apareció el aviso de
  almacenamiento lleno, y `exportActive()` devolvió la versión anterior.
  El aviso recomienda exportar para rescatar el trabajo, pero la
  exportación del Panel consulta los datos persistidos. Diagnóstico
  confirmado en `save()` (`src/core/gpi-core.ts`): cuando la escritura a
  disco fallaba, la versión recién mutada en memoria se descartaba sin
  más — la función no devolvía nada, así que `setModule()`/`patchMeta()`
  reportaban éxito de forma incondicional, y la siguiente lectura
  (incluida `exportActive()`, que usa el mismo `db()`) volvía a
  parsear `localStorage` desde cero, sirviendo la última versión que sí
  se había guardado. El aviso visible prometía un rescate que la
  implementación no cumplía. Corrección: `save()` ahora devuelve si la
  escritura llegó a disco, y cuando falla retiene esa versión en una
  variable de módulo nueva (`pendingUnsaved`, distinta del `mem` ya
  existente para cuando `localStorage` no está disponible en absoluto —
  esta es específicamente "hay `localStorage`, pero ESTA escritura se
  rechazó por cuota"). `db()` sirve `pendingUnsaved` a toda lectura
  posterior mientras exista, así que `exportActive()` —y cualquier otra
  lectura, y cualquier escritura posterior, que ahora sigue construyendo
  sobre el cambio pendiente en vez de partir otra vez de la versión
  vieja— ve el cambio real que se intentó guardar. `setModule()`
  devuelve el resultado real de `save()` en vez de `true` incondicional.
  Se agregó `GPI.hasUnsavedChanges()` para que Panel de Control (o
  cualquier módulo) pueda consultar el estado además del aviso visual.
  El estado pendiente se limpia solo cuando un guardado posterior tiene
  éxito (el alumno libera espacio borrando proyectos viejos, o el
  navegador deja de estar lleno). Nuevo
  `tests/unit/quota-recovery.test.ts`: simula el error de cuota
  (mockeando `Storage.prototype.setItem` para que solo la clave
  `gpi_db` falle, dejando intacta la sonda de disponibilidad que usa
  `avail()`) y confirma que `setModule()` refleja el fallo real, que
  `exportActive()` sirve el cambio pendiente en vez de la versión vieja,
  y que un guardado posterior exitoso persiste el cambio y limpia el
  estado. Verificado que el test detecta el bug real: revertido
  temporalmente el fix, el mismo test falla exactamente donde se
  esperaba. Ver ARCHITECTURE.md, sección "Esquema de
  `localStorage["gpi_db"]`" → "Cuota llena".

- **Stakeholder Studio — un .json de interesados manipulado podía
  ejecutar código en el navegador (XSS)** — el usuario reportó, con
  evidencia puntual, que un identificador de interesado importado se
  insertaba directamente en atributos HTML sin escapar, y confirmó en
  Chrome que un identificador manipulado ejecutaba un marcador
  JavaScript inocuo al abrir el módulo. Diagnóstico: `data-id="${s.id}"`
  (13 sitios: editor de detalle, paneles de Poder/Interés, tarjetas del
  registro, burbuja del gráfico) se interpolaba SIN pasar por
  `escapeHtml()`, a diferencia de `name`/`org`/`role`/`category`, que sí
  lo hacían — `id` no es un valor interno confiable, viaja tal cual
  desde cualquier `.json` de interesados importado (`detectTool()` en
  `gpi-core.ts` copia el arreglo completo sin sanear ningún campo) hasta
  el render vía `main.innerHTML`/`sb.innerHTML`. Un `id` con comillas
  rompe el atributo e inyecta HTML/JS arbitrario que corre en el origen
  del sitio, con acceso de lectura/escritura a TODOS los proyectos
  guardados en ese `localStorage` — no solo el importado. Auditoría del
  resto de campos encontró un segundo vector menos obvio: Legitimidad y
  Urgencia (`${s[key]}`, 2 sitios) tampoco se escapaban, y son las dos
  únicas propiedades numéricas de `Stakeholder` que NO se recalculan al
  cargar (a diferencia de Poder/Interés, siempre derivados por
  aritmética que produce `NaN` de forma segura ante datos corruptos,
  nunca una cadena) — un valor de Legitimidad con marcado HTML se
  insertaba tal cual como contenido de texto. Corregidos los 15 sitios
  con `escapeHtml()`. Deliberadamente sin tocar: los 4 usos de `s.id`
  dentro de `document.querySelector('[data-id="${s.id}"]')` (comparan
  contra el valor ya decodificado del atributo vía API del DOM, no HTML
  insertado — escaparlos con una función pensada para contexto HTML
  rompería la coincidencia). Cubierto por un nuevo caso "SEGURIDAD" en
  `tests/smoke/stakeholder-studio.smoke.test.ts` que reproduce el ataque
  con un `id` y una Legitimidad con marcado HTML real y confirma que
  ningún elemento ni atributo inyectado llega al DOM ni se ejecuta
  ningún marcador. Ver ARCHITECTURE.md, sección `Stakeholder_Studio.html`.

- **Integridad de datos — un módulo abierto podía sobrescribir OTRO
  proyecto tras un cambio de proyecto activo en otra pestaña** — el
  usuario reprodujo la secuencia exacta: abrir el Acta de Constitución
  del proyecto A, activar el proyecto B desde el Panel de Control (otra
  pestaña, mismo `localStorage`), y disparar el guardado de salida del
  Acta. B terminó con el nombre y el Acta de A. Diagnóstico correcto del
  usuario: "el módulo guarda su estado anterior sobre el proyecto que
  esté activo en ese momento, sin comprobar su identidad". Una auditoría
  completa confirmó que no era un bug aislado del Acta sino un hueco de
  diseño sistémico en los 13 módulos de herramienta y en el núcleo:
  `GPI.setModule()`/`GPI.patchMeta()` escribían siempre sobre el proyecto
  activo leído en el momento de la llamada, sin ningún parámetro de
  identidad, y el patrón de guardado compartido (`beforeunload` +
  `visibilitychange`, con auto-guardado por debounce o inmediato en
  algunos) solo comprobaba "¿hay algún proyecto activo?", nunca "¿sigue
  siendo el mismo que cargué?". Corrección en dos capas: (1) núcleo —
  `setModule`/`patchMeta` ganan un tercer parámetro opcional
  `expectedProjectId`, y si no coincide con el proyecto activo actual no
  escriben nada (sin el parámetro, compatibilidad intacta con Panel de
  Control); (2) los 13 módulos capturan el id. del proyecto que cargaron
  y rechazan guardar (mostrando un aviso visible) si el proyecto activo
  cambió a otro distinto — excepto la transición legítima de "sin
  proyecto" a "proyecto recién creado", que sigue permitida. Los 12
  módulos con `GPI.onChange()` avisan proactivamente apenas otra pestaña
  cambia el proyecto activo, no solo al guardar/salir; a
  `project-charter` (el módulo reportado) se le agregó su primer
  `onChange()`. Repro end-to-end en `tests/smoke/project-charter.smoke.test.ts`
  (guardado solo al salir) y `tests/smoke/cronograma-cpm.smoke.test.ts`
  (guardado inmediato en cada edición, la ventana de exposición más
  chica), y la defensa del núcleo por separado en
  `tests/unit/project-identity-guard.test.ts`. No se corrigió el sentido
  invertido de `!document.hidden` en `raci`/`schedule-plan`/
  `scope-statement` ni se hizo que el `onChange()` "de mentira" de otros
  módulos refresque de verdad sus propios datos — problema real pero
  distinto (frescura/UX), fuera de alcance deliberado. Ver
  ARCHITECTURE.md, sección "Ningún módulo guarda sin verificar que el
  proyecto activo sigue siendo el que cargó".

- **Cronograma/CPM — no seguía el mismo criterio de "Id." que Definir las
  Actividades/Estimar los Costos y dejaba los hitos completamente fuera**
  — el usuario señaló que el módulo no hacía las mismas verificaciones
  que el de Costos y que estaba dejando los hitos afuera. Confirmado: era
  un bug real, no una decisión de diseño vigente (la "regla de oro" del
  Id. gapless-como-MS-Project ya estaba documentada en ARCHITECTURE.md,
  pero solo se había aplicado a Definir las Actividades/Estimar los
  Costos). Además del hueco de visibilidad, era un bug funcional: al
  pegar un cronograma real de MS Project (que sí numera los hitos como
  cualquier tarea), la verificación de nombre por Id. de este módulo
  quedaba mal alineada para toda actividad posterior a un hito.
  `fullRowsSnapshot()` ahora interca `activities.milestones` en la
  numeración con el mismo `placeLooseMilestones()` que ya usan
  `activities`/`cost-estimate` (copia local), y cada hito entra como un
  nodo CPM real de duración 0 (`kind:"activity"`, su propio id) — así
  atraviesa gratis toda la maquinaria existente (CPM, Red, Gantt,
  plantilla, pegado, enlace manual) sin tocar `gpi-core.ts`, que ya
  calculaba ES=EF/LS=LF correctamente para duración 0. Se corrigió
  además `criticalPertSums()`, que invalidaba la probabilidad PERT de la
  ruta crítica si un hito caía en ella (un hito nunca tiene terna O/M/P
  por definición). El botón "⇩ Cargar ejemplo en el proyecto" (agregado
  antes en esta misma sesión) ahora también agenda los 3 hitos del
  catálogo DISTRIB+ (H1/H2/H3) como nodos reales. Probado end-to-end en
  Chrome real: 51/51 enlaces resuelven, 46 filas (43 actividades + 3
  hitos), los 3 hitos caen en la ruta crítica (34 actividades críticas en
  vez de 31; duración y fecha de fin no cambian, 0 no suma tiempo).
  "Modo ejemplo" (sandbox congelado, regresión dorada de 53 días/9
  críticas) no se tocó — no tiene hitos definidos. Análisis PERT sigue
  sin ver hitos (fuera de alcance, no se pidió). Cubierto en
  `tests/smoke/cronograma-cpm.smoke.test.ts` (paridad de Id. con
  Actividades/Costos, y un hito como nodo CPM real encadenado) y
  `tests/unit/cpm.test.ts` (caso nuevo de duración 0). Ver
  ARCHITECTURE.md, "El 'Id.' de Definir las Actividades..." y la sección
  de `Cronograma_CPM.html`.

- **Cronograma/CPM — el reporte imprimible no incluía "Predecesoras" ni
  "Auditoría"** — a pedido explícito del usuario, que reportó el
  ejemplo precargado como "incompleto" por esto (y no entendía para qué
  servía "Auditoría"). La tabla de `buildReport()` es un `<table>`
  armado a mano, independiente de la tabla en pantalla (`#cpmTable`) —
  esta última ya tenía las 12 columnas completas, incluidas
  Predecesoras/Auditoría, desde antes; solo el reporte se había quedado
  corto en 10. Ahora el reporte trae las 12 (agrega "Predecesoras",
  calculada igual que en pantalla vía `incoming()`/`linkToken()`, y
  "Auditoría", igual que en pantalla vía `state().import.dates`) y dos
  leyendas nuevas explicando qué significa cada una — en particular,
  que "Auditoría" compara la fecha calculada contra una fecha de MS
  Project pegada con «📋 Pegar cronograma», y por eso queda en "—" si
  nunca se pegó un cronograma real (como en el propio ejemplo DISTRIB+,
  que si tiene enlaces/predecesoras completos desde antes, pero nunca
  pega fechas de MS Project). Probado en
  `tests/smoke/cronograma-cpm.smoke.test.ts` con un token real de
  predecesora del ejemplo ("SS+4d").

- **Panel de Control — la columna "Tipo" de la plantilla combinada no se
  explicaba con claridad** — a pedido explícito del usuario. En el
  ejemplo de la hoja "Actividades" solo se mencionaba el valor "Hito",
  sin aclarar que en blanco significa "actividad normal"; en el
  ejemplo de la hoja "Estimado" la columna "Tipo" no se explicaba EN
  ABSOLUTO (podía valer "Proyecto"/"Fase"/"Paquete"/"Hito" para una
  fila de solo referencia, o quedar en blanco para una fila con
  precio, y el ejemplo solo mostraba esta última). Ahora cada bloque
  explica los valores válidos de "Tipo" explícitamente, y el ejemplo
  de "Estimado" agrega una fila de referencia (Tipo="Paquete") junto a
  la fila con precio, para que se vea la diferencia con un caso real.
  Probado en `tests/e2e/panel-control-template.spec.ts`.

- **WBS Builder solo guardaba en el Panel al ocultar o cerrar la
  pestaña, nunca al editar** — a pedido explícito del usuario, que pidió
  garantizar que WBS Builder sea la capa "que manda": un rename de fase
  o paquete debe reflejarse en Definir las Actividades y Estimar los
  Costos sin depender de que el alumno cambiara de pestaña de cierta
  forma. Ahora guarda con el mismo debounce de 800ms que ya usan los
  demás 13 módulos (`markDirty()`), disparado desde cada edición real
  (nombre, fechas, costo, responsable, notas, avance, agregar/eliminar/
  reasignar un nodo, Cargar ejemplo/Nuevo proyecto, importar `.xlsx`).
  Detalle en ARCHITECTURE.md. Probado en
  `tests/e2e/wbs-authority-propagation.spec.ts` con las pestañas de
  Definir las Actividades y Estimar los Costos ya abiertas, sin
  recargarlas ni ocultar la de WBS Builder.

- **Importar un .xlsx en Definir las Actividades no verificaba que la
  columna "Paquete de trabajo" coincidiera con el nombre real del
  paquete en la EDT** — mismo hueco, y misma corrección, que ya tenía
  Estimar los Costos: la columna existía en la plantilla pero se
  ignoraba por completo al reconciliar (nunca se leía). Ahora, si está
  presente, su texto debe coincidir con el nombre REAL de ese Código
  EDT en WBS Builder ahora mismo, o la fila se rechaza
  (`packageMismatches`) — a pedido explícito del usuario: la EDT es la
  capa que manda sobre este módulo, así que un archivo desactualizado
  (paquete renombrado en WBS Builder después de descargar la plantilla)
  ya no se reconcilia en silencio contra el Código EDT solo. Probado en
  `tests/e2e/activity-definition-import.spec.ts`.

- **Importar un .xlsx en Estimar los Costos no rechazaba un archivo cuando
  NINGUNA fila correspondía a la EDT/actividades reales del proyecto
  activo.** La validación por Código EDT + Nombre de la actividad ya
  existía y funcionaba fila por fila, pero cuando el resultado neto era
  "0 actividades reconciliadas" (por ejemplo, al importar por error el
  archivo de otro proyecto, con códigos y nombres que no corresponden a
  nada acá) el módulo igual mostraba el modal de "reemplazar el
  estimado actual" -- si el alumno confirmaba sin leer con cuidado,
  perdía los precios reales ya cargados, reemplazados por un resultado
  vacío. Ahora ese caso se RECHAZA directamente (alerta, sin ofrecer
  reemplazar nada) -- mismo criterio de bloqueo que ya usaba
  `Activity_Definition.html`, cerrando una asimetría entre los dos
  módulos. Se agregó además una tercera capa de validación: si la
  columna "Paquete de trabajo" está presente, su texto debe coincidir
  con el nombre real de ese Código EDT -- detecta una fila donde
  alguien cambió el código a mano sin actualizar el nombre del paquete.
  Probado con un archivo completamente ajeno y con una fila de Código
  EDT/Nombre correctos pero Paquete de trabajo equivocado.

- **"⇩ Exportar a Excel" en Estimar los Costos no traía la columna "Id.",
  repetía el Código EDT del paquete en cada actividad, y omitía
  proyecto/fases/paquetes por completo (el archivo solo listaba
  actividades e hitos).** El `.xlsx` (y su CSV de reserva sin
  `window.JSZip`) reconstruía las filas por su cuenta en vez de usar la
  misma `fullRows()` que ya alimenta la tabla en pantalla y el reporte
  impreso -- por eso le faltaba la columna "Id." (agregada a las otras
  vistas en un cambio anterior, nunca a la exportación), el "Código
  EDT" de una actividad como "Corte de zanja" (paquete 1.1, segunda de
  dos) salía como "1.1" en vez de "1.1.2" (el código propio que sí se
  ve en pantalla), y un paquete CON actividades nunca tenía su propia
  fila (quedaba implícito, repetido en cada una de sus actividades) --
  el archivo no era un reflejo fiel de la tabla. Ahora ambas funciones
  derivan directamente de `fullRows()` y listan TODO lo que la tabla
  muestra (proyecto, fases, paquetes -- con su Subtotal acumulado -- y
  actividades e hitos), así que el archivo exportado es idéntico a lo
  que el alumno ve. El import se ajustó para seguir aceptando tanto el
  código del paquete (archivos viejos) como el de la actividad (los que
  genera el export de hoy), y descarta solas las filas de referencia
  (proyecto/fase/paquete) al reimportar. Probado con un test E2E que
  descomprime el `.xlsx` real generado por el botón y compara fila por
  fila y celda por celda, y otro que fuerza el CSV de reserva
  bloqueando la carga de JSZip.

### Changed

- **Definir las Actividades: la hoja del `.xlsx` se renombró de "EDT" a
  "Actividades"** — a pedido explícito del usuario, "para que sea
  compatible" con el resto de la suite (WBS Builder ya usa "WBS",
  Estimar los Costos ya usa "Estimado" — "EDT" quedaba ambiguo frente al
  módulo que realmente ES la EDT). Sincronizado en la plantilla
  combinada de Panel de Control (`ACTIVITIES_SHEET_NAME`). La plantilla
  también gana una columna **"Id."** (primera columna, como ya tienen
  Estimar los Costos/PERT/Cronograma-CPM): se completa para la fila de
  cada paquete (el mismo correlativo que ya se ve en pantalla) y, al
  importar, si ya no corresponde a esa misma posición en la EDT actual
  (p. ej. se insertó un hito antes de ese paquete después de exportar
  el archivo), se avisa — aviso, no bloqueo, mismo criterio que ya
  tenía Estimar los Costos. A diferencia de ahí, el Id. de esta
  plantilla identifica al PAQUETE, no a la actividad (la plantilla
  invita a duplicar la fila del paquete para agregar más de una
  actividad, así que varias filas legítimamente comparten el mismo
  Id.) — la verificación contrasta el Id. contra el Código EDT, nunca
  contra el nombre de la actividad. Detalle completo en
  ARCHITECTURE.md. Probado en `tests/e2e/activity-definition-import.spec.ts`
  y `tests/e2e/panel-control-template.spec.ts`.

- **Cronograma/CPM: los encabezados de la tabla ("EDT", "Dur", "IC",
  "TC", "IL", "TL", "H.T.", "H.L.", "Auditoría") no eran explícitos** —
  a pedido explícito del usuario, que no entendía qué significaban;
  ajustado en tres pasadas sucesivas hasta el encabezado final que
  también pidió explícitamente: **Id. | Código EDT | Actividad |
  Duración | ES | EF | LS | LF | Holgura Total | Holgura Libre |
  Predecesoras | Auditoría**. "Código EDT" y "Actividad" coinciden
  ahora exactamente con Definir las Actividades/Análisis PERT (las
  tres primeras columnas de esta tabla vienen de ahí, nunca se editan
  aquí). ES/EF/LS/LF (Early Start/Early Finish/Late Start/Late Finish)
  son las siglas inglesas estándar de CPM — se conservan bien cortas a
  pedido explícito, a diferencia de "Holgura Total"/"Holgura Libre"/
  "Duración"/"Auditoría", que quedaron en su nombre completo en
  español sin sigla. El reporte imprimible (`buildReport()`) tenía la
  misma tabla armada por separado — se corrigió igual ("Código EDT",
  "Duración", "ES", "EF", "LS", "LF", "Holgura Total") y trae una
  leyenda .rep-note con el significado de ES/EF/LS/LF en inglés, mismo
  criterio que ya usa Análisis PERT con su propia fórmula O/M/P/TE/
  σ/σ² al pie del reporte.

- **Se retiraron los botones "⭳ Guardar (.json)" / "⭱ Abrir (.json)" de
  los 13 módulos-herramienta** — a pedido explícito del usuario: cada
  módulo tenía su propio respaldo/restauración de SOLO su porción de
  datos, coexistiendo sin explicación con el "Exportar/Importar
  proyecto" de Panel de Control y generando confusión sobre cuál usar.
  Guardar/Abrir `.json` pasa a ser responsabilidad exclusiva de Panel
  de Control: "⭳ Exportar proyecto" / "⭱ Importar proyecto" para el
  archivo completo, y el ya existente "⭱ Importar .json" de cada
  tarjeta del lanzador para el `.json` de un solo módulo (mismo formato
  que cada herramienta seguía generando). Detalle completo, incluida
  una excepción deliberada de alcance en RACI, en ARCHITECTURE.md.

- **En Estimar los Costos, "Nombre de la actividad" ya no queda vacía en
  las filas de Proyecto/Fase/Paquete del archivo exportado** — repite el
  nombre de esa fila (a pedido explícito del usuario, para que la
  columna funcione como un "concepto" uniforme al usar el archivo como
  tabla dinámica en Excel: una columna con celdas vacías intercaladas
  rompe el agrupado). La distinción entre una fila de referencia y una
  de actividad real para reconciliar al importar pasa a depender
  siempre de la columna "Tipo" (`NON_ACTIVITY_TYPES` =
  `["hito","proyecto","fase","paquete"]`), nunca de si "Nombre de la
  actividad" está vacía o no -- ya no es un indicador confiable de eso.

- **La columna "N.º" de Definir las Actividades, Estimar los Costos,
  Análisis PERT y Cronograma/CPM pasa a llamarse "Id."** y es siempre
  **consecutiva, sin saltos** — igual que el Task ID que MS Project
  asigna a cada fila de un cronograma (tarea o hito), para que estas
  tablas se puedan pegar/exportar contra MS Project fila por fila sin
  romper esa correspondencia. Un hito, al agregarse en el cambio
  anterior, en un primer momento no consumía número de Id. (mostraba
  "—") para que el Id. coincidiera exactamente entre las cuatro tablas;
  se corrigió a pedido explícito del usuario porque dejar un hueco ahí
  rompe la correlación 1:1 con MS Project, que es más importante. Ahora
  un hito consume su propio número, igual que cualquier fila — con la
  consecuencia esperada de que, a partir del primer hito de un proyecto,
  el Id. de Definir las Actividades/Estimar los Costos (que sí muestran
  hitos) queda "un número adelante" del de Análisis PERT/Cronograma-CPM
  (que nunca los ven) para el mismo paquete/actividad; documentado en
  ARCHITECTURE.md. Cubierto por tests en los cuatro smoke tests.

### Added

- **Panel de Control — "⇩ Plantilla combinada (.xlsx)"**: a pedido
  explícito del usuario, un solo libro con una hoja por cada módulo que
  importa desde Excel ("WBS", "EDT", "Estimado", más una hoja de
  instrucciones), cada una con el nombre y los encabezados EXACTOS que
  ese módulo exige — para que el alumno complete todo el proyecto en un
  único archivo y cada módulo, al importar, encuentre su propia hoja
  sin ambigüedad. La hoja "Instrucciones" incluye, para cada una de las
  tres hojas de datos, un ejemplo con el encabezado real y 1-2 filas ya
  completadas (a pedido explícito del usuario). Probado en
  `tests/e2e/panel-control-template.spec.ts`, incluido un round-trip
  real: completa la hoja "WBS" de la plantilla descargada y la
  reimporta tal cual en WBS Builder.

- **WBS Builder ahora puede exportar/importar la EDT completa como
  `.xlsx`** — a pedido explícito del usuario, con la misma lógica que ya
  usan Definir las Actividades y Estimar los Costos: hoja de datos con
  nombre EXACTO ("WBS", distinto de "EDT"/"Estimado" de esos dos módulos
  para que un libro con las tres hojas no sea ambiguo) y encabezados que
  deben coincidir EXACTAMENTE con la plantilla, o se rechaza el archivo.
  "⇩ Exportar a Excel" reproduce la misma tabla que ya se ve en la vista
  "Tabla / Diccionario" (Código EDT | Paquete de trabajo | Nivel |
  Duración | Inicio | Fin | Costo | Responsable | Avance). A diferencia
  de esos dos módulos (que importan filas sobre una EDT ya existente),
  WBS Builder ES la fuente de la EDT: "⇧ Importar desde Excel"
  RECONSTRUYE el árbol completo a partir de la columna "Código EDT"
  (`1`, `1.1`, `1.1.1`…, sin ninguna columna de "padre"). Un Código EDT
  que ya existía en el árbol conserva su mismo id interno al reimportar
  (y con él, sus enlaces con la Matriz RACI, Definir las Actividades y
  en cascada Estimar los Costos/PERT/Cronograma) — solo un Código EDT
  genuinamente nuevo crea un nodo nuevo; uno que desaparece del archivo
  se elimina, igual que borrarlo a mano. Detalle completo en
  ARCHITECTURE.md, sección de WBS_Builder.html. Probado en
  `tests/e2e/wbs-builder-import.spec.ts`: reconstrucción de jerarquía con
  una fase cuyo Costo del archivo se ignora (se recalcula), rechazo por
  hoja mal nombrada, rechazo por encabezados abreviados, rechazo por
  archivo sin ningún Código EDT válido, reporte de códigos huérfanos/
  repetidos, y un round-trip (exportar → reimportar sin tocar el
  archivo) que verifica que un paquete con RACI asignada sigue
  apareciendo bloqueado — prueba indirecta de que conservó su id.

- **`detectTool()` (gpi-core.ts) reconoce ahora los 13 formatos de
  exportación de módulo, no 11.** Al retirar el import propio de cada
  herramienta (ver arriba) y dejar "Importar .json" de Panel de Control
  como único punto de entrada por módulo, se detectó que
  "Recopilar Requisitos" (`gpi.requirements/v1`) y "Estimar los Costos"
  (`gpi.costEstimate/v1`) nunca habían tenido caso en `detectTool()`:
  ese botón existía en sus tarjetas pero fallaba en silencio
  (`unknown-format`) para esos dos módulos. Corregido junto con la
  centralización, no de forma separada. Cubierto por
  `tests/unit/tool-export-import.test.ts`, nuevo, que fija los 13
  formatos reconocidos (más `unknown-format`/`no-active`).

- **Al importar un .xlsx en Definir las Actividades y en Estimar los
  Costos, se verifica que la HOJA y los ENCABEZADOS del archivo sean
  los correctos, no solo el contenido de las filas.** A pedido
  explícito del usuario: si el alumno guarda todo el proyecto en un
  solo libro de Excel con varias hojas (una por módulo), antes se leía
  ciegamente la PRIMERA hoja del libro sin fijarse en cuál era en
  realidad -- con varias hojas en el mismo archivo, ese supuesto ya no
  alcanza para saber cuál copiar. Ahora se buscan, entre TODAS las
  hojas del libro, la que se llama exactamente "EDT" (Definir las
  Actividades) o "Estimado" (Estimar los Costos) -- el mismo nombre que
  ya escribe la propia exportación de cada módulo -- y se rechaza el
  archivo con un aviso claro (listando qué hojas sí tiene) si no
  aparece ninguna con ese nombre. Además, el emparejamiento de columnas
  dejó de aceptar coincidencias parciales ("EDT" o "Paquete" solos
  bastaban antes para reconocer "Código EDT" o "Paquete de trabajo",
  por ejemplo) -- ahora el texto del encabezado debe coincidir EXACTO
  (solo se ignoran mayúsculas/acentos/espacios) con el de la plantilla,
  aunque las columnas sí se puedan seguir reordenando libremente. Ambas
  verificaciones bloquean el import por completo (no se llega a
  reconciliar ninguna fila) y se documentaron en las instrucciones de
  cada plantilla `.xlsx`. Probado con un archivo de una sola hoja mal
  nombrada y con encabezados abreviados, en los dos módulos.

- **Al importar un .xlsx en Estimar los Costos, se verifica -- a través
  de la columna "Id." -- que el Código EDT y el "Paquete de trabajo /
  Actividad" de cada fila sigan correspondiendo, en el proyecto actual,
  a lo mismo que había cuando se exportó el archivo.** A pedido
  explícito del usuario: antes, la reconciliación por Código EDT +
  Nombre de la actividad (que sigue siendo la que decide si una fila se
  importa) no contrastaba nada contra el Id. de la fila, así que un
  archivo exportado ANTES de un cambio posterior en Definir las
  Actividades (una actividad nueva, un hito agregado, que corre la
  numeración) se podía reimportar sin ningún aviso de que las filas ya
  no correspondían a la misma posición. Ahora, si el Id. de una fila ya
  no corresponde en el proyecto actual al mismo Código EDT y/o
  "Paquete de trabajo / Actividad" que trae el archivo, se avisa en la
  confirmación indicando cuántas filas y cuál(es) de las dos columnas
  no coincide(n) -- es un aviso, no bloquea esa fila si Código EDT +
  Nombre siguen resolviendo correctamente por su cuenta. Probado
  insertando un hito en Definir las Actividades después de exportar y
  reimportando el archivo ya desactualizado.

- **Hitos en Definir las Actividades y Estimar los Costos**: nuevo tipo
  de actividad especial, con duración cero por definición y un código
  propio asignado por el alumno (convención "H1", "H2"... no la
  numeración automática del paquete). Un hito puede estar atado a un
  paquete de trabajo o ir suelto (hito del proyecto en general, sin
  depender de un paquete puntual). Se marca en la plantilla `.xlsx` con
  el mismo mecanismo que usa Primavera P6 (una columna "Tipo" +
  "Código de hito"), tolerante a que solo se complete una de las dos.
  En "Estimar los Costos" un hito aparece listado para trazabilidad
  pero nunca tiene costo (Unidad/Cantidad/Precio unitario/Subtotal en
  blanco, no suma al total) y se omite silenciosamente al reimportar el
  archivo exportado. **Un hito suelto puede ir en cualquier posición del
  listado — nunca se agrupa en un capítulo aparte**: su posición la
  determina dónde el alumno insertó su fila en el archivo respecto de
  las filas de paquete (antes de la primera = al principio de todo, p.
  ej. un hito de inicio de proyecto; después de la última = al final de
  todo, p. ej. un hito de fin de proyecto). El ejemplo DISTRIB+ trae
  tres hitos ilustrativos: "H1 Inicio del Proyecto" (suelto, al
  principio), "H2 Fin de Cimentaciones" (atado al paquete 4.2) y "H3
  Cierre del Proyecto" (suelto, al final). Fuera de alcance deliberado:
  PERT y Cronograma CPM no ven los hitos (siguen leyendo solo las
  actividades).

- **Ejemplo DISTRIB+ de Actividades completo: los 18 paquetes de trabajo
  quedan desagregados**, no solo 8. Antes, 10 de los 18 paquetes se
  dejaban deliberadamente sin actividades ("ejercicio para el alumno"),
  pero eso hacía que, para esos paquetes, la EDT de ejemplo se viera
  "tal cual copiada del WBS, sin desagregar" — justo lo que un paquete
  de trabajo NO debería ser. Se agregaron 21 actividades nuevas (43 en
  total) cubriendo Informes de seguimiento, Diseño eléctrico/sanitario,
  Permisos, los 3 paquetes de Procura, Acabados, Instalaciones MEP,
  Capacitación al cliente y Acta de cierre. El ejemplo de "Estimar los
  Costos" (que reutiliza estas mismas actividades) se actualiza en el
  mismo sentido: 42/43 actividades con precio, 17/18 paquetes con
  estimado completo, total S/ 6.160.500 (antes 21/22, 7/8, S/
  2.009.700) — sigue quedando deliberadamente una sola actividad sin
  precio, para demostrar el estado "parcial" en la UI.

- **"⇩ Cargar ejemplo en el proyecto" en Definir las Actividades y en
  Estimar los Costos**: hasta ahora, el "Modo ejemplo" de estos dos
  módulos era un sandbox que nunca tocaba el proyecto activo (por
  diseño). Eso dejaba un hueco de coherencia: si el alumno ya cargaba el
  ejemplo DISTRIB+ en WBS Builder (que sí reemplaza el proyecto real),
  "Definir las Actividades" sobre esa misma EDT real se seguía viendo
  sin ninguna actividad — la EDT "se veía" sin desagregar en paquetes de
  trabajo. Este nuevo botón sí reemplaza los datos del proyecto activo
  real (con la misma confirmación explícita que ya usa WBS Builder),
  reconciliando el ejemplo por Código EDT (y, en Estimar los Costos,
  también por nombre de actividad) contra la EDT/actividades reales —
  reutilizando tal cual la misma función de reconciliación que ya usa el
  import de archivos `.xlsx` reales, en vez de duplicar esa lógica.
  Requiere hacerlo en orden: EDT (WBS Builder) → Actividades → Costos.

- **Nuevo módulo "Estimar los Costos" (`Estimar_Costos.html`, clave
  `costEstimate`)**: proceso PMBOK "Estimate Costs". El costo vive a
  nivel de **actividad**, no de paquete de trabajo (un paquete no tiene
  Unidad/Cantidad propias en PMBOK) — el módulo reutiliza las
  actividades ya definidas en "Definir las Actividades" (mismo id/
  nombre/unidad/metrado) y solo agrega el Precio Unitario por
  actividad; el costo de un paquete es la suma del Subtotal de sus
  actividades (Cantidad × Precio unitario, nunca persistido). Se
  completa importando un `.xlsx` que valida cada fila por Código EDT
  **y** Nombre de la actividad contra las actividades reales, y avisa
  de actividades que quedan sin precio; "⇩ Exportar a Excel" siempre
  reproduce el estado actual (plantilla en blanco si no hay precios,
  round-trip fiel si ya los hay — probado en un test E2E real que
  descarga y reimporta el archivo). Mismo mecanismo de `.xlsx` hand-rolled
  (JSZip) construido para "Definir las Actividades".
  - `WBS_Builder.html`: el Costo de un paquete queda bloqueado
    ("🔗 Tomado de Estimar los Costos") solo cuando **todas** sus
    actividades tienen un Subtotal válido — mismo patrón que
    Fechas↔Cronograma CPM. Un estimado parcial no bloquea el campo.
  - `Cost-management.html` (Planificar la Gestión Financiera): nuevo
    botón "↧ Traer de Estimar los Costos", alternativo al ya existente
    "↧ Traer de la EDT".
  - Nuevas funciones de núcleo en `gpi-core.ts`: `costEstimateRows`,
    `costEstimateTotal`, `applyCostEstimateToWbs` (unen `wbs` +
    `activities` + `costEstimate`).

### Changed

- **Renombre**: el módulo "Gestión de Costos" pasa a llamarse
  "Planificar la Gestión Financiera" (`Cost-management.html`, misma
  clave `cost`, mismo archivo — solo cambia el nombre visible).
- WBS Builder: el encabezado de columna "Código" pasa a llamarse
  "Código EDT" (tabla y reporte), uniformizando el término con la
  plantilla de Excel de Actividades/Estimar los Costos.
- **Coherencia Costo/Fechas/Responsable en la EDT (`WBS_Builder.html`)**:
  al definir la EDT no se puede conocer el costo, la duración ni las
  fechas reales de un paquete — ahora queda explícito en la UI cuándo un
  valor es una estimación y cuándo viene de otro módulo.
  - Responsable deja de ser texto libre con sugerencias: si la Matriz
    RACI no le asignó un "R", ahora es una lista desplegable restringida
    a los cargos del OBS ("Cargo — Persona"); si el proyecto todavía no
    tiene OBS, el campo se deshabilita y pide crearla primero.
  - Fecha inicio/fin y Duración se toman automáticamente del Cronograma
    CPM (`GPI.util.applyScheduleToWbs`, nuevo en gpi-core.ts) una vez
    que el paquete tiene actividades y una ruta crítica calculable —
    mismo patrón de bloqueo que ya existía para Responsable↔RACI. Sin
    eso, los campos siguen editables y se etiquetan "Estimado".
  - Costo se etiqueta siempre "Estimado" (bottom-up): ningún otro
    módulo del curso calcula hoy un costo real por paquete de trabajo.

- **Rediseño de "Definir las Actividades" (`Activity_Definition.html`)**:
  la grilla interactiva editable (tipear/pegar celda por celda) se
  reemplaza por un flujo de exportar una plantilla `.xlsx` en blanco con
  los paquetes de la EDT, completarla afuera en Excel o MS Project (el
  cronograma real del curso se trabaja ahí), y volver a importarla —
  la tabla en pantalla pasa a ser de solo lectura. El import reemplaza
  `byLeaf` por completo (no hace merge), emparejando filas por código
  EDT y columnas por el texto del encabezado (no por posición). El
  esquema de datos `ActivitiesModule` y el cálculo de duración
  (nunca persistida) no cambiaron — `pert`/`cronograma-cpm` siguen
  consumiéndolo igual.

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
