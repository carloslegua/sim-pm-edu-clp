// Ejemplo DISTRIB+ S.A. de la MATRIZ RACI para el PROYECTO conectado — UNA sola fuente (`Cargar ejemplo en el proyecto` de RACI_Matrix). Amplía el MISMO caso (Regla #6):
// paquetes = los 18 de la EDT (por Código EDT) y columnas = los puestos del OBS del caso (por NOMBRE exacto del puesto, que trae OBS_Builder.html).
// A diferencia del ejemplo INDEPENDIENTE de la matriz (que trae errores DELIBERADOS para que el Velocímetro de Gobernanza tenga qué detectar), este está BIEN armado:
// cada paquete tiene exactamente un R y un A, ningún paquete concentra más de tres C, y todos los puestos de la organización se usan. Es la referencia contra la que el
// alumno compara su propia matriz (y la que alimenta el «Responsable» de la EDT y los planes de calidad, comunicaciones y adquisiciones).
export interface RaciPlanRow { code: string; R: string[]; A: string; C?: string[]; I?: string[]; }
const SPONSOR = "Comité Directivo / Sponsor", DP = "Director de Proyecto", ING = "Jefe de Ingeniería", GEO = "Especialista en Geotecnia", EST = "Ingeniero Estructural", MEP = "Ingeniero MEP",
  LOG = "Jefe de Logística", PA = "Proveedor — Estructuras metálicas", PB = "Proveedor — Materiales de construcción", PC = "Proveedor — Equipos eléctricos", RES = "Residente de Obra",
  CA = "Cuadrilla A — Movimiento de tierras", CB = "Cuadrilla B — Cimentaciones", CC = "Cuadrilla C — Estructura y cobertura", CD = "Cuadrilla D — Acabados y cerramientos", SUB = "Subcontrata MEP",
  QA = "Control de Calidad", LEG = "Asesoría Legal";
export const RACI_LIVE_PLAN: RaciPlanRow[] = [
  { code: "1.1", R: [DP], A: SPONSOR }, { code: "1.2", R: [DP], A: SPONSOR }, { code: "1.3", R: [DP], A: SPONSOR },
  { code: "2.1", R: [GEO], A: ING, C: [DP] }, { code: "2.2", R: [EST], A: ING, C: [GEO] }, { code: "2.3", R: [MEP], A: ING },
  { code: "2.4", R: [LEG], A: DP, C: [ING, LOG] },
  { code: "3.1", R: [PA], A: LOG, C: [EST] }, { code: "3.2", R: [PB], A: LOG }, { code: "3.3", R: [PC], A: LOG, C: [MEP] },
  { code: "4.1", R: [CA], A: RES, C: [GEO] }, { code: "4.2", R: [CB], A: RES, C: [EST] }, { code: "4.3", R: [CC], A: RES }, { code: "4.4", R: [CD], A: RES }, { code: "4.5", R: [SUB], A: RES, C: [MEP] },
  { code: "5.1", R: [QA], A: RES, C: [MEP] }, { code: "5.2", R: [DP], A: SPONSOR, C: [ING] }, { code: "5.3", R: [DP], A: SPONSOR, I: [ING, LOG, RES] }
];

export type RaciAssignments = Record<string, Record<string, string>>;
// Traduce el plan a las filas y columnas REALES (id de la hoja de la EDT por su Código EDT; id del puesto del OBS por su nombre). Lo que no se encuentra queda en `unresolved`.
export function buildLiveRaci(leaves: Array<{ id: string; code: string }>, cols: Array<{ id: string; role: string }>): { assignments: RaciAssignments; unresolved: string[] } {
  const leafBy: Record<string, string> = {}, colBy: Record<string, string> = {}, unresolved: string[] = [], out: RaciAssignments = {};
  leaves.forEach((l) => { leafBy[l.code] = l.id; }); cols.forEach((c) => { colBy[c.role.trim()] = c.id; });
  RACI_LIVE_PLAN.forEach((r) => {
    const lid = leafBy[r.code]; if (!lid) { unresolved.push("paquete " + r.code); return; }
    const cell: Record<string, string> = {};
    const put = (role: string, letter: string): void => { const cid = colBy[role]; if (cid) cell[cid] = letter; else if (unresolved.indexOf("puesto «" + role + "»") < 0) unresolved.push("puesto «" + role + "»"); };
    r.R.forEach((x) => put(x, "R")); put(r.A, "A"); (r.C || []).forEach((x) => put(x, "C")); (r.I || []).forEach((x) => put(x, "I"));
    if (Object.keys(cell).length) out[lid] = cell;
  });
  return { assignments: out, unresolved };
}
