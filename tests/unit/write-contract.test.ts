// Contrato de escritura del núcleo (hallazgos "alta" y "media" reportados por
// el usuario tras una revisión externa):
//
// 1) La guarda por projectId evita escribir sobre OTRO proyecto, pero no
//    detectaba que los datos del MISMO proyecto cambiaron después de abrir
//    la pestaña: abrir el Acta, actualizarla desde otra pestaña y ejecutar
//    el guardado de salida de la primera dejaba la versión vieja (vacía)
//    sobre la nueva. Ahora cada proyecto lleva una revisión por módulo y
//    cada pestaña una EditSession (proyecto + revisión + foto de lo que
//    cargó): saveModule()/saveMeta() detectan el conflicto ANTES de
//    sustituir y no escriben.
// 2) El resultado de la escritura no gobernaba lo que mostraban los módulos
//    (Costos decía "Sincronizado" con la cuota agotada): WriteResult
//    distingue saved / unchanged / pending / conflict / rejected y
//    describeWrite() da el texto común.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KEY, activeId, createProject, describeWrite, getModule, hasUnsavedChanges, meta, openSession,
  patchMeta, rebaseSession, saveMeta, saveModule, saveState, setActive, setModule, writeModule
} from "../../src/core/gpi-core";

beforeEach(() => { localStorage.removeItem(KEY); });
afterEach(() => { vi.restoreAllMocks(); });

describe("saveModule -- versión del mismo proyecto", () => {
  it("REPRO DEL REPORTE: otra pestaña actualiza el Acta y el guardado de salida de la primera NO la sobrescribe", () => {
    createProject({ name: "Proyecto A" });
    writeModule("charter", { description: "" });
    const tabA = openSession("charter")!;              // la pestaña A abre el Acta
    // Otra pestaña (B) la actualiza:
    expect(writeModule("charter", { description: "Descripción nueva de B" }).status).toBe("saved");

    // Guardado de salida de A con lo que ella cargó (vacío) editado a algo propio:
    const r = saveModule("charter", { description: "" , extra: 1 }, tabA);
    expect(r.status).toBe("conflict");
    expect(getModule("charter")).toEqual({ description: "Descripción nueva de B" });
  });

  it("un guardado de salida SIN modificaciones propias es 'unchanged': no escribe ni siquiera si otra pestaña ya cambió el dato", () => {
    createProject({ name: "Proyecto A" });
    writeModule("charter", { description: "" });
    const tabA = openSession("charter")!;
    writeModule("charter", { description: "de B" });
    const r = saveModule("charter", { description: "" }, tabA); // idéntico a lo que A cargó
    expect(r.status).toBe("unchanged");
    expect(getModule("charter")).toEqual({ description: "de B" });
  });

  it("sin cambios ajenos: guarda, sube la revisión y la sesión sigue vigente para el siguiente guardado", () => {
    createProject({ name: "Proyecto A" });
    const s = openSession("charter")!;
    expect(saveModule("charter", { v: 1 }, s).status).toBe("saved");
    expect(saveModule("charter", { v: 2 }, s).status).toBe("saved"); // no se auto-conflictúa
    expect(getModule("charter")).toEqual({ v: 2 });
  });

  it("rebaseSession(): un dato normalizado por el módulo, sin ediciones, no cuenta como modificación", () => {
    createProject({ name: "Proyecto A" });
    writeModule("charter", { a: 1 });
    const s = openSession("charter")!;
    const normalizado = { a: 1, defaults: [] };            // el módulo agrega defaults al hidratar
    rebaseSession(s, normalizado);
    writeModule("charter", { a: 2 });                       // otra pestaña
    expect(saveModule("charter", normalizado, s).status).toBe("unchanged");
    expect(getModule("charter")).toEqual({ a: 2 });
  });

  it("rechaza si el proyecto activo ya no es el de la sesión", () => {
    const a = createProject({ name: "A" });
    const s = openSession("charter")!;
    createProject({ name: "B" });
    const r = saveModule("charter", { x: 1 }, s);
    expect(r).toMatchObject({ status: "rejected", reason: "project-changed" });
    setActive(a);
    expect(getModule("charter")).toBeNull();
  });

  it("escrituras 'derivadas' (RACI -> EDT) no suben la revisión: no provocan falsos conflictos en la pestaña dueña", () => {
    createProject({ name: "A" });
    writeModule("wbs", { rootId: "r", idCounter: 1, nodes: {} });
    const wbsTab = openSession("wbs")!;
    writeModule("wbs", { rootId: "r", idCounter: 1, nodes: {}, derivado: true }, { derived: true });
    expect(saveModule("wbs", { rootId: "r", idCounter: 1, nodes: {}, edicion: 1 }, wbsTab).status).toBe("saved");
  });

  it("sin sesión (Panel de Control, módulo abierto sin proyecto) conserva el comportamiento anterior", () => {
    createProject({ name: "A" });
    expect(saveModule("charter", { x: 1 }, null).status).toBe("saved");
    expect(setModule("charter", { x: 2 })).toBe(true);
    expect(getModule("charter")).toEqual({ x: 2 });
  });
});

describe("saveMeta -- metadatos por campo", () => {
  it("un campo que esta pestaña no tocó NO revierte el cambio hecho en otra (renombrar desde el Panel)", () => {
    createProject({ name: "Original", course: "GPI" });
    const s = openSession("charter")!;
    patchMeta({ name: "Renombrado en el Panel" });          // otra pestaña
    const r = saveMeta({ name: "Original", course: "GPI" }, s); // guardado de salida con los valores cargados
    expect(r.status).toBe("unchanged");
    expect(meta()!.name).toBe("Renombrado en el Panel");
  });

  it("escribe solo los campos que esta pestaña cambió y conserva los ajenos", () => {
    createProject({ name: "N", client: "Cliente 1", location: "" });
    const s = openSession("charter")!;
    patchMeta({ client: "Cliente 2" });                     // otra pestaña
    const r = saveMeta({ client: "Cliente 1", location: "Lima" }, s);
    expect(r.status).toBe("saved");
    expect(meta()!.client).toBe("Cliente 2");
    expect(meta()!.location).toBe("Lima");
  });

  it("si otra pestaña cambió el MISMO campo a otro valor, no se sobrescribe y se informa", () => {
    createProject({ name: "N", client: "C0" });
    const s = openSession("charter")!;
    patchMeta({ client: "C-otra-pestaña" });
    const r = saveMeta({ client: "C-mía" }, s);
    expect(r.status).toBe("conflict");
    expect(r.conflicts).toEqual(["meta.client"]);
    expect(meta()!.client).toBe("C-otra-pestaña");
  });
});

describe("segunda revisión externa: pendiente != confirmado, y guardado atómico módulo + metadatos", () => {
  function bloquearCuota() {
    const real = Storage.prototype.setItem;
    return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === KEY) throw new DOMException("Quota exceeded", "QuotaExceededError");
      return real.call(this, k, v);
    });
  }

  it("REPRO (alta): un reintento con los MISMOS datos tras un 'pending' intenta persistir -- nunca 'unchanged' mientras siga pendiente", () => {
    createProject({ name: "A" });
    writeModule("charter", { description: "anterior" });
    const s = openSession("charter")!;
    const spy = bloquearCuota();
    const r1 = saveModule("charter", { description: "nueva" }, s);
    expect(r1.status).toBe("pending");
    expect(hasUnsavedChanges()).toBe(true);

    // Reintento con el almacenamiento aún lleno: sigue pendiente, NO "unchanged".
    const r2 = saveModule("charter", { description: "nueva" }, s);
    expect(r2.status).toBe("pending");
    expect(describeWrite(r2)).toMatch(/SIN guardar/);

    // Se restablece el almacenamiento: el mismo reintento persiste de verdad.
    spy.mockRestore();
    const r3 = saveModule("charter", { description: "nueva" }, s);
    expect(r3.status).toBe("saved");
    expect(hasUnsavedChanges()).toBe(false);
    const enDisco = JSON.parse(localStorage.getItem(KEY) as string);
    expect(enDisco.projects[activeId() as string].modules.charter).toEqual({ description: "nueva" });
    // y ahora sí, sin cambios nuevos, es unchanged legítimo
    expect(saveModule("charter", { description: "nueva" }, s).status).toBe("unchanged");
  });

  it("lo mismo para metadatos pendientes: el reintento persiste, no se toma por 'sin cambios'", () => {
    createProject({ name: "A", client: "C0" });
    const s = openSession("charter")!;
    const spy = bloquearCuota();
    expect(saveMeta({ client: "C1" }, s).status).toBe("pending");
    expect(saveMeta({ client: "C1" }, s).status).toBe("pending");
    spy.mockRestore();
    expect(saveMeta({ client: "C1" }, s).status).toBe("saved");
    expect(hasUnsavedChanges()).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY) as string).projects[activeId() as string].meta.client).toBe("C1");
  });

  it("un dato pendiente que cambia otra vez antes de persistirse se guarda con lo último", () => {
    createProject({ name: "A" });
    const s = openSession("charter")!;
    const spy = bloquearCuota();
    expect(saveModule("charter", { v: 1 }, s).status).toBe("pending");
    expect(saveModule("charter", { v: 2 }, s).status).toBe("pending");
    spy.mockRestore();
    expect(saveModule("charter", { v: 3 }, s).status).toBe("saved");
    expect(getModule("charter")).toEqual({ v: 3 });
  });

  // Tercera revisión externa (P1): commitState() leía la base ANTES de recuperar lo
  // pendiente. La recuperación (save -> reconcileWithDisk) escribe una copia
  // CONCILIADA con lo que otra pestaña cambió mientras tanto, pero la escritura de
  // la edición nueva reutilizaba la copia anterior y la sobrescribía: la operación
  // decía "saved" y el Costos de la otra pestaña volvía a su valor viejo.
  function otraPestana(fn: (db: { projects: Record<string, { modules: Record<string, unknown>; revs?: Record<string, number> }> }) => void) {
    const raw = JSON.parse(localStorage.getItem(KEY) as string);
    fn(raw);
    localStorage.setItem(KEY, JSON.stringify(raw)); // escritura directa: lo que haría otra pestaña
  }

  it("REPRO (P1): recuperar lo pendiente y guardar una edición nueva en el MISMO reintento no pisa lo que otra pestaña cambió", () => {
    const id = createProject({ name: "A" });
    writeModule("cost", { bac: 100 });
    const s = openSession("charter")!;
    const spy = bloquearCuota();
    expect(saveModule("charter", { description: "primera" }, s).status).toBe("pending");
    spy.mockRestore();                                   // el almacenamiento vuelve...

    otraPestana((raw) => {                               // ...pero B ya había cambiado Costos de 100 a 200
      raw.projects[id].modules.cost = { bac: 200 };
      raw.projects[id].revs = Object.assign({}, raw.projects[id].revs, { cost: ((raw.projects[id].revs || {}).cost || 0) + 1 });
    });

    // A recupera lo pendiente Y guarda otra edición del Acta en la misma llamada
    const r = saveModule("charter", { description: "segunda" }, s);
    expect(r.status).toBe("saved");
    expect(hasUnsavedChanges()).toBe(false);
    const enDisco = JSON.parse(localStorage.getItem(KEY) as string).projects[id].modules;
    expect(enDisco.charter).toEqual({ description: "segunda" });
    expect(enDisco.cost).toEqual({ bac: 200 });          // antes de este fix volvía a { bac: 100 }
  });

  it("REPRO (P1, metadatos): un campo de meta que otra pestaña cambió durante la racha pendiente tampoco se revierte", () => {
    const id = createProject({ name: "A", client: "C0", location: "L0" });
    writeModule("charter", { a: 0 });
    const s = openSession("charter")!;
    const spy = bloquearCuota();
    expect(saveState("charter", { a: 1 }, { location: "L1" }, s).status).toBe("pending");
    spy.mockRestore();
    otraPestana((raw) => { (raw.projects[id] as unknown as { meta: Record<string, unknown> }).meta.client = "C-de-B"; });

    expect(saveState("charter", { a: 2 }, { location: "L1" }, s).status).toBe("saved");
    const m = JSON.parse(localStorage.getItem(KEY) as string).projects[id].meta;
    expect(m.client).toBe("C-de-B");
    expect(m.location).toBe("L1");
  });

  it("REPRO (media): conflicto del módulo => NO se guardan sus metadatos por separado (guardado atómico)", () => {
    createProject({ name: "N", sponsor: "S0" });
    writeModule("charter", { identification: { sponsor: "S0" } });
    const s = openSession("charter")!;
    writeModule("charter", { identification: { sponsor: "de-otra-pestaña" } }); // otra pestaña cambia el Acta
    // Esta pestaña edita el patrocinador a S1: Acta Y meta.sponsor cambian juntos
    const r = saveState("charter", { identification: { sponsor: "S1" } }, { sponsor: "S1" }, s);
    expect(r.status).toBe("conflict");
    expect(getModule("charter")).toEqual({ identification: { sponsor: "de-otra-pestaña" } });
    expect(meta()!.sponsor).toBe("S0"); // antes de este fix quedaba "S1": versiones incompatibles del mismo dato
  });

  it("conflicto de un campo de metadatos => tampoco se escribe el módulo (todo o nada)", () => {
    createProject({ name: "N", client: "C0" });
    writeModule("charter", { a: 1 });
    const s = openSession("charter")!;
    patchMeta({ client: "C-otra-pestaña" });
    const r = saveState("charter", { a: 2 }, { client: "C-mía" }, s);
    expect(r).toMatchObject({ status: "conflict", conflicts: ["meta.client"] });
    expect(getModule("charter")).toEqual({ a: 1 });
  });

  it("sin conflictos, módulo y metadatos se aplican juntos con una sola escritura y actualizan la sesión", () => {
    createProject({ name: "N", sponsor: "S0" });
    const s = openSession("charter")!;
    const r = saveState("charter", { identification: { sponsor: "S1" } }, { sponsor: "S1" }, s);
    expect(r.status).toBe("saved");
    expect(getModule("charter")).toEqual({ identification: { sponsor: "S1" } });
    expect(meta()!.sponsor).toBe("S1");
    expect(saveState("charter", { identification: { sponsor: "S1" } }, { sponsor: "S1" }, s).status).toBe("unchanged");
  });
});

describe("resultado común de escritura (cuota agotada, conflicto, rechazo)", () => {
  it("con cuota agotada el resultado es 'pending' y describeWrite() avisa -- nunca 'sincronizado'", () => {
    createProject({ name: "A" });
    const s = openSession("cost")!;
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === KEY) throw new DOMException("Quota exceeded", "QuotaExceededError");
      return real.call(this, k, v);
    });
    const r = saveModule("cost", { x: 1 }, s);
    expect(r.status).toBe("pending");
    expect(describeWrite(r)).toMatch(/SIN guardar/);
  });

  it("describeWrite(): vacío si se guardó o no había nada que guardar; avisos distintos para conflicto y rechazo", () => {
    expect(describeWrite({ status: "saved", rev: 1 })).toBe("");
    expect(describeWrite({ status: "unchanged", rev: 1 })).toBe("");
    expect(describeWrite({ status: "conflict", rev: 2, conflicts: ["charter"] }, "El Acta")).toMatch(/El Acta cambió en otra pestaña/);
    expect(describeWrite({ status: "rejected", rev: null, reason: "project-changed" })).toMatch(/proyecto activo cambió/);
    expect(describeWrite({ status: "rejected", rev: null, reason: "no-active" })).toMatch(/No hay proyecto activo/);
  });

  it("activeId() no cambia por escribir con sesión", () => {
    const id = createProject({ name: "A" });
    saveModule("charter", { x: 1 }, openSession("charter"));
    expect(activeId()).toBe(id);
  });
});
