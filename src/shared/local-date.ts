// «Hoy» como fecha ISO (YYYY-MM-DD) en la hora LOCAL del usuario -- UNA sola fuente para todos los módulos (auditoría, media).
//
// `new Date().toISOString().slice(0, 10)` da la fecha en UTC: en Lima (UTC−5), desde las 19:00 devuelve el día SIGUIENTE. Las
// aprobaciones, las líneas base y las decisiones de cambio se fechaban con ese día de más, y Control de Cambios compara esas fechas
// entre sí («la línea base es anterior a la decisión»): un cambio decidido a las 20:00 quedaba «posterior» a la línea base fijada
// minutos después. Las fechas de calendario del proyecto (inicio, hitos) siguen calculándose en UTC a propósito (mediodía UTC): no
// dependen de la hora del usuario; esto es solo para «la fecha de hoy» que el usuario ve en su reloj.
export function todayLocalISO(d: Date = new Date()): string {
  const p = (n: number): string => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
