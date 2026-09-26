// Escape de HTML -- UNA sola implementación para los módulos (auditoría, media: estaba copiada en 16 archivos). Se inlinea en cada IIFE.
// Escapa también las comillas: es seguro tanto en el contenido de un elemento como dentro de un atributo entre comillas.
export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
