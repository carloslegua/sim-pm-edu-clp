// Ejemplos DISTRIB+ sobre el PROYECTO conectado (auditoría, media): PERT (ternas O/P por actividad) y RACI (bien armada) se aplican sobre los mismos 18 paquetes,
// 43 actividades y puestos del OBS del caso, y pasan las auditorías del núcleo.
import { describe, expect, it } from "vitest";
import { pertStats, raciAudit, raciCoverage, obsNodes } from "../../src/core/gpi-core";
import { SAMPLE_PERT_PLAN } from "../../src/shared/pert-sample";
import { RACI_LIVE_PLAN, buildLiveRaci } from "../../src/shared/raci-sample";
import { sampleScheduleModules } from "../../src/shared/schedule-sample";
import { SAMPLE_CASE_LEAVES } from "../../src/shared/case-distribplus";
import { readFileSync } from "node:fs";

const fixture = () => { const db = JSON.parse(readFileSync("tests/fixtures/distribplus-completo-v2.json", "utf8")); return db.projects[db.activeId]; };

describe("Análisis PERT del caso", () => {
  it("las 43 actividades de la red tienen su terna, con nombre y código exactos, y todas son válidas (O ≤ M ≤ P)", () => {
    const m = sampleScheduleModules(), byCode: Record<string, string> = {};
    // Código de actividad = «<paquete>.<n>»
    Object.keys(m.activities.byLeaf).forEach((leaf) => { const code = leaf.replace("w-", ""); m.activities.byLeaf[leaf].forEach((a, i) => { byCode[code + "." + (i + 1)] = a.name || ""; }); });
    expect(SAMPLE_PERT_PLAN).toHaveLength(43);
    SAMPLE_PERT_PLAN.forEach(([code, name]) => expect(byCode[code], code).toBe(name));
    const by: Record<string, { o: string; m: string; mAuto: boolean; p: string }> = {}, idBy: Record<string, string> = {};
    Object.keys(m.activities.byLeaf).forEach((leaf) => { const code = leaf.replace("w-", ""); m.activities.byLeaf[leaf].forEach((a, i) => { idBy[code + "." + (i + 1)] = a.id; }); });
    SAMPLE_PERT_PLAN.forEach(([code, , o, p]) => { by[idBy[code]] = { o: String(o), m: "", mAuto: true, p: String(p) }; });
    const st = pertStats({ inputMode: "dias", byActivity: by } as never, m.activities, m.wbs);
    expect(st.total).toBe(43); expect(st.complete).toBe(43); expect(st.invalid).toBe(0); expect(st.rows.every((r) => r.valid)).toBe(true);
    st.rows.forEach((r) => { expect(r.te as number).toBeGreaterThanOrEqual(r.dur as number); });          // la cola pesimista pesa más: TE ≥ duración base
  });
});

describe("RACI del caso para el proyecto", () => {
  it("cubre los 18 paquetes; cada uno con exactamente un R y un A, como máximo 3 C; y solo usa puestos del OBS del caso", () => {
    expect(RACI_LIVE_PLAN.map((r) => r.code)).toEqual(SAMPLE_CASE_LEAVES.map((l) => l.code));
    RACI_LIVE_PLAN.forEach((r) => { expect(r.R, r.code).toHaveLength(1); expect((r.C || []).length, r.code).toBeLessThanOrEqual(3); });
  });
  it("sobre el proyecto completo: sin paquetes sin R ni sin A, y cada puesto del OBS se usa", () => {
    const p = fixture(), obs = obsNodes(p.modules.obs), leaves = SAMPLE_CASE_LEAVES.map((l) => ({ id: "L" + l.code, code: l.code, name: l.name }));
    const cols = obs.filter((o) => o.role && o.code !== "0").map((o) => ({ id: o.id, role: o.role }));
    const { assignments, unresolved } = buildLiveRaci(leaves, cols);
    expect(unresolved).toEqual([]); expect(Object.keys(assignments)).toHaveLength(18);
    const used = new Set<string>(); Object.values(assignments).forEach((cell) => Object.keys(cell).forEach((c) => used.add(c)));
    cols.forEach((c) => expect(used.has(c.id), c.role).toBe(true));
    const wbs = { rootId: "r", idCounter: 1, nodes: { r: { id: "r", name: "P", children: leaves.map((l) => l.id) }, ...Object.fromEntries(leaves.map((l) => [l.id, { id: l.id, name: l.name, children: [] }])) } };
    const cov = raciCoverage({ assignments } as never, wbs as never);
    expect(cov.total).toBe(18); expect(cov.withR).toBe(18); expect(cov.withoutA).toEqual([]);
    const au = raciAudit(leaves as never, obs.filter((o) => o.code !== "0") as never, assignments);
    expect(au.hardCount).toBe(0); expect(au.softCount).toBe(0); expect(au.state).toBe("verde");   // ninguna restricción crítica ni de gobernanza incumplida
  });
});
