/* ============================================================
   GPI Core — capa de datos compartida para el ecosistema de
   herramientas del curso de Gestión de Proyectos de Ingeniería.

   Port mecánico de gpi-core.js a TypeScript (Fase 1 de MIGRATION.md):
   misma lógica, mismas ramas de compatibilidad con esquemas antiguos,
   solo se agregan tipos. El esquema completo de datos vive en ./types.

   Un único "proyecto" vive en localStorage (clave "gpi_db") y es
   consumido por el Panel de Control y por cada módulo. Si localStorage
   no está disponible (p. ej. vista previa en un iframe), usa un
   respaldo en memoria para no romper la interfaz.

   Cada función de utilidad se exporta individualmente (para Vitest) y
   además se cuelga de window.GPI (para los 13 módulos HTML, que la
   consumen como script clásico, no como módulo ES).
   ============================================================ */
import type {
  GpiDb, GpiProject, ProjectMeta, ProjectModules,
  WbsModule, ObsModule, ObsNode, RaciModule,
  ActivitiesModule, ActivityItem, CostEstimateModule, PertModule,
  ScheduleModule, ScheduleLink, ScheduleLinkType, ScheduleLagUnit,
  RequirementsModule, RequirementItem, ScopeStatementModule, ScopeDeliverable,
  CharterModule, CharterRequirement, CostModule,
  SchedulePlanModule, SchedulePlanCalendar,
  EditSession, WriteResult
} from "./types";
export type { EditSession, WriteResult, WriteStatus } from "./types";

export const KEY = "gpi_db";
const SCHEMA = "gpi.project/v1";
let mem: GpiDb | null = null;
// Última versión de la base que se intentó guardar y NO llegó a
// localStorage (QuotaExceededError u otro fallo de escritura -- ver
// save()). Antes, esa versión se perdía en el momento: la función de
// escritura devolvía éxito igual (bug real reportado por el usuario,
// confirmado reproduciendo el error de cuota: setModule() devolvía
// true, aparecía el aviso, pero exportActive() -- y cualquier otra
// lectura -- seguía sirviendo la última versión SÍ persistida en disco,
// sin los cambios que el aviso decía poder rescatar exportando). Ahora
// db() sirve esta copia mientras exista, así toda lectura posterior
// (incluida exportActive()) ve los cambios pendientes, y un futuro
// guardado exitoso (el alumno libera espacio) la limpia.
let pendingUnsaved: GpiDb | null = null;
// Foto de la base tal como estaba en disco ANTES de la primera falla de
// esta racha de cuota agotada -- ver mergeWithDisk(). Sin esto, al
// reconciliar solo podríamos comparar "mi copia" contra "lo que hay en
// disco ahora", sin saber qué cambió cada lado respecto de un punto en
// común, y perderíamos de todas formas el módulo que la OTRA pestaña
// alcanzó a guardar si esta pestaña vuelve a tocar el mismo proyecto
// (aunque sea un módulo distinto) antes de reintentar.
let pendingBase: GpiDb | null = null;

function avail(): boolean {
  try {
    const k = "__gpi_t";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}
export { avail as available };
// "No hay localStorage" de verdad (bloqueado, iframe sin permiso, file:// opaco):
// ni siquiera se puede LEER. Distinto de "está lleno" (cuarta revisión externa,
// P1): con la cuota agotada falla la sonda de 1 byte de avail() -- es un setItem
// --, pero getItem sigue funcionando y lo que hay en disco es real. Tratar un
// almacenamiento lleno como "sin almacenamiento" servía una base vacía a las
// lecturas y confirmaba como guardado (en memoria) un dato que no se persistió.
function readable(): boolean {
  try { localStorage.getItem(KEY); return true; } catch (e) { return false; }
}
// Modo memoria legítimo: no hay almacenamiento ni se puede leer, y tampoco hay
// nada pendiente que deba seguir contando como "sin guardar".
function memoryMode(): boolean { return !avail() && !readable(); }

function fresh(): GpiDb { return { version: 1, activeId: null, projects: {} }; }
function db(): GpiDb {
  // Hay una versión más reciente que localStorage rechazó por cuota --
  // servirla a toda lectura/escritura hasta que un guardado futuro
  // vuelva a tener éxito, en vez de volver silenciosamente a la última
  // que sí quedó en disco (que ya no refleja el trabajo del alumno).
  // Va ANTES que avail(): si la cuota empeora tanto que hasta la sonda
  // de 1 byte de avail() empieza a fallar, esto ya no debe devolver un
  // respaldo VACÍO (bug real reportado por el usuario) -- pendingUnsaved
  // sigue siendo la mejor versión conocida, con o sin acceso a disco.
  if (pendingUnsaved) return pendingUnsaved;
  if (memoryMode()) return mem || (mem = fresh());
  try {
    return (JSON.parse(localStorage.getItem(KEY) as string) as GpiDb) || fresh();
  } catch (e) {
    return fresh();
  }
}
export { db as raw };
// Refleja si la última escritura a localStorage falló (cuota agotada u
// otro error) y por lo tanto hay cambios que solo existen en memoria
// (ver pendingUnsaved) -- para que Panel de Control u otro módulo pueda
// distinguir "todo guardado" de "hay trabajo pendiente de exportar"
// además del aviso visual ya existente.
export function hasUnsavedChanges(): boolean { return pendingUnsaved !== null; }

// Cuando "d" es la propia pendingUnsaved (un reintento tras una cuota
// agotada, ver save()), esta pestaña puede llevar minutos u horas
// desconectada de lo que OTRAS pestañas sí lograron guardar
// normalmente en ese lapso -- pendingUnsaved es un clon COMPLETO de
// toda la base (todos los proyectos), tomado ANTES de que empezara el
// fallo. Escribirlo tal cual pisaría cualquier proyecto (o módulo
// dentro de un proyecto) que otra pestaña haya guardado mientras esta
// seguía atascada -- bug real reportado por el usuario: dos pestañas
// comparten almacenamiento, A retiene un cambio pendiente por cuota, B
// guarda una actualización de costos, A recupera la capacidad de
// guardar y escribe su copia completa anterior: la actualización de
// costos desaparece.
//
// Concilia a TRES bandas (base/ours/theirs), no solo "ours vs. theirs":
// - projects que solo están en disco (theirs) -- de un proyecto que
//   esta pestaña ni siquiera conoce -- se conservan tal cual.
// - projects que solo están en "d" (ours) -- creados por esta pestaña
//   mientras estaba atascada -- se agregan tal cual.
// - projects en ambos lados: se concilia MÓDULO POR MÓDULO contra
//   pendingBase (la foto de disco al momento de la primera falla): un
//   módulo que cambió de un solo lado respecto de la base se conserva
//   del lado que cambió; si NINGÚN lado lo tocó, se conserva tal cual
//   (da igual cuál); si AMBOS lados lo cambiaron (conflicto real, poco
//   común), gana "ours" -- esta pestaña es la que está guardando en
//   este momento, y es preferible conservar su trabajo a descartarlo
//   en silencio, que es como se comportaba el bug. Sin pendingBase
//   (no debería pasar en el flujo normal) cae al criterio anterior,
//   más simple: todo el proyecto de quien tenga el meta.updatedAt más
//   reciente.
//
// activeId se toma de disco cuando existe: es un puntero global, y otra
// pestaña pudo haber activado un proyecto distinto mientras esta seguía
// atascada.
//
// SEGUNDA PASADA (hallazgo "alta" de la revisión externa): la combinación
// anterior conservaba la UNIÓN de proyectos de ambos lados sin distinguir
// una eliminación de una creación, y elegía los metadatos como un objeto
// completo según updatedAt. Confirmado con dos contextos: (a) un proyecto
// eliminado desde otra pestaña reaparecía al recuperar el guardado; (b) una
// eliminación hecha en la propia copia pendiente también se revertía; (c) un
// cambio de "client" hecho en otra pestaña desaparecía cuando la copia
// pendiente guardaba después un cambio de "location". Ahora cada diferencia
// se lee contra la base (pendingBase) como una OPERACIÓN explícita:
//   crear    = existe en un lado y no en la base;
//   eliminar = existe en la base y falta en un lado;
//   modificar= difiere de la base (proyecto, módulo o CAMPO de meta).
// Política de conflicto (explícita, nunca silenciosa):
//   - eliminar vs. sin cambios del otro lado -> se elimina;
//   - eliminar vs. modificar -> gana la modificación (no se destruye
//     trabajo ajeno) y se informa;
//   - el mismo módulo o campo modificado a valores distintos en ambos
//     lados -> gana la pestaña que guarda ahora, se informa qué se pisó, y
//     la revisión del módulo sube para que la otra pestaña vea un conflicto.
type Reconcile = { merged: GpiDb; conflicts: string[] };
function sameJson(a: unknown, b: unknown): boolean { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
function mergeProject(id: string, ours: GpiProject, theirs: GpiProject, base: GpiProject | undefined, conflicts: string[]): GpiProject {
  if (!base) return (ours.meta.updatedAt || 0) >= (theirs.meta.updatedAt || 0) ? ours : theirs;
  // metadatos por CAMPO
  const om = ours.meta as unknown as Record<string, unknown>, tm = theirs.meta as unknown as Record<string, unknown>, bm = base.meta as unknown as Record<string, unknown>;
  const meta: Record<string, unknown> = {};
  new Set([...Object.keys(om), ...Object.keys(tm), ...Object.keys(bm)]).forEach((k) => {
    if (k === "updatedAt") return;
    const oursCh = !sameJson(om[k], bm[k]), theirsCh = !sameJson(tm[k], bm[k]);
    if (oursCh && theirsCh && !sameJson(om[k], tm[k])) conflicts.push(id + "/meta." + k);
    const v = oursCh ? om[k] : tm[k];
    if (v !== undefined) meta[k] = v;
  });
  meta.updatedAt = Math.max(Number(om.updatedAt) || 0, Number(tm.updatedAt) || 0);
  // módulos y revisiones
  const oMods = (ours.modules || {}) as Record<string, unknown>, tMods = (theirs.modules || {}) as Record<string, unknown>, bMods = (base.modules || {}) as Record<string, unknown>;
  const mods: Record<string, unknown> = {}, revs: Record<string, number> = {};
  new Set([...Object.keys(oMods), ...Object.keys(tMods), ...Object.keys(bMods)]).forEach((mk) => {
    const oursCh = !sameJson(oMods[mk], bMods[mk]), theirsCh = !sameJson(tMods[mk], bMods[mk]);
    const both = oursCh && theirsCh && !sameJson(oMods[mk], tMods[mk]);
    if (both) conflicts.push(id + "/" + mk);
    const v = oursCh ? oMods[mk] : tMods[mk];
    if (v !== undefined) mods[mk] = v;
    const or = revOf(ours, mk), tr = revOf(theirs, mk);
    revs[mk] = both ? Math.max(or, tr) + 1 : Math.max(or, tr);
  });
  return { schema: ours.schema, meta: meta as unknown as ProjectMeta, modules: mods as GpiProject["modules"], revs };
}
function reconcileWithDisk(d: GpiDb): Reconcile | null {
  let diskRaw: string | null = null;
  try { diskRaw = localStorage.getItem(KEY); } catch (_) { /* noop */ }
  if (!diskRaw) return null;
  let disk: GpiDb;
  try { disk = JSON.parse(diskRaw) as GpiDb; } catch (_) { return null; }
  if (!disk || !isPlainObject(disk.projects)) return null;
  const base = pendingBase || fresh(), conflicts: string[] = [];
  const projects: Record<string, GpiProject> = {};
  new Set([...Object.keys(d.projects), ...Object.keys(disk.projects), ...Object.keys(base.projects)]).forEach((id) => {
    const o = d.projects[id], t = disk.projects[id], b = base.projects[id];
    if (o && t) { projects[id] = mergeProject(id, o, t, b, conflicts); return; }
    if (o && !t) {
      if (!b) { projects[id] = o; return; }                       // creado aquí
      if (sameJson(o, b)) return;                                  // eliminado en otra pestaña, aquí sin cambios -> sigue eliminado
      conflicts.push(id + " (eliminado en otra pestaña, modificado aquí: se conserva)"); projects[id] = o; return;
    }
    if (!o && t) {
      if (!b) { projects[id] = t; return; }                        // creado en otra pestaña
      if (sameJson(t, b)) return;                                  // eliminado aquí, allá sin cambios -> sigue eliminado
      conflicts.push(id + " (eliminado aquí, modificado en otra pestaña: se conserva)"); projects[id] = t;
    }
  });
  const pick = !sameJson(d.activeId, base.activeId) ? d.activeId : disk.activeId;
  const activeId = pick && projects[pick] ? pick : (disk.activeId && projects[disk.activeId] ? disk.activeId : (d.activeId && projects[d.activeId] ? d.activeId : (Object.keys(projects)[0] || null)));
  return { merged: { version: d.version, activeId, projects }, conflicts };
}
let lastReconcileConflicts: string[] = [];
// Conflictos de la última recuperación tras cuota agotada (vacío = ninguno).
export function lastReconcile(): string[] { return lastReconcileConflicts.slice(); }

// Devuelve true si el guardado llegó a localStorage, false si falló
// (queda igual retenido en pendingUnsaved -- ver db()). Antes esta
// función no devolvía nada y sus llamadoras (setModule, patchMeta...)
// reportaban éxito de forma incondicional, sin importar si la escritura
// real había fallado.
function save(d: GpiDb): boolean {
  // Modo memoria (sin localStorage): degradado pero no es un fallo de escritura.
  // NUNCA con un guardado pendiente ni con el almacenamiento solo lleno: ahí el
  // respaldo en memoria no confirma nada, se sigue por el intento real y, si
  // falla, queda pendiente (y la sesión no lo da por guardado).
  if (!pendingUnsaved && memoryMode()) { mem = d; return true; }
  try {
    const rec = d === pendingUnsaved ? reconcileWithDisk(d) : null;
    localStorage.setItem(KEY, JSON.stringify(rec ? rec.merged : d));
    if (rec) lastReconcileConflicts = rec.conflicts;
    pendingUnsaved = null; pendingBase = null; // volvió a guardar bien: ya no hace falta ni el respaldo ni la base de conciliación
    hideQuotaNotice();
    if (rec && rec.conflicts.length) showRecoverNotice(rec.conflicts);
    return true;
  } catch (e) {
    // localStorage lleno (QuotaExceededError) u otro fallo de escritura:
    // antes esto fallaba EN SILENCIO y el alumno perdía cambios sin
    // avisar. Ahora se retiene la versión intentada (pendingUnsaved,
    // ver arriba) en vez de descartarla.
    if (pendingUnsaved == null) {
      // primera falla de esta racha: capturar la foto de disco de la
      // que "d" partió, para poder conciliar por módulo más adelante
      // (ver mergeWithDisk) -- en fallas consecutivas de la MISMA
      // racha, pendingBase ya está capturada y no se vuelve a tocar.
      try { pendingBase = JSON.parse(localStorage.getItem(KEY) as string) as GpiDb; } catch (_) { pendingBase = null; }
    }
    pendingUnsaved = d;
    showQuotaNotice();
    return false;
  }
}

// ----- aviso visible de almacenamiento lleno -----
let quotaEl: HTMLDivElement | null = null;
function showQuotaNotice(): void {
  try {
    if (typeof document === "undefined" || !document.body) return;
    if (quotaEl && document.body.contains(quotaEl)) return;
    quotaEl = document.createElement("div");
    quotaEl.id = "gpiQuotaNotice";
    quotaEl.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:2500;background:#7a1f2b;color:#fff;font-family:'Manrope',sans-serif;font-size:12.5px;font-weight:600;line-height:1.5;padding:11px 18px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:560px;text-align:center;";
    quotaEl.innerHTML = "⚠ <b>El almacenamiento del navegador está lleno: los últimos cambios NO se están guardando.</b><br>Exporta este proyecto a .json (botón ⭳ Guardar) para no perder tu trabajo y elimina proyectos antiguos desde el Panel de Control.";
    document.body.appendChild(quotaEl);
  } catch (_) { /* noop */ }
}
function showRecoverNotice(conflicts: string[]): void {
  try {
    if (typeof document === "undefined" || !document.body) return;
    const el = document.createElement("div");
    el.id = "gpiRecoverNotice";
    el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:2500;background:#7a5a00;color:#fff;font-family:'Manrope',sans-serif;font-size:12.5px;font-weight:600;line-height:1.5;padding:11px 18px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:560px;text-align:center;cursor:pointer;";
    el.textContent = "⚠ Se recuperó el guardado, pero otra pestaña había cambiado lo mismo: " + conflicts.join("; ") + ". Se conservó lo de esta pestaña (clic para cerrar).";
    el.onclick = () => { if (el.parentNode) el.parentNode.removeChild(el); };
    document.body.appendChild(el);
  } catch (_) { /* noop */ }
}
function hideQuotaNotice(): void {
  try { if (quotaEl && quotaEl.parentNode) { quotaEl.parentNode.removeChild(quotaEl); quotaEl = null; } } catch (_) { /* noop */ }
}

function uid(): string {
  return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
}

// Un objeto-diccionario válido ({clave: valor}) nunca es un arreglo --
// bug real reportado por el usuario (severidad media): en JavaScript
// `typeof [] === "object"`, así que un .json con `"modules": []` pasaba
// intacto el chequeo `!proj.modules || typeof proj.modules !== "object"`
// (un arreglo vacío es objeto Y es truthy). proj.modules quedaba siendo
// un Array real; asignarle una propiedad de texto (p. ej.
// `p.modules.charter = datos`, lo que hace setModule()) funciona en
// memoria -- los arreglos siguen siendo objetos JS --, pero
// `JSON.stringify()` de un Array SOLO serializa sus elementos
// indexados: cualquier propiedad de texto colgada ahí se descarta en
// silencio al guardar. setModule() devolvía `true` (la escritura en sí
// no lanzó ninguna excepción) pero getModule() inmediatamente después
// devolvía `null`, porque lo que de verdad quedó en disco nunca tuvo
// esa propiedad. Se usa en los tres puntos donde "modules" se lee o se
// inicializa antes de escribir (normalizeToProject(), setModule(),
// ingestToolExport()) y también en sanitizeTree() para "nodes" (mismo
// riesgo: un WBS/OBS importado con `"nodes": []` en vez de `{id: nodo}`
// debe tratarse como vacío, no como un array que silenciosamente
// pierde cualquier propiedad que se le cuelgue).
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function defaultMeta(): ProjectMeta {
  return {
    id: null, name: "Proyecto sin título", code: "", client: "", location: "",
    sponsor: "", manager: "", startDate: "", endDate: "", currency: "USD",
    capex: "", description: "", course: "Gestión de Proyectos de Ingeniería",
    createdAt: Date.now(), updatedAt: Date.now()
  };
}

// ----- lectura -----
export function listProjects(): Array<{ id: string; name: string; updatedAt: number; code: string }> {
  const d = db();
  return Object.keys(d.projects).map((id) => {
    const m = d.projects[id].meta;
    return { id, name: m.name, updatedAt: m.updatedAt, code: m.code };
  }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export function activeId(): string | null { return db().activeId; }
export function active(): GpiProject | null { const d = db(); return (d.activeId && d.projects[d.activeId]) || null; }
export function meta(): ProjectMeta | null { const p = active(); return p ? p.meta : null; }
export function getModule<K extends keyof ProjectModules>(name: K): ProjectModules[K] | null {
  const p = active();
  // Segunda capa: normalizeToProject() ya garantiza "modules" al
  // importar, pero un proyecto guardado por una versión más vieja del
  // núcleo (o tocado a mano en localStorage) también podría no tenerlo
  // -- sin este chequeo, cada uno de los ~60 sitios que llaman
  // GPI.getModule(...) en los 13 módulos y en Panel de Control revienta
  // con TypeError en vez de tratarlo como "este módulo no tiene datos".
  return p && p.modules ? (p.modules[name] || null) : null;
}

// ----- escritura -----
export function setActive(id: string): GpiProject | null {
  const d = db();
  if (d.projects[id]) { d.activeId = id; save(d); }
  return active();
}
// expectedProjectId es la segunda barrera (la primera es que cada módulo
// se abstenga de llamar a esto si GPI.activeId() ya no coincide con el
// proyecto que cargó): un módulo puede capturar el estado de un proyecto,
// quedarse abierto mientras OTRA pestaña activa un proyecto distinto, y
// disparar su guardado de salida (beforeunload/visibilitychange) contra
// "el proyecto activo ahora", que ya no es el suyo -- sin este chequeo,
// esa escritura vieja se aplicaba igual, sin avisar, sobre el proyecto
// equivocado (bug real reportado por el usuario con Project_Charter, y
// confirmado sistémico en los 13 módulos de herramienta). Si se pasa y no
// coincide con el proyecto activo actual, no se escribe nada -- mismo
// criterio defensivo que "sin proyecto activo": devolver null/false, no
// lanzar. Omitir el parámetro conserva el comportamiento anterior (lo usa
// Panel de Control, que siempre actúa sobre el proyecto que él mismo
// acaba de activar/crear, nunca sobre un snapshot cargado antes).
export function patchMeta(partial: Partial<ProjectMeta>, expectedProjectId?: string | null): ProjectMeta | null {
  const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
  if (!p) return null;
  if (expectedProjectId != null && d.activeId !== expectedProjectId) return null;
  Object.assign(p.meta, partial || {});
  p.meta.updatedAt = Date.now();
  save(d);
  return p.meta;
}
// ----- revisiones, sesiones de edición y resultado común de escritura -----
//
// Bug real reportado por el usuario (alta): la guarda por projectId evita
// escribir sobre OTRO proyecto, pero no detecta que los datos del MISMO
// proyecto cambiaron después de abrir la pestaña -- abrir el Acta, editarla
// desde otra pestaña y ejecutar el guardado de salida de la primera dejaba
// la versión vieja (vacía) sobre la nueva. Contrato:
//  - cada proyecto lleva una revisión POR MÓDULO (project.revs), que sube
//    en cada escritura de ese módulo;
//  - openSession(módulo) captura, en el instante en que el módulo lee sus
//    datos, el proyecto, la revisión y una foto (datos y metadatos);
//  - saveModule()/saveMeta() comparan contra esa sesión ANTES de sustituir
//    nada: sin cambios propios -> "unchanged" (no se escribe); con cambios
//    ajenos posteriores -> "conflict" (no se sobrescribe); y devuelven un
//    resultado común que los módulos usan para informar al usuario.
function revOf(p: GpiProject, module: string): number {
  const r = p.revs && p.revs[module];
  return typeof r === "number" ? r : 0;
}
function bumpRev(p: GpiProject, module: string): number {
  if (!isPlainObject(p.revs)) p.revs = {};
  const n = revOf(p, module) + 1;
  (p.revs as Record<string, number>)[module] = n;
  return n;
}
function jsonOf(v: unknown): string { return JSON.stringify(v === undefined ? null : v); }

// Escritura de un módulo SIN sesión (Panel de Control, escrituras cruzadas
// de lectura-modificación-escritura en el mismo instante, módulos que
// arrancaron sin proyecto). "derived": el dato se deriva de otro módulo
// (p. ej. Matriz RACI reescribe los Responsables de la EDT) y no debe
// contar como edición de ese módulo -- no sube su revisión, para no
// provocar falsos conflictos en la pestaña dueña.
export function writeModule(name: string, data: unknown, opts?: { projectId?: string | null; derived?: boolean }): WriteResult {
  const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
  if (!p) return { status: "rejected", rev: null, reason: "no-active" };
  if (opts && opts.projectId != null && d.activeId !== opts.projectId) return { status: "rejected", rev: null, reason: "project-changed" };
  p.modules = isPlainObject(p.modules) ? p.modules : {};
  (p.modules as Record<string, unknown>)[name] = data;
  const rev = opts && opts.derived ? revOf(p, name) : bumpRev(p, name);
  p.meta.updatedAt = Date.now();
  return { status: save(d) ? "saved" : "pending", rev };
}
// Compatibilidad: true solo si llegó a disco (pending/rechazado -> false).
export function setModule(name: string, data: unknown, expectedProjectId?: string | null): boolean {
  return writeModule(name, data, { projectId: expectedProjectId }).status === "saved";
}

export function openSession(module: string): EditSession | null {
  const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
  if (!p) return null;
  const m = isPlainObject(p.modules) ? (p.modules as Record<string, unknown>)[module] : undefined;
  return {
    projectId: d.activeId as string, module, rev: revOf(p, module),
    snapshot: jsonOf(m), meta: JSON.parse(JSON.stringify(p.meta)) as Partial<ProjectMeta>
  };
}
// Algunos módulos normalizan lo que leen (defaults, migraciones): su primer
// serializado difiere del dato crudo aunque el usuario no haya tocado nada.
// rebaseSession() fija como "lo cargado" la serialización del propio módulo,
// para que un guardado de salida sin ediciones sea un "unchanged" real.
export function rebaseSession(session: EditSession | null, data: unknown): void {
  if (session) session.snapshot = jsonOf(data);
}
// Reintenta persistir lo que quedó solo en memoria por cuota agotada.
function flushPending(): boolean { return pendingUnsaved ? save(pendingUnsaved) : true; }
// Lo pendiente de la sesión ya está en disco: pasa a ser lo CONFIRMADO.
function confirmPending(s: EditSession): void {
  const p = db().projects[s.projectId];
  if (s.pending && s.pending.module) { s.rev = p ? revOf(p, s.module) : s.pending.module.rev; s.snapshot = s.pending.module.json; }
  if (s.pending && s.pending.meta) Object.assign(s.meta, s.pending.meta);
  delete s.pending;
}

// Guardado ATÓMICO de un módulo y sus metadatos comunes (hallazgos de la
// segunda revisión externa sobre el contrato de escritura):
//  1) "unchanged" nunca puede significar éxito mientras haya una escritura
//     pendiente: saveModule() actualizaba la foto de referencia de la sesión
//     incluso cuando devolvía "pending", así que un reintento con los mismos
//     datos se tomaba por "sin cambios" -- el botón decía «✓ Sincronizado»
//     con hasUnsavedChanges() en true y el disco con el dato viejo. Ahora la
//     sesión separa lo CONFIRMADO (rev/snapshot/meta) de lo PENDIENTE
//     (session.pending) y un reintento intenta persistir lo pendiente.
//  2) módulo y metadatos se validan ANTES de escribir y se aplican en UNA sola
//     operación: un conflicto (o rechazo) en cualquiera de los dos no escribe
//     nada -- antes el Acta conservaba el patrocinador S0 y los metadatos del
//     proyecto quedaban con S1 (versiones incompatibles del mismo dato).
function commitState(session: EditSession, hasData: boolean, data: unknown, patch: Partial<ProjectMeta> | null): WriteResult {
  const name = session.module;
  const gate = (): WriteResult | null => {
    const g = db(), gp = g.projects[session.projectId];
    if (!gp) return { status: "rejected", rev: null, reason: "no-active" };
    if (g.activeId !== session.projectId) return { status: "rejected", rev: null, reason: "project-changed" };
    return null;
  };
  const closed = gate();
  if (closed) return closed;

  // Lo pendiente de un intento anterior: se reintenta; si ya se persistió, se confirma.
  let settled = false; // lo pendiente acaba de quedar en disco en ESTA llamada -> es un "saved", no un "unchanged"
  if (session.pending && (!pendingUnsaved || flushPending())) { confirmPending(session); settled = true; }
  const pend = session.pending; // sigue definido solo si continúa sin persistirse

  // La base se lee DESPUÉS de recuperar lo pendiente (tercera revisión externa, P1):
  // flushPending() -> save() -> reconcileWithDisk() escribe una copia CONCILIADA con lo
  // que otra pestaña cambió mientras tanto, y db() ya no devuelve el objeto en memoria
  // sino esa versión de disco. Escribir sobre una base leída antes la sobrescribía
  // ("saved" con el Costos de la otra pestaña de vuelta en su valor viejo). Como la
  // conciliación también puede haber eliminado el proyecto o cambiado el activo, se
  // vuelven a validar contra la base nueva antes de aplicar la edición.
  const stale = gate();
  if (stale) return stale;
  const d = db(), p = d.projects[session.projectId];

  const mods = isPlainObject(p.modules) ? (p.modules as Record<string, unknown>) : {};
  const conflicts: string[] = [];
  let writeMod = false, json = "";
  const baseRev = pend && pend.module ? pend.module.rev : session.rev;
  if (hasData) {
    json = jsonOf(data);
    const baseJson = pend && pend.module ? pend.module.json : session.snapshot;
    if (json !== baseJson) {
      const diskRev = revOf(p, name);
      if (json === jsonOf(mods[name]) && !pendingUnsaved) { session.rev = diskRev; session.snapshot = json; } // ya idéntico a lo guardado
      else if (diskRev !== baseRev) conflicts.push(name);
      else writeMod = true;
    }
  }
  const cur = p.meta as unknown as Record<string, unknown>;
  const base = Object.assign({}, session.meta, pend && pend.meta ? pend.meta : {}) as Record<string, unknown>;
  const apply: Record<string, unknown> = {};
  if (patch) {
    Object.keys(patch).forEach((k) => {
      const v = (patch as Record<string, unknown>)[k];
      if (jsonOf(v) === jsonOf(base[k])) return;                                          // esta pestaña no lo tocó
      if (jsonOf(cur[k]) === jsonOf(v) && !pendingUnsaved) { (session.meta as Record<string, unknown>)[k] = v; return; } // ya coincide con lo guardado
      if (jsonOf(cur[k]) !== jsonOf(base[k])) { conflicts.push("meta." + k); return; }    // otra pestaña lo cambió a otra cosa
      apply[k] = v;
    });
  }
  if (conflicts.length) return { status: "conflict", rev: revOf(p, name), conflicts };
  if (!writeMod && !Object.keys(apply).length) return pend ? { status: "pending", rev: pend.module ? pend.module.rev : null } : { status: settled ? "saved" : "unchanged", rev: session.rev };

  // Una sola operación: módulo + metadatos + una sola llamada a save().
  let rev: number | null = null;
  if (writeMod) {
    p.modules = isPlainObject(p.modules) ? p.modules : {};
    (p.modules as Record<string, unknown>)[name] = data;
    rev = bumpRev(p, name);
  }
  if (Object.keys(apply).length) Object.assign(p.meta, apply);
  p.meta.updatedAt = Date.now();
  if (save(d)) {
    if (session.pending) confirmPending(session);
    if (writeMod && rev != null) { session.rev = rev; session.snapshot = json; }
    Object.assign(session.meta, apply);
    return { status: "saved", rev: writeMod ? rev : session.rev };
  }
  session.pending = {
    module: writeMod && rev != null ? { json, rev } : (pend ? pend.module : undefined),
    meta: Object.assign({}, pend && pend.meta ? pend.meta : {}, apply)
  };
  return { status: "pending", rev };
}
export function saveState(name: string, data: unknown, patch: Partial<ProjectMeta> | null, session: EditSession | null): WriteResult {
  if (!session || session.module !== name) {
    const r = writeModule(name, data);
    if (patch && r.status !== "rejected") { patchMeta(patch); if (r.status === "saved" && pendingUnsaved) return { status: "pending", rev: r.rev }; }
    return r;
  }
  return commitState(session, true, data, patch);
}
export function saveModule(name: string, data: unknown, session: EditSession | null): WriteResult {
  return saveState(name, data, null, session);
}
// Metadatos por CAMPO: solo se escriben los campos que ESTA pestaña cambió
// respecto de lo que cargó (session.meta); un campo que la pestaña no tocó
// nunca pisa un cambio hecho en otra (p. ej. renombrar el proyecto desde el
// Panel no se revierte con el guardado de salida de un módulo abierto). Si
// otra pestaña cambió ese mismo campo a otro valor, no se sobrescribe y se
// informa en "conflicts". Sin sesión: comportamiento anterior (patchMeta).
export function saveMeta(partial: Partial<ProjectMeta>, session: EditSession | null): WriteResult {
  const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
  if (!p) return { status: "rejected", rev: null, reason: "no-active" };
  if (!session) { const applied = patchMeta(partial); return { status: applied ? (pendingUnsaved ? "pending" : "saved") : "rejected", rev: null }; }
  return commitState(session, false, undefined, partial);
}
// Texto común para informar al usuario según el resultado de una escritura
// ("" cuando no hay nada que avisar): así ningún módulo muestra "Sincronizado"
// cuando el dato solo quedó en memoria o se rechazó por un conflicto.
export function describeWrite(r: WriteResult, label?: string): string {
  const what = label || "Estos datos";
  if (r.status === "saved" || r.status === "unchanged") return "";
  if (r.status === "pending") return "⚠ Cambios SIN guardar: el almacenamiento del navegador está lleno. Exporta el proyecto desde el Panel de Control para no perderlos.";
  if (r.status === "conflict") return "⚠ " + what + " cambió en otra pestaña después de abrir esta" + (r.conflicts && r.conflicts.length ? " (" + r.conflicts.join(", ") + ")" : "") + ": no se sobrescribió. Recarga esta pestaña para ver la versión actual.";
  return r.reason === "no-active" ? "⚠ No hay proyecto activo: no se guardó." : "⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.";
}

// ----- gestión de proyectos -----
export function createProject(metaOverrides?: Partial<ProjectMeta>, modules?: ProjectModules): string {
  const d = db(), id = uid();
  const projMeta = Object.assign(defaultMeta(), metaOverrides || {});
  projMeta.id = id; projMeta.createdAt = Date.now(); projMeta.updatedAt = Date.now();
  d.projects[id] = { schema: SCHEMA, meta: projMeta, modules: modules || {} };
  d.activeId = id; save(d); return id;
}
export function renameProject(id: string, name: string): void {
  const d = db();
  if (d.projects[id]) { d.projects[id].meta.name = name; d.projects[id].meta.updatedAt = Date.now(); save(d); }
}
export function duplicateProject(id: string, newName?: string): string | null {
  const d = db(), src = d.projects[id];
  if (!src) return null;
  const nid = uid(), copy = JSON.parse(JSON.stringify(src)) as GpiProject;
  copy.meta.id = nid; copy.meta.name = newName || (src.meta.name + " (copia)");
  copy.meta.createdAt = Date.now(); copy.meta.updatedAt = Date.now();
  d.projects[nid] = copy; d.activeId = nid; save(d); return nid;
}
export function deleteProject(id: string): void {
  const d = db();
  delete d.projects[id];
  if (d.activeId === id) d.activeId = Object.keys(d.projects)[0] || null;
  save(d);
}

// ----- import / export -----
export function exportActive(): GpiProject | null { return active(); }

interface DetectedTool { module: string; data: unknown; }

// Poda ciclos y referencias colgantes en un árbol WBS/OBS ({rootId,
// nodes}) ANTES de que el núcleo lo guarde -- bug real reportado por el
// usuario: un .json de EDT manipulado con un ciclo en "children" (p.
// ej. A hijo de B y B hijo de A) se aceptaba intacto, y el primer
// recorrido recursivo sobre esos datos (wbsCodes/wbsLeaves/obsNodes/
// wbsPhases/activitiesStats/pertStats -- ninguno lleva control de
// visitados) entraba en recursión infinita y desbordaba la pila apenas
// se abría un módulo o el Panel de Control con ese proyecto activo. Se
// llama en los dos puntos donde datos ajenos entran al núcleo:
// detectTool() (import de un solo módulo, "Importar .json" del Panel) y
// normalizeToProject() (import de un proyecto completo). Muta "nodes"
// en el sitio: cada nodo conserva como mucho una referencia de padre (la
// primera que se alcanza recorriendo desde rootId); cualquier otra
// referencia al mismo id -- ciclo, nodo con dos padres, o un id que ni
// siquiera existe en "nodes" -- se descarta en silencio, igual que el
// resto de las ramas de compatibilidad de este archivo (regla #3 de
// CLAUDE.md: tolerar datos viejos/corruptos sin rechazar el import
// completo).
//
// TAMBIÉN reescribe "parentId" de cada nodo alcanzado, para que quede
// coherente con el árbol ya saneado -- bug real reportado por el
// usuario (severidad media): la poda de arriba sólo tocaba "children";
// un OBS importado con un "parentId" que apunta a sí mismo (o a un
// ciclo entre varios nodos, independiente de "children") pasaba
// intacto, y obsNodes()/code() más abajo -- que sube por "parentId" con
// un `while` sin control de visitados -- quedaba en loop infinito con
// solo abrir el módulo. Como "parentId" ahora se reconstruye a partir
// de la MISMA recorrida que ya arma "children" (cada nodo recibe como
// padre exactamente aquel en cuyo "children" quedó, nunca el valor
// suelto que traía el .json), el resultado es coherente por
// construcción: subir por "parentId" desde cualquier nodo alcanzado
// siempre termina en rootId en, como mucho, la profundidad del árbol.
function sanitizeTree(rootId: unknown, nodes: unknown): void {
  if (typeof rootId !== "string" || !isPlainObject(nodes)) return; // "nodes" debe ser {id: nodo}, nunca un arreglo
  const map = nodes as Record<string, { children?: unknown; parentId?: unknown }>;
  const visited = new Set<string>();
  (function walk(id: string, parentId: string | null): void {
    const n = map[id];
    if (!n || visited.has(id)) return;
    visited.add(id);
    n.parentId = parentId;
    const kids = Array.isArray(n.children) ? (n.children as unknown[]) : [];
    const clean: string[] = [];
    kids.forEach((cid) => {
      if (typeof cid !== "string" || !map[cid] || visited.has(cid) || cid === id) return;
      clean.push(cid);
      walk(cid, id);
    });
    n.children = clean;
  })(rootId, null);
}

function detectTool(obj: any): DetectedTool | null {
  if (!obj || typeof obj !== "object") return null;
  // OBS y RACI se marcan explícitamente con "kind" porque su forma (nodes+rootId,
  // u objeto de asignaciones) podría confundirse con la de otras herramientas.
  if (obj.kind === "gpi.obs/v1" && obj.nodes && obj.rootId) {
    if (!isPlainObject(obj.nodes)) obj.nodes = {}; // "nodes": [] no debe colarse como un WBS/OBS "vacío pero array"
    sanitizeTree(obj.rootId, obj.nodes);
    return { module: "obs", data: { rootId: obj.rootId, idCounter: obj.idCounter || 1, nodes: obj.nodes } };
  }
  if (obj.kind === "gpi.raci/v1") {
    return { module: "raci", data: { assignments: obj.assignments || {} } };
  }
  if (obj.kind === "gpi.schedulePlan/v1" && obj.data) {
    return { module: "schedulePlan", data: obj.data };
  }
  if (obj.kind === "gpi.cost/v1" && obj.data) {
    return { module: "cost", data: obj.data };
  }
  if (obj.kind === "gpi.charter/v1" && obj.data) {
    return { module: "charter", data: obj.data };
  }
  if (obj.kind === "gpi.scopeStatement/v1" && obj.data) {
    return { module: "scopeStatement", data: obj.data };
  }
  if (obj.kind === "gpi.activities/v1" && obj.data) {
    // Bug real reportado por el usuario: un .json con este formato
    // reconocido (ok:true) pero con "milestones" -- los hitos sueltos o
    // colgados de un paquete, ver MilestoneItem en types.ts -- se
    // aceptaba con éxito y sin embargo los descartaba en silencio, solo
    // conservaba byLeaf/idCounter. Se valida como el resto de los
    // arreglos de este archivo: si no es un Array, se trata como vacío
    // en vez de aceptarlo tal cual (regla #3 de CLAUDE.md: tolerar
    // datos viejos/corruptos, nunca perderlos en silencio si SÍ vienen
    // bien formados).
    return {
      module: "activities",
      data: {
        byLeaf: obj.data.byLeaf || {},
        idCounter: obj.data.idCounter || 1,
        milestones: Array.isArray(obj.data.milestones) ? obj.data.milestones : []
      }
    };
  }
  if (obj.kind === "gpi.requirements/v1" && obj.data) {
    return { module: "requirements", data: obj.data };
  }
  if (obj.kind === "gpi.costEstimate/v1" && obj.data) {
    return { module: "costEstimate", data: { byActivity: obj.data.byActivity || {} } };
  }
  if (obj.kind === "gpi.pert/v1" && obj.data) {
    return { module: "pert", data: { byActivity: obj.data.byActivity || {}, inputMode: obj.data.inputMode === "pct" ? "pct" : "dias" } };
  }
  if (obj.kind === "gpi.schedule/v1" && obj.data) {
    return {
      module: "schedule", data: {
        links: Array.isArray(obj.data.links) ? obj.data.links : [],
        linkCounter: obj.data.linkCounter || 1,
        import: obj.data["import"] || null,
        baseline: obj.data.baseline || null
      }
    };
  }
  if (Array.isArray(obj.stakeholders)) {
    return {
      module: "stakeholders", data: {
        stakeholders: obj.stakeholders,
        powerWeights: obj.powerWeights || null,
        interestWeights: obj.interestWeights || null,
        idCounter: obj.idCounter || (obj.stakeholders.length + 1)
      }
    };
  }
  if (obj.nodes && obj.rootId) {
    if (!isPlainObject(obj.nodes)) obj.nodes = {}; // "nodes": [] no debe colarse como un WBS/OBS "vacío pero array"
    sanitizeTree(obj.rootId, obj.nodes);
    return { module: "wbs", data: { rootId: obj.rootId, idCounter: obj.idCounter || 1, nodes: obj.nodes } };
  }
  return null;
}

function normalizeToProject(obj: any): GpiProject {
  if (obj && obj.schema === SCHEMA && obj.meta) {
    // ya es un proyecto completo -- pero "modules" puede faltar o venir
    // corrupto (bug real reportado por el usuario: un .json con schema y
    // meta reconocidos, sin "modules", se aceptaba tal cual y cada
    // GPI.getModule(...) posterior -- docenas de sitios en los 13
    // módulos y en Panel de Control -- reventaba con TypeError al leer
    // sobre "modules" undefined) y su WBS/OBS pueden traer los mismos
    // ciclos que detectTool() sanea para el import de un solo módulo.
    const proj = obj as GpiProject;
    if (!isPlainObject(proj.modules)) proj.modules = {};
    const wbsMod = proj.modules.wbs as WbsModule | undefined;
    if (wbsMod && wbsMod.nodes) {
      if (!isPlainObject(wbsMod.nodes)) wbsMod.nodes = {}; // "nodes": [] no debe colarse como un WBS "vacío pero array"
      sanitizeTree(wbsMod.rootId, wbsMod.nodes);
    }
    const obsMod = proj.modules.obs as ObsModule | undefined;
    if (obsMod && obsMod.nodes) {
      if (!isPlainObject(obsMod.nodes)) obsMod.nodes = {};
      sanitizeTree(obsMod.rootId, obsMod.nodes);
    }
    return proj;
  }
  // envolver exportación de herramienta
  const projMeta = Object.assign(defaultMeta(), {
    name: (obj && obj.title) || "Proyecto importado",
    course: (obj && obj.course) || undefined
  });
  const modules: ProjectModules = {};
  const det = detectTool(obj);
  if (det) (modules as Record<string, unknown>)[det.module] = det.data;
  return { schema: SCHEMA, meta: projMeta, modules };
}

export function importProject(obj: any, activate?: boolean): string {
  const d = db();
  const proj = normalizeToProject(obj);
  const id = proj.meta.id && !d.projects[proj.meta.id] ? proj.meta.id : uid();
  proj.meta.id = id; proj.meta.updatedAt = Date.now();
  d.projects[id] = proj;
  if (activate !== false) d.activeId = id;
  save(d); return id;
}

// Fusiona una exportación de herramienta en el módulo correspondiente del proyecto activo
export function ingestToolExport(obj: any): { ok: boolean; reason?: string; module?: string } {
  const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
  if (!p) return { ok: false, reason: "no-active" };
  const det = detectTool(obj);
  if (!det) return { ok: false, reason: "unknown-format" };
  p.modules = isPlainObject(p.modules) ? p.modules : {};
  (p.modules as Record<string, unknown>)[det.module] = det.data;
  bumpRev(p, det.module); // una pestaña con este módulo abierto debe ver un conflicto, no pisar lo importado
  // completar metadatos si vienen y están vacíos
  if (obj.title && (!p.meta.name || p.meta.name === "Proyecto sin título")) p.meta.name = obj.title;
  if (obj.course && !p.meta.course) p.meta.course = obj.course;
  p.meta.updatedAt = Date.now(); save(d);
  return { ok: true, module: det.module };
}

export function onChange(cb: () => void): void {
  window.addEventListener("storage", (e: StorageEvent) => { if (e.key === KEY) cb(); });
}

// =================================================================
// ----- utilidades de dominio compartidas (GPI.util) -----
// =================================================================

export interface WbsRollup { cost: number; count: number; leafCount: number; minStart: string; maxEnd: string; }

// Rollup de costo/duración de un WBS a partir de {nodes, rootId}
export function wbsRollup(wbs?: WbsModule | null): WbsRollup {
  if (!wbs || !wbs.nodes || !wbs.rootId) return { cost: 0, count: 0, leafCount: 0, minStart: "", maxEnd: "" };
  const nodes = wbs.nodes;
  let cost = 0, count = 0, leafCount = 0, minStart = "", maxEnd = "";
  Object.keys(nodes).forEach((id) => {
    if (id === wbs.rootId) return;
    const n = nodes[id]; count++;
    const isLeaf = !n.children || n.children.length === 0;
    if (isLeaf) { cost += Number(n.cost) || 0; leafCount++; }
    if (n.start && (!minStart || n.start < minStart)) minStart = n.start;
    if (n.end && (!maxEnd || n.end > maxEnd)) maxEnd = n.end;
  });
  return { cost, count, leafCount, minStart, maxEnd };
}

// Nombres de responsables usados en el WBS
export function wbsResources(wbs?: WbsModule | null): string[] {
  if (!wbs || !wbs.nodes) return [];
  const set: Record<string, boolean> = {};
  Object.keys(wbs.nodes).forEach((id) => {
    const r = (wbs.nodes[id].resource || "").trim();
    if (r) set[r] = true;
  });
  return Object.keys(set);
}

// Códigos jerárquicos "1.2.3" por nodo, en el mismo orden que usa WBS Builder.
export function wbsCodes(wbs?: WbsModule | null): Record<string, string> {
  const codes: Record<string, string> = {};
  if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return codes;
  const nodes = wbs.nodes;
  function walk(id: string, prefix: string): void {
    codes[id] = prefix;
    (nodes[id].children || []).forEach((cid, i) => {
      if (nodes[cid]) walk(cid, prefix ? prefix + "." + (i + 1) : String(i + 1));
    });
  }
  (nodes[wbs.rootId].children || []).forEach((cid, i) => { if (nodes[cid]) walk(cid, String(i + 1)); });
  codes[wbs.rootId] = "0";
  return codes;
}

export interface WbsLeafRow { id: string; code: string; name: string; resource: string; notes: string; }

// Paquetes de trabajo (nodos hoja) del WBS, en orden de árbol, con su código.
// Estos son los que se usan como FILAS de la matriz RACI.
export function wbsLeaves(wbs?: WbsModule | null): WbsLeafRow[] {
  if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return [];
  const nodes = wbs.nodes, codes = wbsCodes(wbs), out: WbsLeafRow[] = [], rootId = wbs.rootId;
  function walk(id: string): void {
    const n = nodes[id]; if (!n) return;
    const kids = n.children || [];
    if (id !== rootId && kids.length === 0) {
      out.push({ id, code: codes[id] || "", name: n.name || "", resource: n.resource || "", notes: n.notes || "" });
    }
    kids.forEach(walk);
  }
  walk(wbs.rootId);
  return out;
}

export interface ObsNodeRow { id: string; code: string; role: string; person: string; type: string; email: string; parentId?: string | null; }

// Nodos del OBS (excluyendo la raíz), en orden de árbol, con su código jerárquico.
// Estos son los que se usan como COLUMNAS de la matriz RACI.
export function obsNodes(obs?: ObsModule | null): ObsNodeRow[] {
  if (!obs || !obs.nodes || !obs.rootId || !obs.nodes[obs.rootId]) return [];
  const nodes = obs.nodes, out: ObsNodeRow[] = [], rootId = obs.rootId;
  function code(id: string): string {
    const parts: number[] = [];
    let n: ObsNode | undefined = nodes[id];
    // Defensa en profundidad: sanitizeTree() ya reconstruye "parentId"
    // coherente con "children" al importar, así que en el flujo normal
    // esto nunca debería hacer falta -- pero si un "parentId" cíclico
    // llegara a nodes por otra vía (dato viejo de antes de ese fix,
    // localStorage tocado a mano), un Set de visitados evita el loop
    // infinito reportado por el usuario (un nodo cuyo parentId apunta a
    // sí mismo colgaba este recorrido con solo abrir el módulo).
    const seen = new Set<string>();
    while (n && n.parentId && !seen.has(n.id as string)) {
      seen.add(n.id as string);
      const siblings = (nodes[n.parentId] || {}).children || [];
      parts.unshift(siblings.indexOf(n.id as string) + 1);
      n = nodes[n.parentId];
    }
    return parts.join(".");
  }
  function walk(id: string): void {
    const n = nodes[id]; if (!n) return;
    if (id !== rootId) {
      out.push({ id, code: code(id), role: n.role || "", person: n.person || "", type: n.type || "", email: n.email || "", parentId: n.parentId });
    }
    (n.children || []).forEach(walk);
  }
  walk(obs.rootId);
  return out;
}

// Etiqueta a mostrar para un nodo OBS: prioriza la persona asignada, si no hay, el rol.
export function obsLabel(obsNode?: ObsNodeRow | ObsNode | null): string {
  if (!obsNode) return "";
  return (obsNode.person && obsNode.person.trim()) || (obsNode.role && obsNode.role.trim()) || "";
}

// Devuelve, para un paquete de trabajo (id de hoja del WBS), los ids de nodos OBS
// marcados como "R" (Responsable) en la matriz RACI.
export function raciResponsibleIds(raci: RaciModule | null | undefined, leafId: string): string[] {
  const cell = raci && raci.assignments && raci.assignments[leafId];
  if (!cell) return [];
  return Object.keys(cell).filter((roleId) => cell[roleId] === "R");
}

// Núcleo de la integración RACI → WBS: devuelve un WBS clonado donde el campo
// "resource" de cada paquete de trabajo (hoja) que tiene al menos un "R" en la
// matriz RACI queda fijado a la(s) persona(s)/rol(es) responsables según el OBS.
// Los paquetes SIN asignación "R" en RACI conservan su valor de "resource" actual
// (permite seguir usando el WBS de forma independiente antes de completar la RACI).
export function applyRaciToWbs(wbs?: WbsModule | null, raci?: RaciModule | null, obs?: ObsModule | null): WbsModule | null | undefined {
  if (!wbs || !wbs.nodes) return wbs;
  const out = JSON.parse(JSON.stringify(wbs)) as WbsModule;
  if (!raci || !raci.assignments || !obs || !obs.nodes) return out;
  const obsById = obs.nodes;
  Object.keys(out.nodes).forEach((leafId) => {
    const ids = raciResponsibleIds(raci, leafId);
    if (!ids.length) return; // sin "R" asignado: no se toca el valor existente
    const labels = ids.map((rid) => obsLabel(obsById[rid])).filter(Boolean);
    if (labels.length) out.nodes[leafId].resource = labels.join(", ");
  });
  return out;
}

// Núcleo de la integración Cronograma (CPM) → WBS: análogo a applyRaciToWbs,
// pero para fecha inicio/fin en vez de responsable. Devuelve un WBS clonado
// donde las fechas de cada paquete de trabajo (hoja) que tiene actividades
// definidas Y una red calculable (sin ciclos, con fecha de inicio del
// proyecto en Metadatos) quedan fijadas a las fechas REALES que calcula el
// CPM -- misma duración determinística (Metrado/Rendimiento) que usa
// Cronograma_CPM.html en su modo por defecto ("det"), que es además el único
// modo persistido (el alterno "pert" es una preferencia de sesión, nunca se
// guarda). Los paquetes sin actividades, o mientras el CPM no pueda
// calcularse (ciclo, o el proyecto no tiene fecha de inicio), conservan su
// fecha manual/estimada actual: el WBS sigue siendo la fuente de la verdad
// para esos casos. `lockedLeafIds` son los paquetes que quedaron fijados, para
// que la UI del WBS los muestre de solo lectura (mismo patrón que RACI).
export interface WbsScheduleSync { wbs: WbsModule; lockedLeafIds: string[]; }

export function applyScheduleToWbs(
  wbs?: WbsModule | null,
  activities?: ActivitiesModule | null,
  pert?: PertModule | null,
  schedule?: ScheduleModule | null,
  schedulePlan?: SchedulePlanModule | null,
  meta?: ProjectMeta | null
): WbsScheduleSync {
  const out = wbs ? (JSON.parse(JSON.stringify(wbs)) as WbsModule) : (wbs as unknown as WbsModule);
  if (!wbs || !wbs.nodes || !meta || !meta.startDate) return { wbs: out, lockedLeafIds: [] };
  const byLeaf = (activities && activities.byLeaf) || {};
  const nodes: CpmNode[] = pertStats(pert || null, activities || null, wbs).rows.map((r) => ({ id: r.id, dur: r.dur || 0 }));
  if (!nodes.length) return { wbs: out, lockedLeafIds: [] };
  const links = (schedule && Array.isArray(schedule.links)) ? schedule.links : [];
  const result = cpm(nodes, links, projectCalendar(schedulePlan), { startDate: meta.startDate });
  if (!result.ok) return { wbs: out, lockedLeafIds: [] };
  const lockedLeafIds: string[] = [];
  Object.keys(byLeaf).forEach((leafId) => {
    const acts = byLeaf[leafId];
    if (!acts || !acts.length || !out.nodes[leafId]) return;
    let start: string | null = null, end: string | null = null;
    acts.forEach((a) => {
      const row = result.rows[a.id];
      if (!row || !row.startDate || !row.finishDate) return;
      if (!start || row.startDate < start) start = row.startDate;
      if (!end || row.finishDate > end) end = row.finishDate;
    });
    if (start && end) { out.nodes[leafId].start = start; out.nodes[leafId].end = end; lockedLeafIds.push(leafId); }
  });
  return { wbs: out, lockedLeafIds };
}

// Une la EDT con las actividades de "Definir las Actividades" y con el
// precio unitario de "Estimar los Costos" -- el costo vive a nivel de
// ACTIVIDAD (el último nivel de planificación), no de paquete: un paquete
// no tiene Unidad/Cantidad propias, son de sus actividades. El subtotal
// NUNCA se persiste -- se recalcula siempre como Cantidad × Precio unitario,
// mismo principio que la Duración en Actividades/PERT. Actividades sin
// precio unitario cargado devuelven `unitPrice`/`subtotal` en null.
export interface CostEstimateRow {
  activityId: string; leafId: string; code: string; leafName: string;
  name: string; unit: string; qty: number | null; unitPrice: number | null; subtotal: number | null;
}

function numOrNull(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

export function costEstimateRows(estimate?: CostEstimateModule | null, activities?: ActivitiesModule | null, wbs?: WbsModule | null): CostEstimateRow[] {
  const byLeaf = (activities && activities.byLeaf) || {};
  const byActivity = (estimate && estimate.byActivity) || {};
  const out: CostEstimateRow[] = [];
  wbsLeaves(wbs).forEach((l) => {
    (byLeaf[l.id] || []).forEach((a) => {
      const qty = numOrNull(a.qty);
      const unitPrice = numOrNull(byActivity[a.id]);
      const subtotal = (qty != null && unitPrice != null) ? qty * unitPrice : null;
      out.push({ activityId: a.id, leafId: l.id, code: l.code, leafName: l.name, name: a.name || "", unit: a.unit || "", qty, unitPrice, subtotal });
    });
  });
  return out;
}

// Total estimado del proyecto (suma de subtotales válidos) — lo consume
// Planificar la Gestión Financiera como fuente alterna a wbsRollup(wbs).cost.
export function costEstimateTotal(estimate?: CostEstimateModule | null, activities?: ActivitiesModule | null, wbs?: WbsModule | null): number {
  return costEstimateRows(estimate, activities, wbs).reduce((s, r) => s + (r.subtotal || 0), 0);
}

export interface WbsCostEstimateSync { wbs: WbsModule; lockedLeafIds: string[]; }

// Núcleo de la integración Estimar los Costos → WBS: análogo a
// applyScheduleToWbs, pero para Costo en vez de fechas. Devuelve un WBS
// clonado donde el costo de cada paquete (hoja) queda fijado a la suma de
// los subtotales de SUS actividades -- pero solo si el paquete tiene al
// menos una actividad y TODAS sus actividades tienen un subtotal válido
// (Cantidad y Precio unitario > 0): un estimado parcial no bloquea el campo,
// para no aparentar un costo real que en realidad está incompleto. Los
// paquetes sin ese estimado completo conservan su costo manual/estimado
// actual -- el WBS sigue siendo la fuente de la verdad para esos casos.
export function applyCostEstimateToWbs(wbs?: WbsModule | null, estimate?: CostEstimateModule | null, activities?: ActivitiesModule | null): WbsCostEstimateSync {
  const out = wbs ? (JSON.parse(JSON.stringify(wbs)) as WbsModule) : (wbs as unknown as WbsModule);
  if (!wbs || !wbs.nodes || !activities || !activities.byLeaf) return { wbs: out, lockedLeafIds: [] };
  const rows = costEstimateRows(estimate, activities, wbs);
  const byLeaf: Record<string, CostEstimateRow[]> = {};
  rows.forEach((r) => { (byLeaf[r.leafId] || (byLeaf[r.leafId] = [])).push(r); });
  const lockedLeafIds: string[] = [];
  Object.keys(byLeaf).forEach((leafId) => {
    const leafRows = byLeaf[leafId];
    if (!leafRows.length || !out.nodes[leafId]) return;
    const complete = leafRows.every((r) => r.subtotal != null && r.subtotal > 0);
    if (!complete) return;
    out.nodes[leafId].cost = leafRows.reduce((s, r) => s + (r.subtotal || 0), 0);
    lockedLeafIds.push(leafId);
  });
  return { wbs: out, lockedLeafIds };
}

export interface WbsPhaseRow { id: string; name: string; start: string; end: string; cost: number; }

// Rollup por FASE (hijos directos de la raíz del WBS): a diferencia de wbsRollup
// (que resume todo el árbol), esta función recorre cada rama de forma independiente
// para obtener el costo y el rango de fechas propio de cada fase. La usa el Plan de
// Gestión del Cronograma para sugerir hitos ("fin de fase") a partir de la EDT real.
export function wbsPhases(wbs?: WbsModule | null): WbsPhaseRow[] {
  if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return [];
  const nodes = wbs.nodes;
  function subtreeRollup(id: string): { cost: number; start: string; end: string } {
    let cost = 0, minStart = "", maxEnd = "";
    function walk(nid: string): void {
      const n = nodes[nid]; if (!n) return;
      const kids = n.children || [];
      if (kids.length === 0) cost += Number(n.cost) || 0;
      if (n.start && (!minStart || n.start < minStart)) minStart = n.start;
      if (n.end && (!maxEnd || n.end > maxEnd)) maxEnd = n.end;
      kids.forEach(walk);
    }
    walk(id);
    return { cost, start: minStart, end: maxEnd };
  }
  const root = nodes[wbs.rootId];
  return (root.children || []).map((id) => {
    const n = nodes[id]; if (!n) return null;
    const r = subtreeRollup(id);
    return { id, name: n.name || "", start: r.start, end: r.end, cost: r.cost };
  }).filter((x): x is WbsPhaseRow => x !== null);
}

export interface ActivitiesStats {
  total: number; leaves: number; covered: number;
  uncovered: Array<{ id: string; name: string; code: string }>;
  orphans: number; pct: number;
}

// ---------------------------------------------------------------
// Estadísticas del módulo "Definir las Actividades" contra la EDT.
//   act -> módulo "activities" ({byLeaf, idCounter})
//   wbs -> módulo "wbs" ({nodes, rootId})
// Devuelve el total de actividades, la cobertura de paquetes de
// trabajo (hojas de la EDT con al menos una actividad) y las
// huérfanas: actividades cuyo paquete ya no existe o dejó de ser hoja.
// ---------------------------------------------------------------
export function activitiesStats(act?: ActivitiesModule | null, wbs?: WbsModule | null): ActivitiesStats {
  const a = act || ({} as Partial<ActivitiesModule>);
  const byLeaf = a.byLeaf || {};
  const leaves: Array<{ id: string; name: string; code: string }> = [];
  if (wbs && wbs.nodes && wbs.rootId && wbs.nodes[wbs.rootId]) {
    (function walk(id: string, code: string): void {
      const n = wbs.nodes[id]; if (!n) return;
      const kids = n.children || [];
      if (id !== wbs.rootId && !kids.length) leaves.push({ id, name: n.name || "", code });
      kids.forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1)));
    })(wbs.rootId, "");
  }
  const leafIds: Record<string, boolean> = {};
  leaves.forEach((l) => { leafIds[l.id] = true; });
  let total = 0, orphans = 0, covered = 0;
  const uncovered: Array<{ id: string; name: string; code: string }> = [];
  Object.keys(byLeaf).forEach((k) => {
    const arr = byLeaf[k] || [];
    if (leafIds[k]) total += arr.length; else orphans += arr.length;
  });
  leaves.forEach((l) => {
    if ((byLeaf[l.id] || []).length) covered++; else uncovered.push(l);
  });
  return {
    total, leaves: leaves.length, covered,
    uncovered, orphans,
    pct: leaves.length ? Math.round((covered / leaves.length) * 100) : 0
  };
}

export interface PertRow {
  id: string; code: string; name: string; dur: number | null; mAuto: boolean;
  o: number | null; m: number | null; p: number | null;
  te: number | null; sd: number | null; variance: number | null;
  complete: boolean; valid: boolean;
}
export interface PertStats {
  rows: PertRow[]; total: number; complete: number; invalid: number; orphans: number;
  sumTe: number; sumVar: number; pct: number;
}

function tolNum(v: unknown): number {
  // acepta coma decimal y separadores de miles, como Excel
  if (v === "" || v == null) return NaN;
  let s = String(v).trim().replace(/[\s ]/g, "");
  const hasDot = s.indexOf(".") !== -1, hasComma = s.indexOf(",") !== -1;
  if (hasDot && hasComma) {
    s = s.lastIndexOf(".") > s.lastIndexOf(",") ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(/,/g, ".");
  } else if (hasComma) {
    const p = s.split(",");
    const mil = p.length >= 2 && p.slice(1).every((x) => x.length === 3 && /^\d+$/.test(x));
    s = mil ? p.join("") : p.join(".");
  }
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

// ---------------------------------------------------------------
// Análisis PERT por actividad, contra el módulo "activities".
//   pert -> módulo "pert" ({byActivity, inputMode})
//   act  -> módulo "activities" · wbs -> módulo "wbs" (orden y códigos)
// La duración base replica la fórmula del módulo Definir las Actividades:
// Dur = Met/(#Eq×R) redondeada al entero superior; la M en modo automático
// sigue a esa Dur. O y P se interpretan según inputMode ("dias" o "pct",
// porcentaje de M). Devuelve la lista por actividad con TE, σ y σ², más
// los totales simples y contadores para el Panel.
// ---------------------------------------------------------------
export function pertStats(pert?: PertModule | null, act?: ActivitiesModule | null, wbs?: WbsModule | null): PertStats {
  const pe0 = pert || ({} as Partial<PertModule>);
  const a = act || ({} as Partial<ActivitiesModule>);
  const by = pe0.byActivity || {}, mode: "dias" | "pct" = pe0.inputMode === "pct" ? "pct" : "dias";
  const byLeaf = a.byLeaf || {};

  function durOf(av: ActivityItem): number | null {
    const met = tolNum(av.qty), r = tolNum(av.perf);
    let eq = tolNum(av.teams);
    if (!isFinite(met) || met <= 0 || !isFinite(r) || r <= 0) return null;
    if (!isFinite(eq) || eq < 1) eq = 1;
    return Math.ceil(met / (eq * r));
  }

  // actividades en el orden de la EDT
  const list: Array<{ id: string; code: string; name: string; act: ActivityItem }> = [];
  if (wbs && wbs.nodes && wbs.rootId && wbs.nodes[wbs.rootId]) {
    (function walk(id: string, code: string): void {
      const n = wbs.nodes[id]; if (!n) return;
      const kids = n.children || [];
      if (id !== wbs.rootId && !kids.length) {
        (byLeaf[id] || []).forEach((av, i) => {
          list.push({ id: av.id, code: code + "." + (i + 1), name: av.name || "", act: av });
        });
      }
      kids.forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1)));
    })(wbs.rootId, "");
  }

  let complete = 0, invalid = 0, sumTe = 0, sumVar = 0, orphans = 0;
  const known: Record<string, boolean> = {};
  const rows: PertRow[] = list.map((it) => {
    known[it.id] = true;
    const pe = by[it.id] || {};
    const dur = durOf(it.act);
    const m = (pe.mAuto === false && isFinite(tolNum(pe.m))) ? tolNum(pe.m) : dur; // M automática sigue a la Dur
    const oRaw = tolNum(pe.o), pRaw = tolNum(pe.p);
    let o: number | null = null, p: number | null = null;
    if (isFinite(oRaw)) o = mode === "pct" ? (m != null ? oRaw / 100 * m : null) : oRaw;
    if (isFinite(pRaw)) p = mode === "pct" ? (m != null ? pRaw / 100 * m : null) : pRaw;
    const ok = o != null && m != null && p != null && o > 0;
    const valid = ok && (o as number) <= (m as number) && (m as number) <= (p as number);
    let te: number | null = null, sd: number | null = null, va: number | null = null;
    if (ok) { te = ((o as number) + 4 * (m as number) + (p as number)) / 6; sd = ((p as number) - (o as number)) / 6; va = sd * sd; }
    if (ok) { complete++; if (!valid) invalid++; else { sumTe += te as number; sumVar += va as number; } }
    return { id: it.id, code: it.code, name: it.name, dur, mAuto: pe.mAuto !== false, o, m, p, te, sd, variance: va, complete: ok, valid: !!valid };
  });
  Object.keys(by).forEach((k) => { if (!known[k]) orphans++; });
  return {
    rows, total: rows.length, complete, invalid, orphans, sumTe, sumVar,
    pct: rows.length ? Math.round(complete / rows.length * 100) : 0
  };
}

export interface PertProbabilityResult { te: number; variance: number; sigma: number; z: number; prob: number; }

// ---------------------------------------------------------------
// Probabilidad PERT de cumplir un plazo — usada por Cronograma/CPM: cuando
// existe la ruta crítica, se le pasa el TE total y la varianza total de las
// actividades de esa ruta y el plazo objetivo.
//   Z = (objetivo − ΣTE) / √(Σσ²)  ·  prob = Φ(Z) (CDF normal estándar)
// Aproximación de Abramowitz & Stegun 26.2.17 (error < 7.5e−8).
// ---------------------------------------------------------------
export function pertProbability(sumTe: number, sumVar: number, targetDays: number): PertProbabilityResult | null {
  const te = Number(sumTe), va = Number(sumVar), t = Number(targetDays);
  if (!isFinite(te) || !isFinite(va) || va <= 0 || !isFinite(t)) return null;
  const sigma = Math.sqrt(va);
  const z = (t - te) / sigma;
  const x = Math.abs(z), k = 1 / (1 + 0.2316419 * x);
  const poly = k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
  const phi = 1 - (Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)) * poly;
  const prob = z >= 0 ? phi : 1 - phi;
  return { te, variance: va, sigma, z, prob };
}

function pad2(n: number): string { n = Number(n) || 0; return (n < 10 ? "0" : "") + n; }

interface AuditItem { id: string; cat: string; label: string; ok: boolean; }
export interface AuditResult {
  items: AuditItem[]; okCount: number; total: number; pct: number;
  state: "verde" | "ambar" | "rojo";
  categories: Record<string, { total: number; ok: number }>;
}

function buildAuditResult(items: AuditItem[]): AuditResult {
  const okCount = items.filter((i) => i.ok).length;
  const total = items.length;
  const pct = total ? Math.round((okCount / total) * 100) : 0;
  const state: AuditResult["state"] = pct >= 80 ? "verde" : (pct >= 50 ? "ambar" : "rojo");
  const cats: Record<string, { total: number; ok: number }> = {};
  items.forEach((i) => {
    cats[i.cat] = cats[i.cat] || { total: 0, ok: 0 };
    cats[i.cat].total++; if (i.ok) cats[i.cat].ok++;
  });
  return { items, okCount, total, pct, state, categories: cats };
}

function nz(s: unknown): boolean { return !!(s && String(s).trim()); }

// ---------------------------------------------------------------
// Auditoría de completitud del Acta de Constitución del Proyecto.
// Checklist lineal (no un sistema de restricciones duras): cada elemento
// presente suma, y el estado se deriva del porcentaje (>=80 verde, >=50
// ámbar, si no rojo).
//   ch -> el objeto del módulo "charter" (puede venir incompleto o null)
// ---------------------------------------------------------------
export function charterAudit(ch?: CharterModule | null): AuditResult {
  const c = ch || ({} as CharterModule);
  const id = c.identification || {}, bud = c.budget || {}, ap = c.approval || {}, bc = c.businessCase || {};
  const objs = c.objectives || [], reqs = c.requirements || [], dels = c.deliverables || [],
    mil = c.milestones || [], risks = c.risks || [], asum = c.assumptions || [],
    cons = c.constraints || [], excl = c.exclusions || [], sh = c.stakeholders || [],
    pre = c.preAssignedResources || [], areq = c.approvalRequirements || [],
    exitc = c.exitCriteria || [], spon = c.sponsors || [];
  function hasObj(dim: string): boolean {
    return objs.some((o) => o && o.dim === dim && nz(o.objective) && nz(o.criteria));
  }

  const items: AuditItem[] = [
    { id: "roles", cat: "Identificación", label: "Patrocinador y Director de Proyecto declarados", ok: nz(id.sponsor) && nz(id.manager) },
    { id: "contexto", cat: "Identificación", label: "Cliente y fecha de preparación registrados", ok: nz(id.client) && nz(id.preparedDate) },
    { id: "autoridad", cat: "Identificación", label: "Nivel de autoridad del Director de Proyecto definido", ok: nz(id.authority) },
    { id: "enfoque", cat: "Identificación", label: "Enfoque de desarrollo declarado (predictivo / ágil / híbrido)", ok: nz(id.approach) },

    { id: "proposito", cat: "Justificación y alcance", label: "Propósito o justificación del proyecto", ok: nz(c.purpose) },
    { id: "casonegocio", cat: "Justificación y alcance", label: "Caso de negocio: justificación económica e inversión estimada", ok: nz(bc.justification) && nz(bc.investment) },
    { id: "descripcion", cat: "Justificación y alcance", label: "Descripción de alto nivel del proyecto", ok: nz(c.description) },
    { id: "limites", cat: "Justificación y alcance", label: "Límites del proyecto declarados", ok: nz(c.boundaries) },
    { id: "requisitos", cat: "Justificación y alcance", label: "Requisitos de alto nivel registrados", ok: reqs.length > 0 },
    { id: "entregables", cat: "Justificación y alcance", label: "Entregables clave registrados", ok: dels.length > 0 },

    { id: "objetivos", cat: "Objetivos e hitos", label: "Objetivos con criterio de éxito en alcance, cronograma y costo", ok: hasObj("Alcance") && hasObj("Cronograma") && hasObj("Costo") },
    { id: "hitos", cat: "Objetivos e hitos", label: "Al menos un hito del resumen con fecha", ok: mil.some((m) => m && nz(m.name) && nz(m.date)) },
    { id: "presupuesto", cat: "Objetivos e hitos", label: "Presupuesto preasignado mayor que cero", ok: Number(bud.amount) > 0 },

    { id: "riesgos", cat: "Riesgos, supuestos y restricciones", label: "Riesgo general del proyecto (alto nivel) registrado", ok: risks.length > 0 },
    { id: "supuestos", cat: "Riesgos, supuestos y restricciones", label: "Supuestos del proyecto registrados", ok: asum.length > 0 },
    { id: "restricciones", cat: "Riesgos, supuestos y restricciones", label: "Restricciones del proyecto registradas", ok: cons.length > 0 },
    { id: "exclusiones", cat: "Riesgos, supuestos y restricciones", label: "Exclusiones (fuera del alcance) registradas", ok: excl.length > 0 },

    { id: "interesados", cat: "Interesados y autorización", label: "Interesados clave identificados en el acta", ok: sh.length > 0 },
    { id: "patrocinadores", cat: "Interesados y autorización", label: "Patrocinadores que autorizan el proyecto registrados", ok: spon.some((s) => s && nz(s.name)) },
    { id: "aprobacion", cat: "Interesados y autorización", label: "Acta con firmas de Patrocinador y Director de Proyecto", ok: nz(ap.sponsorName) && nz(ap.managerName) },

    { id: "recursospre", cat: "Recursos y aprobación", label: "Recursos preasignados al proyecto declarados", ok: pre.length > 0 },
    { id: "reqaprob", cat: "Recursos y aprobación", label: "Requisitos de aprobación con responsable definido", ok: areq.some((r) => r && nz(r.item) && nz(r.approver)) },
    { id: "criteriossalida", cat: "Recursos y aprobación", label: "Criterios de salida / cierre del proyecto registrados", ok: exitc.length > 0 }
  ];

  return buildAuditResult(items);
}

// ---------------------------------------------------------------
// Auditoría de completitud del Plan de Gestión del Cronograma.
// Opera como el checklist del Apéndice de la RP 38R-06 de AACE International
// ("Documenting the Schedule Basis"): una lista de elementos que deberían estar
// presentes en la base del cronograma, agrupados por tema. No es un sistema de
// restricciones duras como raciAudit — aquí cada elemento faltante resta puntaje
// de forma lineal, porque se trata de la completitud de un documento de
// planificación, no de una validación estructural de una matriz.
//   sp -> el objeto del módulo "schedulePlan" (puede venir incompleto o null)
// ---------------------------------------------------------------
export function schedulePlanAudit(sp?: SchedulePlanModule | null): AuditResult {
  const s = sp || ({} as SchedulePlanModule);
  const m = s.methodology || {}, cod = s.codification || {}, cal: SchedulePlanCalendar = s.calendar || {},
    dur = s.durationEstimating || {}, cp = s.criticalPath || {}, pm = s.performanceMeasurement || {},
    res = s.scheduleReserve || {}, cc = s.changeControl || {}, ap = s.approval || {};
  const thr = s.controlThresholds || [], mil = s.milestones || [], roles = s.roles || [],
    rep = s.reportingFormats || [], asum = s.assumptions || [], excl = s.exclusions || [];

  const items: AuditItem[] = [
    { id: "enfoque", cat: "Metodología y EDT", label: "Enfoque de programación y herramienta declarados", ok: nz(m.approach) && nz(m.tool) },
    { id: "detalle", cat: "Metodología y EDT", label: "Unidad de medida, y Nivel + Clase de cronograma (RP 27R-03)", ok: nz(m.unit) && ((nz(m.scheduleLevel) && nz(m.scheduleClass)) || nz(m.levelOfDetail)) },
    { id: "codificacion", cat: "Metodología y EDT", label: "Regla de codificación de actividades vinculada a la EDT", ok: nz(cod.rule) },

    { id: "calendario", cat: "Calendario y duraciones", label: "Calendario del proyecto (días laborables y horas/día)", ok: Array.isArray(cal.workDays) && cal.workDays.length > 0 && Number(cal.hoursPerDay) > 0 },
    { id: "feriados", cat: "Calendario y duraciones", label: "Excepciones de calendario registradas (feriados/paradas)", ok: Array.isArray(cal.holidays) && cal.holidays.length > 0 },
    { id: "duraciones", cat: "Calendario y duraciones", label: "Método de estimación de duraciones declarado", ok: nz(dur.method) },

    { id: "umbrales", cat: "Control y desempeño", label: "Umbrales de control (SV/SPI u otros) definidos", ok: thr.length > 0 },
    { id: "medicion", cat: "Control y desempeño", label: "Regla de medición del desempeño (EVM) declarada", ok: nz(pm.method) },
    { id: "frecuencia", cat: "Control y desempeño", label: "Frecuencia de actualización del cronograma definida", ok: nz(pm.updateFrequency) },
    { id: "rutacritica", cat: "Control y desempeño", label: "Metodología de ruta crítica y umbral de ruta casi crítica", ok: nz(cp.methodology) && Number(cp.nearCriticalThresholdDays) > 0 },

    { id: "hitos", cat: "Hitos y reserva", label: "Al menos un hito clave registrado", ok: mil.length > 0 },
    { id: "reserva", cat: "Hitos y reserva", label: "Reserva de contingencia de cronograma cuantificada y justificada", ok: Number(res.pct) > 0 && nz(res.basisText) },
    { id: "supuestos", cat: "Hitos y reserva", label: "Supuestos del cronograma registrados", ok: asum.length > 0 },
    { id: "exclusiones", cat: "Hitos y reserva", label: "Exclusiones del cronograma registradas", ok: excl.length > 0 },

    { id: "roles", cat: "Gobernanza", label: "Roles y responsabilidades de la programación definidos", ok: roles.length > 0 },
    { id: "reportes", cat: "Gobernanza", label: "Formatos y frecuencia de reporte definidos", ok: rep.length > 0 },
    { id: "cambios", cat: "Gobernanza", label: "Proceso y umbral de control de cambios/rebaselinado", ok: nz(cc.process) && Number(cc.baselineChangeThresholdPct) > 0 },
    { id: "aprobacion", cat: "Gobernanza", label: "Plan con elaborador y aprobador identificados", ok: nz(ap.preparedBy) && nz(ap.approvedBy) }
  ];

  return buildAuditResult(items);
}

export interface RaciCoverage {
  total: number; withR: number; withoutR: WbsLeafRow[]; withoutA: WbsLeafRow[]; multiA: WbsLeafRow[];
}

// Resumen de cobertura RACI contra los paquetes de trabajo del WBS activo:
// usado por el Panel de Control y por la propia herramienta RACI para validar
// buenas prácticas (exactamente un "A" y al menos un "R" por fila).
export function raciCoverage(raci?: RaciModule | null, wbs?: WbsModule | null): RaciCoverage {
  const leaves = wbsLeaves(wbs);
  const assignments = (raci && raci.assignments) || {};
  const total = leaves.length;
  let withR = 0;
  const withoutR: WbsLeafRow[] = [], withoutA: WbsLeafRow[] = [], multiA: WbsLeafRow[] = [];
  leaves.forEach((leaf) => {
    const cell = assignments[leaf.id] || {};
    let rCount = 0, aCount = 0;
    Object.keys(cell).forEach((rid) => { if (cell[rid] === "R") rCount++; if (cell[rid] === "A") aCount++; });
    if (rCount > 0) withR++; else withoutR.push(leaf);
    if (aCount === 0) withoutA.push(leaf);
    if (aCount > 1) multiA.push(leaf);
  });
  return { total, withR, withoutR, withoutA, multiA };
}

export interface RaciAuditResult {
  hard: { HR01: WbsLeafRow[]; HR02: WbsLeafRow[]; HR03: WbsLeafRow[]; HR04: WbsLeafRow[] };
  hardCount: number;
  soft: { SR01: WbsLeafRow[]; SR02: WbsLeafRow[]; SR03: ObsNodeRow[] };
  softCount: number; totalChecks: number; srCompliance: number;
  score: number | null; state: "vacio" | "rojo" | "ambar" | "verde";
  leavesTotal: number; colsTotal: number;
}

// ---------------------------------------------------------------
// Auditoría de gobernanza RACI — sistema de Restricciones Hard/Soft.
// No promedia: una sola Restricción Crítica (Hard) incumplida bloquea
// toda la matriz (Rojo / 0%), sin importar qué tan bien puntúe el resto.
// Si las 4 Hard Restrictions se cumplen, el puntaje (85-100) depende del
// % de cumplimiento de las Soft Restrictions (umbral 75% = Ámbar/Verde).
//
//   leaves      -> array como el que devuelve wbsLeaves()
//   cols        -> array como el que devuelve obsNodes()
//   assignments -> { leafId: { colId: "R"|"A"|"C"|"I" } }  (el módulo raci)
//
// Reglas implementadas:
//   HR-01 Actividad sin ninguna asignación (fila completamente vacía)
//   HR-02 Sin Accountable (A = 0)
//   HR-03 Doble/múltiple Accountable (A > 1)
//   HR-04 Sin Responsable (R = 0)
//   SR-01 Más de un Responsable (R > 1) sin justificación en las notas del WBS
//   SR-02 Más de 3 Consultados (C > 3) — riesgo de cuello de botella
//   SR-03 Rol sin ninguna R ni A en toda la matriz ("rol fantasma")
// ---------------------------------------------------------------
export function raciAudit(leaves?: WbsLeafRow[] | null, cols?: ObsNodeRow[] | null, assignments?: Record<string, Record<string, string>> | null): RaciAuditResult {
  const lv = leaves || [], cl = cols || [], asg = assignments || {};

  const hard = { HR01: [] as WbsLeafRow[], HR02: [] as WbsLeafRow[], HR03: [] as WbsLeafRow[], HR04: [] as WbsLeafRow[] };
  lv.forEach((leaf) => {
    const cell = asg[leaf.id] || {};
    const keys = Object.keys(cell).filter((k) => cell[k]);
    let rCount = 0, aCount = 0;
    keys.forEach((k) => { if (cell[k] === "R") rCount++; if (cell[k] === "A") aCount++; });
    if (keys.length === 0) hard.HR01.push(leaf);
    if (aCount === 0) hard.HR02.push(leaf);
    if (aCount > 1) hard.HR03.push(leaf);
    if (rCount === 0) hard.HR04.push(leaf);
  });
  const hardCount = hard.HR01.length + hard.HR02.length + hard.HR03.length + hard.HR04.length;

  const soft = { SR01: [] as WbsLeafRow[], SR02: [] as WbsLeafRow[], SR03: [] as ObsNodeRow[] };
  lv.forEach((leaf) => {
    const cell = asg[leaf.id] || {};
    let rCount = 0, cCount = 0;
    Object.keys(cell).forEach((k) => { if (cell[k] === "R") rCount++; if (cell[k] === "C") cCount++; });
    if (rCount > 1 && !(leaf.notes && leaf.notes.trim())) soft.SR01.push(leaf);
    if (cCount > 3) soft.SR02.push(leaf);
  });
  cl.forEach((col) => {
    const used = lv.some((leaf) => {
      const v = (asg[leaf.id] || {})[col.id];
      return v === "R" || v === "A";
    });
    if (!used) soft.SR03.push(col);
  });
  const softCount = soft.SR01.length + soft.SR02.length + soft.SR03.length;
  const totalChecks = lv.length * 2 + cl.length;
  const srCompliance = totalChecks > 0 ? Math.max(0, Math.min(100, ((totalChecks - softCount) / totalChecks) * 100)) : 100;

  let score: number | null, state: RaciAuditResult["state"];
  if (!lv.length) {
    score = null; state = "vacio";
  } else if (hardCount > 0) {
    score = 0; state = "rojo";
  } else if (srCompliance < 75) {
    score = Math.min(94, Math.round(85 + (srCompliance / 75) * 10));
    state = "ambar";
  } else {
    score = Math.max(95, Math.round(95 + ((srCompliance - 75) / 25) * 5));
    state = "verde";
  }

  return {
    hard, hardCount,
    soft, softCount, totalChecks,
    srCompliance: Math.round(srCompliance),
    score, state,
    leavesTotal: lv.length, colsTotal: cl.length
  };
}

export interface CostSummary {
  baseCost: number; bac: number; total: number; contingencyPct: number;
  estimateClass: string | number | null;
  changeOrders: number; pending: number;
  approvedAmount: number; fromContingency: number; fromMgmt: number;
  hasData: boolean;
}

// Resumen del Plan de Gestión Financiera (módulo "cost") para tableros. Recibe el objeto del
// módulo "cost" (puede venir incompleto o null) y devuelve cifras derivadas:
// estimación de las actividades, BAC (línea base), presupuesto total y el
// conteo/monto de órdenes de cambio aprobadas por fuente de fondeo.
export function costSummary(cost?: CostModule | null): CostSummary {
  const b = (cost && cost.budget) || {};
  const comp = b.computed || {};
  const base = Number(b.baseCost) || Number(comp.base) || 0;
  const bac = Number(comp.bac) || 0;
  const total = Number(comp.total) || 0;
  const contPct = base ? Math.round(((Number(comp.cont) || 0) / base) * 100) : 0;
  const co = (cost && cost.changeOrders) || [];
  let approved = 0, coFromCont = 0, coFromMgmt = 0, pending = 0;
  co.forEach((r) => {
    if (r && r.status === "Aprobada") {
      approved += Number(r.cost) || 0;
      if (r.fund === "Contingencia") coFromCont += Number(r.cost) || 0; else coFromMgmt += Number(r.cost) || 0;
    } else if (r && r.status === "Pendiente") { pending++; }
  });
  const estClass = (cost && cost.estimate && cost.estimate.class) || null;
  return {
    baseCost: base, bac, total, contingencyPct: contPct,
    estimateClass: estClass,
    changeOrders: co.length, pending,
    approvedAmount: approved, fromContingency: coFromCont, fromMgmt: coFromMgmt,
    hasData: !!(cost && (base || co.length))
  };
}

export interface CharterRan { id: string; code: string; text: string; }

// ---------------------------------------------------------------
// Requisitos de alto nivel del Acta, normalizados y CODIFICADOS como RAN.0X
// (RAN = Requisito de Alto Nivel). Tolera el esquema antiguo (arreglo de
// cadenas) y el nuevo (arreglo de objetos {id,code,text}). Es el puente
// entre el Acta de Constitución y el módulo Recopilar Requisitos: cada RAN
// debería ser desarrollado por al menos un REQ.00X.
// ---------------------------------------------------------------
export function charterRans(charter?: CharterModule | null): CharterRan[] {
  const reqs = (charter && charter.requirements) || [];
  const out: CharterRan[] = [];
  reqs.forEach((r, i) => {
    const text = (r && typeof r === "object") ? ((r as CharterRequirement).text || "") : String(r || "");
    if (!text || !text.trim()) return;
    const rObj = (r && typeof r === "object") ? (r as CharterRequirement) : null;
    out.push({
      id: (rObj && rObj.id) ? rObj.id : ("ran" + (i + 1)),
      code: (rObj && rObj.code) ? rObj.code : ("RAN." + pad2(i + 1)),
      text
    });
  });
  return out;
}

export interface RequirementsAuditResult {
  total: number; rans: number; ranHit: Record<string, number>;
  ransUncovered: CharterRan[]; ranPct: number; reqsWithoutRan: number;
  traced: number; tracePct: number;
  reqsWithoutWbs: number; reqsBrokenWbs: number; reqsWithoutStk: number;
  reqsWithoutAccept: number; reqsWithoutMethod: number;
  verified: number; baselineCount: number; changeCount: number;
  leavesWithoutReq: WbsLeafRow[]; leavesTotal: number;
  baselineFrozen: boolean; baselineVersion: string | null;
  changes: number; state: "vacio" | "verde" | "ambar" | "rojo";
}

// ---------------------------------------------------------------
// Auditoría de trazabilidad del módulo Recopilar Requisitos, cruzado contra
// el Acta (RAN) y la EDT (paquetes de trabajo). Checklist lineal, como los
// demás audits del ecosistema. Devuelve cobertura RAN→REQ, trazabilidad
// REQ→EDT, huecos de verificación, y el posible sobre-alcance (paquetes de
// la EDT sin ningún requisito que los justifique).
//   req     -> módulo "requirements"
//   charter -> módulo "charter" (para los RAN)
//   wbs     -> módulo "wbs" (para validar los paquetes enlazados)
// ---------------------------------------------------------------
export function requirementsAudit(req?: RequirementsModule | null, charter?: CharterModule | null, wbs?: WbsModule | null): RequirementsAuditResult {
  const r = req || ({} as Partial<RequirementsModule>);
  const items = r.items || [];
  const rans = charterRans(charter);
  const ranById: Record<string, CharterRan> = {}; rans.forEach((rn) => { ranById[rn.id] = rn; });
  const validNodes: Record<string, boolean> = {};
  if (wbs && wbs.nodes) Object.keys(wbs.nodes).forEach((id) => { validNodes[id] = true; });
  const leaves = wbsLeaves(wbs || undefined);

  const ranHit: Record<string, number> = {}; rans.forEach((rn) => { ranHit[rn.id] = 0; });
  let reqsWithoutRan = 0, reqsWithoutWbs = 0, reqsBrokenWbs = 0, reqsWithoutStk = 0,
    reqsWithoutAccept = 0, reqsWithoutMethod = 0, verified = 0,
    baselineCount = 0, changeCount = 0, traced = 0;
  const leavesWithReq: Record<string, boolean> = {};

  items.forEach((it) => {
    const validSrcs = (it.sourceRanIds || []).filter((id) => ranById[id]);
    if (validSrcs.length === 0) reqsWithoutRan++;
    validSrcs.forEach((id) => { ranHit[id] = (ranHit[id] || 0) + 1; });

    const nodes = it.wbsNodeIds || [];
    const validW = nodes.filter((id) => validNodes[id]);
    const brokenW = nodes.filter((id) => !validNodes[id]);
    if (nodes.length === 0) reqsWithoutWbs++; else if (validW.length > 0) traced++;
    if (brokenW.length) reqsBrokenWbs++;
    validW.forEach((id) => { leavesWithReq[id] = true; });

    if (!it.stakeholderId) reqsWithoutStk++;
    if (!(it.acceptanceCriteria && String(it.acceptanceCriteria).trim())) reqsWithoutAccept++;
    if (!it.verificationMethod) reqsWithoutMethod++;
    if (it.verificationStatus === "verificado") verified++;
    if (it.origin === "change") changeCount++; else baselineCount++;
  });

  const ransUncovered = rans.filter((rn) => !ranHit[rn.id]);
  const leavesWithoutReq = leaves.filter((l) => !leavesWithReq[l.id]);
  const total = items.length;
  const tracePct = total ? Math.round(traced / total * 100) : 0;
  const ranPct = rans.length ? Math.round((rans.length - ransUncovered.length) / rans.length * 100) : 100;

  let state: RequirementsAuditResult["state"];
  if (!total && !rans.length) state = "vacio";
  else if (ransUncovered.length === 0 && tracePct >= 80 && reqsBrokenWbs === 0) state = "verde";
  else if (tracePct >= 50 || ranPct >= 50) state = "ambar";
  else state = "rojo";

  return {
    total, rans: rans.length, ranHit,
    ransUncovered, ranPct, reqsWithoutRan,
    traced, tracePct,
    reqsWithoutWbs, reqsBrokenWbs, reqsWithoutStk,
    reqsWithoutAccept, reqsWithoutMethod,
    verified, baselineCount, changeCount,
    leavesWithoutReq, leavesTotal: leaves.length,
    baselineFrozen: !!(r.baseline && r.baseline.frozen),
    baselineVersion: (r.baseline && r.baseline.version) || null,
    changes: (r.changes || []).length, state
  };
}

// Requisitos (REQ.00X) enlazados a un paquete de trabajo de la EDT. Lo usa
// el Panel / WBS para mostrar el contador "N requisitos" por paquete.
export function reqByWbsLeaf(req: RequirementsModule | null | undefined, leafId: string): Array<{ id: string; code?: string; text?: string }> {
  const items = (req && req.items) || [];
  return items.filter((it) => (it.wbsNodeIds || []).indexOf(leafId) !== -1)
    .map((it) => ({ id: it.id, code: it.code, text: it.text }));
}

// ---------------------------------------------------------------
// Entregables del Enunciado del Alcance (DEL.0X), normalizados y CODIFICADOS.
// Son la BISAGRA del flujo Requisitos → Alcance → EDT: un entregable puede
// trazar hacia atrás a los RAN del Acta y a los REQ que lo justifican, y
// hacia adelante a la EDT (que descompone el ENTREGABLE, nunca el requisito).
//   scope -> módulo "scopeStatement"
// ---------------------------------------------------------------
export function scopeDeliverables(scope?: ScopeStatementModule | null): Required<ScopeDeliverable>[] {
  const dels = (scope && scope.deliverables) || [];
  return dels.map((d, i) => ({
    id: (d && d.id) ? d.id : ("del" + (i + 1)),
    code: (d && d.code) ? d.code : ("DEL." + pad2(i + 1)),
    name: (d && d.name) || "",
    description: (d && d.description) || "",
    acceptanceCriteria: (d && d.acceptanceCriteria) || "",
    ranIds: ((d && d.ranIds) || []).slice(),
    reqIds: ((d && d.reqIds) || []).slice()
  }));
}

// Conjunto de ids de entregable (delId) presentes en algún nodo de la EDT.
// Es la señal de que un entregable YA fue descompuesto en la EDT: la usa
// scopeAudit y la siembra "↧ Sembrar Entregables" del WBS Builder.
export function wbsDelIds(wbs?: WbsModule | null): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (wbs && wbs.nodes) Object.keys(wbs.nodes).forEach((id) => {
    const d = wbs.nodes[id] && wbs.nodes[id].delId;
    if (d) out[d] = true;
  });
  return out;
}

export interface ScopeAuditResult {
  total: number; deliverables: Required<ScopeDeliverable>[];
  delsWithoutReq: Required<ScopeDeliverable>[]; delsWithoutAccept: Required<ScopeDeliverable>[];
  delsNotDecomposed: Required<ScopeDeliverable>[]; delsBrokenReq: number;
  decomposedCount: number; decompPct: number;
  reqsWithoutDel: RequirementItem[]; reqCovPct: number; reqTotal: number;
  ransWithoutDel: CharterRan[]; ranTotal: number;
  assumptions: number; constraints: number; exclusions: number;
  baselineFrozen: boolean; baselineVersion: string | null;
  state: "vacio" | "verde" | "ambar" | "rojo";
}

// ---------------------------------------------------------------
// Auditoría de coherencia del Enunciado del Alcance (Define Scope). Checklist
// lineal, como los demás audits del ecosistema. Es la "puerta de coherencia"
// del flujo: cruza los entregables contra los REQ (Recopilar Requisitos), los
// RAN (Acta) y la EDT (paquetes que descomponen cada entregable). Detecta:
//   · entregables sin ningún REQ que los justifique (posible sobre-alcance);
//   · REQ sin entregable que los acoja (alcance faltante / hueco de cobertura);
//   · entregables aún NO descompuestos en la EDT;
//   · entregables sin criterio de aceptación; enlaces REQ rotos.
//   scope   -> módulo "scopeStatement"
//   req     -> módulo "requirements"  ·  charter -> "charter"  ·  wbs -> "wbs"
// ---------------------------------------------------------------
export function scopeAudit(scope?: ScopeStatementModule | null, req?: RequirementsModule | null, charter?: CharterModule | null, wbs?: WbsModule | null): ScopeAuditResult {
  const sc = scope || ({} as ScopeStatementModule);
  const dels = scopeDeliverables(sc);
  const reqItems = (req && req.items) || [];
  const reqById: Record<string, RequirementItem> = {}; reqItems.forEach((it) => { reqById[it.id] = it; });
  const rans = charterRans(charter);
  const ranById: Record<string, CharterRan> = {}; rans.forEach((rn) => { ranById[rn.id] = rn; });
  const decomposed = wbsDelIds(wbs || undefined);

  const delsWithoutReq: Required<ScopeDeliverable>[] = [], delsWithoutAccept: Required<ScopeDeliverable>[] = [], delsNotDecomposed: Required<ScopeDeliverable>[] = [];
  let delsBrokenReq = 0;
  const reqCoveredByDel: Record<string, boolean> = {}, ranCoveredByDel: Record<string, boolean> = {};

  dels.forEach((d) => {
    const validReqs = (d.reqIds || []).filter((id) => reqById[id]);
    const brokenReqs = (d.reqIds || []).filter((id) => !reqById[id]);
    if (validReqs.length === 0) delsWithoutReq.push(d);
    if (brokenReqs.length) delsBrokenReq++;
    validReqs.forEach((id) => { reqCoveredByDel[id] = true; });
    (d.ranIds || []).forEach((id) => { if (ranById[id]) ranCoveredByDel[id] = true; });
    if (!(d.acceptanceCriteria && String(d.acceptanceCriteria).trim())) delsWithoutAccept.push(d);
    if (!decomposed[d.id]) delsNotDecomposed.push(d);
  });

  const reqsWithoutDel = reqItems.filter((it) => !reqCoveredByDel[it.id]);
  const ransWithoutDel = rans.filter((r) => !ranCoveredByDel[r.id]);

  const total = dels.length;
  const decomposedCount = dels.filter((d) => decomposed[d.id]).length;
  const reqCovPct = reqItems.length ? Math.round((reqItems.length - reqsWithoutDel.length) / reqItems.length * 100) : (total ? 100 : 0);
  const decompPct = total ? Math.round(decomposedCount / total * 100) : 0;

  let state: ScopeAuditResult["state"];
  if (!total && !reqItems.length) state = "vacio";
  else if (total && delsWithoutReq.length === 0 && reqsWithoutDel.length === 0 && delsBrokenReq === 0 && delsNotDecomposed.length === 0) state = "verde";
  else if (reqCovPct >= 50 || decompPct >= 50) state = "ambar";
  else state = "rojo";

  return {
    total, deliverables: dels,
    delsWithoutReq, delsWithoutAccept,
    delsNotDecomposed, delsBrokenReq,
    decomposedCount, decompPct,
    reqsWithoutDel, reqCovPct, reqTotal: reqItems.length,
    ransWithoutDel, ranTotal: rans.length,
    assumptions: (sc.assumptions || []).length,
    constraints: (sc.constraints || []).length,
    exclusions: (sc.exclusions || []).length,
    baselineFrozen: !!(sc.baseline && sc.baseline.frozen),
    baselineVersion: (sc.baseline && sc.baseline.version) || null,
    state
  };
}

export interface TraceMatrixRow {
  req: { id: string; code?: string; text: string };
  rans: Array<{ id: string; code: string }>;
  dels: Array<{ id: string; code: string; name: string }>;
  wps: Array<{ id: string; code: string; name: string }>;
  wpDelIds: string[]; coherent: boolean;
  flags: { emergent: boolean; noDel: boolean; noWp: boolean; wpNoDel: boolean; delWpMismatch: boolean };
  state: "rojo" | "ambar" | "verde";
}
export interface TraceMatrixResult {
  rows: TraceMatrixRow[];
  kpi: { reqTotal: number; verde: number; noDel: number; noWp: number; delWpMismatch: number; emergent: number; wpNoDel: number; fullChainPct: number };
  state: "vacio" | "verde" | "rojo" | "ambar";
  orphans: {
    delsWithoutReq: Required<ScopeDeliverable>[]; wpsOrphan: WbsLeafRow[]; wpsNoReq: WbsLeafRow[];
    ransWithoutReq: CharterRan[]; emergentReqs: RequirementItem[];
  };
  counts: { req: number; ran: number; del: number; wp: number };
}

// ---------------------------------------------------------------
// Matriz de consistencia / integración vertical  RAN → REQ → DEL → WP.
// Una FILA POR REQUISITO (la unidad que no debe caerse). Encadena las cuatro
// puertas de trazabilidad y detecta el cruce fino que ninguna auditoría por
// separado ve: si el/los entregable(s) que ACOGEN un REQ
// (scope.deliverables[].reqIds) coinciden con el/los entregable(s) a los que
// PERTENECEN sus paquetes de trabajo — subiendo por el árbol de la EDT hasta
// el primer ancestro con delId.
//   req -> "requirements" · charter -> "charter" · scope -> "scopeStatement" · wbs -> "wbs"
// Colores: ROJO = REQ sin entregable (alcance faltante) o sin paquete (sin
//   ejecución); ÁMBAR = REQ emergente (sin RAN), paquete que no cuelga de
//   ningún entregable, o incoherencia DEL↔WP; VERDE = cadena completa y
//   coherente. Solo lectura: deriva de lo ya existente.
// ---------------------------------------------------------------
export function traceMatrix(req?: RequirementsModule | null, charter?: CharterModule | null, scope?: ScopeStatementModule | null, wbs?: WbsModule | null): TraceMatrixResult {
  const reqItems = (req && req.items) || [];
  const rans = charterRans(charter);
  const ranById: Record<string, CharterRan> = {}; rans.forEach((r) => { ranById[r.id] = r; });
  const dels = scopeDeliverables(scope);
  const delById: Record<string, Required<ScopeDeliverable>> = {}; dels.forEach((d) => { delById[d.id] = d; });
  const nodes = (wbs && wbs.nodes) || {};
  const codes = wbsCodes(wbs || undefined);

  // hijo -> padre (vía children, fuente fiable) para subir por el árbol
  const parentOf: Record<string, string> = {};
  Object.keys(nodes).forEach((pid) => {
    (nodes[pid].children || []).forEach((cid) => { parentOf[cid] = pid; });
  });
  // entregable (delId) al que pertenece un nodo, subiendo hasta el 1er ancestro con delId
  function delOfNode(id: string | undefined): string | null {
    let guard = 0, n = id;
    while (n && guard++ < 999) {
      if (nodes[n] && nodes[n].delId) return nodes[n].delId as string;
      n = parentOf[n];
    }
    return null;
  }

  // DEL que ACOGEN cada REQ (invertido desde del.reqIds)
  const hostDelsByReq: Record<string, Record<string, boolean>> = {};
  dels.forEach((d) => {
    (d.reqIds || []).forEach((rid) => { (hostDelsByReq[rid] = hostDelsByReq[rid] || {})[d.id] = true; });
  });

  const rows: TraceMatrixRow[] = [];
  const kpi = { reqTotal: reqItems.length, verde: 0, noDel: 0, noWp: 0, delWpMismatch: 0, emergent: 0, wpNoDel: 0, fullChainPct: 0 };

  reqItems.forEach((it) => {
    const reqRans = (it.sourceRanIds || []).filter((id) => ranById[id]).map((id) => ranById[id]);
    const hostDelIds = Object.keys(hostDelsByReq[it.id] || {});
    const hostDels = hostDelIds.map((id) => delById[id]).filter(Boolean);
    const wpIds = (it.wbsNodeIds || []).filter((id) => nodes[id]);
    const wps = wpIds.map((id) => ({ id, code: codes[id] || "", name: (nodes[id].name || "") }));
    const wpDelSet: Record<string, boolean> = {}; wpIds.forEach((id) => { const dd = delOfNode(id); if (dd) wpDelSet[dd] = true; });
    const wpDelIds = Object.keys(wpDelSet);

    const emergent = reqRans.length === 0;
    const noDel = hostDels.length === 0;
    const noWp = wps.length === 0;
    const wpNoDel = wps.length > 0 && wpDelIds.length === 0;
    const overlap = hostDelIds.some((id) => wpDelSet[id]);
    const delWpMismatch = hostDelIds.length > 0 && wpDelIds.length > 0 && !overlap;

    let st: TraceMatrixRow["state"];
    if (noDel || noWp) st = "rojo";
    else if (emergent || wpNoDel || delWpMismatch) st = "ambar";
    else st = "verde";

    if (st === "verde") kpi.verde++;
    if (noDel) kpi.noDel++;
    if (noWp) kpi.noWp++;
    if (delWpMismatch) kpi.delWpMismatch++;
    if (emergent) kpi.emergent++;
    if (wpNoDel) kpi.wpNoDel++;

    rows.push({
      req: { id: it.id, code: it.code, text: it.text || "" },
      rans: reqRans.map((r) => ({ id: r.id, code: r.code })),
      dels: hostDels.map((d) => ({ id: d.id, code: d.code, name: d.name })),
      wps, wpDelIds, coherent: overlap,
      flags: { emergent, noDel, noWp, wpNoDel, delWpMismatch },
      state: st
    });
  });

  // Huérfanos / sobre-alcance que la espina por REQ no revela por sí sola
  const delsWithoutReq = dels.filter((d) => !(d.reqIds || []).some((rid) => reqItems.some((it) => it.id === rid)));
  const leaves = wbsLeaves(wbs || undefined);
  const reqOfLeaf: Record<string, boolean> = {}; reqItems.forEach((it) => { (it.wbsNodeIds || []).forEach((nid) => { reqOfLeaf[nid] = true; }); });
  const wpsOrphan = leaves.filter((l) => !reqOfLeaf[l.id] && !delOfNode(l.id));
  const wpsNoReq = leaves.filter((l) => !reqOfLeaf[l.id] && delOfNode(l.id));
  const reqRanSet: Record<string, boolean> = {}; reqItems.forEach((it) => { (it.sourceRanIds || []).forEach((id) => { reqRanSet[id] = true; }); });
  const ransWithoutReq = rans.filter((r) => !reqRanSet[r.id]);
  const emergentReqs = reqItems.filter((it) => (it.sourceRanIds || []).filter((id) => ranById[id]).length === 0);

  kpi.fullChainPct = reqItems.length ? Math.round(kpi.verde / reqItems.length * 100) : 0;
  const mstate: TraceMatrixResult["state"] = !reqItems.length ? "vacio"
    : (kpi.noDel === 0 && kpi.noWp === 0 && kpi.delWpMismatch === 0 && kpi.emergent === 0 && kpi.wpNoDel === 0) ? "verde"
      : (kpi.noDel || kpi.noWp) ? "rojo" : "ambar";

  return {
    rows, kpi, state: mstate,
    orphans: { delsWithoutReq, wpsOrphan, wpsNoReq, ransWithoutReq, emergentReqs },
    counts: { req: reqItems.length, ran: rans.length, del: dels.length, wp: leaves.length }
  };
}

// ===============================================================
// CRONOGRAMA / CPM — parser de precedencias (sintaxis MS Project),
// resolución de aristas y validación de la red. Capa de DATOS: no
// calcula fechas ni ruta crítica (eso lo hace el módulo Cronograma
// consumiendo estas funciones). Los enlaces son actividad→actividad;
// "from" precede a "to".
// ---------------------------------------------------------------

export interface ParsedPredecessor { netId: number; type: ScheduleLinkType; lag: number; lagUnit: ScheduleLagUnit; }
export interface ParsePredecessorResult { preds: ParsedPredecessor[]; errors: Array<{ raw: string; reason: string }>; }

// Convierte una celda de predecesoras (p. ej. "4;5CC+2d", "9FC-1d",
// "3FF+1 sem") en referencias {netId,type,lag,lagUnit}. Tokeniza de
// izquierda a derecha, por lo que resuelve solo el separador de lista
// (";" o ",") frente a la coma decimal del desfase: la coma solo es
// decimal cuando está dentro del número del lag (tras + o −); entre
// dos enteros es separador. Canonicaliza FC/CC/CF (español) a FS/SS/SF.
export function parsePredecessorCell(cell: unknown): ParsePredecessorResult {
  const s = String(cell == null ? "" : cell).trim();
  const preds: ParsedPredecessor[] = [], errors: Array<{ raw: string; reason: string }> = [];
  if (!s) return { preds, errors };
  const TYPE: Record<string, ScheduleLinkType> = { FS: "FS", SS: "SS", FF: "FF", SF: "SF", FC: "FS", CC: "SS", CF: "SF" };
  const LET = /[A-Za-zÁÉÍÓÚÜáéíóúü]/;
  let i = 0; const n = s.length;
  function ws(): void { while (i < n && /\s/.test(s.charAt(i))) i++; }
  while (i < n) {
    ws(); if (i >= n) break;
    if (s.charAt(i) === ";" || s.charAt(i) === ",") { i++; continue; } // separador suelto
    const tokStart = i;
    // 1) netId (entero)
    const a = i; while (i < n && /[0-9]/.test(s.charAt(i))) i++;
    if (i === a) { // sin id: basura hasta el próximo separador
      while (i < n && s.charAt(i) !== ";" && s.charAt(i) !== ",") i++;
      errors.push({ raw: s.slice(tokStart, i).trim(), reason: "sin-id" }); continue;
    }
    const netId = parseInt(s.slice(a, i), 10);
    // 2) tipo (hasta 2 letras) — opcional
    ws(); let type: ScheduleLinkType = "FS", buf = ""; const b = i;
    while (i < n && LET.test(s.charAt(i)) && buf.length < 2) { buf += s.charAt(i); i++; }
    if (buf && TYPE[buf.toUpperCase()]) type = TYPE[buf.toUpperCase()];
    else i = b; // no era un tipo válido: retroceder
    // 3) desfase (lag) — opcional: signo, número (una coma/punto decimal), unidad
    let lag = 0, lagUnit: ScheduleLagUnit = "d", hadLag = false, lagErr = false;
    ws();
    if (i < n && (s.charAt(i) === "+" || s.charAt(i) === "-")) {
      hadLag = true; const sign = s.charAt(i) === "-" ? -1 : 1; i++; ws();
      const c = i; while (i < n && /[0-9]/.test(s.charAt(i))) i++;
      if (i < n && (s.charAt(i) === "." || s.charAt(i) === ",") && i + 1 < n && /[0-9]/.test(s.charAt(i + 1))) {
        i++; while (i < n && /[0-9]/.test(s.charAt(i))) i++;
      }
      const num = s.slice(c, i).replace(",", ".");
      if (num === "") lagErr = true; else lag = sign * parseFloat(num);
      ws(); const d0 = i; while (i < n && LET.test(s.charAt(i))) i++;
      const u = s.slice(d0, i).toLowerCase().normalize ? s.slice(d0, i).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : s.slice(d0, i).toLowerCase();
      if (u === "" || u === "d" || u === "dia" || u === "dias" || u === "day" || u === "days") lagUnit = "d";
      else if (u === "h" || u === "hr" || u === "hrs" || u === "hora" || u === "horas") lagUnit = "h";
      else if (u === "w" || u === "sem" || u === "semana" || u === "semanas" || u === "week" || u === "weeks") lagUnit = "w";
      else if (u === "ed" || u === "dt") lagUnit = "ed";
      else lagErr = true;
    }
    // 4) tras un token completo debemos estar en separador o fin
    ws();
    if (i < n && s.charAt(i) !== ";" && s.charAt(i) !== ",") {
      while (i < n && s.charAt(i) !== ";" && s.charAt(i) !== ",") i++;
      errors.push({ raw: s.slice(tokStart, i).trim(), reason: "sintaxis" }); continue;
    }
    if (lagErr) { errors.push({ raw: s.slice(tokStart, i).trim(), reason: "desfase" }); continue; }
    preds.push({ netId, type, lag: hadLag ? lag : 0, lagUnit: hadLag ? lagUnit : "d" });
  }
  return { preds, errors };
}

export interface SnapshotRow { netId: number; kind: "project" | "summary" | "activity"; name?: string; activityId?: string; }
export interface PastedRow { netId: number; name?: string; start?: string; finish?: string; predCell?: unknown; }
export interface BuildScheduleLinksResult {
  links: Array<{ from: string; to: string; type: ScheduleLinkType; lag: number; lagUnit: ScheduleLagUnit }>;
  rejected: Array<{ fromNet: number; toNet: number; toName: string; reason: string }>;
  rowErrors: Array<{ netId: number; name: string; reason: string; expected?: string }>;
  parseErrors: Array<{ netId: number; name: string; raw: string; reason: string }>;
  dates: Record<string, { start: string; finish: string }>;
  duplicates: Array<{ from: string; to: string; type: ScheduleLinkType }>;
}

// Resuelve las filas pegadas contra una instantánea de fullRows() (la
// numeración estilo MS Project: 0=proyecto, luego fases/paquetes/
// actividades). Devuelve enlaces candidatos (sin id; el módulo asigna Lx
// al confirmar), rechazos con motivo, errores de fila y de sintaxis, y la
// tabla de fechas para auditoría.
export function buildScheduleLinks(pasted?: PastedRow[] | null, snapshot?: SnapshotRow[] | null): BuildScheduleLinksResult {
  const P = pasted || [], S = snapshot || [];
  const byNet: Record<string, SnapshotRow> = {};
  S.forEach((r) => { byNet[String(r.netId)] = r; });
  function norm(x: unknown): string {
    const s = String(x == null ? "" : x).trim().toLowerCase();
    return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s;
  }
  const links: BuildScheduleLinksResult["links"] = [], rejected: BuildScheduleLinksResult["rejected"] = [],
    rowErrors: BuildScheduleLinksResult["rowErrors"] = [], parseErrors: BuildScheduleLinksResult["parseErrors"] = [],
    dates: BuildScheduleLinksResult["dates"] = {}, duplicates: BuildScheduleLinksResult["duplicates"] = [];
  const seen: Record<string, boolean> = {};
  P.forEach((R) => {
    const tgt = byNet[String(R.netId)];
    if (!tgt) { rowErrors.push({ netId: R.netId, name: R.name || "", reason: "fila-sin-correspondencia" }); return; }
    if (tgt.kind !== "activity") {
      // fila resumen/proyecto: no es nodo de la red. Si trae predecesoras, se avisa.
      const pk = parsePredecessorCell(R.predCell);
      if ((pk.preds && pk.preds.length) || (pk.errors && pk.errors.length))
        rowErrors.push({ netId: R.netId, name: R.name || "", reason: tgt.kind === "project" ? "predecesoras-en-proyecto" : "predecesoras-en-resumen" });
      return;
    }
    // cruce por nombre (detecta desfase de N.º tras editar la EDT)
    if (R.name != null && String(R.name).trim() !== "" && norm(R.name) !== norm(tgt.name)) {
      rowErrors.push({ netId: R.netId, name: R.name || "", expected: tgt.name, reason: "nombre-no-coincide" }); return;
    }
    // fechas → auditoría
    if ((R.start && String(R.start).trim()) || (R.finish && String(R.finish).trim()))
      dates[tgt.activityId as string] = { start: String(R.start || "").trim(), finish: String(R.finish || "").trim() };
    // predecesoras → aristas
    const parsed = parsePredecessorCell(R.predCell);
    parsed.errors.forEach((e) => { parseErrors.push({ netId: R.netId, name: R.name || "", raw: e.raw, reason: e.reason }); });
    parsed.preds.forEach((Pr) => {
      const src = byNet[String(Pr.netId)];
      if (Pr.netId === 0 || (src && src.kind === "project"))
        { rejected.push({ fromNet: Pr.netId, toNet: R.netId, toName: R.name || "", reason: "enlace-a-proyecto" }); return; }
      if (!src) { rejected.push({ fromNet: Pr.netId, toNet: R.netId, toName: R.name || "", reason: "colgante" }); return; }
      if (src.kind === "summary") { rejected.push({ fromNet: Pr.netId, toNet: R.netId, toName: R.name || "", reason: "enlace-a-resumen" }); return; }
      if (src.activityId === tgt.activityId) { rejected.push({ fromNet: Pr.netId, toNet: R.netId, toName: R.name || "", reason: "auto-enlace" }); return; }
      const key = src.activityId + "" + tgt.activityId + "" + Pr.type;
      if (seen[key]) { duplicates.push({ from: src.activityId as string, to: tgt.activityId as string, type: Pr.type }); return; }
      seen[key] = true;
      links.push({ from: src.activityId as string, to: tgt.activityId as string, type: Pr.type, lag: Pr.lag, lagUnit: Pr.lagUnit });
    });
  });
  return { links, rejected, rowErrors, parseErrors, dates, duplicates };
}

export interface ScheduleValidateResult {
  ok: boolean;
  dangling: ScheduleLink[]; selfLoops: ScheduleLink[]; duplicates: ScheduleLink[];
  cycles: string[]; openStart: string[]; openEnd: string[]; order: string[];
}

// Valida la red: referencias colgantes, auto-enlaces, duplicados,
// ciclos (orden topológico de Kahn) y extremos abiertos (sin
// predecesora / sin sucesora). `ok` = red apta para el CPM (sin ciclos,
// sin colgantes, sin auto-enlaces). Duplicados y extremos abiertos son
// avisos, no bloqueantes.
export function scheduleValidate(activityIds?: string[] | null, links?: ScheduleLink[] | null): ScheduleValidateResult {
  const ids = activityIds || [], lk = links || [];
  const inSet: Record<string, boolean> = {}; ids.forEach((id) => { inSet[id] = true; });
  const dangling: ScheduleLink[] = [], selfLoops: ScheduleLink[] = [], duplicates: ScheduleLink[] = [], seen: Record<string, boolean> = {};
  const adj: Record<string, string[]> = {}, indeg: Record<string, number> = {}, outdeg: Record<string, number> = {};
  ids.forEach((id) => { adj[id] = []; indeg[id] = 0; outdeg[id] = 0; });
  lk.forEach((l) => {
    if (!inSet[l.from] || !inSet[l.to]) { dangling.push(l); return; }
    if (l.from === l.to) { selfLoops.push(l); return; }
    const k = l.from + "" + l.to + "" + l.type;
    if (seen[k]) { duplicates.push(l); return; }
    seen[k] = true;
    adj[l.from].push(l.to); outdeg[l.from]++; indeg[l.to]++;
  });
  // Kahn
  const q: string[] = []; const order: string[] = []; const deg: Record<string, number> = {};
  ids.forEach((id) => { deg[id] = indeg[id]; if (indeg[id] === 0) q.push(id); });
  while (q.length) {
    const u = q.shift() as string; order.push(u);
    adj[u].forEach((v) => { if (--deg[v] === 0) q.push(v); });
  }
  const cycleNodes = ids.filter((id) => deg[id] > 0);
  const openStart = ids.filter((id) => indeg[id] === 0);
  const openEnd = ids.filter((id) => outdeg[id] === 0);
  return {
    ok: cycleNodes.length === 0 && dangling.length === 0 && selfLoops.length === 0,
    dangling, selfLoops, duplicates,
    cycles: cycleNodes, openStart, openEnd,
    order
  };
}

export interface ProjectCalendar { workDayIdx: number[]; hoursPerDay: number; holidays: string[]; provisional: boolean; }

// Calendario del proyecto para el CPM. Se lee del Plan de Gestión del
// Cronograma (schedulePlan.calendar): NUNCA se guarda en el módulo de
// cronograma. Devuelve días laborables como índices (Dom=0..Sáb=6),
// horas/día y feriados. Si no hay Plan, cae a un default (Lun–Vie, 8 h)
// marcado provisional para que el módulo avise.
export function projectCalendar(sp?: SchedulePlanModule | null): ProjectCalendar {
  const DAY: Record<string, number> = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
  let s = sp;
  try { if (s === undefined) s = (getModule("schedulePlan") as SchedulePlanModule | null) || undefined; } catch (e) { s = s || undefined; }
  const cal = s && s.calendar ? s.calendar : null;
  if (!cal || !Array.isArray(cal.workDays) || !cal.workDays.length || !(Number(cal.hoursPerDay) > 0)) {
    return { workDayIdx: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [], provisional: true };
  }
  const idx: Record<number, boolean> = {};
  cal.workDays.forEach((d) => {
    const raw = String(d).toLowerCase();
    const key = raw.normalize ? raw.normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3) : raw.slice(0, 3);
    if (DAY[key] !== undefined) idx[DAY[key]] = true;
  });
  const days = Object.keys(idx).map(Number).sort((a, b) => a - b);
  return {
    workDayIdx: days.length ? days : [1, 2, 3, 4, 5],
    hoursPerDay: Number(cal.hoursPerDay) || 8,
    holidays: Array.isArray(cal.holidays) ? cal.holidays.slice() : [],
    provisional: false
  };
}

export interface CpmNode { id: string; dur?: number; }
export interface CpmRow {
  es: number; ef: number; ls: number; lf: number; tf: number; ff: number; critical: boolean;
  startDate: string; finishDate: string;
}
export type CpmResult =
  | { ok: false; cycles: string[] }
  | { ok: true; rows: Record<string, CpmRow>; order: string[]; criticalIds: string[]; projectDuration: number; projectStart: string; projectFinishDate: string };

// Método de la Ruta Crítica (CPM). Nodos = actividades hoja {id, dur} (dur
// en días laborables); links = aristas tipadas {from,to,type,lag,lagUnit}.
// Calcula ES/EF/LS/LF, holgura total y libre, ruta crítica y —si se pasa
// opts.startDate y un calendario— las fechas de calendario de cada
// actividad. Trabaja en offsets de días laborables; el calendario solo
// interviene al mapear offsets → fechas.
//   FS: ES(j) ≥ EF(i)+lag   SS: ES(j) ≥ ES(i)+lag
//   FF: EF(j) ≥ EF(i)+lag   SF: EF(j) ≥ ES(i)+lag
export function cpm(nodes?: CpmNode[] | null, links?: ScheduleLink[] | null, calendar?: ProjectCalendar | null, opts?: { startDate?: string }): CpmResult {
  const nd = nodes || [], lk = links || []; const o = opts || {};
  const cal = calendar || { workDayIdx: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [], provisional: true };
  const wpw = (cal.workDayIdx && cal.workDayIdx.length) ? cal.workDayIdx.length : 5;
  const hpd = Number(cal.hoursPerDay) > 0 ? Number(cal.hoursPerDay) : 8;
  function lagWD(l: ScheduleLink): number {
    const v = Number(l.lag) || 0, u = l.lagUnit || "d";
    if (u === "h") return v / hpd;
    if (u === "w") return v * wpw;
    if (u === "ed") return v * (wpw / 7);
    return v; // "d"
  }
  const dur: Record<string, number> = {}, ids: string[] = [];
  nd.forEach((n) => { dur[n.id] = Number(n.dur) || 0; ids.push(n.id); });
  const inSet: Record<string, boolean> = {}; ids.forEach((id) => { inSet[id] = true; });
  const out: Record<string, ScheduleLink[]> = {}, inc: Record<string, ScheduleLink[]> = {}, indeg: Record<string, number> = {}, outdeg: Record<string, number> = {};
  ids.forEach((id) => { out[id] = []; inc[id] = []; indeg[id] = 0; outdeg[id] = 0; });
  lk.forEach((l) => {
    if (!inSet[l.from] || !inSet[l.to] || l.from === l.to) return;
    out[l.from].push(l); inc[l.to].push(l); indeg[l.to]++; outdeg[l.from]++;
  });
  // orden topológico (Kahn)
  const q: string[] = []; const order: string[] = []; const deg: Record<string, number> = {};
  ids.forEach((id) => { deg[id] = indeg[id]; if (!indeg[id]) q.push(id); });
  while (q.length) { const u = q.shift() as string; order.push(u); out[u].forEach((l) => { if (--deg[l.to] === 0) q.push(l.to); }); }
  if (order.length !== ids.length) {
    return { ok: false, cycles: ids.filter((id) => deg[id] > 0) };
  }
  // forward pass
  const ES: Record<string, number> = {}, EF: Record<string, number> = {};
  ids.forEach((id) => { ES[id] = 0; });
  order.forEach((id) => {
    inc[id].forEach((l) => {
      const g = lagWD(l); let lb: number;
      if (l.type === "SS") lb = ES[l.from] + g;
      else if (l.type === "FF") lb = EF[l.from] + g - dur[id];
      else if (l.type === "SF") lb = ES[l.from] + g - dur[id];
      else lb = EF[l.from] + g; // FS
      if (lb > ES[id]) ES[id] = lb;
    });
    if (ES[id] < 0) ES[id] = 0;
    EF[id] = ES[id] + dur[id];
  });
  let projDur = 0; ids.forEach((id) => { if (EF[id] > projDur) projDur = EF[id]; });
  // backward pass
  const LF: Record<string, number> = {}, LS: Record<string, number> = {};
  ids.forEach((id) => { LF[id] = projDur; });
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    if (outdeg[id] > 0) {
      LF[id] = Infinity;
      out[id].forEach((l) => {
        const g = lagWD(l); let ub: number;
        if (l.type === "SS") ub = (LF[l.to] - dur[l.to]) - g + dur[id];
        else if (l.type === "FF") ub = LF[l.to] - g;
        else if (l.type === "SF") ub = LF[l.to] - g + dur[id];
        else ub = (LF[l.to] - dur[l.to]) - g; // FS: LS(to)-lag
        if (ub < LF[id]) LF[id] = ub;
      });
    }
    LS[id] = LF[id] - dur[id];
  }
  // holguras, ruta crítica, fechas
  const EPS = 1e-6; const rows: Record<string, CpmRow> = {}; const criticalIds: string[] = [];
  const start = o.startDate ? parseISO(o.startDate) : null;
  ids.forEach((id) => {
    const tf = LS[id] - ES[id];
    let ff = Infinity;
    if (outdeg[id] === 0) ff = tf;
    else out[id].forEach((l) => {
      const g = lagWD(l); let s: number;
      if (l.type === "SS") s = ES[l.to] - ES[id] - g;
      else if (l.type === "FF") s = EF[l.to] - EF[id] - g;
      else if (l.type === "SF") s = EF[l.to] - ES[id] - g;
      else s = ES[l.to] - EF[id] - g; // FS
      if (s < ff) ff = s;
    });
    const crit = tf <= EPS;
    if (crit) criticalIds.push(id);
    rows[id] = {
      es: ES[id], ef: EF[id], ls: LS[id], lf: LF[id],
      tf: Math.round(tf * 1000) / 1000, ff: (ff === Infinity ? 0 : Math.round(ff * 1000) / 1000),
      critical: crit,
      startDate: start ? addWorkingDays(start, Math.round(ES[id]), cal) : "",
      finishDate: start ? addWorkingDays(start, Math.max(Math.round(ES[id]), Math.round(EF[id]) - (dur[id] > 0 ? 1 : 0)), cal) : ""
    };
  });
  return {
    ok: true, rows, order, criticalIds,
    projectDuration: projDur,
    projectStart: start ? addWorkingDays(start, 0, cal) : "",
    projectFinishDate: start ? addWorkingDays(start, Math.max(0, Math.round(projDur) - 1), cal) : ""
  };
}

// Fecha ISO "YYYY-MM-DD" → Date (mediodía UTC para evitar saltos de huso).
export function parseISO(s: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
}

// Suma n días LABORABLES a una fecha, saltando días no laborables y
// feriados del calendario. n≥0 cuenta hacia adelante desde el primer día
// laborable ≥ fecha (offset 0 = ese primer día laborable). Devuelve ISO.
export function addWorkingDays(date: Date | null, n: number, calendar?: { workDayIdx?: number[]; holidays?: string[] } | null): string {
  if (!date) return "";
  const cal = calendar || { workDayIdx: [1, 2, 3, 4, 5], holidays: [] };
  const work: Record<number, boolean> = {}; (cal.workDayIdx || [1, 2, 3, 4, 5]).forEach((d) => { work[d] = true; });
  const hol: Record<string, boolean> = {}; (cal.holidays || []).forEach((h) => { hol[String(h).slice(0, 10)] = true; });
  function iso(d: Date): string { return d.toISOString().slice(0, 10); }
  function isWork(d: Date): boolean { return !!work[d.getUTCDay()] && !hol[iso(d)]; }
  const d = new Date(date.getTime());
  while (!isWork(d)) d.setUTCDate(d.getUTCDate() + 1); // alinear al primer día laborable
  let count = 0;
  while (count < n) { d.setUTCDate(d.getUTCDate() + 1); if (isWork(d)) count++; }
  return iso(d);
}

export interface ScheduleStats {
  hasSlice: boolean; links: number; activities: number; ok: boolean;
  projectDuration: number | null; criticalCount: number; finishDate: string;
}

// Resumen del cronograma del proyecto activo para tableros (Panel):
// duración, n.º de actividades críticas y de enlaces. Usa la duración
// determinística (Met/Rend) vía pertStats, igual que el módulo por defecto.
export function scheduleStats(): ScheduleStats {
  let sched: ScheduleModule | null = null, m: ProjectMeta | null = null, nodes: CpmNode[] = [];
  try { sched = getModule("schedule") as ScheduleModule | null; } catch (e) { /* noop */ }
  const links = (sched && Array.isArray(sched.links)) ? sched.links : [];
  try {
    const ps = pertStats(getModule("pert") as PertModule | null, getModule("activities") as ActivitiesModule | null, getModule("wbs") as WbsModule | null);
    nodes = (ps.rows || []).map((r) => ({ id: r.id, dur: r.dur || 0 }));
  } catch (e2) { /* noop */ }
  try { m = meta(); } catch (e3) { /* noop */ }
  const result = cpm(nodes, links, projectCalendar(), { startDate: m ? m.startDate : undefined });
  return {
    hasSlice: !!sched, links: links.length, activities: nodes.length, ok: result.ok,
    projectDuration: result.ok ? result.projectDuration : null,
    criticalCount: result.ok ? result.criticalIds.length : 0,
    finishDate: result.ok ? result.projectFinishDate : ""
  };
}

// =================================================================
// GPI.ui — helpers de interfaz compartidos (Fase 3 de MIGRATION.md).
//
// Alcance deliberadamente acotado a lo que de verdad está duplicado
// byte-a-byte entre módulos, verificado antes de escribir esto:
//   - esc(): lógica IDÉNTICA en 9 de los 13 HTML (8 la llaman "esc", uno
//     -WBS_Builder.html- la llama "escapeHtml"). Segura de unificar.
//   - kpi(): NO se unifica. Solo Panel_Control.html tiene una función
//     kpi() (fila valor+unidad+etiqueta). Cost-management.html y
//     Recopilar_Requisitos.html usan la clase CSS ".kpi" para una TARJETA
//     visualmente distinta (borde+fondo+.lab/.val) -- es una colisión de
//     nombre entre dos componentes distintos, no una duplicación real.
//     GPI.ui.kpi() replica fielmente la única implementación real (la de
//     Panel_Control) para cuando ese módulo se migre en la Fase 4; los
//     otros dos módulos deciden su propio nombre de clase al migrar, para
//     no chocar con esta.
//   - Los modales (.modal-overlay/.modal-card) NO se unifican en JS aquí:
//     hay al menos 5 firmas de función distintas entre los 13 archivos
//     (showModal(opts), showModal({title,message,confirmText,...}),
//     baseModal/confirmModal/promptModal, openFormModal, confirmModal
//     posicional, showModalHTML). Unificar esas firmas es un rediseño,
//     no una extracción de código duplicado -- contradice el principio
//     "port mecánico, no refactor" de la Fase 1. Lo que SÍ es idéntico
//     entre 11 archivos es la CSS del contenedor (.modal-overlay,
//     .modal-overlay.open, .modal-actions): eso vive en gpi-shared.css,
//     no aquí.
// =================================================================

export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

// Fila KPI "valor + unidad opcional + etiqueta", tal como la usa
// Panel_Control.html (única implementación real de esta función hoy).
export function kpi(v: unknown, u: string | null | undefined, l: string): string {
  return '<div class="kpi"><span class="v">' + esc(String(v)) + "</span>"
    + (u ? '<span class="u">' + esc(u) + "</span>" : "")
    + '<span class="l">' + esc(l) + "</span></div>";
}

export const ui = { esc, kpi };

// =================================================================
// Ensamblado de GPI.util y GPI, y adjunto a window para consumo desde
// los 13 módulos HTML como script clásico (no como módulo ES).
// =================================================================

export const util = {
  wbsRollup, wbsResources, wbsCodes, wbsLeaves, obsNodes, obsLabel,
  raciResponsibleIds, applyRaciToWbs, applyScheduleToWbs, costEstimateRows, costEstimateTotal,
  applyCostEstimateToWbs, wbsPhases, activitiesStats, pertStats,
  pertProbability, charterAudit, schedulePlanAudit, raciCoverage, raciAudit,
  costSummary, pad2, charterRans, requirementsAudit, reqByWbsLeaf,
  scopeDeliverables, wbsDelIds, scopeAudit, traceMatrix,
  parsePredecessorCell, buildScheduleLinks, scheduleValidate,
  projectCalendar, cpm, parseISO, addWorkingDays, scheduleStats
};

// Objeto agregado, exportado por conveniencia (p. ej. `import { GPI } from
// "./gpi-core"` en tests). NO se asigna a mano a window: el build de Vite en
// modo librería (format iife, name "GPI") ya vuelca CADA named export de
// este módulo sobre window.GPI, replicando la superficie de la API original
// (GPI.getModule, GPI.util.cpm, GPI.schema, etc.). Asignar este objeto a
// window.GPI a mano lo pisaría, perdiendo el resto de los named exports.
export const schema = SCHEMA;

export const GPI = {
  KEY,
  schema,
  available: avail,
  defaultMeta,
  raw: db,
  listProjects,
  activeId,
  active,
  meta,
  getModule,
  setActive,
  patchMeta,
  setModule,
  writeModule,
  openSession,
  rebaseSession,
  saveModule,
  saveMeta,
  saveState,
  describeWrite,
  lastReconcile,
  createProject,
  renameProject,
  duplicateProject,
  deleteProject,
  exportActive,
  hasUnsavedChanges,
  importProject,
  ingestToolExport,
  onChange,
  util,
  ui
};
