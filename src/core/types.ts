// Tipos del "ESQUEMA DEL PROYECTO" documentado en el comentario de cabecera
// de la versión JS original de gpi-core.js. Reflejan la tolerancia real del
// runtime (casi todo opcional / puede venir undefined) porque el propio
// código usa "|| {}" y comprobaciones defensivas en cada acceso: tipar como
// obligatorio algo que el runtime nunca garantiza generaría falsos errores.

export interface ProjectMeta {
  id: string | null;
  name: string;
  code: string;
  client: string;
  location: string;
  sponsor: string;
  manager: string;
  startDate: string;
  endDate: string;
  currency: string;
  capex: string | number;
  description: string;
  course: string;
  createdAt: number;
  updatedAt: number;
}

export interface WbsNode {
  id?: string;
  name?: string;
  children?: string[];
  cost?: number | string;
  start?: string;
  end?: string;
  resource?: string;
  notes?: string;
  delId?: string;
  [key: string]: unknown;
}

export interface WbsModule {
  rootId: string;
  idCounter: number;
  nodes: Record<string, WbsNode>;
}

export interface ObsNode {
  id?: string;
  parentId?: string | null;
  role?: string;
  person?: string;
  type?: string;
  email?: string;
  notes?: string;
  children?: string[];
  [key: string]: unknown;
}

export interface ObsModule {
  rootId: string;
  idCounter: number;
  nodes: Record<string, ObsNode>;
}

export interface RaciModule {
  assignments: Record<string, Record<string, string>>;
}

export interface StakeholderCriteria {
  [key: string]: number | undefined;
}

export interface Stakeholder {
  id: string;
  name?: string;
  org?: string;
  role?: string;
  category?: string;
  power?: number;
  interest?: number;
  powerCriteria?: StakeholderCriteria;
  interestCriteria?: StakeholderCriteria;
  legitimacy?: number;
  urgency?: number;
  notes?: string;
  // Evaluación del compromiso (PMI), opcional: los proyectos guardados antes de la vista
  // «Compromiso» no la traen y se leen como "sin evaluar" (ver shared/stakeholder-engagement.ts).
  engCurrent?: number | null;
  engDesired?: number | null;
  engStrategy?: string;
  engOwner?: string;
  engAssessedOn?: string;
  [key: string]: unknown;
}

export interface StakeholdersModule {
  stakeholders: Stakeholder[];
  powerWeights?: Record<string, number> | null;
  interestWeights?: Record<string, number> | null;
  idCounter: number;
}

export interface ActivityItem {
  id: string;
  name?: string;
  unit?: string;
  qty?: string | number;
  perf?: string | number;
  teams?: string | number;
  [key: string]: unknown;
}

// Hito: actividad especial de duración cero, con codificación propia (no la
// numeración automática del paquete) -- puede colgar de un paquete de
// trabajo (leafId) o ir suelto, sin pertenecer a ninguno (hito de proyecto).
// Un hito suelto NUNCA se agrupa en un capítulo aparte: se posiciona en
// CUALQUIER lugar del listado mediante afterLeafId (el paquete de trabajo
// después del cual se muestra) -- null/vacío = al principio de todo (p. ej.
// un hito de inicio de proyecto); el id de un paquete existente = justo
// después de ese paquete (p. ej. el id del último paquete = un hito de fin
// de proyecto). afterLeafId nunca cuenta para la numeración EDT.
export interface MilestoneItem {
  id: string;
  code: string;
  name: string;
  leafId?: string | null;
  afterLeafId?: string | null;
}

export interface ActivitiesModule {
  byLeaf: Record<string, ActivityItem[]>;
  idCounter: number;
  milestones?: MilestoneItem[];
}

// Precio unitario por ACTIVIDAD (el id es el mismo que usa ActivitiesModule
// en "Definir las Actividades" -- Estimar los Costos no vuelve a pedir
// Unidad/Cantidad, las toma de ahí; solo agrega el precio).
export interface CostEstimateModule {
  byActivity: Record<string, string | number>;
}

export interface PertEntry {
  o?: string | number;
  m?: string | number;
  mAuto?: boolean;
  p?: string | number;
}

export interface PertModule {
  byActivity: Record<string, PertEntry>;
  inputMode: "dias" | "pct";
}

export type ScheduleLinkType = "FS" | "SS" | "FF" | "SF";
export type ScheduleLagUnit = "d" | "ed" | "h" | "w";

export interface ScheduleLink {
  id?: string;
  from: string;
  to: string;
  type: ScheduleLinkType;
  lag?: number;
  lagUnit?: ScheduleLagUnit;
  source?: "paste" | "manual" | "import"; // "paste" queda solo por compatibilidad con .json ya exportados -- Cronograma/CPM ahora escribe "import" (reemplazó el pegado por .xlsx, igual que el resto de la suite)
}

export interface ScheduleImportInfo {
  at?: string;
  tool?: string;
  rowMap?: Record<string, string>;
  dates?: Record<string, { start?: string; finish?: string }>;
}

export interface ScheduleBaseline {
  frozen?: boolean;
  version?: string;
  date?: string;
  snapshot?: unknown;
  log?: unknown[];       // versiones LB-n con motivo y aprobador (ver shared/schedule-control.ts); opcional: lo guardado antes no lo trae
}

export interface ScheduleModule {
  links: ScheduleLink[];
  linkCounter: number;
  import: ScheduleImportInfo | null;
  baseline: ScheduleBaseline | null;
}

export interface RequirementItem {
  id: string;
  code?: string;
  text?: string;
  type?: string;
  priority?: string;
  sourceRanIds?: string[];
  stakeholderId?: string;
  wbsNodeIds?: string[];
  acceptanceCriteria?: string;
  verificationMethod?: string;
  verificationStatus?: string;
  status?: string;
  normativeBasis?: string;
  origin?: "baseline" | "change" | string;
  changeId?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface RequirementsBaseline {
  frozen?: boolean;
  version?: string;
  date?: string;
  approver?: string;
  snapshot?: unknown[];
}

export interface RequirementsModule {
  baseline?: RequirementsBaseline;
  items: RequirementItem[];
  changes: Array<Record<string, unknown>>;
  idCounter: number;
  changeCounter: number;
}

export interface ScopeDeliverable {
  id: string;
  code?: string;
  name?: string;
  description?: string;
  acceptanceCriteria?: string;
  ranIds?: string[];
  reqIds?: string[];
}

export interface ScopeStatementModule {
  productScope?: string;
  projectScope?: string;
  deliverables: ScopeDeliverable[];
  assumptions?: Array<{ id: string; text: string }>;
  constraints?: Array<{ id: string; text: string }>;
  exclusions?: Array<{ id: string; text: string }>;
  baseline?: { frozen?: boolean; version?: string; date?: string; approver?: string; snapshot?: unknown };
  idCounter: number;
  delCounter: number;
}

export interface CharterRequirement {
  id?: string;
  code?: string;
  text: string;
}

export interface CharterObjective {
  dim?: string;
  objective?: string;
  criteria?: string;
}

export interface CharterModule {
  identification?: Record<string, unknown>;
  purpose?: string;
  businessCase?: Record<string, unknown>;
  description?: string;
  boundaries?: string;
  objectives?: CharterObjective[];
  requirements?: Array<CharterRequirement | string>;
  deliverables?: unknown[];
  milestones?: Array<{ name?: string; date?: string }>;
  budget?: Record<string, unknown>;
  preAssignedResources?: unknown[];
  risks?: unknown[];
  assumptions?: unknown[];
  constraints?: unknown[];
  exclusions?: unknown[];
  stakeholders?: unknown[];
  approvalRequirements?: Array<{ item?: string; approver?: string; criteria?: string }>;
  exitCriteria?: unknown[];
  sponsors?: Array<{ name?: string; role?: string }>;
  approval?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CostModule {
  plan?: Record<string, unknown>;
  estimate?: { class?: string | number; [key: string]: unknown };
  budget?: {
    baseCost?: number;
    computed?: { base?: number; cont?: number; bac?: number; total?: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  // Orden de cambio: además de estado/fondeo/costo lleva, de forma OPCIONAL (los .json
  // antiguos no la traen), su naturaleza (kind: riesgo | imprevisto | alcance), la
  // aprobación (approver, sponsorAuth, approvedOn) y la versión de línea base a la que se
  // incorporó (baselined) -- ver shared/change-orders.ts.
  changeOrders: Array<{ status?: string; fund?: string; cost?: number; kind?: string; approver?: string; sponsorAuth?: boolean; approvedOn?: string; baselined?: string | null; [key: string]: unknown }>;
  changeTotals?: Record<string, unknown>;
  // Versiones de línea base creadas al incorporar órdenes (LB-1, LB-2…), con BAC anterior y nuevo.
  baselineLog?: Array<{ version: string; date: string; orderIds: string[]; bacBefore: number; bacAfter: number; approver: string }>;
}

export interface SchedulePlanCalendar {
  workDays?: string[];
  hoursPerDay?: number;
  holidays?: string[];
}

export interface SchedulePlanModule {
  methodology?: Record<string, unknown>;
  codification?: Record<string, unknown>;
  calendar?: SchedulePlanCalendar;
  durationEstimating?: Record<string, unknown>;
  criticalPath?: Record<string, unknown>;
  performanceMeasurement?: Record<string, unknown>;
  scheduleReserve?: Record<string, unknown>;
  changeControl?: Record<string, unknown>;
  approval?: Record<string, unknown>;
  controlThresholds?: unknown[];
  milestones?: unknown[];
  roles?: unknown[];
  reportingFormats?: unknown[];
  assumptions?: unknown[];
  exclusions?: unknown[];
  [key: string]: unknown;
}

// Registro de riesgos (Risk_Register.html). El esquema completo y su normalización viven en
// shared/risk-analysis.ts: aquí solo lo necesario para leerlo desde el núcleo. `risks` son objetos
// crudos (los .json antiguos o manipulados pueden traer cualquier cosa): se normalizan al leer.
export interface RisksModule {
  plan?: Record<string, unknown> | null;
  risks?: unknown[];
  idCounter?: number;
}

// Seguimiento de Valor Ganado (Valor_Ganado.html): lo que el equipo REPORTA en cada corte (avance físico y costo real por
// paquete de trabajo, técnica de medición y fecha de corte) y el historial de cortes. El PV sale de la línea base del
// cronograma y el BAC del costo del trabajo: no se guardan aquí. Esquema y normalización en shared/evm.ts.
export interface EvmModule {
  statusDate?: string;
  percent?: Record<string, number | null>;
  ac?: Record<string, number | null>;
  techniques?: Record<string, string>;
  reports?: unknown[];
}

// Control integrado de cambios (Control_Cambios.html): las solicitudes de cambio (SC). Esquema y normalización en
// shared/change-control.ts; enlazan (no duplican) las OC de Costos, las MOD de Requisitos y la línea base del cronograma.
export interface ChangesModule {
  requests?: unknown[];
  idCounter?: number;
}

// Plan para la Dirección (Plan_Direccion.html): solo el registro de aprobación del plan (versión, quién y cuándo) y la instantánea de las
// líneas base al aprobarlo; el resto del plan lo derivan de las demás herramientas. Esquema y normalización en shared/pm-plan.ts.
export interface PmPlanModule {
  version?: string; status?: string; preparedBy?: string; approvedBy?: string; approvedOn?: string; notes?: string;
  snapshot?: Record<string, unknown> | null; history?: unknown[];
}

// Plan de Comunicaciones (Plan_Comunicaciones.html): la matriz de comunicaciones y las reglas del plan. Esquema y normalización en shared/comms-plan.ts;
// los destinatarios se enlazan por id con los interesados (no se duplican).
export interface CommsModule {
  items?: unknown[]; plan?: Record<string, unknown> | null; idCounter?: number;
}

// Plan de Calidad (Plan_Calidad.html): política y normas, métricas, actividades de aseguramiento y control por paquete de la EDT y costo de la
// calidad. Esquema y normalización en shared/quality-plan.ts; el criterio de aceptación se lee del Diccionario de la EDT (no se duplica).
export interface QualityModule {
  policy?: string; standards?: string; metrics?: unknown[]; checks?: unknown[]; coq?: unknown[]; idCounter?: number;
}

// Plan de Adquisiciones (Plan_Adquisiciones.html): estrategia y una fila por paquete de adquisición (hacer/comprar, contrato, selección, fechas, proveedor,
// estado). Esquema y normalización en shared/procurement-plan.ts; los paquetes, el costo, los riesgos y los responsables se enlazan por id (no se duplican).
export interface ProcurementModule {
  strategy?: string; performance?: string; approvals?: string; asOf?: string; items?: unknown[]; idCounter?: number;
}

export interface ProjectModules {
  procurement?: ProcurementModule | null;
  quality?: QualityModule | null;
  comms?: CommsModule | null;
  pmplan?: PmPlanModule | null;
  changes?: ChangesModule | null;
  evm?: EvmModule | null;
  charter?: CharterModule | null;
  stakeholders?: StakeholdersModule | null;
  wbs?: WbsModule | null;
  activities?: ActivitiesModule | null;
  costEstimate?: CostEstimateModule | null;
  pert?: PertModule | null;
  obs?: ObsModule | null;
  raci?: RaciModule | null;
  schedulePlan?: SchedulePlanModule | null;
  cost?: CostModule | null;
  requirements?: RequirementsModule | null;
  risks?: RisksModule | null;
  scopeStatement?: ScopeStatementModule | null;
  schedule?: ScheduleModule | null;
  [key: string]: unknown;
}

export interface GpiProject {
  schema: string;
  meta: ProjectMeta;
  modules: ProjectModules;
  // Revisión por módulo: sube en 1 con cada escritura de ese módulo (salvo
  // las "derivadas", ver writeModule). Opcional a propósito -- los .json
  // históricos no la traen y se leen como 0 (regla #3 de CLAUDE.md).
  revs?: Record<string, number>;
}

// Resultado común de cualquier escritura del núcleo (ver saveModule/
// saveMeta/writeModule en gpi-core.ts). "saved": llegó a disco.
// "unchanged": nada que guardar (esta pestaña no modificó lo que cargó, o ya
// es idéntico a lo guardado). "pending": el dato quedó aplicado SOLO en
// memoria (cuota agotada) -- hay que exportar. "conflict": otra pestaña
// cambió lo mismo después de que esta lo cargó; NO se sobrescribió.
// "rejected": no se escribió (proyecto activo distinto, o ninguno).
export type WriteStatus = "saved" | "unchanged" | "pending" | "conflict" | "rejected";
export interface WriteResult {
  status: WriteStatus;
  rev: number | null;
  conflicts?: string[];
  reason?: "no-active" | "project-changed";
}

// Sesión de edición: qué proyecto y qué versión cargó una pestaña. La crea
// GPI.openSession(módulo) en el mismo instante en que el módulo lee sus
// datos, y la actualiza el propio núcleo tras cada guardado.
export interface EditSession {
  projectId: string;
  module: string;
  // Lo CONFIRMADO en disco (cargado o guardado con éxito): revisión, foto del
  // módulo y metadatos. Lo que se aplicó pero solo quedó en memoria (cuota
  // agotada) vive aparte, en "pending", hasta que se persista de verdad --
  // así un reintento con los mismos datos intenta guardar en vez de
  // tomarlos por "sin cambios".
  rev: number;
  snapshot: string;
  meta: Partial<ProjectMeta>;
  pending?: { module?: { json: string; rev: number }; meta?: Record<string, unknown> };
}

export interface GpiDb {
  version: number;
  activeId: string | null;
  projects: Record<string, GpiProject>;
}
