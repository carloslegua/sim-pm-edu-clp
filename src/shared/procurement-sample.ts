// Ejemplo DISTRIB+ del Plan de Adquisiciones — UNA sola fuente. Amplía el MISMO caso (Regla #6 de CLAUDE.md): los paquetes de procura son los de
// la EDT (3.1 estructuras, 3.2 materiales, 3.3 equipos; 4.5 instalaciones MEP a la Subcontrata MEP) con su costo, los proveedores son los del OBS
// (Proveedor A, B y C, Subcontrata MEP), las fechas requeridas son las del CRONOGRAMA CPM del caso (3.1 en obra 2026-10-19; 3.2 cierra la Procura
// 2026-11-04; 3.3 2026-10-13; 4.5 termina 2027-04-16; 4.1 arranca 2026-11-12; calendario del caso, con sus feriados), los riesgos que un contrato debe tratar son los del Registro (R-02 acero,
// R-04 tipo de cambio, R-08 fabricación, R-10 descuento por volumen…) y el servicio de ensayos coincide con la partida de evaluación del costo de la
// calidad (95.000). La fecha de corte es la aprobación del plan (2026-08-05, paquete 1.2): a esa fecha ninguna convocatoria está vencida.
// tests/unit/procurement-sample.test.ts lo verifica contra el CPM real, la EDT, el OBS y los riesgos.
import { SAMPLE_CASE_BASE_COST, SAMPLE_CASE_LEAVES, SAMPLE_OBS_ROLES } from "./case-distribplus";
import { normalizeItem, type ProcData, type ProcFacts } from "./procurement-plan";
import { SAMPLE_PLAN, buildSampleRisks } from "./risk-sample";
import { inherentScore, isOpen, levelOf } from "./risk-analysis";

export const SAMPLE_AS_OF = "2026-08-05";
export const SAMPLE_SUPPLIERS = ["Proveedor A", "Proveedor B", "Proveedor C", "Subcontrata MEP"];
export const sampleProcurementFacts = (): ProcFacts => ({
  leaves: SAMPLE_CASE_LEAVES.map((l) => ({ id: "w-" + l.code, code: l.code, name: l.name, cost: l.cost })), roles: SAMPLE_OBS_ROLES.slice(),
  risks: buildSampleRisks((code) => "w-" + code).filter(isOpen).map((r) => ({ id: r.id, code: r.code, title: r.title, wbsIds: r.wbsIds, high: levelOf(inherentScore(r), SAMPLE_PLAN) === "alto", threat: r.type === "amenaza" })),
  suppliers: SAMPLE_SUPPLIERS.slice(), estimateClass: 3, baseCost: SAMPLE_CASE_BASE_COST
});

const CRITERIA = (price: number, tech: number, plazo: number, exp: number) => [{ name: "Precio", weight: price }, { name: "Capacidad técnica y certificados de calidad", weight: tech }, { name: "Plazo de entrega", weight: plazo }, { name: "Experiencia en proyectos similares", weight: exp }];
// código · nombre · paquetes · cubre todo · decisión · contrato · selección · criterios · valor · fecha requerida · plazo proveedor (d) · selección (d) · proveedor · estado · responsable · riesgos
type Row = [string, string, string[], boolean, string, string, string, Array<{ name: string; weight: number }>, number, string, number, number, string, string, string, string[]];
const ROWS: Row[] = [
  ["PR-01", "Estructuras metálicas prefabricadas", ["3.1"], true, "Comprar", "Precio fijo con ajuste económico (FPEPA)", "Concurso por calidad y costo", CRITERIA(35, 35, 20, 10), 1820000, "2026-10-19", 18, 45, "Proveedor A", "Convocada", "Jefe de Logística", ["R-02", "R-04", "R-08"]],
  ["PR-02", "Materiales de construcción", ["3.2"], true, "Comprar", "Precio unitario", "Concurso de precios", CRITERIA(50, 20, 20, 10), 715000, "2026-11-04", 20, 30, "Proveedor B", "Planificada", "Jefe de Logística", ["R-10"]],
  ["PR-03", "Equipos eléctricos e instalaciones", ["3.3"], true, "Comprar", "Precio fijo (FFP)", "Invitación restringida", CRITERIA(40, 30, 20, 10), 415000, "2026-10-13", 13, 20, "Proveedor C", "Planificada", "Jefe de Logística", ["R-04", "R-10"]],
  ["PR-04", "Subcontrato de instalaciones MEP", ["4.5"], true, "Comprar", "Precio fijo (FFP)", "Invitación restringida", CRITERIA(40, 30, 10, 20), 485000, "2027-04-16", 46, 60, "Subcontrata MEP", "Planificada", "Director de Proyecto", []],
  ["PR-05", "Servicio de ensayos de laboratorio (suelos, concreto y densidad de campo)", ["4.1", "4.2"], false, "Comprar", "Precio unitario", "Concurso de precios", CRITERIA(50, 30, 10, 10), 95000, "2026-11-12", 10, 30, "", "Planificada", "Control de Calidad", ["R-05", "R-06", "R-07"]]
];
export function buildSampleProcurement(resolveWbs: (code: string) => string = (c) => "w-" + c, resolveRisk: (code: string) => string = (c) => { const r = buildSampleRisks((code) => "w-" + code).find((x) => x.code === c); return r ? r.id : ""; }): ProcData {
  const items = ROWS.map(([code, name, wbs, full, decision, contractType, selection, criteria, value, needDate, leadDays, selectionDays, supplier, status, owner, risks], i) =>
    normalizeItem({ id: "pr" + (i + 1), code, name, wbsIds: wbs.map(resolveWbs).filter(Boolean), full, decision, contractType, selection, criteria, value, needDate, leadDays, selectionDays, supplier, status, owner, awardDate: "", riskIds: risks.map(resolveRisk).filter(Boolean),
      notes: code === "PR-01" ? "Convocatoria anticipada: la fabricación tiene el plazo más largo y la mayor exposición al precio del acero (R-02) y al tipo de cambio (R-04). El ajuste económico limita el riesgo del proveedor sin trasladarnos el alza total." : "" }, "pr" + (i + 1)));
  return {
    strategy: "Se compra todo lo que no es la dirección, la ingeniería ni el control de calidad del proyecto: procura de estructuras, materiales y equipos por paquete, y la instalación MEP a un subcontratista. Cada compra usa el contrato que reparte el riesgo según qué tan definido está su alcance: precio fijo donde hay planos y especificación (equipos, MEP), ajuste económico donde el insumo es volátil (acero) y precio unitario donde la cantidad final varía (materiales, ensayos).",
    performance: "El Jefe de Logística mide a cada proveedor por entregas a tiempo y conformes (registro de recepción de Calidad) y por avance de fabricación; dos entregas no conformes seguidas activan una reunión de acción correctiva con el proveedor y su registro como interesado a gestionar de cerca.",
    approvals: "Adjudicaciones y contratos hasta USD 100.000: Director de Proyecto. Mayores a ese monto: Comité Directivo / Sponsor, con el informe de evaluación de ofertas y la revisión de Asesoría Legal.",
    asOf: SAMPLE_AS_OF, items, idCounter: items.length + 1
  };
}
