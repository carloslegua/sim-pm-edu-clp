// Smoke test del ARTEFACTO COMPILADO (gpi-core.js en la raíz), no del código
// fuente TypeScript. Carga el bundle IIFE tal como lo hacen los 13 módulos
// HTML (<script src="gpi-core.js">, script clásico, no ESM) y confirma que
// window.GPI queda plano con la misma superficie que la versión JS original.
// No carga los .html completos (evita depender de red por las fuentes de
// Google Fonts, ver README): el smoke test manual por-módulo en file://
// sigue siendo el complemento descrito en MIGRATION.md (Fase 4, paso 5).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";

const ARTIFACT_PATH = resolve(__dirname, "../../gpi-core.js");

function loadArtifact(): any {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    runScripts: "dangerously",
    url: "file:///fake/Panel_Control.html"
  });
  const src = readFileSync(ARTIFACT_PATH, "utf8");
  const scriptEl = dom.window.document.createElement("script");
  scriptEl.textContent = src;
  dom.window.document.body.appendChild(scriptEl);
  return dom.window.GPI;
}

describe("artefacto compilado gpi-core.js (consumido como <script> clásico)", () => {
  let GPI: any;
  beforeEach(() => { GPI = loadArtifact(); });

  it("expone window.GPI con la misma superficie plana que la versión JS original", () => {
    const requiredKeys = [
      "KEY", "schema", "available", "defaultMeta", "raw", "listProjects", "activeId",
      "active", "meta", "getModule", "setActive", "patchMeta", "setModule",
      "createProject", "renameProject", "duplicateProject", "deleteProject",
      "exportActive", "importProject", "ingestToolExport", "onChange", "util", "ui"
    ];
    requiredKeys.forEach((k) => expect(GPI).toHaveProperty(k));

    const utilKeys = ["cpm", "pertProbability", "wbsLeaves", "wbsRollup", "raciAudit", "charterAudit", "parsePredecessorCell"];
    utilKeys.forEach((k) => expect(GPI.util).toHaveProperty(k));

    expect(GPI.ui.esc("<b>")).toBe("&lt;b&gt;");
    expect(GPI.ui.kpi(1, null, "x")).toContain('class="kpi"');
  });

  it("hace round-trip real de datos a través del script clásico (no del módulo TS)", () => {
    GPI.createProject({ name: "Smoke test artefacto" });
    GPI.setModule("wbs", { rootId: "root", idCounter: 1, nodes: { root: { name: "P", children: [] } } });
    expect(GPI.getModule("wbs").rootId).toBe("root");
    expect(GPI.meta().name).toBe("Smoke test artefacto");
  });
});
