// Ejemplo DISTRIB+ S.A. del registro de riesgos -- UNA sola fuente compartida en tiempo de COMPILACIÓN por
// Risk_Register (risks.js) y Costos (cost.js, modo independiente): el mismo caso, sin dos copias que se desalineen.
// (Regla #6 de CLAUDE.md: los ejemplos de todos los módulos son UN SOLO proyecto coherente.)
//   · R-03 «Suelo» está MATERIALIZADO con el costo real de la orden OC-001 de Costos (180.000).
//   · Los paquetes de la EDT se dan por Código EDT (`wbs`); cada módulo los resuelve contra su propia EDT.
//   · Los rangos de las partidas de Costos NO incluyen estos riesgos discretos (evita el doble conteo, AACE 40R-08).
import { normalizePlan, normalizeRisk, type Risk } from "./risk-analysis";

export interface SampleRisk extends Partial<Risk> { wbs: string[]; }
export const SAMPLE_PLAN = normalizePlan({
  methodology: "Identificación por talleres de expertos y revisión de lecciones aprendidas; análisis cualitativo con la matriz probabilidad × impacto del plan; cuantificación del valor esperado con rangos de tres puntos para los riesgos de costo ≥ 3; respuesta por estrategia; revisión mensual en la reunión de control.",
  reservePolicy: "La contingencia cubre la incertidumbre del estimado (análisis de rangos de Costos) y la exposición residual de los riesgos abiertos. La reserva de gestión (fuera de la línea base) solo se usa con autorización del sponsor.",
  roles: "Director de Proyecto: dueño del proceso y del registro. Propietario del riesgo: vigila el disparador y ejecuta la respuesta. Sponsor: autoriza el uso de la reserva de gestión. CCB: aprueba los cambios a la línea base."
});
export const SAMPLE_RISKS: SampleRisk[] = [
  { code: "R-01", title: "Retraso en la licencia municipal", type: "amenaza", category: "Externo", owner: "Asesoría Legal", proximity: "corta", status: "con_respuesta", wbs: ["2.4"],
    cause: "la Municipalidad de Lurín observa el expediente de licencia de edificación", event: "se retrasa la emisión de la licencia", effect: "se posterga el inicio de obra y se extiende el cronograma",
    prob: 4, impCost: 2, impTime: 4, impScope: 1, costImpact: { low: 20000, likely: 45000, high: 80000 }, timeImpact: { low: 10, likely: 20, high: 35 },
    strategy: "mitigar", response: "Reuniones técnicas previas al ingreso del expediente y seguimiento semanal del trámite (ver compromiso de la Municipalidad en Stakeholder Studio).", trigger: "Observaciones al expediente en la primera revisión", responseOwner: "Asesoría Legal", responseCost: 6000,
    resProb: 2, resImpCost: 2, resImpTime: 3, resImpScope: 1, resCostImpact: { low: 20000, likely: 45000, high: 80000 }, resTimeImpact: { low: 10, likely: 20, high: 35 } },
  { code: "R-02", title: "Alza del precio del acero estructural", type: "amenaza", category: "Externo", owner: "Jefe de Logística", proximity: "media", status: "con_respuesta", wbs: ["3.1"],
    cause: "la volatilidad del precio internacional del acero", event: "el Proveedor A revisa al alza el precio antes de cerrar el contrato", effect: "aumenta el costo de procura de las estructuras metálicas",
    prob: 3, impCost: 4, impTime: 1, impScope: 1, costImpact: { low: 100000, likely: 250000, high: 500000 },
    strategy: "transferir", response: "Contrato a precio fijo con vigencia de la oferta de 60 días.", trigger: "Oferta del Proveedor A próxima a vencer sin contrato firmado", responseOwner: "Jefe de Logística",
    resProb: 1, resImpCost: 4, resImpTime: 1, resImpScope: 1, resCostImpact: { low: 100000, likely: 250000, high: 500000 } },
  { code: "R-03", title: "Suelo con menor capacidad portante que la esperada", type: "amenaza", category: "Técnico", owner: "Jefe de Ingeniería", proximity: "inmediata", status: "materializado", wbs: ["2.1", "4.2"],
    cause: "el estudio de suelos detecta estratos de baja capacidad portante", event: "se debe reforzar la cimentación", effect: "aumenta el costo y se extiende la ejecución de cimentaciones",
    prob: 3, impCost: 3, impTime: 3, impScope: 1, costImpact: { low: 90000, likely: 180000, high: 350000 }, timeImpact: { low: 5, likely: 10, high: 20 },
    strategy: "mitigar", response: "Estudio de suelos ampliado y refuerzo de cimentación (orden de cambio OC-001, financiada con contingencia).", trigger: "Resultados del estudio de suelos (2.1)", responseOwner: "Jefe de Ingeniería",
    materializedOn: "2026-08-03", actualCost: 180000, actualDelay: 8 },
  { code: "R-04", title: "Fluctuación del tipo de cambio", type: "amenaza", category: "Externo", owner: "Director de Proyecto", proximity: "media", status: "monitoreo", wbs: ["3.1", "3.3"],
    cause: "el 30 % del costo está denominado en moneda extranjera (estructuras y equipos importados)", event: "el tipo de cambio sube por encima de la banda prevista", effect: "aumenta el costo en moneda local de la procura",
    prob: 3, impCost: 3, impTime: 1, impScope: 1, costImpact: { low: 150000, likely: 300000, high: 600000 },
    strategy: "mitigar", response: "Cobertura cambiaria (forward) para el 30 % en moneda extranjera al cerrar los contratos de procura.", trigger: "Variación del tipo de cambio mayor al 3 % respecto de la fecha base", responseOwner: "Director de Proyecto", responseCost: 12000,
    resProb: 2, resImpCost: 2, resImpTime: 1, resImpScope: 1, resCostImpact: { low: 60000, likely: 120000, high: 240000 } },
  { code: "R-05", title: "Paro del sindicato de construcción civil", type: "amenaza", category: "Externo", owner: "Asesoría Legal", proximity: "media", status: "con_respuesta", wbs: ["4.1", "4.2", "4.3"],
    cause: "no se acuerdan las condiciones laborales con el sindicato", event: "el sindicato paraliza la obra", effect: "se detiene la ejecución y aumentan los costos indirectos",
    prob: 2, impCost: 3, impTime: 4, impScope: 1, costImpact: { low: 100000, likely: 200000, high: 400000 }, timeImpact: { low: 15, likely: 30, high: 60 },
    strategy: "evitar", response: "Acuerdo laboral previo al inicio de obra: jornadas, seguridad y contratación local.", trigger: "Rechazo del sindicato a la propuesta de acuerdo", responseOwner: "Asesoría Legal",
    resProb: 1, resImpCost: 3, resImpTime: 4, resImpScope: 1, resCostImpact: { low: 100000, likely: 200000, high: 400000 }, resTimeImpact: { low: 15, likely: 30, high: 60 } },
  { code: "R-06", title: "Accidente grave en obra", type: "amenaza", category: "Técnico", owner: "Residente de Obra", proximity: "larga", status: "con_respuesta", wbs: ["4.1", "4.3"],
    cause: "trabajos en altura y con maquinaria pesada en simultáneo", event: "ocurre un accidente grave", effect: "se paraliza el frente de trabajo y hay sanciones de SUNAFIL",
    prob: 2, impCost: 3, impTime: 4, impScope: 3, costImpact: { low: 80000, likely: 150000, high: 400000 }, timeImpact: { low: 10, likely: 25, high: 60 },
    strategy: "mitigar", response: "Plan de SST, inducción obligatoria y supervisión diaria; auditoría previa de cumplimiento.", trigger: "Incidente sin lesión (casi accidente) reportado", responseOwner: "Residente de Obra",
    resProb: 1, resImpCost: 3, resImpTime: 4, resImpScope: 3, resCostImpact: { low: 80000, likely: 150000, high: 400000 }, resTimeImpact: { low: 10, likely: 25, high: 60 } },
  { code: "R-07", title: "Oposición vecinal y restricciones de tráfico", type: "amenaza", category: "Externo", owner: "Residente de Obra", proximity: "corta", status: "con_respuesta", wbs: ["4.1"],
    cause: "la Junta de vecinos de Lurín percibe impactos de ruido y tránsito de camiones", event: "los vecinos reclaman y las autoridades restringen los horarios de trabajo", effect: "se reducen las horas productivas del movimiento de tierras",
    prob: 3, impCost: 2, impTime: 3, impScope: 1, costImpact: { low: 20000, likely: 50000, high: 120000 }, timeImpact: { low: 5, likely: 10, high: 25 },
    strategy: "mitigar", response: "Mesas de diálogo mensuales, canal de reclamos y plan de manejo de tráfico comunicado antes del inicio.", trigger: "Primer reclamo formal de los vecinos", responseOwner: "Residente de Obra",
    resProb: 2, resImpCost: 2, resImpTime: 2, resImpScope: 1, resCostImpact: { low: 10000, likely: 25000, high: 60000 }, resTimeImpact: { low: 2, likely: 5, high: 12 } },
  { code: "R-08", title: "Retraso en la fabricación de estructuras metálicas", type: "amenaza", category: "Externo", owner: "Jefe de Logística", proximity: "media", status: "con_respuesta", wbs: ["3.1", "4.3"],
    cause: "la fábrica del Proveedor A acumula pedidos", event: "las estructuras se entregan tarde", effect: "se retrasa el montaje de la estructura y cobertura",
    prob: 3, impCost: 2, impTime: 4, impScope: 1, costImpact: { low: 30000, likely: 60000, high: 150000 }, timeImpact: { low: 15, likely: 25, high: 45 },
    strategy: "mitigar", response: "Inspección en fábrica cada dos semanas e hitos de fabricación pagados contra avance.", trigger: "Avance de fabricación menor al 90 % del programado", responseOwner: "Jefe de Logística",
    resProb: 2, resImpCost: 2, resImpTime: 3, resImpScope: 1, resCostImpact: { low: 30000, likely: 60000, high: 150000 }, resTimeImpact: { low: 10, likely: 15, high: 30 } },
  { code: "R-09", title: "Rendimientos de cuadrilla menores a los estimados", type: "amenaza", category: "Gestión del proyecto", owner: "Residente de Obra", proximity: "media", status: "monitoreo", wbs: ["4.3", "4.4"],
    cause: "las duraciones se estimaron con rendimientos teóricos de cuadrilla", event: "el rendimiento real resulta menor", effect: "aumentan la duración y el costo de mano de obra",
    prob: 4, impCost: 3, impTime: 3, impScope: 1, costImpact: { low: 100000, likely: 220000, high: 450000 }, timeImpact: { low: 10, likely: 20, high: 30 },
    strategy: "aceptar", response: "Aceptación activa: se cubre con la contingencia del estimado y se mide el rendimiento real cada semana.", trigger: "Rendimiento real menor al 85 % del estimado durante dos semanas seguidas", responseOwner: "Residente de Obra" },
  { code: "R-10", title: "Descuento por volumen al consolidar compras", type: "oportunidad", category: "Gestión del proyecto", owner: "Jefe de Logística", proximity: "corta", status: "con_respuesta", wbs: ["3.2", "3.3"],
    cause: "las compras de materiales y de equipos eléctricos se concentran en el mismo periodo", event: "se consolida el pedido con un mismo proveedor", effect: "se obtiene un descuento por volumen",
    prob: 3, impCost: 3, impTime: 1, impScope: 1, costImpact: { low: 40000, likely: 90000, high: 150000 },
    strategy: "mejorar", response: "Solicitar cotización consolidada a los Proveedores B y C.", trigger: "Cotizaciones recibidas para 3.2 y 3.3", responseOwner: "Jefe de Logística",
    resProb: 4, resImpCost: 3, resImpTime: 1, resImpScope: 1, resCostImpact: { low: 40000, likely: 90000, high: 150000 } }
];

// Los riesgos del ejemplo como objetos normalizados; `resolveWbs` convierte un Código EDT en el id del paquete de
// SU EDT ("" si no existe: se omite).
export function buildSampleRisks(resolveWbs: (code: string) => string): Risk[] {
  return SAMPLE_RISKS.map((s, i) => normalizeRisk({ ...s, id: "rk" + (i + 1), identifiedOn: "2026-07-06", wbsIds: s.wbs.map(resolveWbs).filter(Boolean) }, "rk" + (i + 1)));
}
// Órdenes de cambio del ejemplo vinculadas a un riesgo (las mismas de Cost-management): para que el registro
// muestre lo que Costos tiene aprobado por cada riesgo también en modo independiente.
export const SAMPLE_LINKED_ORDERS = [{ id: "OC-001", riskId: "rk3", riskCode: "R-03", cost: 180000, status: "Aprobada", fund: "Contingencia" }];
