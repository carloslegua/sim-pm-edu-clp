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

export interface ActivitiesModule {
  byLeaf: Record<string, ActivityItem[]>;
  idCounter: number;
}

export interface CostEstimateItem {
  unit?: string;
  qty?: string | number;
  unitPrice?: string | number;
  [key: string]: unknown;
}

export interface CostEstimateModule {
  byLeaf: Record<string, CostEstimateItem>;
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
  source?: "paste" | "manual";
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
  changeOrders: Array<{ status?: string; fund?: string; cost?: number; [key: string]: unknown }>;
  changeTotals?: Record<string, unknown>;
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

export interface ProjectModules {
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
  scopeStatement?: ScopeStatementModule | null;
  schedule?: ScheduleModule | null;
  [key: string]: unknown;
}

export interface GpiProject {
  schema: string;
  meta: ProjectMeta;
  modules: ProjectModules;
}

export interface GpiDb {
  version: number;
  activeId: string | null;
  projects: Record<string, GpiProject>;
}
