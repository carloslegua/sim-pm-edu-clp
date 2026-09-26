// Nombres accesibles para los controles de formulario que no lo tienen (auditoría, media): un lector de pantalla anunciaba «cuadro de
// edición» sin decir qué pide -- en Plan del Cronograma, Adquisiciones, Acta, Panel, Interesados, EDT, Riesgos… (unos 250 campos con el
// caso completo). Muchos se pintan con innerHTML dentro de tablas y tarjetas dinámicas: en vez de tocar cada sitio de render, el núcleo
// (que carga toda página) observa el DOM y les asigna `aria-label` a los que aún no tienen nombre. NUNCA pisa un nombre existente
// (aria-label, aria-labelledby, <label>, title): solo completa lo que falta. El nombre sale, por orden, de:
//   1. la fila y la columna, si el control está en una tabla («Frecuencia — CM-03»);
//   2. la etiqueta más cercana del bloque que lo contiene (label, .fl, .lab, legend, span…);
//   3. el placeholder;
//   4. el atributo de datos o el id, en palabras («probPct» → «prob pct»).
// Es una red de seguridad: un módulo que pueda dar un nombre mejor (aria-label propio) sigue mandando.

const SELECTOR = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]),select,textarea";
const LABELISH = "label,.fl,.lab,.label,legend,.eyebrow,.wl,.lbl";

const clean = (s: string | null | undefined, max = 60): string => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};

export function hasAccessibleName(el: Element): boolean {
  if (el.getAttribute("aria-label") || el.getAttribute("title")) return true;
  const by = el.getAttribute("aria-labelledby");
  if (by && by.split(/\s+/).some((id) => { const n = document.getElementById(id); return !!n && !!clean(n.textContent); })) return true;
  const id = (el as HTMLElement).id;
  if (id) { const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'); if (l && clean(l.textContent)) return true; }
  const wrap = el.closest("label");
  return !!wrap && !!clean(wrap.textContent);
}

// «probPct» → «prob pct»; «m-approach» → «m approach».
const humanize = (s: string): string => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").trim();

function fromTable(el: Element): string {
  const cell = el.closest("td,th"), table = cell ? cell.closest("table") : null;
  if (!cell || !table) return "";
  const row = cell.parentElement as HTMLTableRowElement, idx = (cell as HTMLTableCellElement).cellIndex;
  let head = "";
  const headRow = (table.tHead && table.tHead.rows.length ? table.tHead.rows[table.tHead.rows.length - 1] : Array.from(table.rows).find((r) => r.querySelector("th")));
  if (headRow && headRow !== row && headRow.cells[idx]) head = clean(headRow.cells[idx].textContent, 40);
  // la primera celda de la fila sin controles identifica la fila (código, nombre…)
  const lead = row ? Array.from(row.cells).slice(0, idx).map((c) => (c.querySelector(SELECTOR) ? "" : clean(c.textContent, 30))).find(Boolean) || "" : "";
  return head ? head + (lead ? " — " + lead : "") : lead;
}

function fromContext(el: Element): string {
  let branch: Element = el;
  for (let anc = el.parentElement, depth = 0; anc && depth < 4; anc = anc.parentElement, depth++) {
    const kids = Array.from(anc.children);
    const at = kids.indexOf(branch);
    // primero lo que va ANTES del control (una etiqueta se escribe antes), luego lo que va después
    const order = kids.slice(0, at).reverse().concat(kids.slice(at + 1));
    // una etiqueta enlazada (for=) a OTRO control nombra a ese control, no a este
    const hit = order.find((c) => c.matches(LABELISH) && !c.contains(el) && !c.querySelector(SELECTOR) && !!clean(c.textContent) && !(c.getAttribute("for") && c.getAttribute("for") !== (el as HTMLElement).id));
    if (hit) return clean(hit.textContent);
    if (anc.matches("section,.card,fieldset,details")) break;   // no salir de la tarjeta: lo de fuera no le pertenece
    branch = anc;
  }
  return "";
}

export function guessName(el: Element): string {
  const h = el as HTMLElement, ds = h.dataset || {};
  let name = fromTable(el) || fromContext(el) || clean(el.getAttribute("placeholder")) || "";
  if (!name) {
    // listas de elementos («Entregables clave», «Supuestos»…): el encabezado de la tarjeta o sección que las contiene
    const sec = el.closest("section,.card,fieldset,details"), hd = sec ? sec.querySelector("h2,h3,h4,legend,summary") : null;
    const k = ds.f || ds.k || ds.bind || ds.crit || ds.p || ds.e || ds.list || h.id || el.getAttribute("name") || "";
    name = (hd && clean(hd.textContent, 50)) || humanize(k);
  }
  if (!name) return "";
  if (ds.i !== undefined && /^\d+$/.test(ds.i) && !/\d$/.test(name)) name += " " + (Number(ds.i) + 1);
  return name;
}

export function labelUnnamedControls(root: ParentNode = document): number {
  let n = 0;
  root.querySelectorAll(SELECTOR).forEach((el) => {
    if (hasAccessibleName(el)) return;
    const g = guessName(el);
    if (g) { el.setAttribute("aria-label", g); n++; }
  });
  return n;
}

let installed = false;
export function installA11yLabels(): void {
  if (installed || typeof document === "undefined" || typeof window === "undefined") return;
  installed = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = (): void => { timer = undefined; try { labelUnnamedControls(document); } catch (e) { /* noop */ } };
  const schedule = (): void => { if (timer === undefined) timer = setTimeout(run, 200); };
  const start = (): void => {
    run();
    if (typeof MutationObserver !== "undefined" && document.body) new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
}
