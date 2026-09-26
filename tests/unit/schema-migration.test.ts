// Versión del esquema y migraciones (auditoría, media): `version` valía siempre 1 y cada módulo migraba lo suyo al leer. Los fixtures de
// tests/fixtures son proyectos REALES exportados con versiones anteriores del simulador: deben seguir abriendo (regla #3 de CLAUDE.md).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import * as core from "../../src/core/gpi-core";

const fx = (name: string): any => JSON.parse(readFileSync("tests/fixtures/" + name, "utf8"));
beforeEach(() => { localStorage.clear(); });

describe("migrateDb", () => {
  it("v1 → v2: feriados como {date, name} y requisitos del Acta como objetos codificados; idempotente", () => {
    const d = fx("legacy-v1-alumno.json"), p = d.projects.palu1;
    expect(d.version).toBe(1); expect(typeof p.modules.schedulePlan.calendar.holidays[0]).toBe("string");
    core.migrateDb(d);
    expect(d.version).toBe(core.DB_VERSION);
    expect(p.modules.schedulePlan.calendar.holidays).toEqual([{ date: "2026-05-01", name: "" }, { date: "2026-06-29", name: "" }]);
    expect(p.modules.charter.requirements).toEqual([{ id: "ran1", code: "RAN.01", text: "Cumplir el reglamento de edificaciones" }, { id: "ran2", code: "RAN.02", text: "Instalaciones eléctricas dimensionadas" }]);
    const antes = JSON.stringify(d); core.migrateDb(d); expect(JSON.stringify(d)).toBe(antes);
  });
  it("no toca lo que ya está en la forma vigente (requisitos mixtos, feriados con nombre)", () => {
    const d = { version: 1, activeId: "p", projects: { p: { schema: "gpi.project/v1", meta: {}, modules: {
      charter: { requirements: [{ id: "ran1", code: "RAN.01", text: "a" }, "b"] },
      schedulePlan: { calendar: { holidays: [{ date: "2026-07-28", name: "Fiestas Patrias" }, "2026-08-30"] } } } } } } as any;
    core.migrateDb(d);
    expect(d.projects.p.modules.charter.requirements[1]).toBe("b");                                 // mixto: lo resuelve el módulo, no se reescribe
    expect(d.projects.p.modules.schedulePlan.calendar.holidays).toEqual([{ date: "2026-07-28", name: "Fiestas Patrias" }, { date: "2026-08-30", name: "" }]);
  });
  it("ignora basura sin lanzar", () => { expect(() => core.migrateDb(null as any)).not.toThrow(); expect(() => core.migrateDb({ version: 1, activeId: null, projects: { x: null } } as any)).not.toThrow(); });
});

describe("un proyecto guardado con la versión 1 abre, se lee migrado y se guarda con la versión vigente", () => {
  it("lee desde localStorage, migra en memoria y al guardar persiste la versión 2", () => {
    localStorage.setItem(core.KEY, JSON.stringify(fx("legacy-v1-alumno.json")));
    expect(JSON.parse(localStorage.getItem(core.KEY) as string).version).toBe(1);
    expect((core.getModule("schedulePlan") as any).calendar.holidays[0]).toEqual({ date: "2026-05-01", name: "" });
    expect(core.projectCalendar().holidays).toEqual(["2026-05-01", "2026-06-29"]);
    core.setModule("wbs", core.getModule("wbs"));                                                    // cualquier guardado
    const saved = JSON.parse(localStorage.getItem(core.KEY) as string);
    expect(saved.version).toBe(core.DB_VERSION); expect(saved.projects.palu1.modules.schedulePlan.calendar.holidays[1].date).toBe("2026-06-29");
  });
  it("importar un proyecto exportado con la versión anterior lo lleva a la forma vigente", () => {
    const proj = fx("legacy-v1-alumno.json").projects.palu1;
    const id = core.importProject(proj);
    expect(core.activeId()).toBe(id);
    expect((core.getModule("charter") as any).requirements[0].code).toBe("RAN.01");
  });
});

describe("corpus de proyectos exportados: cada auditoría del núcleo corre sin lanzar sobre ellos", () => {
  ["legacy-v1-alumno.json", "distribplus-completo-v2.json"].forEach((name) => {
    it(name, () => {
      const d = fx(name); localStorage.setItem(core.KEY, JSON.stringify(d));
      const G = core.GPI, U = G.util;
      const w = G.getModule("wbs"), act = G.getModule("activities"), ch = G.getModule("charter"), req = G.getModule("requirements"), sc = G.getModule("scopeStatement");
      expect(() => {
        U.wbsRollup(w); U.wbsPhases(w); U.wbsLeaves(w); U.activitiesStats(act, w); U.pertStats(G.getModule("pert"), act, w);
        U.charterAudit(ch); U.schedulePlanAudit(G.getModule("schedulePlan")); U.requirementsAudit(req, ch, w); U.scopeAudit(sc, req, ch, w); U.traceMatrix(req, ch, sc, w);
        U.raciCoverage(G.getModule("raci"), w); U.costSummary(G.getModule("cost")); U.riskPortfolio(G.getModule("risks")); U.scheduleStats(); U.activeScheduleNetwork(); U.effectiveWbs();
      }, name).not.toThrow();
      expect(core.meta()!.name.length).toBeGreaterThan(0);
    });
  });
});
