// Ejemplo DISTRIB+ S.A. de la BASIS OF ESTIMATE (AACE RP 34R-05) — UNA sola fuente (Cost-management.html, modo independiente). Amplía el
// MISMO caso (Regla #6 de CLAUDE.md): reutiliza el CAPEX de USD 8,5 M, los supuestos y exclusiones del Enunciado del Alcance, las órdenes de
// cambio OC-001…003, los riesgos R-01…R-10, la fecha base de precios de la escalación y las personas del OBS. Un test verifica que cubre las
// secciones que se exigen a un estimado de clase 3 (la del caso) y que sus datos no se contradicen con el resto del ejemplo.
import { normalizeBoe, type Boe } from "./boe";
import { SAMPLE_BASE_DATE } from "./escalation-sample";

// CAPEX de referencia del Acta de Constitución (USD): el presupuesto total del caso debe quedar dentro.
export const SAMPLE_CAPEX = 8500000;

export function buildSampleBoe(): Boe {
  return normalizeBoe({
    version: "1.0", status: "aprobada", preparedBy: "Director de Proyecto (PM)", reviewedBy: "Jefe de Ingeniería", approvedBy: "Gerencia General DISTRIB+ (Sponsor)", approvedOn: "2026-07-03",
    purpose: "Sustentar el presupuesto de autorización del Almacén Lurín de DISTRIB+ S.A. (línea base de costos) y servir de base del control de cambios durante la ejecución.",
    objectives: "Autorizar el financiamiento del proyecto dentro del CAPEX de referencia (USD 8,5 M) y dejar una línea base de costos, con su contingencia y su escalación, sobre la que controlar el valor ganado. Estimado de clase 3, preparado en paralelo con el Plan para la Dirección del Proyecto.",
    scope: "Almacén logístico para DISTRIB+ S.A. en Lurín (Lima): nave industrial con cobertura metálica, instalaciones eléctricas y sanitarias dimensionadas para operación logística y patio de maniobras para vehículos de carga pesada. Comprende ingeniería de detalle, permisos, procura de estructuras y materiales, obra civil y MEP, y pruebas y puesta en marcha hasta la entrega formal (ver el Enunciado del Alcance, DEL.01 a DEL.06).",
    execution: "Obra civil con cuadrillas propias A a D; suministro de estructuras metálicas, materiales y equipos eléctricos por contratos con los Proveedores A, B y C; instalaciones MEP por subcontrata. Jornada de 8 h, de lunes a viernes, sin trabajo nocturno. Los permisos municipales (licencia de edificación e ITSE) preceden al movimiento de tierras.",
    parameters: "Terreno plano en Lurín, a nivel del mar; acceso de vehículos de carga pesada sin restricción de horario; agua y energía provisionales a cargo del contratista.",
    classNote: "Clase 3 (autorización de presupuesto): definición de ingeniería en torno al 30 % de madurez, con la ingeniería de detalle en curso. El rango de exactitud de la clase se aplica al presupuesto en la pestaña 03.",
    tools: "Estimar los Costos (precio unitario × metrado por actividad), WBS Builder (EDT), Cronograma/CPM (fechas de gasto), y en Costos la estimación por rangos con simulación Monte Carlo (contingencia) y la escalación por índices.",
    coding: "Código EDT jerárquico de WBS Builder (1.1 a 5.3): cada paquete de trabajo es una cuenta de costo. Las cuentas de escalación son cuatro: mano de obra, materiales, equipos y subcontratos.",
    currencyNote: "USD, la moneda del CAPEX y de todo el caso; las cotizaciones vienen en USD. El 30 % del costo está denominado en otra moneda: el tipo de cambio se congela a la fecha base (2026-07-01) y la exposición cambiaria se cuantifica aparte de la escalación (banda de ±8 %, solo con régimen flotante).",
    units: "Sistema métrico: m, m², m³, kg, ton, und, glb; horas-hombre para la mano de obra. Los rendimientos se expresan en unidades por día por cuadrilla.",
    rounding: "Costos por paquete redondeados al dólar; los totales se suman sin redondeos intermedios.",
    quantities: "Metrados por actividad de Definir las Actividades, medidos de los planos al ~30 % de definición; los de concreto y acero de refuerzo llevan el rango de la clase (contingencia). Las cantidades de las partidas de procura son las de las cotizaciones.",
    date: SAMPLE_BASE_DATE,
    source: "Cotizaciones de los Proveedores A, B y C (vigencia de 60 días), base de rendimientos regional y precios unitarios de la última licitación de DISTRIB+.",
    costBasis: "Costo directo sin IGV. Incluye los gastos generales de obra (≈ 5,8 % del costo base, repartidos en el plazo y valorizados por día de extensión del plazo). Cotizaciones en USD.",
    boundary: "Escalación = movimiento general de precios de mercado por cuenta de costo, medido con índices desde la fecha base (2026-07-01), en el momento en que se gasta cada paquete; se financia al P70 de la simulación y se controla como una cuenta aparte. Contingencia = riesgos específicos del proyecto (Registro de Riesgos R-01 a R-10) e incertidumbre de los rangos del estimado; NO incluye escalación. Tipo de cambio = línea aparte (régimen congelado a la fecha base). Asignaciones: ninguna. R-02 (alza del precio del acero) permanece como evento de contingencia solo por el exceso sobre la tendencia general de materiales.",
    planning: "Cronograma CPM de 273 días laborables (calendario de 5 días) con inicio el 2026-07-06; las compras se ejecutan en paralelo con la ingeniería. Las fechas de gasto de la escalación salen de este cronograma (línea base LB-n cuando se fije).",
    bulk: "Concreto f'c=280 kg/cm² y acero de refuerzo: metrado de planos + 5 % de desperdicio; cemento y agregados por tonelada según la cotización del Proveedor B.",
    labor: "Cuadrillas propias A a D con rendimientos de la base regional; tarifas del convenio de construcción civil vigente. Jornada de 8 h.",
    productivity: "Rendimientos según la base regional, sin factor por altitud (Lurín está a nivel del mar); un factor de 1,05 por trabajo en obra abierta con tráfico de vehículos pesados.",
    demolition: "La demolición de la losa existente no identificada en el levantamiento queda fuera del estimado base: se gestiona como trabajo imprevisto dentro del alcance (orden de cambio OC-003, con reserva de gestión).",
    allowances: "Sin asignaciones en el estimado base: cada paquete está cotizado o valorizado por precio unitario. El hallazgo geotécnico se cubre con contingencia (R-03; OC-001).",
    assumptions: "Diseño al 30 % de madurez. Suministro nacional. Jornada de 8 h, sin trabajo nocturno. El terreno de Lurín está saneado legalmente y disponible desde el inicio. La disponibilidad de cuadrillas y subcontratistas se mantiene según el plan de recursos. El tipo de cambio y el precio del acero se mantienen dentro del rango presupuestado.",
    exclusions: "IGV, saneamiento físico-legal del terreno, costos financieros y expropiaciones; operación y mantenimiento posteriores a la entrega; equipamiento logístico interno (racks, montacargas, sistemas de gestión de almacén); obras fuera del lindero y ampliaciones futuras de la nave.",
    exceptions: "Sin excepciones a la práctica de estimación de DISTRIB+; los costos financieros se presupuestan aparte.",
    risksNote: "Los riesgos abiertos del Registro de Riesgos (R-01 licencia, R-02 acero, R-03 suelo…) se cuantifican en la contingencia con su riesgo residual; las oportunidades se registran pero no reducen el presupuesto.",
    contingencyNote: "La contingencia es del director del proyecto y está dentro de la línea base; su liberación sigue la política de reservas del plan de riesgos (director de proyecto, CCB o sponsor según el monto).",
    mgmtNote: "La reserva de gestión es el 5 % de la línea base, del sponsor y fuera de ella; su uso y el de los fondos adicionales los autoriza siempre el sponsor.",
    reconciliation: "Conciliado con el CAPEX de referencia del Acta de Constitución (USD 8,5 M): el presupuesto total, con la reserva de gestión, queda dentro de esa cifra. No existe un estimado anterior con el que conciliar.",
    benchmarking: "Contrastado con el costo por m² de los tres últimos almacenes construidos por DISTRIB+ en Lima, ajustado por fecha base y por tipo de estructura.",
    qa: "Revisión del estimado por el Jefe de Ingeniería (metrados y rendimientos) y por Control de Calidad (consistencia con la EDT y las cotizaciones) antes de la aprobación del sponsor.",
    team: [
      { name: "Director de Proyecto (PM)", role: "Estimador responsable; integra el estimado y prepara la BOE" },
      { name: "Jefe de Ingeniería", role: "Metrados, rendimientos y revisión técnica del estimado" },
      { name: "Jefe de Logística", role: "Cotizaciones de los Proveedores A, B y C" },
      { name: "Residente de Obra", role: "Rendimientos de cuadrillas y plazos de obra" },
      { name: "Control de Calidad (QA/QC)", role: "Revisión de consistencia del estimado" }
    ],
    refs: [
      { title: "Acta de Constitución del Proyecto", note: "CAPEX de referencia y requisitos de alto nivel (RAN.01 a RAN.04)" },
      { title: "Enunciado del Alcance", note: "Entregables DEL.01 a DEL.06, supuestos, restricciones y exclusiones" },
      { title: "Cotizaciones de los Proveedores A, B y C", note: "Vigencia de 60 días desde la fecha base" },
      { title: "Base de rendimientos regional", note: "Rendimientos por cuadrilla" },
      { title: "Registro de Riesgos R-01 a R-10", note: "Riesgos cuantificados en la contingencia" }
    ],
    checklist: ["boe", "summary", "detail", "quantities", "schedule", "risk", "escalation", "reconc", "signoff"].map((id) => ({ id, done: id !== "reconc" }))
  });
}
