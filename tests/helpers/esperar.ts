// Espera una condición OBSERVABLE (en vez de un tiempo fijo): reintenta hasta que se cumple o vence el plazo, y entonces
// falla con un mensaje que dice qué se esperaba. Bajo carga el plazo sobra; sin carga vuelve de inmediato.
export async function esperarHasta(cond: () => unknown, descripcion: string, plazoMs = 10000): Promise<void> {
  const fin = Date.now() + plazoMs;
  for (;;) {
    let ok: boolean;
    try { ok = !!cond(); } catch (e) { ok = false; }
    if (ok) return;
    if (Date.now() > fin) throw new Error("Tiempo de espera agotado (" + plazoMs + " ms) esperando: " + descripcion);
    await new Promise<void>((r) => setTimeout(r, 15));
  }
}
