// Bug real reportado por el usuario, reproduciendo un error de cuota de
// localStorage: setModule() devolvía true, aparecía el aviso de
// "almacenamiento lleno" (recomendando exportar el proyecto para
// rescatar el trabajo), pero exportActive() seguía sirviendo la
// versión ANTERIOR -- la exportación del Panel consulta solo los datos
// YA persistidos en disco, que no incluían el cambio que acababa de
// fallar. El aviso prometía algo que la implementación no cumplía.
//
// Fix original en src/core/gpi-core.ts: save() ahora devuelve si la
// escritura real llegó a localStorage, y cuando falla retiene la
// versión intentada en memoria (pendingUnsaved) en vez de descartarla.
// db() sirve esa copia mientras exista, así toda lectura posterior --
// incluida exportActive() -- ve el cambio pendiente, hasta que un
// guardado futuro (el alumno libera espacio) vuelva a tener éxito y la
// limpie.
//
// Ese primer fix tenía a su vez dos huecos reales, reportados después:
// 1) db() comprobaba avail() ANTES que pendingUnsaved -- si la cuota
//    empeoraba tanto que hasta la sonda de 1 byte de avail() empezaba a
//    fallar, la lectura devolvía un respaldo VACÍO (fresh()) en vez del
//    cambio pendiente que sí tenía en memoria.
// 2) Cuando el guardado por fin podía reintentar, escribía pendingUnsaved
//    TAL CUAL -- un clon completo de TODA la base, tomado ANTES de la
//    falla. Si otra pestaña (compartiendo el mismo localStorage) sí
//    había logrado guardar algo mientras esta seguía atascada, esa
//    escritura la pisaba por completo y el cambio de la otra pestaña
//    desaparecía. mergeWithDisk()/mergeProjectModules() concilian ahora
//    a tres bandas (base/ours/theirs) antes de escribir: por proyecto,
//    y dentro de cada proyecto por módulo, contra pendingBase (la foto
//    de disco al momento de la primera falla de la racha).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, exportActive, hasUnsavedChanges, setModule, KEY } from "../../src/core/gpi-core";

beforeEach(() => { localStorage.removeItem(KEY); });
afterEach(() => { vi.restoreAllMocks(); });

describe("recuperación tras un fallo de guardado (cuota de localStorage agotada)", () => {
  it("setModule() refleja el fallo real, exportActive() sirve el cambio pendiente (no la versión vieja), y un guardado posterior exitoso limpia el estado", () => {
    createProject({ name: "Proyecto A" });
    setModule("charter", { identification: { sponsor: "Primera versión" } });
    expect(exportActive()!.modules.charter).toEqual({ identification: { sponsor: "Primera versión" } });
    expect(hasUnsavedChanges()).toBe(false);

    // Simular cuota agotada: SOLO la escritura de "gpi_db" falla (como
    // en un navegador real -- el resto de localStorage sigue operable,
    // incluida la sonda de disponibilidad que usa avail()).
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === KEY) throw new DOMException("Quota exceeded", "QuotaExceededError");
      return realSetItem.call(this, key, value);
    });

    const ok = setModule("charter", { identification: { sponsor: "Cambio pendiente sin persistir" } });

    expect(ok).toBe(false); // antes de este fix devolvía true sin importar el resultado real
    expect(hasUnsavedChanges()).toBe(true);

    // Lo que el aviso recomienda usar para rescatar el trabajo debe
    // servir el cambio recién intentado, no la última versión persistida.
    expect(exportActive()!.modules.charter).toEqual({ identification: { sponsor: "Cambio pendiente sin persistir" } });

    // En disco (localStorage real) sigue la versión vieja -- la
    // escritura de verdad falló, como corresponde.
    const onDisk = JSON.parse(localStorage.getItem(KEY) as string);
    const projId = Object.keys(onDisk.projects)[0];
    expect(onDisk.projects[projId].modules.charter).toEqual({ identification: { sponsor: "Primera versión" } });

    // El alumno libera espacio (o el navegador deja de estar lleno): el
    // siguiente guardado exitoso persiste el cambio pendiente y limpia el estado.
    vi.restoreAllMocks();
    const ok2 = setModule("charter", { identification: { sponsor: "Guardado tras liberar espacio" } });
    expect(ok2).toBe(true);
    expect(hasUnsavedChanges()).toBe(false);
    const onDisk2 = JSON.parse(localStorage.getItem(KEY) as string);
    expect(onDisk2.projects[projId].modules.charter).toEqual({ identification: { sponsor: "Guardado tras liberar espacio" } });
  });

  it("BUG REPORTADO: al recuperar la capacidad de guardar, A no debe pisar una actualización de costos que B (otra pestaña) sí guardó mientras tanto", async () => {
    // Simula dos pestañas reales compartiendo el mismo localStorage: dos
    // instancias de módulo INDEPENDIENTES (cada una con su propio
    // pendingUnsaved/pendingBase en memoria, igual que dos documentos
    // HTML distintos en el navegador), no dos llamadas sobre el mismo
    // import.
    const A = await import("../../src/core/gpi-core");
    vi.resetModules();
    const B = await import("../../src/core/gpi-core");

    const idA = A.createProject({ name: "Proyecto compartido" });
    expect(B.activeId()).toBe(idA); // B ve el mismo proyecto -- mismo localStorage

    // A intenta guardar un cambio de alcance, pero la cuota está llena.
    const realSetItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === A.KEY) throw new DOMException("Quota exceeded", "QuotaExceededError");
      return realSetItem.call(this, key, value);
    });
    const okA1 = A.setModule("scopeStatement", { deliverables: [{ id: "d1", name: "Entregable de A" }] });
    expect(okA1).toBe(false);
    expect(A.hasUnsavedChanges()).toBe(true);
    spy.mockRestore(); // el navegador deja de estar lleno -- pero A todavía no lo sabe ni volvió a intentar guardar

    // B, en su propia pestaña, SÍ logra guardar una actualización de costos
    // (mismo proyecto, un módulo DISTINTO al que A tenía pendiente).
    const okB = B.setModule("costEstimate", { byActivity: { a1: 500 } });
    expect(okB).toBe(true);

    // A recupera la capacidad de guardar y dispara otro guardado (p. ej.
    // el guardado de salida al cerrar la pestaña).
    const okA2 = A.setModule("scopeStatement", { deliverables: [{ id: "d1", name: "Entregable de A (v2)" }] });
    expect(okA2).toBe(true);
    expect(A.hasUnsavedChanges()).toBe(false);

    // La actualización de costos de B NO debe haber desaparecido, y el
    // cambio de A también quedó guardado -- ninguno de los dos se pisa.
    const onDisk = JSON.parse(localStorage.getItem(A.KEY) as string);
    expect(onDisk.projects[idA].modules.costEstimate).toEqual({ byActivity: { a1: 500 } });
    expect(onDisk.projects[idA].modules.scopeStatement).toEqual({ deliverables: [{ id: "d1", name: "Entregable de A (v2)" }] });
  });

  it("BUG REPORTADO: si también falla la sonda de disponibilidad, la lectura debe seguir sirviendo el cambio pendiente, no un respaldo vacío", () => {
    createProject({ name: "Proyecto A" });
    setModule("charter", { identification: { sponsor: "Versión real" } });

    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === KEY) throw new DOMException("Quota exceeded", "QuotaExceededError");
      return realSetItem.call(this, key, value);
    });
    expect(setModule("charter", { identification: { sponsor: "Cambio pendiente" } })).toBe(false);
    expect(hasUnsavedChanges()).toBe(true);

    // La cuota empeora tanto que hasta la sonda de 1 byte de avail() falla.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });

    // La lectura debe seguir sirviendo pendingUnsaved -- NUNCA un
    // respaldo vacío (fresh()), aunque avail() ya no pueda confirmar
    // que localStorage sigue operable.
    expect(exportActive()!.modules.charter).toEqual({ identification: { sponsor: "Cambio pendiente" } });
  });
});
