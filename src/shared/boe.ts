// Basis of Estimate (BOE) — AACE International RP 34R-05 — lógica PURA (sin DOM ni `localStorage`), inlineada en cost.js.
//
// Auditoría metodológica: la BOE de Costos tenía cinco campos (fecha, fuente, supuestos, exclusiones y productividad) frente a las ~22
// secciones que define la práctica. 34R-05 (rev. 5-oct-2021) la caracteriza como el ENTREGABLE que define el alcance del proyecto y
// se convierte en la base del control de cambios; debe permitir que cualquier persona con experiencia entienda y evalúe el estimado sin
// otros documentos, comunicar su incertidumbre y alertar de riesgos y oportunidades, registrar los documentos usados, identificar al
// equipo estimador y sus roles, y prepararse EN PARALELO con el estimado (proceso: borrador → revisión → aprobación → cambios y
// actualizaciones). Esta estructura sigue el ÍNDICE PÚBLICO de la práctica (páginas de muestra de AACE; el texto completo es de pago):
//   3.1 Generalidades (propósito, objetivos, alcance, plan de ejecución, parámetros, clasificación) · 3.2 Metodología (herramientas, codificación) ·
//   3.3 Base de diseño (unidades, moneda y tipo de cambio, redondeo) · 3.4 Cantidades · 3.5 Costos · 3.6 Planificación · 3.7 Materiales a granel ·
//   3.8 Mano de obra · 3.9 Demolición · 3.10 Asignaciones (allowances) · 3.11 Supuestos · 3.12 Exclusiones · 3.13 Excepciones ·
//   3.14 Riesgos y oportunidades · 3.16 Contingencias · 3.17 Reserva de gestión · 3.18 Conciliación · 3.19 Benchmarking · 3.20 Aseguramiento de
//   la calidad · 3.21 Equipo estimador · 3.22 Anexos (A: lista de entregables del estimado, B: documentos de referencia).
// El índice público trae una sección 3.15 rotulada «Containments» cuyo contenido no se pudo verificar: se omite y se declara.
//
// Lo que NO proviene de la práctica y es criterio didáctico de este módulo (declarado en pantalla): QUÉ secciones se exigen según la clase del
// estimado. 34R-05 §4 dice que el nivel de detalle de la BOE depende del nivel de definición del proyecto, de su valor y de su tipo, pero no
// fija una lista por clase; aquí `from` indica desde qué clase (5 = la menos madura … 1 = la más madura) se exige cada sección. Además, la lista
// del Anexo A es propia (34R-05 incluye un «Estimate Deliverables Checklist» cuyo contenido no se pudo verificar).

export type BoeStatus = "borrador" | "revision" | "aprobada";
export const STATUS_LABEL: Record<BoeStatus, string> = { borrador: "Borrador", revision: "En revisión", aprobada: "Aprobada" };
export const STATUSES: BoeStatus[] = ["borrador", "revision", "aprobada"];
export interface BoeMember { name: string; role: string; }
export interface BoeRef { title: string; note: string; }
export interface BoeCheck { id: string; done: boolean; }
export interface Boe {
  version: string; status: BoeStatus; preparedBy: string; reviewedBy: string; approvedBy: string; approvedOn: string;
  text: Record<string, string>; team: BoeMember[]; refs: BoeRef[]; checklist: BoeCheck[];
}

// Datos que el módulo puede derivar del proyecto: si existen, esa sección se considera respaldada aunque el texto esté vacío.
export type AutoKey = "scope" | "execution" | "classification" | "coding" | "currency" | "planning" | "risks" | "contingency" | "mgmt" | "escalation" | "capex";
export interface BoeFacts { [k: string]: boolean; }
export interface BoeSection {
  id: string; title: string; en: string; group: string; from: 1 | 2 | 3 | 4 | 5;
  keys: string[];                     // campos de texto de la sección (con uno lleno basta, salvo `all`)
  all?: boolean;                      // se exigen TODOS los campos (p. ej. fecha base Y fuente de precios)
  auto?: AutoKey;                     // dato del proyecto que respalda la sección
  list?: "team" | "refs" | "checklist";
  when?: AutoKey;                     // solo se exige si este hecho es verdadero (p. ej. la frontera de la escalación, si hay escalación)
  hint: string; placeholder?: string; area?: boolean;
}

export const GROUPS: Array<{ id: string; title: string }> = [
  { id: "g1", title: "3.1 Generalidades" }, { id: "g2", title: "3.2 Metodología" }, { id: "g3", title: "3.3 Base de diseño y 3.4 Cantidades" },
  { id: "g5", title: "3.5 Costos y 3.6 Planificación" }, { id: "g7", title: "3.7 a 3.9 Materiales, mano de obra y demolición" },
  { id: "g8", title: "3.10 a 3.13 Asignaciones, supuestos, exclusiones y excepciones" }, { id: "g9", title: "3.14 a 3.17 Riesgos y reservas" },
  { id: "g10", title: "3.18 a 3.22 Conciliación, calidad, equipo y anexos" }
];

export const SECTIONS: BoeSection[] = [
  { id: "3.1.1", group: "g1", from: 5, title: "Propósito", en: "Purpose", keys: ["purpose"], hint: "Para qué se prepara el estimado: estudio de costos, opciones, financiamiento, autorización de presupuesto…", placeholder: "Ej. Sustentar el presupuesto de autorización y servir de base del control de cambios." },
  { id: "3.1.2", group: "g1", from: 4, title: "Objetivos del proyecto y del estimado", en: "Project and Estimate Objectives", keys: ["objectives"], hint: "Qué busca el proyecto y qué decisión debe soportar el estimado." },
  { id: "3.1.3", group: "g1", from: 5, title: "Descripción del alcance del proyecto", en: "Project Scope Description", keys: ["scope"], auto: "scope", hint: "El alcance que cubre el estimado (viene del Enunciado del Alcance). La BOE es el entregable que lo define y la base del control de cambios." },
  { id: "3.1.4", group: "g1", from: 3, title: "Resumen del plan de ejecución", en: "Project Execution Plan Summary", keys: ["execution"], auto: "execution", hint: "Estrategia de contratación, secuencia y fases, jornadas y turnos, hitos que condicionan el costo." },
  { id: "3.1.5", group: "g1", from: 3, title: "Parámetros de construcción, fabricación y operación", en: "Construction, Fabrication, and Operating Parameters", keys: ["parameters"], hint: "Condiciones del sitio, accesos, restricciones de horario, ubicación, clima, servicios provisionales." },
  { id: "3.1.6", group: "g1", from: 5, title: "Clasificación del estimado", en: "Estimate Classification", keys: ["classNote"], auto: "classification", hint: "La clase AACE (pestaña 02) y por qué corresponde a la madurez de la definición." },
  { id: "3.2.1", group: "g2", from: 4, title: "Herramientas de estimación", en: "Estimating Tools", keys: ["tools"], hint: "Programas, hojas de cálculo, bases de datos y técnicas usadas para producir el estimado." },
  { id: "3.2.2", group: "g2", from: 4, title: "Estructura de codificación", en: "Coding Structure", keys: ["coding"], auto: "coding", hint: "Cómo se codifican los costos (EDT y cuentas de costo)." },
  { id: "3.3.1", group: "g3", from: 3, title: "Unidades de medida", en: "Units of Measure", keys: ["units"], hint: "Sistema de unidades y unidades por tipo de trabajo; califica los rendimientos (unidades/hora o horas/unidad)." },
  { id: "3.3.2", group: "g3", from: 5, title: "Moneda y tipos de cambio", en: "Currency and Exchange Rates", keys: ["currencyNote"], auto: "currency", hint: "Moneda del estimado, fecha y fuente del tipo de cambio. El tipo de cambio se estima aparte de la escalación (58R-10)." },
  { id: "3.3.3", group: "g3", from: 1, title: "Redondeo", en: "Rounding", keys: ["rounding"], hint: "Criterio de redondeo de cantidades y costos." },
  { id: "3.4", group: "g3", from: 3, title: "Base de cantidades", en: "Quantity Basis", keys: ["quantities"], hint: "De dónde salen las cantidades (metrados de planos, factores, paramétricos) y su nivel de madurez." },
  { id: "3.5", group: "g5", from: 5, title: "Base de costos: fecha y fuente de precios", en: "Cost Basis", keys: ["date", "source"], all: true, hint: "La fecha base de los precios (de ella se mide la escalación) y su fuente: cotizaciones, bases de precios, contratos.", area: false },
  { id: "3.5.1", group: "g5", from: 4, title: "Base de costos: criterios de costeo", en: "Cost Basis", keys: ["costBasis"], hint: "Costos directos e indirectos, impuestos, gastos generales, utilidad, moneda de las cotizaciones." },
  { id: "3.5.2", group: "g5", from: 4, title: "Frontera entre escalación, contingencia, asignaciones y tipo de cambio", en: "Cost Basis (RP 58R-10)", keys: ["boundary"], auto: "escalation", when: "escalation", hint: "58R-10: cada organización debe definir qué es escalación (incluye la inflación), qué es asignación, contingencia y tipo de cambio, y documentarlo en la BOE. La contingencia excluye la escalación." },
  { id: "3.6", group: "g5", from: 4, title: "Base de planificación", en: "Planning Basis", keys: ["planning"], auto: "planning", hint: "El cronograma en que se apoya el estimado: duración, calendario, fechas de gasto y línea base." },
  { id: "3.7", group: "g7", from: 2, title: "Materiales a granel", en: "Bulk Commodity Material", keys: ["bulk"], hint: "Cómo se cuantifican y cotizan los materiales a granel (desperdicios, factores, suministro)." },
  { id: "3.8", group: "g7", from: 2, title: "Mano de obra", en: "Labor", keys: ["labor", "productivity"], hint: "Tarifas, jornada, rendimientos y factores de productividad o de ajuste." },
  { id: "3.9", group: "g7", from: 1, title: "Demolición", en: "Demolition", keys: ["demolition"], hint: "Qué demolición incluye o excluye el estimado. Si no aplica, escribe «No aplica»." },
  { id: "3.10", group: "g8", from: 3, title: "Asignaciones", en: "Allowances", keys: ["allowances"], hint: "Montos previstos para trabajo aún no definido y qué cubren (no son contingencia). Si no hay, escribe «Sin asignaciones»." },
  { id: "3.11", group: "g8", from: 5, title: "Supuestos", en: "Assumptions", keys: ["assumptions"], hint: "Lo que se da por cierto para estimar y cuyo cambio invalidaría el estimado." },
  { id: "3.12", group: "g8", from: 5, title: "Exclusiones", en: "Exclusions", keys: ["exclusions"], hint: "Lo que el lector podría esperar dentro del estimado y NO está." },
  { id: "3.13", group: "g8", from: 2, title: "Excepciones", en: "Exceptions", keys: ["exceptions"], hint: "Desviaciones de la práctica estándar de estimación de la organización. Si no hay, escribe «Ninguna»." },
  { id: "3.14", group: "g9", from: 4, title: "Riesgos y oportunidades", en: "Risks and Opportunities", keys: ["risksNote"], auto: "risks", hint: "Los riesgos y oportunidades de costo que el estimador conoce (viene del Registro de Riesgos) y cómo se tratan." },
  { id: "3.16", group: "g9", from: 5, title: "Contingencias", en: "Contingencies", keys: ["contingencyNote"], auto: "contingency", hint: "Método y monto de la contingencia; de quién es y cómo se libera." },
  { id: "3.17", group: "g9", from: 4, title: "Reserva de gestión", en: "Management Reserve", keys: ["mgmtNote"], auto: "mgmt", hint: "Monto de la reserva de gestión, quién la controla y cómo se autoriza su uso (fuera de la línea base)." },
  { id: "3.18", group: "g10", from: 3, title: "Conciliación", en: "Reconciliation", keys: ["reconciliation"], auto: "capex", hint: "Cómo se concilia el estimado con estimados anteriores y con el presupuesto autorizado o CAPEX." },
  { id: "3.19", group: "g10", from: 1, title: "Benchmarking", en: "Benchmarking", keys: ["benchmarking"], hint: "Proyectos comparables con los que se contrastó el estimado (costos por unidad, ratios)." },
  { id: "3.20", group: "g10", from: 2, title: "Aseguramiento de la calidad del estimado", en: "Estimate Quality Assurance", keys: ["qa"], hint: "Revisiones internas, chequeos y quién los hizo." },
  { id: "3.21", group: "g10", from: 3, title: "Equipo estimador", en: "Estimating Team", keys: [], list: "team", hint: "Quiénes prepararon el estimado y su rol." },
  { id: "3.22.A", group: "g10", from: 2, title: "Anexo A: entregables del estimado", en: "Attachment A: Estimate Deliverables Checklist", keys: [], list: "checklist", hint: "Lista de control de lo que se entrega con el estimado (lista propia; la de 34R-05 no se pudo verificar)." },
  { id: "3.22.B", group: "g10", from: 3, title: "Anexo B: documentos de referencia", en: "Attachment B: Reference Documents", keys: [], list: "refs", hint: "Documentos y proyectos usados o referenciados al preparar el estimado." }
];
// Campos de texto que guarda la BOE (los cinco primeros existían desde antes: se conservan con su nombre).
export const TEXT_KEYS: string[] = Array.from(new Set(SECTIONS.reduce<string[]>((a, s) => a.concat(s.keys), [])));
export const CHECKLIST_ITEMS: Array<{ id: string; label: string }> = [
  { id: "boe", label: "Basis of Estimate (este documento)" }, { id: "summary", label: "Resumen del estimado por paquete de la EDT" },
  { id: "detail", label: "Estimado detallado (precios unitarios por actividad)" }, { id: "quantities", label: "Hoja de cantidades (metrados)" },
  { id: "schedule", label: "Cronograma y flujo de caja" }, { id: "risk", label: "Análisis de riesgo y contingencia" },
  { id: "escalation", label: "Cálculo de la escalación" }, { id: "reconc", label: "Conciliación y comparación con proyectos similares" },
  { id: "signoff", label: "Revisión y aprobación del estimado" }
];

// ---------- normalización ----------
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
export function blankBoe(): Boe {
  const text: Record<string, string> = {}; TEXT_KEYS.forEach((k) => { text[k] = ""; });
  return { version: "1.0", status: "borrador", preparedBy: "", reviewedBy: "", approvedBy: "", approvedOn: "", text, team: [], refs: [], checklist: CHECKLIST_ITEMS.map((c) => ({ id: c.id, done: false })) };
}
// Lee lo guardado (`estimate.boe`): un proyecto anterior solo trae date, source, assumptions, exclusions y productivity; el resto queda vacío.
export function normalizeBoe(raw: unknown): Boe {
  const b = blankBoe();
  if (!isObj(raw)) return b;
  TEXT_KEYS.forEach((k) => { b.text[k] = str(raw[k]); });
  b.version = str(raw.version) || "1.0";
  b.status = STATUSES.indexOf(raw.status as BoeStatus) >= 0 ? raw.status as BoeStatus : "borrador";
  b.preparedBy = str(raw.preparedBy); b.reviewedBy = str(raw.reviewedBy); b.approvedBy = str(raw.approvedBy);
  b.approvedOn = /^\d{4}-\d{2}-\d{2}$/.test(str(raw.approvedOn)) ? str(raw.approvedOn) : "";
  if (Array.isArray(raw.team)) b.team = raw.team.filter(isObj).map((m) => ({ name: str(m.name), role: str(m.role) })).filter((m) => m.name.trim() || m.role.trim());
  if (Array.isArray(raw.refs)) b.refs = raw.refs.filter(isObj).map((r) => ({ title: str(r.title), note: str(r.note) })).filter((r) => r.title.trim() || r.note.trim());
  if (Array.isArray(raw.checklist)) raw.checklist.filter(isObj).forEach((c) => { const it = b.checklist.find((x) => x.id === c.id); if (it) it.done = c.done === true; });
  return b;
}
// Lo que se guarda: plano (los campos de siempre conservan su nombre).
export function serializeBoe(b: Boe): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  TEXT_KEYS.forEach((k) => { out[k] = b.text[k] || ""; });
  return { ...out, version: b.version, status: b.status, preparedBy: b.preparedBy, reviewedBy: b.reviewedBy, approvedBy: b.approvedBy, approvedOn: b.approvedOn, team: b.team, refs: b.refs, checklist: b.checklist };
}

// ---------- completitud según la clase (criterio didáctico de §4: el detalle depende de la definición) ----------
const filled = (s: string | undefined): boolean => !!s && s.trim().length > 0;
export type SectionState = "completa" | "falta" | "respaldada" | "opcional";
export interface SectionEval { section: BoeSection; state: SectionState; required: boolean; applies: boolean; }
export function sectionDone(s: BoeSection, b: Boe): boolean {
  if (s.list === "team") return b.team.some((m) => filled(m.name));
  if (s.list === "refs") return b.refs.some((r) => filled(r.title));
  if (s.list === "checklist") return b.checklist.some((c) => c.done);
  const own = s.all ? s.keys.every((k) => filled(b.text[k])) : s.keys.some((k) => filled(b.text[k]));
  return own;
}
export function evaluateBoe(b: Boe, facts: BoeFacts, classNum: number): SectionEval[] {
  return SECTIONS.map((s) => {
    const applies = !s.when || !!facts[s.when], required = applies && classNum <= s.from;
    const own = sectionDone(s, b), backed = !own && !!s.auto && !!facts[s.auto] && s.id !== "3.5.2";
    return { section: s, applies, required, state: own ? "completa" : backed ? "respaldada" : required ? "falta" : "opcional" };
  });
}
export interface BoeCompleteness { required: number; done: number; pct: number; missing: BoeSection[]; optionalMissing: BoeSection[]; evals: SectionEval[]; }
export function completeness(b: Boe, facts: BoeFacts, classNum: number): BoeCompleteness {
  const evals = evaluateBoe(b, facts, classNum), req = evals.filter((e) => e.required), done = req.filter((e) => e.state === "completa" || e.state === "respaldada");
  return {
    required: req.length, done: done.length, pct: req.length ? Math.round(done.length / req.length * 100) : 100, evals,
    missing: req.filter((e) => e.state === "falta").map((e) => e.section), optionalMissing: evals.filter((e) => e.applies && !e.required && e.state === "opcional").map((e) => e.section)
  };
}

// ---------- hallazgos ----------
export interface BoeFinding { code: string; severity: "riesgo" | "aviso" | "info"; text: string; }
export interface BoeCtx { classNum: number; escalation: number; baselineVersion: string | null; baselineDate: string; capex: number | null; total: number | null; }
export function boeFindings(b: Boe, facts: BoeFacts, ctx: BoeCtx): BoeFinding[] {
  const out: BoeFinding[] = [], c = completeness(b, facts, ctx.classNum), F = (code: string, severity: BoeFinding["severity"], text: string): void => { out.push({ code, severity, text }); };
  const names = (l: BoeSection[]): string => l.slice(0, 4).map((s) => s.id + " " + s.title).join("; ") + (l.length > 4 ? "…" : "");
  if (b.status === "aprobada" && c.missing.length) F("B1", "riesgo", "La BOE figura «Aprobada» pero le faltan " + c.missing.length + " sección(es) que se exigen para un estimado de clase " + ctx.classNum + " (" + names(c.missing) + "): no puede ser la base del control de cambios.");
  if (b.status === "aprobada" && (!filled(b.approvedBy) || !b.approvedOn)) F("B2", "riesgo", "La BOE está «Aprobada» sin registrar quién la aprueba y en qué fecha.");
  if (b.status === "revision" && !filled(b.reviewedBy)) F("B2", "aviso", "La BOE está «En revisión» sin indicar quién la revisa.");
  if (b.status === "borrador" && ctx.baselineVersion) F("B3", "aviso", "Ya hay una línea base de costos (" + ctx.baselineVersion + ") pero la BOE sigue en borrador: la BOE es la base del control de cambios y debe aprobarse con la línea base.");
  if (b.status === "aprobada" && b.approvedOn && ctx.baselineDate && b.approvedOn < ctx.baselineDate) F("B4", "aviso", "La BOE se aprobó el " + b.approvedOn + ", antes de la última línea base de costos (" + (ctx.baselineVersion || "LB") + ", " + ctx.baselineDate + "): actualízala y vuelve a aprobarla, porque los cambios de la línea base ya no están reflejados.");
  if (ctx.escalation > 0 && !filled(b.text.boundary)) F("B5", "aviso", "Hay escalación en el presupuesto pero la BOE no define qué es escalación, contingencia, asignación y tipo de cambio (sección 3.5.2): 58R-10 pide documentarlo, porque la contingencia excluye la escalación.");
  if (ctx.capex !== null && ctx.total !== null && ctx.total > ctx.capex + 0.5) F("B6", "aviso", "El presupuesto total (" + Math.round(ctx.total).toLocaleString("es-PE") + ") supera el CAPEX del Acta (" + Math.round(ctx.capex).toLocaleString("es-PE") + "): concíliala en la sección 3.18 o solicita la autorización que corresponda.");
  if (!filled(b.preparedBy)) F("B7", "info", "No se registró quién prepara la BOE.");
  if (c.missing.length && b.status !== "aprobada") F("B8", "info", "Faltan " + c.missing.length + " sección(es) requeridas para un estimado de clase " + ctx.classNum + ": " + names(c.missing) + ".");
  return out;
}
