/* =========================================================
   Panel de Control — Centro de proyectos e integración de herramientas
   Port mecánico del <script> inline de Panel_Control.html (Fase 4 de
   MIGRATION.md, ÚLTIMO módulo — punto de entrada del ecosistema): misma
   lógica, mismo comportamiento. Se agregan tipos y se compila a
   panel-control.js (IIFE) para que el HTML lo cargue como
   <script src="panel-control.js"> en vez de tenerlo inline.

   REGLA NO NEGOCIABLE (MIGRATION.md): MODULES / MODULOS_ENTREGADOS /
   MODULOS_EXTRA / probeModules quedan exactamente como en el original,
   ni un carácter de lógica cambiado -- son la única zona que el
   profesorado edita para entregar módulos.

   Particularidad de tipado: a diferencia de TODOS los demás módulos
   (que usan `window.GPI` explícito o verifican `typeof window.GPI`),
   este archivo referencia `GPI` como identificador global BARE, sin
   ninguna verificación de undefined en ningún punto del script real
   (el único `if (window.GPI …)` que aparece es dentro de un STRING de
   documentación para otros autores, no código ejecutable). Esto es
   intencional: Panel_Control.html es el punto de entrada y depende
   incondicionalmente de gpi-core.js -- no tiene, ni necesita, el modo
   "funciona sin el núcleo" de los otros 12 módulos.

   El global ambiental `var GPI` ya lo declara `src/modules/cost/main.ts`
   como `GpiApi | undefined` (TypeScript exige que todas las
   declaraciones `var` de un mismo global, en cualquier archivo del
   proyecto, compartan el mismo tipo -- no se puede volver a declarar
   aquí como no-opcional sin chocar). En vez de sembrar `GPI!` en cada
   uno de los ~90 sitios donde el original lo usa sin comprobarlo, se
   liga una constante de módulo no-nula una sola vez.
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { ProjectModules } from "../../core/types";

type GpiApi = typeof GpiCore.GPI;
// MODULES.key es un string suelto (incluye claves de MODULOS_EXTRA que el
// profesorado puede inventar y que ProjectModules no puede conocer de
// antemano); este alias documenta exactamente qué se está afirmando al
// pasarlo a GPI.getModule, en vez de silenciar el chequeo con `any`.
type ModuleKey = keyof ProjectModules;
declare global { interface Window { GPI?: GpiApi; } }
const GPI: GpiApi = window.GPI as GpiApi;

/* ══════════════════════════════════════════════════════════════════════
   ①  ENTREGA DE MÓDULOS  —  EDITAR AQUÍ (única zona que necesitas tocar)
   ══════════════════════════════════════════════════════════════════════
   Controla qué herramientas puede abrir el alumno. Los módulos que no
   estén entregados siguen visibles en el Panel (para que vean el mapa
   completo del curso) pero aparecen bloqueados, sin enlace roto.

   Tres formas de usarlo:

     "*"        → entrega TODO lo que esté construido (modo profesor)
     "auto"     → detecta solos qué archivos .html copiaste junto al Panel
                  (requiere servidor: GitHub Pages o python3 -m http.server;
                   con doble clic / file:// no puede detectar y muestra todo)
     [ "..." ]  → lista explícita de claves entregadas (modo recomendado)

   Las CLAVES son las de la columna "key" de la tabla MODULES de abajo:
     charter · stakeholders · requirements · scopeStatement · wbs
     activities · pert · schedulePlan · schedule · cost · obs · raci

   Para entregar un módulo más la próxima semana, solo agrega su clave
   a esta lista y vuelve a publicar. Nada más cambia.
──────────────────────────────────────────────────────────────────────── */

const MODULOS_ENTREGADOS: "*" | "auto" | string[] = "*";

/* ══════════════════════════════════════════════════════════════════════
   ②  MÓDULOS PROPIOS  —  para agregar herramientas nuevas al ecosistema
   ══════════════════════════════════════════════════════════════════════
   Cada módulo nuevo que construyas se registra aquí (no hace falta tocar
   la tabla MODULES original). Copia el bloque comentado y complétalo:

     key    clave única; también es el nombre de su "rebanada" de datos
            en el proyecto: GPI.getModule("miClave") / GPI.setModule(...)
     group  área del PMBOK donde aparece la tarjeta: integ · stake ·
            scope · sched · cost · qual · res · comm · risk · proc
     name   título visible de la tarjeta
     file   nombre del archivo .html (debe estar en la MISMA carpeta)
     icon   un emoji o carácter
     color  color de acento en hexadecimal
     desc   descripción que lee el alumno en la tarjeta

   Recuerda agregar su "key" a MODULOS_ENTREGADOS para que se pueda abrir.
──────────────────────────────────────────────────────────────────────── */

interface ModuleDef { key: string; group: string; name: string; file: string | null; icon: string; color: string; desc: string; }

const MODULOS_EXTRA: ModuleDef[] = [
  // {
  //   key:"riesgos", group:"risk", name:"Gestión de Riesgos",
  //   file:"Risk_Register.html", icon:"⚠", color:"#ff9f1c",
  //   desc:"Registro de riesgos, matriz probabilidad–impacto y plan de respuesta."
  // }
];

const CUR: Record<string, string> = { USD: "USD $", PEN: "S/", EUR: "€" };

interface GroupDef { key: string; name: string; hint: string; }
// Áreas de conocimiento / dominios del PMBOK 8, en orden de despliegue.
const GROUPS: GroupDef[] = [
  { key: "integ", name: "Integración", hint: "dirige y unifica el proyecto de principio a fin" },
  { key: "stake", name: "Interesados", hint: "identificación y compromiso de las partes interesadas" },
  { key: "scope", name: "Alcance", hint: "qué incluye y qué no incluye el proyecto" },
  { key: "sched", name: "Cronograma", hint: "actividades, duraciones y ruta crítica" },
  { key: "cost", name: "Costo", hint: "estimación, presupuesto y control del gasto" },
  { key: "qual", name: "Calidad", hint: "requisitos de calidad y su aseguramiento" },
  { key: "res", name: "Recursos", hint: "equipo, organigrama y asignación de responsabilidades" },
  { key: "comm", name: "Comunicaciones", hint: "flujo de información entre los involucrados" },
  { key: "risk", name: "Riesgos", hint: "incertidumbre, respuesta y análisis cuantitativo" },
  { key: "proc", name: "Adquisiciones", hint: "contratación y gestión de proveedores" }
];

let MODULES: ModuleDef[] = [
  // — Integración —
  { key: "charter", group: "integ", name: "Acta de Constitución", file: "Project_Charter.html", icon: "📜", color: "#00967f",
    desc: "Project Charter (PMBOK): propósito, objetivos y criterios de éxito, hitos, presupuesto, supuestos, restricciones, exclusiones y aprobación formal del proyecto." },
  { key: "pmplan", group: "integ", name: "Plan para la Dirección", file: null, icon: "📘", color: "#00967f",
    desc: "Documento integrador que consolida los planes subsidiarios y las líneas base de alcance, cronograma y costo." },
  { key: "changes", group: "integ", name: "Control Integrado de Cambios", file: null, icon: "🔁", color: "#00967f",
    desc: "Registro de solicitudes de cambio, evaluación de impacto, decisión del CCB y actualización de las líneas base." },
  { key: "closeout", group: "integ", name: "Cierre del Proyecto", file: null, icon: "🏁", color: "#00967f",
    desc: "Aceptación de entregables, liberación de recursos, lecciones aprendidas y cierre administrativo y contractual." },

  // — Interesados —
  { key: "stakeholders", group: "stake", name: "Stakeholder Studio", file: "Stakeholder_Studio.html", icon: "◉", color: "#00b6ec",
    desc: "Registro y análisis de interesados: matriz poder–interés, modelo de prominencia y matriz de compromiso." },

  // — Alcance — (orden PMBOK: Recopilar Requisitos → Enunciado del Alcance → Crear la EDT)
  { key: "requirements", group: "scope", name: "Recopilar Requisitos", file: "Recopilar_Requisitos.html", icon: "📝", color: "#6c5ce7",
    desc: "Matriz de trazabilidad de requisitos: cada REQ.00X enlaza el RAN del Acta y el interesado que lo origina. Separa la línea base de sus modificaciones de alcance." },
  { key: "scopeStatement", group: "scope", name: "Enunciado del Alcance", file: "Enunciado_del_Alcance.html", icon: "🎯", color: "#6c5ce7",
    desc: "Definir el Alcance (PMBOK 8): descripción del alcance, entregables (DEL.0X) con criterios de aceptación, y supuestos/restricciones/exclusiones. Es el puente que agrupa los REQ en entregables; la EDT descompone esos entregables, no los requisitos." },
  { key: "wbs", group: "scope", name: "WBS Builder", file: "WBS_Builder.html", icon: "▦", color: "#6c5ce7",
    desc: "Estructura de desglose del trabajo con costo, duración, avance y diccionario WBS. Siembra sus ramas desde los entregables del Enunciado del Alcance." },

  // — Cronograma — (orden: Plan de Gestión → Definir Actividades → PERT → CPM)
  { key: "schedulePlan", group: "sched", name: "Plan de Gestión del Cronograma", file: "Schedule_Management_Plan.html", icon: "📋", color: "#3a86ff",
    desc: "Metodología, calendario, umbrales de control, hitos, reserva y reglas de medición del desempeño (AACE RP 38R-06 / PMBOK)." },
  { key: "activities", group: "sched", name: "Definir las Actividades", file: "Activity_Definition.html", icon: "☰", color: "#e56a10",
    desc: "Descompone cada paquete de trabajo de la EDT en actividades con unidad de medida y metrado: la base para estimar duraciones, recursos y costos del cronograma." },
  { key: "pert", group: "sched", name: "Análisis PERT", file: "Pert_Analysis.html", icon: "σ", color: "#8f2fd0",
    desc: "Estimación probabilística de duraciones: por cada actividad, Optimista / Más probable / Pesimista con TE = (O+4M+P)/6, σ y σ². La M automática sigue a la duración por rendimiento de cuadrillas." },
  { key: "schedule", group: "sched", name: "Cronograma / CPM", file: "Cronograma_CPM.html", icon: "⏱", color: "#00c2a8",
    desc: "Red de precedencias (pegado desde MS Project/Excel), ruta crítica, holguras y diagrama de Gantt." },

  // — Costo —
  { key: "cost", group: "cost", name: "Planificar la Gestión Financiera", file: "Cost-management.html", icon: "S/", color: "#0093c0",
    desc: "Plan de gestión de costos (PMBOK 8 + AACE): moneda, clase de estimado, contingencia e inflación, umbrales CV/CPI, órdenes de cambio y documento BOE. Toma la estimación base de la EDT o de Estimar los Costos." },
  { key: "costEstimate", group: "cost", name: "Estimar los Costos", file: "Estimar_Costos.html", icon: "🧮", color: "#00967f",
    desc: "Estimación de costo por paquete de trabajo (Unidad, Cantidad, Precio unitario → Subtotal), importada/exportada desde un .xlsx verificado por Código EDT y nombre contra la EDT. Alimenta el costo real del WBS y la línea base de Planificar la Gestión Financiera." },
  { key: "evm", group: "cost", name: "Valor Ganado (EVM)", file: "Valor_Ganado.html", icon: "📈", color: "#2e4374",
    desc: "Seguimiento del valor ganado: PV sobre la línea base del cronograma, EV con técnica por paquete, AC, CV, SV, CPI, SPI, pronósticos (EAC/ETC/VAC/TCPI) y cronograma ganado (Earned Schedule), con los umbrales de los planes de Costos y del Cronograma." },

  // — Calidad —
  { key: "quality", group: "qual", name: "Gestión de la Calidad", file: null, icon: "✔", color: "#00c2a8",
    desc: "Métricas de calidad, plan de aseguramiento y control, y costo de la calidad (conformidad vs. no conformidad)." },

  // — Recursos —
  { key: "obs", group: "res", name: "Equipo del Proyecto", file: "OBS_Builder.html", icon: "🗂", color: "#2e4374",
    desc: "Organigrama del equipo del proyecto (OBS): roles, tipo de autoridad y personas asignadas." },
  { key: "raci", group: "res", name: "Matriz RACI", file: "RACI_Matrix.html", icon: "▤", color: "#ff6b8b",
    desc: "Intersección EDT × OBS a nivel de paquete de trabajo: asigna R/A/C/I y sincroniza el responsable con el WBS." },

  // — Comunicaciones —
  { key: "comms", group: "comm", name: "Gestión de las Comunicaciones", file: null, icon: "📣", color: "#3a86ff",
    desc: "Matriz de comunicaciones: qué información, a quién, cuándo, por qué medio y con qué frecuencia." },

  // — Riesgos —
  { key: "risks", group: "risk", name: "Gestión de Riesgos", file: "Risk_Register.html", icon: "⚠", color: "#ff9f1c",
    desc: "Registro de riesgos (PMBOK + AACE): enunciado causa–evento–efecto, RBS, matriz probabilidad–impacto con umbrales del plan, estrategias para amenazas y oportunidades, riesgo residual y valor esperado." },
  { key: "montecarlo", group: "risk", name: "Simulación Monte Carlo", file: null, icon: "🎲", color: "#ff6b8b",
    desc: "Riesgo cuantitativo de costo y plazo: histograma, curva S y tornado." },

  // — Adquisiciones —
  { key: "procurement", group: "proc", name: "Gestión de las Adquisiciones", file: null, icon: "📦", color: "#8f2fd0",
    desc: "Estrategia de contratación, tipos de contrato, criterios de selección y administración de proveedores." }
];

// ─── Aplicación de la configuración de entrega ────────────────────────
// Se incorporan los módulos propios y se marca cada tarjeta con su estado:
//   built     → existe un archivo .html construido para ese módulo
//   delivered → además está entregado al alumno (según MODULOS_ENTREGADOS)
// Un módulo construido pero no entregado se muestra bloqueado, sin enlace,
// para que el alumno vea el mapa completo del curso sin toparse con un 404.
MODULES = MODULES.concat(
  (Array.isArray(MODULOS_EXTRA) ? MODULOS_EXTRA : []).filter((m) => {
    return m && m.key && m.file && !MODULES.some((x) => x.key === m.key);
  })
);

let autoProbe: Record<string, boolean> | null = null; // se llena en modo "auto": { key: true|false }

function isDelivered(mod: ModuleDef): boolean {
  if (!mod.file) return false;                 // aún no construido
  if (MODULOS_ENTREGADOS === "*") return true;
  if (MODULOS_ENTREGADOS === "auto") {
    if (!autoProbe) return true;               // sin sondeo posible: no bloquear
    return autoProbe[mod.key] !== false;
  }
  return Array.isArray(MODULOS_ENTREGADOS) && MODULOS_ENTREGADOS.indexOf(mod.key) !== -1;
}

// Modo "auto": comprueba qué archivos existen realmente junto al Panel.
// Solo funciona servido por http(s); con file:// el navegador bloquea la
// comprobación, así que se deja pasar todo (comportamiento anterior).
function probeModules(done: () => void): void {
  if (MODULOS_ENTREGADOS !== "auto") { done(); return; }
  if (location.protocol === "file:" || typeof fetch !== "function") { done(); return; }
  const pend = MODULES.filter((m) => !!m.file);
  if (!pend.length) { done(); return; }
  const res: Record<string, boolean> = {}; let left = pend.length;
  pend.forEach((m) => {
    fetch(m.file as string, { method: "HEAD" })
      .then((r) => { res[m.key] = r.ok; })
      .catch(() => { res[m.key] = false; })
      .then(() => { if (--left === 0) { autoProbe = res; done(); } });
  });
}

const CAT_COLORS: Record<string, string> = { Interno: "#00b6ec", Cliente: "#00c2a8", Regulador: "#2e4374", Comunidad: "#ff9f1c", Proveedor: "#6c5ce7", Financiero: "#ff6b8b" };
const OBS_TYPE_COLORS: Record<string, string> = { patrocinio: "#2e4374", direccion: "#00b6ec", core: "#6c5ce7", funcional: "#00c2a8", externo: "#ff9f1c" };
const OBS_TYPE_LABELS: Record<string, string> = { patrocinio: "Patrocinio", direccion: "Dirección de Proyecto", core: "Equipo Core", funcional: "Área Funcional", externo: "Externo / Proveedor" };

interface MetaFieldDef { k: string; l: string; full?: boolean; area?: boolean; type?: string; }
const META_FIELDS: MetaFieldDef[] = [
  { k: "name", l: "Nombre del proyecto", full: true },
  { k: "code", l: "Código / N.º" },
  { k: "client", l: "Cliente" },
  { k: "location", l: "Ubicación" },
  { k: "sponsor", l: "Patrocinador (Sponsor)" },
  { k: "manager", l: "Director de proyecto" },
  { k: "startDate", l: "Inicio", type: "date" },
  { k: "endDate", l: "Fin", type: "date" },
  { k: "currency", l: "Moneda" },
  { k: "capex", l: "Presupuesto (CAPEX)", type: "number" },
  { k: "course", l: "Curso" },
  { k: "description", l: "Descripción", full: true, area: true }
];

function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function money(v: unknown, cur: string | undefined): string { const n = Number(v); if (!isFinite(n) || (!v && v !== 0)) return "—"; return (CUR[cur || ""] || "$") + " " + n.toLocaleString("es-PE"); }
function setStatus(m: string): void { (document.getElementById("statusLeft") as HTMLElement).textContent = m; }
function toast(m: string): void {
  const t = document.getElementById("toast") as HTMLElement & { _t?: ReturnType<typeof setTimeout> };
  t.textContent = m; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => { t.classList.remove("show"); }, 1900);
}

// ---------- seed ----------
function ensureSeed(): void {
  if (GPI.listProjects().length) return;
  GPI.createProject({
    name: "DISTRIB+ S.A. — Almacén Lurín", code: "DPLU-2026", client: "DISTRIB+ S.A.",
    location: "Lurín, Lima", sponsor: "Gerencia General DISTRIB+", manager: "",
    startDate: "2026-07-06", endDate: "2026-11-06", currency: "USD", capex: "8500000",
    description: "Construcción de un almacén logístico para DISTRIB+ S.A. en Lurín. Caso pedagógico compartido por todas las herramientas del curso."
  });
}

// ---------- render ----------
function render(): void {
  const avail = GPI.available();
  (document.getElementById("banner") as HTMLElement).classList.toggle("show", !avail);
  if (!avail) (document.getElementById("banner") as HTMLElement).innerHTML =
    "<b>Vista previa sin almacenamiento persistente.</b> Para que las herramientas compartan datos de forma automática, descarga los archivos y ábrelos desde un servidor local o GitHub Pages (mismo origen). Aquí puedes explorar el panel, pero los cambios no se guardarán entre pestañas.";

  renderProjBar();
  renderMeta();
  renderLauncher();
  renderDashboard();
  renderInteg();
}

function renderProjBar(): void {
  const sel = document.getElementById("projSelect") as HTMLSelectElement;
  const list = GPI.listProjects(), active = GPI.activeId();
  sel.innerHTML = list.map((p) => '<option value="' + p.id + '" ' + (p.id === active ? "selected" : "") + '>' + esc(p.name) + (p.code ? " · " + esc(p.code) : "") + '</option>').join("");
  (document.getElementById("btnDel") as HTMLButtonElement).disabled = list.length <= 1;
}

function renderMeta(): void {
  const m: Record<string, unknown> = (GPI.meta() as unknown as Record<string, unknown>) || {};
  (document.getElementById("metaGrid") as HTMLElement).innerHTML = META_FIELDS.map((f) => {
    const val = esc(m[f.k] == null ? "" : m[f.k]);
    const ctrl = f.area
      ? '<textarea data-k="' + f.k + '">' + val + '</textarea>'
      : '<input data-k="' + f.k + '" ' + (f.type ? 'type="' + f.type + '"' : '') + ' value="' + val + '">';
    return '<div class="field' + (f.full ? ' full' : '') + '"><label>' + esc(f.l) + '</label>' + ctrl + '</div>';
  }).join("");
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("#metaGrid [data-k]").forEach((el) => {
    el.addEventListener("input", () => {
      const patch: Record<string, unknown> = {}; patch[el.dataset.k as string] = el.value; GPI.patchMeta(patch);
      // refrescos ligeros que dependen de meta
      if (el.dataset.k === "name") renderProjBar();
      if (el.dataset.k === "capex" || el.dataset.k === "currency") renderDashboard();
      setStatus("Metadatos actualizados.");
    });
  });
}

interface StatChip { v: string | number; l: string; }
// Nota de tipado: las funciones GPI.util.* de abajo ya aceptan
// `T | null | undefined` y hacen internamente el mismo `|| {}` que antes
// se repetía en cada sitio de llamada -- por eso se les pasa el resultado
// de GPI.getModule(...) directo, sin ningún `|| ({} as any)` de por medio.
function statChips(key: string): StatChip[] | null {
  if (key === "charter") {
    const ch = GPI.getModule("charter");
    const a = GPI.util.charterAudit(ch);
    const milC = (ch?.milestones || []).filter((m) => m && (m.name || "").trim()).length;
    return [{ v: a.pct + "%", l: "completitud del acta" }, { v: milC, l: "hitos declarados" }];
  }
  if (key === "stakeholders") {
    const mod = GPI.getModule("stakeholders");
    const arr = mod?.stakeholders || [];
    const close = arr.filter((s) => (s.power ?? 0) >= 50 && (s.interest ?? 0) >= 50).length;
    return [{ v: arr.length, l: "interesados" }, { v: close, l: "gestionar de cerca" }];
  }
  if (key === "risks") {
    const pf = GPI.util.riskPortfolio(GPI.getModule("risks"));
    return [{ v: pf.open, l: "riesgos abiertos" }, { v: pf.byLevel.alto, l: "de nivel alto" }];
  }
  if (key === "requirements") {
    const rq = GPI.getModule("requirements");
    const ra = GPI.util.requirementsAudit(rq, GPI.getModule("charter"), GPI.getModule("wbs"));
    const ver = ra.baselineFrozen ? ("LB " + (ra.baselineVersion || "1.0")) : "sin LB";
    return [{ v: ra.total, l: "requisitos (REQ)" }, { v: ra.tracePct + "%", l: "trazados a la EDT · " + ver }];
  }
  if (key === "scopeStatement") {
    const sc = GPI.getModule("scopeStatement");
    const sa = GPI.util.scopeAudit(sc, GPI.getModule("requirements"), GPI.getModule("charter"), GPI.getModule("wbs"));
    const lbS = sa.baselineFrozen ? ("LB v" + (sa.baselineVersion || "1.0")) : "sin LB";
    return [{ v: sa.total, l: "entregables (DEL)" }, { v: sa.decompPct + "%", l: "descompuestos en EDT · " + lbS }];
  }
  if (key === "wbs") {
    const w = GPI.getModule("wbs"); const r = GPI.util.wbsRollup(w);
    return [{ v: r.leafCount, l: "paquetes (hojas)" }, { v: money(r.cost, GPI.meta()?.currency).replace(/^\S+\s/, ''), l: "costo hoja" }];
  }
  if (key === "activities") {
    const act = GPI.getModule("activities");
    const as = GPI.util.activitiesStats(act, GPI.getModule("wbs"));
    return [{ v: as.total, l: "actividades" }, { v: as.covered + "/" + as.leaves, l: "paquetes cubiertos" }];
  }
  if (key === "pert") {
    const pertMod = GPI.getModule("pert");
    const ps = GPI.util.pertStats(pertMod, GPI.getModule("activities"), GPI.getModule("wbs"));
    return [{ v: ps.complete + "/" + ps.total, l: "ternas O-M-P" }, { v: ps.invalid, l: "ternas inválidas" }];
  }
  if (key === "obs") {
    const o = GPI.getModule("obs"); const roles = GPI.util.obsNodes(o);
    const covered = roles.filter((n) => (n.person || "").trim()).length;
    return [{ v: roles.length, l: "puestos" }, { v: covered, l: "con persona" }];
  }
  if (key === "raci") {
    const raci = GPI.getModule("raci"); const wbs = GPI.getModule("wbs");
    const cov = GPI.util.raciCoverage(raci, wbs);
    return [{ v: cov.withR + "/" + cov.total, l: "paquetes con R" }, { v: cov.withoutA.length, l: "sin aprobador" }];
  }
  if (key === "schedulePlan") {
    const sp = GPI.getModule("schedulePlan");
    const audit = GPI.util.schedulePlanAudit(sp);
    const milCount = (sp?.milestones || []).length;
    return [{ v: audit.pct + "%", l: "completitud del plan" }, { v: milCount, l: "hitos definidos" }];
  }
  if (key === "cost") {
    const cm = GPI.getModule("cost");
    const cs = GPI.util.costSummary(cm);
    const cur = GPI.meta()?.currency;
    // BAC vigente: incluye lo ya incorporado a la línea base con una versión LB-n (sin incorporaciones = el inicial).
    const bacNow = cs.bacCurrent || cs.bac;
    const bacTxt = bacNow ? money(bacNow, cur).replace(/^\S+\s/, '') : "—";
    return [{ v: bacTxt, l: (bacNow !== cs.bac ? "BAC vigente (" : "BAC (") + (CUR[cur || ""] || "$").replace(/\s.*/, '') + ")" }, { v: cs.changeOrders, l: "órdenes de cambio" }];
  }
  return null;
}

function moduleCard(mod: ModuleDef): string {
  const built = !!mod.file;              // existe el archivo del módulo
  const open = isDelivered(mod);         // además está entregado al alumno
  const locked = built && !open;         // construido pero aún no entregado
  const stats = open ? statChips(mod.key) : null;
  const hasData = open && !!GPI.getModule(mod.key as ModuleKey);
  const pill = !built ? '<span class="pill soon">próximamente</span>'
    : locked ? '<span class="pill locked">no entregado aún</span>'
      : (hasData ? '<span class="pill on">con datos</span>' : '<span class="pill off">vacío</span>');
  const statsHtml = stats ? '<div class="mod-stats">' + stats.map((s) => '<div class="mod-stat"><div class="v">' + esc(String(s.v)) + '</div><div class="l">' + esc(s.l) + '</div></div>').join("") + '</div>' : '';
  const actions = !built
    ? '<button class="btn sm" disabled>En desarrollo</button>'
    : locked
      ? '<button class="btn sm" disabled title="Tu profesor habilitará esta herramienta más adelante">🔒 Se habilita más adelante</button>'
      : '<a class="btn sm primary" href="' + mod.file + '">Abrir ▸</a>'
      + '<button class="btn sm" data-import="' + mod.key + '">⭱ Importar .json</button>'
      + (hasData ? '<button class="btn sm" data-clear="' + mod.key + '">Vaciar</button>' : '');
  return '<div class="mod-card ' + (open ? 'active' : 'soon') + '">' + pill
    + '<div class="mod-top"><div class="mod-ic" style="background:' + mod.color + '">' + mod.icon + '</div>'
    + '<div><div class="mod-name">' + esc(mod.name) + '</div></div></div>'
    + '<div class="mod-desc">' + esc(mod.desc) + '</div>'
    + statsHtml
    + '<div class="mod-actions">' + actions + '</div></div>';
}

function renderLauncher(): void {
  const html = GROUPS.map((g) => {
    const mods = MODULES.filter((m) => m.group === g.key);
    if (!mods.length) return "";
    const ready = mods.filter(isDelivered).length;
    let ribbon = "";
    if (g.key === "scope") {
      const steps = ["Recopilar Requisitos", "Enunciado del Alcance", "Crear la EDT (WBS)"];
      ribbon = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;padding:9px 13px;background:linear-gradient(180deg,#faf9ff,#fff);border:1px solid var(--panel-border);border-radius:10px;font-size:12px;color:var(--ink-1)">'
        + '<span style="font-family:var(--display);font-weight:800;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-2)">Flujo recomendado</span>'
        + steps.map((s, i) => {
          return (i ? '<span style="color:var(--ink-2);font-family:var(--mono)">→</span>' : '')
            + '<span style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--panel-border);border-radius:20px;padding:4px 11px;font-weight:600">'
            + '<span style="font-family:var(--mono);font-weight:700;font-size:10px;width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--cat-prov);color:#fff">' + (i + 1) + '</span>' + esc(s) + '</span>';
        }).join("")
        + '<span style="color:var(--ink-2);margin-left:4px">— la EDT descompone <b>entregables</b>, no requisitos.</span></div>';
    }
    return '<h2 class="section">' + esc(g.name)
      + ' <span class="hint">— ' + esc(g.hint) + ' · ' + ready + '/' + mods.length + ' disponibles</span></h2>'
      + ribbon
      + '<div class="launch-grid">' + mods.map(moduleCard).join("") + '</div>';
  }).join("");
  (document.getElementById("launchGrid") as HTMLElement).innerHTML = html;

  document.querySelectorAll<HTMLElement>("#launchGrid [data-import]").forEach((b) => {
    b.addEventListener("click", () => { importToolInto(); });
  });
  document.querySelectorAll<HTMLElement>("#launchGrid [data-clear]").forEach((b) => {
    b.addEventListener("click", () => {
      confirmModal("Vaciar módulo", "¿Borrar los datos de este módulo en el proyecto activo? (no afecta a los demás módulos)", () => {
        GPI.setModule(b.dataset.clear as string, null); render(); toast("Módulo vaciado");
      });
    });
  });
}

function renderDashboard(): void {
  const meta = GPI.meta();
  const sh = GPI.getModule("stakeholders")?.stakeholders || [];
  const wbs = GPI.getModule("wbs");
  const roll = GPI.util.wbsRollup(wbs);
  const cards: string[] = [];

  // KPIs
  cards.push('<div class="dash-card"><h4>Resumen</h4>'
    + kpi(sh.length, "", "interesados registrados")
    + kpi(roll.leafCount, "", "paquetes de trabajo (hojas de la EDT)")
    + kpi(money(roll.cost, meta?.currency), "", "costo estimado (suma de hojas)")
    + '</div>');

  // CAPEX vs WBS
  const capex = Number(meta?.capex) || 0;
  const pct = capex > 0 ? Math.min(100, Math.round(roll.cost / capex * 100)) : 0;
  const capBody = capex > 0
    ? '<div class="kpi"><span class="v">' + pct + '%</span><span class="l">del CAPEX presupuestado está desglosado en el WBS</span></div>'
    + '<div class="bar-track" style="margin:4px 0 10px"><div class="bar-fill" style="width:' + pct + '%;background:' + (pct > 100 ? 'var(--danger)' : 'var(--cyan)') + '"></div></div>'
    + '<div class="empty">CAPEX meta: <b>' + money(capex, meta?.currency) + '</b> · WBS: <b>' + money(roll.cost, meta?.currency) + '</b></div>'
    : '<div class="empty">Define el CAPEX en los datos comunes para comparar contra el costo desglosado en el WBS.</div>';
  cards.push('<div class="dash-card"><h4>Presupuesto vs. WBS</h4>' + capBody + '</div>');

  // Recopilar Requisitos: cobertura RAN→REQ y trazabilidad REQ→EDT
  const reqMod = GPI.getModule("requirements");
  const chMod = GPI.getModule("charter");
  const ra = GPI.util.requirementsAudit(reqMod, chMod, wbs);
  if (ra.total > 0 || ra.rans > 0) {
    const rColor = ra.state === "verde" ? "var(--good)" : (ra.state === "ambar" ? "var(--warn)" : "var(--danger)");
    const lbTxt = ra.baselineFrozen ? ('línea base <b>v' + esc(ra.baselineVersion || "1.0") + '</b> congelada' + (ra.changes ? ' · <b>' + ra.changes + '</b> modificación(es) de alcance' : '')) : 'línea base <b>aún no congelada</b>';
    let reqBody = '<div class="kpi"><span class="v" style="color:' + rColor + '">' + ra.tracePct + '%</span><span class="l">de los <b>' + ra.total + '</b> requisitos están trazados a un paquete de la EDT · ' + lbTxt + '</span></div>'
      + '<div class="bar-track" style="margin:4px 0 10px"><div class="bar-fill" style="width:' + ra.tracePct + '%;background:' + rColor + '"></div></div>';
    const reqWarns: string[] = [];
    if (ra.ransUncovered.length) reqWarns.push(ra.ransUncovered.length + ' RAN del Acta sin ningún REQ que lo desarrolle');
    if (ra.reqsWithoutWbs) reqWarns.push(ra.reqsWithoutWbs + ' requisito(s) sin paquete de la EDT');
    if (ra.leavesWithoutReq.length) reqWarns.push(ra.leavesWithoutReq.length + ' paquete(s) de la EDT sin requisito (posible sobre-alcance)');
    if (ra.reqsBrokenWbs) reqWarns.push(ra.reqsBrokenWbs + ' requisito(s) con enlace a un paquete eliminado');
    if (ra.reqsWithoutStk) reqWarns.push(ra.reqsWithoutStk + ' requisito(s) sin interesado de origen');
    if (reqWarns.length) {
      reqBody += '<ul class="warn-list">' + reqWarns.slice(0, 5).map((t) => '<li>' + esc(t) + '</li>').join("") + '</ul>';
    } else {
      reqBody += '<div class="ok-note">✓ Todo RAN tiene REQ, y todo REQ está trazado a la EDT y verificable.</div>';
    }
    cards.push('<div class="dash-card"><h4>Requisitos · trazabilidad</h4>' + reqBody + '</div>');
  }

  // Enunciado del Alcance: coherencia Requisitos ↔ Entregables ↔ EDT
  const scMod = GPI.getModule("scopeStatement");
  const sca = GPI.util.scopeAudit(scMod, reqMod, chMod, wbs);
  if (sca.total > 0 || sca.reqTotal > 0) {
    const sColor = sca.state === "verde" ? "var(--good)" : (sca.state === "ambar" ? "var(--warn)" : "var(--danger)");
    const lbS = sca.baselineFrozen ? ('línea base <b>v' + esc(sca.baselineVersion || "1.0") + '</b> congelada') : 'línea base <b>aún no congelada</b>';
    let scBody = '<div class="kpi"><span class="v" style="color:' + sColor + '">' + sca.total + '</span><span class="l">entregables (DEL) · ' + sca.reqCovPct + '% de los ' + sca.reqTotal + ' REQ tienen entregable · ' + lbS + '</span></div>'
      + '<div class="bar-track" style="margin:4px 0 10px"><div class="bar-fill" style="width:' + sca.decompPct + '%;background:' + sColor + '"></div></div>'
      + '<div class="empty" style="margin:-4px 0 8px">' + sca.decompPct + '% de los entregables ya están descompuestos en la EDT.</div>';
    const scWarns: string[] = [];
    if (sca.delsWithoutReq.length) scWarns.push(sca.delsWithoutReq.length + ' entregable(s) sin ningún REQ que los justifique (posible sobre-alcance)');
    if (sca.reqsWithoutDel.length) scWarns.push(sca.reqsWithoutDel.length + ' requisito(s) sin entregable que los acoja (alcance faltante)');
    if (sca.delsNotDecomposed.length) scWarns.push(sca.delsNotDecomposed.length + ' entregable(s) sin descomponer en la EDT (usa «↧ Sembrar Entregables» en el WBS)');
    if (sca.delsWithoutAccept.length) scWarns.push(sca.delsWithoutAccept.length + ' entregable(s) sin criterio de aceptación');
    if (sca.ransWithoutDel.length) scWarns.push(sca.ransWithoutDel.length + ' RAN del Acta sin entregable que lo materialice');
    if (scWarns.length) {
      scBody += '<ul class="warn-list">' + scWarns.slice(0, 5).map((t) => '<li>' + esc(t) + '</li>').join("") + '</ul>';
    } else {
      scBody += '<div class="ok-note">✓ Todo REQ tiene entregable, cada entregable tiene REQ y criterio, y todos están descompuestos en la EDT.</div>';
    }
    cards.push('<div class="dash-card"><h4>Alcance · coherencia (Entregables)</h4>' + scBody + '</div>');
  }

  // Definir las Actividades: cobertura de paquetes de trabajo con actividades
  const actMod = GPI.getModule("activities");
  if (roll.leafCount > 0) {
    const as = GPI.util.activitiesStats(actMod, wbs);
    const actColor = as.pct >= 100 ? "var(--good)" : (as.pct >= 50 ? "var(--warn)" : "var(--danger)");
    let actBody = '<div class="kpi"><span class="v" style="color:' + actColor + '">' + as.pct + '%</span><span class="l">de los paquetes de trabajo ya tienen actividades definidas (' + as.covered + '/' + as.leaves + ') · <b>' + as.total + '</b> actividades en total</span></div>'
      + '<div class="bar-track" style="margin:4px 0 10px"><div class="bar-fill" style="width:' + as.pct + '%;background:' + actColor + '"></div></div>';
    if (as.uncovered.length) {
      actBody += '<ul class="warn-list">' + as.uncovered.slice(0, 5).map((l) => '<li><span class="tag">' + esc(l.code) + '</span>' + esc(l.name) + '</li>').join("")
        + (as.uncovered.length > 5 ? '<li class="empty">…y ' + (as.uncovered.length - 5) + ' paquetes más sin actividades</li>' : '') + '</ul>';
    } else {
      actBody += '<div class="ok-note">✓ Todos los paquetes de trabajo están descompuestos en actividades.</div>';
    }
    if (as.orphans) actBody += '<div class="empty" style="margin-top:8px">⚠ ' + as.orphans + ' actividad(es) huérfana(s): su paquete ya no existe en la EDT. Revísalas en Definir las Actividades.</div>';
    cards.push('<div class="dash-card"><h4>Actividades por paquete de trabajo</h4>' + actBody + '</div>');

    // Análisis PERT: cobertura de ternas y comparación TE vs Dur base
    const pertMod = GPI.getModule("pert");
    if (pertMod || as.total > 0) {
      const ps = GPI.util.pertStats(pertMod, actMod, wbs);
      if (ps.total > 0) {
        const pePct = ps.pct;
        const peColor = ps.invalid ? "var(--danger)" : (pePct >= 100 ? "var(--good)" : (pePct >= 50 ? "var(--warn)" : "var(--ink-2)"));
        let peBody = '<div class="kpi"><span class="v" style="color:' + peColor + '">' + ps.complete + '/' + ps.total + '</span><span class="l">actividades con terna O–M–P completa' + (ps.invalid ? ' · <b style="color:var(--danger)">' + ps.invalid + ' inválida(s) (O ≤ M ≤ P roto)</b>' : '') + '</span></div>'
          + '<div class="bar-track" style="margin:4px 0 10px"><div class="bar-fill" style="width:' + pePct + '%;background:' + peColor + '"></div></div>';
        if (ps.complete - ps.invalid > 0) {
          peBody += '<div class="empty">Σ TE (esperada) = <b>' + ps.sumTe.toLocaleString("es-PE", { maximumFractionDigits: 1 }) + ' días</b> · Σ σ² = ' + ps.sumVar.toLocaleString("es-PE", { maximumFractionDigits: 2 }) + '. La probabilidad de cumplimiento del plazo se calcula sobre la ruta crítica en el módulo Cronograma / CPM.</div>';
        } else {
          peBody += '<div class="empty">Estima Optimista y Pesimista por actividad en el Análisis PERT; la M automática ya sigue a la duración por rendimiento de cuadrillas.</div>';
        }
        if (ps.orphans) peBody += '<div class="empty" style="margin-top:8px">⚠ ' + ps.orphans + ' terna(s) huérfana(s): su actividad ya no existe. Revísalas en el Análisis PERT.</div>';
        cards.push('<div class="dash-card"><h4>Análisis PERT</h4>' + peBody + '</div>');
      }
    }
  } else {
    cards.push('<div class="dash-card"><h4>Actividades por paquete de trabajo</h4><div class="empty">Construye primero la EDT en WBS Builder; luego descompón cada paquete de trabajo en actividades con unidad y metrado en Definir las Actividades.</div></div>');
  }

  // Stakeholders by category
  if (sh.length) {
    // String(...) preserva el comportamiento original: en JS, indexar con
    // `s.category` undefined ya usaba la clave "undefined" (coerción
    // implícita a string); esto es lo mismo pero explícito y sin `any`.
    const byCat: Record<string, number> = {}; sh.forEach((s) => { const cat = String(s.category); byCat[cat] = (byCat[cat] || 0) + 1; });
    const max = Math.max.apply(null, Object.keys(byCat).map((k) => byCat[k]));
    const rows = Object.keys(byCat).map((k) => {
      return '<div class="bar-row"><span class="nm">' + esc(k) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.round(byCat[k] / max * 100) + '%;background:' + (CAT_COLORS[k] || '#8992a3') + '"></span></span><span class="n">' + byCat[k] + '</span></div>';
    }).join("");
    cards.push('<div class="dash-card"><h4>Interesados por categoría</h4>' + rows + '</div>');
  } else {
    cards.push('<div class="dash-card"><h4>Interesados por categoría</h4><div class="empty">Abre Stakeholder Studio y registra interesados para ver el desglose aquí.</div></div>');
  }

  // OBS: organigrama por tipo de rol
  const obs = GPI.getModule("obs");
  const roles = GPI.util.obsNodes(obs);
  if (roles.length) {
    const byType: Record<string, number> = {}; roles.forEach((r) => { byType[r.type] = (byType[r.type] || 0) + 1; });
    const maxT = Math.max.apply(null, Object.keys(byType).map((k) => byType[k]));
    const rowsT = Object.keys(byType).map((k) => {
      return '<div class="bar-row"><span class="nm">' + esc(OBS_TYPE_LABELS[k] || k) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.round(byType[k] / maxT * 100) + '%;background:' + (OBS_TYPE_COLORS[k] || '#8992a3') + '"></span></span><span class="n">' + byType[k] + '</span></div>';
    }).join("");
    cards.push('<div class="dash-card"><h4>Equipo del Proyecto (OBS) por tipo de rol</h4>' + rowsT + '</div>');
  } else {
    cards.push('<div class="dash-card"><h4>Equipo del Proyecto (OBS) por tipo de rol</h4><div class="empty">Abre Equipo del Proyecto y registra los puestos del equipo para ver el desglose aquí.</div></div>');
  }

  // Cross-check: responsables del WBS deben provenir de la Matriz RACI (no de interesados)
  const raci = GPI.getModule("raci");
  const leaves = GPI.util.wbsLeaves(wbs);
  if (leaves.length) {
    const cov = GPI.util.raciCoverage(raci, wbs);
    let body: string;
    if (!raci || !raci.assignments || Object.keys(raci.assignments).length === 0) {
      body = '<div class="empty">Completa la Matriz RACI para asignar el Responsable ("R") de cada paquete de trabajo. Esa asignación es la que alimenta el campo "Responsable" del WBS — ya no la lista de interesados.</div>';
    } else if (cov.withoutR.length) {
      body = '<ul class="warn-list">' + cov.withoutR.slice(0, 8).map((l) => '<li><span class="tag">sin R</span>' + esc(l.code + " " + l.name) + '</li>').join("")
        + (cov.withoutR.length > 8 ? '<li class="empty">…y ' + (cov.withoutR.length - 8) + ' más</li>' : '') + '</ul>'
        + '<div class="empty" style="margin-top:8px">Paquetes de trabajo sin Responsable asignado en la Matriz RACI (' + cov.withR + '/' + cov.total + ' cubiertos). El "Responsable" del WBS solo se completa automáticamente para los paquetes que sí tienen un "R" en la RACI.</div>';
    } else {
      body = '<div class="ok-note">✓ Los ' + cov.total + ' paquetes de trabajo tienen Responsable asignado en la Matriz RACI, sincronizado con el WBS.</div>';
    }
    if (cov.withoutA && cov.withoutA.length) {
      body += '<div class="empty" style="margin-top:8px">⚠ ' + cov.withoutA.length + ' paquete(s) sin Aprobador ("A") único definido en la RACI.</div>';
    }
    cards.push('<div class="dash-card"><h4>Coherencia RACI ↔ WBS</h4>' + body + '</div>');
  }

  // Acta de Constitución: índice de completitud (checklist PMBOK)
  const ch = GPI.getModule("charter");
  if (ch) {
    const chAudit = GPI.util.charterAudit(ch);
    const chColor = ({ verde: "var(--good)", ambar: "var(--warn)", rojo: "var(--danger)" } as Record<string, string>)[chAudit.state] || "var(--ink-2)";
    const chLabel = ({ verde: "Lista para aprobar", ambar: "En progreso", rojo: "Incompleta" } as Record<string, string>)[chAudit.state] || "—";
    const chPending = chAudit.items.filter((i) => !i.ok);
    let chBody = '<div class="kpi"><span class="v" style="color:' + chColor + '">' + chAudit.pct + '%</span><span class="l">' + esc(chLabel) + ' · ' + chAudit.okCount + '/' + chAudit.total + ' elementos del checklist</span></div>'
      + '<div class="bar-track" style="margin:4px 0 10px"><div class="bar-fill" style="width:' + chAudit.pct + '%;background:' + chColor + '"></div></div>';
    if (chPending.length) {
      chBody += '<ul class="warn-list">' + chPending.slice(0, 5).map((i) => '<li><span class="tag">' + esc(i.cat) + '</span>' + esc(i.label) + '</li>').join("")
        + (chPending.length > 5 ? '<li class="empty">…y ' + (chPending.length - 5) + ' más</li>' : '') + '</ul>';
    } else {
      chBody += '<div class="ok-note">✓ Los ' + chAudit.total + ' elementos del acta están cubiertos. Emite el reporte para la firma.</div>';
    }
    // Coherencia: el CAPEX de los datos comunes debe coincidir con el presupuesto autorizado en el acta.
    // ch.budget es Record<string, unknown> en el tipo del núcleo (CharterModule
    // lo deja genérico a propósito); Project_Charter.html sí conoce su forma
    // real ({amount, currency}), así que se castea solo este par de campos en
    // vez de todo `ch`.
    const chBudget = ch.budget as { amount?: unknown; currency?: string } | undefined;
    const chBud = Number(chBudget?.amount) || 0;
    if (chBud > 0 && capex > 0 && chBud !== capex) {
      chBody += '<div class="empty" style="margin-top:8px">⚠ El presupuesto del acta (' + money(chBud, chBudget?.currency || meta?.currency) + ') difiere del CAPEX de los datos comunes (' + money(capex, meta?.currency) + '). Sincroniza desde el Acta de Constitución.</div>';
    }
    cards.push('<div class="dash-card"><h4>Acta de Constitución</h4>' + chBody + '</div>');
  } else {
    cards.push('<div class="dash-card"><h4>Acta de Constitución</h4><div class="empty">Abre el Acta de Constitución y registra propósito, objetivos, hitos, presupuesto y aprobación para autorizar formalmente el proyecto y ver aquí su índice de completitud.</div></div>');
  }

  // Plan de Gestión del Cronograma: índice de completitud (checklist AACE RP 38R-06)
  const sp = GPI.getModule("schedulePlan");
  if (sp) {
    const spAudit = GPI.util.schedulePlanAudit(sp);
    const stateColor = ({ verde: "var(--good)", ambar: "var(--warn)", rojo: "var(--danger)" } as Record<string, string>)[spAudit.state] || "var(--ink-2)";
    const stateLabel = ({ verde: "Completo", ambar: "En progreso", rojo: "Incompleto" } as Record<string, string>)[spAudit.state] || "—";
    const pending = spAudit.items.filter((i) => !i.ok);
    let body = '<div class="kpi"><span class="v" style="color:' + stateColor + '">' + spAudit.pct + '%</span><span class="l">' + esc(stateLabel) + ' · ' + spAudit.okCount + '/' + spAudit.total + ' elementos del checklist</span></div>'
      + '<div class="bar-track" style="margin:4px 0 10px"><div class="bar-fill" style="width:' + spAudit.pct + '%;background:' + stateColor + '"></div></div>';
    if (pending.length) {
      body += '<ul class="warn-list">' + pending.slice(0, 5).map((i) => '<li><span class="tag">' + esc(i.cat) + '</span>' + esc(i.label) + '</li>').join("")
        + (pending.length > 5 ? '<li class="empty">…y ' + (pending.length - 5) + ' más</li>' : '') + '</ul>';
    } else {
      body += '<div class="ok-note">✓ Los ' + spAudit.total + ' elementos del checklist de la base del cronograma (RP 38R-06) están cubiertos.</div>';
    }
    cards.push('<div class="dash-card"><h4>Plan de Gestión del Cronograma</h4>' + body + '</div>');
  } else {
    cards.push('<div class="dash-card"><h4>Plan de Gestión del Cronograma</h4><div class="empty">Abre el Plan de Gestión del Cronograma y define metodología, calendario, hitos y umbrales de control para ver aquí su índice de completitud.</div></div>');
  }

  // Cronograma / CPM: duración del proyecto, ruta crítica y enlaces
  const sch = GPI.getModule("schedule");
  if (sch && (sch.links || []).length) {
    const ss = GPI.util.scheduleStats();
    let scBody: string;
    if (ss.ok) {
      scBody = '<div class="kpi"><span class="v" style="color:var(--danger)">' + ss.projectDuration + '</span><span class="l">días laborables · ' + ss.criticalCount + ' actividad(es) crítica(s) · ' + ss.links + ' enlace(s)</span></div>';
      if (ss.finishDate) scBody += '<div class="ok-note" style="margin-top:6px">Fin estimado: <b>' + esc(ss.finishDate) + '</b></div>';
      if (ss.baselineVersion) {
        const dv = ss.baselineDeviationDays || 0, pc = ss.baselineDeviationPct;
        scBody += '<div class="' + (Math.abs(dv) < 0.05 ? "ok-note" : "warn-note") + '" style="margin-top:6px">Línea base <b>' + esc(ss.baselineVersion) + '</b>: ' + (Math.abs(dv) < 0.05 ? "sin desviación" : (dv > 0 ? "+" : "−") + Math.round(Math.abs(dv) * 10) / 10 + " d" + (pc !== null ? " (" + (pc > 0 ? "+" : "−") + Math.round(Math.abs(pc) * 10) / 10 + " %)" : "") + " frente al pronóstico") + '</div>';
      } else scBody += '<div class="empty" style="margin-top:6px">Sin línea base del cronograma: fíjala en Cronograma / CPM → Salud y línea base.</div>';
    } else {
      scBody = '<div class="empty">La red tiene un ciclo (dependencia circular). Ábrela en Cronograma / CPM para corregir los enlaces.</div>';
    }
    cards.push('<div class="dash-card"><h4>Cronograma / CPM</h4>' + scBody + '</div>');
  } else {
    cards.push('<div class="dash-card"><h4>Cronograma / CPM</h4><div class="empty">Construye la red del cronograma en <b>Cronograma / CPM</b> (pega desde MS Project/Excel o agrega precedencias) para ver aquí la duración del proyecto y la ruta crítica.</div></div>');
  }

  (document.getElementById("dashGrid") as HTMLElement).innerHTML = cards.join("");
}
function kpi(v: unknown, u: string, l: string): string { return '<div class="kpi"><span class="v">' + esc(String(v)) + '</span>' + (u ? '<span class="u">' + esc(u) + '</span>' : '') + '<span class="l">' + esc(l) + '</span></div>'; }

function renderInteg(): void {
  const snippet =
    '<' + 'script src="gpi-core.js"><' + '/script>\n' +
    '<' + 'script>\n' +
    '  // 1) AL CARGAR: hidratar tu herramienta con el proyecto activo\n' +
    '  if (window.GPI && GPI.available()) {\n' +
    '    var proj = GPI.active();\n' +
    '    if (proj) {\n' +
    '      // metadatos comunes → encabezado\n' +
    '      document.getElementById("projectTitle").value = proj.meta.name;\n' +
    '      document.getElementById("courseTitle").value  = proj.meta.course;\n' +
    '      // tu rebanada de datos (si existe)\n' +
    '      var data = GPI.getModule("miModulo");   // p. ej. "wbs", "stakeholders"\n' +
    '      if (data) { /* cargar data en el estado interno y re-render */ }\n' +
    '    }\n' +
    '  }\n' +
    '  // 2) AL CAMBIAR / AL SALIR: devolver los datos al proyecto\n' +
    '  function sincronizar() {\n' +
    '    if (!(window.GPI && GPI.active())) return;\n' +
    '    GPI.setModule("miModulo", /* tu objeto de datos */ estado);\n' +
    '    GPI.patchMeta({ name: projectTitle.value, course: courseTitle.value });\n' +
    '  }\n' +
    '  window.addEventListener("beforeunload", sincronizar);\n' +
    '<' + '/script>';

  (document.getElementById("integBody") as HTMLElement).innerHTML =
    '<p>Cada herramienta es un archivo HTML independiente. Todas leen y escriben un mismo objeto <code>proyecto</code> guardado en el navegador. El contrato es simple:</p>'
    + '<div class="step"><span class="n">1</span><div>Incluye <code>gpi-core.js</code> (mismo folder) antes de tu script.</div></div>'
    + '<div class="step"><span class="n">2</span><div>Al cargar, si hay proyecto activo, hidrata tu vista con <code>GPI.getModule("clave")</code> y los metadatos comunes.</div></div>'
    + '<div class="step"><span class="n">3</span><div>Al cambiar o al salir, devuelve tu rebanada con <code>GPI.setModule("clave", datos)</code>. Eso alimenta al Panel y a las demás herramientas.</div></div>'
    + '<div class="code"><div class="cp"><button class="btn sm" id="btnCopy">⧉ Copiar</button></div><pre>' + esc(snippet) + '</pre></div>'
    + '<p style="margin-top:12px"><b>Esquema del proyecto</b> (una rebanada <code>modules.&lt;clave&gt;</code> por herramienta):</p>'
    + '<div class="code"><pre>' + esc('{\n  meta: { name, code, client, location, sponsor, manager,\n          startDate, endDate, currency, capex, description, course },\n  modules: {\n    charter:      { identification, purpose, description, boundaries,\n                    objectives[], requirements[], deliverables[], milestones[],\n                    budget, risks[], assumptions[], constraints[], exclusions[],\n                    stakeholders[], approval },  // PMBOK — Project Charter\n    stakeholders: { stakeholders[], powerWeights, interestWeights },\n    wbs:          { rootId, idCounter, nodes },\n    activities:   { byLeaf: { wbsLeafId: [ {id, name, unit, qty} ] } },\n    pert:         { byActivity: { actId: {o, m, mAuto, p} }, inputMode },\n    obs:          { rootId, idCounter, nodes },   // roles del organigrama\n    raci:         { assignments: { wbsLeafId: { obsNodeId: "R"|"A"|"C"|"I" } } },\n    schedulePlan: { methodology, calendar, durationEstimating, criticalPath,\n                    controlThresholds[], performanceMeasurement, milestones[],\n                    scheduleReserve, roles[], reportingFormats[], changeControl,\n                    assumptions[], exclusions[], approval },  // AACE RP 38R-06 / PMBOK\n    cost:         { plan:{currency, evMethod, thresholds:{cpi, cv}},\n                    estimate:{class, boe}, budget:{baseCost, contingency,\n                    escalation, computed}, changeOrders[] },  // PMBOK 8 + AACE\n    // risks, schedule (CPM/Gantt), evm, montecarlo, ...\n  }\n}') + '</pre></div>'
    + '<p class="empty">Si <code>gpi-core.js</code> no está presente, la herramienta sigue funcionando de forma independiente (el puente simplemente no se activa).</p>';

  const cp = document.getElementById("btnCopy");
  if (cp) cp.addEventListener("click", () => {
    navigator.clipboard && navigator.clipboard.writeText(snippet).then(() => { toast("Fragmento copiado"); }, () => { toast("Copia manual: selecciona el texto"); });
  });
}

// ---------- import helpers ----------
function importToolInto(): void {
  const fi = document.getElementById("fileProject") as HTMLInputElement & { _mode?: string };
  fi.value = ""; fi._mode = "module"; fi.click();
}
function handleFile(file: File, mode: string): void {
  const r = new FileReader();
  r.onload = (e) => {
    let obj: any; try { obj = JSON.parse((e.target as FileReader).result as string); } catch (_) { toast("Archivo no válido"); return; }
    if (mode === "module") {
      const res = GPI.ingestToolExport(obj);
      if (res.ok) { render(); toast("Datos importados al módulo «" + res.module + "»"); } else if (res.reason === "unknown-format") { toast("No reconocí el formato de esa herramienta"); } else toast("No hay proyecto activo");
    } else {
      GPI.importProject(obj, true);
      render(); toast("Proyecto importado");
    }
  };
  r.readAsText(file);
}

// ---------- plantilla combinada (.xlsx con una hoja por módulo) ----------
// A pedido explícito del usuario: un solo archivo, con una hoja por cada
// módulo que importa datos desde Excel (hoy: WBS Builder, Definir las
// Actividades, Estimar los Costos), cada una con el nombre EXACTO y los
// encabezados EXACTOS que ese módulo espera -- así el alumno completa todo
// en un único libro y, al importar cada hoja en su propio módulo, ese
// módulo la encuentra por nombre sin ambigüedad (mismo mecanismo de
// resolveDataSheetPath()/DATA_SHEET_NAME ya implementado en los tres, ver
// ARCHITECTURE.md). Los arreglos de encabezados de abajo son una copia
// literal de TEMPLATE_HEADERS de cada módulo -- si alguno cambia su
// plantilla, hay que actualizar la copia aquí también (mismo criterio de
// "cada módulo funciona sin depender de otro" que ya usa el resto de la
// suite: Panel de Control no importa el .ts de ningún módulo).
// Mismo tipado que ya usan Definir las Actividades/Estimar los Costos/WBS
// Builder (idéntico a propósito: `declare global` combina las
// declaraciones de `Window.JSZip` de TODOS los módulos que se compilan
// juntos en esta pasada de tsc, y exige que el tipo sea el mismo en cada
// una -- una interfaz más chica aquí, aunque este módulo no necesite
// `loadAsync`/leer, rompería esa fusión).
interface JSZipFileEntry { async(type: "string"): Promise<string>; }
interface JSZipInstance {
  file(name: string, content: string): void;
  file(name: string): JSZipFileEntry | null;
  generateAsync(opts: { type: "blob"; mimeType: string }): Promise<Blob>;
}
interface JSZipCtor { new (): JSZipInstance; loadAsync(data: ArrayBuffer): Promise<JSZipInstance>; }
declare global { interface Window { JSZip?: JSZipCtor; } }

function xmlEsc(s: unknown): string { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
interface XlCell { v: string | number; t: "s" | "n"; s?: number; }

const WBS_SHEET_NAME = "WBS";
const WBS_HEADERS = ["Código EDT", "Paquete de trabajo", "Nivel", "Duración", "Inicio", "Fin", "Costo", "Responsable", "Avance"];
const ACTIVITIES_SHEET_NAME = "Actividades";
const ACTIVITIES_HEADERS = ["Id.", "Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Código de hito", "Unidad", "Metrado", "Rendimiento (R)", "N.º de equipos"];
const COST_ESTIMATE_SHEET_NAME = "Estimado";
const COST_ESTIMATE_HEADERS = ["Id.", "Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"];
const CRONOGRAMA_SHEET_NAME = "Cronograma";
const CRONOGRAMA_HEADERS = ["Id.", "Nombre", "Duración (d)", "Comienzo", "Fin", "Predecesoras"];

function xlsxStylesXml(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="4">'
    + '<font><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="12"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="11"/><color rgb="FF0090C2"/><name val="Calibri"/></font>'
    + '</fonts>'
    + '<fills count="3">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="FFB9C6D2"/></left><right style="thin"><color rgb="FFB9C6D2"/></right><top style="thin"><color rgb="FFB9C6D2"/></top><bottom style="thin"><color rgb="FFB9C6D2"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="4">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
}

// rows: [[{v, t:"s"|"n", s}]], widths: [n]
function xlsxSheetXml(rows: Array<Array<XlCell | null>>, widths: number[]): string {
  const COLS = "ABCDEFGHIJ";
  const cols = widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("");
  const body = rows.map((cells, ri) => {
    const cs = cells.map((c, ci) => {
      if (c == null || c.v === "" || c.v == null) return "";
      const ref = COLS[ci] + (ri + 1), st = c.s ? ' s="' + c.s + '"' : "";
      if (c.t === "n") return '<c r="' + ref + '"' + st + '><v>' + c.v + '</v></c>';
      return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(c.v) + '</t></is></c>';
    }).join("");
    return '<row r="' + (ri + 1) + '">' + cs + '</row>';
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<cols>' + cols + '</cols>'
    + '<sheetData>' + body + '</sheetData>'
    + '</worksheet>';
}

function headerRowSheet(headers: string[], widths: number[]): string {
  return xlsxSheetXml([headers.map((h) => ({ v: h, t: "s", s: 1 } as XlCell))], widths);
}

// Estilos usados en esta hoja: 0 normal · 1 encabezado (igual que las hojas
// de datos) · 2 título · 3 subtítulo de cada bloque de ejemplo.
function templateInstructionsXml(): string {
  const rows: Array<Array<XlCell | null>> = [];
  const text = (v: string, s = 0): void => { rows.push([{ v, t: "s", s } as XlCell]); };
  const blank = (): void => { rows.push([]); };
  const headerRow = (headers: string[]): void => { rows.push(headers.map((h) => ({ v: h, t: "s", s: 1 } as XlCell))); };
  const dataRow = (values: string[]): void => { rows.push(values.map((v) => (v === "" ? null : { v, t: "s", s: 0 } as XlCell))); };

  text("Cómo completar este libro", 2);
  blank();
  text("Este archivo trae una hoja por cada módulo que importa datos desde Excel: “" + WBS_SHEET_NAME + "” (WBS Builder), “" + ACTIVITIES_SHEET_NAME + "” (Definir las Actividades), “" + COST_ESTIMATE_SHEET_NAME + "” (Estimar los Costos) y “" + CRONOGRAMA_SHEET_NAME + "” (Cronograma / CPM). NO renombres ninguna hoja: cada módulo busca la suya por ese nombre exacto y, si no la encuentra, rechaza el archivo (evita que un módulo confunda su hoja con la de otro).");
  text("Tampoco renombres ni abrevies los encabezados de la primera fila de cada hoja: deben coincidir EXACTAMENTE con lo que espera cada módulo (sí puedes reordenar las columnas dentro de una misma hoja).");
  text("Orden recomendado, porque cada hoja depende de la anterior: 1) “" + WBS_SHEET_NAME + "” con las fases y paquetes de trabajo (la EDT manda sobre las demás); 2) “" + ACTIVITIES_SHEET_NAME + "” con las actividades de cada paquete; 3) “" + COST_ESTIMATE_SHEET_NAME + "” con el precio de cada actividad; 4) “" + CRONOGRAMA_SHEET_NAME + "”, al final, con las predecesoras entre actividades — su Id. y sus nombres de referencia dependen de que “" + ACTIVITIES_SHEET_NAME + "” ya esté cargada en el proyecto.");
  text("Sube este MISMO archivo por separado en cada módulo, con su propio botón “Importar desde Excel” — cada uno copia solo su hoja e ignora las demás. Las filas de ejemplo de abajo son solo referencia: bórralas de cada hoja antes de completar la tuya.");
  blank();

  text("Ejemplo — hoja “" + WBS_SHEET_NAME + "” (WBS Builder)", 3);
  text("La jerarquía se arma sola a partir del “Código EDT” (1, 1.1, 1.1.1…): el código de una fila, sin su último segmento, debe ser el de otra fila. En una FASE (tiene paquetes debajo, como la fila “1”) deja Duración/Inicio/Fin/Costo/Avance en blanco — se calculan solos a partir de sus paquetes; esas columnas solo se completan en los PAQUETES (sin filas hijas, como “1.1”).");
  headerRow(WBS_HEADERS);
  dataRow(["1", "Cimentaciones", "1", "", "", "", "", "", ""]);
  dataRow(["1.1", "Excavación de zanjas", "2", "10", "2026-01-05", "2026-01-14", "5000", "Ana Torres", "50"]);
  blank();

  text("Ejemplo — hoja “" + ACTIVITIES_SHEET_NAME + "” (Definir las Actividades)", 3);
  text("Cada fila es una actividad dentro de un paquete (mismo “Código EDT” y “Paquete de trabajo” que le diste en la hoja “" + WBS_SHEET_NAME + "”). “Id.” es el mismo correlativo consecutivo que ya se ve en pantalla — se completa solo para la fila del paquete (referencia; si duplicas la fila para más de una actividad, las copias comparten el mismo Id., no hace falta cambiarlo).");
  text("“Tipo” tiene solo DOS valores válidos en esta hoja: déjalo EN BLANCO para una actividad normal (primera fila del ejemplo) — o escribe “Hito” para marcar la fila como un hito, duración cero por definición (segunda fila): en ese caso asígnale además un código propio en “Código de hito” (p. ej. “H1”, tú decides la numeración) y completa “Código EDT” solo si el hito está atado a un paquete, o déjalo en blanco si es un hito suelto del proyecto en general.");
  headerRow(ACTIVITIES_HEADERS);
  dataRow(["2", "1.1", "Excavación de zanjas", "Corte de zanja", "", "", "m³", "100", "25", "1"]);
  dataRow(["", "1.1", "Excavación de zanjas", "Fin de excavación", "Hito", "H1", "", "", "", ""]);
  blank();

  text("Ejemplo — hoja “" + COST_ESTIMATE_SHEET_NAME + "” (Estimar los Costos)", 3);
  text("Cada fila con “Tipo” EN BLANCO es el precio de una actividad (mismo “Código EDT”, “Paquete de trabajo” y “Nombre de la actividad” que en la hoja “" + ACTIVITIES_SHEET_NAME + "”, como la última fila del ejemplo) — completa solo “Precio unitario” ahí, “Subtotal” se calcula solo (Cantidad × Precio unitario).");
  text("“Tipo” también puede decir “Proyecto”, “Fase”, “Paquete” u “Hito” (como la primera fila del ejemplo, un “Paquete”): son filas de SOLO REFERENCIA, nunca llevan precio propio — muestran la misma estructura completa que ves en pantalla en este módulo (con el Subtotal ya sumado de sus actividades, si corresponde) y se ignoran solas al importar por su “Tipo”, no hace falta borrarlas si vienen de una exportación real de este módulo. “Id.” es opcional en cualquier fila, de referencia.");
  headerRow(COST_ESTIMATE_HEADERS);
  dataRow(["2", "1.1", "Excavación de zanjas", "Excavación de zanjas", "Paquete", "", "", "", "4500"]);
  dataRow(["3", "1.1", "Excavación de zanjas", "Corte de zanja", "", "m³", "100", "45", "4500"]);
  blank();

  text("Ejemplo — hoja “" + CRONOGRAMA_SHEET_NAME + "” (Cronograma / CPM)", 3);
  text("Cada fila es el proyecto, una fase, un paquete, una actividad o un hito — exactamente la misma tabla que ves en pantalla en Cronograma/CPM. “Id.” y “Nombre” son de referencia (no las edites): si el nombre de esa fila ya no coincide con el proyecto actual al importar, esa fila se rechaza. “Duración” también es de referencia, se recalcula sola. Completa “Predecesoras” con el/los Id. de las filas de las que depende cada actividad u hito — sintaxis “3” (fin-a-inicio), “3FS+2d” (con adelanto/atraso), “7CC” (comienzo-a-comienzo); varias predecesoras se separan con “;”. “Comienzo”/“Fin” son opcionales, solo para auditar contra un cronograma real de MS Project.");
  headerRow(CRONOGRAMA_HEADERS);
  dataRow(["2", "Corte de zanja", "4", "", "", ""]);
  dataRow(["3", "Vaciado de concreto", "6", "", "", "2FS+2d"]);
  blank();

  text("Generado por el simulador GPI — Panel de Control.");
  return xlsxSheetXml(rows, [16, 26, 22, 12, 12, 10, 10, 12, 10, 12]);
}

async function buildCombinedTemplateXlsxBlob(): Promise<Blob> {
  const zip = new (window.JSZip as JSZipCtor)();
  zip.file("[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>');
  zip.file("_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>');
  zip.file("xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets>'
    + '<sheet name="Instrucciones" sheetId="1" r:id="rId1"/>'
    + '<sheet name="' + xmlEsc(WBS_SHEET_NAME) + '" sheetId="2" r:id="rId2"/>'
    + '<sheet name="' + xmlEsc(ACTIVITIES_SHEET_NAME) + '" sheetId="3" r:id="rId3"/>'
    + '<sheet name="' + xmlEsc(COST_ESTIMATE_SHEET_NAME) + '" sheetId="4" r:id="rId4"/>'
    + '<sheet name="' + xmlEsc(CRONOGRAMA_SHEET_NAME) + '" sheetId="5" r:id="rId5"/>'
    + '</sheets>'
    + '</workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>'
    + '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>'
    + '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>'
    + '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  zip.file("xl/styles.xml", xlsxStylesXml());
  zip.file("xl/worksheets/sheet1.xml", templateInstructionsXml());
  zip.file("xl/worksheets/sheet2.xml", headerRowSheet(WBS_HEADERS, [12, 34, 8, 10, 11, 11, 12, 20, 10]));
  zip.file("xl/worksheets/sheet3.xml", headerRowSheet(ACTIVITIES_HEADERS, [6, 12, 22, 30, 10, 14, 10, 10, 14, 12]));
  zip.file("xl/worksheets/sheet4.xml", headerRowSheet(COST_ESTIMATE_HEADERS, [6, 12, 22, 30, 8, 10, 11, 14, 12]));
  zip.file("xl/worksheets/sheet5.xml", headerRowSheet(CRONOGRAMA_HEADERS, [6, 30, 12, 11, 11, 22]));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function downloadCombinedTemplate(): Promise<void> {
  if (!window.JSZip) {
    toast("No se pudo cargar la librería de Excel (¿sin conexión?). Puedes descargar la plantilla de cada módulo por separado, desde su propio botón.");
    return;
  }
  const m = GPI.meta();
  const safe = ((m && m.name) || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  try {
    const blob = await buildCombinedTemplateXlsxBlob();
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "plantilla_importacion_" + safe + ".xlsx";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Plantilla combinada descargada (hojas: " + WBS_SHEET_NAME + " / " + ACTIVITIES_SHEET_NAME + " / " + COST_ESTIMATE_SHEET_NAME + " / " + CRONOGRAMA_SHEET_NAME + ").");
  } catch (_) {
    toast("No se pudo generar la plantilla combinada.");
  }
}

// ---------- modal ----------
interface BaseModalOpts { title?: string; msg?: string; prompt?: string; okText?: string; danger?: boolean; }
function baseModal(opts: BaseModalOpts): Promise<string | boolean | null> {
  return new Promise((resolve) => {
    const ov = document.getElementById("modalOverlay") as HTMLElement;
    (document.getElementById("modalTitle") as HTMLElement).textContent = opts.title || "";
    (document.getElementById("modalMsg") as HTMLElement).textContent = opts.msg || "";
    const inp = document.getElementById("modalInput") as HTMLInputElement;
    if (opts.prompt !== undefined) { inp.style.display = "block"; inp.value = opts.prompt || ""; } else inp.style.display = "none";
    const ok = document.getElementById("modalOk") as HTMLButtonElement, cancel = document.getElementById("modalCancel") as HTMLButtonElement;
    ok.textContent = opts.okText || "Aceptar"; ok.className = "btn " + (opts.danger ? "danger" : "primary");
    function done(v: string | boolean | null) { ov.classList.remove("open"); ok.onclick = cancel.onclick = null; ov.onclick = null; document.removeEventListener("keydown", key); resolve(v); }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { done(null); return; }
      if (e.key === "Enter") { done(opts.prompt !== undefined ? inp.value : true); return; }
      if (e.key !== "Tab") return;
      // Trap de foco: Tab no debe escapar del modal hacia el fondo de la página.
      const card = ov.querySelector(".modal-card") as HTMLElement;
      const f = Array.from(card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    ok.onclick = () => { done(opts.prompt !== undefined ? inp.value : true); };
    cancel.onclick = () => { done(null); };
    ov.onclick = (e) => { if (e.target === ov) done(null); };
    document.addEventListener("keydown", key);
    ov.classList.add("open"); (opts.prompt !== undefined ? inp : ok).focus();
  });
}
function confirmModal(title: string, msg: string, onOk: () => void): void { baseModal({ title, msg, okText: "Confirmar", danger: true }).then((v) => { if (v) onOk(); }); }
function promptModal(title: string, msg: string, val?: string): Promise<string | boolean | null> { return baseModal({ title, msg, prompt: val || "", okText: "Guardar" }); }

// ---------- events ----------
function wire(): void {
  (document.getElementById("projSelect") as HTMLSelectElement).addEventListener("change", (e) => { GPI.setActive((e.target as HTMLSelectElement).value); render(); setStatus("Proyecto cambiado."); });
  document.getElementById("btnNew")!.addEventListener("click", () => {
    promptModal("Nuevo proyecto", "Nombre del proyecto:", "Nuevo proyecto").then((name) => {
      if (name == null) return; GPI.createProject({ name: (name as string) || "Nuevo proyecto" }); render(); toast("Proyecto creado");
    });
  });
  document.getElementById("btnRename")!.addEventListener("click", () => {
    const m = GPI.meta(); if (!m) return;
    promptModal("Renombrar proyecto", "Nuevo nombre:", m.name).then((name) => {
      if (name == null || !(name as string).trim()) return; GPI.patchMeta({ name: (name as string).trim() }); render(); toast("Renombrado");
    });
  });
  document.getElementById("btnDup")!.addEventListener("click", () => {
    const m = GPI.meta(); if (!m) return; GPI.duplicateProject(GPI.activeId() as string, m.name + " (copia)"); render(); toast("Proyecto duplicado");
  });
  document.getElementById("btnDel")!.addEventListener("click", () => {
    const m = GPI.meta(); if (!m) return;
    confirmModal("Eliminar proyecto", "¿Eliminar «" + m.name + "» y todos sus módulos? Esta acción no se puede deshacer.", () => {
      GPI.deleteProject(GPI.activeId() as string); render(); toast("Proyecto eliminado");
    });
  });
  document.getElementById("btnExport")!.addEventListener("click", () => {
    const p = GPI.exportActive(); if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    const safe = (p.meta.name || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
    a.href = url; a.download = "proyecto_" + safe + ".json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Proyecto exportado");
  });
  document.getElementById("btnImport")!.addEventListener("click", () => { const fi = document.getElementById("fileProject") as HTMLInputElement & { _mode?: string }; fi.value = ""; fi._mode = "project"; fi.click(); });
  document.getElementById("btnTemplateAll")!.addEventListener("click", downloadCombinedTemplate);
  document.getElementById("fileProject")!.addEventListener("change", (e) => { const files = (e.target as HTMLInputElement & { _mode?: string }).files; if (files && files[0]) handleFile(files[0], (e.target as HTMLInputElement & { _mode?: string })._mode || "project"); });
}

// ---------- init ----------
ensureSeed();
wire();
render();
// En modo "auto" el sondeo de archivos es asíncrono: se pinta de inmediato
// con lo que se sabe y se vuelve a pintar cuando llegan los resultados.
probeModules(() => { if (autoProbe) render(); });
GPI.onChange(() => { render(); }); // sincronía entre pestañas

// ===== REPORTE EJECUTIVO IMPRIMIBLE (📄) =====
function reportShell(docTitle: string, moduleName: string, bodyHtml: string): void {
  let el = document.getElementById("gpiReport");
  if (!el) { el = document.createElement("div"); el.id = "gpiReport"; document.body.appendChild(el); }
  const meta = GPI.meta();
  const today = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  el.innerHTML =
    '<div class="rep-head"><div><h1>' + esc(docTitle) + '</h1>'
    + '<div class="sub">' + esc(meta?.name || "Proyecto") + (meta?.code ? ' · ' + esc(meta.code) : '') + '</div>'
    + '<div class="sub" style="font-weight:500">' + esc(meta?.course || "Gestión de Proyectos de Ingeniería") + '</div></div>'
    + '<div class="rep-meta">' + esc(moduleName) + '<br>Emitido: ' + esc(today)
    + (meta?.client ? '<br>Cliente: ' + esc(meta.client) : '')
    + (meta?.location ? '<br>' + esc(meta.location) : '') + '</div></div>'
    + bodyHtml;
  document.body.classList.add("report-mode");
  function repDone() { document.body.classList.remove("report-mode"); window.removeEventListener("afterprint", repDone); }
  window.addEventListener("afterprint", repDone);
  setTimeout(() => { window.print(); setTimeout(repDone, 500); }, 60);
}
function repDate(s: string): string { if (!s) return "—"; const p = String(s).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s; }

function buildReport(): void {
  const meta = GPI.meta();
  if (!meta) { toast("No hay un proyecto activo para reportar"); return; }
  let body = "";

  body += '<h2>1. Datos comunes del proyecto</h2><table class="rep-kv">'
    + '<tr><td>Código</td><td>' + esc(meta.code || "—") + '</td></tr>'
    + '<tr><td>Cliente</td><td>' + esc(meta.client || "—") + '</td></tr>'
    + '<tr><td>Ubicación</td><td>' + esc(meta.location || "—") + '</td></tr>'
    + '<tr><td>Patrocinador</td><td>' + esc(meta.sponsor || "—") + '</td></tr>'
    + '<tr><td>Director de Proyecto</td><td>' + esc(meta.manager || "—") + '</td></tr>'
    + '<tr><td>Fechas del proyecto</td><td>' + repDate(meta.startDate) + ' → ' + repDate(meta.endDate) + '</td></tr>'
    + '<tr><td>Presupuesto (CAPEX)</td><td><b>' + money(meta.capex, meta.currency) + '</b></td></tr>'
    + '<tr><td>Descripción</td><td>' + esc(meta.description || "—") + '</td></tr></table>';

  // Indicadores integrados (mismas fuentes que el tablero del Panel)
  const stk = GPI.getModule("stakeholders"), wbs = GPI.getModule("wbs"), raci = GPI.getModule("raci");
  const charter = GPI.getModule("charter"), plan = GPI.getModule("schedulePlan");
  const roll = GPI.util.wbsRollup(wbs);
  const cov = GPI.util.raciCoverage(raci, wbs);
  const actStats = GPI.util.activitiesStats(GPI.getModule("activities"), wbs);
  const chA = GPI.util.charterAudit(charter);
  const spA = GPI.util.schedulePlanAudit(plan);
  const capex = Number(meta.capex) || 0;
  const capexPct = capex > 0 ? Math.round(roll.cost / capex * 100) : null;
  body += '<h2>2. Indicadores integrados</h2><table class="rep-kv">'
    + '<tr><td>Interesados registrados</td><td>' + ((stk?.stakeholders || []).length) + '</td></tr>'
    + '<tr><td>Paquetes de trabajo (EDT)</td><td>' + roll.leafCount + ' hojas · ' + roll.count + ' elementos</td></tr>'
    + '<tr><td>Actividades definidas</td><td>' + actStats.total + ' · cobertura de paquetes: ' + actStats.covered + '/' + actStats.leaves + ' (' + actStats.pct + '%)</td></tr>'
    + '<tr><td>Costo desglosado (rollup EDT)</td><td>' + money(roll.cost, meta.currency) + (capexPct != null ? ' — <b>' + capexPct + '%</b> del CAPEX autorizado' : '') + '</td></tr>'
    + '<tr><td>Cobertura RACI</td><td>' + cov.withR + '/' + cov.total + ' paquetes con Responsable · ' + cov.withoutA.length + ' sin Aprobador</td></tr>'
    + '<tr><td>Acta de Constitución</td><td>' + (charter ? chA.pct + '% de completitud (' + chA.okCount + '/' + chA.total + ')' : 'Sin iniciar') + '</td></tr>'
    + '<tr><td>Plan de Gestión del Cronograma</td><td>' + (plan ? spA.pct + '% de completitud (' + spA.okCount + '/' + spA.total + ')' : 'Sin iniciar') + '</td></tr></table>';

  // Estado por módulo del ecosistema
  body += '<h2>3. Estado por herramienta</h2>'
    + '<table><tr><th style="width:26%">Herramienta</th><th style="width:14%">Estado</th><th>Indicadores</th></tr>'
    + MODULES.map((mod) => {
      if (!mod.file) return '<tr><td>' + esc(mod.name) + '</td><td>Próximamente</td><td class="rep-note">Módulo en desarrollo</td></tr>';
      if (!isDelivered(mod)) return '<tr><td>' + esc(mod.name) + '</td><td>No entregado</td><td class="rep-note">Se habilitará más adelante en el curso</td></tr>';
      const has = !!GPI.getModule(mod.key as ModuleKey);
      const stats = has ? statChips(mod.key) : null;
      const statTxt = stats ? stats.map((s) => "<b>" + esc(String(s.v)) + "</b> " + esc(s.l)).join(" · ") : "—";
      return '<tr><td>' + esc(mod.name) + '</td><td>' + (has ? "Con datos" : "Vacío") + '</td><td>' + statTxt + '</td></tr>';
    }).join("") + '</table>'
    + '<p class="rep-note">Reporte generado desde el Panel de Control GPI. Cada herramienta emite además su propio reporte detallado con el botón "📄 Reporte".</p>';

  reportShell("Reporte Ejecutivo del Proyecto", "Panel de Control · Ecosistema GPI", body);
}
(function () {
  const b = document.getElementById("btnReport");
  if (b) b.addEventListener("click", buildReport);
})();
