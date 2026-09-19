// Regresión de un bug real reportado por el usuario: abrir el Acta de
// Constitución del proyecto A, activar el proyecto B desde el Panel de
// Control (otra pestaña, mismo localStorage) y disparar el guardado de
// salida del Acta terminaba escribiendo el Acta (y el nombre) de A sobre
// B -- el módulo guardaba su estado anterior sobre "el proyecto que esté
// activo en ese momento", sin comprobar su identidad. Confirmado
// sistémico en los 13 módulos de herramienta (todos comparten el mismo
// patrón beforeunload/visibilitychange -> setModule/patchMeta sin
// verificar el id.).
//
// Esta es la defensa del NÚCLEO (la segunda capa, "cinturón" -- la
// primera es que cada módulo se abstenga de llamar a esto si
// GPI.activeId() ya no coincide con el proyecto que cargó, ver
// tests/smoke/project-charter.smoke.test.ts y
// tests/smoke/cronograma-cpm.smoke.test.ts para la reproducción
// end-to-end): setModule()/patchMeta() ganan un tercer parámetro
// opcional expectedProjectId -- si no coincide con el proyecto activo
// actual, no escriben nada.
import { beforeEach, describe, expect, it } from "vitest";
import { activeId, createProject, getModule, meta, patchMeta, setActive, setModule, KEY } from "../../src/core/gpi-core";

beforeEach(() => { localStorage.removeItem(KEY); });

describe("setModule/patchMeta -- expectedProjectId evita escribir sobre el proyecto equivocado", () => {
  it("setModule no escribe nada si expectedProjectId ya no es el proyecto activo (repro exacta del bug)", () => {
    const idA = createProject({ name: "Proyecto A" });
    setModule("charter", { identification: { sponsor: "Ana" } }); // A guarda su Acta normalmente
    const idB = createProject({ name: "Proyecto B" }); // activar B desde "otra pestaña" (createProject ya lo activa)
    expect(activeId()).toBe(idB);

    // La pestaña del Acta de A, ajena a que B ahora es el activo, dispara
    // su guardado de salida con el Id. que capturó al cargar (idA).
    const ok = setModule("charter", { identification: { sponsor: "STALE-A" } }, idA);

    expect(ok).toBe(false);
    expect(getModule("charter")).toBeNull(); // B nunca debe recibir el Acta de A
    setActive(idA);
    expect(getModule("charter")).toEqual({ identification: { sponsor: "Ana" } }); // A tampoco se corrompe
  });

  it("patchMeta no escribe nada si expectedProjectId ya no es el proyecto activo (el nombre de B no se pisa con el de A)", () => {
    createProject({ name: "Proyecto A" });
    const idA = activeId() as string;
    createProject({ name: "Proyecto B" });

    const result = patchMeta({ name: "NOMBRE VIEJO DE A" }, idA);

    expect(result).toBeNull();
    expect(meta()!.name).toBe("Proyecto B");
  });

  it("sin expectedProjectId, el comportamiento no cambia (compatibilidad con Panel de Control)", () => {
    createProject({ name: "Proyecto A" });
    const ok = setModule("charter", { x: 1 });
    expect(ok).toBe(true);
    expect(getModule("charter")).toEqual({ x: 1 });
  });

  it("con expectedProjectId que sí coincide con el proyecto activo, escribe normalmente", () => {
    const idA = createProject({ name: "Proyecto A" });
    const ok = setModule("charter", { x: 2 }, idA);
    expect(ok).toBe(true);
    expect(getModule("charter")).toEqual({ x: 2 });
    const metaOk = patchMeta({ name: "Proyecto A renombrado" }, idA);
    expect(metaOk).not.toBeNull();
    expect(meta()!.name).toBe("Proyecto A renombrado");
  });
});
