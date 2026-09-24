// Auditoría (alta): con el almacenamiento LLENO, módulos como Valor Ganado mostraban el ejemplo DISTRIB+ en vez del proyecto real, porque
// GPI.available() era una sonda de ESCRITURA (setItem) y los módulos la usaban para saber si había un proyecto que LEER. Ahora available() =
// «legible», canWrite() = «se puede escribir» y storageStatus() dice ambas cosas: un fallo de escritura no cambia lo que se muestra.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GPI, KEY, active, available, canWrite, createProject, getModule, hasUnsavedChanges, setModule, storageStatus } from "../../src/core/gpi-core";

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(KEY); });

const llenar = () => vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });

describe("almacenamiento lleno: legible pero no escribible", () => {
  it("con un proyecto guardado y TODA escritura fallando, el núcleo sigue viendo el proyecto real: available() y active() ok, canWrite() falso", () => {
    createProject({ name: "Proyecto real S/ 1.000", currency: "PEN" }); setModule("cost", { budget: { baseCost: 1000 }, changeOrders: [] });
    expect(available()).toBe(true); expect(canWrite()).toBe(true);
    llenar();
    expect(canWrite()).toBe(false);                                                   // no se puede escribir…
    expect(available()).toBe(true); expect(GPI.available()).toBe(true);               // …pero SÍ hay un proyecto legible que mostrar
    expect(active()!.meta.name).toBe("Proyecto real S/ 1.000");
    expect((getModule("cost") as { budget: { baseCost: number } }).budget.baseCost).toBe(1000);
    expect(storageStatus()).toEqual({ readable: true, writable: false });
  });
  it("un fallo de escritura activa la recuperación (cambio pendiente exportable) sin cambiar lo que se muestra", () => {
    createProject({ name: "Proyecto real" }); llenar();
    expect(setModule("charter", { identification: { sponsor: "Pendiente" } })).toBe(false); expect(hasUnsavedChanges()).toBe(true);
    expect(active()!.meta.name).toBe("Proyecto real"); expect(available()).toBe(true);
    expect((getModule("charter") as { identification: { sponsor: string } }).identification.sponsor).toBe("Pendiente");   // se sirve lo pendiente, no el ejemplo ni lo viejo
  });
  it("sin almacenamiento de verdad (ni leer): available() es falso — el modo memoria sigue existiendo", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
    expect(available()).toBe(false); expect(storageStatus()).toEqual({ readable: false, writable: false });
  });
});
