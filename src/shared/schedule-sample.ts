// Ejemplo DISTRIB+ S.A. de la RED DE ACTIVIDADES (EDT + 43 actividades + 3 hitos + enlaces) -- para los módulos
// que en modo independiente necesitan CORRER el CPM sin ser el módulo de Cronograma: el Registro de riesgos y
// Costos (análisis de riesgo de plazo). Es la MISMA red que «Definir las Actividades» (`sampleActivities()`) y
// Cronograma/CPM (`SAMPLE_LINK_PLAN`) siembran en el proyecto real: mismos códigos EDT, nombres, metrados,
// rendimientos y enlaces (Regla #6 de CLAUDE.md). Esos módulos conservan su copia local (cada módulo funciona sin
// depender de otro); lo que impide que se desalineen es la prueba de oro de tests/unit/schedule-sample.test.ts:
// con inicio 2026-07-06 la red da 273 días laborables y 34 nodos críticos (ver ARCHITECTURE.md, «Dataset de
// referencia (DISTRIB+)»).
import type { WbsModule, ActivitiesModule, ActivityItem, MilestoneItem, ScheduleLink, ScheduleLinkType, ScheduleLagUnit } from "../core/types";

export const SAMPLE_START_DATE = "2026-07-06";

// Fases (nivel 1) y paquetes de trabajo (nivel 2) de la EDT de ejemplo, con sus actividades.
// Actividad: [nombre, unidad, metrado, rendimiento por equipo, n.º de equipos]; Dur = ceil(metrado / (equipos × rend.)).
type ActRow = [string, string, number, number, number?];
const PHASES: Array<{ name: string; packages: Array<{ name: string; acts: ActRow[] }> }> = [
  { name: "Dirección de Proyecto", packages: [
    { name: "Acta de constitución", acts: [["Elaboración y aprobación del acta de constitución", "doc", 1, 0.25]] },
    { name: "Plan de gestión del proyecto", acts: [["Plan para la dirección del proyecto (líneas base)", "doc", 1, 0.2], ["Planes subsidiarios de gestión", "doc", 6, 0.5]] },
    { name: "Informes de seguimiento y control", acts: [["Elaboración de informes mensuales de avance", "doc", 4, 0.5], ["Reuniones de control y seguimiento del proyecto", "reunión", 16, 2]] }
  ] },
  { name: "Ingeniería y Diseño", packages: [
    { name: "Estudio de suelos", acts: [["Calicatas exploratorias", "und", 8, 2], ["Ensayos de laboratorio de suelos", "glb", 1, 0.1], ["Informe geotécnico", "doc", 1, 0.25]] },
    { name: "Diseño estructural", acts: [["Memoria de cálculo estructural", "doc", 1, 0.1], ["Planos estructurales", "lám", 24, 2]] },
    { name: "Diseño eléctrico y sanitario", acts: [["Memoria de cálculo eléctrico y sanitario", "doc", 1, 0.15], ["Planos eléctricos y sanitarios", "lám", 18, 2]] },
    { name: "Permisos y licencias municipales", acts: [["Trámite de licencia de edificación municipal", "trámite", 1, 0.05], ["Trámite de certificado ITSE", "trámite", 1, 0.1]] }
  ] },
  { name: "Procura", packages: [
    { name: "Estructuras metálicas prefabricadas", acts: [["Fabricación de estructuras metálicas", "ton", 260, 15, 2], ["Transporte y entrega de estructuras a obra", "viaje", 12, 3]] },
    { name: "Materiales de construcción", acts: [["Adquisición y suministro de cemento y agregados", "ton", 800, 100], ["Adquisición y suministro de materiales varios de construcción", "glb", 1, 0.15]] },
    { name: "Equipos eléctricos e instalaciones", acts: [["Adquisición de tableros y equipos eléctricos", "und", 15, 3], ["Adquisición de equipos de instalaciones sanitarias", "und", 10, 2]] }
  ] },
  { name: "Construcción", packages: [
    { name: "Movimiento de tierras", acts: [["Corte y excavación masiva", "m³", 4800, 320, 2], ["Relleno y compactación con material propio", "m³", 2100, 250], ["Eliminación de material excedente", "m³", 2700, 300], ["Nivelación y perfilado de plataforma", "m²", 6500, 1200]] },
    { name: "Cimentaciones", acts: [["Excavación de zanjas para zapatas", "m³", 620, 60, 2], ["Solado de concreto e=10 cm", "m²", 480, 120], ["Acero de refuerzo fy=4200 kg/cm²", "kg", 38500, 2500, 2], ["Concreto f'c=280 kg/cm² en zapatas", "m³", 410, 45, 2], ["Encofrado y desencofrado de cimentaciones", "m²", 950, 90, 2]] },
    { name: "Estructura y cobertura", acts: [["Montaje de columnas metálicas", "und", 48, 6], ["Montaje de vigas y tijerales", "ton", 96, 8], ["Instalación de cobertura TR-4", "m²", 5200, 350, 2]] },
    { name: "Acabados y cerramientos", acts: [["Tarrajeo de muros y cielorrasos", "m²", 3200, 40, 2], ["Pintura general de interiores y exteriores", "m²", 3200, 80, 2], ["Cerramiento perimétrico", "m", 320, 20]] },
    { name: "Instalaciones MEP", acts: [["Instalación de tableros y circuitos eléctricos", "pto", 980, 25, 2], ["Instalación de redes sanitarias", "m", 450, 30]] }
  ] },
  { name: "Pruebas y Puesta en Marcha", packages: [
    { name: "Pruebas de instalaciones", acts: [["Pruebas de tableros y circuitos eléctricos", "pto", 120, 30], ["Pruebas hidráulicas de redes sanitarias", "glb", 1, 0.5]] },
    { name: "Capacitación al cliente", acts: [["Capacitación operativa al personal del cliente", "hora", 40, 5], ["Elaboración de manuales de operación y mantenimiento", "doc", 2, 0.5]] },
    { name: "Acta de entrega y cierre", acts: [["Elaboración de dossier de calidad y planos as-built", "doc", 1, 0.1], ["Acta de entrega y cierre del proyecto", "doc", 1, 0.5]] }
  ] }
];

// Enlaces por (Código EDT o de hito, nombre exacto de la actividad) en ambos extremos: los ids reales los asigna cada
// módulo al sembrar su proyecto, así que se resuelven contra las actividades de quien los use.
interface LinkPlanEntry { fc: string; fn: string; tc: string; tn: string; type: ScheduleLinkType; lag?: number; lagUnit?: ScheduleLagUnit; }
export const SAMPLE_LINK_PLAN: LinkPlanEntry[] = [
  // ---- cadenas dentro de cada paquete ----
  { fc: "1.2", fn: "Plan para la dirección del proyecto (líneas base)", tc: "1.2", tn: "Planes subsidiarios de gestión", type: "FS" },
  { fc: "1.3", fn: "Elaboración de informes mensuales de avance", tc: "1.3", tn: "Reuniones de control y seguimiento del proyecto", type: "FS" },
  { fc: "2.1", fn: "Calicatas exploratorias", tc: "2.1", tn: "Ensayos de laboratorio de suelos", type: "FS" },
  { fc: "2.1", fn: "Ensayos de laboratorio de suelos", tc: "2.1", tn: "Informe geotécnico", type: "FS" },
  { fc: "2.2", fn: "Memoria de cálculo estructural", tc: "2.2", tn: "Planos estructurales", type: "FS" },
  { fc: "2.3", fn: "Memoria de cálculo eléctrico y sanitario", tc: "2.3", tn: "Planos eléctricos y sanitarios", type: "FS" },
  { fc: "2.4", fn: "Trámite de licencia de edificación municipal", tc: "2.4", tn: "Trámite de certificado ITSE", type: "FS" },
  { fc: "3.1", fn: "Fabricación de estructuras metálicas", tc: "3.1", tn: "Transporte y entrega de estructuras a obra", type: "FS" },
  { fc: "3.2", fn: "Adquisición y suministro de cemento y agregados", tc: "3.2", tn: "Adquisición y suministro de materiales varios de construcción", type: "FS" },
  { fc: "3.3", fn: "Adquisición de tableros y equipos eléctricos", tc: "3.3", tn: "Adquisición de equipos de instalaciones sanitarias", type: "FS" },
  { fc: "4.1", fn: "Corte y excavación masiva", tc: "4.1", tn: "Relleno y compactación con material propio", type: "FS" },
  { fc: "4.1", fn: "Relleno y compactación con material propio", tc: "4.1", tn: "Eliminación de material excedente", type: "FS" },
  { fc: "4.1", fn: "Eliminación de material excedente", tc: "4.1", tn: "Nivelación y perfilado de plataforma", type: "FS" },
  { fc: "4.2", fn: "Excavación de zanjas para zapatas", tc: "4.2", tn: "Solado de concreto e=10 cm", type: "FS" },
  { fc: "4.2", fn: "Solado de concreto e=10 cm", tc: "4.2", tn: "Acero de refuerzo fy=4200 kg/cm²", type: "FS" },
  { fc: "4.2", fn: "Acero de refuerzo fy=4200 kg/cm²", tc: "4.2", tn: "Concreto f'c=280 kg/cm² en zapatas", type: "FS" },
  { fc: "4.2", fn: "Concreto f'c=280 kg/cm² en zapatas", tc: "4.2", tn: "Encofrado y desencofrado de cimentaciones", type: "FS" },
  { fc: "4.3", fn: "Montaje de columnas metálicas", tc: "4.3", tn: "Montaje de vigas y tijerales", type: "FS" },
  { fc: "4.3", fn: "Montaje de vigas y tijerales", tc: "4.3", tn: "Instalación de cobertura TR-4", type: "FS" },
  { fc: "4.4", fn: "Tarrajeo de muros y cielorrasos", tc: "4.4", tn: "Pintura general de interiores y exteriores", type: "FS" },
  { fc: "4.4", fn: "Pintura general de interiores y exteriores", tc: "4.4", tn: "Cerramiento perimétrico", type: "FS" },
  { fc: "4.5", fn: "Instalación de tableros y circuitos eléctricos", tc: "4.5", tn: "Instalación de redes sanitarias", type: "FS" },
  { fc: "5.1", fn: "Pruebas de tableros y circuitos eléctricos", tc: "5.1", tn: "Pruebas hidráulicas de redes sanitarias", type: "FS" },
  { fc: "5.2", fn: "Capacitación operativa al personal del cliente", tc: "5.2", tn: "Elaboración de manuales de operación y mantenimiento", type: "FS" },
  { fc: "5.3", fn: "Elaboración de dossier de calidad y planos as-built", tc: "5.3", tn: "Acta de entrega y cierre del proyecto", type: "FS" },
  // ---- hitos: inicio y cierre (H2 se enlaza más abajo, entre 4.2 y 4.3) ----
  { fc: "H1", fn: "Inicio del Proyecto", tc: "1.1", tn: "Elaboración y aprobación del acta de constitución", type: "FS" },
  { fc: "5.3", fn: "Acta de entrega y cierre del proyecto", tc: "H3", tn: "Cierre del Proyecto", type: "FS" },
  // ---- Dirección de Proyecto → arranque de Ingeniería ----
  { fc: "1.1", fn: "Elaboración y aprobación del acta de constitución", tc: "1.2", tn: "Plan para la dirección del proyecto (líneas base)", type: "FS" },
  { fc: "1.2", fn: "Planes subsidiarios de gestión", tc: "1.3", tn: "Elaboración de informes mensuales de avance", type: "FS" },
  { fc: "1.2", fn: "Planes subsidiarios de gestión", tc: "2.1", tn: "Calicatas exploratorias", type: "FS" },
  // ---- Ingeniería: suelos → estructural → (eléctrico en paralelo) → permisos ----
  { fc: "2.1", fn: "Informe geotécnico", tc: "2.2", tn: "Memoria de cálculo estructural", type: "FS" },
  { fc: "2.2", fn: "Memoria de cálculo estructural", tc: "2.3", tn: "Memoria de cálculo eléctrico y sanitario", type: "SS", lag: 5, lagUnit: "d" },
  { fc: "2.2", fn: "Planos estructurales", tc: "2.4", tn: "Trámite de licencia de edificación municipal", type: "FS" },
  { fc: "2.3", fn: "Planos eléctricos y sanitarios", tc: "2.4", tn: "Trámite de licencia de edificación municipal", type: "FS" },
  // ---- Procura en paralelo ----
  { fc: "2.2", fn: "Planos estructurales", tc: "3.1", tn: "Fabricación de estructuras metálicas", type: "FS" },
  { fc: "2.4", fn: "Trámite de licencia de edificación municipal", tc: "3.2", tn: "Adquisición y suministro de cemento y agregados", type: "SS", lag: 10, lagUnit: "d" },
  { fc: "2.3", fn: "Planos eléctricos y sanitarios", tc: "3.3", tn: "Adquisición de tableros y equipos eléctricos", type: "FS" },
  // ---- Construcción: permisos habilitan movimiento de tierras ----
  { fc: "2.4", fn: "Trámite de certificado ITSE", tc: "4.1", tn: "Corte y excavación masiva", type: "FS" },
  { fc: "4.1", fn: "Nivelación y perfilado de plataforma", tc: "4.2", tn: "Excavación de zanjas para zapatas", type: "FS" },
  { fc: "3.2", fn: "Adquisición y suministro de materiales varios de construcción", tc: "4.2", tn: "Acero de refuerzo fy=4200 kg/cm²", type: "FS" },
  { fc: "4.2", fn: "Encofrado y desencofrado de cimentaciones", tc: "H2", tn: "Fin de Cimentaciones", type: "FS" },
  { fc: "H2", fn: "Fin de Cimentaciones", tc: "4.3", tn: "Montaje de columnas metálicas", type: "FS" },
  { fc: "3.1", fn: "Transporte y entrega de estructuras a obra", tc: "4.3", tn: "Montaje de columnas metálicas", type: "FS" },
  { fc: "4.3", fn: "Instalación de cobertura TR-4", tc: "4.4", tn: "Tarrajeo de muros y cielorrasos", type: "FS" },
  { fc: "4.3", fn: "Montaje de vigas y tijerales", tc: "4.5", tn: "Instalación de tableros y circuitos eléctricos", type: "SS", lag: 8, lagUnit: "d" },
  { fc: "3.3", fn: "Adquisición de equipos de instalaciones sanitarias", tc: "4.5", tn: "Instalación de redes sanitarias", type: "FS" },
  // ---- Pruebas, capacitación y cierre ----
  { fc: "4.4", fn: "Cerramiento perimétrico", tc: "5.1", tn: "Pruebas de tableros y circuitos eléctricos", type: "SS", lag: 3, lagUnit: "d" },
  { fc: "4.5", fn: "Instalación de redes sanitarias", tc: "5.1", tn: "Pruebas hidráulicas de redes sanitarias", type: "FS" },
  { fc: "5.1", fn: "Pruebas hidráulicas de redes sanitarias", tc: "5.2", tn: "Capacitación operativa al personal del cliente", type: "FS" },
  { fc: "5.1", fn: "Pruebas hidráulicas de redes sanitarias", tc: "5.3", tn: "Elaboración de dossier de calidad y planos as-built", type: "FS" },
  { fc: "5.2", fn: "Elaboración de manuales de operación y mantenimiento", tc: "5.3", tn: "Elaboración de dossier de calidad y planos as-built", type: "FS" }
];

export interface SampleScheduleModules { wbs: WbsModule; activities: ActivitiesModule; schedule: { links: ScheduleLink[] }; }
// Los módulos de ejemplo con la MISMA forma que guarda el proyecto (wbs, activities, schedule), para pasárselos a
// GPI.util.scheduleNetwork(). Ids: fases «w-1»…, paquetes «w-<código>» (los mismos que usa el ejemplo del registro de
// riesgos), actividades «a1»…«a43» y hitos «m1»…«m3».
export function sampleScheduleModules(): SampleScheduleModules {
  const nodes: WbsModule["nodes"] = {};
  const rootId = "w-0";
  nodes[rootId] = { id: rootId, name: "Proyecto DISTRIB+ S.A. — Almacén Lurín", children: [] };
  const byLeaf: Record<string, ActivityItem[]> = {}, idByCode: Record<string, Record<string, string>> = {}; // código EDT → nombre → id
  let n = 0;
  PHASES.forEach((ph, i) => {
    const pid = "w-" + (i + 1);
    nodes[pid] = { id: pid, name: ph.name, children: [] };
    (nodes[rootId].children as string[]).push(pid);
    ph.packages.forEach((pk, j) => {
      const code = (i + 1) + "." + (j + 1), lid = "w-" + code;
      nodes[lid] = { id: lid, name: pk.name, children: [] };
      (nodes[pid].children as string[]).push(lid);
      idByCode[code] = {};
      byLeaf[lid] = pk.acts.map(([name, unit, qty, perf, teams]) => {
        const id = "a" + (++n); idByCode[code][name] = id;
        return { id, name, unit, qty, perf, teams: teams == null ? 1 : teams };
      });
    });
  });
  const milestones: MilestoneItem[] = [
    { id: "m1", code: "H1", name: "Inicio del Proyecto", leafId: null, afterLeafId: null },
    { id: "m2", code: "H2", name: "Fin de Cimentaciones", leafId: "w-4.2" },
    { id: "m3", code: "H3", name: "Cierre del Proyecto", leafId: null, afterLeafId: "w-5.3" }
  ];
  milestones.forEach((m) => { idByCode[m.code] = { [m.name]: m.id }; });
  const links: ScheduleLink[] = [];
  SAMPLE_LINK_PLAN.forEach((e, k) => {
    const from = (idByCode[e.fc] || {})[e.fn], to = (idByCode[e.tc] || {})[e.tn];
    if (from && to) links.push({ id: "L" + (k + 1), from, to, type: e.type, lag: e.lag || 0, lagUnit: e.lagUnit || "d", source: "import" });
  });
  return {
    wbs: { rootId, idCounter: 100, nodes },
    activities: { byLeaf, idCounter: n + 1, milestones },
    schedule: { links }
  };
}
