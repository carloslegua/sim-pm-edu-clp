# GPI — Plataforma de Gestión de Proyectos de Ingeniería

Suite de módulos HTML independientes que comparten un único núcleo de datos
(`gpi-core.js`, sobre `localStorage`). Sin frameworks. **El despliegue sigue sin
build**: se copian todos los archivos a un mismo directorio (GitHub Pages,
servidor local, doble clic) y funcionan tal cual. Todos deben quedar **en la
misma carpeta** para que los enlaces relativos y el núcleo compartido funcionen.

> **Para quien mantiene el código:** desde 2026 la lógica se escribe en
> TypeScript bajo `src/` y se compila a los `.js` que acompañan a cada HTML
> (`npm run build:<módulo>`). Los `.js` de la raíz son **artefactos generados y
> versionados**: no se editan a mano, se regeneran. Ver [ARCHITECTURE.md](ARCHITECTURE.md)
> (patrones por módulo), [MIGRATION.md](MIGRATION.md) (crónica de la migración)
> y la sección [Desarrollo](#desarrollo) al final.

## Punto de entrada

- **`Panel_Control.html`** — abrir este primero. Gestiona el proyecto activo,
  los datos comunes y lanza cada herramienta. Las tarjetas están organizadas por
  **área de conocimiento del PMBOK 8** (Integración, Interesados, Alcance,
  Cronograma, Costo, Calidad, Recursos, Comunicaciones, Riesgos, Adquisiciones).

## Entrega gradual de módulos (novedad)

El Panel decide **qué herramientas puede abrir el alumno**. Se configura en un
único bloque al inicio de `src/modules/panel-control/main.ts`, marcado como
«① ENTREGA DE MÓDULOS»; tras editarlo hay que recompilar el Panel con
`npm run build:panel-control` (eso regenera `panel-control.js`, que es el
archivo que el navegador carga y que **no debe editarse a mano**):

```ts
const MODULOS_ENTREGADOS: "*" | "auto" | string[] = ["charter", "stakeholders"];
```

| Valor | Efecto |
|---|---|
| `"*"` | entrega todo lo construido (modo profesor) |
| `"auto"` | detecta qué archivos `.html` se copiaron junto al Panel (requiere servidor; con `file://` no puede sondear y muestra todo) |
| `[ "clave", … ]` | lista explícita — **modo recomendado** |

Los módulos no entregados **siguen visibles** en el Panel, con la etiqueta
«no entregado aún» y el botón deshabilitado: el alumno ve el mapa completo del
curso sin toparse con enlaces rotos. Los módulos aún sin construir conservan su
etiqueta «próximamente». Para entregar uno más, se agrega su clave a la lista y
se vuelve a publicar; no hay que tocar nada más.

Claves disponibles: `charter` · `stakeholders` · `requirements` ·
`scopeStatement` · `wbs` · `activities` · `pert` · `schedulePlan` · `schedule` ·
`cost` · `obs` · `raci`.

### Agregar módulos nuevos

El bloque «② MÓDULOS PROPIOS» (`MODULOS_EXTRA`), en el mismo
`src/modules/panel-control/main.ts`, permite registrar herramientas nuevas sin
tocar la tabla `MODULES` original (recompilar igual con
`npm run build:panel-control`):

```ts
const MODULOS_EXTRA: ModuleDef[] = [
  { key:"riesgos", group:"risk", name:"Gestión de Riesgos",
    file:"Risk_Register.html", icon:"⚠", color:"#ff9f1c",
    desc:"Registro de riesgos, matriz probabilidad–impacto y plan de respuesta." }
];
```

`key` es a la vez la clave de su rebanada de datos (`GPI.getModule("riesgos")` /
`GPI.setModule("riesgos", …)`) y `group` el área PMBOK donde aparece la tarjeta
(`integ`, `stake`, `scope`, `sched`, `cost`, `qual`, `res`, `comm`, `risk`,
`proc`). Hay que agregar la clave a `MODULOS_ENTREGADOS` para que se pueda abrir.

## Núcleo

- **`gpi-core.js`** — capa de datos compartida. Un proyecto vive en
  `localStorage["gpi_db"]` con una rebanada `modules.<clave>` por herramienta.
  Se genera desde `src/core/gpi-core.ts` con `npm run build:core`.

## Regla de oro del ecosistema (datos de ejemplo)

**Ningún módulo escribe datos de ejemplo sobre el proyecto activo sin una
acción explícita y confirmada del alumno.**

- Con un proyecto activo **sin datos** en un módulo, la herramienta arranca
  **en blanco** (con un mensaje que sugiere el botón «Cargar ejemplo»).
- El caso **DISTRIB+ S.A.** se carga únicamente con el botón «Cargar ejemplo»
  (o «Modo ejemplo» en Actividades/PERT, que además *nunca* persiste sobre el
  proyecto — igual que el modo ejemplo de la Matriz RACI).
- En modo independiente (archivo abierto sin `gpi-core.js` o sin proyecto
  activo), cada herramienta sigue mostrando su demo autocontenida.
- Gestión de Costos solo crea su rebanada `modules.cost` tras la **primera
  edición real** del usuario: abrir la página ya no genera un BAC fantasma
  en el Panel.

## Módulos activos

| Área         | Archivo                          | Clave           |
|--------------|----------------------------------|-----------------|
| Integración  | `Project_Charter.html`           | `charter`         |
| Interesados  | `Stakeholder_Studio.html`        | `stakeholders`    |
| Alcance ①    | `Recopilar_Requisitos.html`      | `requirements`    |
| Alcance ②    | `Enunciado_del_Alcance.html`     | `scopeStatement`  |
| Alcance ③    | `WBS_Builder.html`               | `wbs`             |
| Cronograma   | `Activity_Definition.html`       | `activities`    |
| Cronograma   | `Pert_Analysis.html`             | `pert`          |
| Cronograma   | `Schedule_Management_Plan.html`  | `schedulePlan`  |
| Cronograma   | `Cronograma_CPM.html`            | `schedule`      |
| Costo        | `Cost-management.html`           | `cost`          |
| Recursos     | `OBS_Builder.html`               | `obs`           |
| Recursos     | `RACI_Matrix.html`               | `raci`          |

## Acta de Constitución — ampliada (novedad)

`Project_Charter.html` cubre ahora las **17 secciones** del formato de acta usado
en clase (antes 13). Las secciones incorporadas:

| Sección | Qué aporta |
|---|---|
| **3. Caso de negocio** | Justificación económica, inversión estimada, beneficio/ahorro anual, payback, VAN/TIR y **beneficios no monetarios** declarados aparte, para que la decisión no dependa solo del criterio financiero. |
| **11. Recursos preasignados** | Personas, áreas y activos que la organización comprometió *antes* de la planificación detallada. Da respaldo formal al Director frente a las gerencias funcionales. |
| **15. Requisitos para la aprobación** | Tabla *qué se aprueba · quién aprueba · evidencia*. Define las puertas de etapa. |
| **16. Criterios de salida** | Condiciones de cierre, incluida la de **cierre anticipado por no viabilidad** — sin ese criterio escrito, los proyectos inviables continúan por inercia. |
| **Patrocinadores que autorizan** (en §17) | Todas las autoridades que respaldan el proyecto, más allá de la firma del patrocinador principal. |

La sección 1 suma además **enfoque de desarrollo** (predictivo / ágil / híbrido),
**director adjunto** e **idioma del proyecto**.

El checklist de completitud pasó de 17 a **23 elementos** (nueva categoría
«Recursos y aprobación»), y el reporte imprimible emite las 20 secciones.
`GPI.util.charterAudit` quedó sincronizado en `gpi-core.js`.

**Compatibilidad:** las actas guardadas con el esquema anterior se migran solas
(`normalizeState`); los campos nuevos aparecen vacíos y nada se pierde.

**Corrección:** el botón «+ Agregar interesado» existía en el marcado pero nunca
se enlazó a un manejador — no hacía nada al pulsarlo. Ya funciona.

## Stakeholder Studio — integrado (novedad)

`Stakeholder_Studio.html` queda unido al ecosistema y entregado junto con el
Panel y el Acta. Escribe su rebanada `modules.stakeholders`:

```
stakeholders: { stakeholders:[ {id,name,org,role,category,
                                power,interest,           // 0–100, derivados
                                powerCriteria:{pos,res,net,veto,expert},
                                interestCriteria:{afect,stake,align,prox,atten},
                                legitimacy,urgency,notes} ],
                powerWeights, interestWeights, idCounter }
```

El **poder** se deriva de 5 criterios ponderados (20% cada uno) y el **interés**
de 5 indicadores (25/25/20/15/15%); ambos se recalculan en cada render y nunca se
editan a mano. Vistas: cuadrante Poder–Interés y saliencia de Mitchell-Agle-Wood.

Consumidores ya conectados:

| Módulo | Qué toma |
|---|---|
| **Panel de Control** | n.º de interesados y cuántos caen en «gestionar de cerca» (poder e interés ≥ 50); KPI del tablero |
| **Acta de Constitución** | botón «⇩ Importar interesados clave» — trae el cuadrante «gestionar de cerca», o los 5 de mayor poder+interés si nadie califica |
| **Recopilar Requisitos** | `stakeholderId` de cada `REQ`, para trazar quién origina cada requisito |
| **Equipo del Proyecto (OBS)** | autocompletado del campo «Persona» |

Cumple la regla de oro: conectado a un proyecto sin interesados arranca **en
blanco** (el caso DISTRIB+ queda tras «Cargar ejemplo»), y sin proyecto activo
no escribe nada en el almacén compartido. Se añadió reactividad entre pestañas
(`GPI.onChange`) siguiendo el patrón del resto del ecosistema: refresca el
encabezado cuando el Panel cambia el proyecto, sin pisar la edición en curso.

## Módulo de Costos (novedad)

`Cost-management.html` implementa el Plan de Gestión de Costos (PMBOK 8 + AACE):
moneda y estimación base, clase de estimado (AACE 17R-97), contingencia e
inflación, umbrales CV/CPI, órdenes de cambio y documento BOE. Integrado al
núcleo: toma la estimación base del rollup de costos del WBS (botón
"↧ Traer de la EDT"), guarda en `modules.cost` del proyecto activo y muestra sus
KPIs (BAC, órdenes de cambio) en el Panel.

## Módulo de Requisitos (novedad)

`Recopilar_Requisitos.html` implementa la matriz de trazabilidad de requisitos
(RTM, PMBOK 8). Cada `REQ.00X` enlaza el requisito de alto nivel del Acta
(`RAN.0X`) y el interesado que lo origina (del registro de `stakeholders`) con
el paquete de la EDT (`wbs`) que lo satisface, más su criterio de aceptación y
método de verificación. Distingue con claridad dos etapas:

1. **Línea base** — se construye libremente y luego se *congela* (versión, fecha,
   aprobador) guardando una copia inmutable.
2. **Modificaciones de alcance** — posteriores a la línea base, agrupadas en
   `MOD.0X`, con evaluación de impacto y un campo `ccrRef` **preparado para
   enlazarse con el futuro módulo de Control Integrado de Cambios** (`changes`).

La pestaña «Trazabilidad de cambios» compara la línea base contra el estado
actual (altas/modificados/bajas). El módulo audita la cobertura `RAN → REQ`
(todo RAN debe desarrollarse en ≥1 REQ), la trazabilidad `REQ → EDT`, los
requisitos emergentes (sin RAN) y el posible sobre-alcance (paquetes de la EDT
sin requisito). Sus KPIs aparecen en el Panel.

Para dar soporte a este enlace, el **Acta de Constitución** ahora codifica sus
requisitos de alto nivel como `RAN.0X` (objetos `{id, code, text}` con migración
automática desde el esquema antiguo de cadenas), y `gpi-core.js` expone
`GPI.util.charterRans`, `GPI.util.requirementsAudit` y `GPI.util.reqByWbsLeaf`.

## Enunciado del Alcance — flujo corregido (novedad)

`Enunciado_del_Alcance.html` implementa **Definir el Alcance** (PMBOK 8) y cierra
el eslabón que faltaba entre requisitos y EDT. El orden del área de Alcance queda
alineado con el PMBOK:

> **① Recopilar Requisitos → ② Enunciado del Alcance → ③ Crear la EDT**

Principio que refuerza toda la interfaz: **la EDT descompone _entregables_, no
requisitos.** El módulo:

- Registra la **descripción del alcance** (producto y trabajo), pudiendo traerla
  del Acta.
- Define los **entregables `DEL.0X`** con su **criterio de aceptación**. Cada
  entregable traza hacia atrás a los `RAN` del Acta y a los `REQ` que lo
  justifican, y hacia adelante a la EDT. Botón «↧ Sugerir desde el Acta».
- Gestiona **supuestos, restricciones y exclusiones** (importables del Acta).
- Audita la **coherencia** Requisitos ↔ Entregables ↔ EDT: entregables sin REQ
  (sobre-alcance), REQ sin entregable (alcance faltante), entregables sin
  descomponer en la EDT y sin criterio de aceptación. Permite **congelar la
  línea base** del alcance.

**Pestaña «Consistencia» (integración vertical).** El Enunciado del Alcance
incluye una matriz de consistencia encadenada **RAN → REQ → DEL → WP**, con una
fila por requisito (la unidad que no debe caerse). Encadena las cuatro puertas de
trazabilidad y detecta el cruce fino que ninguna auditoría por separado veía: si
el entregable que **acoge** un REQ (`DEL.reqIds`) coincide con el entregable al
que **pertenecen** sus paquetes de trabajo (subiendo por el árbol de la EDT hasta
el primer ancestro con `delId`). Colores: rojo = REQ sin entregable o sin
paquete; ámbar = REQ emergente, EDT no organizada por entregables, o discrepancia
DEL↔WP; verde = cadena completa y coherente. Debajo, un panel de huérfanos y
sobre-alcance (entregables sin REQ, paquetes sin REQ ni entregable, RAN sin REQ,
REQ emergentes). Es **solo lectura**: deriva de lo existente y enlaza a los
módulos donde corregir. La lógica vive en `GPI.util.traceMatrix`.

Integración con la EDT: **`WBS_Builder.html`** incorpora el botón
**«↧ Sembrar Entregables»**, que crea una rama de nivel 1 por cada entregable del
Enunciado del Alcance (etiquetada con `delId`, sin duplicar). El núcleo expone
`GPI.util.scopeDeliverables`, `GPI.util.wbsDelIds` y `GPI.util.scopeAudit`; el
Panel muestra sus KPIs y una tarjeta de coherencia del alcance, con un *ribbon*
del flujo recomendado en el área de Alcance.

## Cronograma / CPM — módulo (`Cronograma_CPM.html`)

Módulo activo: construye la **red de precedencias** del proyecto y calcula la
**ruta crítica** (CPM) con tres vistas — **Tabla CPM** (IC/TC/IL/TL, holguras
total y libre, auditoría de fechas), **Red (AON)** y **Gantt**. Lee las
actividades del módulo `activities`, la EDT de `wbs`, las duraciones PERT de
`pert` y el calendario de `schedulePlan`; guarda solo su rebanada
`modules.schedule`:

```
schedule: { links:[ {id,from,to,type:"FS"|"SS"|"FF"|"SF",lag,lagUnit,source} ],
            linkCounter, import:{at,tool,rowMap,dates}|null, baseline|null }
```

Los enlaces son **actividad → actividad** (`from` precede a `to`). Registrada la
rama `gpi.schedule/v1` en `detectTool` para import/export.

**Complemento MS Project (pegar, no importar).** El futuro módulo dejará *pegar*
desde Excel/MS Project la topología (enlaces con sintaxis MS Project) y las fechas.
Principio pedagógico: **se pega la topología, el simulador recalcula el cronograma**;
las fechas de MS Project son **solo auditoría** (✓/✗), jamás la verdad. La llave de
unión es el **N.º estilo MS Project** (0 = proyecto, luego fases/paquetes/actividades
consecutivas), tal como ya lo numera `Activity_Definition.html`. El pegado vive en el
propio módulo Cronograma.

Utilidades nuevas en `gpi-core.js` (capa de datos, no calculan fechas):

- `GPI.util.parsePredecessorCell(cell)` — celda de predecesoras → `{preds,errors}`.
  Tokeniza de izq. a der.: resuelve separador de lista `;`/`,` vs. coma decimal del
  desfase, unidades `d`/`h`/`w`/`ed`, y canonicaliza FC/CC/CF (español) a FS/SS/SF.
- `GPI.util.buildScheduleLinks(pasted, snapshot)` — resuelve N.º → actividad, cruza
  por nombre (detecta desfase de N.º), manda fechas a auditoría y devuelve enlaces,
  rechazos y errores. **Enlazar una tarea resumen o el proyecto se rechaza con aviso.**
- `GPI.util.scheduleValidate(activityIds, links)` — colgantes, auto-enlaces,
  duplicados, **ciclos** (orden topológico de Kahn) y extremos abiertos.
- `GPI.util.projectCalendar(sp?)` — calendario del CPM **leído de
  `schedulePlan.calendar`** (días laborables, horas/día, feriados); default provisional
  Lun–Vie/8 h si aún no hay Plan del Cronograma.
- `GPI.util.cpm(nodes, links, calendar, {startDate})` — pasada adelante/atrás con
  tipos de relación FS/SS/FF/SF y desfases; devuelve IC/TC/IL/TL, holguras, ruta
  crítica, duración del proyecto y las **fechas de calendario** de cada actividad.
- `GPI.util.addWorkingDays(date, n, calendar)` / `GPI.util.parseISO(s)` — mapeo de
  offsets (días laborables) a fechas, saltando fines de semana y feriados.
- `GPI.util.scheduleStats()` — resumen para el tablero del Panel (duración,
  n.º de actividades críticas y enlaces).

Sobre la ruta crítica, el módulo alimenta `pertProbability()` con el ΣTE/Σσ² para la
**probabilidad de cumplir el plazo objetivo**. La fuente de duración es conmutable:
determinística (Met ÷ #Eq·R) o PERT (TE).

## Marcadores en desarrollo (aún sin archivo)

Definidos en el Panel como placeholders para completar el mapa PMBOK:
Plan para la Dirección, Control Integrado de Cambios, Cierre del Proyecto,
Valor Ganado (EVM), Gestión de la Calidad, Gestión de las Comunicaciones,
Gestión de Riesgos, Simulación Monte Carlo, Gestión de las Adquisiciones.

## Nota

Para que las herramientas compartan datos automáticamente entre pestañas, sirve
los archivos desde un mismo origen (GitHub Pages o `python3 -m http.server`).
Abrirlos con doble clic (`file://`) también funciona por herramienta, pero el
almacenamiento no siempre se comparte entre pestañas en ese modo.

---

## Revisión de auditoría — correcciones aplicadas

### 1. Errores metodológicos de dirección de proyectos

**1.1 · Matriz Poder–Interés (Stakeholder Studio) — verificada, ya correcta.**
Se revisó la orientación completa del grid. Los ejes y los cuadrantes son
consistentes con Mendelow: `x = interés`, `y = poder` con la escala vertical
invertida (`py = (H−m) − v/100·(H−2m)`), de modo que el borde superior es *alto
poder*. Los cuatro cuadrantes quedan donde deben: arriba-izquierda *Mantener
satisfecho* (alto poder · bajo interés), arriba-derecha *Gestionar de cerca*,
abajo-izquierda *Monitorear*, abajo-derecha *Mantener informado*. La misma
clasificación (`umbral 50`) se usa en el reporte imprimible, en el KPI del Panel
de Control y en la importación de interesados críticos al Acta de Constitución,
así que las tres vistas coinciden. **No se requirió cambio.**

**1.2 · Contingencia desacoplada de la clase de estimado (Cost Management) —
CORREGIDO.** El selector de percentil aplicaba un porcentaje fijo
(P50→6 %, P70→10 %, P80→15 %, P90→20 %) *sin importar la clase AACE del
estimado*. Eso contradice el principio central de AACE 18R-97: para un mismo
nivel de confianza, un estimado Clase 5 necesita mucha más contingencia que uno
Clase 1, porque su rango de exactitud es mucho más ancho. Se sustituyó por una
matriz **clase × percentil**:

| Clase | P50 | P70 | P80 | P90 |
|---|---|---|---|---|
| 5 | 15 % | 25 % | 32 % | 45 % |
| 4 | 10 % | 18 % | 24 % | 32 % |
| 3 | 7 % | 12 % | 16 % | 22 % |
| 2 | 4 % | 8 % | 11 % | 15 % |
| 1 | 2 % | 5 % | 7 % | 10 % |

Cambiar de clase en la pestaña 02 ahora recalcula la contingencia en la
pestaña 03 y una nota explica de dónde sale el porcentaje.

**1.3 · Reserva de gestión mal calculada (Cost Management) — CORREGIDO.**
Se calculaba sobre `base + contingencia`, dejando fuera el escalamiento. Como el
escalamiento sí forma parte de la línea base de costos, la reserva quedaba
subdimensionada. Ahora es un porcentaje del **BAC** (`base + contingencia +
escalamiento`) y sigue quedando **fuera** de la línea base, como manda PMBOK.

**1.4 · Probabilidad PERT calculada sobre la ruta crítica (Análisis PERT) —
IMPLEMENTADO.** La tarjeta *Probabilidad de cumplimiento* estaba bloqueada con
el rótulo «CPM pendiente», pese a que el módulo Cronograma/CPM ya existe. Se
implementó el cálculo correcto: se recalcula el CPM **con las duraciones
esperadas TE** (no con las determinísticas), se identifica la ruta crítica, y
sólo sobre esa ruta se acumulan ΣTE y Σσ² para obtener
`Z = (plazo − ΣTE) / √Σσ²` y `P = Φ(Z)`. Esto corrige el error conceptual más
frecuente del método: sumar la varianza de *todas* las actividades en vez de la
de la ruta crítica. Si alguna actividad de la red no tiene terna válida, entra
con su duración base y aporta σ² = 0; la herramienta lo marca con `*` y avisa de
que la probabilidad queda **sobrestimada**.

### 2. Errores de programación y de lógica

- **Persistencia del percentil de contingencia.** Al pasar de un valor numérico
  (`0.10`) a una etiqueta (`P70`) se añadió una capa de compatibilidad que
  convierte los proyectos guardados con el esquema antiguo, para que no se
  rompan los `.json` ya exportados por los alumnos.
- **`kContCap` leía el texto de la opción y lo partía por espacios**, lo que
  dependía de la redacción literal de la etiqueta. Ahora lee el `value`.
- **Cambiar de clase de estimado no disparaba `recalcCont()`**: los KPI de la
  pestaña 03 quedaban desactualizados hasta tocar otro campo.
- **Red PERT frágil.** La primera versión del cálculo de ruta crítica excluía de
  la red las actividades sin terna válida, lo que *partía la cadena de
  precedencias* y devolvía una ruta crítica truncada (4 actividades en vez de 9
  en el caso de ejemplo). Se corrigió con el mecanismo de duración base descrito
  en 1.4.
- Se verificó con `node --check` y con arranque headless en jsdom que los 13
  módulos cargan sin errores de consola ni excepciones no capturadas.

### 3. Datos de ejemplo completados y hechos consistentes

- **Costos de la EDT recalibrados.** Los paquetes de trabajo del ejemplo sumaban
  USD 549 500 frente a un CAPEX declarado de USD 8 500 000: el tablero del Panel
  mostraba un ridículo «6 % del CAPEX desglosado en el WBS». Los 18 paquetes se
  reescalaron a valores realistas para un almacén logístico y suman ahora
  **USD 7 100 000**, que encadena así:

  | Concepto | Monto (USD) |
  |---|---|
  | Estimado base (EDT) | 7 100 000 |
  | Contingencia (Clase 3 · P70 = 12 %) | 852 000 |
  | Escalamiento (3,5 % anual · 0,5 años) | 123 181 |
  | **BAC — línea base de costos** | **8 075 181** |
  | Reserva de gestión (5 % del BAC) | 403 759 |
  | **Presupuesto total** | **8 478 941** |

  El total queda justo por debajo del CAPEX autorizado de USD 8,5 M del Acta de
  Constitución, de modo que la cadena Acta → EDT → Costos cierra numéricamente y
  el alumno puede ver qué pasa cuando la rompe.

- **Un solo universo de ejemplo.** El módulo Cronograma/CPM traía una red de
  juguete (`A`…`G`, «Excavación», «Losa de techo») sin relación con el caso
  DISTRIB+ que usan Definir las Actividades y Análisis PERT. El alumno no podía
  seguir la trazabilidad entre módulos. Ahora los tres comparten exactamente la
  misma EDT, las mismas 12 actividades (`a1`…`a12`) y las mismas ternas O–M–P.

- **Ternas PERT completadas.** Faltaban las de `a4`, `a7` y `a10`, de modo que la
  cobertura del ejemplo nunca llegaba al 100 %. Se añadieron y se conservó a
  propósito la terna inválida de `a8` (O > P) como ejercicio de detección.

- **Red de precedencias del ejemplo (13 enlaces)** con FS, SS y retardos, para
  que el CPM ejercite todos los tipos de relación:
  `a1→a2 (FS)`, `a2→a3 (FS)`, `a3→a4 (SS+4)`, `a2→a5 (FS)`, `a5→a6 (SS+3)`,
  `a5→a7 (SS+2)`, `a6→a8 (FS)`, `a7→a8 (FS)`, `a4→a8 (FS)`, `a8→a9 (FS)`,
  `a9→a10 (SS+2)`, `a10→a11 (FS+3)`, `a11→a12 (SS+5)`.
  Resultado verificado: duración 53 días laborables, fin 16/09/2026, ruta
  crítica `a1-a2-a3-a4-a8-a9-a10-a11-a12`.

---

## Desarrollo

La lógica de los 13 módulos y del núcleo vive en `src/` (TypeScript) y se
compila a los `.js` que carga cada HTML. **Los `.js` de la raíz son artefactos
generados y versionados**: se regeneran, no se editan.

```
src/core/gpi-core.ts          → gpi-core.js          (npm run build:core)
src/modules/<clave>/main.ts   → <clave>.js           (npm run build:<clave>)
src/shared/styles/shared.css  → gpi-shared.css       (npm run build:shared)
```

| Comando | Para qué |
|---|---|
| `npm install` | dependencias de desarrollo (Vite, TypeScript, Vitest) |
| `npm run build:<clave>` | recompila un módulo tras editar su `main.ts` |
| `npm run build:all` | reconstruye los 15 artefactos y falla si alguno queda distinto del último commit — corre esto (no solo el `build:<clave>` puntual) antes de comitear, para no publicar un `.js` desactualizado en silencio |
| `npm run typecheck` | `tsc --noEmit` sobre todo el proyecto |
| `npm run lint` / `lint:fix` | ESLint sobre `src/`, `configs/`, `tests/` (falla en errores; `any` explícito queda en "warn", ver CLAUDE.md) |
| `npm run format` / `format:check` | Prettier — configurado pero **no aplicado retroactivamente** al código existente (ver nota abajo) |
| `npm test` | suite de Vitest (unidad + humo sobre los HTML reales) |
| `npm run verify:deploy` | audita que el despliegue siga intacto (ver abajo) |

Claves de módulo para `build:<clave>`: `core` · `panel-control` ·
`project-charter` · `stakeholder-studio` · `requirements` · `scope-statement` ·
`wbs` · `activities` · `pert` · `schedule-plan` · `cronograma-cpm` · `cost` ·
`obs` · `raci` · `shared`.

### Reglas que no se deben romper

1. **Todo build es IIFE clásico**, nunca módulo ES: `file://` bloquea por CORS
   los `<script type="module">`, y abrir una herramienta con doble clic es un
   caso de uso soportado.
2. **Los artefactos se commitean.** GitHub Pages sirve la raíz sin paso de
   build; si un `.js` no está en el repositorio, la herramienta no carga.
3. **El esquema de `localStorage["gpi_db"]` y sus ramas de compatibilidad no se
   tocan**: hay `.json` exportados por alumnos que deben seguir abriendo.

`npm run verify:deploy` comprueba automáticamente 1 y 2 (más que cada HTML siga
cargando `gpi-core.js`, que no quede lógica inline y que ninguna ruta sea
absoluta). Conviene ejecutarlo antes de publicar.

### Integración continua

`.github/workflows/ci.yml` corre `typecheck` + `lint` + `test` + `build:all` +
`verify:deploy` en cada push y cada pull request a `master`. Un PR con la
insignia en rojo significa que rompió alguna de las reglas de arriba antes
de que llegue a nadie más — no hace falta correrlos a mano para confiar en
que `master` sigue sano.

### Nota sobre Prettier y el estilo del código

El estilo actual (funciones e `if`/`try` condensados en una sola línea) es
deliberado: así se portó mecánicamente el JS original y así se pudo
comparar línea por línea contra el baseline pre-migración. `npm run format`
existe y está configurado, pero no se corrió sobre el código existente —
un `prettier --write` de prueba sobre un solo archivo reescribía miles de
líneas. Úsalo para código nuevo; reformatear todo el repo es una decisión
aparte que debe confirmarse explícitamente, no algo a hacer de pasada.

## Licencia

MIT — ver [LICENSE](LICENSE).
