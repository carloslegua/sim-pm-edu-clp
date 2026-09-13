/* =========================================================
   Plan de Gestión del Cronograma — motor de datos y UI
   Basado en AACE RP 38R-06 (Documenting the Schedule Basis)
   y las salidas de "Plan Schedule Management" de PMBOK.

   Port mecánico del <script> inline de Schedule_Management_Plan.html
   (Fase 4 de MIGRATION.md): misma lógica, mismo comportamiento. Se
   agregan tipos y se compila a schedule-plan.js (IIFE) para que el HTML
   lo cargue como <script src="schedule-plan.js"> en vez de tenerlo
   inline.

   Mismo patrón que los módulos anteriores: addEventListener
   exclusivamente, window.GPI explícito, IIFE propio -- no hace falta
   exponer nada en window.

   NOTA DE TIPADO: SchedulePlanModule en core/types.ts es deliberadamente
   laxo (Record<string, unknown> en varios campos) porque gpi-core.ts solo
   necesita leer un puñado de sub-campos (methodology, calendar,
   controlThresholds, etc.) para el audit y otros módulos. Este archivo,
   en cambio, es el DUEÑO del esquema completo del plan, así que define su
   propio tipo detallado (ScheduleState) y lo pasa a GPI.setModule/
   getModule sin fricción porque esas firmas son (name, data: unknown) /
   retorno estructuralmente compatible.
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { ObsModule, ProjectMeta, RaciModule, SchedulePlanModule, WbsModule } from "../../core/types";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- CONSTANTES ----------
const FIXED_TOOL = "Microsoft Project (MS Project)";

interface Threshold { key: string; metric: string; unit: string; higherIsBetter: boolean; greenValue: number; redValue: number; action: string; fixed: boolean; }

// Umbrales fijos SV y SPI. Cada banda guarda SOLO el número; el operador
// (≥ para verde, < para rojo) es fijo y vive fuera del dato, de modo que los
// valores greenValue/redValue son extraíbles y comparables directamente contra
// los indicadores calculados desde un cronograma exportado de MS Project (XML).
//   higherIsBetter=true  -> Verde si valor ≥ greenValue ; Rojo si valor < redValue
function defaultThresholds(): Threshold[] {
  return [
    { key: "SV", metric: "SV — Variación de Cronograma", unit: "%", higherIsBetter: true, greenValue: -5, redValue: -10, action: "", fixed: true },
    { key: "SPI", metric: "SPI — Índice de Desempeño del Cronograma", unit: "", higherIsBetter: true, greenValue: 0.95, redValue: 0.90, action: "", fixed: true }
  ];
}

// ---------- ESTADO ----------
interface WorkingTime { from: string; to: string; }
interface Holiday { date: string; name: string; }
interface Milestone { name: string; date: string; type: string; constraint: string; notes: string; }
interface RoleRow { role: string; person: string; responsibility: string; raci: string; }
interface ReportRow { name: string; frequency: string; audience: string; tool: string; }

interface ScheduleState {
  intro: { objective: string; scope: string };
  methodology: { approach: string; tool: string; unit: string; scheduleLevel: string; scheduleClass: string; levelNotes: string; modelType: string; levelOfDetail?: string };
  codification: { rule: string; activityIdPattern: string };
  calendar: { workDays: string[]; hoursPerDay: number; workingTimes: WorkingTime[]; holidays: Holiday[]; notes: string };
  durationEstimating: { method: string; contingencyBasis: string; notes: string };
  criticalPath: { methodology: string; tool: string; nearCriticalThresholdDays: number; floatOwnership: string };
  controlThresholds: Threshold[];
  performanceMeasurement: { method: string; evmRules: string; updateFrequency: string };
  milestones: Milestone[];
  scheduleReserve: { pct: number; basisText: string; governance: string };
  roles: RoleRow[];
  reportingFormats: ReportRow[];
  changeControl: { process: string; baselineChangeThresholdPct: number; approvalChain: string };
  assumptions: string[];
  exclusions: string[];
  approval: { preparedBy: string; preparedRole: string; reviewedBy: string; approvedBy: string; approvalDate: string };
}

function defaultState(): ScheduleState {
  return {
    intro: { objective: "", scope: "" },
    methodology: { approach: "predictivo", tool: FIXED_TOOL, unit: "días hábiles", scheduleLevel: "", scheduleClass: "", levelNotes: "", modelType: "" },
    codification: { rule: "", activityIdPattern: "" },
    calendar: { workDays: ["Lun", "Mar", "Mié", "Jue", "Vie"], hoursPerDay: 8, workingTimes: [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "17:00" }], holidays: [], notes: "" },
    durationEstimating: { method: "", contingencyBasis: "", notes: "" },
    criticalPath: { methodology: "", tool: "", nearCriticalThresholdDays: 0, floatOwnership: "" },
    controlThresholds: defaultThresholds(),
    performanceMeasurement: { method: "", evmRules: "", updateFrequency: "" },
    milestones: [],
    scheduleReserve: { pct: 0, basisText: "", governance: "" },
    roles: [],
    reportingFormats: [],
    changeControl: { process: "", baselineChangeThresholdPct: 0, approvalChain: "" },
    assumptions: [],
    exclusions: [],
    approval: { preparedBy: "", preparedRole: "", reviewedBy: "", approvedBy: "", approvalDate: "" }
  };
}

function sampleState(): ScheduleState {
  return {
    intro: {
      objective: "Establecer la metodología, herramientas, niveles de control y reglas de medición que gobiernan la planificación, desarrollo, ejecución y control del cronograma del Almacén Logístico DISTRIB+ S.A. en Lurín, de modo que el equipo y los interesados compartan un criterio único para programar, actualizar y reportar el avance del proyecto.",
      scope: "Aplica a las cinco fases registradas en la EDT (Dirección de Proyecto, Ingeniería y Diseño, Procura, Construcción, y Pruebas y Puesta en Marcha) y a todos los paquetes de trabajo derivados de ellas, desde la línea base inicial hasta el acta de cierre."
    },
    methodology: {
      approach: "predictivo",
      tool: FIXED_TOOL,
      unit: "días hábiles",
      scheduleLevel: "3",
      scheduleClass: "2",
      levelNotes: "Control a nivel de paquete de trabajo (hojas de la EDT, Nivel 3 de la RP 27R-03/37R-06). Las fases se reportan de forma agregada mediante rollup al Nivel 2. La clasificación como Clase 2 corresponde al grado de definición actual del proyecto (control / línea base para ejecución, definición 30–70%).",
      modelType: "Red de precedencias con lógica CPM y nivelación básica de recursos críticos (cuadrillas y proveedores)."
    },
    codification: {
      rule: "El identificador de cada actividad hereda el código jerárquico de la EDT (p. ej. 4.2 = Cimentaciones, dentro de 4. Construcción). No existe una numeración de actividades independiente.",
      activityIdPattern: "EDT.### — mismo código que expone WBS Builder."
    },
    calendar: {
      workDays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
      hoursPerDay: 9,
      workingTimes: [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "18:00" }],
      holidays: [
        { date: "2026-07-28", name: "Fiestas Patrias" },
        { date: "2026-07-29", name: "Fiestas Patrias" },
        { date: "2026-08-30", name: "Santa Rosa de Lima" }
      ],
      notes: "Calendario 6x1 (lunes a sábado) para el personal de obra en Construcción; Dirección de Proyecto e Ingeniería usan calendario 5x2. Ambos calendarios se modelan en la herramienta de programación."
    },
    durationEstimating: {
      method: "tres_valores",
      contingencyBasis: "Duraciones optimista / probable / pesimista (PERT) para actividades de Ingeniería y Construcción con incertidumbre geotécnica o de suministro; el detalle por actividad se documenta en el Entregable 05 (Gestión de Riesgos).",
      notes: "Las duraciones de paquetes de Procura consideran el lead time contractual del proveedor más 3 días hábiles de margen de recepción."
    },
    criticalPath: {
      methodology: "Método de la Ruta Crítica (CPM) sobre la red de precedencias derivada de la EDT.",
      tool: "Cálculo adelante/atrás automatizado en la herramienta de programación; verificación cruzada con el simulador CPM + Monte Carlo del curso.",
      nearCriticalThresholdDays: 5,
      floatOwnership: "La holgura total pertenece al proyecto (DISTRIB+ S.A.), no a un contratista en particular, salvo que el contrato de un proveedor indique lo contrario."
    },
    controlThresholds: [
      { key: "SV", metric: "SV — Variación de Cronograma", unit: "%", higherIsBetter: true, greenValue: -5, redValue: -10, action: "Analizar ruta crítica y activar acciones correctivas del paquete afectado.", fixed: true },
      { key: "SPI", metric: "SPI — Índice de Desempeño del Cronograma", unit: "", higherIsBetter: true, greenValue: 0.95, redValue: 0.90, action: "Escalar al comité de control; evaluar re-secuenciamiento o recursos adicionales.", fixed: true },
      { key: "HOLGURA", metric: "Consumo de holgura en ruta casi crítica", unit: "%", higherIsBetter: false, greenValue: 40, redValue: 70, action: "Revisar dependencias y considerar fast-tracking o crashing.", fixed: false }
    ],
    performanceMeasurement: {
      method: "hitos_ponderados",
      evmRules: "Regla 0/100 para hitos de control contractual (p. ej. entrega de permisos); regla 50/50 para paquetes de trabajo con duración menor a 10 días; % de avance físico ponderado (curva de horas-hombre / metrado) para paquetes de Construcción mayores a 10 días.",
      updateFrequency: "Corte semanal, todos los viernes a las 17:00 (hora Lima); consolidación quincenal para el Comité de Obra."
    },
    milestones: [
      { name: "Aprobación del Plan de Gestión del Proyecto", date: "2026-07-20", type: "interno", constraint: "FNLT", notes: "Cierra la fase de Dirección de Proyecto (línea base inicial)." },
      { name: "Permisos y licencias municipales aprobados", date: "2026-08-21", type: "regulatorio", constraint: "FNET", notes: "Habilita el inicio de movimiento de tierras." },
      { name: "Fin de Ingeniería y Diseño", date: "2026-08-14", type: "interno", constraint: "FNLT", notes: "" },
      { name: "Fin de Procura (entrega de estructuras metálicas)", date: "2026-08-26", type: "contractual", constraint: "FNLT", notes: "Hito contractual con el Proveedor A." },
      { name: "Fin de cimentaciones", date: "2026-09-04", type: "interno", constraint: "FNLT", notes: "" },
      { name: "Entrega final y acta de cierre", date: "2026-11-06", type: "contractual", constraint: "FNLT", notes: "Fin de Pruebas y Puesta en Marcha; cierre contractual con el cliente." }
    ],
    scheduleReserve: {
      pct: 8,
      basisText: "Estimado preliminar (8% de la duración total) hasta contar con el percentil P80 de la simulación Monte Carlo del módulo de riesgos del curso; el riesgo geotécnico de cimentaciones es el principal consumidor esperado de esta reserva.",
      governance: "Solo el Director de Proyecto puede autorizar el consumo de la reserva de cronograma, y todo consumo se registra en el log de cambios (sección 13)."
    },
    roles: [
      { role: "Patrocinador (Sponsor)", person: "", responsibility: "Aprueba la línea base del cronograma y los cambios que excedan el umbral de rebaselinado.", raci: "A" },
      { role: "Director de Proyecto", person: "", responsibility: "Es responsable integral del cronograma: aprueba actualizaciones, autoriza reserva y escala variaciones fuera de umbral.", raci: "R" },
      { role: "Programador / Controlador de Cronograma", person: "", responsibility: "Mantiene el modelo de programación, calcula la ruta crítica, actualiza avances y emite reportes.", raci: "R" },
      { role: "Responsables de paquete de trabajo", person: "Según Matriz RACI (EDT × OBS)", responsibility: "Reportan avance físico semanal de sus paquetes asignados.", raci: "R" }
    ],
    reportingFormats: [
      { name: "Curva S (PV / EV / AC)", frequency: "Quincenal", audience: "Comité de Obra / Sponsor", tool: "Simulador EVM + CPM del curso" },
      { name: "Diagrama de Gantt actualizado", frequency: "Semanal", audience: "Equipo del proyecto", tool: "Herramienta de programación" },
      { name: "Informe de variaciones (SV, SPI, ruta crítica)", frequency: "Quincenal", audience: "Sponsor / Cliente", tool: "Plantilla de informe de control" }
    ],
    changeControl: {
      process: "Toda solicitud de cambio con impacto en el cronograma se registra en el log de cambios, se evalúa su efecto en la ruta crítica y el CAPEX, y se somete al Comité de Control de Cambios antes de re-baselinar.",
      baselineChangeThresholdPct: 5,
      approvalChain: "Solicitante → Programador (análisis de impacto) → Comité de Control de Cambios → Sponsor (aprobación final si supera el umbral)."
    },
    assumptions: [
      "Los proveedores de estructuras metálicas y materiales confirman sus lead times contractuales sin cambios sustanciales.",
      "El calendario de feriados regionales de Lima aplica sin interrupciones adicionales por huelgas o paros.",
      "La disponibilidad de cuadrillas de Construcción se mantiene según lo planificado en la EDT."
    ],
    exclusions: [
      "No se incluye la programación detallada de actividades de operación posteriores a la entrega (fuera del alcance del proyecto).",
      "No se modelan cronogramas de proyectos paralelos de DISTRIB+ S.A. fuera del almacén de Lurín."
    ],
    approval: {
      preparedBy: "Equipo de Programación",
      preparedRole: "Programador / Controlador de Cronograma",
      reviewedBy: "Director de Proyecto",
      approvedBy: "Gerencia General DISTRIB+ (Sponsor)",
      approvalDate: "2026-07-17"
    }
  };
}

let state: ScheduleState = defaultState();
const DAY_OPTIONS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function deepClone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }
function setStatus(msg: string): void { (document.getElementById("statusLeft") as HTMLElement).textContent = msg; }

// Fusiona datos guardados (posiblemente de una versión anterior con menos campos)
// sobre la plantilla por defecto, para no romper si falta alguna clave nueva.
function mergeWithDefaults(saved: any): ScheduleState {
  const base = defaultState() as any;
  saved = saved || {};
  Object.keys(base).forEach((k) => {
    if (saved[k] == null) return;
    if (Array.isArray(base[k])) { base[k] = Array.isArray(saved[k]) ? saved[k] : base[k]; }
    else if (typeof base[k] === "object") { Object.assign(base[k], saved[k]); }
    else { base[k] = saved[k]; }
  });
  return normalizeState(base as ScheduleState);
}

// Garantiza coherencia con la versión actual del esquema, incluso al importar
// archivos de versiones previas de la herramienta.
function normalizeState(s: ScheduleState): ScheduleState {
  // Herramienta fija.
  s.methodology.tool = FIXED_TOOL;
  // Migración de LOD antiguo (levelOfDetail único) a levelNotes.
  if (s.methodology.levelOfDetail && !s.methodology.levelNotes) s.methodology.levelNotes = s.methodology.levelOfDetail;
  delete s.methodology.levelOfDetail;
  if (s.methodology.scheduleLevel == null) s.methodology.scheduleLevel = "";
  if (s.methodology.scheduleClass == null) s.methodology.scheduleClass = "";
  // Calendario: asegurar workingTimes y recalcular horas/día.
  if (!Array.isArray(s.calendar.workingTimes) || !s.calendar.workingTimes.length) {
    s.calendar.workingTimes = [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "17:00" }];
  }
  // Umbrales: migrar esquema antiguo (green/amber/red texto) a numérico y
  // garantizar la presencia de las filas fijas SV y SPI en la cabecera.
  let arr: Threshold[] = Array.isArray(s.controlThresholds) ? s.controlThresholds : [];
  arr = arr.map((t) => {
    if (t && (t.greenValue != null || t.redValue != null)) return t; // ya es numérico
    return { key: t && t.key, metric: (t && t.metric) || "Métrica", unit: (t && t.unit) || "", higherIsBetter: true, greenValue: 0, redValue: 0, action: (t && t.action) || "", fixed: false };
  });
  (["SV", "SPI"] as const).forEach((key) => {
    const def = defaultThresholds().filter((d) => d.key === key)[0];
    const found = arr.filter((t) => t.key === key)[0];
    if (!found) arr.push(deepClone(def));
    else { found.fixed = true; found.higherIsBetter = true; if (!found.metric) found.metric = def.metric; if (found.unit == null) found.unit = def.unit; }
  });
  // Reordenar: SV, SPI primero (fijos), luego el resto.
  const order: Record<string, number> = { SV: 0, SPI: 1 };
  arr.sort((a, b) => {
    const oa = order[a.key] != null ? order[a.key] : 99, ob = order[b.key] != null ? order[b.key] : 99;
    return oa - ob;
  });
  s.controlThresholds = arr;
  return s;
}

// ---------- MODAL ----------
interface ShowModalOpts { title?: string; message?: string; confirmText?: string; cancelText?: string | null; danger?: boolean; }
function showModal(opts: ShowModalOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modalOverlay") as HTMLElement;
    const confirmBtn = document.getElementById("modalConfirmBtn") as HTMLButtonElement;
    const cancelBtn = document.getElementById("modalCancelBtn") as HTMLButtonElement;
    (document.getElementById("modalTitle") as HTMLElement).textContent = opts.title || "Confirmar";
    (document.getElementById("modalMessage") as HTMLElement).textContent = opts.message || "";
    confirmBtn.textContent = opts.confirmText || "Aceptar";
    confirmBtn.className = "btn" + (opts.danger ? " danger" : " primary");
    cancelBtn.style.display = opts.cancelText === null ? "none" : "";
    cancelBtn.textContent = opts.cancelText || "Cancelar";
    function cleanup(result: boolean) {
      overlay.classList.remove("open");
      confirmBtn.onclick = null; cancelBtn.onclick = null; overlay.onclick = null;
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") cleanup(false); if (e.key === "Enter") cleanup(true); }
    confirmBtn.onclick = () => { cleanup(true); };
    cancelBtn.onclick = () => { cleanup(false); };
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    document.addEventListener("keydown", onKey);
    overlay.classList.add("open");
    confirmBtn.focus();
  });
}
function showConfirm(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Confirmar acción", message, confirmText: "Continuar", cancelText: "Cancelar", danger: false }); }
function showAlert(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Aviso", message, confirmText: "Entendido", cancelText: null, danger: false }); }

// ---------- COMPONENTES: TABLA EDITABLE GENÉRICA ----------
type ColumnType = "text" | "number" | "date" | "select" | "textarea";
interface ColumnSpec { key: string; label: string; type?: ColumnType; width?: string; placeholder?: string; list?: string; options?: { value: string; label: string }[]; }
interface EditableTableOpts<T> { onChange?: () => void; addLabel?: string; emptyRow?: () => T; }

function renderEditableTable<T extends Record<string, any>>(container: HTMLElement, rows: T[], columns: ColumnSpec[], opts?: EditableTableOpts<T>): void {
  opts = opts || {};
  const onChange = opts.onChange || (() => { /* noop */ });
  function emptyRow(): T {
    if (opts!.emptyRow) return opts!.emptyRow!();
    const o: Record<string, unknown> = {}; columns.forEach((c) => { o[c.key] = c.type === "number" ? 0 : ""; }); return o as T;
  }
  function draw(): void {
    let html = '<div class="rt-wrap"><table class="rt-table"><thead><tr>';
    columns.forEach((c) => { html += '<th' + (c.width ? ' style="width:' + c.width + '"' : '') + '>' + esc(c.label) + '</th>'; });
    html += '<th class="rt-del-h"></th></tr></thead><tbody>';
    if (!rows.length) {
      html += '<tr><td colspan="' + (columns.length + 1) + '" style="color:var(--ink-2); font-size:12px; padding:12px 10px;">Sin filas todavía. Usa "' + (opts!.addLabel || "+ Agregar fila") + '".</td></tr>';
    }
    rows.forEach((r, idx) => {
      html += '<tr>';
      columns.forEach((c) => {
        const val = r[c.key] == null ? "" : r[c.key];
        if (c.type === "select") {
          html += '<td><select data-idx="' + idx + '" data-key="' + c.key + '">' + (c.options || []).map((o) =>
            '<option value="' + esc(o.value) + '"' + (o.value === val ? " selected" : "") + '>' + esc(o.label) + '</option>'
          ).join("") + '</select></td>';
        } else if (c.type === "textarea") {
          html += '<td><textarea data-idx="' + idx + '" data-key="' + c.key + '" placeholder="' + esc(c.placeholder || "") + '">' + esc(val) + '</textarea></td>';
        } else {
          html += '<td><input data-idx="' + idx + '" data-key="' + c.key + '" type="' + (c.type || "text") + '" value="' + esc(val) + '" placeholder="' + esc(c.placeholder || "") + '"' + (c.list ? ' list="' + c.list + '"' : '') + '></td>';
        }
      });
      html += '<td class="rt-del"><button class="btn sm danger" data-del="' + idx + '" title="Eliminar fila">🗑</button></td></tr>';
    });
    html += '</tbody></table></div><button class="btn sm add-row-btn" data-add="1">' + esc(opts!.addLabel || "+ Agregar fila") + '</button>';
    container.innerHTML = html;
    container.querySelectorAll("[data-idx]").forEach((el) => {
      el.addEventListener("input", () => {
        const input = el as HTMLInputElement;
        const idx = +input.dataset.idx!, key = input.dataset.key as string;
        (rows[idx] as Record<string, unknown>)[key] = input.type === "number" ? Number(input.value) : input.value;
        onChange();
      });
    });
    container.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => { rows.splice(+(btn as HTMLElement).dataset.del!, 1); draw(); onChange(); });
    });
    const addBtn = container.querySelector("[data-add]");
    if (addBtn) addBtn.addEventListener("click", () => { rows.push(emptyRow()); draw(); onChange(); });
  }
  draw();
}

interface SimpleListOpts { onChange?: () => void; addLabel?: string; placeholder?: string; }
function renderSimpleList(container: HTMLElement, arr: string[], opts?: SimpleListOpts): void {
  opts = opts || {};
  const onChange = opts.onChange || (() => { /* noop */ });
  function draw(): void {
    let html = '<div class="simple-list">';
    if (!arr.length) html += '<div style="color:var(--ink-2); font-size:12px; padding:2px 0 6px;">Sin elementos todavía.</div>';
    arr.forEach((v, idx) => {
      html += '<div class="sl-row"><input data-idx="' + idx + '" type="text" value="' + esc(v) + '" placeholder="' + esc(opts!.placeholder || "") + '"><button class="btn sm danger" data-del="' + idx + '">🗑</button></div>';
    });
    html += '</div><button class="btn sm add-row-btn" data-add="1">' + esc(opts!.addLabel || "+ Agregar") + '</button>';
    container.innerHTML = html;
    container.querySelectorAll("[data-idx]").forEach((el) => {
      el.addEventListener("input", () => { arr[+(el as HTMLInputElement).dataset.idx!] = (el as HTMLInputElement).value; onChange(); });
    });
    container.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => { arr.splice(+(btn as HTMLElement).dataset.del!, 1); draw(); onChange(); });
    });
    (container.querySelector("[data-add]") as HTMLElement).addEventListener("click", () => { arr.push(""); draw(); onChange(); });
  }
  draw();
}

// ---------- BINDING DE CAMPOS ESCALARES ----------
interface FieldSpec { id: string; evt?: string; numeric?: boolean; get: () => string | number; set: (v: any) => void; }
const FIELD_SPECS: FieldSpec[] = [
  { id: "intro-objective", get: () => state.intro.objective, set: (v) => { state.intro.objective = v; } },
  { id: "intro-scope", get: () => state.intro.scope, set: (v) => { state.intro.scope = v; } },

  { id: "m-approach", evt: "change", get: () => state.methodology.approach, set: (v) => { state.methodology.approach = v; } },
  { id: "m-unit", evt: "change", get: () => state.methodology.unit, set: (v) => { state.methodology.unit = v; } },
  { id: "m-model", get: () => state.methodology.modelType, set: (v) => { state.methodology.modelType = v; } },
  { id: "m-schedLevel", evt: "change", get: () => state.methodology.scheduleLevel, set: (v) => { state.methodology.scheduleLevel = v; } },
  { id: "m-schedClass", evt: "change", get: () => state.methodology.scheduleClass, set: (v) => { state.methodology.scheduleClass = v; } },
  { id: "m-levelNotes", get: () => state.methodology.levelNotes, set: (v) => { state.methodology.levelNotes = v; } },

  { id: "c-rule", get: () => state.codification.rule, set: (v) => { state.codification.rule = v; } },
  { id: "c-pattern", get: () => state.codification.activityIdPattern, set: (v) => { state.codification.activityIdPattern = v; } },

  { id: "cal-notes", get: () => state.calendar.notes, set: (v) => { state.calendar.notes = v; } },

  { id: "d-method", evt: "change", get: () => state.durationEstimating.method, set: (v) => { state.durationEstimating.method = v; } },
  { id: "d-contingency", get: () => state.durationEstimating.contingencyBasis, set: (v) => { state.durationEstimating.contingencyBasis = v; } },
  { id: "d-notes", get: () => state.durationEstimating.notes, set: (v) => { state.durationEstimating.notes = v; } },

  { id: "cp-method", get: () => state.criticalPath.methodology, set: (v) => { state.criticalPath.methodology = v; } },
  { id: "cp-tool", get: () => state.criticalPath.tool, set: (v) => { state.criticalPath.tool = v; } },
  { id: "cp-threshold", numeric: true, get: () => state.criticalPath.nearCriticalThresholdDays, set: (v) => { state.criticalPath.nearCriticalThresholdDays = v; } },
  { id: "cp-float", get: () => state.criticalPath.floatOwnership, set: (v) => { state.criticalPath.floatOwnership = v; } },

  { id: "pm-method", evt: "change", get: () => state.performanceMeasurement.method, set: (v) => { state.performanceMeasurement.method = v; } },
  { id: "pm-freq", get: () => state.performanceMeasurement.updateFrequency, set: (v) => { state.performanceMeasurement.updateFrequency = v; } },
  { id: "pm-rules", get: () => state.performanceMeasurement.evmRules, set: (v) => { state.performanceMeasurement.evmRules = v; } },

  { id: "res-pct", numeric: true, get: () => state.scheduleReserve.pct, set: (v) => { state.scheduleReserve.pct = v; } },
  { id: "res-basis", get: () => state.scheduleReserve.basisText, set: (v) => { state.scheduleReserve.basisText = v; } },
  { id: "res-gov", get: () => state.scheduleReserve.governance, set: (v) => { state.scheduleReserve.governance = v; } },

  { id: "cc-process", get: () => state.changeControl.process, set: (v) => { state.changeControl.process = v; } },
  { id: "cc-threshold", numeric: true, get: () => state.changeControl.baselineChangeThresholdPct, set: (v) => { state.changeControl.baselineChangeThresholdPct = v; } },
  { id: "cc-chain", get: () => state.changeControl.approvalChain, set: (v) => { state.changeControl.approvalChain = v; } },

  { id: "ap-preparedBy", get: () => state.approval.preparedBy, set: (v) => { state.approval.preparedBy = v; } },
  { id: "ap-preparedRole", get: () => state.approval.preparedRole, set: (v) => { state.approval.preparedRole = v; } },
  { id: "ap-reviewedBy", get: () => state.approval.reviewedBy, set: (v) => { state.approval.reviewedBy = v; } },
  { id: "ap-approvedBy", get: () => state.approval.approvedBy, set: (v) => { state.approval.approvedBy = v; } },
  { id: "ap-approvalDate", get: () => state.approval.approvalDate, set: (v) => { state.approval.approvalDate = v; } }
];

function wireScalarFields(): void {
  FIELD_SPECS.forEach((f) => {
    const el = document.getElementById(f.id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (!el) return;
    el.addEventListener(f.evt || "input", () => {
      f.set(f.numeric ? Number(el.value) : el.value);
      onDirty();
    });
  });
}
function syncScalarFields(): void {
  FIELD_SPECS.forEach((f) => {
    const el = document.getElementById(f.id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (!el) return;
    const v = f.get(); el.value = v == null ? "" : String(v);
  });
}

// ---------- CHIPS DE CALENDARIO ----------
function renderCalendarChips(): void {
  const box = document.getElementById("cal-days") as HTMLElement;
  box.innerHTML = DAY_OPTIONS.map((d) => {
    const active = state.calendar.workDays.indexOf(d) !== -1;
    return '<span class="chip' + (active ? ' active' : '') + '" data-day="' + d + '">' + d + '</span>';
  }).join("");
  box.querySelectorAll<HTMLElement>("[data-day]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const d = chip.dataset.day as string;
      const i = state.calendar.workDays.indexOf(d);
      if (i === -1) state.calendar.workDays.push(d); else state.calendar.workDays.splice(i, 1);
      renderCalendarChips();
      onDirty();
    });
  });
}

// ---------- TABLAS DINÁMICAS ----------
function renderTables(): void {
  renderEditableTable(document.getElementById("cal-holidays-table") as HTMLElement, state.calendar.holidays,
    [{ key: "date", label: "Fecha", type: "date", width: "140px" }, { key: "name", label: "Motivo", type: "text", placeholder: "Ej. Fiestas Patrias" }],
    { addLabel: "+ Agregar feriado", onChange: onDirty });

  renderEditableTable(document.getElementById("mil-table") as HTMLElement, state.milestones,
    [
      { key: "name", label: "Hito", type: "text", width: "26%" },
      { key: "date", label: "Fecha", type: "date", width: "110px" },
      { key: "type", label: "Tipo", type: "select", width: "120px", options: [
        { value: "interno", label: "Interno" }, { value: "contractual", label: "Contractual" }, { value: "regulatorio", label: "Regulatorio" }
      ] },
      { key: "constraint", label: "Restricción", type: "select", width: "150px", options: [
        { value: "ASAP", label: "ASAP" }, { value: "ALAP", label: "ALAP" },
        { value: "FNET", label: "FNET" }, { value: "FNLT", label: "FNLT" },
        { value: "MSO", label: "MSO" }, { value: "MFO", label: "MFO" }
      ] },
      { key: "notes", label: "Notas", type: "textarea" }
    ], { addLabel: "+ Agregar hito", onChange: onDirty });

  renderEditableTable(document.getElementById("roles-table") as HTMLElement, state.roles,
    [
      { key: "role", label: "Rol", type: "text", width: "22%" },
      { key: "person", label: "Persona", type: "text", width: "18%", list: "gpi-obs-people-sp" },
      { key: "responsibility", label: "Responsabilidad frente al cronograma", type: "textarea" },
      { key: "raci", label: "RACI", type: "select", width: "80px", options: [
        { value: "", label: "—" }, { value: "R", label: "R" }, { value: "A", label: "A" }, { value: "C", label: "C" }, { value: "I", label: "I" }
      ] }
    ], { addLabel: "+ Agregar rol", onChange: onDirty });

  renderEditableTable(document.getElementById("rep-table") as HTMLElement, state.reportingFormats,
    [
      { key: "name", label: "Formato de reporte", type: "text", width: "26%" },
      { key: "frequency", label: "Frecuencia", type: "text", width: "16%" },
      { key: "audience", label: "Audiencia", type: "text", width: "22%" },
      { key: "tool", label: "Herramienta", type: "text" }
    ], { addLabel: "+ Agregar formato", onChange: onDirty });

  renderSimpleList(document.getElementById("assum-list") as HTMLElement, state.assumptions, { addLabel: "+ Agregar supuesto", placeholder: "Ej. Los proveedores confirman sus lead times...", onChange: onDirty });
  renderSimpleList(document.getElementById("excl-list") as HTMLElement, state.exclusions, { addLabel: "+ Agregar exclusión", placeholder: "Ej. No incluye operación posterior a la entrega...", onChange: onDirty });

  renderWorkingTimes();
  renderThresholds();
}

// ---------- HORARIO LABORAL DIARIO (presentación tipo MS Project) ----------
// Convierte "HH:MM" a minutos; devuelve null si es inválido.
function timeToMin(t: string): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const p = t.split(":"), h = +p[0], m = +p[1];
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return h * 60 + m;
}
// Suma las horas de todos los períodos válidos (fin - inicio, ignorando cruces negativos).
function computeDailyHours(): number {
  let total = 0;
  (state.calendar.workingTimes || []).forEach((p) => {
    const a = timeToMin(p.from), b = timeToMin(p.to);
    if (a != null && b != null && b > a) total += (b - a);
  });
  return Math.round((total / 60) * 100) / 100;
}
function renderWorkingTimes(): void {
  const box = document.getElementById("cal-working-times");
  if (!box) return;
  const wt = state.calendar.workingTimes || (state.calendar.workingTimes = []);
  let html = '<div class="th">#</div><div class="th">Desde</div><div class="th"></div><div class="th">Hasta</div><div class="th"></div>';
  if (!wt.length) {
    html += '<div class="tc" style="grid-column:1/-1; color:var(--ink-2); font-size:12px; padding:10px;">Sin períodos laborables. Usa "+ Agregar período" (p. ej. 08:00–12:00 y 13:00–17:00).</div>';
  }
  wt.forEach((p, idx) => {
    html += '<div class="tc"><span class="idx">' + (idx + 1) + '</span></div>'
      + '<div class="tc"><input type="time" data-wt="' + idx + '" data-k="from" value="' + esc(p.from || "") + '"></div>'
      + '<div class="tc"><span class="dash">→</span></div>'
      + '<div class="tc"><input type="time" data-wt="' + idx + '" data-k="to" value="' + esc(p.to || "") + '"></div>'
      + '<div class="tc"><button class="row-del" data-wtdel="' + idx + '" title="Quitar período">✕</button></div>';
  });
  box.innerHTML = html;

  const hours = computeDailyHours();
  state.calendar.hoursPerDay = hours;
  const headEl = document.getElementById("mspTotalHead");
  if (headEl) headEl.textContent = hours + " h/día";
  const hoursEl = document.getElementById("cal-hours") as HTMLInputElement | null;
  if (hoursEl) hoursEl.value = String(hours);

  box.querySelectorAll<HTMLInputElement>("[data-wt]").forEach((el) => {
    el.addEventListener("input", () => {
      (wt[+el.dataset.wt!] as unknown as Record<string, string>)[el.dataset.k as string] = el.value;
      renderWorkingTimes(); // recalcula horas y encabezado
      onDirty();
    });
  });
  box.querySelectorAll<HTMLElement>("[data-wtdel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      wt.splice(+btn.dataset.wtdel!, 1);
      renderWorkingTimes();
      onDirty();
    });
  });
}

// ---------- UMBRALES DE CONTROL (valor numérico + operador fijo fuera del dato) ----------
// Verde y Rojo guardan SOLO el número (greenValue / redValue). El operador se
// deriva de higherIsBetter y se muestra como etiqueta fija, de modo que los
// números son directamente comparables contra los indicadores calculados a
// partir de un cronograma exportado de MS Project (XML).
function bandOps(higherIsBetter: boolean): { green: string; red: string } {
  return higherIsBetter ? { green: "≥", red: "<" } : { green: "<", red: ">" };
}
function amberText(t: Threshold): string {
  const u = t.unit || "";
  if (t.higherIsBetter) return t.redValue + u + " ≤ x < " + t.greenValue + u;
  return t.greenValue + u + " < x ≤ " + t.redValue + u;
}
function renderThresholds(): void {
  const box = document.getElementById("thr-list");
  if (!box) return;
  const arr = state.controlThresholds || (state.controlThresholds = []);
  box.innerHTML = arr.map((t, idx) => {
    const ops = bandOps(t.higherIsBetter);
    const unit = t.unit || "";
    const nameCell = t.fixed
      ? '<span class="thr-name">' + esc(t.metric) + '</span>' + (unit ? '<span class="thr-unit">' + esc(unit) + '</span>' : '') + '<span class="thr-fixed-flag">Fijo</span>'
      : '<input class="band-val" style="max-width:280px" data-thr="' + idx + '" data-k="metric" type="text" value="' + esc(t.metric) + '" placeholder="Nombre de la métrica">'
        + '<input class="band-val" style="max-width:64px" data-thr="' + idx + '" data-k="unit" type="text" value="' + esc(unit) + '" placeholder="Unid." title="Unidad (p. ej. %)">'
        + '<button class="btn sm danger thr-del" data-thrdel="' + idx + '">🗑</button>';
    return '<div class="thr-block' + (t.fixed ? ' fixed' : '') + '">'
      + '<div class="thr-head">' + nameCell + '</div>'
      + '<div class="thr-bands">'
      + '<div class="band green"><div class="band-lbl"><span class="swatch"></span>Verde</div><div class="band-expr"><span class="band-op">' + ops.green + '</span><input class="band-val" data-thr="' + idx + '" data-k="greenValue" type="number" step="any" value="' + esc(t.greenValue) + '"></div></div>'
      + '<div class="band amber"><div class="band-lbl"><span class="swatch"></span>Ámbar (derivado)</div><div class="band-derived" data-amber="' + idx + '">' + esc(amberText(t)) + '</div></div>'
      + '<div class="band red"><div class="band-lbl"><span class="swatch"></span>Rojo</div><div class="band-expr"><span class="band-op">' + ops.red + '</span><input class="band-val" data-thr="' + idx + '" data-k="redValue" type="number" step="any" value="' + esc(t.redValue) + '"></div></div>'
      + '</div>'
      + (t.fixed ? '' : '<div style="margin-top:8px"><label style="display:block; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:var(--ink-2); margin-bottom:5px;">Sentido</label><select class="band-val" style="max-width:220px" data-thr="' + idx + '" data-k="higherIsBetter"><option value="true"' + (t.higherIsBetter ? ' selected' : '') + '>Mayor es mejor (≥ verde)</option><option value="false"' + (!t.higherIsBetter ? ' selected' : '') + '>Menor es mejor (&lt; verde)</option></select></div>')
      + '<div class="thr-action"><label>Acción esperada al superar el umbral</label><textarea data-thr="' + idx + '" data-k="action" placeholder="¿Qué se hace cuando el indicador entra en ámbar o rojo?">' + esc(t.action || "") + '</textarea></div>'
      + '</div>';
  }).join("");

  box.querySelectorAll<HTMLElement>("[data-thr]").forEach((el) => {
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, () => {
      const idx = +(el as HTMLInputElement).dataset.thr!, t = arr[idx], k = (el as HTMLInputElement).dataset.k as string;
      const value = (el as HTMLInputElement).value;
      if (k === "greenValue" || k === "redValue") (t as unknown as Record<string, unknown>)[k] = Number(value);
      else if (k === "higherIsBetter") { t.higherIsBetter = (value === "true"); renderThresholds(); onDirty(); return; }
      else (t as unknown as Record<string, unknown>)[k] = value;
      // Actualiza en sitio el texto ámbar derivado (sin re-render: conserva el foco).
      const amberEl = box.querySelector('[data-amber="' + idx + '"]');
      if (amberEl) amberEl.textContent = amberText(t);
      onDirty();
    });
  });
  box.querySelectorAll<HTMLElement>("[data-thrdel]").forEach((btn) => {
    btn.addEventListener("click", () => { arr.splice(+btn.dataset.thrdel!, 1); renderThresholds(); onDirty(); });
  });
}

// ---------- PANELES INFORMATIVOS (vínculo con otros módulos) ----------
function moneyFmt(v: unknown, cur: string | undefined): string {
  const n = Number(v); if (!isFinite(n)) return "—";
  const sym = ({ USD: "USD $", PEN: "S/", EUR: "€" } as Record<string, string>)[cur || ""] || "$";
  return sym + " " + n.toLocaleString("es-PE");
}
function addDaysIso(iso: string, days: number): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}
function diffDaysIso(a: string, b: string): number {
  if (!a || !b) return 0;
  const da = new Date(a + "T00:00:00"), db = new Date(b + "T00:00:00");
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function updateMetaPanels(): void {
  const hasGpi = typeof window.GPI !== "undefined" && !!window.GPI.available && window.GPI.available();
  const meta = hasGpi ? window.GPI!.meta() : null;
  const wbs: WbsModule | null = hasGpi ? (window.GPI!.getModule("wbs") ?? null) : null;
  const raci: RaciModule | null = hasGpi ? (window.GPI!.getModule("raci") ?? null) : null;

  // 1. Introducción — datos comunes del proyecto
  const introPanel = document.getElementById("introMetaPanel") as HTMLElement;
  if (hasGpi && window.GPI!.active()) {
    introPanel.innerHTML = "<b>Proyecto activo:</b> " + esc(meta?.name || "—") + (meta?.code ? " · " + esc(meta.code) : "")
      + "<br><b>Cliente:</b> " + esc(meta?.client || "—") + " · <b>Ubicación:</b> " + esc(meta?.location || "—")
      + "<br><b>Vigencia:</b> " + esc(meta?.startDate || "—") + " → " + esc(meta?.endDate || "—")
      + " · <b>CAPEX:</b> " + moneyFmt(meta?.capex, meta?.currency);
  } else {
    introPanel.innerHTML = "Sin proyecto activo vinculado. Los datos comunes (cliente, fechas, CAPEX) se completan automáticamente desde el Panel de Control.";
  }

  // 2. Metodología — resumen del nivel/clase declarados (RP 27R-03)
  const lodPanel = document.getElementById("lodInfoPanel");
  if (lodPanel) {
    const LVL: Record<string, string> = { "1": "Nivel 1 · Ejecutivo/Master (hitos)", "2": "Nivel 2 · Gerencial/Resumen (fases)", "3": "Nivel 3 · Publicación/Control (paquetes)", "4": "Nivel 4 · Ejecución/Detallado (actividades)", "5": "Nivel 5 · Trabajo/Detalle fino (tareas)" };
    const CLS: Record<string, string> = { "5": "Clase 5 · Definición 0–2% (screening de concepto)", "4": "Clase 4 · Definición 1–15% (factibilidad)", "3": "Clase 3 · Definición 10–40% (presupuesto/autorización)", "2": "Clase 2 · Definición 30–70% (control / licitación)", "1": "Clase 1 · Definición 70–100% (licitación/oferta)" };
    const lv = state.methodology.scheduleLevel, cl = state.methodology.scheduleClass;
    lodPanel.innerHTML = "<b>Detalle declarado (RP 27R-03):</b>"
      + '<div class="chips">'
      + '<span class="chip-stat">' + esc(lv ? LVL[lv] : "Nivel sin definir") + '</span>'
      + '<span class="chip-stat">' + esc(cl ? CLS[cl] : "Clase sin definir") + '</span>'
      + '</div>';
  }

  // 2. Metodología — estado del WBS vinculado
  const wbsPanel = document.getElementById("wbsStatusPanel") as HTMLElement;
  if (hasGpi && window.GPI!.util && wbs && wbs.nodes) {
    const roll = window.GPI!.util.wbsRollup(wbs);
    const phases = window.GPI!.util.wbsPhases(wbs);
    wbsPanel.innerHTML = "<b>EDT vinculada:</b> " + phases.length + " fase(s), " + roll.leafCount + " paquete(s) de trabajo."
      + '<div class="chips">'
      + '<span class="chip-stat">' + esc(roll.minStart || "—") + " → " + esc(roll.maxEnd || "—") + '</span>'
      + '<span class="chip-stat">' + moneyFmt(roll.cost, meta?.currency) + '</span>'
      + '</div>';
  } else {
    wbsPanel.innerHTML = "Aún no hay una EDT vinculada. Completa WBS Builder para que el nivel de detalle y los hitos puedan referenciar fechas reales.";
  }

  // 10. Reserva — cómputo de días y fecha objetivo
  const resPanel = document.getElementById("reserveComputedPanel") as HTMLElement;
  if (hasGpi && window.GPI!.util && wbs && wbs.nodes) {
    const roll2 = window.GPI!.util.wbsRollup(wbs);
    const span = diffDaysIso(roll2.minStart, roll2.maxEnd);
    const reserveDays = Math.round(span * (Number(state.scheduleReserve.pct) || 0) / 100);
    const target = addDaysIso(roll2.maxEnd, reserveDays);
    resPanel.innerHTML = "<b>Duración base de la EDT:</b> " + span + " días (" + esc(roll2.minStart || "—") + " → " + esc(roll2.maxEnd || "—") + ")"
      + "<br><b>Reserva calculada:</b> +" + reserveDays + " días"
      + "<br><b>Fecha objetivo con reserva:</b> " + esc(target || "—");
  } else {
    resPanel.innerHTML = "Vincula la EDT para calcular automáticamente los días de reserva y la fecha objetivo a partir del % indicado.";
  }

  // 11. Roles — cobertura RACI (no se duplica aquí, solo se referencia)
  const rolesPanel = document.getElementById("rolesRaciInfoPanel") as HTMLElement;
  if (hasGpi && window.GPI!.util && wbs && wbs.nodes) {
    const cov = window.GPI!.util.raciCoverage(raci || ({} as RaciModule), wbs);
    rolesPanel.innerHTML = "<b>Cobertura RACI actual:</b> " + cov.withR + "/" + cov.total + " paquetes de trabajo con Responsable ('R') asignado."
      + (cov.withoutR.length ? " Completa la Matriz RACI para los paquetes restantes antes de cerrar este plan." : " Todos los paquetes tienen Responsable — buena base para medir el desempeño del cronograma.");
  } else {
    rolesPanel.innerHTML = "Vincula la EDT y la Matriz RACI para ver aquí la cobertura de Responsables por paquete de trabajo.";
  }
}

// ---------- COMPLETITUD (GPI.util.schedulePlanAudit) ----------
function currentAudit() {
  if (typeof window.GPI === "undefined" || !window.GPI.util) return null;
  return window.GPI.util.schedulePlanAudit(state as unknown as SchedulePlanModule);
}
const STATE_COLORS: Record<string, string> = { verde: "#00c2a8", ambar: "#ff9f1c", rojo: "#ff5470" };
const STATE_LABELS: Record<string, string> = { verde: "Plan completo", ambar: "En progreso", rojo: "Incompleto" };
function updateSidebar(): void {
  const audit = currentAudit();
  const pctEl = document.getElementById("sbPct") as HTMLElement, fillEl = document.getElementById("sbBarFill") as HTMLElement,
    labelEl = document.getElementById("sbStateLabel") as HTMLElement, boxEl = document.getElementById("sbChecklist") as HTMLElement;
  if (!audit) {
    pctEl.textContent = "—"; pctEl.style.color = "";
    fillEl.style.width = "0%";
    labelEl.textContent = "Requiere gpi-core.js (incluido junto a este archivo).";
    boxEl.innerHTML = "";
    return;
  }
  const color = STATE_COLORS[audit.state] || "var(--ink-2)";
  pctEl.textContent = audit.pct + "%"; pctEl.style.color = color;
  fillEl.style.width = audit.pct + "%"; fillEl.style.background = color;
  labelEl.textContent = (STATE_LABELS[audit.state] || "—") + " · " + audit.okCount + "/" + audit.total + " elementos";

  const order: string[] = []; const byCat: Record<string, typeof audit.items> = {};
  audit.items.forEach((i) => { if (!byCat[i.cat]) { byCat[i.cat] = []; order.push(i.cat); } byCat[i.cat].push(i); });
  boxEl.innerHTML = order.map((cat) => {
    const items = byCat[cat], okN = items.filter((i) => i.ok).length;
    return '<div class="chk-cat"><div class="chk-cat-h">' + esc(cat) + '<span>' + okN + '/' + items.length + '</span></div>'
      + items.map((i) => '<div class="chk-item' + (i.ok ? ' ok' : '') + '"><span class="chk-dot">' + (i.ok ? "✓" : "○") + '</span>' + esc(i.label) + '</div>').join("")
      + '</div>';
  }).join("");
}

function onDirty(): void { updateMetaPanels(); updateSidebar(); }

// ---------- RENDER COMPLETO (tras cargar/importar/vincular) ----------
function fullRender(): void {
  state.methodology.tool = FIXED_TOOL; // la herramienta siempre queda fijada a MS Project
  const toolLabel = document.getElementById("m-tool-label");
  if (toolLabel) toolLabel.textContent = FIXED_TOOL;
  syncScalarFields();
  renderCalendarChips();
  renderTables();
  updateMetaPanels();
  updateSidebar();
}

// ---------- IMPORTAR HITOS DESDE LA EDT ----------
function wireImportMilestones(): void {
  document.getElementById("btnImportMilestones")!.addEventListener("click", async () => {
    if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.util || !window.GPI.active()) {
      await showAlert("Esta acción requiere un proyecto activo con una EDT cargada. Ábrelo desde el Panel de Control y completa WBS Builder primero.");
      return;
    }
    const wbs = window.GPI.getModule("wbs");
    const phases = window.GPI.util.wbsPhases(wbs || ({} as WbsModule));
    if (!phases.length) {
      await showAlert("El proyecto activo aún no tiene fases en la EDT. Complétala primero en WBS Builder.");
      return;
    }
    const ok = await showConfirm("Se agregará un hito de \"fin de fase\" por cada una de las " + phases.length + " fases de la EDT actual (no se eliminan los hitos existentes). ¿Continuar?", "Importar hitos desde la EDT");
    if (!ok) return;
    let added = 0;
    phases.forEach((p) => {
      if (!p.end) return;
      const name = "Fin de " + p.name;
      if (state.milestones.some((m) => m.name === name)) return;
      state.milestones.push({ name, date: p.end, type: "interno", constraint: "FNLT", notes: 'Importado automáticamente desde la fase "' + p.name + '" de la EDT.' });
      added++;
    });
    renderTables(); onDirty();
    setStatus(added ? ("Se importaron " + added + " hito(s) desde la EDT.") : "Los hitos de las fases actuales ya estaban registrados.");
  });
}

// ---------- EXPORT / IMPORT JSON ----------
function exportJson(): void {
  const data = { kind: "gpi.schedulePlan/v1", title: (document.getElementById("projectTitle") as HTMLInputElement).value, course: (document.getElementById("courseTitle") as HTMLInputElement).value, data: state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "plan_gestion_cronograma.json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("Plan exportado como .json.");
}
function importJson(file: File): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    let obj: any;
    try { obj = JSON.parse((e.target as FileReader).result as string); } catch (err) { showAlert("No se pudo leer el archivo. Verifica que sea un JSON válido."); return; }
    const payload = (obj && obj.kind === "gpi.schedulePlan/v1" && obj.data) ? obj.data : (obj && obj.methodology ? obj : null);
    if (!payload) { showAlert("No reconozco el formato de este archivo. Debe ser un .json exportado por esta misma herramienta."); return; }
    state = mergeWithDefaults(payload);
    if (obj.title) (document.getElementById("projectTitle") as HTMLInputElement).value = obj.title;
    if (obj.course) (document.getElementById("courseTitle") as HTMLInputElement).value = obj.course;
    fullRender();
    if (typeof window.GPI !== "undefined" && window.GPI.available() && window.GPI.active()) window.GPI.setModule("schedulePlan", state);
    setStatus("Plan importado correctamente.");
  };
  reader.readAsText(file);
}

// ---------- INIT ----------
function init(): void {
  state = normalizeState(sampleState());
  wireScalarFields();
  wireImportMilestones();
  fullRender();

  document.getElementById("btnAddPeriod")!.addEventListener("click", () => {
    state.calendar.workingTimes.push({ from: "13:00", to: "17:00" });
    renderWorkingTimes(); onDirty();
  });
  document.getElementById("btnAddThreshold")!.addEventListener("click", () => {
    state.controlThresholds.push({ key: "", metric: "", unit: "%", higherIsBetter: true, greenValue: 0, redValue: 0, action: "", fixed: false });
    renderThresholds(); onDirty();
  });

  document.getElementById("btnExportJson")!.addEventListener("click", exportJson);
  document.getElementById("btnImportJson")!.addEventListener("click", () => { (document.getElementById("fileInput") as HTMLInputElement).click(); });
  document.getElementById("fileInput")!.addEventListener("change", (e) => { const files = (e.target as HTMLInputElement).files; if (files && files[0]) importJson(files[0]); (e.target as HTMLInputElement).value = ""; });
  document.getElementById("btnPrint")!.addEventListener("click", () => { window.print(); });
  document.getElementById("btnSample")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto reemplazará el plan actual por el ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo");
    if (ok) { state = normalizeState(sampleState()); fullRender(); setStatus("Ejemplo DISTRIB+ S.A. cargado."); }
  });
  document.getElementById("btnReset")!.addEventListener("click", async () => {
    const ok = await showConfirm("Esto borrará el plan actual y comenzará uno en blanco. ¿Continuar?", "Nuevo plan");
    if (ok) { state = normalizeState(defaultState()); fullRender(); setStatus("Nuevo plan en blanco."); }
  });
}
document.addEventListener("DOMContentLoaded", init);

// ===== Puente con el Panel de Control (GPI) =====
document.addEventListener("DOMContentLoaded", function gpiBridge() {
  const banner = document.getElementById("banner");
  if (typeof window.GPI === "undefined" || !window.GPI.available()) { if (banner) banner.classList.add("show"); return; }
  const titleEl = document.getElementById("projectTitle") as HTMLInputElement;
  const courseEl = document.getElementById("courseTitle") as HTMLInputElement;

  function refreshPeopleList(): void {
    const mod: ObsModule | null = window.GPI!.getModule("obs") ?? null;
    const names = (mod && window.GPI!.util ? window.GPI!.util.obsNodes(mod) : []).map((n) => window.GPI!.util.obsLabel(n)).filter(Boolean);
    let dl = document.getElementById("gpi-obs-people-sp") as HTMLDataListElement | null;
    if (!dl) { dl = document.createElement("datalist"); dl.id = "gpi-obs-people-sp"; document.body.appendChild(dl); }
    dl.innerHTML = names.map((n) => '<option value="' + String(n).replace(/"/g, "&quot;") + '">').join("");
  }
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    if (p.meta) { if (p.meta.name) titleEl.value = p.meta.name; if (p.meta.course) courseEl.value = p.meta.course; }
    const mod = p.modules && p.modules.schedulePlan;
    // Sin plan aún: arranca EN BLANCO (defaultState), no con el ejemplo,
    // para que el guardado automático al salir no escriba el plan DISTRIB+
    // en un proyecto nuevo. El ejemplo queda en el botón "Cargar ejemplo".
    state = mod ? mergeWithDefaults(mod) : normalizeState(defaultState());
    fullRender();
    refreshPeopleList();
    setStatus(mod ? "Proyecto cargado desde el Panel de Control."
      : "Proyecto sin plan de cronograma todavía. Completa las secciones, o usa ⌘ Cargar ejemplo para explorar el caso DISTRIB+.");
  }
  function push(): void {
    if (!window.GPI!.active()) return;
    window.GPI!.setModule("schedulePlan", state);
    window.GPI!.patchMeta({ name: titleEl.value, course: courseEl.value });
  }
  const proj = window.GPI!.active();
  if (proj) pull(); else refreshPeopleList();
  window.addEventListener("beforeunload", push);
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); });
  window.GPI!.onChange(() => { if (!document.hidden) { refreshPeopleList(); updateMetaPanels(); updateSidebar(); } });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
});

function gpiBadge(name: string | undefined, pushFn: () => void): void {
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div");
  bar.className = "gpi-badge";
  bar.innerHTML = '<span class="gpi-dot"></span><span>Panel: <b>' + String(name || "—").replace(/</g, "&lt;") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  (bar.querySelector("#gpiSyncBtn") as HTMLElement).addEventListener("click", () => {
    pushFn(); const b = bar.querySelector("#gpiSyncBtn") as HTMLElement, t = b.textContent; b.textContent = "✓ Sincronizado";
    setTimeout(() => { b.textContent = t; }, 1400);
  });
}

// ===== REPORTE IMPRIMIBLE (📄) =====
// Genera un documento formal dentro de #gpiReport y lo imprime en solitario:
// en @media print, body.report-mode oculta la aplicación y muestra solo el reporte.
function reportShell(docTitle: string, moduleName: string, bodyHtml: string): void {
  let el = document.getElementById("gpiReport");
  if (!el) { el = document.createElement("div"); el.id = "gpiReport"; document.body.appendChild(el); }
  let meta: Partial<ProjectMeta> = {};
  try { const m = window.GPI && window.GPI.available() ? window.GPI.meta() : null; if (m) meta = m; } catch (_) { /* noop */ }
  const tEl = document.getElementById("projectTitle") as HTMLInputElement | null, cEl = document.getElementById("courseTitle") as HTMLInputElement | null;
  const pName = (tEl && tEl.value) || meta.name || "Proyecto";
  const course = (cEl && cEl.value) || meta.course || "Gestión de Proyectos de Ingeniería";
  const today = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  el.innerHTML =
    '<div class="rep-head"><div><h1>' + esc(docTitle) + '</h1>'
    + '<div class="sub">' + esc(pName) + (meta.code ? ' · ' + esc(meta.code) : '') + '</div>'
    + '<div class="sub" style="font-weight:500">' + esc(course) + '</div></div>'
    + '<div class="rep-meta">' + esc(moduleName) + '<br>Emitido: ' + esc(today)
    + (meta.client ? '<br>Cliente: ' + esc(meta.client) : '')
    + (meta.location ? '<br>' + esc(meta.location) : '') + '</div></div>'
    + bodyHtml;
  document.body.classList.add("report-mode");
  function repDone() { document.body.classList.remove("report-mode"); window.removeEventListener("afterprint", repDone); }
  window.addEventListener("afterprint", repDone);
  // window.print() es bloqueante en la mayoría de navegadores; el timeout
  // posterior actúa de respaldo donde afterprint no dispara.
  setTimeout(() => { window.print(); setTimeout(repDone, 500); }, 60);
}
function repDate(s: string): string { if (!s) return "—"; const p = String(s).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s; }

function buildReport(): void {
  function kv(label: string, val: unknown): string { return '<tr><td>' + esc(label) + '</td><td>' + ((val || val === 0) && String(val).trim() ? esc(String(val)) : '<span class="rep-note">—</span>') + '</td></tr>'; }
  function list(arr: string[] | undefined): string {
    const a = (arr || []).filter((t) => t && String(t).trim());
    return a.length ? '<ul>' + a.map((t) => '<li>' + esc(t) + '</li>').join("") + '</ul>' : '<p class="rep-note">— No registrado —</p>';
  }
  const APPROACH_M: Record<string, string> = { predictivo: "Predictivo (planificación en cascada)", hibrido: "Híbrido", agil: "Ágil / iterativo" };
  const DUR_M: Record<string, string> = { juicio_expertos: "Juicio de expertos", analoga: "Estimación análoga", parametrica: "Estimación paramétrica", tres_valores: "Tres valores (PERT: optimista / probable / pesimista)" };
  const PM_M: Record<string, string> = { "0_100": "Regla 0/100 (hitos de control)", "50_50": "Regla 50/50", fisico_ponderado: "% de avance físico ponderado", hitos_ponderados: "Hitos ponderados (curva de avance)" };
  const TYPE_M: Record<string, string> = { interno: "Interno", contractual: "Contractual", regulatorio: "Regulatorio" };
  const s = state; let body = "";

  body += '<h2>1. Objetivo y alcance del plan</h2><table class="rep-kv">'
    + kv("Objetivo", s.intro.objective) + kv("Alcance de aplicación", s.intro.scope) + '</table>';

  body += '<h2>2. Metodología, herramienta y nivel del cronograma</h2><table class="rep-kv">'
    + kv("Enfoque de desarrollo", APPROACH_M[s.methodology.approach] || s.methodology.approach)
    + kv("Herramienta de programación", s.methodology.tool)
    + kv("Unidad de duración", s.methodology.unit)
    + kv("Nivel del cronograma (AACE RP 37R-06)", s.methodology.scheduleLevel ? "Nivel " + s.methodology.scheduleLevel : "")
    + kv("Clase del cronograma (AACE RP 27R-03)", s.methodology.scheduleClass ? "Clase " + s.methodology.scheduleClass : "")
    + kv("Justificación de nivel y clase", s.methodology.levelNotes)
    + kv("Tipo de modelo de programación", s.methodology.modelType) + '</table>';

  body += '<h2>3. Codificación de actividades</h2><table class="rep-kv">'
    + kv("Regla de codificación", s.codification.rule)
    + kv("Patrón de identificador", s.codification.activityIdPattern) + '</table>';

  const wt = (s.calendar.workingTimes || []).map((w) => w.from + "–" + w.to).join(", ");
  const hol = (s.calendar.holidays || []).map((h) => repDate(h.date) + (h.name ? " (" + h.name + ")" : "")).join("; ");
  body += '<h2>4. Calendario del proyecto</h2><table class="rep-kv">'
    + kv("Días laborables", (s.calendar.workDays || []).join(", "))
    + kv("Horas por día", s.calendar.hoursPerDay)
    + kv("Horarios de trabajo", wt)
    + kv("Feriados / días no laborables", hol)
    + kv("Notas del calendario", s.calendar.notes) + '</table>';

  body += '<h2>5. Estimación de duraciones</h2><table class="rep-kv">'
    + kv("Método principal", DUR_M[s.durationEstimating.method] || s.durationEstimating.method)
    + kv("Base de contingencia", s.durationEstimating.contingencyBasis)
    + kv("Notas", s.durationEstimating.notes) + '</table>';

  body += '<h2>6. Ruta crítica</h2><table class="rep-kv">'
    + kv("Metodología", s.criticalPath.methodology)
    + kv("Herramienta / verificación", s.criticalPath.tool)
    + kv("Umbral de ruta casi crítica", s.criticalPath.nearCriticalThresholdDays ? s.criticalPath.nearCriticalThresholdDays + " días de holgura total" : "")
    + kv("Propiedad de la holgura", s.criticalPath.floatOwnership) + '</table>';

  const th = (s.controlThresholds || []);
  body += '<h2>7. Umbrales de control</h2>';
  body += th.length
    ? '<table><tr><th>Métrica</th><th style="width:11%">Verde hasta</th><th style="width:11%">Rojo desde</th><th>Acción al exceder el umbral</th></tr>'
      + th.map((t) => {
        const u = t.unit ? " " + esc(t.unit) : "";
        return '<tr><td>' + esc(t.metric) + '</td><td class="num">' + esc(String(t.greenValue)) + u + '</td><td class="num">' + esc(String(t.redValue)) + u + '</td><td>' + esc(t.action) + '</td></tr>';
      }).join("") + '</table>'
    : '<p class="rep-note">— No registrado —</p>';

  body += '<h2>8. Medición del desempeño (valor ganado)</h2><table class="rep-kv">'
    + kv("Método de medición", PM_M[s.performanceMeasurement.method] || s.performanceMeasurement.method)
    + kv("Reglas de valor ganado", s.performanceMeasurement.evmRules)
    + kv("Frecuencia de actualización", s.performanceMeasurement.updateFrequency) + '</table>';

  const mil = (s.milestones || []).filter((m) => (m.name || "").trim());
  body += '<h2>9. Hitos del cronograma</h2>';
  body += mil.length
    ? '<table><tr><th>Hito</th><th style="width:11%">Fecha</th><th style="width:12%">Tipo</th><th style="width:11%">Restricción</th><th>Notas</th></tr>'
      + mil.map((m) => '<tr><td>' + esc(m.name) + '</td><td class="num">' + repDate(m.date) + '</td><td>' + esc(TYPE_M[m.type] || m.type || "—") + '</td><td class="num">' + esc(m.constraint || "—") + '</td><td>' + esc(m.notes || "") + '</td></tr>').join("")
      + '</table>'
    : '<p class="rep-note">— No registrado —</p>';

  body += '<h2>10. Reserva de cronograma</h2><table class="rep-kv">'
    + kv("Reserva", s.scheduleReserve.pct ? s.scheduleReserve.pct + "% de la duración total" : "")
    + kv("Base de estimación", s.scheduleReserve.basisText)
    + kv("Gobernanza de consumo", s.scheduleReserve.governance) + '</table>';

  const roles = (s.roles || []).filter((r) => (r.role || "").trim());
  body += '<h2>11. Roles y responsabilidades sobre el cronograma</h2>';
  body += roles.length
    ? '<table><tr><th style="width:22%">Rol</th><th style="width:17%">Persona / referencia</th><th>Responsabilidad</th><th style="width:7%">RACI</th></tr>'
      + roles.map((r) => '<tr><td>' + esc(r.role) + '</td><td>' + esc(r.person || "—") + '</td><td>' + esc(r.responsibility) + '</td><td class="num" style="text-align:center">' + esc(r.raci || "—") + '</td></tr>').join("")
      + '</table>'
    : '<p class="rep-note">— No registrado —</p>';

  const reps = (s.reportingFormats || []).filter((r) => (r.name || "").trim());
  body += '<h2>12. Reportes y formatos de seguimiento</h2>';
  body += reps.length
    ? '<table><tr><th>Reporte</th><th style="width:13%">Frecuencia</th><th style="width:24%">Audiencia</th><th style="width:24%">Herramienta</th></tr>'
      + reps.map((r) => '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.frequency || "—") + '</td><td>' + esc(r.audience || "—") + '</td><td>' + esc(r.tool || "—") + '</td></tr>').join("")
      + '</table>'
    : '<p class="rep-note">— No registrado —</p>';

  body += '<h2>13. Control de cambios del cronograma</h2><table class="rep-kv">'
    + kv("Proceso", s.changeControl.process)
    + kv("Umbral de re-baselinado", s.changeControl.baselineChangeThresholdPct ? s.changeControl.baselineChangeThresholdPct + "% de variación sobre la línea base" : "")
    + kv("Cadena de aprobación", s.changeControl.approvalChain) + '</table>';

  body += '<h2>14. Supuestos del plan</h2>' + list(s.assumptions);
  body += '<h2>15. Exclusiones del plan</h2>' + list(s.exclusions);

  const a = currentAudit();
  if (a) body += '<p class="rep-note" style="margin-top:12px">Índice de completitud del plan al momento de emisión: <b>' + a.pct + '%</b> (' + a.okCount + '/' + a.total + ' elementos del checklist basado en AACE RP 38R-06).</p>';

  body += '<div class="rep-sign">'
    + '<div class="box"><b>' + esc(s.approval.approvedBy || "Aprobado por") + '</b><div class="r">Aprobación — Fecha: ' + repDate(s.approval.approvalDate) + '</div></div>'
    + '<div class="box"><b>' + esc(s.approval.reviewedBy || "Revisado por") + '</b><div class="r">Revisión · Preparó: ' + esc(s.approval.preparedBy || "—") + (s.approval.preparedRole ? " (" + esc(s.approval.preparedRole) + ")" : "") + '</div></div>'
    + '</div>';

  reportShell("Plan de Gestión del Cronograma", "Schedule Plan · AACE RP 38R-06", body);
}

(function () {
  const b = document.getElementById("btnReport");
  if (b) b.addEventListener("click", buildReport);
})();
