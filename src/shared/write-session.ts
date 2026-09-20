// Guardado con sesión de edición -- lógica técnica compartida en tiempo de
// COMPILACIÓN (cada módulo sigue siendo un IIFE autocontenido: Vite inlinea
// este archivo en el bundle de cada uno; no hay ningún script extra que
// cargar, ni file:// ni GitHub Pages cambian).
//
// Contrato (ver ARCHITECTURE.md, "Contrato de escritura"): el módulo pide
// GPI.openSession() en el mismo instante en que lee sus datos y, al guardar,
// el núcleo compara esa versión con la de disco. El resultado (saved /
// unchanged / pending / conflict / rejected) es lo que gobierna el aviso al
// usuario -- nunca se supone éxito.
import type * as GpiCore from "../core/gpi-core";
import type { EditSession, ProjectMeta, WriteResult } from "../core/types";

type Gpi = typeof GpiCore.GPI;

export function writeOk(r: WriteResult): boolean { return r.status === "saved" || r.status === "unchanged"; }

// Aviso común de un problema de escritura: estado + el <div id="banner"> que
// ya usan los módulos para "gpi-core.js no cargó"/"proyecto desactualizado"
// (si un módulo no lo tiene, solo se actualiza el estado).
export function showWriteProblem(msg: string, setStatus: (m: string) => void): void {
  setStatus(msg);
  const banner = document.getElementById("banner");
  if (banner) { banner.textContent = msg; banner.classList.add("show"); }
}

export interface PushHooks {
  setStatus: (m: string) => void;
  onStale: () => void; // el proyecto activo cambió: el módulo ya sabe avisarlo (markProjectStale)
}

// Guarda el módulo y (si hay) los metadatos comunes. Devuelve si TODO quedó
// guardado o sin cambios, y la sesión vigente (un módulo que arrancó sin
// proyecto obtiene su primera sesión tras el primer guardado exitoso).
export function pushWithSession(
  G: Gpi, name: string, label: string, data: unknown,
  patch: Partial<ProjectMeta> | null, session: EditSession | null, hooks: PushHooks
): { ok: boolean; session: EditSession | null } {
  const rMod = G.saveModule(name, data, session);
  const next = !session && rMod.status === "saved" ? G.openSession(name) : session;
  const rMeta = patch ? G.saveMeta(patch, session) : null;
  const problems: Array<[WriteResult, string]> = [[rMod, label]];
  if (rMeta) problems.push([rMeta, "Los datos del proyecto"]);
  for (const [r, lab] of problems) {
    if (writeOk(r)) continue;
    if (r.status === "rejected" && r.reason === "project-changed") hooks.onStale();
    else showWriteProblem(G.describeWrite(r, lab), hooks.setStatus);
    return { ok: false, session: next };
  }
  return { ok: true, session: next };
}
