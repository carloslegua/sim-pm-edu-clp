// Versiones de la línea base de requisitos: src/shared/requirements-baseline.ts (auditoría, media).
import { describe, expect, it } from "vitest";
import { advanceBaseline, newVersionProblems, normalizeRBaseline, onlyInVersion, suggestNextVersion, usedVersions, type RBaseline } from "../../src/shared/requirements-baseline";

interface R { id: string; text: string; }
const base = (o: Partial<RBaseline<R>> = {}): RBaseline<R> => ({ frozen: true, version: "1.0", date: "2026-07-10", approver: "Sponsor", reason: "Línea base inicial", snapshot: [{ id: "r1", text: "Uno" }, { id: "r2", text: "Solo en v1.0" }], history: [], ...o });
const input = { version: "2.0", date: "2026-09-30", approver: "CCB", reason: "Incorpora MOD.01 y MOD.02 aprobadas" };

describe("advanceBaseline — archiva cada versión completa antes de establecer la siguiente", () => {
  it("REPRO (media): el requisito que solo existía en v1.0 sigue en el módulo guardado (en el archivo) tras pasar a v2.0", () => {
    const items: R[] = [{ id: "r1", text: "Uno" }, { id: "r3", text: "Nuevo por MOD" }];                       // v1.0 tenía r1 y r2; el estado actual ya no tiene r2
    const nb = advanceBaseline(base(), items, input, "2026-09-30");
    expect(nb.version).toBe("2.0"); expect(nb.snapshot.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(nb.history).toHaveLength(1);
    expect(nb.history[0].snapshot.map((r) => r.id)).toEqual(["r1", "r2"]);                                        // r2 se conserva en la v1.0 archivada
    expect(onlyInVersion(nb.history[0].snapshot, nb.snapshot).map((r) => r.id)).toEqual(["r2"]);
  });
  it("la versión archivada conserva su versión, fecha, aprobador, motivo e instantánea; la nueva lleva su propio aprobador, fecha y motivo", () => {
    const nb = advanceBaseline(base(), [{ id: "r1", text: "Uno" }], input, "2026-09-30");
    expect(nb.history[0]).toEqual({ version: "1.0", date: "2026-07-10", approver: "Sponsor", reason: "Línea base inicial", supersededOn: "2026-09-30", snapshot: [{ id: "r1", text: "Uno" }, { id: "r2", text: "Solo en v1.0" }] });
    expect(nb).toMatchObject({ frozen: true, version: "2.0", date: "2026-09-30", approver: "CCB", reason: "Incorpora MOD.01 y MOD.02 aprobadas" });   // el aprobador SÍ se actualiza
  });
  it("las versiones se acumulan (v1.0, v2.0 archivadas al llegar a v3.0), en orden", () => {
    const v2 = advanceBaseline(base(), [{ id: "r1", text: "Uno" }], input, "2026-09-30");
    const v3 = advanceBaseline(v2, [{ id: "r9", text: "Tres" }], { version: "3.0", date: "2026-11-01", approver: "Sponsor", reason: "Cambio de diseño" }, "2026-11-01");
    expect(v3.history.map((h) => h.version)).toEqual(["1.0", "2.0"]); expect(v3.history[1].approver).toBe("CCB"); expect(v3.history[1].snapshot.map((r) => r.id)).toEqual(["r1"]);
    expect(usedVersions(v3)).toEqual(["3.0", "1.0", "2.0"]);
  });
  it("es una copia profunda: editar después la matriz o la línea base anterior no altera lo archivado", () => {
    const items: R[] = [{ id: "r1", text: "Uno" }], b = base(), nb = advanceBaseline(b, items, input, "2026-09-30");
    items[0].text = "EDITADO"; b.snapshot[1].text = "EDITADO TAMBIÉN";
    expect(nb.snapshot[0].text).toBe("Uno"); expect(nb.history[0].snapshot[1].text).toBe("Solo en v1.0");
  });
});

describe("newVersionProblems / suggestNextVersion", () => {
  it("exige versión no repetida (vigente o archivada), fecha, aprobador y motivo", () => {
    expect(newVersionProblems(base(), input)).toEqual([]);
    expect(newVersionProblems(base(), { version: "1.0", date: "2026-09-30", approver: "CCB", reason: "x" })[0]).toMatch(/la versión 1\.0 ya existe/);
    const v2 = advanceBaseline(base(), [], input, "2026-09-30");
    expect(newVersionProblems(v2, { ...input, version: "1.0" })[0]).toMatch(/1\.0 ya existe \(vigente o archivada\)/);
    expect(newVersionProblems(base(), { ...input, approver: " " })).toEqual(["registra quién aprueba la nueva línea base"]);
    expect(newVersionProblems(base(), { ...input, reason: "" })[0]).toMatch(/documenta el motivo del cambio/);
    expect(newVersionProblems(base(), { ...input, date: "" })[0]).toMatch(/fecha de aprobación/); expect(newVersionProblems(base(), { ...input, version: "" })[0]).toMatch(/indica la versión/);
  });
  it("sugiere la siguiente versión libre", () => {
    expect(suggestNextVersion(base())).toBe("2.0"); expect(suggestNextVersion(base({ version: "1.5" }))).toBe("2.0");
    expect(suggestNextVersion(base({ version: "1.0", history: [{ version: "2.0", date: "", approver: "", reason: "", supersededOn: "", snapshot: [] }] }))).toBe("3.0");
  });
});

describe("normalizeRBaseline: lo guardado antes se lee sin fallar", () => {
  it("sin historial ni motivo (línea base antigua) y basura", () => {
    expect(normalizeRBaseline({ frozen: true, version: "1.0", date: "2026-07-10", approver: "S", snapshot: [{ id: "r1" }] })).toEqual({ frozen: true, version: "1.0", date: "2026-07-10", approver: "S", reason: "", snapshot: [{ id: "r1" }], history: [] });
    expect(normalizeRBaseline(null)).toMatchObject({ frozen: false, version: "1.0", snapshot: [], history: [] });
    expect(normalizeRBaseline({ history: [null, { version: 2, snapshot: "x" }] }).history).toEqual([{ version: "2", date: "", approver: "", reason: "", supersededOn: "", snapshot: [] }]);
  });
  it("ida y vuelta por JSON de una línea base con historial", () => {
    const nb = advanceBaseline(base(), [{ id: "r1", text: "Uno" }], input, "2026-09-30");
    expect(normalizeRBaseline(JSON.parse(JSON.stringify(nb)))).toEqual(nb);
  });
});
