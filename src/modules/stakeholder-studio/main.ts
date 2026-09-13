/* =========================================================
   Stakeholder Studio — motor de datos y visualizaciones
   Réplica educativa del núcleo analítico de Simply Stakeholders,
   ampliada con los marcos clásicos de gestión de interesados:
     · Matriz Poder–Interés (Mendelow)
     · Modelo de Prominencia (Mitchell, Agle & Wood, 1997)
   Estilo visual heredado de WBS Builder (paleta UTEC).

   Port mecánico del <script> inline de Stakeholder_Studio.html (Fase 4
   de MIGRATION.md): misma lógica, mismo comportamiento. Se agregan
   tipos y se compila a stakeholder-studio.js (IIFE) para que el HTML lo
   cargue como <script src="stakeholder-studio.js"> en vez de tenerlo
   inline.

   Mismo patrón que los módulos anteriores: addEventListener
   exclusivamente, window.GPI explícito. Particularidad: el script
   original NO espera DOMContentLoaded -- se ejecuta de inmediato porque
   está colocado al final de <body> (el DOM ya existe). Se preserva ese
   mismo comportamiento aquí: el <script src> queda en la misma posición
   y este módulo ejecuta su init a nivel de módulo, sin listener.

   Es el primer módulo entregado a alumnos (Nivel B del plan): se migra
   después de los 10 módulos de Nivel A, precisamente por ser uno de los
   dos ya usados en clase. Es también el primero del ecosistema escrito
   en JS moderno (const/let, arrow functions, template literals) en vez
   de ES5 -- el port es igualmente mecánico, solo se agregan tipos.
   ========================================================= */
import type * as GpiCore from "../../core/gpi-core";
import type { ProjectMeta } from "../../core/types";

type GpiApi = typeof GpiCore.GPI;
declare global { interface Window { GPI?: GpiApi; } }

// ---------- CONFIG ----------
interface CatInfo { color: string; hex: string; }
const CATS: Record<string, CatInfo> = {
  "Interno": { color: "var(--cat-int)", hex: "#00b6ec" },
  "Cliente": { color: "var(--cat-cli)", hex: "#00c2a8" },
  "Regulador": { color: "var(--cat-reg)", hex: "#2e4374" },
  "Comunidad": { color: "var(--cat-com)", hex: "#ff9f1c" },
  "Proveedor": { color: "var(--cat-prov)", hex: "#6c5ce7" },
  "Financiero": { color: "var(--cat-fin)", hex: "#ff6b8b" }
};
const THRESHOLD = 50; // umbral "alto" para prominencia y cuadrantes

interface CriterionSpec { key: string; label: string; desc: string; }
// ----- Desagregación del PODER: 5 criterios (escala 1-5) + descriptores de nivel -----
const POWER_CRITERIA: CriterionSpec[] = [
  { key: "pos", label: "Poder posicional (formal)", desc: "Autoridad legítima dentro de la organización o del proyecto para tomar decisiones, aprobar presupuestos o cambiar el alcance." },
  { key: "res", label: "Control de recursos", desc: "Capacidad para asignar, retener o redireccionar recursos críticos (financieros, humanos, tecnológicos o de infraestructura)." },
  { key: "net", label: "Poder político / de red", desc: "Influencia informal para incidir en las decisiones de otros actores clave por su prestigio, conexiones o antigüedad." },
  { key: "veto", label: "Poder de veto / bloqueo", desc: "Capacidad legal, regulatoria o sindical para paralizar el proyecto (entidades gubernamentales, comisiones de auditoría, sindicatos)." },
  { key: "expert", label: "Conocimiento experto", desc: "Dependencia que tiene el proyecto de su conocimiento técnico, patentes o know-how exclusivo." }
];
interface LevelInfo { t: string; d: string; }
const POWER_LEVELS: Record<number, LevelInfo> = {
  1: { t: "Muy bajo", d: "No afecta decisiones ni recursos; es un receptor pasivo." },
  2: { t: "Bajo", d: "Puede causar retrasos menores; influencia limitada a su área inmediata." },
  3: { t: "Medio", d: "Su aprobación es necesaria para hitos intermedios; controla recursos parciales." },
  4: { t: "Alto", d: "Miembro del comité de control o dirección; puede modificar el alcance o presupuesto." },
  5: { t: "Muy alto", d: "Capacidad de cancelar el proyecto o redefinir el rumbo estratégico por completo." }
};
// ----- Desagregación del INTERÉS: 5 indicadores (escala 1-5) + descriptores de nivel -----
const INTEREST_CRITERIA: CriterionSpec[] = [
  { key: "afect", label: "Afectación por resultados", desc: "Grado en que los entregables o resultados del proyecto afectan directamente al stakeholder: su operación, bienestar o entorno." },
  { key: "stake", label: "Beneficio o pérdida en juego", desc: "Magnitud de lo que gana o pierde con el proyecto: económico, estratégico o reputacional." },
  { key: "align", label: "Alineación con sus objetivos", desc: "Medida en que el proyecto es central para su agenda, misión o mandato institucional." },
  { key: "prox", label: "Proximidad / involucramiento", desc: "Cercanía y frecuencia con que participa en las actividades del día a día del proyecto." },
  { key: "atten", label: "Involucramiento manifiesto", desc: "Atención y participación observable: solicita información, asiste a reuniones, plantea inquietudes, hace seguimiento." }
];
const INTEREST_LEVELS: Record<number, LevelInfo> = {
  1: { t: "Muy bajo", d: "Indiferente; los resultados no le afectan y no presta atención al proyecto." },
  2: { t: "Bajo", d: "Interés marginal; afectación tangencial y participa sólo si se le convoca." },
  3: { t: "Medio", d: "Sigue el proyecto en hitos clave; afectación moderada y participación reactiva." },
  4: { t: "Alto", d: "Muy afectado o con un stake importante; participa activamente y hace seguimiento frecuente." },
  5: { t: "Muy alto", d: "El proyecto es crítico para sus objetivos; máxima atención e involucramiento constante." }
};

// ---------- STATE ----------
interface PowerCriteria { pos: number; res: number; net: number; veto: number; expert: number; }
interface InterestCriteria { afect: number; stake: number; align: number; prox: number; atten: number; }
interface Stakeholder {
  id: string; name: string; org: string; role: string; category: string;
  power: number; interest: number; legitimacy: number; urgency: number;
  powerCriteria: PowerCriteria; interestCriteria: InterestCriteria;
}

let stakeholders: Stakeholder[] = [];
let selectedId: string | null = null;
let currentView: "registro" | "poderInteres" | "prominencia" = "registro";
let idCounter = 1;
let expandedIds = new Set<string>(); // filas del registro desplegadas (acordeón)
// Ponderación global de los 5 criterios de poder (deben sumar 100)
const powerWeights: PowerCriteria = { pos: 20, res: 20, net: 20, veto: 20, expert: 20 };
// Ponderación global de los 5 indicadores de interés (deben sumar 100)
const interestWeights: InterestCriteria = { afect: 25, stake: 25, align: 20, prox: 15, atten: 15 };

function uid(): string { return "s" + (idCounter++); }

function newStakeholder(over?: Partial<Stakeholder>): string {
  const id = uid();
  const s: Stakeholder = Object.assign({
    id, name: "Nuevo interesado", org: "", role: "",
    category: "Interno",
    power: 50, interest: 50, legitimacy: 50, urgency: 50,
    powerCriteria: { pos: 3, res: 3, net: 3, veto: 3, expert: 3 },
    interestCriteria: { afect: 3, stake: 3, align: 3, prox: 3, atten: 3 }
  }, over || {});
  // asegurar los criterios (permite pasar sólo algunos)
  s.powerCriteria = Object.assign({ pos: 3, res: 3, net: 3, veto: 3, expert: 3 }, s.powerCriteria || {});
  s.interestCriteria = Object.assign({ afect: 3, stake: 3, align: 3, prox: 3, atten: 3 }, s.interestCriteria || {});
  recomputePower(s); recomputeInterest(s); // poder e interés son DERIVADOS de sus criterios ponderados
  stakeholders.push(s);
  return id;
}
// ----- Cálculo del poder a partir de los 5 criterios ponderados -----
function powerLevel(s: Stakeholder): number { // promedio ponderado en [1,5]
  const w = powerWeights, c = s.powerCriteria || ({} as Partial<PowerCriteria>);
  const wsum = (w.pos + w.res + w.net + w.veto + w.expert) || 1;
  return ((c.pos || 0) * w.pos + (c.res || 0) * w.res + (c.net || 0) * w.net + (c.veto || 0) * w.veto + (c.expert || 0) * w.expert) / wsum;
}
function recomputePower(s: Stakeholder): number { // mapea nivel 1-5 → 0-100 (1→0, 3→50, 5→100)
  s.power = Math.round((powerLevel(s) - 1) / 4 * 100);
  return s.power;
}
function recomputeAllPower(): void { stakeholders.forEach(recomputePower); }
// ----- Cálculo del interés a partir de los 5 indicadores ponderados -----
function interestLevel(s: Stakeholder): number { // promedio ponderado en [1,5]
  const w = interestWeights, c = s.interestCriteria || ({} as Partial<InterestCriteria>);
  const wsum = (w.afect + w.stake + w.align + w.prox + w.atten) || 1;
  return ((c.afect || 0) * w.afect + (c.stake || 0) * w.stake + (c.align || 0) * w.align + (c.prox || 0) * w.prox + (c.atten || 0) * w.atten) / wsum;
}
function recomputeInterest(s: Stakeholder): number {
  s.interest = Math.round((interestLevel(s) - 1) / 4 * 100);
  return s.interest;
}
function recomputeAllInterest(): void { stakeholders.forEach(recomputeInterest); }
function getSel(): Stakeholder | null { return stakeholders.find((s) => s.id === selectedId) || null; }

// ---------- SAMPLE: caso DISTRIB+ S.A. (almacén Lurín) ----------
function loadSample(): void {
  stakeholders = []; idCounter = 1;
  const S = (o: Partial<Stakeholder>) => newStakeholder(o);
  // Cada perfil está calibrado para ilustrar un cuadrante / tipo distinto.
  // powerCriteria = {posicional, recursos, red/político, veto/bloqueo, experto} (1-5).
  // interestCriteria = {afectación, stake, alineación, proximidad, atención} (1-5).
  // Con los pesos por defecto, el poder e interés 0-100 se derivan de estos criterios.
  S({ name: "Gerencia General DISTRIB+", org: "DISTRIB+ S.A.", role: "Patrocinador (Sponsor)", category: "Interno",
    powerCriteria: { pos: 5, res: 5, net: 5, veto: 5, expert: 4 }, interestCriteria: { afect: 5, stake: 5, align: 5, prox: 4, atten: 4 }, legitimacy: 95, urgency: 70 });
  S({ name: "Banco financista", org: "BCP", role: "Financiamiento del proyecto", category: "Financiero",
    powerCriteria: { pos: 4, res: 5, net: 4, veto: 5, expert: 3 }, interestCriteria: { afect: 4, stake: 5, align: 4, prox: 3, atten: 5 }, legitimacy: 85, urgency: 75 });
  S({ name: "Constructora principal", org: "Contratista EPC", role: "Ejecución de obra", category: "Proveedor",
    powerCriteria: { pos: 3, res: 4, net: 3, veto: 4, expert: 5 }, interestCriteria: { afect: 5, stake: 4, align: 4, prox: 5, atten: 5 }, legitimacy: 80, urgency: 60 });
  S({ name: "Municipalidad de Lurín", org: "Gobierno Local", role: "Licencias y permisos", category: "Regulador",
    powerCriteria: { pos: 5, res: 3, net: 4, veto: 5, expert: 3 }, interestCriteria: { afect: 3, stake: 2, align: 3, prox: 2, atten: 3 }, legitimacy: 90, urgency: 35 });
  S({ name: "OEFA / Autoridad ambiental", org: "Estado", role: "Fiscalización ambiental", category: "Regulador",
    powerCriteria: { pos: 4, res: 2, net: 3, veto: 5, expert: 5 }, interestCriteria: { afect: 3, stake: 2, align: 2, prox: 2, atten: 3 }, legitimacy: 88, urgency: 40 });
  S({ name: "SUNAFIL", org: "Estado", role: "Fiscalización laboral / SST", category: "Regulador",
    powerCriteria: { pos: 4, res: 2, net: 3, veto: 5, expert: 4 }, interestCriteria: { afect: 2, stake: 2, align: 2, prox: 2, atten: 3 }, legitimacy: 85, urgency: 45 });
  S({ name: "Junta de vecinos de Lurín", org: "Comunidad", role: "Vecinos del entorno", category: "Comunidad",
    powerCriteria: { pos: 2, res: 2, net: 4, veto: 3, expert: 1 }, interestCriteria: { afect: 5, stake: 4, align: 5, prox: 3, atten: 5 }, legitimacy: 75, urgency: 80 });
  S({ name: "Sindicato de construcción civil", org: "Gremio", role: "Mano de obra sindicalizada", category: "Comunidad",
    powerCriteria: { pos: 3, res: 3, net: 4, veto: 5, expert: 3 }, interestCriteria: { afect: 4, stake: 4, align: 4, prox: 3, atten: 4 }, legitimacy: 45, urgency: 85 });
  S({ name: "Futuros operarios del almacén", org: "DISTRIB+ S.A.", role: "Personal de operación", category: "Interno",
    powerCriteria: { pos: 1, res: 1, net: 2, veto: 2, expert: 3 }, interestCriteria: { afect: 5, stake: 3, align: 4, prox: 4, atten: 4 }, legitimacy: 70, urgency: 40 });
  S({ name: "Clientes / distribuidores", org: "Cartera comercial", role: "Usuarios del servicio logístico", category: "Cliente",
    powerCriteria: { pos: 3, res: 4, net: 3, veto: 2, expert: 2 }, interestCriteria: { afect: 3, stake: 3, align: 3, prox: 3, atten: 4 }, legitimacy: 65, urgency: 35 });
  S({ name: "Proveedor de estructuras", org: "Proveedor A", role: "Estructuras metálicas prefabricadas", category: "Proveedor",
    powerCriteria: { pos: 2, res: 4, net: 2, veto: 3, expert: 5 }, interestCriteria: { afect: 3, stake: 3, align: 3, prox: 3, atten: 3 }, legitimacy: 40, urgency: 30 });
  S({ name: "Prensa / medios locales", org: "Medios", role: "Cobertura del proyecto", category: "Comunidad",
    powerCriteria: { pos: 1, res: 1, net: 4, veto: 3, expert: 2 }, interestCriteria: { afect: 2, stake: 2, align: 2, prox: 2, atten: 2 }, legitimacy: 40, urgency: 65 });
  selectedId = stakeholders[0].id;
}

function blankAnalysis(): void {
  stakeholders = []; idCounter = 1;
  selectedId = newStakeholder({ name: "Interesado 1" });
}

// ---------- HELPERS ----------
function escapeHtml(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function catHex(cat: string): string { return (CATS[cat] || CATS.Interno).hex; }
function initials(name: string): string {
  const stop = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "o", "u", "the", "of"]);
  const w = String(name || "").trim().split(/\s+/)
    .filter((t) => /[a-zA-Z0-9]/.test(t[0]) && !stop.has(t.toLowerCase()));
  if (!w.length) return "?";
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}
function setStatus(msg: string): void { (document.getElementById("statusLeft") as HTMLElement).textContent = msg; }

// ---------- RENDER DISPATCH ----------
function render(): void {
  const main = document.getElementById("mainArea") as HTMLElement;
  const prevScroll = main ? main.scrollTop : 0;
  document.querySelectorAll<HTMLElement>("#viewGroup .btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === currentView));
  if (currentView === "registro") main.innerHTML = renderRegister();
  else if (currentView === "poderInteres") main.innerHTML = renderPowerInterest();
  else if (currentView === "prominencia") main.innerHTML = renderSalience();
  wireMainInteractions();
  renderSidebar();
  if (main) main.scrollTop = prevScroll; // no saltar al editar in situ
  (document.getElementById("btnDelete") as HTMLButtonElement).disabled = !selectedId;
}

// ---------- VIEW 1: REGISTRO (acordeón) ----------
// Editor de atributos que se despliega DEBAJO de cada interesado.
function renderDetailEditor(s: Stakeholder): string {
  const catOpts = Object.keys(CATS).map((c) => `<option ${c === s.category ? "selected" : ""}>${c}</option>`).join("");
  const slider = (key: "legitimacy" | "urgency", label: string) => `<div class="slider-field">
      <div class="lab"><label>${label}</label><span class="val d-val" data-id="${s.id}" data-field="${key}">${s[key]}</span></div>
      <input type="range" min="0" max="100" step="5" value="${s[key]}" class="d-sld" data-id="${s.id}" data-field="${key}">
    </div>`;
  const t = salienceType(s);
  return `<div class="reg-detail-inner">
    <div class="detail-cols">
      <div class="field"><label>Nombre</label><input class="d-inp" data-id="${s.id}" data-field="name" value="${escapeHtml(s.name)}"></div>
      <div class="field"><label>Organización</label><input class="d-inp" data-id="${s.id}" data-field="org" value="${escapeHtml(s.org)}"></div>
      <div class="field"><label>Categoría</label><select class="d-sel" data-id="${s.id}" data-field="category">${catOpts}</select></div>
      <div class="field"><label>Rol / Cargo</label><input class="d-inp" data-id="${s.id}" data-field="role" value="${escapeHtml(s.role)}"></div>
    </div>
    <div class="input-map-note"><b>Poder</b> e <b>Interés</b> se calculan abajo a partir de 5 criterios ponderados (no se editan directamente) y ubican al interesado en la Matriz Poder–Interés. <b>Legitimidad</b> y <b>Urgencia</b> se registran directamente y, junto con el Poder ya calculado, determinan su tipo de Prominencia.</div>
    ${powerPanelHtml(s)}
    ${interestPanelHtml(s)}
    <div class="slider-group">
      <div class="slider-group-label">Legitimidad y Urgencia → Prominencia (junto con Poder)</div>
      <div class="detail-sliders">${slider("legitimacy", "Legitimidad")}${slider("urgency", "Urgencia")}</div>
    </div>
    <div class="detail-foot">
      <span class="sal-badge" style="background:${salColor(t)}">Prominencia: ${SAL_INFO[t].t}</span>
      <button class="btn danger d-del" data-id="${s.id}">🗑 Eliminar interesado</button>
    </div>
  </div>`;
}
// Panel desagregado del PODER (5 criterios ponderados, escala 1-5)
function powerPanelHtml(s: Stakeholder): string {
  const raw = powerLevel(s), lvl = Math.round(raw), pct = Math.round((raw - 1) / 4 * 100);
  const info = POWER_LEVELS[lvl] || POWER_LEVELS[3];
  const rows = POWER_CRITERIA.map((cr) => {
    const val = (s.powerCriteria as unknown as Record<string, number>)[cr.key] ?? 3;
    const opts = [1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === val ? "selected" : ""}>${n} · ${POWER_LEVELS[n].t}</option>`).join("");
    return `<div class="field" title="${escapeHtml(cr.desc)}">
        <label>${escapeHtml(cr.label)} <span class="wtag">${(powerWeights as unknown as Record<string, number>)[cr.key]}%</span></label>
        <select class="d-pc" data-id="${s.id}" data-crit="${cr.key}">${opts}</select>
      </div>`;
  }).join("");
  return `<div class="power-panel">
      <div class="power-head">
        <div class="power-title">⚡ Poder — capacidad de influencia</div>
        <div class="power-score">
          <span class="pl-badge pl-${lvl}">Nivel ${lvl} · ${info.t}</span>
          <span class="pl-num">${pct}<i>/100</i></span>
        </div>
      </div>
      <div class="power-crit-grid">${rows}</div>
      <div class="power-desc">${escapeHtml(info.d)}</div>
    </div>`;
}
// Panel desagregado del INTERÉS (5 indicadores ponderados, escala 1-5)
function interestPanelHtml(s: Stakeholder): string {
  const raw = interestLevel(s), lvl = Math.round(raw), pct = Math.round((raw - 1) / 4 * 100);
  const info = INTEREST_LEVELS[lvl] || INTEREST_LEVELS[3];
  const rows = INTEREST_CRITERIA.map((cr) => {
    const val = (s.interestCriteria as unknown as Record<string, number>)[cr.key] ?? 3;
    const opts = [1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === val ? "selected" : ""}>${n} · ${INTEREST_LEVELS[n].t}</option>`).join("");
    return `<div class="field" title="${escapeHtml(cr.desc)}">
        <label>${escapeHtml(cr.label)} <span class="wtag">${(interestWeights as unknown as Record<string, number>)[cr.key]}%</span></label>
        <select class="d-ic" data-id="${s.id}" data-crit="${cr.key}">${opts}</select>
      </div>`;
  }).join("");
  return `<div class="power-panel interest-panel">
      <div class="power-head">
        <div class="power-title">🎯 Interés — nivel de involucramiento</div>
        <div class="power-score">
          <span class="il-badge pl-${lvl}">Nivel ${lvl} · ${info.t}</span>
          <span class="il-num">${pct}<i>/100</i></span>
        </div>
      </div>
      <div class="power-crit-grid">${rows}</div>
      <div class="interest-desc">${escapeHtml(info.d)}</div>
    </div>`;
}
function renderRegister(): string {
  if (!stakeholders.length) {
    return `<div class="view-head"><h2>Registro de interesados</h2>
      <p>Aún no hay interesados. Usa <b>+ Interesado</b> para empezar o <b>Cargar ejemplo</b> para ver el caso DISTRIB+ S.A.</p></div>`;
  }
  const cards = stakeholders.map((s) => {
    const c = catHex(s.category);
    const open = expandedIds.has(s.id);
    return `<div class="reg-card ${open ? "expanded" : ""}" data-id="${s.id}">
      <div class="reg-header" data-id="${s.id}" role="button" tabindex="0" aria-expanded="${open}">
        <div class="reg-headmain">
          <button class="reg-toggle" data-id="${s.id}" aria-label="Desplegar o colapsar">${open ? "▾" : "▸"}</button>
          <div class="reg-namewrap">
            <div class="sh-name">${escapeHtml(s.name)}</div>
            <div class="sh-org">${escapeHtml(s.org || "—")}${s.role ? " · " + escapeHtml(s.role) : ""}</div>
          </div>
        </div>
        <div class="reg-headcat">
          <span class="cat-chip" style="background:${c}">${escapeHtml(s.category)}</span>
        </div>
        <div class="reg-quick">
          <div class="q"><span class="ql">Poder</span><b class="q-power">${s.power}</b></div>
          <div class="q"><span class="ql">Interés</span><b class="q-interest">${s.interest}</b></div>
        </div>
      </div>
      <div class="reg-detail">${open ? renderDetailEditor(s) : ""}</div>
    </div>`;
  }).join("");
  return `<div class="view-head">
      <h2>Registro de interesados</h2>
      <p>La base de datos única del análisis (equivale al <i>Stakeholder Register</i> de Simply Stakeholders y del PMBOK). Cada interesado que registres alimenta automáticamente la <b>Matriz Poder–Interés</b> y el <b>Modelo de Prominencia</b>. <b>Haz clic en un interesado</b> para desplegar y editar sus atributos; usa el botón <b>▸</b> a la izquierda del nombre para colapsarlo.</p>
    </div>
    <div class="reg-toolbar">
      <button class="btn" id="btnExpandAll">⊞ Expandir todo</button>
      <button class="btn" id="btnCollapseAll">⊟ Colapsar todo</button>
    </div>
    <div class="reg-list">${cards}</div>`;
}

// ---------- VIEW 2: MATRIZ PODER–INTERÉS (Mendelow) ----------
function renderPowerInterest(): string {
  const W = 620, H = 620, m = 70; // margen
  const px = (v: number) => m + (v / 100) * (W - 2 * m);
  const py = (v: number) => (H - m) - (v / 100) * (H - 2 * m);
  const midX = px(50), midY = py(50);

  // Cuadrantes ubicados por posición física real en el grid:
  // x:m (izquierda) = bajo interés · x:midX (derecha) = alto interés
  // y:m (arriba) = alto poder      · y:midY (abajo)   = bajo poder
  const quads = [
    { x: m, y: m, w: (W - 2 * m) / 2, h: (H - 2 * m) / 2, fill: "rgba(108,92,231,0.08)", t: "Mantener satisfecho", s: "Alto poder · Bajo interés", tx: "end", ty: "start", cx: midX - 12, cy: m + 18 },
    { x: midX, y: m, w: (W - 2 * m) / 2, h: (H - 2 * m) / 2, fill: "rgba(0,182,236,0.09)", t: "Gestionar de cerca", s: "Alto poder · Alto interés", tx: "start", ty: "start", cx: midX + 12, cy: m + 18 },
    { x: m, y: midY, w: (W - 2 * m) / 2, h: (H - 2 * m) / 2, fill: "rgba(137,146,163,0.10)", t: "Monitorear", s: "Bajo poder · Bajo interés", tx: "end", ty: "end", cx: midX - 12, cy: H - m - 24 },
    { x: midX, y: midY, w: (W - 2 * m) / 2, h: (H - 2 * m) / 2, fill: "rgba(255,159,28,0.08)", t: "Mantener informado", s: "Bajo poder · Alto interés", tx: "start", ty: "end", cx: midX + 12, cy: H - m - 24 }
  ];
  const quadSvg = quads.map((q) => {
    const anchor = q.tx === "end" ? "end" : "start";
    return `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${q.fill}"/>
      <text x="${q.cx}" y="${q.cy}" text-anchor="${anchor}" class="quad-label" fill="var(--ink-1)">${q.t}</text>
      <text x="${q.cx}" y="${q.cy + 16}" text-anchor="${anchor}" class="quad-sub" fill="var(--ink-2)">${q.s}</text>`;
  }).join("");

  const bubbles = plotBubbles(stakeholders.map((s) => ({ s, x: px(s.interest), y: py(s.power) })), 15);

  return `<div class="view-head">
      <h2>Matriz Poder–Interés (Mendelow)</h2>
      <p>El clásico grid 2×2 de Mendelow. Cada burbuja se ubica según su <b>interés</b> (eje horizontal) y su <b>poder</b> (eje vertical); el cuadrante define la <b>estrategia de gestión</b>. Arrastra los deslizadores del panel derecho y observa cómo un interesado migra de cuadrante.</p>
    </div>
    <div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      ${quadSvg}
      <line x1="${midX}" y1="${m}" x2="${midX}" y2="${H - m}" stroke="var(--panel-border)" stroke-width="1.5" stroke-dasharray="4 4"/>
      <line x1="${m}" y1="${midY}" x2="${W - m}" y2="${midY}" stroke="var(--panel-border)" stroke-width="1.5" stroke-dasharray="4 4"/>
      <line x1="${m}" y1="${H - m}" x2="${W - m}" y2="${H - m}" stroke="var(--ink-2)" stroke-width="1.5"/>
      <line x1="${m}" y1="${m}" x2="${m}" y2="${H - m}" stroke="var(--ink-2)" stroke-width="1.5"/>
      <text x="${W / 2}" y="${H - 18}" text-anchor="middle" class="axis-label">INTERÉS →</text>
      <text x="22" y="${H / 2}" text-anchor="middle" class="axis-label" transform="rotate(-90 22 ${H / 2})">PODER →</text>
      ${bubbles}
    </svg></div>`;
}

// ---------- VIEW 3: MODELO DE PROMINENCIA (Mitchell, Agle & Wood) ----------
// Clasifica por Poder / Legitimidad / Urgencia (umbral 50) en 7 tipos + no-interesado.
type SalienceType = "definitivo" | "dominante" | "peligroso" | "dependiente" | "durmiente" | "discrecional" | "demandante" | "no";
function salienceType(s: Stakeholder): SalienceType {
  const P = s.power >= THRESHOLD, L = s.legitimacy >= THRESHOLD, U = s.urgency >= THRESHOLD;
  if (P && L && U) return "definitivo";
  if (P && L) return "dominante";
  if (P && U) return "peligroso";
  if (L && U) return "dependiente";
  if (P) return "durmiente";
  if (L) return "discrecional";
  if (U) return "demandante";
  return "no";
}
const SAL_INFO: Record<SalienceType, LevelInfo> = {
  definitivo: { t: "Definitivo", d: "Poder + Legitimidad + Urgencia. Máxima prioridad; atender de inmediato." },
  dominante: { t: "Dominante", d: "Poder + Legitimidad. Expectativas legítimas y capacidad de imponerlas." },
  peligroso: { t: "Peligroso", d: "Poder + Urgencia (sin legitimidad). Puede recurrir a la coerción." },
  dependiente: { t: "Dependiente", d: "Legitimidad + Urgencia (sin poder). Depende de otros para ser escuchado." },
  durmiente: { t: "Latente: Durmiente", d: "Solo poder. Poder sin usar; vigilar por si se activa." },
  discrecional: { t: "Latente: Discrecional", d: "Solo legitimidad. Candidato a acciones de responsabilidad social." },
  demandante: { t: "Latente: Exigente", d: "Solo urgencia. Reclama mucho, pero sin poder ni legitimidad." },
  no: { t: "No interesado", d: "Ninguno de los tres atributos supera el umbral." }
};
function renderSalience(): string {
  const W = 640, H = 620, cx = W / 2, cyC = 300, r = 150, off = 88;
  // Tres círculos: Poder (arriba), Legitimidad (abajo-izq), Urgencia (abajo-der)
  const cP = { x: cx, y: cyC - off };
  const cL = { x: cx - off, y: cyC + off * 0.75 };
  const cU = { x: cx + off, y: cyC + off * 0.75 };
  // Posición aproximada del centroide de cada región (para ubicar burbujas)
  const regionCenter: Record<SalienceType, { x: number; y: number }> = {
    durmiente: { x: cP.x, y: cP.y - r * 0.45 },
    discrecional: { x: cL.x - r * 0.5, y: cL.y + r * 0.4 },
    demandante: { x: cU.x + r * 0.5, y: cU.y + r * 0.4 },
    dominante: { x: (cP.x + cL.x) / 2 - r * 0.28, y: (cP.y + cL.y) / 2 },
    peligroso: { x: (cP.x + cU.x) / 2 + r * 0.28, y: (cP.y + cU.y) / 2 },
    dependiente: { x: cx, y: (cL.y + cU.y) / 2 + r * 0.55 },
    definitivo: { x: cx, y: cyC + 6 },
    no: { x: cx, y: H - 34 }
  };
  // Agrupar y distribuir burbujas dentro de cada región
  const groups: Partial<Record<SalienceType, Stakeholder[]>> = {};
  stakeholders.forEach((s) => { const t = salienceType(s); (groups[t] = groups[t] || []).push(s); });
  let dots = "";
  (Object.keys(groups) as SalienceType[]).forEach((type) => {
    const arr = groups[type] as Stakeholder[], ctr = regionCenter[type];
    const n = arr.length;
    arr.forEach((s, i) => {
      // pequeña dispersión en rejilla para no superponer
      const ang = (i / Math.max(n, 1)) * Math.PI * 2;
      const rad = n === 1 ? 0 : 15 + (i % 2) * 13;
      const x = ctr.x + Math.cos(ang) * rad;
      const y = ctr.y + Math.sin(ang) * rad;
      dots += bubbleNode(s, x, y, 14);
    });
  });

  return `<div class="view-head">
      <h2>Modelo de Prominencia (Mitchell, Agle &amp; Wood, 1997)</h2>
      <p>Clasifica a cada interesado según posea <b>Poder</b>, <b>Legitimidad</b> y/o <b>Urgencia</b> (umbral ${THRESHOLD}). Las intersecciones definen 7 tipos de <i>salience</i>: cuantos más atributos, mayor prioridad. Ajusta esos tres deslizadores en el panel derecho y verás la burbuja saltar de región.</p>
    </div>
    <div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <circle cx="${cP.x}" cy="${cP.y}" r="${r}" fill="rgba(0,182,236,0.16)" stroke="#00b6ec" stroke-width="2"/>
      <circle cx="${cL.x}" cy="${cL.y}" r="${r}" fill="rgba(0,194,168,0.16)" stroke="#00c2a8" stroke-width="2"/>
      <circle cx="${cU.x}" cy="${cU.y}" r="${r}" fill="rgba(255,84,112,0.15)" stroke="#ff5470" stroke-width="2"/>
      <text x="${cP.x}" y="${cP.y - r + 26}" text-anchor="middle" class="venn-label" fill="#0090c2">PODER</text>
      <text x="${cL.x - r * 0.62}" y="${cL.y + r * 0.9}" text-anchor="middle" class="venn-label" fill="#00967f">LEGITIMIDAD</text>
      <text x="${cU.x + r * 0.62}" y="${cU.y + r * 0.9}" text-anchor="middle" class="venn-label" fill="#c02747">URGENCIA</text>
      <text x="${regionCenter.durmiente.x}" y="${regionCenter.durmiente.y - 24}" text-anchor="middle" class="region-name">1 Durmiente</text>
      <text x="${regionCenter.discrecional.x}" y="${regionCenter.discrecional.y - 24}" text-anchor="middle" class="region-name">2 Discrecional</text>
      <text x="${regionCenter.demandante.x}" y="${regionCenter.demandante.y - 24}" text-anchor="middle" class="region-name">3 Exigente</text>
      <text x="${regionCenter.dominante.x - 4}" y="${regionCenter.dominante.y - 30}" text-anchor="middle" class="region-name">4 Dominante</text>
      <text x="${regionCenter.peligroso.x + 4}" y="${regionCenter.peligroso.y - 30}" text-anchor="middle" class="region-name">5 Peligroso</text>
      <text x="${regionCenter.dependiente.x}" y="${regionCenter.dependiente.y + 30}" text-anchor="middle" class="region-name">6 Dependiente</text>
      <text x="${regionCenter.definitivo.x}" y="${regionCenter.definitivo.y - 30}" text-anchor="middle" class="region-name" style="fill:var(--ink-0)">7 Definitivo</text>
      ${dots}
    </svg></div>`;
}

// ---------- BUBBLE HELPERS ----------
function bubbleNode(s: Stakeholder, x: number, y: number, rBase?: number): string {
  const r = rBase || 14;
  const sel = s.id === selectedId ? "selected" : "";
  return `<g class="bubble ${sel}" data-id="${s.id}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
    <circle r="${r}" fill="${catHex(s.category)}" stroke="#fff" stroke-width="2" opacity="0.92"/>
    <text text-anchor="middle" dy="3.5">${initials(s.name)}</text>
  </g>`;
}
interface BubblePoint { s: Stakeholder; x: number; y: number; size?: number; }
interface PlacedBubble extends BubblePoint { r: number; }
// Coloca burbujas con des-solapamiento simple; size fijo si se pasa rBase, o por punto si trae .size
function plotBubbles(points: BubblePoint[], rBase?: number): string {
  // separación simple: empuja burbujas que colisionan
  const pts: PlacedBubble[] = points.map((p) => ({ ...p, r: p.size || rBase || 14 }));
  for (let iter = 0; iter < 60; iter++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const min = a.r + b.r + 3;
      if (d < min) {
        const push = (min - d) / 2, ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
      }
    }
  }
  return pts.map((p) => bubbleNode(p.s, p.x, p.y, p.r)).join("");
}

// ---------- SIDEBAR ----------
function renderSidebar(): void {
  const sb = document.getElementById("sidebar") as HTMLElement;
  if (currentView === "registro") {
    // El editor va inline bajo cada interesado; el panel muestra resumen, ponderaciones y guía.
    sb.innerHTML = statsBlock()
      + weightsBlock({ title: "Ponderación del poder", criteria: POWER_CRITERIA, weights: powerWeights as unknown as Record<string, number>, inpClass: "winp", normClass: "wnorm",
        tip: "El <b>poder</b> de cada interesado se calcula ponderando 5 criterios (escala 1–5) y se mapea a 0–100. Ajusta los pesos según tu metodología; conviene que sumen 100%." })
      + weightsBlock({ title: "Ponderación del interés", criteria: INTEREST_CRITERIA, weights: interestWeights as unknown as Record<string, number>, inpClass: "iinp", normClass: "inorm",
        tip: "El <b>interés</b> se calcula ponderando 5 indicadores (escala 1–5) y se mapea a 0–100. Los dos primeros (afectación y stake) pesan más por ser los motores del interés genuino." })
      + viewGuideBlock();
    wireWeights("winp", "wnorm", powerWeights as unknown as Record<string, number>, POWER_CRITERIA, recomputeAllPower);
    wireWeights("iinp", "inorm", interestWeights as unknown as Record<string, number>, INTEREST_CRITERIA, recomputeAllInterest);
    return;
  }
  sb.innerHTML = statsBlock() + selectedBlock() + viewGuideBlock() + dangerBlock();
  wireSidebar();
}
interface WeightsBlockCfg { title: string; criteria: CriterionSpec[]; weights: Record<string, number>; inpClass: string; normClass: string; tip: string; }
function weightsBlock(cfg: WeightsBlockCfg): string {
  const rows = cfg.criteria.map((cr) => `
    <div class="wrow" title="${escapeHtml(cr.desc)}">
      <label>${escapeHtml(cr.label)}</label>
      <input type="number" min="0" max="100" step="5" class="${cfg.inpClass}" data-crit="${cr.key}" value="${cfg.weights[cr.key]}">
    </div>`).join("");
  const sum = cfg.criteria.reduce((a, cr) => a + Number(cfg.weights[cr.key] || 0), 0);
  const ok = sum === 100;
  return `<h3 class="mt">${escapeHtml(cfg.title)}</h3>
    <div class="tip-box">${cfg.tip}</div>
    <div class="weights">${rows}
      <div class="wsum">Suma de pesos: <b style="color:${ok ? "var(--good)" : "var(--danger)"}">${sum}%</b>
        ${ok ? "" : `<button class="btn ${cfg.normClass}" style="padding:4px 9px; margin-left:6px;">Normalizar a 100%</button>`}
      </div>
    </div>`;
}
function wireWeights(inpClass: string, normClass: string, weights: Record<string, number>, criteria: CriterionSpec[], recomputeFn: () => void): void {
  document.querySelectorAll<HTMLInputElement>(`#sidebar .${inpClass}`).forEach((inp) => {
    inp.addEventListener("change", () => {
      let v = Number(inp.value); if (isNaN(v) || v < 0) v = 0;
      weights[inp.dataset.crit as string] = v;
      recomputeFn(); render();
    });
  });
  const norm = document.querySelector(`#sidebar .${normClass}`);
  if (norm) norm.addEventListener("click", () => {
    const sum = criteria.reduce((a, cr) => a + Number(weights[cr.key] || 0), 0) || 1;
    let acc = 0;
    criteria.forEach((cr, i) => {
      if (i < criteria.length - 1) { weights[cr.key] = Math.round(weights[cr.key] / sum * 100); acc += weights[cr.key]; } else weights[cr.key] = 100 - acc;
    });
    recomputeFn(); render();
  });
}
function statsBlock(): string {
  const n = stakeholders.length;
  const crit = stakeholders.filter((s) => s.power >= THRESHOLD && s.interest >= THRESHOLD).length;
  const def = stakeholders.filter((s) => salienceType(s) === "definitivo").length;
  return `<h3>Resumen del análisis</h3>
    <div class="stat-grid">
      <div class="stat"><div class="v">${n}</div><div class="l">Interesados</div></div>
      <div class="stat"><div class="v">${crit}</div><div class="l">Gestionar de cerca</div></div>
      <div class="stat"><div class="v">${def}</div><div class="l">Prominencia definitiva</div></div>
    </div>`;
}
function selectedBlock(): string {
  const s = getSel();
  if (!s) return `<h3 class="mt">Interesado</h3><div class="empty-hint">Selecciona un interesado (fila o burbuja) para editar sus atributos.</div>`;
  const catOpts = Object.keys(CATS).map((c) => `<option ${c === s.category ? "selected" : ""}>${c}</option>`).join("");
  const slider = (key: "legitimacy" | "urgency", label: string) => `<div class="slider-field">
      <div class="lab"><label>${label}</label><span class="val" id="v_${key}">${s[key]}</span></div>
      <input type="range" min="0" max="100" step="5" value="${s[key]}" data-field="${key}" class="sld">
    </div>`;
  return `<h3 class="mt">Atributos del interesado</h3>
    <div class="field"><label>Nombre</label><input id="f_name" value="${escapeHtml(s.name)}"></div>
    <div class="field-row">
      <div class="field"><label>Organización</label><input id="f_org" value="${escapeHtml(s.org)}"></div>
      <div class="field"><label>Categoría</label><select id="f_category">${catOpts}</select></div>
    </div>
    <div class="field"><label>Rol / Cargo</label><input id="f_role" value="${escapeHtml(s.role)}"></div>
    <div class="power-readout" title="El poder se calcula por 5 criterios ponderados en la vista Registro">
      <span>⚡ Poder <b>Nivel ${Math.round(powerLevel(s))}</b> · ${POWER_LEVELS[Math.round(powerLevel(s))].t}</span>
      <span class="pr-num">${s.power}<i>/100</i></span>
    </div>
    <div class="power-readout interest-readout" title="El interés se calcula por 5 indicadores ponderados en la vista Registro">
      <span>🎯 Interés <b>Nivel ${Math.round(interestLevel(s))}</b> · ${INTEREST_LEVELS[Math.round(interestLevel(s))].t}</span>
      <span class="pr-num">${s.interest}<i>/100</i></span>
    </div>
    <div class="pr-hint">Edita poder e interés por criterios en la vista <b>Registro</b>.</div>
    ${slider("legitimacy", "Legitimidad")}
    ${slider("urgency", "Urgencia")}`;
}
function viewGuideBlock(): string {
  if (currentView === "poderInteres") {
    return `<div class="tip-box"><b>Insumo del registro:</b> cada burbuja se ubica según el <b>Poder</b> (eje vertical) y el <b>Interés</b> (eje horizontal) de ese interesado. Ambos se calculan en la vista Registro a partir de 5 criterios ponderados cada uno; no se editan directamente.</div>
      <h3 class="mt">Estrategias por cuadrante</h3>
      ${strat("#00b6ec", "Gestionar de cerca", "Alto poder + alto interés. Involúcralos plenamente; son socios clave del proyecto.")}
      ${strat("#6c5ce7", "Mantener satisfecho", "Alto poder + bajo interés. Consúltalos en decisiones clave sin saturarlos.")}
      ${strat("#ff9f1c", "Mantener informado", "Bajo poder + alto interés. Comunicación frecuente; pueden volverse aliados o críticos.")}
      ${strat("#8992a3", "Monitorear", "Bajo poder + bajo interés. Esfuerzo mínimo; vigila cambios.")}`;
  }
  if (currentView === "prominencia") {
    return `<div class="tip-box"><b>Insumo del registro:</b> el tipo de prominencia se deriva de tres valores: <b>Poder</b> (calculado por criterios ponderados), <b>Legitimidad</b> y <b>Urgencia</b> (registradas directamente), cada uno evaluado contra el umbral ${THRESHOLD}. Según cuáles de los tres lo superen, el interesado cae en una de las 7 regiones del diagrama.</div>
      <h3 class="mt">Los 7 tipos de prominencia</h3>
      ${(Object.keys(SAL_INFO) as SalienceType[]).filter((k) => k !== "no").map((k) => strat(salColor(k), SAL_INFO[k].t, SAL_INFO[k].d)).join("")}`;
  }
  // registro
  return `<h3 class="mt">Leyenda de categorías</h3>
    <div class="legend">${Object.keys(CATS).map((c) => `<div class="legend-item"><span class="legend-dot" style="background:${CATS[c].hex}"></span>${c}</div>`).join("")}</div>
    <h3 class="mt">Cómo se usa cada dato</h3>
    <div class="tip-box"><b>Poder</b> e <b>Interés</b> (calculados por criterios ponderados) → posicionan la burbuja en la vista <b>Poder–Interés</b> (Mendelow).</div>
    <div class="tip-box"><b>Poder</b>, <b>Legitimidad</b> y <b>Urgencia</b> → clasifican al interesado en la vista <b>Prominencia</b> (Mitchell, Agle &amp; Wood).</div>
    <div class="tip-box"><b>Un dato, muchas vistas:</b> mantén el registro al día y ambas matrices se recalculan solas, sin volver a cargar nada.</div>`;
}
function strat(color: string, title: string, desc: string): string {
  return `<div class="strat-box"><div class="st"><span class="d" style="background:${color}"></span>${escapeHtml(title)}</div>${escapeHtml(desc)}</div>`;
}
function salColor(k: SalienceType): string {
  return ({ definitivo: "#1a1a1c", dominante: "#6c5ce7", peligroso: "#ff5470", dependiente: "#00c2a8",
    durmiente: "#00b6ec", discrecional: "#3bb0e6", demandante: "#ff9f1c" } as Record<string, string>)[k] || "#8992a3";
}
function dangerBlock(): string {
  if (!getSel()) return "";
  const s = getSel() as Stakeholder;
  let extra = "";
  if (currentView === "prominencia") {
    const t = salienceType(s);
    extra = `<div class="tip-box" style="margin-bottom:10px"><b>Clasificación actual:</b> ${SAL_INFO[t].t}. ${SAL_INFO[t].d}</div>`;
  }
  return `<div class="danger-zone">${extra}
    <button class="btn danger" id="btnDeleteSb" style="width:100%; justify-content:center;">🗑 Eliminar «${escapeHtml((s.name || "").slice(0, 22))}»</button>
  </div>`;
}

// ---------- INTERACTIONS ----------
function wireMainInteractions(): void {
  // Burbujas de los gráficos → seleccionar
  document.querySelectorAll<HTMLElement>(".bubble[data-id]").forEach((el) => {
    el.addEventListener("click", () => { selectedId = el.dataset.id as string; render(); });
  });
  // Acordeón del registro: la cabecera despliega/colapsa
  document.querySelectorAll<HTMLElement>(".reg-header").forEach((h) => {
    h.addEventListener("click", () => toggleExpand(h.dataset.id as string));
    h.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(h.dataset.id as string); } });
  });
  const bxa = document.getElementById("btnExpandAll");
  if (bxa) bxa.addEventListener("click", () => { stakeholders.forEach((s) => expandedIds.add(s.id)); render(); });
  const bca = document.getElementById("btnCollapseAll");
  if (bca) bca.addEventListener("click", () => { expandedIds.clear(); render(); });
  wireDetailEditors();
}
function toggleExpand(id: string): void {
  if (!id) return;
  if (expandedIds.has(id)) expandedIds.delete(id);
  else { expandedIds.add(id); selectedId = id; }
  render();
}
// Cableado del editor inline desplegado bajo cada interesado
function wireDetailEditors(): void {
  document.querySelectorAll<HTMLInputElement>(".reg-detail .d-inp").forEach((el) => {
    el.addEventListener("input", () => {
      const s = stakeholders.find((x) => x.id === el.dataset.id); if (!s) return;
      (s as unknown as Record<string, string>)[el.dataset.field as string] = el.value;
      liveHeaderUpdate(s);
    });
  });
  document.querySelectorAll<HTMLSelectElement>(".reg-detail .d-sel").forEach((el) => {
    el.addEventListener("change", () => {
      const s = stakeholders.find((x) => x.id === el.dataset.id); if (!s) return;
      const f = el.dataset.field as string;
      (s as unknown as Record<string, string>)[f] = el.value;
      selectedId = s.id;
      render(); // reconstruye para reflejar el color del chip de categoría (mantiene la expansión)
    });
  });
  document.querySelectorAll<HTMLInputElement>(".reg-detail .d-sld").forEach((el) => {
    el.addEventListener("input", () => {
      const s = stakeholders.find((x) => x.id === el.dataset.id); if (!s) return;
      (s as unknown as Record<string, number>)[el.dataset.field as string] = Number(el.value);
      const badge = (el.closest(".slider-field") as HTMLElement).querySelector(".d-val");
      if (badge) badge.textContent = String((s as unknown as Record<string, number>)[el.dataset.field as string]);
      liveHeaderUpdate(s); liveSalienceBadge(s); liveStats();
    });
  });
  // Criterios de poder (1-5): recalculan el poder derivado y actualizan en vivo
  document.querySelectorAll<HTMLSelectElement>(".reg-detail .d-pc").forEach((el) => {
    el.addEventListener("change", () => {
      const s = stakeholders.find((x) => x.id === el.dataset.id); if (!s) return;
      if (!s.powerCriteria) s.powerCriteria = { pos: 3, res: 3, net: 3, veto: 3, expert: 3 };
      (s.powerCriteria as unknown as Record<string, number>)[el.dataset.crit as string] = Number(el.value);
      recomputePower(s);
      liveHeaderUpdate(s); liveSalienceBadge(s); liveStats(); livePowerPanel(s);
    });
  });
  // Indicadores de interés (1-5): recalculan el interés derivado y actualizan en vivo
  document.querySelectorAll<HTMLSelectElement>(".reg-detail .d-ic").forEach((el) => {
    el.addEventListener("change", () => {
      const s = stakeholders.find((x) => x.id === el.dataset.id); if (!s) return;
      if (!s.interestCriteria) s.interestCriteria = { afect: 3, stake: 3, align: 3, prox: 3, atten: 3 };
      (s.interestCriteria as unknown as Record<string, number>)[el.dataset.crit as string] = Number(el.value);
      recomputeInterest(s);
      liveHeaderUpdate(s); liveStats(); liveInterestPanel(s);
    });
  });
  document.querySelectorAll<HTMLElement>(".reg-detail .d-del").forEach((el) => {
    el.addEventListener("click", () => { selectedId = el.dataset.id as string; deleteSelected(); });
  });
}
// Actualizaciones en vivo (sin reconstruir todo, para no perder foco ni el arrastre)
function liveHeaderUpdate(s: Stakeholder): void {
  const card = document.querySelector(`.reg-card[data-id="${s.id}"]`); if (!card) return;
  const nm = card.querySelector(".reg-namewrap .sh-name"); if (nm) nm.textContent = s.name;
  const og = card.querySelector(".reg-namewrap .sh-org"); if (og) og.textContent = (s.org || "—") + (s.role ? " · " + s.role : "");
  const qp = card.querySelector(".q-power"); if (qp) qp.textContent = String(s.power);
  const qi = card.querySelector(".q-interest"); if (qi) qi.textContent = String(s.interest);
}
function liveSalienceBadge(s: Stakeholder): void {
  const card = document.querySelector(`.reg-card[data-id="${s.id}"]`); if (!card) return;
  const b = card.querySelector(".sal-badge") as HTMLElement | null;
  if (b) { const t = salienceType(s); b.textContent = "Prominencia: " + SAL_INFO[t].t; b.style.background = salColor(t); }
}
function livePowerPanel(s: Stakeholder): void {
  const card = document.querySelector(`.reg-card[data-id="${s.id}"]`); if (!card) return;
  const raw = powerLevel(s), lvl = Math.round(raw), pct = Math.round((raw - 1) / 4 * 100);
  const info = POWER_LEVELS[lvl] || POWER_LEVELS[3];
  const badge = card.querySelector(".pl-badge"); if (badge) { badge.textContent = `Nivel ${lvl} · ${info.t}`; badge.className = "pl-badge pl-" + lvl; }
  const num = card.querySelector(".pl-num"); if (num) num.innerHTML = `${pct}<i>/100</i>`;
  const desc = card.querySelector(".power-desc"); if (desc) desc.textContent = info.d;
}
function liveInterestPanel(s: Stakeholder): void {
  const card = document.querySelector(`.reg-card[data-id="${s.id}"]`); if (!card) return;
  const raw = interestLevel(s), lvl = Math.round(raw), pct = Math.round((raw - 1) / 4 * 100);
  const info = INTEREST_LEVELS[lvl] || INTEREST_LEVELS[3];
  const badge = card.querySelector(".il-badge"); if (badge) { badge.textContent = `Nivel ${lvl} · ${info.t}`; badge.className = "il-badge pl-" + lvl; }
  const num = card.querySelector(".il-num"); if (num) num.innerHTML = `${pct}<i>/100</i>`;
  const desc = card.querySelector(".interest-desc"); if (desc) desc.textContent = info.d;
}
function liveStats(): void {
  const vals = document.querySelectorAll("#sidebar .stat .v"); if (vals.length < 3) return;
  vals[0].textContent = String(stakeholders.length);
  vals[1].textContent = String(stakeholders.filter((s) => s.power >= THRESHOLD && s.interest >= THRESHOLD).length);
  vals[2].textContent = String(stakeholders.filter((s) => salienceType(s) === "definitivo").length);
}
function wireSidebar(): void {
  const s = getSel();
  if (!s) return;
  const bind = (id: string, field: keyof Stakeholder, isNum?: boolean) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.addEventListener("input", () => { (s as unknown as Record<string, unknown>)[field as string] = isNum ? Number(el.value) : el.value; softRefresh(); });
  };
  bind("f_name", "name", false);
  bind("f_org", "org", false);
  bind("f_role", "role", false);
  const cat = document.getElementById("f_category") as HTMLSelectElement | null;
  if (cat) cat.addEventListener("change", () => { s.category = cat.value; render(); });
  // sliders (0-100): actualizan valor y re-renderizan la vista para mover la burbuja
  document.querySelectorAll<HTMLInputElement>(".sld").forEach((sld) => {
    sld.addEventListener("input", () => {
      const f = sld.dataset.field as string;
      (s as unknown as Record<string, number>)[f] = Number(sld.value);
      const badge = document.getElementById("v_" + f);
      if (badge) badge.textContent = String((s as unknown as Record<string, number>)[f]);
      rerenderChartOnly();
    });
  });
  const dsb = document.getElementById("btnDeleteSb");
  if (dsb) dsb.addEventListener("click", deleteSelected);
}
// Al editar texto del registro, refrescar solo la tabla sin perder foco del input
function softRefresh(): void {
  if (currentView === "registro") {
    const s = getSel();
    const row = document.querySelector(`tr.row[data-id="${selectedId}"]`);
    if (row && s) {
      (row.querySelector(".sh-name") as HTMLElement).textContent = s.name;
      (row.querySelector(".sh-org") as HTMLElement).textContent = (s.org || "—") + (s.role ? " · " + s.role : "");
    }
  }
}
// Re-render de la vista central (para gráficos) sin tocar el sidebar → no pierde el arrastre del slider
function rerenderChartOnly(): void {
  const main = document.getElementById("mainArea") as HTMLElement;
  const scrollY = main.scrollTop;
  if (currentView === "poderInteres") main.innerHTML = renderPowerInterest();
  else if (currentView === "prominencia") main.innerHTML = renderSalience();
  else if (currentView === "registro") { softRefresh(); return; } else return;
  main.scrollTop = scrollY;
  wireMainInteractions();
}

function deleteSelected(): void {
  const s = getSel();
  if (!s) return;
  showConfirm(`¿Eliminar a «${s.name}» del análisis? Esta acción no se puede deshacer.`).then((ok) => {
    if (!ok) return;
    const idx = stakeholders.findIndex((x) => x.id === selectedId);
    if (idx > -1) { expandedIds.delete(selectedId as string); stakeholders.splice(idx, 1); }
    selectedId = stakeholders.length ? stakeholders[Math.max(0, idx - 1)].id : null;
    render();
    setStatus("Interesado eliminado.");
  });
}

// ---------- MODAL ----------
interface ShowModalOpts { title?: string; message?: string; confirmText?: string; cancelText?: string | null; danger?: boolean; }
function showModal({ title, message, confirmText, cancelText, danger }: ShowModalOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modalOverlay") as HTMLElement;
    const confirmBtn = document.getElementById("modalConfirmBtn") as HTMLButtonElement;
    const cancelBtn = document.getElementById("modalCancelBtn") as HTMLButtonElement;
    (document.getElementById("modalTitle") as HTMLElement).textContent = title || "Confirmar";
    (document.getElementById("modalMessage") as HTMLElement).textContent = message || "";
    confirmBtn.textContent = confirmText || "Aceptar";
    confirmBtn.className = "btn" + (danger ? " danger" : " primary");
    cancelBtn.style.display = cancelText === null ? "none" : "";
    cancelBtn.textContent = cancelText || "Cancelar";
    const cleanup = (r: boolean) => { overlay.classList.remove("open"); confirmBtn.onclick = null; cancelBtn.onclick = null; overlay.onclick = null; document.removeEventListener("keydown", onKey); resolve(r); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cleanup(false); if (e.key === "Enter") cleanup(true); };
    confirmBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    document.addEventListener("keydown", onKey);
    overlay.classList.add("open"); confirmBtn.focus();
  });
}
function showConfirm(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Confirmar acción", message, confirmText: "Eliminar", cancelText: "Cancelar", danger: true }); }
function showAlert(message: string, title?: string): Promise<boolean> { return showModal({ title: title || "Aviso", message, confirmText: "Entendido", cancelText: null, danger: false }); }

// ---------- SERIALIZACIÓN ----------
function exportJson(): void {
  const data = {
    title: (document.getElementById("projectTitle") as HTMLInputElement).value,
    course: (document.getElementById("courseTitle") as HTMLInputElement).value,
    idCounter, powerWeights, interestWeights, stakeholders
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (data.title || "analisis").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  a.href = url; a.download = `interesados_${safe}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("Análisis exportado como JSON.");
}
function importJson(file: File): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse((e.target as FileReader).result as string);
      if (!Array.isArray(data.stakeholders)) throw new Error("Formato inválido");
      stakeholders = data.stakeholders; idCounter = data.idCounter || (stakeholders.length + 1);
      if (data.powerWeights) Object.assign(powerWeights, data.powerWeights);
      if (data.interestWeights) Object.assign(interestWeights, data.interestWeights);
      // asegurar criterios y recalcular poder e interés derivados (compatibilidad con archivos antiguos)
      stakeholders.forEach((s) => {
        s.powerCriteria = Object.assign({ pos: 3, res: 3, net: 3, veto: 3, expert: 3 }, s.powerCriteria || {});
        s.interestCriteria = Object.assign({ afect: 3, stake: 3, align: 3, prox: 3, atten: 3 }, s.interestCriteria || {});
        recomputePower(s); recomputeInterest(s);
      });
      selectedId = stakeholders.length ? stakeholders[0].id : null;
      expandedIds = new Set();
      (document.getElementById("projectTitle") as HTMLInputElement).value = data.title || "Análisis de interesados";
      (document.getElementById("courseTitle") as HTMLInputElement).value = data.course || "Gestión de Proyectos de Ingeniería";
      render(); setStatus("Análisis cargado correctamente.");
    } catch (err) {
      showAlert("No se pudo leer el archivo. Verifica que sea un JSON exportado por esta herramienta.");
    }
  };
  reader.readAsText(file);
}
function exportCsv(): void {
  const cols: (keyof Stakeholder)[] = ["name", "org", "role", "category", "power", "interest", "legitimacy", "urgency"];
  const head = ["Nombre", "Organizacion", "Rol", "Categoria", "Poder", "Interes", "Legitimidad", "Urgencia",
    "Poder_Posicional", "Poder_Recursos", "Poder_Red", "Poder_Veto", "Poder_Experto", "Poder_Nivel",
    "Interes_Afectacion", "Interes_Stake", "Interes_Alineacion", "Interes_Proximidad", "Interes_Atencion", "Interes_Nivel",
    "Prominencia"];
  const esc = (v: unknown) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [head.join(",")];
  stakeholders.forEach((s) => {
    const pc = s.powerCriteria || ({} as Partial<PowerCriteria>), ic = s.interestCriteria || ({} as Partial<InterestCriteria>);
    const row = cols.map((c) => esc(s[c]));
    row.push(esc(pc.pos), esc(pc.res), esc(pc.net), esc(pc.veto), esc(pc.expert), esc(Math.round(powerLevel(s))));
    row.push(esc(ic.afect), esc(ic.stake), esc(ic.align), esc(ic.prox), esc(ic.atten), esc(Math.round(interestLevel(s))));
    row.push(esc(SAL_INFO[salienceType(s)].t));
    lines.push(row.join(","));
  });
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "interesados.csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("Registro exportado como CSV.");
}

// ---------- EVENTS ----------
function wireToolbar(): void {
  document.getElementById("btnAdd")!.addEventListener("click", () => {
    const id = newStakeholder({ name: "Nuevo interesado " + (stakeholders.length + 1) });
    selectedId = id;
    if (currentView === "registro") expandedIds.add(id); // desplegar para editar de inmediato
    render();
    const card = document.querySelector(`.reg-card[data-id="${id}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    setStatus("Interesado agregado. Edita sus atributos en la tarjeta desplegada.");
  });
  document.getElementById("btnDelete")!.addEventListener("click", deleteSelected);
  document.querySelectorAll<HTMLElement>("#viewGroup .btn").forEach((b) => {
    b.addEventListener("click", () => { currentView = b.dataset.view as typeof currentView; render(); const m = document.getElementById("mainArea"); if (m) m.scrollTop = 0; });
  });
  document.getElementById("btnExportJson")!.addEventListener("click", exportJson);
  document.getElementById("btnImportJson")!.addEventListener("click", () => (document.getElementById("fileInput") as HTMLInputElement).click());
  document.getElementById("fileInput")!.addEventListener("change", (e) => { const files = (e.target as HTMLInputElement).files; if (files && files[0]) importJson(files[0]); (e.target as HTMLInputElement).value = ""; });
  document.getElementById("btnExportCsv")!.addEventListener("click", exportCsv);
  document.getElementById("btnPrint")!.addEventListener("click", () => window.print());
  document.getElementById("btnSample")!.addEventListener("click", () => {
    showConfirm("Esto reemplazará el análisis actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo")
      .then((ok) => { if (ok) { loadSample(); render(); setStatus("Caso de ejemplo cargado."); } });
  });
  document.getElementById("btnReset")!.addEventListener("click", () => {
    showConfirm("Esto borrará todos los interesados y empezará un análisis nuevo. ¿Continuar?", "Nuevo análisis")
      .then((ok) => { if (ok) { blankAnalysis(); currentView = "registro"; render(); setStatus("Nuevo análisis iniciado."); } });
  });
}

// ---------- INIT ----------
// Sin DOMContentLoaded: el <script> queda al final de <body> (igual que el
// original), así que el DOM ya existe cuando este módulo se ejecuta.
loadSample();
wireToolbar();
render();

// ===== Puente con el Panel de Control (GPI) =====
// Si gpi-core.js está presente y hay almacenamiento, sincroniza con el proyecto activo.
// Si no, la herramienta sigue funcionando de forma independiente.
(function gpiBridge() {
  if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
  const proj = window.GPI.active();
  const titleEl = document.getElementById("projectTitle") as HTMLInputElement;
  const courseEl = document.getElementById("courseTitle") as HTMLInputElement;
  function pull(): void {
    const p = window.GPI!.active(); if (!p) return;
    if (p.meta) { if (p.meta.name) titleEl.value = p.meta.name; if (p.meta.course) courseEl.value = p.meta.course; }
    const mod = p.modules && p.modules.stakeholders;
    if (mod && Array.isArray(mod.stakeholders) && mod.stakeholders.length) {
      stakeholders = mod.stakeholders as unknown as Stakeholder[];
      if (mod.powerWeights) Object.assign(powerWeights, mod.powerWeights);
      if (mod.interestWeights) Object.assign(interestWeights, mod.interestWeights);
      idCounter = mod.idCounter || (stakeholders.length + 1);
      stakeholders.forEach((s) => {
        s.powerCriteria = Object.assign({ pos: 3, res: 3, net: 3, veto: 3, expert: 3 }, s.powerCriteria || {});
        s.interestCriteria = Object.assign({ afect: 3, stake: 3, align: 3, prox: 3, atten: 3 }, s.interestCriteria || {});
        recomputePower(s); recomputeInterest(s);
      });
      selectedId = stakeholders.length ? stakeholders[0].id : null;
      expandedIds = new Set();
      render();
      setStatus("Datos cargados desde el Panel de Control.");
    } else {
      // Primera conexión sin interesados aún: arranca EN BLANCO (no con el
      // ejemplo que init() carga para el modo independiente). Así el guardado
      // automático al salir no escribe los 12 interesados de DISTRIB+ en un
      // proyecto nuevo del alumno; el ejemplo queda disponible en el botón
      // "Cargar ejemplo" (acción explícita y confirmada).
      blankAnalysis();
      render();
      setStatus("Proyecto sin interesados todavía. Regístralos aquí, o usa ⌘ Cargar ejemplo para explorar el caso DISTRIB+.");
    }
  }
  function push(): void {
    if (!window.GPI!.active()) return;
    window.GPI!.setModule("stakeholders", { stakeholders, powerWeights, interestWeights, idCounter });
    window.GPI!.patchMeta({ name: titleEl.value, course: courseEl.value });
  }
  if (proj) pull();
  window.addEventListener("beforeunload", push);
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); });
  // Reactividad entre pestañas (patrón común del ecosistema): si el Acta de
  // Constitución o el Panel cambian el proyecto activo en otra pestaña, se
  // refresca el encabezado. No se recarga la lista de interesados mientras
  // esta pestaña está visible para no pisar la edición en curso.
  window.GPI.onChange(() => {
    const p = window.GPI!.active(); if (!p || !p.meta) return;
    if (document.hidden) { pull(); return; }
    if (p.meta.name && document.activeElement !== titleEl) titleEl.value = p.meta.name;
    if (p.meta.course && document.activeElement !== courseEl) courseEl.value = p.meta.course;
  });
  gpiBadge(proj ? (proj.meta && proj.meta.name) : "", push);
})();

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
    '<div class="rep-head"><div><h1>' + escapeHtml(docTitle) + '</h1>'
    + '<div class="sub">' + escapeHtml(pName) + (meta.code ? ' · ' + escapeHtml(meta.code) : '') + '</div>'
    + '<div class="sub" style="font-weight:500">' + escapeHtml(course) + '</div></div>'
    + '<div class="rep-meta">' + escapeHtml(moduleName) + '<br>Emitido: ' + escapeHtml(today)
    + (meta.client ? '<br>Cliente: ' + escapeHtml(meta.client) : '')
    + (meta.location ? '<br>' + escapeHtml(meta.location) : '') + '</div></div>'
    + bodyHtml;
  document.body.classList.add("report-mode");
  function repDone() { document.body.classList.remove("report-mode"); window.removeEventListener("afterprint", repDone); }
  window.addEventListener("afterprint", repDone);
  // window.print() es bloqueante en la mayoría de navegadores; el timeout
  // posterior actúa de respaldo donde afterprint no dispara.
  setTimeout(() => { window.print(); setTimeout(repDone, 500); }, 60);
}

function buildReport(): void {
  function quad(s: Stakeholder): string {
    const P = Number(s.power) >= 50, I = Number(s.interest) >= 50;
    if (P && I) return "Gestionar de cerca";
    if (P) return "Mantener satisfecho";
    if (I) return "Mantener informado";
    return "Monitorear";
  }
  const counts: Record<string, number> = { "Gestionar de cerca": 0, "Mantener satisfecho": 0, "Mantener informado": 0, "Monitorear": 0 };
  const catCounts: Record<string, number> = {};
  stakeholders.forEach((s) => {
    counts[quad(s)]++;
    const c = s.category || "Sin categoría";
    catCounts[c] = (catCounts[c] || 0) + 1;
  });
  const body = '<h2>1. Resumen</h2><table class="rep-kv">'
    + '<tr><td>Interesados registrados</td><td><b>' + stakeholders.length + '</b></td></tr>'
    + '<tr><td>Por cuadrante poder–interés</td><td>' + Object.keys(counts).map((k) => k + ": <b>" + counts[k] + "</b>").join(" · ") + '</td></tr>'
    + '<tr><td>Por categoría</td><td>' + (Object.keys(catCounts).map((k) => escapeHtml(k) + ": <b>" + catCounts[k] + "</b>").join(" · ") || "—") + '</td></tr></table>'
    + '<h2>2. Registro y análisis de interesados</h2>'
    + '<p class="rep-note">El poder y el interés (0–100) son valores derivados del análisis multicriterio ponderado (nunca editados a mano). El cuadrante usa el umbral 50 y la prominencia sigue el modelo de Mitchell, Agle y Wood (poder, legitimidad, urgencia).</p>'
    + '<table><tr><th>Interesado</th><th>Organización / rol</th><th style="width:9%">Categoría</th><th style="width:6%">Poder</th><th style="width:6%">Interés</th><th style="width:14%">Cuadrante</th><th style="width:14%">Prominencia</th></tr>'
    + (stakeholders.map((s) => {
      const t = salienceType(s);
      return '<tr><td><b>' + escapeHtml(s.name) + '</b></td>'
        + '<td>' + escapeHtml([s.org, s.role].filter((x) => x).join(" — ") || "—") + '</td>'
        + '<td>' + escapeHtml(s.category || "—") + '</td>'
        + '<td class="num" style="text-align:center">' + (Number(s.power) || 0) + '</td>'
        + '<td class="num" style="text-align:center">' + (Number(s.interest) || 0) + '</td>'
        + '<td>' + quad(s) + '</td><td>' + escapeHtml(SAL_INFO[t].t) + '</td></tr>';
    }).join("") || '<tr><td colspan="7" class="rep-note">— Sin interesados registrados —</td></tr>')
    + '</table>';
  reportShell("Registro y Análisis de Interesados", "Stakeholder Studio · Gestión de Interesados", body);
}

(function () {
  const b = document.getElementById("btnReport");
  if (b) b.addEventListener("click", buildReport);
})();
