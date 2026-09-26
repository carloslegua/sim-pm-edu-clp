// Barra flotante «Panel: <proyecto> · ☁ Sincronizar · ⌂ Panel» -- UNA sola implementación (auditoría, media: `gpiBadge` estaba copiada 17 veces
// con pequeñas diferencias de color y de comportamiento). Se inlinea en cada IIFE (los módulos no importan código del núcleo, así que siguen
// funcionando aunque gpi-core.js no cargue). Cada módulo solo aporta lo suyo: el nombre del proyecto, qué hace «Sincronizar» y su color de acento.
//
// Resultado de «Sincronizar»: `false` → «⚠ Sin sincronizar»; una cadena → ese texto (p. ej. «✓ Sincronizado — WBS actualizado»); cualquier otra
// cosa (true o undefined) → «✓ Sincronizado». Antes Costos y Requisitos mostraban «✓ Sincronizado» aunque el guardado hubiera fallado.
import { esc } from "./html";
export interface GpiBadgeOpts {
  name: string | undefined;
  onSync: () => boolean | string | null | void;   // null = sin mensaje (no cambia el botón)
  accent?: string; hover?: string; dot?: string; dotShadow?: string;   // colores de acento del módulo
  bottom?: number;                                                       // px desde el borde inferior (42 deja libre la barra de estado)
  id?: string; dotClass?: string;
  restoreMs?: number;
}

export function installGpiBadge(o: GpiBadgeOpts): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (o.id && document.getElementById(o.id)) return document.getElementById(o.id);
  const accent = o.accent || "#0090c2", hover = o.hover || "#00b6ec", dot = o.dot || "#00c2a8", shadow = o.dotShadow || "rgba(0,194,168,.18)", dc = o.dotClass || "gpi-dot";
  const css = document.createElement("style");
  css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:" + (o.bottom === undefined ? 42 : o.bottom) + "px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}"
    + ".gpi-badge b{color:#1a2027}." + dc + "{width:8px;height:8px;border-radius:50%;background:" + dot + ";box-shadow:0 0 0 3px " + shadow + "}"
    + ".gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:" + accent + ";border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}"
    + ".gpi-badge .gpi-btn:hover{border-color:" + hover + ";background:#fff}";
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.className = "gpi-badge"; if (o.id) bar.id = o.id;
  bar.innerHTML = '<span class="' + dc + '"></span><span>Panel: <b>' + esc(o.name || "—") + '</b></span><button class="gpi-btn" id="gpiSyncBtn">☁ Sincronizar</button><a class="gpi-btn" href="Panel_Control.html">⌂ Panel</a>';
  document.body.appendChild(bar);
  const btn = bar.querySelector("#gpiSyncBtn") as HTMLElement;
  btn.addEventListener("click", () => {
    const r = o.onSync(); if (r === null) return;
    const t = btn.textContent;
    btn.textContent = r === false ? "⚠ Sin sincronizar" : typeof r === "string" ? r : "✓ Sincronizado";
    setTimeout(() => { btn.textContent = t; }, o.restoreMs || 1400);
  });
  return bar;
}
