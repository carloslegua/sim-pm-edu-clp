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
  // UNA sola operación atómica (módulo + metadatos): un conflicto o rechazo
  // en cualquiera de los dos no escribe nada -- ver commitState() en el núcleo.
  const r = G.saveState(name, data, patch, session);
  const next = !session && r.status === "saved" ? G.openSession(name) : session;
  if (writeOk(r)) return { ok: true, session: next };
  if (r.status === "rejected" && r.reason === "project-changed") hooks.onStale();
  else showWriteProblem(G.describeWrite(r, label), hooks.setStatus);
  return { ok: false, session: next };
}
