// Bug real reportado por el usuario, reproduciendo un error de cuota de
// localStorage: setModule() devolvía true, aparecía el aviso de
// "almacenamiento lleno" (recomendando exportar el proyecto para
// rescatar el trabajo), pero exportActive() seguía sirviendo la
// versión ANTERIOR -- la exportación del Panel consulta solo los datos
// YA persistidos en disco, que no incluían el cambio que acababa de
// fallar. El aviso prometía algo que la implementación no cumplía.
//
// Fix en src/core/gpi-core.ts: save() ahora devuelve si la escritura
// real llegó a localStorage, y cuando falla retiene la versión
// intentada en memoria (pendingUnsaved) en vez de descartarla. db()
// sirve esa copia mientras exista, así toda lectura posterior --
// incluida exportActive() -- ve el cambio pendiente, hasta que un
// guardado futuro (el alumno libera espacio) vuelva a tener éxito y la
// limpie.
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
});
