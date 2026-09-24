// Calidad de la EDT (auditoría metodológica PMBOK, ítem D) — lógica PURA, sin DOM ni acceso a `localStorage`. La usa WBS
// Builder (se inlinea en wbs.js); las pruebas la importan directo.
//
// Qué revisa (criterios habituales del PMI Practice Standard for WBS y del Diccionario de la EDT; los UMBRALES son
// heurísticas didácticas declaradas en LIMITS, no normas):
//   · ESTRUCTURA — una descomposición da al menos dos elementos (un solo hijo no descompone nada), los hermanos no
//     repiten nombre, cada elemento se nombra por su resultado (sustantivo) y no por su acción (verbo), no hay nombres
//     vacíos ni de plantilla, la profundidad y el número de hijos son manejables y ninguna fase queda sin descomponer.
//   · DICCIONARIO — cada paquete de trabajo (hoja) debe tener descripción del trabajo, criterio de aceptación,
//     responsable, costo y duración o fechas coherentes.
//   · TAMAÑO — un paquete no debería ser tan largo ni concentrar tanto presupuesto que no se pueda controlar; el trabajo de
//     esfuerzo continuo (LOE: gestión, seguimiento) se declara aparte y queda exento.
// La trazabilidad hacia los requisitos y los entregables del Enunciado NO se revisa aquí: ya la cubre la matriz de
// consistencia del Enunciado del Alcance (traceMatrix / scopeAudit del núcleo).

export interface QNode {
  id?: string; name?: string; children?: string[]; cost?: number | string; duration?: number | string;
  start?: string; end?: string; resource?: string; notes?: string; acceptance?: string; loe?: boolean;
}
export interface QWbs { rootId: string; nodes: Record<string, QNode>; }
export type QSeverity = "riesgo" | "aviso" | "info";
export interface QFinding { code: string; severity: QSeverity; nodeId: string; nodeCode: string; text: string; }
export interface QRule { code: string; severity: QSeverity; title: string; hint: string; }
export interface QGroup { code: string; severity: QSeverity; title: string; hint: string; items: QFinding[]; }
export interface WbsQuality {
  findings: QFinding[]; byNode: Record<string, QFinding[]>; groups: QGroup[];
  counts: Record<QSeverity, number>; state: "vacio" | "verde" | "ambar" | "rojo";
  codes: Record<string, string>; leaves: number; maxDepth: number;
  dictionary: { complete: number; total: number; pct: number };
}

// Umbrales didácticos (ajustables aquí; ver ARCHITECTURE.md).
export const LIMITS = { maxDepth: 5, maxChildren: 9, maxPackageDays: 60, maxCostSharePct: 20, minLeavesForShare: 5 } as const;

const PLACEHOLDERS = ["nuevo paquete", "nueva fase", "nueva subtarea", "nuevo entregable", "entregable", "paquete", "fase", "subtarea", "proyecto sin titulo"];
// Sustantivos que terminan en -ar/-er/-ir y no son verbos (o extranjerismos frecuentes en obra y TI).
const NOT_VERBS = ["taller", "alquiler", "poder", "lider", "mujer", "lugar", "hogar", "pilar", "militar", "dossier", "container", "router", "caracter", "deber", "placer", "cadaver", "crater", "cluster", "poster", "elixir"];

export const RULES: QRule[] = [
  { code: "E1", severity: "aviso", title: "Nombres vacíos o sin editar", hint: "Cada elemento necesita un nombre propio; los nombres de plantilla («Nuevo paquete», «Nueva fase») no dicen qué se entrega." },
  { code: "E2", severity: "riesgo", title: "Nombres repetidos entre hermanos", hint: "Dos elementos con el mismo nombre bajo el mismo padre son ambiguos: nadie sabe cuál es cuál al asignar, costear o reportar." },
  { code: "E3", severity: "info", title: "Mismo nombre en ramas distintas", hint: "Repetir un nombre («Pruebas») en dos ramas confunde los reportes; agrega el contexto al nombre («Pruebas eléctricas»)." },
  { code: "E4", severity: "aviso", title: "Elementos con un solo hijo", hint: "Una descomposición produce al menos dos elementos: con uno solo no hay descomposición. Agrega el que falta o fusiónalo con su padre." },
  { code: "E5", severity: "aviso", title: "Fases sin descomponer", hint: "Una fase sin entregables ni paquetes no se puede planificar ni costear: descomponla hasta paquetes de trabajo." },
  { code: "E6", severity: "aviso", title: "Más de " + LIMITS.maxDepth + " niveles", hint: "Una EDT muy profunda es difícil de mantener; considera un subproyecto o replantear el criterio de descomposición." },
  { code: "E7", severity: "info", title: "Demasiados hijos (más de " + LIMITS.maxChildren + ")", hint: "Con tantos hijos conviene agrupar en un nivel intermedio (por entregable o por área)." },
  { code: "E8", severity: "info", title: "Nombres que parecen actividades", hint: "La EDT nombra resultados (sustantivos: «Diseño estructural»), no acciones (verbos: «Diseñar la estructura»); las acciones son actividades, y se definen después." },
  { code: "D1", severity: "aviso", title: "Paquetes sin descripción del trabajo", hint: "El diccionario de la EDT describe qué trabajo incluye y qué no cada paquete; sin él, cada persona interpreta el alcance a su manera." },
  { code: "D2", severity: "aviso", title: "Paquetes sin criterio de aceptación", hint: "Sin criterio de aceptación no hay forma objetiva de decir que el paquete está terminado (y de cobrarlo o ganar su valor)." },
  { code: "D3", severity: "aviso", title: "Paquetes sin responsable", hint: "Cada paquete tiene un responsable (idealmente el «R» de la Matriz RACI)." },
  { code: "D4", severity: "aviso", title: "Paquetes sin costo", hint: "Un paquete sin costo deja el presupuesto incompleto; estímalo aquí o en Estimar los Costos." },
  { code: "D5", severity: "aviso", title: "Paquetes sin duración ni fechas", hint: "Un paquete sin duración ni fechas no entra al cronograma." },
  { code: "D6", severity: "riesgo", title: "Fechas incompletas o invertidas", hint: "Un paquete con una sola fecha, o cuyo fin cae antes que su inicio, rompe el cronograma y el valor planificado." },
  { code: "S1", severity: "aviso", title: "Paquetes demasiado largos (> " + LIMITS.maxPackageDays + " d)", hint: "Un paquete tan largo no se puede controlar con avance real: descomponlo (regla del período de reporte / 8-80) o decláralo esfuerzo continuo (LOE) si es gestión o seguimiento." },
  { code: "S2", severity: "aviso", title: "Paquetes que concentran el costo (> " + LIMITS.maxCostSharePct + " %)", hint: "Un paquete que concentra tanto presupuesto es difícil de controlar (valor ganado, avance): considera dividirlo por lote, hito de pago o entrega." }
];
const RULE: Record<string, QRule> = {}; RULES.forEach((r) => { RULE[r.code] = r; });
const SEV_RANK: Record<QSeverity, number> = { riesgo: 0, aviso: 1, info: 2 };

const norm = (s: unknown): string => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const blank = (s: unknown): boolean => !String(s == null ? "" : s).trim();
const num = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };
// Días de calendario entre dos fechas ISO, ambos extremos incluidos; null si falta alguna, no parsea o el fin cae antes.
export function calendarDays(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const a = Date.parse(start + "T00:00:00Z"), b = Date.parse(end + "T00:00:00Z");
  if (!isFinite(a) || !isFinite(b)) return null;
  const d = Math.round((b - a) / 86400000);
  return d >= 0 ? d + 1 : null;
}
// ¿El nombre empieza con un verbo en infinitivo (Realizar, Elaborar, Instalar…)? Heurística: hay excepciones declaradas.
export function looksLikeActivity(name: unknown): boolean {
  const first = norm(name).split(" ")[0] || "";
  return first.length >= 5 && /^[a-z]+(ar|er|ir)$/.test(first) && NOT_VERBS.indexOf(first) < 0;
}

export function analyzeWbs(wbs: QWbs | null | undefined): WbsQuality {
  const empty: WbsQuality = { findings: [], byNode: {}, groups: [], counts: { riesgo: 0, aviso: 0, info: 0 }, state: "vacio", codes: {}, leaves: 0, maxDepth: 0, dictionary: { complete: 0, total: 0, pct: 0 } };
  if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return empty;
  const nodes = wbs.nodes, rootId = wbs.rootId;

  // Recorrido desde la raíz: código, profundidad y padre (los nodos huérfanos o ciclos se ignoran).
  const order: string[] = [], parent: Record<string, string | null> = {}, depth: Record<string, number> = {}, codes: Record<string, string> = {}, kids: Record<string, string[]> = {};
  const seen: Record<string, boolean> = {};
  (function walk(id: string, par: string | null, d: number, code: string): void {
    seen[id] = true; order.push(id); parent[id] = par; depth[id] = d; codes[id] = code;
    kids[id] = (nodes[id].children || []).filter((c) => nodes[c] && !seen[c]);
    kids[id].forEach((c, i) => walk(c, id, d + 1, id === rootId ? String(i + 1) : code + "." + (i + 1)));
  })(rootId, null, 0, "0");
  const body = order.filter((id) => id !== rootId);
  if (!body.length) return { ...empty, codes };
  const leafIds = body.filter((id) => !kids[id].length);
  const maxDepth = body.reduce((m, id) => Math.max(m, depth[id]), 0);

  const findings: QFinding[] = [];
  const add = (code: string, id: string, text: string, severity?: QSeverity): void => { findings.push({ code, severity: severity || RULE[code].severity, nodeId: id, nodeCode: codes[id], text }); };
  const nm = (id: string): string => "«" + (String(nodes[id].name || "").trim() || "sin nombre") + "»";

  // ---- ESTRUCTURA ----
  body.forEach((id) => {
    const raw = String(nodes[id].name || "");
    if (blank(raw)) add("E1", id, "El elemento " + codes[id] + " no tiene nombre.", "riesgo");
    else if (PLACEHOLDERS.indexOf(norm(raw)) >= 0) add("E1", id, nm(id) + " conserva un nombre de plantilla: nómbralo por lo que entrega.");
    else if (looksLikeActivity(raw)) add("E8", id, nm(id) + " parece una actividad (empieza con un verbo): nombra el resultado, no la acción.");
  });
  // duplicados entre hermanos y en ramas distintas (los nombres vacíos ya se reportan en E1)
  const siblingDup: Record<string, boolean> = {};
  order.forEach((pid) => {
    const seenName: Record<string, string[]> = {};
    kids[pid].forEach((c) => { const k = norm(nodes[c].name); if (k) (seenName[k] = seenName[k] || []).push(c); });
    Object.keys(seenName).forEach((k) => { if (seenName[k].length > 1) seenName[k].forEach((c) => { siblingDup[c] = true; add("E2", c, nm(c) + " se repite entre los hijos de " + (pid === rootId ? "el proyecto" : codes[pid]) + "."); }); });
  });
  const byName: Record<string, string[]> = {};
  body.forEach((id) => { const k = norm(nodes[id].name); if (k && PLACEHOLDERS.indexOf(k) < 0) (byName[k] = byName[k] || []).push(id); });
  Object.keys(byName).forEach((k) => {
    const ids = byName[k].filter((id) => !siblingDup[id]);
    if (byName[k].length > 1 && ids.length) ids.forEach((id) => add("E3", id, nm(id) + " también aparece en otra rama de la EDT (" + byName[k].filter((o) => o !== id).map((o) => codes[o]).join(", ") + ")."));
  });
  order.forEach((id) => {
    if (kids[id].length === 1) add("E4", id, (id === rootId ? "El proyecto tiene una sola fase (" + nm(kids[id][0]) + ")" : nm(id) + " tiene un solo hijo (" + nm(kids[id][0]) + ")") + ": eso no es una descomposición.");
    if (kids[id].length > LIMITS.maxChildren) add("E7", id, (id === rootId ? "El proyecto" : nm(id)) + " tiene " + kids[id].length + " hijos: agrúpalos en un nivel intermedio.");
  });
  const phases = kids[rootId];
  if (phases.some((p) => kids[p].length)) phases.filter((p) => !kids[p].length).forEach((p) => add("E5", p, nm(p) + " no tiene entregables ni paquetes: descomponla."));
  body.filter((id) => depth[id] === LIMITS.maxDepth + 1).forEach((id) => add("E6", id, nm(id) + " está en el nivel " + depth[id] + ": la EDT supera los " + LIMITS.maxDepth + " niveles."));

  // ---- DICCIONARIO Y TAMAÑO (paquetes de trabajo = hojas) ----
  const totalCost = leafIds.reduce((s, id) => s + Math.max(0, num(nodes[id].cost)), 0);
  let complete = 0;
  leafIds.forEach((id) => {
    const n = nodes[id];
    const okDesc = !blank(n.notes), okAcc = !blank(n.acceptance), okRes = !blank(n.resource);
    if (!okDesc) add("D1", id, nm(id) + " no tiene descripción del trabajo.");
    if (!okAcc) add("D2", id, nm(id) + " no tiene criterio de aceptación.");
    if (!okRes) add("D3", id, nm(id) + " no tiene responsable.");
    if (okDesc && okAcc && okRes) complete++;
    const cost = num(n.cost);
    if (cost <= 0) add("D4", id, nm(id) + " no tiene costo estimado.");
    const days = calendarDays(n.start, n.end) ?? Math.max(0, num(n.duration));
    const hasS = !blank(n.start), hasE = !blank(n.end);
    if (hasS && hasE && n.start! > n.end!) add("D6", id, nm(id) + " termina (" + n.end + ") antes de empezar (" + n.start + ").");
    else if (hasS !== hasE) add("D6", id, nm(id) + " tiene solo la fecha de " + (hasS ? "inicio" : "fin") + ": completa la otra o bórrala.");
    else if (!hasS && days <= 0) add("D5", id, nm(id) + " no tiene duración ni fechas.");
    if (!n.loe) {
      if (days > LIMITS.maxPackageDays) add("S1", id, nm(id) + " dura " + days + " d (más de " + LIMITS.maxPackageDays + "): descomponlo o márcalo como esfuerzo continuo (LOE).");
      if (leafIds.length >= LIMITS.minLeavesForShare && totalCost > 0 && cost / totalCost * 100 > LIMITS.maxCostSharePct) add("S2", id, nm(id) + " concentra el " + (Math.round(cost / totalCost * 1000) / 10) + " % del costo total: es difícil de controlar; considera dividirlo.");
    }
  });

  // ---- resumen ----
  const counts: Record<QSeverity, number> = { riesgo: 0, aviso: 0, info: 0 };
  findings.forEach((f) => { counts[f.severity]++; });
  const byNode: Record<string, QFinding[]> = {};
  findings.forEach((f) => { (byNode[f.nodeId] = byNode[f.nodeId] || []).push(f); });
  const groups: QGroup[] = [];
  RULES.forEach((r) => {
    const items = findings.filter((f) => f.code === r.code);
    if (!items.length) return;
    const sev = items.reduce((s, f) => (SEV_RANK[f.severity] < SEV_RANK[s] ? f.severity : s), items[0].severity);
    groups.push({ code: r.code, severity: sev, title: r.title, hint: r.hint, items });
  });
  groups.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const state: WbsQuality["state"] = counts.riesgo ? "rojo" : counts.aviso ? "ambar" : "verde";
  return {
    findings, byNode, groups, counts, state, codes, leaves: leafIds.length, maxDepth,
    dictionary: { complete, total: leafIds.length, pct: leafIds.length ? Math.round(complete / leafIds.length * 100) : 0 }
  };
}
