# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/). Este archivo empieza a
mantenerse a partir de esta entrada — no es una reconstrucción día por día de
cada commit, sino un resumen agrupado de lo entregado hasta ahora. De aquí en
adelante, cada cambio notable se agrega bajo `[Unreleased]` a medida que
ocurre, moviéndose a una entrada con fecha cuando se corte una versión.

## [Unreleased]

### Fixed

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
