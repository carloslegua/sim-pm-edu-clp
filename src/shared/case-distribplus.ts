// Datos base del caso DISTRIB+ S.A. — Almacén Lurín que comparten los módulos de gestión NUEVOS en su modo independiente (Comunicaciones,
// Calidad, Adquisiciones): los puestos del OBS (con el nombre EXACTO que trae OBS_Builder.html) y los 18 paquetes de la EDT con su costo
// (los mismos de WBS_Builder.html). Es solo lectura: la fuente sigue siendo cada módulo (Regla #6 de CLAUDE.md); estas listas existen para
// que los módulos nuevos no dependan de importar el código de otro. tests/unit/case-distribplus.test.ts las compara con el caso.
export interface CaseLeaf { code: string; name: string; cost: number; }
export const SAMPLE_OBS_ROLES = [
  "Comité Directivo / Sponsor", "Director de Proyecto", "Jefe de Ingeniería", "Especialista en Geotecnia", "Ingeniero Estructural", "Ingeniero MEP",
  "Jefe de Logística", "Proveedor — Estructuras metálicas", "Proveedor — Materiales de construcción", "Proveedor — Equipos eléctricos",
  "Residente de Obra", "Subcontrata MEP", "Control de Calidad", "Asesoría Legal"
];
export const SAMPLE_CASE_LEAVES: CaseLeaf[] = [
  { code: "1.1", name: "Acta de constitución", cost: 12000 }, { code: "1.2", name: "Plan de gestión del proyecto", cost: 38000 }, { code: "1.3", name: "Informes de seguimiento y control", cost: 145000 },
  { code: "2.1", name: "Estudio de suelos", cost: 28000 }, { code: "2.2", name: "Diseño estructural", cost: 165000 }, { code: "2.3", name: "Diseño eléctrico y sanitario", cost: 98000 }, { code: "2.4", name: "Permisos y licencias municipales", cost: 64000 },
  { code: "3.1", name: "Estructuras metálicas prefabricadas", cost: 1820000 }, { code: "3.2", name: "Materiales de construcción", cost: 715000 }, { code: "3.3", name: "Equipos eléctricos e instalaciones", cost: 415000 },
  { code: "4.1", name: "Movimiento de tierras", cost: 380000 }, { code: "4.2", name: "Cimentaciones", cost: 735000 }, { code: "4.3", name: "Estructura y cobertura", cost: 1165000 }, { code: "4.4", name: "Acabados y cerramientos", cost: 550000 }, { code: "4.5", name: "Instalaciones MEP", cost: 485000 },
  { code: "5.1", name: "Pruebas de instalaciones", cost: 145000 }, { code: "5.2", name: "Capacitación al cliente", cost: 48000 }, { code: "5.3", name: "Acta de entrega y cierre", cost: 92000 }
];
export const SAMPLE_CASE_BASE_COST = 7100000;
