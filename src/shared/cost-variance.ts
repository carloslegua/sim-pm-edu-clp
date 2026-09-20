// Clasificación de una variación de costo contra los umbrales del plan -- lógica PURA
// compartida en tiempo de COMPILACIÓN (Vite la inlinea en cost.js).
//
// Hallazgo de la auditoría metodológica (PMI): el flujo de Costos enseñaba "rojo = orden
// de cambio obligatoria". Una variación fuera de umbral NO genera por sí sola una orden de
// cambio: dispara el análisis de la causa, la actualización del pronóstico (EAC/ETC) y una
// DECISIÓN de respuesta -- acción correctiva o preventiva dentro del plan, uso de la
// contingencia (riesgo identificado dentro del alcance) o, solo si la respuesta exige
// modificar la línea base o comprometer la reserva de gestión, una solicitud de cambio.
//
// Convención de los umbrales (ver Cost-management.html): son DESFAVORABLES POR DEBAJO del
// valor -- CPI < 1 y CV < 0 indican sobrecosto. Alerta (ámbar) cuando valor ≤ umbral de
// alerta; escalamiento (rojo) cuando valor ≤ umbral de escalamiento.

export type VarianceLevel = "green" | "amber" | "red";
export interface CostThresholds { cpiWarn: number; cpiEsc: number; cvWarn: number; cvEsc: number; }
export interface VarianceResult {
  evaluated: boolean;            // false si no se ingresó ni CPI ni CV
  level: VarianceLevel | null;   // el PEOR de los indicadores evaluados
  cpi: VarianceLevel | null; cv: VarianceLevel | null;
  response: string[];            // qué corresponde hacer (pasos), no una orden automática
  changeRequestNeeded: false;    // una variación, por sí sola, nunca lo exige (ver cabecera)
}

const RANK: Record<VarianceLevel, number> = { green: 0, amber: 1, red: 2 };
const isNum = (v: unknown): v is number => typeof v === "number" && isFinite(v);

function levelOf(value: number | null | undefined, warn: number, esc: number): VarianceLevel | null {
  if (!isNum(value)) return null;
  return value <= esc ? "red" : value <= warn ? "amber" : "green";
}

// Los umbrales solo tienen sentido si escalar es MÁS grave que alertar: el de escalamiento debe
// ser menor o igual que el de alerta (se dispara "por debajo"). Devuelve los problemas, [] si son coherentes.
export function validateThresholds(t: CostThresholds): string[] {
  const p: string[] = [];
  if (![t.cpiWarn, t.cpiEsc, t.cvWarn, t.cvEsc].every(isNum)) { p.push("todos los umbrales deben ser números"); return p; }
  if (t.cpiEsc > t.cpiWarn) p.push("CPI: el umbral de escalamiento (" + t.cpiEsc.toFixed(2) + ") debe ser menor o igual que el de alerta (" + t.cpiWarn.toFixed(2) + ")");
  if (t.cvEsc > t.cvWarn) p.push("CV: el umbral de escalamiento (" + t.cvEsc.toFixed(2) + ") debe ser menor o igual que el de alerta (" + t.cvWarn.toFixed(2) + ")");
  if (t.cpiWarn > 1) p.push("CPI: una alerta por encima de 1,00 se dispararía con el proyecto por debajo del costo previsto");
  if (t.cvWarn > 0) p.push("CV: una alerta por encima de 0 se dispararía con el proyecto por debajo del costo previsto");
  return p;
}

export function classifyVariance(cpi: number | null | undefined, cv: number | null | undefined, t: CostThresholds): VarianceResult {
  const lc = levelOf(cpi, t.cpiWarn, t.cpiEsc), lv = levelOf(cv, t.cvWarn, t.cvEsc);
  const ls = [lc, lv].filter((x): x is VarianceLevel => x !== null);
  if (!ls.length) return { evaluated: false, level: null, cpi: null, cv: null, response: [], changeRequestNeeded: false };
  const level = ls.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  const response = level === "green"
    ? ["Dentro de tolerancia: continuar el monitoreo con la frecuencia del plan. No hay acción ni cambio que registrar."]
    : level === "amber"
      ? [
        "Analizar la causa raíz de la variación.",
        "Actualizar el pronóstico (EAC/ETC).",
        "Aplicar acciones correctivas dentro de la autoridad del director del proyecto. La línea base no cambia."
      ]
      : [
        "Analizar la causa raíz y actualizar el pronóstico (EAC/ETC).",
        "Escalar al sponsor / CCB con el pronóstico actualizado.",
        "Decidir la respuesta: acción correctiva o preventiva dentro del plan; uso de la contingencia si el origen es un riesgo identificado dentro del alcance; o una solicitud de cambio SOLO si la respuesta exige modificar la línea base o comprometer la reserva de gestión.",
        "Una variación fuera de umbral no obliga por sí sola a registrar una orden de cambio."
      ];
  return { evaluated: true, level, cpi: lc, cv: lv, response, changeRequestNeeded: false };
}
